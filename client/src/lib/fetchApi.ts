import { emitAuthRequired, type ExtensionAuthPayload } from './auth-bus'
import { getAllExtensionHeaders, getKnownVerificationUrl } from './extension-auth'

export const fetchApi = async (url: string) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAllExtensionHeaders(),
  }

  const response = await fetch(url, { headers })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(text)
    } catch {
      /* ignore parse errors */
    }

    const errorMsg = typeof data.error === 'string' ? data.error : ''

    if (response.status === 403 && errorMsg === 'AUTH_REQUIRED') {
      if (data.solvingInBackground === true) {
        throw new Error('SOLVING_IN_BACKGROUND')
      }
      const providerId = (typeof data.provider === 'string' ? data.provider : '') || 'unknown'
      const authPayload: ExtensionAuthPayload = {
        extensionId: providerId,
        extensionName: typeof data.name === 'string' ? data.name : undefined,
        verificationUrl:
          typeof data.authUrl === 'string'
            ? data.authUrl
            : getKnownVerificationUrl(providerId),
      }
      emitAuthRequired('extension', authPayload)
    }

    if (response.status === 401 && errorMsg === 'LAN_AUTH_REQUIRED') {
      emitAuthRequired('lan')
    }

    throw new Error(errorMsg || `Failed to fetch from ${url}`)
  }
  return response.json()
}
