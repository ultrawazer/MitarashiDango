import path from 'path'
import crypto from 'crypto'
import { DatabaseWrapper } from './db'
import { CONFIG } from './config'
import logger from './logger'

export interface SystemUser {
  id: string
  username: string
  displayName: string
  passwordHash: string
  role: 'admin' | 'user'
  avatarPath: string | null
  isActive: number
  isFlagged: number
  flagReason: string | null
  createdAt: string
  lastLoginAt: string | null
  lastActiveAt: string | null
}

export interface LoginHistoryRecord {
  id: string
  userId: string
  ipAddress: string
  userAgent: string | null
  status: string
  createdAt: string
}

export interface UnblockRequestRecord {
  id: string
  userId: string
  username: string
  ipAddress: string
  note: string | null
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  resolvedAt: string | null
  resolvedBy: string | null
}

export interface SystemSession {
  token: string
  userId: string
  createdAt: string
  expiresAt: string
  userAgent: string | null
  ipAddress: string | null
}

let systemDbInstance: DatabaseWrapper | null = null

export function getSystemDb(): DatabaseWrapper {
  if (!systemDbInstance) {
    throw new Error('System database has not been initialized yet')
  }
  return systemDbInstance
}

export async function initSystemDb(customPath?: string): Promise<DatabaseWrapper> {
  const dbPath = customPath || path.join(CONFIG.ROOT, 'system.db')
  logger.info({ dbPath }, 'Initializing system database')

  const db = await DatabaseWrapper.create(dbPath)
  db.configure('busyTimeout', 5000)

  db.run('PRAGMA journal_mode = WAL;')
  db.run('PRAGMA synchronous = NORMAL;')
  db.run('PRAGMA foreign_keys = ON;')

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      display_name  TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'user',
      avatar_path   TEXT,
      is_active     INTEGER NOT NULL DEFAULT 1,
      is_flagged    INTEGER NOT NULL DEFAULT 0,
      flag_reason   TEXT,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login_at DATETIME,
      last_active_at DATETIME
    );
  `)

  // Migrate existing users table if columns don't exist yet
  try {
    const userCols = db.all<{ name: string }>(`PRAGMA table_info(users);`).map((c) => c.name)
    if (!userCols.includes('last_active_at')) {
      db.run(`ALTER TABLE users ADD COLUMN last_active_at DATETIME;`)
    }
    if (!userCols.includes('is_flagged')) {
      db.run(`ALTER TABLE users ADD COLUMN is_flagged INTEGER NOT NULL DEFAULT 0;`)
    }
    if (!userCols.includes('flag_reason')) {
      db.run(`ALTER TABLE users ADD COLUMN flag_reason TEXT;`)
    }
  } catch (err) {
    logger.warn({ err }, 'Column migration check on users table skipped or completed')
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      token       TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at  DATETIME NOT NULL,
      user_agent  TEXT,
      ip_address  TEXT
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS login_history (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ip_address  TEXT NOT NULL,
      user_agent  TEXT,
      status      TEXT NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)
  db.run(`CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history(user_id, created_at);`)

  db.run(`
    CREATE TABLE IF NOT EXISTS unblock_requests (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      username    TEXT NOT NULL,
      ip_address  TEXT NOT NULL,
      note        TEXT,
      status      TEXT NOT NULL DEFAULT 'pending',
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      resolved_by TEXT
    );
  `)
  db.run(`CREATE INDEX IF NOT EXISTS idx_unblock_requests_status ON unblock_requests(status);`)

  db.run(`
    CREATE TABLE IF NOT EXISTS global_settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `)

  // Synchronize any existing values between settings and global_settings
  db.run(`INSERT OR IGNORE INTO settings (key, value) SELECT key, value FROM global_settings;`)
  db.run(`INSERT OR IGNORE INTO global_settings (key, value) SELECT key, value FROM settings;`)

  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);`)

  systemDbInstance = db
  return db
}

// User Repository Helpers
export function getUserById(id: string): SystemUser | null {
  const row = getSystemDb().get<any>(
    `SELECT id, username, display_name AS displayName, password_hash AS passwordHash,
            role, avatar_path AS avatarPath, is_active AS isActive,
            is_flagged AS isFlagged, flag_reason AS flagReason,
            created_at AS createdAt, last_login_at AS lastLoginAt,
            last_active_at AS lastActiveAt
     FROM users WHERE id = ?`,
    [id]
  )
  return row ? (row as SystemUser) : null
}

export function getUserByUsername(username: string): SystemUser | null {
  const row = getSystemDb().get<any>(
    `SELECT id, username, display_name AS displayName, password_hash AS passwordHash,
            role, avatar_path AS avatarPath, is_active AS isActive,
            is_flagged AS isFlagged, flag_reason AS flagReason,
            created_at AS createdAt, last_login_at AS lastLoginAt,
            last_active_at AS lastActiveAt
     FROM users WHERE LOWER(username) = LOWER(?)`,
    [username.trim()]
  )
  return row ? (row as SystemUser) : null
}

