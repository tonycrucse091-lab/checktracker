type ErrorLike = {
  code?: string
  message?: string
  error_description?: string
  name?: string
}

export function getUserMessage(error: unknown): string {
  const candidate = (error && typeof error === 'object' ? error : {}) as ErrorLike
  const text = `${candidate.message ?? ''} ${candidate.error_description ?? ''}`.toLowerCase()
  const name = (candidate.name ?? '').toLowerCase()

  if (candidate.code === '23505' || text.includes('duplicate key')) {
    return 'That tracking reference is already in use. Choose a different reference.'
  }
  if (candidate.code === '42501' || text.includes('row-level security') || text.includes('permission denied')) {
    return 'You do not have permission to complete that action.'
  }
  if (candidate.code === 'P0001' || text.includes('transition')) {
    return 'That status change is not allowed from the current status.'
  }
  if (candidate.code === 'P0002') {
    return 'This record is unavailable or has already been archived.'
  }
  if (text.includes('email_not_confirmed') || text.includes('email not confirmed')) {
    return 'Verify your email address before signing in. Ask your administrator to resend the invitation if needed.'
  }
  if (text.includes('invalid login credentials')) {
    return 'The email or password is incorrect. Check your details and try again.'
  }
  if (name.includes('retryablefetch') || name.includes('networkerror') || text.includes('network') || text.includes('fetch') || text.includes('timed out') || text.includes('connection closed')) {
    return 'CheckTrack could not reach Supabase Auth. Check your connection, VPN, firewall, or browser extensions, then try again.'
  }
  if (text.includes('session') && (text.includes('expired') || text.includes('missing'))) {
    return 'Your session has expired. Sign in again to continue.'
  }
  if (candidate.name === 'ZodError') {
    return 'Some information needs attention. Review the highlighted fields.'
  }
  return 'Something went wrong. Please try again. If the problem continues, contact your administrator.'
}

export function logSafeFailure(context: string, error: unknown): void {
  const candidate = (error && typeof error === 'object' ? error : {}) as ErrorLike
  // Keep logs useful for debugging without recording payloads, credentials, email, or notes.
  console.error(`[CheckTrack] ${context}`, { code: candidate.code ?? 'unknown', name: candidate.name ?? 'Error' })
}
