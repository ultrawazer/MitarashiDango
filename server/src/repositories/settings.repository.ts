import { DatabaseWrapper } from '../db'
import { dbGet, dbRun } from '../utils/db-utils'

export const SettingsRepository = {
  getByKey: (db: DatabaseWrapper, key: string) =>
    dbGet<{ value: string }>(db, 'SELECT value FROM settings WHERE key = ?', [key]),

  upsert: (db: DatabaseWrapper, key: string, value: string) =>
    dbRun(db, 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]),

  deleteByKey: (db: DatabaseWrapper, key: string) =>
    dbRun(db, 'DELETE FROM settings WHERE key = ?', [key]),

  clearWatchlist: (db: DatabaseWrapper) => dbRun(db, 'DELETE FROM watchlist'),

  upsertWatchlistBatch: (
    db: DatabaseWrapper,
    shows: {
      id: string
      name: string
      thumbnail?: string
      status: string
      type?: string
      watchedEpisodes?: number
      totalEpisodes?: number
      startDate?: string | null
      finishDate?: string | null
      score?: number | null
    }[]
  ) => {
    for (const show of shows) {
      dbRun(
        db,
        `INSERT INTO watchlist (id, name, thumbnail, status, type, watchedEpisodes, totalEpisodes, startDate, finishDate, score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           thumbnail = COALESCE(excluded.thumbnail, watchlist.thumbnail),
           status = excluded.status,
           type = COALESCE(excluded.type, watchlist.type),
           watchedEpisodes = COALESCE(excluded.watchedEpisodes, watchlist.watchedEpisodes),
           totalEpisodes = COALESCE(excluded.totalEpisodes, watchlist.totalEpisodes),
           startDate = COALESCE(excluded.startDate, watchlist.startDate),
           finishDate = COALESCE(excluded.finishDate, watchlist.finishDate),
           score = COALESCE(excluded.score, watchlist.score)`,
        [
          show.id,
          show.name,
          show.thumbnail ?? null,
          show.status,
          show.type ?? null,
          show.watchedEpisodes ?? null,
          show.totalEpisodes ?? null,
          show.startDate ?? null,
          show.finishDate ?? null,
          show.score ?? null,
        ]
      )
    }
  },
}
