// Typed pub/sub for auth-modal triggers.
//
// API responses signal auth requirements from outside React (see `fetchApi`),
// while the modal state lives in context providers. Instead of global
// window.dispatchEvent hacks, dispatch sites emit here and the owning
// providers subscribe and open their own modals.
export type AuthModalKind = 'lan' | 'animepahe' | 'jasmr'

type AuthModalListener = () => void

const listeners: Record<AuthModalKind, Set<AuthModalListener>> = {
  lan: new Set(),
  animepahe: new Set(),
  jasmr: new Set(),
}

export function subscribeAuthRequired(
  kind: AuthModalKind,
  listener: AuthModalListener
): () => void {
  listeners[kind].add(listener)
  return () => {
    listeners[kind].delete(listener)
  }
}

export function emitAuthRequired(kind: AuthModalKind): void {
  for (const listener of Array.from(listeners[kind])) {
    try {
      listener()
    } catch {
      // Ignore listener errors
    }
  }
}
