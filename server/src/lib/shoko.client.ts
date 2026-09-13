import axios, { AxiosInstance } from 'axios'
import { CONFIG } from '../config'
import { DatabaseWrapper } from '../db'
import logger from '../logger'

const log = logger.child({ module: 'ShokoClient' })

export interface ShokoConfig {
  url: string
  port: number
  apiKey: string
}

export interface ShokoSeries {
  IDs: {
    ID: number
    ParentSection?: number
    ShokoGroup?: number
    AniDB?: number
    TvDB?: number[]
    TMDB?: { Movie?: number[]; Show?: number[] }
    MAL?: number[]
  }
  Name: string
  Size?: number
  Sizes?: {
    Normal?: number
    Special?: number
    Local?: {
      Normal?: number
      Special?: number
      Credits?: number
      Trailers?: number
      Parodies?: number
      Others?: number
    }
  }
  AniDB?: {
    ID: number
    Type: string
    EpisodeCount: number
    Title: string
    Titles?: { Language: string; Title: string; Type: string }[]
    Description?: string
    Restricted?: boolean
    Poster?: { ID: string; Source: string; Type: string }
    Rating?: {
      Value?: number
      MaxValue?: number
      Votes?: number
      Source?: string
    }
  }
  Images?: {
    Posters?: { ID: string | number; Source: string; Type: string; Preferred?: boolean }[]
    Fanarts?: { ID: string | number; Source: string; Type: string; Preferred?: boolean }[]
    Banners?: { ID: string | number; Source: string; Type: string; Preferred?: boolean }[]
    Backdrops?: { ID: string | number; Source: string; Type: string; Preferred?: boolean }[]
  }
  Description?: string
  YearlySeasons?: { Year: number; AnimeSeason: string }[]
}

export interface ShokoMediaStreamAudio {
  ID: number
  Title?: string
  Language?: string
  LanguageCode?: string
  Codec?: string
  Channels?: number
  Bitrate?: number
  Default?: boolean
}

export interface ShokoMediaStreamSubtitle {
  ID: number
  Title?: string
  Language?: string
  LanguageCode?: string
  Codec?: string
  Format?: string
  Default?: boolean
  Forced?: boolean
}

export interface ShokoMediaInfo {
  Title?: string
  Duration?: number
  Bitrate?: number
  FileExtension?: string
  Video?: any[]
  Audio?: any[]
  Subtitles?: any[]
  MediaStreams?: {
    Video?: any[]
    Audio?: ShokoMediaStreamAudio[]
    Subtitles?: ShokoMediaStreamSubtitle[]
  }
}

export interface ShokoFile {
  ID: number
  Size: number
  Hashes?: {
    ED2K?: string
    SHA1?: string
    CRC32?: string
    MD5?: string
  }
  Locations?: {
    ImportFolderID: number
    RelativePath: string
    AbsolutePath?: string
  }[]
  MediaInfo?: ShokoMediaInfo
  SeriesIDs?: { SeriesID: { ID: number }; EpisodeIDs: { ID: number }[] }[]
}

export interface ShokoEpisode {
  IDs: {
    ID: number
    ParentSeries: number
    AniDB?: number
    TvDB?: number[]
  }
  Name: string
  Duration?: number
  Type?: 'Normal' | 'Special' | 'ThemeSong' | 'Trailer' | 'Parody' | 'Other'
  Number?: number
  EpisodeNumber?: number
  AniDB?: {
    ID: number
    Type: string
    EpisodeNumber: number
    AirDate?: string
    Title: string
    Description?: string
    Rating?: { Value: number; Votes: number }
  }
  Size?: number
  UserData?: {
    Watched?: string | boolean | null
    WatchedDate?: string | null
    LastWatchedAt?: string | null
  }
  Files?: ShokoFile[]
  Images?: {
    Thumbnails?: { ID: string; Source: string; Type: string }[]
  }
}

export class ShokoClient {
  private customConfig: Partial<ShokoConfig> | null = null
  private db: DatabaseWrapper | null = null

  // Pre-built AniDB ID → Shoko Series ID map for O(1) lookups
  private anidbToShokoMap = new Map<number, number>()
  // Negative cache: AniDB IDs confirmed not in Shoko (cleared hourly)
  private anidbNegativeCache = new Set<number>()
  private negativeCacheInterval: ReturnType<typeof setInterval> | null = null

