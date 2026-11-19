import { focusRing } from './focus'

export const controlClass = [
  'block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900',
  'placeholder:text-zinc-400 disabled:opacity-60',
  'aria-[invalid=true]:border-red-500',
  'dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100',
  focusRing,
].join(' ')
