import type { PhotoExif } from './photoMatching'

function readAscii(view: DataView, start: number, length: number): string {
  if (start < 0 || start + length > view.byteLength) return ''
  let out = ''
  for (let i = 0; i < length; i++) out += String.fromCharCode(view.getUint8(start + i))
  while (out.length > 0 && out.charCodeAt(out.length - 1) === 0) out = out.slice(0, -1)
  return out
}

function parseExifDate(value: string): number | undefined {
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value.trim())
  if (!match) return undefined
  const [, year, month, day, hour, minute, second] = match
  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
}

function readRational(view: DataView, offset: number, little: boolean): number {
  if (offset < 0 || offset + 8 > view.byteLength) return 0
  const numerator = view.getUint32(offset, little)
  const denominator = view.getUint32(offset + 4, little)
  return denominator === 0 ? 0 : numerator / denominator
}

function readIfdEntries(view: DataView, tiffStart: number, ifdOffset: number, little: boolean): Map<number, { type: number; count: number; valueOffset: number }> {
  const entries = new Map<number, { type: number; count: number; valueOffset: number }>()
  const base = tiffStart + ifdOffset
  if (base < 0 || base + 2 > view.byteLength) return entries
  const count = view.getUint16(base, little)
  for (let i = 0; i < count; i++) {
    const entry = base + 2 + i * 12
    if (entry + 12 > view.byteLength) break
    entries.set(view.getUint16(entry, little), {
      type: view.getUint16(entry + 2, little),
      count: view.getUint32(entry + 4, little),
      valueOffset: view.getUint32(entry + 8, little),
    })
  }
  return entries
}

function readGpsCoord(view: DataView, tiffStart: number, entry: { valueOffset: number }, ref: string, little: boolean): number {
  const offset = tiffStart + entry.valueOffset
  const deg = readRational(view, offset, little)
  const min = readRational(view, offset + 8, little)
  const sec = readRational(view, offset + 16, little)
  const value = deg + min / 60 + sec / 3600
  return ref === 'S' || ref === 'W' ? -value : value
}

export async function readPhotoExif(file: File): Promise<PhotoExif> {
  try {
    if (!/jpe?g$/i.test(file.type) && !/\.(jpe?g)$/i.test(file.name)) return {}
    const view = new DataView(await file.arrayBuffer())
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return {}

    let offset = 2
    while (offset + 4 < view.byteLength) {
      if (view.getUint8(offset) !== 0xff) break
      const marker = view.getUint8(offset + 1)
      const size = view.getUint16(offset + 2)
      if (size < 2 || offset + 2 + size > view.byteLength) break
      if (marker === 0xe1 && readAscii(view, offset + 4, 6) === 'Exif') {
        const tiffStart = offset + 10
        if (tiffStart + 8 > view.byteLength) return {}
        const endian = readAscii(view, tiffStart, 2)
        const little = endian === 'II'
        if (!little && endian !== 'MM') return {}
        const firstIfdOffset = view.getUint32(tiffStart + 4, little)
        const ifd = readIfdEntries(view, tiffStart, firstIfdOffset, little)
        const exifOffset = ifd.get(0x8769)?.valueOffset
        const gpsOffset = ifd.get(0x8825)?.valueOffset
        let captureTimeMs: number | undefined
        let lat: number | undefined
        let lng: number | undefined

        if (exifOffset) {
          const exif = readIfdEntries(view, tiffStart, exifOffset, little)
          const dateEntry = exif.get(0x9003) ?? exif.get(0x0132)
          if (dateEntry) captureTimeMs = parseExifDate(readAscii(view, tiffStart + dateEntry.valueOffset, dateEntry.count))
        }

        if (gpsOffset) {
          const gps = readIfdEntries(view, tiffStart, gpsOffset, little)
          const latRefEntry = gps.get(1)
          const latEntry = gps.get(2)
          const lngRefEntry = gps.get(3)
          const lngEntry = gps.get(4)
          if (latRefEntry && latEntry && lngRefEntry && lngEntry) {
            const latRef = readAscii(view, tiffStart + latRefEntry.valueOffset, 1)
            const lngRef = readAscii(view, tiffStart + lngRefEntry.valueOffset, 1)
            lat = readGpsCoord(view, tiffStart, latEntry, latRef, little)
            lng = readGpsCoord(view, tiffStart, lngEntry, lngRef, little)
          }
        }

        return { captureTimeMs, lat, lng }
      }
      offset += 2 + size
    }

    return {}
  } catch {
    return {}
  }
}
