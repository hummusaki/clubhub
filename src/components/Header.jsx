import { useState, useEffect, useRef } from 'react'
import { Bell, Calendar, CheckCheck, Sparkles, Menu, Moon, Sun } from 'lucide-react'
import { UserButton } from '@clerk/react'
import { SearchBox, BubbleTag, ClubHubLogo } from './ui'
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
  const searchInputRef = useRef(null)
  const notifRef = useRef(null)

  const unreadCount = items.filter(i => i.unread).length

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      if (e.key === 'Escape') {
        setNotifOpen(false)
      }
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
    overview: `Good afternoon, ${greetingName} 👋`,
    myclubs: 'My Campus Clubs',
    discover: 'Discover Campus Clubs',
    calendar: 'Schedule & Events',
    members: 'Member Directory & Activity',
    links: 'Shared Links & Resources',
  }

  const notificationPopover = notifOpen && (
    <div
      className="fixed sm:absolute left-3 right-3 top-[68px] sm:left-auto sm:right-0 sm:top-full sm:mt-2.5
        sm:w-[340px] rounded-[var(--radius)] bg-[var(--bg-card)] border border-[var(--border-strong)]
        shadow-[var(--shadow-lg)] p-4 z-[100] fade-in"
    >
      <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-[var(--border)]">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Notifications ({unreadCount} unread)
        </span>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--blue-ink)]
              hover:underline cursor-pointer bg-transparent border-none"
          >
            <CheckCheck size={13} />
            Mark all read
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 max-h-[65vh] overflow-y-auto">
        {items.map(item => (
          <div
            key={item.id}
            onClick={() =>
              setItems(prev =>
                prev.map(x => (x.id === item.id ? { ...x, unread: false } : x))
              )
            }
            className="p-2.5 rounded-[var(--radius-sm)] border transition-colors cursor-pointer hover:bg-[var(--bg-surface)]"
            style={{
              background: item.unread ? 'var(--bg-surface)' : 'var(--bg-card)',
              borderColor: item.unread ? 'var(--border)' : 'var(--border-subtle)',
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <BubbleTag label={item.type} color={item.color} size="sm" dot={item.unread} />
              <span className="text-[10.5px] font-mono-num text-[var(--text-light)]">
                {item.time}
              </span>
            </div>
            <div className="text-xs font-bold text-[var(--text)]">{item.title}</div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-snug">
              {item.description}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <header className="relative z-40 mb-5 sm:mb-7 fade-in" ref={notifRef}>
      {/* ── Phone / Tablet Top App Bar (< lg) ── */}
      <div className="flex lg:hidden items-center justify-between gap-2 pb-3.5 mb-3.5 border-b border-[var(--border)]">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open navigation menu"
            className="w-9 h-9 rounded-xl bg-[var(--bg-card)] border border-[var(--border)]
              flex items-center justify-center text-[var(--text)] cursor-pointer shadow-[var(--shadow-xs)]"
          >
            <Menu size={18} />
          </button>

          <div
            onClick={() => onNav && onNav('overview')}
            className="flex items-center gap-2 cursor-pointer"
          >
            <ClubHubLogo size={32} />
            <span className="font-extrabold text-[16px] tracking-tight text-[var(--text)]">
              Club<span style={{ color: 'var(--blue-ink)' }}>Hub</span>
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
              flex items-center justify-center text-[var(--text-muted)] cursor-pointer shadow-[var(--shadow-xs)]"
          >
            {dark ? <Sun size={16} className="text-[var(--yellow)]" /> : <Moon size={16} />}
          </button>

          <button
            type="button"
            onClick={() => setNotifOpen(o => !o)}
            aria-label="Notifications"
            className="w-9 h-9 rounded-full bg-[var(--bg-card)] border border-[var(--border)]
              flex items-center justify-center cursor-pointer relative shadow-[var(--shadow-xs)]"
          >
            <Bell size={17} className="text-[var(--text-muted)]" />
            {unreadCount > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full
                  bg-[var(--red)] text-white text-[10px] font-bold font-mono-num
                  flex items-center justify-center shadow-sm"
              >
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Main Greeting & Controls Row ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
              style={{
                background: 'var(--bg-subtle)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
              }}
            >
              <Calendar size={11} />
              Sat, Nov 14 · Fall Week 11
            </span>
            {activeNav !== 'overview' && (
              <button
                onClick={() => onNav && onNav('overview')}
                className="text-[11px] font-semibold text-[var(--blue-ink)] hover:underline cursor-pointer bg-transparent border-none"
              >
                ← Back to Overview
              </button>
            )}
          </div>

          <h1 className="text-[22px] sm:text-[26px] font-extrabold tracking-tight text-[var(--text)] leading-tight">
            {viewTitles[activeNav] || viewTitles.overview}
          </h1>
          <p className="text-[13px] sm:text-[13.5px] text-[var(--text-muted)] mt-0.5">
            You have{' '}
            <button
              type="button"
              onClick={() => onNav && onNav('calendar')}
              className="font-bold text-[var(--blue-ink)] hover:underline cursor-pointer bg-transparent border-none p-0"
            >
              2 club meetings
            </button>{' '}
            today and <strong className="font-semibold text-[var(--text)]">1 hackathon</strong> closing soon.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <div className="flex-1 sm:flex-initial sm:w-[260px]">
            <SearchBox
              inputRef={searchInputRef}
              placeholder="Search clubs, events, members…"
              width="100%"
              value={searchQuery}
              onChange={onSearchChange}
              shortcut="/"
            />
          </div>

          {/* Explore Clubs button (desktop/tablet) */}
          <button
            type="button"
            onClick={() => onNav && onNav(activeNav === 'discover' ? 'overview' : 'discover')}
            className="hidden md:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold
              cursor-pointer transition-all duration-200 border shrink-0"
            style={{
              background: activeNav === 'discover' ? 'var(--blue)' : 'var(--bg-card)',
              color: activeNav === 'discover' ? '#fff' : 'var(--text)',
              borderColor: activeNav === 'discover' ? 'var(--blue)' : 'var(--border)',
              boxShadow: 'var(--shadow-xs)',
            }}
          >
            <Sparkles size={14} style={{ color: activeNav === 'discover' ? '#fff' : 'var(--blue)' }} />
            Explore Clubs
          </button>

          {/* Desktop Notification Bell (lg+) */}
          <div className="hidden lg:block relative">
            <button
              type="button"
              onClick={() => setNotifOpen(o => !o)}
              aria-label="Notifications"
              className="w-10 h-10 rounded-full bg-[var(--bg-card)] border border-[var(--border)]
                flex items-center justify-center cursor-pointer hover:border-[var(--blue)]
                transition-all duration-200 relative shadow-[var(--shadow-xs)]"
            >
              <Bell size={18} className="text-[var(--text-muted)]" />
              {unreadCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full
                    bg-[var(--red)] text-white text-[10px] font-bold font-mono-num
                    flex items-center justify-center shadow-sm"
                >
                  {unreadCount}
                </span>
              )}
            </button>
          </div>

          {/* Desktop User Avatar / Account (lg+) */}
          {hasClerkKey && user && (
            <div className="hidden lg:flex items-center pl-1">
              <UserButton appearance={getUserButtonAppearance(dark)} />
            </div>
          )}
        </div>
      </div>

      {/* Shared Notification Popover (rendered at header root with z-[100]) */}
      {notificationPopover}
    </header>
  )
}
