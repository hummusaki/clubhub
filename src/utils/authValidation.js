// ── Authentication Key Validation & Client-Side Password Hashing ──

export const STORED_CLERK_KEY = 'clubhub_clerk_publishable_key'

/**
 * Validates that a Clerk publishable key is structurally genuine before passing it
 * to `<ClerkProvider>`, preventing synchronous SDK crashes from `.env.example`
 * placeholders or malformed keys in `localStorage`.
 */
export function isValidClerkPublishableKey(rawKey) {
  if (typeof rawKey !== 'string') return false
  const key = rawKey.trim()
  if (!/^pk_(test|live)_[A-Za-z0-9+/=_-]{16,}$/.test(key)) return false
  if (/your_|placeholder|example|changeme|xxxx/i.test(key)) return false

  const encoded = key.replace(/^pk_(test|live)_/, '')
  try {
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const decoded =
      typeof atob === 'function'
        ? atob(padded)
        : ''
    if (!decoded || !decoded.endsWith('$')) return false
    const host = decoded.slice(0, -1)
    // Valid Clerk frontend API domain contains at least one dot and valid hostname chars
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)
  } catch {
    return false
  }
}

export function resolveValidClerkPublishableKey() {
  const envKey = (
    import.meta.env?.VITE_CLERK_PUBLISHABLE_KEY ||
    import.meta.env?.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    ''
  ).trim()

  if (isValidClerkPublishableKey(envKey)) {
    return envKey
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const customKey = (localStorage.getItem(STORED_CLERK_KEY) || '').trim()
      if (isValidClerkPublishableKey(customKey)) {
        return customKey
      }
      if (customKey) {
        localStorage.removeItem(STORED_CLERK_KEY)
      }
    } catch {
      // Ignore storage errors
    }
  }

  return ''
}

function fallbackHashHex(input) {
  // Deterministic non-plaintext fallback for non-secure HTTP contexts lacking Web Crypto
  let h1 = 0xdeadbeef ^ input.length
  let h2 = 0x41c6ce57 ^ input.length
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}

export async function hashPasswordSha256(password, email = '') {
  const payload = `clubhub_auth_v2:${String(email || '').trim().toLowerCase()}:${String(password || '')}`
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
      const hex = Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
      return `sha256:${hex}`
    } catch {
      // Fall through to deterministic hash
    }
  }
  return `fnv:${fallbackHashHex(payload)}`
}

export async function verifyStoredAccountPassword(account, candidatePassword) {
  if (!account) return false
  if (typeof account.passwordHash === 'string' && account.passwordHash.length > 0) {
    const candidateHash = await hashPasswordSha256(candidatePassword, account.email)
    return account.passwordHash === candidateHash
  }
  if (typeof account.password === 'string' && account.password.length > 0) {
    return account.password === candidatePassword
  }
  return true
}
