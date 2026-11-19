import { createBrowserRouter, Navigate, Outlet, type RouteObject } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import { SessionProvider } from './auth/SessionProvider'
import { ForgotPage } from './features/auth/ForgotPage'
import { LoginPage } from './features/auth/LoginPage'
import { ResetPage } from './features/auth/ResetPage'
import { SignupPage } from './features/auth/SignupPage'
import { VerifyEmailPage } from './features/auth/VerifyEmailPage'
import { AccountPage } from './features/account/AccountPage'
import { AdminPage } from './features/admin/AdminPage'
import { ApiKeysPage } from './features/api-keys/ApiKeysPage'
import { ComposePage } from './features/compose/ComposePage'
import { CustomersPage } from './features/customers/CustomersPage'
import { DevelopersPage } from './features/developers/DevelopersPage'
import { MessagesPage } from './features/messages/MessagesPage'
import { CreateOrgPage } from './features/orgs/CreateOrgPage'
import { IndexRedirect } from './features/orgs/IndexRedirect'
import { OverviewPage } from './features/overview/OverviewPage'
import { QrPage } from './features/qr/QrPage'
import { DangerPage } from './features/settings/DangerPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { TeamPage } from './features/team/TeamPage'
import { AppLayout } from './layout/AppLayout'
import { OrgProvider } from './orgs/OrgProvider'
import { RequireRole } from './orgs/RequireRole'

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
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: '/', element: <IndexRedirect /> },
              { path: '/orgs/new', element: <CreateOrgPage /> },
              { path: '/account', element: <AccountPage /> },
              { path: '/admin', element: <AdminPage /> },
              {
                path: '/orgs/:orgId',
                element: <OrgProvider />,
                children: [
                  { index: true, element: <OverviewPage /> },
                  { path: 'compose', element: <ComposePage /> },
                  { path: 'messages', element: <MessagesPage /> },
                  { path: 'qr', element: <QrPage /> },
                  { path: 'customers', element: <CustomersPage /> },
                  { path: 'api-keys', element: <ApiKeysPage /> },
                  { path: 'team', element: <TeamPage /> },
                  {
                    path: 'settings',
                    element: (
                      <RequireRole can="editSettings">
                        <SettingsPage />
                      </RequireRole>
                    ),
                  },
                  {
                    path: 'settings/danger',
                    element: (
                      <RequireRole can="deleteOrg">
                        <DangerPage />
                      </RequireRole>
                    ),
                  },
                  { path: 'developers', element: <DevelopersPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]

export const createAppRouter = () => createBrowserRouter(routes)
