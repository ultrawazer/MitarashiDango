import { DatabaseWrapper } from '../db'
import { dbAll } from '../utils/db-utils'
import { TasteProfilerService, UserTasteProfile } from './taste-profiler.service'
import { CandidateFetcherService, CandidateAnime } from './candidate-fetcher.service'
import { SimilarityEngine, AnimeFeatures } from '../lib/recommendation/similarity-engine'
import { FranchiseClusterer, ClusterableCandidate } from '../lib/recommendation/franchise-cluster'
import {
  RecommendationsRepository,
  RecommendationItem,
  ScoreBreakdown,
} from '../repositories/recommendations.repository'
import { ShowsMetaRepository } from '../repositories/shows-meta.repository'
import logger from '../logger'

const log = logger.child({ module: 'RecommendationService' })

interface ScoredCandidateInternal extends ClusterableCandidate {
  showId: string
  score: number
  breakdown: ScoreBreakdown
  reason: string
  isLocal: boolean
  candidate: CandidateAnime
}

export const RecommendationService = {
  /**
   * Get personalized recommendations for a user.
   * Serves instantly from cache if fresh, otherwise orchestrates background re-computation.
   */
  async getRecommendations(
    db: DatabaseWrapper,
    options?: {
      sourceType?: 'for_you' | 'local_library'
      limit?: number
      offset?: number
      forceRefresh?: boolean
    }
  ): Promise<{
    items: RecommendationItem[]
    fresh: boolean
    profile?: UserTasteProfile | null
  }> {
    const sourceType = options?.sourceType || 'for_you'
    const limit = options?.limit || 20
    const offset = options?.offset || 0

    const isFresh = RecommendationsRepository.isCacheFresh(db, sourceType, 24)

    if (isFresh && !options?.forceRefresh) {
      const cached = RecommendationsRepository.getBySourceType(db, sourceType, limit, offset)
      if (cached.length > 0) {
        const profile = RecommendationsRepository.getTasteProfile<UserTasteProfile>(
          db,
          'current_profile'
        )
        return { items: cached, fresh: true, profile }
      }
    }

    // Refresh recommendations
    await this.computeAndCacheAll(db)

    const items = RecommendationsRepository.getBySourceType(db, sourceType, limit, offset)
    const profile = RecommendationsRepository.getTasteProfile<UserTasteProfile>(db, 'current_profile')

    return { items, fresh: false, profile }
  },

  /**
   * Force an asynchronous re-computation of recommendations across all source types.
   */
  async refreshRecommendations(db: DatabaseWrapper): Promise<void> {
    await this.computeAndCacheAll(db)
  },

  /**
   * Core pipeline: Profile Extraction -> Candidate Discovery -> 5D Scoring -> Clustering -> Persistence
   */
  async computeAndCacheAll(db: DatabaseWrapper): Promise<void> {
    log.info('Starting full recommendation recalculation...')
    const startTime = Date.now()

    // 1. Extract taste profile and anchor seeds from user database
    const { seeds, profile } = await TasteProfilerService.extractProfileAndSeeds(db, 8)
    RecommendationsRepository.saveTasteProfile(db, 'current_profile', profile)

    // 2. Identify excluded show IDs (watchlist + previously dismissed)
    const watchlistRows = dbAll<{ id: string }>(
      db,
      "SELECT id FROM watchlist WHERE status IN ('Completed', 'Watching', 'Dropped', 'Plan to Watch')"
    )
    const excludedIds = new Set([
      ...watchlistRows.map((r) => r.id),
      ...RecommendationsRepository.getDismissedIds(db),
    ])

    // 3. Fetch candidates across local Shoko library, community graphs, and seasonal trends
    const [localCandidates, graphCandidates, seasonalCandidates] = await Promise.all([
      CandidateFetcherService.fetchLocalCandidates(db),
      CandidateFetcherService.fetchGraphCandidates(seeds, excludedIds),
      CandidateFetcherService.fetchSeasonalAndTrending(excludedIds),
    ])

    // 4. Score local candidates for "From Your Library"
    const scoredLocal = this.scoreCandidatesAgainstSeeds(localCandidates, seeds, profile)
    const clusteredLocal = FranchiseClusterer.clusterAndDeduplicate(scoredLocal)

    const localItems: RecommendationItem[] = clusteredLocal.map((sc) =>
      this.toRecommendationItem(sc, 'local_library')
    )
    RecommendationsRepository.saveBatch(db, localItems, 'local_library')

    // 5. Score online/mixed candidates for "Recommended For You"
    // Merge graph and seasonal candidates, deduplicating by ID
    const generalMap = new Map<string, CandidateAnime>()
    for (const c of [...graphCandidates, ...seasonalCandidates]) {
      if (!generalMap.has(c.id)) {
        generalMap.set(c.id, c)
      }
    }

    const scoredGeneral = this.scoreCandidatesAgainstSeeds(
      Array.from(generalMap.values()),
      seeds,
      profile
    )
    const clusteredGeneral = FranchiseClusterer.clusterAndDeduplicate(scoredGeneral)

    const generalItems: RecommendationItem[] = clusteredGeneral.map((sc) =>
      this.toRecommendationItem(sc, 'for_you')
    )
    RecommendationsRepository.saveBatch(db, generalItems, 'for_you')

    // Also populate shows_meta for recommended shows so client has immediate poster/genre data
    for (const item of [...localItems, ...generalItems]) {
      if (item.name) {
        ShowsMetaRepository.upsert(db, {
          id: item.showId,
          name: item.name,
          thumbnail: item.thumbnail,
          englishName: item.englishName,
          genres: item.genres && item.genres.length > 0 ? JSON.stringify(item.genres) : undefined,
          type: item.type,
          status: item.status,
          episodeCount: item.episodeCount,
          popularityScore: item.popularityScore,
        })
      }
    }

    log.info(
      {
        durationMs: Date.now() - startTime,
        localCount: localItems.length,
        forYouCount: generalItems.length,
      },
      'Recommendation recalculation complete'
    )
  },

  /**
   * Scores an array of candidate anime against anchor seed shows using the 5D similarity engine.
   */
  scoreCandidatesAgainstSeeds(
    candidates: CandidateAnime[],
    seeds: AnimeFeatures[],
    profile: UserTasteProfile
  ): ScoredCandidateInternal[] {
    const scored: ScoredCandidateInternal[] = []

    for (const candidate of candidates) {
      if (seeds.length === 0) {
        // Cold start fallback: score by general popularity and mean score
        const baseScore = candidate.score ? Math.min(85, Math.max(50, candidate.score)) : 65
        const defaultBreakdown: ScoreBreakdown = {
          genre: 50,
          theme: 50,
          tone: 50,
          narrative: 50,
          demographic: 50,
        }

        scored.push({
          showId: candidate.id,
          score: baseScore,
          breakdown: defaultBreakdown,
          reason: 'Popular anime recommended for you to get started',
          isLocal: candidate.isLocal,
          candidate,
          name: candidate.name,
          englishName: candidate.englishName,
          seasonYear: candidate.seasonYear,
          startDate: candidate.startDate,
          relations: candidate.relations,
        })
        continue
      }

      // Calculate similarity against each anchor seed
      let bestSeedScore = -1
      let bestSeed: AnimeFeatures | null = null
      let bestSeedBreakdown: ScoreBreakdown = {
        genre: 0,
        theme: 0,
        tone: 0,
        narrative: 0,
        demographic: 0,
      }
      let bestSeedReason = ''

      let totalScoreSum = 0
      const breakdownSum = { genre: 0, theme: 0, tone: 0, narrative: 0, demographic: 0 }

      for (const seed of seeds) {
        const { score, breakdown, reason } = SimilarityEngine.calculateSimilarity(seed, candidate)
        totalScoreSum += score
        breakdownSum.genre += breakdown.genre
        breakdownSum.theme += breakdown.theme
        breakdownSum.tone += breakdown.tone
        breakdownSum.narrative += breakdown.narrative
        breakdownSum.demographic += breakdown.demographic

        if (score > bestSeedScore) {
          bestSeedScore = score
          bestSeed = seed
          bestSeedBreakdown = breakdown
          bestSeedReason = reason
        }
      }

      const seedCount = seeds.length
      const avgScore = totalScoreSum / seedCount

      // Blended final score: 60% top anchor match + 40% overall library average affinity
      const finalScore = Math.round((bestSeedScore * 0.6 + avgScore * 0.4) * 10) / 10

      const avgBreakdown: ScoreBreakdown = {
        genre: Math.round(breakdownSum.genre / seedCount),
        theme: Math.round(breakdownSum.theme / seedCount),
        tone: Math.round(breakdownSum.tone / seedCount),
        narrative: Math.round(breakdownSum.narrative / seedCount),
        demographic: Math.round(breakdownSum.demographic / seedCount),
      }

      scored.push({
        showId: candidate.id,
        score: finalScore,
        breakdown: avgBreakdown,
        reason: bestSeedReason || (bestSeed ? `Recommended based on ${bestSeed.englishName || bestSeed.name}` : ''),
        isLocal: candidate.isLocal,
        candidate,
        name: candidate.name,
        englishName: candidate.englishName,
        seasonYear: candidate.seasonYear,
        startDate: candidate.startDate,
        relations: candidate.relations,
      })
    }

    return scored.sort((a, b) => b.score - a.score)
  },

  toRecommendationItem(sc: ScoredCandidateInternal, sourceType: string): RecommendationItem {
    return {
      showId: sc.showId,
      score: sc.score,
      breakdown: sc.breakdown,
      reason: sc.reason,
      isLocal: sc.isLocal,
      mediaType: sc.candidate.type,
      sourceType,
      name: sc.candidate.name,
      englishName: sc.candidate.englishName,
      thumbnail: sc.candidate.thumbnail,
      genres: sc.candidate.genres,
      type: sc.candidate.type,
      episodeCount: sc.candidate.episodeCount,
      status: sc.candidate.status,
      popularityScore: sc.candidate.popularityScore,
    }
  },
}
