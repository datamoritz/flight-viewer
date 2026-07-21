import { expect, test } from '@playwright/test'
import { gotoWithMockedMaps, uploadSampleFlight } from './helpers'

test.describe('altitude profile', () => {
  test('clicking in the profile jumps playback to that time', async ({ page }) => {
    await gotoWithMockedMaps(page)
    await uploadSampleFlight(page)

    const box = await page.locator('.altitude-svg').boundingBox()
    if (!box) throw new Error('altitude-svg not found')

    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5)
    const timeAfterClick = await page.locator('.playback-time').textContent()
    expect(timeAfterClick).not.toContain('11:00:00')
    expect(timeAfterClick).not.toContain('11:14:55')
  })

  test('dragging in the profile scrubs continuously', async ({ page }) => {
    await gotoWithMockedMaps(page)
    await uploadSampleFlight(page)

    const box = await page.locator('.altitude-svg').boundingBox()
    if (!box) throw new Error('altitude-svg not found')
    const y = box.y + box.height * 0.5

    await page.mouse.move(box.x + box.width * 0.1, y)
    await page.mouse.down()
    const times: string[] = []
    for (const fraction of [0.3, 0.5, 0.7, 0.9]) {
      await page.mouse.move(box.x + box.width * fraction, y, { steps: 5 })
      const t = await page.locator('.playback-time').textContent()
      if (t) times.push(t)
    }
    await page.mouse.up()

    // Time should have advanced monotonically as the drag moved rightward.
    const parseSeconds = (t: string) => {
      const [h, m, s] = t.slice(0, 8).split(':').map(Number)
      return h * 3600 + m * 60 + s
    }
    for (let i = 1; i < times.length; i++) {
      expect(parseSeconds(times[i])).toBeGreaterThanOrEqual(parseSeconds(times[i - 1]))
    }
  })

  test('scrubbing while playing continues from the new position without restarting', async ({ page }) => {
    await gotoWithMockedMaps(page)
    await uploadSampleFlight(page)

    await page.locator('.playback-speed select').selectOption('10')
    await page.getByRole('button', { name: 'Play' }).click()
    await page.waitForTimeout(500)

    const box = await page.locator('.altitude-svg').boundingBox()
    if (!box) throw new Error('altitude-svg not found')
    await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.5)

    const timeAfterScrub = await page.locator('.playback-time').textContent()
    // Still playing (not reset to a paused state), and advancing from the scrubbed point.
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
    await page.waitForTimeout(500)
    const timeLater = await page.locator('.playback-time').textContent()
    expect(timeLater).not.toBe(timeAfterScrub)
  })

  test('the resize handle drags the panel height within its clamped bounds', async ({ page }) => {
    await gotoWithMockedMaps(page)
    await uploadSampleFlight(page)

    const heightBefore = await page.locator('.altitude-panel').evaluate((el) => el.getBoundingClientRect().height)
    expect(heightBefore).toBe(440)

    const handleBox = await page.locator('.altitude-panel-handle').boundingBox()
    if (!handleBox) throw new Error('handle not found')
    const hx = handleBox.x + handleBox.width / 2
    const hy = handleBox.y + handleBox.height / 2

    // The panel now starts expanded, so dragging up should stay clamped at the maximum.
    await page.mouse.move(hx, hy)
    await page.mouse.down()
    await page.mouse.move(hx, hy - 100, { steps: 8 })
    await page.mouse.up()
    const heightAfterGrow = await page.locator('.altitude-panel').evaluate((el) => el.getBoundingClientRect().height)
    expect(heightAfterGrow).toBe(heightBefore)

    // Try to shrink it far past the minimum — should clamp, not go to 0 or negative.
    const handleBox2 = await page.locator('.altitude-panel-handle').boundingBox()
    if (!handleBox2) throw new Error('handle not found')
    await page.mouse.move(handleBox2.x + handleBox2.width / 2, handleBox2.y + handleBox2.height / 2)
    await page.mouse.down()
    await page.mouse.move(handleBox2.x + handleBox2.width / 2, handleBox2.y + 2000, { steps: 8 })
    await page.mouse.up()
    const heightAfterShrink = await page.locator('.altitude-panel').evaluate((el) => el.getBoundingClientRect().height)
    expect(heightAfterShrink).toBeGreaterThanOrEqual(140)
    expect(heightAfterShrink).toBeLessThan(heightBefore)

    const handleBox3 = await page.locator('.altitude-panel-handle').boundingBox()
    if (!handleBox3) throw new Error('handle not found')
    await page.mouse.move(handleBox3.x + handleBox3.width / 2, handleBox3.y + handleBox3.height / 2)
    await page.mouse.down()
    await page.mouse.move(handleBox3.x + handleBox3.width / 2, handleBox3.y - 2000, { steps: 8 })
    await page.mouse.up()
    const heightAfterRegrow = await page.locator('.altitude-panel').evaluate((el) => el.getBoundingClientRect().height)
    expect(heightAfterRegrow).toBe(heightBefore)
  })
})
