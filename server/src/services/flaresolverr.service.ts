import logger from '../logger'
import { DatabaseWrapper } from '../db'
import { SettingsRepository } from '../repositories/settings.repository'

export interface FlareSolverrConfig {
  enabled: boolean
  url: string
  port: string | number
  maxTimeout: number
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

// Known Cloudflare-protected providers and their auth URLs
const CLOUDFLARE_PROVIDERS: { extensionId: string; authUrl: string }[] = [
  { extensionId: 'animepahe', authUrl: 'https://animepahe.pw' },
  { extensionId: 'jasmr', authUrl: 'https://japaneseasmr.com' },
]

export class FlareSolverrService {
  private db?: DatabaseWrapper
  private credentialCache = new Map<string, { cookie: string; ua: string; expiresAt: number }>()
  private preWarmInterval: ReturnType<typeof setInterval> | null = null

  private cachedBaseUrl: string = (process.env.FLARESOLVERR_URL || 'http://localhost:8191').trim()
  private cachedEnabled: boolean = process.env.FLARESOLVERR_ENABLED === 'true'
  private cachedMaxTimeout: number = 60000

  public setDb(db: DatabaseWrapper): void {
    this.db = db
    this.getConfig(db).catch(() => {})
  }

  public getCachedBaseUrl(): string {
    return this.cachedBaseUrl
  }

  public isEnabledSync(): boolean {
    return this.cachedEnabled || process.env.FLARESOLVERR_ENABLED === 'true'
  }

  public getCachedMaxTimeout(): number {
    return this.cachedMaxTimeout
  }

  public async isEnabled(customDb?: DatabaseWrapper): Promise<boolean> {
    const d = customDb || this.db
    if (d) {
      try {
        const row = await SettingsRepository.getByKey(d, 'flaresolverr_enabled')
        if (row && typeof row.value === 'string' && row.value.trim() !== '') {
          const val = row.value === 'true'
          this.cachedEnabled = val
          return val
        }
      } catch {
        // fallback to env
      }
    }
    const val = process.env.FLARESOLVERR_ENABLED === 'true'
    this.cachedEnabled = val
    return val
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

  public async getMaxTimeout(customDb?: DatabaseWrapper): Promise<number> {
    const d = customDb || this.db
    if (d) {
      try {
        const row = await SettingsRepository.getByKey(d, 'flaresolverr_max_timeout')
        if (row && typeof row.value === 'string' && row.value.trim() !== '') {
          const parsed = parseInt(row.value.trim(), 10)
          if (!isNaN(parsed) && parsed > 0) {
            this.cachedMaxTimeout = parsed
            return parsed
          }
        }
      } catch {
        // fallback to env
      }
    }
    const envVal = process.env.FLARESOLVERR_MAX_TIMEOUT
    if (envVal) {
      const parsed = parseInt(envVal, 10)
      if (!isNaN(parsed) && parsed > 0) {
        this.cachedMaxTimeout = parsed
        return parsed
      }
    }
    this.cachedMaxTimeout = 60000
    return 60000 // default 60 seconds
  }

  public async getConfig(customDb?: DatabaseWrapper): Promise<FlareSolverrConfig> {
    const [enabled, url, port, maxTimeout] = await Promise.all([
      this.isEnabled(customDb),
      this.getUrl(customDb),
      this.getPort(customDb),
      this.getMaxTimeout(customDb),
    ])
    return { enabled, url, port, maxTimeout }
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
      this.cachedBaseUrl = parsed.origin
      return parsed.origin
    } catch {
      this.cachedBaseUrl = `${rawUrl}:${port}`
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
    const configuredTimeout = await this.getMaxTimeout(customDb)
    const maxTimeout = options?.maxTimeout || configuredTimeout

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

    const configuredTimeout = await this.getMaxTimeout(customDb)
    logger.info({ extensionId, authUrl, maxTimeout: configuredTimeout }, 'Invoking FlareSolverr to solve Cloudflare challenge')
    const res = await this.solve(authUrl, { maxTimeout: configuredTimeout }, customDb)
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

  /**
   * Fire-and-forget background solve — logs result but does not block callers.
   */
  public backgroundSolveAndCache(
    extensionId: string,
    authUrl: string,
    customDb?: DatabaseWrapper
  ): void {
    this.solveAndCache(extensionId, authUrl, customDb)
      .then((result) => {
        if (result.success) {
          logger.info({ extensionId }, 'Background FlareSolverr solve succeeded, cookies cached')
        } else {
          logger.warn({ extensionId, error: result.error }, 'Background FlareSolverr solve failed')
        }
      })
      .catch((err) => {
        logger.error({ extensionId, err: (err as Error).message }, 'Background FlareSolverr solve threw')
      })
  }

  /**
   * Pre-warm FlareSolverr cookies for known Cloudflare-protected providers.
   * Called on server boot and periodically (every 90 minutes).
   */
  public async preWarmProviders(customDb?: DatabaseWrapper): Promise<void> {
    const isEnabled = await this.isEnabled(customDb)
    if (!isEnabled) {
      logger.info('FlareSolverr is disabled, skipping pre-warm')
      return
    }

    logger.info('Pre-warming FlareSolverr cookies for Cloudflare-protected providers...')

    for (const provider of CLOUDFLARE_PROVIDERS) {
      // Skip if already cached and not expired
      const existing = this.getCachedCredentials(provider.extensionId)
      if (existing) {
        logger.info({ extensionId: provider.extensionId }, 'FlareSolverr cookies already cached, skipping pre-warm')
        continue
      }

      // Fire-and-forget each provider solve so they run concurrently
      this.backgroundSolveAndCache(provider.extensionId, provider.authUrl, customDb)
    }
  }

  /**
   * Start periodic pre-warming (every 90 minutes).
   * Cookie TTL is 2 hours, so 90 min gives 30 min safety margin.
   */
  public startPeriodicPreWarm(customDb?: DatabaseWrapper): void {
    if (this.preWarmInterval) {
      clearInterval(this.preWarmInterval)
    }

    const INTERVAL_MS = 90 * 60 * 1000 // 90 minutes
    this.preWarmInterval = setInterval(() => {
      this.preWarmProviders(customDb).catch((err) => {
        logger.warn({ err: (err as Error).message }, 'Periodic FlareSolverr pre-warm failed')
      })
    }, INTERVAL_MS)

    logger.info('FlareSolverr periodic pre-warm scheduled every 90 minutes')
  }

  public stopPeriodicPreWarm(): void {
    if (this.preWarmInterval) {
      clearInterval(this.preWarmInterval)
      this.preWarmInterval = null
    }
  }
}

export const flareSolverrService = new FlareSolverrService()
