import { useState, useEffect, useRef, useMemo } from 'react'
import { Bell, CheckCheck, Moon, Sun, LogIn, LogOut, Settings, ArrowRight } from 'lucide-react'
import {
  SearchBox,
  BubbleTag,
  ClubHubLogo,
  IconBadge,
  IconButton,
  Button,
  Avatar,
  cleanText,
} from './ui'
import { AnnouncementTypeIcon, PlatformIcon } from './icons'
import AiClubAgentModal from './AiClubAgentModal'

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
  joinedCount = 0,
  clubs = [],
  events = [],
  onToggleJoinClub,
  onNotify,
}) {
  const [notifOpen, setNotifOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [readIds, setReadIds] = useState({})
  const searchInputRef = useRef(null)
  const notifBtnRef = useRef(null)
  const notifPanelRef = useRef(null)
  const userMenuBtnRef = useRef(null)
  const userMenuPanelRef = useRef(null)

  const rawItems = useMemo(
    () => (joinedCount > 0 && Array.isArray(announcements) ? announcements : []),
    [joinedCount, announcements]
  )

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
      if (e.defaultPrevented || e.target?.closest?.('[role="dialog"]')) return
      if (e.key === 'Escape') {
        if (notifPanelRef.current?.contains(e.target)) notifBtnRef.current?.focus()
        if (userMenuPanelRef.current?.contains(e.target)) userMenuBtnRef.current?.focus()
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
        notifPanelRef.current?.contains(target) || notifBtnRef.current?.contains(target)
      if (!clickedInsideNotif) {
        setNotifOpen(false)
      }

      const clickedInsideUserMenu =
        userMenuPanelRef.current?.contains(target) || userMenuBtnRef.current?.contains(target)
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
    (isDemo ? 'Guest Preview Session' : 'Verified Campus Account')

  const initials =
    displayName
      .split(' ')
      .filter(Boolean)
      .map(w => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'ST'

  const avatarGradient = userSettings?.avatarBg || effectiveUser?.avatarBg || '#1A73E8'

  const searchPlaceholders = {
    overview: 'Search clubs, events, links…',
    calendar: 'Search events, clubs, rooms…',
    clubs: 'Search clubs, people, @handles…',
    links: 'Search links, docs, clubs…',
  }

  const showSearch =
    activeNav !== 'availability' && activeNav !== 'settings' && activeNav !== 'tasks'

  return (
    <>
      {/* ── Fixed 64px Google Workspace Top App Bar ── */}
      <div className="fixed top-0 inset-x-0 h-16 bg-[var(--bg)] z-40 px-3 sm:px-4 lg:px-5 flex items-center justify-between gap-3">
        {/* Left: Brand Lockup (Aligned with 256px Nav Drawer on lg+) */}
        <div className="flex items-center lg:w-[236px] shrink-0">
          <button
            type="button"
            onClick={() => onNav && onNav('overview')}
            className="inline-flex items-center gap-2.5 px-2 py-1.5 rounded-full bg-transparent border-none cursor-pointer text-left hover:bg-[var(--md-surface-container)] transition-colors"
          >
            <ClubHubLogo size={34} />
            <span className="font-display text-[20px] font-normal text-[var(--text)] leading-none">
              ClubHub
            </span>
          </button>
        </div>

        {/* Right: 40x40px Circular Google Workspace Utility Controls */}
        <div className="flex items-center gap-1 shrink-0 relative">
          <IconButton
            ref={notifBtnRef}
            selected={notifOpen}
            onClick={() => {
              setUserMenuOpen(false)
              setNotifOpen(o => !o)
            }}
            aria-expanded={notifOpen}
            aria-controls="notification-panel"
            ariaLabel="Notifications"
            title="Notifications"
            className="relative"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span
                className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full
                  bg-[var(--red)] text-[var(--on-red)] text-[10px] font-medium font-mono-num
                  flex items-center justify-center leading-none"
              >
                {unreadCount}
              </span>
            )}
          </IconButton>

            <button
              ref={userMenuBtnRef}
              type="button"
              onClick={() => {
                setNotifOpen(false)
                setUserMenuOpen(o => !o)
              }}
              title={`${displayName} (${displayEmail})`}
              aria-label="Account menu"
              aria-expanded={userMenuOpen}
              aria-controls="account-panel"
              className="ui-touch w-10 h-10 rounded-full flex items-center justify-center bg-transparent hover:bg-[var(--md-surface-container-high)] border-none cursor-pointer transition-colors ml-0.5"
            >
              <Avatar initials={initials} bg={avatarGradient} size={32} />
            </button>

          {/* ── Google Account-Style Popover Card ── */}
          {userMenuOpen && (
            <div
              ref={userMenuPanelRef}
              id="account-panel"
              className="fixed sm:absolute right-3 sm:right-0 top-[60px] sm:top-[48px] w-[calc(100vw-1.5rem)] max-w-[320px]
                rounded-[28px] bg-[var(--md-surface-container)] dark:bg-[var(--md-surface-container-high)]
                border border-[var(--border)] shadow-[var(--shadow-lg)] p-5 z-[95] fade-in text-center space-y-4"
            >
              <div className="text-xs font-medium text-[var(--text-muted)] truncate px-2">
                {displayEmail}
              </div>

              <div className="flex flex-col items-center gap-2">
                <Avatar initials={initials} bg={avatarGradient} size={64} />
                <div className="font-display text-xl font-normal text-[var(--text)] truncate max-w-full">
                  {displayName}
                </div>
              </div>

              <div className="grid gap-1">
                <Button
                  icon={<Settings size={16} />}
                  variant="text-neutral"
                  size="md"
                  onClick={() => {
                    setUserMenuOpen(false)
                    if (onNav) onNav('settings')
                  }}
                  className="w-full"
                >
                  Settings
                </Button>
                {onToggleDark && (
                  <Button
                    variant="text-neutral"
                    icon={dark ? <Sun size={16} /> : <Moon size={16} />}
                    onClick={onToggleDark}
                    className="w-full"
                  >
                    {dark ? 'Switch to light mode' : 'Switch to dark mode'}
                  </Button>
                )}
              </div>

              {(onSignOut || (isDemo && onExitDemo)) && (
                <div className="pt-2 border-t border-[var(--border)]">
                  <Button
                    variant="tonal"
                    size="md"
                    icon={isDemo ? <LogIn size={16} /> : <LogOut size={16} />}
                    onClick={() => {
                      setUserMenuOpen(false)
                      if (isDemo && onExitDemo) onExitDemo()
                      else if (onSignOut) onSignOut()
                    }}
                    className="w-full"
                  >
                    {isDemo ? 'Sign in with account' : 'Sign out'}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── Google M3 Notification Popover ── */}
          {notifOpen && (
            <div
              ref={notifPanelRef}
              id="notification-panel"
              className="fixed sm:absolute right-3 sm:right-0 top-[60px] sm:top-[48px] w-[calc(100vw-1.5rem)] sm:w-[368px]
                rounded-[28px] bg-[var(--bg-card)] dark:bg-[var(--md-surface-container-high)]
                border border-[var(--border)] shadow-[var(--shadow-lg)] p-4 z-[95] fade-in"
            >
              <div className="flex items-center justify-between px-1 pb-3 mb-2 border-b border-[var(--border)]">
                <span className="font-display text-base font-normal text-[var(--text)]">
                  Notifications
                </span>
                {unreadCount > 0 && (
                  <Button
                    variant="text"
                    size="sm"
                    icon={<CheckCheck size={14} />}
                    onClick={markAllRead}
                  >
                    Mark all read
                  </Button>
                )}
              </div>

              {items.length > 0 ? (
                <div className="flex flex-col gap-1 max-h-[min(56vh,calc(100dvh-14rem))] overflow-y-auto">
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
                        className={`w-full text-left p-3 rounded-2xl border-none transition-colors cursor-pointer hover:bg-[var(--md-surface-container)] flex items-start gap-3 ${
                          isUnread ? 'bg-[var(--md-surface-container)]/75' : 'bg-transparent'
                        }`}
                      >
                        <IconBadge
                          color={item.color || 'blue'}
                          size={36}
                          radius={9999}
                          className="mt-0.5"
                        >
                          {item.source === 'discord' ? (
                            <PlatformIcon type="discord" size={16} />
                          ) : item.source === 'email' ? (
                            <PlatformIcon type="email" size={16} />
                          ) : item.source === 'instagram_story' ? (
                            <PlatformIcon type="instagram" size={16} />
                          ) : (
                            <AnnouncementTypeIcon type={item.type} size={16} />
                          )}
                        </IconBadge>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <BubbleTag
                              label={item.type}
                              color={item.color}
                              size="sm"
                              dot={isUnread}
                            />
                            <span className="text-[11px] text-[var(--text-light)] shrink-0">
                              {item.time}
                            </span>
                          </div>
                          <div className="text-xs sm:text-sm font-medium text-[var(--text)]">
                            {cleanText(item.title)}
                          </div>
                          <div className="text-xs text-[var(--text-muted)] mt-0.5 leading-snug line-clamp-2">
                            {cleanText(item.description)}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : joinedCount === 0 ? (
                <div className="py-6 px-3 text-center space-y-3">
                  <p className="text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed">
                    Join a campus club to start receiving announcements and event updates.
                  </p>
                  {onNav && (
                    <Button
                      variant="tonal"
                      size="sm"
                      trailingIcon={<ArrowRight size={14} />}
                      onClick={() => {
                        onNav('clubs', { section: 'discover' })
                        setNotifOpen(false)
                      }}
                    >
                      Browse clubs
                    </Button>
                  )}
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-[var(--text-muted)]">
                  You&apos;re all caught up.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showSearch && (
        <div className="global-search flex items-center gap-2 min-w-0">
          <div
            className="flex-1 min-w-0"
            onFocusCapture={() => {
              setNotifOpen(false)
              setUserMenuOpen(false)
            }}
          >
            <SearchBox
              inputRef={searchInputRef}
              placeholder={searchPlaceholders[activeNav]}
              width="100%"
              value={searchQuery}
              onChange={onSearchChange}
              shortcutHint="/"
              variant="topbar"
            />
          </div>
          {activeNav !== 'overview' && (
            <AiClubAgentModal
              clubs={clubs}
              events={events}
              userSettings={userSettings}
              onToggleJoinClub={onToggleJoinClub}
              onOpenClub={opts => onNav && onNav('clubs', opts)}
              onOpenCalendar={opts => onNav && onNav('calendar', opts)}
              onNotify={onNotify}
            />
          )}
        </div>
      )}
    </>
  )
}
