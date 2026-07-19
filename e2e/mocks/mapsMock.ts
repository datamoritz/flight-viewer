/**
 * Mocks the `google.maps.maps3d` / `google.maps.marker` boundary entirely
 * client-side, so the app's own logic (upload/parse, playback, follow/explore
 * state, the altitude profile, error handling) can be exercised in CI without
 * a real API key, network access, or GPU. Installed via
 * `page.addInitScript(installMapsMock, mode)` — Playwright serializes this
 * function into the page, so it MUST be fully self-contained (no references
 * to anything outside its own body).
 *
 * `mode` controls which failure path (if any) the mock simulates, so the same
 * harness can exercise the app's graceful-error-handling states.
 */
export type MockMapsMode = 'success' | 'gmp-error' | 'auth-failure'

export function installMapsMock(mode: MockMapsMode): void {
  class FakeMap3DElement extends HTMLElement {
    center?: { lat: number; lng: number; altitude?: number }
    range?: number
    heading?: number
    tilt?: number
    roll?: number
    mode?: string

    constructor(options: Record<string, unknown> = {}) {
      super()
      Object.assign(this, options)
      this.style.display = 'block'
      this.style.width = '100%'
      this.style.height = '100%'
      // Distinguishable fake "terrain" fill so screenshots aren't just blank.
      this.style.background = 'linear-gradient(180deg, #274b6d 0%, #1b3350 100%)'
      this.setAttribute('data-mock-map', 'true')
    }

    flyCameraTo(options: { endCamera?: Record<string, unknown>; durationMillis?: number }): void {
      if (options.endCamera) Object.assign(this, options.endCamera)
      const delay = Math.min(options.durationMillis ?? 0, 30)
      setTimeout(() => this.dispatchEvent(new CustomEvent('gmp-animationend')), delay)
    }

    flyCameraAround(): void {}
    stopCameraAnimation(): void {}
  }

  class FakePolyline3DElement extends HTMLElement {
    path?: unknown[]
    strokeColor?: string
    strokeWidth?: number
    constructor(options: Record<string, unknown> = {}) {
      super()
      Object.assign(this, options)
    }
  }

  class FakeMarker3DElement extends HTMLElement {
    position?: { lat: number; lng: number; altitude?: number }
    label?: string
    constructor(options: Record<string, unknown> = {}) {
      super()
      Object.assign(this, options)
    }
  }

  class FakePinElement extends HTMLElement {
    constructor(options: Record<string, unknown> = {}) {
      super()
      Object.assign(this, options)
    }
  }

  const tagSuffix = Math.random().toString(36).slice(2, 8)
  customElements.define(`mock-gmp-map-3d-${tagSuffix}`, FakeMap3DElement)
  customElements.define(`mock-gmp-polyline-3d-${tagSuffix}`, FakePolyline3DElement)
  customElements.define(`mock-gmp-marker-3d-${tagSuffix}`, FakeMarker3DElement)
  customElements.define(`mock-gmp-pin-${tagSuffix}`, FakePinElement)

  const w = window as unknown as {
    google?: { maps?: Record<string, unknown> }
    gm_authFailure?: () => void
  }
  w.google = w.google || {}
  w.google.maps = w.google.maps || {}

  if (mode === 'auth-failure') {
    // Simulate Google rejecting the key/referrer. Real Maps calls
    // window.gm_authFailure asynchronously, some time after the app has
    // installed it — but under a dev server the app may take longer than any
    // fixed delay to mount and install the handler, so poll until it exists.
    const poll = setInterval(() => {
      if (typeof w.gm_authFailure === 'function') {
        clearInterval(poll)
        w.gm_authFailure()
      }
    }, 25)
  }

  w.google.maps.importLibrary = (name: string) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (name === 'maps3d') {
          resolve({
            Map3DElement: FakeMap3DElement,
            Polyline3DElement: FakePolyline3DElement,
            MarkerElement: FakeMarker3DElement,
            Marker3DElement: FakeMarker3DElement,
            Marker3DInteractiveElement: FakeMarker3DElement,
          })
        } else if (name === 'marker') {
          resolve({ PinElement: FakePinElement })
        } else {
          reject(new Error(`mock importLibrary: unknown library "${name}"`))
        }
      }, 10)
    })
  }

  if (mode === 'gmp-error') {
    // Patch the map constructor to asynchronously fire a rendering-time
    // failure (e.g. simulating hardware acceleration being unavailable),
    // mirroring how a real failure arrives after successful construction.
    const OriginalMap = FakeMap3DElement
    const patched = class extends OriginalMap {
      constructor(options: Record<string, unknown> = {}) {
        super(options)
        setTimeout(() => this.dispatchEvent(new CustomEvent('gmp-error')), 30)
      }
    }
    customElements.define(`mock-gmp-map-3d-err-${tagSuffix}`, patched)
    w.google.maps.importLibrary = (name: string) => {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (name === 'maps3d') {
            resolve({
              Map3DElement: patched,
              Polyline3DElement: FakePolyline3DElement,
              MarkerElement: FakeMarker3DElement,
              Marker3DElement: FakeMarker3DElement,
              Marker3DInteractiveElement: FakeMarker3DElement,
            })
          } else if (name === 'marker') {
            resolve({ PinElement: FakePinElement })
          } else {
            reject(new Error(`mock importLibrary: unknown library "${name}"`))
          }
        }, 10)
      })
    }
  }
}
