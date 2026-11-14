import {
  LayoutGrid, Heart, Search, Calendar, Users, Link, Moon,
} from 'lucide-react'
import { navItems } from '../data/sampleData'
import { Avatar } from './ui'

const iconMap = { LayoutGrid, Heart, Search, Calendar, Users, Link }

export default function Sidebar({ activeNav, onNav, dark, onToggleDark }) {
  return (
    <aside
      className="w-[260px] bg-[var(--bg-card)] border-r border-[var(--border)] flex flex-col
        p-5 pl-3.5 pr-3.5 shrink-0 transition-all duration-300"
    >
      {/* ── Logo ── */}
      <div className="flex items-center gap-2.5 px-2.5 mb-6">
        <div
          className="w-9 h-9 rounded-[10px] flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, var(--blue), var(--purple))' }}
        >
          <Users size={20} color="#fff" strokeWidth={2.2} />
        </div>
        <div>
          <div className="font-bold text-base text-[var(--text)]">ClubHub</div>
          <div className="text-[11px] text-[var(--text-muted)]">Campus Dashboard</div>
        </div>
      </div>

      {/* ── Nav links ── */}
      <nav className="flex-1 flex flex-col gap-0.5">
        {navItems.map(item => {
          const Icon = iconMap[item.icon]
          const isActive = activeNav === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-[var(--radius-sm)] text-sm font-medium
                cursor-pointer transition-all duration-200 border-none text-left
                ${isActive
                  ? 'bg-[var(--bg-surface)] text-[var(--blue)] font-semibold'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text)]'
                }`}
              style={{ background: isActive ? 'var(--bg-surface)' : undefined }}
            >
              {Icon && <Icon size={18} />}
              {item.label}
            </button>
          )
        })}

        {/* ── Bottom section ── */}
        <div className="mt-auto pt-4 border-t border-[var(--border)]">
          {/* Dark mode toggle */}
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <div className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
              <Moon size={16} />
              Dark Mode
            </div>
            <button
              onClick={onToggleDark}
              className={`w-11 h-6 rounded-full relative cursor-pointer transition-colors duration-300 border-none
                ${dark ? 'bg-[var(--blue)]' : 'bg-[var(--border)]'}`}
            >
              <div
                className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform duration-300
                  shadow-[0_1px_3px_rgba(0,0,0,0.15)]"
                style={{ left: 2, transform: dark ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </button>
          </div>

          {/* User profile */}
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 mt-1">
            <Avatar
              initials="JD"
              bg="linear-gradient(135deg, var(--teal), var(--green))"
              size={32}
            />
            <div>
              <div className="text-[13px] font-semibold text-[var(--text)]">Jane Doe</div>
              <div className="text-[11px] text-[var(--text-muted)]">jdoe@university.edu</div>
            </div>
          </div>
        </div>
      </nav>
    </aside>
  )
}
