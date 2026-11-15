import { Moon, Sun, LogIn, LogOut } from 'lucide-react'
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
  user = null,
  userSettings = {},
  isDemo = false,
  onExitDemo,
  onSignOut,
  hasClerkKey = false,
}) {
  const displayName =
    userSettings?.displayName?.trim() ||
    user?.fullName ||
    user?.primaryEmailAddress?.emailAddress?.split('@')[0] ||
    user?.email?.split('@')[0] ||
    (isDemo ? 'Demo Guest' : 'Student')

  const subline =
    userSettings?.major?.trim() ||
    user?.primaryEmailAddress?.emailAddress ||
    user?.email ||
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
    user?.avatarBg ||
    'linear-gradient(135deg, var(--blue), var(--purple))'

  return (
    <>
      {/* ── Desktop Fixed Sidebar (lg+): Locked to Viewport, Never Scrolls With Page ── */}
      <aside
        className="hidden lg:flex fixed inset-y-0 left-0 w-[252px] h-dvh bg-[var(--bg-card)] border-r border-[var(--border)]
          flex-col px-3.5 py-5 z-40 select-none overflow-y-auto"
      >
        {/* Brand Logo */}
        <button
          type="button"
          onClick={() => onNav('overview')}
          className="flex items-center gap-2.5 px-2.5 mb-7 bg-transparent border-none text-left cursor-pointer shrink-0"
        >
          <ClubHubLogo size={36} />
          <div>
            <div className="font-bold text-[16px] tracking-tight text-[var(--text)] leading-tight">
              ClubHub
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">
              Campus Workspace
            </div>
          </div>
        </button>

        {/* Primary Navigation */}
        <nav className="flex-1 flex flex-col gap-1">
          {navItems.map(item => {
            const isActive = activeNav === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNav(item.id)}
                className={`flex items-center gap-3 px-3.5 min-h-[42px] rounded-[var(--radius-sm)]
                  text-[13.5px] cursor-pointer transition-colors duration-150 border-none text-left
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

          <button
            type="button"
            onClick={() => onNav('settings')}
            className={`flex items-center gap-3 px-3.5 min-h-[42px] rounded-[var(--radius-sm)]
              text-[13.5px] cursor-pointer transition-colors duration-150 border-none text-left
              ${
                activeNav === 'settings'
                  ? 'font-semibold text-[var(--blue-ink)] bg-[var(--blue-light)]'
                  : 'font-medium text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text)] bg-transparent'
              }`}
          >
            <NavIcon name="Settings" active={activeNav === 'settings'} size={19} />
            <span>Settings</span>
          </button>

          {/* Bottom Controls: Theme & Account */}
          <div className="mt-auto pt-4 border-t border-[var(--border)] flex flex-col gap-1.5">
            <div className="flex items-center justify-between px-3 py-1.5">
              <div className="flex items-center gap-2.5 text-[13px] text-[var(--text-muted)]">
                {dark ? <Sun size={16} /> : <Moon size={16} />}
                <span>Dark Mode</span>
              </div>
              <button
                type="button"
                onClick={onToggleDark}
                aria-label="Toggle dark mode"
                className="w-11 h-6 rounded-full relative cursor-pointer transition-colors duration-200 border-none"
                style={{
                  background: dark ? 'var(--blue)' : 'var(--border-strong)',
                }}
              >
                <div
                  className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform duration-200
                    shadow-[0_1px_3px_rgba(0,0,0,0.22)]"
                  style={{ left: 2, transform: dark ? 'translateX(20px)' : 'translateX(0)' }}
                />
              </button>
            </div>

            {hasClerkKey && user ? (
              <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-[var(--radius-sm)] hover:bg-[var(--bg-surface)] transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                  <UserButton appearance={getUserButtonAppearance(dark)} />
                  <button
                    type="button"
                    onClick={() => onNav('settings')}
                    className="min-w-0 text-left bg-transparent border-none p-0 cursor-pointer"
                  >
                    <div className="text-[13px] font-semibold text-[var(--text)] truncate">
                      {displayName}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] truncate">
                      {subline}
                    </div>
                  </button>
                </div>
                {onSignOut && (
                  <button
                    type="button"
                    onClick={onSignOut}
                    title="Sign out"
                    aria-label="Sign out"
                    className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-muted)] hover:text-[var(--red-ink)] hover:bg-[var(--red-light)] cursor-pointer bg-transparent border-none shrink-0 transition-colors"
                  >
                    <LogOut size={15} />
                  </button>
                )}
              </div>
            ) : user ? (
              <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-[var(--radius-sm)] hover:bg-[var(--bg-surface)] transition-colors">
                <button
                  type="button"
                  onClick={() => onNav('settings')}
                  className="flex items-center gap-2.5 min-w-0 text-left bg-transparent border-none p-0 cursor-pointer"
                >
                  {user.picture ? (
                    <img
                      src={user.picture}
                      alt={displayName}
                      className="w-8 h-8 rounded-full object-cover shrink-0 border border-[var(--border)]"
                    />
                  ) : (
                    <Avatar initials={initials} bg={avatarGradient} size={32} />
                  )}
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-[var(--text)] truncate">
                      {displayName}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] truncate">
                      {subline}
                    </div>
                  </div>
                </button>
                {onSignOut && (
                  <button
                    type="button"
                    onClick={onSignOut}
                    title="Sign out"
                    aria-label="Sign out"
                    className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-muted)] hover:text-[var(--red-ink)] hover:bg-[var(--red-light)] cursor-pointer bg-transparent border-none shrink-0 transition-colors"
                  >
                    <LogOut size={15} />
                  </button>
                )}
              </div>
            ) : isDemo ? (
              <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-[var(--radius-sm)] hover:bg-[var(--bg-surface)] transition-colors">
                <button
                  type="button"
                  onClick={() => onNav('settings')}
                  className="flex items-center gap-2.5 min-w-0 text-left bg-transparent border-none p-0 cursor-pointer"
                >
                  <Avatar initials={initials} bg={avatarGradient} size={32} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-[var(--text)] truncate">
                      {displayName}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] truncate">
                      {subline}
                    </div>
                  </div>
                </button>
                {onExitDemo && (
                  <button
                    type="button"
                    onClick={onExitDemo}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--blue-light)] text-[11px] font-semibold text-[var(--blue-ink)] cursor-pointer border-none shrink-0 hover:opacity-90"
                  >
                    <LogIn size={12} />
                    <span>Sign In</span>
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </nav>
      </aside>

      {/* ── Mobile Bottom Navigation Bar (< lg): 5 Core Destinations ── */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--bg-glass)] backdrop-blur-md
          border-t border-[var(--border)] px-1.5 pt-1.5 grid grid-cols-5 select-none"
        style={{
          paddingBottom: 'max(0.45rem, env(safe-area-inset-bottom))',
        }}
      >
        {navItems.map(item => {
          const isActive = activeNav === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNav(item.id)}
              className="flex flex-col items-center justify-center gap-0.5 py-1 px-1 rounded-xl
                border-none bg-transparent cursor-pointer min-w-0"
              style={{
                color: isActive ? 'var(--blue-ink)' : 'var(--text-muted)',
              }}
            >
              <NavIcon name={item.icon} active={isActive} size={18} />
              <span className={`text-[10.5px] truncate max-w-full ${isActive ? 'font-bold' : 'font-medium'}`}>
                {item.label}
              </span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
