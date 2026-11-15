import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useUser, AuthenticateWithRedirectCallback } from '@clerk/react'
import { Clock, ArrowRight } from 'lucide-react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import StatCards from './components/StatCards'
import CalendarView from './components/CalendarView'
import AvailabilityView from './components/AvailabilityView'
import Announcements from './components/Announcements'
import ClubsHub from './components/ClubsHub'
import LinksResources from './components/LinksResources'
import SignInPage from './components/SignInPage'
import { Card, IconBadge, cleanText } from './components/ui'
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
} from './api/client'

const AUTH_USER_STORAGE_KEY = 'clubhub_auth_user'
const EMAIL_ACCOUNTS_KEY = 'clubhub_registered_accounts_v2'
const ACCOUNT_THEMES_STORAGE_KEY = 'clubhub_account_themes_v1'
const GUEST_THEME_STORAGE_KEY = 'clubhub_guest_dark_v1'
const LAST_ACTIVE_ACCOUNT_KEY = 'clubhub_last_active_account_v1'
const RSVP_STORAGE_KEY = 'clubhub_event_rsvps_v1'

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

function saveAccountThemeForKeys(keys, isDark) {
  try {
    const map = getAccountThemeMap()
    keys.filter(Boolean).forEach(k => {
      map[k] = Boolean(isDark)
    })
    localStorage.setItem(ACCOUNT_THEMES_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Ignore storage errors
  }
}

function getGuestTheme() {
  try {
    const raw = localStorage.getItem(GUEST_THEME_STORAGE_KEY)
    if (raw === 'true') return true
    if (raw === 'false') return false
  } catch {
    // Ignore storage errors
  }
  return false
}

function saveGuestTheme(isDark) {
  try {
    localStorage.setItem(GUEST_THEME_STORAGE_KEY, String(Boolean(isDark)))
  } catch {
    // Ignore storage errors
  }
}

function persistBackendAccountTheme(email, isDark) {
  if (!email) return
  setDictKey(
    `user_theme:${email.toLowerCase()}`,
    { darkMode: Boolean(isDark), updatedAt: new Date().toISOString() },
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

const CLUB_AVATAR_GRADIENTS = [
  'linear-gradient(135deg, var(--blue), #4B7BE5)',
  'linear-gradient(135deg, var(--red), #D46B6B)',
  'linear-gradient(135deg, var(--purple), #8565C4)',
  'linear-gradient(135deg, var(--green), #4CA868)',
  'linear-gradient(135deg, var(--teal), #3E9B92)',
  'linear-gradient(135deg, var(--yellow), #E09F2D)',
]

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

function formatScheduleItem(e, index = 0) {
  const palette = ['blue', 'green', 'purple', 'yellow', 'teal']
  const isBookedCollab = String(e.id || '').startsWith('collab_evt_')
  const startDate = new Date(e.start)
  const timeLabel = e.allDay
    ? `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} (All Day)`
    : startDate.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })

  return {
    id: e.id,
    club: cleanText(e.clubName || e.clubId || 'Campus Club'),
    event: cleanText(e.title),
    time: timeLabel,
    location: cleanText(e.location || 'TBD'),
    duration: isBookedCollab
      ? 'Scheduled from Availability Poll'
      : e.recurring
        ? `Every ${e.recurring}`
        : '',
    color: isBookedCollab ? 'green' : palette[index % palette.length],
    isBookedCollab,
    isCustom: Boolean(e.isCustom),
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
  user = null,
  isDemo = false,
  onExitDemo,
  onSignOut,
  hasClerkKey = false,
}) {
  const [activeNav, setActiveNav] = useState('overview')
  const [searchQuery, setSearchQuery] = useState('')
  const [clubsData, setClubsData] = useState(initialClubs)
  const [linksCount, setLinksCount] = useState(fallbackLinks.length)
  const [rsvpMap, setRsvpMap] = useState(getStoredRsvps)

  const [hubDict, setHubDict] = useState(STATIC_HUB_FALLBACK)
  const [liveAnnouncements, setLiveAnnouncements] = useState(null)
  const [liveClubs, setLiveClubs] = useState(null)
  const [liveSchedule, setLiveSchedule] = useState(null)
  const [rawEvents, setRawEvents] = useState([])
  const [localAddedEvents, setLocalAddedEvents] = useState([])
  const [removedEventIds, setRemovedEventIds] = useState(() => new Set())
  const [liveLinks, setLiveLinks] = useState(null)
  const [localAddedLinks, setLocalAddedLinks] = useState([])
  const [pinnedLinkOverrides, setPinnedLinkOverrides] = useState({})
  const [localClubPosts, setLocalClubPosts] = useState([])
  const [liveStats, setLiveStats] = useState(null)

  const loadBackendData = useCallback(async () => {
    let [hub, anns, evts, lnks, dbStats] = await Promise.all([
      getClubHub(),
      getAnnouncements({ limit: 8 }),
      getEvents(),
      getLinks(),
      getStats(),
    ])

    // If backend server (port 3001) is offline (e.g. on GitHub Pages), load exported static snapshot
    if (!hub) {
      const snap = await getStaticSnapshot()
      if (snap) {
        hub = snap.hub || null
        anns = Array.isArray(snap.announcements) ? snap.announcements.slice(0, 8) : null
        evts = Array.isArray(snap.events) ? snap.events : null
        lnks = Array.isArray(snap.links) ? snap.links : null
        dbStats = snap.stats || null
      }
    }

    if (hub && Object.keys(hub).length > 0) {
      setHubDict(hub)
      const mappedClubs = Object.values(hub).map((c, idx) => {
        const nextEvent = (c.events || [])[0]
        const scheduleStr = nextEvent
          ? `${new Date(nextEvent.start).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}${nextEvent.location ? ' · ' + nextEvent.location : ''}`
          : `@${c.instagram}`

        const nameLower = `${c.name || ''} ${c.id || ''}`.toLowerCase()
        const gradient = nameLower.includes('debate')
          ? CLUB_AVATAR_GRADIENTS[1]
          : nameLower.includes('art')
            ? CLUB_AVATAR_GRADIENTS[2]
            : nameLower.includes('cs') || nameLower.includes('computer')
              ? CLUB_AVATAR_GRADIENTS[0]
              : CLUB_AVATAR_GRADIENTS[idx % CLUB_AVATAR_GRADIENTS.length]

        return {
          id: c.id,
          name: cleanText(c.name),
          abbr: (c.name || 'CL')
            .split(' ')
            .map(w => w[0])
            .join('')
            .slice(0, 2)
            .toUpperCase(),
          members: c.followers || 0,
          category: c.category || 'academic',
          description: (c.posts || [])[0]?.summary
            ? cleanText((c.posts || [])[0].summary)
            : '',
          tags: [
            ...(c.instagram ? [{ label: `@${c.instagram}`, color: 'blue' }] : []),
            ...(c.category ? [{ label: c.category, color: 'purple' }] : []),
          ],
          schedule: cleanText(scheduleStr),
          avatarBg: gradient,
          active: true,
          joined: true,
        }
      })
      if (mappedClubs.length > 0) {
        const mappedNames = new Set(
          mappedClubs.map(mc => (mc.name || '').toLowerCase().trim())
        )
        const extraDiscoverClubs = initialClubs
          .filter(ic => !mappedNames.has((ic.name || '').toLowerCase().trim()))
          .map(ic => ({ ...ic, joined: false }))

        setLiveClubs(prev => {
          const prevJoinedMap = new Map((prev || []).map(p => [p.id, p.joined]))
          return [...mappedClubs, ...extraDiscoverClubs].map(club =>
            prevJoinedMap.has(club.id)
              ? { ...club, joined: prevJoinedMap.get(club.id) }
              : club
          )
        })
      }
    }

    if (evts && evts.length > 0) {
      setRawEvents(evts)
      const sortedEvts = [...evts].sort((a, b) => {
        const aBooked = String(a.id || '').startsWith('collab_evt_') ? 1 : 0
        const bBooked = String(b.id || '').startsWith('collab_evt_') ? 1 : 0
        if (aBooked !== bBooked) return bBooked - aBooked
        return new Date(a.start).getTime() - new Date(b.start).getTime()
      })
      setLiveSchedule(sortedEvts.map((e, i) => formatScheduleItem(e, i)))
    }

    if (anns && anns.length > 0) {
      setLiveAnnouncements(
        anns.map(a => {
          const src = a.source || 'instagram'
          const isDiscord = src === 'discord'
          const isStory = src === 'instagram_story'
          return {
            id: a.id,
            source: src,
            permalink: a.permalink || null,
            type: a.important
              ? 'Urgent'
              : isDiscord
                ? 'Discord'
                : isStory
                  ? 'IG Story'
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
        { label: 'Active Clubs',    value: dbStats.clubs ?? 0,  color: 'blue',   icon: 'Heart',    navTarget: 'clubs' },
        { label: 'Upcoming Events', value: dbStats.events ?? 0, color: 'yellow', icon: 'Calendar', navTarget: 'calendar' },
        { label: 'Group Polls',     value: 1,                   color: 'green',  icon: 'Clock',    navTarget: 'availability' },
        { label: 'Shared Links',    value: dbStats.links ?? 0,  color: 'purple', icon: 'Link',     navTarget: 'links' },
      ])
    }
  }, [])

  useEffect(() => {
    loadBackendData()
  }, [loadBackendData])

  // Clear search query when switching to Availability so filters stay intuitive
  function handleNavigate(nextNav) {
    setActiveNav(nextNav)
    if (nextNav === 'availability') {
      setSearchQuery('')
    }
  }

  const effectiveClubs = liveClubs && liveClubs.length > 0 ? liveClubs : clubsData
  const joinedCount = effectiveClubs.filter(c => c.joined !== false).length

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

  const combinedRawEvents = useMemo(
    () =>
      [...localAddedEvents, ...rawEvents].filter(ev => !removedEventIds.has(ev.id)),
    [localAddedEvents, rawEvents, removedEventIds]
  )

  function toggleJoinClub(clubId) {
    if (liveClubs && liveClubs.length > 0) {
      setLiveClubs(prev =>
        prev.map(c =>
          c.id === clubId
            ? {
                ...c,
                joined: c.joined === false ? true : false,
                members:
                  c.joined === false
                    ? (c.members || 0) + 1
                    : Math.max(0, (c.members || 1) - 1),
              }
            : c
        )
      )
    } else {
      setClubsData(prev =>
        prev.map(c =>
          c.id === clubId
            ? {
                ...c,
                joined: !c.joined,
                members: c.joined ? c.members - 1 : c.members + 1,
              }
            : c
        )
      )
    }
  }

  function handleToggleRsvp(eventId, isGoing) {
    setRsvpMap(prev => {
      const next = { ...prev, [eventId]: isGoing }
      try {
        localStorage.setItem(RSVP_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Ignore storage errors
      }
      return next
    })
  }

  async function handleAddCalendarEvent(eventPayload) {
    const id = eventPayload.id || `custom_evt_${Date.now()}`
    const created = await createEvent({ ...eventPayload, id })
    if (created && created.id) {
      await loadBackendData()
    } else {
      setLocalAddedEvents(prev => [{ ...eventPayload, id, isCustom: true }, ...prev])
    }
  }

  async function handleDeleteCalendarEvent(eventId) {
    await deleteEvent(eventId)
    setRemovedEventIds(prev => new Set(prev).add(eventId))
    setLocalAddedEvents(prev => prev.filter(e => e.id !== eventId))
    await loadBackendData()
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

  const totalLinksCount =
    (liveLinks ? liveLinks.length : linksCount) + localAddedLinks.length

  const effectiveStats = useMemo(() => {
    if (!liveStats) return null
    return liveStats.map(s => {
      if (s.label === 'Active Clubs') {
        return { ...s, value: joinedCount }
      }
      if (s.label === 'Upcoming Events') {
        return { ...s, value: effectiveSchedule.length }
      }
      if (s.label === 'Shared Links') {
        return { ...s, value: totalLinksCount }
      }
      return s
    })
  }, [liveStats, joinedCount, effectiveSchedule.length, totalLinksCount])

  function handleAddLocalLink(linkObj) {
    setLocalAddedLinks(prev => [linkObj, ...prev])
  }

  function handleTogglePinOverride(linkId, nextPinned) {
    setPinnedLinkOverrides(prev => ({ ...prev, [linkId]: nextPinned }))
  }

  function handleAddLocalClubPost(postObj) {
    setLocalClubPosts(prev => [postObj, ...prev])
  }

  return (
    <div className="flex min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <Sidebar
        activeNav={activeNav}
        onNav={handleNavigate}
        dark={dark}
        onToggleDark={toggleDark}
        user={user}
        isDemo={isDemo}
        onExitDemo={onExitDemo}
        onSignOut={onSignOut}
        hasClerkKey={hasClerkKey}
      />

      <main className="flex-1 w-full min-w-0 overflow-x-hidden px-3.5 sm:px-6 lg:px-8 pt-3.5 pb-24 sm:py-7 lg:pb-8">
        <Header
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeNav={activeNav}
          onNav={handleNavigate}
          dark={dark}
          onToggleDark={toggleDark}
          user={user}
          isDemo={isDemo}
          onExitDemo={onExitDemo}
          onSignOut={onSignOut}
          hasClerkKey={hasClerkKey}
          announcements={liveAnnouncements}
          upcomingCount={effectiveSchedule.length}
        />

        {/* ── 1. OVERVIEW (Clean Summary Only — Zero Clutter) ── */}
        {activeNav === 'overview' && (
          <div className="space-y-5 sm:space-y-6">
            <StatCards
              items={effectiveStats}
              joinedCount={joinedCount}
              eventsCount={effectiveSchedule.length}
              linksCount={totalLinksCount}
              onNav={handleNavigate}
            />

            <div className="grid grid-cols-1 xl:grid-cols-[5fr_3fr] gap-4 sm:gap-5">
              <CalendarView
                compact={true}
                items={effectiveSchedule}
                clubs={effectiveClubs}
                searchQuery={searchQuery}
                rsvpMap={rsvpMap}
                onToggleRsvp={handleToggleRsvp}
                onDeleteEvent={handleDeleteCalendarEvent}
                onOpenCalendar={() => handleNavigate('calendar')}
              />
              <Announcements
                items={liveAnnouncements}
                searchQuery={searchQuery}
                onNav={handleNavigate}
              />
            </div>

            {/* Clean Shortcut Card to Separated Group Availability Tool */}
            <Card
              delay={4}
              onClick={() => handleNavigate('availability')}
              className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 hover:border-[var(--blue)]/40"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <IconBadge color="green" size={42} radius={13}>
                  <Clock size={21} />
                </IconBadge>
                <div className="min-w-0">
                  <div className="text-sm sm:text-base font-bold text-[var(--text)]">
                    Coordinate Group Availability
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    Poll members for free hours and schedule the best overlapping time onto the calendar.
                  </p>
                </div>
              </div>

              <span className="inline-flex items-center gap-1.5 px-4 min-h-[38px] rounded-xl bg-[var(--blue-light)] text-[var(--blue-ink)] text-xs font-semibold shrink-0 self-start sm:self-auto">
                <span>Open Availability</span>
                <ArrowRight size={14} />
              </span>
            </Card>

            <ClubsHub
              compact={true}
              items={liveClubs}
              clubsData={clubsData}
              onToggleJoin={toggleJoinClub}
              searchQuery={searchQuery}
              onOpenClubs={() => handleNavigate('clubs')}
            />
          </div>
        )}

        {/* ── 2. CALENDAR (Dedicated Club Events & Schedule) ── */}
        {activeNav === 'calendar' && (
          <CalendarView
            items={effectiveSchedule}
            clubs={effectiveClubs}
            searchQuery={searchQuery}
            rsvpMap={rsvpMap}
            onToggleRsvp={handleToggleRsvp}
            onAddEvent={handleAddCalendarEvent}
            onDeleteEvent={handleDeleteCalendarEvent}
          />
        )}

        {/* ── 3. AVAILABILITY (Dedicated When2Meet-Style Group Polls) ── */}
        {activeNav === 'availability' && (
          <AvailabilityView
            user={user}
            events={combinedRawEvents}
            onEventBooked={loadBackendData}
            onAddLocalEvent={handleAddLocalCollabEvent}
            onRemoveLocalEvent={handleRemoveLocalCollabEvent}
            onOpenCalendar={() => handleNavigate('calendar')}
          />
        )}

        {/* ── 4. CLUBS (My Clubs, Discover, Feed & Directory) ── */}
        {activeNav === 'clubs' && (
          <ClubsHub
            items={liveClubs}
            clubsData={clubsData}
            hubDict={hubDict}
            onToggleJoin={toggleJoinClub}
            searchQuery={searchQuery}
            onRefresh={loadBackendData}
            localPosts={localClubPosts}
            onAddLocalPost={handleAddLocalClubPost}
          />
        )}

        {/* ── 5. RESOURCES (Links & Documents) ── */}
        {activeNav === 'links' && (
          <LinksResources
            items={liveLinks}
            clubs={effectiveClubs}
            searchQuery={searchQuery}
            onRefresh={loadBackendData}
            localAdded={localAddedLinks}
            onAddLocalLink={handleAddLocalLink}
            pinnedOverrides={pinnedLinkOverrides}
            onTogglePinOverride={handleTogglePinOverride}
          />
        )}
      </main>
    </div>
  )
}

function getInitialTheme() {
  const storedLocal = getInitialStoredUser()
  const map = getAccountThemeMap()

  if (storedLocal?.email) {
    const emailKey = `email:${storedLocal.email.toLowerCase()}`
    if (typeof storedLocal.darkMode === 'boolean') return storedLocal.darkMode
    if (typeof map[emailKey] === 'boolean') return map[emailKey]
  }

  try {
    const lastAccount = localStorage.getItem(LAST_ACTIVE_ACCOUNT_KEY)
    if (lastAccount && typeof map[lastAccount] === 'boolean') {
      return map[lastAccount]
    }
  } catch {
    // Ignore storage errors
  }

  return getGuestTheme()
}

function ClerkAppWrapper({
  dark,
  setDark,
  localUser,
  onLocalSignIn,
  onLocalSignOut,
  onUpdateLocalUserTheme,
}) {
  const { isLoaded, isSignedIn, user } = useUser()
  const [demoMode, setDemoMode] = useState(false)
  const [loadTimedOut, setLoadTimedOut] = useState(false)
  const syncedAccountRef = useRef(null)
  const darkRef = useRef(dark)
  darkRef.current = dark

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

  // Ensure a real Clerk/Google session takes precedence over any leftover local session
  useEffect(() => {
    if (isSignedIn && user && localUser) {
      onLocalSignOut({ silent: true })
    }
  }, [isSignedIn, user, localUser, onLocalSignOut])

  // Clean OAuth callback parameters from the URL once Clerk finishes signing in
  useEffect(() => {
    if (isSignedIn && user && isOAuthCallback && typeof window !== 'undefined') {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [isSignedIn, user, isOAuthCallback])

  const clerkEmail = user?.primaryEmailAddress?.emailAddress?.toLowerCase() || ''
  const localEmail = localUser?.email?.toLowerCase() || ''
  const activeAccountKey =
    isSignedIn && user
      ? `clerk:${user.id}`
      : localUser && localEmail
        ? `email:${localEmail}`
        : 'guest'

  // Sync dark mode automatically whenever the signed-in account changes
  useEffect(() => {
    if (activeAccountKey === 'guest') {
      if (!isLoaded && !loadTimedOut) return
      if (syncedAccountRef.current === 'guest') return
      syncedAccountRef.current = 'guest'
      try {
        localStorage.removeItem(LAST_ACTIVE_ACCOUNT_KEY)
      } catch {
        // Ignore storage errors
      }
      setDark(getGuestTheme())
      return
    }

    if (syncedAccountRef.current === activeAccountKey) return
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
      const metaDark = user.unsafeMetadata?.darkMode

      if (typeof metaDark === 'boolean') {
        setDark(metaDark)
        saveAccountThemeForKeys([clerkKey, emailKey], metaDark)
        return
      }

      const localStored =
        typeof map[clerkKey] === 'boolean'
          ? map[clerkKey]
          : emailKey && typeof map[emailKey] === 'boolean'
            ? map[emailKey]
            : undefined

      if (typeof localStored === 'boolean') {
        setDark(localStored)
        saveAccountThemeForKeys([clerkKey, emailKey], localStored)
        user
          .update({
            unsafeMetadata: { ...(user.unsafeMetadata || {}), darkMode: localStored },
          })
          .catch(() => {})
        return
      }

      if (clerkEmail) {
        getDictKey(`user_theme:${clerkEmail}`).then(entry => {
          const remoteDark = entry?.value?.darkMode
          if (typeof remoteDark === 'boolean') {
            setDark(remoteDark)
            saveAccountThemeForKeys([clerkKey, emailKey], remoteDark)
            user
              .update({
                unsafeMetadata: { ...(user.unsafeMetadata || {}), darkMode: remoteDark },
              })
              .catch(() => {})
          } else {
            const initialForAccount = Boolean(darkRef.current)
            saveAccountThemeForKeys([clerkKey, emailKey], initialForAccount)
            user
              .update({
                unsafeMetadata: {
                  ...(user.unsafeMetadata || {}),
                  darkMode: initialForAccount,
                },
              })
              .catch(() => {})
          }
        })
      }
      return
    }

    if (localUser && localEmail) {
      const emailKey = `email:${localEmail}`
      if (typeof localUser.darkMode === 'boolean') {
        setDark(localUser.darkMode)
        saveAccountThemeForKeys([emailKey], localUser.darkMode)
        return
      }
      if (typeof map[emailKey] === 'boolean') {
        setDark(map[emailKey])
        return
      }
      getDictKey(`user_theme:${localEmail}`).then(entry => {
        const remoteDark = entry?.value?.darkMode
        if (typeof remoteDark === 'boolean') {
          setDark(remoteDark)
          saveAccountThemeForKeys([emailKey], remoteDark)
        } else {
          saveAccountThemeForKeys([emailKey], Boolean(darkRef.current))
        }
      })
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
    setDark,
  ])

  function handleToggleDark() {
    const next = !dark
    setDark(next)

    if (isSignedIn && user) {
      const clerkKey = `clerk:${user.id}`
      const emailKey = clerkEmail ? `email:${clerkEmail}` : null
      saveAccountThemeForKeys([clerkKey, emailKey], next)
      user
        .update({
          unsafeMetadata: { ...(user.unsafeMetadata || {}), darkMode: next },
        })
        .catch(() => {})
      if (clerkEmail) {
        persistBackendAccountTheme(clerkEmail, next)
      }
      return
    }

    if (localUser && localEmail) {
      onUpdateLocalUserTheme(next)
      return
    }

    saveGuestTheme(next)
  }

  const baseUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : '/'

  if (isOAuthCallback && !isSignedIn) {
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
        user={user}
        isDemo={false}
        hasClerkKey={true}
      />
    )
  }

  if (localUser) {
    return (
      <MainDashboard
        dark={dark}
        toggleDark={handleToggleDark}
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
        dark={dark}
        toggleDark={handleToggleDark}
        user={null}
        isDemo={true}
        onExitDemo={() => setDemoMode(false)}
        hasClerkKey={true}
      />
    )
  }

  return (
    <SignInPage
      dark={dark}
      onToggleDark={handleToggleDark}
      hasPublishableKey={true}
      onEnterDemo={() => setDemoMode(true)}
      onLocalSignIn={onLocalSignIn}
    />
  )
}

function FallbackApp({
  dark,
  setDark,
  localUser,
  onLocalSignIn,
  onLocalSignOut,
  onUpdateLocalUserTheme,
}) {
  const [demoMode, setDemoMode] = useState(false)
  const syncedAccountRef = useRef(null)
  const localEmail = localUser?.email?.toLowerCase() || ''
  const activeAccountKey = localUser && localEmail ? `email:${localEmail}` : 'guest'

  useEffect(() => {
    if (syncedAccountRef.current === activeAccountKey) return
    syncedAccountRef.current = activeAccountKey

    if (activeAccountKey === 'guest') {
      setDark(getGuestTheme())
      return
    }

    const map = getAccountThemeMap()
    const emailKey = `email:${localEmail}`
    if (typeof localUser?.darkMode === 'boolean') {
      setDark(localUser.darkMode)
      saveAccountThemeForKeys([emailKey], localUser.darkMode)
    } else if (typeof map[emailKey] === 'boolean') {
      setDark(map[emailKey])
    } else {
      getDictKey(`user_theme:${localEmail}`).then(entry => {
        if (typeof entry?.value?.darkMode === 'boolean') {
          setDark(entry.value.darkMode)
          saveAccountThemeForKeys([emailKey], entry.value.darkMode)
        }
      })
    }
  }, [activeAccountKey, localUser, localEmail, setDark])

  function handleToggleDark() {
    const next = !dark
    setDark(next)
    if (localUser && localEmail) {
      onUpdateLocalUserTheme(next)
    } else {
      saveGuestTheme(next)
    }
  }

  if (localUser) {
    return (
      <MainDashboard
        dark={dark}
        toggleDark={handleToggleDark}
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
        dark={dark}
        toggleDark={handleToggleDark}
        user={null}
        isDemo={true}
        onExitDemo={() => setDemoMode(false)}
        hasClerkKey={false}
      />
    )
  }

  return (
    <SignInPage
      dark={dark}
      onToggleDark={handleToggleDark}
      hasPublishableKey={false}
      onEnterDemo={() => setDemoMode(true)}
      onLocalSignIn={onLocalSignIn}
    />
  )
}

const DEFAULT_CLERK_KEY = (
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
  import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  ''
).trim()

export default function App({ hasClerkKey = Boolean(DEFAULT_CLERK_KEY) }) {
  const [dark, setDark] = useState(getInitialTheme)
  const [localUser, setLocalUser] = useState(getInitialStoredUser)

  // Always keep root <html> .dark class synchronized with active dark state
  useEffect(() => {
    document.documentElement.classList.toggle('dark', Boolean(dark))
  }, [dark])

  const updateLocalUserTheme = useCallback(nextDark => {
    setLocalUser(prev => {
      if (!prev) return prev
      const updated = { ...prev, darkMode: Boolean(nextDark) }
      const emailLower = (prev.email || '').toLowerCase()
      try {
        localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(updated))
        if (emailLower) {
          saveAccountThemeForKeys([`email:${emailLower}`], nextDark)
          const regRaw = localStorage.getItem(EMAIL_ACCOUNTS_KEY)
          const reg = regRaw ? JSON.parse(regRaw) : {}
          if (reg[emailLower]) {
            reg[emailLower] = { ...reg[emailLower], darkMode: Boolean(nextDark) }
            localStorage.setItem(EMAIL_ACCOUNTS_KEY, JSON.stringify(reg))
          }
        }
      } catch {
        // Ignore storage errors
      }
      if (emailLower) {
        persistBackendAccountTheme(emailLower, nextDark)
      }
      return updated
    })
  }, [])

  const handleLocalSignIn = useCallback(profile => {
    const emailLower = (profile.email || '').toLowerCase()
    const map = getAccountThemeMap()
    const resolvedDark =
      typeof profile.darkMode === 'boolean'
        ? profile.darkMode
        : emailLower && typeof map[`email:${emailLower}`] === 'boolean'
          ? map[`email:${emailLower}`]
          : undefined

    const nextProfile =
      typeof resolvedDark === 'boolean' ? { ...profile, darkMode: resolvedDark } : profile

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
      localUser={localUser}
      onLocalSignIn={handleLocalSignIn}
      onLocalSignOut={handleLocalSignOut}
      onUpdateLocalUserTheme={updateLocalUserTheme}
    />
  )
}
