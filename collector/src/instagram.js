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

export class InstagramError extends Error {
  constructor(message, { code, handle } = {}) {
    super(message)
    this.code = code
    this.handle = handle
  }
}

export async function fetchClub(handle, { igUserId, accessToken, version = 'v26.0', limit = 20 }) {
  const fields = `business_discovery.username(${handle}){${PROFILE_FIELDS.join(',')},media.limit(${limit}){${MEDIA_FIELDS.join(',')}}}`
  const url = new URL(`https://graph.facebook.com/${version}/${igUserId}`)
  url.searchParams.set('fields', fields)
  url.searchParams.set('access_token', accessToken)

  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))

  if (!res.ok || body.error) {
    const err = body.error || {}
    // 110 / 100 usually means the account is personal, private, or the handle is wrong.
    const hint =
      err.code === 110 || err.code === 100
        ? ' (account not found, private, or not a Business/Creator account)'
        : err.code === 4 || err.code === 17 || err.code === 32
          ? ' (rate limited, try again later)'
          : err.code === 190
            ? ' (access token expired or invalid)'
            : ''
    throw new InstagramError(`@${handle}: ${err.message || res.statusText}${hint}`, { code: err.code, handle })
  }

  const bd = body.business_discovery
  return {
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
