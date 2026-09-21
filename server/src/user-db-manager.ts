import path from 'path'
import fs from 'fs'
import { DatabaseWrapper } from './db'
import { CONFIG } from './config'
import { initializeDatabase } from './sync'
import logger from './logger'

interface UserDbEntry {
  db: DatabaseWrapper
  lastAccess: number
}

class UserDatabaseManager {
  private connections = new Map<string, UserDbEntry>()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    // Check every 5 minutes for connections idle for >15 minutes
    this.cleanupInterval = setInterval(() => {
      this.evictIdleConnections(15 * 60 * 1000)
    }, 5 * 60 * 1000)
    // Don't prevent process from exiting
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref()
    }
  }

  public getUserDir(userId: string): string {
    return path.join(CONFIG.ROOT, 'users', userId)
  }

  public getUserDbPath(userId: string): string {
    return path.join(
      this.getUserDir(userId),
      CONFIG.IS_DEV ? CONFIG.DB_NAME_DEV : CONFIG.DB_NAME_PROD
    )
  }

  public getUserTokensPath(userId: string): string {
    return path.join(this.getUserDir(userId), 'google_tokens.json')
  }

  public getUserManifestPath(userId: string): string {
    return path.join(
      this.getUserDir(userId),
      CONFIG.IS_DEV ? 'sync_manifest.dev.json' : 'sync_manifest.json'
    )
  }

  public getCachedDb(userId: string): DatabaseWrapper | null {
    const existing = this.connections.get(userId)
    if (existing && !existing.db.isClosedCheck()) {
      existing.lastAccess = Date.now()
      return existing.db
    }
    return null
  }

  public async getDb(userId: string): Promise<DatabaseWrapper> {
    const existing = this.connections.get(userId)
    if (existing && !existing.db.isClosedCheck()) {
      existing.lastAccess = Date.now()
      return existing.db
    }

    const userDir = this.getUserDir(userId)
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true })
    }

    const dbPath = this.getUserDbPath(userId)
    logger.debug({ userId, dbPath }, 'Opening user database connection')

    const db = await initializeDatabase(dbPath)
    this.connections.set(userId, { db, lastAccess: Date.now() })
    return db
  }

  public closeDb(userId: string): void {
    const existing = this.connections.get(userId)
    if (existing) {
      this.connections.delete(userId)
      if (!existing.db.isClosedCheck()) {
        existing.db.close()
      }
    }
  }

  public evictIdleConnections(maxIdleMs: number): void {
    const now = Date.now()
    for (const [userId, entry] of this.connections.entries()) {
      if (now - entry.lastAccess > maxIdleMs) {
        logger.debug({ userId }, 'Closing idle user database connection')
        this.connections.delete(userId)
        if (!entry.db.isClosedCheck()) {
          entry.db.close()
        }
      }
    }
  }

  public closeAll(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    for (const [userId, entry] of this.connections.entries()) {
      try {
        if (!entry.db.isClosedCheck()) {
          entry.db.close()
        }
      } catch (err) {
        logger.warn({ err, userId }, 'Error closing user database on shutdown')
      }
    }
    this.connections.clear()
  }

  public purgeUserData(userId: string): void {
    this.closeDb(userId)
    const userDir = this.getUserDir(userId)
    if (fs.existsSync(userDir)) {
      fs.rmSync(userDir, { recursive: true, force: true })
      logger.info({ userId, userDir }, 'Permanently purged user data directory')
    }
  }

  private primaryDbInstance: DatabaseWrapper | null = null

  public setPrimaryDb(db: DatabaseWrapper): void {
    this.primaryDbInstance = db
  }

  public getPrimaryDb(): DatabaseWrapper {
    if (this.primaryDbInstance && !this.primaryDbInstance.isClosedCheck()) {
      return this.primaryDbInstance
    }
    try {
      const { listUsers } = require('./system-db')
      const admins = listUsers().filter((u: any) => u.role === 'admin' && u.isActive === 1)
      if (admins.length > 0) {
        const cached = this.getCachedDb(admins[0].id)
        if (cached && !cached.isClosedCheck()) {
          this.primaryDbInstance = cached
          return this.primaryDbInstance
        }
      }
    } catch (err) {
      logger.debug({ err }, 'Failed to dynamically resolve primary admin db')
    }
    return this.primaryDbInstance as DatabaseWrapper
  }
}

export const userDbManager = new UserDatabaseManager()

export function setPrimaryDb(db: DatabaseWrapper): void {
  userDbManager.setPrimaryDb(db)
}

export function getPrimaryDb(): DatabaseWrapper {
  return userDbManager.getPrimaryDb()
}
