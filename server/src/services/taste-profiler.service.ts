import { DatabaseWrapper } from '../db'
import { dbAll } from '../utils/db-utils'
import { AnimeFeatures } from '../lib/recommendation/similarity-engine'
import { getShowMetaById } from '../lib/anilist'
import { ShowsMetaRepository } from '../repositories/shows-meta.repository'
import { THEME_GROUPS, TONE_INDICATORS } from '../lib/recommendation/semantic-dictionaries'
import logger from '../logger'

const log = logger.child({ module: 'TasteProfiler' })

export interface UserTasteProfile {
  genreWeights: Record<string, number>
  themeWeights: Record<string, number>
  toneWeights: Record<string, number>
  topDemographics: string[]
  totalCompleted: number
  totalWatching: number
  avgScore: number
}

interface RawWatchlistCandidate {
  id: string
  name: string
  englishName: string | null
  nativeName: string | null
  status: string
  score: number | null
  watchedEpisodes: number | null
  totalEpisodes: number | null
  type: string | null
  genres: string | null
  tags: string | null
  popularityScore: number | null
  watchedCount: number
}

function safeParseJson<T>(str: string | null, fallback: T): T {
  if (!str) return fallback
  try {
    const parsed = JSON.parse(str)
    return Array.isArray(parsed) || typeof parsed === 'object' ? parsed : fallback
  } catch {
    return fallback
  }
}

