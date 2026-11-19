import type { ReactNode } from 'react'

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <p className="text-sm font-semibold text-berry-700 dark:text-berry-300">nBerry Sender</p>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle && <p className="text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>}
        </div>
        {children}
        {footer && (
          <div className="text-center text-sm text-zinc-600 dark:text-zinc-400">{footer}</div>
        )}
      </div>
    </main>
  )
}

export const linkClass =
  'font-medium text-berry-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry-600 dark:text-berry-300'
