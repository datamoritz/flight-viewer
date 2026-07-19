import { IgcParseError, type Fix, type ParsedFlight } from './types'
import { simplifyFixes } from './simplify'

const B_RECORD_RE =
  /^B(\d{2})(\d{2})(\d{2})(\d{2})(\d{5})([NS])(\d{3})(\d{5})([EW])([AV])(.{5})(.{5})/

const DATE_RE = /^HFDTE(?:DATE:)?(\d{2})(\d{2})(\d{2})/i

const PILOT_RE = /^H[FOP]PLT[A-Z]*:(.*)$/i

const MIN_PLAUSIBLE_ALTITUDE_M = -500
const MAX_PLAUSIBLE_ALTITUDE_M = 12000

function isPlausibleAltitude(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value > MIN_PLAUSIBLE_ALTITUDE_M &&
    value < MAX_PLAUSIBLE_ALTITUDE_M
  )
}

function parseDdmmyy(line: string): { year: number; month: number; day: number } | null {
  const match = DATE_RE.exec(line)
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const yy = Number(match[3])
  const year = 2000 + yy
  return { year, month, day }
}

function findPilotName(lines: string[]): string {
  for (const line of lines) {
    const match = PILOT_RE.exec(line.trim())
    if (match) {
      const name = match[1].trim()
      if (name.length > 0) return name
    }
  }
  return 'Pilot'
}

function parseLatLng(
  latDeg: string,
  latMinThousandths: string,
  latHem: string,
  lonDeg: string,
  lonMinThousandths: string,
  lonHem: string,
): { lat: number; lng: number } {
  const lat = Number(latDeg) + Number(latMinThousandths) / 1000 / 60
  const lng = Number(lonDeg) + Number(lonMinThousandths) / 1000 / 60
  return {
    lat: latHem.toUpperCase() === 'S' ? -lat : lat,
    lng: lonHem.toUpperCase() === 'W' ? -lng : lng,
  }
}

/**
 * Parses raw IGC file text into a flight ready for playback and rendering.
 * Throws IgcParseError for files that are unreadable, missing a date header,
 * or that contain no valid GPS fixes.
 */
export function parseIgc(text: string): ParsedFlight {
  if (!text || text.trim().length === 0) {
    throw new IgcParseError('The file is empty.')
  }

  const lines = text.split(/\r\n|\r|\n/)

  const headerLines = lines.filter((line) => line.startsWith('H'))
  const pilotName = findPilotName(headerLines)

  let date: { year: number; month: number; day: number } | null = null
  for (const line of headerLines) {
    date = parseDdmmyy(line)
    if (date) break
  }
  if (!date) {
    throw new IgcParseError(
      'This IGC file is missing its date header (HFDTE) and cannot be read.',
    )
  }

  const fixes: Fix[] = []
  let dayOffsetMs = 0
  let previousSecondOfDay: number | null = null
  const baseMidnightMs = Date.UTC(date.year, date.month - 1, date.day, 0, 0, 0)

  for (const rawLine of lines) {
    if (rawLine.charAt(0) !== 'B') continue
    const match = B_RECORD_RE.exec(rawLine)
    if (!match) continue

    const [
      ,
      hh,
      mm,
      ss,
      latDeg,
      latMinThousandths,
      latHem,
      lonDeg,
      lonMinThousandths,
      lonHem,
      validity,
      pressAltRaw,
      gpsAltRaw,
    ] = match

    if (validity.toUpperCase() !== 'A') continue

    const secondOfDay = Number(hh) * 3600 + Number(mm) * 60 + Number(ss)
    if (previousSecondOfDay !== null && secondOfDay < previousSecondOfDay - 60) {
      // Time went backwards by more than a minute: flight crossed UTC midnight.
      dayOffsetMs += 24 * 60 * 60 * 1000
    }
    previousSecondOfDay = secondOfDay

    const { lat, lng } = parseLatLng(
      latDeg,
      latMinThousandths,
      latHem,
      lonDeg,
      lonMinThousandths,
      lonHem,
    )
    if (Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      continue
    }

    const pressureAltNum = Number(pressAltRaw)
    const gpsAltNum = Number(gpsAltRaw)
    const pressureAltitude = isPlausibleAltitude(pressureAltNum) ? pressureAltNum : null
    const gpsAltitude = isPlausibleAltitude(gpsAltNum) ? gpsAltNum : null

    let altitude: number
    let altitudeSource: Fix['altitudeSource']
    if (gpsAltitude !== null) {
      altitude = gpsAltitude
      altitudeSource = 'gps'
    } else if (pressureAltitude !== null) {
      altitude = pressureAltitude
      altitudeSource = 'pressure'
    } else {
      continue
    }

    fixes.push({
      timeMs: baseMidnightMs + dayOffsetMs + secondOfDay * 1000,
      lat,
      lng,
      altitude,
      altitudeSource,
      gpsAltitude,
      pressureAltitude,
    })
  }

  if (fixes.length === 0) {
    throw new IgcParseError('No valid GPS fixes (B records) were found in this file.')
  }

  fixes.sort((a, b) => a.timeMs - b.timeMs)

  let minAltitude = fixes[0].altitude
  let maxAltitude = fixes[0].altitude
  for (const fix of fixes) {
    if (fix.altitude < minAltitude) minAltitude = fix.altitude
    if (fix.altitude > maxAltitude) maxAltitude = fix.altitude
  }

  return {
    pilotName,
    fixes,
    simplifiedFixes: simplifyFixes(fixes),
    startTimeMs: fixes[0].timeMs,
    endTimeMs: fixes[fixes.length - 1].timeMs,
    minAltitude,
    maxAltitude,
  }
}
