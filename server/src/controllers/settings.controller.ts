import { Request, Response } from 'express'
import { performWriteTransaction } from '../sync'
import { searchAnilistByTitle, isAnilistRateLimited, getShowMetaById, anilistUnavailable } from '../lib/anilist'
import { kitsuSearchAnime } from '../lib/kitsu'
import { parseStringPromise } from 'xml2js'
import logger from '../logger'
import path from 'path'
import fs from 'fs'
import { CONFIG } from '../config'
import { DatabaseWrapper } from '../db'
import { SettingsRepository } from '../repositories/settings.repository'
import { ShowsMetaRepository } from '../repositories/shows-meta.repository'
import { getMachineId } from '../utils/machine-id'
import { discordRPCService } from '../discord-rpc'
import { animeIdMapper } from '../lib/anime-id-mapper'
import { shokoClient } from '../lib/shoko.client'

interface MalAnimeItem {
  series_animedb_id?: string[]
  series_title: string[]
  series_type?: string[]
  series_episodes?: string[]
  my_watched_episodes?: string[]
  my_start_date?: string[]
  my_finish_date?: string[]
  my_score?: string[]
  my_status: string[]
}

interface ShowToInsert {
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
}

export interface ActiveImportStatus {
  running: boolean
  current: number
  total: number
  title?: string
  matchedTitle?: string | null
  status?: string | null
  source?: 'anilist' | 'kitsu' | 'offline' | null
  found?: boolean
  imported: number
  skipped: number
  phase?: 'offline' | 'fallback' | 'done'
}

let activeImportStatus: ActiveImportStatus = {
  running: false,
  current: 0,
  total: 0,
  imported: 0,
  skipped: 0,
}
let activeImportAbortController: AbortController | null = null

function mapMalStatus(malStatus: string): string {
  switch (malStatus) {
    case 'Plan to Watch':
      return 'Planned'
    case 'On Hold':
      return 'On-Hold'
    default:
      return malStatus
  }
}

function parseMalDate(dateStr?: string): string | null {
  if (!dateStr) return null
  const trimmed = dateStr.trim()
  if (!trimmed || trimmed === '0000-00-00' || trimmed.startsWith('0000')) {
    return null
  }
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const [, year, month, day] = match
  if (month === '00' || day === '00') {
    return month !== '00' ? `${year}-${month}-01` : `${year}-01-01`
  }
  return trimmed
}

async function searchByTitleForMal(title: string): Promise<{
  id: number
  title: { romaji?: string; english?: string; native?: string }
  source: 'anilist' | 'kitsu'
} | null> {
  if (!anilistUnavailable() && !isAnilistRateLimited()) {
    try {
      const result = await searchAnilistByTitle(title)
      if (result) return { ...result, source: 'anilist' }
    } catch {
      // Continue to Kitsu fallback
    }
  }

  logger.debug({ title }, 'AniList unavailable or not found, trying Kitsu fallback for MAL import')
  try {
    const fb = await kitsuSearchAnime({ query: title, page: 1, perPage: 5 })
    if (fb.length > 0) {
      const lowerTitle = title.toLowerCase()
      const exactMatch = fb.find(
        (m) =>
          m.title?.romaji?.toLowerCase() === lowerTitle ||
          m.title?.english?.toLowerCase() === lowerTitle
      )
      const best = exactMatch || fb[0]
      if (best.id > 0) {
        return { id: best.id, title: best.title ?? {}, source: 'kitsu' }
      }
    }
  } catch {
    // Kitsu search failed
  }

  return null
}

export class SettingsController {
  getSettings = async (req: Request, res: Response) => {
    try {
      const row = await SettingsRepository.getByKey(req.db, req.query.key as string)
      let value = row ? row.value : null
      if (value === null && req.query.key === 'discordRPCEnabled') {
        value = 'true'
      }
      if (value === null && req.query.key === 'discordRPCHideMature') {
        value = 'true'
      }
      res.json({ value: value })
    } catch {
      res.status(500).json({ error: 'DB error' })
    }
  }

