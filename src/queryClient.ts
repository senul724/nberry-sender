import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api/errors'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Client errors (incl. 401 after a failed refresh) won't change on retry.
        retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
        refetchOnWindowFocus: false,
      },
    },
  })
}
