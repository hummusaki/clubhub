import {
  LayoutGrid, Heart, Search, Calendar, Users, Link, Moon, Sun, Sparkles, Clock,
} from 'lucide-react'
import { navItems } from '../data/sampleData'
import { Avatar, ClubHubLogo } from './ui'

const iconMap = { LayoutGrid, Heart, Search, Calendar, Users, Link }

export default function Sidebar({ activeNav, onNav, dark, onToggleDark, joinedCount = 5 }) {
  return (
    <aside
      className="w-[264px] sticky top-0 h-screen bg-[var(--bg-card)] border-r border-[var(--border)]
        flex flex-col px-4 py-5 shrink-0 transition-colors duration-300 select-none overflow-y-auto"
    >
      {/* ── Brand Logo ── */}
      <div
        onClick={() => onNav('overview')}
        className="flex items-center justify-between px-2 mb-6 cursor-pointer group"
      >
        <div className="flex items-center gap-3">
          <ClubHubLogo
            size={42}
            className="transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-2"
          />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-[17px] tracking-tight text-[var(--text)] leading-none">
                Club
                <span style={{ color: 'var(--blue-ink)' }}>Hub</span>
              </span>
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-md leading-none"
                style={{
                  background: 'var(--blue-light)',
                  color: 'var(--blue-ink)',
                }}
              >
                2.0
              </span>
            </div>
            <div className="text-[11px] font-medium text-[var(--text-muted)] mt-1">
              Campus Community OS
            </div>
          </div>
        </div>
      </div>

      {/* ── Navigation Section ── */}
      <div className="px-2.5 mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-light)]">
        Navigation
      </div>

      <nav className="flex-1 flex flex-col gap-1">
        {navItems.map(item => {
          const Icon = iconMap[item.icon]
          const isActive = activeNav === item.id
          const badgeVal = item.id === 'myclubs' ? String(joinedCount) : item.badge

          return (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              className={`group relative flex items-center justify-between px-3 py-2.5 rounded-[var(--radius-sm)]
                text-[13.5px] cursor-pointer transition-all duration-200 border-none text-left
                ${isActive
                  ? 'font-semibold text-[var(--blue-ink)]'
                  : 'font-medium text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text)]'
                }`}
              style={{
                background: isActive ? 'var(--blue-light)' : undefined,
              }}
            >
              <div className="flex items-center gap-3">
                {Icon && (
                  <Icon
                    size={18}
                    strokeWidth={isActive ? 2.3 : 1.9}
                    className="transition-transform duration-200 group-hover:scale-105"
                  />
                )}
                <span>{item.label}</span>
              </div>

              {badgeVal && (
                <span
                  className="text-[10.5px] font-bold font-mono-num px-2 py-0.5 rounded-full"
                  style={{
                    background: isActive ? 'var(--bg-card)' : 'var(--bg-subtle)',
                    color: isActive ? 'var(--blue-ink)' : 'var(--text-muted)',
                  }}
                >
                  {badgeVal}
                </span>
              )}
            </button>
          )
        })}

        {/* ── Up Next Compact Callout ── */}
        <div
          onClick={() => onNav('calendar')}
          className="mt-auto mb-3 p-3.5 rounded-[var(--radius-sm)] border border-[var(--border)]
            bg-[var(--bg-surface)] hover:border-[var(--blue)] transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--blue-ink)]">
              <span className="w-2 h-2 rounded-full bg-[var(--blue)] pulse-dot" />
              Up Next · 2:00 PM
            </span>
            <Clock size={13} className="text-[var(--text-light)] group-hover:text-[var(--blue)] transition-colors" />
          </div>
          <div className="text-[12.5px] font-bold text-[var(--text)] leading-snug">
            CS Club — Weekly Standup
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Engineering Hall 204 · 45m
          </div>
        </div>

        {/* ── Bottom Controls ── */}
        <div className="pt-3 border-t border-[var(--border)] flex flex-col gap-1">
          {/* Dark mode toggle */}
          <div className="flex items-center justify-between px-2.5 py-2 rounded-[var(--radius-sm)] hover:bg-[var(--bg-surface)] transition-colors">
            <div className="flex items-center gap-2.5 text-[13px] font-medium text-[var(--text-muted)]">
              {dark ? <Sun size={16} className="text-[var(--yellow)]" /> : <Moon size={16} />}
              <span>{dark ? 'Warm Dark' : 'Dark Mode'}</span>
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
                  shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
                style={{ left: 2, transform: dark ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </button>
          </div>

          {/* User profile */}
          <div
            className="flex items-center justify-between px-2.5 py-2 rounded-[var(--radius-sm)]
              hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative">
                <Avatar
                  initials="JD"
                  bg="linear-gradient(135deg, var(--teal), var(--green))"
                  size={34}
                />
                <span
                  className="w-2.5 h-2.5 rounded-full bg-[var(--green)] border-2 border-[var(--bg-card)]
                    absolute -bottom-0.5 -right-0.5"
                />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-[var(--text)] truncate">Jane Doe</div>
                <div className="text-[11px] text-[var(--text-muted)] truncate">CS &apos;27 · President</div>
              </div>
            </div>
            <Sparkles size={14} className="text-[var(--text-light)] shrink-0" />
          </div>
        </div>
      </nav>
    </aside>
  )
}
