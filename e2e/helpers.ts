import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { installMapsMock, type MockMapsMode } from './mocks/mapsMock'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const SAMPLE_IGC_PATH = path.join(__dirname, 'fixtures', 'sample.igc')
export const MALFORMED_IGC_PATH = path.join(__dirname, 'fixtures', 'malformed.igc')

/** Installs the mocked maps3d boundary and navigates to the app. Call before any other page interaction. */
export async function gotoWithMockedMaps(page: Page, mode: MockMapsMode = 'success'): Promise<void> {
  await page.addInitScript(installMapsMock, mode)
  await page.goto('/?provider=google')
  await page.waitForSelector('text=Flight Viewer', { timeout: 15_000 })
}

export async function uploadSampleFlight(page: Page): Promise<void> {
  await page.locator('input[type=file]').setInputFiles(SAMPLE_IGC_PATH)
  await page.waitForSelector('text=Flight Viewer', { state: 'detached', timeout: 15_000 })
}
