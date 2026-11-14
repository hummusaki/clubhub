import { MapPin, Clock } from 'lucide-react'
import { todaySchedule as defaultSchedule } from '../data/sampleData'
import { Card, BubbleTag, IconBadge, cleanText } from './ui'
import { ScheduleEventIcon } from './icons'

export default function TodaySchedule({ items, searchQuery = '' }) {
  const todaySchedule = items && items.length > 0 ? items : defaultSchedule

  const filtered = todaySchedule.filter(ev => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      (ev.club || '').toLowerCase().includes(q) ||
      (ev.event || '').toLowerCase().includes(q) ||
      (ev.location || '').toLowerCase().includes(q)
    )
  })

  return (
    <Card className="p-4 sm:p-[22px]" delay={3}>
      <div className="flex items-center justify-between mb-4 sm:mb-[18px]">
        <h2 className="text-base font-bold text-[var(--text)]">Today&apos;s Schedule</h2>
        <span className="text-xs text-[var(--text-muted)]">Nov 14, 2026</span>
      </div>

      <div className="flex flex-col gap-3">
        {filtered.map((item, i) => {
          const isLast = i === filtered.length - 1
          const c = item.color === 'muted' || !item.color ? 'teal' : item.color
          const clubName = cleanText(item.club)
          const eventTitle = cleanText(item.event)

          return (
            <div key={item.id} className="flex items-stretch gap-3">
              {/* Timeline icon badge + continuous line */}
              <div className="flex flex-col items-center pt-1">
                <IconBadge color={c} size={32} radius={10}>
                  <ScheduleEventIcon club={clubName} event={eventTitle} size={16} />
                </IconBadge>
                {!isLast && (
                  <div className="w-[1.5px] flex-1 my-1.5 rounded-full bg-[var(--border)]" />
                )}
              </div>

              {/* Event card */}
              <div
                className="flex-1 rounded-[var(--radius-sm)] p-3.5 border border-[var(--border-subtle)]"
                style={{
                  background: item.upcoming ? 'var(--bg-surface)' : `var(--${c}-light)`,
                }}
              >
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <span className="font-semibold text-[13.5px] sm:text-sm text-[var(--text)]">
                    {clubName ? `${clubName} — ${eventTitle}` : eventTitle}
                  </span>
                  <BubbleTag label={item.time} color={c} size="sm" />
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)] mt-1.5">
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={12.5} className="text-[var(--text-light)] shrink-0" />
                    {cleanText(item.location)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock size={12.5} className="text-[var(--text-light)] shrink-0" />
                    {cleanText(item.duration)}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
