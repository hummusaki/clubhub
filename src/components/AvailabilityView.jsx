import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Clock,
  Users,
  Check,
  Sparkles,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  CalendarPlus,
  ArrowRight,
  X,
} from 'lucide-react'
import { Card, BubbleTag, cleanText } from './ui'
import {
  getSchedulerPolls,
  createSchedulerPoll,
  saveSchedulerResponse,
  bookSchedulerSlot,
  unbookSchedulerSlot,
} from '../api/client'

const BASE_MONDAY = '2026-11-16'
const DEFAULT_TZ = 'America/Los_Angeles'

function parseDateParts(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number)
  return { y: y || 2026, m: m || 11, d: d || 16 }
}

function formatYmdUtc(dateObj) {
  const y = dateObj.getUTCFullYear()
  const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dateObj.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDaysToYmd(dateStr, daysDelta) {
  const { y, m, d } = parseDateParts(dateStr)
  const dt = new Date(Date.UTC(y, m - 1, d + daysDelta, 12, 0, 0))
  return formatYmdUtc(dt)
}

function getMondayOfDate(dateStr) {
  const { y, m, d } = parseDateParts(dateStr)
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const day = dt.getUTCDay()
  const diffToMon = day === 0 ? -6 : 1 - day
  dt.setUTCDate(dt.getUTCDate() + diffToMon)
  return formatYmdUtc(dt)
}

function getWeekDatesFromStart(mondayStr) {
  return Array.from({ length: 7 }, (_, i) => addDaysToYmd(mondayStr, i))
}

export function slotToUtcIso(dateStr, hour, minute, timeZone = DEFAULT_TZ) {
  try {
    const { y, m, d } = parseDateParts(dateStr)
    const approxUtc = new Date(Date.UTC(y, m - 1, d, hour, minute, 0, 0))
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(approxUtc)

    const map = {}
    for (const p of parts) map[p.type] = p.value
    const tzHour = Number(map.hour) === 24 ? 0 : Number(map.hour)
    const tzAsUtc = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      tzHour,
      Number(map.minute),
      0,
      0
    )
    const offsetMs = tzAsUtc - approxUtc.getTime()
    return new Date(approxUtc.getTime() - offsetMs).toISOString()
  } catch {
    const { y, m, d } = parseDateParts(dateStr)
    return new Date(Date.UTC(y, m - 1, d, hour + 8, minute, 0, 0)).toISOString()
  }
}

function makeRangeSlots(dateStr, startH, endH, tz = DEFAULT_TZ) {
  const out = []
  for (let mins = Math.round(startH * 60); mins < Math.round(endH * 60); mins += 30) {
    out.push(slotToUtcIso(dateStr, Math.floor(mins / 60), mins % 60, tz))
  }
  return out
}

function formatSlotLocal(isoStr, options = {}) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      ...options,
    }).format(new Date(isoStr))
  } catch {
    return isoStr
  }
}

function toUserId(name) {
  const slug = String(name || 'member')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `user_${slug || 'member'}`
}

const DEFAULT_DATES = getWeekDatesFromStart(BASE_MONDAY)

const FALLBACK_POLL = {
  id: 'collab_ucsc_hackathon_2026',
  title: 'Fall Hackathon & Showcase Planning',
  hostClubId: 'demo_ucsc_csclub',
  collaboratingClubs: [
    'Computer Science Club',
    'Debate Society',
    'Art Collective',
    'Robotics League',
  ],
  dates: DEFAULT_DATES,
  startHour: 9,
  endHour: 19,
  slotMinutes: 30,
  baseTimezone: DEFAULT_TZ,
  location: 'Baskin Engineering 152',
  responses: [
    {
      userId: 'alex_cs',
      userName: 'Alex Lee',
      clubName: 'CS Club',
      freeSlots: [
        ...makeRangeSlots(DEFAULT_DATES[0], 13, 17),
        ...makeRangeSlots(DEFAULT_DATES[2], 14, 18),
        ...makeRangeSlots(DEFAULT_DATES[4], 10, 15),
      ],
    },
    {
      userId: 'maya_debate',
      userName: 'Maya Rodriguez',
      clubName: 'Debate Society',
      freeSlots: [
        ...makeRangeSlots(DEFAULT_DATES[0], 14, 17),
        ...makeRangeSlots(DEFAULT_DATES[2], 14, 18),
        ...makeRangeSlots(DEFAULT_DATES[4], 11, 15),
      ],
    },
    {
      userId: 'chloe_art',
      userName: 'Chloe Lindqvist',
      clubName: 'Art Collective',
      freeSlots: [
        ...makeRangeSlots(DEFAULT_DATES[0], 14, 16.5),
        ...makeRangeSlots(DEFAULT_DATES[2], 14, 17),
        ...makeRangeSlots(DEFAULT_DATES[4], 11, 14),
      ],
    },
    {
      userId: 'raj_robotics',
      userName: 'Raj Nair',
      clubName: 'Robotics League',
      freeSlots: [
        ...makeRangeSlots(DEFAULT_DATES[0], 14, 17),
        ...makeRangeSlots(DEFAULT_DATES[2], 14, 17),
      ],
    },
  ],
}

