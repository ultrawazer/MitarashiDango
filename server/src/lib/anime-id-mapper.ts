import axios from 'axios'
import { DatabaseWrapper } from '../db'
import logger from '../logger'
import { SettingsRepository } from '../repositories/settings.repository'
import { genres as canonicalGenres } from '../constants.json'

const log = logger.child({ module: 'AnimeIdMapper' })

const canonicalGenreMap = new Map<string, string>(
  canonicalGenres.map((g: string) => [g.toLowerCase(), g])
)

const OFFLINE_DB_URLS = [
  'https://github.com/cedya77/anime-offline-database/releases/latest/download/anime-offline-database-minified.json',
  'https://raw.githubusercontent.com/cedya77/anime-offline-database/master/anime-offline-database-minified.json',
  'https://github.com/manami-project/anime-offline-database/releases/latest/download/anime-offline-database-minified.json',
  'https://raw.githubusercontent.com/manami-project/anime-offline-database/master/anime-offline-database-minified.json',
]

export interface AnimeMapping {
  anidbId: number
  anilistId: number | null
  title: string
  thumbnail?: string
}

export interface AnimeEntryMapping {
  anilistId: number
  anidbId?: number
  malId?: number
  title: string
  thumbnail?: string
  type?: string
  genres?: string
}

export interface OfflineDbInfo {
  totalMapped: number
  totalMalMapped: number
  isInitialized: boolean
  isRefreshing: boolean
  autoUpdateEnabled: boolean
  lastCheckedAt: string | null
  lastUpdatedAt: string | null
  lastStatus: 'idle' | 'updating' | 'success' | 'failed'
  lastMessage: string | null
}

export class AnimeIdMapper {
  private anidbToAnilist = new Map<number, number>()
  private anilistToAnidb = new Map<number, number>()
  private malToEntry = new Map<number, AnimeEntryMapping>()
  private anilistToMal = new Map<number, number>()
  private isInitialized = false
  private isRefreshing = false

  public async init(db: DatabaseWrapper): Promise<void> {
    try {
      this.ensureTable(db)
      this.loadCache(db)

      const anidbCount = this.anidbToAnilist.size
      const malCount = this.malToEntry.size
      log.info(`AnimeIdMapper loaded ${anidbCount} AniDB and ${malCount} MAL mappings from SQLite`)

      // Backfill any shows in shows_meta that lack genres
      this.backfillShowsMetaGenres(db)

      const hasGenresRow = db.get<{ count: number }>(
        "SELECT count(*) as count FROM anime_id_map WHERE genres IS NOT NULL AND genres != '[]'"
      )
      const hasGenresCount = hasGenresRow?.count ?? 0

      // If empty, trigger background initial download
      if (anidbCount === 0 && malCount === 0) {
        log.info('AnimeIdMapper cache is empty. Initiating background download...')
        this.refreshDatabase(db).catch((err) => {
          log.warn({ err: err?.message }, 'Background anime database initial download failed')
        })
      } else if (malCount === 0 || hasGenresCount === 0) {
        log.info('AnimeIdMapper lacks MAL mappings or genres. Initiating background update...')
        this.refreshDatabase(db).catch((err) => {
          log.warn({ err: err?.message }, 'Background anime database upgrade failed')
        })
      }

      this.isInitialized = true
    } catch (e) {
      log.error({ err: e }, 'Failed to initialize AnimeIdMapper')
    }
  }

  public backfillShowsMetaGenres(db: DatabaseWrapper): number {
    try {
      this.ensureTable(db)
      db.run(`
        UPDATE shows_meta
        SET genres = (
          SELECT genres FROM anime_id_map
          WHERE anilist_id = CAST(shows_meta.id AS INTEGER)
            AND genres IS NOT NULL AND genres != '[]'
          LIMIT 1
        )
        WHERE (genres IS NULL OR genres = '' OR genres = '[]')
          AND EXISTS (
            SELECT 1 FROM anime_id_map
            WHERE anilist_id = CAST(shows_meta.id AS INTEGER)
              AND genres IS NOT NULL AND genres != '[]'
          )
      `)
      log.info('Backfilled genres in shows_meta from anime_id_map')
      return 1
    } catch (err) {
      log.warn({ err }, 'Failed to backfill shows_meta genres from anime_id_map')
      return 0
    }
  }

