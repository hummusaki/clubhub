import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react'
import { useAuth, useUser, useClerk, AuthenticateWithRedirectCallback } from '@clerk/react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import StatCards from './components/StatCards'
import DashboardEditor from './components/DashboardEditor'
import DashboardGrid from './components/DashboardGrid'
import { normalizeDashboardLayout } from './utils/dashboardLayout'
import { allDayEventDates, calendarEventDate, parseYmdLocal, toLocalYmd } from './utils/calendarDates'
import ClubDiscoveryDialog, { FindClubsButton } from './components/ClubDiscoveryDialog'
import { workspaceSearchDestination } from './utils/workspaceSearch'
import { announcementKey } from './utils/announcementLinks'
import { getPublicDirectoryPeople } from './utils/clubDirectory'
import CalendarView from './components/CalendarView'
import AvailabilityView from './components/AvailabilityView'
import Announcements from './components/Announcements'
import ClubsHub from './components/ClubsHub'
import ClubPage from './components/ClubPage'
import { ClubSubscriptionManager } from './components/ClubSubscriptions'
import { DEFAULT_CLUB_SUBSCRIPTION, mergePersonalFeed } from './utils/clubSubscriptions'
import { isPublicRecord } from './utils/publicRoster'
import ClubTaskBoard from './components/ClubTaskBoard'
import LinksResources, { countDefaultResources } from './components/LinksResources'
import SettingsView from './components/SettingsView'
import SignInPage from './components/SignInPage'
import { Button, PageToolbar, SegmentedControl, ToastViewport, cleanText, cleanMultilineText } from './components/ui'
import {
  getWorkspaceMe,
  updateWorkspaceProfile,
  logoutWorkspaceSession,
  clearWorkspaceSession,
  joinWorkspaceClub,
  leaveWorkspaceClub,
  syncWorkspaceMemberships,
  getWorkspaceFeed,
  setClubSubscription,
  syncExternalWorkspaceSession,
  onWorkspacePermissionChange,
} from './api/workspaceClient'
import { categorizeClub, getClubCategoryMeta } from './utils/clubCategories'
import {
  clubs as initialClubs,
  todaySchedule as fallbackSchedule,
  links as fallbackLinks,
} from './data/sampleData'
import {
  getClubHub,
  getAnnouncements,
  getEvents,
  getLinks,
  getStats,
  getSchedulerPolls,
  getStaticSnapshot,
  mergeWorkspaceFeed,
  syncCalendarFeedProfile,
} from './api/client'
import {
  DEFAULT_CALENDAR_SYNC_SETTINGS,
  normalizeCalendarSyncSettings,
  normalizeClubKey,
  extractGoingEventIds,
  filterEventsForCalendarSync,
  buildIcsCalendar,
  downloadIcsFile,
  getOrCreateCalendarSyncToken,
  isLocalhostUrl,
  normalizeExternalPostUrl,
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
import {
  PENDING_POLL_SESSION_KEY,
  canResumeWorkspace,
  readWorkspaceAdmission,
  storeWorkspaceAdmission,
  workspaceAdmission,
  clearOAuthEntry,
  clubPageHref,
  readClubPage,
  readOAuthEntry,
  readWorkspaceDestination,
  readWorkspaceNavigation,
  normalizeWorkspaceNavigation,
  replaceEntryUrl,
  startOAuthEntry,
} from './utils/workspaceEntry'
import { isValidClerkPublishableKey } from './utils/authValidation'
import { buildDashboardPageTitle } from './utils/pageTitle'
import {
  clearTaskBoardPrefsForAccount,
  SENT_TASK_REMINDERS_LEDGER_KEY,
} from './utils/taskReminders'

const AUTH_USER_SESSION_KEY = 'clubhub_auth_user_session_v1'
const ACTIVE_NAV_STORAGE_KEY = 'clubhub_active_nav_v1'
const ACCOUNT_THEMES_STORAGE_KEY = 'clubhub_account_themes_v2'
const RSVP_STORAGE_KEY = 'clubhub_event_rsvps_v1'
const USER_SETTINGS_STORAGE_KEY = 'clubhub_user_settings_v1'
const JOINED_CLUBS_STORAGE_KEY = 'clubhub_joined_clubs_v1'
const IMPORTED_MEMBERSHIPS_KEY = 'clubhub_imported_memberships_v1'
const LOCAL_ADDED_EVENTS_KEY = 'clubhub_local_added_events_v1'
const REMOVED_EVENT_IDS_KEY = 'clubhub_removed_event_ids_v1'
const LOCAL_ADDED_LINKS_KEY = 'clubhub_local_added_links_v1'
const PINNED_LINK_OVERRIDES_KEY = 'clubhub_pinned_link_overrides_v1'
const LOCAL_CLUB_POSTS_KEY = 'clubhub_local_club_posts_v1'

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

function membershipIds(memberships) {
  return memberships.map(item => String(item.clubId || item.club_id || '')).filter(Boolean)
}

const DEFAULT_USER_SETTINGS = {
  displayName: '',
  major: '',
  avatarBg: '#1A73E8',
  themeMode: 'system', // 'system' (default: match OS) | 'light' | 'dark'
  compactCards: false,
  reduceMotion: false,
  timeFormat: '12h',
  weekStartsOn: 'monday',
  availabilityHours: '9-19',
  urgentOnlyBadge: false,
  channels: {
    discord: true,
    instagram: true,
    email: true,
  },
  calendarSync: DEFAULT_CALENDAR_SYNC_SETTINGS,
}

function getStoredUserSettings(storageKey, legacyKey) {
  try {
    const raw = localStorage.getItem(storageKey) || (legacyKey && localStorage.getItem(legacyKey))
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
      dashboardLayout: normalizeDashboardLayout(parsed?.dashboardLayout),
    }
  } catch {
    return DEFAULT_USER_SETTINGS
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

function getAccountThemeMap() {
  return readLocalJson(ACCOUNT_THEMES_STORAGE_KEY, {}) || {}
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

function persistBackendAccountTheme(mode) {
  if (!isValidThemeMode(mode)) return
  updateWorkspaceProfile({ themeMode: mode }).catch(() => {})
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

function isEventUpcoming(ev, now = new Date()) {
  if (ev.cancelled) return false
  const iso = ev.startIso ?? ev.start
  if (!iso) return true
  const startDt = new Date(iso)
  if (Number.isNaN(startDt.getTime())) return false
  if (ev.allDay) {
    return allDayEventDates(ev)?.end > toLocalYmd(now)
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
    (!/^BE\s*[-#]?\s*\d/.test(stripped) &&
      /^(?:opers|be\s|to\s|and\s|our\s|we\s|have\s|having\s|join\s)/i.test(stripped))
  ) {
    return 'Campus / See post'
  }
  return stripped
}

function formatFeedAnnouncement(a) {
  const source = a.source || 'instagram'
  const type = a.important ? 'Urgent'
    : a.visibility === 'board' ? 'Board Only'
    : a.visibility === 'group' ? 'Sub-Group'
    : { discord: 'Discord', instagram_story: 'IG Story', email: 'Email', workspace: a.type || 'Club Notice' }[source] || 'Announcement'
  const color = a.important ? 'red' : a.visibility === 'board' || source === 'instagram_story' ? 'purple'
    : a.visibility === 'group' ? 'teal' : source === 'discord' || source === 'workspace' ? 'blue' : 'yellow'
  const stamp = a.postedAt || a.createdAt
  return {
    ...a, source, type, color,
    time: stamp ? new Date(stamp).toLocaleDateString() : 'Just now',
    title: cleanText(`${a.clubName ? a.clubName + ': ' : ''}${a.title}`),
    description: cleanMultilineText(a.summary || a.body || a.recipientsSummary || ''),
  }
}

function formatScheduleItem(e, index = 0, hub = null) {
  const palette = ['blue', 'green', 'purple', 'yellow', 'teal']
  const isBookedCollab = String(e.id || '').startsWith('collab_evt_')
  const isAllDay = Boolean(e.allDay)
  const startDate = isAllDay ? parseYmdLocal(calendarEventDate(e)) : new Date(e.start)
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

  const clubRecord =
    e.clubId && hub && typeof hub === 'object'
      ? hub[e.clubId] || hub[String(e.clubId).toLowerCase()] || null
      : null
  const matchedPost =
    e.postId && Array.isArray(clubRecord?.posts)
      ? clubRecord.posts.find(p => String(p?.id) === String(e.postId)) || null
      : null
  const resolvedPermalink = normalizeExternalPostUrl(e.permalink || matchedPost?.permalink || null)
  const fallbackClubPageUrl =
    !resolvedPermalink &&
    !e.isCustom &&
    !isBookedCollab &&
    clubRecord?.instagram &&
    !String(clubRecord.instagram).startsWith('demo_')
      ? normalizeExternalPostUrl(
          clubRecord.instagramUrl || `https://www.instagram.com/${clubRecord.instagram}/`
        )
      : null

  return {
    id: e.id,
    clubId: e.clubId || null,
    postId: e.postId || null,
    sourceId: e.sourceId,
    important: e.important === true || e.important === 1,
    cancelled: Boolean(e.cancelled),
    visibility: e.visibility,
    kind: e.kind,
    source: e.source || matchedPost?.source || null,
    club: cleanText(e.clubName || clubRecord?.name || e.clubId || 'Campus Club'),
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
    permalink: resolvedPermalink,
    clubPageUrl: fallbackClubPageUrl,
    startIso: e.start,
    endIso: e.end,
  }
}

function MainDashboard({
  onSetExplicitThemeMode,
  userSettings,
  onUpdateSettings,
  user = null,
  isDemo = false,
  onExitDemo,
  onSignOut,
  hasClerkKey = false,
  legacySettingsEmail,
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
  const localData = useMemo(() => {
    const keyFor = key => `${key}:${accountKey}`
    return {
      read: (key, fallback) => readLocalJson(keyFor(key), legacySettingsEmail && legacySettingsEmail === accountEmail
        ? readLocalJson(key, fallback) : fallback),
      write: (key, value) => writeLocalJson(keyFor(key), value),
    }
  }, [accountEmail, accountKey, legacySettingsEmail])
  const membershipQueue = useMemo(() => ({
    tail: Promise.resolve(),
    pending: new Set(),
  }), [accountKey])
  const activeMembershipQueue = useRef(membershipQueue)
  useLayoutEffect(() => {
    activeMembershipQueue.current = membershipQueue
    return () => { activeMembershipQueue.current = null }
  }, [membershipQueue])

  const queueMembershipRequest = useCallback(task => {
    const request = membershipQueue.tail.then(() => {
      if (activeMembershipQueue.current === membershipQueue) return task()
    })
    membershipQueue.tail = request.catch(() => {})
    return request
  }, [membershipQueue])

  const demoTargetCountRef = useRef(randomDemoClubCount())
  const demoLiveSeededRef = useRef(false)
  const demoUserModifiedClubsRef = useRef(false)

  const [editingDashboard, setEditingDashboard] = useState(false)
  const [managingSubscriptions, setManagingSubscriptions] = useState(false)
  const [clubPage, setClubPage] = useState(() => readClubPage(window.location.hash))
  const [initialNavigation] = useState(() => readWorkspaceNavigation(window.location))
  const [activeNav, setActiveNav] = useState(initialNavigation.nav)
  const [calendarSection, setCalendarSection] = useState(initialNavigation.options.calendarSection || 'schedule')
  const [calendarVisited, setCalendarVisited] = useState(initialNavigation.nav === 'calendar')
  const [availabilityVisited, setAvailabilityVisited] = useState(calendarSection === 'availability')
  const [pollRequest, setPollRequest] = useState(() => initialNavigation.options.pollId
    ? { id: initialNavigation.options.pollId } : null)
  const [clubsVisited, setClubsVisited] = useState(activeNav === 'clubs')
  const [catalogLoaded, setCatalogLoaded] = useState(false)
  const [discoveryOpen, setDiscoveryOpen] = useState(false)
  const [restoreSearchKey, setRestoreSearchKey] = useState(null)
  const workspaceHistory = useRef(null)
  const originViews = useRef(new Map())
  const historySequence = useRef(0)
  const navigation = useRef(null)
  const visibleNav = clubPage ? 'clubs' : activeNav
  const pageSubContextRef = useRef(null)
  const [clubsInitialSection, setClubsInitialSection] = useState(clubPage ? 'discover' : null)
  const [clubsSectionRevision, setClubsSectionRevision] = useState(0)
  const [tasksInitialClubId, setTasksInitialClubId] = useState('')
  const [demoFavoriteClubIds, setDemoFavoriteClubIds] = useState([])
  const [settingsInitialSection, setSettingsInitialSection] = useState(null)
  const [workspaceFeed, setWorkspaceFeed] = useState(null)
  const [workspaceFeedError, setWorkspaceFeedError] = useState(false)
  const [activePollCount, setActivePollCount] = useState(0)
  const [subscriptions, setSubscriptions] = useState({})
  const feedRevision = useRef(0)
  const feedWriteRevision = useRef(0)
  const [calendarPosition, setCalendarPosition] = useState(null)
  const calendarVisible = activeNav === 'calendar' && !clubPage
  const scheduleVisible = calendarVisible && calendarSection === 'schedule'
  const availabilityVisible = calendarVisible && calendarSection === 'availability'

  const [pageFilters, setPageFilters] = useState({})
  const [searchTarget, setSearchTarget] = useState(null)
  const bookedEventTargets = useRef(new Map())
  const searchSequence = useRef(0)
  const searchQuery = pageFilters[activeNav] || ''
  function setPageFilter(nav, value) {
    setPageFilters(prev => ({ ...prev, [nav]: value }))
  }
  const [clubsData] = useState(initialClubs)
  const [joinedClubIds, setJoinedClubIds] = useState(() =>
    isDemo
      ? pickRandomDemoClubIds(initialClubs, demoTargetCountRef.current, {
          events: fallbackSchedule,
          links: fallbackLinks,
          hub: STATIC_HUB_FALLBACK,
        })
      : getStoredJoinedClubIds(
          hasStoredJoinedClubs(accountKey) ? accountKey : `email:${accountEmail}`
        )
  )
  const joinedClubIdsRef = useRef(joinedClubIds)
  const [rsvpMap, setRsvpMap] = useState(() => isDemo ? {} : localData.read(RSVP_STORAGE_KEY, {}))
  const [resetGeneration, setResetGeneration] = useState(0)

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', Boolean(userSettings?.reduceMotion))
    return () => document.documentElement.classList.remove('reduce-motion')
  }, [userSettings?.reduceMotion])

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('compact-cards', Boolean(userSettings?.compactCards))
    return () => document.documentElement.classList.remove('compact-cards')
  }, [userSettings?.compactCards])

  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)

  const [hubDict, setHubDict] = useState(STATIC_HUB_FALLBACK)
  const [catalogAnnouncements, setCatalogAnnouncements] = useState([])
  const [liveClubs, setLiveClubs] = useState(null)
  const [rawEvents, setRawEvents] = useState([])
  const [localAddedEvents, setLocalAddedEvents] = useState(() => {
    if (isDemo) return []
    const saved = localData.read(LOCAL_ADDED_EVENTS_KEY, [])
    return Array.isArray(saved) ? saved : []
  })
  const [removedEventIds, setRemovedEventIds] = useState(() => {
    if (isDemo) return new Set()
    const saved = localData.read(REMOVED_EVENT_IDS_KEY, [])
    return new Set(Array.isArray(saved) ? saved.map(String) : [])
  })
  const [liveLinks, setLiveLinks] = useState(null)
  const [localAddedLinks, setLocalAddedLinks] = useState(() => {
    if (isDemo) return []
    const saved = localData.read(LOCAL_ADDED_LINKS_KEY, [])
    return Array.isArray(saved) ? saved : []
  })
  const [pinnedLinkOverrides, setPinnedLinkOverrides] = useState(() => {
    if (isDemo) return {}
    const saved = localData.read(PINNED_LINK_OVERRIDES_KEY, {})
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
  })
  const [localClubPosts, setLocalClubPosts] = useState(() => {
    if (isDemo) return []
    const saved = localData.read(LOCAL_CLUB_POSTS_KEY, [])
    return Array.isArray(saved) ? saved : []
  })
  const [liveStats, setLiveStats] = useState(null)

  useEffect(() => {
    if (isDemo) return
    localData.write(LOCAL_ADDED_EVENTS_KEY, localAddedEvents)
  }, [isDemo, localAddedEvents, localData])

  useEffect(() => {
    if (isDemo) return
    localData.write(REMOVED_EVENT_IDS_KEY, Array.from(removedEventIds))
  }, [isDemo, removedEventIds, localData])

  useEffect(() => {
    if (isDemo) return
    localData.write(LOCAL_ADDED_LINKS_KEY, localAddedLinks)
  }, [isDemo, localAddedLinks, localData])

  useEffect(() => {
    if (isDemo) return
    localData.write(PINNED_LINK_OVERRIDES_KEY, pinnedLinkOverrides)
  }, [isDemo, pinnedLinkOverrides, localData])

  useEffect(() => {
    if (isDemo) return
    localData.write(LOCAL_CLUB_POSTS_KEY, localClubPosts)
  }, [isDemo, localClubPosts, localData])

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

  const applyJoinedClubIds = useCallback(nextIds => {
    const prev = joinedClubIdsRef.current
    if (prev.length === nextIds.length && prev.every((id, idx) => id === nextIds[idx])) return
    joinedClubIdsRef.current = nextIds
    setJoinedClubIds(nextIds)
  }, [])

  const loadBackendData = useCallback(async () => {
    let [hub, anns, evts, lnks, dbStats] = await Promise.all([
      getClubHub(),
      getAnnouncements(),
      getEvents(),
      getLinks(),
      getStats(),
    ])

    if (!hub) {
      const snap = await getStaticSnapshot()
      if (snap) {
        hub = snap.hub || null
        anns = Array.isArray(snap.announcements) ? snap.announcements : null
        evts = Array.isArray(snap.events) ? snap.events : null
        lnks = Array.isArray(snap.links) ? snap.links : null
        dbStats = snap.stats || null
      }
    }

    const nowRef = new Date()

    let nextHub = null
    let nextClubs = null
    let nextDemoIds = null

    if (hub && Object.keys(hub).length > 0) {
      nextHub = hub
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
        const rawDesc = c.description || c.bio || c.directoryDescription || (c.posts || [])[0]?.summary || ''
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
          discordIconUrl: c.discordIconUrl || null,
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
          bio: c.bio ? cleanText(c.bio) : '',
          officialName: c.officialName,
          displayName: c.displayName,
          aliases: c.aliases,
          handle: c.handle,
          directoryDescription: c.directoryDescription ? cleanText(c.directoryDescription) : '',
          alsoKnownAs: Array.isArray(c.alsoKnownAs) ? c.alsoKnownAs : [],
          profilePictureUrl: c.discordIconUrl || c.profilePictureUrl || null,
          logoUrl: c.discordIconUrl || c.profilePictureUrl || null,
          instagram: c.instagram || null,
          email: resolvedEmail,
          extraEmails: emailLinks.filter(e => e !== resolvedEmail),
          website: c.website || null,
          meetingSchedule: c.meetingSchedule || null,
          meetingTime: c.meetingTime || null,
          meetingLocation: c.meetingLocation || null,
          tags: [
            ...(Array.isArray(c.tags) ? c.tags : c.tags ? [c.tags] : [])
              .map(tag => typeof tag === 'string' ? { label: tag } : tag).filter(tag => tag?.label),
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

        nextClubs = [...mappedClubs, ...extraDiscoverClubs]

        if (isDemo && !demoLiveSeededRef.current && !demoUserModifiedClubsRef.current) {
          demoLiveSeededRef.current = true
          const demoIds = pickRandomDemoClubIds(mappedClubs, demoTargetCountRef.current, {
            events: evts || [],
            links: lnks || [],
            hub,
            now: nowRef,
          })
          if (demoIds.length > 0) {
            nextDemoIds = demoIds
          }
        }
      }
    }

    const nextLinks =
      lnks && lnks.length > 0
        ? lnks.map(l => ({
            id: l.id,
            clubId: l.clubId || null,
            clubName: l.clubName ? cleanText(l.clubName) : '',
            rawLabel: l.label ? cleanText(l.label) : '',
            visibility: l.visibility,
            isPrivate: l.isPrivate,
            kind: l.kind || 'website',
            postId: l.postId || null,
            title: cleanText(
              `${l.clubName ? l.clubName + ' — ' : ''}${l.label || l.kind || 'Link'}`
            ),
            subtitle: l.url,
            url: l.url,
            category: KIND_CATEGORY_MAP[l.kind] || 'Resources',
            color: KIND_COLOR_MAP[l.kind] || 'blue',
            icon: KIND_ICON_MAP[l.kind] || 'Globe',
          }))
        : null

    const nextStats = dbStats
      ? [
          { label: 'My Clubs',        value: 0,                   color: 'green',  icon: 'Heart',    navTarget: 'clubs' },
          { label: 'Upcoming Events', value: dbStats.events ?? 0, color: 'teal', icon: 'Calendar', navTarget: 'calendar' },
          { label: 'Group Polls',     value: 1,                   color: 'teal',   icon: 'Clock',    navTarget: 'calendar', calendarSection: 'availability' },
          { label: 'Shared Links',    value: dbStats.links ?? 0,  color: 'purple', icon: 'Link',     navTarget: 'links' },
        ]
      : null

    if (nextHub) setHubDict(nextHub)
    if (nextClubs) setLiveClubs(nextClubs)
    if (nextDemoIds) applyJoinedClubIds(nextDemoIds)
    if (Array.isArray(evts)) setRawEvents(evts)
    if (Array.isArray(anns)) setCatalogAnnouncements(anns)
    if (nextLinks) setLiveLinks(nextLinks)
    if (nextStats) setLiveStats(nextStats)
  }, [isDemo, applyJoinedClubIds])

  useEffect(() => {
    let active = true
    loadBackendData().catch(() => {}).finally(() => {
      if (active) setCatalogLoaded(true)
    })
    return () => { active = false }
  }, [loadBackendData])

  // Serialize membership reads and legacy syncs with explicit joins and leaves.
  const loadWorkspaceMemberships = useCallback(() => {
    if (!effectiveUser) return
    return queueMembershipRequest(async () => {
      if (hasClerkKey && accountEmail && !effectiveUser.workspaceSynced) {
        await syncExternalWorkspaceSession({
          provider: 'clerk',
          clerkUserId: effectiveUser.id,
          email: accountEmail,
          fullName: effectiveUser.fullName || accountEmail.split('@')[0],
        }).catch(() => {})
      }
      if (activeMembershipQueue.current !== membershipQueue) return
      const meRes = await getWorkspaceMe(effectiveUser)
      if (activeMembershipQueue.current !== membershipQueue) return
      if (!meRes?.ok || !Array.isArray(meRes.memberships)) return

      let confirmed = membershipIds(meRes.memberships)
      if (!localData.read(IMPORTED_MEMBERSHIPS_KEY, false)) {
        const confirmedKeys = new Set(confirmed.map(normalizeClubKey))
        const metadataIds = effectiveUser.unsafeMetadata?.joinedClubIds
        const legacyIds = hasStoredJoinedClubs(accountKey) || hasStoredJoinedClubs(`email:${accountEmail}`)
          ? joinedClubIdsRef.current
          : Array.isArray(metadataIds) ? metadataIds : []
        const unsynced = legacyIds.filter(id => {
          const key = normalizeClubKey(id)
          return key && !confirmedKeys.has(key) && !membershipQueue.pending.has(key)
        })
        if (unsynced.length) {
          const sync = await syncWorkspaceMemberships(unsynced).catch(() => null)
          if (activeMembershipQueue.current !== membershipQueue || !sync?.ok) return
          confirmed = Array.isArray(sync.memberships) ? membershipIds(sync.memberships) : [...confirmed, ...unsynced]
        }
        localData.write(IMPORTED_MEMBERSHIPS_KEY, true)
      }

      saveStoredJoinedClubIds([accountKey, accountEmail ? `email:${accountEmail}` : null], confirmed)
      const isPending = id => membershipQueue.pending.has(normalizeClubKey(id))
      const pendingJoins = joinedClubIdsRef.current.filter(isPending)
      applyJoinedClubIds([...confirmed.filter(id => !isPending(id)), ...pendingJoins])
    })
  }, [effectiveUser, hasClerkKey, accountEmail, accountKey, membershipQueue, queueMembershipRequest, applyJoinedClubIds, localData])

  const reloadFeed = useCallback(async () => {
    if (isDemo || !effectiveUser) return
    const request = ++feedRevision.current
    const writes = feedWriteRevision.current
    const result = await getWorkspaceFeed().catch(() => null)
    if (request !== feedRevision.current || writes !== feedWriteRevision.current ||
        activeMembershipQueue.current !== membershipQueue) return
    if (!result?.ok) {
      setWorkspaceFeedError(true)
      return
    }
    setWorkspaceFeedError(false)
    setSubscriptions(result.subscriptions || {})
    setWorkspaceFeed(result)
  }, [isDemo, effectiveUser, membershipQueue])

  const loadWorkspaceState = useCallback(async () => {
    if (isDemo) return
    await loadWorkspaceMemberships()
    if (activeMembershipQueue.current === membershipQueue) await reloadFeed()
  }, [isDemo, membershipQueue, loadWorkspaceMemberships, reloadFeed])

  useEffect(() => {
    void loadWorkspaceState()
    return () => { feedRevision.current += 1 }
  }, [loadWorkspaceState])

  const feedReady = Boolean(workspaceFeed)
  useEffect(() => {
    if (!effectiveUser || (!feedReady && !workspaceFeedError)) return
    let active = true
    getSchedulerPolls().then(polls => {
      if (active && Array.isArray(polls)) setActivePollCount(polls.length)
    }).catch(() => {})
    return () => { active = false }
  }, [activeNav, effectiveUser, feedReady, workspaceFeedError])

  async function saveSubscription(clubId, channel, mode) {
    const id = normalizeClubKey(clubId)
    const response = isDemo ? { ok: true } : await setClubSubscription(id, channel, mode).catch(() => null)
    if (activeMembershipQueue.current !== membershipQueue || !response?.ok) return false
    feedWriteRevision.current += 1
    setSubscriptions(previous => ({
      ...previous, [id]: { ...(previous[id] || DEFAULT_CLUB_SUBSCRIPTION), [channel]: mode },
    }))
    setWorkspaceFeed(previous => previous ? { ...previous, usePublicSnapshot: true } : previous)
    if (!isDemo) void reloadFeed()
    return true
  }

  useEffect(() => {
    if (isDemo) return undefined
    return onWorkspacePermissionChange(detail => {
      if (detail?.status === 403 && detail?.code !== 'NOT_CLUB_MEMBER') {
        if (detail?.code !== 'SUPABASE_AUTH_SETUP_REQUIRED' && detail?.method !== 'GET') {
          loadWorkspaceState()
        }
        showToast(detail.error || 'Your club permissions were updated.', { type: 'info' })
      } else if (detail?.sessionExpired && !hasClerkKey && onSignOut) {
        onSignOut({ silent: true })
        showToast('Your session expired. Please sign in again.', { type: 'info' })
      }
    })
  }, [isDemo, hasClerkKey, onSignOut, loadWorkspaceState, showToast])

  function applyNavigation(nav, navigationOptions = {}) {
    const { nav: nextNav, options } = normalizeWorkspaceNavigation(nav, navigationOptions)
    if (nextNav === 'clubs') {
      setClubsVisited(true)
      if (options.section) {
        setClubsInitialSection(options.section)
        setClubsSectionRevision(revision => revision + 1)
      }
    }
    if (nextNav === 'tasks') setTasksInitialClubId(options.clubId || '')
    if (nextNav === 'settings') setSettingsInitialSection(options.section || null)
    if (nextNav === 'calendar') {
      setCalendarVisited(true)
      setCalendarSection(options.calendarSection)
      if (options.calendarSection === 'availability') {
        setAvailabilityVisited(true)
        if (options.pollId) setPollRequest({ id: options.pollId })
      } else {
        const date = options.date || options.searchTarget?.publicEvent?.startIso
        if (options.view || date || options.useCalendarPreference) setCalendarPosition({
          view: options.view, date, usePreference: options.useCalendarPreference,
        })
      }
    }
    if (nextNav !== activeNav || (nextNav === 'calendar' && options.calendarSection !== calendarSection)) {
      pageSubContextRef.current = null
    }
    setActiveNav(nextNav)
    if (options.searchQuery !== undefined) setPageFilter(nextNav, options.searchQuery)
    const target = options.searchTarget
    setSearchTarget(target ? {
      ...target,
      bookedEvent: target.fromPoll ? bookedEventTargets.current.get(target.id) : undefined,
      revision: ++searchSequence.current,
    } : null)
  }

  navigation.current = applyNavigation

  useLayoutEffect(() => {
    const key = workspaceHistory.current ??= crypto.randomUUID()
    const initial = { key, id: ++historySequence.current, ...initialNavigation }
    window.history.replaceState({ clubhub: initial }, '')
    let last = null

    function restoreNavigation() {
      const entry = window.history.state?.clubhub
      const snapshot = `${entry?.id || ''}:${window.location.href}`
      if (snapshot === last) return
      last = snapshot
      const route = readClubPage(window.location.hash)
      setClubPage(route)
      setDiscoveryOpen(false)
      if (route) {
        if (entry?.key !== key) navigation.current('clubs', { section: 'discover' })
        window.scrollTo(0, 0)
        return
      }

      if (entry?.key === key) {
        const origin = originViews.current.get(entry.id)
        navigation.current(entry.nav, origin && entry.nav === 'clubs'
          ? { ...entry.options, section: undefined } : entry.options)
        if (origin?.discovery) setDiscoveryOpen(true)
        if (origin?.search) setRestoreSearchKey(value => ({ revision: (value?.revision || 0) + 1, id: origin.search }))
        requestAnimationFrame(() => {
          if (origin?.discovery) {
            const links = document.querySelectorAll('[role="dialog"][aria-label="Find clubs"] a')
            Array.from(links).find(link => link.getAttribute('href') === origin.discovery)?.focus({ preventScroll: true })
          } else if (!origin?.search && origin?.focus?.isConnected) {
            origin.focus.focus({ preventScroll: true })
          }
          window.scrollTo(0, origin?.scrollY ?? 0)
        })
      } else {
        const destination = readWorkspaceNavigation(window.location)
        if (entry?.nav === 'availability' && destination.nav === 'overview') {
          navigation.current('availability')
        } else {
          navigation.current(destination.nav, destination.options)
        }
      }
    }

    window.addEventListener('popstate', restoreNavigation)
    window.addEventListener('hashchange', restoreNavigation)
    return () => {
      window.removeEventListener('popstate', restoreNavigation)
      window.removeEventListener('hashchange', restoreNavigation)
    }
  }, [])

  function openClubPage(route, source = {}) {
    const href = clubPageHref(route.clubId, route.section, route.personId)
    if (window.location.hash === href) return
    const entry = window.history.state?.clubhub
    if (!clubPage && entry?.key === workspaceHistory.current) {
      originViews.current.set(entry.id, {
        focus: source.focus || document.activeElement,
        scrollY: window.scrollY,
        search: source.search,
        discovery: source.discovery,
      })
    }
    window.history.pushState({ clubhub: {
      key: workspaceHistory.current,
      id: ++historySequence.current,
      nav: activeNav,
      depth: clubPage ? (entry?.depth || 0) + (entry?.depth ? 1 : 0) : 1,
    } }, '', window.location.pathname + href)
    setDiscoveryOpen(false)
    setClubPage(route)
    window.scrollTo(0, 0)
  }

  function handleNavigate(nav, { origin, ...navigationOptions } = {}) {
    const { nav: nextNav, options } = normalizeWorkspaceNavigation(nav, navigationOptions)
    if (nextNav === 'clubs' && options.clubId) {
      openClubPage({
        clubId: options.clubId,
        section: options.clubSection || 'overview',
        personId: options.personId,
      }, origin)
      return
    }
    if (clubPage || nextNav !== activeNav ||
        (nextNav === 'calendar' && (options.calendarSection !== calendarSection || options.searchTarget || options.pollId))) {
      window.history.pushState({ clubhub: {
        key: workspaceHistory.current, id: ++historySequence.current, nav: nextNav, options,
      } }, '', window.location.pathname)
      window.scrollTo(0, 0)
    }
    setClubPage(null)
    applyNavigation(nextNav, options)
  }

  function openBookedEvent(event, pollId) {
    const entry = window.history.state?.clubhub
    const pollOptions = { calendarSection: 'availability', pollId }
    if (entry?.key === workspaceHistory.current && entry.nav === 'calendar' &&
        entry.options?.calendarSection === 'availability' && !window.location.hash) {
      window.history.replaceState({ clubhub: { ...entry, options: pollOptions } }, '')
    } else {
      window.history.pushState({ clubhub: {
        key: workspaceHistory.current, id: ++historySequence.current, nav: 'calendar', options: pollOptions,
      } }, '', window.location.pathname)
    }
    const displayEvent = formatScheduleItem(event)
    const id = String(displayEvent.id)
    bookedEventTargets.current.set(id, displayEvent)
    handleNavigate('calendar', { view: 'month', date: displayEvent.startIso, searchTarget: { type: 'event', id, fromPoll: true } })
  }

  function openClubLink(route, focus) {
    openClubPage(route, { focus })
  }

  function backFromClub() {
    const depth = window.history.state?.clubhub?.depth
    if (depth) window.history.go(-depth)
    else handleNavigate('clubs', { section: 'discover' })
  }

  function selectSearchResult(type, item, origin) {
    const destination = workspaceSearchDestination(type, item)
    if (destination) handleNavigate(destination.nav, {
      ...destination.options, origin, ...(type === 'event' && { date: item.startIso }),
    })
  }

  function openAnnouncement(item) {
    handleNavigate('clubs', {
      section: 'updates',
      searchTarget: { type: 'announcement', id: announcementKey(item) },
    })
  }

  const joinedClubSet = useMemo(
    () => new Set(joinedClubIds.map(String)),
    [joinedClubIds]
  )

  const joinedClubKeySet = useMemo(
    () => new Set(joinedClubIds.map(normalizeClubKey).filter(Boolean)),
    [joinedClubIds]
  )

  const effectiveClubs = useMemo(() => {
    const base = liveClubs && liveClubs.length > 0 ? liveClubs : clubsData
    return base.map(c => {
      const catId = categorizeClub(c)
      const catMeta = getClubCategoryMeta(catId)
      const isJoined =
        joinedClubSet.has(String(c.id)) || joinedClubKeySet.has(normalizeClubKey(c.id))
      return {
        ...c,
        category: catId,
        categoryLabel: c.categoryLabel || catMeta.label,
        avatarBg: c.avatarBg || catMeta.gradient,
        joined: isJoined,
        members: c.members || 0,
      }
    })
  }, [liveClubs, clubsData, joinedClubSet, joinedClubKeySet])

  const joinedCount = effectiveClubs.filter(club => club.joined).length

  const personalizedFeed = useMemo(() => mergeWorkspaceFeed(
    workspaceFeed, { events: rawEvents, announcements: catalogAnnouncements },
    joinedClubKeySet, subscriptions, localAddedEvents, isDemo,
  ), [workspaceFeed, rawEvents, catalogAnnouncements, joinedClubKeySet, subscriptions, localAddedEvents, isDemo])

  const combinedRawEvents = useMemo(() =>
    personalizedFeed.events.filter(event => !removedEventIds.has(String(event.id))),
  [personalizedFeed.events, removedEventIds])

  const memberScopedSchedule = useMemo(() => {
    const cutoff = Date.parse('2025-01-01T00:00:00Z')
    const events = combinedRawEvents.filter(event => event.isCustom || /^collab_evt_/.test(event.id) || (
      Date.parse(event.start) >= cutoff && event.kind !== 'deadline' && !/^(?:deadline|due)\s*:/i.test(event.title || '')
    ))
    if (isDemo && !rawEvents.length && !events.length) {
      return mergePersonalFeed(fallbackSchedule, 'events', joinedClubKeySet, subscriptions)
    }
    const hub = hubDict
    return events.map((e, i) => formatScheduleItem(e, i, hub))
  }, [combinedRawEvents, hubDict, isDemo, rawEvents, joinedClubKeySet, subscriptions])

  const personalizedSchedule = useMemo(() =>
    memberScopedSchedule.filter(event => isEventUpcoming(event)), [memberScopedSchedule])

  const personalizedAnnouncements = useMemo(() => {
    if (joinedClubKeySet.size === 0) return []
    return personalizedFeed.announcements.map(formatFeedAnnouncement)
  }, [personalizedFeed.announcements, joinedClubKeySet])

  const selectedAnnouncement = searchTarget?.type === 'announcement'
    ? personalizedAnnouncements.find(item => announcementKey(item) === searchTarget.id)
    : null

  function toggleJoinClub(clubId) {
    const targetId = String(clubId)
    const targetKey = normalizeClubKey(clubId)
    if (!targetKey || membershipQueue.pending.has(targetKey) || (!isDemo && !effectiveUser?.id)) return false

    const previousIds = joinedClubIdsRef.current
    const previousId = previousIds.find(id => normalizeClubKey(id) === targetKey)
    const currentlyJoined = Boolean(previousId)
    const nextIds = currentlyJoined
      ? previousIds.filter(id => normalizeClubKey(id) !== targetKey)
      : [...previousIds, targetId]
    applyJoinedClubIds(nextIds)
    if (isDemo) {
      demoUserModifiedClubsRef.current = true
      return true
    }
    const emailKey = accountEmail ? `email:${accountEmail}` : null
    const storageKeys = [accountKey, emailKey]

    membershipQueue.pending.add(targetKey)
    return queueMembershipRequest(async () => {
      const request = currentlyJoined ? leaveWorkspaceClub : joinWorkspaceClub
      const result = await request(targetKey).catch(error => ({ error: error.message }))
      if (activeMembershipQueue.current !== membershipQueue) return false
      membershipQueue.pending.delete(targetKey)
      const stillJoined = currentlyJoined && Array.isArray(result?.memberships) && result.memberships.some(
        membership => normalizeClubKey(membership.clubId || membership.club_id) === targetKey
      )
      if (stillJoined || !result?.ok) {
        const current = joinedClubIdsRef.current
        const restored = currentlyJoined
          ? [...current, previousId]
          : current.filter(id => normalizeClubKey(id) !== targetKey)
        applyJoinedClubIds(restored)
        showToast(result?.error || (currentlyJoined ? 'Could not leave club.' : 'Could not join club.'), { type: 'error' })
        return false
      }
      const stored = getStoredJoinedClubIds(accountKey).filter(id => normalizeClubKey(id) !== targetKey)
      const confirmed = Array.isArray(result.memberships) ? membershipIds(result.memberships)
        : currentlyJoined ? stored : [...stored, targetId]
      saveStoredJoinedClubIds(storageKeys, confirmed)
      if (hasClerkKey && effectiveUser?.update) {
        await effectiveUser.update({
          unsafeMetadata: {
            ...(effectiveUser.unsafeMetadata || {}),
            joinedClubIds: confirmed,
          },
        }).catch(() => {})
      }
      return true
    }).then(saved => {
      if (!saved || activeMembershipQueue.current !== membershipQueue) return false
      loadWorkspaceState().catch(() => {})
      return true
    })
  }

  function rememberConfirmedMembership(clubId) {
    if (activeMembershipQueue.current !== membershipQueue) return
    const key = normalizeClubKey(clubId)
    if (!key || joinedClubIdsRef.current.some(id => normalizeClubKey(id) === key)) return
    const nextIds = [...joinedClubIdsRef.current, String(clubId)]
    applyJoinedClubIds(nextIds)
    const stored = getStoredJoinedClubIds(accountKey)
    saveStoredJoinedClubIds([accountKey, accountEmail ? `email:${accountEmail}` : null], [...stored, String(clubId)])
    loadWorkspaceState().catch(() => {})
  }

  function handleToggleRsvp(eventId, isGoing) {
    setRsvpMap(prev => {
      const next = { ...prev, [eventId]: isGoing }
      if (!isDemo) {
        try {
          localData.write(RSVP_STORAGE_KEY, next)
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

  function handleAddCalendarEvent(eventPayload) {
    const id = eventPayload.id || `custom_evt_${crypto.randomUUID()}`
    setLocalAddedEvents(prev => [{ ...eventPayload, id, isCustom: true }, ...prev])
  }

  function handleDeleteCalendarEvent(eventId) {
    setRemovedEventIds(prev => new Set(prev).add(String(eventId)))
    setLocalAddedEvents(prev => prev.filter(e => e.id !== eventId))
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
    bookedEventTargets.current.delete(String(eventId))
    setRemovedEventIds(prev => new Set(prev).add(eventId))
    setLocalAddedEvents(prev => prev.filter(e => e.id !== eventId))
  }

  const totalLinksCount = useMemo(() => countDefaultResources(liveLinks, localAddedLinks, effectiveClubs),
    [liveLinks, localAddedLinks, effectiveClubs])

  const effectiveStats = useMemo(() => {
    if (!liveStats) return null
    return liveStats.map(s => {
      if (s.label === 'My Clubs' || s.label === 'Active Clubs') {
        return { ...s, label: 'My Clubs', value: joinedCount }
      }
      if (s.label === 'Upcoming Events') {
        return { ...s, value: personalizedSchedule.length }
      }
      if (s.label === 'Group Polls') return { ...s, value: activePollCount }
      if (s.label === 'Shared Links') {
        return { ...s, value: totalLinksCount }
      }
      return s
    })
  }, [liveStats, joinedCount, personalizedSchedule.length, totalLinksCount, activePollCount])

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
    setPageFilters({})
    setSearchTarget(null)
    setDiscoveryOpen(false)
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
      applyJoinedClubIds(freshDemoIds)
      setRsvpMap({})
      setLocalAddedEvents([])
      setRemovedEventIds(new Set())
      setLocalAddedLinks([])
      setPinnedLinkOverrides({})
      setLocalClubPosts([])
      setDemoFavoriteClubIds([])
      setSubscriptions({})
      onUpdateSettings({ dashboardLayout: normalizeDashboardLayout() })
      bookedEventTargets.current.clear()
      setResetGeneration(g => g + 1)
      showToast('Reset demo workspace with a fresh random sample of clubs.', { type: 'info' })
      return
    }

    const emailKey = accountEmail ? `email:${accountEmail}` : null
    onUpdateSettings({ dashboardLayout: normalizeDashboardLayout() })
    try {
      localData.write(RSVP_STORAGE_KEY, {})
      localStorage.removeItem('clubhub_availability_user_slots_v2')
      localStorage.removeItem('clubhub_custom_roster_v1')
      localData.write(LOCAL_ADDED_EVENTS_KEY, [])
      localData.write(REMOVED_EVENT_IDS_KEY, [])
      localData.write(LOCAL_ADDED_LINKS_KEY, [])
      localData.write(PINNED_LINK_OVERRIDES_KEY, {})
      localData.write(LOCAL_CLUB_POSTS_KEY, [])
      localStorage.removeItem('clubhub_custom_polls_v1')
      localStorage.removeItem(ACTIVE_NAV_STORAGE_KEY)
      localStorage.removeItem(SENT_TASK_REMINDERS_LEDGER_KEY)
      clearTaskBoardPrefsForAccount(accountKey)
      if (emailKey) clearTaskBoardPrefsForAccount(emailKey)
      saveStoredJoinedClubIds([accountKey, emailKey], [])
    } catch {
      // Ignore storage errors
    }
    applyJoinedClubIds([])
    setRsvpMap({})
    setLocalAddedEvents([])
    setRemovedEventIds(new Set())
    setLocalAddedLinks([])
    setPinnedLinkOverrides({})
    setLocalClubPosts([])
    bookedEventTargets.current.clear()
    setResetGeneration(g => g + 1)
    showToast('Reset local customizations to clean defaults.', { type: 'info' })
  }

  const publicPeople = useMemo(() => getPublicDirectoryPeople(hubDict), [hubDict])
  const searchSources = useMemo(() => ({
    clubs: effectiveClubs,
    memberEvents: memberScopedSchedule,
    publicResources: liveLinks || fallbackLinks,
    localResources: localAddedLinks,
    publicPeople,
  }), [effectiveClubs, memberScopedSchedule, liveLinks, localAddedLinks, publicPeople])

  const greeting = userSettings?.displayName?.trim().split(/\s+/)[0] ||
    effectiveUser?.firstName || effectiveUser?.fullName?.split(/\s+/)[0] ||
    effectiveUser?.email?.split('@')[0] || (isDemo ? 'Guest' : 'Student')

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

  const syncAccountActive = useRef(false)
  useLayoutEffect(() => {
    syncAccountActive.current = true
    return () => { syncAccountActive.current = false }
  }, [])

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
  const googleSyncQueue = useRef(Promise.resolve())
  const calendarProfileQueue = useRef(Promise.resolve())

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
    () => Array.from(extractGoingEventIds(rsvpMap, memberScopedSchedule)),
    [rsvpMap, memberScopedSchedule]
  )

  const syncedCalendarEvents = useMemo(
    () =>
      filterEventsForCalendarSync(memberScopedSchedule, {
        joinedClubIds,
        subscriptions,
        rsvpIds: goingEventIds,
        rsvpMap,
        settings: calSyncSettings,
      }),
    [memberScopedSchedule, joinedClubIds, subscriptions, goingEventIds, rsvpMap, calSyncSettings]
  )

  const feedFallbackEvents = useMemo(
    () =>
      memberScopedSchedule.map(ev => ({
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
        important: ev.important,
        source: ev.source,
        visibility: ev.visibility,
        isBookedCollab: Boolean(ev.isBookedCollab),
      })),
    [memberScopedSchedule]
  )

  const flushCalendarFeedProfile = useCallback(
    async (overrideToken = null) => {
      const activeToken = overrideToken || syncToken
      if (!activeToken || isDemo || !feedReady) return { ok: false, mode: 'static', feedHttpUrl: '', feedWebcalUrl: '' }
      const request = calendarProfileQueue.current.then(() => syncAccountActive.current
        ? syncCalendarFeedProfile(activeToken, {
          accountKey,
          displayName: userDisplayName,
          joinedClubIds,
          subscriptions,
          rsvpIds: goingEventIds,
          customEvents: localAddedEvents,
          fallbackEvents: feedFallbackEvents,
          removedEventIds: Array.from(removedEventIds),
          settings: calSyncSettings,
        }) : null)
      calendarProfileQueue.current = request.catch(() => {})
      const res = await request
      if (!res || !syncAccountActive.current) return { ok: false, mode: 'static', feedHttpUrl: '', feedWebcalUrl: '' }
      const nextMode = res.mode || 'static'
      const nextHttpUrl = res.feedHttpUrl || ''
      const nextWebcalUrl = res.feedWebcalUrl || ''
      setFeedState(prev =>
        prev.mode === nextMode &&
        prev.feedHttpUrl === nextHttpUrl &&
        prev.feedWebcalUrl === nextWebcalUrl
          ? prev
          : {
              mode: nextMode,
              feedHttpUrl: nextHttpUrl,
              feedWebcalUrl: nextWebcalUrl,
            }
      )
      return res
    },
    [
      syncToken,
      accountKey,
      userDisplayName,
      isDemo,
      feedReady,
      joinedClubIds,
      subscriptions,
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
      if (!feedReady && !isDemo) return
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

        const sync = googleSyncQueue.current.then(async () => {
          if (!syncAccountActive.current) return null
          const storedMeta = getStoredGoogleCalSyncMeta(accountKey)
          const result = await pushEventsToGoogleCalendar({
            accessToken: tokenData.accessToken,
            events: syncedCalendarEvents,
            settings: calSyncSettings,
            joinedCount,
            storedCalendarId: storedMeta?.calendarId || null,
          })
          const nextMeta = {
            connected: true,
            calendarId: result.calendarId,
            calendarTitle: result.calendarTitle,
            lastSyncedAt: result.syncedAt,
            syncedCount: result.syncedCount,
          }
          saveStoredGoogleCalSyncMeta(accountKey, nextMeta)
          setGoogleLiveMeta(nextMeta)
          return result
        })
        googleSyncQueue.current = sync.catch(() => {})
        const syncRes = await sync

        if (!silent && syncRes && syncAccountActive.current) {
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
      feedReady,
      isDemo,
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
      !feedReady ||
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
    feedReady,
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

  const dashboardLayout = normalizeDashboardLayout(userSettings?.dashboardLayout)
  const subscriptionForClub = id => {
    const key = normalizeClubKey(id)
    return Object.hasOwn(subscriptions, key) ? subscriptions[key] : DEFAULT_CLUB_SUBSCRIPTION
  }
  const dashboardCalendarProps = {
    clubs: effectiveClubs, joinedCount, userSettings, rsvpMap,
    onBrowseClubs: () => handleNavigate('clubs', { section: 'discover' }),
    onOpenDate: date => handleNavigate('calendar', { view: 'month', date }),
    onOpenEvent: event => handleNavigate('calendar', {
      view: 'month', date: event.dateKey,
      searchTarget: { type: 'event', id: String(event.id) },
    }),
  }
  const dashboardWidgets = activeNav === 'overview' ? {
    summary: <StatCards items={effectiveStats?.map(item => item.label === 'Upcoming Events'
      ? { ...item, value: visibleOverviewUpcomingCount } : item)}
      joinedCount={joinedCount} eventsCount={visibleOverviewUpcomingCount} linksCount={totalLinksCount} pollsCount={activePollCount}
      onNav={(target, options) => handleNavigate(target, target === 'clubs' ? { section: 'myclubs' } : options)} />,
    schedule: <CalendarView compact items={personalizedSchedule} {...dashboardCalendarProps}
      onOpenCalendar={() => handleNavigate('calendar')} />,
    announcements: <Announcements items={personalizedAnnouncements} onOpenAnnouncement={openAnnouncement}
      joinedCount={joinedCount} userSettings={userSettings} onNav={handleNavigate}
      onBrowseClubs={() => handleNavigate('clubs', { section: 'discover' })} />,
    clubs: <ClubsHub compact user={effectiveUser} isDemo={isDemo} items={effectiveClubs} clubsData={clubsData}
      hubDict={hubDict} userSettings={userSettings} onOpenClub={openClubLink} onNotify={showToast}
      onFindClubs={() => setDiscoveryOpen(true)} onViewJoined={() => handleNavigate('clubs', { section: 'myclubs' })} />,
    resources: <LinksResources compact isDemo={isDemo} items={liveLinks} clubs={effectiveClubs} userSettings={userSettings}
      localAdded={localAddedLinks} pinnedOverrides={pinnedLinkOverrides} onTogglePinOverride={handleTogglePinOverride}
      onOpenResources={() => handleNavigate('links')} onNotify={showToast} />,
    miniCalendar: <CalendarView compact miniCalendar items={memberScopedSchedule} {...dashboardCalendarProps} />,
  } : {}

  const clubId = clubPage?.clubId
  const profileClub = clubId ? effectiveClubs.find(club => String(club.id) === clubId) : null
  const profileRecord = profileClub ? hubDict[profileClub.id] : null
  const profileEvents = useMemo(() => {
    if (!profileClub) return []
    const workspaceEvents = profileClub.joined
      ? (workspaceFeed?.workspaceEvents || []).filter(event => event.source === 'workspace' && normalizeClubKey(event.clubId) === normalizeClubKey(profileClub.id))
      : []
    return [...(profileRecord?.events || []).filter(isPublicRecord), ...workspaceEvents]
      .filter(event => !event.cancelled && event.id && event.start && isEventUpcoming(event) &&
        !removedEventIds.has(event.id) && event.kind !== 'deadline')
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .map((event, index) => ({
        ...formatScheduleItem(event, index, hubDict),
        kind: event.kind,
        location: event.location ? cleanText(event.location) : '',
      }))
  }, [profileClub, profileRecord, removedEventIds, hubDict, workspaceFeed])
  const profileAnnouncements = useMemo(() => {
    if (!profileClub) return []
    const notices = profileClub.joined ? (workspaceFeed?.workspaceAnnouncements || [])
      .filter(item => normalizeClubKey(item.clubId) === normalizeClubKey(profileClub.id)) : []
    return [...(profileRecord?.announcements || []).filter(isPublicRecord), ...notices]
      .sort((a, b) => Date.parse(b.postedAt || b.createdAt) - Date.parse(a.postedAt || a.createdAt))
  }, [profileClub, profileRecord, workspaceFeed])
  const profilePeople = useMemo(() => publicPeople.filter(person => person.clubId === clubId), [publicPeople, clubId])
  const profilePosts = useMemo(() => {
    if (!profileClub) return []
    const local = profileClub.joined ? localClubPosts.filter(post => post.clubId === clubId) : []
    return [...local, ...(profileRecord?.posts || [])]
      .sort((a, b) => new Date(b.postedAt || 0) - new Date(a.postedAt || 0))
  }, [clubId, profileClub, profileRecord, localClubPosts])
  const profileResources = useMemo(() => (liveLinks || []).filter(link =>
    clubId && String(link.clubId) === clubId && isPublicRecord(link) &&
    !['email', 'discord', 'instagram'].includes(link.kind)
  ), [clubId, liveLinks])

  const clubTitle = clubPage ? (profileClub ? cleanText(profileClub.name) : catalogLoaded ? 'Club unavailable' : 'Loading club…') : ''

  const titleInputsRef = useRef({
    activeNav,
    calendarSection,
    searchQuery,
    upcomingCount: visibleOverviewUpcomingCount,
    joinedCount,
    inAppRsvpOnly: calSyncSettings.inAppRsvpOnly,
    clubTitle,
    clubSection: clubPage?.section,
  })
  titleInputsRef.current = {
    activeNav,
    calendarSection,
    searchQuery,
    upcomingCount: visibleOverviewUpcomingCount,
    joinedCount,
    inAppRsvpOnly: calSyncSettings.inAppRsvpOnly,
    clubTitle,
    clubSection: clubPage?.section,
  }

  const handlePageContextChange = useCallback(nextSubContext => {
    pageSubContextRef.current = nextSubContext
    if (typeof document === 'undefined') return
    const cur = titleInputsRef.current
    document.title = buildDashboardPageTitle({
      activeNav: cur.activeNav,
      calendarSection: cur.calendarSection,
      subContext: nextSubContext,
      searchQuery: cur.searchQuery,
      upcomingCount: cur.upcomingCount,
      joinedCount: cur.joinedCount,
      inAppRsvpOnly: cur.inAppRsvpOnly,
      clubTitle: cur.clubTitle,
      clubSection: cur.clubSection,
    })
  }, [])

  // Synchronize browser tab page title with the live state of ClubHub
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.title = buildDashboardPageTitle({
      activeNav,
      calendarSection,
      subContext: pageSubContextRef.current,
      searchQuery,
      upcomingCount: visibleOverviewUpcomingCount,
      joinedCount,
      inAppRsvpOnly: calSyncSettings.inAppRsvpOnly,
      clubTitle,
      clubSection: clubPage?.section,
    })
  }, [
    activeNav,
    searchQuery,
    visibleOverviewUpcomingCount,
    calendarSection,
    joinedCount,
    calSyncSettings.inAppRsvpOnly,
    clubTitle,
    clubPage?.section,
  ])

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Floating Non-Shifting Toast Notifications */}
      <ToastViewport toast={toast} onDismiss={() => setToast(null)} />

      {/* Fixed Left Sidebar (Desktop) & Bottom Bar (Mobile) */}
      <Sidebar activeNav={visibleNav}
        onNav={target => handleNavigate(target, target === 'calendar' ? { useCalendarPreference: true } : undefined)} />

      <Header key={`header_${accountKey}_${resetGeneration}`}
        searchSources={searchSources}
        onSearchSelect={selectSearchResult}
        restoreSearchKey={restoreSearchKey}
        activeNav={visibleNav}
        onNav={handleNavigate}
        user={effectiveUser}
        userSettings={userSettings}
        isDemo={isDemo}
        onExitDemo={onExitDemo}
        onSignOut={onSignOut}
        announcements={personalizedAnnouncements}
        onOpenAnnouncement={openAnnouncement}
        joinedCount={joinedCount}
      />

      <ClubDiscoveryDialog key={`discovery_${accountKey}_${resetGeneration}`}
        open={discoveryOpen} onClose={() => setDiscoveryOpen(false)}
        clubs={effectiveClubs} events={memberScopedSchedule}
        userMajor={userSettings?.major}
        onViewClub={(route, focus) => openClubPage(route, { discovery: focus?.getAttribute('href') })}
        onViewEvent={event => {
          setDiscoveryOpen(false)
          selectSearchResult('event', event)
        }}
      />

      <main className="workspace-main w-full min-w-0 lg:pl-[var(--sidebar-width)]">
        <div className="app-content page-stack max-w-[var(--content-max-width)] mx-auto">
          {clubPage && <div className="view-enter page-stack">
            <ClubPage key={clubPage.clubId} route={clubPage} club={profileClub}
              loading={!catalogLoaded} record={profileRecord} events={profileEvents} posts={profilePosts}
              resources={profileResources} publishedPeople={profilePeople} user={effectiveUser}
              announcements={profileAnnouncements} onDismissNotice={() => setSearchTarget(null)}
              selectedNoticeId={searchTarget?.type === 'announcement' ? searchTarget.id : ''}
              subscription={subscriptionForClub(profileClub?.id)}
              subscriptionReady={isDemo || Boolean(workspaceFeed)}
              subscriptionLoadError={workspaceFeedError} subscriptionBrowserOnly={workspaceFeed?.subscriptionsBrowserOnly} onReloadSubscriptions={reloadFeed}
              onSaveSubscription={saveSubscription}
              canPublishEvent={workspaceFeed?.boardClubIds?.includes(normalizeClubKey(profileClub?.id))}

              use24h={userSettings?.timeFormat === '24h'}
              onOpen={openClubLink} onBack={backFromClub} onMembershipChange={toggleJoinClub}
              onMembershipConfirmed={rememberConfirmedMembership}
              onEvent={event => handleNavigate('calendar', { searchTarget: { type: 'event', id: String(event.id), publicEvent: event } })}
              onTaskBoard={id => handleNavigate('tasks', { clubId: id })}
              onResource={resource => selectSearchResult('resource', resource)}
              onRefreshAnnouncements={loadWorkspaceState} onNotify={showToast}
            />
          </div>}
          <div hidden={Boolean(clubPage)}>
          <div key={`${activeNav}_${resetGeneration}`} className={activeNav === 'overview' ? 'page-stack' : 'view-enter page-stack'}>
          {/* ── 1. OVERVIEW ── */}
          {activeNav === 'overview' && (
            <div className="page-stack">
              <PageToolbar title={`Welcome, ${greeting}`} actions={<>
                <FindClubsButton onClick={() => setDiscoveryOpen(true)} />
                <Button size="sm" variant="outlined-neutral" onClick={() => setManagingSubscriptions(true)}>Subscriptions</Button>
                <Button size="sm" variant="outlined-neutral" onClick={() => setEditingDashboard(true)}>Customize dashboard</Button>
              </>} />
              <DashboardGrid sections={dashboardLayout.sections} widgets={dashboardWidgets} />
              {managingSubscriptions && !clubPage && <ClubSubscriptionManager clubs={joinedClubsList}
                subscriptions={subscriptionForClub} ready={isDemo || feedReady} loadError={workspaceFeedError} browserOnly={workspaceFeed?.subscriptionsBrowserOnly}
                onReload={reloadFeed} onSave={saveSubscription} onClose={() => setManagingSubscriptions(false)} />}
              {editingDashboard && !clubPage && <DashboardEditor sections={dashboardLayout.sections}
                onClose={() => setEditingDashboard(false)}
                onSave={dashboardLayout => {
                  onUpdateSettings({ dashboardLayout })
                  setEditingDashboard(false)
                }} />}
            </div>
          )}

          {activeNav === 'settings' && <PageToolbar title="Settings" />}

          {/* ── 4B. MONDAY.COM-STYLE CLUB TASK BOARD ── */}
          {activeNav === 'tasks' && (
            <ClubTaskBoard
              key={`tasks_${resetGeneration}`}
              user={effectiveUser}
              accountKey={accountKey}
              accountEmail={accountEmail}
              userSettings={userSettings}
              isDemo={isDemo}
              clubs={effectiveClubs}
              joinedClubIds={joinedClubIds}
              demoFavoriteClubIds={demoFavoriteClubIds}
              onDemoFavoritesChange={setDemoFavoriteClubIds}
              initialClubId={tasksInitialClubId}
              onClubJoined={loadWorkspaceState}
              onSyncMemberships={loadWorkspaceMemberships}
              onOpenClubsRbac={cid => handleNavigate('clubs', { clubSection: 'roles', clubId: cid })}
              onBrowseClubs={() => handleNavigate('clubs', { section: 'discover' })}
              onOpenSettings={() => handleNavigate('settings', { section: 'integrations' })}
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
              searchQuery={pageFilters.links || ''}
              onSearchChange={value => setPageFilter('links', value)}
              searchTarget={searchTarget}
              onDismissSearchTarget={() => setSearchTarget(null)}
              onRefresh={loadBackendData}
              localAdded={localAddedLinks}
              onAddLocalLink={handleAddLocalLink}
              pinnedOverrides={pinnedLinkOverrides}
              onTogglePinOverride={handleTogglePinOverride}
              onPageContextChange={handlePageContextChange}
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
              initialSection={settingsInitialSection}
              userSettings={userSettings}
              onUpdateSettings={onUpdateSettings}
              onSetThemeMode={onSetExplicitThemeMode}
              clubs={effectiveClubs}
              events={memberScopedSchedule}
              calendarIntegration={calendarIntegration}
              onRefresh={loadBackendData}
              onResetLocalData={handleResetLocalData}
              onNotify={showToast}
            />
          )}
          </div>
          </div>
          {calendarVisited && (
            <div key={`calendar_${accountKey}_${resetGeneration}`} hidden={!calendarVisible}>
              <div className="view-enter page-stack destination-accent" data-accent="calendar">
                <PageToolbar title="Calendar" />
                <SegmentedControl ariaLabel="Calendar section" value={calendarSection}
                  options={[{ value: 'schedule', label: 'Schedule' }, { value: 'availability', label: 'Availability' }]}
                  onChange={section => {
                    if (section !== calendarSection) handleNavigate('calendar', { calendarSection: section })
                  }} />
                <div hidden={!scheduleVisible}>
                  <CalendarView
                    visible={scheduleVisible}
                    items={memberScopedSchedule}
                    clubs={effectiveClubs}
                    joinedCount={joinedCount}
                    position={calendarPosition}
                    userSettings={userSettings}
                    onUpdateSettings={onUpdateSettings}
                    calendarIntegration={calendarIntegration}
                    onPageContextChange={scheduleVisible ? handlePageContextChange : undefined}
                    searchQuery={pageFilters.calendar || ''}
                    onSearchChange={value => setPageFilter('calendar', value)}
                    searchTarget={scheduleVisible && !removedEventIds.has(searchTarget?.id) ? searchTarget : null}
                    onDismissSearchTarget={() => setSearchTarget(null)}
                    rsvpMap={rsvpMap}
                    onToggleRsvp={handleToggleRsvp}
                    onAddEvent={handleAddCalendarEvent}
                    onDeleteEvent={handleDeleteCalendarEvent}
                    onBrowseClubs={() => handleNavigate('clubs', { section: 'discover' })}
                    onNotify={showToast}
                  />
                </div>
                {availabilityVisited && <div hidden={!availabilityVisible}>
                  <AvailabilityView
                    visible={availabilityVisible}
                    pollRequest={pollRequest}
                    user={effectiveUser}
                    accountKey={accountKey}
                    isDemo={isDemo}
                    clubs={effectiveClubs}
                    userSettings={userSettings}
                    events={combinedRawEvents}
                    onEventBooked={async () => { await Promise.all([loadBackendData(), reloadFeed()]) }}
                    onAddLocalEvent={handleAddLocalCollabEvent}
                    onRemoveLocalEvent={handleRemoveLocalCollabEvent}
                    onOpenCalendar={openBookedEvent}
                    onOpenSettings={() => handleNavigate('settings', { section: 'integrations' })}
                    onPageContextChange={availabilityVisible ? handlePageContextChange : undefined}
                    onNotify={showToast}
                  />
                </div>}
              </div>
            </div>
          )}

          {/* ── 4. CLUBS & COMMUNITY ── */}
          {clubsVisited && (
            <div hidden={Boolean(clubPage) || activeNav !== 'clubs'}>
            <ClubsHub
              key={`clubs_${resetGeneration}`}
              accountKey={accountKey}
              items={effectiveClubs}
              clubsData={clubsData}
              hubDict={hubDict}
              initialSection={clubsInitialSection}
              sectionRevision={clubsSectionRevision}
              onOpenClub={openClubLink}
              userSettings={userSettings}
              searchQuery={pageFilters.clubs || ''}
              onSearchChange={value => setPageFilter('clubs', value)}
              searchTarget={searchTarget}
              publicPeople={publicPeople}
              selectedAnnouncement={selectedAnnouncement}
              personalAnnouncements={personalizedAnnouncements} onOpenAnnouncement={openAnnouncement}
              onFindClubs={() => setDiscoveryOpen(true)}
              onDismissSearchTarget={() => setSearchTarget(null)}
              onRefresh={loadBackendData}
              onOpenSettings={() => handleNavigate('settings', { section: 'integrations' })}
              localPosts={localClubPosts}
              onAddLocalPost={handleAddLocalClubPost}
              onPageContextChange={activeNav === 'clubs' && !clubPage ? handlePageContextChange : undefined}
              onNotify={showToast}
            />
            </div>
          )}

        </div>
      </main>
    </div>
  )
}

function useAccountTheme(clerkUser, localUser) {
  const emailAddress = clerkUser ? clerkUser.primaryEmailAddress?.emailAddress : localUser?.email
  const email = emailAddress?.trim().toLowerCase() || ''
  const clerkKey = clerkUser?.id ? `clerk:${clerkUser.id}` : null
  const emailKey = email ? `email:${email}` : null
  const accountKey = clerkKey || emailKey
  const [selection, setSelection] = useState(null)
  const map = getAccountThemeMap()
  const emailMode = emailKey ? map[emailKey] : undefined
  const metadataMode = clerkUser?.unsafeMetadata?.themeMode
  const knownMode = (clerkUser
    ? [map[clerkKey], emailMode, metadataMode]
    : [emailMode, localUser?.themeMode]).find(isValidThemeMode)
  const selectedMode = selection?.key === accountKey ? selection?.mode : undefined

  useEffect(() => {
    setSelection(previous => previous?.key === accountKey ? previous : null)
  }, [accountKey])

  useEffect(() => {
    if (!accountKey || selectedMode) return
    if (knownMode) {
      saveAccountThemeForKeys([clerkKey, emailKey], knownMode)
      if (clerkUser && metadataMode !== knownMode) {
        clerkUser.update({
          unsafeMetadata: { ...clerkUser.unsafeMetadata, themeMode: knownMode },
        }).catch(() => {})
      }
      return
    }
    if (!email) return

    let cancelled = false
    getWorkspaceMe()
      .then(({ user: profile } = {}) => {
        if (cancelled || profile?.email?.trim().toLowerCase() !== email || !isValidThemeMode(profile.themeMode)) return
        const saved = getAccountThemeMap()
        if (isValidThemeMode(saved[accountKey]) || isValidThemeMode(saved[emailKey])) return
        saveAccountThemeForKeys([clerkKey, emailKey], profile.themeMode)
        setSelection({ key: accountKey, mode: profile.themeMode })
        if (clerkUser) {
          clerkUser.update({
            unsafeMetadata: { ...clerkUser.unsafeMetadata, themeMode: profile.themeMode },
          }).catch(() => {})
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [accountKey, clerkKey, clerkUser, email, emailKey, knownMode, metadataMode, selectedMode])

  function rememberMode(mode) {
    if (!accountKey) return
    saveAccountThemeForKeys([clerkKey, emailKey], mode)
    setSelection({ key: accountKey, mode })
  }

  return { mode: selectedMode || knownMode || 'system', rememberMode }
}

function usePageTheme(mode) {
  const [systemDark, setSystemDark] = useState(getSystemPrefersDark)

  useLayoutEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const syncFromSystem = () => {
      setSystemDark(Boolean(mq.matches))
    }
    const onChange = e => {
      setSystemDark(Boolean(e.matches))
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
  }, [])

  const dark = mode === 'system' ? systemDark : mode === 'dark'
  useLayoutEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', dark)
    root.classList.toggle('light', !dark)
    root.style.colorScheme = dark ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#151A24' : '#F1F6FE')
  }, [dark])

}

function ClerkAppWrapper(props) {
  const { isLoaded, isSignedIn, user } = useUser()
  const { sessionId } = useAuth()
  const { signOut } = useClerk()
  return (
    <WorkspaceEntry
      {...props}
      hasClerk
      clerkLoading={!isLoaded}
      clerkUser={isLoaded && isSignedIn && sessionId ? user : null}
      clerkSessionId={sessionId}
      signOutClerk={signOut}
    />
  )
}

function WorkspaceEntry({
  localUser,
  localLoading,
  onLocalSignIn,
  onLocalSignOut,
  legacySettingsEmail,
  hasClerk = false,
  clerkLoading = false,
  clerkUser = null,
  clerkSessionId,
  signOutClerk,
}) {
  const [admission, setAdmission] = useState(null)
  const [rememberedAdmission, setRememberedAdmission] = useState(readWorkspaceAdmission)
  const [clerkCompletion, setClerkCompletion] = useState(null)
  const [demoSettings, setDemoSettings] = useState(createDemoUserSettings)
  const [switchingAccount, setSwitchingAccount] = useState(false)
  const [ignoredSession, setIgnoredSession] = useState(null)
  const [notice, setNotice] = useState('')
  const [entry] = useState(() => {
    const url = new URL(window.location.href)
    const callback = ['sso-callback', 'sso-complete', 'sso-continue'].find(key => url.searchParams.has(key))
    const oauth = readOAuthEntry(url.searchParams.get(callback))
    return { callback, oauth, destination: oauth?.destination || readWorkspaceDestination(url) }
  })
  const [callbackSettled, setCallbackSettled] = useState(false)
  const destination = useRef(entry.destination)
  const availableClerkUser = ignoredSession === clerkSessionId ? null : clerkUser
  const remembered = admission || (!entry.callback && !switchingAccount ? rememberedAdmission : null)
  const chooseLocal = (remembered?.provider === 'local' && Boolean(localUser)) || !availableClerkUser
  const candidate = chooseLocal ? localUser : availableClerkUser
  const identity = candidate?.id ? `${chooseLocal ? 'local' : 'clerk'}:${candidate.id}` : null
  const admitted = canResumeWorkspace(remembered, identity, clerkSessionId)
  const restoring = !admitted && !admission && remembered?.expiresAt > Date.now() &&
    (remembered.provider === 'clerk' ? clerkLoading : localLoading)
  const demo = admission?.provider === 'demo'
  const callback = callbackSettled ? null : entry.callback
  const accountTheme = useAccountTheme(admitted && !chooseLocal ? candidate : null, admitted && chooseLocal ? candidate : null)
  usePageTheme(admitted ? accountTheme.mode : demo ? demoSettings.themeMode : 'system')
  const email = (candidate?.primaryEmailAddress?.emailAddress || candidate?.email || '').toLowerCase()
  const settingsKey = admitted ? `${USER_SETTINGS_STORAGE_KEY}:${email || identity}` : null
  const [settingsState, setSettingsState] = useState(null)
  const userSettings = settingsState?.key === settingsKey ? settingsState.settings : settingsKey
    ? getStoredUserSettings(settingsKey, email === legacySettingsEmail ? USER_SETTINGS_STORAGE_KEY : null)
    : DEFAULT_USER_SETTINGS

  useLayoutEffect(() => {
    const root = document.documentElement
    if (!admitted && !demo) {
      root.classList.remove('theme-ready')
      return
    }
    const frame = requestAnimationFrame(() => root.classList.add('theme-ready'))
    return () => cancelAnimationFrame(frame)
  }, [admitted, demo])

  function updateSettings(patch) {
    const settings = {
      ...userSettings,
      ...patch,
      channels: patch.channels ? { ...userSettings.channels, ...patch.channels } : userSettings.channels,
      calendarSync: patch.calendarSync
        ? normalizeCalendarSyncSettings({ ...userSettings.calendarSync, ...patch.calendarSync })
        : userSettings.calendarSync,
    }
    setSettingsState({ key: settingsKey, settings })
    writeLocalJson(settingsKey, settings)
  }

  const enterWorkspace = useCallback((next, sessionId, profile) => {
    const target = destination.current
    clearOAuthEntry()
    replaceEntryUrl(target)
    try { sessionStorage.removeItem(PENDING_POLL_SESSION_KEY) } catch { /* Optional storage. */ }
    const receipt = workspaceAdmission(next, sessionId, profile)
    if (receipt.provider === 'clerk') clearWorkspaceSession()
    storeWorkspaceAdmission(receipt)
    setRememberedAdmission(receipt)
    setAdmission(receipt)
    setCallbackSettled(true)
  }, [])

  useEffect(() => {
    if (!admitted) return
    const timer = setTimeout(() => {
      const expired = { ...remembered, expiresAt: 0 }
      storeWorkspaceAdmission(expired)
      setRememberedAdmission(expired)
      setAdmission(null)
    }, Math.max(0, remembered.expiresAt - Date.now()))
    return () => clearTimeout(timer)
  }, [admitted, remembered])

  useLayoutEffect(() => {
    if (!admission || demo || admitted) return
    if (admission.provider === 'clerk') clearWorkspaceSession()
    storeWorkspaceAdmission(null)
    setRememberedAdmission(previous => previous ? { ...previous, expiresAt: 0 } : previous)
    setAdmission(null)
  }, [admission, demo, admitted])

  useEffect(() => {
    if (!clerkCompletion || clerkCompletion !== clerkSessionId || !availableClerkUser) return
    setClerkCompletion(null)
    if (callback && !entry.oauth) return
    enterWorkspace(`clerk:${availableClerkUser.id}`, clerkSessionId, availableClerkUser)
  }, [clerkCompletion, clerkSessionId, availableClerkUser, callback, entry.oauth, enterWorkspace])

  useEffect(() => {
    if (!callback) return
    const fail = () => {
      clearOAuthEntry()
      replaceEntryUrl(destination.current)
      setCallbackSettled(true)
      setNotice('Google sign-in was interrupted. Please try again.')
    }
    if (!hasClerk || !entry.oauth) {
      fail()
      return
    }
    if (callback === 'sso-complete' && availableClerkUser && clerkSessionId !== entry.oauth.sessionId) {
      enterWorkspace(`clerk:${availableClerkUser.id}`, clerkSessionId, availableClerkUser)
      return
    }
    const timer = setTimeout(fail, 12000)
    return () => clearTimeout(timer)
  }, [availableClerkUser, callback, clerkSessionId, enterWorkspace, entry.oauth, hasClerk])

  const signOut = useCallback(async ({ preserveDestination = false, silent = false } = {}) => {
    if (switchingAccount) return
    setSwitchingAccount(true)
    if (silent && rememberedAdmission) {
      const expired = { ...rememberedAdmission, expiresAt: 0 }
      storeWorkspaceAdmission(expired)
      setRememberedAdmission(expired)
    } else {
      storeWorkspaceAdmission(null)
      setRememberedAdmission(null)
    }
    setAdmission(null)
    setClerkCompletion(null)
    setCallbackSettled(true)
    setIgnoredSession(clerkSessionId ?? null)
    setNotice(silent ? 'Your session expired. Please sign in again.' : '')
    clearOAuthEntry()
    if (!preserveDestination) destination.current = ''
    replaceEntryUrl(destination.current)
    try { sessionStorage.removeItem(PENDING_POLL_SESSION_KEY) } catch { /* Optional storage. */ }
    try {
      await onLocalSignOut()
      if (availableClerkUser) await signOutClerk({ sessionId: clerkSessionId })
    } catch {
      setNotice('Could not end the previous session. Please try signing in again.')
    } finally {
      setSwitchingAccount(false)
    }
  }, [availableClerkUser, clerkSessionId, onLocalSignOut, rememberedAdmission, signOutClerk, switchingAccount])

  function persistThemeMode(nextMode) {
    const mode = normalizeThemeMode(nextMode)
    accountTheme.rememberMode(mode)
    if (!chooseLocal) {
      candidate.update({
        unsafeMetadata: { ...candidate.unsafeMetadata, themeMode: mode },
      }).catch(() => {})
    }
    persistBackendAccountTheme(mode)
  }

  function updateDemoSettings(patch) {
    setDemoSettings(prev => ({
      ...prev,
      ...patch,
      channels: patch.channels ? { ...prev.channels, ...patch.channels } : prev.channels,
      calendarSync: patch.calendarSync
        ? normalizeCalendarSyncSettings({ ...prev.calendarSync, ...patch.calendarSync })
        : prev.calendarSync,
    }))
  }

  if (admitted || demo) {
    return (
      <MainDashboard
        key={demo ? 'demo' : identity}
        legacySettingsEmail={legacySettingsEmail}
        onSetExplicitThemeMode={demo ? mode => updateDemoSettings({ themeMode: normalizeThemeMode(mode) }) : persistThemeMode}
        userSettings={demo ? demoSettings : { ...userSettings, themeMode: accountTheme.mode }}
        onUpdateSettings={demo ? updateDemoSettings : updateSettings}
        user={admitted ? candidate : null}
        isDemo={demo}
        onExitDemo={demo ? () => {
          setAdmission(null)
          replaceEntryUrl(destination.current)
        } : undefined}
        onSignOut={admitted ? signOut : undefined}
        hasClerkKey={admitted && !chooseLocal}
      />
    )
  }

  if (restoring) return <div className="min-h-screen grid place-items-center bg-[var(--bg)] text-[var(--text)]">
    <p role="status">Restoring your session…</p>
  </div>

  const baseUrl = window.location.origin + window.location.pathname
  if (entry.oauth && (callback === 'sso-callback' || callback === 'sso-complete')) {
    const complete = `${baseUrl}?sso-complete=${entry.oauth.nonce}`
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg)] text-[var(--text)] gap-3">
        <p role="status">Completing Google sign-in…</p>
        <Button variant="text" onClick={() => {
          clearOAuthEntry()
          replaceEntryUrl(destination.current)
          setCallbackSettled(true)
        }}>Cancel</Button>
        {callback === 'sso-callback' && hasClerk && (
          <AuthenticateWithRedirectCallback
            signInForceRedirectUrl={complete}
            signUpForceRedirectUrl={complete}
            signInFallbackRedirectUrl={complete}
            signUpFallbackRedirectUrl={complete}
            continueSignUpUrl={`${baseUrl}?sso-continue=${entry.oauth.nonce}`}
          />
        )}
      </div>
    )
  }

  return (
    <SignInPage
      hasPublishableKey={hasClerk}
      initialError={notice}
      returningUser={switchingAccount || clerkLoading ? null : candidate}
      switchingAccount={switchingAccount}
      lastAccount={rememberedAdmission}
      onContinue={() => identity && enterWorkspace(identity, clerkSessionId, candidate)}
      onSwitchAccount={() => signOut({ preserveDestination: true })}
      onEnterDemo={() => {
        setDemoSettings(createDemoUserSettings())
        replaceEntryUrl()
        setAdmission({ provider: 'demo' })
      }}
      onLocalSignIn={profile => {
        onLocalSignIn(profile)
        enterWorkspace(`local:${profile.id}`, null, profile)
      }}
      onClerkSignIn={sessionId => {
        if (ignoredSession === sessionId) setIgnoredSession(null)
        setClerkCompletion(sessionId)
      }}
      onStartOAuth={() => {
        const nonce = startOAuthEntry(destination.current, clerkSessionId)
        return {
          redirectUrl: `${baseUrl}?sso-callback=${nonce}`,
          redirectUrlComplete: `${baseUrl}?sso-complete=${nonce}`,
        }
      }}
      onCancelOAuth={() => clearOAuthEntry()}
    />
  )
}

