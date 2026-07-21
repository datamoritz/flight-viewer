import { expect, test } from '@playwright/test'
import { gotoWithMockedMaps, uploadSampleFlight, MALFORMED_IGC_PATH } from './helpers'

test.describe('graceful error handling', () => {
  test('uploading a malformed IGC file shows a clear error and does not crash', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(String(err)))

    await gotoWithMockedMaps(page)
    await page.locator('input[type=file]').setInputFiles(MALFORMED_IGC_PATH)

    await expect(page.locator('.error-banner')).toBeVisible()
    await expect(page.locator('.error-banner')).toContainText(/date header|no valid gps fixes/i)
    // The app itself should not have thrown.
    expect(errors).toEqual([])
  })

  test('a malformed file uploaded after a valid flight does not clear the existing flight', async ({ page }) => {
    await gotoWithMockedMaps(page)
    await uploadSampleFlight(page)
    const startTime = await page.locator('.playback-time').textContent()

    await page.locator('input[type=file]').setInputFiles(MALFORMED_IGC_PATH)

    await expect(page.locator('.error-banner')).toBeVisible()
    // Previous flight is still loaded and controls still work.
    await expect(page.locator('.playback-time')).toHaveText(startTime ?? '')
    await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled()
  })

  test('the error banner can be dismissed', async ({ page }) => {
    await gotoWithMockedMaps(page)
    await page.locator('input[type=file]').setInputFiles(MALFORMED_IGC_PATH)
    await expect(page.locator('.error-banner')).toBeVisible()

    await page.getByRole('button', { name: 'Dismiss error' }).click()
    await expect(page.locator('.error-banner')).toHaveCount(0)
  })

  test('a rendering-time map failure (e.g. no hardware acceleration) shows a clear message', async ({ page }) => {
    await gotoWithMockedMaps(page, 'gmp-error')
    await expect(page.locator('.map3d-status-overlay')).toBeVisible()
    await expect(page.locator('.map3d-status-error')).toContainText(/hardware acceleration/i)
  })

  test('an API key/referrer rejection shows a clear message', async ({ page }) => {
    await gotoWithMockedMaps(page, 'auth-failure')
    await expect(page.locator('.map3d-status-overlay')).toBeVisible()
    await expect(page.locator('.map3d-status-error')).toContainText(/rejected this API key|referrer/i)
  })
})
