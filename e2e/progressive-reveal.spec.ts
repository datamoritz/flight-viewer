import { expect, test } from '@playwright/test'
import { gotoWithMockedMaps, uploadSampleFlight } from './helpers'

/** Sum of every polyline vertex currently on the map (track segments + pole). */
async function totalRevealedVertices(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const map = document.querySelector('.map3d-container')?.firstElementChild
    if (!map) return 0
    let total = 0
    for (const child of Array.from(map.children)) {
      const path = (child as { path?: unknown[] }).path
      if (Array.isArray(path)) total += path.length
    }
    return total
  })
}

test.describe('progressive 3D track reveal', () => {
  test('the track starts collapsed and grows as time advances', async ({ page }) => {
    await gotoWithMockedMaps(page)
    await uploadSampleFlight(page)
    // Let the fit animation and first sync frames run.
    await page.waitForTimeout(500)

    const box = await page.locator('.altitude-svg').boundingBox()
    if (!box) throw new Error('altitude-svg not found')
    const y = box.y + box.height * 0.5

    // Near the start: only a small portion of the track is drawn.
    await page.mouse.click(box.x + box.width * 0.05, y)
    await page.waitForTimeout(200)
    const nearStart = await totalRevealedVertices(page)

    // Midway: more revealed.
    await page.mouse.click(box.x + box.width * 0.5, y)
    await page.waitForTimeout(200)
    const midway = await totalRevealedVertices(page)

    // Near the end: most revealed.
    await page.mouse.click(box.x + box.width * 0.98, y)
    await page.waitForTimeout(200)
    const nearEnd = await totalRevealedVertices(page)

    expect(midway).toBeGreaterThan(nearStart)
    expect(nearEnd).toBeGreaterThan(midway)
  })

  test('scrubbing backward hides the later portion of the track again', async ({ page }) => {
    await gotoWithMockedMaps(page)
    await uploadSampleFlight(page)
    await page.waitForTimeout(500)

    const box = await page.locator('.altitude-svg').boundingBox()
    if (!box) throw new Error('altitude-svg not found')
    const y = box.y + box.height * 0.5

    await page.mouse.click(box.x + box.width * 0.95, y)
    await page.waitForTimeout(200)
    const revealedAtEnd = await totalRevealedVertices(page)

    await page.mouse.click(box.x + box.width * 0.2, y)
    await page.waitForTimeout(200)
    const revealedAfterRewind = await totalRevealedVertices(page)

    expect(revealedAfterRewind).toBeLessThan(revealedAtEnd)
  })
})
