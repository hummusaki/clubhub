import { Moon, Sun, X, LogIn } from 'lucide-react'
import { UserButton } from '@clerk/react'
import { navItems } from '../data/sampleData'
import { Avatar, ClubHubLogo } from './ui'
import { NavIcon } from './icons'
import { getUserButtonAppearance } from '../clerkTheme'

export default function Sidebar({
  activeNav,
  onNav,
  dark,
  onToggleDark,
  mobileOpen = false,
  onCloseMobile,
  user = null,
  isDemo = false,
  onExitDemo,
  hasClerkKey = false,
}) {
  function handleSelect(id) {
    onNav(id)
    if (onCloseMobile) onCloseMobile()
  }

  const sidebarContent = (
    <>
      {/* ── Brand Logo ── */}
      <div className="flex items-center justify-between px-2.5 mb-7">
        <div
          onClick={() => handleSelect('overview')}
          className="flex items-center gap-2.5 cursor-pointer"
        >
          <ClubHubLogo size={36} />
          <div>
            <div className="font-bold text-[16px] tracking-tight text-[var(--text)] leading-tight">
              ClubHub
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">
              Campus Dashboard
            </div>
          </div>
        </div>

        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close menu"
            className="lg:hidden w-8 h-8 rounded-full bg-[var(--bg-subtle)] text-[var(--text-muted)]
              flex items-center justify-center border-none cursor-pointer"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* ── Navigation Links ── */}
      <nav className="flex-1 flex flex-col gap-0.5">
        {navItems.map(item => {
          const isActive = activeNav === item.id

          return (
            <button
              key={item.id}
              onClick={() => handleSelect(item.id)}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-[var(--radius-sm)]
                text-[13.5px] cursor-pointer transition-colors duration-200 border-none text-left
                ${
                  isActive
                    ? 'font-semibold text-[var(--blue-ink)] bg-[var(--blue-light)]'
                    : 'font-medium text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text)] bg-transparent'
                }`}
            >
              <NavIcon name={item.icon} active={isActive} size={19} />
              <span>{item.label}</span>
            </button>
          )
        })}

        {/* ── Bottom Section ── */}
        <div className="mt-auto pt-4 border-t border-[var(--border)] flex flex-col gap-1">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2.5 text-[13px] text-[var(--text-muted)]">
              {dark ? <Sun size={16} /> : <Moon size={16} />}
              <span>Dark Mode</span>
            </div>
            <button
              onClick={onToggleDark}
              aria-label="Toggle dark mode"
              className="w-11 h-6 rounded-full relative cursor-pointer transition-colors duration-300 border-none"
              style={{
                background: dark ? 'var(--blue)' : 'var(--border-strong)',
              }}
            >
              <div
                className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform duration-300
                  shadow-[0_1px_3px_rgba(0,0,0,0.18)]"
                style={{ left: 2, transform: dark ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </button>
          </div>

          {hasClerkKey && user ? (
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <UserButton appearance={getUserButtonAppearance(dark)} />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-[var(--text)] truncate">
                    {user.fullName ||
                      user.primaryEmailAddress?.emailAddress?.split('@')[0] ||
                      'Student'}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate">
                    {user.primaryEmailAddress?.emailAddress || 'Verified Member'}
                  </div>
                </div>
              </div>
            </div>
          ) : isDemo ? (
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar
                  initials="DM"
                  bg="linear-gradient(135deg, var(--blue), var(--purple))"
                  size={32}
                />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-[var(--text)] truncate">
                    Demo Student
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate">
                    Preview Mode
                  </div>
                </div>
              </div>
              {onExitDemo && (
                <button
                  type="button"
                  onClick={onExitDemo}
                  className="flex items-center gap-1 text-[11px] font-semibold text-[var(--blue-ink)] hover:underline cursor-pointer bg-transparent border-none p-0"
                >
                  <LogIn size={12} />
                  <span>Sign In</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2.5 px-3 py-2">
              <Avatar
                initials="JD"
                bg="linear-gradient(135deg, var(--teal), var(--green))"
                size={32}
              />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-[var(--text)] truncate">
                  Jane Doe
                </div>
                <div className="text-[11px] text-[var(--text-muted)] truncate">
                  jdoe@university.edu
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>
    </>
  )

  return (
    <>
      {/* ── Desktop Sticky Sidebar ── */}
      <aside
        className="hidden lg:flex w-[252px] sticky top-0 h-screen bg-[var(--bg-card)] border-r border-[var(--border)]
          flex-col px-3.5 py-5 shrink-0 transition-colors duration-300 select-none overflow-y-auto z-30"
      >
        {sidebarContent}
      </aside>

      {/* ── Mobile Slide-Over Drawer ── */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            onClick={onCloseMobile}
            className="fixed inset-0 bg-black/35 backdrop-blur-[2px]"
          />
          <aside
            className="relative w-[264px] max-w-[82vw] h-full bg-[var(--bg-card)] border-r border-[var(--border)]
              flex flex-col px-3.5 py-5 select-none overflow-y-auto z-10 shadow-[var(--shadow-lg)]"
          >
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* ── Phone Bottom Navigation Bar ── */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--bg-glass)] backdrop-blur-md
          border-t border-[var(--border)] px-2 py-1.5 flex items-center justify-around select-none"
        style={{
          paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))',
        }}
      >
        {navItems.slice(0, 5).map(item => {
          const isActive = activeNav === item.id
          const shortLabels = {
            overview: 'Overview',
            myclubs: 'Clubs',
            discover: 'Discover',
            calendar: 'Schedule',
            members: 'Members',
          }
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNav(item.id)}
              className="flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl
                border-none bg-transparent cursor-pointer"
              style={{
                color: isActive ? 'var(--blue-ink)' : 'var(--text-muted)',
              }}
            >
              <NavIcon name={item.icon} active={isActive} size={18} />
              <span className={`text-[10.5px] ${isActive ? 'font-semibold' : 'font-medium'}`}>
                {shortLabels[item.id] || item.label}
              </span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
