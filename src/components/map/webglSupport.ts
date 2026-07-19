/**
 * Feature-detects WebGL2 support, which 3D Maps requires. Unlike API-key,
 * quota, or hardware-acceleration failures (which only surface once we try
 * to actually load the map), this is something we can check client-side
 * up front and fail fast with a clear message instead of a blank map.
 */
export function hasWebGL2Support(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2'))
  } catch {
    return false
  }
}
