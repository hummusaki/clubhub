// Fetches a club's public profile and recent posts through Meta's Business Discovery API.
// Only works for Instagram Business or Creator accounts (not personal accounts).

const PROFILE_FIELDS = [
  'username',
  'name',
  'biography',
  'website',
  'profile_picture_url',
  'followers_count',
  'media_count',
]

const MEDIA_FIELDS = ['id', 'caption', 'timestamp', 'permalink', 'media_type', 'media_url', 'thumbnail_url']

export const RATE_LIMIT_CODES = new Set([4, 17, 32, 613])

export class InstagramError extends Error {
  constructor(message, { code, handle, isRateLimit = false, usage = null } = {}) {
    super(message)
    this.code = code
    this.handle = handle
    this.isRateLimit = isRateLimit
    this.usage = usage
  }
}

export function isRateLimitError(err) {
  if (!err) return false
  if (err.isRateLimit) return true
  if (RATE_LIMIT_CODES.has(Number(err.code))) return true
  return /request limit reached|rate[- ]?limit|too many requests/i.test(String(err.message || ''))
}

function parseGraphUsageHeaders(headers) {
  let maxUsagePct = 0
  let estimatedWaitMin = 0

  try {
    const appUsageRaw = headers?.get?.('x-app-usage')
    if (appUsageRaw) {
      const u = JSON.parse(appUsageRaw)
      maxUsagePct = Math.max(
        maxUsagePct,
        Number(u.call_count) || 0,
        Number(u.total_cputime) || 0,
        Number(u.total_time) || 0
      )
    }
  } catch {
    // ignore malformed header
  }

  try {
    const bucRaw = headers?.get?.('x-business-use-case-usage')
    if (bucRaw) {
      const buc = JSON.parse(bucRaw)
      for (const entries of Object.values(buc || {})) {
        if (!Array.isArray(entries)) continue
        for (const entry of entries) {
          maxUsagePct = Math.max(
            maxUsagePct,
            Number(entry.call_count) || 0,
            Number(entry.total_cputime) || 0,
            Number(entry.total_time) || 0
          )
          estimatedWaitMin = Math.max(
            estimatedWaitMin,
            Number(entry.estimated_time_to_regain_access) || 0
          )
        }
      }
    }
  } catch {
    // ignore malformed header
  }

  return { maxUsagePct, estimatedWaitMin }
}

export async function fetchClub(handle, { igUserId, accessToken, version = 'v26.0', limit = 20 }) {
  const fields = `business_discovery.username(${handle}){${PROFILE_FIELDS.join(',')},media.limit(${limit}){${MEDIA_FIELDS.join(',')}}}`
  const url = new URL(`https://graph.facebook.com/${version}/${igUserId}`)
  url.searchParams.set('fields', fields)
  url.searchParams.set('access_token', accessToken)

  // Retry network hiccups (and transient HTTP 429s) cleanly, and surface quota usage headers.
  let res
  let body = {}
  let usage = { maxUsagePct: 0, estimatedWaitMin: 0 }

  for (let attempt = 1; ; attempt++) {
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(20000) })
    } catch (err) {
      const reason = err.cause?.code || err.cause?.message || err.name || err.message
      if (attempt >= 3 || err.cause?.code === 'ENOTFOUND') {
        throw new InstagramError(`@${handle}: could not reach Instagram (${reason}). Check Wi-Fi, VPN or ad blocker.`, { code: 'NETWORK', handle })
      }
      await new Promise(r => setTimeout(r, 1500 * attempt))
      continue
    }

    usage = parseGraphUsageHeaders(res.headers)
    body = await res.json().catch(() => ({}))

    // Transient HTTP 429 when hourly app usage is not yet exhausted: wait Retry-After once
    if (res.status === 429 && attempt === 1 && usage.maxUsagePct < 95 && usage.estimatedWaitMin === 0) {
      const retryAfterSec = Math.min(Number(res.headers.get('retry-after')) || 3, 10)
      await new Promise(r => setTimeout(r, retryAfterSec * 1000))
      continue
    }
    break
  }

  if (!res.ok || body.error) {
    const err = body.error || {}
    const rateLimited =
      res.status === 429 ||
      RATE_LIMIT_CODES.has(Number(err.code)) ||
      /request limit reached|rate[- ]?limit/i.test(err.message || '')

    // 110 / 100 usually means the account is personal, private, or the handle is wrong.
    const hint =
      err.code === 110 || err.code === 100
        ? ' (account not found, private, or not a Business/Creator account)'
        : rateLimited
          ? ' (rate limited, try again later)'
          : err.code === 190
            ? ' (access token expired or invalid)'
            : ''
    throw new InstagramError(`@${handle}: ${err.message || res.statusText}${hint}`, {
      code: err.code ?? res.status,
      handle,
      isRateLimit: rateLimited,
      usage,
    })
  }

  const bd = body.business_discovery
  return {
    rateLimit: usage,
    profile: {
      username: bd.username,
      name: bd.name,
      biography: bd.biography || '',
      website: bd.website || null,
      profilePictureUrl: bd.profile_picture_url || null,
      followers: bd.followers_count ?? null,
      mediaCount: bd.media_count ?? null,
    },
    posts: (bd.media?.data || []).map(m => ({
      id: m.id,
      caption: m.caption || '',
      postedAt: m.timestamp,
      permalink: m.permalink,
      mediaType: m.media_type,
      imageUrl: m.media_type === 'VIDEO' ? m.thumbnail_url || null : m.media_url || null,
    })),
  }
}
