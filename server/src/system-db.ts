import path from 'path'
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
  createdAt: string
  lastLoginAt: string | null
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
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login_at DATETIME
    );
  `)

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
            created_at AS createdAt, last_login_at AS lastLoginAt
     FROM users WHERE id = ?`,
    [id]
  )
  return row ? (row as SystemUser) : null
}

export function getUserByUsername(username: string): SystemUser | null {
  const row = getSystemDb().get<any>(
    `SELECT id, username, display_name AS displayName, password_hash AS passwordHash,
            role, avatar_path AS avatarPath, is_active AS isActive,
            created_at AS createdAt, last_login_at AS lastLoginAt
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
            created_at AS createdAt, last_login_at AS lastLoginAt
     FROM users ORDER BY created_at ASC`
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
    `INSERT INTO users (id, username, display_name, password_hash, role, avatar_path, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
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
  updates: Partial<Pick<SystemUser, 'displayName' | 'passwordHash' | 'role' | 'avatarPath' | 'isActive' | 'lastLoginAt'>>
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
  if (updates.lastLoginAt !== undefined) {
    sets.push('last_login_at = ?')
    values.push(updates.lastLoginAt)
  }

  if (sets.length === 0) return

  values.push(id)
  getSystemDb().run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, values)
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
}) | null {
  const row = getSystemDb().get<any>(
    `SELECT s.token, s.user_id AS userId, s.created_at AS createdAt, s.expires_at AS expiresAt,
            s.user_agent AS userAgent, s.ip_address AS ipAddress,
            u.username, u.display_name AS displayName, u.role, u.avatar_path AS avatarPath,
            u.is_active AS isActive
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

