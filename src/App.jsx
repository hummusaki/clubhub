import { useState, useEffect, useCallback } from 'react'
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
import { getClubHub, getDictionary, getAnnouncements, getEvents, getLinks, getStats } from './api/client'

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

export default function App() {
  const [dark, setDark] = useState(false)
  const [activeNav, setActiveNav] = useState('overview')
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
          ? `${new Date(nextEvent.start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${nextEvent.location ? ' · ' + nextEvent.location : ''}`
          : `@${c.instagram}`

        return {
          id: c.id,
          name: c.name,
          abbr: (c.name || 'CL').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
          members: c.followers || 0,
          category: c.category || 'other',
          tags: [
            { label: `@${c.instagram}`, color: 'blue' },
            ...(c.category ? [{ label: c.category, color: 'purple' }] : []),
          ],
          schedule: scheduleStr,
          avatarBg: 'linear-gradient(135deg, var(--blue), #5B8DEF)',
          active: true,
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
            duration: e.recurring ? `Every ${e.recurring}` : (e.kind || 'event'),
            color: palette[i % palette.length],
            upcoming: false,
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
          time: a.postedAt ? new Date(a.postedAt).toLocaleDateString() : '',
          title: `${a.clubName ? a.clubName + ': ' : ''}${a.title}`,
          description: a.summary || '',
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
          color: KIND_COLOR_MAP[l.kind] || 'blue',
          icon: KIND_ICON_MAP[l.kind] || 'Globe',
        }))
      )
    }

    if (dbStats) {
      setLiveStats([
        { label: 'Active Clubs',      value: dbStats.clubs ?? 0,   color: 'blue',   icon: 'Users' },
        { label: 'Connected Sources', value: dbStats.sources ?? 0, color: 'green',  icon: 'Heart' },
        { label: 'Upcoming Events',   value: dbStats.events ?? 0,  color: 'yellow', icon: 'Calendar' },
        { label: 'Shared Links',      value: dbStats.links ?? 0,   color: 'purple', icon: 'Link' },
      ])
    }
  }, [])

  useEffect(() => {
    loadBackendData()
  }, [loadBackendData])

  function toggleDark() {
    setDark(prev => {
      const next = !prev
      document.documentElement.classList.toggle('dark', next)
      return next
    })
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        activeNav={activeNav}
        onNav={setActiveNav}
        dark={dark}
        onToggleDark={toggleDark}
      />

      <main className="flex-1 overflow-y-auto px-8 py-7">
        <Header />
        <StatCards items={liveStats} />

        {/* Schedule + Announcements */}
        <div className="grid grid-cols-[5fr_3fr] gap-5 mb-7">
          <TodaySchedule items={liveSchedule} />
          <Announcements items={liveAnnouncements} />
        </div>

        {/* Multi-Source Feed & Dictionary Hub */}
        <SourceFeedHub
          hubDict={hubDict}
          rawDict={rawDict}
          onRefresh={loadBackendData}
        />

        <MyClubs items={liveClubs} />

        {/* Board + Links */}
        <div className="grid grid-cols-2 gap-5">
          <ClubBoard />
          <LinksResources
            items={liveLinks}
            clubs={Object.values(hubDict)}
            onRefresh={loadBackendData}
          />
        </div>

        <MemberActivity />
      </main>
    </div>
  )
}
