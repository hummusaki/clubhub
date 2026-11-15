// ── ClubHub Frontend Supabase Cloud Client ──
// Connects React directly to hosted Supabase PostgreSQL + Auth + Row Level Security.
// Zero user credentials or PII are persisted to localStorage (ephemeral sessionStorage only).

import { createClient } from '@supabase/supabase-js'

function readEnv(key) {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      return String(import.meta.env[key]).trim()
    }
  } catch {
    // Ignore import.meta access outside Vite
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return String(process.env[key]).trim()
  }
  return ''
}

function isRealSupabaseUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false
  if (/your-project-ref|example\.com|placeholder/i.test(url)) return false
  return true
}

function isRealSupabaseKey(key) {
  if (!key || key.length < 20) return false
  if (/^your_supabase_|placeholder/i.test(key)) return false
  return true
}

const SUPABASE_URL = readEnv('VITE_SUPABASE_URL') || readEnv('NEXT_PUBLIC_SUPABASE_URL')
const SUPABASE_ANON_KEY =
  readEnv('VITE_SUPABASE_ANON_KEY') ||
  readEnv('VITE_SUPABASE_PUBLISHABLE_KEY') ||
  readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
  readEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')

const ephemeralStorage = {
  getItem(key) {
    try {
      return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(key) : null
    } catch {
      return null
    }
  },
  setItem(key, value) {
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(key, value)
    } catch {
      // Ignore private browsing restrictions
    }
  },
  removeItem(key) {
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(key)
    } catch {
      // Ignore storage errors
    }
  },
}

export const supabaseConfigured =
  isRealSupabaseUrl(SUPABASE_URL) && isRealSupabaseKey(SUPABASE_ANON_KEY)

export const supabase = supabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: ephemeralStorage,
      },
    })
  : null

export function isSupabaseConfigured() {
  return Boolean(supabase)
}

let clerkSupabaseClient = null
let hasNativeSupabaseSession = false
let clerkJwtRejectedBySupabase = false

if (supabase) {
  supabase.auth
    .getSession()
    .then(({ data }) => {
      hasNativeSupabaseSession = Boolean(data?.session?.access_token)
    })
    .catch(() => {})
  supabase.auth.onAuthStateChange((_event, session) => {
    hasNativeSupabaseSession = Boolean(session?.access_token)
  })
}

export function markClerkSupabaseJwtRejected() {
  clerkJwtRejectedBySupabase = true
}

export function isClerkSupabaseJwtRejected() {
  return clerkJwtRejectedBySupabase
}

export function isJwtSignatureError(errOrMsg) {
  const msg =
    typeof errOrMsg === 'string'
      ? errOrMsg
      : String(errOrMsg?.message || errOrMsg?.error_description || '')
  return /JWSInvalidSignature|JWT.*invalid|invalid.*JWT|No suitable key|wrong key type|bad_jwt/i.test(
    msg
  )
}

export function getActiveSupabaseClient() {
  if (!supabaseConfigured) return null
  // Prefer native Supabase Auth JWT whenever an active Supabase session exists
  if (hasNativeSupabaseSession) return supabase
  if (
    typeof window !== 'undefined' &&
    window.Clerk?.session &&
    !clerkJwtRejectedBySupabase
  ) {
    if (!clerkSupabaseClient) {
      clerkSupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        accessToken: async () => {
          try {
            return (await window.Clerk?.session?.getToken()) || null
          } catch {
            return null
          }
        },
      })
    }
    return clerkSupabaseClient
  }
  return supabase
}

export async function getSupabaseAccessToken() {
  if (!supabase) return ''
  try {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token || ''
  } catch {
    return ''
  }
}

export async function signInOrSignUpWithSupabase({ email, password, fullName = '' }) {
  if (!supabase) return null
  const cleanEmail = String(email || '').trim().toLowerCase()

  const signInRes = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  })

  if (!signInRes.error && signInRes.data?.session) {
    return {
      user: signInRes.data.user,
      session: signInRes.data.session,
      created: false,
    }
  }

  const msg = signInRes.error?.message || ''
  if (!/invalid login credentials|user not found/i.test(msg)) {
    throw new Error(msg || 'Supabase authentication failed.')
  }

  const signUpRes = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      data: {
        full_name: fullName.trim() || cleanEmail.split('@')[0],
      },
    },
  })

  if (signUpRes.error) {
    throw new Error(signUpRes.error.message || 'Could not create Supabase account.')
  }

  return {
    user: signUpRes.data?.user || null,
    session: signUpRes.data?.session || null,
    created: true,
    requiresEmailConfirmation: Boolean(signUpRes.data?.user && !signUpRes.data?.session),
  }
}

export async function signOutSupabase() {
  if (!supabase) return
  try {
    await supabase.auth.signOut()
  } catch {
    // Ignore sign-out network errors
  }
}
