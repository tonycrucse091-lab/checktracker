import { createClient } from '@supabase/supabase-js'
import { hasUsableSupabaseConfiguration } from './configuration'

const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const rawPublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''

export const supabaseUrl = rawUrl.replace(/\/$/, '')
export const supabaseConfigured = hasUsableSupabaseConfiguration(supabaseUrl, rawPublishableKey)

// This key is intentionally browser-visible. Row Level Security, grants, and the user's JWT
// enforce access. Secret/service keys must never be added to VITE_ variables or this bundle.
export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, rawPublishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
        flowType: 'pkce',
      },
    })
  : null

export function requireSupabase() {
  if (!supabase) {
    throw new Error('Connect a Supabase project before using CheckTrack.')
  }
  return supabase
}
