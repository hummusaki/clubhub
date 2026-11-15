// ── Direct Google Calendar API v3 Live Sync (Browser OAuth via Google Identity Services) ──
// Creates and keeps a dedicated "ClubHub" calendar updated in the user's Google Calendar
// whenever their joined clubs, RSVPs, or Calendar Sync settings change.

import {
  getCalendarFeedName,
  normalizeCalendarSyncSettings,
  sanitizeCalText,
} from './calendarSync.js'

const STORED_GOOGLE_CLIENT_ID_KEY = 'clubhub_google_client_id'
const GCAL_SYNC_META_STORAGE_KEY = 'clubhub_gcal_live_sync_v1'
const GCAL_API_BASE = 'https://www.googleapis.com/calendar/v3'
// Narrow, least-privilege scope: manages only the secondary ClubHub calendar created by this app
const GCAL_OAUTH_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created'

export function getEffectiveGoogleClientId() {
  const envId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim()
  if (envId) return envId
  if (typeof localStorage === 'undefined') return ''
  try {
    return (localStorage.getItem(STORED_GOOGLE_CLIENT_ID_KEY) || '').trim()
  } catch {
    return ''
  }
}

export function saveGoogleClientId(clientId) {
  if (typeof localStorage === 'undefined') return
  try {
    const clean = String(clientId || '').trim()
    if (clean) {
      localStorage.setItem(STORED_GOOGLE_CLIENT_ID_KEY, clean)
    } else {
      localStorage.removeItem(STORED_GOOGLE_CLIENT_ID_KEY)
    }
  } catch {
    // Ignore storage errors
  }
}

export function getStoredGoogleCalSyncMeta(accountKey = 'guest') {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(GCAL_SYNC_META_STORAGE_KEY)
    const map = raw ? JSON.parse(raw) : {}
    return map[String(accountKey || 'guest')] || null
  } catch {
    return null
  }
}

export function saveStoredGoogleCalSyncMeta(accountKey = 'guest', meta = {}) {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(GCAL_SYNC_META_STORAGE_KEY)
    const map = raw ? JSON.parse(raw) : {}
    const key = String(accountKey || 'guest')
    map[key] = {
      ...(map[key] || {}),
      ...meta,
    }
    localStorage.setItem(GCAL_SYNC_META_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Ignore storage errors
  }
}

export function clearStoredGoogleCalSyncMeta(accountKey = 'guest') {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(GCAL_SYNC_META_STORAGE_KEY)
    const map = raw ? JSON.parse(raw) : {}
    delete map[String(accountKey || 'guest')]
    localStorage.setItem(GCAL_SYNC_META_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Ignore storage errors
  }
}

export function loadGoogleGsiSdk() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Browser environment required'))
      return
    }
    if (window.google?.accounts?.oauth2) {
      resolve(window.google)
      return
    }

    const existing = document.getElementById('google-gsi-script')
    if (existing) {
      let checks = 0
      const poll = setInterval(() => {
        checks += 1
        if (window.google?.accounts?.oauth2) {
          clearInterval(poll)
          resolve(window.google)
        } else if (checks > 50) {
          clearInterval(poll)
          reject(new Error('Timed out loading Google Identity Services'))
        }
      }, 100)
      return
    }

    const script = document.createElement('script')
    script.id = 'google-gsi-script'
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => {
      if (window.google?.accounts?.oauth2) {
        resolve(window.google)
      } else {
        reject(new Error('Google Identity Services unavailable'))
      }
    }
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'))
    document.head.appendChild(script)
  })
}

export async function requestGoogleCalendarAccessToken(clientId, { prompt = '' } = {}) {
  const cleanClientId = String(clientId || getEffectiveGoogleClientId()).trim()
  if (!cleanClientId) {
    throw new Error('Missing Google OAuth Client ID')
  }
  const google = await loadGoogleGsiSdk()

  return new Promise((resolve, reject) => {
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: cleanClientId,
      scope: GCAL_OAUTH_SCOPE,
      prompt,
      callback: resp => {
        if (resp?.error) {
          reject(new Error(resp.error_description || resp.error))
          return
        }
        if (!resp?.access_token) {
          reject(new Error('No access token returned from Google'))
          return
        }
        resolve({
          accessToken: resp.access_token,
          expiresAt: Date.now() + Math.max(60, Number(resp.expires_in || 3500) - 60) * 1000,
        })
      },
      error_callback: err => {
        const error = new Error(err?.message || err?.type || 'Google authorization cancelled')
        error.code = err?.type || 'oauth_error'
        reject(error)
      },
    })
    tokenClient.requestAccessToken({ prompt })
  })
}

