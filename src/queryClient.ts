import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api/errors'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Client errors (incl. 401 after a failed refresh) won't change on retry; a network
        // failure (status 0) and 5xx might.
        retry: (count, err) =>
          count < 2 && (!(err instanceof ApiError) || err.status === 0 || err.status >= 500),
        refetchOnWindowFocus: false,
      },
    },
  })
}
