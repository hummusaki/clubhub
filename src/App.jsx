import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@clerk/react'
import { Sparkles } from 'lucide-react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import StatCards from './components/StatCards'
import TodaySchedule from './components/TodaySchedule'
import Announcements from './components/Announcements'
import MyClubs from './components/MyClubs'
import ClubBoard from './components/ClubBoard'
import LinksResources from './components/LinksResources'
import MemberActivity from './components/MemberActivity'
import SourceFeedHub from './components/SourceFeedHub'
import SignInPage from './components/SignInPage'
import { clubs as initialClubs } from './data/sampleData'
import {
  getClubHub,
  getDictionary,
  getAnnouncements,
  getEvents,
  getLinks,
  getStats,
} from './api/client'

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

function MainDashboard({
  dark,
  toggleDark,
  user = null,
  isDemo = false,
  onExitDemo,
  hasClerkKey = false,
}) {
  const [activeNav, setActiveNav] = useState('overview')
  const [searchQuery, setSearchQuery] = useState('')
  const [clubsData, setClubsData] = useState(initialClubs)
  const [linksCount, setLinksCount] = useState(24)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Live SQLite / Collector backend state
  const [hubDict, setHubDict] = useState({})
  const [rawDict, setRawDict] = useState({})
  const [liveAnnouncements, setLiveAnnouncements] = useState(null)
  const [liveClubs, setLiveClubs] = useState(null)
  const [liveSchedule, setLiveSchedule] = useState(null)
  const [liveLinks, setLiveLinks] = useState(null)
  const [liveStats, setLiveStats] = useState(null)

  const loadBackendData = useCallback(async () => {
    const [hub, dict, anns, evts, lnks, dbStats] = await Promise.all([
      getClubHub(),
      getDictionary(),
      getAnnouncements({ limit: 6 }),
      getEvents(),
      getLinks(),
      getStats(),
    ])

    if (hub) {
      setHubDict(hub)
      const mappedClubs = Object.values(hub).map(c => {
        const nextEvent = (c.events || [])[0]
        const scheduleStr = nextEvent
          ? `${new Date(nextEvent.start).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}${nextEvent.location ? ' · ' + nextEvent.location : ''}`
          : `@${c.instagram}`

        return {
          id: c.id,
          name: c.name,
          abbr: (c.name || 'CL')
            .split(' ')
            .map(w => w[0])
            .join('')
            .slice(0, 2)
            .toUpperCase(),
          members: c.followers || 0,
          category: c.category || 'academic',
          role: 'Member',
          room: nextEvent?.location || 'Campus',
          nextEvent: nextEvent?.title ? `${nextEvent.title} · ${scheduleStr}` : null,
          description: c.bio || c.description || '',
          tags: [
            ...(c.instagram ? [{ label: `@${c.instagram}`, color: 'blue' }] : []),
            ...(c.category ? [{ label: c.category, color: 'purple' }] : []),
          ],
          schedule: scheduleStr,
          avatarBg: 'linear-gradient(135deg, var(--blue), #5B8DEF)',
          active: true,
          joined: true,
        }
      })
      if (mappedClubs.length > 0) setLiveClubs(mappedClubs)
    }

    if (dict) {
      setRawDict(dict)
    }

    if (evts && evts.length > 0) {
      const palette = ['blue', 'green', 'purple', 'yellow', 'teal']
      setLiveSchedule(
        evts.slice(0, 6).map((e, i) => {
          const startDate = new Date(e.start)
          const timeLabel = e.allDay
            ? `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} (All Day)`
            : startDate.toLocaleString('en-US', {
                weekday: 'short',
                hour: 'numeric',
                minute: '2-digit',
              })
          return {
            id: e.id,
            club: e.clubName || e.clubId,
            event: e.title,
            time: timeLabel,
            location: e.location || 'TBD',
            duration: e.recurring ? `Every ${e.recurring}` : e.kind || 'event',
            color: palette[i % palette.length],
            status: i === 0 ? 'Next Up' : 'Scheduled',
            rsvp: i < 2,
            upcoming: false,
            day: 'today',
          }
        })
      )
    }

    if (anns && anns.length > 0) {
      setLiveAnnouncements(
        anns.map(a => ({
          id: a.id,
          type: a.important ? 'Urgent' : 'Announcement',
          color: a.important ? 'red' : 'yellow',
          club: a.clubName || a.clubId || 'Campus',
          time: a.postedAt ? new Date(a.postedAt).toLocaleDateString() : 'Just now',
          title: `${a.clubName ? a.clubName + ': ' : ''}${a.title}`,
          description: a.summary || '',
          pinned: Boolean(a.important),
          unread: true,
        }))
      )
    }

    if (lnks && lnks.length > 0) {
      setLiveLinks(
        lnks.map(l => ({
          id: l.id,
          title: `${l.clubName ? l.clubName + ' — ' : ''}${l.label || l.kind || 'Link'}`,
          subtitle: l.url,
          url: l.url,
          category: l.kind || 'Resource',
          color: KIND_COLOR_MAP[l.kind] || 'blue',
          icon: KIND_ICON_MAP[l.kind] || 'Globe',
        }))
      )
    }

    if (dbStats) {
      setLiveStats([
        {
          label: 'Active Clubs',
          value: dbStats.clubs ?? 0,
          color: 'blue',
          icon: 'Users',
          delta: 'Live DB',
          subtitle: 'Synced organizations',
          navTarget: 'discover',
        },
        {
          label: 'Connected Sources',
          value: dbStats.sources ?? 0,
          color: 'green',
          icon: 'Heart',
          delta: 'Multi-source',
          subtitle: 'IG, Discord & Cal',
          navTarget: 'myclubs',
        },
        {
          label: 'Upcoming Events',
          value: dbStats.events ?? 0,
          color: 'yellow',
          icon: 'Calendar',
          delta: 'Extracted',
          subtitle: 'From club feeds',
          navTarget: 'calendar',
        },
        {
          label: 'Shared Links',
          value: dbStats.links ?? 0,
          color: 'purple',
          icon: 'Link',
          delta: 'Verified',
          subtitle: 'Forms, docs & servers',
          navTarget: 'links',
        },
      ])
    }
  }, [])

  useEffect(() => {
    loadBackendData()
  }, [loadBackendData])

  const effectiveClubs = liveClubs && liveClubs.length > 0 ? liveClubs : clubsData
  const joinedCount = effectiveClubs.filter(c => c.joined !== false).length

  function toggleJoinClub(clubId) {
    if (liveClubs && liveClubs.length > 0) {
      setLiveClubs(prev =>
        prev.map(c =>
          c.id === clubId
            ? {
                ...c,
                joined: c.joined === false ? true : false,
                members: c.joined === false ? (c.members || 0) + 1 : Math.max(0, (c.members || 1) - 1),
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
                role: c.joined ? 'Open to Join' : 'Member',
              }
            : c
        )
      )
    }
  }

  const showAll = activeNav === 'overview'

  return (
    <div className="flex min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <Sidebar
        activeNav={activeNav}
        onNav={setActiveNav}
        dark={dark}
        onToggleDark={toggleDark}
        joinedCount={joinedCount}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        user={user}
        isDemo={isDemo}
        onExitDemo={onExitDemo}
        hasClerkKey={hasClerkKey}
      />

      <main className="flex-1 min-w-0 overflow-y-auto px-3.5 sm:px-6 lg:px-9 pt-3.5 pb-24 sm:py-7 lg:pb-8 max-w-[1440px]">
        <Header
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeNav={activeNav}
          onNav={setActiveNav}
          dark={dark}
          onToggleDark={toggleDark}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          user={user}
          isDemo={isDemo}
          hasClerkKey={hasClerkKey}
        />

        {isDemo && (
          <div className="mb-4 px-4 py-2.5 rounded-[var(--radius-sm)] bg-[var(--blue-light)] border border-[rgba(123,170,247,0.3)] flex items-center justify-between text-xs text-[var(--blue-ink)] fade-in">
            <div className="flex items-center gap-2">
              <Sparkles size={15} />
              <span>
                You are viewing ClubHub in <strong>Demo Preview Mode</strong>.
              </span>
            </div>
            {onExitDemo && (
              <button
                type="button"
                onClick={onExitDemo}
                className="font-bold underline cursor-pointer bg-transparent border-none text-[var(--blue-ink)] hover:opacity-80"
              >
                Sign In with Clerk &rarr;
              </button>
            )}
          </div>
        )}

        {showAll && (
          <StatCards
            items={liveStats}
            joinedCount={joinedCount}
            linksCount={liveLinks ? liveLinks.length : linksCount}
            onNav={setActiveNav}
          />
        )}

        {/* Schedule + Announcements */}
        {(showAll || activeNav === 'calendar') && (
          <div className="grid grid-cols-1 xl:grid-cols-[5fr_3fr] gap-4 sm:gap-5 mb-5 sm:mb-7">
            <TodaySchedule items={liveSchedule} searchQuery={searchQuery} />
            <Announcements items={liveAnnouncements} />
          </div>
        )}

        {/* Multi-Source Feed & Dictionary Hub */}
        {(showAll || activeNav === 'discover') && (
          <SourceFeedHub
            hubDict={hubDict}
            rawDict={rawDict}
            onRefresh={loadBackendData}
          />
        )}

        {/* My Clubs / Discover */}
        {(showAll || activeNav === 'myclubs' || activeNav === 'discover') && (
          <MyClubs
            key={activeNav === 'discover' ? 'discover' : 'myclubs'}
            items={liveClubs}
            clubsData={clubsData}
            onToggleJoin={toggleJoinClub}
            defaultTab={activeNav === 'discover' ? 'Discover' : 'All'}
            searchQuery={searchQuery}
          />
        )}

        {/* Board + Links */}
        {(showAll || activeNav === 'links') && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
            <ClubBoard />
            <LinksResources
              items={liveLinks}
              clubs={Object.values(hubDict)}
              onRefresh={loadBackendData}
              onCountChange={setLinksCount}
            />
          </div>
        )}

        {/* Member Activity */}
        {(showAll || activeNav === 'members') && (
          <MemberActivity globalSearch={searchQuery} />
        )}
      </main>
    </div>
  )
}

