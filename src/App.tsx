import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation, Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, LockKeyhole, LogIn, UserRoundPlus } from 'lucide-react'
import { useAuth } from './features/auth/AuthContext'
import { PageLoading } from './components/ui/States'
import type { UserRole } from './lib/types'

const SignInPage = lazy(() => import('./features/auth/AuthPages').then((module) => ({ default: module.SignInPage })))
const AuthCallbackPage = lazy(() => import('./features/auth/AuthPages').then((module) => ({ default: module.AuthCallbackPage })))
const SignUpPage = lazy(() => import('./features/auth/AuthPages').then((module) => ({ default: module.SignUpPage })))
const ConfirmEmailPage = lazy(() => import('./features/auth/AuthPages').then((module) => ({ default: module.ConfirmEmailPage })))
const PasswordResetPage = lazy(() => import('./features/auth/AuthPages').then((module) => ({ default: module.PasswordResetPage })))
const SetPasswordPage = lazy(() => import('./features/auth/AuthPages').then((module) => ({ default: module.SetPasswordPage })))
const MfaPage = lazy(() => import('./features/auth/AuthPages').then((module) => ({ default: module.MfaPage })))
const AppShell = lazy(() => import('./features/layout/AppShell'))
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage'))
const RecordsPage = lazy(() => import('./features/records/RecordsPage'))
const RecordDetailsPage = lazy(() => import('./features/records/RecordDetailsPage'))
const CreateRecordPage = lazy(() => import('./features/records/RecordEditorPage').then((module) => ({ default: module.CreateRecordPage })))
const EditRecordPage = lazy(() => import('./features/records/RecordEditorPage').then((module) => ({ default: module.EditRecordPage })))
const ReportsPage = lazy(() => import('./features/reports/ReportsPage'))
const UsersPage = lazy(() => import('./features/users/UsersPage'))
const AuditPage = lazy(() => import('./features/audit/AuditPage'))

function RequireSession() {
  const { session, loading, configured } = useAuth()
  const location = useLocation()
  if (loading) return <PageLoading label="Checking secure session…" />
  if (!configured || !session) return <Navigate to="/sign-in" replace state={{ from: `${location.pathname}${location.search}` }} />
  return <Outlet />
}

function RequireAdministratorMfa() {
  const { profile, assuranceLevel, loading } = useAuth()
  const location = useLocation()
  if (loading) return <PageLoading label="Checking account permissions…" />
  if (profile?.role === 'administrator' && assuranceLevel !== 'aal2') {
    return <Navigate to="/mfa" replace state={{ from: `${location.pathname}${location.search}` }} />
  }
  return <Outlet />
}

function RequireRoles({ roles }: { roles: readonly UserRole[] }) {
  const { profile, loading } = useAuth()
  if (loading) return <PageLoading label="Checking account permissions…" />
  if (!profile || !roles.includes(profile.role)) return <Navigate to="/access-denied" replace />
  return <Outlet />
}

function AccessDeniedPage() {
  return (
    <main className="auth-main" style={{ minHeight: '100vh', background: '#f5f1e8' }}>
      <section className="surface-card" style={{ width: 'min(100%, 470px)', padding: 28, textAlign: 'center' }}>
        <div className="empty-icon" style={{ margin: '0 auto' }}><LockKeyhole aria-hidden="true" /></div>
        <p className="eyebrow" style={{ marginTop: 18 }}>Restricted area</p>
        <h1 className="page-title" style={{ fontSize: 25 }}>Access denied</h1>
        <p className="page-description" style={{ marginInline: 'auto' }}>Your account does not have permission to view or change this information. If you believe this is a mistake, contact an administrator.</p>
        <Link className="button button-primary" style={{ marginTop: 18 }} to="/app"><ArrowLeft aria-hidden="true" />Return to workspace</Link>
      </section>
    </main>
  )
}

function NotFoundPage() {
  return (
    <main className="auth-main" style={{ minHeight: '100vh', background: '#f5f1e8' }}>
      <section className="surface-card" style={{ width: 'min(100%, 470px)', padding: 28, textAlign: 'center' }}>
        <p className="eyebrow">404 · Not found</p>
        <h1 className="page-title" style={{ fontSize: 25 }}>This page is not available</h1>
        <p className="page-description" style={{ marginInline: 'auto' }}>The address may be incorrect, or the page may have moved.</p>
        <Link className="button button-primary" style={{ marginTop: 18 }} to="/app">Go to dashboard</Link>
      </section>
    </main>
  )
}

function IndexPage() {
  const { session, loading } = useAuth()
  if (loading) return <PageLoading label="Loading CheckTrack…" />
  if (session) return <Navigate to="/app" replace />
  return (
    <main className="index-page">
      <section className="index-card" aria-labelledby="index-heading">
        <div className="index-brand"><img src="/favicon.svg" alt="" /><strong>CheckTrack</strong></div>
        <p className="eyebrow">Controlled record management</p>
        <h1 id="index-heading">Track every check with clarity.</h1>
        <p className="index-description">Sign in to follow a check’s recorded status and transit location, or create a read-only account to get started.</p>
        <div className="index-actions">
          <Link className="button button-primary" to="/sign-in"><LogIn aria-hidden="true" />Sign in <ArrowRight aria-hidden="true" /></Link>
          <Link className="button button-secondary" to="/sign-up"><UserRoundPlus aria-hidden="true" />Create an account</Link>
        </div>
        <p className="index-note">Your stored CheckTrack profile determines the workspace you can access. Administrator access is never selected from the sign-up form.</p>
      </section>
    </main>
  )
}

function RequireWriter() {
  return <RequireRoles roles={['administrator', 'staff']} />
}

export default function App() {
  return (
    <Suspense fallback={<PageLoading label="Loading CheckTrack…" />}>
      <Routes>
        <Route path="/" element={<IndexPage />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="/confirm-email" element={<ConfirmEmailPage />} />
        <Route path="/password-reset" element={<PasswordResetPage />} />
        <Route path="/set-password" element={<SetPasswordPage />} />
        <Route path="/access-denied" element={<AccessDeniedPage />} />
        <Route element={<RequireSession />}>
          <Route path="/mfa" element={<MfaPage />} />
          <Route element={<RequireAdministratorMfa />}>
            <Route path="/app" element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="records" element={<RecordsPage />} />
              <Route path="records/new" element={<RequireWriter />}>
                <Route index element={<CreateRecordPage />} />
              </Route>
              <Route path="records/:recordId/edit" element={<RequireWriter />}>
                <Route index element={<EditRecordPage />} />
              </Route>
              <Route path="records/:recordId" element={<RecordDetailsPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route element={<RequireRoles roles={['administrator']} />}>
                <Route path="admin" element={<UsersPage />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="audit" element={<AuditPage />} />
              </Route>
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}
