import type { Request, Response, NextFunction } from 'express'
import { getRequestToken, getSessionFromToken } from '../app-auth'
import { countUsers, getSystemDb } from '../system-db'
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
  '/api/auth/google/callback',
  '/api/health',
  '/api/installation-id',
  '/api/internal/shutdown',
])

function isPublicRoute(reqPath: string): boolean {
  if (!reqPath.startsWith('/api/')) return true
  if (PUBLIC_EXACT_PATHS.has(reqPath)) return true
  if (reqPath.startsWith('/api/auth/avatar/')) return true
  return false
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const isPublic = isPublicRoute(req.path)

    // Check if initial system setup has been completed
    const totalUsers = countUsers()
    if (totalUsers === 0) {
      if (req.path === '/api/auth/status' || req.path === '/api/auth/setup') {
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
