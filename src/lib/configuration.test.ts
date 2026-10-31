import { describe, expect, it } from 'vitest'
import { hasUsableSupabaseConfiguration } from './configuration'

describe('Supabase environment readiness', () => {
  it('rejects missing or copied example placeholders', () => {
    expect(hasUsableSupabaseConfiguration('', '')).toBe(false)
    expect(hasUsableSupabaseConfiguration('https://YOUR_PROJECT_REF.supabase.co', 'sb_publishable_YOUR_PUBLIC_KEY')).toBe(false)
    expect(hasUsableSupabaseConfiguration('https://your-project-ref.supabase.co', 'sb_publishable_replace_me')).toBe(false)
  })

  it('accepts a configured HTTPS project and public key', () => {
    expect(hasUsableSupabaseConfiguration('https://project-123.supabase.co/', 'sb_publishable_publicvalue')).toBe(true)
  })

  it('allows plain HTTP only for local development', () => {
    expect(hasUsableSupabaseConfiguration('http://localhost:54321', 'local-public-key')).toBe(true)
    expect(hasUsableSupabaseConfiguration('http://project.example.net', 'local-public-key')).toBe(false)
  })

  it('rejects malformed URLs, credentials, and non-origin paths', () => {
    expect(hasUsableSupabaseConfiguration('not a URL', 'public-key')).toBe(false)
    expect(hasUsableSupabaseConfiguration('https://user:pass@project.supabase.co', 'public-key')).toBe(false)
    expect(hasUsableSupabaseConfiguration('https://project.supabase.co/rest/v1', 'public-key')).toBe(false)
  })
})
