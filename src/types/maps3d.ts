/**
 * Minimal typings for the Google Maps Platform 3D Maps JS API (`google.maps.maps3d`),
 * an alpha/preview library not yet covered by `@types/google.maps`.
 * Reference: https://developers.google.com/maps/documentation/javascript/reference/3d-map
 */

export type AltitudeMode =
  | 'ABSOLUTE'
  | 'RELATIVE_TO_GROUND'
  | 'RELATIVE_TO_MESH'
  | 'CLAMP_TO_GROUND'

export type MapMode = 'SATELLITE' | 'HYBRID' | 'ROADMAP'

export interface LatLngAltitudeLiteral {
  lat: number
  lng: number
  altitude?: number
}

export interface Map3DCameraOptions {
  center: LatLngAltitudeLiteral
  range?: number
  heading?: number
  tilt?: number
  roll?: number
}

export interface Map3DElementOptions extends Partial<Map3DCameraOptions> {
  mode?: MapMode
  defaultUIDisabled?: boolean
  minAltitude?: number
  maxAltitude?: number
}

export interface FlyCameraOptions {
  endCamera: Map3DCameraOptions
  durationMillis?: number
}

export interface Map3DElement extends HTMLElement {
  center?: LatLngAltitudeLiteral
  range?: number
  heading?: number
  tilt?: number
  roll?: number
  mode?: MapMode
  flyCameraTo(options: FlyCameraOptions): void
  flyCameraAround(options: {
    camera: Map3DCameraOptions
    durationMillis: number
    repeatCount?: number
  }): void
  stopCameraAnimation(): void
}

export interface Polyline3DElementOptions {
  path: LatLngAltitudeLiteral[]
  strokeColor?: string
  strokeWidth?: number
  altitudeMode?: AltitudeMode
  drawsOccludedSegments?: boolean
}

export interface Polyline3DElement extends HTMLElement {
  path?: LatLngAltitudeLiteral[]
  strokeColor?: string
  strokeWidth?: number
}

export type CollisionBehavior =
  | 'REQUIRED'
  | 'OPTIONAL_AND_HIDES_LOWER_PRIORITY'
  | 'REQUIRED_AND_HIDES_OPTIONAL'

export interface Marker3DElementOptions {
  position: LatLngAltitudeLiteral
  altitudeMode?: AltitudeMode
  extruded?: boolean
  label?: string
  drawsWhenOccluded?: boolean
  collisionBehavior?: CollisionBehavior
}

export interface MarkerElementOptions {
  position: LatLngAltitudeLiteral
  altitudeMode?: AltitudeMode
  anchorLeft?: string
  anchorTop?: string
  collisionBehavior?: CollisionBehavior
}

export interface Marker3DElement extends HTMLElement {
  position?: LatLngAltitudeLiteral
  label?: string
}

export interface MarkerElement extends HTMLElement {
  position?: LatLngAltitudeLiteral
}

export interface PinElementOptions {
  background?: string
  borderColor?: string
  glyphColor?: string
  scale?: number
}

export type PinElement = HTMLElement

export interface Maps3DLibrary {
  Map3DElement: { new (options?: Map3DElementOptions): Map3DElement }
  Polyline3DElement: { new (options?: Polyline3DElementOptions): Polyline3DElement }
  MarkerElement: { new (options?: MarkerElementOptions): MarkerElement }
  Marker3DElement: { new (options?: Marker3DElementOptions): Marker3DElement }
  Marker3DInteractiveElement: { new (options?: Marker3DElementOptions): Marker3DElement }
}

export interface MarkerLibrary {
  PinElement: { new (options?: PinElementOptions): PinElement }
}

declare global {
  interface Window {
    google?: {
      maps: {
        importLibrary(libraryName: 'maps3d'): Promise<Maps3DLibrary>
        importLibrary(libraryName: 'marker'): Promise<MarkerLibrary>
        importLibrary(libraryName: string): Promise<Record<string, unknown>>
      }
    }
  }
}
