import { useEffect } from 'react'

const BANNER_SELECTOR = '[aria-label*="alpha channel" i]'

/**
 * The Google Maps alpha-channel dev banner ("Using the alpha channel of the
 * Google Maps JavaScript API. For development purposes only.") is injected by
 * the script itself as a fixed bar at the very top of the page, outside our
 * component tree. Without accounting for it, it overlaps and intercepts clicks
 * on the floating control cluster. This measures it and exposes its height as
 * a CSS variable so the controls can sit below it — and cleanly collapses back
 * to 0 once 3D Maps leaves the alpha channel and the banner stops appearing.
 */
export function useGoogleBannerOffset() {
  useEffect(() => {
    const root = document.documentElement
    let resizeObserver: ResizeObserver | null = null

    function attach(banner: HTMLElement) {
      const update = () => root.style.setProperty('--gmaps-banner-height', `${banner.offsetHeight}px`)
      update()
      resizeObserver = new ResizeObserver(update)
      resizeObserver.observe(banner)
    }

    const existing = document.querySelector<HTMLElement>(BANNER_SELECTOR)
    if (existing) attach(existing)

    const mutationObserver = new MutationObserver(() => {
      if (resizeObserver) return
      const banner = document.querySelector<HTMLElement>(BANNER_SELECTOR)
      if (banner) attach(banner)
    })
    mutationObserver.observe(document.body, { childList: true, subtree: true })

    return () => {
      mutationObserver.disconnect()
      resizeObserver?.disconnect()
      root.style.removeProperty('--gmaps-banner-height')
    }
  }, [])
}
