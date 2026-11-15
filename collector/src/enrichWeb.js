// Zero-auth web enricher for UCSC clubs:
//   1. Unpacks Linktree (`linktr.ee`), Carrd, Beacons, & club websites from Instagram bio links
//      to find hidden Discord invites, Google Forms, Luma/Eventbrite pages, and Google Calendars.
//   2. Pulls upcoming meetings & rooms from any public Google Calendar `.ics` feed (no API key needed).
//   3. Queries Discord's official public Invite API (`GET /api/v10/invites/{code}?with_counts=true`)
//      to get server names, descriptions, and member/online counts without needing bot/admin approval.

import { isActualClubEvent } from './extract.js'

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const inviteCache = new Map()
const bioUnpackCache = new Map()
let discordInviteCooldownUntil = 0
let linktreeCooldownUntil = 0
const sleep = ms => new Promise(r => setTimeout(r, ms))

function classifyUrlKind(url = '') {
  if (/discord\.(?:gg|com\/invite)/i.test(url)) return 'discord'
  if (/forms\.gle|docs\.google\.com\/forms/i.test(url)) return 'form'
  if (/calendar\.google\.com|calendar\.app\.google/i.test(url)) return 'event'
  if (/lu\.ma|eventbrite\.com/i.test(url)) return 'event'
  if (/docs\.google\.com|drive\.google\.com/i.test(url)) return 'document'
  if (/linktr\.ee|beacons\.ai|bento\.me|carrd\.co/i.test(url)) return 'linktree'
  return 'website'
}

/**
 * Crawl a club's bio website (especially Linktree) to extract all outbound club links & button titles.
 */
export async function unpackBioWebsite(websiteUrl) {
  if (!websiteUrl || !/^https?:\/\//i.test(websiteUrl)) return []
  // Skip Instagram/TikTok/YouTube links that won't hold Linktree-style directory buttons
  if (/(?:instagram\.com|tiktok\.com|youtube\.com|spotify\.com)/i.test(websiteUrl)) return []

  const cacheKey = websiteUrl.trim().toLowerCase()
  if (bioUnpackCache.has(cacheKey)) return bioUnpackCache.get(cacheKey)

  const isLinktreeLike = /(?:linktr\.ee|beacons\.ai|bento\.me|carrd\.co)/i.test(websiteUrl)
  if (isLinktreeLike) {
    if (Date.now() < linktreeCooldownUntil) return []
    await sleep(250)
  }

  try {
    const res = await fetch(websiteUrl, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })
    if (res.status === 429) {
      if (isLinktreeLike) linktreeCooldownUntil = Date.now() + 60_000
      return []
    }
    if (!res.ok) {
      bioUnpackCache.set(cacheKey, [])
      return []
    }
    const html = await res.text()
    const found = new Map()

    const addLink = (rawUrl, rawTitle) => {
      if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) return
      const cleanUrl = rawUrl.trim().replace(/&amp;/g, '&')
      if (/(?:linktr\.ee\/?$|facebook\.com\/tr|google-analytics)/i.test(cleanUrl)) return
      const key = cleanUrl.toLowerCase()
      if (!found.has(key)) {
        const kind = classifyUrlKind(cleanUrl)
        found.set(key, {
          url: cleanUrl,
          label: (rawTitle || '').trim().slice(0, 90) || kind[0].toUpperCase() + kind.slice(1),
          kind,
        })
      }
    }

    // 1. Linktree __NEXT_DATA__ structured JSON (gives exact button titles + URLs)
    const nextMatch = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
    if (nextMatch) {
      try {
        const nextJson = JSON.parse(nextMatch[1])
        const links =
          nextJson?.props?.pageProps?.links ||
          nextJson?.props?.pageProps?.account?.links ||
          []
        for (const item of links) {
          if (item?.url) addLink(item.url, item.title)
        }
      } catch {
        // Ignore malformed JSON and fall back to anchor scan
      }
    }

    // 2. Generic anchor scan for Discord invites, Google Forms, Google Calendars, Docs, Luma, Eventbrite
    const anchorRe = /<a\b[^>]*href=["'](https?:\/\/[^"'#\s>]+)["'][^>]*>([\s\S]*?)<\/a>/gi
    for (const m of html.matchAll(anchorRe)) {
      const url = m[1]
      if (
        /(?:discord\.gg|discord\.com\/invite|forms\.gle|docs\.google\.com|drive\.google\.com|calendar\.google\.com|lu\.ma|eventbrite\.com)/i.test(
          url
        )
      ) {
        const textLabel = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        addLink(url, textLabel)
      }
    }

    const unpacked = [...found.values()]
    bioUnpackCache.set(cacheKey, unpacked)
    return unpacked
  } catch {
    return []
  }
}

/**
 * Extract a Google Calendar ID (`...@group.calendar.google.com` or `...@ucsc.edu`) from a public URL.
 */
