import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockAuth = vi.hoisted(() => ({
  state: {
    session: null as unknown,
    profile: null as unknown,
    loading: false,
    configured: true,
    assuranceLevel: 'aal1' as string | null,
    authNotice: null as string | null,
    refreshProfile: vi.fn(async () => undefined),
    refreshAssurance: vi.fn(async () => 'aal1'),
    signIn: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    requestPasswordReset: vi.fn(async () => undefined),
    updatePassword: vi.fn(async () => undefined),
  },
}))

vi.mock('./features/auth/AuthContext', () => ({ useAuth: () => mockAuth.state }))

import App from './App'

function renderRoute(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
}

describe('protected CheckTrack routes', () => {
  beforeEach(() => {
    mockAuth.state.session = null
    mockAuth.state.profile = null
    mockAuth.state.loading = false
    mockAuth.state.configured = true
    mockAuth.state.assuranceLevel = 'aal1'
  })

  it('redirects an unauthenticated visitor away from protected records', async () => {
    renderRoute('/app/records')
    expect(await screen.findByRole('heading', { name: 'Sign in to CheckTrack' })).toBeInTheDocument()
  })

  it('denies record creation to a read-only account', async () => {
    mockAuth.state.session = { user: { id: '00000000-0000-4000-8000-000000000003', email: 'reader@example.test' } }
    mockAuth.state.profile = { user_id: '00000000-0000-4000-8000-000000000003', display_name: 'Read Only', role: 'read_only', account_status: 'active', can_export_records: false }
    renderRoute('/app/records/new')
    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument()
  })

  it('allows a staff account to open the validated create-record form', async () => {
    mockAuth.state.session = { user: { id: '00000000-0000-4000-8000-000000000002', email: 'staff@example.test' } }
    mockAuth.state.profile = { user_id: '00000000-0000-4000-8000-000000000002', display_name: 'Staff', role: 'staff', account_status: 'active', can_export_records: false }
    renderRoute('/app/records/new')
    expect(await screen.findByRole('heading', { name: 'Create a record' })).toBeInTheDocument()
  })
})
