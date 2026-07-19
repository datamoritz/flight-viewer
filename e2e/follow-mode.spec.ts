import { expect, test } from '@playwright/test'
import { gotoWithMockedMaps, uploadSampleFlight } from './helpers'

test.describe('always-follow camera & pilot label', () => {
  test('the pilot label is shown by default once a flight is loaded', async ({ page }) => {
    await gotoWithMockedMaps(page)
    await uploadSampleFlight(page)

    // The overlay container is a zero-size anchor point (its name/altitude
    // children are absolutely positioned around it), so assert on the children.
    await expect(page.locator('.pilot-label-name')).toBeVisible()
    await expect(page.locator('.pilot-label-name')).toHaveText('Test Pilot')
    await expect(page.locator('.pilot-label-altitude')).toHaveText('1500 m')
  })

  test('there is no follow/explore toggle button — following is always on', async ({ page }) => {
    await gotoWithMockedMaps(page)
    await uploadSampleFlight(page)

    await expect(page.locator('.follow-button')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /explore freely|follow pilot/i })).toHaveCount(0)
  })

  test('the pilot label altitude updates as the flight advances', async ({ page }) => {
    await gotoWithMockedMaps(page)
    await uploadSampleFlight(page)

    const initialAltitude = await page.locator('.pilot-label-altitude').textContent()

    const box = await page.locator('.altitude-svg').boundingBox()
    if (!box) throw new Error('altitude-svg not found')
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5)

    const altitudeAfterScrub = await page.locator('.pilot-label-altitude').textContent()
    expect(altitudeAfterScrub).not.toBe(initialAltitude)
  })
})

test.describe('on-screen camera controls', () => {
  test('all camera controls are present once the map is ready', async ({ page }) => {
    await gotoWithMockedMaps(page)
    for (const name of ['Face north', 'Rotate left', 'Rotate right', 'Tilt up', 'Tilt down', 'Zoom in', 'Zoom out']) {
      await expect(page.getByRole('button', { name })).toBeVisible()
    }
  })

  test('rotate control changes the map heading', async ({ page }) => {
    await gotoWithMockedMaps(page)
    await uploadSampleFlight(page)
    // Let the fit animation settle so heading is stable before we nudge it.
    await page.waitForTimeout(500)

    const headingBefore = await page.evaluate(
      () => (document.querySelector('.map3d-container')?.firstElementChild as { heading?: number })?.heading ?? null,
    )
    await page.getByRole('button', { name: 'Rotate right' }).click()
    const headingAfter = await page.evaluate(
      () => (document.querySelector('.map3d-container')?.firstElementChild as { heading?: number })?.heading ?? null,
    )
    expect(headingAfter).not.toBe(headingBefore)
  })

  test('zoom controls change the camera range', async ({ page }) => {
    await gotoWithMockedMaps(page)
    await uploadSampleFlight(page)
    await page.waitForTimeout(500)

    const readRange = () =>
      page.evaluate(
        () => (document.querySelector('.map3d-container')?.firstElementChild as { range?: number })?.range ?? null,
      )
    const before = await readRange()
    await page.getByRole('button', { name: 'Zoom in' }).click()
    const after = await readRange()
    expect(after).not.toBe(before)
    if (before !== null && after !== null) expect(after).toBeLessThan(before)
  })

  test('tilt controls change the camera tilt', async ({ page }) => {
    await gotoWithMockedMaps(page)
    await uploadSampleFlight(page)
    await page.waitForTimeout(500)

    const readTilt = () =>
      page.evaluate(
        () => (document.querySelector('.map3d-container')?.firstElementChild as { tilt?: number })?.tilt ?? null,
      )
    const before = await readTilt()
    await page.getByRole('button', { name: 'Tilt down' }).click()
    const after = await readTilt()
    expect(after).not.toBe(before)
  })
})
