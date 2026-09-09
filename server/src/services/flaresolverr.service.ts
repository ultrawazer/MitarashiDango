import logger from '../logger'
import { DatabaseWrapper } from '../db'
import { SettingsRepository } from '../repositories/settings.repository'

export interface FlareSolverrConfig {
  enabled: boolean
  url: string
  port: string | number
}

export interface FlareSolverrSolution {
  url: string
  status: number
  cookies: { name: string; value: string; domain?: string; path?: string }[]
  userAgent: string
  headers: Record<string, string>
  response: string
}

export interface FlareSolverrResponse {
  status: string
  message: string
  startTimestamp?: number
  endTimestamp?: number
  version?: string
  solution?: FlareSolverrSolution
}

export class FlareSolverrService {
  private db?: DatabaseWrapper
  private credentialCache = new Map<string, { cookie: string; ua: string; expiresAt: number }>()

  public setDb(db: DatabaseWrapper): void {
    this.db = db
  }

  public async isEnabled(customDb?: DatabaseWrapper): Promise<boolean> {
    const d = customDb || this.db
    if (d) {
      try {
        const row = await SettingsRepository.getByKey(d, 'flaresolverr_enabled')
        if (row && typeof row.value === 'string' && row.value.trim() !== '') {
          return row.value === 'true'
        }
      } catch {
        // fallback to env
      }
    }
    return process.env.FLARESOLVERR_ENABLED === 'true'
  }

  public async getUrl(customDb?: DatabaseWrapper): Promise<string> {
    const d = customDb || this.db
    if (d) {
      try {
        const row = await SettingsRepository.getByKey(d, 'flaresolverr_url')
        if (row && typeof row.value === 'string' && row.value.trim() !== '') {
          return row.value.trim()
        }
      } catch {
        // fallback to env
      }
    }
    return (process.env.FLARESOLVERR_URL || 'http://localhost').trim()
  }

  public async getPort(customDb?: DatabaseWrapper): Promise<string | number> {
    const d = customDb || this.db
    if (d) {
      try {
        const row = await SettingsRepository.getByKey(d, 'flaresolverr_port')
        if (row && typeof row.value === 'string' && row.value.trim() !== '') {
          return row.value.trim()
        }
      } catch {
        // fallback to env
      }
    }
    return (process.env.FLARESOLVERR_PORT || '8191').trim()
  }

  public async getConfig(customDb?: DatabaseWrapper): Promise<FlareSolverrConfig> {
    const [enabled, url, port] = await Promise.all([
      this.isEnabled(customDb),
      this.getUrl(customDb),
      this.getPort(customDb),
    ])
    return { enabled, url, port }
  }

  public async getBaseUrl(customDb?: DatabaseWrapper, customUrl?: string, customPort?: string | number): Promise<string> {
    let rawUrl = customUrl || (await this.getUrl(customDb))
    const port = customPort || (await this.getPort(customDb))

    if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
      rawUrl = `http://${rawUrl}`
    }
    rawUrl = rawUrl.replace(/\/+$/, '')

