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
    const initialFlightsBox = await page.getByRole('button', { name: 'Flights', exact: true }).boundingBox()
    const initialLibraryBox = await page.locator('.flight-library-panel').boundingBox()
    expect((initialLibraryBox?.y ?? 0) - ((initialFlightsBox?.y ?? 0) + (initialFlightsBox?.height ?? 0))).toBeGreaterThan(30)

    await uploadSampleFlight(page)

    await expect(page.getByRole('region', { name: 'Flight library' })).toHaveCount(0)
    await expect(page.getByText('Altitude profile')).toBeHidden()
    await expect(page.getByText('Scroll in time or click play to start flight')).toBeVisible()

    const panelBox = await page.locator('.altitude-panel').boundingBox()
    expect(panelBox?.width).toBeGreaterThan(360)

    const playbackBox = await page.locator('.playback-controls').boundingBox()
    const flightsBox = await page.getByRole('button', { name: 'Flights', exact: true }).boundingBox()
    const optionsButton = page.getByRole('button', { name: 'Flight options' })
    const optionsButtonBox = await optionsButton.boundingBox()
    expect(playbackBox?.y).toBeLessThan(flightsBox?.y ?? 0)
    expect(optionsButtonBox?.y).toBeGreaterThan((flightsBox?.y ?? 0) + (flightsBox?.height ?? 0))
    expect(optionsButtonBox?.width).toBeLessThan(40)
    await expect(page.getByRole('button', { name: 'Hide vertical position curtain' })).toBeHidden()
    const northBox = await page.getByRole('button', { name: 'Face north' }).boundingBox()
    expect(northBox).not.toBeNull()
    await expect(page.getByRole('button', { name: 'Adjust flight line thickness' })).toBeHidden()
    await expect(page.locator('.playback-icon')).toHaveCount(2)

    await page.getByRole('button', { name: 'Play' }).click()
    await expect(page.locator('.moment-detail-card')).toHaveCount(0)

    await optionsButton.click()
    await expect(page.getByRole('menu', { name: 'Flight options' })).toBeVisible()
    await expect(page.getByText('Line thickness')).toBeVisible()
    await page.locator('.map3d-root').click({ position: { x: 300, y: 400 } })
    await expect(page.getByRole('menu', { name: 'Flight options' })).toHaveCount(0)

    await optionsButton.click()
    await page.getByRole('menu', { name: 'Flight options' }).getByRole('menuitem', { name: 'Add comment' }).click()
    await expect(page.getByRole('button', { name: 'Add pictures' })).toBeVisible()
    await expect(page.getByText('Drop JPEG, PNG, WebP or HEIC photos here.')).toBeHidden()
    const commentCard = page.locator('.moment-detail-card')
    const commentBox = await commentCard.boundingBox()
    expect(commentBox?.y).toBeGreaterThan(90)
    await page.getByRole('button', { name: 'Close comment' }).click()
    await expect(commentCard).toHaveCount(0)
  })
})
