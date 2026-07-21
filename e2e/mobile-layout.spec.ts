import { expect, test } from '@playwright/test'
import { gotoWithMockedMaps, uploadSampleFlight } from './helpers'

test.describe('mobile layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
  })

  test('uses a touch-focused startup and flight layout', async ({ page }) => {
    await gotoWithMockedMaps(page)

    await expect(page.getByText('Select a flight or add an IGC file.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Face north' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Rotate left' })).toBeHidden()

    await uploadSampleFlight(page)

    await expect(page.getByRole('region', { name: 'Flight library' })).toHaveCount(0)
    await expect(page.getByText('Altitude profile')).toBeHidden()
    await expect(page.getByText('Scroll in time or click play to start flight')).toBeVisible()

    const panelBox = await page.locator('.altitude-panel').boundingBox()
    expect(panelBox?.width).toBeGreaterThan(360)

    const flightsBox = await page.getByRole('button', { name: 'Flights' }).boundingBox()
    const playbackBox = await page.locator('.playback-controls').boundingBox()
    expect(playbackBox?.y).toBeGreaterThan((flightsBox?.y ?? 0) + (flightsBox?.height ?? 0))
    await expect(page.locator('.playback-icon')).toHaveCount(2)
  })
})