export default function AvailabilityView({
  user = null,
  events = [],
  onEventBooked,
  onAddLocalEvent,
  onRemoveLocalEvent,
  onOpenCalendar,
}) {
  const defaultUserName =
    user?.fullName ||
    user?.primaryEmailAddress?.emailAddress?.split('@')[0] ||
    'Jane Doe'

  const [polls, setPolls] = useState([FALLBACK_POLL])
  const [selectedPollId, setSelectedPollId] = useState(FALLBACK_POLL.id)
  const [weekStartMonday, setWeekStartMonday] = useState(BASE_MONDAY)
  const [mobileDay, setMobileDay] = useState(BASE_MONDAY)

  // 'mine' = toggle my free times | 'group' = view group overlap heatmap
  const [gridMode, setGridMode] = useState('mine')

  // Active responder editing state
  const [activePersonName, setActivePersonName] = useState(defaultUserName)
  const [showAddPerson, setShowAddPerson] = useState(false)
  const [newPersonInput, setNewPersonInput] = useState('')
  const currentUserId = useMemo(() => toUserId(activePersonName), [activePersonName])

  // Personal free slots per userId in client session
  const [localSlotsByUser, setLocalSlotsByUser] = useState(() => ({
    [toUserId(defaultUserName)]: new Set([
      ...makeRangeSlots(DEFAULT_DATES[0], 14, 16.5),
      ...makeRangeSlots(DEFAULT_DATES[2], 14, 17),
    ]),
  }))

  const myFreeSlots = useMemo(
    () => localSlotsByUser[currentUserId] || new Set(),
    [localSlotsByUser, currentUserId]
  )

  const [isDragging, setIsDragging] = useState(false)
  const [dragAdding, setDragAdding] = useState(true)

  // Inspected slot & scheduling state
  const [selectedSlotIso, setSelectedSlotIso] = useState(null)
  const [durationMins, setDurationMins] = useState(60)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)

  // New Poll form state
  const [showNewPollForm, setShowNewPollForm] = useState(false)
  const [newPollTitle, setNewPollTitle] = useState('')
  const [newPollDate, setNewPollDate] = useState(BASE_MONDAY)
  const [newPollLocation, setNewPollLocation] = useState('')

  const activePoll = useMemo(
    () => polls.find(p => p.id === selectedPollId) || polls[0] || FALLBACK_POLL,
    [polls, selectedPollId]
  )

  const displayedWeekDates = useMemo(
    () => getWeekDatesFromStart(weekStartMonday),
    [weekStartMonday]
  )

  const loadPolls = useCallback(async () => {
    const data = await getSchedulerPolls()
    if (Array.isArray(data) && data.length > 0) {
      setPolls(data)
      setSelectedPollId(prev => (data.some(p => p.id === prev) ? prev : data[0].id))
    }
  }, [])

  useEffect(() => {
    loadPolls()
  }, [loadPolls])

  useEffect(() => {
    const stopDrag = () => setIsDragging(false)
    window.addEventListener('mouseup', stopDrag)
    return () => window.removeEventListener('mouseup', stopDrag)
  }, [])

  // Keep mobileDay within displayedWeekDates when switching weeks
  useEffect(() => {
    if (!displayedWeekDates.includes(mobileDay)) {
      setMobileDay(displayedWeekDates[0])
    }
  }, [displayedWeekDates, mobileDay])

  // Time rows (9:00 AM to 7:00 PM in 30-min increments)
  const timeRows = useMemo(() => {
    const startH = activePoll.startHour ?? 9
    const endH = Math.min(activePoll.endHour ?? 19, 20)
    const rows = []
    for (let mins = startH * 60; mins < endH * 60; mins += 30) {
      rows.push({ hour: Math.floor(mins / 60), minute: mins % 60 })
    }
    return rows
  }, [activePoll.startHour, activePoll.endHour])

  const gridSlots = useMemo(() => {
    const baseTz = activePoll.baseTimezone || DEFAULT_TZ
    const matrix = {}
    for (const d of displayedWeekDates) {
      matrix[d] = {}
      for (const r of timeRows) {
        matrix[d][`${r.hour}:${r.minute}`] = slotToUtcIso(d, r.hour, r.minute, baseTz)
      }
    }
    return matrix
  }, [displayedWeekDates, activePoll.baseTimezone, timeRows])

  // Merge poll responders + locally edited responders
  const allParticipants = useMemo(() => {
    const map = new Map()

    for (const r of activePoll.responses || []) {
      const cleanName = cleanText(r.userName || 'Member').replace(/\s*\([^)]*\)\s*$/, '')
      const uid = r.userId || toUserId(cleanName)
      const localOverride = localSlotsByUser[uid]
      map.set(uid, {
        userId: uid,
        userName: cleanName,
        freeSlots: localOverride ? Array.from(localOverride) : r.freeSlots || [],
      })
    }

    // Ensure active user is always included
    if (!map.has(currentUserId)) {
      map.set(currentUserId, {
        userId: currentUserId,
        userName: activePersonName,
        freeSlots: Array.from(myFreeSlots),
      })
    } else if (localSlotsByUser[currentUserId]) {
      const existing = map.get(currentUserId)
      map.set(currentUserId, {
        ...existing,
        freeSlots: Array.from(localSlotsByUser[currentUserId]),
      })
    }

    // Also include any other people added locally during this session
    for (const [uid, slotSet] of Object.entries(localSlotsByUser)) {
      if (!map.has(uid)) {
        map.set(uid, {
          userId: uid,
          userName: uid.replace(/^user_/, '').replace(/_/g, ' '),
          freeSlots: Array.from(slotSet),
        })
      }
    }

    return Array.from(map.values())
  }, [activePoll.responses, localSlotsByUser, currentUserId, activePersonName, myFreeSlots])

  // Scheduled events lookup so we only show "Cancel" on slots that are actually scheduled
  const scheduledEventsBySlot = useMemo(() => {
    const bySlot = {}
    const allEvs = [...(activePoll.calendarEvents || []), ...(Array.isArray(events) ? events : [])]
    const seen = new Set()

    for (const ev of allEvs) {
      const idStr = String(ev?.id || '')
      if (!ev?.start || seen.has(idStr) || !idStr.startsWith('collab_evt_')) continue
      seen.add(idStr)
      const sMs = new Date(ev.start).getTime()
      const eMs = ev.end ? new Date(ev.end).getTime() : sMs + 60 * 60 * 1000
      for (let t = sMs; t < eMs; t += 30 * 60 * 1000) {
        const iso = new Date(t).toISOString()
        bySlot[iso] = ev
      }
    }
    return bySlot
  }, [activePoll.calendarEvents, events])

  const slotStatsMap = useMemo(() => {
    const total = Math.max(1, allParticipants.length)
    const stats = {}
    for (const d of displayedWeekDates) {
      for (const r of timeRows) {
        const iso = gridSlots[d]?.[`${r.hour}:${r.minute}`]
        if (!iso) continue
        const availableUsers = allParticipants.filter(p => (p.freeSlots || []).includes(iso))
        stats[iso] = {
          iso,
          dateStr: d,
          availableUsers,
          availableCount: availableUsers.length,
          ratio: availableUsers.length / total,
          scheduledEvent: scheduledEventsBySlot[iso] || null,
        }
      }
    }
    return stats
  }, [displayedWeekDates, timeRows, gridSlots, allParticipants, scheduledEventsBySlot])

  const bestOverlaps = useMemo(() => {
    return Object.values(slotStatsMap)
      .filter(s => s.availableCount > 0)
      .sort((a, b) => b.availableCount - a.availableCount || a.iso.localeCompare(b.iso))
      .slice(0, 5)
  }, [slotStatsMap])

  const inspectedSlot = useMemo(() => {
    if (selectedSlotIso && slotStatsMap[selectedSlotIso]) {
      return slotStatsMap[selectedSlotIso]
    }
    return bestOverlaps[0] || null
  }, [selectedSlotIso, slotStatsMap, bestOverlaps])

  const weekLabel = useMemo(() => {
    const p1 = parseDateParts(displayedWeekDates[0])
    const p2 = parseDateParts(displayedWeekDates[6])
    const d1 = new Date(Date.UTC(p1.y, p1.m - 1, p1.d, 12, 0, 0))
    const d2 = new Date(Date.UTC(p2.y, p2.m - 1, p2.d, 12, 0, 0))
    const s1 = d1.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    const s2 = d2.toLocaleDateString('en-US', {
      month: p1.m === p2.m ? undefined : 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    })
    return `${s1} – ${s2}`
  }, [displayedWeekDates])

  function updatePersonSlot(iso, shouldAdd) {
    if (!iso) return
    setLocalSlotsByUser(prev => {
      const nextSet = new Set(prev[currentUserId] || [])
      if (shouldAdd) nextSet.add(iso)
      else nextSet.delete(iso)
      return { ...prev, [currentUserId]: nextSet }
    })
  }

  function handleCellMouseDown(iso) {
    setSelectedSlotIso(iso)
    if (gridMode !== 'mine') return
    const willAdd = !myFreeSlots.has(iso)
    setDragAdding(willAdd)
    setIsDragging(true)
    updatePersonSlot(iso, willAdd)
  }

  function handleCellMouseEnter(iso) {
    if (!isDragging || gridMode !== 'mine') return
    updatePersonSlot(iso, dragAdding)
  }

  function handleMobileSlotTap(iso) {
    setSelectedSlotIso(iso)
    if (gridMode === 'mine') {
      updatePersonSlot(iso, !myFreeSlots.has(iso))
    }
  }

  function handleSelectResponder(person) {
    setActivePersonName(person.userName)
    const uid = person.userId
    if (!localSlotsByUser[uid]) {
      setLocalSlotsByUser(prev => ({
        ...prev,
        [uid]: new Set(person.freeSlots || []),
      }))
    }
  }

  function handleAddResponderSubmit(e) {
    e.preventDefault()
    const trimmed = newPersonInput.trim()
    if (!trimmed) return
    const uid = toUserId(trimmed)
    setLocalSlotsByUser(prev => ({
      ...prev,
      [uid]: prev[uid] || new Set(),
    }))
    setActivePersonName(trimmed)
    setNewPersonInput('')
    setShowAddPerson(false)
    setGridMode('mine')
    setFeedback({ text: `Now editing ${trimmed}'s availability.` })
  }

  async function handleSaveAvailability() {
    setSaving(true)
    const freeArr = Array.from(myFreeSlots)
    const updated = await saveSchedulerResponse(activePoll.id, {
      userId: currentUserId,
      userName: activePersonName,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ,
      freeSlots: freeArr,
      busySlots: [],
    })
    setSaving(false)

    if (updated && updated.id) {
      setPolls(prev => prev.map(p => (p.id === updated.id ? updated : p)))
    } else {
      // Persist in local poll state when backend is offline
      setPolls(prev =>
        prev.map(p => {
          if (p.id !== activePoll.id) return p
          const others = (p.responses || []).filter(r => r.userId !== currentUserId)
          return {
            ...p,
            responses: [
              { userId: currentUserId, userName: activePersonName, freeSlots: freeArr },
              ...others,
            ],
          }
        })
      )
    }

    setFeedback({
      text: `Saved ${activePersonName}'s availability (${freeArr.length} slots).`,
    })
  }

  async function handleCreatePollSubmit(e) {
    e.preventDefault()
    if (!newPollTitle.trim()) return

    const monday = getMondayOfDate(newPollDate || BASE_MONDAY)
    const weekDates = getWeekDatesFromStart(monday)
    const payload = {
      title: newPollTitle.trim(),
      location: newPollLocation.trim() || 'TBD',
      dates: weekDates,
      baseTimezone: DEFAULT_TZ,
    }

    const created = await createSchedulerPoll(payload)
    const pollObj =
      created && created.id
        ? created
        : {
            id: `collab_${Date.now()}`,
            title: payload.title,
            location: payload.location,
            dates: weekDates,
            startHour: 9,
            endHour: 19,
            slotMinutes: 30,
            baseTimezone: DEFAULT_TZ,
            responses: [],
            calendarEvents: [],
          }

    setPolls(prev => [pollObj, ...prev])
    setSelectedPollId(pollObj.id)
    setWeekStartMonday(monday)
    setMobileDay(monday)
    setNewPollTitle('')
    setNewPollLocation('')
    setShowNewPollForm(false)
    setFeedback({ text: `Created availability poll "${pollObj.title}".` })
  }

  async function handleScheduleSlot(slotIso) {
    if (!slotIso) return
    setSaving(true)
    const endIso = new Date(new Date(slotIso).getTime() + durationMins * 60 * 1000).toISOString()
    const eventId = `collab_evt_${activePoll.id}_${new Date(slotIso).getTime()}`

    const res = await bookSchedulerSlot(activePoll.id, {
      start: slotIso,
      end: endIso,
      title: activePoll.title,
      clubId: activePoll.hostClubId || 'demo_ucsc_csclub',
      clubName: 'Group Poll',
      location: activePoll.location || 'TBD',
      userId: currentUserId,
      userName: activePersonName,
    })
    setSaving(false)

    if (res && res.booked && res.poll) {
      setPolls(prev => prev.map(p => (p.id === res.poll.id ? res.poll : p)))
      if (onEventBooked) await onEventBooked()
    } else {
      // Offline / static mode fallback: add directly to local poll & Calendar state!
      const localEv = {
        id: eventId,
        clubId: activePoll.hostClubId || 'demo_ucsc_csclub',
        clubName: 'Group Poll',
        title: activePoll.title,
        start: slotIso,
        end: endIso,
        location: activePoll.location || 'TBD',
      }
      setPolls(prev =>
        prev.map(p =>
          p.id === activePoll.id
            ? { ...p, calendarEvents: [...(p.calendarEvents || []), localEv] }
            : p
        )
      )
      if (onAddLocalEvent) {
        onAddLocalEvent(localEv)
      }
    }

    setFeedback({
      text: `Scheduled "${activePoll.title}" on Calendar for ${formatSlotLocal(slotIso, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })}.`,
      showCalendarLink: true,
    })
  }

  async function handleCancelScheduledSlot(slotIso, existingEvent) {
    setSaving(true)
    const eventId = existingEvent?.id
    const res = await unbookSchedulerSlot(activePoll.id, {
      eventId,
      start: slotIso,
      userId: currentUserId,
    })
    setSaving(false)

    if (res && res.poll) {
      setPolls(prev => prev.map(p => (p.id === res.poll.id ? res.poll : p)))
      if (onEventBooked) await onEventBooked()
    } else {
      setPolls(prev =>
        prev.map(p =>
          p.id === activePoll.id
            ? {
                ...p,
                calendarEvents: (p.calendarEvents || []).filter(
                  e => e.id !== eventId && e.start !== slotIso
                ),
              }
            : p
        )
      )
      if (onRemoveLocalEvent && eventId) {
        onRemoveLocalEvent(eventId)
      }
    }

    setFeedback({ text: 'Removed scheduled meeting from Calendar.' })
  }

  return (
    <div className="space-y-5">
      {/* ── Top Poll Selector & Actions Card ── */}
      <Card className="p-4 sm:p-6 select-none" delay={1}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5 pb-4 mb-4 border-b border-[var(--border)]">
          <div className="flex-1 min-w-0">
            <label className="block text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)] mb-1.5">
              Active Availability Poll
            </label>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
              <select
                value={selectedPollId}
                onChange={e => setSelectedPollId(e.target.value)}
                className="w-full sm:w-auto sm:min-w-[280px] max-w-full min-h-[44px] px-3.5 py-2 rounded-xl text-base sm:text-sm font-semibold bg-[var(--bg-surface)] text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              >
                {polls.map(p => (
                  <option key={p.id} value={p.id}>
                    {cleanText(p.title)}
                  </option>
                ))}
              </select>

              {activePoll.location && (
                <BubbleTag label={activePoll.location} color="teal" size="md" />
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowNewPollForm(prev => !prev)}
              className="inline-flex items-center gap-1.5 px-4 min-h-[42px] rounded-xl bg-[var(--bg-surface)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--blue)] text-xs sm:text-sm font-semibold cursor-pointer transition-colors"
            >
              {showNewPollForm ? <X size={15} /> : <Plus size={15} />}
              <span>{showNewPollForm ? 'Cancel' : 'New Poll'}</span>
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={handleSaveAvailability}
              className="inline-flex items-center gap-1.5 px-4 min-h-[42px] rounded-xl bg-[var(--blue)] text-white border-none text-xs sm:text-sm font-semibold cursor-pointer hover:opacity-90 transition-opacity"
            >
              <Check size={15} />
              <span>Save Availability</span>
            </button>
          </div>
        </div>

        {/* New Poll Form */}
        {showNewPollForm && (
          <form
            onSubmit={handleCreatePollSubmit}
            className="mb-4 p-4 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] space-y-3.5 fade-in"
          >
            <div className="text-sm font-bold text-[var(--text)]">Create Availability Poll</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                  Poll Title
                </label>
                <input
                  type="text"
                  required
                  value={newPollTitle}
                  onChange={e => setNewPollTitle(e.target.value)}
                  placeholder="e.g. Officer Weekly Sync"
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                  Week Of
                </label>
                <input
                  type="date"
                  value={newPollDate}
                  onChange={e => setNewPollDate(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                  Location (optional)
                </label>
                <input
                  type="text"
                  value={newPollLocation}
                  onChange={e => setNewPollLocation(e.target.value)}
                  placeholder="e.g. Baskin 152 or Zoom"
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="submit"
                className="px-5 min-h-[42px] rounded-xl bg-[var(--blue)] text-white border-none text-sm font-semibold cursor-pointer hover:opacity-90"
              >
                Create Poll
              </button>
            </div>
          </form>
        )}

        {/* Responders Bar */}
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--text-muted)] inline-flex items-center gap-1.5">
              <Users size={14} className="text-[var(--blue)]" />
              <span>Responders ({allParticipants.length}) — Select a name to edit their hours:</span>
            </span>

            <button
              type="button"
              onClick={() => setShowAddPerson(prev => !prev)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer"
            >
              <UserPlus size={13} />
              <span>{showAddPerson ? 'Cancel' : 'Add Responder'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {allParticipants.map(p => {
              const isCurrent = p.userId === currentUserId
              return (
                <button
                  key={p.userId}
                  type="button"
                  onClick={() => handleSelectResponder(p)}
                  className={`px-3 min-h-[34px] rounded-full text-xs font-semibold cursor-pointer border transition-all ${
                    isCurrent
                      ? 'bg-[var(--blue)] text-white border-[var(--blue)]'
                      : 'bg-[var(--bg-surface)] text-[var(--text)] border-[var(--border)] hover:border-[var(--blue)]'
                  }`}
                >
                  {p.userName} ({(p.freeSlots || []).length})
                </button>
              )
            })}
          </div>

          {showAddPerson && (
            <form
              onSubmit={handleAddResponderSubmit}
              className="flex flex-col sm:flex-row gap-2 pt-1 fade-in"
            >
              <input
                type="text"
                autoFocus
                required
                value={newPersonInput}
                onChange={e => setNewPersonInput(e.target.value)}
                placeholder="Enter responder's name"
                className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              />
              <button
                type="submit"
                className="px-4 min-h-[44px] rounded-xl bg-[var(--blue)] text-white border-none text-sm font-semibold cursor-pointer"
              >
                Switch to Responder
              </button>
            </form>
          )}
        </div>

        {/* Single Clean Feedback Toast */}
        {feedback && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-[var(--green-light)] border border-[var(--green)]/25 text-[var(--green-ink)] text-xs sm:text-sm font-medium flex flex-wrap items-center justify-between gap-2 fade-in">
            <div className="flex flex-wrap items-center gap-3">
              <span>{feedback.text}</span>
              {feedback.showCalendarLink && onOpenCalendar && (
                <button
                  type="button"
                  onClick={onOpenCalendar}
                  className="inline-flex items-center gap-1 font-bold underline bg-transparent border-none text-[var(--green-ink)] cursor-pointer"
                >
                  <span>View in Calendar</span>
                  <ArrowRight size={13} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              aria-label="Dismiss message"
              className="bg-transparent border-none text-[var(--green-ink)] cursor-pointer p-1"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </Card>

      {/* ── Main Availability Grid + Best Times Sidebar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.65fr_1fr] gap-5 items-start">
        {/* LEFT: Interactive Availability Grid */}
        <Card className="p-4 sm:p-6 select-none" delay={2}>
          {/* Grid Toolbar: Week Switcher + Mode Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setWeekStartMonday(prev => addDaysToYmd(prev, -7))}
                aria-label="Previous week"
                className="w-9 h-9 rounded-xl bg-[var(--bg-surface)] text-[var(--text)] border border-[var(--border)] flex items-center justify-center cursor-pointer hover:border-[var(--blue)]"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-bold text-[var(--text)] px-1">{weekLabel}</span>
              <button
                type="button"
                onClick={() => setWeekStartMonday(prev => addDaysToYmd(prev, 7))}
                aria-label="Next week"
                className="w-9 h-9 rounded-xl bg-[var(--bg-surface)] text-[var(--text)] border border-[var(--border)] flex items-center justify-center cursor-pointer hover:border-[var(--blue)]"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center bg-[var(--bg-subtle)] p-1 rounded-xl border border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setGridMode('mine')}
                  className={`px-3 min-h-[34px] rounded-lg text-xs font-semibold border-none cursor-pointer transition-all ${
                    gridMode === 'mine'
                      ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
                      : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  My Times ({myFreeSlots.size})
                </button>
                <button
                  type="button"
                  onClick={() => setGridMode('group')}
                  className={`px-3 min-h-[34px] rounded-lg text-xs font-semibold border-none cursor-pointer transition-all ${
                    gridMode === 'group'
                      ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
                      : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  Group Overlap
                </button>
              </div>

              {gridMode === 'mine' && myFreeSlots.size > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setLocalSlotsByUser(prev => ({ ...prev, [currentUserId]: new Set() }))
                  }
                  className="px-2.5 min-h-[34px] rounded-lg bg-transparent text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--red-ink)] border-none cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <p className="text-xs text-[var(--text-muted)] mb-3.5">
            {gridMode === 'mine'
              ? `Editing ${activePersonName}'s availability — tap or drag time slots when free.`
              : `Showing group overlap across ${allParticipants.length} responders — tap any slot to inspect.`}
          </p>

          {/* ── MOBILE LAYOUT (< md): Day Picker + Thumb-Friendly Time Buttons (ZERO Scrollbars!) ── */}
          <div className="md:hidden space-y-4">
            <div className="grid grid-cols-7 gap-1">
              {displayedWeekDates.map(ymd => {
                const { y, m, d } = parseDateParts(ymd)
                const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
                const dayNarrow = dt.toLocaleDateString('en-US', {
                  weekday: 'narrow',
                  timeZone: 'UTC',
                })
                const isSelected = mobileDay === ymd
                const hasAnyFree = timeRows.some(r => {
                  const iso = gridSlots[ymd]?.[`${r.hour}:${r.minute}`]
                  return gridMode === 'mine'
                    ? myFreeSlots.has(iso)
                    : (slotStatsMap[iso]?.availableCount || 0) > 0
                })

                return (
                  <button
                    key={ymd}
                    type="button"
                    onClick={() => setMobileDay(ymd)}
                    className={`py-2 px-1 rounded-xl border flex flex-col items-center gap-1 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[var(--blue)] text-white border-[var(--blue)]'
                        : 'bg-[var(--bg-surface)] text-[var(--text)] border-[var(--border)]'
                    }`}
                  >
                    <span
                      className={`text-[10px] font-semibold ${
                        isSelected ? 'text-white/85' : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {dayNarrow}
                    </span>
                    <span className="text-sm font-bold font-mono-num">{d}</span>
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        hasAnyFree
                          ? isSelected
                            ? 'bg-white'
                            : 'bg-[var(--green)]'
                          : 'bg-transparent'
                      }`}
                    />
                  </button>
                )
              })}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {timeRows.map(r => {
                const iso = gridSlots[mobileDay]?.[`${r.hour}:${r.minute}`]
                const isMine = myFreeSlots.has(iso)
                const stat = slotStatsMap[iso]
                const count = stat?.availableCount || 0
                const isInspected = inspectedSlot?.iso === iso

                let btnClass =
                  'bg-[var(--bg-surface)] text-[var(--text)] border-[var(--border)]'
                if (gridMode === 'mine' && isMine) {
                  btnClass = 'bg-[var(--green)] text-white border-[var(--green)]'
                } else if (gridMode === 'group' && count > 0) {
                  btnClass =
                    'bg-[var(--green-light)] text-[var(--green-ink)] border-[var(--green)]/40'
                }

                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => handleMobileSlotTap(iso)}
                    className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-between gap-1.5 cursor-pointer transition-all ${btnClass} ${
                      isInspected && gridMode === 'group' ? 'ring-2 ring-[var(--blue)]' : ''
                    }`}
                  >
                    <span className="font-mono-num">
                      {formatSlotLocal(iso, { hour: 'numeric', minute: '2-digit' })}
                    </span>
                    {gridMode === 'mine' ? (
                      isMine ? (
                        <Check size={14} className="shrink-0" />
                      ) : (
                        count > 0 && (
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {count} free
                          </span>
                        )
                      )
                    ) : (
                      <span className="text-[11px] font-bold">
                        {count}/{allParticipants.length}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── DESKTOP / TABLET LAYOUT (md+): Full 7-Day Fixed Table (Fits 100% Width, ZERO Scrollbars) ── */}
          <div className="hidden md:block">
            <table className="w-full table-fixed border-collapse text-xs">
              <thead>
                <tr>
                  <th className="w-16 pb-2 pr-2 text-left text-[11px] font-semibold text-[var(--text-muted)]">
                    Time
                  </th>
                  {displayedWeekDates.map(dateStr => {
                    const { y, m, d } = parseDateParts(dateStr)
                    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
                    const dayShort = dt.toLocaleDateString('en-US', {
                      weekday: 'short',
                      timeZone: 'UTC',
                    })
                    return (
                      <th
                        key={dateStr}
                        className="pb-2 px-0.5 text-center font-semibold text-[var(--text)]"
                      >
                        <div className="text-xs">{dayShort}</div>
                        <div className="text-[10.5px] font-normal text-[var(--text-muted)]">
                          {m}/{d}
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {timeRows.map(r => {
                  const sampleIso = gridSlots[displayedWeekDates[0]]?.[`${r.hour}:${r.minute}`]
                  const timeLabel = sampleIso
                    ? formatSlotLocal(sampleIso, { hour: 'numeric', minute: '2-digit' })
                    : `${r.hour}:00`

                  return (
                    <tr key={`${r.hour}:${r.minute}`}>
                      <td className="pr-2 py-0.5 text-[10.5px] text-[var(--text-muted)] font-mono-num whitespace-nowrap">
                        {r.minute === 0 ? timeLabel : ''}
                      </td>
                      {displayedWeekDates.map(dateStr => {
                        const iso = gridSlots[dateStr]?.[`${r.hour}:${r.minute}`]
                        const isMine = myFreeSlots.has(iso)
                        const stat = slotStatsMap[iso]
                        const count = stat?.availableCount || 0
                        const ratio = stat?.ratio || 0
                        const isSelected = inspectedSlot?.iso === iso

                        let bg = 'var(--bg-surface)'
                        let textColor = 'var(--text)'

                        if (gridMode === 'mine') {
                          if (isMine) {
                            bg = 'var(--green)'
                            textColor = '#ffffff'
                          } else if (count > 0) {
                            bg = 'var(--green-light)'
                            textColor = 'var(--green-ink)'
                          }
                        } else if (count > 0) {
                          const alpha = (0.22 + ratio * 0.72).toFixed(2)
                          bg = `rgba(34, 163, 82, ${alpha})`
                          textColor = ratio > 0.5 ? '#ffffff' : 'var(--text)'
                        }

                        return (
                          <td
                            key={iso}
                            onMouseDown={() => handleCellMouseDown(iso)}
                            onMouseEnter={() => handleCellMouseEnter(iso)}
                            onClick={() => setSelectedSlotIso(iso)}
                            className={`border border-[var(--border)] h-7 cursor-pointer text-center text-[10.5px] font-semibold transition-colors ${
                              isSelected ? 'ring-2 ring-[var(--blue)] relative z-10' : ''
                            }`}
                            style={{ background: bg, color: textColor }}
                          >
                            {gridMode === 'group' && count > 0 ? count : ''}
                            {gridMode === 'mine' && isMine ? '✓' : ''}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* RIGHT: Best Overlapping Times + Selected Slot Details */}
        <div className="space-y-4">
          {/* Selected Slot Inspector */}
          <Card className="p-4 sm:p-5" delay={3}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-[var(--blue)] shrink-0" />
                <h3 className="text-sm font-bold text-[var(--text)]">Selected Slot</h3>
              </div>

              {inspectedSlot && (
                <BubbleTag
                  label={`${inspectedSlot.availableCount} of ${allParticipants.length} Free`}
                  color="green"
                  size="sm"
                />
              )}
            </div>

            {inspectedSlot ? (
              <div className="space-y-3.5">
                <div className="text-sm font-semibold text-[var(--text)]">
                  {formatSlotLocal(inspectedSlot.iso, {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </div>

                <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)]">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1.5">
                    Available Responders
                  </div>
                  {inspectedSlot.availableUsers.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {inspectedSlot.availableUsers.map(u => (
                        <BubbleTag
                          key={u.userId}
                          label={u.userName}
                          color="green"
                          size="sm"
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-[var(--text-muted)]">
                      No one marked free for this slot yet.
                    </div>
                  )}
                </div>

                {/* Duration + Clean Single Action (Add to Calendar OR Cancel if already scheduled) */}
                <div className="pt-2 border-t border-[var(--border)] space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-[var(--text-muted)]">Duration</span>
                    <div className="flex items-center gap-1">
                      {[30, 60, 90, 120].map(mins => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => setDurationMins(mins)}
                          className={`px-2.5 min-h-[30px] rounded-lg text-xs font-semibold cursor-pointer border transition-colors ${
                            durationMins === mins
                              ? 'bg-[var(--blue)] text-white border-[var(--blue)]'
                              : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border)]'
                          }`}
                        >
                          {mins === 30 ? '30m' : `${mins / 60}h`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {inspectedSlot.scheduledEvent ? (
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[var(--blue-light)] border border-[var(--blue)]/30">
                      <span className="text-xs font-semibold text-[var(--blue-ink)]">
                        Scheduled on Calendar ✓
                      </span>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          handleCancelScheduledSlot(
                            inspectedSlot.iso,
                            inspectedSlot.scheduledEvent
                          )
                        }
                        className="inline-flex items-center gap-1 px-3 min-h-[34px] rounded-lg bg-[var(--red)] text-white text-xs font-semibold border-none cursor-pointer hover:opacity-90"
                      >
                        <Trash2 size={12} />
                        <span>Cancel</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleScheduleSlot(inspectedSlot.iso)}
                      className="w-full min-h-[42px] px-4 rounded-xl bg-[var(--blue)] text-white text-xs sm:text-sm font-semibold border-none cursor-pointer hover:opacity-90 flex items-center justify-center gap-2 transition-opacity"
                    >
                      <CalendarPlus size={15} />
                      <span>Schedule on Calendar ({durationMins}m)</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">
                Mark free times on the grid to see group overlap details.
              </p>
            )}
          </Card>

          {/* Best Overlapping Times Card */}
          <Card className="p-4 sm:p-5" delay={4}>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={15} className="text-[var(--yellow)] shrink-0" />
              <h3 className="text-sm font-bold text-[var(--text)]">Best Times to Meet</h3>
            </div>

            {bestOverlaps.length > 0 ? (
              <div className="flex flex-col gap-2">
                {bestOverlaps.map(slot => {
                  const isActive = inspectedSlot?.iso === slot.iso
                  return (
                    <button
                      key={slot.iso}
                      type="button"
                      onClick={() => setSelectedSlotIso(slot.iso)}
                      className={`w-full p-3 rounded-xl border text-left flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-[var(--blue-light)] border-[var(--blue)]'
                          : 'bg-[var(--bg-surface)] border-[var(--border)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[var(--text)]">
                          {formatSlotLocal(slot.iso, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                          {slot.availableUsers.map(u => u.userName).join(', ')}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {slot.scheduledEvent ? (
                          <BubbleTag label="Scheduled" color="blue" size="sm" />
                        ) : (
                          <BubbleTag
                            label={`${slot.availableCount}/${allParticipants.length}`}
                            color="green"
                            size="sm"
                          />
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-muted)] py-3">
                No overlapping times marked for this week yet.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
