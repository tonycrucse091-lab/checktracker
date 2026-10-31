/// <reference path="../deno-globals.d.ts" />
import {
  corsHeadersFor,
  corsPreflight,
  handleError,
  HttpError,
  jsonResponse,
  requireActor,
  requireAdministrator,
  writeAuditEvent,
  writeDeniedEvent,
} from '../_shared/security.ts'
import type { ActorContext } from '../_shared/security.ts'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const validRoles = ['administrator', 'staff', 'read_only'] as const
const validStatuses = ['active', 'suspended', 'disabled'] as const

type TeamMember = {
  user_id: string
  display_name: string
  role: (typeof validRoles)[number]
  account_status: (typeof validStatuses)[number]
  can_export_records: boolean
  email: string
  email_confirmed_at: string | null
  last_sign_in_at: string | null
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get('content-length') ?? '0')
  if (length > 10_000) throw new HttpError(413, 'The request is too large.')
  try {
    const value: unknown = await request.json()
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid JSON shape')
    return value as Record<string, unknown>
  } catch {
    throw new HttpError(400, 'The request body is not valid JSON.')
  }
}

async function listMembers(actor: ActorContext): Promise<TeamMember[]> {
  const authUsers = []
  const perPage = 200
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await actor.adminClient.auth.admin.listUsers({ page, perPage })
    if (error) throw new HttpError(503, 'Team member details could not be loaded.')
    authUsers.push(...data.users)
    if (data.users.length < perPage) break
    if (page === 50) throw new HttpError(503, 'The team directory exceeds the safe listing limit. Contact support.')
  }

  const { data: profiles, error: profilesError } = await actor.adminClient
    .from('profiles')
    .select('user_id, display_name, role, account_status, can_export_records')
    .order('created_at', { ascending: true })
  if (profilesError || !profiles) throw new HttpError(503, 'Team member permissions could not be loaded.')
  const authById = new Map(authUsers.map((user) => [user.id, user]))

  return profiles.flatMap((profile) => {
    const user = authById.get(profile.user_id)
    if (!user) return []
    return [{
      user_id: profile.user_id,
      display_name: profile.display_name ?? '',
      role: profile.role,
      account_status: profile.account_status,
      can_export_records: profile.can_export_records,
      email: user.email ?? '',
      email_confirmed_at: user.email_confirmed_at ?? null,
      last_sign_in_at: user.last_sign_in_at ?? null,
    } satisfies TeamMember]
  })
}

async function assertAdministrator(actor: ActorContext): Promise<void> {
  if (actor.profile.role !== 'administrator' || actor.aal !== 'aal2') {
    await writeDeniedEvent(actor, 'team_management')
  }
  requireAdministrator(actor)
}

async function inviteMember(actor: ActorContext, body: Record<string, unknown>): Promise<void> {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : ''
  const role = body.role
  const canExport = body.can_export_records
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new HttpError(400, 'Enter a valid email address.')
  if (!displayName || displayName.length > 160) throw new HttpError(400, 'Enter a display name of 1 to 160 characters.')
  if (role !== 'staff' && role !== 'read_only') throw new HttpError(400, 'Invitations may grant Staff or Read-only access. Assign Administrator access separately.')
  if (typeof canExport !== 'boolean') throw new HttpError(400, 'Choose whether this Staff account may export records.')
  if (role !== 'staff' && canExport) throw new HttpError(400, 'CSV export permission applies only to Staff accounts.')

  const siteUrl = Deno.env.get('CHECKTRACK_SITE_URL')?.trim()
  if (!siteUrl) throw new HttpError(503, 'Set the CheckTrack site URL in Supabase Edge Function secrets before sending invitations.')
  let redirectTo: string
  try {
    const parsed = new URL(siteUrl)
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') throw new Error('Not HTTPS')
    redirectTo = new URL('/set-password', parsed).toString()
  } catch {
    throw new HttpError(503, 'The configured CheckTrack site URL is invalid.')
  }

  const { data, error } = await actor.adminClient.auth.admin.inviteUserByEmail(email, {
    data: { display_name: displayName },
    redirectTo,
  })
  if (error || !data.user) throw new HttpError(400, 'The invitation could not be sent. Check that the email is valid and has not already been invited.')

  const { error: roleError } = await actor.adminClient.rpc('admin_set_profile', {
    p_actor_user_id: actor.user.id,
    p_target_user_id: data.user.id,
    p_role: role,
    p_account_status: 'active',
    p_can_export_records: role === 'staff' && canExport,
  })
  if (roleError) throw new HttpError(503, 'The invitation was created but access settings were not applied. The new account has default Read-only permissions; review it in Team access before inviting again.')

  await writeAuditEvent(actor, 'team.member_invited', 'profile', data.user.id, {
    role,
    staff_export_enabled: role === 'staff' && canExport,
  })
}

async function updateMember(actor: ActorContext, body: Record<string, unknown>): Promise<void> {
  const targetId = body.user_id
  const role = body.role
  const status = body.account_status
  const canExport = body.can_export_records
  if (typeof targetId !== 'string' || !UUID_PATTERN.test(targetId)) throw new HttpError(400, 'The selected user ID is invalid.')
  if (!validRoles.includes(role as (typeof validRoles)[number])) throw new HttpError(400, 'Choose a valid role.')
  if (!validStatuses.includes(status as (typeof validStatuses)[number])) throw new HttpError(400, 'Choose a valid account status.')
  if (typeof canExport !== 'boolean') throw new HttpError(400, 'Choose a valid export permission.')
  if (role !== 'staff' && canExport) throw new HttpError(400, 'CSV export permission applies only to Staff accounts.')

  const { error } = await actor.adminClient.rpc('admin_set_profile', {
    p_actor_user_id: actor.user.id,
    p_target_user_id: targetId,
    p_role: role,
    p_account_status: status,
    p_can_export_records: role === 'staff' && canExport,
  })
  if (error) {
    if (error.code === '23514') throw new HttpError(409, 'At least one active administrator must remain.')
    if (error.code === '42501') throw new HttpError(403, 'You cannot deactivate or demote your own administrator account.')
    if (error.code === 'P0002') throw new HttpError(404, 'The selected user was not found.')
    throw new HttpError(400, 'The access changes could not be applied. Review the selected role and account settings.')
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return corsPreflight(request)
  const cors = corsHeadersFor(request)
  if (!cors) return jsonResponse({ message: 'Origin not allowed.' }, 403, { 'Cache-Control': 'no-store' })
  if (request.method !== 'POST') return jsonResponse({ message: 'Use POST for this action.' }, 405, cors)

  try {
    const actor = await requireActor(request)
    await assertAdministrator(actor)
    const body = await readBody(request)
    if (body.action === 'list') return jsonResponse({ users: await listMembers(actor) }, 200, cors)
    if (body.action === 'invite') {
      await inviteMember(actor, body)
      return jsonResponse({ message: 'Invitation sent.' }, 200, cors)
    }
    if (body.action === 'update') {
      await updateMember(actor, body)
      return jsonResponse({ message: 'Access updated.' }, 200, cors)
    }
    throw new HttpError(400, 'Choose a supported team-management action.')
  } catch (error) {
    return handleError(error, cors)
  }
})