function ClerkAppWrapper({ dark, toggleDark }) {
  const { isLoaded, isSignedIn, user } = useUser()
  const [demoMode, setDemoMode] = useState(false)

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg)] text-[var(--text)] gap-3">
        <div className="w-10 h-10 border-3 border-[var(--blue)] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold text-[var(--text-muted)]">Loading ClubHub…</span>
      </div>
    )
  }

  if (isSignedIn) {
    return (
      <MainDashboard
        dark={dark}
        toggleDark={toggleDark}
        user={user}
        isDemo={false}
        hasClerkKey={true}
      />
    )
  }

  if (demoMode) {
    return (
      <MainDashboard
        dark={dark}
        toggleDark={toggleDark}
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
      onToggleDark={toggleDark}
      hasPublishableKey={true}
      onEnterDemo={() => setDemoMode(true)}
    />
  )
}

function FallbackApp({ dark, toggleDark }) {
  const [demoMode, setDemoMode] = useState(false)

  if (demoMode) {
    return (
      <MainDashboard
        dark={dark}
        toggleDark={toggleDark}
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
      onToggleDark={toggleDark}
      hasPublishableKey={false}
      onEnterDemo={() => setDemoMode(true)}
    />
  )
}

export default function App({ hasClerkKey = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) }) {
  const [dark, setDark] = useState(false)

  function toggleDark() {
    setDark(prev => {
      const next = !prev
      document.documentElement.classList.toggle('dark', next)
      return next
    })
  }

  if (hasClerkKey) {
    return <ClerkAppWrapper dark={dark} toggleDark={toggleDark} />
  }

  return <FallbackApp dark={dark} toggleDark={toggleDark} />
}

