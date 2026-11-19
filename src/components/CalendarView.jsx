import Select from './Select'
import SearchDestination from './SearchDestination'
import { useState, useMemo, useEffect, useId, useRef } from 'react'
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
import { Card, BubbleTag, IconBadge, Button, IconButton, SearchBox, SegmentedControl, cleanText } from './ui'
import { ScheduleEventIcon } from './icons'
import CalendarSyncModal from './CalendarSyncModal'
import {
  buildGoogleCalendarTemplateUrl,
  normalizeCalendarSyncSettings,
  normalizeClubKey,
  resolveSchedulePostLink,
} from '../utils/calendarSync'
import { matchesSearchQuery, parseSearchQuery } from '../utils/search'

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
  joinedCount = null,
  position = null,
  visible = true,
  userSettings = {},
  onUpdateSettings,
  calendarIntegration = null,
  onPageContextChange,
  searchQuery = '',
  onSearchChange,
  searchTarget,
  onDismissSearchTarget,
  compact = false,
  onOpenCalendar,
  onBrowseClubs,
  onAddEvent,
  onDeleteEvent,
  rsvpMap = {},
  onToggleRsvp,
  onNotify,
}) {
  const eventFieldId = useId()
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

  const memberClubs = useMemo(
    () => clubs.filter(c => Boolean(c.joined)),
    [clubs]
  )

  const joinedClubKeySet = useMemo(
    () => new Set(memberClubs.map(c => normalizeClubKey(c.id)).filter(Boolean)),
    [memberClubs]
  )

  const hasJoinedClubs =
    joinedCount !== null ? joinedCount > 0 : joinedClubKeySet.size > 0
  const handleBrowseClubs = onBrowseClubs || calendarIntegration?.onBrowseClubs

  const preferredView = useRef(null)
  const [fallbackView] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches ? 'agenda' : 'month'
  )
  const defaultView = userSettings?.defaultCalendarView || fallbackView
  const [viewMode, setViewMode] = useState(position?.view || defaultView)
  const previousDefaultView = useRef(defaultView)
  const appliedPosition = useRef(null)

  useEffect(() => {
    if (previousDefaultView.current === defaultView) return
    previousDefaultView.current = defaultView
    preferredView.current = null
    setViewMode(defaultView)
  }, [defaultView])

  function selectView(view) {
    preferredView.current = view
    setViewMode(view)
  }
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

  useEffect(() => {
    if (!position || appliedPosition.current === position) return
    appliedPosition.current = position
    if (position.view) setViewMode(position.view)
    else if (position.usePreference) setViewMode(preferredView.current || defaultView)
    const requestedDate = position.date
    if (!requestedDate) return
    const date = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? parseYmdLocal(requestedDate) : new Date(requestedDate)
    if (Number.isNaN(date.getTime())) return
    const ymd = toLocalYmd(date)
    setSelectedDate(ymd)
    setWeekAnchor(ymd)
    setMonthState({ year: date.getFullYear(), month: date.getMonth() })
  }, [position, defaultView])

  // Add Event & Calendar Sync Settings modal state
  const [showAddForm, setShowAddForm] = useState(false)
  const [savingEvent, setSavingEvent] = useState(false)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [eventTitle, setEventTitle] = useState('')
  const [eventClubId, setEventClubId] = useState(
    () => memberClubs[0]?.id || ''
  )
  const [eventDate, setEventDate] = useState(todayYmd)
  const [eventTime, setEventTime] = useState('17:00')
  const [eventLocation, setEventLocation] = useState('')

  useEffect(() => {
    const fallbackId = memberClubs[0]?.id || ''
    if (!memberClubs.some(c => String(c.id) === String(eventClubId))) {
      setEventClubId(fallbackId ? String(fallbackId) : '')
    }
  }, [memberClubs, eventClubId])

  const linkedBooking = searchTarget?.bookedEvent
  const baseEvents = useMemo(() => {
    const scoped = hasJoinedClubs && Array.isArray(items) ? items : []
    if (linkedBooking && !scoped.some(event => event.id === linkedBooking.id)) return [...scoped, linkedBooking]
    return scoped
  }, [hasJoinedClubs, items, linkedBooking])

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

  // Events after applying joined-club membership + search
  const clubAndSearchEvents = useMemo(() => {
    return enrichedEvents.filter(ev => {
      if (linkedBooking?.id === ev.id) return true
      if (!hasJoinedClubs || joinedClubKeySet.size === 0) return false
      const cid = normalizeClubKey(ev.clubId)
      if (ev.isCustom || ev.isBookedCollab) {
        if (cid && !joinedClubKeySet.has(cid)) return false
      } else if (!cid || !joinedClubKeySet.has(cid)) {
        return false
      }
      if (!searchQuery.trim()) return true
      const parsedQ = parseSearchQuery(searchQuery)
      return matchesSearchQuery(parsedQ, {
        primary: [ev.event, ev.title],
        secondary: [ev.club, ev.location, ev.day, ev.date, ev.time, ev.isGoing ? 'going rsvp' : ''],
        tertiary: [ev.description, ev.notes, ev.source],
      })
    })
  }, [enrichedEvents, hasJoinedClubs, joinedClubKeySet, searchQuery, linkedBooking])

  const rsvpGoingCountInScope = useMemo(
    () => clubAndSearchEvents.filter(ev => ev.isGoing).length,
    [clubAndSearchEvents]
  )

  // Events after applying optional in-app "Only show RSVP'd events" setting
  const scopedEvents = useMemo(() => {
    if (!inAppRsvpOnly) return clubAndSearchEvents
    return clubAndSearchEvents.filter(ev => ev.isGoing || linkedBooking?.id === ev.id)
  }, [clubAndSearchEvents, inAppRsvpOnly, linkedBooking])

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
    if (savingEvent || !onAddEvent || !eventTitle.trim() || !eventDate || !eventClubId) return

    const [hh, mm] = (eventTime || '17:00').split(':').map(Number)
    const [yy, mo, dd] = eventDate.split('-').map(Number)
    const startDt = new Date(yy, (mo || 1) - 1, dd || 1, hh, mm, 0)
    const endDt = new Date(startDt.getTime() + 60 * 60 * 1000)

    const clubObj = memberClubs.find(c => String(c.id) === String(eventClubId))
    if (!clubObj) return
    const clubLabel = cleanText(clubObj.name)

    setSavingEvent(true)
    try {
      await onAddEvent({
        clubId: String(clubObj.id),
        clubName: clubLabel,
        title: eventTitle.trim(),
        start: startDt.toISOString(),
        end: endDt.toISOString(),
        location: eventLocation.trim() || clubObj?.room || 'TBD',
      })
    } catch {
      onNotify?.('Could not save the event. Please try again.', { type: 'error' })
      return
    } finally {
      setSavingEvent(false)
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
    const canRemove = Boolean(item.isBookedCollab || item.isCustom) && Boolean(onDeleteEvent) &&
      (linkedBooking?.id !== item.id || items.some(event => event.id === item.id))
    const postLink = resolveSchedulePostLink(item)

    return (
      <div key={item.id} className={`flex items-stretch ${isCompactDensity ? 'gap-2.5' : 'gap-3'}`}>
        <div className="hidden xs:flex flex-col items-center pt-1">
          <IconBadge color={c} size={isCompactDensity ? 30 : 36} radius={9999}>
            <ScheduleEventIcon club={clubName} event={title} size={isCompactDensity ? 14 : 16} />
          </IconBadge>
          {!isLast && (
            <div className="w-[1.5px] flex-1 my-1 rounded-full bg-[var(--border)]" />
          )}
        </div>

        <div
          className={`content-tile flex-1 min-w-0 rounded-[var(--radius-sm)] px-2.5 py-2 sm:px-3`}
        >
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1.5">
            <div className="min-w-0">
              {clubName && (
                <div className="text-xs font-semibold text-[var(--blue-ink)] mb-0.5 break-words">
                  {clubName}
                </div>
              )}
              <div
                className={`font-semibold ${
                  isCompactDensity ? 'text-[13px]' : 'text-sm'
                } text-[var(--text)] leading-snug`}
              >
                {postLink ? (
                  <a
                    href={postLink.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={postLink.tooltip}
                    className="text-inherit hover:text-[var(--blue-ink)] hover:underline no-underline transition-colors"
                  >
                    {title}
                  </a>
                ) : (
                  title
                )}
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
              isCompactDensity ? 'mt-1 pt-1' : 'mt-1.5 pt-1.5'
            } border-t border-[var(--border-subtle)]`}
          >
            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)] min-w-0">
              <span className="inline-flex items-center gap-1 min-w-0">
                <MapPin size={12} className="text-[var(--text-light)] shrink-0" />
                <span className="break-words">{cleanText(item.location || 'Campus / See post')}</span>
              </span>
              {item.duration && (
                <span className="inline-flex items-center gap-1 shrink-0">
                  <Clock size={12} className="text-[var(--text-light)] shrink-0" />
                  <span>{cleanText(item.duration)}</span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {postLink && (
                <a
                  href={postLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={postLink.tooltip}
                  aria-label={`${postLink.label} for ${title}`}
                  className={`ui-touch inline-flex items-center gap-1.5 ${
                    isCompactDensity ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-xs'
                  } rounded-full bg-transparent text-[var(--blue)] border border-[var(--md-outline)] hover:border-[var(--blue)] font-medium no-underline transition-colors`}
                >
                  <span>{postLink.label}</span>
                  <ExternalLink size={11} />
                </a>
              )}

              {!compact && (
                <a
                  href={buildGoogleCalendarTemplateUrl(item, {
                    titlePrefixClub: calSyncSettings.titlePrefixClub,
                  })}
                  target="_blank"
                  rel="noreferrer"
                  title="Add this event to Google Calendar"
                  aria-label="Add this event to Google Calendar"
                  className={`ui-touch inline-flex items-center justify-center ${
                    isCompactDensity ? 'w-7 h-7' : 'w-8 h-8'
                  } rounded-full bg-transparent text-[var(--text-muted)] hover:text-[var(--blue)] border border-[var(--md-outline-variant)] hover:border-[var(--blue)] no-underline transition-colors`}
                >
                  <CalendarPlus size={13} />
                </a>
              )}

              {onToggleRsvp && (
                <Button
                  size={isCompactDensity ? 'sm' : 'sm'}
                  variant={item.isGoing ? 'tonal' : 'outlined'}
                  icon={item.isGoing ? <Check size={13} /> : undefined}
                  onClick={() => onToggleRsvp(item.id, !item.isGoing)}
                >
                  {item.isGoing ? 'Going' : 'RSVP'}
                </Button>
              )}

              {canRemove && (
                <IconButton
                  size={isCompactDensity ? 'sm' : 'sm'}
                  variant="danger"
                  title="Remove event from calendar"
                  ariaLabel="Remove event from calendar"
                  onClick={() => onDeleteEvent(item.id)}
                >
                  <Trash2 size={14} />
                </IconButton>
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
      open={visible && showSyncModal}
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

  const syncButton = calendarIntegration && (
    <Button variant="outlined-neutral" size="sm" onClick={() => setShowSyncModal(true)}
      icon={<SlidersHorizontal size={14} />}>
      Calendar sync
    </Button>
  )
  const syncStatus = calendarIntegration?.googleLiveMeta?.connected && (
    <span className="text-xs text-[var(--green-ink)]">Google connected</span>
  )

  // ── 1. COMPACT OVERVIEW MODE ──────────────────────────────────────
  if (compact) {
    const preview = filtered.slice(0, isCompactDensity ? 6 : 4)
    return (
      <Card
        className="section-pad"
        delay={1}
      >
        <div>
          <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-medium font-display text-[var(--text)]">Upcoming Schedule</h2>
              <BubbleTag label={`${filtered.length}`} color="blue" size="sm" />
              {inAppRsvpOnly && (
                <BubbleTag label="RSVP'd Only" color="green" size="sm" dot />
              )}
            </div>

          {onOpenCalendar && (
              <Button
                variant="text"
                size="sm"
                trailingIcon={<ArrowRight size={13} />}
                onClick={onOpenCalendar}
              >
                View calendar
              </Button>
            )}
          </div>

          {preview.length > 0 ? (
            <div className={`flex flex-col ${isCompactDensity ? 'gap-2' : 'gap-3'}`}>
              {preview.map((item, idx) => renderEventRow(item, idx === preview.length - 1))}
            </div>
          ) : !hasJoinedClubs ? (
            <p className="text-sm text-[var(--text-muted)]">Events appear here after you join a club.</p>
          ) : (
            <div className="py-7 text-center text-sm text-[var(--text-muted)] space-y-2">
              <div>
                {inAppRsvpOnly
                  ? "No RSVP'd upcoming events yet."
                  : searchQuery.trim()
                    ? 'No matching events in your joined clubs.'
                    : 'No upcoming events scheduled across your joined clubs yet.'}
              </div>
              {inAppRsvpOnly && onUpdateSettings && (
                <Button
                  variant="outlined-neutral"
                  size="sm"
                  onClick={() => handleUpdateCalendarSync({ inAppRsvpOnly: false })}
                >
                  Show all upcoming events
                </Button>
              )}
            </div>
          )}
        </div>

        {calendarIntegration && (
          <div className="mt-2 pt-2 border-t border-[var(--border)] flex flex-wrap items-center justify-end gap-2">
            {syncStatus}
            {syncButton}
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

  const selectedSearchEvent = searchTarget?.type === 'event'
    ? enrichedEvents.find(event => String(event.id) === searchTarget.id) || searchTarget.publicEvent : null

  const calendarViews = [
    { value: 'month', label: 'Month' },
    { value: 'week', label: 'Week' },
    { value: 'agenda', label: 'Agenda' },
  ]

  return (
    <div className={`page-stack ${viewMode === 'week' ? 'calendar-week-page' : ''}`}>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {syncStatus}
        {syncButton}
        {hasJoinedClubs && onAddEvent && (
          <Button size="sm" icon={showAddForm ? <X size={15} /> : <Plus size={15} />}
            variant={showAddForm ? 'outlined-neutral' : 'filled'}
            reserveLabels={['Add event', 'Close event form']}
            aria-expanded={showAddForm} aria-controls="calendar-add-event"
            onClick={() => setShowAddForm(prev => !prev)}>
            {showAddForm ? 'Close event form' : 'Add event'}
          </Button>
        )}
      </div>

      {selectedSearchEvent && (
        <SearchDestination key={searchTarget.revision} heading={cleanText(selectedSearchEvent.event || selectedSearchEvent.title)} onDismiss={onDismissSearchTarget}>
          {renderEventRow(selectedSearchEvent, true)}
        </SearchDestination>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {onSearchChange && <div className="w-full sm:w-56 min-w-0">
          <SearchBox placeholder="Filter this calendar" value={searchQuery} onChange={onSearchChange} />
        </div>}
        <div className="flex flex-wrap items-center gap-2">
          <Select
            className="ui-touch sm:hidden control-select [--select-width:7rem]"
            value={viewMode}
            aria-label="Calendar view"
            onValueChange={selectView}
            options={calendarViews.map(view => ({ value: view.value, label: view.label }))}
          />
          <SegmentedControl className="!hidden sm:!inline-flex" size="sm" options={calendarViews}
            value={viewMode} onChange={selectView} ariaLabel="Calendar view" />
          {hasJoinedClubs && onUpdateSettings && (
            <Button size="sm" variant={inAppRsvpOnly ? 'tonal' : 'outlined-neutral'}
              aria-pressed={inAppRsvpOnly} icon={inAppRsvpOnly ? <Check size={13} /> : null}
              onClick={() => handleUpdateCalendarSync({ inAppRsvpOnly: !inAppRsvpOnly })}>
              RSVP&apos;d only ({rsvpGoingCountInScope})
            </Button>
          )}
          {viewMode === 'agenda' && (
            <Select
              className="ui-touch control-select [--select-width:10rem]"
              value={agendaFilter}
              aria-label="Agenda date range"
              onValueChange={setAgendaFilter}
              options={[
                { value: "upcoming", label: `Upcoming (${agendaCounts.upcoming})` },
                { value: "past", label: `Past (${agendaCounts.past})` },
                { value: "all", label: `All events (${agendaCounts.all})` },
              ]}
            />
          )}
        </div>
        {viewMode !== 'agenda' && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <div className="flex flex-wrap items-center gap-0.5">
            <IconButton
              size="sm"
              ariaLabel="Previous period"
              onClick={handlePrev}
            >
              <ChevronLeft size={16} />
            </IconButton>
            <button
              type="button"
              onClick={handleToday}
              className="ui-touch px-2 h-9 rounded-full bg-[var(--md-surface-container)] text-[var(--text)] border border-[var(--md-outline-variant)] text-xs font-medium cursor-pointer hover:border-[var(--blue)]"
            >
              Today
            </button>
            <IconButton
              size="sm"
              ariaLabel="Next period"
              onClick={handleNext}
            >
              <ChevronRight size={16} />
            </IconButton>

            {viewMode === 'month' && (
              <input
                type="month"
                value={monthInputValue}
                onChange={handleMonthPickerChange}
                aria-label="Jump to month"
                className="ui-touch calendar-month-picker h-9 px-1.5 rounded-lg bg-[var(--bg-surface)] text-base sm:text-xs font-medium text-[var(--text)] border border-[var(--md-outline-variant)] outline-none focus:border-[var(--blue)] cursor-pointer"
              />
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-display text-base font-medium text-[var(--text)]">
              {periodLabel}
            </div>
            {viewMode === 'month' && (
              <span className="hidden xl:inline text-xs text-[var(--text-muted)]">
                {viewedMonthStats.total} {viewedMonthStats.total === 1 ? 'event' : 'events'} ({viewedMonthStats.pastCount} past · {viewedMonthStats.upcomingCount} upcoming)
              </span>
            )}
          </div>
        </div>
        )}
      </div>

      {/* Notice when user is not in any clubs yet */}
      {!hasJoinedClubs && (
        <div className="mb-5 p-4 sm:p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium font-display text-[var(--text)]">Join a club to unlock your calendar</div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
              You aren&apos;t in any clubs yet, so there are no incoming club events on your schedule. Join one or more clubs to see their meetings and workshops here.
            </p>
          </div>
          {handleBrowseClubs && (
            <Button
              variant="tonal"
              size="md"
              trailingIcon={<ArrowRight size={14} />}
              onClick={handleBrowseClubs}
            >
              Browse clubs
            </Button>
          )}
        </div>
      )}

      {/* Add Event Form (Comfortable 44px fields, clear labels, no raw IDs) */}
      {showAddForm && hasJoinedClubs && onAddEvent && (
        <form
          id="calendar-add-event"
          onSubmit={handleSubmitNewEvent}
          className="mb-5 p-4 sm:p-5 rounded-2xl content-tile space-y-4 fade-in"
        >
          <div className="text-sm font-medium font-display text-[var(--text)]">Add Club Event</div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor={`${eventFieldId}-title`} className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Event Title
              </label>
              <input
                id={`${eventFieldId}-title`}
                type="text"
                required
                value={eventTitle}
                onChange={e => setEventTitle(e.target.value)}
                placeholder="e.g. Intro to Web Dev Workshop"
                className="calendar-event-field"
              />
            </div>

            <div>
              <label htmlFor={`${eventFieldId}-club`} className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Club
              </label>
              <Select
                id={`${eventFieldId}-club`}
                value={eventClubId}
                onValueChange={setEventClubId}
                className="calendar-event-field"
                fullWidth
                search
                options={memberClubs.map(c => ({ value: c.id, label: cleanText(c.name) }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor={`${eventFieldId}-date`} className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                  Date
                </label>
                <input
                  type="date"
                  id={`${eventFieldId}-date`}
                  required
                  value={eventDate}
                  onChange={e => setEventDate(e.target.value)}
                  className="calendar-event-field"
                />
              </div>

              <div>
                <label htmlFor={`${eventFieldId}-time`} className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                  Start Time
                </label>
                <input
                  type="time"
                  id={`${eventFieldId}-time`}
                  required
                  value={eventTime}
                  onChange={e => setEventTime(e.target.value)}
                  className="calendar-event-field"
                />
              </div>
            </div>

            <div>
              <label htmlFor={`${eventFieldId}-location`} className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Location
              </label>
              <input
                type="text"
                id={`${eventFieldId}-location`}
                value={eventLocation}
                onChange={e => setEventLocation(e.target.value)}
                placeholder="e.g. Baskin Engineering 152 or Zoom"
                className="calendar-event-field"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="text" onClick={() => setShowAddForm(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="filled" pending={savingEvent} pendingLabel="Saving…">
              Save event
            </Button>
          </div>
        </form>
      )}

      {/* ── VIEW 1: AGENDA LIST ── */}
      {viewMode === 'agenda' && (
        <div className="flex flex-col gap-3">
          {filtered.length > 0 ? (
            filtered.map((item, idx) => renderEventRow(item, idx === filtered.length - 1))
          ) : (
            <div className="py-10 text-center space-y-2.5">
              <CalendarIcon size={28} className="mx-auto text-[var(--text-light)] mb-2" />
              <div className="text-sm font-semibold text-[var(--text)]">
                {!hasJoinedClubs ? 'Join a club to see incoming events' : 'No events to display'}
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                {!hasJoinedClubs
                  ? 'Your calendar shows events exclusively from clubs you have joined.'
                  : inAppRsvpOnly
                    ? 'No RSVP\'d events match this view yet.'
                    : 'Try clearing your search or adding a new club event.'}
              </p>
              {!hasJoinedClubs && handleBrowseClubs ? (
                <Button
                  variant="tonal"
                  size="sm"
                  trailingIcon={<ArrowRight size={13} />}
                  onClick={handleBrowseClubs}
                >
                  Browse Clubs
                </Button>
              ) : (
                inAppRsvpOnly &&
                onUpdateSettings && (
                  <Button
                    variant="outlined-neutral"
                    size="sm"
                    onClick={() => handleUpdateCalendarSync({ inAppRsvpOnly: false })}
                  >
                    Show all events
                  </Button>
                )
              )}
            </div>
          )}
        </div>
      )}

      {/* ── VIEW 2: WEEK VIEW (Mobile 7-day strip + cards; Desktop 7-col board) ── */}
      {viewMode === 'week' && (
        <div className="calendar-week-view">
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
                  aria-pressed={isSelected}
                  className={`py-2 px-1 rounded-xl border flex flex-col items-center gap-1 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[var(--accent-surface)] text-[var(--accent-ink)] border-[var(--accent-line)]'
                      : 'bg-[var(--bg-surface)] text-[var(--text)] border-[var(--border)]'
                  }`}
                >
                  <span className={`text-[10px] font-semibold ${isSelected ? 'text-[var(--accent-ink)]' : 'text-[var(--text-muted)]'}`}>
                    {dayLetter}
                  </span>
                  <span className="text-sm font-bold font-mono-num">{dayNum}</span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      count > 0
                        ? isSelected
                          ? 'bg-[var(--accent-ink)]'
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
              <span className="text-xs font-medium text-[var(--text-muted)]">
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
                  {hasJoinedClubs
                    ? `No events scheduled for ${selectedDateLabel}.`
                    : 'Join a club to see scheduled meetings and workshops here.'}
                </p>
                {hasJoinedClubs ? (
                  <Button
                    variant="outlined-neutral"
                    size="sm"
                    leadingIcon={<Plus size={13} />}
                    onClick={() => {
                      setEventDate(selectedDate)
                      setShowAddForm(true)
                    }}
                  >
                    Add event on this day
                  </Button>
                ) : (
                  handleBrowseClubs && (
                    <Button
                      variant="tonal"
                      size="sm"
                      trailingIcon={<ArrowRight size={13} />}
                      onClick={handleBrowseClubs}
                    >
                      Browse Clubs
                    </Button>
                  )
                )}
              </div>
            )}
          </div>

          {/* Desktop 7-Column Week Board (md+) */}
          <div className="calendar-week-grid hidden md:grid grid-cols-7 gap-2">
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
                      const weekPostLink = resolveSchedulePostLink(ev)
                      return (
                        <div
                          key={ev.id}
                          className="content-tile p-2 rounded-lg flex flex-col gap-1 min-w-0"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: `var(--${c})` }} />
                            <span className="text-[11px] font-medium text-[var(--text)] leading-snug line-clamp-2">
                              {weekPostLink ? (
                                <a
                                  href={weekPostLink.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={weekPostLink.tooltip}
                                  className="text-inherit hover:text-[var(--blue-ink)] hover:underline no-underline"
                                >
                                  {cleanText(ev.event)}
                                </a>
                              ) : (
                                cleanText(ev.event)
                              )}
                            </span>
                          </div>
                          <span className="text-[10px] text-[var(--text-muted)] truncate">
                            {cleanText(ev.club)}
                          </span>
                          <div className="flex flex-wrap items-center justify-between gap-1 mt-0.5">
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
                            />
                            {weekPostLink && (
                              <a
                                href={weekPostLink.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={weekPostLink.tooltip}
                                className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[var(--blue-ink)] hover:underline no-underline"
                              >
                                <span>Post</span>
                                <ExternalLink size={9.5} />
                              </a>
                            )}
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="text-xs text-[var(--text-muted)]">
                      No events
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
                    aria-pressed={isSelected}
                    aria-current={isToday ? 'date' : undefined}
                    className={`min-h-[48px] sm:min-h-[108px] p-1.5 sm:p-2 rounded-xl border text-left flex flex-col justify-between cursor-pointer transition-all min-w-0 ${
                      isSelected
                        ? 'bg-[var(--accent-surface)] border-[var(--accent-line)] ring-1 ring-[var(--accent-line)]'
                        : isToday
                          ? 'bg-[var(--bg-surface)] border-[var(--accent-line)]'
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
                          <span className="hidden md:inline-block px-1.5 py-0.5 rounded-full bg-[var(--secondary-container)] text-[var(--on-secondary-container)] text-[9px] font-medium">
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
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium truncate flex items-center gap-1 border ${
                              ev.isPast
                                ? 'bg-[var(--bg-card)]/75 border-[var(--border-subtle)] text-[var(--text-muted)]'
                                : 'bg-[var(--bg-tile)] border-[var(--border-tile)] text-[var(--text)] shadow-2xs'
                            }`}
                            title={`${cleanText(ev.club)}: ${cleanText(ev.event)}`}
                          >
                            {!ev.isPast && (
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: `var(--${pillColor})` }}
                              />
                            )}
                            <span className="truncate">{cleanText(ev.club ? `${ev.club} · ${ev.event}` : ev.event)}</span>
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
                <span className="text-xs font-medium text-[var(--text)]">
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

              {hasJoinedClubs && (
                <Button
                  variant="text"
                  size="sm"
                  leadingIcon={<Plus size={13} />}
                  onClick={() => {
                    setEventDate(selectedDate)
                    setShowAddForm(true)
                  }}
                >
                  Add event on this date
                </Button>
              )}
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
                  {!hasJoinedClubs
                    ? 'Join a club to see upcoming meetings, workshops, and club events on your calendar.'
                    : inAppRsvpOnly
                      ? `No RSVP'd events on ${selectedDateLabel}. Toggle off "RSVP'd Only" to browse all club meetings and mark Going.`
                      : `No club events scheduled across your joined clubs on ${selectedDateLabel}.`}
                </span>
                {hasJoinedClubs && inAppRsvpOnly && onUpdateSettings && (
                  <Button
                    variant="outlined-neutral"
                    size="sm"
                    onClick={() => handleUpdateCalendarSync({ inAppRsvpOnly: false })}
                  >
                    Show all events
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {renderSyncModal}
    </div>
  )
}
