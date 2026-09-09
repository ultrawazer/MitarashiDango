// Typed pub/sub for auth-modal triggers.
//
// API responses signal auth requirements from outside React (see `fetchApi`),
// while modal state lives in context providers (e.g. LanAuthProvider, ExtensionAuthProvider).
// Instead of hardcoding specific providers, 'extension' auth passes a structured payload.

export interface ExtensionAuthPayload {
  extensionId: string
  extensionName?: string
  verificationUrl?: string
  authType?: 'cloudflare' | 'cookie' | 'credentials'
}

export type AuthModalKind = 'lan' | 'extension'

type AuthListener<T = unknown> = (payload?: T) => void

const listeners = new Map<string, Set<AuthListener<any>>>()

export function subscribeAuthRequired<T = unknown>(
  kind: AuthModalKind,
  listener: AuthListener<T>
): () => void {
  if (!listeners.has(kind)) {
    listeners.set(kind, new Set())
  }
  const set = listeners.get(kind)!
  set.add(listener)
  return () => {
    set.delete(listener)
  }
}

export function emitAuthRequired<T = unknown>(kind: AuthModalKind, payload?: T): void {
  const set = listeners.get(kind)
  if (set) {
    for (const listener of Array.from(set)) {
      try {
        listener(payload)
      } catch {
        // Ignore listener errors
      }
    }
  }
}
