import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react'
import { useUser, useClerk, AuthenticateWithRedirectCallback } from '@clerk/react'
import { Clock, ArrowRight } from 'lucide-react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import StatCards from './components/StatCards'
import CalendarView from './components/CalendarView'
import AvailabilityView from './components/AvailabilityView'
import Announcements from './components/Announcements'
import ClubsHub from './components/ClubsHub'
import LinksResources from './components/LinksResources'
import SettingsView from './components/SettingsView'
import SignInPage from './components/SignInPage'
import { Card, IconBadge, ToastViewport, cleanText } from './components/ui'
import { categorizeClub, getClubCategoryMeta } from './utils/clubCategories'
import {
  clubs as initialClubs,
  todaySchedule as fallbackSchedule,
  links as fallbackLinks,
} from './data/sampleData'
import {
  getClubHub,
  getDictKey,
  setDictKey,
  getAnnouncements,
  getEvents,
  getLinks,
  getStats,
  createEvent,
  deleteEvent,
  getStaticSnapshot,
  syncCalendarFeedProfile,
} from './api/client'
import {
  DEFAULT_CALENDAR_SYNC_SETTINGS,
  normalizeCalendarSyncSettings,
  extractGoingEventIds,
  filterEventsForCalendarSync,
  buildIcsCalendar,
  downloadIcsFile,
  getOrCreateCalendarSyncToken,
  isLocalhostUrl,
} from './utils/calendarSync'
import {
  getEffectiveGoogleClientId,
  saveGoogleClientId,
  getStoredGoogleCalSyncMeta,
  saveStoredGoogleCalSyncMeta,
  clearStoredGoogleCalSyncMeta,
  loadGoogleGsiSdk,
  requestGoogleCalendarAccessToken,
  pushEventsToGoogleCalendar,
} from './utils/googleCalendarSync'
import { isValidClerkPublishableKey } from './utils/authValidation'
import { buildDashboardPageTitle } from './utils/pageTitle'

const AUTH_USER_STORAGE_KEY = 'clubhub_auth_user'
const EMAIL_ACCOUNTS_KEY = 'clubhub_registered_accounts_v2'
const ACCOUNT_THEMES_STORAGE_KEY = 'clubhub_account_themes_v2'
const GUEST_THEME_STORAGE_KEY = 'clubhub_guest_theme_mode_v1'
const LAST_ACTIVE_ACCOUNT_KEY = 'clubhub_last_active_account_v1'
const RSVP_STORAGE_KEY = 'clubhub_event_rsvps_v1'
const USER_SETTINGS_STORAGE_KEY = 'clubhub_user_settings_v1'
const JOINED_CLUBS_STORAGE_KEY = 'clubhub_joined_clubs_v1'
const LOCAL_ADDED_EVENTS_KEY = 'clubhub_local_added_events_v1'
const REMOVED_EVENT_IDS_KEY = 'clubhub_removed_event_ids_v1'
const LOCAL_ADDED_LINKS_KEY = 'clubhub_local_added_links_v1'
const PINNED_LINK_OVERRIDES_KEY = 'clubhub_pinned_link_overrides_v1'
const LOCAL_CLUB_POSTS_KEY = 'clubhub_local_club_posts_v1'
const CUSTOM_POLLS_STORAGE_KEY = 'clubhub_custom_polls_v1'
const PENDING_POLL_SESSION_KEY = 'clubhub_pending_poll_id'

const VALID_THEME_MODES = new Set(['system', 'light', 'dark'])

function isValidThemeMode(mode) {
  return VALID_THEME_MODES.has(mode)
}

function normalizeThemeMode(mode, fallback = 'system') {
  return isValidThemeMode(mode) ? mode : fallback
}

function getSystemPrefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return Boolean(window.matchMedia('(prefers-color-scheme: dark)').matches)
}

function resolveDarkFromThemeMode(mode) {
  const normalized = normalizeThemeMode(mode, 'system')
  if (normalized === 'dark') return true
  if (normalized === 'light') return false
  return getSystemPrefersDark()
}

function readLocalJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeLocalJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore storage quota / private mode errors
  }
}

