import { useState } from 'react'
import { MapPin, Clock, Users, Check, Plus } from 'lucide-react'
import { todaySchedule as defaultSchedule } from '../data/sampleData'
import { Card, BubbleTag } from './ui'

export default function TodaySchedule({ items, searchQuery = '' }) {
  const [localEvents, setLocalEvents] = useState(defaultSchedule)
  const [rsvpMap, setRsvpMap] = useState({})
  const [tab, setTab] = useState('all')

  const baseEvents = items && items.length > 0 ? items : localEvents

  function toggleRsvp(ev) {
    if (items && items.length > 0) {
      setRsvpMap(prev => ({ ...prev, [ev.id]: !(prev[ev.id] ?? ev.rsvp) }))
    } else {
      setLocalEvents(prev =>
        prev.map(item =>
          item.id === ev.id
            ? {
                ...item,
                rsvp: !item.rsvp,
                attendees: item.rsvp ? (item.attendees || 1) - 1 : (item.attendees || 0) + 1,
              }
            : item
        )
      )
    }
  }

  const filtered = baseEvents.filter(ev => {
    const dayVal = ev.day || (ev.upcoming ? 'tomorrow' : 'today')
    if (tab === 'today' && dayVal !== 'today') return false
    if (tab === 'upcoming' && dayVal === 'today') return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return (
        (ev.club || '').toLowerCase().includes(q) ||
        (ev.event || '').toLowerCase().includes(q) ||
        (ev.location || '').toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <Card className="p-4 sm:p-[22px] flex flex-col" delay={3}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 sm:mb-[18px]">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[15.5px] sm:text-[16px] font-extrabold tracking-tight text-[var(--text)]">
            Today&apos;s Schedule
          </h2>
          <span className="text-[11.5px] font-semibold font-mono-num px-2 py-0.5 rounded-md bg-[var(--bg-subtle)] text-[var(--text-muted)]">
            Nov 14
          </span>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-full bg-[var(--bg-surface)] border border-[var(--border)]">
          {[
            { id: 'all', label: 'All' },
            { id: 'today', label: 'Today' },
            { id: 'upcoming', label: 'Upcoming' },
          ].map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="px-2.5 py-1 rounded-full text-[11.5px] font-semibold cursor-pointer border-none transition-all"
              style={{
                background: tab === t.id ? 'var(--bg-card)' : 'transparent',
                color: tab === t.id ? 'var(--text)' : 'var(--text-muted)',
                boxShadow: tab === t.id ? 'var(--shadow-xs)' : 'none',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline list */}
      <div className="flex flex-col gap-3 flex-1">
        {filtered.map((item, i) => {
          const isLast = i === filtered.length - 1
          const c = item.color === 'muted' || !item.color ? 'teal' : item.color
          const isNextUp = item.status === 'Next Up' || i === 0
          const isGoing = rsvpMap[item.id] ?? item.rsvp

          return (
            <div key={item.id} className="flex items-stretch gap-3 sm:gap-3.5 group">
              {/* Timeline dot + continuous line */}
              <div className="flex flex-col items-center pt-3.5">
                <div
                  className={`w-3 h-3 rounded-full shrink-0 border-2 border-[var(--bg-card)] shadow-xs ${
                    isNextUp ? 'pulse-dot' : ''
                  }`}
                  style={{
                    background: `var(--${c})`,
                    boxShadow: `0 0 0 3px var(--${c}-light)`,
                  }}
                />
                {!isLast && (
                  <div className="w-[2px] flex-1 my-1.5 rounded-full bg-[var(--border)]" />
                )}
              </div>

              {/* Event card */}
              <div
                className="flex-1 rounded-[var(--radius-sm)] p-3 sm:p-3.5 border transition-all duration-200
                  hover:shadow-[var(--shadow-xs)]"
                style={{
                  background: item.upcoming ? 'var(--bg-card)' : `var(--${c}-light)`,
                  borderColor: item.upcoming
                    ? 'var(--border)'
                    : `color-mix(in srgb, var(--${c}) 26%, transparent)`,
                  borderLeftWidth: '3.5px',
                  borderLeftColor: `var(--${c})`,
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-[11px] font-extrabold uppercase tracking-wider"
                        style={{ color: `var(--${c}-ink, var(--${c}))` }}
                      >
                        {item.club}
                      </span>
                      {isNextUp && (
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.2 rounded-full"
                          style={{
                            background: 'var(--bg-card)',
                            color: `var(--${c}-ink)`,
                          }}
                        >
                          ● Starts soon
                        </span>
                      )}
                    </div>
                    <div className="font-bold text-[13.5px] sm:text-[14px] text-[var(--text)] mt-0.5">
                      {item.event}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <BubbleTag label={item.time} color={c} size="sm" />
                    <button
                      type="button"
                      onClick={() => toggleRsvp(item)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold
                        cursor-pointer transition-all duration-150 border"
                      style={{
                        background: isGoing ? 'var(--bg-card)' : 'transparent',
                        color: isGoing ? 'var(--green-ink)' : 'var(--text-muted)',
                        borderColor: isGoing ? 'var(--green)' : 'var(--border-strong)',
                      }}
                    >
                      {isGoing ? <Check size={12} strokeWidth={2.6} /> : <Plus size={12} />}
                      {isGoing ? 'Going' : 'RSVP'}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-[11.5px] sm:text-[12px] text-[var(--text-muted)] mt-2.5 pt-2 border-t border-[color-mix(in_srgb,var(--border)_65%,transparent)]">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin size={13} className="text-[var(--text-light)] shrink-0" />
                    {item.location}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock size={13} className="text-[var(--text-light)] shrink-0" />
                    {item.duration}
                  </span>
                  {item.attendees && (
                    <span className="inline-flex items-center gap-1.5 sm:ml-auto font-mono-num text-[11.5px]">
                      <Users size={13} className="text-[var(--text-light)] shrink-0" />
                      {item.attendees} attending
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="py-8 text-center text-xs text-[var(--text-muted)]">
            No scheduled sessions match your filter.
          </div>
        )}
      </div>
    </Card>
  )
}
