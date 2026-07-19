import { parseIgc } from './parser'
import type { ParsedFlight } from './types'

/** Reads a File selected/dropped by the user and parses it as an IGC flight log. */
export async function loadIgcFile(file: File): Promise<ParsedFlight> {
  const text = await file.text()
  return parseIgc(text)
}
