// ── Shared Calendar Integration, Filtering & RFC 5545 iCalendar (.ics) Engine ──
// Pure ES module shared across the React frontend, Express API server, and Vite dev feed.

const SYNC_TOKEN_MAP_STORAGE_KEY = 'clubhub_calendar_sync_tokens_v1'

const EMOJI_STRIP_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu
const SOURCE_PREFIX_RE = /^\s*\[(?:Discord[^\]]*|Google Calendar|Club Website|Mailing List:[^\]]*)\]\s*/i

export const DEFAULT_CALENDAR_SYNC_SETTINGS = {
  clubScope: 'joined',          // 'joined' (updates with currently joined clubs) | 'all' (All Campus)
  rsvpOnly: false,              // Only include events you RSVP'd ("Going") to on synced calendars
  inAppRsvpOnly: false,         // Also filter the in-app ClubHub Calendar views to RSVP'd events only
  includeCustomAndPolls: true,  // Include custom added events & booked Group Availability Poll slots
  includePastEvents: false,     // false = upcoming (+ today) | true = past + upcoming
  titlePrefixClub: true,        // Prefix summary with club name: "CS Club: Intro to React"
  reminderMinutes: 30,          // 0 (none) | 10 | 15 | 30 | 60 | 1440
  refreshInterval: 'PT1H',      // 'PT15M' | 'PT1H' | 'PT6H' | 'P1D'
  autoSync: true,               // Auto-push membership & RSVP updates to subscribed feeds & Google Sync
}

