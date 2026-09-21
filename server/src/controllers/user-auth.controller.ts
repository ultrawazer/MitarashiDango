import type { Request, Response } from 'express'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import {
  countUsers,
  createUser,
  getUserById,
  getUserByUsername,
  updateUser,
  getGlobalSetting,
  deleteSession,
  getSystemDb,
} from '../system-db'
import {
  hashPassword,
  verifyPassword,
  createNewSession,
  revokeSession,
  buildSessionCookie,
  clearSessionCookie,
  getRequestToken,
} from '../app-auth'
import { checkLegacyDataExists, migrateLegacyDataToAdmin } from '../migration/multi-user-migration'
import { userDbManager, setPrimaryDb } from '../user-db-manager'
import logger from '../logger'

const paramToString = (param: string | string[] | undefined): string =>
  Array.isArray(param) ? param[0] : param || ''

export class UserAuthController {
  getStatus = async (_req: Request, res: Response): Promise<void> => {
    try {
      const totalUsers = countUsers()
      const isSetup = totalUsers > 0
      const hasLegacyData = !isSetup && checkLegacyDataExists()
      const registrationEnabled = getGlobalSetting('registration_enabled') === 'true'

      res.json({
        isSetup,
        hasLegacyData,
        registrationEnabled,
      })
    } catch (err) {
      logger.error({ err }, 'Failed to get user auth status')
      res.status(500).json({ error: 'FAILED_TO_GET_STATUS' })
    }
  }

  setup = async (req: Request, res: Response): Promise<void> => {
    try {
      const totalUsers = countUsers()
      if (totalUsers > 0) {
        res.status(400).json({ error: 'SETUP_ALREADY_COMPLETED' })
        return
      }

      const { username, displayName, password } = req.body ?? {}
      if (!username || typeof username !== 'string' || username.trim().length < 2) {
        res.status(400).json({ error: 'Username must be at least 2 characters' })
        return
      }
      if (!password || typeof password !== 'string' || password.length < 4) {
        res.status(400).json({ error: 'Password must be at least 4 characters' })
        return
      }

      const adminId = crypto.randomUUID()
      const passwordHash = hashPassword(password)

      if (checkLegacyDataExists()) {
        logger.info('Legacy single-user data detected, executing migration to admin')
        await migrateLegacyDataToAdmin(adminId)
      }
      const adminDb = await userDbManager.getDb(adminId)
      setPrimaryDb(adminDb)

      createUser({
        id: adminId,
        username: username.trim().toLowerCase(),
        displayName: displayName && typeof displayName === 'string' ? displayName.trim() : username.trim(),
        passwordHash,
        role: 'admin',
      })

      const userAgent = req.headers['user-agent']
      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress
      const { token, expiresAt } = createNewSession(adminId, userAgent, ip, true)

      res.setHeader('Set-Cookie', buildSessionCookie(token, expiresAt))
      res.json({
        success: true,
        user: {
          id: adminId,
          username: username.trim().toLowerCase(),
          displayName: displayName || username.trim(),
          role: 'admin',
          avatarUrl: null,
        },
        token,
      })
    } catch (err) {
      logger.error({ err }, 'Admin setup failed')
      res.status(500).json({ error: 'SETUP_FAILED' })
    }
  }

  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const { username, password, rememberMe } = req.body ?? {}
      if (!username || !password) {
        res.status(400).json({ error: 'Username and password required' })
        return
      }

      const user = getUserByUsername(username)
      if (!user) {
        res.status(401).json({ error: 'Invalid username or password' })
        return
      }

      if (user.isActive !== 1) {
        res.status(403).json({ error: 'Account is disabled. Contact your administrator.' })
        return
      }

      const valid = verifyPassword(password, user.passwordHash)
      if (!valid) {
        res.status(401).json({ error: 'Invalid username or password' })
        return
      }

      updateUser(user.id, { lastLoginAt: new Date().toISOString() })

      if (user.role === 'admin') {
        try {
          const adminDb = await userDbManager.getDb(user.id)
          setPrimaryDb(adminDb)
        } catch (err) {
          logger.warn({ err }, 'Could not update primary DB on admin login')
        }
      }

      const userAgent = req.headers['user-agent']
      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress
      const isRemember = rememberMe === true || rememberMe === 'true'
      const { token, expiresAt } = createNewSession(user.id, userAgent, ip, isRemember)

