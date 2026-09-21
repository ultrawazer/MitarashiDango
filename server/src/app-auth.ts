import crypto from 'crypto'
import type { Request } from 'express'
import {
  createSession as dbCreateSession,
  getSession as dbGetSession,
  deleteSession as dbDeleteSession,
  deleteSessionsForUser as dbDeleteSessionsForUser,
  pruneExpiredSessions,
  type SystemSession,
} from './system-db'

export const SESSION_COOKIE_NAME = 'dango_session'
export const LEGACY_COOKIE_NAME = 'dango_lan_auth'
export const SESSION_TTL_REMEMBER_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
export const SESSION_TTL_STANDARD_MS = 24 * 60 * 60 * 1000 // 24 hours
export const SESSION_TTL_MS = SESSION_TTL_REMEMBER_MS

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 32).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash) return false
  const parts = storedHash.split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, salt, expectedHex] = parts
  try {
    const derived = crypto.scryptSync(password, salt, 32)
    const expected = Buffer.from(expectedHex, 'hex')
    if (derived.length !== expected.length) return false
    return crypto.timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

export function createNewSession(
  userId: string,
  userAgent?: string,
  ipAddress?: string,
  rememberMe: boolean = false
): { token: string; expiresAt: string } {
  const token = crypto.randomBytes(32).toString('hex')
  const ttl = rememberMe ? SESSION_TTL_REMEMBER_MS : SESSION_TTL_STANDARD_MS
  const expiresAt = new Date(Date.now() + ttl).toISOString()

  dbCreateSession({
    token,
    userId,
    createdAt: new Date().toISOString(),
    expiresAt,
    userAgent: userAgent ?? null,
    ipAddress: ipAddress ?? null,
  })

  return { token, expiresAt }
}

export function getSessionFromToken(token: string) {
  if (!token) return null
  return dbGetSession(token)
}

export function revokeSession(token: string): void {
  if (!token) return
  dbDeleteSession(token)
}

export function revokeAllUserSessions(userId: string): void {
  if (!userId) return
  dbDeleteSessionsForUser(userId)
}

export function cleanExpiredSessions(): void {
  pruneExpiredSessions()
}

export function getRequestToken(req: Request): string | null {
  const auth = req.headers.authorization
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim() || null
  }

  const cookieHeader = req.headers.cookie
  if (cookieHeader) {
    const parts = cookieHeader.split(';')
    for (const part of parts) {
      const idx = part.indexOf('=')
      if (idx === -1) continue
      const name = part.slice(0, idx).trim()
      if (name === SESSION_COOKIE_NAME || name === LEGACY_COOKIE_NAME) {
        const val = decodeURIComponent(part.slice(idx + 1).trim())
        if (val) return val
      }
    }
  }

  return null
}

export function buildSessionCookie(token: string, expiresAt: string): string {
  const maxAge = Math.max(
    1,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
  )
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax`
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
}
