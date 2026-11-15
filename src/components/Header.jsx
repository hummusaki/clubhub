import { useState, useEffect, useRef } from 'react'
import { Bell, CheckCheck, Moon, Sun, LogOut, LogIn } from 'lucide-react'
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
  user = null,
  isDemo = false,
  onExitDemo,
  onSignOut,
  hasClerkKey = false,
  announcements = null,
  upcomingCount = 0,
}) {
  const [notifOpen, setNotifOpen] = useState(false)
  const [readIds, setReadIds] = useState({})
  const notifRef = useRef(null)

  const items = announcements && announcements.length > 0 ? announcements : initialAnnouncements
  const unreadCount = items.filter(i => !readIds[i.id] && i.unread !== false).length

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
    const next = {}
    for (const item of items) next[item.id] = true
    setReadIds(next)
  }

  const firstName = user?.firstName || (user?.fullName ? user.fullName.split(' ')[0] : null)
  const greetingName = firstName || (isDemo ? 'Guest' : 'Jane')

  const viewTitles = {
    overview: `Welcome back, ${greetingName}`,
    calendar: 'Calendar',
    availability: 'Group Availability',
    clubs: 'Clubs & Community',
    links: 'Shared Resources',
  }

  const viewSubtitles = {
    overview: `${upcomingCount} upcoming ${upcomingCount === 1 ? 'event' : 'events'} across your campus clubs`,
    calendar: 'Scheduled club meetings, workshops, and RSVPs',
    availability: 'Mark when you are free and find the best group meeting time',
    clubs: 'Manage your memberships, browse updates, and connect with officers',
    links: 'Pinned club documents, forms, and community links',
  }

  const searchPlaceholders = {
    overview: 'Search clubs, events, updates…',
    calendar: 'Search events or locations…',
    clubs: 'Search clubs, posts, or members…',
    links: 'Search documents and links…',
  }

  const showSearch = activeNav !== 'availability'

  return (
    <header className="relative z-40 mb-5 sm:mb-6 fade-in" ref={notifRef}>
      {/* ── Mobile / Tablet Top Bar (< lg) ── */}
      <div className="flex lg:hidden items-center justify-between gap-2 pb-3 mb-3.5 border-b border-[var(--border)]">
        <button
          type="button"
          onClick={() => onNav && onNav('overview')}
          className="flex items-center gap-2 bg-transparent border-none p-0 cursor-pointer"
        >
          <ClubHubLogo size={30} />
          <span className="font-bold text-[15px] tracking-tight text-[var(--text)]">
            ClubHub
          </span>
        </button>

        <div className="flex items-center gap-2">
          {isDemo && onExitDemo ? (
            <button
              type="button"
              onClick={onExitDemo}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-[var(--blue-light)] border border-[var(--blue)]/25 text-xs font-semibold text-[var(--blue-ink)] cursor-pointer"
            >
              <LogIn size={13} />
              <span>Sign In</span>
            </button>
          ) : hasClerkKey && user ? (
            <div className="flex items-center">
              <UserButton appearance={getUserButtonAppearance(dark)} />
            </div>
          ) : user && onSignOut ? (
            <button
              type="button"
              onClick={onSignOut}
              title={`Signed in as ${user.email || user.fullName} — Sign out`}
              aria-label="Sign out"
              className="w-9 h-9 rounded-full bg-[var(--bg-card)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--red-ink)] cursor-pointer transition-colors"
            >
              <LogOut size={15} />
            </button>
          ) : null}

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

      {/* ── Page Title & Contextual Search Row ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text)]">
            {viewTitles[activeNav] || viewTitles.overview}
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-0.5">
            {viewSubtitles[activeNav] || viewSubtitles.overview}
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0">
          {showSearch && (
            <div className="flex-1 sm:w-[250px] min-w-0">
              <SearchBox
                placeholder={searchPlaceholders[activeNav] || 'Search…'}
                width="100%"
                value={searchQuery}
                onChange={onSearchChange}
              />
            </div>
          )}

          <div className="hidden lg:block relative">
            <button
              type="button"
              onClick={() => setNotifOpen(o => !o)}
              aria-label="Notifications"
              className="w-[42px] h-[42px] rounded-xl bg-[var(--bg-card)] border border-[var(--border)]
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
        </div>
      </div>

      {/* ── Notification Popover ── */}
      {notifOpen && (
        <div
          className="fixed sm:absolute left-3 right-3 top-[64px] sm:left-auto sm:right-0 sm:top-full sm:mt-2
            sm:w-84 rounded-[var(--radius)] bg-[var(--bg-card)] border border-[var(--border)]
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
            {items.map(item => {
              const isUnread = !readIds[item.id] && item.unread !== false
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setReadIds(prev => ({ ...prev, [item.id]: true }))
                    if (item.navTarget && onNav) {
                      onNav(item.navTarget)
                      setNotifOpen(false)
                    } else if (item.permalink) {
                      window.open(item.permalink, '_blank', 'noopener,noreferrer')
                      setNotifOpen(false)
                    }
                  }}
                  className="w-full text-left p-2.5 rounded-[var(--radius-sm)] border-none transition-colors cursor-pointer hover:bg-[var(--bg-surface)] flex items-start gap-2.5"
                  style={{
                    background: isUnread ? 'var(--bg-surface)' : 'transparent',
                  }}
                >
                  <IconBadge color={item.color || 'blue'} size={30} radius={9} className="mt-0.5">
                    <AnnouncementTypeIcon type={item.type} size={15} />
                  </IconBadge>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <BubbleTag label={item.type} color={item.color} size="sm" dot={isUnread} />
                      <span className="text-[10.5px] text-[var(--text-light)]">{item.time}</span>
                    </div>
                    <div className="text-xs font-semibold text-[var(--text)]">
                      {cleanText(item.title)}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-snug">
                      {cleanText(item.description)}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </header>
  )
}
