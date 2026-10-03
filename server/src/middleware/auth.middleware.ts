import type { Request, Response, NextFunction } from 'express'
import { getRequestToken, getSessionFromToken } from '../app-auth'
import { countUsers, getSystemDb, recordUserActivity } from '../system-db'
import { userDbManager } from '../user-db-manager'
import logger from '../logger'

declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string
      username: string
      displayName: string
      role: 'admin' | 'user'
      avatarPath?: string | null
    }
  }
}

const PUBLIC_EXACT_PATHS = new Set([
  '/api/auth/status',
  '/api/auth/setup',
  '/api/auth/login',
  '/api/auth/request-unblock',
  '/api/auth/google/callback',
  '/api/health',
  '/api/internal/shutdown',
])

function isPublicRoute(reqPath: string): boolean {
  if (!reqPath.startsWith('/api/')) return true
  if (PUBLIC_EXACT_PATHS.has(reqPath)) return true
  if (reqPath.startsWith('/api/auth/avatar/')) return true
  return false
}

const lastActiveCache = new Map<string, number>()
const ACTIVITY_UPDATE_INTERVAL_MS = 2 * 60 * 1000 // 2 minutes

function trackUserActivity(userId: string): void {
  const now = Date.now()
  const lastUpdate = lastActiveCache.get(userId) || 0
  if (now - lastUpdate > ACTIVITY_UPDATE_INTERVAL_MS) {
    lastActiveCache.set(userId, now)
    try {
      recordUserActivity(userId)
    } catch (err) {
      logger.warn({ err, userId }, 'Failed to record user activity')
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const isPublic = isPublicRoute(req.path)

    // Check if initial system setup has been completed
    const totalUsers = countUsers()
    if (totalUsers === 0) {
      if (
        !req.path.startsWith('/api/') ||
        req.path === '/api/auth/status' ||
        req.path === '/api/auth/setup'
      ) {
        req.db = getSystemDb()
        next()
        return
      }
      res.status(401).json({ error: 'SETUP_REQUIRED' })
      return
    }

    const token = getRequestToken(req)
    if (!token) {
      if (isPublic) {
        req.db = getSystemDb()
        next()
        return
      }
      res.status(401).json({ error: 'AUTH_REQUIRED' })
      return
    }

    const session = getSessionFromToken(token)
    if (!session) {
      if (isPublic) {
        req.db = getSystemDb()
        next()
        return
      }
      res.status(401).json({ error: 'AUTH_REQUIRED' })
      return
    }

    if (session.isActive !== 1) {
      res.status(403).json({ error: 'ACCOUNT_DISABLED' })
      return
    }

    if (session.isFlagged === 1) {
      res.status(403).json({ error: 'ACCOUNT_FLAGGED_MULTI_IP', canRequestUnblock: true })
      return
    }

    // Debounced page activity tracking
    trackUserActivity(session.userId)

    req.user = {
      id: session.userId,
      username: session.username,
      displayName: session.displayName,
      role: session.role,
      avatarPath: session.avatarPath,
    }

    // Resolve the user's specific database and inject into req.db
    req.db = await userDbManager.getDb(session.userId)
    next()
  } catch (err) {
    logger.error({ err, path: req.path }, 'Error in authMiddleware')
    res.status(500).json({ error: 'INTERNAL_AUTH_ERROR' })
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'ADMIN_REQUIRED' })
    return
  }
  next()
}
