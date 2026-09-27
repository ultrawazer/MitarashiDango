export interface ScoreBreakdown {
  genre: number
  theme: number
  tone: number
  narrative: number
  demographic: number
}

export interface RecommendationItem {
  showId: string
  score: number
  breakdown: ScoreBreakdown
  reason?: string
  isLocal: boolean
  mediaType?: string
  sourceType: string
  name?: string
  englishName?: string
  nativeName?: string
  thumbnail?: string
  genres?: string[]
  type?: string
  episodeCount?: number
  status?: string
  popularityScore?: number
  isAdult?: boolean
}

export interface SeedShowInfo {
  id: string
  name: string
  englishName?: string
  thumbnail?: string
}

export interface UserTasteProfile {
  genreWeights: Record<string, number>
  themeWeights: Record<string, number>
  toneWeights: Record<string, number>
  topDemographics?: string[]
  totalCompleted: number
  totalWatching: number
  avgScore: number
  topSeeds?: SeedShowInfo[]
}

export interface RecommendationsApiResponse {
  success: boolean
  data: RecommendationItem[]
  fresh: boolean
  profile?: UserTasteProfile | null
}

export interface DismissedItem {
  showId: string
  dismissedAt: string
  name?: string
  englishName?: string
  nativeName?: string
  thumbnail?: string
  type?: string
}

export interface DismissedApiResponse {
  success: boolean
  data: DismissedItem[]
}
