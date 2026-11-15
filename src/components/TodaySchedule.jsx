import { useState, useMemo } from 'react'
import { MapPin, Clock, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { todaySchedule as defaultSchedule } from '../data/sampleData'
import { Card, BubbleTag, IconBadge, cleanText } from './ui'
import { ScheduleEventIcon } from './icons'

function formatYmd(dt) {
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDaysYmd(ymd, delta) {
  const [y, m, d] = ymd.split('-').map(Number)
  return formatYmd(new Date(Date.UTC(y, m - 1, d + delta, 12, 0, 0)))
}

export default function TodaySchedule({ items, searchQuery = '', onDeleteEvent }) {
  const [viewMode, setViewMode] = useState('list') // 'list' | 'week' | 'month'
  const [showAllEvents, setShowAllEvents] = useState(false)
  const [weekStart, setWeekStart] = useState('2026-11-16')
  const [monthState, setMonthState] = useState({ year: 2026, month: 10 }) // 10 = Nov

  const todaySchedule = items && items.length > 0 ? items : defaultSchedule

  const filtered = useMemo(() => {
    return todaySchedule.filter(ev => {
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return (
        (ev.club || '').toLowerCase().includes(q) ||
        (ev.event || '').toLowerCase().includes(q) ||
        (ev.location || '').toLowerCase().includes(q)
      )
    })
  }, [todaySchedule, searchQuery])

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysYmd(weekStart, i)),
    [weekStart]
  )

  const monthCells = useMemo(() => {
    const first = new Date(Date.UTC(monthState.year, monthState.month, 1, 12, 0, 0))
    const startDow = first.getUTCDay()
    const gridStart = new Date(Date.UTC(monthState.year, monthState.month, 1 - startDow, 12, 0, 0))
    return Array.from({ length: 35 }, (_, i) => {
      const dt = new Date(Date.UTC(
        gridStart.getUTCFullYear(),
        gridStart.getUTCMonth(),
        gridStart.getUTCDate() + i,
        12,
        0,
        0
      ))
      return {
        dateStr: formatYmd(dt),
        dayNum: dt.getUTCDate(),
        inMonth: dt.getUTCMonth() === monthState.month,
      }
    })
  }, [monthState])

  function handlePrev() {
    if (viewMode === 'month') {
      setMonthState(prev => {
        const dt = new Date(Date.UTC(prev.year, prev.month - 1, 1, 12, 0, 0))
        return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() }
      })
    } else {
      const nextW = addDaysYmd(weekStart, -7)
      setWeekStart(nextW)
      const [y, m] = nextW.split('-').map(Number)
      setMonthState({ year: y, month: m - 1 })
    }
  }

  function handleNext() {
    if (viewMode === 'month') {
      setMonthState(prev => {
        const dt = new Date(Date.UTC(prev.year, prev.month + 1, 1, 12, 0, 0))
        return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() }
      })
    } else {
      const nextW = addDaysYmd(weekStart, 7)
      setWeekStart(nextW)
      const [y, m] = nextW.split('-').map(Number)
      setMonthState({ year: y, month: m - 1 })
    }
  }

  const headerPeriodLabel = useMemo(() => {
    if (viewMode === 'month') {
      const dt = new Date(Date.UTC(monthState.year, monthState.month, 1, 12, 0, 0))
      return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    }
    const [y1, m1, d1] = weekDates[0].split('-').map(Number)
    const [y2, m2, d2] = weekDates[6].split('-').map(Number)
    const dt1 = new Date(Date.UTC(y1, m1 - 1, d1, 12, 0, 0))
    const dt2 = new Date(Date.UTC(y2, m2 - 1, d2, 12, 0, 0))
    return `${dt1.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} – ${dt2.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`
  }, [viewMode, monthState, weekDates])

  const eventsByDate = useMemo(() => {
    const map = {}
    for (const item of filtered) {
      if (!item.startIso) continue
      const ymd = new Date(item.startIso).toISOString().slice(0, 10)
      if (!map[ymd]) map[ymd] = []
      map[ymd].push(item)
    }
    return map
  }, [filtered])

  const visibleItems = showAllEvents ? filtered : filtered.slice(0, 6)

  return (
    <Card className="p-4 sm:p-[22px]" delay={3}>
      {/* Header + Google Calendar-style < Prev | Next > & View Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 sm:mb-[18px]">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-base font-bold text-[var(--text)]">
            ClubHub Calendar &amp; Schedule
          </h2>
          <BubbleTag label={`${filtered.length} Events`} color="blue" size="sm" />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrev}
            title="Previous Week / Month"
            className="w-7 h-7 rounded-full bg-[var(--bg-surface)] text-[var(--text)] border border-[var(--border)] flex items-center justify-center cursor-pointer hover:border-[var(--blue)]"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs font-semibold text-[var(--text)] px-1">
            {headerPeriodLabel}
          </span>
          <button
            type="button"
            onClick={handleNext}
            title="Next Week / Month"
            className="w-7 h-7 rounded-full bg-[var(--bg-surface)] text-[var(--text)] border border-[var(--border)] flex items-center justify-center cursor-pointer hover:border-[var(--blue)]"
          >
            <ChevronRight size={14} />
          </button>

          <div className="flex items-center bg-[var(--bg-surface)] p-0.5 rounded-full border border-[var(--border)] ml-1">
            {['list', 'week', 'month'].map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize border-none cursor-pointer ${
                  viewMode === mode
                    ? 'bg-[var(--blue)] text-white'
                    : 'bg-transparent text-[var(--text-muted)]'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {viewMode === 'week' && (
        <div className="grid grid-cols-7 gap-1.5">
          {weekDates.map(ymd => {
            const [y, m, d] = ymd.split('-').map(Number)
            const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
            const dayName = dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
            const dayEvs = eventsByDate[ymd] || []
            return (
              <div
                key={ymd}
                className="min-h-[120px] p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] flex flex-col gap-1"
              >
                <div className="text-center border-b border-[var(--border)] pb-1 mb-1">
                  <div className="text-[10px] text-[var(--text-muted)] font-semibold">{dayName}</div>
                  <div className="text-xs font-bold text-[var(--text)]">{d}</div>
                </div>
                {dayEvs.length > 0 ? (
                  dayEvs.map(ev => (
                    <div
                      key={ev.id}
                      className={`p-1.5 rounded text-[10px] font-medium flex flex-col gap-0.5 ${
                        ev.isBookedCollab
                          ? 'bg-[var(--green-light)] text-[var(--text)] border border-[var(--green)]'
                          : 'bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)]'
                      }`}
                    >
                      <span className="font-bold truncate">{ev.event}</span>
                      <span className="text-[9px] text-[var(--text-muted)] truncate">{ev.club}</span>
                      {ev.isBookedCollab && onDeleteEvent && (
                        <button
                          type="button"
                          onClick={() => onDeleteEvent(ev.id)}
                          className="mt-0.5 px-1.5 py-0.5 rounded bg-[var(--red)] text-white text-[9px] font-semibold border-none cursor-pointer self-start"
                        >
                          Unbook
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-[10px] text-[var(--text-muted)] text-center my-auto opacity-50">
                    No events
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {viewMode === 'month' && (
        <div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-[var(--text-muted)] mb-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthCells.map(c => {
              const dayEvs = eventsByDate[c.dateStr] || []
              return (
                <div
                  key={c.dateStr}
                  className={`min-h-[68px] p-1.5 rounded-lg border text-[10px] flex flex-col gap-1 ${
                    c.inMonth
                      ? 'bg-[var(--bg-surface)] border-[var(--border)]'
                      : 'bg-[var(--bg-surface)] opacity-40 border-[var(--border)]'
                  }`}
                >
                  <span className="font-bold text-[var(--text)]">{c.dayNum}</span>
                  {dayEvs.slice(0, 2).map(ev => (
                    <div
                      key={ev.id}
                      className={`px-1 py-0.5 rounded truncate text-[9.5px] font-semibold ${
                        ev.isBookedCollab
                          ? 'bg-[var(--blue)] text-white'
                          : 'bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)]'
                      }`}
                      title={`${ev.club}: ${ev.event}`}
                    >
                      {ev.event}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {viewMode === 'list' && (
        <div className="flex flex-col gap-3">
          {visibleItems.map((item, i) => {
            const isLast = i === visibleItems.length - 1
            const c = item.color === 'muted' || !item.color ? 'teal' : item.color
            const clubName = cleanText(item.club)
            const eventTitle = cleanText(item.event)

            return (
              <div key={item.id} className="flex items-stretch gap-3">
                <div className="flex flex-col items-center pt-1">
                  <IconBadge color={c} size={32} radius={10}>
                    <ScheduleEventIcon club={clubName} event={eventTitle} size={16} />
                  </IconBadge>
                  {!isLast && (
                    <div className="w-[1.5px] flex-1 my-1.5 rounded-full bg-[var(--border)]" />
                  )}
                </div>

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
                          title="Unbook this collaboration meeting"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--red)] text-white text-[11px] font-semibold border-none cursor-pointer hover:opacity-90"
                        >
                          <Trash2 size={11} />
                          Unbook
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

          {filtered.length > 6 && (
            <button
              type="button"
              onClick={() => setShowAllEvents(prev => !prev)}
              className="text-xs font-semibold text-[var(--blue-ink)] bg-transparent border-none cursor-pointer hover:underline self-center pt-1"
            >
              {showAllEvents ? 'Show Less' : `View All (${filtered.length} Events)`}
            </button>
          )}
        </div>
      )}
    </Card>
  )
}
