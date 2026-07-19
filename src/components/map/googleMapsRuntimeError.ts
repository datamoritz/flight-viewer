/**
 * Small module-level pub/sub for Google Maps runtime failures that arrive via
 * global callbacks rather than a promise we're already awaiting — chiefly
 * `window.gm_authFailure`, which Google calls (if defined) when an API key
 * is invalid, referrer-restricted, or otherwise rejected. Kept outside React
 * state because the callback can fire before any component has mounted.
 */
type Listener = (message: string) => void

const listeners = new Set<Listener>()
let lastError: string | null = null

export function reportGoogleMapsRuntimeError(message: string): void {
  lastError = message
  for (const listener of listeners) listener(message)
}

export function subscribeGoogleMapsRuntimeError(listener: Listener): () => void {
  listeners.add(listener)
  if (lastError) listener(lastError)
  return () => {
    listeners.delete(listener)
  }
}

export function installGoogleAuthFailureHandler(): void {
  const w = window as unknown as { gm_authFailure?: () => void }
  if (w.gm_authFailure) return
  w.gm_authFailure = () => {
    reportGoogleMapsRuntimeError(
      'Google rejected this API key or the current origin. Check the key’s restrictions and that "Maps JavaScript API" is enabled in the Cloud Console.',
    )
  }
}
