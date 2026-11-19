import { LOGO_BACKING, LOGO_FRACTION, QUIET, type QrMatrix } from './exportQr'

/** Vector QR with the org logo centred. The logo is an `<image href>`, so no canvas is involved. */
export function QrSvg({
  matrix,
  logoUrl,
  label,
  className,
  xmlns,
}: {
  matrix: QrMatrix
  logoUrl?: string | null
  label: string
  className?: string
  /** Set for a standalone .svg file. */
  xmlns?: boolean
}) {
  const total = matrix.size + QUIET * 2
  let d = ''
  for (let r = 0; r < matrix.size; r++) {
    for (let c = 0; c < matrix.size; c++) {
      if (matrix.isDark(r, c)) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`
    }
  }
  const backing = total * LOGO_BACKING
  const logo = total * LOGO_FRACTION
  return (
    <svg
      {...(xmlns ? { xmlns: 'http://www.w3.org/2000/svg' } : {})}
      viewBox={`0 0 ${total} ${total}`}
      role="img"
      aria-label={label}
      className={className}
      shapeRendering="crispEdges"
    >
      <rect width={total} height={total} fill="#ffffff" />
      <path d={d} fill="#000000" />
      {logoUrl && (
        <>
          <rect
            x={(total - backing) / 2}
            y={(total - backing) / 2}
            width={backing}
            height={backing}
            fill="#ffffff"
          />
          <image
            href={logoUrl}
            x={(total - logo) / 2}
            y={(total - logo) / 2}
            width={logo}
            height={logo}
            preserveAspectRatio="xMidYMid meet"
          />
        </>
      )}
    </svg>
  )
}
