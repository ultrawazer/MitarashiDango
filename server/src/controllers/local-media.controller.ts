import { Request, Response } from 'express'
import { ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { shokoClient, ShokoSeries } from '../lib/shoko.client'
import { transcoderService, HwAccelMode } from '../lib/transcoder.service'
import { animeIdMapper } from '../lib/anime-id-mapper'
import { SettingsRepository } from '../repositories/settings.repository'
import { WatchedEpisodesRepository } from '../repositories/watched-episodes.repository'
import logger from '../logger'

const log = logger.child({ module: 'LocalMediaController' })

const SUBTITLE_CACHE_DIR = path.resolve(__dirname, '../../data/cache/subtitles')
if (!fs.existsSync(SUBTITLE_CACHE_DIR)) {
  try {
    fs.mkdirSync(SUBTITLE_CACHE_DIR, { recursive: true })
  } catch {}
}

interface SubtitleJob {
  cacheKey: string
  fileId: number
  trackIndex: number
  process: ChildProcess
  chunks: Buffer[]
  responses: Set<Response>
}

export class LocalMediaController {
  private activeRemuxStreams = new Map<string, ChildProcess>()
  private activeSubtitleJobs = new Map<string, SubtitleJob>()
  private clientActiveSubtitle = new Map<string, string>()
  private activeStreamActualStartTime = new Map<string, { requestedStartTime: number; actualStartTime: number }>()
  /**
   * Checks if a local file needs FFmpeg remuxing or video transcoding for browser playback.
   * Returns shouldRemux: false for MP4/WebM with browser-compatible codecs (H.264 8-bit + AAC/MP3/Opus).
   * Returns needsTranscodeVideo: true for non-browser codecs (XviD, DivX, msmpeg4v3, Hi10P 10-bit).
   */
  private async checkStreamRequirements(fileId: number, db: any): Promise<{ shouldRemux: boolean; needsTranscodeVideo: boolean }> {
    try {
      const { client } = (shokoClient as any).getClient(db)
      const res = await client.get(`/api/v3/File/${fileId}`, {
        params: { includeMediaInfo: true },
        timeout: 5000,
      })
      const file = res.data
      if (!file) return { shouldRemux: true, needsTranscodeVideo: false }

      let mediaInfo = file.MediaInfo
      // Shoko v3 often separates MediaInfo under /api/v3/File/{fileId}/MediaInfo
      if (!mediaInfo || (!mediaInfo.Video && !mediaInfo.MediaStreams?.Video)) {
        try {
          const miRes = await client.get(`/api/v3/File/${fileId}/MediaInfo`, { timeout: 5000 })
          if (miRes.data) mediaInfo = miRes.data
        } catch {
          // ignore
        }
      }

      // Check container from file path or media info
      const locations = file.Locations || []
      const relativePath = locations[0]?.RelativePath || ''
      const rawExt = relativePath.split('.').pop() || mediaInfo?.FileExtension || ''
      const ext = rawExt.toLowerCase().replace(/^\./, '')

      // Containers that browsers can play natively
      const browserSafeContainers = new Set(['mp4', 'm4v', 'webm', 'mov'])
      let shouldRemux = !browserSafeContainers.has(ext)
      let needsTranscodeVideo = false

      // Container formats that cannot be stream-copied directly into browser fMP4 (must be transcoded to H.264)
      const alwaysTranscodeContainers = new Set([
        'rm', 'ram', 'rmvb', 'ra',
        'ogv', 'ogg',
        'wmv', 'asf',
        'flv',
      ])

      if (alwaysTranscodeContainers.has(ext)) {
        shouldRemux = true
        needsTranscodeVideo = true
      }

      if (mediaInfo) {
        // 1. Inspect Video Stream: auto-detect non-browser video codecs & 10-bit profiles
        const videoStreams = mediaInfo.Video || mediaInfo.MediaStreams?.Video || []
        if (videoStreams.length > 0) {
          const v = videoStreams[0]
          const rawCodec = (typeof v.Codec === 'object' ? v.Codec?.Raw : v.Codec) || ''
          const simpCodec = (typeof v.Codec === 'object' ? v.Codec?.Simplified : v.Codec) || ''
          const formatName = (v.Format?.Name || '').toLowerCase()
          const profile = (v.Format?.Profile || '').toLowerCase()
          const bitDepth = v.BitDepth !== undefined ? Number(v.BitDepth) : 8

          // Known legacy or non-browser codecs that CANNOT play in HTML5 <video>
          const legacyCodecs = new Set([
            'xvid', 'divx', 'div3', 'mp43', 'msmpeg4v3', 'msmpeg4v2', 'msmpeg4v1',
            'mpeg4', 'mpeg2video', 'mpeg1video', 'wmv1', 'wmv2', 'wmv3', 'vc1',
            'rv10', 'rv20', 'rv30', 'rv40', 'flv1', 'theora', 'dirac', 'vp3',
          ])

          const rawLower = String(rawCodec).toLowerCase()
          const simpLower = String(simpCodec).toLowerCase()

          const isLegacy =
            legacyCodecs.has(rawLower) ||
            legacyCodecs.has(simpLower) ||
            rawLower.includes('xvid') ||
            rawLower.includes('divx') ||
            rawLower.includes('div3') ||
            rawLower.includes('mp43') ||
            rawLower.includes('rv10') ||
            rawLower.includes('rv20') ||
            rawLower.includes('rv30') ||
            rawLower.includes('rv40') ||
            rawLower.includes('real') ||
            simpLower.includes('real') ||
            rawLower.includes('theora') ||
            simpLower.includes('theora') ||
            rawLower.includes('dirac') ||
            formatName.includes('realvideo') ||
            formatName.includes('real video') ||
            formatName.includes('theora') ||
            formatName.includes('dirac') ||
            formatName.includes('mpeg-4 visual') ||
            formatName.includes('mpeg video')

          // 10-bit H.264 (Hi10P) cannot be decoded by web browsers
          const isHi10P =
            (simpLower === 'h264' || rawLower === 'avc1' || formatName.includes('avc')) &&
            (bitDepth === 10 || profile.includes('high 10') || profile.includes('hi10p'))

          if (isLegacy || isHi10P || alwaysTranscodeContainers.has(ext)) {
            shouldRemux = true
            needsTranscodeVideo = true
            log.info({ fileId, rawCodec, simpCodec, formatName, profile, bitDepth, ext }, 'Detected non-browser video format; forcing video transcode')
          }
        } else if (ext === 'ogg' || ext === 'ra') {
          // Pure audio file in Ogg or RealAudio container: remux to AAC fMP4 without video stream
          needsTranscodeVideo = false
        }

        // 2. Inspect Audio Streams for incompatible audio codecs
        const audioStreams = mediaInfo.Audio || mediaInfo.MediaStreams?.Audio || []
        const incompatibleAudioCodecs = new Set([
          'flac', 'dts', 'dts-hd', 'truehd', 'pcm', 'pcm_s16le', 'pcm_s24le',
          'pcm_s32le', 'pcm_f32le', 'eac3',
          'cook', 'sipc', 'sipr', 'ra_144', 'ra_288', 'real_144', 'real_288',
          'ralf', 'atrac', 'atrac1', 'atrac3', 'atrac3+', 'atrac3plus', 'realaudio',
          'vorbis', 'speex',
        ])

        for (const audio of audioStreams) {
          const raw = (typeof audio.Codec === 'object' ? audio.Codec?.Raw : audio.Codec) || ''
          const simp = (typeof audio.Codec === 'object' ? audio.Codec?.Simplified : audio.Codec) || ''
          const format = (audio.Format?.Name || '').toLowerCase()
          const codec = (simp || raw || format).toLowerCase()
          if (
            incompatibleAudioCodecs.has(codec) ||
            codec.includes('cook') ||
            codec.includes('sipc') ||
            codec.includes('sipr') ||
            codec.includes('ra_') ||
            codec.includes('real') ||
            codec.includes('atrac') ||
            codec.includes('ralf') ||
            codec.includes('vorbis') ||
            codec.includes('speex')
          ) {
            shouldRemux = true
            break
          }
        }
      } else if (ext === 'avi') {
        // Fallback for AVI container when mediaInfo is missing
        shouldRemux = true
        needsTranscodeVideo = true
      }

      return { shouldRemux, needsTranscodeVideo }
    } catch (err) {
      log.warn({ err: (err as Error).message, fileId }, 'Failed to check file media info, defaulting to remux')
      return { shouldRemux: true, needsTranscodeVideo: false }
    }
  }

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
      let transcodeVideo = req.query.transcode === 'true'
      const startTime = req.query.startTime ? parseFloat(req.query.startTime as string) : undefined

      const vfsUrl = shokoClient.getVfsStreamUrl(fileId, req.db)

      // Fetch hwaccel setting if present, falling back to process.env.HW_ACCEL
      const hwSetting = await SettingsRepository.getByKey(req.db, 'hwaccel_mode')
      const hwAccel = (hwSetting?.value as HwAccelMode) || (process.env.HW_ACCEL as HwAccelMode) || 'auto'

      // Check if transcoding/remuxing is requested.
      const isDirectStream = req.query.direct === 'true'
      const hasFfmpeg = transcoderService.getCapabilities().hasFfmpeg

      // Smart container/codec detection: only remux when the browser can't play natively
      let shouldRemux = false
      if (!isDirectStream && hasFfmpeg) {
        const analysis = await this.checkStreamRequirements(fileId, req.db)
        if (analysis.needsTranscodeVideo) {
          transcodeVideo = true
        }

        if (audioIndex !== undefined || transcodeVideo || (startTime !== undefined && startTime > 0)) {
          // Explicit user request for audio track switch, video transcode, or time seek
          shouldRemux = true
        } else if (req.query.remux === 'false') {
          shouldRemux = false
        } else {
          shouldRemux = analysis.shouldRemux
        }
      }

      if (shouldRemux && hasFfmpeg) {
        const sessionId = req.query.sessionId as string | undefined
        const clientKey = sessionId ? `session_${sessionId}` : `ip_${req.ip || 'default'}`
        const existingProcess = this.activeRemuxStreams.get(clientKey)
        if (existingProcess) {
          log.info({ clientKey }, 'Terminating previous active FFmpeg stream for client')
          try {
            existingProcess.kill('SIGKILL')
          } catch {}
          this.activeRemuxStreams.delete(clientKey)
        }

        log.info({ fileId, audioIndex, transcodeVideo, hwAccel, startTime, clientKey }, 'Starting FFmpeg remux stream')

        const remux = transcoderService.streamRemux({
          inputUrl: vfsUrl,
          audioIndex,
          transcodeVideo,
          hwAccel,
          startTime,
          onActualStartTime: (actual) => {
            log.info({ clientKey, requested: startTime, actual }, 'Detected actual stream start keyframe timestamp')
            this.activeStreamActualStartTime.set(clientKey, {
              requestedStartTime: startTime || 0,
              actualStartTime: actual,
            })
          },
        })

        if (!remux) {
          res.status(500).send('FFmpeg remux failed to initialize')
          return
        }

        this.activeRemuxStreams.set(clientKey, remux.process)

        res.setHeader('Content-Type', 'video/mp4')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')

        remux.process.on('error', (procErr) => {
          log.error({ err: procErr, fileId }, 'FFmpeg remux process error')
          if (!res.headersSent) {
            res.status(500).send('Remux process error')
          }
        })

        remux.stdout.on('error', (err) => {
          log.warn({ err, fileId }, 'Remux stdout stream error')
        })

        remux.stdout.pipe(res)

        req.on('close', () => {
          log.info({ fileId, clientKey }, 'Client disconnected from remux stream, killing FFmpeg')
          if (this.activeRemuxStreams.get(clientKey) === remux.process) {
            this.activeRemuxStreams.delete(clientKey)
          }
          try {
            remux.process.kill('SIGKILL')
          } catch {}
          setTimeout(() => {
            if (!this.activeRemuxStreams.has(clientKey)) {
              this.activeStreamActualStartTime.delete(clientKey)
            }
          }, 30000)
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

  public getStreamStartTime = async (req: Request, res: Response): Promise<void> => {
    const sessionId = req.query.sessionId as string | undefined
    const clientKey = sessionId ? `session_${sessionId}` : `ip_${req.ip || 'default'}`
    
    let info = this.activeStreamActualStartTime.get(clientKey)
    if (info && info.actualStartTime > 0) {
      res.json(info)
      return
    }

    // If remux stream is spinning up, wait up to 1000ms for FFmpeg to emit the first keyframe time
    const startWait = Date.now()
    while (Date.now() - startWait < 1000) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      info = this.activeStreamActualStartTime.get(clientKey)
      if (info && info.actualStartTime > 0) {
        res.json(info)
        return
      }
      if (!this.activeRemuxStreams.has(clientKey) && !info) {
        break
      }
    }

    res.json(info || { requestedStartTime: 0, actualStartTime: 0 })
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

      const cacheKey = `${fileId}_${trackIndex}`
      const cachePath = path.join(SUBTITLE_CACHE_DIR, `${cacheKey}.vtt`)

      // 1. Instant response from disk cache if already extracted
      if (fs.existsSync(cachePath)) {
        try {
          const stats = fs.statSync(cachePath)
          if (stats.size > 0) {
            res.setHeader('Content-Type', 'text/vtt; charset=utf-8')
            res.setHeader('Content-Length', stats.size)
            res.setHeader('Cache-Control', 'public, max-age=86400')
            fs.createReadStream(cachePath).pipe(res)
            return
          }
        } catch {
          // If stat/read fails, proceed with live extraction below
        }
      }

      const clientKey = `${(req.query.sessionId as string) || req.ip || 'default'}`

      // 2. Client preemption: if client was extracting a DIFFERENT subtitle, preempt it
      const previousCacheKey = this.clientActiveSubtitle.get(clientKey)
      if (previousCacheKey && previousCacheKey !== cacheKey) {
        const prevJob = this.activeSubtitleJobs.get(previousCacheKey)
        if (prevJob) {
          log.info({ clientKey, previousCacheKey, cacheKey }, 'Preempting previous subtitle extraction for client')
          try {
            prevJob.process.kill('SIGKILL')
          } catch {}
          this.activeSubtitleJobs.delete(previousCacheKey)
        }
        this.clientActiveSubtitle.delete(clientKey)
      }
      this.clientActiveSubtitle.set(clientKey, cacheKey)

      // 3. Attach to existing in-progress extraction for this exact subtitle if one is running
      const existingJob = this.activeSubtitleJobs.get(cacheKey)
      if (existingJob) {
        res.setHeader('Content-Type', 'text/vtt; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache')
        for (const chunk of existingJob.chunks) {
          res.write(chunk)
        }
        existingJob.responses.add(res)

        req.on('close', () => {
          existingJob.responses.delete(res)
          if (existingJob.responses.size === 0) {
            log.info({ cacheKey }, 'All clients disconnected from subtitle job, killing FFmpeg')
            try {
              existingJob.process.kill('SIGKILL')
            } catch {}
            this.activeSubtitleJobs.delete(cacheKey)
            if (this.clientActiveSubtitle.get(clientKey) === cacheKey) {
              this.clientActiveSubtitle.delete(clientKey)
            }
          }
        })
        return
      }

      // 4. Start new live extraction
      const vfsUrl = shokoClient.getVfsStreamUrl(fileId, req.db)
      const sub = transcoderService.extractSubtitle(vfsUrl, trackIndex)

      if (!sub) {
        res.status(500).send('Subtitle extraction unavailable')
        return
      }

      res.setHeader('Content-Type', 'text/vtt; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')

      const job: SubtitleJob = {
        cacheKey,
        fileId,
        trackIndex,
        process: sub.process,
        chunks: [],
        responses: new Set([res]),
      }
      this.activeSubtitleJobs.set(cacheKey, job)

      sub.stdout.on('data', (chunk: Buffer) => {
        job.chunks.push(chunk)
        for (const clientRes of job.responses) {
          try {
            clientRes.write(chunk)
          } catch {}
        }
      })

      const cleanupJob = () => {
        if (this.activeSubtitleJobs.get(cacheKey) === job) {
          this.activeSubtitleJobs.delete(cacheKey)
        }
        if (this.clientActiveSubtitle.get(clientKey) === cacheKey) {
          this.clientActiveSubtitle.delete(clientKey)
        }
      }

      sub.process.on('close', (code) => {
        cleanupJob()
        if (code === 0 && job.chunks.length > 0) {
          try {
            const fullVtt = Buffer.concat(job.chunks)
            if (fullVtt.length > 0) {
              fs.writeFileSync(cachePath, fullVtt)
              log.info({ fileId, trackIndex, size: fullVtt.length }, 'Saved extracted subtitle to disk cache')
            }
          } catch (writeErr) {
            log.warn({ writeErr, fileId, trackIndex }, 'Failed to cache subtitle to disk')
          }
        }
        for (const clientRes of job.responses) {
          try {
            clientRes.end()
          } catch {}
        }
        job.responses.clear()
      })

      sub.process.on('error', (procErr) => {
        cleanupJob()
        log.error({ err: procErr, fileId, trackIndex }, 'Subtitle FFmpeg process error')
        for (const clientRes of job.responses) {
          if (!clientRes.headersSent) {
            clientRes.status(500).send('Subtitle extraction error')
          } else {
            try {
              clientRes.end()
            } catch {}
          }
        }
        job.responses.clear()
      })

      req.on('close', () => {
        job.responses.delete(res)
        if (job.responses.size === 0) {
          log.info({ clientKey, fileId, trackIndex }, 'Client disconnected from subtitle stream, terminating FFmpeg')
          cleanupJob()
          try {
            job.process.kill('SIGKILL')
          } catch {}
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

        const isSpecial = item.Type === 'Special'
        const epNum = isSpecial && item.Number !== undefined ? `SP${item.Number}` : item.Number

        return {
          _id: anilistId ? String(anilistId) : `shoko:${item.IDs?.ShokoSeries || anidbId}`,
          id: anilistId ? String(anilistId) : `shoko:${item.IDs?.ShokoSeries || anidbId}`,
          name: item.SeriesTitle || 'Unknown Anime',
          episodeTitle: item.Title || undefined,
          episodeNumber: epNum,
          airTime: item.AirDate ? item.AirDate.split('T')[0] : undefined,
          thumbnail: posterUrl,
          type: item.Type || 'TV',
          isLocal: Boolean(item.IDs?.ShokoFile),
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
