import { useState, useMemo } from 'react'
import {
  MapPin,
  Clock,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Check,
  ArrowRight,
  Calendar as CalendarIcon,
  X,
} from 'lucide-react'
import { todaySchedule as defaultSchedule } from '../data/sampleData'
import { Card, BubbleTag, IconBadge, cleanText } from './ui'
import { ScheduleEventIcon } from './icons'

function toLocalYmd(dateInput) {
  const dt = dateInput instanceof Date ? dateInput : new Date(dateInput)
  if (Number.isNaN(dt.getTime())) return ''
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseYmdLocal(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0)
}

function addDaysYmd(ymd, delta) {
  const dt = parseYmdLocal(ymd)
  dt.setDate(dt.getDate() + delta)
  return toLocalYmd(dt)
}

function getWeekStartOfDate(ymd, weekStartsOn = 'sunday') {
  const dt = parseYmdLocal(ymd)
  const dow = dt.getDay()
  if (weekStartsOn === 'monday') {
    const diff = dow === 0 ? -6 : 1 - dow
    dt.setDate(dt.getDate() + diff)
  } else {
    dt.setDate(dt.getDate() - dow)
  }
  return toLocalYmd(dt)
}

function formatEventBadgeTime(item, use24h = false) {
  if (!item.startIso) return item.time
  const dt = new Date(item.startIso)
  if (Number.isNaN(dt.getTime())) return item.time
  return dt.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: !use24h,
  })
}

const DEFAULT_FOCUS_DATE = '2026-11-15'