    try {
      const parsed = new URL(rawUrl)
      if (!parsed.port && port) {
        parsed.port = String(port)
      }
      return parsed.origin
    } catch {
      return `${rawUrl}:${port}`
    }
  }

  public async testConnection(
    customUrl?: string,
    customPort?: string | number,
    customDb?: DatabaseWrapper
  ): Promise<{
    success: boolean
    version?: string
    message?: string
    error?: string
    latencyMs?: number
  }> {
    const baseUrl = await this.getBaseUrl(customDb, customUrl, customPort)
    const start = Date.now()

    try {
      const res = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(6000) })
      const latencyMs = Date.now() - start
      if (!res.ok) {
        return {
          success: false,
          error: `HTTP ${res.status}: ${res.statusText}`,
          latencyMs,
        }
      }

      const text = await res.text()
      let version = 'unknown'
      let message = 'FlareSolverr is ready'
      try {
        const data = JSON.parse(text)
        if (data.version) version = data.version
        if (data.msg) message = data.msg
        if (data.message) message = data.message
      } catch {
        // text format
      }

      return {
        success: true,
        version,
        message,
        latencyMs,
      }
    } catch (err) {
      return {
        success: false,
        error: (err as Error).message || 'Connection failed',
        latencyMs: Date.now() - start,
      }
    }
  }

  public async solve(
    targetUrl: string,
    options?: { maxTimeout?: number; session?: string },
    customDb?: DatabaseWrapper
  ): Promise<{
    success: boolean
    status: number
    html?: string
    cookies?: { name: string; value: string; domain?: string; path?: string }[]
    cookieHeader?: string
    userAgent?: string
    error?: string
  }> {
    const baseUrl = await this.getBaseUrl(customDb)
    const endpoint = `${baseUrl}/v1`
    const maxTimeout = options?.maxTimeout || 60000

    const payload: Record<string, unknown> = {
      cmd: 'request.get',
      url: targetUrl,
      maxTimeout,
    }
    if (options?.session) {
      payload.session = options.session
    }

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(maxTimeout + 10000),
      })

      if (!resp.ok) {
        return {
          success: false,
          status: resp.status,
          error: `FlareSolverr returned HTTP ${resp.status}`,
        }
      }

      const data = (await resp.json()) as FlareSolverrResponse

      if (data.status !== 'ok' || !data.solution) {
        return {
          success: false,
          status: data.solution?.status || 500,
          error: data.message || 'FlareSolverr failed to solve challenge',
        }
      }

      const cookies = data.solution.cookies || []
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

      return {
        success: true,
        status: data.solution.status,
        html: data.solution.response,
        cookies,
        cookieHeader,
        userAgent: data.solution.userAgent,
      }
    } catch (err) {
      return {
        success: false,
        status: 500,
        error: (err as Error).message,
      }
    }
  }

  public async solveAndCache(
    extensionId: string,
    authUrl: string,
    customDb?: DatabaseWrapper
  ): Promise<{
    success: boolean
    cookie?: string
    ua?: string
    error?: string
  }> {
    const isEnabled = await this.isEnabled(customDb)
    if (!isEnabled) {
      return { success: false, error: 'FlareSolverr is not enabled' }
    }

    logger.info({ extensionId, authUrl }, 'Invoking FlareSolverr to solve Cloudflare challenge')
    const res = await this.solve(authUrl, { maxTimeout: 60000 }, customDb)
    if (!res.success || !res.cookieHeader || !res.userAgent) {
      logger.warn({ extensionId, err: res.error }, 'FlareSolverr challenge solve failed')
      return {
        success: false,
        error: res.error || 'Failed to extract clearance credentials from FlareSolverr',
      }
    }

    // Cache credentials for 2 hours
    const expiresAt = Date.now() + 2 * 60 * 60 * 1000
    this.credentialCache.set(extensionId.toLowerCase(), {
      cookie: res.cookieHeader,
      ua: res.userAgent,
      expiresAt,
    })

    logger.info(
      { extensionId, ua: res.userAgent, cookieCount: res.cookies?.length },
      'Successfully solved Cloudflare challenge via FlareSolverr and cached credentials'
    )

    return {
      success: true,
      cookie: res.cookieHeader,
      ua: res.userAgent,
    }
  }

  public getCachedCredentials(extensionId?: string): { cookie: string; ua: string } | null {
    if (!extensionId) return null
    const id = extensionId.toLowerCase()
    const cached = this.credentialCache.get(id)
    if (!cached) return null
    if (Date.now() > cached.expiresAt) {
      this.credentialCache.delete(id)
      return null
    }
    return { cookie: cached.cookie, ua: cached.ua }
  }

  public clearCachedCredentials(extensionId?: string): void {
    if (extensionId) {
      this.credentialCache.delete(extensionId.toLowerCase())
    } else {
      this.credentialCache.clear()
    }
  }
}

export const flareSolverrService = new FlareSolverrService()
