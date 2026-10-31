import type { RecordFilters } from './types'
import { supabaseConfigured, supabaseUrl, requireSupabase } from './supabase'

export async function requestRecordExport(filters: RecordFilters): Promise<Blob> {
  if (!supabaseConfigured) throw new Error('Connect a Supabase project before exporting records.')
  const client = requireSupabase()
  const { data: sessionData, error: sessionError } = await client.auth.getSession()
  if (sessionError) throw sessionError
  const accessToken = sessionData.session?.access_token
  if (!accessToken) throw new Error('Your session has expired. Sign in again to export.')

  const response = await fetch(`${supabaseUrl}/functions/v1/export-records`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(filters),
    cache: 'no-store',
  })

  if (!response.ok) {
    let message = 'The export could not be completed.'
    try {
      const payload = (await response.json()) as { message?: string }
      if (payload.message) message = payload.message
    } catch {
      // Keep the safe default message for non-JSON errors.
    }
    throw new Error(message)
  }
  return response.blob()
}

export function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}
