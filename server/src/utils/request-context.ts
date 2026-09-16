import { AsyncLocalStorage } from 'node:async_hooks'
import { ExtensionContext } from '../extensions/extension.types'
import { flareSolverrService } from '../services/flaresolverr.service'

export const requestContext = new AsyncLocalStorage<Map<string, string>>()

export function getExtensionContext(
  extensionId?: string,
  reqHeaders?: Record<string, string | string[] | undefined>
): ExtensionContext {
  const store = requestContext.getStore()
  const id = extensionId?.toLowerCase() || ''

  // 1. Client request headers (explicit manual verification credentials) take highest precedence
  let manualCookie: string | undefined
  let manualUa: string | undefined

  if (id && reqHeaders?.[`x-ext-${id}-cookie`]) {
    manualCookie = reqHeaders[`x-ext-${id}-cookie`] as string
  } else if (id && store?.get(`x-ext-${id}-cookie`)) {
    manualCookie = store.get(`x-ext-${id}-cookie`)
  } else if (id === 'animepahe') {
    manualCookie = (reqHeaders?.['x-animepahe-cookie'] as string) || store?.get('cookie')
  } else if (id === 'jasmr') {
    manualCookie = (reqHeaders?.['x-jasmr-cookie'] as string) || store?.get('jasmr_cookie')
  }

  if (id && reqHeaders?.[`x-ext-${id}-ua`]) {
    manualUa = reqHeaders[`x-ext-${id}-ua`] as string
  } else if (id && store?.get(`x-ext-${id}-ua`)) {
    manualUa = store.get(`x-ext-${id}-ua`)
  } else if (id === 'animepahe') {
    manualUa = (reqHeaders?.['x-animepahe-ua'] as string) || store?.get('ua')
  } else if (id === 'jasmr') {
    manualUa = (reqHeaders?.['x-jasmr-ua'] as string) || store?.get('jasmr_ua')
  }

  // 2. FlareSolverr credentials are used as automated fallback when manual credentials are not present
  const fsCreds = id ? flareSolverrService.getCachedCredentials(id) : null

  // If client provided manual credentials that conflict with FlareSolverr's cache, evict the stale FlareSolverr cache
  if (id && manualCookie && fsCreds?.cookie && manualCookie !== fsCreds.cookie) {
    flareSolverrService.clearCachedCredentials(id)
  }

  const cookie = manualCookie || fsCreds?.cookie
  const ua = manualUa || fsCreds?.ua

  const isFsEnabled = flareSolverrService.isEnabledSync()
  const flaresolverrUrl = isFsEnabled ? flareSolverrService.getCachedBaseUrl() : undefined
  const flaresolverrTimeout = isFsEnabled ? flareSolverrService.getCachedMaxTimeout() : undefined

  return {
    ua,
    cookie,
    flaresolverrUrl,
    flaresolverrTimeout,
    jasmr_ua: id === 'jasmr' ? ua : store?.get('jasmr_ua'),
    jasmr_cookie: id === 'jasmr' ? cookie : store?.get('jasmr_cookie'),
  }
}
