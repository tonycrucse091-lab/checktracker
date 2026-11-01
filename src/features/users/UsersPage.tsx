import { useCallback, useEffect, useState, type FormEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { MailPlus, RefreshCw, ShieldCheck, UserCog, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '../layout/AppShell'
import { useAuth } from '../auth/AuthContext'
import type { AccountStatus, TeamMember, UserRole } from '../../lib/types'
import { accountStatuses, inviteSchema, profileUpdateSchema, userRoles } from '../../lib/validation'
import { roleLabels } from '../../lib/format'
import { inviteTeamMember, loadTeamMembers, updateTeamMember } from '../../lib/user-management'
import { Button } from '../../components/ui/Button'
import { EmptyState, LoadError, PageLoading } from '../../components/ui/States'
import { formatDateTime } from '../../lib/format'
import { getUserMessage, logSafeFailure } from '../../lib/errors'

type MemberDraft = { role: UserRole; account_status: AccountStatus; can_export_records: boolean }

function InviteDialog({ open, onOpenChange, onInvite }: { open: boolean; onOpenChange: (open: boolean) => void; onInvite: (input: { email: string; display_name: string; role: 'staff' | 'read_only'; can_export_records: boolean }) => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<'staff' | 'read_only'>('staff')
  const [canExport, setCanExport] = useState(false)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)

  function reset() { setEmail(''); setDisplayName(''); setRole('staff'); setCanExport(false); setError('') }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const parsed = inviteSchema.safeParse({ email, display_name: displayName, role, can_export_records: role === 'staff' && canExport })
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Review the invitation details.'); return }
    setWorking(true)
    try {
      await onInvite(parsed.data)
      reset()
      onOpenChange(false)
    } catch (caught) {
      setError(getUserMessage(caught))
      logSafeFailure('team invitation', caught)
    } finally { setWorking(false) }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!working) { if (!next) reset(); onOpenChange(next) } }}>
      <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><div><Dialog.Title className="dialog-title">Invite a team member</Dialog.Title><Dialog.Description className="dialog-description">Supabase sends an invitation link. The invitee must verify their email before signing in.</Dialog.Description></div><Dialog.Close asChild><button className="icon-button" aria-label="Close invitation" disabled={working}><X aria-hidden="true" /></button></Dialog.Close></div>
        {error && <div className="alert alert-error" role="alert" style={{ marginBottom: 13 }}>{error}</div>}
        <form onSubmit={(event) => void submit(event)} noValidate>
          <div className="field-grid">
            <label className="field field-full"><span className="field-label">Display name</span><input className="field-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={160} required disabled={working} /></label>
            <label className="field field-full"><span className="field-label">Work email</span><input className="field-input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required disabled={working} /></label>
            <label className="field field-full"><span className="field-label">Role</span><select className="field-select" value={role} onChange={(event) => { const next = event.target.value as 'staff' | 'read_only'; setRole(next); if (next !== 'staff') setCanExport(false) }} disabled={working}><option value="staff">Staff</option><option value="read_only">Read-only</option></select></label>
            {role === 'staff' && <label className="field field-full" style={{ flexDirection: 'row', alignItems: 'center' }}><input type="checkbox" checked={canExport} onChange={(event) => setCanExport(event.target.checked)} disabled={working} /><span className="field-label">Allow CSV exports for this Staff account</span></label>}
          </div>
          <div className="dialog-actions"><Button variant="secondary" type="button" onClick={() => onOpenChange(false)} disabled={working}>Cancel</Button><Button type="submit" disabled={working}>{working ? 'Sending invitation…' : 'Send invitation'}</Button></div>
        </form>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  )
}

