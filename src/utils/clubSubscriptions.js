export function normalizeClubKey(id) {
  return String(id || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
}

export const SUBSCRIPTION_MODES = ['all', 'important', 'off']
export const SUBSCRIPTION_CHANNELS = ['events', 'announcements']
export const DEFAULT_CLUB_SUBSCRIPTION = Object.freeze({ events: 'all', announcements: 'all' })

export function normalizeSubscriptionMode(value) {
  return SUBSCRIPTION_MODES.includes(value) ? value : 'all'
}

export function subscriptionMap(rows = []) {
  return Object.fromEntries(rows.map(row => [
    normalizeClubKey(row.clubId),
    { events: normalizeSubscriptionMode(row.events), announcements: normalizeSubscriptionMode(row.announcements) },
  ]).filter(([id]) => id))
}

export function hasImportantFlag(value) {
  return value === true || value === 1 || value === '1'
}

export function subscriptionAllows(record, channel, preferences) {
  const mode = Object.hasOwn(preferences || {}, normalizeClubKey(record.clubId))
    ? preferences[normalizeClubKey(record.clubId)][channel]
    : 'all'
  return mode !== 'off' && (mode !== 'important' || hasImportantFlag(record.important))
}

export function isPersonalCalendarEvent(event) {
  return Boolean(event.isCustom || event.isBookedCollab || /^(custom_evt_|collab_evt_)/.test(String(event.id || '')))
}

export function isEventInPersonalFeed(event, joined, preferences) {
  if (event.cancelled) return false
  const clubId = normalizeClubKey(event.clubId)
  if (isPersonalCalendarEvent(event)) return !clubId || clubId === 'personal_poll' || joined.has(clubId)
  return joined.has(clubId) && subscriptionAllows(event, 'events', preferences)
}

export function mergePersonalFeed(records, channel, joined, preferences) {
  const seen = new Set()
  const merged = []
  for (const record of records) {
    if (!record) continue
    const clubId = normalizeClubKey(record.clubId)
    const allowed = channel === 'events'
      ? isEventInPersonalFeed(record, joined, preferences)
      : joined.has(clubId) && subscriptionAllows(record, channel, preferences)
    if (!allowed) continue
    const id = record.sourceId || record.id
    const source = channel === 'events' && isPersonalCalendarEvent(record) ? '' : record.source || ''
    const key = id && JSON.stringify([clubId, source, String(id)])
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    merged.push(record)
  }
  const direction = channel === 'events' ? 1 : -1
  const timestamp = record => Date.parse(channel === 'events'
    ? record.startIso || record.start
    : record.postedAt || record.createdAt) || 0
  return merged.sort((a, b) => direction * (timestamp(a) - timestamp(b)))
}

export function normalizeAuthoredEvent(input = {}) {
  const title = String(input.title || '').trim().slice(0, 140)
  const allDay = input.allDay === true
  const date = value => {
    if (!value) return null
    const parsed = new Date(value)
    if (!Number.isFinite(+parsed)) return null
    const iso = parsed.toISOString()
    if (!allDay) return iso
    return iso.slice(0, 10) === value ? value : null
  }
  const start = date(input.start)
  const end = date(input.end)
  if (!title || !start || (input.end && (!end || end <= start))) return null
  return {
    title, start, end, allDay,
    location: String(input.location || '').trim().slice(0, 200),
    important: input.important === true,
  }
}