  updateSettings = async (req: Request, res: Response) => {
    try {
      const key = String(req.body.key)
      const value = String(req.body.value ?? '')
      const shouldDelete = value === '' && key === 'tracker_anilist_client_id'
      await performWriteTransaction(req.db, (tx) => {
        if (shouldDelete) SettingsRepository.deleteByKey(tx, key)
        else SettingsRepository.upsert(tx, key, value)
      })
      if (req.body.key === 'discordRPCEnabled') {
        discordRPCService.setEnabled(req.body.value === 'true' || req.body.value === true)
      }
      if (req.body.key === 'discordRPCHideMature') {
        discordRPCService.setHideMature(req.body.value === 'true' || req.body.value === true)
      }
      res.json({ success: true })
    } catch {
      res.status(500).json({ error: 'DB error' })
    }
  }

  backupDatabase = (req: Request, res: Response) => {
    const backupPath = path.join(CONFIG.ROOT, 'dango-backup.db')

    try {
      req.db.backup(backupPath)
      res.download(backupPath, 'dango-backup.db', (err) => {
        if (err) {
          logger.error({ err }, 'res.download failed during database backup')
          if (!res.headersSent) {
            res.status(500).json({ error: 'Download failed' })
          }
        }
        fs.unlink(backupPath, () => {})
      })
    } catch (err) {
      logger.error({ err }, 'Manual backup failed')
      return res.status(500).json({ error: 'Backup failed' })
    }
  }

