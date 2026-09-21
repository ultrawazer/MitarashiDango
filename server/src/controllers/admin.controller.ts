import type { Request, Response } from 'express'
import crypto from 'crypto'
import {
  listUsers,
  createUser,
  getUserById,
  getUserByUsername,
  updateUser,
  deleteUserRecord,
  listSessions,
  deleteSession,
  deleteSessionsForUser,
  getAllGlobalSettings,
  setGlobalSetting,
} from '../system-db'
import { hashPassword } from '../app-auth'
import { userDbManager } from '../user-db-manager'
import logger from '../logger'

const paramToString = (param: string | string[] | undefined): string =>
  Array.isArray(param) ? param[0] : param || ''

export class AdminController {
  getUsers = async (_req: Request, res: Response): Promise<void> => {
    try {
      const users = listUsers().map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        role: u.role,
        avatarUrl: u.avatarPath ? `/api/auth/avatar/${u.id}` : null,
        isActive: u.isActive === 1,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
      }))
      res.json({ users, success: true })
    } catch (err) {
      logger.error({ err }, 'Failed to list users')
      res.status(500).json({ error: 'FAILED_TO_LIST_USERS', users: [] })
    }
  }

  createUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { username, displayName, password, role } = req.body ?? {}
      if (!username || typeof username !== 'string' || username.trim().length < 2) {
        res.status(400).json({ error: 'Username must be at least 2 characters' })
        return
      }
      if (!password || typeof password !== 'string' || password.length < 4) {
        res.status(400).json({ error: 'Password must be at least 4 characters' })
        return
      }

      const cleanUsername = username.trim().toLowerCase()
      const existing = getUserByUsername(cleanUsername)
      if (existing) {
        res.status(400).json({ error: 'Username already exists' })
        return
      }

      const newId = crypto.randomUUID()
      const passwordHash = hashPassword(password)
      const userRole: 'admin' | 'user' = role === 'admin' ? 'admin' : 'user'

      createUser({
        id: newId,
        username: cleanUsername,
        displayName: displayName && typeof displayName === 'string' ? displayName.trim() : cleanUsername,
        passwordHash,
        role: userRole,
      })

      // Pre-initialize the user database
      await userDbManager.getDb(newId)

      res.json({
        success: true,
        user: {
          id: newId,
          username: cleanUsername,
          displayName: displayName || cleanUsername,
          role: userRole,
          isActive: true,
        },
      })
    } catch (err) {
      logger.error({ err }, 'Failed to create user')
      res.status(500).json({ error: 'FAILED_TO_CREATE_USER' })
    }
  }

  updateUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = paramToString(req.params.id)
      const targetUser = getUserById(id)
      if (!targetUser) {
        res.status(404).json({ error: 'User not found' })
        return
      }

      const { displayName, role, isActive } = req.body ?? {}
      const updates: any = {}

      if (displayName !== undefined && typeof displayName === 'string' && displayName.trim().length > 0) {
        updates.displayName = displayName.trim()
      }

      if (role !== undefined && (role === 'admin' || role === 'user')) {
        // Prevent removing the last admin
        if (role === 'user' && targetUser.role === 'admin') {
          const admins = listUsers().filter((u) => u.role === 'admin' && u.isActive === 1)
          if (admins.length <= 1 && admins[0].id === id) {
            res.status(400).json({ error: 'Cannot demote the last active admin' })
            return
          }
        }
        updates.role = role
      }

      if (isActive !== undefined) {
        const activeNum = isActive ? 1 : 0
        // Prevent deactivating own account
        if (req.user?.id === id && activeNum === 0) {
          res.status(400).json({ error: 'Cannot deactivate your own account' })
          return
        }
        updates.isActive = activeNum
        if (activeNum === 0) {
          deleteSessionsForUser(id)
        }
      }

      updateUser(id, updates)
      res.json({ success: true })
    } catch (err) {
      logger.error({ err }, 'Failed to update user')
      res.status(500).json({ error: 'FAILED_TO_UPDATE_USER' })
    }
  }

  resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = paramToString(req.params.id)
      const targetUser = getUserById(id)
      if (!targetUser) {
        res.status(404).json({ error: 'User not found' })
        return
      }

      const { newPassword } = req.body ?? {}
      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 4) {
        res.status(400).json({ error: 'New password must be at least 4 characters' })
        return
      }

      const newHash = hashPassword(newPassword)
      updateUser(id, { passwordHash: newHash })
      deleteSessionsForUser(id)

      res.json({ success: true })
    } catch (err) {
      logger.error({ err }, 'Failed to reset password')
      res.status(500).json({ error: 'FAILED_TO_RESET_PASSWORD' })
    }
  }

  deleteUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = paramToString(req.params.id)
      if (req.user?.id === id) {
        res.status(400).json({ error: 'Cannot delete your own account' })
        return
      }

      const targetUser = getUserById(id)
      if (!targetUser) {
        res.status(404).json({ error: 'User not found' })
        return
      }

      // Soft delete: deactivate and revoke sessions
      updateUser(id, { isActive: 0 })
      deleteSessionsForUser(id)

      res.json({ success: true, message: 'User deactivated' })
    } catch (err) {
      logger.error({ err }, 'Failed to soft delete user')
      res.status(500).json({ error: 'FAILED_TO_DELETE_USER' })
    }
  }

  purgeUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = paramToString(req.params.id)
      if (req.user?.id === id) {
        res.status(400).json({ error: 'Cannot purge your own account' })
        return
      }

      const targetUser = getUserById(id)
      if (!targetUser) {
        res.status(404).json({ error: 'User not found' })
        return
      }

      deleteSessionsForUser(id)
      deleteUserRecord(id)
      userDbManager.purgeUserData(id)

      res.json({ success: true, message: 'User data permanently purged' })
    } catch (err) {
      logger.error({ err }, 'Failed to purge user data')
      res.status(500).json({ error: 'FAILED_TO_PURGE_USER' })
    }
  }

  getSessions = async (_req: Request, res: Response): Promise<void> => {
    try {
      const sessions = listSessions()
      res.json({ sessions })
    } catch (err) {
      logger.error({ err }, 'Failed to list admin sessions')
      res.status(500).json({ error: 'FAILED_TO_LIST_SESSIONS' })
    }
  }

  revokeSession = async (req: Request, res: Response): Promise<void> => {
    try {
      const token = paramToString(req.params.token)
      if (!token) {
        res.status(400).json({ error: 'Token required' })
        return
      }
      deleteSession(token)
      res.json({ success: true })
    } catch (err) {
      logger.error({ err }, 'Failed to revoke session')
      res.status(500).json({ error: 'FAILED_TO_REVOKE_SESSION' })
    }
  }

  getSettings = async (_req: Request, res: Response): Promise<void> => {
    try {
      const settings = getAllGlobalSettings()
      res.json({ settings, ...settings, success: true })
    } catch (err) {
      logger.error({ err }, 'Failed to get admin settings')
      res.status(500).json({ error: 'FAILED_TO_GET_SETTINGS' })
    }
  }

  updateSettings = async (req: Request, res: Response): Promise<void> => {
    try {
      const { key, value, settings } = req.body ?? {}
      if (settings && typeof settings === 'object') {
        for (const [k, v] of Object.entries(settings)) {
          setGlobalSetting(k, String(v))
        }
      } else if (key && typeof key === 'string') {
        setGlobalSetting(key, String(value ?? ''))
      } else {
        res.status(400).json({ error: 'Invalid settings payload' })
        return
      }
      res.json({ success: true })
    } catch (err) {
      logger.error({ err }, 'Failed to update admin settings')
      res.status(500).json({ error: 'FAILED_TO_UPDATE_SETTINGS' })
    }
  }
}
