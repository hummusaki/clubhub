import { useState } from 'react'
import { MapPin, Clock, Trash2 } from 'lucide-react'
import { todaySchedule as defaultSchedule } from '../data/sampleData'
import { Card, BubbleTag, IconBadge, cleanText } from './ui'
import { ScheduleEventIcon } from './icons'

export default function TodaySchedule({ items, searchQuery = '', onDeleteEvent }) {
  const [showAllEvents, setShowAllEvents] = useState(false)
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

  const visibleItems = showAllEvents ? filtered : filtered.slice(0, 6)

  return (
    <Card className="p-4 sm:p-[22px]" delay={3}>
      <div className="flex items-center justify-between mb-4 sm:mb-[18px]">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-[var(--text)]">ClubHub Schedule &amp; Booked Meetings</h2>
          <BubbleTag label={`${filtered.length} Events`} color="blue" size="sm" />
        </div>
        {filtered.length > 6 && (
          <button
            type="button"
            onClick={() => setShowAllEvents(prev => !prev)}
            className="text-xs font-semibold text-[var(--blue-ink)] bg-transparent border-none cursor-pointer hover:underline"
          >
            {showAllEvents ? 'Show Less' : `View All (${filtered.length})`}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {visibleItems.map((item, i) => {
          const isLast = i === visibleItems.length - 1
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
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-[13.5px] sm:text-sm text-[var(--text)]">
                      {clubName ? `${clubName} — ${eventTitle}` : eventTitle}
                    </span>
                    {item.isBookedCollab && (
                      <BubbleTag label="Booked Collab ✓" color="green" size="sm" />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <BubbleTag label={item.time} color={c} size="sm" />
                    {item.isBookedCollab && onDeleteEvent && (
                      <button
                        type="button"
                        onClick={() => onDeleteEvent(item.id)}
                        title="Remove booked meeting"
                        className="p-1 rounded-full bg-transparent border-none cursor-pointer text-[var(--text-muted)] hover:text-[var(--red)]"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
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