export function countUsers(): number {
  const row = getSystemDb().get<{ count: number }>(`SELECT COUNT(*) AS count FROM users`)
  return row?.count ?? 0
}

export function listUsers(): SystemUser[] {
  return getSystemDb().all<any>(
    `SELECT id, username, display_name AS displayName, password_hash AS passwordHash,
            role, avatar_path AS avatarPath, is_active AS isActive,
            is_flagged AS isFlagged, flag_reason AS flagReason,
            created_at AS createdAt, last_login_at AS lastLoginAt,
            last_active_at AS lastActiveAt
     FROM users ORDER BY created_at ASC`
  ) as SystemUser[]
}

export function listFlaggedUsers(): SystemUser[] {
  return getSystemDb().all<any>(
    `SELECT id, username, display_name AS displayName, password_hash AS passwordHash,
            role, avatar_path AS avatarPath, is_active AS isActive,
            is_flagged AS isFlagged, flag_reason AS flagReason,
            created_at AS createdAt, last_login_at AS lastLoginAt,
            last_active_at AS lastActiveAt
     FROM users
     WHERE is_flagged = 1
     ORDER BY created_at DESC`
  ) as SystemUser[]
}

export function createUser(user: {
  id: string
  username: string
  displayName: string
  passwordHash: string
  role: 'admin' | 'user'
  avatarPath?: string | null
}): void {
  getSystemDb().run(
    `INSERT INTO users (id, username, display_name, password_hash, role, avatar_path, is_active, is_flagged)
     VALUES (?, ?, ?, ?, ?, ?, 1, 0)`,
    [
      user.id,
      user.username.trim().toLowerCase(),
      user.displayName.trim(),
      user.passwordHash,
      user.role,
      user.avatarPath ?? null,
    ]
  )
}

export function updateUser(
  id: string,
  updates: Partial<Pick<SystemUser, 'displayName' | 'passwordHash' | 'role' | 'avatarPath' | 'isActive' | 'isFlagged' | 'flagReason' | 'lastLoginAt' | 'lastActiveAt'>>
): void {
  const sets: string[] = []
  const values: any[] = []

  if (updates.displayName !== undefined) {
    sets.push('display_name = ?')
    values.push(updates.displayName.trim())
  }
  if (updates.passwordHash !== undefined) {
    sets.push('password_hash = ?')
    values.push(updates.passwordHash)
  }
  if (updates.role !== undefined) {
    sets.push('role = ?')
    values.push(updates.role)
  }
  if (updates.avatarPath !== undefined) {
    sets.push('avatar_path = ?')
    values.push(updates.avatarPath)
  }
  if (updates.isActive !== undefined) {
    sets.push('is_active = ?')
    values.push(updates.isActive)
  }
  if (updates.isFlagged !== undefined) {
    sets.push('is_flagged = ?')
    values.push(updates.isFlagged)
  }
  if (updates.flagReason !== undefined) {
    sets.push('flag_reason = ?')
    values.push(updates.flagReason)
  }
  if (updates.lastLoginAt !== undefined) {
    sets.push('last_login_at = ?')
    values.push(updates.lastLoginAt)
  }
  if (updates.lastActiveAt !== undefined) {
    sets.push('last_active_at = ?')
    values.push(updates.lastActiveAt)
  }

  if (sets.length === 0) return

  values.push(id)
  getSystemDb().run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, values)
}

export function recordUserActivity(userId: string): void {
  getSystemDb().run(`UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?`, [userId])
}

export function recordLoginAttempt(
  userId: string,
  ipAddress: string,
  userAgent?: string,
  status: 'success' | 'flagged' | 'failed' = 'success'
): void {
  const id = crypto.randomUUID()
  getSystemDb().run(
    `INSERT INTO login_history (id, user_id, ip_address, user_agent, status)
     VALUES (?, ?, ?, ?, ?)`,
    [id, userId, ipAddress, userAgent ?? null, status]
  )
}

export function getRecentLoginIps(userId: string, days: number = 7): string[] {
  const rows = getSystemDb().all<{ ip_address: string }>(
    `SELECT DISTINCT ip_address
     FROM login_history
     WHERE user_id = ?
       AND status = 'success'
       AND datetime(created_at) >= datetime('now', '-' || ? || ' days')`,
    [userId, days]
  )
  return rows.map((r) => r.ip_address)
}

