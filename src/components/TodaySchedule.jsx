import { todaySchedule as defaultSchedule } from '../data/sampleData'
import { Card, BubbleTag } from './ui'

export default function TodaySchedule({ items }) {
  const todaySchedule = items && items.length > 0 ? items : defaultSchedule
  return (
    <Card className="p-[22px]" delay={3}>
      <div className="flex items-center justify-between mb-[18px]">
        <h2 className="text-base font-bold text-[var(--text)]">Today's Schedule</h2>
        <span className="text-xs text-[var(--text-muted)]">Nov 14, 2026</span>
      </div>

      <div className="flex flex-col gap-3.5">
        {todaySchedule.map((item, i) => {
          const isLast = i === todaySchedule.length - 1
          const colorVar = item.color === 'muted' ? 'var(--text-light)' : `var(--${item.color})`
          const bgVar    = item.color === 'muted' ? 'var(--bg-surface)' : `var(--${item.color}-light)`

          return (
            <div key={item.id} className="flex items-start gap-3.5">
              {/* Timeline dot + line */}
              <div className="flex flex-col items-center gap-1 pt-0.5">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: colorVar }}
                />
                {!isLast && (
                  <div className="w-0.5 h-10 rounded-full bg-[var(--border)]" />
                )}
              </div>

              {/* Event card */}
              <div
                className="flex-1 rounded-[var(--radius-sm)] p-3.5"
                style={{
                  background: bgVar,
                  opacity: item.upcoming ? 0.7 : 1,
                }}
              >
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-sm text-[var(--text)]">
                    {item.club} — {item.event}
                  </span>
                  <BubbleTag
                    label={item.time}
                    color={item.color === 'muted' ? 'teal' : item.color}
                    size="sm"
                  />
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  📍 {item.location} · {item.duration}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
