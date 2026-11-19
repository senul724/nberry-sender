import { Button } from './Button'

/** Renders nothing when the list has ended (next_cursor null). */
export function LoadMore({
  hasMore,
  loading,
  onClick,
}: {
  hasMore: boolean
  loading?: boolean
  onClick: () => void
}) {
  if (!hasMore) return null
  return (
    <div className="flex justify-center pt-2">
      <Button variant="secondary" loading={loading} onClick={onClick}>
        Load more
      </Button>
    </div>
  )
}