  restoreDatabase = (
    req: Request,
    res: Response,
    db: DatabaseWrapper,
    initializeDatabase: (path: string) => Promise<DatabaseWrapper>,
    setDb: (newDb: DatabaseWrapper) => void
  ) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })

    const dbName = CONFIG.IS_DEV ? CONFIG.DB_NAME_DEV : CONFIG.DB_NAME_PROD
    const tempPath = path.join(CONFIG.ROOT, `restore_temp.db`)
    const dbPath = path.join(CONFIG.ROOT, dbName)

    db.close((closeErr: Error | null) => {
      if (closeErr) return res.status(500).json({ error: 'Failed to close database.' })

      try {
        req.db.checkpoint()
      } catch (checkpointErr) {
        logger.warn({ err: checkpointErr }, 'WAL checkpoint failed')
      }

      try {
        if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`)
        if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`)
      } catch (cleanupErr) {
        logger.warn({ err: cleanupErr }, 'Failed to clean up WAL files')
      }

      fs.rename(tempPath, dbPath, async (renameErr) => {
        if (renameErr) {
          try {
            const reopenedDb = await initializeDatabase(dbPath)
            setDb(reopenedDb)
            req.db = reopenedDb
          } catch (e) {
            logger.error({ err: e }, 'Failed to reopen DB after rename failure')
          }
          return res.status(500).json({ error: 'Failed to replace database file.' })
        }
        try {
          const newDb = await initializeDatabase(dbPath)
          setDb(newDb)
          req.db = newDb
          res.json({ success: true, message: 'Database restored.' })
        } catch (e) {
          logger.error({ err: e }, 'Failed to initialize restored database')
          res.status(500).json({ error: 'Failed to initialize restored database.' })
        }
      })
    })
  }

  getImportStatus = (_req: Request, res: Response) => {
    res.json(activeImportStatus)
  }

  cancelImport = (_req: Request, res: Response) => {
    if (activeImportAbortController) {
      activeImportAbortController.abort()
      activeImportAbortController = null
    }
    activeImportStatus = {
      ...activeImportStatus,
      running: false,
    }
    res.json({ success: true, message: 'Import cancelled' })
  }

  importMalXml = async (req: Request, res: Response) => {
    if (activeImportStatus.running) {
      return res.status(409).json({ error: 'An import is already in progress' })
    }

    if (!req.file) return res.status(400).json({ error: 'No file' })
    const { erase, useOfflineDb, skipFallback } = req.body
    const isOfflineDbEnabled = useOfflineDb !== 'false' && useOfflineDb !== false
    const shouldSkipFallback = skipFallback === 'true' || skipFallback === true

    let result: Record<string, unknown>
    try {
      result = await parseStringPromise(req.file.buffer.toString())
    } catch {
      return res.status(400).json({ error: 'Invalid XML' })
    }

    const animeList: MalAnimeItem[] =
      ((result?.myanimelist as Record<string, unknown>)?.anime as MalAnimeItem[]) || []

    const total = animeList.length
    if (total === 0) {
      return res.status(400).json({ error: 'No anime found in XML' })
    }

    const abortController = new AbortController()
    activeImportAbortController = abortController
    activeImportStatus = {
      running: true,
      current: 0,
      total,
      imported: 0,
      skipped: 0,
      phase: 'offline',
    }

    let clientDisconnected = false
    const handleClose = () => {
      if (res.writableEnded) return
      clientDisconnected = true
      abortController.abort()
      if (activeImportAbortController === abortController) {
        activeImportStatus = {
          ...activeImportStatus,
          running: false,
        }
        activeImportAbortController = null
      }
    }
    req.on('close', handleClose)
    res.on('close', handleClose)

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const sendEvent = (event: string, data: unknown) => {
      if (clientDisconnected || res.writableEnded) return
      try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        if (typeof res.flush === 'function') res.flush()
      } catch {
        // stream write error
      }
    }

    let skippedCount = 0
    const offlineShowsToInsert: ShowToInsert[] = []
    const offlineMetaToSave: { id: string; thumbnail?: string; type?: string; genres?: string }[] = []

    // Build Shoko artwork lookup upfront if Shoko is connected
    const shokoArtworkByAnidb = new Map<number, string>()
    const shokoArtworkByMal = new Map<number, string>()
    try {
      const shokoSeries = await shokoClient.getSeriesList(req.db, 1, 1000)
      for (const s of shokoSeries) {
        const preferredPoster =
          s.Images?.Posters?.find((p) => p.Preferred) || s.Images?.Posters?.[0]
        if (preferredPoster?.ID) {
          const posterUrl = `/api/shoko/image/${preferredPoster.Source || 'AniDB'}/${preferredPoster.Type || 'Poster'}/${preferredPoster.ID}`
          const anidbId = s.IDs?.AniDB || s.AniDB?.ID
          if (anidbId) shokoArtworkByAnidb.set(anidbId, posterUrl)
          if (s.IDs?.MAL && Array.isArray(s.IDs.MAL)) {
            for (const mId of s.IDs.MAL) {
              shokoArtworkByMal.set(mId, posterUrl)
            }
          }
        }
      }
    } catch {
      // Shoko not connected or error, ignore
    }

    const fallbackQueue: MalAnimeItem[] = []

    // PASS 1: Offline DB Matching
    for (let i = 0; i < animeList.length; i++) {
      if (abortController.signal.aborted) break

      const item = animeList[i]
      const malTitle = item.series_title[0]
      const malIdStr = item.series_animedb_id?.[0]
      const malId = malIdStr ? parseInt(malIdStr, 10) : null

      let matched = false
      if (isOfflineDbEnabled && malId && !isNaN(malId)) {
        const offlineEntry = animeIdMapper.getByMalId(malId)
        if (offlineEntry && offlineEntry.anilistId) {
          matched = true
          const showId = String(offlineEntry.anilistId)
          const title = offlineEntry.title || malTitle
          const status = mapMalStatus(item.my_status[0])

          const shokoPoster =
            shokoArtworkByMal.get(malId) ||
            (offlineEntry.anidbId ? shokoArtworkByAnidb.get(offlineEntry.anidbId) : null)
          let thumbnail = shokoPoster || offlineEntry.thumbnail || undefined
          if (thumbnail && thumbnail.includes('cdn.myanimelist.net/images/anime/')) {
            thumbnail = thumbnail.replace(/t\.(jpe?g|png|webp)$/i, 'l.$1')
          }

          const watchedEpisodes = parseInt(item.my_watched_episodes?.[0] || '0', 10) || 0
          const totalEpisodes = parseInt(item.series_episodes?.[0] || '0', 10) || 0
          const score = parseFloat(item.my_score?.[0] || '0') || null
          const startDate = parseMalDate(item.my_start_date?.[0])
          const finishDate = parseMalDate(item.my_finish_date?.[0])

          offlineShowsToInsert.push({
            id: showId,
            name: title,
            thumbnail,
            status,
            type: offlineEntry.type,
            watchedEpisodes,
            totalEpisodes,
            startDate,
            finishDate,
            score,
          })

          if (thumbnail || offlineEntry.type || offlineEntry.genres) {
            offlineMetaToSave.push({
              id: showId,
              thumbnail,
              type: offlineEntry.type,
              genres: offlineEntry.genres,
            })
          }

          const current = offlineShowsToInsert.length
          activeImportStatus = {
            ...activeImportStatus,
            current,
            title: malTitle,
            matchedTitle: title,
            status,
            source: 'offline',
            found: true,
            imported: offlineShowsToInsert.length,
          }

          sendEvent('progress', {
            current,
            total,
            title: malTitle,
            matchedTitle: title,
            status,
            source: 'offline',
            found: true,
          })
        }
      }

      if (!matched) {
        fallbackQueue.push(item)
      }
    }

    // IMMEDIATELY COMMIT OFFLINE MATCHES TO SQLITE
    // Even if fallback takes time, is cancelled, or fails, the user's shows are safely stored!
    if (offlineShowsToInsert.length > 0 || erase) {
      try {
        await performWriteTransaction(req.db, (tx) => {
          if (erase) SettingsRepository.clearWatchlist(tx)
          SettingsRepository.upsertWatchlistBatch(tx, offlineShowsToInsert)
          for (const meta of offlineMetaToSave) {
            if (meta.thumbnail || meta.type || meta.genres) {
              ShowsMetaRepository.upsert(tx, {
                id: meta.id,
                thumbnail: meta.thumbnail,
                type: meta.type,
                genres: meta.genres,
              })
            }
          }
        })
      } catch (dbErr) {
        logger.error({ err: dbErr }, 'Failed to commit offline matches to SQLite')
      }
    }

    const offlineMatchedCount = offlineShowsToInsert.length
    let fallbackImportedCount = 0

    // PASS 2: Fallback Queue (if not skipped and not aborted)
    if (shouldSkipFallback || abortController.signal.aborted) {
      skippedCount += fallbackQueue.length
    } else if (fallbackQueue.length > 0) {
      activeImportStatus.phase = 'fallback'

      const BATCH_SIZE = 5
      for (let i = 0; i < fallbackQueue.length; i += BATCH_SIZE) {
        if (abortController.signal.aborted) {
          skippedCount += fallbackQueue.length - i
          break
        }

        const batch = fallbackQueue.slice(i, i + BATCH_SIZE)
        const batchResults = await Promise.allSettled(
          batch.map((item) => searchByTitleForMal(item.series_title[0]))
        )

        const fallbackShowsToInsert: ShowToInsert[] = []
        const fallbackMetaToSave: { id: string; thumbnail?: string; type?: string }[] = []
        const metaPromises: Promise<void>[] = []

        batchResults.forEach((r, idx) => {
          const item = batch[idx]
          const malTitle = item.series_title[0]
          const currentIdx = offlineMatchedCount + i + idx + 1
          const malIdStr = item.series_animedb_id?.[0]
          const malId = malIdStr ? parseInt(malIdStr, 10) : null

          if (r.status === 'fulfilled' && r.value) {
            const show = r.value
            const title = show.title?.english || show.title?.romaji || malTitle
            const status = mapMalStatus(item.my_status[0])
            const showId = String(show.id)

            const watchedEpisodes = parseInt(item.my_watched_episodes?.[0] || '0', 10) || 0
            const totalEpisodes = parseInt(item.series_episodes?.[0] || '0', 10) || 0
            const score = parseFloat(item.my_score?.[0] || '0') || null
            const startDate = parseMalDate(item.my_start_date?.[0])
            const finishDate = parseMalDate(item.my_finish_date?.[0])

            fallbackShowsToInsert.push({
              id: showId,
              name: title,
              status,
              watchedEpisodes,
              totalEpisodes,
              startDate,
              finishDate,
              score,
            })
            fallbackImportedCount++

            // Check Shoko artwork override first
            const anidbId = animeIdMapper.getAnidbIdByAnilist(show.id)
            const shokoPoster =
              (malId ? shokoArtworkByMal.get(malId) : null) ||
              (anidbId ? shokoArtworkByAnidb.get(anidbId) : null)

            if (shokoPoster) {
              fallbackMetaToSave.push({
                id: showId,
                thumbnail: shokoPoster,
              })
            } else {
              metaPromises.push(
                getShowMetaById(showId)
                  .then((meta) => {
                    if (meta) {
                      fallbackMetaToSave.push({
                        id: showId,
                        thumbnail: meta.thumbnail || undefined,
                        type: meta.type || undefined,
                      })
                    }
                  })
                  .catch(() => {})
              )
            }

            activeImportStatus = {
              ...activeImportStatus,
              current: currentIdx,
              title: malTitle,
              matchedTitle: title,
              status,
              source: show.source,
              found: true,
              imported: offlineMatchedCount + fallbackImportedCount,
            }

            sendEvent('progress', {
              current: currentIdx,
              total,
              title: malTitle,
              matchedTitle: title,
              status,
              source: show.source,
              found: true,
            })
          } else {
            skippedCount++
            activeImportStatus = {
              ...activeImportStatus,
              current: currentIdx,
              title: malTitle,
              matchedTitle: null,
              status: mapMalStatus(item.my_status[0]),
              source: null,
              found: false,
              skipped: skippedCount,
            }

            sendEvent('progress', {
              current: currentIdx,
              total,
              title: malTitle,
              matchedTitle: null,
              status: mapMalStatus(item.my_status[0]),
              source: null,
              found: false,
            })
          }
        })

        await Promise.allSettled(metaPromises)

        // Attach resolved thumbnails and types to fallbackShowsToInsert
        const metaMap = new Map(fallbackMetaToSave.map((m) => [m.id, m]))
        for (const show of fallbackShowsToInsert) {
          const meta = metaMap.get(show.id)
          if (meta?.thumbnail) {
            show.thumbnail = meta.thumbnail
          }
          if (meta?.type && !show.type) {
            show.type = meta.type
          }
        }

        // Commit each fallback batch into SQLite immediately
        if (fallbackShowsToInsert.length > 0) {
          try {
            await performWriteTransaction(req.db, (tx) => {
              SettingsRepository.upsertWatchlistBatch(tx, fallbackShowsToInsert)
              for (const meta of fallbackMetaToSave) {
                if (meta.thumbnail) {
                  ShowsMetaRepository.upsert(tx, {
                    id: meta.id,
                    thumbnail: meta.thumbnail,
                    type: meta.type,
                  })
                }
              }
            })
          } catch (dbErr) {
            logger.error({ err: dbErr }, 'Failed to commit fallback batch to SQLite')
          }
        }
      }
    }

    const totalImported = offlineMatchedCount + fallbackImportedCount
    sendEvent('complete', { imported: totalImported, skipped: skippedCount })

    activeImportStatus = {
      running: false,
      current: total,
      total,
      imported: totalImported,
      skipped: skippedCount,
      phase: 'done',
    }
    if (activeImportAbortController === abortController) {
      activeImportAbortController = null
    }

    res.end()
  }

  getInstallationId = (_req: Request, res: Response) => {
    try {
      res.json({ id: getMachineId() })
    } catch (err) {
      logger.error({ err }, 'Failed to get machine ID')
      res.status(500).json({ error: 'Failed to get machine ID' })
    }
  }

  getOfflineDbInfo = (req: Request, res: Response) => {
    try {
      const info = animeIdMapper.getOfflineDbInfo(req.db)
      res.json(info)
    } catch (err) {
      logger.error({ err }, 'Failed to get offline DB info')
      res.status(500).json({ error: 'Failed to get offline DB info' })
    }
  }

  updateOfflineDb = async (req: Request, res: Response) => {
    try {
      if (animeIdMapper.getMappingCount().isRefreshing) {
        return res.status(409).json({ error: 'Offline database update already in progress' })
      }
      animeIdMapper.refreshDatabase(req.db).catch((err) => {
        logger.error({ err }, 'Manual offline database refresh failed')
      })
      res.json({ message: 'Offline database refresh started' })
    } catch (err) {
      logger.error({ err }, 'Failed to start offline database refresh')
      res.status(500).json({ error: 'Failed to start offline database refresh' })
    }
  }

  setAutoUpdateOfflineDb = (req: Request, res: Response) => {
    try {
      const { enabled } = req.body
      SettingsRepository.upsert(req.db, 'offlineDbAutoUpdateEnabled', enabled ? 'true' : 'false')
      res.json({ success: true, enabled: !!enabled })
    } catch (err) {
      logger.error({ err }, 'Failed to update auto-update setting')
      res.status(500).json({ error: 'Failed to update auto-update setting' })
    }
  }
}
