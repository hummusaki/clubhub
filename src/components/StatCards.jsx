import { stats as defaultStats } from '../data/sampleData'
import { Card, IconBadge } from './ui'
import { StatIcon } from './icons'

export default function StatCards({ items, joinedCount = 5, linksCount = 24, onNav }) {
  const stats = items && items.length > 0 ? items : defaultStats

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-7">
      {stats.map((stat, i) => {
        const displayValue =
          !items && stat.label === 'Your Clubs'
            ? joinedCount
            : !items && stat.label === 'Shared Links'
              ? linksCount
              : stat.value

        return (
          <Card
            key={stat.label}
            delay={i + 1}
            onClick={() => onNav && stat.navTarget && onNav(stat.navTarget)}
            className="p-4 sm:p-5 flex items-center gap-3.5"
          >
            <IconBadge color={stat.color} size={42} radius={13}>
              <StatIcon name={stat.icon} size={22} />
            </IconBadge>

            <div className="min-w-0">
              <div
                className="text-2xl sm:text-[26px] font-bold font-mono-num leading-none"
                style={{ color: 'var(--text)' }}
              >
                {displayValue}
              </div>
              <div className="text-xs font-medium text-[var(--text-muted)] mt-1 truncate">
                {stat.label}
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