export function extractGoogleCalendarId(url = '') {
  try {
    const u = new URL(url)
    if (!/calendar\.google\.com/i.test(u.hostname)) return null
    const src = u.searchParams.get('src')
    if (src && src.includes('@')) return src.trim()

    const cid = u.searchParams.get('cid')
    if (cid) {
      const decoded = Buffer.from(cid, 'base64').toString('utf8').trim()
      if (decoded.includes('@')) return decoded
    }

    const icalMatch = u.pathname.match(/\/calendar\/ical\/([^/]+)\//i)
    if (icalMatch) return decodeURIComponent(icalMatch[1])
  } catch {
    // ignore
  }
  return null
}

function parseIcsDate(val = '') {
  const clean = val.trim()
  // All-day YYYYMMDD
  const dayMatch = clean.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (dayMatch) {
    return {
      iso: `${dayMatch[1]}-${dayMatch[2]}-${dayMatch[3]}T00:00:00.000Z`,
      allDay: true,
    }
  }
  // DateTime YYYYMMDDTHHMMSSZ or local YYYYMMDDTHHMMSS
  const dtMatch = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/)
  if (dtMatch) {
    const [, y, mo, d, h, mi, s, isUtc] = dtMatch
    const dt = isUtc
      ? new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`)
      : new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`)
    if (!Number.isNaN(dt.getTime())) {
      return { iso: dt.toISOString(), allDay: false }
    }
  }
  return null
}

function unescapeIcsText(s = '') {
  return s
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Fetch upcoming events from a club's public Google Calendar `.ics` feed (zero API key required).
 */
export async function fetchPublicGoogleCalendarEvents(calendarId, { clubId, clubName, calendarUrl }) {
  if (!calendarId) return []
  const icsUrl = `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`
  try {
    const res = await fetch(icsUrl, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    // Unfold RFC 5545 folded lines
    const rawIcs = (await res.text()).replace(/\r?\n[ \t]/g, '')
    const blocks = rawIcs.split('BEGIN:VEVENT').slice(1)

    const minTime = Date.now() - 7 * 86400e3
    const maxTime = Date.now() + 90 * 86400e3
    const events = []

    for (const block of blocks) {
      const endIdx = block.indexOf('END:VEVENT')
      const body = endIdx === -1 ? block : block.slice(0, endIdx)
      const lines = body.split(/\r?\n/)

      let uid = ''
      let summary = ''
      let location = ''
      let dtStartRaw = ''
      let dtEndRaw = ''

      for (const line of lines) {
        const colon = line.indexOf(':')
        if (colon === -1) continue
        const prop = line.slice(0, colon).split(';')[0].toUpperCase()
        const val = line.slice(colon + 1)
        if (prop === 'UID') uid = val.trim()
        else if (prop === 'SUMMARY') summary = unescapeIcsText(val)
        else if (prop === 'LOCATION') location = unescapeIcsText(val)
        else if (prop === 'DTSTART') dtStartRaw = val
        else if (prop === 'DTEND') dtEndRaw = val
      }

      if (!summary || !dtStartRaw) continue
      const startParsed = parseIcsDate(dtStartRaw)
      if (!startParsed) continue

      const startMs = Date.parse(startParsed.iso)
      if (Number.isNaN(startMs) || startMs < minTime || startMs > maxTime) continue

      const endParsed = dtEndRaw ? parseIcsDate(dtEndRaw) : null
      const cleanUid = (uid || `${summary}_${startParsed.iso}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)

      const candidate = {
        id: `gcal_${clubId}_${cleanUid}`,
        clubId,
        clubName,
        postId: null,
        permalink: calendarUrl || `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calendarId)}`,
        title: summary.slice(0, 100),
        kind: /\b(gbm|meeting|general body|office hours|practice)\b/i.test(summary) ? 'meeting' : 'event',
        start: startParsed.iso,
        end: endParsed?.iso || null,
        allDay: startParsed.allDay,
        recurring: null,
        location: location ? location.slice(0, 80) : null,
        source: 'google_calendar',
      }
      if (isActualClubEvent(candidate, { source: 'google_calendar' })) {
        events.push(candidate)
      }
    }

    return events.slice(0, 20)
  } catch {
    return []
  }
}

/**
 * Query Discord's official public Invite API (`GET /api/v10/invites/{code}?with_counts=true`)
 * for server metadata & member counts — requires ZERO bot permissions and ZERO server admin cooperation.
 */
export async function fetchDiscordInviteMetadata(inviteUrl = '') {
  const m = String(inviteUrl).match(/discord\.(?:gg|com\/invite)\/([A-Za-z0-9-]{2,32})/i)
  if (!m) return null
  const code = m[1]
  if (inviteCache.has(code.toLowerCase())) return inviteCache.get(code.toLowerCase())
  if (Date.now() < discordInviteCooldownUntil) return null

  try {
    await sleep(350)
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await fetch(
        `https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true&with_expiration=true`,
        {
          headers: { 'user-agent': 'ClubHub (https://github.com/clubhub, 1.0)' },
          signal: AbortSignal.timeout(8000),
        }
      )
      if (res.status === 429) {
        const retryBody = await res.json().catch(() => ({}))
        const retrySec = Number(retryBody.retry_after) || Number(res.headers.get('retry-after')) || 10
        if (attempt === 1 && retrySec <= 5) {
          await sleep(Math.ceil(retrySec * 1000) + 250)
          continue
        }
        discordInviteCooldownUntil = Date.now() + Math.max(retrySec * 1000, 60_000)
        return null
      }
      if (!res.ok) {
        inviteCache.set(code.toLowerCase(), null)
        return null
      }
      const data = await res.json()
      const info = {
        code,
        url: `https://discord.gg/${code}`,
        guildId: data.guild?.id || null,
        serverName: data.guild?.name || null,
        description: data.guild?.description || null,
        memberCount: data.approximate_member_count ?? null,
        onlineCount: data.approximate_presence_count ?? null,
      }
      inviteCache.set(code.toLowerCase(), info)
      return info
    }
    return null
  } catch {
    return null
  }
}
