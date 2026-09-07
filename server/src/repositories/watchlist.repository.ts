import { DatabaseWrapper } from '../db'
import { dbAll, dbGet, dbRun } from '../utils/db-utils'

export interface WatchlistRow {
  id: string
  name: string
  thumbnail: string
  status: string
  nativeName?: string
  englishName?: string
  type?: string
  watchedEpisodes?: number
  totalEpisodes?: number
  startDate?: string | null
  finishDate?: string | null
  score?: number | null
  [key: string]: unknown
}

export const WatchlistRepository = {
  getById: (db: DatabaseWrapper, id: string) =>
    dbGet<WatchlistRow>(
      db,
      `SELECT w.*,
              COALESCE(w.thumbnail, m.thumbnail, '') as thumbnail,
              COALESCE(w.type, m.type, '') as type,
              COALESCE(w.nativeName, m.nativeName, '') as nativeName,
              COALESCE(w.englishName, m.englishName, '') as englishName
       FROM watchlist w
       LEFT JOIN shows_meta m ON w.id = m.id
       WHERE w.id = ?`,
      [id]
    ),

  exists: (db: DatabaseWrapper, id: string) => {
    const row = dbGet<{ inWatchlist: number }>(
      db,
      'SELECT EXISTS(SELECT 1 FROM watchlist WHERE id = ?) as inWatchlist',
      [id]
    )
    return !!(row && row.inWatchlist)
  },

  getAll: (db: DatabaseWrapper, status?: string, limit?: number, offset?: number) => {
    let query = `
      SELECT w.id, w.name,
             COALESCE(w.thumbnail, m.thumbnail, '') as thumbnail,
             w.status,
             COALESCE(w.nativeName, m.nativeName, '') as nativeName,
             COALESCE(w.englishName, m.englishName, '') as englishName,
             COALESCE(w.type, m.type, '') as type
      FROM watchlist w
      LEFT JOIN shows_meta m ON w.id = m.id
    `
    const params: (string | number)[] = []

    if (status && status !== 'All') {
      query += ' WHERE w.status = ?'
      params.push(status)
    }

    query += ' ORDER BY w.rowid DESC'

    if (limit !== undefined && offset !== undefined) {
      query += ' LIMIT ? OFFSET ?'
      params.push(limit, offset)
    }

    return dbAll<WatchlistRow>(db, query, params)
  },

  getCount: (db: DatabaseWrapper, status?: string) => {
    let query = 'SELECT COUNT(*) as total FROM watchlist'
    const params: string[] = []

    if (status && status !== 'All') {
      query += ' WHERE status = ?'
      params.push(status)
    }

    const row = dbGet<{ total: number }>(db, query, params)
    return row?.total || 0
  },

  upsert: (
    db: DatabaseWrapper,
    data: {
      id: string
      name: string
      thumbnail: string
      status: string
      nativeName?: string
      englishName?: string
      type?: string
      watchedEpisodes?: number
      totalEpisodes?: number
      startDate?: string | null
      finishDate?: string | null
      score?: number | null
    }
  ) =>
    dbRun(
      db,
      `INSERT INTO watchlist (id, name, thumbnail, status, nativeName, englishName, type, watchedEpisodes, totalEpisodes, startDate, finishDate, score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         thumbnail = COALESCE(excluded.thumbnail, watchlist.thumbnail),
         status = excluded.status,
         nativeName = COALESCE(excluded.nativeName, watchlist.nativeName),
         englishName = COALESCE(excluded.englishName, watchlist.englishName),
         type = COALESCE(excluded.type, watchlist.type),
         watchedEpisodes = COALESCE(excluded.watchedEpisodes, watchlist.watchedEpisodes),
         totalEpisodes = COALESCE(excluded.totalEpisodes, watchlist.totalEpisodes),
         startDate = COALESCE(excluded.startDate, watchlist.startDate),
         finishDate = COALESCE(excluded.finishDate, watchlist.finishDate),
         score = COALESCE(excluded.score, watchlist.score)`,
      [
        data.id,
        data.name,
        data.thumbnail,
        data.status,
        data.nativeName ?? null,
        data.englishName ?? null,
        data.type ?? null,
        data.watchedEpisodes ?? null,
        data.totalEpisodes ?? null,
        data.startDate ?? null,
        data.finishDate ?? null,
        data.score ?? null,
      ]
    ),

  updateStatus: (db: DatabaseWrapper, id: string, status: string) =>
    dbRun(db, 'UPDATE watchlist SET status = ? WHERE id = ?', [status, id]),

  updateThumbnail: (db: DatabaseWrapper, id: string, thumbnail: string) =>
    dbRun(db, 'UPDATE watchlist SET thumbnail = ? WHERE id = ?', [thumbnail, id]),

  delete: (db: DatabaseWrapper, id: string) =>
    dbRun(db, 'DELETE FROM watchlist WHERE id = ?', [id]),

  deleteMany: (db: DatabaseWrapper, ids: string[]) => {
    if (ids.length === 0) return Promise.resolve()
    const placeholders = ids.map(() => '?').join(', ')
    return dbRun(db, `DELETE FROM watchlist WHERE id IN (${placeholders})`, ids)
  },

  updateStatusMany: (db: DatabaseWrapper, ids: string[], status: string) => {
    if (ids.length === 0) return Promise.resolve()
    const placeholders = ids.map(() => '?').join(', ')
    return dbRun(db, `UPDATE watchlist SET status = ? WHERE id IN (${placeholders})`, [
      status,
      ...ids,
    ])
  },

  getWatchingShows: (db: DatabaseWrapper) =>
    dbAll<{
      id: string
      name: string
      thumbnail: string
      nativeName?: string
      englishName?: string
    }>(
      db,
      `SELECT w.id, w.name,
              COALESCE(w.thumbnail, m.thumbnail, '') as thumbnail,
              COALESCE(w.nativeName, m.nativeName, '') as nativeName,
              COALESCE(w.englishName, m.englishName, '') as englishName
       FROM watchlist w
       LEFT JOIN shows_meta m ON w.id = m.id
       WHERE w.status = 'Watching'`
    ),
}
