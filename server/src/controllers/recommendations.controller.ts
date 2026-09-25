import { Request, Response } from 'express'
import { RecommendationService } from '../services/recommendation.service'
import { RecommendationsRepository } from '../repositories/recommendations.repository'
import logger from '../logger'

const log = logger.child({ module: 'RecommendationsController' })

export class RecommendationsController {
  /**
   * GET /api/recommendations/for-you
   */
  getForYou = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0
      const forceRefresh = req.query.refresh === 'true'

      const result = await RecommendationService.getRecommendations(req.db, {
        sourceType: 'for_you',
        limit,
        offset,
        forceRefresh,
      })

      res.json({
        success: true,
        data: result.items,
        fresh: result.fresh,
        profile: result.profile,
      })
    } catch (err) {
      log.error({ err }, 'Failed getting for-you recommendations')
      res.status(500).json({ success: false, error: 'Failed to retrieve recommendations' })
    }
  }

  /**
   * GET /api/recommendations/local-library
   */
  getLocalLibrary = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0
      const forceRefresh = req.query.refresh === 'true'

      const result = await RecommendationService.getRecommendations(req.db, {
        sourceType: 'local_library',
        limit,
        offset,
        forceRefresh,
      })

      res.json({
        success: true,
        data: result.items,
        fresh: result.fresh,
      })
    } catch (err) {
      log.error({ err }, 'Failed getting local library recommendations')
      res.status(500).json({ success: false, error: 'Failed to retrieve local library recommendations' })
    }
  }

  /**
   * GET /api/recommendations/profile
   */
  getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const profile = RecommendationsRepository.getTasteProfile(req.db, 'current_profile')
      res.json({ success: true, profile })
    } catch (err) {
      log.error({ err }, 'Failed getting taste profile')
      res.status(500).json({ success: false, error: 'Failed to retrieve taste profile' })
    }
  }

  /**
   * POST /api/recommendations/refresh
   */
  refresh = async (req: Request, res: Response): Promise<void> => {
    try {
      // Start background calculation
      RecommendationService.refreshRecommendations(req.db).catch((err) => {
        log.error({ err }, 'Background recommendation recalculation failed')
      })

      res.json({
        success: true,
        message: 'Recommendation recalculation started in the background',
      })
    } catch (err) {
      log.error({ err }, 'Failed initiating recommendation refresh')
      res.status(500).json({ success: false, error: 'Failed to initiate refresh' })
    }
  }

  /**
   * POST /api/recommendations/:showId/dismiss
   */
  dismiss = async (req: Request, res: Response): Promise<void> => {
    try {
      const showId = String(req.params.showId || '')
      if (!showId) {
        res.status(400).json({ success: false, error: 'showId is required' })
        return
      }

      RecommendationsRepository.dismiss(req.db, showId)
      res.json({ success: true, message: `Show ${showId} dismissed from recommendations` })
    } catch (err) {
      log.error({ err }, 'Failed dismissing recommendation')
      res.status(500).json({ success: false, error: 'Failed to dismiss recommendation' })
    }
  }

  /**
   * DELETE /api/recommendations/:showId/dismiss
   */
  undismiss = async (req: Request, res: Response): Promise<void> => {
    try {
      const showId = String(req.params.showId || '')
      if (!showId) {
        res.status(400).json({ success: false, error: 'showId is required' })
        return
      }

      RecommendationsRepository.undismiss(req.db, showId)
      res.json({ success: true, message: `Show ${showId} restored to recommendations` })
    } catch (err) {
      log.error({ err }, 'Failed restoring dismissed recommendation')
      res.status(500).json({ success: false, error: 'Failed to restore recommendation' })
    }
  }
}
