import { Request, Response } from 'express'
import axios from 'axios'
import { shokoClient, ShokoSeries } from '../lib/shoko.client'
import { transcoderService, HwAccelMode } from '../lib/transcoder.service'
import { animeIdMapper } from '../lib/anime-id-mapper'
import { SettingsRepository } from '../repositories/settings.repository'
import { WatchedEpisodesRepository } from '../repositories/watched-episodes.repository'
import logger from '../logger'

const log = logger.child({ module: 'LocalMediaController' })

export class LocalMediaController {
  public streamVideo = async (req: Request, res: Response): Promise<void> => {
    try {
      const paramFileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId
      const fileId = parseInt(paramFileId, 10)
      if (isNaN(fileId)) {
        res.status(400).send('Invalid fileId')
        return
      }

      const audioIndexStr = req.query.audioIndex as string | undefined
      const audioIndex = audioIndexStr !== undefined ? parseInt(audioIndexStr, 10) : undefined
      const transcodeVideo = req.query.transcode === 'true'
      const startTime = req.query.startTime ? parseFloat(req.query.startTime as string) : undefined

      const vfsUrl = shokoClient.getVfsStreamUrl(fileId, req.db)

      // Fetch hwaccel setting if present
      const hwSetting = await SettingsRepository.getByKey(req.db, 'hwaccel_mode')
      const hwAccel = (hwSetting?.value as HwAccelMode) || 'auto'

      // Check if transcoding/remuxing is requested
      const shouldRemux =
        audioIndex !== undefined ||
        transcodeVideo ||
        req.query.remux === 'true'

      if (shouldRemux && transcoderService.getCapabilities().hasFfmpeg) {
        log.info({ fileId, audioIndex, transcodeVideo, hwAccel }, 'Starting FFmpeg remux stream')

        const remux = transcoderService.streamRemux({
          inputUrl: vfsUrl,
          audioIndex,
          transcodeVideo,
          hwAccel,
          startTime,
        })

        if (!remux) {
          res.status(500).send('FFmpeg remux failed to initialize')
          return
        }

        res.setHeader('Content-Type', 'video/mp4')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')

        remux.stdout.pipe(res)

        req.on('close', () => {
          log.info({ fileId }, 'Client disconnected from remux stream, killing FFmpeg')
          remux.process.kill('SIGKILL')
        })

        return
      }

      // Direct VFS stream with HTTP 206 Partial Content (range seeking)
      const range = req.headers.range
      const headers: Record<string, string> = {}
      if (range) {
        headers['Range'] = range
      }

      const vfsRes = await axios.get(vfsUrl, {
        headers,
        responseType: 'stream',
        validateStatus: (s) => (s >= 200 && s < 300) || s === 206,
        timeout: 30000,
      })

      res.status(vfsRes.status)

      // Forward relevant headers for media streaming
      const forwardHeaders = [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'last-modified',
        'etag',
      ]

      for (const h of forwardHeaders) {
        const val = vfsRes.headers[h]
        if (typeof val === 'string' || typeof val === 'number') {
          res.setHeader(h, val)
        }
      }

      if (!res.getHeader('accept-ranges')) {
        res.setHeader('accept-ranges', 'bytes')
      }

      vfsRes.data.pipe(res)

      req.on('close', () => {
        if (typeof (vfsRes.data as any)?.destroy === 'function') {
          ;(vfsRes.data as any).destroy()
        }
      })
    } catch (err) {
      log.error({ err, fileId: req.params.fileId }, 'Failed to stream local video')
      if (!res.headersSent) {
        res.status(500).send('Video streaming error')
      }
    }
  }

