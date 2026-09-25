import { DatabaseWrapper } from '../db'
import { dbAll, dbGet, dbRun } from '../utils/db-utils'

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
  computedAt?: string

  // Metadata joined from shows_meta
  name?: string
  englishName?: string
  nativeName?: string
  thumbnail?: string
  genres?: string[]
  type?: string
  episodeCount?: number
  status?: string
  popularityScore?: number
}

interface RawRecommendationRow {
  id: number
  showId: string
  score: number
  breakdown: string | null
  reason: string | null
  isLocal: number
  mediaType: string | null
  sourceType: string
  computedAt: string
  name: string | null
  englishName: string | null
  nativeName: string | null
  thumbnail: string | null
  genres: string | null
  type: string | null
  episodeCount: number | null
  status: string | null
  popularityScore: number | null
}

function safeParseBreakdown(jsonStr: string | null): ScoreBreakdown {
  if (!jsonStr) {
    return { genre: 0, theme: 0, tone: 0, narrative: 0, demographic: 0 }
  }
  try {
    const parsed = JSON.parse(jsonStr)
    return {
      genre: Number(parsed.genre) || 0,
      theme: Number(parsed.theme) || 0,
      tone: Number(parsed.tone) || 0,
      narrative: Number(parsed.narrative) || 0,
      demographic: Number(parsed.demographic) || 0,
    }
  } catch {
    return { genre: 0, theme: 0, tone: 0, narrative: 0, demographic: 0 }
  }
}

function safeParseGenres(genresStr: string | null): string[] {
  if (!genresStr) return []
  try {
    const parsed = JSON.parse(genresStr)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return genresStr.split(',').map((g) => g.trim()).filter(Boolean)
  }
}

export const RecommendationsRepository = {
  getBySourceType: (
    db: DatabaseWrapper,
    sourceType: string,
    limit = 20,
    offset = 0
  ): RecommendationItem[] => {
    const query = `
      SELECT 
        rc.id, rc.showId, rc.score, rc.breakdown, rc.reason, rc.isLocal, rc.mediaType, rc.sourceType, rc.computedAt,
        COALESCE(sm.name, '') as name,
        COALESCE(sm.englishName, '') as englishName,
        COALESCE(sm.nativeName, '') as nativeName,
        COALESCE(sm.thumbnail, '') as thumbnail,
        sm.genres,
        COALESCE(sm.type, rc.mediaType, '') as type,
        sm.episodeCount,
        sm.status,
        sm.popularityScore
      FROM recommendations_cache rc
      LEFT JOIN shows_meta sm ON rc.showId = sm.id
      WHERE rc.sourceType = ?
        AND rc.showId NOT IN (SELECT showId FROM dismissed_recommendations)
        AND rc.showId NOT IN (SELECT id FROM watchlist WHERE status IN ('Completed', 'Watching', 'Dropped'))
      ORDER BY rc.score DESC
      LIMIT ? OFFSET ?
    `

    const rows = dbAll<RawRecommendationRow>(db, query, [sourceType, limit, offset])

    return rows.map((r) => ({
      showId: r.showId,
      score: r.score,
      breakdown: safeParseBreakdown(r.breakdown),
      reason: r.reason || undefined,
      isLocal: Boolean(r.isLocal),
      mediaType: r.mediaType || undefined,
      sourceType: r.sourceType,
      computedAt: r.computedAt,
      name: r.name || undefined,
      englishName: r.englishName || undefined,
      nativeName: r.nativeName || undefined,
      thumbnail: r.thumbnail || undefined,
      genres: safeParseGenres(r.genres),
      type: r.type || undefined,
      episodeCount: r.episodeCount != null ? Number(r.episodeCount) : undefined,
      status: r.status || undefined,
      popularityScore: r.popularityScore != null ? Number(r.popularityScore) : undefined,
    }))
  },

  saveBatch: (db: DatabaseWrapper, items: RecommendationItem[], sourceType: string): void => {
    db.serialize(() => {
      // Clear old entries for this source type
      dbRun(db, 'DELETE FROM recommendations_cache WHERE sourceType = ?', [sourceType])

      for (const item of items) {
        dbRun(
          db,
          `INSERT OR REPLACE INTO recommendations_cache 
           (showId, score, breakdown, reason, isLocal, mediaType, sourceType, computedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          [
            item.showId,
            item.score,
            JSON.stringify(item.breakdown),
            item.reason ?? null,
            item.isLocal ? 1 : 0,
            item.mediaType ?? null,
            sourceType,
          ]
        )
      }
    })
  },

  clearBySourceType: (db: DatabaseWrapper, sourceType: string): void => {
    dbRun(db, 'DELETE FROM recommendations_cache WHERE sourceType = ?', [sourceType])
  },

  isCacheFresh: (db: DatabaseWrapper, sourceType: string, maxAgeHours = 24): boolean => {
    const row = dbGet<{ count: number }>(
      db,
      `SELECT COUNT(*) as count 
       FROM recommendations_cache 
       WHERE sourceType = ? 
         AND computedAt >= datetime('now', '-' || ? || ' hours')`,
      [sourceType, maxAgeHours]
    )
    return Boolean(row && row.count > 0)
  },

  dismiss: (db: DatabaseWrapper, showId: string): void => {
    db.serialize(() => {
      dbRun(
        db,
        `INSERT OR REPLACE INTO dismissed_recommendations (showId, dismissedAt)
         VALUES (?, datetime('now'))`,
        [showId]
      )
      dbRun(db, 'DELETE FROM recommendations_cache WHERE showId = ?', [showId])
    })
  },

  undismiss: (db: DatabaseWrapper, showId: string): void => {
    dbRun(db, 'DELETE FROM dismissed_recommendations WHERE showId = ?', [showId])
  },

  isDismissed: (db: DatabaseWrapper, showId: string): boolean => {
    const row = dbGet<{ existsCount: number }>(
      db,
      'SELECT EXISTS(SELECT 1 FROM dismissed_recommendations WHERE showId = ?) as existsCount',
      [showId]
    )
    return Boolean(row && row.existsCount > 0)
  },

  getDismissedIds: (db: DatabaseWrapper): string[] => {
    const rows = dbAll<{ showId: string }>(db, 'SELECT showId FROM dismissed_recommendations')
    return rows.map((r) => r.showId)
  },

  saveTasteProfile: (db: DatabaseWrapper, key: string, data: unknown): void => {
    dbRun(
      db,
      `INSERT OR REPLACE INTO user_taste_profile (key, value, updatedAt)
       VALUES (?, ?, datetime('now'))`,
      [key, JSON.stringify(data)]
    )
  },

  getTasteProfile: <T = unknown>(db: DatabaseWrapper, key: string): T | null => {
    const row = dbGet<{ value: string }>(
      db,
      'SELECT value FROM user_taste_profile WHERE key = ?',
      [key]
    )
    if (!row?.value) return null
    try {
      return JSON.parse(row.value) as T
    } catch {
      return null
    }
  },
}
