import { Users, Heart, Calendar, Link, ArrowUpRight } from 'lucide-react'
import { stats } from '../data/sampleData'
import { Card, BubbleTag } from './ui'

const iconMap = { Users, Heart, Calendar, Link }

export default function StatCards({ joinedCount = 5, linksCount = 24, onNav }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
      {stats.map((stat, i) => {
        const Icon = iconMap[stat.icon]
        const displayValue =
          stat.label === 'Your Clubs'
            ? joinedCount
            : stat.label === 'Shared Links'
              ? linksCount
              : stat.value

        return (
          <Card
            key={stat.label}
            delay={i + 1}
            onClick={() => onNav && stat.navTarget && onNav(stat.navTarget)}
            className="group relative overflow-hidden p-5 hover:-translate-y-0.5"
          >
            {/* Top row: Icon + Delta badge */}
            <div className="flex items-center justify-between mb-3.5">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-105"
                style={{
                  background: `var(--${stat.color}-light)`,
                  border: `1px solid color-mix(in srgb, var(--${stat.color}) 22%, transparent)`,
                }}
              >
                {Icon && (
                  <Icon
                    size={19}
                    strokeWidth={2.2}
                    style={{ color: `var(--${stat.color}-ink, var(--${stat.color}))` }}
                  />
                )}
              </div>

              {stat.delta && (
                <BubbleTag label={stat.delta} color={stat.color} size="sm" />
              )}
            </div>

            {/* Metric value + label */}
            <div className="flex items-baseline justify-between">
              <div>
                <div
                  className="text-[28px] font-extrabold font-mono-num leading-none tracking-tight"
                  style={{ color: 'var(--text)' }}
                >
                  {displayValue}
                </div>
                <div className="text-[13px] font-bold text-[var(--text)] mt-1.5">
                  {stat.label}
                </div>
                {stat.subtitle && (
                  <div className="text-[11.5px] text-[var(--text-muted)] mt-0.5">
                    {stat.subtitle}
                  </div>
                )}
              </div>

              <div
                className="w-7 h-7 rounded-full flex items-center justify-center opacity-0
                  group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0"
                style={{
                  background: 'var(--bg-surface)',
                  color: 'var(--text-muted)',
                }}
              >
                <ArrowUpRight size={14} />
              </div>
            </div>

            {/* Bottom accent bar */}
            <div
              className="absolute bottom-0 left-0 right-0 h-[3px] opacity-65 group-hover:opacity-100 transition-opacity"
              style={{ background: `var(--${stat.color})` }}
            />
          </Card>
        )
      })}
    </div>
  )
}
