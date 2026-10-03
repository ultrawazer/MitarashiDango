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
  getRecentLoginIps,
  recordLoginAttempt,
  createUnblockRequest,
  getPendingUnblockRequestForUser,
} from '../system-db'
import {
  hashPassword,
  verifyPassword,
  createNewSession,
  revokeSession,
  revokeAllUserSessions,
  buildSessionCookie,
  clearSessionCookie,
  getRequestToken,
} from '../app-auth'
import { checkLegacyDataExists, migrateLegacyDataToAdmin } from '../migration/multi-user-migration'
import { userDbManager, setPrimaryDb } from '../user-db-manager'
import logger from '../logger'

const paramToString = (param: string | string[] | undefined): string =>
  Array.isArray(param) ? param[0] : param || ''

export function extractClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for']
  let rawIp = ''
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    rawIp = forwarded.split(',')[0].trim()
  } else if (Array.isArray(forwarded) && forwarded.length > 0) {
    rawIp = forwarded[0].trim()
  } else if (req.ip) {
    rawIp = req.ip
  } else if (req.socket?.remoteAddress) {
    rawIp = req.socket.remoteAddress
  }
  if (rawIp.startsWith('::ffff:')) {
    rawIp = rawIp.slice(7)
  }
  if (rawIp === '::1') {
    rawIp = '127.0.0.1'
  }
  return rawIp || 'unknown'
}

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

      if (user.isFlagged === 1) {
        res.status(403).json({
          error: 'ACCOUNT_FLAGGED_MULTI_IP',
          message: 'Your account has been flagged due to multi-IP login. Please submit an unblock request.',
          canRequestUnblock: true,
          flagReason: user.flagReason || 'MULTI_IP_LOGIN',
        })
        return
      }

      const valid = verifyPassword(password, user.passwordHash)
      if (!valid) {
        res.status(401).json({ error: 'Invalid username or password' })
        return
      }

      const clientIp = extractClientIp(req)
      const userAgent = (req.headers['user-agent'] as string) || undefined

      // Multi-IP enforcement (skip for admins)
      if (user.role !== 'admin') {
        const recentIps = getRecentLoginIps(user.id, 7)
        if (recentIps.length > 0 && !recentIps.includes(clientIp)) {
          // 2nd distinct IP detected in 7 days -> Flag the account!
          const reason = `Logged in from multiple IPs in 7 days (${recentIps[0]} -> ${clientIp})`
          updateUser(user.id, {
            isFlagged: 1,
            flagReason: reason,
          })
          revokeAllUserSessions(user.id)
          recordLoginAttempt(user.id, clientIp, userAgent, 'flagged')

          logger.warn({ userId: user.id, username: user.username, recentIps, clientIp }, 'User flagged for multi-IP login')

          res.status(403).json({
            error: 'ACCOUNT_FLAGGED_MULTI_IP',
            message: 'Your account has been flagged due to logins from multiple locations in the past 7 days. You can submit an unblock request to the administrator.',
            canRequestUnblock: true,
            flagReason: reason,
            previousIp: recentIps[0],
            currentIp: clientIp,
          })
          return
        }
      }

      // Valid login: record success attempt and update lastLoginAt
      recordLoginAttempt(user.id, clientIp, userAgent, 'success')
      updateUser(user.id, { lastLoginAt: new Date().toISOString() })

      if (user.role === 'admin') {
        try {
          const adminDb = await userDbManager.getDb(user.id)
          setPrimaryDb(adminDb)
        } catch (err) {
          logger.warn({ err }, 'Could not update primary DB on admin login')
        }
      }

      const isRemember = rememberMe === true || rememberMe === 'true'
      const { token, expiresAt } = createNewSession(user.id, userAgent, clientIp, isRemember)

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

  requestUnblock = async (req: Request, res: Response): Promise<void> => {
    try {
      const { username, password, note } = req.body ?? {}
      if (!username || typeof username !== 'string') {
        res.status(400).json({ error: 'Username is required' })
        return
      }

      const user = getUserByUsername(username.trim())
      if (!user) {
        res.status(404).json({ error: 'User not found' })
        return
      }

      if (user.isFlagged !== 1) {
        res.status(400).json({ error: 'This account is not flagged' })
        return
      }

      if (!password || !verifyPassword(password, user.passwordHash)) {
        res.status(401).json({ error: 'Invalid password. Password is required to verify account ownership.' })
        return
      }

      const existingRequest = getPendingUnblockRequestForUser(user.id)
      if (existingRequest) {
        res.json({
          success: true,
          message: 'An unblock request is already pending review with the administrator.',
          pending: true,
        })
        return
      }

      const clientIp = extractClientIp(req)
      createUnblockRequest(
        user.id,
        user.username,
        clientIp,
        typeof note === 'string' ? note.trim().slice(0, 500) : undefined
      )

      res.json({
        success: true,
        message: 'Unblock request submitted successfully. The administrator will review your account.',
      })
    } catch (err) {
      logger.error({ err }, 'Failed to submit unblock request')
      res.status(500).json({ error: 'FAILED_TO_SUBMIT_UNBLOCK_REQUEST' })
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