async function gcalFetch(accessToken, path, options = {}) {
  const res = await fetch(`${GCAL_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  if (res.status === 204) return null
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = body?.error?.message || `Google Calendar API HTTP ${res.status}`
    const error = new Error(msg)
    error.status = res.status
    throw error
  }
  return body
}

function buildGoogleEventPayload(ev, settings) {
  const startRaw = ev.startIso || ev.start
  const startDt = new Date(startRaw)
  const rawTitle = sanitizeCalText(ev.event || ev.title || 'Club Event')
  const clubName = sanitizeCalText(ev.club || ev.clubName || 'ClubHub')
  const summary =
    settings.titlePrefixClub && clubName && !rawTitle.toLowerCase().startsWith(clubName.toLowerCase())
      ? `${clubName}: ${rawTitle}`
      : rawTitle

  const descLines = [`Club: ${clubName}`]
  if (ev.isGoing) descLines.push("RSVP: Going")
  if (ev.permalink) descLines.push(`Post: ${ev.permalink}`)
  descLines.push('Auto-synced by ClubHub Campus Workspace')

  let startObj
  let endObj
  if (ev.allDay) {
    const startYmd = startDt.toISOString().slice(0, 10)
    const nextDt = new Date(startDt.getTime())
    nextDt.setUTCDate(nextDt.getUTCDate() + 1)
    const endYmd = nextDt.toISOString().slice(0, 10)
    startObj = { date: startYmd }
    endObj = { date: endYmd }
  } else {
    const endRaw = ev.endIso || ev.end
    let endDt = endRaw ? new Date(endRaw) : null
    if (!endDt || Number.isNaN(endDt.getTime()) || endDt.getTime() <= startDt.getTime()) {
      endDt = new Date(startDt.getTime() + 60 * 60 * 1000)
    }
    startObj = { dateTime: startDt.toISOString() }
    endObj = { dateTime: endDt.toISOString() }
  }

  const reminderMinutes = Number(settings.reminderMinutes) || 0
  const reminders =
    reminderMinutes > 0
      ? {
          useDefault: false,
          overrides: [{ method: 'popup', minutes: reminderMinutes }],
        }
      : { useDefault: false, overrides: [] }

  const signature = JSON.stringify({
    summary,
    location: sanitizeCalText(ev.location || 'Campus / TBD'),
    startObj,
    endObj,
    reminderMinutes,
    isGoing: Boolean(ev.isGoing),
  })

  return {
    summary,
    location: sanitizeCalText(ev.location || 'Campus / TBD'),
    description: descLines.join('\n'),
    start: startObj,
    end: endObj,
    reminders,
    extendedProperties: {
      private: {
        clubhubEventId: String(ev.id),
        clubhubSignature: signature,
      },
    },
  }
}

export async function pushEventsToGoogleCalendar({
  accessToken,
  events = [],
  settings: rawSettings = {},
  joinedCount = 0,
  storedCalendarId = null,
}) {
  const settings = normalizeCalendarSyncSettings(rawSettings)
  const targetTitle = getCalendarFeedName(settings, joinedCount)
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'

  let calendarId = storedCalendarId || null
  if (calendarId) {
    try {
      const existingCal = await gcalFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}`)
      if (existingCal && existingCal.summary !== targetTitle) {
        await gcalFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ summary: targetTitle }),
        })
      }
    } catch (err) {
      if (err.status === 404) {
        calendarId = null
      } else {
        throw err
      }
    }
  }

  if (!calendarId) {
    const createdCal = await gcalFetch(accessToken, '/calendars', {
      method: 'POST',
      body: JSON.stringify({
        summary: targetTitle,
        description: 'Auto-synced campus club schedule from ClubHub',
        timeZone: tz,
      }),
    })
    calendarId = createdCal.id
  }

  const listResp = await gcalFetch(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events?maxResults=250&singleEvents=false`
  )
  const remoteItems = Array.isArray(listResp?.items) ? listResp.items.filter(i => i.status !== 'cancelled') : []

  const remoteByClubhubId = new Map()
  for (const item of remoteItems) {
    const chId = item?.extendedProperties?.private?.clubhubEventId
    if (chId) {
      remoteByClubhubId.set(String(chId), item)
    }
  }

  const desiredById = new Map()
  for (const ev of events || []) {
    if (!ev || !ev.id) continue
    desiredById.set(String(ev.id), buildGoogleEventPayload(ev, settings))
  }

  let inserted = 0
  let updated = 0
  let removed = 0

  for (const [chId, payload] of desiredById.entries()) {
    const existing = remoteByClubhubId.get(chId)
    if (!existing) {
      await gcalFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      inserted += 1
    } else {
      const prevSig = existing?.extendedProperties?.private?.clubhubSignature
      const nextSig = payload.extendedProperties.private.clubhubSignature
      if (prevSig !== nextSig) {
        await gcalFetch(
          accessToken,
          `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existing.id)}`,
          {
            method: 'PUT',
            body: JSON.stringify(payload),
          }
        )
        updated += 1
      }
    }
  }

  for (const [chId, remoteItem] of remoteByClubhubId.entries()) {
    if (!desiredById.has(chId)) {
      await gcalFetch(
        accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(remoteItem.id)}`,
        { method: 'DELETE' }
      ).catch(() => {})
      removed += 1
    }
  }

  return {
    calendarId,
    calendarTitle: targetTitle,
    syncedCount: desiredById.size,
    inserted,
    updated,
    removed,
    syncedAt: new Date().toISOString(),
  }
}
