import { stats as defaultStats } from '../data/sampleData'
import { IconBadge } from './ui'
import { StatIcon } from './icons'

export default function StatCards({
  items,
  joinedCount = 0,
  eventsCount = 6,
  linksCount = 5,
  onNav,
}) {
  const stats =
    items && items.length > 0
      ? items
      : defaultStats.map(s => {
          if (s.label === 'My Clubs') return { ...s, value: joinedCount }
          if (s.label === 'Upcoming Events') return { ...s, value: eventsCount }
          if (s.label === 'Shared Links') return { ...s, value: linksCount }
          return s
        })

  return (
    <ul className="stat-strip grid list-none rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      {stats.map(stat => {
        const interactive = stat.navTarget && onNav
        const Element = interactive ? 'button' : 'div'
        return (
          <li key={stat.label} className="min-w-0">
            <Element
              {...(interactive ? { type: 'button', onClick: () => onNav(stat.navTarget) } : {})}
              className={`flex h-full w-full items-center gap-2 px-2 py-2 sm:px-3 text-left ${interactive ? 'ui-touch md-state-layer hover:bg-[var(--bg-subtle)] focus-visible:outline-offset-[-3px]' : ''}`}
            >
              <IconBadge color={stat.color} size={26} radius={9999}>
                <StatIcon name={stat.icon} size={14} />
              </IconBadge>
              <div className="min-w-0">
                <div className="text-base font-medium font-mono-num leading-tight break-words">{stat.value}</div>
                <div className="text-xs leading-tight text-[var(--text-muted)]">{stat.label}</div>
              </div>
            </Element>
          </li>
        )
      })}
    </ul>
  )
}
