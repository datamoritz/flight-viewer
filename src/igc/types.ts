/** A single B-record fix from an IGC file, fully resolved to the altitude the app should render. */
export interface Fix {
  /** Milliseconds since Unix epoch (UTC). */
  timeMs: number
  lat: number
  lng: number
  /** Altitude in meters MSL to use for rendering/playback: GPS altitude, falling back to pressure altitude. */
  altitude: number
  /** Which altitude source was actually used for `altitude`. */
  altitudeSource: 'gps' | 'pressure'
  gpsAltitude: number | null
  pressureAltitude: number | null
}

export interface ParsedFlight {
  pilotName: string
  /** Every valid B-record fix, in chronological order — used for interpolation and the altitude profile. */
  fixes: Fix[]
  /** A simplified subset of `fixes` suitable for rendering a 3D polyline efficiently. */
  simplifiedFixes: Fix[]
  startTimeMs: number
  endTimeMs: number
  minAltitude: number
  maxAltitude: number
}

export class IgcParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IgcParseError'
  }
}