export function sanitizeCalText(str) {
  if (!str || typeof str !== 'string') return ''
  return str
    .replace(EMOJI_STRIP_RE, '')
    .replace(SOURCE_PREFIX_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function normalizeClubKey(id) {
  return String(id || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
}

export function normalizeCalendarSyncSettings(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const validIntervals = new Set(['PT15M', 'PT1H', 'PT6H', 'P1D'])
  const parsedReminder = Number(src.reminderMinutes)
  const reminderMinutes = Number.isFinite(parsedReminder) && parsedReminder >= 0
    ? parsedReminder
    : DEFAULT_CALENDAR_SYNC_SETTINGS.reminderMinutes

  return {
    clubScope: src.clubScope === 'all' ? 'all' : 'joined',
    rsvpOnly: Boolean(src.rsvpOnly),
    inAppRsvpOnly: Boolean(src.inAppRsvpOnly),
    includeCustomAndPolls:
      src.includeCustomAndPolls !== undefined
        ? Boolean(src.includeCustomAndPolls)
        : DEFAULT_CALENDAR_SYNC_SETTINGS.includeCustomAndPolls,
    includePastEvents: Boolean(src.includePastEvents),
    titlePrefixClub:
      src.titlePrefixClub !== undefined
        ? Boolean(src.titlePrefixClub)
        : DEFAULT_CALENDAR_SYNC_SETTINGS.titlePrefixClub,
    reminderMinutes,
    refreshInterval: validIntervals.has(src.refreshInterval)
      ? src.refreshInterval
      : DEFAULT_CALENDAR_SYNC_SETTINGS.refreshInterval,
    autoSync:
      src.autoSync !== undefined
        ? Boolean(src.autoSync)
        : DEFAULT_CALENDAR_SYNC_SETTINGS.autoSync,
  }
}

export function extractGoingEventIds(rsvpMap = {}, events = [], extraRsvpIds = []) {
  const going = new Set((extraRsvpIds || []).map(String))
  if (rsvpMap && typeof rsvpMap === 'object') {
    for (const [id, val] of Object.entries(rsvpMap)) {
      if (val) going.add(String(id))
    }
  }
  for (const ev of events || []) {
    if (!ev || !ev.id) continue
    const key = String(ev.id)
    if (rsvpMap && Object.prototype.hasOwnProperty.call(rsvpMap, key)) {
      if (rsvpMap[key]) going.add(key)
    } else if (ev.isGoing || ev.rsvp) {
      going.add(key)
    }
  }
  return going
}

/**
 * Deterministically filters events according to the user's joined clubs, RSVPs, and Calendar Sync settings.
 */
export function filterEventsForCalendarSync(
  events = [],
  {
    joinedClubIds = [],
    rsvpIds = [],
    rsvpMap = null,
    settings: rawSettings = {},
    now = new Date(),
  } = {}
) {
  const settings = normalizeCalendarSyncSettings(rawSettings)
  const joinedSet = new Set((joinedClubIds || []).map(normalizeClubKey).filter(Boolean))
  const goingSet = extractGoingEventIds(rsvpMap, events, rsvpIds)

  const nowDt = now instanceof Date ? now : new Date(now)
  const nowMs = nowDt.getTime()
  const recentGraceMs = nowMs - 24 * 60 * 60 * 1000 // Keep all of today's events visible
  const minHistoricalMs = new Date('2025-01-01T00:00:00Z').getTime()

  const seenIds = new Set()
  const matched = []

  for (const ev of events || []) {
    if (!ev) continue
    const idStr = String(ev.id || '')
    if (idStr && seenIds.has(idStr)) continue

    const startRaw = ev.startIso || ev.start
    if (!startRaw) continue
    const startDt = new Date(startRaw)
    const startMs = startDt.getTime()
    if (Number.isNaN(startMs)) continue

    const isCustomOrPoll =
      Boolean(ev.isCustom) ||
      Boolean(ev.isBookedCollab) ||
      idStr.startsWith('collab_evt_') ||
      idStr.startsWith('custom_evt_')

    if (!isCustomOrPoll && startMs < minHistoricalMs) {
      continue
    }

    if (isCustomOrPoll && !settings.includeCustomAndPolls) {
      continue
    }

    // 1. Time window filter (upcoming + today vs past + upcoming)
    if (!settings.includePastEvents) {
      const endRaw = ev.endIso || ev.end
      const endMs = endRaw ? new Date(endRaw).getTime() : startMs + 60 * 60 * 1000
      const effectiveEndMs = Number.isNaN(endMs) ? startMs + 60 * 60 * 1000 : Math.max(startMs, endMs)
      if (effectiveEndMs < recentGraceMs) {
        continue
      }
    }

    const isGoing = idStr ? goingSet.has(idStr) : Boolean(ev.isGoing || ev.rsvp)

    // 2. Club membership filter
    if (settings.clubScope === 'joined' && !isCustomOrPoll) {
      const cid = normalizeClubKey(ev.clubId)
      if (joinedSet.size > 0) {
        if (!cid || !joinedSet.has(cid)) {
          continue
        }
      } else {
        // When 0 clubs are joined yet, only include explicitly RSVP'd events if RSVP-only is on
        if (!(settings.rsvpOnly && isGoing)) {
          continue
        }
      }
    }

    // 3. RSVP-only filter ("only make events that you RSVP'd to show up on the calendar")
    if (settings.rsvpOnly && !isGoing) {
      continue
    }

    if (idStr) seenIds.add(idStr)
    matched.push({
      ...ev,
      isGoing,
    })
  }

  return matched.sort((a, b) => {
    const aMs = new Date(a.startIso || a.start).getTime()
    const bMs = new Date(b.startIso || b.start).getTime()
    return aMs - bMs
  })
}

export function getCalendarFeedName(rawSettings = {}, joinedCount = 0) {
  const settings = normalizeCalendarSyncSettings(rawSettings)
  if (settings.rsvpOnly) {
    return 'ClubHub — My RSVPs'
  }
  if (settings.clubScope === 'all') {
    return 'ClubHub — All Campus'
  }
  return joinedCount > 0 ? `ClubHub — My Clubs (${joinedCount})` : 'ClubHub — My Clubs'
}

function escapeIcsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}

function foldIcsLine(line) {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75) return line

  const parts = []
  let current = ''
  let currentBytes = 0
  let maxBytes = 75

  for (const ch of line) {
    const chBytes = encoder.encode(ch).length
    if (currentBytes + chBytes > maxBytes && current.length > 0) {
      parts.push(current)
      current = ' ' + ch
      currentBytes = 1 + chBytes
      maxBytes = 75
    } else {
      current += ch
      currentBytes += chBytes
    }
  }
  if (current) parts.push(current)
  return parts.join('\r\n')
}

export function formatIcsUtcTimestamp(isoOrDate) {
  const dt = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate)
  if (Number.isNaN(dt.getTime())) return ''
  return dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function formatIcsDateOnly(isoOrDate, addDays = 0) {
  const dt = isoOrDate instanceof Date ? new Date(isoOrDate.getTime()) : new Date(isoOrDate)
  if (Number.isNaN(dt.getTime())) return ''
  if (addDays !== 0) {
    dt.setUTCDate(dt.getUTCDate() + addDays)
  }
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

function formatReminderTrigger(minutes) {
  const mins = Math.round(Number(minutes) || 0)
  if (mins <= 0) return null
  if (mins % 1440 === 0) return `-P${mins / 1440}D`
  if (mins % 60 === 0) return `-PT${mins / 60}H`
  return `-PT${mins}M`
}

function sanitizeUidPart(raw) {
  return String(raw || '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, 96)
}

/**
 * Generates an RFC 5545 compliant VCALENDAR (.ics) string for subscribed feeds & file downloads.
 */
export function buildIcsCalendar(
  events = [],
  {
    settings: rawSettings = {},
    rsvpIds = [],
    rsvpMap = null,
    calendarName = '',
    joinedCount = 0,
    now = new Date(),
  } = {}
) {
  const settings = normalizeCalendarSyncSettings(rawSettings)
  const goingSet = extractGoingEventIds(rsvpMap, events, rsvpIds)
  const calTitle = sanitizeCalText(calendarName) || getCalendarFeedName(settings, joinedCount)
  const nowStamp = formatIcsUtcTimestamp(now) || formatIcsUtcTimestamp(new Date())
  const alarmTrigger = formatReminderTrigger(settings.reminderMinutes)

  const calDescParts = [
    settings.clubScope === 'all'
      ? 'Synced across all campus clubs on ClubHub.'
      : 'Automatically synced with your currently joined clubs on ClubHub.',
  ]
  if (settings.rsvpOnly) {
    calDescParts.push('Filtered to events you RSVP\'d to.')
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ClubHub Campus Workspace//Calendar Sync v2//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `NAME:${escapeIcsText(calTitle)}`,
    `X-WR-CALNAME:${escapeIcsText(calTitle)}`,
    `X-WR-CALDESC:${escapeIcsText(calDescParts.join(' '))}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${settings.refreshInterval}`,
    `X-PUBLISHED-TTL:${settings.refreshInterval}`,
  ]

  ;(events || []).forEach((ev, idx) => {
    const startRaw = ev.startIso || ev.start
    if (!startRaw) return
    const startDt = new Date(startRaw)
    if (Number.isNaN(startDt.getTime())) return

    const isAllDay = Boolean(ev.allDay)
    const rawTitle = sanitizeCalText(ev.event || ev.title || 'Club Event')
    const clubName = sanitizeCalText(ev.club || ev.clubName || ev.resolvedClubName || ev.clubId || 'ClubHub')
    const summary =
      settings.titlePrefixClub && clubName && !rawTitle.toLowerCase().startsWith(clubName.toLowerCase())
        ? `${clubName}: ${rawTitle}`
        : rawTitle

    const location = sanitizeCalText(ev.location || 'Campus / TBD')
    const idKey = String(ev.id || `evt-${idx}-${startDt.getTime()}`)
    const isGoing = goingSet.has(idKey) || Boolean(ev.isGoing)

    const descLines = []
    if (clubName) descLines.push(`Club: ${clubName}`)
    if (isGoing) descLines.push('Status: RSVP\'d (Going)')
    if (ev.duration || ev.recurring) {
      descLines.push(`Schedule: ${sanitizeCalText(ev.duration || `Every ${ev.recurring}`)}`)
    }
    if (ev.permalink && /^https?:\/\//i.test(ev.permalink)) {
      descLines.push(`Source Post: ${ev.permalink}`)
    }
    descLines.push('Synced via ClubHub Campus Workspace')

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:clubhub-${sanitizeUidPart(idKey)}@clubhub.ucsc.edu`)
    lines.push(`DTSTAMP:${nowStamp}`)

    if (isAllDay) {
      const startYmd = formatIcsDateOnly(startDt, 0)
      const endYmd = formatIcsDateOnly(startDt, 1)
      if (!startYmd || !endYmd) {
        lines.pop()
        lines.pop()
        lines.pop()
        return
      }
      lines.push(`DTSTART;VALUE=DATE:${startYmd}`)
      lines.push(`DTEND;VALUE=DATE:${endYmd}`)
    } else {
      const startUtc = formatIcsUtcTimestamp(startDt)
      const endRaw = ev.endIso || ev.end
      let endDt = endRaw ? new Date(endRaw) : null
      if (!endDt || Number.isNaN(endDt.getTime()) || endDt.getTime() <= startDt.getTime()) {
        endDt = new Date(startDt.getTime() + 60 * 60 * 1000)
      }
      const endUtc = formatIcsUtcTimestamp(endDt)
      lines.push(`DTSTART:${startUtc}`)
      lines.push(`DTEND:${endUtc}`)
    }

    lines.push(`SUMMARY:${escapeIcsText(summary)}`)
    if (location) {
      lines.push(`LOCATION:${escapeIcsText(location)}`)
    }
    lines.push(`DESCRIPTION:${escapeIcsText(descLines.join('\n'))}`)
    if (ev.permalink && /^https?:\/\//i.test(ev.permalink)) {
      lines.push(`URL:${ev.permalink}`)
    }
    lines.push('STATUS:CONFIRMED')

    if (alarmTrigger) {
      lines.push('BEGIN:VALARM')
      lines.push('ACTION:DISPLAY')
      lines.push(`DESCRIPTION:${escapeIcsText(`Reminder: ${summary}`)}`)
      lines.push(`TRIGGER:${alarmTrigger}`)
      lines.push('END:VALARM')
    }

    lines.push('END:VEVENT')
  })

  lines.push('END:VCALENDAR')
  return lines.map(foldIcsLine).join('\r\n') + '\r\n'
}

/**
 * Builds a direct Google Calendar single-event creation link (`calendar/render?action=TEMPLATE`).
 */
export function buildGoogleCalendarTemplateUrl(ev, { titlePrefixClub = true } = {}) {
  if (!ev) return 'https://calendar.google.com'
  const startRaw = ev.startIso || ev.start
  const startDt = startRaw ? new Date(startRaw) : new Date()
  const safeStart = Number.isNaN(startDt.getTime()) ? new Date() : startDt

  const rawTitle = sanitizeCalText(ev.event || ev.title || 'Club Event')
  const clubName = sanitizeCalText(ev.club || ev.clubName || 'ClubHub')
  const title =
    titlePrefixClub && clubName && !rawTitle.toLowerCase().startsWith(clubName.toLowerCase())
      ? `${clubName}: ${rawTitle}`
      : rawTitle

  let datesParam = ''
  if (ev.allDay) {
    datesParam = `${formatIcsDateOnly(safeStart, 0)}/${formatIcsDateOnly(safeStart, 1)}`
  } else {
    const endRaw = ev.endIso || ev.end
    let endDt = endRaw ? new Date(endRaw) : null
    if (!endDt || Number.isNaN(endDt.getTime()) || endDt.getTime() <= safeStart.getTime()) {
      endDt = new Date(safeStart.getTime() + 60 * 60 * 1000)
    }
    datesParam = `${formatIcsUtcTimestamp(safeStart)}/${formatIcsUtcTimestamp(endDt)}`
  }

  const detailsParts = [`Club: ${clubName}`]
  if (ev.permalink) detailsParts.push(`Post: ${ev.permalink}`)
  detailsParts.push('Added from ClubHub Campus Workspace')

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: datesParam,
    location: sanitizeCalText(ev.location || 'Campus / TBD'),
    details: detailsParts.join('\n'),
  })

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function downloadIcsFile(icsContent, filename = 'clubhub-calendar.ics') {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

function generateRandomSyncToken() {
  const bytes = new Uint8Array(12)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `ch_${hex}`
}

export function getOrCreateCalendarSyncToken(accountKey = 'guest', forceRegenerate = false) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return 'ch_default_feed'
  }
  const safeKey = String(accountKey || 'guest')
  try {
    const raw = localStorage.getItem(SYNC_TOKEN_MAP_STORAGE_KEY)
    const map = raw ? JSON.parse(raw) : {}
    if (!forceRegenerate && typeof map[safeKey] === 'string' && map[safeKey].startsWith('ch_')) {
      return map[safeKey]
    }
    const nextToken = generateRandomSyncToken()
    map[safeKey] = nextToken
    localStorage.setItem(SYNC_TOKEN_MAP_STORAGE_KEY, JSON.stringify(map))
    return nextToken
  } catch {
    return 'ch_local_feed'
  }
}

export function isLocalhostUrl(urlStr) {
  if (!urlStr) return true
  try {
    const normalized = String(urlStr).replace(/^webcals?:\/\//i, 'http://')
    const u = new URL(normalized)
    const host = u.hostname.toLowerCase()
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '[::1]' ||
      host.endsWith('.local')
    )
  } catch {
    return true
  }
}