  public init(db: DatabaseWrapper): void {
    this.db = db
    this.loadConfigFromDb(db)

    // Clear negative cache every hour
    if (this.negativeCacheInterval) clearInterval(this.negativeCacheInterval)
    this.negativeCacheInterval = setInterval(() => {
      this.anidbNegativeCache.clear()
    }, 60 * 60 * 1000)
  }

  public setDb(db: DatabaseWrapper): void {
    this.db = db
    this.loadConfigFromDb(db)
  }

  public loadConfigFromDb(db?: DatabaseWrapper): void {
    const targetDb = db || this.db
    if (!targetDb) return
    try {
      const urlRow = targetDb.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['shoko_url'])
      const portRow = targetDb.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['shoko_port'])
      const keyRow = targetDb.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['shoko_api_key'])

      this.customConfig = {
        url: urlRow?.value || this.customConfig?.url,
        port: portRow?.value ? parseInt(portRow.value, 10) : this.customConfig?.port,
        apiKey: keyRow?.value || this.customConfig?.apiKey,
      }
    } catch {
      // use defaults
    }
  }

  public setRuntimeConfig(config: Partial<ShokoConfig>): void {
    this.customConfig = { ...this.customConfig, ...config }
  }

  public getEffectiveConfig(db?: DatabaseWrapper): ShokoConfig {
    const targetDb = db || this.db
    let url = this.customConfig?.url || CONFIG.SHOKO_URL || 'http://localhost'
    let port = this.customConfig?.port || CONFIG.SHOKO_PORT || 8111
    let apiKey = this.customConfig?.apiKey || CONFIG.SHOKO_API_KEY || ''

    if (targetDb) {
      try {
        const urlRow = targetDb.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['shoko_url'])
        if (urlRow?.value) url = urlRow.value

        const portRow = targetDb.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['shoko_port'])
        if (portRow?.value) port = parseInt(portRow.value, 10) || port

        const keyRow = targetDb.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['shoko_api_key'])
        if (keyRow?.value) apiKey = keyRow.value
      } catch {
        // use defaults
      }
    }

    url = url.trim().replace(/\/+$/, '')
    return { url, port, apiKey }
  }

  private getClient(db?: DatabaseWrapper): { client: AxiosInstance; baseUrl: string; apiKey: string } {
    const config = this.getEffectiveConfig(db)
    const baseUrl = `${config.url}:${config.port}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    if (config.apiKey) {
      headers['apikey'] = config.apiKey
    }

    const client = axios.create({
      baseURL: baseUrl,
      headers,
      timeout: 15000,
    })

    return { client, baseUrl, apiKey: config.apiKey }
  }

  public async testConnection(
    overrideUrl?: string,
    overridePort?: number,
    overrideApiKey?: string
  ): Promise<{ success: boolean; version?: string; server?: string; error?: string }> {
    try {
      const url = (overrideUrl || this.customConfig?.url || CONFIG.SHOKO_URL || 'http://localhost')
        .trim()
        .replace(/\/+$/, '')
      const port = overridePort || this.customConfig?.port || CONFIG.SHOKO_PORT || 8111
      const apiKey = overrideApiKey !== undefined ? overrideApiKey : this.customConfig?.apiKey || CONFIG.SHOKO_API_KEY || ''

      const baseUrl = `${url}:${port}`
      const headers: Record<string, string> = {}
      if (apiKey) headers['apikey'] = apiKey

      const res = await axios.get(`${baseUrl}/api/v3/Init/Version`, {
        headers,
        timeout: 5000,
      })

      if (res.status >= 200 && res.status < 300) {
        const data = res.data
        const version = typeof data === 'string' ? data : data?.Server?.Version || data?.Version || JSON.stringify(data)
        return { success: true, version, server: 'Shoko Server' }
      }

      return { success: false, error: `Server responded with status ${res.status}` }
    } catch (err) {
      const msg = (err as Error).message || 'Connection failed'
      return { success: false, error: msg }
    }
  }

  public async signIn(
    url: string,
    port: number,
    user: string,
    pass: string
  ): Promise<{ success: boolean; apiKey?: string; error?: string }> {
    try {
      const cleanUrl = url.trim().replace(/\/+$/, '')
      const baseUrl = `${cleanUrl}:${port}`

      // Shoko Server authenticates at POST /api/auth with { user, pass, device }
      let res: any
      try {
        res = await axios.post(
          `${baseUrl}/api/auth`,
          {
            user: user,
            pass: pass,
            device: 'Dango',
          },
          {
            headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain' },
            timeout: 8000,
          }
        )
      } catch (err: any) {
        if (err?.response?.status === 404) {
          res = await axios.post(
            `${baseUrl}/api/v3/Auth/SignIn`,
            { User: user, Password: pass, Device: 'Dango' },
            { timeout: 8000 }
          )
        } else {
          throw err
        }
      }

      if (res && res.status >= 200 && res.status < 300) {
        const data = res.data
        const key =
          data?.apikey ||
          data?.apiKey ||
          data?.ApiKey ||
          data?.token ||
          data?.Token ||
          (typeof data === 'string' ? data.trim().replace(/^"|"$/g, '') : null)

        if (key) {
          return { success: true, apiKey: key }
        }
        return { success: false, error: 'No API key returned from Shoko Server' }
      }
      return { success: false, error: `Login failed: HTTP ${res?.status || 'unknown'}` }
    } catch (err: any) {
      const msg =
        err?.response?.data?.title ||
        err?.response?.data?.message ||
        (err?.response?.status === 401 ? 'Invalid Shoko username or password' : null) ||
        err?.message ||
        'Authentication failed'
      return { success: false, error: msg }
    }
  }

  public async getSeriesList(db?: DatabaseWrapper, page = 1, pageSize = 100): Promise<ShokoSeries[]> {
    try {
      const { client } = this.getClient(db)
      const res = await client.get('/api/v3/Series', {
        params: {
          page,
          pageSize: Math.min(pageSize, 100),
          includeDataFrom: 'AniDB,TvDB',
        },
      })
      const data = res.data
      if (Array.isArray(data)) return data
      if (Array.isArray(data?.List)) return data.List
      return []
    } catch (err) {
      log.error({ err }, 'Failed to fetch Shoko series list')
      return []
    }
  }

  public async searchSeries(
    query: string,
    db?: DatabaseWrapper,
    fuzzy = true,
    limit = 50
  ): Promise<ShokoSeries[]> {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) {
      return this.getSeriesList(db, 1, limit)
    }

    try {
      const { client } = this.getClient(db)
      const res = await client.get('/api/v3/Series/Search', {
        params: {
          query: trimmed,
          fuzzy,
          limit,
          includeDataFrom: 'AniDB,TvDB',
        },
      })
      const data = res.data
      let rawList: any[] = []
      if (Array.isArray(data)) {
        rawList = data
      } else if (Array.isArray(data?.List)) {
        rawList = data.List
      }

      if (rawList.length > 0) {
        return rawList.map((item: any) => item.Series || item)
      }
    } catch (err) {
      log.warn(
        { err: (err as Error).message },
        'Shoko /api/v3/Series/Search failed, falling back to local list filtering'
      )
    }

    // Fallback: Fetch series list from Shoko and filter locally
    try {
      const allSeries = await this.getSeriesList(db, 1, 100)
      return allSeries.filter((s) => {
        const nameMatch = s.Name?.toLowerCase().includes(trimmed)
        const anidbTitleMatch = s.AniDB?.Title?.toLowerCase().includes(trimmed)
        const altTitlesMatch = s.AniDB?.Titles?.some((t) =>
          t.Title?.toLowerCase().includes(trimmed)
        )
        const anidbIdMatch = s.IDs?.AniDB ? String(s.IDs.AniDB) === trimmed : false
        return nameMatch || anidbTitleMatch || altTitlesMatch || anidbIdMatch
      })
    } catch (fallbackErr) {
      log.error({ err: fallbackErr }, 'Failed fallback local series search')
      return []
    }
  }

  public async getSeriesById(seriesId: number, db?: DatabaseWrapper): Promise<ShokoSeries | null> {
    try {
      const { client } = this.getClient(db)
      const res = await client.get(`/api/v3/Series/${seriesId}`, {
        params: { includeDataFrom: 'AniDB,TvDB' },
      })
      return res.data || null
    } catch (err) {
      log.error({ err, seriesId }, 'Failed to fetch Shoko series by ID')
      return null
    }
  }
  /**
   * Pre-build AniDB ID → Shoko Series ID map by paginating through all Shoko series.
   * Called on server boot and periodically (every 60 minutes).
   */
  public async buildAnidbIdMap(db?: DatabaseWrapper): Promise<void> {
    try {
      const { client } = this.getClient(db)
      const newMap = new Map<number, number>()
      let page = 1
      const pageSize = 100
      let hasMore = true

      while (hasMore) {
        const res = await client.get('/api/v3/Series', {
          params: {
            page,
            pageSize,
            includeDataFrom: 'AniDB',
          },
        })

        const data = res.data
        const list: ShokoSeries[] = Array.isArray(data) ? data : data?.List || []

        for (const s of list) {
          const anidbId = s.IDs?.AniDB || s.AniDB?.ID
          if (anidbId && s.IDs?.ID) {
            newMap.set(anidbId, s.IDs.ID)
          }
        }

        hasMore = list.length === pageSize
        page++
      }

      this.anidbToShokoMap = newMap
      log.info({ count: newMap.size }, 'Built AniDB → Shoko ID map')
    } catch (err) {
      log.error({ err }, 'Failed to build AniDB → Shoko ID map')
    }
  }

  public async getSeriesByAnidbId(anidbId: number, db?: DatabaseWrapper): Promise<ShokoSeries | null> {
    try {
      // 1. Check negative cache — skip if we know this AniDB ID is not in Shoko
      if (this.anidbNegativeCache.has(anidbId)) {
        return null
      }

      // 2. O(1) in-memory map lookup
      const cachedShokoId = this.anidbToShokoMap.get(anidbId)
      if (cachedShokoId) {
        return await this.getSeriesById(cachedShokoId, db)
      }

      // 3. Direct Shoko API lookup (for shows added after last map build)
      const { client } = this.getClient(db)
      try {
        const directRes = await client.get(`/api/v3/Series/AniDB/${anidbId}`)
        if (directRes.data?.ShokoID) {
          // Add to map for future lookups
          this.anidbToShokoMap.set(anidbId, directRes.data.ShokoID)
          return await this.getSeriesById(directRes.data.ShokoID, db)
        }
      } catch (directErr: any) {
        if (directErr?.response?.status === 404) {
          // Confirmed not in Shoko — cache the negative result
          this.anidbNegativeCache.add(anidbId)
          return null
        }
        log.warn({ err: directErr?.message, anidbId }, 'Direct Shoko AniDB series lookup failed')
      }

      // Not found via any method
      this.anidbNegativeCache.add(anidbId)
      return null
    } catch (err) {
      log.error({ err, anidbId }, 'Failed to find Shoko series by AniDB ID')
      return null
    }
  }

  public async getSeriesEpisodes(seriesId: number, db?: DatabaseWrapper): Promise<ShokoEpisode[]> {
    try {
      const { client } = this.getClient(db)
      const res = await client.get(`/api/v3/Series/${seriesId}/Episode`, {
        params: {
          includeDataFrom: 'AniDB,TvDB',
          includeFiles: true,
          includeMediaInfo: true,
          pageSize: 100,
        },
      })
      const data = res.data
      if (Array.isArray(data)) return data
      if (Array.isArray(data?.List)) return data.List
      return []
    } catch (err) {
      log.error({ err, seriesId }, 'Failed to fetch Shoko series episodes')
      return []
    }
  }

  public async getEpisode(episodeId: number, db?: DatabaseWrapper): Promise<ShokoEpisode | null> {
    try {
      const { client } = this.getClient(db)
      const res = await client.get(`/api/v3/Episode/${episodeId}`, {
        params: {
          includeFiles: true,
          includeMediaInfo: true,
        },
      })
      return res.data || null
    } catch (err) {
      log.error({ err, episodeId }, 'Failed to fetch Shoko episode')
      return null
    }
  }

  public async getEpisodeFiles(episodeId: number, db?: DatabaseWrapper): Promise<ShokoFile[]> {
    try {
      const { client } = this.getClient(db)
      const res = await client.get(`/api/v3/Episode/${episodeId}/File`, {
        params: { includeMediaInfo: true },
      })
      const data = res.data
      if (Array.isArray(data)) return data
      if (Array.isArray(data?.List)) return data.List
      return []
    } catch (err) {
      log.error({ err, episodeId }, 'Failed to fetch files for Shoko episode')
      return []
    }
  }

  public async getFile(fileId: number, db?: DatabaseWrapper): Promise<ShokoFile | null> {
    try {
      const { client } = this.getClient(db)
      const res = await client.get(`/api/v3/File/${fileId}`, {
        params: { include: 'MediaInfo' },
      })
      const file = res.data || null
      if (file && (!file.MediaInfo || !file.MediaInfo.Subtitles)) {
        try {
          const miRes = await client.get(`/api/v3/File/${fileId}/MediaInfo`)
          if (miRes.data) {
            file.MediaInfo = miRes.data
          }
        } catch {
          // MediaInfo optional
        }
      }
      return file
    } catch (err) {
      log.error({ err, fileId }, 'Failed to fetch Shoko file')
      return null
    }
  }

  public getVfsStreamUrl(fileId: number, db?: DatabaseWrapper): string {
    const { baseUrl, apiKey } = this.getClient(db)
    const keyParam = apiKey ? `?apikey=${encodeURIComponent(apiKey)}` : ''
    return `${baseUrl}/api/v3/File/${fileId}/Stream${keyParam}`
  }

  public getImageUrl(sourceOrGuid: string, type?: string, value?: number | string, db?: DatabaseWrapper): string {
    const { baseUrl, apiKey } = this.getClient(db)
    const keyParam = apiKey ? `?apikey=${encodeURIComponent(apiKey)}` : ''
    if (type && value !== undefined) {
      return `${baseUrl}/api/v3/Image/${sourceOrGuid}/${type}/${value}${keyParam}`
    }
    return `${baseUrl}/api/v3/Image/${sourceOrGuid}${keyParam}`
  }

  public async getImageStream(
    sourceOrGuid: string,
    type?: string,
    value?: number | string,
    db?: DatabaseWrapper
  ): Promise<{ data: NodeJS.ReadableStream; contentType?: string }> {
    const { baseUrl, apiKey } = this.getClient(db)
    const headers: Record<string, string> = {}
    if (apiKey) headers['apikey'] = apiKey

    const path =
      type && value !== undefined
        ? `/api/v3/Image/${sourceOrGuid}/${type}/${value}`
        : `/api/v3/Image/${sourceOrGuid}`

    const res = await axios.get(`${baseUrl}${path}`, {
      headers,
      responseType: 'stream',
      timeout: 10000,
    })

    return {
      data: res.data,
      contentType: (res.headers['content-type'] as string) || undefined,
    }
  }

  public async updateEpisodeUserData(
    episodeId: number,
    watched: boolean,
    db?: DatabaseWrapper
  ): Promise<boolean> {
    try {
      const { client } = this.getClient(db)
      // Try PUT /api/v3/Episode/{id}/UserData
      try {
        await client.put(`/api/v3/Episode/${episodeId}/UserData`, {
          Watched: watched,
          WatchedDate: watched ? new Date().toISOString() : null,
        })
        log.info(`Updated Shoko episode ${episodeId} watch status: ${watched}`)
        return true
      } catch (err) {
        // Fallback to /api/v3/Episode/{id}/Watched/{watched}
        await client.post(`/api/v3/Episode/${episodeId}/Watched/${watched}`)
        log.info(`Updated Shoko episode ${episodeId} watch status via fallback: ${watched}`)
        return true
      }
    } catch (err) {
      log.error({ err, episodeId, watched }, 'Failed to update Shoko episode watch status')
      return false
    }
  }

  public async getRecentFiles(db?: DatabaseWrapper, pageSize = 20): Promise<ShokoFile[]> {
    try {
      const { client } = this.getClient(db)
      const res = await client.get('/api/v3/File/Recent', {
        params: { pageSize, includeMediaInfo: true },
      })
      const data = res.data
      if (Array.isArray(data)) return data
      if (Array.isArray(data?.List)) return data.List
      return []
    } catch (err) {
      log.error({ err }, 'Failed to fetch recent files from Shoko')
      return []
    }
  }

  public async getRecentlyAddedEpisodes(pageSize = 30, db?: DatabaseWrapper): Promise<ShokoDashboardEpisode[]> {
    try {
      const { client } = this.getClient(db)
      const res = await client.get('/api/v3/Dashboard/RecentlyAddedEpisodes', {
        params: { pageSize },
      })
      const data = res.data
      if (Array.isArray(data)) return data
      if (Array.isArray(data?.List)) return data.List
      return []
    } catch (err) {
      log.error({ err }, 'Failed to fetch recently added episodes from Shoko')
      return []
    }
  }

  public async getRecentlyAddedSeries(pageSize = 20, db?: DatabaseWrapper): Promise<ShokoSeries[]> {
    try {
      const { client } = this.getClient(db)
      const res = await client.get('/api/v3/Dashboard/RecentlyAddedSeries', {
        params: { pageSize },
      })
      const data = res.data
      if (Array.isArray(data)) return data
      if (Array.isArray(data?.List)) return data.List
      return []
    } catch (err) {
      log.error({ err }, 'Failed to fetch recently added series from Shoko')
      return []
    }
  }

  public async getCalendarEpisodes(startDate: string, endDate: string, db?: DatabaseWrapper): Promise<ShokoDashboardEpisode[]> {
    try {
      const { client } = this.getClient(db)
      const res = await client.get('/api/v3/Dashboard/CalendarEpisodes', {
        params: { startDate, endDate },
      })
      const data = res.data
      if (Array.isArray(data)) return data
      if (Array.isArray(data?.List)) return data.List
      return []
    } catch (err) {
      log.error({ err, startDate, endDate }, 'Failed to fetch calendar episodes from Shoko')
      return []
    }
  }

  public async getAniDbCalendar(numberOfDays = 7, showAll = false, db?: DatabaseWrapper): Promise<ShokoDashboardEpisode[]> {
    try {
      const { client } = this.getClient(db)
      const res = await client.get('/api/v3/Dashboard/AniDBCalendar', {
        params: { numberOfDays, showAll },
      })
      const data = res.data
      if (Array.isArray(data)) return data
      if (Array.isArray(data?.List)) return data.List
      return []
    } catch (err) {
      log.error({ err, numberOfDays, showAll }, 'Failed to fetch AniDB calendar from Shoko')
      return []
    }
  }

  private anidbCache = new Map<number, { data: any; expiry: number }>()

  public async getFilterSeries(filterId: number, pageSize = 50, db?: DatabaseWrapper): Promise<ShokoSeries[]> {
    try {
      const { client } = this.getClient(db)
      const res = await client.get(`/api/v3/Filter/${filterId}/Series`, {
        params: { pageSize: Math.min(pageSize, 100) },
      })
      const data = res.data
      if (Array.isArray(data)) return data
      if (Array.isArray(data?.List)) return data.List
      return []
    } catch (err) {
      log.error({ err, filterId }, 'Failed to fetch filter series from Shoko')
      return []
    }
  }

  public async getContinueWatchingEpisodes(pageSize = 20, db?: DatabaseWrapper): Promise<ShokoDashboardEpisode[]> {
    try {
      const { client } = this.getClient(db)
      const res = await client.get('/api/v3/Dashboard/ContinueWatchingEpisodes', {
        params: { pageSize: Math.min(pageSize, 100) },
      })
      const data = res.data
      if (Array.isArray(data)) return data
      if (Array.isArray(data?.List)) return data.List
      return []
    } catch (err) {
      log.error({ err }, 'Failed to fetch continue watching episodes from Shoko')
      return []
    }
  }

  public async getSeriesAniDb(seriesId: number, db?: DatabaseWrapper): Promise<any | null> {
    const cached = this.anidbCache.get(seriesId)
    if (cached && cached.expiry > Date.now()) {
      return cached.data
    }
    try {
      const { client } = this.getClient(db)
      const res = await client.get(`/api/v3/Series/${seriesId}/AniDB`)
      const data = res.data || null
      if (data) {
        this.anidbCache.set(seriesId, { data, expiry: Date.now() + 10 * 60 * 1000 })
      }
      return data
    } catch {
      return null
    }
  }
}

export interface ShokoDashboardEpisode {
  IDs?: {
    ID: number
    Series?: number
    ShokoFile?: number
    ShokoEpisode?: number
    ShokoSeries?: number
  }
  Title?: string
  SeriesTitle?: string
  Number?: number
  Type?: string
  AirDate?: string
  Duration?: string
  Watched?: boolean | string | null
  SeriesPoster?: {
    ID: number | string
    Type: string
    Source: string
  }
}

export const shokoClient = new ShokoClient()
