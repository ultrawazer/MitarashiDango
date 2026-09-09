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
        res.json(result)
      } catch (err) {
        if ((err as Error).message === 'AUTH_REQUIRED') {
          if (await flareSolverrService.isEnabled(req.db)) {
            const solved = await flareSolverrService.solveAndCache('jasmr', 'https://japaneseasmr.com', req.db)
            if (solved.success) {
              try {
                const retryCtx = getExtensionContext('jasmr', req.headers)
                const result = await provider.browse(
                  {
                    query: req.query.q as string,
                    page: parseInt(req.query.page as string) || 1,
                    sort: req.query.sort as string,
                    rating: req.query.rating as string,
                  },
                  retryCtx
                )
                return res.json(result)
              } catch (retryErr) {
                logger.warn({ err: retryErr }, '[Asmr] browse retry after FlareSolverr solve failed')
              }
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
          tracks: streams?.[0]?.links || [],
          images,
          chapters,
        })
      } catch (err) {
        if ((err as Error).message === 'AUTH_REQUIRED') {
          if (await flareSolverrService.isEnabled(req.db)) {
            const solved = await flareSolverrService.solveAndCache('jasmr', 'https://japaneseasmr.com', req.db)
            if (solved.success) {
              try {
                const retryCtx = getExtensionContext('jasmr', req.headers)
                const episodes = await provider.getEpisodes(rjCode, retryCtx)
                const streams = await provider.getStreamUrls(rjCode, '1', retryCtx)
                const images = provider.getImages ? await provider.getImages(rjCode, retryCtx) : []
                const chapters = provider.getChapters ? await provider.getChapters(rjCode, retryCtx) : []

                return res.json({
                  rjCode,
                  description: episodes?.description || '',
                  tracks: streams?.[0]?.links || [],
                  images,
                  chapters,
                })
              } catch (retryErr) {
                logger.warn({ err: retryErr }, '[Asmr] work retry after FlareSolverr solve failed')
              }
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
