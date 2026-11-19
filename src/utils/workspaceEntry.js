const OAUTH_INTENT_KEY = 'clubhub_oauth_intent_v1'
const OAUTH_INTENT_TTL = 30 * 60 * 1000
export const PENDING_POLL_SESSION_KEY = 'clubhub_pending_poll_id'

export function clubPageHref(clubId, section = 'overview', personId = '') {
  const path = '#/clubs/' + encodeURIComponent(String(clubId))
  const suffix = section === 'members' || section === 'roles' ? '/' + section : ''
  return path + suffix + (section === 'members' && personId ? '?' + new URLSearchParams({ person: personId }) : '')
}

export function readClubPage(hash) {
  const match = /^#\/clubs\/([^/?#]+)(?:\/(members|roles))?(?:\?([^#]*))?$/.exec(hash)
  if (!match) return null
  try {
    const clubId = decodeURIComponent(match[1])
    if (!clubId.trim() || /[\/\\\x00-\x1f]/.test(clubId)) return null
    const section = match[2] || 'overview'
    return {
      clubId,
      section,
      personId: section === 'members' ? new URLSearchParams(match[3]).get('person') || '' : '',
    }
  } catch {
    return null
  }
}

export function readWorkspaceDestination(location) {
  const club = readClubPage(location.hash)
  if (club) return clubPageHref(club.clubId, club.section, club.personId)
  const poll = new URLSearchParams(location.search).get('poll')
  return poll && !/[\x00-\x1f]/.test(poll) ? '?' + new URLSearchParams({ poll }) : ''
}

export function startOAuthEntry(destination, sessionId, storage = sessionStorage) {
  const nonce = crypto.randomUUID()
  storage.setItem(OAUTH_INTENT_KEY, JSON.stringify({ nonce, destination, sessionId, expires: Date.now() + OAUTH_INTENT_TTL }))
  return nonce
}

export function readOAuthEntry(nonce, storage = sessionStorage) {
  if (!nonce) return null
  try {
    const intent = JSON.parse(storage.getItem(OAUTH_INTENT_KEY))
    return intent?.nonce === nonce && intent.expires > Date.now() ? intent : null
  } catch {
    return null
  }
}

export function clearOAuthEntry(storage = sessionStorage) {
  try { storage.removeItem(OAUTH_INTENT_KEY) } catch { /* Storage may be disabled. */ }
}

export function replaceEntryUrl(destination = '') {
  window.history.replaceState(null, '', window.location.pathname + destination)
}
