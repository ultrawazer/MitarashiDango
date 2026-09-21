import { Router } from 'express'
import { AdminController } from '../controllers/admin.controller'
import { requireAdmin } from '../middleware/auth.middleware'

export function createAdminRouter(): Router {
  const router = Router()
  const controller = new AdminController()

  // Guard all admin routes with requireAdmin
  router.use(requireAdmin)

  router.get('/users', controller.getUsers)
  router.post('/users', controller.createUser)
  router.patch('/users/:id', controller.updateUser)
  router.post('/users/:id/reset-password', controller.resetPassword)
  router.delete('/users/:id', controller.deleteUser)
  router.delete('/users/:id/purge', controller.purgeUser)

  router.get('/sessions', controller.getSessions)
  router.delete('/sessions/:token', controller.revokeSession)

  router.get('/settings', controller.getSettings)
  router.put('/settings', controller.updateSettings)
  router.post('/settings', controller.updateSettings)
  router.get('/global-settings', controller.getSettings)
  router.post('/global-settings', controller.updateSettings)
  router.put('/global-settings', controller.updateSettings)

  return router
}
