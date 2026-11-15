import { useState, useEffect, useRef } from 'react'
import { Bell, CheckCheck, Menu, Moon, Sun, ArrowLeft } from 'lucide-react'
import { UserButton } from '@clerk/react'
import { SearchBox, BubbleTag, ClubHubLogo, IconBadge, cleanText } from './ui'
import { AnnouncementTypeIcon } from './icons'
import { announcements as initialAnnouncements } from '../data/sampleData'
import { getUserButtonAppearance } from '../clerkTheme'

export default function Header({
  searchQuery = '',
  onSearchChange,
  activeNav = 'overview',
  onNav,
  dark = false,
  onToggleDark,
  onOpenMobileMenu,
  user = null,
  isDemo = false,
  hasClerkKey = false,
}) {
  const [notifOpen, setNotifOpen] = useState(false)
  const [items, setItems] = useState(initialAnnouncements)
  const notifRef = useRef(null)

  const unreadCount = items.filter(i => i.unread).length

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') setNotifOpen(false)
    }
    function handleClickOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  function markAllRead() {
    setItems(prev => prev.map(item => ({ ...item, unread: false })))
  }

  const firstName = user?.firstName || (user?.fullName ? user.fullName.split(' ')[0] : null)
  const greetingName = firstName || (isDemo ? 'Guest' : 'Jane')

  const viewTitles = {
    overview: `Good afternoon, ${greetingName}`,
    myclubs: 'My Clubs',
    discover: 'Discover Clubs',
    calendar: 'Schedule',
    members: 'Members',
    links: 'Links & Resources',
  }

  return (
    <header className="relative z-40 mb-5 sm:mb-7 fade-in" ref={notifRef}>
      {/* ── Phone / Tablet Top App Bar (< lg) ── */}
      <div className="flex lg:hidden items-center justify-between gap-2 pb-3 mb-3.5 border-b border-[var(--border)]">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open navigation menu"
            className="w-9 h-9 rounded-xl bg-[var(--bg-card)] border border-[var(--border)]
              flex items-center justify-center text-[var(--text)] cursor-pointer"
          >
            <Menu size={18} />
          </button>

          <div
            onClick={() => onNav && onNav('overview')}
            className="flex items-center gap-2 cursor-pointer"
          >
            <ClubHubLogo size={30} />
            <span className="font-bold text-[15px] tracking-tight text-[var(--text)]">
              ClubHub
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasClerkKey && user && (
            <div className="flex items-center">
              <UserButton appearance={getUserButtonAppearance(dark)} />
            </div>
          )}

          <button
            type="button"
            onClick={onToggleDark}
            aria-label="Toggle dark mode"
            className="w-9 h-9 rounded-full bg-[var(--bg-card)] border border-[var(--border)]
              flex items-center justify-center text-[var(--text-muted)] cursor-pointer"
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <button
            type="button"
            onClick={() => setNotifOpen(o => !o)}
            aria-label="Notifications"
            className="w-9 h-9 rounded-full bg-[var(--bg-card)] border border-[var(--border)]
              flex items-center justify-center cursor-pointer relative"
          >
            <Bell size={17} className="text-[var(--text-muted)]" />
            {unreadCount > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full
                  bg-[var(--red)] text-white text-[10px] font-bold font-mono-num
                  flex items-center justify-center"
              >
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Main Greeting & Search Row ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          {activeNav !== 'overview' && (
            <button
              type="button"
              onClick={() => onNav && onNav('overview')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--blue-ink)] hover:underline cursor-pointer bg-transparent border-none mb-1"
            >
              <ArrowLeft size={13} />
              Overview
            </button>
          )}
          <h1 className="text-[22px] sm:text-2xl font-bold tracking-tight text-[var(--text)]">
            {viewTitles[activeNav] || viewTitles.overview}
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            Saturday, November 14 — You have{' '}
            <strong className="font-semibold text-[var(--blue-ink)]">2 meetings</strong> today
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex-1 sm:w-[240px]">
            <SearchBox
              placeholder="Search clubs, events…"
              width="100%"
              value={searchQuery}
              onChange={onSearchChange}
            />
          </div>

          <div className="hidden lg:block relative">
            <button
              type="button"
              onClick={() => setNotifOpen(o => !o)}
              aria-label="Notifications"
              className="w-10 h-10 rounded-full bg-[var(--bg-card)] border border-[var(--border)]
                flex items-center justify-center cursor-pointer hover:border-[var(--blue)]
                transition-colors relative"
            >
              <Bell size={18} className="text-[var(--text-muted)]" />
              {unreadCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full
                    bg-[var(--red)] text-white text-[10px] font-bold font-mono-num
                    flex items-center justify-center"
                >
                  {unreadCount}
                </span>
              )}
            </button>
          </div>

          {hasClerkKey && user && (
            <div className="hidden lg:flex items-center pl-1">
              <UserButton appearance={getUserButtonAppearance(dark)} />
            </div>
          )}
        </div>
      </div>

      {/* ── Notification Popover ── */}
      {notifOpen && (
        <div
          className="fixed sm:absolute left-3 right-3 top-[64px] sm:left-auto sm:right-0 sm:top-full sm:mt-2
            sm:w-80 rounded-[var(--radius)] bg-[var(--bg-card)] border border-[var(--border)]
            shadow-[var(--shadow-lg)] p-4 z-[100] fade-in"
        >
          <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-[var(--border)]">
            <span className="text-xs font-semibold text-[var(--text)]">
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--blue-ink)]
                  hover:underline cursor-pointer bg-transparent border-none"
              >
                <CheckCheck size={13} />
                Mark all read
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
            {items.map(item => (
              <div
                key={item.id}
                onClick={() =>
                  setItems(prev =>
                    prev.map(x => (x.id === item.id ? { ...x, unread: false } : x))
                  )
                }
                className="p-2.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer hover:bg-[var(--bg-surface)] flex items-start gap-2.5"
                style={{
                  background: item.unread ? 'var(--bg-surface)' : 'transparent',
                }}
              >
                <IconBadge color={item.color || 'blue'} size={30} radius={9} className="mt-0.5">
                  <AnnouncementTypeIcon type={item.type} size={15} />
                </IconBadge>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <BubbleTag label={item.type} color={item.color} size="sm" dot={item.unread} />
                    <span className="text-[10.5px] text-[var(--text-light)]">{item.time}</span>
                  </div>
                  <div className="text-xs font-semibold text-[var(--text)]">
                    {cleanText(item.title)}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-snug">
                    {cleanText(item.description)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </header>
  )
}