  public streamSubtitle = async (req: Request, res: Response): Promise<void> => {
    try {
      const paramFileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId
      const paramTrackIndex = Array.isArray(req.params.trackIndex)
        ? req.params.trackIndex[0]
        : req.params.trackIndex

      const fileId = parseInt(paramFileId, 10)
      const trackIndex = parseInt(paramTrackIndex, 10)

      if (isNaN(fileId) || isNaN(trackIndex)) {
        res.status(400).send('Invalid fileId or trackIndex')
        return
      }

      const vfsUrl = shokoClient.getVfsStreamUrl(fileId, req.db)
      const subStream = transcoderService.extractSubtitle(vfsUrl, trackIndex)

      if (!subStream) {
        res.status(500).send('Subtitle extraction unavailable')
        return
      }

      res.setHeader('Content-Type', 'text/vtt; charset=utf-8')
      res.setHeader('Cache-Control', 'public, max-age=3600')
      subStream.pipe(res)

      req.on('close', () => {
        if (typeof (subStream as any)?.destroy === 'function') {
          ;(subStream as any).destroy()
        }
      })
    } catch (err) {
      log.error({ err }, 'Failed to stream subtitle')
      if (!res.headersSent) {
        res.status(500).send('Subtitle extraction error')
      }
    }
  }

  public proxyImage = async (req: Request, res: Response): Promise<void> => {
    try {
      const paramSource = Array.isArray(req.params.source) ? req.params.source[0] : req.params.source
      const paramType = Array.isArray(req.params.type) ? req.params.type[0] : req.params.type
      const paramId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
      const paramGuid = Array.isArray(req.params.imageGUID) ? req.params.imageGUID[0] : req.params.imageGUID

      let imgStream
      if (paramSource && paramType && paramId) {
        imgStream = await shokoClient.getImageStream(paramSource, paramType, paramId, req.db)
      } else if (paramGuid) {
        const parts = paramGuid.split('/')
        if (parts.length === 3) {
          imgStream = await shokoClient.getImageStream(parts[0], parts[1], parts[2], req.db)
        } else {
          imgStream = await shokoClient.getImageStream(paramGuid, undefined, undefined, req.db)
        }
      } else {
        res.status(400).send('Missing image identifier')
        return
      }

      if (imgStream.contentType) {
        res.setHeader('Content-Type', imgStream.contentType)
      } else {
        res.setHeader('Content-Type', 'image/jpeg')
      }
      res.setHeader('Cache-Control', 'public, max-age=86400') // 24 hours

      imgStream.data.pipe(res)
    } catch (err) {
      log.warn({ err: (err as Error).message, params: req.params }, 'Shoko image proxy failed')
      if (!res.headersSent) {
        res.status(404).send('Image not found')
      }
    }
  }

  public scrobble = async (req: Request, res: Response): Promise<void> => {
    try {
      const { episodeId, showId, episodeNumber, watched = true } = req.body

      let shokoEpId = episodeId ? parseInt(episodeId, 10) : undefined

      // If episodeId was not directly provided, try to resolve via showId + episodeNumber
      if (!shokoEpId && showId && episodeNumber) {
        let numericSeriesId: number | null = null

        if (String(showId).startsWith('shoko:')) {
          numericSeriesId = parseInt(String(showId).replace('shoko:', ''), 10)
        } else if (/^\d+$/.test(String(showId))) {
          const anidbId = animeIdMapper.getAnidbIdByAnilist(parseInt(showId, 10))
          if (anidbId) {
            const series = await shokoClient.getSeriesByAnidbId(anidbId, req.db)
            if (series?.IDs?.ID) numericSeriesId = series.IDs.ID
          }
        }

        if (numericSeriesId) {
          const episodes = await shokoClient.getSeriesEpisodes(numericSeriesId, req.db)
          const cleanNum = String(episodeNumber).trim()
          const matched = episodes.find((e) => {
            const baseNum = e.Number ?? e.EpisodeNumber ?? 1
            const str = e.Type === 'Special' ? `SP${baseNum}` : baseNum.toString()
            return str.toLowerCase() === cleanNum.toLowerCase()
          })
          if (matched?.IDs?.ID) {
            shokoEpId = matched.IDs.ID
          }
        }
      }

      let shokoUpdated = false
      if (shokoEpId) {
        shokoUpdated = await shokoClient.updateEpisodeUserData(shokoEpId, watched, req.db)
      }

      // Also record in Dango's local database
      if (showId && episodeNumber) {
        try {
          await WatchedEpisodesRepository.upsert(req.db, {
            showId: String(showId),
            episodeNumber: String(episodeNumber),
            currentTime: 0,
            duration: 0,
          })
        } catch {
          // Ignore if already marked
        }
      }

      res.json({ success: true, shokoUpdated, episodeId: shokoEpId })
    } catch (err) {
      log.error({ err }, 'Failed to scrobble episode')
      res.status(500).json({ success: false, error: (err as Error).message })
    }
  }

