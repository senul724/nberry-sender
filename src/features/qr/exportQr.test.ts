import { describe, expect, it, vi } from 'vitest'
import { composeQrPng, type CanvasLike, type QrMatrix } from './exportQr'

const matrix: QrMatrix = { size: 21, isDark: (r, c) => (r + c) % 2 === 0 }

interface FakeCanvas extends CanvasLike {
  drewImage: boolean
}

/** A canvas that behaves like a tainted one once a cross-origin image has been drawn on it. */
function fakeCanvas(): FakeCanvas {
  const canvas: FakeCanvas = {
    width: 0,
    height: 0,
    drewImage: false,
    getContext: () => ({
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: () => {
        canvas.drewImage = true
      },
    }),
    toBlob: (cb) => {
      if (canvas.drewImage) throw new DOMException('tainted', 'SecurityError')
      cb(new Blob(['png'], { type: 'image/png' }))
    },
  }
  return canvas
}

describe('composeQrPng', () => {
  it('falls back to a QR without the logo when the logo fails to load', async () => {
    const out = await composeQrPng(matrix, 'https://cdn.example/logo.png', {
      createCanvas: fakeCanvas,
      loadImage: () => Promise.reject(new Error('cors')),
    })
    expect(out.withLogo).toBe(false)
    expect(out.blob.size).toBeGreaterThan(0)
  })

  it('falls back when exporting the tainted canvas throws a SecurityError', async () => {
    const out = await composeQrPng(matrix, 'https://cdn.example/logo.png', {
      createCanvas: fakeCanvas,
      loadImage: async () => ({}) as CanvasImageSource,
    })
    expect(out.withLogo).toBe(false)
  })

  it('makes a plain QR without trying to load anything when there is no logo', async () => {
    const loadImage = vi.fn()
    const out = await composeQrPng(matrix, null, { createCanvas: fakeCanvas, loadImage })
    expect(out.withLogo).toBe(false)
    expect(loadImage).not.toHaveBeenCalled()
  })

  it('reports withLogo true when the canvas stays clean', async () => {
    const clean = (): CanvasLike => ({
      width: 0,
      height: 0,
      getContext: () => ({ fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }),
      toBlob: (cb) => cb(new Blob(['png'], { type: 'image/png' })),
    })
    const out = await composeQrPng(matrix, 'https://cdn.example/logo.png', {
      createCanvas: clean,
      loadImage: async () => ({}) as CanvasImageSource,
    })
    expect(out.withLogo).toBe(true)
  })
})
