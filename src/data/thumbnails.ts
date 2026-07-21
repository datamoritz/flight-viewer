export async function createImageThumbnail(file: File, maxSize = 420): Promise<Blob | undefined> {
  if (!file.type.startsWith('image/')) return undefined
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Unsupported image preview.'))
      image.src = url
    })
    const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob | undefined>((resolve) => canvas.toBlob((blob) => resolve(blob ?? undefined), 'image/jpeg', 0.78))
  } catch {
    return undefined
  } finally {
    URL.revokeObjectURL(url)
  }
}
