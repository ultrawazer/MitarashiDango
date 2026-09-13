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

  // 1. FlareSolverr credentials take precedence if available and valid
  const fsCreds = id ? flareSolverrService.getCachedCredentials(id) : null
  let cookie: string | undefined = fsCreds?.cookie
  let ua: string | undefined = fsCreds?.ua

  // Fallback to client request headers or store if not cached by FlareSolverr
  if (!cookie) {
    if (id && reqHeaders?.[`x-ext-${id}-cookie`]) {
      cookie = reqHeaders[`x-ext-${id}-cookie`] as string
    } else if (id && store?.get(`x-ext-${id}-cookie`)) {
      cookie = store.get(`x-ext-${id}-cookie`)
    } else if (id === 'animepahe') {
      cookie = (reqHeaders?.['x-animepahe-cookie'] as string) || store?.get('cookie')
    } else if (id === 'jasmr') {
      cookie = (reqHeaders?.['x-jasmr-cookie'] as string) || store?.get('jasmr_cookie')
    }
  }

  // 2. Resolve User-Agent
  if (!ua) {
    if (id && reqHeaders?.[`x-ext-${id}-ua`]) {
      ua = reqHeaders[`x-ext-${id}-ua`] as string
    } else if (id && store?.get(`x-ext-${id}-ua`)) {
      ua = store.get(`x-ext-${id}-ua`)
    } else if (id === 'animepahe') {
      ua = (reqHeaders?.['x-animepahe-ua'] as string) || store?.get('ua')
    } else if (id === 'jasmr') {
      ua = (reqHeaders?.['x-jasmr-ua'] as string) || store?.get('jasmr_ua')
    }
  }

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
