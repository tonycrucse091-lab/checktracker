import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from '../../lib/types'
import { getUserMessage } from '../../lib/errors'
import { requireSupabase, supabase, supabaseConfigured } from '../../lib/supabase'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  configured: boolean
  assuranceLevel: string | null
  authNotice: string | null
  refreshProfile: (nextSession?: Session | null) => Promise<void>
  refreshAssurance: () => Promise<string | null>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const sessionRef = useRef<Session | null>(null)
  const profileRef = useRef<Profile | null>(null)
  const loadedSessionUserIdRef = useRef<string | null>(null)
  const profileRequestIdRef = useRef(0)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [assuranceLevel, setAssuranceLevel] = useState<string | null>(null)
  const [authNotice, setAuthNotice] = useState<string | null>(null)

  const refreshAssurance = useCallback(async () => {
    const client = supabase
    if (!client) {
      setAssuranceLevel(null)
      return null
    }
    const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel()
    if (error) {
      setAssuranceLevel(null)
      return null
    }
    setAssuranceLevel(data.currentLevel)
    return data.currentLevel
  }, [])

  const refreshProfile = useCallback(async (nextSession?: Session | null) => {
    const client = supabase
    const activeSession = nextSession === undefined ? sessionRef.current : nextSession
    const requestId = ++profileRequestIdRef.current
    const activeUserId = activeSession?.user.id ?? null
    sessionRef.current = activeSession ?? null
    setSession(activeSession ?? null)
    setAuthNotice(null)

    if (!client || !activeSession) {
      loadedSessionUserIdRef.current = null
      profileRef.current = null
      setProfile(null)
      setAssuranceLevel(null)
      setLoading(false)
      return
    }

    // Supabase can emit INITIAL_SESSION and SIGNED_IN for the same browser session.
    // Do not restart the profile load or make the UI bounce between auth gates.
    if (loadedSessionUserIdRef.current === activeUserId && profileRef.current) {
      setLoading(false)
      return
    }

    profileRef.current = null
    loadedSessionUserIdRef.current = null
    setProfile(null)
    setLoading(true)
    const { data, error } = await client
      .from('profiles')
      .select('user_id,display_name,role,account_status,can_export_records,created_at,updated_at')
      .eq('user_id', activeSession.user.id)
      .maybeSingle()

    if (requestId !== profileRequestIdRef.current) return

    if (error) {
      profileRef.current = null
      setProfile(null)
      setAuthNotice(getUserMessage(error))
      setLoading(false)
      return
    }

    const nextProfile = data as Profile | null
    if (!nextProfile || nextProfile.account_status !== 'active') {
      profileRef.current = null
      loadedSessionUserIdRef.current = null
      setProfile(null)
      setSession(null)
      sessionRef.current = null
      setAuthNotice('This account is not active. Contact your administrator for access.')
      setLoading(false)
      // Revoke this browser session locally. RLS still blocks suspended accounts independently.
      await client.auth.signOut({ scope: 'local' })
      return
    }

    profileRef.current = nextProfile
    loadedSessionUserIdRef.current = activeUserId
    setProfile(nextProfile)
    const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel()
    setAssuranceLevel(assuranceError ? null : assurance.currentLevel)
    setLoading(false)
  }, [])

  useEffect(() => {
    const client = supabase
    if (!client) {
      setLoading(false)
      return
    }

    let alive = true
    void client.auth.getSession().then(({ data, error }) => {
      if (!alive) return
      if (error) {
        setAuthNotice(getUserMessage(error))
        setLoading(false)
        return
      }
      void refreshProfile(data.session)
    })

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!alive) return
      // Leave the auth callback before making another Supabase request (avoids lock re-entry).
      window.setTimeout(() => {
        if (alive) void refreshProfile(nextSession)
      }, 0)
    })

    return () => {
      alive = false
      subscription.unsubscribe()
    }
  }, [refreshProfile])

  const signIn = useCallback(async (email: string, password: string) => {
    const client = requireSupabase()
    const { data, error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (error) throw error
    await refreshProfile(data.session)
  }, [refreshProfile])

  const signOut = useCallback(async () => {
    const client = requireSupabase()
    const { error } = await client.auth.signOut({ scope: 'local' })
    if (error) throw error
    profileRequestIdRef.current += 1
    sessionRef.current = null
    profileRef.current = null
    loadedSessionUserIdRef.current = null
    setSession(null)
    setProfile(null)
    setAssuranceLevel(null)
  }, [])

  const requestPasswordReset = useCallback(async (email: string) => {
    const client = requireSupabase()
    const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/set-password`,
    })
    if (error) throw error
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const client = requireSupabase()
    const { error } = await client.auth.updateUser({ password })
    if (error) throw error
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    session,
    profile,
    loading,
    configured: supabaseConfigured,
    assuranceLevel,
    authNotice,
    refreshProfile,
    refreshAssurance,
    signIn,
    signOut,
    requestPasswordReset,
    updatePassword,
  }), [session, profile, loading, assuranceLevel, authNotice, refreshProfile, refreshAssurance, signIn, signOut, requestPasswordReset, updatePassword])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider.')
  return value
}
