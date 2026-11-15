import { useState, useEffect, useRef, useMemo } from 'react'
import { Bell, CheckCheck, Moon, Sun, LogIn, LogOut, Settings, ChevronDown } from 'lucide-react'
import { SearchBox, BubbleTag, ClubHubLogo, IconBadge, Avatar, cleanText } from './ui'
import { AnnouncementTypeIcon, PlatformIcon } from './icons'
import { announcements as initialAnnouncements } from '../data/sampleData'

export default function Header({
  searchQuery = '',
  onSearchChange,
  activeNav = 'overview',
  onNav,
  dark = false,
  onToggleDark,
  user = null,
  userSettings = {},
  isDemo = false,
  onExitDemo,
  onSignOut,
  announcements = null,
  upcomingCount = 0,
}) {
  const [notifOpen, setNotifOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [readIds, setReadIds] = useState({})
  const searchInputRef = useRef(null)
  const mobileNotifBtnRef = useRef(null)
  const desktopNotifBtnRef = useRef(null)
  const notifPanelRef = useRef(null)
  const userMenuBtnRef = useRef(null)
  const userMenuPanelRef = useRef(null)

  const rawItems = announcements && announcements.length > 0 ? announcements : initialAnnouncements

  // Apply channel preferences from User Settings
  const items = useMemo(() => {
    const channels = userSettings?.channels || {}
    return rawItems.filter(item => {
      const src = String(item.source || '').toLowerCase()
      if (src.includes('instagram') && channels.instagram === false) return false
      if (src.includes('discord') && channels.discord === false) return false
      if (src.includes('email') && channels.email === false) return false
      return true
    })
  }, [rawItems, userSettings?.channels])

  const unreadCount = useMemo(() => {
    return items.filter(i => {
      if (readIds[i.id] || i.unread === false) return false
      if (userSettings?.urgentOnlyBadge) {
        return String(i.type || '').toLowerCase() === 'urgent' || i.color === 'red'
      }
      return true
    }).length
  }, [items, readIds, userSettings?.urgentOnlyBadge])

  useEffect(() => {
    setNotifOpen(false)
    setUserMenuOpen(false)
  }, [activeNav])

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setNotifOpen(false)
        setUserMenuOpen(false)
        return
      }

      // Global Cmd+K / Ctrl+K or "/" shortcut to focus site-wide search
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
      const target = e.target
      const isEditableTarget =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)

      if (isCmdK || (e.key === '/' && !isEditableTarget && !e.metaKey && !e.ctrlKey && !e.altKey)) {
        if (searchInputRef.current) {
          e.preventDefault()
          setNotifOpen(false)
          setUserMenuOpen(false)
          searchInputRef.current.focus()
          searchInputRef.current.select()
        }
      }
    }
    function handleClickOutside(e) {
      const target = e.target
      if (target instanceof Element && target.closest('[data-toast-viewport]')) {
        return
      }
      const clickedInsideNotif =
        notifPanelRef.current?.contains(target) ||
        mobileNotifBtnRef.current?.contains(target) ||
        desktopNotifBtnRef.current?.contains(target)
      if (!clickedInsideNotif) {
        setNotifOpen(false)
      }

      const clickedInsideUserMenu =
        userMenuPanelRef.current?.contains(target) ||
        userMenuBtnRef.current?.contains(target)
      if (!clickedInsideUserMenu) {
        setUserMenuOpen(false)
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

  const effectiveUser = isDemo ? null : user

  const displayName =
    userSettings?.displayName?.trim() ||
    effectiveUser?.fullName ||
    effectiveUser?.primaryEmailAddress?.emailAddress?.split('@')[0] ||
    effectiveUser?.email?.split('@')[0] ||
    (isDemo ? 'Demo Guest' : 'Student')

  const displayEmail =
    effectiveUser?.primaryEmailAddress?.emailAddress ||
    effectiveUser?.email ||
    (isDemo ? 'Preview Mode' : 'Verified Member')

  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'ST'

  const avatarGradient =
    userSettings?.avatarBg ||
    effectiveUser?.avatarBg ||
    'linear-gradient(135deg, var(--blue), var(--purple))'

  const customFirst = userSettings?.displayName?.trim()
    ? userSettings.displayName.trim().split(' ')[0]
    : null
  const firstName =
    customFirst ||
    effectiveUser?.firstName ||
    (effectiveUser?.fullName ? effectiveUser.fullName.split(' ')[0] : null) ||
    (effectiveUser?.email ? effectiveUser.email.split('@')[0] : null)
  const greetingName = firstName || (isDemo ? 'Guest' : 'Student')

  const viewTitles = {
    overview: isDemo && !customFirst ? 'Welcome, Guest' : `Welcome back, ${greetingName}`,
    tasks: 'Task Board',
    calendar: 'Calendar',
    availability: 'Group Availability',
    clubs: 'Clubs & Community',
    links: 'Shared Resources',
    settings: 'Settings',
  }

  const viewSubtitles = {
    overview: `${upcomingCount} upcoming ${upcomingCount === 1 ? 'event' : 'events'} across your campus clubs`,
    tasks: 'Track club deliverables, section progress, and board assignments',
    calendar: 'Scheduled club meetings, workshops, and RSVPs',
    availability: 'Click or drag when you are free — group overlap updates automatically',
    clubs: 'Manage your memberships, roles, club feed, and directory',
    links: 'Pinned club documents, forms, and community links',
    settings: 'Manage your profile, theme, calendar sync, integrations, and notifications',
  }

  const searchPlaceholders = {
    overview: 'Search clubs, events, links…',
    calendar: 'Search events, clubs, rooms…',
    clubs: 'Search clubs, people, @handles…',
    links: 'Search links, docs, clubs…',
  }

  const showSearch =
    activeNav !== 'availability' && activeNav !== 'settings' && activeNav !== 'tasks'
  const isCompact = Boolean(userSettings?.compactCards)

  return (
    <header className={`relative z-30 ${isCompact ? 'mb-3.5 sm:mb-4' : 'mb-5 sm:mb-6'}`}>
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
          <button
            type="button"
            onClick={onToggleDark}
            aria-label="Toggle dark mode"
            className="w-9.5 h-9.5 rounded-full bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--border-strong)]
              flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer transition-colors"
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <button
            ref={mobileNotifBtnRef}
            type="button"
            onClick={() => {
              setUserMenuOpen(false)
              setNotifOpen(o => !o)
            }}
            aria-label="Notifications"
            className="w-9.5 h-9.5 rounded-full bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--border-strong)]
              flex items-center justify-center cursor-pointer relative transition-colors"
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

          {(user || isDemo) && (
            <button
              ref={userMenuBtnRef}
              type="button"
              onClick={() => {
                setNotifOpen(false)
                setUserMenuOpen(o => !o)
              }}
              title={`${displayName} — Account menu`}
              aria-label="Account menu"
              className="flex items-center gap-1 pl-1 pr-2 h-9.5 rounded-full bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--border-strong)] cursor-pointer transition-colors"
            >
              <Avatar initials={initials} bg={avatarGradient} size={28} />
              <ChevronDown size={13} className="text-[var(--text-muted)]" />
            </button>
          )}
        </div>
      </div>

      {/* ── Page Title & Contextual Search Row ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text)]">
            {viewTitles[activeNav] || viewTitles.overview}
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-0.5">
            {viewSubtitles[activeNav] || viewSubtitles.overview}
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0">
          {showSearch && (
            <div
              className="flex-1 sm:w-[285px] md:w-[320px] lg:w-[350px] min-w-0"
              onFocusCapture={() => {
                setNotifOpen(false)
                setUserMenuOpen(false)
              }}
            >
              <SearchBox
                inputRef={searchInputRef}
                placeholder={searchPlaceholders[activeNav] || 'Search…'}
                width="100%"
                value={searchQuery}
                onChange={onSearchChange}
                shortcutHint="/"
              />
            </div>
          )}

          <div className="hidden lg:flex items-center gap-2.5 relative">
            <button
              ref={desktopNotifBtnRef}
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

      {/* ── Mobile User Account Dropdown (< lg, when left Sidebar is hidden) ── */}
      {userMenuOpen && (user || isDemo) && (
        <div
          ref={userMenuPanelRef}
          className="lg:hidden absolute right-0 top-[54px]
            w-[235px] rounded-[var(--radius)] bg-[var(--bg-card)] border border-[var(--border)]
            shadow-[var(--shadow-lg)] p-2 z-[95] fade-in"
        >
          <div className="px-3 py-2.5 border-b border-[var(--border)] mb-1 flex items-center gap-2.5">
            <Avatar initials={initials} bg={avatarGradient} size={32} />
            <div className="min-w-0">
              <div className="text-xs font-bold text-[var(--text)] truncate">{displayName}</div>
              <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                {displayEmail}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setUserMenuOpen(false)
              if (onNav) onNav('settings')
            }}
            className="w-full flex items-center gap-2.5 px-3 min-h-[38px] rounded-xl text-xs font-semibold text-[var(--text)] bg-transparent hover:bg-[var(--bg-surface)] border-none cursor-pointer text-left transition-colors"
          >
            <Settings size={15} className="text-[var(--text-muted)]" />
            <span>Profile & Settings</span>
          </button>

          {(onSignOut || (isDemo && onExitDemo)) && (
            <button
              type="button"
              onClick={() => {
                setUserMenuOpen(false)
                if (isDemo && onExitDemo) onExitDemo()
                else if (onSignOut) onSignOut()
              }}
              className="w-full flex items-center gap-2.5 px-3 min-h-[38px] rounded-xl text-xs font-semibold text-[var(--red-ink)] bg-transparent hover:bg-[var(--red-light)] border-none cursor-pointer text-left transition-colors"
            >
              {isDemo ? <LogIn size={15} /> : <LogOut size={15} />}
              <span>{isDemo ? 'Sign In / Exit Demo' : 'Log Out'}</span>
            </button>
          )}
        </div>
      )}

      {/* ── Notification Popover (Anchored directly beneath Bell — No transform trap) ── */}
      {notifOpen && (
        <div
          ref={notifPanelRef}
          className="absolute left-0 right-0 top-[54px] sm:left-auto sm:right-0 sm:w-[340px] lg:top-full lg:mt-2
            rounded-[var(--radius)] bg-[var(--bg-card)] border border-[var(--border)]
            shadow-[var(--shadow-lg)] p-4 z-[90] fade-in"
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

          {items.length > 0 ? (
            <div className="flex flex-col gap-2 max-h-[min(56vh,calc(100dvh-14rem))] overflow-y-auto">
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
                      {item.source === 'discord' ? (
                        <PlatformIcon type="discord" size={15} />
                      ) : item.source === 'email' ? (
                        <PlatformIcon type="email" size={15} />
                      ) : item.source === 'instagram_story' ? (
                        <PlatformIcon type="instagram" size={15} />
                      ) : (
                        <AnnouncementTypeIcon type={item.type} size={15} />
                      )}
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
          ) : (
            <div className="py-6 text-center text-xs text-[var(--text-muted)]">
              No notifications for your enabled channels.
            </div>
          )}
        </div>
      )}
    </header>
  )
}
