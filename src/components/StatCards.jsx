import { stats as defaultStats } from '../data/sampleData'
import { Card, IconBadge } from './ui'
import { StatIcon } from './icons'

export default function StatCards({
  items,
  joinedCount = 0,
  eventsCount = 6,
  linksCount = 5,
  userSettings = {},
  onNav,
}) {
  const isCompact = Boolean(userSettings?.compactCards)
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
    <div
      className={`grid grid-cols-2 lg:grid-cols-4 ${
        isCompact ? 'gap-2.5 sm:gap-3 mb-3.5 sm:mb-4' : 'gap-3 sm:gap-4 mb-5 sm:mb-6'
      }`}
    >
      {stats.map((stat, i) => (
        <Card
          key={stat.label}
          delay={i + 1}
          onClick={stat.navTarget && onNav ? () => onNav(stat.navTarget) : undefined}
          className={`${
            isCompact ? 'p-3 sm:p-3.5 gap-2.5' : 'p-4 sm:p-5 gap-3.5'
          } flex items-center hover:border-[var(--blue)]/40`}
        >
          <IconBadge color={stat.color} size={isCompact ? 34 : 42} radius={isCompact ? 10 : 13}>
            <StatIcon name={stat.icon} size={isCompact ? 18 : 22} />
          </IconBadge>

          <div className="min-w-0">
            <div
              className={`${
                isCompact ? 'text-xl sm:text-[22px]' : 'text-2xl sm:text-[26px]'
              } font-bold font-mono-num leading-none text-[var(--text)]`}
            >
              {stat.value}
            </div>
            <div
              className={`${
                isCompact ? 'text-[11px] mt-0.5' : 'text-xs mt-1'
              } font-medium text-[var(--text-muted)] truncate`}
            >
              {stat.label}
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
