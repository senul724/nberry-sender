import { qrGeometry, type QrMatrix } from './exportQr'

/** Vector QR with the org logo centred. The logo is an `<image href>`, so no canvas is involved. */
export function QrSvg({
  matrix,
  logoUrl,
  label,
  className,
}: {
  matrix: QrMatrix
  logoUrl?: string | null
  label: string
  className?: string
}) {
  const g = qrGeometry(matrix)
  return (
    <svg
      viewBox={`0 0 ${g.total} ${g.total}`}
      role="img"
      aria-label={label}
      className={className}
      shapeRendering="crispEdges"
    >
      <rect width={g.total} height={g.total} fill="#ffffff" />
      <path d={g.d} fill="#000000" />
      {logoUrl && (
        <>
          <rect
            x={g.backingAt}
            y={g.backingAt}
            width={g.backing}
            height={g.backing}
            fill="#ffffff"
          />
          <image
            href={logoUrl}
            x={g.logoAt}
            y={g.logoAt}
            width={g.logo}
            height={g.logo}
            preserveAspectRatio="xMidYMid meet"
          />
        </>
      )}
    </svg>
  )
}
