export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const LOGO_MAX_BYTES = 1 << 20
export const LOGO_MIN_PX = 64
export const LOGO_MAX_PX = 2048

/** Decoded pixel size of an image file; rejects if the browser cannot decode it. */
async function dimensions(file: File): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return size
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => reject(new Error('decode failed'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Mirrors the server's rules (type, 1 MiB, 64-2048 px per side). Returns an error message or null. */
export async function validateLogo(file: File): Promise<string | null> {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) {
    return 'Use a PNG, JPEG or WebP image.'
  }
  if (file.size > LOGO_MAX_BYTES) return 'That file is too large. The limit is 1 MiB.'
  try {
    const { width, height } = await dimensions(file)
    const ok = (n: number) => n >= LOGO_MIN_PX && n <= LOGO_MAX_PX
    if (!ok(width) || !ok(height)) {
      return `The image must be between ${LOGO_MIN_PX} and ${LOGO_MAX_PX} px on each side (this one is ${width} × ${height}).`
    }
  } catch {
    return 'That image could not be read. Use a PNG, JPEG or WebP file.'
  }
  return null
}
