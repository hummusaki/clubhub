import { stats as defaultStats } from '../data/sampleData'
import { Card, IconBadge } from './ui'
import { StatIcon } from './icons'

export default function StatCards({
  items,
  joinedCount = 5,
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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-6">
      {stats.map((stat, i) => (
        <Card
          key={stat.label}
          delay={i + 1}
          onClick={stat.navTarget && onNav ? () => onNav(stat.navTarget) : undefined}
          className="p-4 sm:p-5 flex items-center gap-3.5 hover:border-[var(--blue)]/40"
        >
          <IconBadge color={stat.color} size={42} radius={13}>
            <StatIcon name={stat.icon} size={22} />
          </IconBadge>

          <div className="min-w-0">
            <div className="text-2xl sm:text-[26px] font-bold font-mono-num leading-none text-[var(--text)]">
              {stat.value}
            </div>
            <div className="text-xs font-medium text-[var(--text-muted)] mt-1 truncate">
              {stat.label}
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
