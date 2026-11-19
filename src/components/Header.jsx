import { useState, useEffect, useRef, useMemo } from 'react'
import { Bell, CheckCheck, LogIn, LogOut, Settings, ArrowRight, ChevronUp } from 'lucide-react'
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
import WorkspaceSearchResults from './WorkspaceSearchResults'
import { GLOBAL_SEARCH_LABEL } from '../utils/workspaceSearch'
import { announcementKey, announcementPermalink } from '../utils/announcementLinks'

export default function Header({
  searchSources,
  onSearchSelect,
  restoreSearchKey,
  activeNav = 'overview',
  onNav,
  onOpenAnnouncement,
  user = null,
  userSettings = {},
  isDemo = false,
  onExitDemo,
  onSignOut,
  announcements = null,
  joinedCount = 0,
}) {
  const [notifOpen, setNotifOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [readIds, setReadIds] = useState({})
  const searchInputRef = useRef(null)
  const searchRoot = useRef(null)
  const searchPanel = useRef(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
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
      if (readIds[announcementKey(i)] || i.unread === false) return false
      if (userSettings?.urgentOnlyBadge) {
        return String(i.type || '').toLowerCase() === 'urgent' || i.color === 'red'
      }
      return true
    }).length
  }, [items, readIds, userSettings?.urgentOnlyBadge])

  useEffect(() => {
    setNotifOpen(false)
    setUserMenuOpen(false)
    setSearchOpen(false)
  }, [activeNav])

  useEffect(() => {
    if (!restoreSearchKey) return
    setSearchOpen(true)
    const frame = requestAnimationFrame(() => {
      const result = Array.from(searchPanel.current?.querySelectorAll('[data-search-result]') || [])
        .find(entry => entry.dataset.searchResult === restoreSearchKey.id)
      const target = result || searchInputRef.current
      target?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [restoreSearchKey])

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.defaultPrevented || e.isComposing || e.target?.closest?.('[role="dialog"]')) return
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
          setSearchOpen(true)
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
    for (const item of items) next[announcementKey(item)] = true
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

  useEffect(() => {
    if (!searchOpen) return
    const viewport = window.visualViewport
    const panel = searchPanel.current
    function position() {
      const bottom = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight)
      panel.style.setProperty('--search-panel-height', `${Math.max(0, bottom - panel.getBoundingClientRect().top - 8)}px`)
    }
    position()
    viewport?.addEventListener('resize', position)
    viewport?.addEventListener('scroll', position)
    window.addEventListener('resize', position)
    return () => {
      viewport?.removeEventListener('resize', position)
      viewport?.removeEventListener('scroll', position)
      window.removeEventListener('resize', position)
    }
  }, [searchOpen])

  function openSearch() {
    setNotifOpen(false)
    setUserMenuOpen(false)
    setSearchOpen(true)
  }

  function closeSearch() {
    searchInputRef.current?.focus({ preventScroll: true })
    setSearchOpen(false)
  }

  function handleSearchKeys(event) {
    if (event.nativeEvent.isComposing || event.defaultPrevented) return
    if (event.key === 'Escape' && searchOpen) {
      event.preventDefault()
      event.stopPropagation()
      closeSearch()
      return
    }
    if (!searchOpen && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      event.preventDefault()
      openSearch()
      return
    }
    if (!searchOpen) return
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      searchInputRef.current.focus()
      searchInputRef.current.select()
      return
    }
    const results = [...searchRoot.current.querySelectorAll('[data-search-result]')]
    const index = results.indexOf(event.target)
    if (event.key === 'ArrowDown' || (event.key === 'ArrowUp' && index !== -1)) {
      event.preventDefault()
      const next = index + (event.key === 'ArrowDown' ? 1 : -1)
      if (next < 0) searchInputRef.current.focus()
      else results[Math.min(next, results.length - 1)]?.focus()
    } else if (event.key === 'Enter' && event.target === searchInputRef.current && results.length) {
      event.preventDefault()
      results[0].click()
    } else if (event.key === 'Tab') {
      const controls = [...searchRoot.current.querySelectorAll('input, button:not(:disabled)')]
      if (event.shiftKey && event.target === controls[0]) {
        event.preventDefault()
        controls.at(-1)?.focus()
      } else if (!event.shiftKey && event.target === controls.at(-1)) {
        event.preventDefault()
        controls[0]?.focus()
      }
    }
  }

  return (
    <header className="workspace-header" data-search-open={searchOpen || undefined}>
        <div className="workspace-brand flex items-center shrink-0">
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

        {searchOpen && <div className="workspace-search-scrim" aria-hidden="true" onClick={closeSearch} />}
        <div ref={searchRoot} className="workspace-search"
          role={searchOpen ? 'dialog' : 'search'} aria-modal={searchOpen || undefined}
          aria-label={searchOpen ? 'ClubHub search' : undefined} onKeyDown={handleSearchKeys}>
          <SearchBox
            inputRef={searchInputRef}
            placeholder={GLOBAL_SEARCH_LABEL}
            value={searchQuery}
            onChange={value => {
              setSearchQuery(value)
              openSearch()
            }}
            onFocus={() => { setNotifOpen(false); setUserMenuOpen(false) }}
            onKeyDown={event => {
              if (event.key !== 'Escape' || event.nativeEvent.isComposing) return
              if (searchOpen) handleSearchKeys(event)
              else if (searchQuery) {
                event.preventDefault()
                setSearchQuery('')
              }
            }}
            onClick={openSearch}
            shortcutHint="/"
            variant="topbar"
            trailingSlot={searchOpen && (
              <IconButton size="sm" ariaLabel="Close search" title="Close search" onClick={closeSearch} className="-mr-2">
                <ChevronUp size={18} aria-hidden="true" />
              </IconButton>
            )}
          />
          {searchOpen && (
            <div ref={searchPanel} className="workspace-search-panel">
              <WorkspaceSearchResults query={searchQuery} sources={searchSources} onSelect={(type, item) => {
                setSearchOpen(false)
                onSearchSelect?.(type, item, { search: `${type}:${item.id}`, focus: searchInputRef.current })
              }} />
            </div>
          )}
        </div>

        {/* Right: 40x40px Circular Google Workspace Utility Controls */}
        <div className="workspace-utilities flex items-center gap-1 shrink-0 relative">
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
                    const key = announcementKey(item)
                    const isUnread = !readIds[key] && item.unread !== false
                    const permalink = announcementPermalink(item)
                    const Control = permalink ? 'a' : 'button'
                    return (
                      <Control
                        key={key}
                        {...(permalink
                          ? { href: permalink, target: '_blank', rel: 'noopener noreferrer' }
                          : { type: 'button' })}
                        onClick={() => {
                          setReadIds(prev => ({ ...prev, [key]: true }))
                          setNotifOpen(false)
                          if (permalink) notifBtnRef.current?.focus({ preventScroll: true })
                          else onOpenAnnouncement?.(item)
                        }}
                        className={`w-full text-left p-3 rounded-2xl border-none no-underline transition-colors cursor-pointer hover:bg-[var(--md-surface-container)] flex items-start gap-3 ${
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
                          <div className="text-xs sm:text-sm font-medium text-[var(--text)] wrap-anywhere">
                            {cleanText(item.title)}
                          </div>
                          <div className="text-xs text-[var(--text-muted)] mt-0.5 leading-snug line-clamp-2">
                            {cleanText(item.description)}
                          </div>
                        </div>
                      </Control>
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
    </header>
  )
}
