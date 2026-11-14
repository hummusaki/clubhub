import { useState, useEffect, useRef } from 'react'
import { Bell, Calendar, CheckCheck, Sparkles } from 'lucide-react'
import { SearchBox, BubbleTag } from './ui'
import { announcements as initialAnnouncements } from '../data/sampleData'

export default function Header({
  searchQuery = '',
  onSearchChange,
  activeNav = 'overview',
  onNav,
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

  const viewTitles = {
    overview: 'Good afternoon, Jane 👋',
    myclubs: 'My Campus Clubs',
    discover: 'Discover Campus Clubs',
    calendar: 'Schedule & Events',
    members: 'Member Directory & Activity',
    links: 'Shared Links & Resources',
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 mb-7 fade-in">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
            style={{
              background: 'var(--bg-subtle)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
          >
            <Calendar size={11} />
            Saturday, Nov 14 · Fall Week 11
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

        <h1 className="text-[26px] font-extrabold tracking-tight text-[var(--text)] leading-tight">
          {viewTitles[activeNav] || viewTitles.overview}
        </h1>
        <p className="text-[13.5px] text-[var(--text-muted)] mt-0.5">
          You have{' '}
          <button
            type="button"
            onClick={() => onNav && onNav('calendar')}
            className="font-bold text-[var(--blue-ink)] hover:underline cursor-pointer bg-transparent border-none p-0"
          >
            2 club meetings
          </button>{' '}
          scheduled today and <strong className="font-semibold text-[var(--text)]">1 hackathon</strong> registration closing soon.
        </p>
      </div>

      <div className="flex items-center gap-2.5">
        <SearchBox
          inputRef={searchInputRef}
          placeholder="Search clubs, events, members…"
          width="268px"
          value={searchQuery}
          onChange={onSearchChange}
          shortcut="/"
        />

        {/* Explore / Discover quick button */}
        <button
          type="button"
          onClick={() => onNav && onNav(activeNav === 'discover' ? 'overview' : 'discover')}
          className="hidden md:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold
            cursor-pointer transition-all duration-200 border"
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

        {/* Notification bell + popover */}
        <div className="relative" ref={notifRef}>
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

          {notifOpen && (
            <div
              className="absolute right-0 mt-2 w-80 rounded-[var(--radius)] bg-[var(--bg-card)]
                border border-[var(--border)] shadow-[var(--shadow-lg)] p-4 z-50 fade-in"
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

              <div className="flex flex-col gap-2.5">
                {items.map(item => (
                  <div
                    key={item.id}
                    onClick={() =>
                      setItems(prev =>
                        prev.map(x => (x.id === item.id ? { ...x, unread: false } : x))
                      )
                    }
                    className="p-2.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer hover:bg-[var(--bg-surface)]"
                    style={{
                      background: item.unread ? 'var(--bg-surface)' : 'transparent',
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <BubbleTag label={item.type} color={item.color} size="sm" dot={item.unread} />
                      <span className="text-[10.5px] text-[var(--text-light)]">{item.time}</span>
                    </div>
                    <div className="text-xs font-bold text-[var(--text)]">{item.title}</div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-snug">
                      {item.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
