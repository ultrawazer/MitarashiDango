import { DatabaseWrapper } from '../db'
import { dbAll, dbGet } from '../utils/db-utils'

export const InsightsRepository = {
  getCoreStats: (db: DatabaseWrapper) =>
    dbGet<unknown>(
      db,
      `SELECT
        (SELECT SUM(currentTime) FROM watched_episodes) as totalSeconds,
        (SELECT COUNT(*) FROM watched_episodes) as totalEpisodes,
        (SELECT COUNT(DISTINCT showId) FROM watched_episodes) as totalAnime,
        (SELECT COUNT(*) FROM watchlist WHERE status = 'Completed') as completedCount,
        (SELECT COUNT(*) FROM watchlist) as totalWatchlist`
    ),

  getActivityGrid: (db: DatabaseWrapper) =>
    dbAll<unknown>(
      db,
      `SELECT date(watchedAt) as day, COUNT(*) as count FROM watched_episodes GROUP BY day`
    ),

  getHourlyDist: (db: DatabaseWrapper) =>
    dbAll<unknown>(
      db,
      `SELECT strftime('%H', watchedAt) as hour, COUNT(*) as count FROM watched_episodes GROUP BY hour`
    ),

  getSeasonality: (db: DatabaseWrapper) =>
    dbAll<unknown>(
      db,
      `SELECT strftime('%m', watchedAt) as month, SUM(currentTime) as seconds FROM watched_episodes GROUP BY month`
    ),

  getAllWatches: (db: DatabaseWrapper) =>
    dbAll<unknown>(
      db,
      'SELECT watchedAt, currentTime FROM watched_episodes ORDER BY watchedAt ASC'
    ),

  getWatchedShowsMeta: (db: DatabaseWrapper) =>
    dbAll<unknown>(
      db,
      `SELECT DISTINCT sm.id, sm.genres, sm.popularityScore
      FROM shows_meta sm
      JOIN watched_episodes we ON sm.id = we.showId`
    ),

  getDroppedShows: (db: DatabaseWrapper) =>
    dbAll<unknown>(
      db,
      `SELECT w.id, w.name, MAX(we.watchedAt) as lastActivity
        FROM watchlist w
        JOIN watched_episodes we ON w.id = we.showId
        WHERE w.status = 'Watching'
        GROUP BY w.id
        HAVING lastActivity < date('now', '-90 days')`
    ),

  getCompletionVelocities: (db: DatabaseWrapper) =>
    dbAll<unknown>(
      db,
      `SELECT
        (julianday(MAX(we.watchedAt)) - julianday(MIN(we.watchedAt))) as daysToFinish
        FROM watchlist w
        JOIN watched_episodes we ON w.id = we.showId
        WHERE w.status = 'Completed'
        GROUP BY w.id`
    ),

  getComprehensiveCoreStats: (db: DatabaseWrapper) =>
    dbGet<unknown>(
      db,
      `SELECT
        (
          COALESCE((SELECT SUM(currentTime) FROM watched_episodes), 0) +
          COALESCE((
            SELECT SUM(
              CASE 
                WHEN COALESCE(w.watchedEpisodes, sm.episodeCount, CASE WHEN w.status = 'Completed' THEN 1 ELSE 0 END) > COALESCE(we_count.cnt, 0)
                THEN (COALESCE(w.watchedEpisodes, sm.episodeCount, CASE WHEN w.status = 'Completed' THEN 1 ELSE 0 END) - COALESCE(we_count.cnt, 0)) * 24 * 60
                ELSE 0
              END
            )
            FROM watchlist w
            LEFT JOIN shows_meta sm ON w.id = sm.id
            LEFT JOIN (
              SELECT showId, COUNT(DISTINCT episodeNumber) as cnt
              FROM watched_episodes
              GROUP BY showId
            ) we_count ON w.id = we_count.showId
            WHERE w.status IN ('Completed', 'Watching', 'On-Hold', 'Dropped')
               OR COALESCE(w.watchedEpisodes, 0) > 0
          ), 0)
        ) as totalSeconds,

        (
          COALESCE((SELECT COUNT(*) FROM watched_episodes), 0) +
          COALESCE((
            SELECT SUM(
              CASE 
                WHEN COALESCE(w.watchedEpisodes, sm.episodeCount, CASE WHEN w.status = 'Completed' THEN 1 ELSE 0 END) > COALESCE(we_count.cnt, 0)
                THEN (COALESCE(w.watchedEpisodes, sm.episodeCount, CASE WHEN w.status = 'Completed' THEN 1 ELSE 0 END) - COALESCE(we_count.cnt, 0))
                ELSE 0
              END
            )
            FROM watchlist w
            LEFT JOIN shows_meta sm ON w.id = sm.id
            LEFT JOIN (
              SELECT showId, COUNT(DISTINCT episodeNumber) as cnt
              FROM watched_episodes
              GROUP BY showId
            ) we_count ON w.id = we_count.showId
            WHERE w.status IN ('Completed', 'Watching', 'On-Hold', 'Dropped')
               OR COALESCE(w.watchedEpisodes, 0) > 0
          ), 0)
        ) as totalEpisodes,

        (
          SELECT COUNT(DISTINCT id) FROM (
            SELECT showId as id FROM watched_episodes
            UNION
            SELECT id FROM watchlist 
            WHERE status IN ('Completed', 'Watching', 'On-Hold', 'Dropped')
               OR COALESCE(watchedEpisodes, 0) > 0
          )
        ) as totalAnime,

        (SELECT COUNT(*) FROM watchlist WHERE status = 'Completed') as completedCount,
        (SELECT COUNT(*) FROM watchlist) as totalWatchlist`
    ),

  getComprehensiveActivityGrid: (db: DatabaseWrapper) =>
    dbAll<unknown>(
      db,
      `SELECT day, SUM(count) as count FROM (
        SELECT date(watchedAt) as day, COUNT(*) as count 
        FROM watched_episodes 
        GROUP BY day
        UNION ALL
        SELECT finishDate as day, COUNT(*) as count 
        FROM watchlist 
        WHERE finishDate IS NOT NULL 
          AND finishDate != '0000-00-00'
          AND length(finishDate) >= 8
        GROUP BY finishDate
      ) GROUP BY day`
    ),

  getComprehensiveShowsMeta: (db: DatabaseWrapper) =>
    dbAll<unknown>(
      db,
      `SELECT DISTINCT sm.id, sm.genres, sm.popularityScore
      FROM shows_meta sm
      WHERE sm.id IN (SELECT showId FROM watched_episodes)
         OR sm.id IN (
           SELECT id FROM watchlist 
           WHERE status IN ('Completed', 'Watching') 
              OR COALESCE(watchedEpisodes, 0) > 0
         )`
    ),

  getComprehensiveVelocities: (db: DatabaseWrapper) =>
    dbAll<unknown>(
      db,
      `SELECT daysToFinish FROM (
        SELECT
          CASE 
            WHEN (julianday(finishDate) - julianday(startDate)) <= 0 THEN 1
            ELSE (julianday(finishDate) - julianday(startDate))
          END as daysToFinish
        FROM watchlist
        WHERE status = 'Completed'
          AND finishDate IS NOT NULL 
          AND startDate IS NOT NULL
          AND finishDate != '0000-00-00'
          AND startDate != '0000-00-00'
        UNION ALL
        SELECT
          CASE 
            WHEN (julianday(MAX(we.watchedAt)) - julianday(MIN(we.watchedAt))) <= 0 THEN 1
            ELSE (julianday(MAX(we.watchedAt)) - julianday(MIN(we.watchedAt)))
          END as daysToFinish
        FROM watchlist w
        JOIN watched_episodes we ON w.id = we.showId
        WHERE w.status = 'Completed'
          AND (w.finishDate IS NULL OR w.startDate IS NULL)
        GROUP BY w.id
        HAVING COUNT(we.episodeNumber) > 1
      )`
    ),

  getWatchedEpisodesWithMeta: (db: DatabaseWrapper) =>
    dbAll<{
      showId: string
      currentTime: number
      duration: number
      episodeCount: number
      genres: string
      popularityScore: number
      name: string
      nativeName?: string
      englishName?: string
      thumbnail: string
    }>(
      db,
      `SELECT 
        we.showId,
        we.currentTime,
        we.duration,
        1 as episodeCount,
        sm.genres,
        sm.popularityScore,
        sm.name,
        sm.nativeName,
        sm.englishName,
        sm.thumbnail
      FROM watched_episodes we
      JOIN shows_meta sm ON we.showId = sm.id`
    ),

  getComprehensiveEpisodesWithMeta: (db: DatabaseWrapper) =>
    dbAll<{
      showId: string
      currentTime: number
      duration: number
      episodeCount: number
      genres: string
      popularityScore: number
      name: string
      nativeName?: string
      englishName?: string
      thumbnail: string
    }>(
      db,
      `SELECT 
        we.showId,
        we.currentTime,
        we.duration,
        1 as episodeCount,
        sm.genres,
        sm.popularityScore,
        COALESCE(w.name, sm.name) as name,
        COALESCE(w.nativeName, sm.nativeName) as nativeName,
        COALESCE(w.englishName, sm.englishName) as englishName,
        COALESCE(w.thumbnail, sm.thumbnail) as thumbnail
      FROM watched_episodes we
      JOIN shows_meta sm ON we.showId = sm.id
      LEFT JOIN watchlist w ON we.showId = w.id

      UNION ALL

      SELECT
        w.id as showId,
        CASE 
          WHEN COALESCE(w.watchedEpisodes, sm.episodeCount, CASE WHEN w.status = 'Completed' THEN 1 ELSE 0 END) > COALESCE(we_count.cnt, 0)
          THEN (COALESCE(w.watchedEpisodes, sm.episodeCount, CASE WHEN w.status = 'Completed' THEN 1 ELSE 0 END) - COALESCE(we_count.cnt, 0)) * 24 * 60
          ELSE 0
        END as currentTime,
        0 as duration,
        CASE 
          WHEN COALESCE(w.watchedEpisodes, sm.episodeCount, CASE WHEN w.status = 'Completed' THEN 1 ELSE 0 END) > COALESCE(we_count.cnt, 0)
          THEN (COALESCE(w.watchedEpisodes, sm.episodeCount, CASE WHEN w.status = 'Completed' THEN 1 ELSE 0 END) - COALESCE(we_count.cnt, 0))
          ELSE 0
        END as episodeCount,
        sm.genres,
        COALESCE(w.score, sm.popularityScore, 0) as popularityScore,
        COALESCE(w.name, sm.name) as name,
        COALESCE(w.nativeName, sm.nativeName) as nativeName,
        COALESCE(w.englishName, sm.englishName) as englishName,
        COALESCE(w.thumbnail, sm.thumbnail) as thumbnail
      FROM watchlist w
      JOIN shows_meta sm ON w.id = sm.id
      LEFT JOIN (
        SELECT showId, COUNT(DISTINCT episodeNumber) as cnt
        FROM watched_episodes
        GROUP BY showId
      ) we_count ON w.id = we_count.showId
      WHERE (w.status IN ('Completed', 'Watching', 'On-Hold', 'Dropped') OR COALESCE(w.watchedEpisodes, 0) > 0)
        AND (COALESCE(w.watchedEpisodes, sm.episodeCount, CASE WHEN w.status = 'Completed' THEN 1 ELSE 0 END) > COALESCE(we_count.cnt, 0))`
    ),

  getActivityForDate: async (db: DatabaseWrapper, date: string, includeWatchlist: boolean) => {
    const streamed = await dbAll<{
      showId: string
      name: string
      nativeName?: string
      englishName?: string
      thumbnail: string
      episodeCount?: number
      episodesStreamed: number
      score?: number
      status?: string
    }>(
      db,
      `SELECT 
        we.showId,
        COALESCE(w.name, sm.name) as name,
        COALESCE(w.nativeName, sm.nativeName) as nativeName,
        COALESCE(w.englishName, sm.englishName) as englishName,
        COALESCE(w.thumbnail, sm.thumbnail) as thumbnail,
        COALESCE(w.totalEpisodes, sm.episodeCount) as episodeCount,
        COALESCE(w.score, sm.popularityScore) as score,
        w.status,
        COUNT(DISTINCT we.episodeNumber) as episodesStreamed
      FROM watched_episodes we
      LEFT JOIN shows_meta sm ON we.showId = sm.id
      LEFT JOIN watchlist w ON we.showId = w.id
      WHERE strftime('%Y-%m-%d', we.watchedAt) = ?
      GROUP BY we.showId`,
      [date]
    )

    let completed: any[] = []
    let started: any[] = []

    if (includeWatchlist) {
      completed = await dbAll<{
        showId: string
        name: string
        nativeName?: string
        englishName?: string
        thumbnail: string
        status: string
        score?: number
        watchedEpisodes?: number
        totalEpisodes?: number
        startDate?: string
        finishDate?: string
      }>(
        db,
        `SELECT 
          w.id as showId,
          COALESCE(w.name, sm.name) as name,
          COALESCE(w.nativeName, sm.nativeName) as nativeName,
          COALESCE(w.englishName, sm.englishName) as englishName,
          COALESCE(w.thumbnail, sm.thumbnail) as thumbnail,
          w.status,
          w.score,
          w.watchedEpisodes,
          COALESCE(w.totalEpisodes, sm.episodeCount) as totalEpisodes,
          w.startDate,
          w.finishDate
        FROM watchlist w
        LEFT JOIN shows_meta sm ON w.id = sm.id
        WHERE w.finishDate = ?`,
        [date]
      )

      started = await dbAll<{
        showId: string
        name: string
        nativeName?: string
        englishName?: string
        thumbnail: string
        status: string
        score?: number
        watchedEpisodes?: number
        totalEpisodes?: number
        startDate?: string
        finishDate?: string
      }>(
        db,
        `SELECT 
          w.id as showId,
          COALESCE(w.name, sm.name) as name,
          COALESCE(w.nativeName, sm.nativeName) as nativeName,
          COALESCE(w.englishName, sm.englishName) as englishName,
          COALESCE(w.thumbnail, sm.thumbnail) as thumbnail,
          w.status,
          w.score,
          w.watchedEpisodes,
          COALESCE(w.totalEpisodes, sm.episodeCount) as totalEpisodes,
          w.startDate,
          w.finishDate
        FROM watchlist w
        LEFT JOIN shows_meta sm ON w.id = sm.id
        WHERE w.startDate = ?`,
        [date]
      )
    }

    return { streamed, completed, started }
  },

  getShowsForGenre: (db: DatabaseWrapper, genre: string) =>
    dbAll<{
      id: string
      name: string
      nativeName?: string
      englishName?: string
      thumbnail: string
      status?: string
      score?: number
      watchedEpisodes?: number
      totalEpisodes?: number
      type?: string
      genres?: string
    }>(
      db,
      `SELECT 
        sm.id,
        COALESCE(w.name, sm.name) as name,
        COALESCE(w.nativeName, sm.nativeName) as nativeName,
        COALESCE(w.englishName, sm.englishName) as englishName,
        COALESCE(w.thumbnail, sm.thumbnail) as thumbnail,
        COALESCE(w.status, sm.status) as status,
        COALESCE(w.score, sm.popularityScore) as score,
        w.watchedEpisodes,
        COALESCE(w.totalEpisodes, sm.episodeCount) as totalEpisodes,
        COALESCE(w.type, sm.type) as type,
        sm.genres
      FROM shows_meta sm
      LEFT JOIN watchlist w ON sm.id = w.id
      WHERE sm.genres LIKE '%' || ? || '%'
        AND (
          w.id IS NOT NULL 
          OR EXISTS (SELECT 1 FROM watched_episodes we WHERE we.showId = sm.id)
        )
      ORDER BY COALESCE(w.score, sm.popularityScore, 0) DESC, COALESCE(w.name, sm.name) ASC`,
      [genre]
    ),
}
