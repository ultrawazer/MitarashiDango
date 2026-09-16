import { Router, Request, Response } from 'express'
import NodeCache from 'node-cache'
import { AsmrExtension } from '../extensions/extension.types'
import logger from '../logger'
import { getExtensionContext } from '../utils/request-context'
import { flareSolverrService } from '../services/flaresolverr.service'

function makeCacheMiddleware(cache: NodeCache, keyFn: (req: Request) => string, ttl?: number) {
  return (req: Request, res: Response, next: () => void) => {
    const cacheKey = keyFn(req)
    const cached = cache.get(cacheKey)
    if (cached) return res.json(cached)

    const originalJson = res.json.bind(res)
    res.json = (data: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        if (ttl !== undefined) cache.set(cacheKey, data, ttl)
        else cache.set(cacheKey, data)
      }
      return originalJson(data)
    }
    next()
  }
}

export function createAsmrRouter(
  apiCache: NodeCache,
  getAsmrProvider: (id?: string) => AsmrExtension | null
): Router {
  const router = Router()

  router.get(
    '/asmr/browse',
    makeCacheMiddleware(
      apiCache,
      (req) =>
        `route-asmr-browse-${req.query.q || ''}-${req.query.page || 1}-${req.query.sort || ''}-${
          req.query.rating || ''
        }-${req.query.sort === 'random' ? Date.now() : ''}`,
      300
    ),
    async (req, res) => {
      const provider = getAsmrProvider(req.query.provider as string)
      if (!provider) {
        return res.json({ shows: [], hasNext: false })
      }
      try {

        const ctx = getExtensionContext('jasmr', req.headers)
        const result = await provider.browse(
          {
            query: req.query.q as string,
            page: parseInt(req.query.page as string) || 1,
            sort: req.query.sort as string,
            rating: req.query.rating as string,
          },
          ctx
        )
        if (Array.isArray(result?.shows)) {
          result.shows = result.shows.map((s: any) => ({
            ...s,
            thumbnail: proxyAsmrThumbnail(s.thumbnail, ctx),
          }))
        }
        res.json(result)
      } catch (err) {
        if ((err as Error).message === 'AUTH_REQUIRED') {
          if ((await flareSolverrService.isEnabled(req.db)) && flareSolverrService.canAttemptSolve('jasmr')) {
            const solved = await flareSolverrService.solveAndCache('jasmr', 'https://japaneseasmr.com', req.db)
            if (solved.success) {
              try {
                const fsUrl = await flareSolverrService.getBaseUrl(req.db)
                const fsTimeout = await flareSolverrService.getMaxTimeout(req.db)
                const retryCtx = {
                  ...getExtensionContext('jasmr', req.headers),
                  cookie: solved.cookie,
                  ua: solved.ua,
                  flaresolverrUrl: fsUrl,
                  flaresolverrTimeout: fsTimeout,
                }
                const result = await provider.browse(
                  {
                    query: req.query.q as string,
                    page: parseInt(req.query.page as string) || 1,
                    sort: req.query.sort as string,
                    rating: req.query.rating as string,
                  },
                  retryCtx
                )
                if (Array.isArray(result?.shows)) {
                  result.shows = result.shows.map((s: any) => ({
                    ...s,
                    thumbnail: proxyAsmrThumbnail(s.thumbnail, retryCtx),
                  }))
                }
                flareSolverrService.recordSolveSuccess('jasmr')
                return res.json(result)
              } catch (retryErr) {
                logger.warn({ err: retryErr }, '[Asmr] browse retry after FlareSolverr solve failed')
                flareSolverrService.recordSolveFailure('jasmr')
              }
            } else {
              flareSolverrService.recordSolveFailure('jasmr')
            }
          }
          return res.status(403).json({
            error: 'AUTH_REQUIRED',
            provider: 'jasmr',
            name: 'Japanese ASMR',
            authUrl: 'https://japaneseasmr.com',
          })
        }
        logger.error({ err }, '[Asmr] browse failed')
        res.json({ shows: [], hasNext: false })
      }
    }
  )

  function proxyAsmrThumbnail(thumb?: string, ctx?: { cookie?: string; ua?: string }) {
    if (!thumb || typeof thumb !== 'string') return thumb
    if (thumb.startsWith('/api/proxy')) return thumb
    if (thumb.startsWith('http://') || thumb.startsWith('https://')) {
      let proxied = `/api/proxy?url=${encodeURIComponent(thumb)}&referer=${encodeURIComponent('https://japaneseasmr.com/')}`
      if (ctx?.cookie) proxied += `&cookie=${encodeURIComponent(ctx.cookie)}`
      if (ctx?.ua) proxied += `&ua=${encodeURIComponent(ctx.ua)}`
      return proxied
    }
    return thumb
  }

  function proxyAsmrImages(images: string[], ctx?: { cookie?: string; ua?: string }) {
    if (!Array.isArray(images)) return []
    return images.map((img: string) => {
      if (!img || typeof img !== 'string') return img
      const isProxied = img.startsWith('/api/proxy')
      if (!isProxied && (img.startsWith('http://') || img.startsWith('https://'))) {
        let proxied = `/api/proxy?url=${encodeURIComponent(img)}&referer=${encodeURIComponent('https://japaneseasmr.com/')}`
        if (ctx?.cookie) proxied += `&cookie=${encodeURIComponent(ctx.cookie)}`
        if (ctx?.ua) proxied += `&ua=${encodeURIComponent(ctx.ua)}`
        return proxied
      }
      return img
    })
  }

  function proxyAsmrTracks(rawTracks: any[], ctx?: { cookie?: string; ua?: string }) {
    if (!Array.isArray(rawTracks)) return []
    return rawTracks.map((t: any) => {
      if (!t?.link || typeof t.link !== 'string') return t
      const link = t.link
      const isProxied = link.startsWith('/api/proxy')
      if (!isProxied && (link.startsWith('http://') || link.startsWith('https://'))) {
        const referer = t.headers?.Referer || 'https://japaneseasmr.com/'
        let proxiedLink = `/api/proxy?url=${encodeURIComponent(link)}&referer=${encodeURIComponent(referer)}`
        if (ctx?.cookie) {
          proxiedLink += `&cookie=${encodeURIComponent(ctx.cookie)}`
        }
        if (ctx?.ua) {
          proxiedLink += `&ua=${encodeURIComponent(ctx.ua)}`
        }
        return {
          ...t,
          link: proxiedLink,
        }
      }
      return t
    })
  }

  router.get(
    '/asmr/work/:rj',
    makeCacheMiddleware(apiCache, (req) => `route-asmr-work-${req.params.rj}`, 1800),
    async (req, res) => {
      const provider = getAsmrProvider(req.query.provider as string)
      const rjCode = String(req.params.rj).trim().toUpperCase()
      if (!provider) {
        return res.json({ rjCode, description: '', tracks: [], images: [], chapters: [] })
      }
      try {
        const ctx = getExtensionContext('jasmr', req.headers)

        const episodes = await provider.getEpisodes(rjCode, ctx)
        const streams = await provider.getStreamUrls(rjCode, '1', ctx)
        const images = provider.getImages ? await provider.getImages(rjCode, ctx) : []
        const chapters = provider.getChapters ? await provider.getChapters(rjCode, ctx) : []

        res.json({
          rjCode,
          description: episodes?.description || '',
          tracks: proxyAsmrTracks(streams?.[0]?.links || [], ctx),
          images: proxyAsmrImages(images, ctx),
          chapters,
        })
      } catch (err) {
        if ((err as Error).message === 'AUTH_REQUIRED') {
          if ((await flareSolverrService.isEnabled(req.db)) && flareSolverrService.canAttemptSolve('jasmr')) {
            const solved = await flareSolverrService.solveAndCache('jasmr', 'https://japaneseasmr.com', req.db)
            if (solved.success) {
              try {
                const fsUrl = await flareSolverrService.getBaseUrl(req.db)
                const fsTimeout = await flareSolverrService.getMaxTimeout(req.db)
                const retryCtx = {
                  ...getExtensionContext('jasmr', req.headers),
                  cookie: solved.cookie,
                  ua: solved.ua,
                  flaresolverrUrl: fsUrl,
                  flaresolverrTimeout: fsTimeout,
                }
                const episodes = await provider.getEpisodes(rjCode, retryCtx)
                const streams = await provider.getStreamUrls(rjCode, '1', retryCtx)
                const images = provider.getImages ? await provider.getImages(rjCode, retryCtx) : []
                const chapters = provider.getChapters ? await provider.getChapters(rjCode, retryCtx) : []

                flareSolverrService.recordSolveSuccess('jasmr')
                return res.json({
                  rjCode,
                  description: episodes?.description || '',
                  tracks: proxyAsmrTracks(streams?.[0]?.links || [], retryCtx),
                  images: proxyAsmrImages(images, retryCtx),
                  chapters,
                })
              } catch (retryErr) {
                logger.warn({ err: retryErr }, '[Asmr] work retry after FlareSolverr solve failed')
                flareSolverrService.recordSolveFailure('jasmr')
              }
            } else {
              flareSolverrService.recordSolveFailure('jasmr')
            }
          }
          return res.status(403).json({
            error: 'AUTH_REQUIRED',
            provider: 'jasmr',
            name: 'Japanese ASMR',
            authUrl: 'https://japaneseasmr.com',
          })
        }
        logger.error({ err, rj: req.params.rj }, '[Asmr] work fetch failed')
        res.json({ rjCode: req.params.rj, description: '', tracks: [], images: [], chapters: [] })
      }
    }
  )

  return router
}