export default function UsersPage() {
  const { profile } = useAuth()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [drafts, setDrafts] = useState<Record<string, MemberDraft>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [savingId, setSavingId] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await loadTeamMembers()
      setMembers(list)
      setDrafts(Object.fromEntries(list.map((member) => [member.user_id, { role: member.role, account_status: member.account_status, can_export_records: member.can_export_records }])))
    } catch (caught) {
      setError(caught)
      logSafeFailure('team member list', caught)
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load, refreshKey])

  async function invite(input: { email: string; display_name: string; role: 'staff' | 'read_only'; can_export_records: boolean }) {
    await inviteTeamMember(input)
    toast.success('Invitation sent. The invited user can sign in after email verification.')
    setRefreshKey((value) => value + 1)
  }

  function patchDraft(userId: string, patch: Partial<MemberDraft>) {
    setDrafts((current) => ({ ...current, [userId]: { ...current[userId], ...patch } as MemberDraft }))
  }

  async function saveMember(member: TeamMember) {
    const draft = drafts[member.user_id]
    if (!draft) return
    const normalized = { user_id: member.user_id, ...draft, can_export_records: draft.role === 'staff' && draft.can_export_records }
    const parsed = profileUpdateSchema.safeParse(normalized)
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? 'Review the role settings.'); return }
    setSavingId(member.user_id)
    try {
      await updateTeamMember(parsed.data)
      toast.success(`Access settings updated for ${member.display_name || member.email}.`)
      setRefreshKey((value) => value + 1)
    } catch (caught) {
      logSafeFailure('profile role update', caught)
      toast.error(getUserMessage(caught))
    } finally { setSavingId('') }
  }

  async function deactivateMember(member: TeamMember) {
    if (member.user_id === profile?.user_id || member.account_status === 'disabled') return
    const confirmed = window.confirm(`Deactivate ${member.display_name || member.email}? This keeps the audit history but blocks future access.`)
    if (!confirmed) return
    setSavingId(member.user_id)
    try {
      await updateTeamMember({ user_id: member.user_id, role: member.role, account_status: 'disabled', can_export_records: false })
      toast.success(`${member.display_name || member.email} was deactivated.`)
      setRefreshKey((value) => value + 1)
    } catch (caught) {
      logSafeFailure('user deactivation', caught)
      toast.error(getUserMessage(caught))
    } finally { setSavingId('') }
  }

  if (profile?.role !== 'administrator') return <EmptyState title="Administrator access required" description="Only an administrator can manage team membership and permissions." />

  return (
    <>
      <PageHeader eyebrow="Administration" title="Admin user dashboard" description="Create, review, update, and safely deactivate user accounts. Every access change is validated by the administrator-only Edge Function and recorded in the audit history." actions={<><Button variant="secondary" type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}><RefreshCw aria-hidden="true" />Refresh</Button><Button type="button" onClick={() => setInviteOpen(true)}><MailPlus aria-hidden="true" />Create user</Button></>} />
      <div className="alert alert-neutral" style={{ marginBottom: 15 }}><ShieldCheck aria-hidden="true" /><span>Role changes and account deactivation are audited. Administrators require an active AAL2 authenticator. The database prevents self-demotion and removal of the last active administrator.</span></div>
      {error && <div style={{ marginBottom: 15 }}><LoadError error={error} onRetry={() => setRefreshKey((value) => value + 1)} label="Team members could not be loaded." /></div>}
      <section className="surface-card table-card" aria-label="Team members" aria-busy={loading}>
        {loading ? <PageLoading label="Loading team access…" /> : members.length === 0 ? <EmptyState title="No provisioned users" description="Invite the first Staff or Read-only user after the first administrator is securely bootstrapped." icon={<Users aria-hidden="true" />} action={<Button type="button" onClick={() => setInviteOpen(true)}>Invite a user</Button>} /> : (
          <div className="table-scroll"><table className="data-table">
            <thead><tr><th>User</th><th>Role</th><th>Account status</th><th>Last sign in</th><th>Staff exports</th><th>Actions</th></tr></thead>
            <tbody>{members.map((member) => {
              const draft = drafts[member.user_id] ?? { role: member.role, account_status: member.account_status, can_export_records: member.can_export_records }
              const changed = draft.role !== member.role || draft.account_status !== member.account_status || draft.can_export_records !== member.can_export_records
              const isSelf = member.user_id === profile.user_id
              return <tr key={member.user_id}>
                <td><span className="table-primary">{member.display_name || member.email}</span><span className="table-secondary">{member.email}{member.email_confirmed_at ? ' · verified' : ' · verification pending'}</span></td>
                <td><select className="filter-select" value={draft.role} onChange={(event) => { const role = event.target.value as UserRole; patchDraft(member.user_id, { role, ...(role !== 'staff' ? { can_export_records: false } : {}) }) }} disabled={isSelf || savingId === member.user_id} aria-label={`Role for ${member.email}`}>{userRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></td>
                <td><select className="filter-select" value={draft.account_status} onChange={(event) => patchDraft(member.user_id, { account_status: event.target.value as AccountStatus })} disabled={isSelf || savingId === member.user_id} aria-label={`Account status for ${member.email}`}>{accountStatuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></td>
                <td>{formatDateTime(member.last_sign_in_at)}</td>
                <td>{draft.role === 'staff' ? <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={draft.can_export_records} onChange={(event) => patchDraft(member.user_id, { can_export_records: event.target.checked })} disabled={savingId === member.user_id} /><span className="sr-only">Allow exports for {member.email}</span></label> : <span className="field-hint">Not applicable</span>}</td>
                <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><Button size="small" type="button" onClick={() => void saveMember(member)} disabled={!changed || savingId === member.user_id || (isSelf && (draft.role !== 'administrator' || draft.account_status !== 'active'))}>{savingId === member.user_id ? 'Saving…' : 'Save'}</Button><Button size="small" variant="secondary" type="button" onClick={() => void deactivateMember(member)} disabled={isSelf || member.account_status === 'disabled' || savingId === member.user_id}>Deactivate</Button></div></td>
              </tr>
            })}</tbody>
          </table></div>
        )}
      </section>
      <p className="field-hint" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14 }}><UserCog aria-hidden="true" size={14} />Auth credentials are managed by Supabase. CheckTrack stores only profile/access data and audit metadata.</p>
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} onInvite={invite} />
    </>
  )
}
