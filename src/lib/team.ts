import type { TeamMember, UserRole, AccountStatus } from './types'
import { requireSupabase } from './supabase'

export type TeamAdminRequest =
  | { action: 'list' }
  | { action: 'invite'; email: string; display_name: string; role: 'staff' | 'read_only'; can_export_records: boolean }
  | { action: 'update'; user_id: string; role: UserRole; account_status: AccountStatus; can_export_records: boolean }

interface TeamAdminResponse {
  users?: TeamMember[]
  user?: TeamMember
  message?: string
}

export async function callTeamAdmin(payload: TeamAdminRequest): Promise<TeamAdminResponse> {
  const { data, error } = await requireSupabase().functions.invoke('team-admin', { body: payload })
  if (error) throw error
  if (!data || typeof data !== 'object') throw new Error('The team-management service returned an invalid response.')
  const response = data as TeamAdminResponse
  if (response.message && !response.users && !response.user) throw new Error(response.message)
  return response
}
