import { DatabaseWrapper } from '../db'
import { dbAll } from '../utils/db-utils'
import { AnimeFeatures } from '../lib/recommendation/similarity-engine'
import { FranchiseRelation } from '../lib/recommendation/franchise-cluster'
import { shokoClient, ShokoSeries } from '../lib/shoko.client'
import { animeIdMapper } from '../lib/anime-id-mapper'
import { anilistRequest, fromAnilistMedia, getSeasonal, getTrending, AnilistMedia } from '../lib/anilist'
import { RecommendationsRepository } from '../repositories/recommendations.repository'
import logger from '../logger'

const log = logger.child({ module: 'CandidateFetcher' })

export interface CandidateAnime extends AnimeFeatures {
  isLocal: boolean
  thumbnail?: string
  bannerImage?: string
  status?: string
  episodeCount?: number
  seasonYear?: number
  startDate?: string
  relations?: FranchiseRelation[]
}

interface AniListRecommendationNode {
  mediaRecommendation?: AnilistMedia & {
    relations?: {
      nodes?: {
        id: number
        format?: string
        status?: string
        seasonYear?: number
      }[]
    }
  }
}

export const CandidateFetcherService = {
  /**
   * Fetch unwatched anime currently sitting on the user's disk/NAS via Shoko
   */
  async fetchLocalCandidates(db: DatabaseWrapper): Promise<CandidateAnime[]> {
    try {
      const isConnected = await shokoClient.testConnection()
      if (!isConnected) {
        log.debug('Shoko connection offline or not configured; skipping local candidates')
        return []
      }

      const seriesList = await shokoClient.getSeriesList()
      if (!seriesList || seriesList.length === 0) return []

      // Get user's active watchlist IDs and dismissed recommendation IDs
      const watchlistRows = dbAll<{ id: string }>(
        db,
        "SELECT id FROM watchlist WHERE status IN ('Completed', 'Watching', 'Dropped', 'Plan to Watch')"
      )
      const userWatchlistIds = new Set(watchlistRows.map((r) => r.id))
      const dismissedIds = new Set(RecommendationsRepository.getDismissedIds(db))

      const candidates: CandidateAnime[] = []

      for (const s of seriesList) {
        let anilistId: number | null = null

        // 1. Resolve to canonical AniList ID via AniDB
        if (s.IDs?.AniDB) {
          anilistId = animeIdMapper.getAnilistIdByAnidb(s.IDs.AniDB)
        }

        // 2. Fallback to MAL mapping
        if (!anilistId && s.IDs?.MAL && s.IDs.MAL.length > 0) {
          anilistId = animeIdMapper.getAnilistIdByMal(s.IDs.MAL[0])
        }

        // 3. Fallback to offline entry lookup
        let offlineEntry = anilistId ? animeIdMapper.getByAnilistId(anilistId) : null
        if (!offlineEntry && s.IDs?.AniDB) {
          offlineEntry = animeIdMapper.getByAnidbId(s.IDs.AniDB)
        }
        if (!offlineEntry && s.IDs?.MAL && s.IDs.MAL.length > 0) {
          offlineEntry = animeIdMapper.getByMalId(s.IDs.MAL[0])
        }

        if (!anilistId && offlineEntry?.anilistId) {
          anilistId = offlineEntry.anilistId
        }

        const showId = anilistId ? String(anilistId) : `shoko_${s.IDs.ID}`

        // Filter out shows already on watchlist or dismissed
        if (userWatchlistIds.has(showId) || dismissedIds.has(showId)) {
          continue
        }

        // Extract metadata (genres, themes) from DB or Shoko series
        const metaRow = dbAll<{ genres: string; type: string }>(
          db,
          'SELECT genres, type FROM shows_meta WHERE id = ?',
          [showId]
        )[0]

        let genres: string[] = []
        if (metaRow?.genres && metaRow.genres !== '[]') {
          try {
            genres = JSON.parse(metaRow.genres)
          } catch {
            genres = metaRow.genres.split(',').map((g) => g.trim())
          }
        }

        if (genres.length === 0 && offlineEntry?.genres && offlineEntry.genres !== '[]') {
          try {
            genres = JSON.parse(offlineEntry.genres)
          } catch {
            genres = offlineEntry.genres.split(',').map((g) => g.trim())
          }
        }

        // Shoko local poster
        const preferredPoster =
          s.Images?.Posters?.find((p) => p.Preferred) ||
          s.Images?.Posters?.[0] ||
          s.AniDB?.Poster
        const localPosterUrl = preferredPoster?.ID
          ? `/api/shoko/image/${preferredPoster.Source || 'AniDB'}/${preferredPoster.Type || 'Poster'}/${preferredPoster.ID}`
          : undefined

        const thumbnail = localPosterUrl || offlineEntry?.thumbnail

        const candidate: CandidateAnime = {
          id: showId,
          name: s.Name || offlineEntry?.title || s.AniDB?.Title || 'Unknown Local Anime',
          englishName: s.AniDB?.Title || offlineEntry?.title || s.Name,
          genres,
          type: metaRow?.type || offlineEntry?.type || s.AniDB?.Type || 'TV',
          isLocal: true,
          thumbnail,
          score: s.AniDB?.Rating?.Value ? Math.round(s.AniDB.Rating.Value * 10) : undefined,
          episodeCount: s.AniDB?.EpisodeCount,
        }

        candidates.push(candidate)
      }

      log.info({ count: candidates.length }, 'Fetched unwatched local Shoko series candidates')
      return candidates
    } catch (err) {
      log.warn({ err }, 'Failed fetching local Shoko candidate anime')
      return []
    }
  },

  /**
   * Fetch recommendations from AniList's community graph for the user's top anchor seeds
   */
  async fetchGraphCandidates(
    seeds: AnimeFeatures[],
    excludedIds: Set<string>
  ): Promise<CandidateAnime[]> {
    if (seeds.length === 0) return []

    const query = `
      query ($id: Int, $perPage: Int) {
        Media(id: $id, type: ANIME) {
          recommendations(sort: RATING_DESC, perPage: $perPage) {
            nodes {
              mediaRecommendation {
                id
                title { romaji english native }
                coverImage { extraLarge large medium }
                bannerImage
                description
                genres
                tags { id name rank isMediaSpoiler }
                averageScore
                format
                status
                seasonYear
                startDate { year month day }
                popularity
                relations {
                  nodes {
                    id
                    format
                    status
                    seasonYear
                  }
                }
              }
            }
          }
        }
      }
    `

    const candidatesMap = new Map<string, CandidateAnime>()

    // Query graph for top 4 seed shows
    const topSeeds = seeds.slice(0, 4)

    for (const seed of topSeeds) {
      const numericId = parseInt(seed.id, 10)
      if (isNaN(numericId)) continue

      try {
        const response = await anilistRequest<{
          Media?: {
            recommendations?: {
              nodes?: AniListRecommendationNode[]
            }
          }
        }>(query, { id: numericId, perPage: 20 })

        const nodes = response?.data?.Media?.recommendations?.nodes || []

        for (const node of nodes) {
          const rec = node.mediaRecommendation
          if (!rec || !rec.id) continue

          const idStr = String(rec.id)
          if (excludedIds.has(idStr) || candidatesMap.has(idStr)) continue

          const genres = rec.genres || []
          const tags = (rec.tags || []).map((t) => t.name)
          const title = rec.title?.english || rec.title?.romaji || rec.title?.native || 'Unknown'

          const relations: FranchiseRelation[] = (rec.relations?.nodes || []).map((r) => ({
            id: String(r.id),
          }))

          candidatesMap.set(idStr, {
            id: idStr,
            name: rec.title?.romaji || title,
            englishName: rec.title?.english || undefined,
            genres,
            tags,
            type: rec.format,
            isLocal: false,
            score: rec.averageScore || undefined,
            popularityScore: rec.popularity || undefined,
            thumbnail: rec.coverImage?.large || rec.coverImage?.medium,
            bannerImage: rec.bannerImage || undefined,
            status: rec.status,
            seasonYear: rec.seasonYear || undefined,
            startDate: rec.startDate?.year ? `${rec.startDate.year}` : undefined,
            relations,
          })
        }
      } catch (err) {
        log.warn({ err, seedId: seed.id }, 'Failed querying AniList graph recommendations for seed')
      }
    }

    return Array.from(candidatesMap.values())
  },

  /**
   * Fetch current seasonal and trending anime
   */
  async fetchSeasonalAndTrending(excludedIds: Set<string>): Promise<CandidateAnime[]> {
    const candidatesMap = new Map<string, CandidateAnime>()

    try {
      const [seasonal, trending] = await Promise.all([
        getSeasonal(1, 25),
        getTrending(1, 25),
      ])

      const combined = [...seasonal, ...trending]

      for (const show of combined) {
        const idStr = show.id || show._id
        if (!idStr || excludedIds.has(idStr) || candidatesMap.has(idStr)) continue

        const genres = (show.genres || []).map((g: { name: string }) => g.name)
        const tags = (show.tags || []).map((t: { name: string }) => t.name)

        candidatesMap.set(idStr, {
          id: idStr,
          name: show.name,
          englishName: show.englishName || undefined,
          genres,
          tags,
          type: show.type,
          isLocal: false,
          score: show.score || show.averageScore || undefined,
          thumbnail: show.thumbnail,
          bannerImage: show.bannerImage,
          status: show.status,
          episodeCount: show.episodeCount != null ? Number(show.episodeCount) : undefined,
        })
      }
    } catch (err) {
      log.warn({ err }, 'Failed fetching seasonal and trending anime for recommendations')
    }

    return Array.from(candidatesMap.values())
  },
}