  public testConnection = async (req: Request, res: Response): Promise<void> => {
    const url = req.query.url as string | undefined
    const port = req.query.port ? parseInt(req.query.port as string, 10) : undefined
    const apiKey = req.query.apiKey as string | undefined

    const result = await shokoClient.testConnection(url, port, apiKey)
    res.json(result)
  }

  public login = async (req: Request, res: Response): Promise<void> => {
    try {
      const { url, port, username, password } = req.body
      if (!url || !port || !username || !password) {
        res.status(400).json({ success: false, error: 'Missing required credentials' })
        return
      }

      const result = await shokoClient.signIn(url, port, username, password)

      if (result.success && result.apiKey) {
        // Auto-persist credentials into settings
        await SettingsRepository.upsert(req.db, 'shoko_url', url)
        await SettingsRepository.upsert(req.db, 'shoko_port', String(port))
        await SettingsRepository.upsert(req.db, 'shoko_api_key', result.apiKey)

        shokoClient.setRuntimeConfig({
          url,
          port: parseInt(port, 10),
          apiKey: result.apiKey,
        })
      }

      res.json(result)
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message })
    }
  }

  public getLocalSeries = async (req: Request, res: Response): Promise<void> => {
    try {
      const seriesList = await shokoClient.getSeriesList(req.db)

      const enriched = seriesList.map((s) => {
        const anidbId = s.IDs?.AniDB || s.AniDB?.ID
        const anilistId = anidbId ? animeIdMapper.getAnilistIdByAnidb(anidbId) : null

        const preferredPoster =
          s.Images?.Posters?.find((p) => p.Preferred) ||
          s.Images?.Posters?.[0]

        const preferredBackdrop =
          s.Images?.Backdrops?.find((b) => b.Preferred) ||
          s.Images?.Backdrops?.[0] ||
          s.Images?.Banners?.find((b) => b.Preferred) ||
          s.Images?.Banners?.[0]

        const posterUrl = preferredPoster?.ID
          ? `/api/shoko/image/${preferredPoster.Source || 'AniDB'}/${preferredPoster.Type || 'Poster'}/${preferredPoster.ID}`
          : undefined

        const bannerUrl = preferredBackdrop?.ID
          ? `/api/shoko/image/${preferredBackdrop.Source || 'TMDB'}/${preferredBackdrop.Type || 'Backdrop'}/${preferredBackdrop.ID}`
          : undefined

        return {
          id: anilistId ? anilistId.toString() : `shoko:${s.IDs.ID}`,
          shokoSeriesId: s.IDs.ID,
          anidbId,
          anilistId,
          name: s.Name || s.AniDB?.Title || 'Unknown Anime',
          englishName: s.AniDB?.Title || s.Name,
          thumbnail: posterUrl,
          bannerImage: bannerUrl,
          description: s.AniDB?.Description,
          episodeCount: s.Sizes?.Local?.Normal ?? s.AniDB?.EpisodeCount ?? 0,
          type: s.AniDB?.Type || 'TV',
          isLocal: true,
        }
      })

      res.set('Cache-Control', 'public, max-age=60').json(enriched)
    } catch (err) {
      log.error({ err }, 'Failed to fetch local series')
      res.json([])
    }
  }

  public searchLocalSeries = async (req: Request, res: Response): Promise<void> => {
    try {
      const query = (req.query.query as string) || ''
      const type = req.query.type as string | undefined

      const seriesList = query.trim()
        ? await shokoClient.searchSeries(query, req.db)
        : await shokoClient.getSeriesList(req.db)

      let mapped = seriesList.map((s) => {
        const anidbId = s.IDs?.AniDB || s.AniDB?.ID
        const anilistId = anidbId ? animeIdMapper.getAnilistIdByAnidb(anidbId) : null

        const preferredPoster =
          s.Images?.Posters?.find((p) => p.Preferred) || s.Images?.Posters?.[0]

        const preferredBackdrop =
          s.Images?.Backdrops?.find((b) => b.Preferred) ||
          s.Images?.Backdrops?.[0] ||
          s.Images?.Banners?.find((b) => b.Preferred) ||
          s.Images?.Banners?.[0]

        const posterUrl = preferredPoster?.ID
          ? `/api/shoko/image/${preferredPoster.Source || 'AniDB'}/${preferredPoster.Type || 'Poster'}/${preferredPoster.ID}`
          : undefined

        const bannerUrl = preferredBackdrop?.ID
          ? `/api/shoko/image/${preferredBackdrop.Source || 'TMDB'}/${preferredBackdrop.Type || 'Backdrop'}/${preferredBackdrop.ID}`
          : undefined

        return {
          _id: anilistId ? anilistId.toString() : `shoko:${s.IDs.ID}`,
          id: anilistId ? anilistId.toString() : `shoko:${s.IDs.ID}`,
          shokoSeriesId: s.IDs.ID,
          anidbId,
          anilistId,
          name: s.Name || s.AniDB?.Title || 'Unknown Anime',
          englishName: s.AniDB?.Title || s.Name,
          thumbnail: posterUrl || '',
          bannerImage: bannerUrl,
          description: s.AniDB?.Description,
          episodeCount: s.Sizes?.Local?.Normal ?? s.AniDB?.EpisodeCount ?? 0,
          type: s.AniDB?.Type || 'TV',
          isLocal: true,
        }
      })

      if (type && type !== 'ALL') {
        mapped = mapped.filter((item) => item.type?.toUpperCase() === type.toUpperCase())
      }

      res.set('Cache-Control', 'public, max-age=30').json(mapped)
    } catch (err) {
      log.error({ err }, 'Failed to search local series')
      res.json([])
    }
  }

  public getRecentFiles = async (req: Request, res: Response): Promise<void> => {
    try {
      const pageSize = parseInt(req.query.pageSize as string, 10) || 20
      const recent = await shokoClient.getRecentFiles(req.db, pageSize)
      res.json(recent)
    } catch (err) {
      log.error({ err }, 'Failed to fetch recent files')
      res.json([])
    }
  }

  public refreshAnimeDb = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await animeIdMapper.refreshDatabase(req.db)
      res.json(result)
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message })
    }
  }

  public getAnimeDbStatus = async (_req: Request, res: Response): Promise<void> => {
    res.json(animeIdMapper.getMappingCount())
  }

  public getCapabilities = async (_req: Request, res: Response): Promise<void> => {
    res.json(transcoderService.getCapabilities())
  }

  public getRecentlyAddedEpisodes = async (req: Request, res: Response): Promise<void> => {
    try {
      const pageSize = parseInt(req.query.pageSize as string, 10) || 30
      const list = await shokoClient.getRecentlyAddedEpisodes(pageSize, req.db)

      const mapped = list.map((item) => {
        const anidbId = item.IDs?.Series
        const anilistId = anidbId ? animeIdMapper.getAnilistIdByAnidb(anidbId) : null
        const poster = item.SeriesPoster

        const posterUrl = poster?.ID
          ? `/api/shoko/image/${poster.Source || 'AniDB'}/${poster.Type || 'Poster'}/${poster.ID}`
          : undefined

        return {
          _id: anilistId ? String(anilistId) : `shoko:${item.IDs?.ShokoSeries || anidbId}`,
          id: anilistId ? String(anilistId) : `shoko:${item.IDs?.ShokoSeries || anidbId}`,
          name: item.SeriesTitle || 'Unknown Anime',
          episodeNumber: item.Number,
          airTime: item.AirDate ? item.AirDate.split('T')[0] : undefined,
          thumbnail: posterUrl,
          type: item.Type || 'TV',
          isLocal: true,
          watched: Boolean(item.Watched),
        }
      })

      res.set('Cache-Control', 'public, max-age=60').json(mapped)
    } catch (err) {
      log.error({ err }, 'Failed to fetch recently added episodes')
      res.json([])
    }
  }

  public getCalendar = async (req: Request, res: Response): Promise<void> => {
    try {
      const startDate = req.query.startDate as string | undefined
      const endDate = req.query.endDate as string | undefined
      const numberOfDays = req.query.numberOfDays ? parseInt(req.query.numberOfDays as string, 10) : 14
      const showAll = req.query.showAll === 'true'

      let list
      if (startDate && endDate) {
        list = await shokoClient.getCalendarEpisodes(startDate, endDate, req.db)
      } else {
        list = await shokoClient.getAniDbCalendar(numberOfDays, showAll, req.db)
      }

      const mapped = list.map((item) => {
        const anidbId = item.IDs?.Series
        const anilistId = anidbId ? animeIdMapper.getAnilistIdByAnidb(anidbId) : null
        const poster = item.SeriesPoster

        const posterUrl = poster?.ID
          ? `/api/shoko/image/${poster.Source || 'AniDB'}/${poster.Type || 'Poster'}/${poster.ID}`
          : undefined

        return {
          _id: anilistId ? String(anilistId) : `shoko:${item.IDs?.ShokoSeries || anidbId}`,
          id: anilistId ? String(anilistId) : `shoko:${item.IDs?.ShokoSeries || anidbId}`,
          name: item.SeriesTitle || 'Unknown Anime',
          episodeNumber: item.Number,
          airTime: item.AirDate ? item.AirDate.split('T')[0] : undefined,
          thumbnail: posterUrl,
          type: item.Type || 'TV',
          isLocal: Boolean(item.IDs?.ShokoSeries || item.IDs?.ShokoEpisode || item.IDs?.ShokoFile),
          watched: Boolean(item.Watched),
        }
      })

      res.set('Cache-Control', 'public, max-age=120').json(mapped)
    } catch (err) {
      log.error({ err }, 'Failed to fetch calendar from Shoko')
      res.json([])
    }
  }

  public getSeasonal = async (req: Request, res: Response): Promise<void> => {
    try {
      const format = ((req.query.format as string) || 'ALL').toUpperCase()
      const now = new Date()
      const month = now.getMonth() + 1
      const defaultSeason = month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL'
      const targetSeason = ((req.query.season as string) || defaultSeason).toUpperCase()
      const targetYear = parseInt(req.query.year as string, 10) || now.getFullYear()

      // 1. Fetch newly airing series from Shoko Filter 4 (Newly Airing)
      let seriesList: ShokoSeries[] = await shokoClient.getFilterSeries(4, 100, req.db)

      // 2. Supplement / Fallback: Fetch general series and match YearlySeasons
      if (seriesList.length === 0) {
        const p1 = await shokoClient.getSeriesList(req.db, 1, 100)
        seriesList = p1
      }

      // Filter by season/year if YearlySeasons present
      const seasonal = seriesList.filter((s) => {
        if (s.YearlySeasons && s.YearlySeasons.length > 0) {
          const hasMatch = s.YearlySeasons.some((ys: any) => {
            const yMatch = !targetYear || ys.Year === targetYear || ys.Year === targetYear - 1
            const sMatch = !targetSeason || (ys.AnimeSeason || '').toUpperCase() === targetSeason
            return yMatch && sMatch
          })
          if (!hasMatch && s.YearlySeasons.length > 0) return false
        }
        return true
      })

      const targetList = seasonal.length > 0 ? seasonal : seriesList

      const enriched = targetList
        .filter((s) => {
          if (format !== 'ALL') {
            const seriesType = (s.AniDB?.Type || '').toUpperCase()
            if (format === 'TV' && seriesType && seriesType !== 'TV') return false
            if (format === 'MOVIE' && seriesType && seriesType !== 'MOVIE') return false
            if (format === 'OVA' && seriesType && seriesType !== 'OVA' && seriesType !== 'OAV') return false
            if (format === 'ONA' && seriesType && seriesType !== 'WEB' && seriesType !== 'ONA') return false
          }
          return true
        })
        .map((s) => {
          const anidbId = s.IDs?.AniDB || s.AniDB?.ID
          const anilistId = anidbId ? animeIdMapper.getAnilistIdByAnidb(anidbId) : null

          const preferredPoster =
            s.Images?.Posters?.find((p: any) => p.Preferred) ||
            s.Images?.Posters?.[0]
          const preferredBackdrop =
            s.Images?.Backdrops?.find((b: any) => b.Preferred) ||
            s.Images?.Backdrops?.[0] ||
            s.Images?.Banners?.find((b: any) => b.Preferred) ||
            s.Images?.Banners?.[0]

          const posterUrl = preferredPoster?.ID
            ? `/api/shoko/image/${preferredPoster.Source || 'AniDB'}/${preferredPoster.Type || 'Poster'}/${preferredPoster.ID}`
            : undefined
          const bannerUrl = preferredBackdrop?.ID
            ? `/api/shoko/image/${preferredBackdrop.Source || 'TMDB'}/${preferredBackdrop.Type || 'Backdrop'}/${preferredBackdrop.ID}`
            : undefined

          return {
            _id: anilistId ? anilistId.toString() : `shoko:${s.IDs.ID}`,
            id: anilistId ? anilistId.toString() : `shoko:${s.IDs.ID}`,
            shokoSeriesId: s.IDs.ID,
            name: s.Name || s.AniDB?.Title || 'Unknown Anime',
            englishName: s.AniDB?.Title || s.Name,
            thumbnail: posterUrl,
            bannerImage: bannerUrl,
            description: (s as any).Description || s.AniDB?.Description,
            episodeCount: (s.Sizes?.Local as any)?.Episodes ?? s.Sizes?.Local?.Normal ?? s.AniDB?.EpisodeCount ?? 0,
            type: s.AniDB?.Type || 'TV',
            score: s.AniDB?.Rating?.Value ? String(s.AniDB.Rating.Value) : undefined,
            isLocal: true,
          }
        })

      res.set('Cache-Control', 'public, max-age=120').json(enriched)
    } catch (err) {
      log.error({ err }, 'Failed to fetch seasonal local series')
      res.json([])
    }
  }

  public getTopRated = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 30
      const seriesList = await shokoClient.getSeriesList(req.db, 1, 100)

      // Enrich with AniDB ratings in parallel
      const ratedSeries = await Promise.all(
        seriesList.map(async (s) => {
          const anidb = await shokoClient.getSeriesAniDb(s.IDs.ID, req.db)
          const ratingVal = anidb?.Rating?.Value ?? 0
          return {
            series: s,
            anidb,
            ratingVal,
          }
        })
      )

      ratedSeries.sort((a, b) => b.ratingVal - a.ratingVal)
      const topSelected = ratedSeries.slice(0, limit)

      const enriched = topSelected.map((item, idx) => {
        const s = item.series
        const anidb = item.anidb
        const anidbId = s.IDs?.AniDB || anidb?.ID
        const anilistId = anidbId ? animeIdMapper.getAnilistIdByAnidb(anidbId) : null

        const preferredPoster =
          s.Images?.Posters?.find((p: any) => p.Preferred) ||
          s.Images?.Posters?.[0]
        const preferredBackdrop =
          s.Images?.Backdrops?.find((b: any) => b.Preferred) ||
          s.Images?.Backdrops?.[0] ||
          s.Images?.Banners?.find((b: any) => b.Preferred) ||
          s.Images?.Banners?.[0]

        const posterUrl = preferredPoster?.ID
          ? `/api/shoko/image/${preferredPoster.Source || 'AniDB'}/${preferredPoster.Type || 'Poster'}/${preferredPoster.ID}`
          : undefined
        const bannerUrl = preferredBackdrop?.ID
          ? `/api/shoko/image/${preferredBackdrop.Source || 'TMDB'}/${preferredBackdrop.Type || 'Backdrop'}/${preferredBackdrop.ID}`
          : undefined

        const scoreFormatted = item.ratingVal > 0 ? (item.ratingVal / 100).toFixed(1) : undefined

        return {
          _id: anilistId ? anilistId.toString() : `shoko:${s.IDs.ID}`,
          id: anilistId ? anilistId.toString() : `shoko:${s.IDs.ID}`,
          shokoSeriesId: s.IDs.ID,
          name: s.Name || anidb?.Title || 'Unknown Anime',
          englishName: anidb?.Title || s.Name,
          thumbnail: posterUrl,
          bannerImage: bannerUrl,
          description: anidb?.Description || (s as any).Description,
          episodeCount: (s.Sizes?.Local as any)?.Episodes ?? s.Sizes?.Local?.Normal ?? anidb?.EpisodeCount ?? 0,
          type: anidb?.Type || 'TV',
          score: scoreFormatted,
          rank: idx + 1,
          isLocal: true,
        }
      })

      res.set('Cache-Control', 'public, max-age=120').json(enriched)
    } catch (err) {
      log.error({ err }, 'Failed to fetch top-rated local series')
      res.json([])
    }
  }

  public getSpotlight = async (req: Request, res: Response): Promise<void> => {
    try {
      const airingSeries = await shokoClient.getFilterSeries(4, 50, req.db)

      const mapToShow = (s: ShokoSeries, anidb?: any) => {
        const anidbId = s.IDs?.AniDB || anidb?.ID
        const anilistId = anidbId ? animeIdMapper.getAnilistIdByAnidb(anidbId) : null

        const preferredPoster =
          s.Images?.Posters?.find((p: any) => p.Preferred) ||
          s.Images?.Posters?.[0]
        const preferredBackdrop =
          s.Images?.Backdrops?.find((b: any) => b.Preferred) ||
          s.Images?.Backdrops?.[0] ||
          s.Images?.Banners?.find((b: any) => b.Preferred) ||
          s.Images?.Banners?.[0]

        const posterUrl = preferredPoster?.ID
          ? `/api/shoko/image/${preferredPoster.Source || 'AniDB'}/${preferredPoster.Type || 'Poster'}/${preferredPoster.ID}`
          : undefined
        const bannerUrl = preferredBackdrop?.ID
          ? `/api/shoko/image/${preferredBackdrop.Source || 'TMDB'}/${preferredBackdrop.Type || 'Backdrop'}/${preferredBackdrop.ID}`
          : undefined

        return {
          _id: anilistId ? anilistId.toString() : `shoko:${s.IDs.ID}`,
          id: anilistId ? anilistId.toString() : `shoko:${s.IDs.ID}`,
          shokoSeriesId: s.IDs.ID,
          name: s.Name || anidb?.Title || 'Unknown Anime',
          englishName: anidb?.Title || s.Name,
          thumbnail: posterUrl || '',
          bannerImage: bannerUrl || posterUrl || '',
          description: anidb?.Description || (s as any).Description,
          episodeCount: (s.Sizes?.Local as any)?.Episodes ?? s.Sizes?.Local?.Normal ?? 0,
          type: anidb?.Type || 'TV',
          score: anidb?.Rating?.Value ? (anidb.Rating.Value / 100).toFixed(1) : undefined,
          isLocal: true,
        }
      }

      // Filter series with artwork and randomize
      const withArtwork = airingSeries.filter((s) => {
        const hasBackdrop = s.Images?.Backdrops && s.Images.Backdrops.length > 0
        const hasPoster = s.Images?.Posters && s.Images.Posters.length > 0
        return hasBackdrop || hasPoster
      })

      const shuffled = [...withArtwork].sort(() => Math.random() - 0.5)
      const selectedMap = new Map<number, any>()

      for (const s of shuffled) {
        if (selectedMap.size >= 6) break
        selectedMap.set(s.IDs.ID, mapToShow(s))
      }

      // If less than 6, add entries from Shoko's ContinueWatchingEpisodes dashboard
      if (selectedMap.size < 6) {
        try {
          const cwEpisodes = await shokoClient.getContinueWatchingEpisodes(20, req.db)
          for (const ep of cwEpisodes) {
            if (selectedMap.size >= 6) break
            const seriesId = ep.IDs?.ShokoSeries || ep.IDs?.Series
            if (seriesId && !selectedMap.has(seriesId)) {
              const series = await shokoClient.getSeriesById(seriesId, req.db)
              if (series) {
                selectedMap.set(seriesId, mapToShow(series))
              }
            }
          }
        } catch {
          // continue watching backfill optional
        }
      }

      // If still less than 6, backfill from general library series
      if (selectedMap.size < 6) {
        const extra = await shokoClient.getSeriesList(req.db, 1, 30)
        const randomizedExtra = [...extra].sort(() => Math.random() - 0.5)
        for (const s of randomizedExtra) {
          if (selectedMap.size >= 6) break
          if (!selectedMap.has(s.IDs.ID)) {
            selectedMap.set(s.IDs.ID, mapToShow(s))
          }
        }
      }

      const results = Array.from(selectedMap.values()).slice(0, 6)
      res.set('Cache-Control', 'public, max-age=60').json(results)
    } catch (err) {
      log.error({ err }, 'Failed to fetch spotlight local series')
      res.json([])
    }
  }
}

export const localMediaController = new LocalMediaController()
