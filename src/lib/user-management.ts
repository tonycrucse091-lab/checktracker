import type { TeamMember } from './types'
import { callTeamAdmin, type TeamAdminRequest } from './team'

export async function loadTeamMembers(): Promise<TeamMember[]> {
  const response = await callTeamAdmin({ action: 'list' })
  return response.users ?? []
}

export type InviteTeamMemberInput = Omit<Extract<TeamAdminRequest, { action: 'invite' }>, 'action'>
export type UpdateTeamMemberInput = Omit<Extract<TeamAdminRequest, { action: 'update' }>, 'action'>

export async function inviteTeamMember(input: InviteTeamMemberInput): Promise<void> {
  await callTeamAdmin({ action: 'invite', ...input })
}

export async function updateTeamMember(input: UpdateTeamMemberInput): Promise<void> {
  await callTeamAdmin({ action: 'update', ...input })
}