      res.setHeader('Set-Cookie', buildSessionCookie(token, expiresAt))
      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          avatarUrl: user.avatarPath ? `/api/auth/avatar/${user.id}` : null,
        },
        token,
      })
    } catch (err) {
      logger.error({ err }, 'Login error')
      res.status(500).json({ error: 'LOGIN_FAILED' })
    }
  }

  logout = async (req: Request, res: Response): Promise<void> => {
    try {
      const token = getRequestToken(req)
      if (token) {
        revokeSession(token)
      }
      res.setHeader('Set-Cookie', clearSessionCookie())
      res.json({ success: true })
    } catch (err) {
      logger.error({ err }, 'Logout error')
      res.status(500).json({ error: 'LOGOUT_FAILED' })
    }
  }

  getMe = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'AUTH_REQUIRED' })
      return
    }

    const user = getUserById(req.user.id)
    if (!user) {
      res.status(404).json({ error: 'USER_NOT_FOUND' })
      return
    }

    res.json({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      avatarUrl: user.avatarPath ? `/api/auth/avatar/${user.id}` : null,
    })
  }

  updateMe = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'AUTH_REQUIRED' })
      return
    }

    const { displayName } = req.body ?? {}
    if (!displayName || typeof displayName !== 'string' || displayName.trim().length < 1) {
      res.status(400).json({ error: 'Display name cannot be empty' })
      return
    }

    updateUser(req.user.id, { displayName: displayName.trim() })
    res.json({ success: true, displayName: displayName.trim() })
  }

  changePassword = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'AUTH_REQUIRED' })
      return
    }

    const { currentPassword, newPassword } = req.body ?? {}
    if (!currentPassword || !newPassword || typeof newPassword !== 'string' || newPassword.length < 4) {
      res.status(400).json({ error: 'New password must be at least 4 characters' })
      return
    }

    const user = getUserById(req.user.id)
    if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
      res.status(400).json({ error: 'Current password is incorrect' })
      return
    }

    const newHash = hashPassword(newPassword)
    updateUser(req.user.id, { passwordHash: newHash })
    res.json({ success: true })
  }

  uploadAvatar = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'AUTH_REQUIRED' })
      return
    }

    try {
      const file = req.file
      if (!file) {
        res.status(400).json({ error: 'No image file uploaded' })
        return
      }

      const userDir = userDbManager.getUserDir(req.user.id)
      if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true })
      }

      const ext = path.extname(file.originalname).toLowerCase() || '.png'
      const targetFilename = `avatar${ext}`
      const targetPath = path.join(userDir, targetFilename)

      fs.writeFileSync(targetPath, file.buffer)
      updateUser(req.user.id, { avatarPath: targetFilename })

      res.json({
        success: true,
        avatarUrl: `/api/auth/avatar/${req.user.id}?t=${Date.now()}`,
      })
    } catch (err) {
      logger.error({ err }, 'Failed to upload avatar')
      res.status(500).json({ error: 'FAILED_TO_UPLOAD_AVATAR' })
    }
  }

  getAvatar = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = paramToString(req.params.userId)
      if (!userId) {
        res.status(400).json({ error: 'Missing userId' })
        return
      }

      const user = getUserById(userId)
      if (!user || !user.avatarPath) {
        res.status(404).json({ error: 'No avatar' })
        return
      }

      const filePath = path.join(userDbManager.getUserDir(userId), user.avatarPath)
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Avatar file not found' })
        return
      }

      res.sendFile(filePath)
    } catch (err) {
      logger.error({ err }, 'Error retrieving avatar')
      res.status(500).json({ error: 'FAILED_TO_RETRIEVE_AVATAR' })
    }
  }

  getMySessions = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'AUTH_REQUIRED' })
      return
    }

    const currentToken = getRequestToken(req)
    const rows = getSystemDb().all<any>(
      `SELECT token, created_at AS createdAt, expires_at AS expiresAt, user_agent AS userAgent, ip_address AS ipAddress
       FROM sessions
       WHERE user_id = ? AND datetime(expires_at) > datetime('now')
       ORDER BY created_at DESC`,
      [req.user.id]
    )

    const sessions = rows.map((s) => ({
      token: s.token,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      isCurrent: s.token === currentToken,
    }))

    res.json({ sessions })
  }

  revokeMySession = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'AUTH_REQUIRED' })
      return
    }

    const tokenToRevoke = paramToString(req.params.token)
    if (!tokenToRevoke) {
      res.status(400).json({ error: 'Token required' })
      return
    }

    const row = getSystemDb().get<any>(
      `SELECT user_id FROM sessions WHERE token = ?`,
      [tokenToRevoke]
    )
    if (!row || row.user_id !== req.user.id) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    deleteSession(tokenToRevoke)
    res.json({ success: true })
  }

  revokeOtherSessions = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'AUTH_REQUIRED' })
      return
    }

    const currentToken = getRequestToken(req)
    if (currentToken) {
      getSystemDb().run(
        `DELETE FROM sessions WHERE user_id = ? AND token != ?`,
        [req.user.id, currentToken]
      )
    } else {
      getSystemDb().run(`DELETE FROM sessions WHERE user_id = ?`, [req.user.id])
    }

    res.json({ success: true })
  }
}