export const TasteProfilerService = {
  /**
   * Extract user taste profile and top seed anime from the database
   */
  async extractProfileAndSeeds(
    db: DatabaseWrapper,
    seedLimit = 6
  ): Promise<{
    seeds: AnimeFeatures[]
    profile: UserTasteProfile
  }> {
    // 1. Fetch watched shows with metadata and episode counts
    const query = `
      SELECT 
        w.id, w.name, w.englishName, w.nativeName, w.status, w.score,
        w.watchedEpisodes, w.totalEpisodes, w.type,
        sm.genres, sm.tags, sm.popularityScore,
        COALESCE(we_agg.ep_count, 0) as watchedCount
      FROM watchlist w
      LEFT JOIN shows_meta sm ON w.id = sm.id
      LEFT JOIN (
        SELECT showId, COUNT(DISTINCT episodeNumber) as ep_count
        FROM watched_episodes
        GROUP BY showId
      ) we_agg ON w.id = we_agg.showId
      WHERE w.status IN ('Completed', 'Watching')
    `

    const rows = dbAll<RawWatchlistCandidate>(db, query)

    if (rows.length === 0) {
      log.debug('No completed or watching anime found in user watchlist; returning empty profile')
      return {
        seeds: [],
        profile: {
          genreWeights: {},
          themeWeights: {},
          toneWeights: {},
          topDemographics: [],
          totalCompleted: 0,
          totalWatching: 0,
          avgScore: 7.0,
        },
      }
    }

    // 2. Score affinity for each show (explicit rating + completion %)
    interface ScoredShow {
      raw: RawWatchlistCandidate
      affinity: number
      features?: AnimeFeatures
    }

    const scoredShows: ScoredShow[] = []
    let totalScoreSum = 0
    let ratedCount = 0
    let completedCount = 0
    let watchingCount = 0

    for (const row of rows) {
      if (row.status === 'Completed') completedCount++
      if (row.status === 'Watching') watchingCount++

      let affinity = 0.5

      if (row.score != null && row.score > 0) {
        // Explicit 1-10 rating
        affinity = Math.min(1.0, row.score / 10)
        totalScoreSum += row.score
        ratedCount++
      } else if (row.status === 'Completed') {
        // Completed without explicit rating gets high baseline
        affinity = 0.85
      } else if (row.status === 'Watching') {
        // Evaluate completion progress
        const total = row.totalEpisodes || 12
        const watched = row.watchedEpisodes || row.watchedCount || 0
        const progress = Math.min(1.0, watched / total)
        affinity = progress >= 0.5 ? 0.75 : 0.55
      }

      scoredShows.push({ raw: row, affinity })
    }

    // Sort by affinity descending, then popularity score
    scoredShows.sort((a, b) => {
      if (b.affinity !== a.affinity) return b.affinity - a.affinity
      return (a.raw.popularityScore || 999999) - (b.raw.popularityScore || 999999)
    })

    // 3. Resolve metadata for top seed shows if genres/tags are missing
    const candidateSeeds = scoredShows.slice(0, seedLimit * 2)
    const seeds: AnimeFeatures[] = []

    for (const item of candidateSeeds) {
      let genres: string[] = safeParseJson<string[]>(item.raw.genres, [])
      let tags: string[] = safeParseJson<string[]>(item.raw.tags, [])

      // If local metadata lacks genres, attempt an on-demand AniList lookup
      if (genres.length === 0) {
        try {
          const meta = await getShowMetaById(item.raw.id)
          if (meta) {
            genres = (meta.genres || []).map((g) => g.name)
            tags = (meta.tags || []).map((t) => t.name)

            // Cache in shows_meta for subsequent operations
            await ShowsMetaRepository.upsert(db, {
              id: item.raw.id,
              name: meta.name,
              thumbnail: meta.thumbnail,
              englishName: meta.englishName,
              nativeName: meta.nativeName,
              genres: JSON.stringify(genres),
              type: meta.type,
              status: meta.status,
              episodeCount: meta.episodeCount ? Number(meta.episodeCount) : undefined,
              popularityScore: meta.score ? Number(meta.score) : undefined,
            })
          }
        } catch (err) {
          log.warn({ err, showId: item.raw.id }, 'Failed to fetch external metadata for seed show')
        }
      }

      if (genres.length > 0 || tags.length > 0) {
        const features: AnimeFeatures = {
          id: item.raw.id,
          name: item.raw.name,
          englishName: item.raw.englishName || undefined,
          genres,
          tags,
          type: item.raw.type || undefined,
          score: item.raw.score || undefined,
          popularityScore: item.raw.popularityScore || undefined,
        }
        item.features = features
        seeds.push(features)
        if (seeds.length >= seedLimit) break
      }
    }

    // 4. Aggregate genre, theme, and tone weights across all qualifying shows
    const genreFreq: Record<string, number> = {}
    const themeFreq: Record<string, number> = {}
    const toneFreq: Record<string, number> = {}

    for (const item of scoredShows) {
      const genres = item.features?.genres || safeParseJson<string[]>(item.raw.genres, [])
      const tags = item.features?.tags || safeParseJson<string[]>(item.raw.tags, [])
      const allTags = [...genres, ...tags].map((t) => t.toLowerCase())

      for (const genre of genres) {
        const key = genre.toLowerCase()
        genreFreq[key] = (genreFreq[key] || 0) + item.affinity
      }

      // Semantic theme matching
      for (const [groupName, keywords] of Object.entries(THEME_GROUPS)) {
        if (allTags.some((tag) => keywords.some((kw) => tag.includes(kw)))) {
          themeFreq[groupName] = (themeFreq[groupName] || 0) + item.affinity
        }
      }

      // Tone matching
      for (const [toneName, indicators] of Object.entries(TONE_INDICATORS)) {
        if (allTags.some((tag) => indicators.some((ind) => tag.includes(ind)))) {
          toneFreq[toneName] = (toneFreq[toneName] || 0) + item.affinity
        }
      }
    }

    // Normalize weights between 0 and 1
    const normalize = (dict: Record<string, number>): Record<string, number> => {
      const maxVal = Math.max(...Object.values(dict), 1)
      const res: Record<string, number> = {}
      for (const [k, v] of Object.entries(dict)) {
        res[k] = Math.round((v / maxVal) * 100) / 100
      }
      return res
    }

    const profile: UserTasteProfile = {
      genreWeights: normalize(genreFreq),
      themeWeights: normalize(themeFreq),
      toneWeights: normalize(toneFreq),
      topDemographics: [],
      totalCompleted: completedCount,
      totalWatching: watchingCount,
      avgScore: ratedCount > 0 ? Math.round((totalScoreSum / ratedCount) * 10) / 10 : 7.5,
    }

    return { seeds, profile }
  },
}
