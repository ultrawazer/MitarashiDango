import { Router } from 'express'
import multer from 'multer'
import { UserAuthController } from '../controllers/user-auth.controller'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Only image files are allowed'))
    }
  },
})

export function createUserAuthRouter(): Router {
  const router = Router()
  const controller = new UserAuthController()

  router.get('/status', controller.getStatus)
  router.post('/setup', controller.setup)
  router.post('/login', controller.login)
  router.post('/logout', controller.logout)

  router.get('/me', controller.getMe)
  router.patch('/me', controller.updateMe)
  router.post('/me/change-password', controller.changePassword)
  router.post('/me/avatar', upload.single('avatar'), controller.uploadAvatar)
  router.get('/avatar/:userId', controller.getAvatar)

  router.get('/me/sessions', controller.getMySessions)
  router.delete('/me/sessions', controller.revokeOtherSessions)
  router.delete('/me/sessions/:token', controller.revokeMySession)

  return router
}
