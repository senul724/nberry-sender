import { createBrowserRouter, Navigate, Outlet, type RouteObject } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import { SessionProvider } from './auth/SessionProvider'
import { ForgotPage } from './features/auth/ForgotPage'
import { LoginPage } from './features/auth/LoginPage'
import { ResetPage } from './features/auth/ResetPage'
import { SignupPage } from './features/auth/SignupPage'
import { VerifyEmailPage } from './features/auth/VerifyEmailPage'
import { HomePage } from './features/home/HomePage'

/**
 * Route objects, exported so tests can mount them with createMemoryRouter.
 * Later tasks add org screens as children of the RequireAuth route.
 */
export const routes: RouteObject[] = [
  {
    element: (
      <SessionProvider>
        <Outlet />
      </SessionProvider>
    ),
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/mfa', element: <Navigate to="/login" replace /> }, // the MFA step lives inside /login
      { path: '/signup', element: <SignupPage /> },
      { path: '/verify-email', element: <VerifyEmailPage /> },
      { path: '/forgot', element: <ForgotPage /> },
      { path: '/reset', element: <ResetPage /> },
      {
        element: <RequireAuth />,
        children: [{ path: '/', element: <HomePage /> }],
      },
    ],
  },
]

export const createAppRouter = () => createBrowserRouter(routes)