export function listLoginHistoryForUser(userId: string, limit: number = 10): LoginHistoryRecord[] {
  return getSystemDb().all<any>(
    `SELECT id, user_id AS userId, ip_address AS ipAddress, user_agent AS userAgent,
            status, created_at AS createdAt
     FROM login_history
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [userId, limit]
  )
}

export function resetUserIpHistory(userId: string): void {
  getSystemDb().run(
    `UPDATE login_history SET status = 'archived' WHERE user_id = ? AND status = 'success'`,
    [userId]
  )
}

export function createUnblockRequest(
  userId: string,
  username: string,
  ipAddress: string,
  note?: string
): UnblockRequestRecord {
  const id = crypto.randomUUID()
  getSystemDb().run(
    `INSERT INTO unblock_requests (id, user_id, username, ip_address, note, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
    [id, userId, username, ipAddress, note ?? null]
  )
  return {
    id,
    userId,
    username,
    ipAddress,
    note: note ?? null,
    status: 'pending',
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolvedBy: null,
  }
}

export function getPendingUnblockRequestForUser(userId: string): UnblockRequestRecord | null {
  const row = getSystemDb().get<any>(
    `SELECT id, user_id AS userId, username, ip_address AS ipAddress,
            note, status, created_at AS createdAt, resolved_at AS resolvedAt,
            resolved_by AS resolvedBy
     FROM unblock_requests
     WHERE user_id = ? AND status = 'pending'
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  )
  return row ?? null
}

export function listUnblockRequests(status: string = 'pending'): (UnblockRequestRecord & { displayName?: string })[] {
  return getSystemDb().all<any>(
    `SELECT r.id, r.user_id AS userId, r.username, r.ip_address AS ipAddress,
            r.note, r.status, r.created_at AS createdAt, r.resolved_at AS resolvedAt,
            r.resolved_by AS resolvedBy, u.display_name AS displayName
     FROM unblock_requests r
     LEFT JOIN users u ON r.user_id = u.id
     WHERE r.status = ?
     ORDER BY r.created_at DESC`,
    [status]
  )
}

export function resolveUnblockRequest(
  requestId: string,
  status: 'approved' | 'rejected',
  adminUsername: string
): void {
  getSystemDb().run(
    `UPDATE unblock_requests
     SET status = ?, resolved_at = CURRENT_TIMESTAMP, resolved_by = ?
     WHERE id = ?`,
    [status, adminUsername, requestId]
  )
}

export function deleteUserRecord(id: string): void {
  getSystemDb().run(`DELETE FROM users WHERE id = ?`, [id])
}

// Session Repository Helpers
export function createSession(session: SystemSession): void {
  getSystemDb().run(
    `INSERT INTO sessions (token, user_id, expires_at, user_agent, ip_address)
     VALUES (?, ?, ?, ?, ?)`,
    [
      session.token,
      session.userId,
      session.expiresAt,
      session.userAgent ?? null,
      session.ipAddress ?? null,
    ]
  )
}

export function getSession(token: string): (SystemSession & {
  username: string
  displayName: string
  role: 'admin' | 'user'
  avatarPath: string | null
  isActive: number
  isFlagged: number
}) | null {
  const row = getSystemDb().get<any>(
    `SELECT s.token, s.user_id AS userId, s.created_at AS createdAt, s.expires_at AS expiresAt,
            s.user_agent AS userAgent, s.ip_address AS ipAddress,
            u.username, u.display_name AS displayName, u.role, u.avatar_path AS avatarPath,
            u.is_active AS isActive, u.is_flagged AS isFlagged
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')`,
    [token]
  )
  return row ?? null
}

export function deleteSession(token: string): void {
  getSystemDb().run(`DELETE FROM sessions WHERE token = ?`, [token])
}

export function deleteSessionsForUser(userId: string): void {
  getSystemDb().run(`DELETE FROM sessions WHERE user_id = ?`, [userId])
}

export function listSessions(): (SystemSession & {
  username: string
  displayName: string
})[] {
  return getSystemDb().all<any>(
    `SELECT s.token, s.user_id AS userId, s.created_at AS createdAt, s.expires_at AS expiresAt,
            s.user_agent AS userAgent, s.ip_address AS ipAddress,
            u.username, u.display_name AS displayName
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE datetime(s.expires_at) > datetime('now')
     ORDER BY s.created_at DESC`
  )
}

export function pruneExpiredSessions(): void {
  getSystemDb().run(`DELETE FROM sessions WHERE datetime(expires_at) <= datetime('now')`)
}

// Global Settings Helpers
export function getGlobalSetting(key: string): string | null {
  const row =
    getSystemDb().get<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, [key]) ||
    getSystemDb().get<{ value: string }>(`SELECT value FROM global_settings WHERE key = ?`, [key])
  return row ? row.value : null
}

export function setGlobalSetting(key: string, value: string): void {
  getSystemDb().run(
    `INSERT INTO global_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  )
  getSystemDb().run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  )
}

export function getAllGlobalSettings(): Record<string, string> {
  const rows = getSystemDb().all<{ key: string; value: string }>(
    `SELECT key, value FROM settings`
  )
  const result: Record<string, string> = {}
  for (const r of rows) {
    result[r.key] = r.value
  }
  return result
}

export function closeSystemDb(): void {
  if (systemDbInstance && !systemDbInstance.isClosedCheck()) {
    systemDbInstance.close()
    systemDbInstance = null
  }
}

