import { describe, expect, it } from 'vitest'
import { parseIgc } from './parser'
import { IgcParseError } from './types'

const DATE_HEADER = 'HFDTE180726'

/** B120000 4530000N 00745000E A 01234 01300 -> lat 45.5, lng 7.75, press 1234, gps 1300 */
const B_RECORD_1 = 'B1200004530000N00745000EA0123401300'
/** One second later, moved slightly, gps altitude invalid (99999) -> falls back to pressure. */
const B_RECORD_2_INVALID_GPS = 'B1200014530100N00745100EA0123599999'
/** Ten minutes later. */
const B_RECORD_3 = 'B1210004531000N00746000EA0130001350'

function buildIgc(headerLines: string[], bRecords: string[]): string {
  return [...headerLines, ...bRecords].join('\r\n')
}

describe('parseIgc — coordinates and timestamps', () => {
  it('decodes latitude, longitude, and UTC timestamp from a B record', () => {
    const flight = parseIgc(buildIgc([DATE_HEADER], [B_RECORD_1]))

    expect(flight.fixes).toHaveLength(1)
    const [fix] = flight.fixes
    expect(fix.lat).toBeCloseTo(45.5, 6)
    expect(fix.lng).toBeCloseTo(7.75, 6)
    expect(new Date(fix.timeMs).toISOString()).toBe('2026-07-18T12:00:00.000Z')
  })

  it('applies southern/western hemispheres as negative coordinates', () => {
    const southWest = 'B1200004530000S00745000WA0123401300'
    const flight = parseIgc(buildIgc([DATE_HEADER], [southWest]))
    expect(flight.fixes[0].lat).toBeCloseTo(-45.5, 6)
    expect(flight.fixes[0].lng).toBeCloseTo(-7.75, 6)
  })

  it('orders fixes chronologically and rolls over past UTC midnight', () => {
    const lateNight = 'B2359004530000N00745000EA0123401300'
    const justAfterMidnight = 'B0001004530100N00745100EA0123501310'
    const flight = parseIgc(buildIgc([DATE_HEADER], [lateNight, justAfterMidnight]))

    expect(flight.fixes).toHaveLength(2)
    expect(flight.fixes[0].timeMs).toBeLessThan(flight.fixes[1].timeMs)
    expect(new Date(flight.fixes[1].timeMs).toISOString()).toBe('2026-07-19T00:01:00.000Z')
  })

  it('skips B records marked with an invalid (V) GPS fix', () => {
    const invalidFix = 'B1200304530000N00745000EV0123401300'
    const flight = parseIgc(buildIgc([DATE_HEADER], [B_RECORD_1, invalidFix]))
    expect(flight.fixes).toHaveLength(1)
  })

  it('ignores unparseable/non-B lines without failing', () => {
    const flight = parseIgc(
      buildIgc([DATE_HEADER], [B_RECORD_1, 'LXSB bat: 95%', 'this is not a record']),
    )
    expect(flight.fixes).toHaveLength(1)
  })
})

describe('parseIgc — pilot name headers', () => {
  it('reads HFPLTPILOTINCHARGE', () => {
    const flight = parseIgc(
      buildIgc([DATE_HEADER, 'HFPLTPILOTINCHARGE:Jane Doe'], [B_RECORD_1]),
    )
    expect(flight.pilotName).toBe('Jane Doe')
  })

  it('reads the shorter HFPLTPILOT variant', () => {
    const flight = parseIgc(buildIgc([DATE_HEADER, 'HFPLTPILOT:John Roe'], [B_RECORD_1]))
    expect(flight.pilotName).toBe('John Roe')
  })

  it('falls back to "Pilot" when no pilot header is present', () => {
    const flight = parseIgc(buildIgc([DATE_HEADER], [B_RECORD_1]))
    expect(flight.pilotName).toBe('Pilot')
  })
})

describe('parseIgc — altitude fallback', () => {
  it('prefers GPS altitude when both are plausible', () => {
    const flight = parseIgc(buildIgc([DATE_HEADER], [B_RECORD_1]))
    expect(flight.fixes[0].altitude).toBe(1300)
    expect(flight.fixes[0].altitudeSource).toBe('gps')
  })

  it('falls back to pressure altitude when GPS altitude is implausible', () => {
    const flight = parseIgc(buildIgc([DATE_HEADER], [B_RECORD_2_INVALID_GPS]))
    expect(flight.fixes[0].altitude).toBe(1235)
    expect(flight.fixes[0].altitudeSource).toBe('pressure')
    expect(flight.fixes[0].gpsAltitude).toBeNull()
  })

  it('computes min/max altitude across the flight', () => {
    const flight = parseIgc(buildIgc([DATE_HEADER], [B_RECORD_1, B_RECORD_3]))
    expect(flight.minAltitude).toBe(1300)
    expect(flight.maxAltitude).toBe(1350)
  })
})

describe('parseIgc — malformed and unsupported files', () => {
  it('throws a clear error for an empty file', () => {
    expect(() => parseIgc('')).toThrow(IgcParseError)
  })

  it('throws a clear error when there is no date header', () => {
    expect(() => parseIgc(buildIgc([], [B_RECORD_1]))).toThrow(/date header/i)
  })

  it('throws a clear error when there are no valid B records', () => {
    expect(() => parseIgc(buildIgc([DATE_HEADER], ['not a b record']))).toThrow(
      /no valid gps fixes/i,
    )
  })

  it('throws IgcParseError (not a generic Error) so the UI can show a friendly message', () => {
    try {
      parseIgc('garbage')
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(IgcParseError)
    }
  })
})
