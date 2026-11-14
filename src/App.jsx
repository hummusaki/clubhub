import { useState } from 'react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import StatCards from './components/StatCards'
import TodaySchedule from './components/TodaySchedule'
import Announcements from './components/Announcements'
import MyClubs from './components/MyClubs'
import ClubBoard from './components/ClubBoard'
import LinksResources from './components/LinksResources'
import MemberActivity from './components/MemberActivity'
import { clubs as initialClubs } from './data/sampleData'

export default function App() {
  const [dark, setDark] = useState(false)
  const [activeNav, setActiveNav] = useState('overview')
  const [searchQuery, setSearchQuery] = useState('')
  const [clubsData, setClubsData] = useState(initialClubs)
  const [linksCount, setLinksCount] = useState(24)

  const joinedCount = clubsData.filter(c => c.joined).length

  function toggleDark() {
    setDark(prev => {
      const next = !prev
      document.documentElement.classList.toggle('dark', next)
      return next
    })
  }

  function toggleJoinClub(clubId) {
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

  const showAll = activeNav === 'overview'

  return (
    <div className="flex min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <Sidebar
        activeNav={activeNav}
        onNav={setActiveNav}
        dark={dark}
        onToggleDark={toggleDark}
        joinedCount={joinedCount}
      />

      <main className="flex-1 min-w-0 overflow-y-auto px-6 lg:px-9 py-7 max-w-[1440px]">
        <Header
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeNav={activeNav}
          onNav={setActiveNav}
        />

        {showAll && (
          <StatCards
            joinedCount={joinedCount}
            linksCount={linksCount}
            onNav={setActiveNav}
          />
        )}

        {/* Schedule + Announcements */}
        {(showAll || activeNav === 'calendar') && (
          <div className="grid grid-cols-1 xl:grid-cols-[5fr_3fr] gap-5 mb-7">
            <TodaySchedule searchQuery={searchQuery} />
            <Announcements />
          </div>
        )}

        {/* My Clubs / Discover */}
        {(showAll || activeNav === 'myclubs' || activeNav === 'discover') && (
          <MyClubs
            key={activeNav === 'discover' ? 'discover' : 'myclubs'}
            clubsData={clubsData}
            onToggleJoin={toggleJoinClub}
            defaultTab={activeNav === 'discover' ? 'Discover' : 'All'}
            searchQuery={searchQuery}
          />
        )}

        {/* Board + Links */}
        {(showAll || activeNav === 'links') && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <ClubBoard />
            <LinksResources onCountChange={setLinksCount} />
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
