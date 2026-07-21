import { describe, expect, it } from 'vitest'
import { countryFlagForCoordinates, timeZoneForCoordinates } from './locationMetadata'

describe('location metadata', () => {
  it('identifies Jericó, Colombia from GPS coordinates', () => {
    expect(timeZoneForCoordinates(5.79, -75.79)).toBe('America/Bogota')
    expect(countryFlagForCoordinates(5.79, -75.79)).toBe('🇨🇴')
  })

  it('keeps Colorado flights assigned to the United States', () => {
    expect(countryFlagForCoordinates(39.74, -104.99)).toBe('🇺🇸')
  })
})
