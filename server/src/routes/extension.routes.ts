import { Router, Request, Response } from 'express'
import { ExtensionManager } from '../extensions/extension-manager'
import logger from '../logger'

export function createExtensionRouter(manager: ExtensionManager): Router {
  const router = Router()

  // List installed extensions
  router.get('/extensions', (req: Request, res: Response) => {
    try {
      const type = req.query.type as string | undefined
      let installed = manager.getInstalled()
      if (type) {
        installed = installed.filter((ext) => ext.metadata.type === type)
      }
      res.json(installed)
    } catch (err) {
      logger.error({ err }, 'Failed to get installed extensions')
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // List available extensions in repo
  router.get('/extensions/available', async (_req: Request, res: Response) => {
    try {
      const available = await manager.getAvailable()
      res.json(available)
    } catch (err) {
      logger.error({ err }, 'Failed to get available extensions')
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // Install or update extension
  router.post('/extensions/install/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string
      const result = await manager.install(id)
      if (result.success) {
        res.json({ success: true, id })
      } else {
        res.status(400).json({ success: false, error: result.error || 'Failed to install' })
      }
    } catch (err) {
      logger.error({ err, id: req.params.id }, 'Install extension failed')
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // Uninstall extension
  router.post('/extensions/uninstall/:id', (req: Request, res: Response) => {
    try {
      const id = req.params.id as string
      const result = manager.uninstall(id)
      if (result.success) {
        res.json({ success: true, id })
      } else {
        res.status(400).json({ success: false, error: result.error })
      }
    } catch (err) {
      logger.error({ err, id: req.params.id }, 'Uninstall extension failed')
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // Toggle extension
  router.post('/extensions/toggle/:id', (req: Request, res: Response) => {
    try {
      const id = req.params.id as string
      const enabled = typeof req.body?.enabled === 'boolean' ? req.body.enabled : undefined
      const result = manager.toggle(id, enabled)
      res.json(result)
    } catch (err) {
      logger.error({ err, id: req.params.id }, 'Toggle extension failed')
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // Reload extensions from disk
  router.post('/extensions/reload', (_req: Request, res: Response) => {
    try {
      manager.reload()
      res.json({ success: true, count: manager.getInstalled().length })
    } catch (err) {
      logger.error({ err }, 'Reload extensions failed')
      res.status(500).json({ error: (err as Error).message })
    }
  })

  return router
}
