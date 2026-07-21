import { expect, test } from '@playwright/test'
import { gotoWithMockedMaps, uploadSampleFlight } from './helpers'

test.describe('upload and playback', () => {
  test('shows the empty state on load with no console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(String(err)))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await gotoWithMockedMaps(page)
    await expect(page.getByText('Flight Viewer')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Flight library' })).toBeVisible()
    await expect(page.getByText('Add your first flight')).toBeVisible()
    await expect(page.getByText('Select a flight from the library on the left or drag and drop an IGC file.')).toBeVisible()
    await expect(page.getByText('Designed by Moritz Knödler')).toBeVisible()
    await expect(page.locator('.altitude-panel')).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('uploading a valid IGC file loads the flight', async ({ page }) => {
    await gotoWithMockedMaps(page)
    await uploadSampleFlight(page)

    await expect(page.getByText('Flight Viewer')).toHaveCount(0)
    await expect(page.getByText('Designed by Moritz Knödler')).toHaveCount(0)
    await expect(page.locator('.playback-time')).toContainText('11:00:00')

    const trackCreated = await page.evaluate(() => {
      const map = document.querySelector('.map3d-container')?.firstElementChild
      return map ? map.children.length > 0 : false
    })
    expect(trackCreated).toBe(true)
  })

  test('play advances time, pause stops it cleanly', async ({ page }) => {
    await gotoWithMockedMaps(page)
    await uploadSampleFlight(page)

    await page.getByRole('button', { name: 'Play' }).click()
    await page.waitForTimeout(1200)
    const timeDuringPlay = await page.locator('.playback-time').textContent()
    expect(timeDuringPlay).not.toContain('11:00:00')

    await page.getByRole('button', { name: 'Pause' }).click()
    const timeAtPause = await page.locator('.playback-time').textContent()
    await page.waitForTimeout(500)
    const timeAfterWait = await page.locator('.playback-time').textContent()
    expect(timeAfterWait).toBe(timeAtPause)
  })

  test('default speed is 30x and is selectable among all documented speeds', async ({ page }) => {
    await gotoWithMockedMaps(page)
    await uploadSampleFlight(page)

    const select = page.locator('.playback-speed select')
    await expect(select).toHaveValue('30')
    for (const speed of ['1', '5', '10', '30', '60']) {
      await select.selectOption(speed)
      await expect(select).toHaveValue(speed)
    }
  })

  test('jump-to-start resets the time readout', async ({ page }) => {
    await gotoWithMockedMaps(page)
    await uploadSampleFlight(page)
    const startTime = await page.locator('.playback-time').textContent()

    await page.locator('.playback-speed select').selectOption('60')
    await page.getByRole('button', { name: 'Play' }).click()
    await page.waitForTimeout(800)
    // Pause before jumping: jump-to-start deliberately does not stop playback,
    // so asserting the exact start time requires a stationary clock.
    await page.getByRole('button', { name: 'Pause' }).click()
    await page.getByRole('button', { name: 'Jump to start' }).click()
    await expect(page.locator('.playback-time')).toHaveText(startTime ?? '')
  })

  test('playback stops cleanly at the end of the flight', async ({ page }) => {
    await gotoWithMockedMaps(page)
    await uploadSampleFlight(page)

    await page.locator('.playback-speed select').selectOption('60')
    await page.getByRole('button', { name: 'Play' }).click()
    // 179 fixes * 5s = ~890s of flight time; at 60x that's ~15s of wall time.
    await page.waitForTimeout(16_000)

    await expect(page.locator('.playback-time')).toContainText('11:14:55')
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()
  })

  test('loading a second file cleanly replaces the first', async ({ page }) => {
    await gotoWithMockedMaps(page)
    await uploadSampleFlight(page)
    const startTime = await page.locator('.playback-time').textContent()
    await page.getByRole('button', { name: 'Play' }).click()
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: 'Pause' }).click()

    const childCountBefore = await page.evaluate(() => {
      const map = document.querySelector('.map3d-container')?.firstElementChild
      return map ? Array.from(map.children).filter((child) => !child.hasAttribute('data-drop-line')).length : null
    })

    await uploadSampleFlight(page)

    await expect(page.locator('.playback-time')).toHaveText(startTime ?? '')
    const childCountAfter = await page.evaluate(() => {
      const map = document.querySelector('.map3d-container')?.firstElementChild
      return map ? Array.from(map.children).filter((child) => !child.hasAttribute('data-drop-line')).length : null
    })
    expect(childCountAfter).toBe(childCountBefore)
  })

  test('spacebar toggles play/pause, but is ignored while a select is focused', async ({ page }) => {
    await gotoWithMockedMaps(page)
    await uploadSampleFlight(page)

    await page.keyboard.press('Space')
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()

    await page.locator('.playback-speed select').focus()
    await page.keyboard.press('Space')
    // Still playing — space went to the focused <select>, not the global shortcut.
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  })
})
