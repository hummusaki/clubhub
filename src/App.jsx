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

export default function App() {
  const [dark, setDark] = useState(false)
  const [activeNav, setActiveNav] = useState('overview')

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
          <Announcements />
        </div>

        <MyClubs />

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
