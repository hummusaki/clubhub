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
  const poll = readSharedPollId(location)
  return poll ? '?' + new URLSearchParams({ poll }) : ''
}

export function readSharedPollId(location) {
  const poll = new URLSearchParams(location.search).get('poll')
  return poll?.trim() && !/[\x00-\x1f]/.test(poll) ? poll : ''
}

export function normalizeWorkspaceNavigation(nav, options = {}) {
  if (nav === 'availability') {
    return { nav: 'calendar', options: { ...options, calendarSection: 'availability' } }
  }
  if (nav === 'calendar') {
    return {
      nav,
      options: { ...options, calendarSection: options.calendarSection === 'availability' ? 'availability' : 'schedule' },
    }
  }
  return { nav, options }
}

export function readWorkspaceNavigation(location) {
  if (readClubPage(location.hash)) return { nav: 'clubs', options: { section: 'discover' } }
  const pollId = readSharedPollId(location)
  return pollId ? normalizeWorkspaceNavigation('availability', { pollId }) : { nav: 'overview', options: {} }
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

const WORKSPACE_ADMISSION_KEY = 'clubhub_workspace_admission_v1'
export const WORKSPACE_ADMISSION_MS = 12 * 60 * 60 * 1000

export function workspaceAdmission(identity, sessionId, profile, now = Date.now()) {
  const provider = identity.startsWith('clerk:') ? 'clerk' : 'local'
  const email = profile?.primaryEmailAddress?.emailAddress || profile?.email || ''
  return {
    identity, provider, sessionId: provider === 'clerk' ? sessionId : null,
    email, name: profile?.fullName || profile?.firstName || email,
    expiresAt: now + WORKSPACE_ADMISSION_MS,
  }
}

export function readWorkspaceAdmission(storage = globalThis.sessionStorage) {
  try {
    const record = JSON.parse(storage?.getItem(WORKSPACE_ADMISSION_KEY) || 'null')
    if (!record || !['local', 'clerk'].includes(record.provider) ||
        !String(record.identity || '').startsWith(record.provider + ':') ||
        !Number.isFinite(record.expiresAt)) return null
    return record
  } catch {
    return null
  }
}

export function storeWorkspaceAdmission(record, storage = globalThis.sessionStorage) {
  try {
    if (record) storage?.setItem(WORKSPACE_ADMISSION_KEY, JSON.stringify(record))
    else storage?.removeItem(WORKSPACE_ADMISSION_KEY)
  } catch {
    // A storage restriction only disables refresh persistence.
  }
}

export function canResumeWorkspace(record, identity, sessionId, now = Date.now()) {
  return Boolean(identity && record?.identity === identity && record.expiresAt > now &&
    (record.provider === 'local' || (sessionId && record.sessionId === sessionId)))
}
