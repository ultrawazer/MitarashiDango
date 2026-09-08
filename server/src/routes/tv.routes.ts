import { Router } from 'express'
import NodeCache from 'node-cache'
import { getTmdbKey, TMDB_BASE, TMDB_IMAGE } from '../lib/tmdb'
import { TvExtension } from '../extensions/extension.types'
import { URL } from 'url'

interface TmdbSearchItem {
  id: number
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  media_type?: string
  poster_path?: string | null
  vote_average?: number
  adult?: boolean
}

interface TmdbSeason {
  season_number: number
  episode_count: number
}

interface TmdbEpisode {
  episode_number: number
  name?: string
  vote_average?: number
  overview?: string
  still_path?: string | null
}

interface TmdbDetailsResult {
  id: number
  imdb_id: string | null
  title: string
  overview: string
  vote_average?: number
  year: string
  poster: string
  backdrop: string
  adult: boolean
  seasons?: TmdbSeason[]
  number_of_seasons?: number
}

interface ImdbSuggestion {
  id?: string
  l?: string
  y?: number
  qid?: string
  i?: { imageUrl?: string }
}

export function createTvRouter(
  apiCache: NodeCache,
  getTvProvider: (id: string) => TvExtension | null
): Router {
  const router = Router()

  // TMDB Multi Search
  router.get('/tv/search', async (req, res) => {
    const query = (req.query.q as string) || ''
    if (!query) return res.json([])
    const page = parseInt(req.query.page as string) || 1
    const cacheKey = `tv-search-${query.toLowerCase()}-${page}`
    const cached = apiCache.get(cacheKey)
    if (cached) return res.json(cached)
    const key = await getTmdbKey()
    if (!key) return res.status(500).json({ error: 'No TMDB API key available' })
    try {
      const r = await fetch(
        `${TMDB_BASE}/search/multi?api_key=${key}&query=${encodeURIComponent(query)}&page=${page}&include_adult=true`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      )
      if (!r.ok) return res.status(500).json({ error: 'TMDB search failed' })
      const d = await r.json()
      const results = (d.results || [])
        .filter((item: TmdbSearchItem) => item.media_type !== 'person')
        .map((item: TmdbSearchItem) => ({
          id: item.id,
          title: item.title || item.name,
          year: (item.release_date || item.first_air_date || '').split('-')[0],
          type: item.media_type,
          image: item.poster_path ? `${TMDB_IMAGE}/w500${item.poster_path}` : '',
          vote_average: item.vote_average,
          adult: item.adult === true,
        }))
      apiCache.set(cacheKey, results, 3600)
      res.json(results)
    } catch (e) {
      res.status(500).json({ error: (e as Error).message })
    }
  })

  // TMDB Details
  router.get('/tv/details/:type/:id', async (req, res) => {
    const { type, id } = req.params
    const key = await getTmdbKey()
    if (!key) return res.status(500).json({ error: 'No TMDB API key available' })
    try {
      const r = await fetch(
        `${TMDB_BASE}/${type}/${id}?api_key=${key}&append_to_response=external_ids`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      )
      if (!r.ok) return res.status(500).json({ error: 'TMDB details failed' })
      const d = await r.json()
      const result: TmdbDetailsResult = {
        id: d.id,
        imdb_id: d.external_ids?.imdb_id || d.imdb_id || null,
        title: d.title || d.name,
        overview: d.overview,
        vote_average: d.vote_average,
        year: (d.release_date || d.first_air_date || '').split('-')[0],
        poster: d.poster_path ? `${TMDB_IMAGE}/w500${d.poster_path}` : '',
        backdrop: d.backdrop_path ? `${TMDB_IMAGE}/original${d.backdrop_path}` : '',
        adult: d.adult === true,
      }
      if (type === 'tv') {
        result.seasons = (d.seasons || [])
          .filter((s: TmdbSeason) => s.season_number > 0)
          .map((s: TmdbSeason) => ({
            season_number: s.season_number,
            episode_count: s.episode_count,
          }))
        result.number_of_seasons = d.number_of_seasons
      }
      res.json(result)
    } catch (e) {
      res.status(500).json({ error: (e as Error).message })
    }
  })

  // TMDB Episodes
  router.get('/tv/episodes/:id/:season', async (req, res) => {
    const { id, season } = req.params
    const key = await getTmdbKey()
    if (!key) return res.status(500).json({ error: 'No TMDB API key available' })
    try {
      const r = await fetch(`${TMDB_BASE}/tv/${id}/season/${season}?api_key=${key}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      if (!r.ok) return res.status(500).json({ error: 'TMDB episodes failed' })
      const d = await r.json()
      const episodes = (d.episodes || []).map((ep: TmdbEpisode) => ({
        episode_number: ep.episode_number,
        name: ep.name,
        vote_average: ep.vote_average,
        overview: ep.overview,
        still_path: ep.still_path,
      }))
      res.json({ episodes })
    } catch (e) {
      res.status(500).json({ error: (e as Error).message })
    }
  })

  // IMDb to TMDB lookup
  router.get('/tv/lookup/imdb-to-tmdb/:imdbId', async (req, res) => {
    const key = await getTmdbKey()
    if (!key) return res.json({ tmdbId: null, error: 'No TMDB API key available' })
    try {
      const r = await fetch(
        `${TMDB_BASE}/find/${req.params.imdbId}?api_key=${key}&external_source=imdb_id`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      )
      if (!r.ok) return res.json({ tmdbId: null, error: `TMDB error ${r.status}` })
      const d = await r.json()
      const movie = d.movie_results?.[0]
      const tv = d.tv_results?.[0]
      const result = movie || tv
      res.json({
        tmdbId: result?.id || null,
        type: movie ? 'movie' : tv ? 'tv' : null,
        title: result?.title || result?.name || null,
        year: (result?.release_date || result?.first_air_date || '').substring(0, 4) || null,
      })
    } catch (e) {
      res.json({ tmdbId: null, error: (e as Error).message })
    }
  })

  // IMDb Search
  router.get('/tv/search/imdb', async (req, res) => {
    const query = (req.query.q as string) || ''
    if (!query) return res.json([])
    const cacheKey = `tv-imdb-search-${query.toLowerCase()}`
    const cached = apiCache.get(cacheKey)
    if (cached) return res.json(cached)
    try {
      const response = await fetch(
        `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(query)}.json`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      )
      if (!response.ok) return res.status(500).json({ error: 'IMDB search failed' })
      const data = await response.json()
      const TV_TYPES = new Set(['tvSeries', 'tvMiniSeries', 'movie'])
      const matches = (data.d || [])
        .filter(
          (entry: ImdbSuggestion) => Boolean(entry.id && entry.l) && TV_TYPES.has(entry.qid || '')
        )
        .slice(0, 10)
        .map((entry: ImdbSuggestion) => ({
          id: entry.id,
          title: entry.l,
          year: entry.y,
          type: entry.qid,
          image: entry.i?.imageUrl || '',
        }))
      apiCache.set(cacheKey, matches, 3600)
      res.json(matches)
    } catch (e) {
      res.status(500).json({ error: (e as Error).message })
    }
  })

  // Dynamic TV Stream Provider Endpoint
  router.get('/tv/stream/:provider/:type/:tmdbId', async (req, res) => {
    const { provider: providerId, type, tmdbId } = req.params
    const provider = getTvProvider(providerId)
    if (!provider) {
      return res.status(404).json({ error: `TV provider ${providerId} not found or not installed`, sources: [] })
    }

    try {
      const result = await provider.getStreamUrls({
        mediaType: type === 'movie' ? 'movie' : 'tv',
        tmdbId: parseInt(tmdbId, 10),
        season: parseInt(req.query.season as string, 10) || 1,
        episode: parseInt(req.query.episode as string, 10) || 1,
        title: req.query.title as string,
        year: req.query.year as string,
        imdbId: req.query.imdbId as string,
        server: req.query.server as string,
        totalSeasons: parseInt(req.query.totalSeasons as string, 10) || 1,
      })
      res.json(result || { sources: [] })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message, sources: [] })
    }
  })

  // Backwards-compatible route for Movy.bz
  router.get('/tv/movybz/:type/:tmdbId', async (req, res) => {
    const provider = getTvProvider('movybz')
    if (!provider) return res.json({ sources: [], error: 'Movy extension not installed' })
    try {
      const result = await provider.getStreamUrls({
        mediaType: req.params.type === 'movie' ? 'movie' : 'tv',
        tmdbId: parseInt(req.params.tmdbId, 10),
        season: parseInt(req.query.season as string, 10) || 1,
        episode: parseInt(req.query.episode as string, 10) || 1,
        title: req.query.title as string,
        year: req.query.year as string,
        imdbId: req.query.imdbId as string,
        totalSeasons: parseInt(req.query.totalSeasons as string, 10) || 1,
      })
      res.json(result || { sources: [] })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message, sources: [] })
    }
  })

  // Backwards-compatible route for Movy city probe
  router.get('/tv/movybz/:type/:tmdbId/probe/:city', async (req, res) => {
    const provider = getTvProvider('movybz')
    if (!provider) return res.json({ sources: [], error: 'Movy extension not installed', valid: false })
    try {
      const result = await provider.getStreamUrls({
        mediaType: req.params.type === 'movie' ? 'movie' : 'tv',
        tmdbId: parseInt(req.params.tmdbId, 10),
        season: parseInt(req.query.season as string, 10) || 1,
        episode: parseInt(req.query.episode as string, 10) || 1,
        title: req.query.title as string,
        year: req.query.year as string,
        imdbId: req.query.imdbId as string,
        server: req.params.city,
        totalSeasons: parseInt(req.query.totalSeasons as string, 10) || 1,
      })
      if (result && result.sources && result.sources.length > 0) {
        res.json({ server: req.params.city, sources: result.sources, audioTracks: result.audioTracks || [], valid: true })
      } else {
        res.json({ server: req.params.city, sources: [], audioTracks: [], valid: false, error: 'No valid sources' })
      }
    } catch (err) {
      res.status(500).json({ error: (err as Error).message, valid: false })
    }
  })

  // Backwards-compatible route for VixSrc
  router.get('/tv/vixsrc/:type/:tmdbId', async (req, res) => {
    const provider = getTvProvider('vixsrc')
    if (!provider) return res.json({ sources: [], error: 'VixSrc extension not installed' })
    try {
      const result = await provider.getStreamUrls({
        mediaType: req.params.type === 'movie' ? 'movie' : 'tv',
        tmdbId: parseInt(req.params.tmdbId, 10),
        season: parseInt(req.query.season as string, 10) || 1,
        episode: parseInt(req.query.episode as string, 10) || 1,
      })
      res.json(result || { sources: [] })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message, sources: [] })
    }
  })

  // Stream Proxy (for HLS rewriting & CORS handling)
  router.get('/tv/stream-proxy', async (req, res) => {
    const { url, referer } = req.query
    const urlStr = url as string
    const refererStr = (referer as string) || ''
    if (!urlStr) return res.status(400).send('URL required')

    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(), 30000)
    res.on('close', () => {
      clearTimeout(timeout)
      abortController.abort()
    })

    try {
      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
      if (refererStr) headers['Referer'] = refererStr

      const fetchResp = await fetch(urlStr, {
        headers,
        signal: abortController.signal,
        redirect: 'follow',
      })

      const status = fetchResp.status
      if (status !== 200 && status !== 206) {
        return res.status(status ?? 502).send('Upstream error')
      }

      const contentType = fetchResp.headers.get('content-type') || 'application/octet-stream'
      const contentLength = fetchResp.headers.get('content-length')
      const contentRange = fetchResp.headers.get('content-range')
      const acceptRanges = fetchResp.headers.get('accept-ranges')

      res.status(status)
      res.set('Content-Type', contentType)
      if (contentLength) res.set('Content-Length', contentLength)
      if (contentRange) res.set('Content-Range', contentRange)
      if (acceptRanges) res.set('Accept-Ranges', acceptRanges)
      res.set('Access-Control-Allow-Origin', '*')
      res.set('Connection', 'keep-alive')

      if (urlStr.includes('.m3u8')) {
        const body = await fetchResp.text()
        const baseUrl = new URL(fetchResp.url || urlStr)
        const proxiedMediaUrl = (targetUrl: string) =>
          `/api/tv/stream-proxy?url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(refererStr)}`

        const rewritten = body
          .split('\n')
          .map((line: string) => {
            const trimmed = line.trim()
            if (!trimmed) return line
            if (trimmed.startsWith('#')) {
              return trimmed.replace(/URI="([^"]+)"/g, (_, uri) => {
                const absolute = new URL(uri, baseUrl).href
                return `URI="${proxiedMediaUrl(absolute)}"`
              })
            }
            const absolute = new URL(trimmed, baseUrl).href
            return proxiedMediaUrl(absolute)
          })
          .join('\n')

        const bodyBuffer = Buffer.from(rewritten, 'utf8')
        res.set('Content-Type', 'application/vnd.apple.mpegurl')
        res.set('Content-Length', String(bodyBuffer.length))
        if (!res.headersSent) {
          res.send(bodyBuffer)
        }
      } else {
        const chunks: Buffer[] = []
        const reader = fetchResp.body?.getReader()
        if (!reader) {
          return res.status(500).send('No response body')
        }
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            chunks.push(Buffer.from(value))
          }
          const body = Buffer.concat(chunks)
          res.set('Content-Type', contentType)
          if (contentLength) res.set('Content-Length', contentLength)
          if (contentRange) res.set('Content-Range', contentRange)
          if (acceptRanges) res.set('Accept-Ranges', acceptRanges)
          res.set('Access-Control-Allow-Origin', '*')
          res.set('Connection', 'keep-alive')
          if (!res.headersSent) {
            res.send(body)
          }
        } catch {
          if (!res.headersSent) {
            res.status(500).send('Proxy error')
          }
        }
      }
    } catch {
      if (abortController.signal.aborted) return
      if (!res.headersSent) {
        res.status(500).send('Proxy error')
      }
    }
  })

  return router
}
