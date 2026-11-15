import { Shield, Users, Layers, Check } from 'lucide-react'
import { resolveDeduplicatedTargets } from '../utils/leadershipShortcuts'

export { resolveDeduplicatedTargets }

/**
 * Reusable one-click shortcut bar strictly rendered for Board / Leadership users.
 * Provides "Add All Board Members", "Add All Club Members", and "Add Group" pills.
 */
export default function LeadershipShortcutBar({
  clubPeople,
  selectedShortcuts = [],
  onToggleShortcut,
  label = 'Leadership Targeting Shortcuts',
  compact = false,
}) {
  if (!clubPeople?.permission?.isBoard) return null

  const activeSet = new Set(selectedShortcuts)
  const boardCount = clubPeople?.board?.length || 0
  const everyoneCount = clubPeople?.everyone?.length || 0
  const groups = clubPeople?.groups || []

  const coreButtons = [
    {
      token: 'all_board',
      title: 'Add All Board Members',
      count: boardCount,
      icon: Shield,
      accent: 'purple',
    },
    {
      token: 'everyone',
      title: 'Add All Club Members',
      count: everyoneCount,
      icon: Users,
      accent: 'blue',
    },
  ]

  return (
    <div
      className={`content-tile rounded-xl ${
        compact ? 'p-3 space-y-2' : 'p-3.5 space-y-2.5'
      }`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {label}
        </span>
        <span className="text-[11px] text-[var(--text-light)]">
          Auto-deduplicates overlapping members
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {coreButtons.map(btn => {
          const active = activeSet.has(btn.token)
          const IconComp = btn.icon
          const isPurple = btn.accent === 'purple'
          return (
            <button
              key={btn.token}
              type="button"
              onClick={() => onToggleShortcut(btn.token)}
              className={`inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                active
                  ? isPurple
                    ? 'bg-[var(--purple)] text-white border-[var(--purple)]'
                    : 'bg-[var(--blue)] text-white border-[var(--blue)]'
                  : isPurple
                    ? 'bg-[var(--bg-surface)] text-[var(--text)] border-[var(--border)] hover:border-[var(--purple)]'
                    : 'bg-[var(--bg-surface)] text-[var(--text)] border-[var(--border)] hover:border-[var(--blue)]'
              }`}
            >
              {active ? <Check size={12} /> : <IconComp size={12} />}
              <span>{btn.title}</span>
              <span className="opacity-75 font-mono-num">({btn.count})</span>
            </button>
          )
        })}

        {groups.map(grp => {
          const token = `group:${grp.id}`
          const active = activeSet.has(token)
          return (
            <button
              key={token}
              type="button"
              onClick={() => onToggleShortcut(token)}
              className={`inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                active
                  ? 'bg-[var(--teal)] text-white border-[var(--teal)]'
                  : 'bg-[var(--bg-surface)] text-[var(--text)] border-[var(--border)] hover:border-[var(--teal)]'
              }`}
            >
              {active ? <Check size={12} /> : <Layers size={12} />}
              <span>Add Group: {grp.name}</span>
              <span className="opacity-75 font-mono-num">({grp.memberCount ?? grp.members?.length ?? 0})</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
