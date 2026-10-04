import type { Request, Response } from 'express'
import crypto from 'crypto'
import {
  getUserById,
  createPeerRecommendation,
  getPendingPeerRecommendation,
  getPeerRecommendationsForRecipient,
  getUnreadPeerNotifications,
  markPeerRecommendationAsRead,
  dismissPeerRecommendationsForShow,
  dismissPeerRecommendation,
  listEligibleRecipients,
} from '../system-db'
import logger from '../logger'

export class PeerRecommendationsController {
  public async getRecipients(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'AUTH_REQUIRED' })
        return
      }

      const recipients = listEligibleRecipients(req.user.id)
      res.json({ recipients })
    } catch (err) {
      logger.error({ err }, 'Error in getRecipients')
      res.status(500).json({ error: 'FAILED_TO_FETCH_RECIPIENTS' })
    }
  }

  public async sendRecommendation(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'AUTH_REQUIRED' })
        return
      }

      const {
        recipientId,
        showId,
        showTitle,
        showTitleEnglish,
        showTitleNative,
        showThumbnail,
        showType,
        note,
      } = req.body

      if (!recipientId || typeof recipientId !== 'string') {
        res.status(400).json({ error: 'MISSING_RECIPIENT_ID' })
        return
      }

      if (recipientId === req.user.id) {
        res.status(400).json({ error: 'CANNOT_RECOMMEND_TO_SELF' })
        return
      }

      if (!showId || typeof showId !== 'string' || !showTitle || typeof showTitle !== 'string') {
        res.status(400).json({ error: 'MISSING_SHOW_DETAILS' })
        return
      }

      const recipient = getUserById(recipientId)
      if (!recipient || recipient.isActive !== 1 || recipient.isFlagged === 1) {
        res.status(404).json({ error: 'RECIPIENT_NOT_FOUND_OR_INACTIVE' })
        return
      }

      const cleanedNote = typeof note === 'string' ? note.trim().slice(0, 280) : null

      const existing = getPendingPeerRecommendation(req.user.id, recipientId, showId)
      if (existing) {
        res.status(400).json({
          error: 'RECOMMENDATION_ALREADY_PENDING',
          message: `You have already recommended this anime to @${recipient.username}.`,
        })
        return
      }

      const id = crypto.randomUUID()
      createPeerRecommendation({
        id,
        senderId: req.user.id,
        recipientId,
        showId,
        showTitle: showTitle.trim(),
        showTitleEnglish: showTitleEnglish?.trim() || null,
        showTitleNative: showTitleNative?.trim() || null,
        showThumbnail: showThumbnail || null,
        showType: showType || null,
        note: cleanedNote,
      })

      logger.info(
        { senderId: req.user.id, recipientId, showId },
        'Peer recommendation created successfully'
      )

      res.status(201).json({
        success: true,
        id,
        message: `Recommendation sent to ${recipient.displayName}`,
      })
    } catch (err) {
      logger.error({ err }, 'Error in sendRecommendation')
      res.status(500).json({ error: 'FAILED_TO_SEND_RECOMMENDATION' })
    }
  }

  public async getFeed(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'AUTH_REQUIRED' })
        return
      }

      const rawItems = getPeerRecommendationsForRecipient(req.user.id)

      // Group by showId
      const groupsMap = new Map<
        string,
        {
          showId: string
          showTitle: string
          showTitleEnglish: string | null
          showTitleNative: string | null
          showThumbnail: string | null
          showType: string | null
          latestCreatedAt: string
          recommenders: Array<{
            id: string
            senderId: string
            username: string
            displayName: string
            avatarPath: string | null
            note: string | null
            createdAt: string
            status: string
          }>
        }
      >()

      for (const item of rawItems) {
        if (!groupsMap.has(item.showId)) {
          groupsMap.set(item.showId, {
            showId: item.showId,
            showTitle: item.showTitle,
            showTitleEnglish: item.showTitleEnglish,
            showTitleNative: item.showTitleNative,
            showThumbnail: item.showThumbnail,
            showType: item.showType,
            latestCreatedAt: item.createdAt,
            recommenders: [],
          })
        }

        const group = groupsMap.get(item.showId)!
        group.recommenders.push({
          id: item.id,
          senderId: item.senderId,
          username: item.senderUsername,
          displayName: item.senderDisplayName,
          avatarPath: item.senderAvatarPath,
          note: item.note,
          createdAt: item.createdAt,
          status: item.status,
        })

        if (new Date(item.createdAt).getTime() > new Date(group.latestCreatedAt).getTime()) {
          group.latestCreatedAt = item.createdAt
        }
      }

      const feed = Array.from(groupsMap.values())
        .map((g) => ({
          ...g,
          count: g.recommenders.length,
        }))
        // Social proof gravity sort: most recommenders first, then newest
        .sort((a, b) => {
          if (b.count !== a.count) {
            return b.count - a.count
          }
          return new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime()
        })

      res.json({ recommendations: feed })
    } catch (err) {
      logger.error({ err }, 'Error in getFeed')
      res.status(500).json({ error: 'FAILED_TO_FETCH_FEED' })
    }
  }

  public async getNotifications(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'AUTH_REQUIRED' })
        return
      }

      const unread = getUnreadPeerNotifications(req.user.id)
      const notifications = unread.map((rec) => ({
        id: rec.id,
        showId: rec.showId,
        title: `${rec.senderDisplayName} recommended ${rec.showTitle}`,
        sender: {
          id: rec.senderId,
          username: rec.senderUsername,
          displayName: rec.senderDisplayName,
          avatarPath: rec.senderAvatarPath,
        },
        show: {
          id: rec.showId,
          title: rec.showTitle,
          englishTitle: rec.showTitleEnglish,
          nativeTitle: rec.showTitleNative,
          thumbnail: rec.showThumbnail,
          type: rec.showType,
        },
        note: rec.note,
        createdAt: rec.createdAt,
      }))

      res.json({ notifications })
    } catch (err) {
      logger.error({ err }, 'Error in getNotifications')
      res.status(500).json({ error: 'FAILED_TO_FETCH_NOTIFICATIONS' })
    }
  }

  public async markRead(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'AUTH_REQUIRED' })
        return
      }

      const id = String(req.params.id)
      markPeerRecommendationAsRead(id, req.user.id)
      res.json({ success: true })
    } catch (err) {
      logger.error({ err }, 'Error in markRead')
      res.status(500).json({ error: 'FAILED_TO_MARK_READ' })
    }
  }

  public async dismissShow(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'AUTH_REQUIRED' })
        return
      }

      const showId = String(req.params.showId)
      dismissPeerRecommendationsForShow(showId, req.user.id)
      res.json({ success: true })
    } catch (err) {
      logger.error({ err }, 'Error in dismissShow')
      res.status(500).json({ error: 'FAILED_TO_DISMISS_SHOW' })
    }
  }

  public async dismissOne(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'AUTH_REQUIRED' })
        return
      }

      const id = String(req.params.id)
      dismissPeerRecommendation(id, req.user.id)
      res.json({ success: true })
    } catch (err) {
      logger.error({ err }, 'Error in dismissOne')
      res.status(500).json({ error: 'FAILED_TO_DISMISS' })
    }
  }
}