const DEFAULT_CLERK_KEY = (
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
  import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  ''
).trim()

export default function App({ hasClerkKey = isValidClerkPublishableKey(DEFAULT_CLERK_KEY) }) {
  const [localUser, setLocalUser] = useState(null)
  const [localLoading, setLocalLoading] = useState(true)
  const authRevision = useRef(0)
  const [legacySettingsEmail] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(AUTH_USER_SESSION_KEY))?.email?.toLowerCase() || '' }
    catch { return '' }
  })

  useEffect(() => {
    let active = true
    const revision = authRevision.current
    getWorkspaceMe()
      .then(res => {
        if (!active || authRevision.current !== revision) return
        if (res?.sessionExpired && !(typeof window !== 'undefined' && window.Clerk?.user?.id)) {
          setLocalUser(null)
          try {
            sessionStorage.removeItem(AUTH_USER_SESSION_KEY)
          } catch {
            // Ignore storage errors
          }
          return
        }
        if (!res?.ok || !res.user?.id || window.Clerk?.user?.id) return
        setLocalUser({
          id: res.user.id,
          email: res.user.email,
          fullName: res.user.fullName || res.user.displayName || res.user.email,
          avatarBg: res.user.avatarBg,
          themeMode: res.user.themeMode,
        })
      })
      .catch(() => {})
      .finally(() => { if (active && authRevision.current === revision) setLocalLoading(false) })
    return () => {
      active = false
    }
  }, [])

  const handleLocalSignIn = useCallback(profile => {
    authRevision.current += 1
    setLocalUser(profile)
    setLocalLoading(false)
  }, [])

  const handleLocalSignOut = useCallback(async () => {
    authRevision.current += 1
    setLocalUser(null)
    setLocalLoading(false)
    try {
      sessionStorage.removeItem(AUTH_USER_SESSION_KEY)
      localStorage.removeItem('clubhub_auth_user_v1')
    } catch {
      // Ignore storage errors
    }
    await logoutWorkspaceSession()
  }, [])

  if (hasClerkKey) {
    return (
      <ClerkAppWrapper
        legacySettingsEmail={legacySettingsEmail}
        localUser={localUser}
        localLoading={localLoading}
        onLocalSignIn={handleLocalSignIn}
        onLocalSignOut={handleLocalSignOut}
      />
    )
  }

  return (
    <WorkspaceEntry
      legacySettingsEmail={legacySettingsEmail}
      localUser={localUser}
      localLoading={localLoading}
      onLocalSignIn={handleLocalSignIn}
      onLocalSignOut={handleLocalSignOut}
    />
  )
}
