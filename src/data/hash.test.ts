import { describe, expect, it } from 'vitest'
import { sha256Hex } from './hash'

describe('sha256Hex', () => {
  it('produces a stable hash for duplicate detection', async () => {
    await expect(sha256Hex('same igc')).resolves.toBe(await sha256Hex('same igc'))
    await expect(sha256Hex('same igc')).resolves.not.toBe(await sha256Hex('different igc'))
  })
})
