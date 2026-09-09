import { Router, Request, Response } from 'express'
import { flareSolverrService } from '../services/flaresolverr.service'
import logger from '../logger'

export function createFlareSolverrRouter(): Router {
  const router = Router()

  // Get current FlareSolverr configuration
  router.get('/flaresolverr/config', async (req: Request, res: Response) => {
    try {
      const config = await flareSolverrService.getConfig(req.db)
      res.json(config)
    } catch (err) {
      logger.error({ err }, 'Failed to get FlareSolverr config')
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // Test connection to FlareSolverr
  router.post('/flaresolverr/test', async (req: Request, res: Response) => {
    try {
      const { url, port } = req.body || {}
      const result = await flareSolverrService.testConnection(url, port, req.db)
      res.json(result)
    } catch (err) {
      logger.error({ err }, 'Failed to test FlareSolverr connection')
      res.status(500).json({ success: false, error: (err as Error).message })
    }
  })

  // On-demand challenge solve for an extension
  router.post('/flaresolverr/solve/:extensionId', async (req: Request, res: Response) => {
    try {
      const extensionId = req.params.extensionId as string
      const { authUrl } = req.body || {}
      if (!authUrl) {
        return res.status(400).json({ success: false, error: 'authUrl is required' })
      }
      const result = await flareSolverrService.solveAndCache(extensionId, authUrl, req.db)
      res.json(result)
    } catch (err) {
      logger.error({ err }, 'Failed to solve challenge with FlareSolverr')
      res.status(500).json({ success: false, error: (err as Error).message })
    }
  })

  return router
}