export default function CalendarView({
  items,
  clubs = [],
  userSettings = {},
  searchQuery = '',
  compact = false,
  onOpenCalendar,
  onAddEvent,
  onDeleteEvent,
  rsvpMap = {},
  onToggleRsvp,
  onNotify,
}) {
  const use24h = userSettings?.timeFormat === '24h'
  const weekStartsOn = userSettings?.weekStartsOn === 'monday' ? 'monday' : 'sunday'
  const isCompactDensity = Boolean(userSettings?.compactCards)

  const [viewMode, setViewMode] = useState(
    () => userSettings?.defaultCalendarView || 'agenda'
  ) // 'agenda' | 'week' | 'month'
  const [agendaFilter, setAgendaFilter] = useState('all') // 'all' | 'going'
  const [weekAnchor, setWeekAnchor] = useState(DEFAULT_FOCUS_DATE)
  const [monthState, setMonthState] = useState({ year: 2026, month: 10 }) // 10 = Nov
  const [selectedDate, setSelectedDate] = useState('2026-11-17')

  const weekStart = useMemo(
    () => getWeekStartOfDate(weekAnchor, weekStartsOn),
    [weekAnchor, weekStartsOn]
  )

  // Add Event modal/drawer state
  const [showAddForm, setShowAddForm] = useState(false)
  const [eventTitle, setEventTitle] = useState('')
  const [eventClubId, setEventClubId] = useState(clubs[0]?.id || 'demo_ucsc_csclub')
  const [eventDate, setEventDate] = useState('2026-11-17')
  const [eventTime, setEventTime] = useState('17:00')
  const [eventLocation, setEventLocation] = useState('')

  const baseEvents = items && items.length > 0 ? items : defaultSchedule

  const enrichedEvents = useMemo(() => {
    return baseEvents.map(ev => {
      const isGoing =
        rsvpMap[ev.id] !== undefined ? Boolean(rsvpMap[ev.id]) : Boolean(ev.rsvp)
      const baseCount = typeof ev.attendees === 'number' ? ev.attendees : 12
      const delta =
        rsvpMap[ev.id] === undefined
          ? 0
          : rsvpMap[ev.id] && !ev.rsvp
            ? 1
            : !rsvpMap[ev.id] && ev.rsvp
              ? -1
              : 0
      const dateKey = ev.startIso ? toLocalYmd(ev.startIso) : ''
      return {
        ...ev,
        isGoing,
        attendeeCount: Math.max(0, baseCount + delta),
        dateKey,
      }
    })
  }, [baseEvents, rsvpMap])

  const filtered = useMemo(() => {
    return enrichedEvents.filter(ev => {
      if (agendaFilter === 'going' && viewMode === 'agenda' && !compact && !ev.isGoing) {
        return false
      }
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return (
        (ev.club || '').toLowerCase().includes(q) ||
        (ev.event || '').toLowerCase().includes(q) ||
        (ev.location || '').toLowerCase().includes(q)
      )
    })
  }, [enrichedEvents, agendaFilter, viewMode, compact, searchQuery])

  const eventsByDate = useMemo(() => {
    const map = {}
    for (const ev of filtered) {
      if (!ev.dateKey) continue
      if (!map[ev.dateKey]) map[ev.dateKey] = []
      map[ev.dateKey].push(ev)
    }
    return map
  }, [filtered])

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysYmd(weekStart, i)),
    [weekStart]
  )

  const monthCells = useMemo(() => {
    const first = new Date(monthState.year, monthState.month, 1, 12, 0, 0)
    const rawDow = first.getDay()
    const startOffset =
      weekStartsOn === 'monday' ? (rawDow === 0 ? 6 : rawDow - 1) : rawDow
    const gridStart = new Date(monthState.year, monthState.month, 1 - startOffset, 12, 0, 0)
    const daysInMonth = new Date(monthState.year, monthState.month + 1, 0).getDate()
    const totalCells = startOffset + daysInMonth > 35 ? 42 : 35

    return Array.from({ length: totalCells }, (_, i) => {
      const dt = new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + i,
        12,
        0,
        0
      )
      return {
        dateStr: toLocalYmd(dt),
        dayNum: dt.getDate(),
        inMonth: dt.getMonth() === monthState.month,
      }
    })
  }, [monthState, weekStartsOn])

  function handlePrev() {
    if (viewMode === 'month') {
      const dt = new Date(monthState.year, monthState.month - 1, 1, 12, 0, 0)
      setMonthState({ year: dt.getFullYear(), month: dt.getMonth() })
      setSelectedDate(toLocalYmd(dt))
    } else if (viewMode === 'week') {
      const nextW = addDaysYmd(weekStart, -7)
      setWeekAnchor(nextW)
      setSelectedDate(nextW)
      const dt = parseYmdLocal(nextW)
      setMonthState({ year: dt.getFullYear(), month: dt.getMonth() })
    }
  }

  function handleNext() {
    if (viewMode === 'month') {
      const dt = new Date(monthState.year, monthState.month + 1, 1, 12, 0, 0)
      setMonthState({ year: dt.getFullYear(), month: dt.getMonth() })
      setSelectedDate(toLocalYmd(dt))
    } else if (viewMode === 'week') {
      const nextW = addDaysYmd(weekStart, 7)
      setWeekAnchor(nextW)
      setSelectedDate(nextW)
      const dt = parseYmdLocal(nextW)
      setMonthState({ year: dt.getFullYear(), month: dt.getMonth() })
    }
  }

  function handleToday() {
    setWeekAnchor(DEFAULT_FOCUS_DATE)
    setMonthState({ year: 2026, month: 10 })
    setSelectedDate('2026-11-17')
  }

  const periodLabel = useMemo(() => {
    if (viewMode === 'month') {
      const dt = new Date(monthState.year, monthState.month, 1, 12, 0, 0)
      return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    }
    const dt1 = parseYmdLocal(weekDates[0])
    const dt2 = parseYmdLocal(weekDates[6])
    const s1 = dt1.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const s2 = dt2.toLocaleDateString('en-US', {
      month: dt1.getMonth() === dt2.getMonth() ? undefined : 'short',
      day: 'numeric',
      year: 'numeric',
    })
    return `${s1} – ${s2}`
  }, [viewMode, monthState, weekDates])

  async function handleSubmitNewEvent(e) {
    e.preventDefault()
    if (!eventTitle.trim() || !eventDate) return

    const [hh, mm] = (eventTime || '17:00').split(':').map(Number)
    const [yy, mo, dd] = eventDate.split('-').map(Number)
    const startDt = new Date(yy, (mo || 1) - 1, dd || 1, hh || 17, mm || 0, 0)
    const endDt = new Date(startDt.getTime() + 60 * 60 * 1000)

    const clubObj = clubs.find(c => String(c.id) === String(eventClubId))
    const clubLabel = clubObj ? cleanText(clubObj.name) : 'Campus Club'

    if (onAddEvent) {
      await onAddEvent({
        clubId: String(eventClubId || 'demo_ucsc_csclub'),
        clubName: clubLabel,
        title: eventTitle.trim(),
        start: startDt.toISOString(),
        end: endDt.toISOString(),
        location: eventLocation.trim() || clubObj?.room || 'TBD',
      })
    }

    setSelectedDate(eventDate)
    setEventTitle('')
    setEventLocation('')
    setShowAddForm(false)
    if (onNotify) {
      onNotify(`Added "${eventTitle.trim()}" to Calendar.`)
    }
  }

  function renderEventRow(item, isLast = false) {
    const c = item.color === 'muted' || !item.color ? 'blue' : item.color
    const clubName = cleanText(item.club)
    const title = cleanText(item.event)
    const canRemove = Boolean(item.isBookedCollab || item.isCustom) && Boolean(onDeleteEvent)

    return (
      <div key={item.id} className="flex items-stretch gap-3">
        <div className="hidden xs:flex flex-col items-center pt-1">
          <IconBadge color={c} size={34} radius={10}>
            <ScheduleEventIcon club={clubName} event={title} size={16} />
          </IconBadge>
          {!isLast && (
            <div className="w-[1.5px] flex-1 my-1.5 rounded-full bg-[var(--border)]" />
          )}
        </div>

        <div
          className={`flex-1 min-w-0 rounded-[var(--radius-sm)] ${
            isCompactDensity ? 'p-2.5' : 'p-3.5'
          } bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition-colors`}
        >
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
            <div className="min-w-0">
              {clubName && (
                <div className="text-[11px] font-semibold text-[var(--blue-ink)] mb-0.5 truncate">
                  {clubName}
                </div>
              )}
              <div className="font-semibold text-sm text-[var(--text)] leading-snug">
                {title}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <BubbleTag label={formatEventBadgeTime(item, use24h)} color={c} size="sm" />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-[var(--border-subtle)]">
            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)] min-w-0">
              <span className="inline-flex items-center gap-1 min-w-0">
                <MapPin size={13} className="text-[var(--text-light)] shrink-0" />
                <span className="truncate">{cleanText(item.location || 'TBD')}</span>
              </span>
              {item.duration && (
                <span className="inline-flex items-center gap-1 shrink-0">
                  <Clock size={13} className="text-[var(--text-light)] shrink-0" />
                  <span>{cleanText(item.duration)}</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {onToggleRsvp && (
                <button
                  type="button"
                  onClick={() => onToggleRsvp(item.id, !item.isGoing)}
                  className={`inline-flex items-center gap-1 px-3 min-h-[32px] rounded-full text-xs font-semibold cursor-pointer border transition-colors ${
                    item.isGoing
                      ? 'bg-[var(--green-light)] text-[var(--green-ink)] border-transparent'
                      : 'bg-[var(--bg-card)] text-[var(--text)] border-[var(--border)] hover:border-[var(--blue)]'
                  }`}
                >
                  {item.isGoing && <Check size={12} />}
                  <span>{item.isGoing ? 'Going' : 'RSVP'}</span>
                </button>
              )}

              {canRemove && (
                <button
                  type="button"
                  onClick={() => onDeleteEvent(item.id)}
                  title="Remove event from calendar"
                  className="inline-flex items-center gap-1 px-2.5 min-h-[32px] rounded-full bg-[var(--red-light)] text-[var(--red-ink)] text-xs font-semibold border-none cursor-pointer hover:opacity-85 transition-opacity"
                >
                  <Trash2 size={12} />
                  <span>Remove</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── 1. COMPACT OVERVIEW MODE ──────────────────────────────────────
  if (compact) {
    const preview = filtered.slice(0, 4)
    return (
      <Card className="p-4 sm:p-[22px] flex flex-col justify-between" delay={2}>
        <div>
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[var(--text)]">Upcoming Schedule</h2>
              <BubbleTag label={`${filtered.length}`} color="blue" size="sm" />
            </div>

            {onOpenCalendar && (
              <button
                type="button"
                onClick={onOpenCalendar}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer"
              >
                <span>Full Calendar</span>
                <ArrowRight size={13} />
              </button>
            )}
          </div>

          {preview.length > 0 ? (
            <div className="flex flex-col gap-3">
              {preview.map((item, idx) => renderEventRow(item, idx === preview.length - 1))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-[var(--text-muted)]">
              No matching events found.
            </div>
          )}
        </div>
      </Card>
    )
  }

  // ── 2. FULL CALENDAR PAGE MODE ────────────────────────────────────
  const selectedDayEvents = eventsByDate[selectedDate] || []
  const selectedDateLabel = parseYmdLocal(selectedDate).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  return (
    <Card className="p-4 sm:p-6" delay={2}>
      {/* Top Toolbar: View Switcher + Add Event */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-[var(--border)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center bg-[var(--bg-subtle)] p-1 rounded-xl border border-[var(--border)]">
            {[
              { id: 'agenda', label: 'Agenda' },
              { id: 'week', label: 'Week' },
              { id: 'month', label: 'Month' },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setViewMode(tab.id)}
                className={`px-3.5 min-h-[34px] rounded-lg text-xs font-semibold border-none cursor-pointer transition-all ${
                  viewMode === tab.id
                    ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
                    : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {viewMode === 'agenda' && (
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all', label: `All (${ enrichedEvents.length })` },
                { id: 'going', label: `Going (${ enrichedEvents.filter(e => e.isGoing).length })` },
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setAgendaFilter(f.id)}
                  className={`px-3 min-h-[34px] rounded-full text-xs font-semibold cursor-pointer border transition-colors ${
                    agendaFilter === f.id
                      ? 'bg-[var(--blue-light)] text-[var(--blue-ink)] border-[var(--blue)]/30'
                      : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm(prev => !prev)}
          className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[40px] rounded-xl bg-[var(--blue)] text-white text-xs sm:text-sm font-semibold border-none cursor-pointer hover:opacity-90 transition-opacity self-start sm:self-auto"
        >
          {showAddForm ? <X size={15} /> : <Plus size={15} />}
          <span>{showAddForm ? 'Cancel' : 'Add Event'}</span>
        </button>
      </div>

      {/* Add Event Form (Comfortable 44px fields, clear labels, no raw IDs) */}
      {showAddForm && (
        <form
          onSubmit={handleSubmitNewEvent}
          className="mb-5 p-4 sm:p-5 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] space-y-4 fade-in"
        >
          <div className="text-sm font-bold text-[var(--text)]">Add Club Event</div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Event Title
              </label>
              <input
                type="text"
                required
                value={eventTitle}
                onChange={e => setEventTitle(e.target.value)}
                placeholder="e.g. Intro to Web Dev Workshop"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Club
              </label>
              <select
                value={eventClubId}
                onChange={e => setEventClubId(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              >
                {clubs.map(c => (
                  <option key={c.id} value={c.id}>
                    {cleanText(c.name)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                  Date
                </label>
                <input
                  type="date"
                  required
                  value={eventDate}
                  onChange={e => setEventDate(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                  Start Time
                </label>
                <input
                  type="time"
                  required
                  value={eventTime}
                  onChange={e => setEventTime(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Location
              </label>
              <input
                type="text"
                value={eventLocation}
                onChange={e => setEventLocation(e.target.value)}
                placeholder="e.g. Baskin Engineering 152 or Zoom"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 min-h-[42px] rounded-xl bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border)] text-sm font-semibold cursor-pointer hover:text-[var(--text)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 min-h-[42px] rounded-xl bg-[var(--blue)] text-white border-none text-sm font-semibold cursor-pointer hover:opacity-90"
            >
              Save Event
            </button>
          </div>
        </form>
      )}

      {/* Period Navigation Bar (ONLY shown in Week & Month views where arrows actually navigate dates) */}
      {viewMode !== 'agenda' && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Previous period"
              className="w-9 h-9 rounded-xl bg-[var(--bg-surface)] text-[var(--text)] border border-[var(--border)] flex items-center justify-center cursor-pointer hover:border-[var(--blue)]"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="px-3 h-9 rounded-xl bg-[var(--bg-surface)] text-[var(--text)] border border-[var(--border)] text-xs font-semibold cursor-pointer hover:border-[var(--blue)]"
            >
              This Week
            </button>
            <button
              type="button"
              onClick={handleNext}
              aria-label="Next period"
              className="w-9 h-9 rounded-xl bg-[var(--bg-surface)] text-[var(--text)] border border-[var(--border)] flex items-center justify-center cursor-pointer hover:border-[var(--blue)]"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="text-sm sm:text-base font-bold text-[var(--text)]">
            {periodLabel}
          </div>
        </div>
      )}

      {/* ── VIEW 1: AGENDA LIST ── */}
      {viewMode === 'agenda' && (
        <div className="flex flex-col gap-3">
          {filtered.length > 0 ? (
            filtered.map((item, idx) => renderEventRow(item, idx === filtered.length - 1))
          ) : (
            <div className="py-10 text-center">
              <CalendarIcon size={28} className="mx-auto text-[var(--text-light)] mb-2" />
              <div className="text-sm font-semibold text-[var(--text)]">No events to display</div>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {agendaFilter === 'going'
                  ? 'RSVP to any upcoming club meeting to see it here.'
                  : 'Try clearing your search or adding a new event.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── VIEW 2: WEEK VIEW (Mobile 7-day strip + cards; Desktop 7-col board) ── */}
      {viewMode === 'week' && (
        <div>
          {/* Mobile Day Strip (< md): fits 100% width with zero scrollbar */}
          <div className="grid grid-cols-7 gap-1 md:hidden mb-4">
            {weekDates.map(ymd => {
              const dt = parseYmdLocal(ymd)
              const dayLetter = dt.toLocaleDateString('en-US', { weekday: 'narrow' })
              const dayNum = dt.getDate()
              const count = (eventsByDate[ymd] || []).length
              const isSelected = selectedDate === ymd

              return (
                <button
                  key={ymd}
                  type="button"
                  onClick={() => setSelectedDate(ymd)}
                  className={`py-2 px-1 rounded-xl border flex flex-col items-center gap-1 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[var(--blue)] text-white border-[var(--blue)]'
                      : 'bg-[var(--bg-surface)] text-[var(--text)] border-[var(--border)]'
                  }`}
                >
                  <span className={`text-[10px] font-semibold ${isSelected ? 'text-white/85' : 'text-[var(--text-muted)]'}`}>
                    {dayLetter}
                  </span>
                  <span className="text-sm font-bold font-mono-num">{dayNum}</span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      count > 0
                        ? isSelected
                          ? 'bg-white'
                          : 'bg-[var(--blue)]'
                        : 'bg-transparent'
                    }`}
                  />
                </button>
              )
            })}
          </div>

          {/* Mobile Selected Day Events (< md) */}
          <div className="md:hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                {selectedDateLabel}
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                {selectedDayEvents.length} {selectedDayEvents.length === 1 ? 'event' : 'events'}
              </span>
            </div>
            {selectedDayEvents.length > 0 ? (
              <div className="flex flex-col gap-3">
                {selectedDayEvents.map((ev, i) =>
                  renderEventRow(ev, i === selectedDayEvents.length - 1)
                )}
              </div>
            ) : (
              <div className="p-6 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-center">
                <p className="text-xs text-[var(--text-muted)] mb-2.5">
                  No events scheduled for {selectedDateLabel}.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEventDate(selectedDate)
                    setShowAddForm(true)
                  }}
                  className="inline-flex items-center gap-1 px-3.5 min-h-[36px] rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-xs font-semibold text-[var(--blue-ink)] cursor-pointer hover:border-[var(--blue)]"
                >
                  <Plus size={13} />
                  <span>Add event on this day</span>
                </button>
              </div>
            )}
          </div>

          {/* Desktop 7-Column Week Board (md+) */}
          <div className="hidden md:grid grid-cols-7 gap-2">
            {weekDates.map(ymd => {
              const dt = parseYmdLocal(ymd)
              const dayName = dt.toLocaleDateString('en-US', { weekday: 'short' })
              const dayNum = dt.getDate()
              const dayEvs = eventsByDate[ymd] || []

              return (
                <div
                  key={ymd}
                  className="min-h-[180px] p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] flex flex-col gap-2 min-w-0"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
                    <span className="text-xs font-semibold text-[var(--text-muted)]">{dayName}</span>
                    <span className="text-xs font-bold font-mono-num text-[var(--text)]">{dayNum}</span>
                  </div>

                  {dayEvs.length > 0 ? (
                    dayEvs.map(ev => {
                      const c = ev.color || 'blue'
                      return (
                        <div
                          key={ev.id}
                          className="p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] flex flex-col gap-1 min-w-0"
                        >
                          <span className="text-[11px] font-bold text-[var(--text)] leading-snug line-clamp-2">
                            {cleanText(ev.event)}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)] truncate">
                            {cleanText(ev.club)}
                          </span>
                          <BubbleTag
                            label={
                              ev.startIso
                                ? new Date(ev.startIso).toLocaleTimeString('en-US', {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: !use24h,
                                  })
                                : ev.time
                            }
                            color={c}
                            size="sm"
                            className="self-start mt-0.5"
                          />
                        </div>
                      )
                    })
                  ) : (
                    <div className="text-[11px] text-[var(--text-light)] text-center my-auto">
                      Open
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── VIEW 3: MONTH VIEW (Clean picker + selected day details) ── */}
      {viewMode === 'month' && (
        <div className="space-y-4">
          <div>
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center text-[11px] font-semibold text-[var(--text-muted)] mb-1.5">
              {(weekStartsOn === 'monday'
                ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
                : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
              ).map(d => (
                <div key={d} className="py-1">
                  <span className="hidden sm:inline">{d}</span>
                  <span className="sm:hidden">{d[0]}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {monthCells.map(cell => {
                const dayEvs = eventsByDate[cell.dateStr] || []
                const isSelected = selectedDate === cell.dateStr

                return (
                  <button
                    key={cell.dateStr}
                    type="button"
                    onClick={() => setSelectedDate(cell.dateStr)}
                    className={`min-h-[46px] sm:min-h-[86px] p-1.5 sm:p-2 rounded-xl border text-left flex flex-col justify-between cursor-pointer transition-all min-w-0 ${
                      isSelected
                        ? 'bg-[var(--blue-light)] border-[var(--blue)]'
                        : cell.inMonth
                          ? 'bg-[var(--bg-surface)] border-[var(--border)] hover:border-[var(--border-strong)]'
                          : 'bg-[var(--bg-surface)]/50 opacity-45 border-[var(--border-subtle)]'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span
                        className={`text-xs font-bold font-mono-num ${
                          isSelected ? 'text-[var(--blue-ink)]' : 'text-[var(--text)]'
                        }`}
                      >
                        {cell.dayNum}
                      </span>
                      {/* Mobile dot indicator */}
                      {dayEvs.length > 0 && (
                        <span className="sm:hidden w-2 h-2 rounded-full bg-[var(--blue)] shrink-0" />
                      )}
                    </div>

                    {/* Desktop event pills */}
                    <div className="hidden sm:flex flex-col gap-1 w-full mt-1 min-w-0">
                      {dayEvs.slice(0, 2).map(ev => (
                        <div
                          key={ev.id}
                          className="px-1.5 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border)] text-[10px] font-semibold text-[var(--text)] truncate"
                        >
                          {cleanText(ev.event)}
                        </div>
                      ))}
                      {dayEvs.length > 2 && (
                        <span className="text-[10px] text-[var(--text-muted)] pl-0.5">
                          +{dayEvs.length - 2} more
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Selected Day Event Details (works seamlessly on both mobile & desktop) */}
          <div className="pt-4 border-t border-[var(--border)]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                {selectedDateLabel}
              </span>
              <button
                type="button"
                onClick={() => {
                  setEventDate(selectedDate)
                  setShowAddForm(true)
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer"
              >
                <Plus size={13} />
                <span>Add event</span>
              </button>
            </div>

            {selectedDayEvents.length > 0 ? (
              <div className="flex flex-col gap-3">
                {selectedDayEvents.map((ev, idx) =>
                  renderEventRow(ev, idx === selectedDayEvents.length - 1)
                )}
              </div>
            ) : (
              <div className="text-xs text-[var(--text-muted)] py-3">
                No events scheduled for {selectedDateLabel}.
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
