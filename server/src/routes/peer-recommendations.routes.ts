import { Router } from 'express'
import { PeerRecommendationsController } from '../controllers/peer-recommendations.controller'

export function createPeerRecommendationsRouter(): Router {
  const router = Router()
  const controller = new PeerRecommendationsController()

  router.get('/recipients', (req, res) => controller.getRecipients(req, res))
  router.post('/send', (req, res) => controller.sendRecommendation(req, res))
  router.get('/feed', (req, res) => controller.getFeed(req, res))
  router.get('/notifications', (req, res) => controller.getNotifications(req, res))
  router.post('/:id/read', (req, res) => controller.markRead(req, res))
  router.post('/dismiss-show/:showId', (req, res) => controller.dismissShow(req, res))
  router.delete('/:id', (req, res) => controller.dismissOne(req, res))

  return router
}
