import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowDownToLine,
  ClipboardList,
  FileClock,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../auth/AuthContext'
import { getInitials, roleLabels } from '../../lib/format'
import { logSafeFailure } from '../../lib/errors'
import type { UserRole } from '../../lib/types'

const pageNames: Array<{ prefix: string; label: string }> = [
  { prefix: '/app/records/new', label: 'New record' },
  { prefix: '/app/records', label: 'Check records' },
  { prefix: '/app/reports', label: 'Reports & exports' },
  { prefix: '/app/users', label: 'Team access' },
  { prefix: '/app/audit', label: 'Audit history' },
  { prefix: '/app', label: 'Dashboard' },
]

function Sidebar({ onNavigate, open }: { onNavigate: () => void; open: boolean }) {
  const { profile, session, signOut } = useAuth()
  const navigate = useNavigate()
  const role = profile?.role ?? 'read_only'
  const displayName = profile?.display_name || session?.user.email || 'CheckTrack user'
  const links = [
    { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/app/records', label: 'Check records', icon: ClipboardList },
    { to: '/app/reports', label: 'Reports & exports', icon: ArrowDownToLine },
  ]

  async function handleSignOut() {
    try {
      await signOut()
      navigate('/sign-in', { replace: true })
    } catch (error) {
      logSafeFailure('sign out', error)
      toast.error('Sign out did not complete. Please try again.')
    }
  }

  return (
    <>
      {open && <button className="mobile-scrim" aria-label="Close navigation menu" onClick={onNavigate} />}
      <aside className={`app-sidebar${open ? ' app-sidebar--open' : ''}`} aria-label="Main navigation">
        <div className="brand-lockup">
          <img src="/favicon.svg" alt="" />
          <div className="brand-lockup-text"><strong>CheckTrack</strong><span>Record management</span></div>
        </div>
        <nav aria-label="Primary" className="nav-group">
          <p className="nav-caption">Workspace</p>
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="nav-link" onClick={onNavigate}>
              <Icon aria-hidden="true" />{label}
            </NavLink>
          ))}
        </nav>
        {role === 'administrator' && (
          <nav aria-label="Administration" className="nav-group">
            <p className="nav-caption">Administration</p>
            <NavLink to="/app/users" className="nav-link" onClick={onNavigate}><Users aria-hidden="true" />Team access</NavLink>
            <NavLink to="/app/audit" className="nav-link" onClick={onNavigate}><FileClock aria-hidden="true" />Audit history</NavLink>
          </nav>
        )}
        <div className="nav-footer">
          <p className="sidebar-note">Every change is recorded with its actor and time. Status is an administrative record, not payment verification.</p>
          <div className="account-card">
            <span className="account-avatar" aria-hidden="true">{getInitials(displayName)}</span>
            <span className="account-copy"><strong>{displayName}</strong><span>{roleLabels[role]}</span></span>
            <button className="sidebar-signout" type="button" onClick={() => void handleSignOut()} aria-label="Sign out"><LogOut aria-hidden="true" /></button>
          </div>
        </div>
      </aside>
    </>
  )
}

export default function AppShell() {
  const [navOpen, setNavOpen] = useState(false)
  const [today] = useState(() => new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date()))
  const { pathname } = useLocation()
  const { profile } = useAuth()
  const pageLabel = pageNames.find(({ prefix }) => pathname.startsWith(prefix))?.label ?? 'Workspace'
  const isRecordDetail = /^\/app\/records\/[^/]+/.test(pathname)

  return (
    <div className="app-frame">
      <Sidebar onNavigate={() => setNavOpen(false)} open={navOpen} />
      <div className="app-main">
        <header className="app-topbar">
          <div className="topbar-left">
            <button className="mobile-menu-button" type="button" aria-label={navOpen ? 'Close menu' : 'Open menu'} aria-expanded={navOpen} onClick={() => setNavOpen((value) => !value)}>
              {navOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </button>
            <div className="breadcrumb"><span>CheckTrack</span><span aria-hidden="true">/</span><strong>{isRecordDetail ? 'Record detail' : pageLabel}</strong></div>
          </div>
          <div className="topbar-right">
            {profile?.role === 'administrator' && <span className="status-badge" data-status="cleared"><ShieldCheck aria-hidden="true" />Verified admin</span>}
            <span className="topbar-date">{today}</span>
          </div>
        </header>
        <main className="app-content"><Outlet /></main>
      </div>
    </div>
  )
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div className="page-header-copy">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </div>
  )
}

export function RoleGate({ roles, children }: { roles: readonly UserRole[]; children: ReactNode }) {
  const { profile } = useAuth()
  if (!profile || !roles.includes(profile.role)) return null
  return children
}
