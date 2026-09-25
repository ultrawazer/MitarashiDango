import {
  THEME_GROUPS,
  TONE_INDICATORS,
  NARRATIVE_PATTERNS,
  DEMOGRAPHICS,
} from './semantic-dictionaries'
import { ScoreBreakdown } from '../../repositories/recommendations.repository'

export interface AnimeFeatures {
  id: string
  name: string
  englishName?: string
  genres: string[]
  themes?: string[]
  tags?: string[]
  demographics?: string[]
  studios?: string[]
  type?: string
  score?: number
  popularityScore?: number
}

export interface SimilarityWeights {
  genreOverlap: number
  themeOverlap: number
  toneProfile: number
  narrativeStructure: number
  demographicMatch: number
}

export const DEFAULT_WEIGHTS: SimilarityWeights = {
  genreOverlap: 0.25,
  themeOverlap: 0.3,
  toneProfile: 0.2,
  narrativeStructure: 0.15,
  demographicMatch: 0.1,
}

function normalizeStringList(list?: string[]): string[] {
  if (!list || !Array.isArray(list)) return []
  return list.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
}

export const SimilarityEngine = {
  /**
   * Jaccard similarity between two sets of genres
   */
  genreSimilarity(source: AnimeFeatures, target: AnimeFeatures): number {
    const sGenres = normalizeStringList(source.genres)
    const tGenres = normalizeStringList(target.genres)

    if (sGenres.length === 0 || tGenres.length === 0) return 0

    const sSet = new Set(sGenres)
    const tSet = new Set(tGenres)

    let intersection = 0
    for (const g of sSet) {
      if (tSet.has(g)) intersection++
    }

    const union = new Set([...sGenres, ...tGenres]).size
    return union > 0 ? intersection / union : 0
  },

  /**
   * Semantic theme overlap using clustered semantic groups
   */
  themeSimilarity(source: AnimeFeatures, target: AnimeFeatures): number {
    const sCombined = normalizeStringList([
      ...(source.themes || []),
      ...(source.tags || []),
      ...(source.genres || []),
    ])
    const tCombined = normalizeStringList([
      ...(target.themes || []),
      ...(target.tags || []),
      ...(target.genres || []),
    ])

    if (sCombined.length === 0 || tCombined.length === 0) return 0

    let clusterMatches = 0
    let evaluatedClusters = 0

    for (const [, keywords] of Object.entries(THEME_GROUPS)) {
      const sourceInGroup = sCombined.some((tag) => keywords.some((kw) => tag.includes(kw)))
      const targetInGroup = tCombined.some((tag) => keywords.some((kw) => tag.includes(kw)))

      if (sourceInGroup || targetInGroup) {
        evaluatedClusters++
        if (sourceInGroup && targetInGroup) {
          clusterMatches++
        }
      }
    }

    return evaluatedClusters > 0 ? clusterMatches / evaluatedClusters : 0
  },

  /**
   * Target demographic match (Shounen, Seinen, Shoujo, Josei, Kids)
   */
  demographicSimilarity(source: AnimeFeatures, target: AnimeFeatures): number {
    const sDemographics = normalizeStringList(source.demographics)
    const tDemographics = normalizeStringList(target.demographics)

    // Also infer demographic from tags/genres if not explicitly given
    const extractDemo = (list: string[], allTags: string[]) => {
      if (list.length > 0) return list[0]
      for (const d of DEMOGRAPHICS) {
        if (allTags.includes(d)) return d
      }
      return null
    }

    const sDemo = extractDemo(
      sDemographics,
      normalizeStringList([...(source.genres || []), ...(source.tags || [])])
    )
    const tDemo = extractDemo(
      tDemographics,
      normalizeStringList([...(target.genres || []), ...(target.tags || [])])
    )

    if (!sDemo || !tDemo) return 0.5 // Neutral if either is unknown
    return sDemo === tDemo ? 1.0 : 0.2
  },

  /**
   * Tone similarity matrix (Serious, Lighthearted, Dark, Uplifting, Cerebral, Emotional)
   */
  toneSimilarity(source: AnimeFeatures, target: AnimeFeatures): number {
    const sCombined = normalizeStringList([
      ...(source.genres || []),
      ...(source.themes || []),
      ...(source.tags || []),
    ])
    const tCombined = normalizeStringList([
      ...(target.genres || []),
      ...(target.themes || []),
      ...(target.tags || []),
    ])

    let toneMatches = 0
    let totalTonesPresent = 0

    for (const [, indicators] of Object.entries(TONE_INDICATORS)) {
      const sourceHasTone = sCombined.some((tag) => indicators.some((ind) => tag.includes(ind)))
      const targetHasTone = tCombined.some((tag) => indicators.some((ind) => tag.includes(ind)))

      if (sourceHasTone || targetHasTone) {
        totalTonesPresent++
        if (sourceHasTone === targetHasTone) {
          toneMatches++
        }
      }
    }

    return totalTonesPresent > 0 ? toneMatches / totalTonesPresent : 0.5
  },

  /**
   * Narrative structure similarity (TV vs Movie + Storytelling pattern)
   */
  narrativeSimilarity(source: AnimeFeatures, target: AnimeFeatures): number {
    const sType = (source.type || '').toUpperCase()
    const tType = (target.type || '').toUpperCase()

    // Media type bonus (TV series vs Movie vs OVA)
    const typeMatchBonus = sType && tType && sType === tType ? 0.3 : 0.1

    const sCombined = normalizeStringList([
      ...(source.genres || []),
      ...(source.themes || []),
      ...(source.tags || []),
    ])
    const tCombined = normalizeStringList([
      ...(target.genres || []),
      ...(target.themes || []),
      ...(target.tags || []),
    ])

    let patternScore = 0
    let totalPatterns = 0

    for (const [, indicators] of Object.entries(NARRATIVE_PATTERNS)) {
      const sourceHasPattern = sCombined.some((tag) => indicators.some((ind) => tag.includes(ind)))
      const targetHasPattern = tCombined.some((tag) => indicators.some((ind) => tag.includes(ind)))

      if (sourceHasPattern || targetHasPattern) {
        totalPatterns++
        if (sourceHasPattern && targetHasPattern) {
          patternScore++
        }
      }
    }

    const narrativeAlignment = totalPatterns > 0 ? patternScore / totalPatterns : 0.5
    return typeMatchBonus + narrativeAlignment * 0.7
  },

  /**
   * Calculate complete 5-dimensional similarity score (0 to 100) and breakdown
   */
  calculateSimilarity(
    source: AnimeFeatures,
    target: AnimeFeatures,
    weights: SimilarityWeights = DEFAULT_WEIGHTS
  ): {
    score: number
    breakdown: ScoreBreakdown
    reason: string
  } {
    const genreScore = this.genreSimilarity(source, target)
    const themeScore = this.themeSimilarity(source, target)
    const toneScore = this.toneSimilarity(source, target)
    const narrativeScore = this.narrativeSimilarity(source, target)
    const demoScore = this.demographicSimilarity(source, target)

    const rawScore =
      genreScore * weights.genreOverlap +
      themeScore * weights.themeOverlap +
      toneScore * weights.toneProfile +
      narrativeScore * weights.narrativeStructure +
      demoScore * weights.demographicMatch

    const score = Math.round(Math.min(100, Math.max(0, rawScore * 100)) * 10) / 10

    const breakdown: ScoreBreakdown = {
      genre: Math.round(genreScore * 100),
      theme: Math.round(themeScore * 100),
      tone: Math.round(toneScore * 100),
      narrative: Math.round(narrativeScore * 100),
      demographic: Math.round(demoScore * 100),
    }

    const reason = this.explainSimilarity(source, target, breakdown)

    return { score, breakdown, reason }
  },

  /**
   * Generates a concise, natural language explanation of why the target was recommended
   */
  explainSimilarity(
    source: AnimeFeatures,
    target: AnimeFeatures,
    breakdown: ScoreBreakdown
  ): string {
    const sourceGenres = normalizeStringList(source.genres)
    const targetGenres = normalizeStringList(target.genres)
    const sharedGenres = sourceGenres.filter((g) => targetGenres.includes(g))

    const titleAnchor = source.englishName || source.name

    if (sharedGenres.length >= 2) {
      const topGenres = sharedGenres
        .slice(0, 2)
        .map((g) => g.charAt(0).toUpperCase() + g.slice(1))
        .join(' & ')
      return `Shares ${topGenres} elements with ${titleAnchor}`
    }

    if (breakdown.theme >= 60) {
      return `Similar thematic depth and atmosphere to ${titleAnchor}`
    }

    if (breakdown.tone >= 70) {
      return `Matches the mood and tone of ${titleAnchor}`
    }

    return `Recommended based on your interest in ${titleAnchor}`
  },
}
