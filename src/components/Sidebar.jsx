import { navItems } from '../data/sampleData'
import { NavIcon } from './icons'

const MOBILE_NAV_LABELS = {
  overview: 'Overview',
  tasks: 'Tasks',
  calendar: 'Calendar',
  clubs: 'Clubs',
  links: 'Links',
}

export default function Sidebar({
  activeNav,
  onNav,
}) {
  return (
    <>
      {/* ── Desktop Google Workspace Navigation Drawer (lg+): Below 64px Top App Bar ── */}
      <aside
        aria-label="Primary navigation"
        className="hidden lg:flex fixed top-16 bottom-0 left-0 w-[var(--sidebar-width)] bg-[var(--bg-sidebar)]
          flex-col px-3 py-3 z-30 select-none overflow-y-auto"
      >
        <nav className="flex-1 flex flex-col gap-0.5">
          {navItems.map(item => {
            const isActive = activeNav === item.id
            return (
              <button
                key={item.id}
                data-accent={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onNav(item.id)}
                className={`md-state-layer flex items-center gap-3.5 px-4 h-11 min-h-[44px] rounded-full
                  text-sm cursor-pointer transition-colors duration-150 border-none text-left ${
                    isActive
                      ? 'font-medium text-[var(--accent-ink)] bg-[var(--accent-surface)] nav-selected'
                      : 'font-medium text-[var(--text-muted)] hover:text-[var(--text)] bg-transparent'
                  }`}
              >
                <NavIcon name={item.icon} active={isActive} size={20} />
                <span className="truncate">{item.label}</span>
              </button>
            )
          })}

        </nav>
      </aside>

      {/* ── Mobile Material 3 Navigation Bar (< lg): 64x32px Active Icon Pill ── */}
      <nav
        aria-label="Mobile navigation"
        className="mobile-nav lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--md-surface-container)] border-t border-[var(--border)] select-none"
      >
        <div className="grid grid-cols-5 items-center gap-0.5">
          {navItems.map(item => {
            const isActive = activeNav === item.id
            const mobileLabel = MOBILE_NAV_LABELS[item.id] || item.label
            return (
              <button
                key={item.id}
                data-accent={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onNav(item.id)}
                className="flex flex-col items-center justify-center gap-0.5 min-h-[52px] py-0.5 rounded-xl bg-transparent border-none cursor-pointer min-w-0 group"
              >
                <span
                  className={`md-state-layer w-[min(100%,48px)] sm:w-16 h-7 rounded-full flex items-center justify-center transition-colors duration-150 ${
                    isActive
                      ? 'bg-[var(--accent-surface)] text-[var(--accent-ink)]'
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
