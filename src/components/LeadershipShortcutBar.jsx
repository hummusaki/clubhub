import { Shield, Users, Layers } from 'lucide-react'
import { FilterChip } from './ui'
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
      title: 'All Board Members',
      count: boardCount,
      icon: Shield,
    },
    {
      token: 'everyone',
      title: 'All Club Members',
      count: everyoneCount,
      icon: Users,
    },
  ]

  return (
    <div
      className={`content-tile rounded-2xl ${
        compact ? 'p-3 space-y-2' : 'p-3.5 space-y-2.5'
      }`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-medium text-[var(--text-muted)]">
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
          return (
            <FilterChip
              key={btn.token}
              selected={active}
              onClick={() => onToggleShortcut(btn.token)}
              leadingIcon={<IconComp size={14} />}
              label={`${btn.title} (${btn.count})`}
            />
          )
        })}

        {groups.map(grp => {
          const token = `group:${grp.id}`
          const active = activeSet.has(token)
          const count = grp.memberCount ?? grp.members?.length ?? 0
          return (
            <FilterChip
              key={token}
              selected={active}
              onClick={() => onToggleShortcut(token)}
              leadingIcon={<Layers size={14} />}
              label={`Group: ${grp.name} (${count})`}
            />
          )
        })}
      </div>
    </div>
  )
}