function getJoinedClubsMap() {
  try {
    return JSON.parse(localStorage.getItem(JOINED_CLUBS_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function hasStoredJoinedClubs(accountKey) {
  if (!accountKey) return false
  const map = getJoinedClubsMap()
  return Array.isArray(map[accountKey])
}

function getStoredJoinedClubIds(accountKey) {
  if (!accountKey) return []
  const map = getJoinedClubsMap()
  return Array.isArray(map[accountKey]) ? map[accountKey].map(String) : []
}

function saveStoredJoinedClubIds(keys, clubIds) {
  try {
    const map = getJoinedClubsMap()
    const cleanIds = Array.from(new Set((clubIds || []).map(String)))
    keys.filter(Boolean).forEach(k => {
      map[k] = cleanIds
    })
    localStorage.setItem(JOINED_CLUBS_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Ignore storage errors
  }
}

const DEFAULT_USER_SETTINGS = {
  displayName: '',
  major: '',
  avatarBg: 'linear-gradient(135deg, var(--blue), var(--purple))',
  themeMode: 'system', // 'system' (default: match OS) | 'light' | 'dark'
  compactCards: false,
  reduceMotion: false,
  timeFormat: '12h',
  weekStartsOn: 'monday',
  defaultCalendarView: 'month',
  availabilityHours: '9-19',
  urgentOnlyBadge: false,
  channels: {
    discord: true,
    instagram: true,
    email: true,
  },
  calendarSync: DEFAULT_CALENDAR_SYNC_SETTINGS,
}

function getStoredUserSettings() {
  try {
    const raw = localStorage.getItem(USER_SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_USER_SETTINGS
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_USER_SETTINGS,
      ...parsed,
      themeMode: normalizeThemeMode(parsed?.themeMode, 'system'),
      channels: {
        ...DEFAULT_USER_SETTINGS.channels,
        ...(parsed?.channels || {}),
      },
      calendarSync: normalizeCalendarSyncSettings(parsed?.calendarSync),
    }
  } catch {
    return DEFAULT_USER_SETTINGS
  }
}

function saveStoredUserSettings(nextSettings) {
  try {
    localStorage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings))
  } catch {
    // Ignore storage errors
  }
}

function createDemoUserSettings(themeMode = 'system') {
  return {
    ...DEFAULT_USER_SETTINGS,
    displayName: '',
    major: '',
    themeMode: normalizeThemeMode(themeMode, 'system'),
    channels: { ...DEFAULT_USER_SETTINGS.channels },
    calendarSync: normalizeCalendarSyncSettings(DEFAULT_USER_SETTINGS.calendarSync),
  }
}

function randomDemoClubCount() {
  return 2 + Math.floor(Math.random() * 4) // 2–5 clubs inclusive
}

function shuffleList(items) {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function pickRandomDemoClubIds(
  clubsPool = [],
  targetCount = randomDemoClubCount(),
  { events = [], links = [], hub = null, now = new Date() } = {}
) {
  const validClubs = (clubsPool || []).filter(
    c => c && c.id && c.syncStatus !== 'unavailable'
  )
  if (validClubs.length === 0) return []

  const desired = Math.min(Math.max(2, targetCount), Math.min(5, validClubs.length))

  const upcomingClubIds = new Set()
  const anyEventClubIds = new Set()
  for (const ev of events || []) {
    if (!ev?.clubId) continue
    const cid = String(ev.clubId)
    anyEventClubIds.add(cid)
    if (isEventUpcoming(ev, now)) {
      upcomingClubIds.add(cid)
    }
  }

  const linkClubIds = new Set()
  for (const l of links || []) {
    if (l?.clubId) linkClubIds.add(String(l.clubId))
  }

  const postClubIds = new Set()
  if (hub && typeof hub === 'object') {
    for (const [cid, clubObj] of Object.entries(hub)) {
      if (Array.isArray(clubObj?.posts) && clubObj.posts.length > 0) {
        postClubIds.add(String(clubObj.id || cid))
      }
    }
  }

  const tier1 = []
  const tier2 = []
  const tier3 = []

  for (const club of validClubs) {
    const cid = String(club.id)
    const hasUpcoming = upcomingClubIds.has(cid)
    const hasAnyEvent = anyEventClubIds.has(cid)
    const hasLinks = linkClubIds.size === 0 || linkClubIds.has(cid)
    const hasPosts = postClubIds.size === 0 || postClubIds.has(cid)

    if (hasUpcoming && hasLinks && hasPosts) {
      tier1.push(cid)
    } else if (hasUpcoming || (hasAnyEvent && hasLinks && hasPosts)) {
      tier2.push(cid)
    } else {
      tier3.push(cid)
    }
  }

  const ordered = [
    ...shuffleList(tier1),
    ...shuffleList(tier2),
    ...shuffleList(tier3),
  ]

  return Array.from(new Set(ordered)).slice(0, desired)
}

function getStoredRsvps() {
  try {
    return JSON.parse(localStorage.getItem(RSVP_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function getAccountThemeMap() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNT_THEMES_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveAccountThemeForKeys(keys, mode) {
  if (!isValidThemeMode(mode)) return
  try {
    const map = getAccountThemeMap()
    keys.filter(Boolean).forEach(k => {
      map[k] = mode
    })
    localStorage.setItem(ACCOUNT_THEMES_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Ignore storage errors
  }
}

function getGuestThemeMode() {
  try {
    const raw = localStorage.getItem(GUEST_THEME_STORAGE_KEY)
    if (isValidThemeMode(raw)) return raw
  } catch {
    // Ignore storage errors
  }
  return 'system'
}

function saveGuestThemeMode(mode) {
  if (!isValidThemeMode(mode)) return
  try {
    localStorage.setItem(GUEST_THEME_STORAGE_KEY, mode)
  } catch {
    // Ignore storage errors
  }
}

function persistBackendAccountTheme(email, mode) {
  if (!email || !isValidThemeMode(mode)) return
  setDictKey(
    `user_theme:${email.toLowerCase()}`,
    {
      themeMode: mode,
      darkMode: mode === 'dark' ? true : mode === 'light' ? false : null,
      updatedAt: new Date().toISOString(),
    },
    { namespace: 'user_prefs', source: 'account_theme' }
  ).catch(() => {})
}

const KIND_ICON_MAP = {
  discord: 'MessageCircle',
  form: 'CheckCircle',
  document: 'FileText',
  website: 'Globe',
}

const KIND_COLOR_MAP = {
  discord: 'purple',
  form: 'red',
  document: 'blue',
  website: 'green',
}

const KIND_CATEGORY_MAP = {
  discord: 'Community',
  form: 'Events',
  document: 'Documents',
  website: 'Resources',
}

// Static fallback dictionary for GitHub Pages when backend port 3001 is not running
const STATIC_HUB_FALLBACK = {
  demo_ucsc_csclub: {
    id: 'demo_ucsc_csclub',
    name: 'Computer Science Club',
    instagram: 'demo_ucsc_csclub',
    category: 'academic',
    followers: 1240,
    posts: [
      {
        id: 'demo_cs_1',
        clubId: 'demo_ucsc_csclub',
        source: 'instagram',
        postedAt: '2026-11-14T01:34:07.526Z',
        title: 'Intro to React Workshop',
        summary: 'Learn to build your first web app from scratch. Nov 17 · 6–8 PM · Baskin Engineering 152.',
      },
      {
        id: 'discord_cs_msg_1',
        clubId: 'demo_ucsc_csclub',
        source: 'discord',
        postedAt: '2026-11-14T15:00:00.000Z',
        title: 'Hackathon Team Formation & Social',
        summary: 'Hackathon team formation & pizza social on Friday at 5:00 PM in Baskin Engineering 152.',
      },
      {
        id: 'email_cs_newsletter_1',
        clubId: 'demo_ucsc_csclub',
        source: 'email',
        postedAt: '2026-11-13T18:00:00.000Z',
        title: 'Weekly Digest & Technical Interview Prep',
        summary: 'Technical Interview Prep session this Wednesday from 7:00 PM to 8:30 PM in Baskin Engineering 152.',
      },
    ],
  },
  demo_ucsc_debate: {
    id: 'demo_ucsc_debate',
    name: 'Debate Society',
    instagram: 'demo_ucsc_debate',
    category: 'social',
    followers: 410,
    posts: [
      {
        id: 'demo_debate_2',
        clubId: 'demo_ucsc_debate',
        source: 'instagram',
        postedAt: '2026-11-11T21:34:07.526Z',
        title: 'Fall Showcase Tournament',
        summary: 'This Saturday from 10:00 AM to 3:00 PM at Stevenson Event Center.',
      },
      {
        id: 'discord_debate_msg_1',
        clubId: 'demo_ucsc_debate',
        source: 'discord',
        postedAt: '2026-11-14T14:00:00.000Z',
        title: 'Practice Round Topic Announcement',
        summary: 'Motion for Thursday 4:30 PM practice in Humanities 1 Room 110 is now posted in #motions.',
      },
    ],
  },
  demo_ucsc_artcollective: {
    id: 'demo_ucsc_artcollective',
    name: 'Art Collective',
    instagram: 'demo_ucsc_artcollective',
    category: 'arts',
    followers: 650,
    posts: [
      {
        id: 'demo_art_1',
        clubId: 'demo_ucsc_artcollective',
        source: 'instagram',
        postedAt: '2026-11-13T15:34:07.526Z',
        title: 'Open Studio & Printmaking Session',
        summary: 'Tomorrow at 1:00 PM in Porter D-Building Studio 3B. Materials provided.',
      },
      {
        id: 'email_art_newsletter_1',
        clubId: 'demo_ucsc_artcollective',
        source: 'email',
        postedAt: '2026-11-12T16:00:00.000Z',
        title: 'Winter Zine Submissions Open',
        summary: 'Submit your artwork for the Winter Zine! Open studio hours every Sunday at 1:00 PM.',
      },
    ],
  },
}

function toLocalYmdApp(dateInput) {
  const dt = dateInput instanceof Date ? dateInput : new Date(dateInput)
  if (Number.isNaN(dt.getTime())) return ''
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isEventUpcoming(ev, now = new Date()) {
  const iso = ev.startIso ?? ev.start
  if (!iso) return true
  const startDt = new Date(iso)
  if (Number.isNaN(startDt.getTime())) return false
  if (ev.allDay) {
    return toLocalYmdApp(startDt) >= toLocalYmdApp(now)
  }
  return startDt.getTime() >= now.getTime()
}

function cleanScrapedLocation(raw) {
  if (!raw || typeof raw !== 'string') return 'Campus / See post'
  const stripped = cleanText(raw)
    .replace(/^(?:location|where|place|room)\s*:\s*/i, '')
    .trim()
  if (
    stripped.length < 3 ||
    /^(?:opers|be\s|to\s|and\s|our\s|we\s|have\s|having\s|join\s)/i.test(stripped)
  ) {
    return 'Campus / See post'
  }
  return stripped
}

function formatScheduleItem(e, index = 0) {
  const palette = ['blue', 'green', 'purple', 'yellow', 'teal']
  const isBookedCollab = String(e.id || '').startsWith('collab_evt_')
  const startDate = new Date(e.start)
  const isAllDay = Boolean(e.allDay)
  const timeLabel = isAllDay
    ? `${startDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })} · All Day`
    : startDate.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })

  return {
    id: e.id,
    clubId: e.clubId || null,
    club: cleanText(e.clubName || e.clubId || 'Campus Club'),
    event: cleanText(e.title),
    time: timeLabel,
    location: cleanScrapedLocation(e.location),
    duration: isBookedCollab
      ? 'Scheduled from Availability Poll'
      : e.recurring
        ? `Every ${e.recurring}`
        : '',
    color: isBookedCollab ? 'green' : palette[index % palette.length],
    isBookedCollab,
    isCustom: Boolean(e.isCustom),
    allDay: isAllDay,
    permalink: e.permalink || null,
    startIso: e.start,
    endIso: e.end,
  }
}

function getInitialStoredUser() {
  try {
    const raw = localStorage.getItem(AUTH_USER_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      !parsed?.authenticated &&
      (parsed?.email === 'sslug@ucsc.edu' || parsed?.email === 'arivera@ucsc.edu')
    ) {
      localStorage.removeItem(AUTH_USER_STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function MainDashboard({
  dark,
  toggleDark,
  onSetExplicitThemeMode,
  userSettings,
  onUpdateSettings,
  user = null,
  isDemo = false,
  onExitDemo,
  onSignOut,
  hasClerkKey = false,
}) {
  const effectiveUser = isDemo ? null : user
  const accountEmail = (
    effectiveUser?.primaryEmailAddress?.emailAddress ||
    effectiveUser?.email ||
    ''
  ).toLowerCase()
  const accountKey = useMemo(() => {
    if (isDemo) return 'demo'
    if (hasClerkKey && effectiveUser?.id) return `clerk:${effectiveUser.id}`
    if (accountEmail) return `email:${accountEmail}`
    return 'guest'
  }, [isDemo, hasClerkKey, effectiveUser?.id, accountEmail])

  const demoTargetCountRef = useRef(randomDemoClubCount())
  const demoLiveSeededRef = useRef(false)
  const demoUserModifiedClubsRef = useRef(false)

  const [activeNav, setActiveNav] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const urlPoll = new URLSearchParams(window.location.search).get('poll')
        const pendingPoll = sessionStorage.getItem(PENDING_POLL_SESSION_KEY)
        if (urlPoll || pendingPoll) return 'availability'
      } catch {
        // Ignore URL/sessionStorage errors
      }
    }
    return 'overview'
  })
  const [pageSubContext, setPageSubContext] = useState(null)
  const [clubsInitialSection, setClubsInitialSection] = useState(null)
  const [calendarInitialView, setCalendarInitialView] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [clubsData] = useState(initialClubs)
  const [joinedClubIds, setJoinedClubIds] = useState(() =>
    isDemo
      ? pickRandomDemoClubIds(initialClubs, demoTargetCountRef.current, {
          events: fallbackSchedule,
          links: fallbackLinks,
          hub: STATIC_HUB_FALLBACK,
        })
      : getStoredJoinedClubIds(accountKey)
  )
  const [linksCount] = useState(fallbackLinks.length)
  const [rsvpMap, setRsvpMap] = useState(() => (isDemo ? {} : getStoredRsvps()))
  const [resetGeneration, setResetGeneration] = useState(0)

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', Boolean(userSettings?.reduceMotion))
  }, [userSettings?.reduceMotion])

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('compact-cards', Boolean(userSettings?.compactCards))
  }, [userSettings?.compactCards])

  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)

  const [hubDict, setHubDict] = useState(STATIC_HUB_FALLBACK)
  const [liveAnnouncements, setLiveAnnouncements] = useState(null)
  const [liveClubs, setLiveClubs] = useState(null)
  const [liveSchedule, setLiveSchedule] = useState(null)
  const [rawEvents, setRawEvents] = useState([])
  const [localAddedEvents, setLocalAddedEvents] = useState(() => {
    if (isDemo) return []
    const saved = readLocalJson(LOCAL_ADDED_EVENTS_KEY, [])
    return Array.isArray(saved) ? saved : []
  })
  const [removedEventIds, setRemovedEventIds] = useState(() => {
    if (isDemo) return new Set()
    const saved = readLocalJson(REMOVED_EVENT_IDS_KEY, [])
    return new Set(Array.isArray(saved) ? saved.map(String) : [])
  })
  const [liveLinks, setLiveLinks] = useState(null)
  const [localAddedLinks, setLocalAddedLinks] = useState(() => {
    if (isDemo) return []
    const saved = readLocalJson(LOCAL_ADDED_LINKS_KEY, [])
    return Array.isArray(saved) ? saved : []
  })
  const [pinnedLinkOverrides, setPinnedLinkOverrides] = useState(() => {
    if (isDemo) return {}
    const saved = readLocalJson(PINNED_LINK_OVERRIDES_KEY, {})
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
  })
  const [localClubPosts, setLocalClubPosts] = useState(() => {
    if (isDemo) return []
    const saved = readLocalJson(LOCAL_CLUB_POSTS_KEY, [])
    return Array.isArray(saved) ? saved : []
  })
  const [liveStats, setLiveStats] = useState(null)

  useEffect(() => {
    if (isDemo) return
    writeLocalJson(LOCAL_ADDED_EVENTS_KEY, localAddedEvents)
  }, [isDemo, localAddedEvents])

  useEffect(() => {
    if (isDemo) return
    writeLocalJson(REMOVED_EVENT_IDS_KEY, Array.from(removedEventIds))
  }, [isDemo, removedEventIds])

  useEffect(() => {
    if (isDemo) return
    writeLocalJson(LOCAL_ADDED_LINKS_KEY, localAddedLinks)
  }, [isDemo, localAddedLinks])

  useEffect(() => {
    if (isDemo) return
    writeLocalJson(PINNED_LINK_OVERRIDES_KEY, pinnedLinkOverrides)
  }, [isDemo, pinnedLinkOverrides])

  useEffect(() => {
    if (isDemo) return
    writeLocalJson(LOCAL_CLUB_POSTS_KEY, localClubPosts)
  }, [isDemo, localClubPosts])

  const showToast = useCallback((text, options = {}) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({
      id: Date.now(),
      text,
      type: options.type || 'success',
      actionLabel: options.actionLabel,
      onAction: options.onAction,
    })
    toastTimerRef.current = setTimeout(() => {
      setToast(null)
    }, 4200)
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  // Sync per-account joined clubs (defaults to [] — zero clubs auto-joined for signed-in accounts)
  useEffect(() => {
    if (isDemo) return
    const emailKey = accountEmail ? `email:${accountEmail}` : null
    if (hasStoredJoinedClubs(accountKey)) {
      setJoinedClubIds(getStoredJoinedClubIds(accountKey))
      return
    }
    if (emailKey && hasStoredJoinedClubs(emailKey)) {
      const stored = getStoredJoinedClubIds(emailKey)
      setJoinedClubIds(stored)
      saveStoredJoinedClubIds([accountKey, emailKey], stored)
      return
    }
    if (hasClerkKey && Array.isArray(effectiveUser?.unsafeMetadata?.joinedClubIds)) {
      const metaIds = effectiveUser.unsafeMetadata.joinedClubIds.map(String)
      setJoinedClubIds(metaIds)
      saveStoredJoinedClubIds([accountKey, emailKey], metaIds)
      return
    }
    setJoinedClubIds([])
    if (accountEmail) {
      getDictKey(`user_clubs:${accountEmail}`).then(entry => {
        if (Array.isArray(entry?.value?.clubIds)) {
          const remoteIds = entry.value.clubIds.map(String)
          setJoinedClubIds(remoteIds)
          saveStoredJoinedClubIds([accountKey, emailKey], remoteIds)
        }
      })
    }
  }, [isDemo, accountKey, accountEmail, hasClerkKey, effectiveUser?.unsafeMetadata?.joinedClubIds])

  const loadBackendData = useCallback(async () => {
    let [hub, anns, evts, lnks, dbStats] = await Promise.all([
      getClubHub(),
      getAnnouncements({ limit: 40 }),
      getEvents(),
      getLinks(),
      getStats(),
    ])

    if (!hub) {
      const snap = await getStaticSnapshot()
      if (snap) {
        hub = snap.hub || null
        anns = Array.isArray(snap.announcements) ? snap.announcements.slice(0, 40) : null
        evts = Array.isArray(snap.events) ? snap.events : null
        lnks = Array.isArray(snap.links) ? snap.links : null
        dbStats = snap.stats || null
      }
    }

    const nowRef = new Date()
    const calendarMinCutoffMs = new Date('2025-01-01T00:00:00Z').getTime()

    if (hub && Object.keys(hub).length > 0) {
      setHubDict(hub)
      const mappedClubs = Object.values(hub).map(c => {
        const clubEvents = Array.isArray(c.events) ? c.events : []
        const upcomingEvt =
          clubEvents
            .filter(ev => isEventUpcoming(ev, nowRef))
            .sort((a, b) => new Date(a.start) - new Date(b.start))[0] || null

        const scheduleStr = upcomingEvt
          ? `${new Date(upcomingEvt.start).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}${upcomingEvt.location ? ' · ' + cleanScrapedLocation(upcomingEvt.location) : ''}`
          : c.instagram
            ? `@${c.instagram}`
            : 'See club updates'

        const catId = categorizeClub(c)
        const catMeta = getClubCategoryMeta(catId)
        const rawDesc = c.bio || c.directoryDescription || (c.posts || [])[0]?.summary || ''
        const clubLinks = Array.isArray(c.links) ? c.links : []
        const discordLink = clubLinks.find(
          l =>
            l?.url &&
            (String(l.kind || '').toLowerCase() === 'discord' ||
              /discord\.(?:gg|com\/invite)\//i.test(String(l.url)))
        )
        const resolvedDiscordUrl = c.discordUrl || c.discord || discordLink?.url || null
        const emailLinks = clubLinks
          .filter(
            l =>
              String(l?.kind || '').toLowerCase() === 'email' ||
              /^mailto:/i.test(String(l?.url || ''))
          )
          .map(l => String(l.url || '').replace(/^mailto:/i, '').trim())
          .filter(Boolean)
        const resolvedEmail = c.email || emailLinks[0] || null

        return {
          id: c.id,
          name: cleanText(c.name),
          abbr: (c.name || 'CL')
            .split(' ')
            .filter(Boolean)
            .map(w => w[0])
            .join('')
            .slice(0, 2)
            .toUpperCase(),
          members: c.memberCount || c.discordMemberCount || c.followers || 0,
          discord: resolvedDiscordUrl,
          discordUrl: resolvedDiscordUrl,
          discordServerName: c.discordServerName || null,
          discordMemberCount: c.discordMemberCount ?? null,
          discordOnlineCount: c.discordOnlineCount ?? null,
          rosterCount: Array.isArray(c.roster) ? c.roster.length : c.rosterCount || 0,
          rosterUpdatedAt: c.rosterUpdatedAt || null,
          orgStatus: c.orgStatus || 'active',
          orgStatusNote: c.orgStatusNote || null,
          category: catId,
          categoryLabel: catMeta.label,
          description: rawDesc ? cleanText(rawDesc) : '',
          profilePictureUrl: c.profilePictureUrl || null,
          instagram: c.instagram || null,
          email: resolvedEmail,
          extraEmails: emailLinks.filter(e => e !== resolvedEmail),
          website: c.website || null,
          tags: [
            ...(c.instagram ? [{ label: `@${c.instagram}`, color: 'blue' }] : []),
            { label: catMeta.shortLabel, color: catMeta.color },
          ],
          schedule: cleanText(scheduleStr),
          avatarBg: catMeta.gradient,
          active: true,
          joined: false,
        }
      })

      if (mappedClubs.length > 0) {
        const mappedNames = new Set(
          mappedClubs.map(mc => (mc.name || '').toLowerCase().trim())
        )
        const extraDiscoverClubs = initialClubs
          .filter(ic => !mappedNames.has((ic.name || '').toLowerCase().trim()))
          .map(ic => {
            const catId = categorizeClub(ic)
            const catMeta = getClubCategoryMeta(catId)
            return {
              ...ic,
              category: catId,
              categoryLabel: catMeta.label,
              avatarBg: ic.avatarBg || catMeta.gradient,
              joined: false,
            }
          })

        setLiveClubs([...mappedClubs, ...extraDiscoverClubs])

        if (isDemo && !demoLiveSeededRef.current && !demoUserModifiedClubsRef.current) {
          demoLiveSeededRef.current = true
          const demoIds = pickRandomDemoClubIds(mappedClubs, demoTargetCountRef.current, {
            events: evts || [],
            links: lnks || [],
            hub,
            now: nowRef,
          })
          if (demoIds.length > 0) {
            setJoinedClubIds(demoIds)
          }
        }
      }
    }

    if (evts && evts.length > 0) {
      setRawEvents(evts)
      // Keep ALL valid past + upcoming events (2025+) for the Full Calendar view
      const validEvts = evts.filter(e => {
        if (String(e.id || '').startsWith('collab_evt_') || e.isCustom) return true
        const ts = new Date(e.start).getTime()
        return !Number.isNaN(ts) && ts >= calendarMinCutoffMs
      })
      const sortedEvts = [...validEvts].sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
      )
      setLiveSchedule(sortedEvts.map((e, i) => formatScheduleItem(e, i)))
    }

    if (anns && anns.length > 0) {
      setLiveAnnouncements(
        anns.map(a => {
          const src = a.source || 'instagram'
          const isDiscord = src === 'discord'
          const isStory = src === 'instagram_story'
          const isEmail = src === 'email'
          return {
            id: a.id,
            clubId: a.clubId || null,
            source: src,
            permalink: a.permalink || null,
            type: a.important
              ? 'Urgent'
              : isDiscord
                ? 'Discord'
                : isStory
                  ? 'IG Story'
                  : isEmail
                    ? 'Email'
                    : 'Announcement',
            color: a.important ? 'red' : isDiscord ? 'blue' : isStory ? 'purple' : 'yellow',
            time: a.postedAt ? new Date(a.postedAt).toLocaleDateString() : 'Just now',
            title: cleanText(`${a.clubName ? a.clubName + ': ' : ''}${a.title}`),
            description: cleanText(a.summary || ''),
            navTarget: 'clubs',
          }
        })
      )
    }

    if (lnks && lnks.length > 0) {
      setLiveLinks(
        lnks.map(l => ({
          id: l.id,
          clubId: l.clubId || null,
          clubName: l.clubName ? cleanText(l.clubName) : '',
          rawLabel: l.label ? cleanText(l.label) : '',
          kind: l.kind || 'website',
          postId: l.postId || null,
          title: cleanText(`${l.clubName ? l.clubName + ' — ' : ''}${l.label || l.kind || 'Link'}`),
          subtitle: l.url,
          url: l.url,
          category: KIND_CATEGORY_MAP[l.kind] || 'Resources',
          color: KIND_COLOR_MAP[l.kind] || 'blue',
          icon: KIND_ICON_MAP[l.kind] || 'Globe',
        }))
      )
    }

    if (dbStats) {
      setLiveStats([
        { label: 'My Clubs',        value: 0,                   color: 'blue',   icon: 'Heart',    navTarget: 'clubs' },
        { label: 'Upcoming Events', value: dbStats.events ?? 0, color: 'yellow', icon: 'Calendar', navTarget: 'calendar' },
        { label: 'Group Polls',     value: 1,                   color: 'green',  icon: 'Clock',    navTarget: 'availability' },
        { label: 'Shared Links',    value: dbStats.links ?? 0,  color: 'purple', icon: 'Link',     navTarget: 'links' },
      ])
    }
  }, [isDemo])

  useEffect(() => {
    loadBackendData()
  }, [loadBackendData])

  function handleNavigate(nextNav, options = {}) {
    if (nextNav === 'clubs') {
      setClubsInitialSection(options.section || null)
    } else {
      setClubsInitialSection(null)
    }
    if (nextNav === 'calendar') {
      setCalendarInitialView(options.view || null)
    } else {
      setCalendarInitialView(null)
    }
    setActiveNav(nextNav)
    if (nextNav === 'overview' || nextNav === 'settings') {
      setPageSubContext(null)
    }
    if (nextNav === 'availability' || nextNav === 'settings') {
      setSearchQuery('')
    }
  }

  const joinedClubSet = useMemo(
    () => new Set(joinedClubIds.map(String)),
    [joinedClubIds]
  )

  const effectiveClubs = useMemo(() => {
    const base = liveClubs && liveClubs.length > 0 ? liveClubs : clubsData
    return base.map(c => {
      const catId = categorizeClub(c)
      const catMeta = getClubCategoryMeta(catId)
      const isJoined = joinedClubSet.has(String(c.id))
      return {
        ...c,
        category: catId,
        categoryLabel: c.categoryLabel || catMeta.label,
        avatarBg: c.avatarBg || catMeta.gradient,
        joined: isJoined,
        members: (c.members || 0) + (isJoined ? 1 : 0),
      }
    })
  }, [liveClubs, clubsData, joinedClubSet])

  const joinedCount = joinedClubSet.size

  const effectiveSchedule = useMemo(() => {
    const base = liveSchedule && liveSchedule.length > 0 ? liveSchedule : fallbackSchedule
    const formattedLocal = localAddedEvents.map((e, i) => formatScheduleItem(e, i))
    const seen = new Set()
    const merged = []

    for (const item of [...formattedLocal, ...base]) {
      if (removedEventIds.has(item.id) || seen.has(item.id)) continue
      seen.add(item.id)
      merged.push(item)
    }
    return merged
  }, [liveSchedule, localAddedEvents, removedEventIds])

  // Strictly upcoming events (starting today / from current time onward — never 14 days ago!)
  const upcomingSchedule = useMemo(() => {
    const now = new Date()
    return effectiveSchedule
      .filter(ev => isEventUpcoming(ev, now))
      .sort((a, b) => {
        const aBooked = a.isBookedCollab ? 1 : 0
        const bBooked = b.isBookedCollab ? 1 : 0
        if (aBooked !== bBooked) return bBooked - aBooked
        return new Date(a.startIso || 0).getTime() - new Date(b.startIso || 0).getTime()
      })
  }, [effectiveSchedule])

  const personalizedSchedule = useMemo(() => {
    if (joinedClubSet.size === 0) return upcomingSchedule
    const matched = upcomingSchedule.filter(
      ev =>
        ev.isCustom ||
        ev.isBookedCollab ||
        (ev.clubId && joinedClubSet.has(String(ev.clubId)))
    )
    return matched.length > 0 ? matched : upcomingSchedule
  }, [upcomingSchedule, joinedClubSet])

  const personalizedAnnouncements = useMemo(() => {
    if (!liveAnnouncements || joinedClubSet.size === 0) return liveAnnouncements
    const matched = liveAnnouncements.filter(
      a => a.clubId && joinedClubSet.has(String(a.clubId))
    )
    return matched.length > 0 ? matched.slice(0, 8) : liveAnnouncements.slice(0, 8)
  }, [liveAnnouncements, joinedClubSet])

  const combinedRawEvents = useMemo(
    () =>
      [...localAddedEvents, ...rawEvents].filter(ev => !removedEventIds.has(ev.id)),
    [localAddedEvents, rawEvents, removedEventIds]
  )

  function toggleJoinClub(clubId) {
    const targetId = String(clubId)
    if (isDemo) {
      demoUserModifiedClubsRef.current = true
    }
    setJoinedClubIds(prev => {
      const exists = prev.some(id => String(id) === targetId)
      const next = exists
        ? prev.filter(id => String(id) !== targetId)
        : [...prev, targetId]

      if (isDemo) {
        return next
      }

      const emailKey = accountEmail ? `email:${accountEmail}` : null
      saveStoredJoinedClubIds([accountKey, emailKey], next)

      if (hasClerkKey && effectiveUser?.update) {
        effectiveUser
          .update({
            unsafeMetadata: {
              ...(effectiveUser.unsafeMetadata || {}),
              joinedClubIds: next,
            },
          })
          .catch(() => {})
      }
      if (accountEmail) {
        setDictKey(
          `user_clubs:${accountEmail}`,
          { clubIds: next, updatedAt: new Date().toISOString() },
          { namespace: 'user_prefs', source: 'joined_clubs' }
        ).catch(() => {})
      }
      return next
    })
  }

  function handleToggleRsvp(eventId, isGoing) {
    setRsvpMap(prev => {
      const next = { ...prev, [eventId]: isGoing }
      if (!isDemo) {
        try {
          localStorage.setItem(RSVP_STORAGE_KEY, JSON.stringify(next))
        } catch {
          // Ignore storage errors
        }
      }
      return next
    })
    showToast(isGoing ? 'Marked as Going!' : 'RSVP removed.', {
      type: isGoing ? 'success' : 'info',
    })
  }

  async function handleAddCalendarEvent(eventPayload) {
    const id = eventPayload.id || `custom_evt_${Date.now()}`
    if (isDemo) {
      setLocalAddedEvents(prev => [{ ...eventPayload, id, isCustom: true }, ...prev])
      return
    }
    const created = await createEvent({ ...eventPayload, id })
    if (created && created.id) {
      await loadBackendData()
    } else {
      setLocalAddedEvents(prev => [{ ...eventPayload, id, isCustom: true }, ...prev])
    }
  }

  async function handleDeleteCalendarEvent(eventId) {
    if (isDemo) {
      setRemovedEventIds(prev => new Set(prev).add(eventId))
      setLocalAddedEvents(prev => prev.filter(e => e.id !== eventId))
      showToast('Removed event from calendar.', { type: 'info' })
      return
    }
    const res = await deleteEvent(eventId)
    setRemovedEventIds(prev => new Set(prev).add(eventId))
    setLocalAddedEvents(prev => prev.filter(e => e.id !== eventId))
    if (res && res.deleted) {
      await loadBackendData()
    }
    showToast('Removed event from calendar.', { type: 'info' })
  }

  function handleAddLocalCollabEvent(ev) {
    setRemovedEventIds(prev => {
      const next = new Set(prev)
      next.delete(ev.id)
      return next
    })
    setLocalAddedEvents(prev => [ev, ...prev.filter(x => x.id !== ev.id)])
  }

  function handleRemoveLocalCollabEvent(eventId) {
    setRemovedEventIds(prev => new Set(prev).add(eventId))
    setLocalAddedEvents(prev => prev.filter(e => e.id !== eventId))
  }

  const baseLinksCount = useMemo(() => {
    if (!liveLinks) return linksCount
    if (joinedClubSet.size === 0) return liveLinks.length
    const matchedCount = liveLinks.filter(
      l => l.clubId && joinedClubSet.has(String(l.clubId))
    ).length
    return matchedCount > 0 ? matchedCount : liveLinks.length
  }, [liveLinks, linksCount, joinedClubSet])

  const totalLinksCount = baseLinksCount + localAddedLinks.length

  const effectiveStats = useMemo(() => {
    if (!liveStats) return null
    return liveStats.map(s => {
      if (s.label === 'My Clubs' || s.label === 'Active Clubs') {
        return { ...s, label: 'My Clubs', value: joinedCount }
      }
      if (s.label === 'Upcoming Events') {
        return { ...s, value: personalizedSchedule.length }
      }
      if (s.label === 'Shared Links') {
        return { ...s, value: totalLinksCount }
      }
      return s
    })
  }, [liveStats, joinedCount, personalizedSchedule.length, totalLinksCount])

  function handleAddLocalLink(linkObj) {
    setLocalAddedLinks(prev => [linkObj, ...prev])
    showToast('Shared resource added!')
  }

  function handleTogglePinOverride(linkId, nextPinned) {
    setPinnedLinkOverrides(prev => ({ ...prev, [linkId]: nextPinned }))
    showToast(nextPinned ? 'Pinned resource to top.' : 'Unpinned resource.', { type: 'info' })
  }

  function handleAddLocalClubPost(postObj) {
    setLocalClubPosts(prev => [postObj, ...prev])
  }

  function handleResetLocalData() {
    if (isDemo) {
      const freshCount = randomDemoClubCount()
      demoTargetCountRef.current = freshCount
      demoUserModifiedClubsRef.current = false
      const pool = liveClubs && liveClubs.length > 0 ? liveClubs : clubsData
      const freshDemoIds = pickRandomDemoClubIds(pool, freshCount, {
        events: rawEvents.length > 0 ? rawEvents : fallbackSchedule,
        links: liveLinks || fallbackLinks,
        hub: hubDict,
      })
      setJoinedClubIds(freshDemoIds)
      setRsvpMap({})
      setLocalAddedEvents([])
      setRemovedEventIds(new Set())
      setLocalAddedLinks([])
      setPinnedLinkOverrides({})
      setLocalClubPosts([])
      setResetGeneration(g => g + 1)
      showToast('Reset demo workspace with a fresh random sample of clubs.', { type: 'info' })
      return
    }

    const emailKey = accountEmail ? `email:${accountEmail}` : null
    try {
      localStorage.removeItem(RSVP_STORAGE_KEY)
      localStorage.removeItem('clubhub_availability_user_slots_v2')
      localStorage.removeItem('clubhub_custom_roster_v1')
      localStorage.removeItem(LOCAL_ADDED_EVENTS_KEY)
      localStorage.removeItem(REMOVED_EVENT_IDS_KEY)
      localStorage.removeItem(LOCAL_ADDED_LINKS_KEY)
      localStorage.removeItem(PINNED_LINK_OVERRIDES_KEY)
      localStorage.removeItem(LOCAL_CLUB_POSTS_KEY)
      localStorage.removeItem(CUSTOM_POLLS_STORAGE_KEY)
      saveStoredJoinedClubIds([accountKey, emailKey], [])
    } catch {
      // Ignore storage errors
    }
    setJoinedClubIds([])
    setRsvpMap({})
    setLocalAddedEvents([])
    setRemovedEventIds(new Set())
    setLocalAddedLinks([])
    setPinnedLinkOverrides({})
    setLocalClubPosts([])
    setResetGeneration(g => g + 1)
    showToast('Reset local customizations to clean defaults.', { type: 'info' })
  }

  const isCompactDensity = Boolean(userSettings?.compactCards)

  const userDisplayName =
    userSettings?.displayName?.trim() ||
    effectiveUser?.fullName ||
    effectiveUser?.primaryEmailAddress?.emailAddress?.split('@')[0] ||
    effectiveUser?.email?.split('@')[0] ||
    (isDemo ? 'Demo Guest' : 'Student')

  // ── Calendar Integration, Live Joined-Club Sync & Browser Tab Title ──
  const calSyncSettings = useMemo(
    () => normalizeCalendarSyncSettings(userSettings?.calendarSync),
    [userSettings?.calendarSync]
  )

  const [syncToken, setSyncToken] = useState(() => getOrCreateCalendarSyncToken(accountKey))
  const [feedState, setFeedState] = useState({
    mode: 'static',
    feedHttpUrl: '',
    feedWebcalUrl: '',
  })
  const [googleLiveMeta, setGoogleLiveMeta] = useState(() =>
    isDemo ? null : getStoredGoogleCalSyncMeta(accountKey)
  )
  const [googleSyncBusy, setGoogleSyncBusy] = useState(false)
  const [googleClientIdVersion, setGoogleClientIdVersion] = useState(0)
  const googleTokenRef = useRef(null)

  const hasGoogleClientId = useMemo(
    () => Boolean(getEffectiveGoogleClientId()),
    [googleClientIdVersion]
  )

  // Preload Google Identity Services SDK when a Client ID is configured so OAuth popups open synchronously without Safari popup-blocking
  useEffect(() => {
    if (hasGoogleClientId) {
      loadGoogleGsiSdk().catch(() => {})
    }
  }, [hasGoogleClientId])

  useEffect(() => {
    setSyncToken(getOrCreateCalendarSyncToken(accountKey))
    setGoogleLiveMeta(isDemo ? null : getStoredGoogleCalSyncMeta(accountKey))
    googleTokenRef.current = null
  }, [accountKey, isDemo])

  const joinedClubsList = useMemo(
    () => effectiveClubs.filter(c => Boolean(c.joined)),
    [effectiveClubs]
  )

  const goingEventIds = useMemo(
    () => Array.from(extractGoingEventIds(rsvpMap, effectiveSchedule)),
    [rsvpMap, effectiveSchedule]
  )

  const syncedCalendarEvents = useMemo(
    () =>
      filterEventsForCalendarSync(effectiveSchedule, {
        joinedClubIds,
        rsvpIds: goingEventIds,
        rsvpMap,
        settings: calSyncSettings,
      }),
    [effectiveSchedule, joinedClubIds, goingEventIds, rsvpMap, calSyncSettings]
  )

  const feedFallbackEvents = useMemo(
    () =>
      effectiveSchedule.map(ev => ({
        id: ev.id,
        clubId: ev.clubId || null,
        clubName: ev.club || 'ClubHub',
        title: ev.event || 'Club Event',
        start: ev.startIso,
        end: ev.endIso || null,
        allDay: Boolean(ev.allDay),
        location: ev.location || 'Campus / TBD',
        permalink: ev.permalink || null,
        isCustom: Boolean(ev.isCustom),
        isBookedCollab: Boolean(ev.isBookedCollab),
      })),
    [effectiveSchedule]
  )

  const flushCalendarFeedProfile = useCallback(
    async (overrideToken = null) => {
      const activeToken = overrideToken || syncToken
      if (!activeToken) return { ok: false, mode: 'static', feedHttpUrl: '', feedWebcalUrl: '' }
      const res = await syncCalendarFeedProfile(activeToken, {
        accountKey,
        displayName: userDisplayName,
        joinedClubIds,
        rsvpIds: goingEventIds,
        customEvents: localAddedEvents,
        fallbackEvents: feedFallbackEvents,
        removedEventIds: Array.from(removedEventIds),
        settings: calSyncSettings,
      })
      setFeedState({
        mode: res.mode || 'static',
        feedHttpUrl: res.feedHttpUrl || '',
        feedWebcalUrl: res.feedWebcalUrl || '',
      })
      return res
    },
    [
      syncToken,
      accountKey,
      userDisplayName,
      joinedClubIds,
      goingEventIds,
      localAddedEvents,
      feedFallbackEvents,
      removedEventIds,
      calSyncSettings,
    ]
  )

  // Keep the live webcal:// / .ics subscription feed automatically synced whenever joined clubs, RSVPs, or settings change
  useEffect(() => {
    flushCalendarFeedProfile()
  }, [flushCalendarFeedProfile])

  const handleDownloadFilteredIcs = useCallback(() => {
    const ics = buildIcsCalendar(syncedCalendarEvents, {
      settings: calSyncSettings,
      rsvpIds: goingEventIds,
      rsvpMap,
      joinedCount,
    })
    downloadIcsFile(ics, 'clubhub-calendar.ics')
    showToast(
      `Downloaded clubhub-calendar.ics (${syncedCalendarEvents.length} ${
        syncedCalendarEvents.length === 1 ? 'event' : 'events'
      })!`
    )
  }, [syncedCalendarEvents, calSyncSettings, goingEventIds, rsvpMap, joinedCount, showToast])

  const handleSubscribeApple = useCallback(async () => {
    const res = await flushCalendarFeedProfile()
    const webcalUrl = res.feedWebcalUrl || feedState.feedWebcalUrl
    if (webcalUrl && typeof window !== 'undefined') {
      window.location.assign(webcalUrl)
      showToast(
        `Opening Apple Calendar live subscription (${syncedCalendarEvents.length} ${
          syncedCalendarEvents.length === 1 ? 'event' : 'events'
        }) — auto-updates with your joined clubs!`,
        {
          actionLabel: 'Download .ics file',
          onAction: handleDownloadFilteredIcs,
        }
      )
      return
    }
    handleDownloadFilteredIcs()
  }, [
    flushCalendarFeedProfile,
    feedState.feedWebcalUrl,
    syncedCalendarEvents.length,
    showToast,
    handleDownloadFilteredIcs,
  ])

  const handleIntegrateGoogle = useCallback(
    async ({ forceImport = false } = {}) => {
      let webcalUrl = feedState.feedWebcalUrl
      let httpUrl = feedState.feedHttpUrl

      // Only await network feed flush when a live feed server is active; in static mode stay synchronous so Safari never blocks window.open()
      if (!forceImport && feedState.mode !== 'static') {
        const res = await flushCalendarFeedProfile()
        webcalUrl = res.feedWebcalUrl || webcalUrl
        httpUrl = res.feedHttpUrl || httpUrl
      }

      if (!forceImport && webcalUrl && !isLocalhostUrl(httpUrl || webcalUrl)) {
        const gcalSubUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`
        window.open(gcalSubUrl, '_blank', 'noopener,noreferrer')
        showToast('Opening Google Calendar live subscription!')
        return
      }

      const ics = buildIcsCalendar(syncedCalendarEvents, {
        settings: calSyncSettings,
        rsvpIds: goingEventIds,
        rsvpMap,
        joinedCount,
      })
      downloadIcsFile(ics, 'clubhub-calendar.ics')
      window.open(
        'https://calendar.google.com/calendar/u/0/r/settings/export',
        '_blank',
        'noopener,noreferrer'
      )
      showToast(
        `Exported ${syncedCalendarEvents.length} synced ${
          syncedCalendarEvents.length === 1 ? 'event' : 'events'
        } — drop clubhub-calendar.ics into Google Calendar Import!`
      )
    },
    [
      flushCalendarFeedProfile,
      feedState.mode,
      feedState.feedWebcalUrl,
      feedState.feedHttpUrl,
      syncedCalendarEvents,
      calSyncSettings,
      goingEventIds,
      rsvpMap,
      joinedCount,
      showToast,
    ]
  )

  const handleConnectOrSyncGoogleLive = useCallback(
    async ({ silent = false } = {}) => {
      const clientId = getEffectiveGoogleClientId()
      if (!clientId) {
        if (!silent) handleIntegrateGoogle()
        return
      }
      setGoogleSyncBusy(true)
      try {
        let tokenData = googleTokenRef.current
        if (!tokenData || !tokenData.accessToken || Date.now() >= tokenData.expiresAt) {
          if (silent) {
            setGoogleSyncBusy(false)
            return
          }
          tokenData = await requestGoogleCalendarAccessToken(clientId)
          googleTokenRef.current = tokenData
        }

        const storedMeta = getStoredGoogleCalSyncMeta(accountKey)
        const syncRes = await pushEventsToGoogleCalendar({
          accessToken: tokenData.accessToken,
          events: syncedCalendarEvents,
          settings: calSyncSettings,
          joinedCount,
          storedCalendarId: storedMeta?.calendarId || null,
        })

        const nextMeta = {
          connected: true,
          calendarId: syncRes.calendarId,
          calendarTitle: syncRes.calendarTitle,
          lastSyncedAt: syncRes.syncedAt,
          syncedCount: syncRes.syncedCount,
        }
        saveStoredGoogleCalSyncMeta(accountKey, nextMeta)
        setGoogleLiveMeta(nextMeta)

        if (!silent) {
          showToast(
            `Synced ${syncRes.syncedCount} ${
              syncRes.syncedCount === 1 ? 'event' : 'events'
            } to Google Calendar ("${syncRes.calendarTitle}")!`,
            {
              actionLabel: 'Open Google Calendar',
              onAction: () =>
                window.open('https://calendar.google.com', '_blank', 'noopener,noreferrer'),
            }
          )
        }
      } catch (err) {
        const msg = err?.message || ''
        const wasDismissed =
          err?.code === 'popup_closed' || /popup_closed|closed by user/i.test(msg)
        if (!silent && !wasDismissed) {
          showToast(`Google Calendar sync failed: ${msg || 'Authorization cancelled'}`, {
            type: 'error',
          })
        }
      } finally {
        setGoogleSyncBusy(false)
      }
    },
    [
      accountKey,
      syncedCalendarEvents,
      calSyncSettings,
      joinedCount,
      handleIntegrateGoogle,
      showToast,
    ]
  )

  // Auto-push club membership, RSVP, and setting changes to connected Google Calendar in the background
  useEffect(() => {
    if (
      !googleLiveMeta?.connected ||
      !calSyncSettings.autoSync ||
      !googleTokenRef.current?.accessToken
    ) {
      return
    }
    const timer = setTimeout(() => {
      handleConnectOrSyncGoogleLive({ silent: true })
    }, 750)
    return () => clearTimeout(timer)
  }, [
    googleLiveMeta?.connected,
    calSyncSettings.autoSync,
    syncedCalendarEvents,
    handleConnectOrSyncGoogleLive,
  ])

  const handleDisconnectGoogleLive = useCallback(() => {
    googleTokenRef.current = null
    clearStoredGoogleCalSyncMeta(accountKey)
    setGoogleLiveMeta(null)
    showToast('Disconnected live Google Calendar auto-sync.', { type: 'info' })
  }, [accountKey, showToast])

  const handleSaveGoogleClientId = useCallback(nextId => {
    saveGoogleClientId(nextId)
    setGoogleClientIdVersion(v => v + 1)
  }, [])

  const handleRegenerateFeedToken = useCallback(async () => {
    const nextTok = getOrCreateCalendarSyncToken(accountKey, true)
    setSyncToken(nextTok)
    await flushCalendarFeedProfile(nextTok)
    showToast('Generated a new private calendar subscription URL.', { type: 'info' })
  }, [accountKey, flushCalendarFeedProfile, showToast])

  const handleQuickGoogleClick = useCallback(() => {
    if (googleLiveMeta?.connected || hasGoogleClientId) {
      handleConnectOrSyncGoogleLive()
      return
    }
    handleIntegrateGoogle()
  }, [
    googleLiveMeta?.connected,
    hasGoogleClientId,
    handleConnectOrSyncGoogleLive,
    handleIntegrateGoogle,
  ])

  const calendarIntegration = useMemo(
    () => ({
      syncSettings: calSyncSettings,
      syncedEvents: syncedCalendarEvents,
      joinedClubs: joinedClubsList,
      feedWebcalUrl: feedState.feedWebcalUrl,
      feedHttpUrl: feedState.feedHttpUrl,
      feedMode: feedState.mode,
      onSubscribeApple: handleSubscribeApple,
      onIntegrateGoogle: handleIntegrateGoogle,
      onQuickGoogleClick: handleQuickGoogleClick,
      onConnectGoogleLive: handleConnectOrSyncGoogleLive,
      onDisconnectGoogleLive: handleDisconnectGoogleLive,
      onDownloadIcs: handleDownloadFilteredIcs,
      onRegenerateFeedToken: handleRegenerateFeedToken,
      onBrowseClubs: () => handleNavigate('clubs', { section: 'discover' }),
      googleLiveMeta,
      googleSyncBusy,
      hasGoogleClientId,
      onSaveGoogleClientId: handleSaveGoogleClientId,
    }),
    [
      calSyncSettings,
      syncedCalendarEvents,
      joinedClubsList,
      feedState.feedWebcalUrl,
      feedState.feedHttpUrl,
      feedState.mode,
      handleSubscribeApple,
      handleIntegrateGoogle,
      handleQuickGoogleClick,
      googleLiveMeta,
      hasGoogleClientId,
      handleConnectOrSyncGoogleLive,
      handleDisconnectGoogleLive,
      handleDownloadFilteredIcs,
      handleRegenerateFeedToken,
      googleSyncBusy,
      handleSaveGoogleClientId,
    ]
  )

  const visibleOverviewUpcomingCount = useMemo(() => {
    if (!calSyncSettings.inAppRsvpOnly) return personalizedSchedule.length
    return personalizedSchedule.filter(ev =>
      rsvpMap[ev.id] !== undefined ? Boolean(rsvpMap[ev.id]) : Boolean(ev.rsvp)
    ).length
  }, [calSyncSettings.inAppRsvpOnly, personalizedSchedule, rsvpMap])

  // Synchronize browser tab page title with the live state of ClubHub
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.title = buildDashboardPageTitle({
      activeNav,
      subContext: pageSubContext,
      searchQuery,
      upcomingCount: visibleOverviewUpcomingCount,
      joinedCount,
      inAppRsvpOnly: calSyncSettings.inAppRsvpOnly,
    })
  }, [
    activeNav,
    pageSubContext,
    searchQuery,
    visibleOverviewUpcomingCount,
    joinedCount,
    calSyncSettings.inAppRsvpOnly,
  ])

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Floating Non-Shifting Toast Notifications */}
      <ToastViewport toast={toast} onDismiss={() => setToast(null)} />

      {/* Fixed Left Sidebar (Desktop) & Bottom Bar (Mobile) */}
      <Sidebar
        activeNav={activeNav}
        onNav={handleNavigate}
        dark={dark}
        onToggleDark={toggleDark}
        user={effectiveUser}
        userSettings={userSettings}
        isDemo={isDemo}
        onExitDemo={onExitDemo}
        onSignOut={onSignOut}
      />

      {/* Main Content Area (Offset by Fixed Sidebar on Desktop) */}
      <main className="w-full min-w-0 lg:pl-[252px]">
        <div
          className={`px-3.5 sm:px-6 lg:px-8 ${
            isCompactDensity ? 'pt-3 pb-24 sm:py-5 lg:pb-16' : 'pt-3.5 pb-28 sm:py-7 lg:pb-20'
          }`}
        >
          <Header
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activeNav={activeNav}
            onNav={handleNavigate}
            dark={dark}
            onToggleDark={toggleDark}
            user={effectiveUser}
            userSettings={userSettings}
            isDemo={isDemo}
            onExitDemo={onExitDemo}
            onSignOut={onSignOut}
            announcements={personalizedAnnouncements}
            upcomingCount={visibleOverviewUpcomingCount}
          />

          {/* ── 1. OVERVIEW ── */}
          {activeNav === 'overview' && (
            <div className={isCompactDensity ? 'space-y-3.5' : 'space-y-5 sm:space-y-6'}>
              <StatCards
                items={effectiveStats}
                joinedCount={joinedCount}
                eventsCount={visibleOverviewUpcomingCount}
                linksCount={totalLinksCount}
                userSettings={userSettings}
                onNav={target =>
                  target === 'clubs' && joinedCount === 0
                    ? handleNavigate('clubs', { section: 'discover' })
                    : handleNavigate(target)
                }
              />

              <div
                className={`grid grid-cols-1 xl:grid-cols-[5fr_3fr] ${
                  isCompactDensity ? 'gap-3 sm:gap-3.5' : 'gap-4 sm:gap-5'
                }`}
              >
                <CalendarView
                  compact={true}
                  items={personalizedSchedule}
                  clubs={effectiveClubs}
                  userSettings={userSettings}
                  onUpdateSettings={onUpdateSettings}
                  calendarIntegration={calendarIntegration}
                  onPageContextChange={setPageSubContext}
                  searchQuery={searchQuery}
                  rsvpMap={rsvpMap}
                  onToggleRsvp={handleToggleRsvp}
                  onDeleteEvent={handleDeleteCalendarEvent}
                  onOpenCalendar={() => handleNavigate('calendar', { view: 'month' })}
                  onNotify={showToast}
                />
                <Announcements
                  items={personalizedAnnouncements}
                  userSettings={userSettings}
                  searchQuery={searchQuery}
                  onNav={handleNavigate}
                />
              </div>

              {/* Shortcut Card to Separated Group Availability Tool */}
              <Card
                delay={4}
                onClick={() => handleNavigate('availability')}
                style={{
                  borderLeftWidth: '3.5px',
                  borderLeftColor: 'var(--green)',
                }}
                className={`content-tile content-tile-interactive ${
                  isCompactDensity ? 'p-3 sm:p-3.5 gap-2.5' : 'p-4 sm:p-5 gap-3.5'
                } flex flex-col sm:flex-row sm:items-center justify-between`}
              >
                <div className={`flex items-center ${isCompactDensity ? 'gap-2.5' : 'gap-3.5'} min-w-0`}>
                  <IconBadge color="green" size={isCompactDensity ? 34 : 42} radius={isCompactDensity ? 10 : 13}>
                    <Clock size={isCompactDensity ? 17 : 21} />
                  </IconBadge>
                  <div className="min-w-0">
                    <div className="text-sm sm:text-base font-bold text-[var(--text)]">
                      Coordinate Group Availability
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      Click or drag when you&apos;re free — group overlap updates automatically and schedules straight onto your calendar.
                    </p>
                  </div>
                </div>

                <span
                  className={`inline-flex items-center gap-1.5 ${
                    isCompactDensity ? 'px-3 min-h-[32px]' : 'px-4 min-h-[38px]'
                  } rounded-xl bg-[var(--blue-light)] text-[var(--blue-ink)] text-xs font-semibold shrink-0 self-start sm:self-auto`}
                >
                  <span>Open Availability</span>
                  <ArrowRight size={14} />
                </span>
              </Card>

              <ClubsHub
                compact={true}
                user={effectiveUser}
                isDemo={isDemo}
                items={effectiveClubs}
                clubsData={clubsData}
                hubDict={hubDict}
                userSettings={userSettings}
                onToggleJoin={toggleJoinClub}
                searchQuery={searchQuery}
                onOpenClubs={opts => handleNavigate('clubs', opts)}
                onNotify={showToast}
              />
            </div>
          )}

          {/* ── 2. CALENDAR ── */}
          {activeNav === 'calendar' && (
            <CalendarView
              key={`cal_${calendarInitialView || userSettings?.defaultCalendarView}_${resetGeneration}`}
              items={effectiveSchedule}
              clubs={effectiveClubs}
              initialView={calendarInitialView}
              userSettings={userSettings}
              onUpdateSettings={onUpdateSettings}
              calendarIntegration={calendarIntegration}
              onPageContextChange={setPageSubContext}
              searchQuery={searchQuery}
              rsvpMap={rsvpMap}
              onToggleRsvp={handleToggleRsvp}
              onAddEvent={handleAddCalendarEvent}
              onDeleteEvent={handleDeleteCalendarEvent}
              onNotify={showToast}
            />
          )}

          {/* ── 3. AVAILABILITY ── */}
          {activeNav === 'availability' && (
            <AvailabilityView
              key={`avail_${resetGeneration}`}
              user={effectiveUser}
              accountKey={accountKey}
              isDemo={isDemo}
              userSettings={userSettings}
              events={combinedRawEvents}
              onEventBooked={loadBackendData}
              onAddLocalEvent={handleAddLocalCollabEvent}
              onRemoveLocalEvent={handleRemoveLocalCollabEvent}
              onOpenCalendar={() => handleNavigate('calendar')}
              onOpenSettings={() => handleNavigate('settings')}
              onPageContextChange={setPageSubContext}
              onNotify={showToast}
            />
          )}

          {/* ── 4. CLUBS & COMMUNITY ── */}
          {activeNav === 'clubs' && (
            <ClubsHub
              key={`clubs_${resetGeneration}_${clubsInitialSection || 'auto'}`}
              user={effectiveUser}
              accountKey={accountKey}
              isDemo={isDemo}
              items={effectiveClubs}
              clubsData={clubsData}
              hubDict={hubDict}
              events={effectiveSchedule}
              calendarIntegration={calendarIntegration}
              initialSection={clubsInitialSection}
              userSettings={userSettings}
              onToggleJoin={toggleJoinClub}
              searchQuery={searchQuery}
              onRefresh={loadBackendData}
              onOpenSettings={() => handleNavigate('settings')}
              localPosts={localClubPosts}
              onAddLocalPost={handleAddLocalClubPost}
              onPageContextChange={setPageSubContext}
              onNotify={showToast}
            />
          )}

          {/* ── 5. RESOURCES ── */}
          {activeNav === 'links' && (
            <LinksResources
              isDemo={isDemo}
              items={liveLinks}
              clubs={effectiveClubs}
              userSettings={userSettings}
              searchQuery={searchQuery}
              onRefresh={loadBackendData}
              localAdded={localAddedLinks}
              onAddLocalLink={handleAddLocalLink}
              pinnedOverrides={pinnedLinkOverrides}
              onTogglePinOverride={handleTogglePinOverride}
              onPageContextChange={setPageSubContext}
              onNotify={showToast}
            />
          )}

          {/* ── 6. USER SETTINGS ── */}
          {activeNav === 'settings' && (
            <SettingsView
              user={effectiveUser}
              accountKey={accountKey}
              isDemo={isDemo}
              hasClerkKey={hasClerkKey}
              userSettings={userSettings}
              onUpdateSettings={onUpdateSettings}
              onSetThemeMode={onSetExplicitThemeMode}
              clubs={effectiveClubs}
              events={effectiveSchedule}
              calendarIntegration={calendarIntegration}
              onRefresh={loadBackendData}
              onResetLocalData={handleResetLocalData}
              onSignOut={onSignOut}
              onExitDemo={onExitDemo}
              onNotify={showToast}
            />
          )}
        </div>
      </main>
    </div>
  )
}

function resolveInitialThemeMode() {
  const storedLocal = getInitialStoredUser()
  const map = getAccountThemeMap()

  if (storedLocal?.email) {
    const emailKey = `email:${storedLocal.email.toLowerCase()}`
    if (isValidThemeMode(storedLocal.themeMode)) return storedLocal.themeMode
    if (isValidThemeMode(map[emailKey])) return map[emailKey]
  }

  try {
    const lastAccount = localStorage.getItem(LAST_ACTIVE_ACCOUNT_KEY)
    if (lastAccount && isValidThemeMode(map[lastAccount])) {
      return map[lastAccount]
    }
  } catch {
    // Ignore storage errors
  }

  try {
    const rawSettings = localStorage.getItem(USER_SETTINGS_STORAGE_KEY)
    const parsedSettings = rawSettings ? JSON.parse(rawSettings) : null
    if (isValidThemeMode(parsedSettings?.themeMode)) {
      return parsedSettings.themeMode
    }
  } catch {
    // Ignore storage errors
  }

  return getGuestThemeMode()
}

function getInitialTheme() {
  return resolveDarkFromThemeMode(resolveInitialThemeMode())
}

function useSystemThemeListener(themeMode, setDark) {
  useEffect(() => {
    if (themeMode !== 'system' || typeof window === 'undefined' || !window.matchMedia) {
      return
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const syncFromSystem = () => {
      setDark(Boolean(mq.matches))
    }
    const onChange = e => {
      setDark(Boolean(e.matches))
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncFromSystem()
      }
    }

    syncFromSystem()
    document.addEventListener('visibilitychange', onVisibilityChange)

    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange)
      return () => {
        mq.removeEventListener('change', onChange)
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
    }
    if (typeof mq.addListener === 'function') {
      mq.addListener(onChange)
      return () => {
        mq.removeListener(onChange)
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
    }
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [themeMode, setDark])
}

function ClerkAppWrapper({
  dark,
  setDark,
  userSettings,
  onUpdateSettings,
  localUser,
  onLocalSignIn,
  onLocalSignOut,
  onUpdateLocalUserTheme,
}) {
  const { isLoaded, isSignedIn, user } = useUser()
  const { signOut } = useClerk()
  const [demoMode, setDemoMode] = useState(false)
  const [demoSession, setDemoSession] = useState(0)
  const [demoSettings, setDemoSettings] = useState(() =>
    createDemoUserSettings(userSettings.themeMode)
  )
  const [loadTimedOut, setLoadTimedOut] = useState(false)
  const syncedAccountRef = useRef(null)

  useSystemThemeListener(
    demoMode ? demoSettings.themeMode : userSettings.themeMode,
    setDark
  )

  const handleEnterDemo = useCallback(() => {
    setDemoSettings(createDemoUserSettings(userSettings.themeMode))
    setDemoSession(s => s + 1)
    setDemoMode(true)
  }, [userSettings.themeMode])

  const handleExitDemo = useCallback(() => {
    setDemoMode(false)
    setDark(resolveDarkFromThemeMode(userSettings.themeMode))
  }, [userSettings.themeMode, setDark])

  const handleUpdateDemoSettings = useCallback(patch => {
    setDemoSettings(prev => ({
      ...prev,
      ...patch,
      channels: patch.channels ? { ...prev.channels, ...patch.channels } : prev.channels,
      calendarSync: patch.calendarSync
        ? normalizeCalendarSyncSettings({ ...prev.calendarSync, ...patch.calendarSync })
        : prev.calendarSync,
    }))
  }, [])

  const isOAuthCallback =
    typeof window !== 'undefined' &&
    (window.location.search.includes('sso-callback') ||
      window.location.hash.includes('sso-callback') ||
      window.location.search.includes('__clerk_') ||
      window.location.hash.includes('__clerk_'))

  useEffect(() => {
    if (isLoaded) {
      setLoadTimedOut(false)
      return
    }
    const timeoutMs = isOAuthCallback ? 8000 : 3500
    const timer = setTimeout(() => setLoadTimedOut(true), timeoutMs)
    return () => clearTimeout(timer)
  }, [isLoaded, isOAuthCallback])

  useEffect(() => {
    if (isSignedIn && user && localUser) {
      onLocalSignOut({ silent: true })
    }
  }, [isSignedIn, user, localUser, onLocalSignOut])

  const [oauthTimedOutNotice, setOauthTimedOutNotice] = useState('')

  useEffect(() => {
    if (isSignedIn && user && isOAuthCallback && typeof window !== 'undefined') {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [isSignedIn, user, isOAuthCallback])

  useEffect(() => {
    if (isOAuthCallback && !isSignedIn && loadTimedOut && typeof window !== 'undefined') {
      window.history.replaceState({}, '', window.location.pathname)
      setOauthTimedOutNotice('Google Sign-In timed out or was interrupted. Please try again.')
    }
  }, [isOAuthCallback, isSignedIn, loadTimedOut])

  const clerkEmail = user?.primaryEmailAddress?.emailAddress?.toLowerCase() || ''
  const localEmail = localUser?.email?.toLowerCase() || ''
  const activeAccountKey =
    isSignedIn && user
      ? `clerk:${user.id}`
      : localUser && localEmail
        ? `email:${localEmail}`
        : 'guest'

  const applyAccountThemeMode = useCallback(
    mode => {
      const normalized = normalizeThemeMode(mode, 'system')
      onUpdateSettings({ themeMode: normalized })
      setDark(resolveDarkFromThemeMode(normalized))
    },
    [onUpdateSettings, setDark]
  )

  // Sync theme mode automatically whenever the signed-in account changes (without page-load flash!)
  useEffect(() => {
    if (activeAccountKey === 'guest') {
      if (!isLoaded && !loadTimedOut) return // Never overwrite theme before Clerk finishes loading
      if (syncedAccountRef.current === 'guest') return
      const wasSignedIn = Boolean(
        syncedAccountRef.current && syncedAccountRef.current !== 'guest'
      )
      syncedAccountRef.current = 'guest'
      try {
        localStorage.removeItem(LAST_ACTIVE_ACCOUNT_KEY)
      } catch {
        // Ignore storage errors
      }
      if (wasSignedIn) {
        applyAccountThemeMode(getGuestThemeMode())
      } else {
        setDark(resolveDarkFromThemeMode(userSettings.themeMode))
      }
      return
    }

    if (syncedAccountRef.current === activeAccountKey) return
    const switchedFromAnotherAccount = Boolean(
      syncedAccountRef.current &&
        syncedAccountRef.current !== 'guest' &&
        syncedAccountRef.current !== activeAccountKey
    )
    syncedAccountRef.current = activeAccountKey

    try {
      localStorage.setItem(LAST_ACTIVE_ACCOUNT_KEY, activeAccountKey)
    } catch {
      // Ignore storage errors
    }

    const map = getAccountThemeMap()

    if (isSignedIn && user) {
      const clerkKey = `clerk:${user.id}`
      const emailKey = clerkEmail ? `email:${clerkEmail}` : null
      const metaMode = user.unsafeMetadata?.themeMode

      const localStoredMode = isValidThemeMode(map[clerkKey])
        ? map[clerkKey]
        : emailKey && isValidThemeMode(map[emailKey])
          ? map[emailKey]
          : undefined

      if (localStoredMode) {
        applyAccountThemeMode(localStoredMode)
        saveAccountThemeForKeys([clerkKey, emailKey], localStoredMode)
        if (metaMode !== localStoredMode) {
          user
            .update({
              unsafeMetadata: {
                ...(user.unsafeMetadata || {}),
                themeMode: localStoredMode,
              },
            })
            .catch(() => {})
        }
        return
      }

      if (isValidThemeMode(metaMode)) {
        applyAccountThemeMode(metaMode)
        saveAccountThemeForKeys([clerkKey, emailKey], metaMode)
        return
      }

      if (switchedFromAnotherAccount) {
        applyAccountThemeMode('system')
      }

      if (clerkEmail) {
        let cancelled = false
        getDictKey(`user_theme:${clerkEmail}`).then(entry => {
          if (cancelled || isValidThemeMode(getAccountThemeMap()[clerkKey])) return
          const remoteMode = entry?.value?.themeMode
          if (isValidThemeMode(remoteMode)) {
            applyAccountThemeMode(remoteMode)
            saveAccountThemeForKeys([clerkKey, emailKey], remoteMode)
            user
              .update({
                unsafeMetadata: {
                  ...(user.unsafeMetadata || {}),
                  themeMode: remoteMode,
                },
              })
              .catch(() => {})
          }
        })
        return () => {
          cancelled = true
        }
      }
      return
    }

    if (localUser && localEmail) {
      const emailKey = `email:${localEmail}`
      if (isValidThemeMode(localUser.themeMode)) {
        applyAccountThemeMode(localUser.themeMode)
        saveAccountThemeForKeys([emailKey], localUser.themeMode)
        return
      }
      if (isValidThemeMode(map[emailKey])) {
        applyAccountThemeMode(map[emailKey])
        return
      }
      if (switchedFromAnotherAccount) {
        applyAccountThemeMode('system')
      }
      let cancelled = false
      getDictKey(`user_theme:${localEmail}`).then(entry => {
        if (cancelled || isValidThemeMode(getAccountThemeMap()[emailKey])) return
        const remoteMode = entry?.value?.themeMode
        if (isValidThemeMode(remoteMode)) {
          applyAccountThemeMode(remoteMode)
          saveAccountThemeForKeys([emailKey], remoteMode)
        }
      })
      return () => {
        cancelled = true
      }
    }
  }, [
    activeAccountKey,
    isLoaded,
    loadTimedOut,
    isSignedIn,
    user,
    clerkEmail,
    localUser,
    localEmail,
    userSettings.themeMode,
    applyAccountThemeMode,
    setDark,
  ])

  function persistThemeMode(mode) {
    const normalized = normalizeThemeMode(mode, 'system')
    onUpdateSettings({ themeMode: normalized })
    setDark(resolveDarkFromThemeMode(normalized))

    if (isSignedIn && user) {
      const clerkKey = `clerk:${user.id}`
      const emailKey = clerkEmail ? `email:${clerkEmail}` : null
      try {
        localStorage.setItem(LAST_ACTIVE_ACCOUNT_KEY, clerkKey)
      } catch {
        // Ignore storage errors
      }
      saveAccountThemeForKeys([clerkKey, emailKey], normalized)
      user
        .update({
          unsafeMetadata: {
            ...(user.unsafeMetadata || {}),
            themeMode: normalized,
            darkMode: normalized === 'dark' ? true : normalized === 'light' ? false : null,
          },
        })
        .catch(() => {})
      if (clerkEmail) {
        persistBackendAccountTheme(clerkEmail, normalized)
      }
      return
    }

    if (localUser && localEmail) {
      onUpdateLocalUserTheme(normalized)
      return
    }

    saveGuestThemeMode(normalized)
  }

  function handleToggleDark() {
    persistThemeMode(dark ? 'light' : 'dark')
  }

  function handleSetExplicitThemeMode(mode) {
    persistThemeMode(mode)
  }

  const baseUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : '/'

  async function handleClerkSignOut() {
    try {
      localStorage.removeItem(LAST_ACTIVE_ACCOUNT_KEY)
    } catch {
      // Ignore storage errors
    }
    try {
      await signOut({ redirectUrl: baseUrl })
    } catch {
      // Ignore Clerk signOut fallback errors
    }
  }

  useEffect(() => {
    if (typeof document === 'undefined') return
    if (isOAuthCallback && !isSignedIn && !loadTimedOut) {
      document.title = 'Completing Sign-In · ClubHub'
    } else if (!isSignedIn && !localUser && !isLoaded && !loadTimedOut) {
      document.title = 'Loading… · ClubHub'
    }
  }, [isOAuthCallback, isSignedIn, localUser, isLoaded, loadTimedOut])

  if (isOAuthCallback && !isSignedIn && !loadTimedOut) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg)] text-[var(--text)] gap-3">
        <div className="w-10 h-10 border-3 border-[var(--blue)] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold text-[var(--text-muted)]">
          Completing Google Sign-In…
        </span>
        <div id="clerk-captcha" />
        <AuthenticateWithRedirectCallback
          signInForceRedirectUrl={baseUrl}
          signUpForceRedirectUrl={baseUrl}
          signInFallbackRedirectUrl={baseUrl}
          signUpFallbackRedirectUrl={baseUrl}
          continueSignUpUrl={`${baseUrl}?sso-continue=1`}
        />
      </div>
    )
  }

  if (isSignedIn && user) {
    return (
      <MainDashboard
        dark={dark}
        toggleDark={handleToggleDark}
        onSetExplicitThemeMode={handleSetExplicitThemeMode}
        userSettings={userSettings}
        onUpdateSettings={onUpdateSettings}
        user={user}
        isDemo={false}
        onSignOut={handleClerkSignOut}
        hasClerkKey={true}
      />
    )
  }

  if (localUser) {
    return (
      <MainDashboard
        dark={dark}
        toggleDark={handleToggleDark}
        onSetExplicitThemeMode={handleSetExplicitThemeMode}
        userSettings={userSettings}
        onUpdateSettings={onUpdateSettings}
        user={localUser}
        isDemo={false}
        onSignOut={onLocalSignOut}
        hasClerkKey={false}
      />
    )
  }

  if (!isLoaded && !loadTimedOut) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg)] text-[var(--text)] gap-3">
        <div className="w-10 h-10 border-3 border-[var(--blue)] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold text-[var(--text-muted)]">Loading ClubHub…</span>
      </div>
    )
  }

  if (demoMode) {
    return (
      <MainDashboard
        key={`demo_clerk_${demoSession}`}
        dark={dark}
        toggleDark={() => {
          const next = !dark
          handleUpdateDemoSettings({ themeMode: next ? 'dark' : 'light' })
          setDark(next)
        }}
        onSetExplicitThemeMode={mode => {
          const normalized = normalizeThemeMode(mode, 'system')
          handleUpdateDemoSettings({ themeMode: normalized })
          setDark(resolveDarkFromThemeMode(normalized))
        }}
        userSettings={demoSettings}
        onUpdateSettings={handleUpdateDemoSettings}
        user={null}
        isDemo={true}
        onExitDemo={handleExitDemo}
        hasClerkKey={true}
      />
    )
  }

  return (
    <SignInPage
      dark={dark}
      onToggleDark={handleToggleDark}
      hasPublishableKey={true}
      initialError={oauthTimedOutNotice}
      onEnterDemo={handleEnterDemo}
      onLocalSignIn={onLocalSignIn}
    />
  )
}

function FallbackApp({
  dark,
  setDark,
  userSettings,
  onUpdateSettings,
  localUser,
  onLocalSignIn,
  onLocalSignOut,
  onUpdateLocalUserTheme,
}) {
  const [demoMode, setDemoMode] = useState(false)
  const [demoSession, setDemoSession] = useState(0)
  const [demoSettings, setDemoSettings] = useState(() =>
    createDemoUserSettings(userSettings.themeMode)
  )
  const syncedAccountRef = useRef(null)
  const localEmail = localUser?.email?.toLowerCase() || ''
  const activeAccountKey = localUser && localEmail ? `email:${localEmail}` : 'guest'

  useSystemThemeListener(
    demoMode ? demoSettings.themeMode : userSettings.themeMode,
    setDark
  )

  const handleEnterDemo = useCallback(() => {
    setDemoSettings(createDemoUserSettings(userSettings.themeMode))
    setDemoSession(s => s + 1)
    setDemoMode(true)
  }, [userSettings.themeMode])

  const handleExitDemo = useCallback(() => {
    setDemoMode(false)
    setDark(resolveDarkFromThemeMode(userSettings.themeMode))
  }, [userSettings.themeMode, setDark])

  const handleUpdateDemoSettings = useCallback(patch => {
    setDemoSettings(prev => ({
      ...prev,
      ...patch,
      channels: patch.channels ? { ...prev.channels, ...patch.channels } : prev.channels,
      calendarSync: patch.calendarSync
        ? normalizeCalendarSyncSettings({ ...prev.calendarSync, ...patch.calendarSync })
        : prev.calendarSync,
    }))
  }, [])

  const applyAccountThemeMode = useCallback(
    mode => {
      const normalized = normalizeThemeMode(mode, 'system')
      onUpdateSettings({ themeMode: normalized })
      setDark(resolveDarkFromThemeMode(normalized))
    },
    [onUpdateSettings, setDark]
  )

  useEffect(() => {
    if (syncedAccountRef.current === activeAccountKey) return
    const prevAccount = syncedAccountRef.current
    syncedAccountRef.current = activeAccountKey

    if (activeAccountKey === 'guest') {
      if (prevAccount && prevAccount !== 'guest') {
        applyAccountThemeMode(getGuestThemeMode())
      } else {
        setDark(resolveDarkFromThemeMode(userSettings.themeMode))
      }
      return
    }

    const map = getAccountThemeMap()
    const emailKey = `email:${localEmail}`
    if (isValidThemeMode(localUser?.themeMode)) {
      applyAccountThemeMode(localUser.themeMode)
      saveAccountThemeForKeys([emailKey], localUser.themeMode)
      return
    }
    if (isValidThemeMode(map[emailKey])) {
      applyAccountThemeMode(map[emailKey])
      return
    }
    if (prevAccount && prevAccount !== 'guest' && prevAccount !== activeAccountKey) {
      applyAccountThemeMode('system')
    }
    let cancelled = false
    getDictKey(`user_theme:${localEmail}`).then(entry => {
      if (cancelled || isValidThemeMode(getAccountThemeMap()[emailKey])) return
      const remoteMode = entry?.value?.themeMode
      if (isValidThemeMode(remoteMode)) {
        applyAccountThemeMode(remoteMode)
        saveAccountThemeForKeys([emailKey], remoteMode)
      }
    })
    return () => {
      cancelled = true
    }
  }, [activeAccountKey, localUser, localEmail, userSettings.themeMode, applyAccountThemeMode, setDark])

  function persistThemeMode(mode) {
    const normalized = normalizeThemeMode(mode, 'system')
    onUpdateSettings({ themeMode: normalized })
    setDark(resolveDarkFromThemeMode(normalized))
    if (localUser && localEmail) {
      onUpdateLocalUserTheme(normalized)
    } else {
      saveGuestThemeMode(normalized)
    }
  }

  function handleToggleDark() {
    persistThemeMode(dark ? 'light' : 'dark')
  }

  function handleSetExplicitThemeMode(mode) {
    persistThemeMode(mode)
  }

  if (localUser) {
    return (
      <MainDashboard
        dark={dark}
        toggleDark={handleToggleDark}
        onSetExplicitThemeMode={handleSetExplicitThemeMode}
        userSettings={userSettings}
        onUpdateSettings={onUpdateSettings}
        user={localUser}
        isDemo={false}
        onSignOut={onLocalSignOut}
        hasClerkKey={false}
      />
    )
  }

  if (demoMode) {
    return (
      <MainDashboard
        key={`demo_fallback_${demoSession}`}
        dark={dark}
        toggleDark={() => {
          const next = !dark
          handleUpdateDemoSettings({ themeMode: next ? 'dark' : 'light' })
          setDark(next)
        }}
        onSetExplicitThemeMode={mode => {
          const normalized = normalizeThemeMode(mode, 'system')
          handleUpdateDemoSettings({ themeMode: normalized })
          setDark(resolveDarkFromThemeMode(normalized))
        }}
        userSettings={demoSettings}
        onUpdateSettings={handleUpdateDemoSettings}
        user={null}
        isDemo={true}
        onExitDemo={handleExitDemo}
        hasClerkKey={false}
      />
    )
  }

  return (
    <SignInPage
      dark={dark}
      onToggleDark={handleToggleDark}
      hasPublishableKey={false}
      onEnterDemo={handleEnterDemo}
      onLocalSignIn={onLocalSignIn}
    />
  )
}

const DEFAULT_CLERK_KEY = (
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
  import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  ''
).trim()

export default function App({ hasClerkKey = isValidClerkPublishableKey(DEFAULT_CLERK_KEY) }) {
  const [userSettings, setUserSettings] = useState(() => {
    const stored = getStoredUserSettings()
    const initialMode = resolveInitialThemeMode()
    return initialMode !== stored.themeMode ? { ...stored, themeMode: initialMode } : stored
  })
  const [dark, setDark] = useState(getInitialTheme)
  const [localUser, setLocalUser] = useState(getInitialStoredUser)

  // Preserve shared `?poll=<id>` invite links across login / OAuth redirects
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const pollParam = new URLSearchParams(window.location.search).get('poll')
      if (pollParam) {
        sessionStorage.setItem(PENDING_POLL_SESSION_KEY, pollParam)
      }
    } catch {
      // Ignore storage errors
    }
  }, [])

  // Synchronously apply dark & reduce-motion classes BEFORE paint so zero white flash can occur
  useLayoutEffect(() => {
    const root = document.documentElement
    const isDark = Boolean(dark)
    root.classList.toggle('dark', isDark)
    root.classList.toggle('light', !isDark)
    root.style.colorScheme = isDark ? 'dark' : 'light'
    const metaTags = document.querySelectorAll('meta[name="theme-color"]')
    metaTags.forEach(tag => {
      tag.setAttribute('content', isDark ? '#080C14' : '#DFDDD5')
    })
  }, [dark])

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', Boolean(userSettings.reduceMotion))
  }, [userSettings.reduceMotion])

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('compact-cards', Boolean(userSettings.compactCards))
  }, [userSettings.compactCards])

  // Enable smooth CSS theme transitions only AFTER initial frame has painted
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      document.documentElement.classList.add('theme-ready')
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  const handleUpdateSettings = useCallback(patch => {
    setUserSettings(prev => {
      const next = {
        ...prev,
        ...patch,
        themeMode:
          patch.themeMode !== undefined
            ? normalizeThemeMode(patch.themeMode, 'system')
            : prev.themeMode,
        channels: patch.channels ? { ...prev.channels, ...patch.channels } : prev.channels,
        calendarSync: patch.calendarSync
          ? normalizeCalendarSyncSettings({ ...prev.calendarSync, ...patch.calendarSync })
          : prev.calendarSync,
      }
      saveStoredUserSettings(next)
      return next
    })
    if (patch.avatarBg || typeof patch.displayName === 'string') {
      setLocalUser(prev => {
        if (!prev) return prev
        const updated = {
          ...prev,
          ...(patch.avatarBg ? { avatarBg: patch.avatarBg } : {}),
          ...(typeof patch.displayName === 'string' && patch.displayName.trim()
            ? { fullName: patch.displayName.trim() }
            : {}),
        }
        try {
          localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(updated))
        } catch {
          // Ignore storage errors
        }
        return updated
      })
    }
  }, [])

  const updateLocalUserTheme = useCallback(nextMode => {
    const normalized = normalizeThemeMode(nextMode, 'system')
    setLocalUser(prev => {
      if (!prev) return prev
      const updated = {
        ...prev,
        themeMode: normalized,
        darkMode: normalized === 'dark' ? true : normalized === 'light' ? false : undefined,
      }
      const emailLower = (prev.email || '').toLowerCase()
      try {
        localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(updated))
        if (emailLower) {
          saveAccountThemeForKeys([`email:${emailLower}`], normalized)
          const regRaw = localStorage.getItem(EMAIL_ACCOUNTS_KEY)
          const reg = regRaw ? JSON.parse(regRaw) : {}
          if (reg[emailLower]) {
            reg[emailLower] = {
              ...reg[emailLower],
              themeMode: normalized,
              darkMode: normalized === 'dark' ? true : normalized === 'light' ? false : undefined,
            }
            localStorage.setItem(EMAIL_ACCOUNTS_KEY, JSON.stringify(reg))
          }
        }
      } catch {
        // Ignore storage errors
      }
      if (emailLower) {
        persistBackendAccountTheme(emailLower, normalized)
      }
      return updated
    })
  }, [])

  const handleLocalSignIn = useCallback(profile => {
    const emailLower = (profile.email || '').toLowerCase()
    const map = getAccountThemeMap()
    const resolvedMode = isValidThemeMode(profile.themeMode)
      ? profile.themeMode
      : emailLower && isValidThemeMode(map[`email:${emailLower}`])
        ? map[`email:${emailLower}`]
        : undefined

    const nextProfile = resolvedMode ? { ...profile, themeMode: resolvedMode } : profile

    setLocalUser(nextProfile)
    try {
      localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(nextProfile))
      if (emailLower) {
        localStorage.setItem(LAST_ACTIVE_ACCOUNT_KEY, `email:${emailLower}`)
      }
    } catch {
      // Ignore storage errors
    }
  }, [])

  const handleLocalSignOut = useCallback((opts = {}) => {
    setLocalUser(null)
    try {
      localStorage.removeItem(AUTH_USER_STORAGE_KEY)
      if (!opts?.silent) {
        localStorage.removeItem(LAST_ACTIVE_ACCOUNT_KEY)
      }
    } catch {
      // Ignore storage errors
    }
  }, [])

  if (hasClerkKey) {
    return (
      <ClerkAppWrapper
        dark={dark}
        setDark={setDark}
        userSettings={userSettings}
        onUpdateSettings={handleUpdateSettings}
        localUser={localUser}
        onLocalSignIn={handleLocalSignIn}
        onLocalSignOut={handleLocalSignOut}
        onUpdateLocalUserTheme={updateLocalUserTheme}
      />
    )
  }

  return (
    <FallbackApp
      dark={dark}
      setDark={setDark}
      userSettings={userSettings}
      onUpdateSettings={handleUpdateSettings}
      localUser={localUser}
      onLocalSignIn={handleLocalSignIn}
      onLocalSignOut={handleLocalSignOut}
      onUpdateLocalUserTheme={updateLocalUserTheme}
    />
  )
}
