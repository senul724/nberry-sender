/** Pure QR drawing helpers shared by the on-screen SVG and the PNG export. */

export interface QrMatrix {
  size: number
  isDark: (row: number, col: number) => boolean
}

/** Quiet zone around the code, in modules. */
export const QUIET = 4
/** The centred logo covers this fraction of the code's width (error correction H tolerates ~30% of the area). */
export const LOGO_FRACTION = 0.2
/** White backing square behind the logo, as a fraction of the code's width. */
export const LOGO_BACKING = 0.24

interface Ctx2D {
  fillStyle: string | CanvasGradient | CanvasPattern
  fillRect: (x: number, y: number, w: number, h: number) => void
  drawImage: (image: CanvasImageSource, x: number, y: number, w: number, h: number) => void
}

/** The subset of HTMLCanvasElement we use, so tests can pass a fake. */
export interface CanvasLike {
  width: number
  height: number
  getContext: (id: '2d') => Ctx2D | null
  toBlob: (cb: (blob: Blob | null) => void, type?: string) => void
}

export interface PngDeps {
  createCanvas: () => CanvasLike
  loadImage: (url: string) => Promise<CanvasImageSource>
}

/** Loads a cross-origin image for canvas use; rejects if it cannot be fetched with CORS. */
function loadCorsImage(url: string): Promise<CanvasImageSource> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('logo failed to load'))
    img.src = url
  })
}

const defaultDeps: PngDeps = {
  createCanvas: () => document.createElement('canvas'),
  loadImage: loadCorsImage,
}

function draw(canvas: CanvasLike, matrix: QrMatrix, px: number, logo: CanvasImageSource | null) {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas is not available')
  const total = matrix.size + QUIET * 2
  const scale = Math.floor(px / total)
  canvas.width = canvas.height = scale * total
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000000'
  for (let r = 0; r < matrix.size; r++) {
    for (let c = 0; c < matrix.size; c++) {
      if (matrix.isDark(r, c)) ctx.fillRect((c + QUIET) * scale, (r + QUIET) * scale, scale, scale)
    }
  }
  if (logo) {
    const backing = Math.round(canvas.width * LOGO_BACKING)
    const size = Math.round(canvas.width * LOGO_FRACTION)
    const at = (n: number) => Math.round((canvas.width - n) / 2)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(at(backing), at(backing), backing, backing)
    ctx.drawImage(logo, at(size), at(size), size, size)
  }
}

function toPngBlob(canvas: CanvasLike): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // A tainted canvas throws a SecurityError synchronously here.
    try {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('could not encode PNG'))),
        'image/png',
      )
    } catch (e) {
      reject(e instanceof Error ? e : new Error('could not encode PNG'))
    }
  })
}

/**
 * Renders the QR (with the logo centred when it can be loaded and exported) to a PNG. The logo
 * lives on another origin, so a failed load or a tainted canvas falls back to a plain QR on a
 * fresh canvas; `withLogo` says which one the caller got.
 */
export async function composeQrPng(
  matrix: QrMatrix,
  logoUrl: string | null | undefined,
  deps: PngDeps = defaultDeps,
  px = 1024,
): Promise<{ blob: Blob; withLogo: boolean }> {
  if (logoUrl) {
    try {
      const logo = await deps.loadImage(logoUrl)
      const canvas = deps.createCanvas()
      draw(canvas, matrix, px, logo)
      return { blob: await toPngBlob(canvas), withLogo: true }
    } catch {
      // fall through to the plain QR
    }
  }
  const canvas = deps.createCanvas()
  draw(canvas, matrix, px, null)
  return { blob: await toPngBlob(canvas), withLogo: false }
}
