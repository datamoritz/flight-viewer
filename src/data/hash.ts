export async function sha256Hex(file: File | Blob | string): Promise<string> {
  const data = typeof file === 'string' ? new TextEncoder().encode(file) : await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
