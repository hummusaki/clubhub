import { Users, Heart, Calendar, Link } from 'lucide-react'
import { stats } from '../data/sampleData'
import { Card } from './ui'

const iconMap = { Users, Heart, Calendar, Link }

export default function StatCards() {
  return (
    <div className="grid grid-cols-4 gap-4 mb-7">
      {stats.map((stat, i) => {
        const Icon = iconMap[stat.icon]
        return (
          <Card key={stat.label} className="text-center p-5" delay={i + 1}>
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2.5"
              style={{ background: `var(--${stat.color}-light)` }}
            >
              {Icon && <Icon size={20} style={{ color: `var(--${stat.color})` }} />}
            </div>
            <div className="text-[28px] font-bold" style={{ color: `var(--${stat.color})` }}>
              {stat.value}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-1">{stat.label}</div>
          </Card>
        )
      })}
    </div>
  )
}
