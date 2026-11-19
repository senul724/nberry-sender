import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { setSessionExpiredHandler } from '../api/client'
import { loginPath } from './session'

const PUBLIC_PATHS = ['/login', '/signup', '/verify-email', '/forgot', '/reset', '/mfa']

/**
 * Registers what happens when a refresh fails: clear every cached query and go to
 * /login?next=<current path>. Calling it repeatedly while the navigation settles is harmless.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const current = useRef('/')
  const currentPathname = useRef('/')
  const handled = useRef(false)

  useEffect(() => {
    current.current = location.pathname + location.search
    currentPathname.current = location.pathname
    handled.current = false
  }, [location.pathname, location.search])

  useEffect(() => {
    setSessionExpiredHandler(() => {
      if (handled.current) return
      handled.current = true
      queryClient.clear()
      if (PUBLIC_PATHS.includes(currentPathname.current)) return

      navigate(loginPath(current.current), { replace: true })
    })
    return () => setSessionExpiredHandler(() => {})
  }, [queryClient, navigate])

  return children
}
