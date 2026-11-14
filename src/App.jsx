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
import { getClubHub, getDictionary, getAnnouncements } from './api/client'

export default function App() {
  const [dark, setDark] = useState(false)
  const [activeNav, setActiveNav] = useState('overview')
  const [hubDict, setHubDict] = useState({})
  const [rawDict, setRawDict] = useState({})
  const [liveAnnouncements, setLiveAnnouncements] = useState(null)
  const [liveClubs, setLiveClubs] = useState(null)

  const loadBackendData = useCallback(async () => {
    const [hub, dict, anns] = await Promise.all([
      getClubHub(),
      getDictionary(),
      getAnnouncements({ limit: 6 }),
    ])

    if (hub) {
      setHubDict(hub)
      // Transform dictionary entries to the UI format for MyClubs
      const mappedClubs = Object.values(hub).map(c => ({
        id: c.id,
        name: c.name,
        abbr: c.abbreviation,
        members: c.members,
        category: c.category,
        tags: c.tags || [],
        schedule: `${c.meeting?.schedule || 'TBD'} · ${c.meeting?.location || ''}`,
        avatarBg: c.avatarBg,
        active: c.active,
      }))
      setLiveClubs(mappedClubs)
    }

    if (dict) {
      setRawDict(dict)
    }

    if (anns && anns.length > 0) {
      const colorMap = { urgent: 'red', event: 'yellow', update: 'green', info: 'blue' }
      const labelMap = { urgent: 'Urgent', event: 'Event', update: 'Update', info: 'Info' }
      setLiveAnnouncements(
        anns.map(a => ({
          id: a.id,
          type: labelMap[a.type] || 'Info',
          color: colorMap[a.type] || 'blue',
          time: a.source ? `via ${a.source}` : 'just now',
          title: a.title,
          description: a.body,
        }))
      )
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
        <StatCards />

        {/* Schedule + Announcements */}
        <div className="grid grid-cols-[5fr_3fr] gap-5 mb-7">
          <TodaySchedule />
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
          <LinksResources />
        </div>

        <MemberActivity />
      </main>
    </div>
  )
}
