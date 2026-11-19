import { describe, expect, it } from 'vitest'
import { ApiError } from './api/errors'
import { createQueryClient } from './queryClient'

function shouldRetry(count: number, err: unknown): boolean {
  const retry = createQueryClient().getDefaultOptions().queries?.retry
  if (typeof retry !== 'function') throw new Error('retry must be a function')
  return retry(count, err instanceof Error ? err : new Error('x')) === true
}

describe('query retry policy', () => {
  it('retries network errors (status 0) and 5xx, at most twice', () => {
    expect(shouldRetry(0, new ApiError(0, 'network_error', 'x'))).toBe(true)
    expect(shouldRetry(1, new ApiError(503, 'server_busy', 'x'))).toBe(true)
    expect(shouldRetry(2, new ApiError(0, 'network_error', 'x'))).toBe(false)
  })

  it('does not retry client errors', () => {
    for (const status of [400, 401, 403, 404, 409]) {
      expect(shouldRetry(0, new ApiError(status, 'x', 'x'))).toBe(false)
    }
  })
})
