import Sidebar from './Sidebar'
import Header from './Header'
import StatCards from './StatCards'
import TodaySchedule from './TodaySchedule'
import Announcements from './Announcements'
import MyClubs from './MyClubs'
import ClubBoard from './ClubBoard'
import LinksResources from './LinksResources'
import MemberActivity from './MemberActivity'
import SourceFeedHub from './SourceFeedHub'

export default function Dashboard({
  activeNav,
  setActiveNav,
  dark,
  toggleDark,
  hasPublishableKey,
  onExitDemo,
  hubDict,
  rawDict,
  liveAnnouncements,
  liveClubs,
  loadBackendData,
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar
        activeNav={activeNav}
        onNav={setActiveNav}
        dark={dark}
        onToggleDark={toggleDark}
        hasPublishableKey={hasPublishableKey}
        onExitDemo={onExitDemo}
      />

      <main className="flex-1 overflow-y-auto px-8 py-7">
        <Header hasPublishableKey={hasPublishableKey} />
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