  private ensureTable(db: DatabaseWrapper): void {
    const tableExists = db.get<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='anime_id_map'"
    )
    if (tableExists) {
      const columns = db.all<{ name: string }>('PRAGMA table_info(anime_id_map)')
      const hasMalId = columns.some((c) => c.name === 'mal_id')
      if (!hasMalId) {
        try {
          db.run('ALTER TABLE anime_id_map ADD COLUMN mal_id INTEGER')
        } catch (e) {
          log.warn({ err: e }, 'Could not add mal_id column to anime_id_map')
        }
      }
      const hasType = columns.some((c) => c.name === 'type')
      if (!hasType) {
        try {
          db.run('ALTER TABLE anime_id_map ADD COLUMN type TEXT')
        } catch (e) {
          log.warn({ err: e }, 'Could not add type column to anime_id_map')
        }
      }
      const hasGenres = columns.some((c) => c.name === 'genres')
      if (!hasGenres) {
        try {
          db.run('ALTER TABLE anime_id_map ADD COLUMN genres TEXT')
        } catch (e) {
          log.warn({ err: e }, 'Could not add genres column to anime_id_map')
        }
      }
    } else {
      db.run(`
        CREATE TABLE IF NOT EXISTS anime_id_map (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          anidb_id INTEGER,
          anilist_id INTEGER,
          mal_id INTEGER,
          title TEXT,
          thumbnail TEXT,
          type TEXT,
          genres TEXT
        )
      `)
    }
    db.run(`CREATE INDEX IF NOT EXISTS idx_anime_id_map_anidb ON anime_id_map(anidb_id)`)
    db.run(`CREATE INDEX IF NOT EXISTS idx_anime_id_map_anilist ON anime_id_map(anilist_id)`)
    db.run(`CREATE INDEX IF NOT EXISTS idx_anime_id_map_mal ON anime_id_map(mal_id)`)
    db.run(`CREATE INDEX IF NOT EXISTS idx_anime_id_map_title ON anime_id_map(title)`)
  }

  private loadCache(db: DatabaseWrapper): void {
    try {
      this.ensureTable(db)
      const rows = db.all<{
        anidb_id: number | null
        anilist_id: number | null
        mal_id: number | null
        title: string | null
        thumbnail: string | null
        type: string | null
        genres: string | null
      }>(
        'SELECT anidb_id, anilist_id, mal_id, title, thumbnail, type, genres FROM anime_id_map WHERE anilist_id IS NOT NULL'
      )
      this.anidbToAnilist.clear()
      this.anilistToAnidb.clear()
      this.malToEntry.clear()
      this.anilistToMal.clear()

      for (const row of rows) {
        if (row.anilist_id) {
          if (row.anidb_id) {
            this.anidbToAnilist.set(row.anidb_id, row.anilist_id)
            this.anilistToAnidb.set(row.anilist_id, row.anidb_id)
          }
          if (row.mal_id) {
            this.malToEntry.set(row.mal_id, {
              anilistId: row.anilist_id,
              anidbId: row.anidb_id || undefined,
              malId: row.mal_id,
              title: row.title || '',
              thumbnail: row.thumbnail || undefined,
              type: row.type || undefined,
              genres: row.genres || undefined,
            })
            this.anilistToMal.set(row.anilist_id, row.mal_id)
          }
        }
      }
    } catch (err) {
      log.error({ err }, 'Failed to load anime ID mappings into memory')
    }
  }

  public getAnilistIdByAnidb(anidbId: number): number | null {
    return this.anidbToAnilist.get(anidbId) ?? null
  }

  public getAnidbIdByAnilist(anilistId: number): number | null {
    return this.anilistToAnidb.get(anilistId) ?? null
  }

  public getByMalId(malId: number): AnimeEntryMapping | null {
    return this.malToEntry.get(malId) ?? null
  }

  public getAnilistIdByMal(malId: number): number | null {
    return this.malToEntry.get(malId)?.anilistId ?? null
  }

  public getMalIdByAnilist(anilistId: number): number | null {
    return this.anilistToMal.get(anilistId) ?? null
  }

  public getMappingCount(): {
    totalMapped: number
    totalMalMapped: number
    isInitialized: boolean
    isRefreshing: boolean
  } {
    return {
      totalMapped: this.anidbToAnilist.size,
      totalMalMapped: this.malToEntry.size,
      isInitialized: this.isInitialized,
      isRefreshing: this.isRefreshing,
    }
  }

  public getOfflineDbInfo(db: DatabaseWrapper): OfflineDbInfo {
    const autoUpdateSetting = SettingsRepository.getByKey(db, 'offlineDbAutoUpdateEnabled')
    const lastChecked = SettingsRepository.getByKey(db, 'offlineDbLastCheckedAt')
    const lastUpdated = SettingsRepository.getByKey(db, 'offlineDbLastUpdatedAt')
    const lastStatus = SettingsRepository.getByKey(db, 'offlineDbLastStatus')
    const lastMessage = SettingsRepository.getByKey(db, 'offlineDbLastMessage')

    return {
      totalMapped: this.anidbToAnilist.size,
      totalMalMapped: this.malToEntry.size,
      isInitialized: this.isInitialized,
      isRefreshing: this.isRefreshing,
      autoUpdateEnabled: autoUpdateSetting ? autoUpdateSetting.value !== 'false' : true,
      lastCheckedAt: lastChecked?.value ?? null,
      lastUpdatedAt: lastUpdated?.value ?? null,
      lastStatus: (lastStatus?.value as OfflineDbInfo['lastStatus']) || (this.isRefreshing ? 'updating' : 'idle'),
      lastMessage: lastMessage?.value ?? null,
    }
  }

  public checkWeeklyUpdateDue(db: DatabaseWrapper): boolean {
    const autoUpdateSetting = SettingsRepository.getByKey(db, 'offlineDbAutoUpdateEnabled')
    const isEnabled = autoUpdateSetting ? autoUpdateSetting.value !== 'false' : true
    if (!isEnabled) {
      return false
    }

    // Determine the most recent Saturday 00:00:00 UTC
    const now = new Date()
    const day = now.getUTCDay() // 0 is Sunday, 6 is Saturday
    const daysSinceSaturday = (day + 1) % 7
    const latestSaturday = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - daysSinceSaturday,
        0,
        0,
        0,
        0
      )
    )

    const lastCheckedRecord = SettingsRepository.getByKey(db, 'offlineDbLastCheckedAt')
    if (!lastCheckedRecord?.value) {
      return true
    }

    const lastCheckedTime = new Date(lastCheckedRecord.value).getTime()
    if (isNaN(lastCheckedTime)) {
      return true
    }

    return lastCheckedTime < latestSaturday.getTime()
  }

  public async executeScheduledUpdate(db: DatabaseWrapper): Promise<void> {
    if (this.isRefreshing) {
      log.info('Scheduled offline database update skipped: refresh already in progress')
      return
    }
    log.info('Starting scheduled weekly offline database update...')
    const result = await this.refreshDatabase(db)
    if (result.success) {
      log.info(`Scheduled offline database update succeeded: ${result.count} entries`)
    } else {
      log.warn(`Scheduled offline database update failed: ${result.error}`)
    }
  }

  public async refreshDatabase(
    db: DatabaseWrapper
  ): Promise<{ success: boolean; count: number; error?: string }> {
    if (this.isRefreshing) {
      return { success: false, count: this.anidbToAnilist.size, error: 'Refresh already in progress' }
    }

    this.isRefreshing = true
    const nowIso = new Date().toISOString()
    SettingsRepository.upsert(db, 'offlineDbLastStatus', 'updating')
    SettingsRepository.upsert(db, 'offlineDbLastCheckedAt', nowIso)
    SettingsRepository.upsert(db, 'offlineDbLastMessage', 'Downloading and parsing database...')

    try {
      let data: any = null
      let lastErr: Error | null = null

      for (const url of OFFLINE_DB_URLS) {
        try {
          log.info(`Fetching anime-offline-database from ${url}...`)
          const response = await axios.get(url, {
            timeout: 60000,
            responseType: 'json',
            maxContentLength: 100 * 1024 * 1024,
            headers: {
              'User-Agent': 'Dango-Media-Client/1.0',
            },
          })
          if (response.data && Array.isArray(response.data.data)) {
            data = response.data.data
            break
          }
        } catch (err) {
          lastErr = err as Error
          log.warn(`Failed downloading from ${url}: ${(err as Error).message}`)
        }
      }

      if (!data) {
        throw lastErr || new Error('Could not download anime-offline-database from any source')
      }

      log.info(`Parsing ${data.length} entries from anime-offline-database...`)

      const anidbRegex = /anidb\.net\/anime\/(\d+)/i
      const anilistRegex = /anilist\.co\/anime\/(\d+)/i
      const malRegex = /myanimelist\.net\/anime\/(\d+)/i

      const parsedEntries: {
        anidbId: number | null
        anilistId: number | null
        malId: number | null
        title: string
        thumbnail?: string
        type?: string
        genres?: string
      }[] = []

      for (const item of data) {
        if (!item.sources || !Array.isArray(item.sources)) continue

        let anidbId: number | null = null
        let anilistId: number | null = null
        let malId: number | null = null

        for (const src of item.sources) {
          if (typeof src !== 'string') continue
          const anidbMatch = src.match(anidbRegex)
          if (anidbMatch) anidbId = parseInt(anidbMatch[1], 10)

          const anilistMatch = src.match(anilistRegex)
          if (anilistMatch) anilistId = parseInt(anilistMatch[1], 10)

          const malMatch = src.match(malRegex)
          if (malMatch) malId = parseInt(malMatch[1], 10)
        }

        let thumbnail = item.thumbnail || item.picture || ''
        if (thumbnail && thumbnail.includes('cdn.myanimelist.net/images/anime/')) {
          thumbnail = thumbnail.replace(/t\.(jpe?g|png|webp)$/i, 'l.$1')
        }

        let genres: string[] | null = null
        if (item.tags && Array.isArray(item.tags)) {
          const matched = new Set<string>()
          for (const tag of item.tags) {
            if (typeof tag !== 'string') continue
            const clean = tag.trim().toLowerCase()
            if (canonicalGenreMap.has(clean)) {
              matched.add(canonicalGenreMap.get(clean)!)
            }
          }
          if (matched.size > 0) {
            genres = Array.from(matched)
          }
        }

        // Include entry if anilistId is present along with anidbId or malId
        if (anilistId && (anidbId || malId)) {
          parsedEntries.push({
            anidbId,
            anilistId,
            malId,
            title: item.title || '',
            thumbnail,
            type: item.type || undefined,
            genres: genres ? JSON.stringify(genres) : undefined,
          })
        }
      }

      log.info(`Found ${parsedEntries.length} mapped entries to save to SQLite...`)

      // Recreate table cleanly so we avoid legacy primary key constraints
      db.serialize(() => {
        db.run('DROP TABLE IF EXISTS anime_id_map')
        this.ensureTable(db)

        const stmt = db.prepare(
          'INSERT INTO anime_id_map (anidb_id, anilist_id, mal_id, title, thumbnail, type, genres) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )

        const CHUNK_SIZE = 500
        for (let i = 0; i < parsedEntries.length; i += CHUNK_SIZE) {
          const chunk = parsedEntries.slice(i, i + CHUNK_SIZE)
          for (const entry of chunk) {
            stmt.run(
              entry.anidbId,
              entry.anilistId,
              entry.malId,
              entry.title,
              entry.thumbnail || null,
              entry.type || null,
              entry.genres || null
            )
          }
        }
      })

      // Reload in-memory cache
      this.loadCache(db)
      const finalAnidb = this.anidbToAnilist.size
      const finalMal = this.malToEntry.size
      log.info(`AnimeIdMapper refresh completed. Loaded ${finalAnidb} AniDB and ${finalMal} MAL entries.`)

      // Backfill genres into shows_meta for all library shows
      this.backfillShowsMetaGenres(db)

      SettingsRepository.upsert(db, 'offlineDbLastStatus', 'success')
      SettingsRepository.upsert(db, 'offlineDbLastUpdatedAt', new Date().toISOString())
      SettingsRepository.upsert(
        db,
        'offlineDbLastMessage',
        `Successfully updated ${parsedEntries.length} entries (${finalAnidb} AniDB, ${finalMal} MAL).`
      )

      return { success: true, count: parsedEntries.length }
    } catch (err) {
      const errMsg = (err as Error).message || 'Failed to refresh offline database'
      log.error({ err }, 'Failed to refresh anime-offline-database')
      SettingsRepository.upsert(db, 'offlineDbLastStatus', 'failed')
      SettingsRepository.upsert(db, 'offlineDbLastMessage', errMsg)
      return { success: false, count: this.anidbToAnilist.size, error: errMsg }
    } finally {
      this.isRefreshing = false
    }
  }
}

export const animeIdMapper = new AnimeIdMapper()
