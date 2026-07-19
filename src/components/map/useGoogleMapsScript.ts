import { useEffect, useState } from 'react'
import { hasWebGL2Support } from './webglSupport'
import { installGoogleAuthFailureHandler, subscribeGoogleMapsRuntimeError } from './googleMapsRuntimeError'

interface BootstrapConfig {
  key: string
  v?: string
}

/**
 * Installs Google's official "Dynamic Library Import" bootstrap shim.
 *
 * This is required: simply adding a `<script src="https://maps.googleapis.com/maps/api/js?...">`
 * tag does NOT define `google.maps.importLibrary` on its own. The real API script
 * only knows to install the real `importLibrary` once it's loaded via this shim's
 * callback convention — the shim itself is what defines a temporary `importLibrary`
 * synchronously, so callers can invoke it immediately without waiting on a network
 * round trip. Faithful (de-minified) port of the snippet Google publishes at
 * https://developers.google.com/maps/documentation/javascript/load-maps-js-api
 */
function installGoogleMapsBootstrap(config: BootstrapConfig): void {
  const googleNamespace = ((window as unknown as Record<string, unknown>).google ??=
    {}) as Record<string, unknown>
  const mapsNamespace = (googleNamespace.maps ??= {}) as Record<string, unknown>

  if (typeof mapsNamespace.importLibrary === 'function') {
    // Already installed (e.g. by a previous mount of this hook).
    return
  }

  const requestedLibraries = new Set<string>()
  let loadPromise: Promise<void> | undefined

  const startLoad = (): Promise<void> => {
    if (loadPromise) return loadPromise
    loadPromise = new Promise((resolve, reject) => {
      const params = new URLSearchParams()
      params.set('libraries', [...requestedLibraries].join(','))
      for (const [key, value] of Object.entries(config)) {
        params.set(key.replace(/[A-Z]/g, (t) => `_${t[0].toLowerCase()}`), String(value))
      }
      params.set('callback', 'google.maps.__ib__')

      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
      script.async = true
      // The real API script calls this once it has installed the real importLibrary.
      mapsNamespace.__ib__ = () => resolve()
      script.onerror = () => {
        loadPromise = undefined
        reject(new Error('The Google Maps JavaScript API could not load.'))
      }
      const nonce = document.querySelector('script[nonce]')?.getAttribute('nonce')
      if (nonce) script.nonce = nonce
      document.head.append(script)
    })
    return loadPromise
  }

  // Temporary importLibrary: accumulates requested library names, kicks off the
  // real script load (once), then re-dispatches to whatever `importLibrary` is
  // installed by then — which by that point is the real one from the API script.
  mapsNamespace.importLibrary = (name: string, ...rest: unknown[]) => {
    requestedLibraries.add(name)
    return startLoad().then(() =>
      (mapsNamespace.importLibrary as (...args: unknown[]) => Promise<unknown>)(name, ...rest),
    )
  }
}

export type GoogleMapsScriptStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface GoogleMapsScriptState {
  status: GoogleMapsScriptStatus
  error: string | null
}

/**
 * Ensures the Google Maps dynamic-library-import bootstrap is installed so
 * `google.maps.importLibrary('maps3d' | 'marker')` can be called. Installation
 * itself is synchronous; actual network loading happens lazily on first call.
 */
export function useGoogleMapsScript(apiKey: string | undefined): GoogleMapsScriptState {
  const [state, setState] = useState<GoogleMapsScriptState>({ status: 'idle', error: null })

  useEffect(() => {
    if (!hasWebGL2Support()) {
      setState({
        status: 'error',
        error:
          'This browser or device doesn’t support WebGL2, which the 3D map requires. Try an up-to-date desktop browser (e.g. Chrome) with hardware acceleration enabled.',
      })
      return
    }

    if (!apiKey) {
      setState({
        status: 'error',
        error:
          'Missing VITE_GOOGLE_MAPS_API_KEY. Copy .env.example to .env.local, add your key, and restart the dev server.',
      })
      return
    }

    try {
      installGoogleAuthFailureHandler()
      installGoogleMapsBootstrap({ key: apiKey, v: 'alpha' })
      setState({ status: 'ready', error: null })
    } catch (err) {
      setState({
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to set up Google Maps.',
      })
    }
  }, [apiKey])

  // Auth/quota/referrer rejections arrive later, via Google's global gm_authFailure
  // callback rather than a promise we're already awaiting — even after we've
  // already reported 'ready', this can still downgrade to an error state.
  useEffect(() => {
    return subscribeGoogleMapsRuntimeError((message) => {
      setState({ status: 'error', error: message })
    })
  }, [])

  return state
}
