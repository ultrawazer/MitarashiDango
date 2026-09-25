import { Router } from 'express'
import { RecommendationsController } from '../controllers/recommendations.controller'

export function createRecommendationsRouter(): Router {
  const router = Router()
  const controller = new RecommendationsController()

  router.get('/recommendations/for-you', controller.getForYou)
  router.get('/recommendations/local-library', controller.getLocalLibrary)
  router.get('/recommendations/profile', controller.getProfile)
  router.post('/recommendations/refresh', controller.refresh)
  router.post('/recommendations/:showId/dismiss', controller.dismiss)
  router.delete('/recommendations/:showId/dismiss', controller.undismiss)

  return router
}
