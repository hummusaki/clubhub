// ── ClubHub Frontend Supabase Cloud Client ──
// Connects React directly to hosted Supabase PostgreSQL + Auth + Row Level Security.
// Zero user credentials or PII are persisted to localStorage (ephemeral sessionStorage only).

import { createClient } from './supabaseJsShim.js'

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
            if (supabase) {
              const { data } = await supabase.auth.getSession()
              if (data?.session?.access_token) {
                hasNativeSupabaseSession = true
                return data.session.access_token
              }
            }
            if (clerkJwtRejectedBySupabase) return null
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

function sha256HexAscii(input) {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]
  const H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]
  const bytes = new TextEncoder().encode(String(input || ''))
  const bitLen = bytes.length * 8
  const totalLen = (((bytes.length + 9 + 63) >> 6) << 6)
  const padded = new Uint8Array(totalLen)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(totalLen - 8, Math.floor(bitLen / 0x100000000), false)
  view.setUint32(totalLen - 4, bitLen >>> 0, false)

  const W = new Uint32Array(64)
  const rotr = (x, n) => (x >>> n) | (x << (32 - n))

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(offset + i * 4, false)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3)
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10)
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = H
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + K[i] + W[i]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0
      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    H[0] = (H[0] + a) >>> 0
    H[1] = (H[1] + b) >>> 0
    H[2] = (H[2] + c) >>> 0
    H[3] = (H[3] + d) >>> 0
    H[4] = (H[4] + e) >>> 0
    H[5] = (H[5] + f) >>> 0
    H[6] = (H[6] + g) >>> 0
    H[7] = (H[7] + h) >>> 0
  }
  return H.map(v => v.toString(16).padStart(8, '0')).join('')
}

let inflightClerkBridgePromise = null

export async function bridgeClerkToSupabaseAuth({ clerkUserId, email, fullName = '' }) {
  if (!supabase || !clerkUserId || !email) return null
  const cleanEmail = String(email).trim().toLowerCase()
  if (!cleanEmail) return null

  if (inflightClerkBridgePromise) return inflightClerkBridgePromise

  inflightClerkBridgePromise = (async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const existingUser = sessionData?.session?.user
      if (existingUser?.id) {
        if (!existingUser.email || existingUser.email.toLowerCase() === cleanEmail) {
          hasNativeSupabaseSession = true
          return { user: existingUser, session: sessionData.session }
        }
        await supabase.auth.signOut().catch(() => {})
        hasNativeSupabaseSession = false
      }

      const digest = sha256HexAscii(`clubhub-clerk-sb-v1:${clerkUserId}:${cleanEmail}`)
      const derivedPassword = `Ch!9_${digest.slice(0, 40)}_Aa`

      const signInRes = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: derivedPassword,
      })

      if (!signInRes.error && signInRes.data?.session?.user?.id) {
        hasNativeSupabaseSession = true
        return { user: signInRes.data.user, session: signInRes.data.session }
      }

      const errMsg = String(signInRes.error?.message || '')
      if (/email not confirmed/i.test(errMsg)) {
        return { user: null, session: null, requiresEmailConfirmation: true }
      }
      if (!/invalid login credentials|user not found/i.test(errMsg)) {
        return { user: null, session: null }
      }

      const attemptKey = `clubhub_sb_bridge_attempted:${cleanEmail}`
      if (ephemeralStorage.getItem(attemptKey) === '1') {
        return { user: null, session: null }
      }
      ephemeralStorage.setItem(attemptKey, '1')

      const signUpRes = await supabase.auth.signUp({
        email: cleanEmail,
        password: derivedPassword,
        options: {
          data: {
            full_name: String(fullName || '').trim() || cleanEmail.split('@')[0],
          },
        },
      })

      if (!signUpRes.error && signUpRes.data?.session?.user?.id) {
        ephemeralStorage.removeItem(attemptKey)
        hasNativeSupabaseSession = true
        return { user: signUpRes.data.user, session: signUpRes.data.session }
      }

      return {
        user: signUpRes.data?.user || null,
        session: null,
        requiresEmailConfirmation: Boolean(signUpRes.data?.user && !signUpRes.data?.session),
      }
    } catch {
      return null
    } finally {
      inflightClerkBridgePromise = null
    }
  })()

  return inflightClerkBridgePromise
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
    hasNativeSupabaseSession = true
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

  if (signUpRes.data?.session) {
    hasNativeSupabaseSession = true
  }

  return {
    user: signUpRes.data?.user || null,
    session: signUpRes.data?.session || null,
    created: true,
    requiresEmailConfirmation: Boolean(signUpRes.data?.user && !signUpRes.data?.session),
  }
}

export async function signOutSupabase() {
  hasNativeSupabaseSession = false
  if (!supabase) return
  try {
    await supabase.auth.signOut()
  } catch {
    // Ignore sign-out network errors
  }
}
