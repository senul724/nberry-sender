import type { RequestHandler } from 'msw'

// Default handlers shared by tests; later tasks add API shapes here.
export const handlers: RequestHandler[] = []
