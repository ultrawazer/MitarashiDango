import { Router } from 'express'
import { SyncAuthController } from '../controllers/sync-auth.controller'
import { DatabaseWrapper } from '../db'

export function createSyncAuthRouter(
  runSyncSequence: (
    db: DatabaseWrapper,
    provider?: 'github' | 'google' | 'rclone' | 'none'
  ) => Promise<void>
): Router {
  const router = Router()
  const controller = new SyncAuthController(runSyncSequence)

  router.get('/config-status', controller.getConfigStatus)
  router.get('/google-auth', controller.getGoogleAuthSettings)
  router.post('/google-auth', controller.updateGoogleAuthSettings)
  router.get('/github/status', controller.getGitHubAuthStatus)
  router.post('/github/start', controller.startGitHubDeviceAuth)
  router.get('/github/poll', controller.pollGitHubDeviceAuth)
  router.post('/github/logout', controller.logoutGitHub)
  router.get('/github/auth', controller.getGitHubAuthOverride)
  router.post('/github/auth', controller.updateGitHubAuthSettings)
  router.get('/settings/rclone', controller.getRcloneSettings)
  router.post('/settings/rclone', controller.updateRcloneSettings)
  router.get('/settings/sync', controller.getSyncSettings)
  router.post('/settings/sync', controller.updateSyncProvider)
  router.get('/google', controller.getAuthUrl)
  router.post('/google/login', controller.loginGoogle)
  router.get('/google/callback', controller.handleCallback)
  router.get('/user', controller.getUserProfile)
  router.post('/google/logout', controller.logout)
  router.post('/sync/logout', controller.logout)

  return router
}
