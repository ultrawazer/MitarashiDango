export interface ExtensionCredentials {
  cookie?: string
  ua?: string
  token?: string
  updatedAt?: string
}

const KNOWN_VERIFICATION_URLS: Record<string, string> = {
  animepahe: 'https://animepahe.pw',
  jasmr: 'https://japaneseasmr.com',
}

export function getKnownVerificationUrl(extensionId: string): string {
  return KNOWN_VERIFICATION_URLS[extensionId.toLowerCase()] || ''
}

export function getExtensionAuth(extensionId: string): ExtensionCredentials | null {
  if (typeof window === 'undefined' || !window.localStorage) return null

  const id = extensionId.toLowerCase()
  const raw = localStorage.getItem(`extension_auth_${id}`)
  if (raw) {
    try {
      return JSON.parse(raw) as ExtensionCredentials
    } catch {
      // Ignore parse error and fall back
    }
  }

  // Backward compatibility fallbacks
  if (id === 'animepahe') {
    const cookie = localStorage.getItem('animepahe_cookie')
    const ua = localStorage.getItem('animepahe_ua')
    if (cookie || ua) {
      return {
        cookie: cookie || undefined,
        ua: ua || undefined,
      }
    }
  }

  if (id === 'jasmr') {
    const cookie = localStorage.getItem('jasmr_cookie')
    const ua = localStorage.getItem('jasmr_ua')
    if (cookie || ua) {
      return {
        cookie: cookie || undefined,
        ua: ua || undefined,
      }
    }
  }

  return null
}

export function setExtensionAuth(extensionId: string, creds: ExtensionCredentials): void {
  if (typeof window === 'undefined' || !window.localStorage) return

  const id = extensionId.toLowerCase()
  const payload: ExtensionCredentials = {
    ...creds,
    updatedAt: new Date().toISOString(),
  }

  localStorage.setItem(`extension_auth_${id}`, JSON.stringify(payload))

  // Synchronize legacy keys so any outside component or proxy continues to work seamlessly
  if (id === 'animepahe') {
    if (creds.cookie) localStorage.setItem('animepahe_cookie', creds.cookie)
    if (creds.ua) localStorage.setItem('animepahe_ua', creds.ua)
  } else if (id === 'jasmr') {
    if (creds.cookie) localStorage.setItem('jasmr_cookie', creds.cookie)
    if (creds.ua) localStorage.setItem('jasmr_ua', creds.ua)
  }
}

export function getAllExtensionHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  if (typeof window === 'undefined' || !window.localStorage) return headers

  const knownIds = new Set<string>(['animepahe', 'jasmr'])

  // Find all configured extension auth entries in localStorage
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('extension_auth_')) {
      const id = key.replace('extension_auth_', '').toLowerCase()
      knownIds.add(id)
    }
  }

  for (const id of knownIds) {
    const creds = getExtensionAuth(id)
    if (creds) {
      if (creds.cookie) {
        headers[`x-ext-${id}-cookie`] = creds.cookie
        if (id === 'animepahe') headers['x-animepahe-cookie'] = creds.cookie
        if (id === 'jasmr') headers['x-jasmr-cookie'] = creds.cookie
      }
      if (creds.ua) {
        headers[`x-ext-${id}-ua`] = creds.ua
        if (id === 'animepahe') headers['x-animepahe-ua'] = creds.ua
        if (id === 'jasmr') headers['x-jasmr-ua'] = creds.ua
      }
    }
  }

  return headers
}
