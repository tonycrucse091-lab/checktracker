/// <reference path="../deno-globals.d.ts" />
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

type Profile = {
  user_id: string
  display_name: string
  role: 'administrator' | 'staff' | 'read_only'
  account_status: 'active' | 'suspended' | 'disabled'
  can_export_records: boolean
}

export type ActorContext = {
  user: User
  profile: Profile
  aal: string | null
  userClient: SupabaseClient
  adminClient: SupabaseClient
}

export class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

function configuredOrigins(): string[] {
  const configured = Deno.env.get('CHECKTRACK_ALLOWED_ORIGINS') ?? Deno.env.get('CHECKTRACK_SITE_URL') ?? ''
  const origins = configured.split(',').map((item: string) => item.trim()).filter(Boolean)
  if (origins.length === 0) return ['http://localhost:5173', 'http://127.0.0.1:5173']
  return origins
}

export function corsHeadersFor(request: Request): Record<string, string> | null {
  const origin = request.headers.get('origin')
  const allowed = configuredOrigins()
  if (origin && !allowed.includes(origin)) return null
  return {
    'Access-Control-Allow-Origin': origin ?? allowed[0] ?? 'http://localhost:5173',
    'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  }
}

export function corsPreflight(request: Request): Response {
  const cors = corsHeadersFor(request)
  if (!cors) return new Response('Origin not allowed.', { status: 403, headers: { 'Cache-Control': 'no-store' } })
  return new Response('ok', { headers: cors })
}

export function jsonResponse(payload: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export function handleError(error: unknown, cors: Record<string, string>): Response {
  if (error instanceof HttpError) return jsonResponse({ message: error.message }, error.status, cors)
  console.error('CheckTrack Edge Function failure', error instanceof Error ? error.name : 'UnknownError')
  return jsonResponse({ message: 'The request could not be completed. Please try again or contact an administrator.' }, 500, cors)
}

function requiredEnvironment(name: string, ...fallbackNames: string[]): string {
  for (const key of [name, ...fallbackNames]) {
    const value = Deno.env.get(key)
    if (value?.trim()) return value.trim()
  }
  throw new HttpError(503, 'The secure Supabase function environment is not fully configured.')
}

function readJwtAal(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const normalized = payload.replaceAll('-', '+').replaceAll('_', '/')
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as { aal?: unknown }
    return typeof claims.aal === 'string' ? claims.aal : null
  } catch {
    return null
  }
}

export async function requireActor(request: Request): Promise<ActorContext> {
  const authorization = request.headers.get('authorization') ?? ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  if (!match) throw new HttpError(401, 'Your session is missing or expired. Sign in again.')
  const token = match[1]
  const url = requiredEnvironment('SUPABASE_URL')
  const publicKey = requiredEnvironment('SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY')
  const secretKey = requiredEnvironment('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY')

  const userClient = createClient(url, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: verified, error: authError } = await userClient.auth.getUser(token)
  if (authError || !verified.user) throw new HttpError(401, 'Your session is missing or expired. Sign in again.')

  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('user_id, display_name, role, account_status, can_export_records')
    .eq('user_id', verified.user.id)
    .maybeSingle()
  if (profileError) throw new HttpError(503, 'Your account permissions could not be checked. Try again later.')
  if (!profile || profile.account_status !== 'active') throw new HttpError(403, 'Your account is inactive or is not provisioned for this workspace.')

  const adminClient = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  return { user: verified.user, profile: profile as Profile, aal: readJwtAal(token), userClient, adminClient }
}

export function requireAdministrator(actor: ActorContext): void {
  if (actor.profile.role !== 'administrator') throw new HttpError(403, 'Administrator access is required for this action.')
  if (actor.aal !== 'aal2') throw new HttpError(403, 'Complete administrator multi-factor verification before continuing.')
}

export async function writeAuditEvent(
  actor: ActorContext,
  action: string,
  resourceType: string,
  resourceId: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  const { error } = await actor.adminClient.from('audit_logs').insert({
    actor_user_id: actor.user.id,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    minimized_metadata: metadata,
  })
  if (error) throw new HttpError(500, 'The audit event could not be recorded, so the request was not completed.')
}

export async function writeDeniedEvent(actor: ActorContext, operation: string): Promise<void> {
  try {
    await writeAuditEvent(actor, 'security.access_denied', 'security_event', actor.user.id, { operation })
  } catch {
    // A denied operation stays denied even if its best-effort security event cannot be written.
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
