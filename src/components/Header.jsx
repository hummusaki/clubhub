import { Bell } from 'lucide-react'
import { SearchBox } from './ui'

export default function Header() {
  return (
    <div className="flex items-center justify-between mb-7 fade-in">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">
          Good afternoon, Jane 👋
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Saturday, November 14 — You have{' '}
          <strong className="text-[var(--blue)]">2 meetings</strong> today
        </p>
      </div>

      <div className="flex items-center gap-3">
        <SearchBox placeholder="Search clubs, events…" width="240px" />

        {/* Notification bell */}
        <div className="relative cursor-pointer">
          <Bell size={22} className="text-[var(--text-muted)]" />
          <div
            className="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full bg-[var(--red)]
              text-white text-[10px] font-bold flex items-center justify-center"
          >
            3
          </div>
        </div>
      </div>
    </div>
  )
}
