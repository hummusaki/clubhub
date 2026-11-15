import { useState, useMemo, useEffect } from 'react'
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
  CalendarPlus,
  ExternalLink,
  History,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { todaySchedule as defaultSchedule } from '../data/sampleData'
import { Card, BubbleTag, IconBadge, cleanText } from './ui'
import { ScheduleEventIcon } from './icons'
import CalendarSyncModal, {
  GoogleCalendarLogo,
  AppleCalendarLogo,
} from './CalendarSyncModal'
import {
  buildGoogleCalendarTemplateUrl,
  normalizeCalendarSyncSettings,
} from '../utils/calendarSync'

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
  if (item.allDay) {
    return `${dt.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })} · All Day`
  }
  return dt.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: !use24h,
  })
}

export default function CalendarView({
  items,
  clubs = [],
  initialView = null,
  userSettings = {},
  onUpdateSettings,
  calendarIntegration = null,
  onPageContextChange,
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
  const calSyncSettings = useMemo(
    () => normalizeCalendarSyncSettings(userSettings?.calendarSync),
    [userSettings?.calendarSync]
  )
  const inAppRsvpOnly = calSyncSettings.inAppRsvpOnly

  const nowRef = useMemo(() => new Date(), [])
  const todayYmd = useMemo(() => toLocalYmd(nowRef), [nowRef])

  const joinedClubIdSet = useMemo(
    () => new Set(clubs.filter(c => Boolean(c.joined)).map(c => String(c.id))),
    [clubs]
  )

  const [viewMode, setViewMode] = useState(
    () => initialView || userSettings?.defaultCalendarView || 'month'
  ) // 'month' | 'week' | 'agenda'
  const [clubScope, setClubScope] = useState('myclubs') // 'myclubs' | 'all'
  const [agendaFilter, setAgendaFilter] = useState('upcoming') // 'upcoming' | 'past' | 'all'
  const [weekAnchor, setWeekAnchor] = useState(todayYmd)
  const [monthState, setMonthState] = useState(() => ({
    year: nowRef.getFullYear(),
    month: nowRef.getMonth(),
  }))
  const [selectedDate, setSelectedDate] = useState(todayYmd)

  const weekStart = useMemo(
    () => getWeekStartOfDate(weekAnchor, weekStartsOn),
    [weekAnchor, weekStartsOn]
  )

  // Add Event & Calendar Sync Settings modal state
  const [showAddForm, setShowAddForm] = useState(false)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [eventTitle, setEventTitle] = useState('')
  const [eventClubId, setEventClubId] = useState(clubs[0]?.id || 'demo_ucsc_csclub')
  const [eventDate, setEventDate] = useState(todayYmd)
  const [eventTime, setEventTime] = useState('17:00')
  const [eventLocation, setEventLocation] = useState('')

  const baseEvents = items && items.length > 0 ? items : defaultSchedule

  const enrichedEvents = useMemo(() => {
    const nowMs = nowRef.getTime()
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
      const startMs = ev.startIso ? new Date(ev.startIso).getTime() : nowMs
      const isPast = ev.allDay ? Boolean(dateKey && dateKey < todayYmd) : startMs < nowMs
      return {
        ...ev,
        isGoing,
        isPast,
        startMs,
        attendeeCount: Math.max(0, baseCount + delta),
        dateKey,
      }
    })
  }, [baseEvents, rsvpMap, nowRef, todayYmd])

  // Events after applying Club Scope + Search
  const clubAndSearchEvents = useMemo(() => {
    return enrichedEvents.filter(ev => {
      if (
        !compact &&
        joinedClubIdSet.size > 0 &&
        clubScope === 'myclubs' &&
        !ev.isCustom &&
        !ev.isBookedCollab &&
        (!ev.clubId || !joinedClubIdSet.has(String(ev.clubId)))
      ) {
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
  }, [enrichedEvents, joinedClubIdSet, clubScope, compact, searchQuery])

  const rsvpGoingCountInScope = useMemo(
    () => clubAndSearchEvents.filter(ev => ev.isGoing).length,
    [clubAndSearchEvents]
  )

  // Events after applying optional in-app "Only show RSVP'd events" setting
  const scopedEvents = useMemo(() => {
    if (!inAppRsvpOnly) return clubAndSearchEvents
    return clubAndSearchEvents.filter(ev => ev.isGoing)
  }, [clubAndSearchEvents, inAppRsvpOnly])

  const agendaCounts = useMemo(() => {
    let upcoming = 0
    let past = 0
    for (const ev of scopedEvents) {
      if (ev.isPast) past += 1
      else upcoming += 1
    }
    return { upcoming, past, all: scopedEvents.length }
  }, [scopedEvents])

  const filtered = useMemo(() => {
    if (compact || viewMode !== 'agenda') {
      return scopedEvents
    }
    if (agendaFilter === 'upcoming') {
      return scopedEvents
        .filter(ev => !ev.isPast)
        .sort((a, b) => a.startMs - b.startMs)
    }
    if (agendaFilter === 'past') {
      return scopedEvents
        .filter(ev => ev.isPast)
        .sort((a, b) => b.startMs - a.startMs)
    }
    return scopedEvents
  }, [scopedEvents, agendaFilter, viewMode, compact])

  const eventsByDate = useMemo(() => {
    const map = {}
    for (const ev of scopedEvents) {
      if (!ev.dateKey) continue
      if (!map[ev.dateKey]) map[ev.dateKey] = []
      map[ev.dateKey].push(ev)
    }
    return map
  }, [scopedEvents])

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
    setWeekAnchor(todayYmd)
    setMonthState({ year: nowRef.getFullYear(), month: nowRef.getMonth() })
    setSelectedDate(todayYmd)
  }

  function handleMonthPickerChange(e) {
    const val = e.target.value // YYYY-MM
    if (!val || !val.includes('-')) return
    const [yy, mm] = val.split('-').map(Number)
    if (!yy || !mm) return
    setMonthState({ year: yy, month: mm - 1 })
    const nextSel = `${yy}-${String(mm).padStart(2, '0')}-01`
    setSelectedDate(nextSel)
    setWeekAnchor(nextSel)
  }

  const monthInputValue = `${monthState.year}-${String(monthState.month + 1).padStart(2, '0')}`

  const viewedMonthStats = useMemo(() => {
    const prefix = `${monthState.year}-${String(monthState.month + 1).padStart(2, '0')}-`
    let pastCount = 0
    let upcomingCount = 0
    for (const ev of scopedEvents) {
      if (ev.dateKey && ev.dateKey.startsWith(prefix)) {
        if (ev.isPast) pastCount += 1
        else upcomingCount += 1
      }
    }
    return { total: pastCount + upcomingCount, pastCount, upcomingCount }
  }, [scopedEvents, monthState])

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

  function handleUpdateCalendarSync(patch) {
    if (!onUpdateSettings) return
    onUpdateSettings({
      calendarSync: {
        ...calSyncSettings,
        ...patch,
      },
    })
  }

  // Report live Calendar sub-view state up so the browser tab title reflects the exact view/period
  useEffect(() => {
    if (!onPageContextChange) return
    if (compact) {
      onPageContextChange({
        nav: 'overview',
        label: null,
        modal: showSyncModal ? 'sync' : null,
      })
      return
    }
    let label = periodLabel
    if (viewMode === 'agenda') {
      if (agendaFilter === 'past') label = `Past Events (${agendaCounts.past})`
      else if (agendaFilter === 'all') label = `All Events (${agendaCounts.all})`
      else label = `Upcoming (${agendaCounts.upcoming})`
    }
    onPageContextChange({
      nav: 'calendar',
      label,
      modal: showSyncModal ? 'sync' : showAddForm ? 'add' : null,
    })
  }, [
    compact,
    onPageContextChange,
    viewMode,
    periodLabel,
    agendaFilter,
    agendaCounts,
    showSyncModal,
    showAddForm,
  ])

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
      <div key={item.id} className={`flex items-stretch ${isCompactDensity ? 'gap-2.5' : 'gap-3'}`}>
        <div className="hidden xs:flex flex-col items-center pt-1">
          <IconBadge color={c} size={isCompactDensity ? 28 : 34} radius={isCompactDensity ? 8 : 10}>
            <ScheduleEventIcon club={clubName} event={title} size={isCompactDensity ? 14 : 16} />
          </IconBadge>
          {!isLast && (
            <div className="w-[1.5px] flex-1 my-1 rounded-full bg-[var(--border)]" />
          )}
        </div>

        <div
          style={{
            borderLeftWidth: '3.5px',
            borderLeftColor: `var(--${c})`,
          }}
          className={`content-tile content-tile-interactive flex-1 min-w-0 rounded-[var(--radius-sm)] ${
            isCompactDensity ? 'p-2.5' : 'p-3.5'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1.5">
            <div className="min-w-0">
              {clubName && (
                <div className="text-[11px] font-semibold text-[var(--blue-ink)] mb-0.5 truncate">
                  {clubName}
                </div>
              )}
              <div
                className={`font-semibold ${
                  isCompactDensity ? 'text-[13px]' : 'text-sm'
                } text-[var(--text)] leading-snug`}
              >
                {title}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {!compact && item.isPast && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[10.5px] font-semibold text-[var(--text-muted)]">
                  <History size={11} />
                  <span>Past</span>
                </span>
              )}
              <BubbleTag label={formatEventBadgeTime(item, use24h)} color={c} size="sm" />
            </div>
          </div>

          <div
            className={`flex flex-wrap items-center justify-between gap-2 ${
              isCompactDensity ? 'mt-1.5 pt-1.5' : 'mt-2.5 pt-2.5'
            } border-t border-[var(--border-subtle)]`}
          >
            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)] min-w-0">
              <span className="inline-flex items-center gap-1 min-w-0">
                <MapPin size={12} className="text-[var(--text-light)] shrink-0" />
                <span className="truncate">{cleanText(item.location || 'Campus / See post')}</span>
              </span>
              {item.duration && (
                <span className="inline-flex items-center gap-1 shrink-0">
                  <Clock size={12} className="text-[var(--text-light)] shrink-0" />
                  <span>{cleanText(item.duration)}</span>
                </span>
              )}
              {!compact && item.permalink && (
                <a
                  href={item.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--blue-ink)] hover:underline no-underline shrink-0"
                >
                  <span>Post</span>
                  <ExternalLink size={11} />
                </a>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {!compact && (
                <a
                  href={buildGoogleCalendarTemplateUrl(item, {
                    titlePrefixClub: calSyncSettings.titlePrefixClub,
                  })}
                  target="_blank"
                  rel="noreferrer"
                  title="Add this event to Google Calendar"
                  aria-label="Add this event to Google Calendar"
                  className={`inline-flex items-center justify-center ${
                    isCompactDensity ? 'w-[26px] h-[26px]' : 'w-8 h-8'
                  } rounded-full bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--blue-ink)] border border-[var(--border)] hover:border-[var(--blue)] no-underline transition-colors`}
                >
                  <CalendarPlus size={13} />
                </a>
              )}

              {onToggleRsvp && (
                <button
                  type="button"
                  onClick={() => onToggleRsvp(item.id, !item.isGoing)}
                  className={`inline-flex items-center gap-1 ${
                    isCompactDensity ? 'px-2.5 min-h-[26px] text-[11px]' : 'px-3 min-h-[32px] text-xs'
                  } rounded-full font-semibold cursor-pointer border transition-colors ${
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
                  className={`inline-flex items-center gap-1 ${
                    isCompactDensity ? 'px-2 min-h-[26px] text-[11px]' : 'px-2.5 min-h-[32px] text-xs'
                  } rounded-full bg-[var(--red-light)] text-[var(--red-ink)] font-semibold border-none cursor-pointer hover:opacity-85 transition-opacity`}
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

  const renderSyncModal = calendarIntegration ? (
    <CalendarSyncModal
      variant="modal"
      open={showSyncModal}
      onClose={() => setShowSyncModal(false)}
      syncSettings={calSyncSettings}
      onUpdateSyncSettings={handleUpdateCalendarSync}
      syncedEvents={calendarIntegration.syncedEvents}
      joinedClubs={calendarIntegration.joinedClubs}
      feedWebcalUrl={calendarIntegration.feedWebcalUrl}
      feedHttpUrl={calendarIntegration.feedHttpUrl}
      feedMode={calendarIntegration.feedMode}
      onSubscribeApple={calendarIntegration.onSubscribeApple}
      onIntegrateGoogle={calendarIntegration.onIntegrateGoogle}
      onConnectGoogleLive={calendarIntegration.onConnectGoogleLive}
      onDisconnectGoogleLive={calendarIntegration.onDisconnectGoogleLive}
      onDownloadIcs={calendarIntegration.onDownloadIcs}
      onRegenerateFeedToken={calendarIntegration.onRegenerateFeedToken}
      onBrowseClubs={calendarIntegration.onBrowseClubs}
      googleLiveMeta={calendarIntegration.googleLiveMeta}
      googleSyncBusy={calendarIntegration.googleSyncBusy}
      hasGoogleClientId={calendarIntegration.hasGoogleClientId}
      onSaveGoogleClientId={calendarIntegration.onSaveGoogleClientId}
      isCompact={isCompactDensity}
      onNotify={onNotify}
    />
  ) : null

  // ── 1. COMPACT OVERVIEW MODE ──────────────────────────────────────
  if (compact) {
    const preview = filtered.slice(0, isCompactDensity ? 6 : 4)
    return (
      <Card
        className={`${isCompactDensity ? 'p-3.5 sm:p-4' : 'p-4 sm:p-[22px]'} flex flex-col justify-between`}
        delay={2}
      >
        <div>
          <div className={`flex items-center justify-between gap-2 ${isCompactDensity ? 'mb-3' : 'mb-4'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-[var(--text)]">Upcoming Schedule</h2>
              <BubbleTag label={`${filtered.length}`} color="blue" size="sm" />
              {inAppRsvpOnly && (
                <BubbleTag label="RSVP'd Only" color="green" size="sm" dot />
              )}
            </div>

            {onOpenCalendar && (
              <button
                type="button"
                onClick={onOpenCalendar}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer shrink-0"
              >
                <span>Full Calendar</span>
                <ArrowRight size={13} />
              </button>
            )}
          </div>

          {preview.length > 0 ? (
            <div className={`flex flex-col ${isCompactDensity ? 'gap-2' : 'gap-3'}`}>
              {preview.map((item, idx) => renderEventRow(item, idx === preview.length - 1))}
            </div>
          ) : (
            <div className="py-7 text-center text-sm text-[var(--text-muted)] space-y-2">
              <div>
                {inAppRsvpOnly
                  ? "No RSVP'd upcoming events yet."
                  : 'No matching events found.'}
              </div>
              {inAppRsvpOnly && onUpdateSettings && (
                <button
                  type="button"
                  onClick={() => handleUpdateCalendarSync({ inAppRsvpOnly: false })}
                  className="px-3 min-h-[30px] rounded-full bg-[var(--bg-surface)] text-xs font-semibold text-[var(--blue-ink)] border border-[var(--border)] cursor-pointer hover:border-[var(--blue)]"
                >
                  Show all upcoming events
                </button>
              )}
            </div>
          )}
        </div>

        {calendarIntegration && (
          <div className="mt-3.5 pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-[var(--text-muted)]">
              Sync {calendarIntegration.syncedEvents.length} {calendarIntegration.syncedEvents.length === 1 ? 'event' : 'events'}
              {calSyncSettings.rsvpOnly ? " (RSVP'd)" : ''}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => calendarIntegration.onQuickGoogleClick()}
                className="inline-flex items-center gap-1.5 px-2.5 min-h-[30px] rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[11.5px] font-semibold text-[var(--text)] border border-[var(--border)] cursor-pointer transition-colors"
              >
                <GoogleCalendarLogo size={13.5} />
                <span>Google</span>
              </button>
              <button
                type="button"
                onClick={() => calendarIntegration.onSubscribeApple()}
                className="inline-flex items-center gap-1.5 px-2.5 min-h-[30px] rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[11.5px] font-semibold text-[var(--text)] border border-[var(--border)] cursor-pointer transition-colors"
              >
                <AppleCalendarLogo size={12.5} />
                <span>Apple</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSyncModal(true)}
                title="Calendar sync settings"
                aria-label="Calendar sync settings"
                className="inline-flex items-center gap-1 px-2.5 min-h-[30px] rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[11.5px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] cursor-pointer transition-colors"
              >
                <SlidersHorizontal size={12.5} />
                <span>Sync Settings</span>
              </button>
            </div>
          </div>
        )}

        {renderSyncModal}
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
      {/* Top Toolbar: View Switcher, Club/RSVP Filters & External Calendar Integration */}
      <div className="flex flex-col gap-3 pb-4 mb-4 border-b border-[var(--border)]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center bg-[var(--bg-subtle)] p-1 rounded-xl border border-[var(--border)]">
              {[
                { id: 'month', label: 'Full Calendar' },
                { id: 'week', label: 'Week' },
                { id: 'agenda', label: 'Agenda' },
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

            {joinedClubIdSet.size > 0 && (
              <div className="inline-flex items-center bg-[var(--bg-surface)] p-1 rounded-xl border border-[var(--border)]">
                {[
                  { id: 'myclubs', label: `My Clubs (${joinedClubIdSet.size})` },
                  { id: 'all', label: 'All Campus' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setClubScope(opt.id)}
                    className={`px-3 min-h-[32px] rounded-lg text-xs font-semibold border-none cursor-pointer transition-all ${
                      clubScope === opt.id
                        ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
                        : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {onUpdateSettings && (
              <button
                type="button"
                onClick={() => handleUpdateCalendarSync({ inAppRsvpOnly: !inAppRsvpOnly })}
                title="Only show events you have RSVP'd to on the calendar"
                className={`inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-xl text-xs font-semibold cursor-pointer border transition-colors ${
                  inAppRsvpOnly
                    ? 'bg-[var(--green-light)] text-[var(--green-ink)] border-[var(--green)]/35'
                    : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
                }`}
              >
                <Check size={13} className={inAppRsvpOnly ? 'opacity-100' : 'opacity-55'} />
                <span>RSVP&apos;d Only ({rsvpGoingCountInScope})</span>
              </button>
            )}
          </div>

          {/* Google Calendar, Apple Calendar, Sync Settings & Add Event Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {calendarIntegration && (
              <>
                <button
                  type="button"
                  onClick={() => calendarIntegration.onQuickGoogleClick()}
                  className="inline-flex items-center gap-2 px-3.5 min-h-[38px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text)] border border-[var(--border)] hover:border-[var(--blue)] cursor-pointer transition-colors"
                >
                  <GoogleCalendarLogo size={15} />
                  <span>Google Calendar</span>
                  {calendarIntegration.googleLiveMeta?.connected && (
                    <span className="w-2 h-2 rounded-full bg-[var(--green)]" title="Live Auto-Sync Connected" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => calendarIntegration.onSubscribeApple()}
                  className="inline-flex items-center gap-2 px-3.5 min-h-[38px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text)] border border-[var(--border)] hover:border-[var(--border-strong)] cursor-pointer transition-colors"
                >
                  <AppleCalendarLogo size={14} />
                  <span>Apple Calendar</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowSyncModal(true)}
                  title="Configure how Google & Apple Calendar integration works"
                  className={`inline-flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                    calSyncSettings.rsvpOnly
                      ? 'bg-[var(--blue-light)] text-[var(--blue-ink)] border-[var(--blue)]/35'
                      : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text)] border-[var(--border)]'
                  }`}
                >
                  <SlidersHorizontal size={14} />
                  <span>Sync Settings</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-[var(--bg-card)] text-[10.5px] font-mono-num text-[var(--text)] border border-[var(--border-subtle)]">
                    {calendarIntegration.syncedEvents.length}
                  </span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setShowAddForm(prev => !prev)}
              className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[38px] rounded-xl bg-[var(--blue)] text-white text-xs sm:text-sm font-semibold border-none cursor-pointer hover:opacity-90 transition-opacity"
            >
              {showAddForm ? <X size={15} /> : <Plus size={15} />}
              <span>{showAddForm ? 'Cancel' : 'Add Event'}</span>
            </button>
          </div>
        </div>

        {/* Agenda Sub-Filters (Shown only in Agenda View) */}
        {viewMode === 'agenda' && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {[
              { id: 'upcoming', label: `Upcoming (${agendaCounts.upcoming})` },
              { id: 'past', label: `Past Events (${agendaCounts.past})` },
              { id: 'all', label: `All (${agendaCounts.all})` },
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setAgendaFilter(f.id)}
                className={`px-3 min-h-[32px] rounded-full text-xs font-semibold cursor-pointer border transition-colors ${
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

      {/* Period Navigation Bar (Shown in Full Calendar Month & Week views — navigate past & future dates) */}
      {viewMode !== 'agenda' && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex flex-wrap items-center gap-2">
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
              className="px-3.5 h-9 rounded-xl bg-[var(--bg-surface)] text-[var(--text)] border border-[var(--border)] text-xs font-semibold cursor-pointer hover:border-[var(--blue)]"
            >
              Today
            </button>
            <button
              type="button"
              onClick={handleNext}
              aria-label="Next period"
              className="w-9 h-9 rounded-xl bg-[var(--bg-surface)] text-[var(--text)] border border-[var(--border)] flex items-center justify-center cursor-pointer hover:border-[var(--blue)]"
            >
              <ChevronRight size={16} />
            </button>

            {viewMode === 'month' && (
              <input
                type="month"
                value={monthInputValue}
                onChange={handleMonthPickerChange}
                aria-label="Jump to month"
                className="h-9 px-2.5 rounded-xl bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)] cursor-pointer"
              />
            )}
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="text-sm sm:text-base font-bold text-[var(--text)]">
              {periodLabel}
            </div>
            {viewMode === 'month' && (
              <span className="text-xs text-[var(--text-muted)]">
                {viewedMonthStats.total} {viewedMonthStats.total === 1 ? 'event' : 'events'} ({viewedMonthStats.pastCount} past · {viewedMonthStats.upcomingCount} upcoming)
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── VIEW 1: AGENDA LIST ── */}
      {viewMode === 'agenda' && (
        <div className="flex flex-col gap-3">
          {filtered.length > 0 ? (
            filtered.map((item, idx) => renderEventRow(item, idx === filtered.length - 1))
          ) : (
            <div className="py-10 text-center space-y-2.5">
              <CalendarIcon size={28} className="mx-auto text-[var(--text-light)] mb-2" />
              <div className="text-sm font-semibold text-[var(--text)]">No events to display</div>
              <p className="text-xs text-[var(--text-muted)]">
                {inAppRsvpOnly
                  ? 'No RSVP\'d events match this view yet.'
                  : 'Try clearing your search or adding a new event.'}
              </p>
              {inAppRsvpOnly && onUpdateSettings && (
                <button
                  type="button"
                  onClick={() => handleUpdateCalendarSync({ inAppRsvpOnly: false })}
                  className="px-3.5 min-h-[32px] rounded-full bg-[var(--bg-surface)] text-xs font-semibold text-[var(--blue-ink)] border border-[var(--border)] cursor-pointer hover:border-[var(--blue)]"
                >
                  Show all events
                </button>
              )}
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
                          style={{
                            borderLeftWidth: '3px',
                            borderLeftColor: `var(--${c})`,
                          }}
                          className="content-tile p-2 rounded-lg flex flex-col gap-1 min-w-0"
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

      {/* ── VIEW 3: FULL CALENDAR MONTH VIEW (Past & Upcoming Events + Day Breakdown) ── */}
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
                const isToday = cell.dateStr === todayYmd
                const isPastDay = cell.dateStr < todayYmd

                return (
                  <button
                    key={cell.dateStr}
                    type="button"
                    onClick={() => setSelectedDate(cell.dateStr)}
                    className={`min-h-[48px] sm:min-h-[108px] p-1.5 sm:p-2 rounded-xl border text-left flex flex-col justify-between cursor-pointer transition-all min-w-0 ${
                      isSelected
                        ? 'bg-[var(--blue-light)] border-[var(--blue)] ring-1 ring-[var(--blue)]/30'
                        : isToday
                          ? 'bg-[var(--bg-surface)] border-[var(--blue)]/65'
                          : cell.inMonth
                            ? isPastDay
                              ? 'bg-[var(--bg-surface)]/75 border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                              : 'bg-[var(--bg-surface)] border-[var(--border)] hover:border-[var(--border-strong)]'
                            : 'bg-[var(--bg-surface)]/35 opacity-45 border-[var(--border-subtle)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 w-full">
                      <div className="flex items-center gap-1">
                        <span
                          className={`text-xs font-bold font-mono-num ${
                            isSelected || isToday
                              ? 'text-[var(--blue-ink)]'
                              : isPastDay
                                ? 'text-[var(--text-muted)]'
                                : 'text-[var(--text)]'
                          }`}
                        >
                          {cell.dayNum}
                        </span>
                        {isToday && (
                          <span className="hidden md:inline-block px-1.5 py-0.2 rounded-full bg-[var(--blue)] text-white text-[9px] font-bold">
                            Today
                          </span>
                        )}
                      </div>

                      {/* Mobile dot indicator */}
                      {dayEvs.length > 0 && (
                        <span
                          className={`sm:hidden w-2 h-2 rounded-full shrink-0 ${
                            isPastDay ? 'bg-[var(--text-light)]' : 'bg-[var(--blue)]'
                          }`}
                        />
                      )}
                      {dayEvs.length > 0 && (
                        <span className="hidden sm:inline-block text-[10px] font-mono-num font-semibold text-[var(--text-muted)]">
                          {dayEvs.length}
                        </span>
                      )}
                    </div>

                    {/* Desktop event pills (Past & Upcoming) */}
                    <div className="hidden sm:flex flex-col gap-1 w-full mt-1.5 min-w-0">
                      {dayEvs.slice(0, 3).map(ev => {
                        const pillColor = ev.color === 'muted' || !ev.color ? 'blue' : ev.color
                        return (
                          <div
                            key={ev.id}
                            style={
                              ev.isPast
                                ? undefined
                                : {
                                    borderLeftWidth: '2.5px',
                                    borderLeftColor: `var(--${pillColor})`,
                                  }
                            }
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold truncate border ${
                              ev.isPast
                                ? 'bg-[var(--bg-card)]/75 border-[var(--border-subtle)] text-[var(--text-muted)]'
                                : 'bg-[var(--bg-tile)] border-[var(--border-tile)] text-[var(--text)] shadow-2xs'
                            }`}
                            title={`${cleanText(ev.club)}: ${cleanText(ev.event)}`}
                          >
                            {cleanText(ev.club ? `${ev.club} · ${ev.event}` : ev.event)}
                          </div>
                        )
                      })}
                      {dayEvs.length > 3 && (
                        <span className="text-[10px] font-medium text-[var(--blue-ink)] pl-0.5">
                          +{dayEvs.length - 3} more
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Selected Day Event Details (works for any Past, Today, or Future day) */}
          <div className="pt-4 border-t border-[var(--border)]">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-[var(--text)]">
                  {selectedDateLabel}
                </span>
                <BubbleTag
                  label={
                    selectedDate === todayYmd
                      ? 'Today'
                      : selectedDate < todayYmd
                        ? 'Past Date'
                        : 'Upcoming'
                  }
                  color={
                    selectedDate === todayYmd
                      ? 'green'
                      : selectedDate < todayYmd
                        ? 'purple'
                        : 'blue'
                  }
                  size="sm"
                />
                <span className="text-xs text-[var(--text-muted)]">
                  · {selectedDayEvents.length} {selectedDayEvents.length === 1 ? 'event' : 'events'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEventDate(selectedDate)
                  setShowAddForm(true)
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer"
              >
                <Plus size={13} />
                <span>Add event on this date</span>
              </button>
            </div>

            {selectedDayEvents.length > 0 ? (
              <div className="flex flex-col gap-3">
                {selectedDayEvents.map((ev, idx) =>
                  renderEventRow(ev, idx === selectedDayEvents.length - 1)
                )}
              </div>
            ) : (
              <div className="text-xs text-[var(--text-muted)] py-4 px-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
                <span>
                  {inAppRsvpOnly
                    ? `No RSVP'd events on ${selectedDateLabel}. Toggle off "RSVP'd Only" to browse all club meetings and mark Going.`
                    : `No events recorded for ${selectedDateLabel}. Select another date on the calendar or switch to All Campus to explore past and upcoming club events.`}
                </span>
                {inAppRsvpOnly && onUpdateSettings && (
                  <button
                    type="button"
                    onClick={() => handleUpdateCalendarSync({ inAppRsvpOnly: false })}
                    className="px-3 min-h-[30px] rounded-full bg-[var(--bg-card)] text-xs font-semibold text-[var(--blue-ink)] border border-[var(--border)] cursor-pointer hover:border-[var(--blue)] shrink-0"
                  >
                    Show all events
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {renderSyncModal}
    </Card>
  )
}
