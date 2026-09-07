import { Router } from 'express'
import { InsightsController } from '../controllers/insights.controller'

export function createInsightsRouter(): Router {
  const router = Router()
  const controller = new InsightsController()

  router.get('/insights', controller.getWatchInsights)
  router.get('/insights/genre-cards', controller.getGenreCards)
  router.get('/insights/activity-day', controller.getActivityDayDetails)
  router.get('/insights/genre-shows', controller.getGenreShows)

  return router
}
