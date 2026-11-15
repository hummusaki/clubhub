import { LogIn } from 'lucide-react'
import { navItems } from '../data/sampleData'
import { Button } from './ui'
import { NavIcon } from './icons'

const MOBILE_NAV_LABELS = {
  overview: 'Overview',
  tasks: 'Tasks',
  calendar: 'Calendar',
  availability: 'Polls',
  clubs: 'Clubs',
  links: 'Links',
}

export default function Sidebar({
  activeNav,
  onNav,
  isDemo = false,
  onExitDemo,
}) {
  return (
    <>
      {/* ── Desktop Google Workspace Navigation Drawer (lg+): Below 64px Top App Bar ── */}
      <aside
        aria-label="Primary navigation"
        className="hidden lg:flex fixed top-16 bottom-0 left-0 w-[256px] bg-[var(--bg-sidebar)]
          flex-col px-3 py-3 z-30 select-none overflow-y-auto"
      >
        <nav className="flex-1 flex flex-col gap-0.5">
          {navItems.map(item => {
            const isActive = activeNav === item.id
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onNav(item.id)}
                className={`md-state-layer flex items-center gap-3.5 px-4 h-11 min-h-[44px] rounded-full
                  text-sm cursor-pointer transition-colors duration-150 border-none text-left ${
                    isActive
                      ? 'font-medium text-[var(--on-secondary-container)] bg-[var(--secondary-container)]'
                      : 'font-medium text-[var(--text-muted)] hover:text-[var(--text)] bg-transparent'
                  }`}
              >
                <NavIcon name={item.icon} active={isActive} size={20} />
                <span className="truncate">{item.label}</span>
              </button>
            )
          })}

          <div className="my-2 mx-4 border-t border-[var(--border)]" />

          <button
            type="button"
            aria-current={activeNav === 'settings' ? 'page' : undefined}
            onClick={() => onNav('settings')}
            className={`md-state-layer flex items-center gap-3.5 px-4 h-11 min-h-[44px] rounded-full
              text-sm cursor-pointer transition-colors duration-150 border-none text-left ${
                activeNav === 'settings'
                  ? 'font-medium text-[var(--on-secondary-container)] bg-[var(--secondary-container)]'
                  : 'font-medium text-[var(--text-muted)] hover:text-[var(--text)] bg-transparent'
              }`}
          >
            <NavIcon name="Settings" active={activeNav === 'settings'} size={20} />
            <span className="truncate">Settings</span>
          </button>

          {isDemo && onExitDemo && (
            <div className="mt-auto pt-3 px-1">
              <div className="p-3.5 rounded-2xl bg-[var(--md-surface-container)] border border-[var(--border)] space-y-2.5">
                <div className="text-xs font-medium text-[var(--text)]">
                  Previewing as guest
                </div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Sign in with your UCSC account to sync clubs, tasks, and calendars.
                </p>
                <Button
                  variant="tonal"
                  size="sm"
                  icon={<LogIn size={14} />}
                  onClick={onExitDemo}
                  className="w-full"
                >
                  Sign in
                </Button>
              </div>
            </div>
          )}
        </nav>
      </aside>

      {/* ── Mobile Material 3 Navigation Bar (< lg): 64x32px Active Icon Pill ── */}
      <nav
        aria-label="Mobile navigation"
        className="mobile-nav lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--md-surface-container)] border-t border-[var(--border)] select-none"
      >
        <div className="grid grid-cols-6 items-center gap-0.5">
          {navItems.map(item => {
            const isActive = activeNav === item.id
            const mobileLabel = MOBILE_NAV_LABELS[item.id] || item.label
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onNav(item.id)}
                className="flex flex-col items-center justify-center gap-0.5 min-h-[52px] py-0.5 rounded-xl bg-transparent border-none cursor-pointer min-w-0 group"
              >
                <span
                  className={`md-state-layer w-[min(100%,48px)] sm:w-16 h-7 rounded-full flex items-center justify-center transition-colors duration-150 ${
                    isActive
                      ? 'bg-[var(--secondary-container)] text-[var(--on-secondary-container)]'
                      : 'bg-transparent text-[var(--text-muted)] group-hover:text-[var(--text)]'
                  }`}
                >
                  <NavIcon name={item.icon} active={isActive} size={19} />
                </span>
                <span
                  className={`text-[11px] leading-tight max-w-full ${
                    isActive
                      ? 'font-medium text-[var(--text)]'
                      : 'font-normal text-[var(--text-muted)]'
                  }`}
                >
                  <span className="sm:hidden">{mobileLabel}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
