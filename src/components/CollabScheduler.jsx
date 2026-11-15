import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Calendar as CalendarIcon,
  Clock,
  Globe,
  Users,
  Check,
  Sparkles,
  Plus,
  Trash2,
  Wand2,
  MapPin,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  UserPlus,
} from 'lucide-react'
import { Card, BubbleTag, cleanText } from './ui'
import {
  getSchedulerPolls,
  createSchedulerPoll,
  saveSchedulerResponse,
  bookSchedulerSlot,
  unbookSchedulerSlot,
} from '../api/client'

// ── Supported Timezones ─────────────────────────────────────────────
const TIMEZONES = [
  { id: 'America/Los_Angeles', label: 'Pacific Time (PT — Los Angeles / UCSC)' },
  { id: 'America/Denver',      label: 'Mountain Time (MT — Denver)' },
  { id: 'America/Chicago',     label: 'Central Time (CT — Chicago)' },
  { id: 'America/New_York',    label: 'Eastern Time (ET — New York)' },
  { id: 'Pacific/Honolulu',    label: 'Hawaii Time (HST — Honolulu)' },
  { id: 'UTC',                 label: 'UTC (Coordinated Universal Time)' },
  { id: 'Europe/London',       label: 'UK Time (GMT/BST — London)' },
  { id: 'Europe/Paris',        label: 'Central European (CET — Paris/Berlin)' },
  { id: 'Asia/Tokyo',          label: 'Japan Time (JST — Tokyo)' },
  { id: 'Asia/Kolkata',        label: 'India Time (IST — Kolkata)' },
  { id: 'Australia/Sydney',    label: 'Australia Eastern (AEST — Sydney)' },
]

const BASE_MONDAY = '2026-11-16'

// ── Date & Calendar Navigation Helpers ──────────────────────────────

function parseDateParts(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number)
  return { y, m, d }
}

function formatYmd(dateObj) {
  const y = dateObj.getUTCFullYear()
  const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dateObj.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDaysToYmd(dateStr, daysDelta) {
  const { y, m, d } = parseDateParts(dateStr)
  const dt = new Date(Date.UTC(y, m - 1, d + daysDelta, 12, 0, 0))
  return formatYmd(dt)
}

function getMondayOfDate(dateStr) {
  const { y, m, d } = parseDateParts(dateStr)
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const day = dt.getUTCDay() // 0 = Sun, 1 = Mon, ...
  const diffToMon = day === 0 ? -6 : 1 - day
  dt.setUTCDate(dt.getUTCDate() + diffToMon)
  return formatYmd(dt)
}

function getWeekDatesFromStart(mondayStr) {
  return Array.from({ length: 7 }, (_, i) => addDaysToYmd(mondayStr, i))
}

function getMonthGridCells(year, monthIndex) {
  // monthIndex: 0-11
  const firstDay = new Date(Date.UTC(year, monthIndex, 1, 12, 0, 0))
  const startDow = firstDay.getUTCDay() // 0 (Sun) .. 6 (Sat)
  const gridStart = new Date(Date.UTC(year, monthIndex, 1 - startDow, 12, 0, 0))

  const cells = []
  for (let i = 0; i < 42; i++) {
    const dt = new Date(Date.UTC(
      gridStart.getUTCFullYear(),
      gridStart.getUTCMonth(),
      gridStart.getUTCDate() + i,
      12,
      0,
      0
    ))
    cells.push({
      dateStr: formatYmd(dt),
      dayNumber: dt.getUTCDate(),
      inCurrentMonth: dt.getUTCMonth() === monthIndex,
    })
  }
  return cells
}

const DEFAULT_DATES = getWeekDatesFromStart(BASE_MONDAY)

// ── Timezone Conversion Utilities ───────────────────────────────────

export function slotToUtcIso(dateStr, hour, minute, timeZone = 'America/Los_Angeles') {
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

function makeRangeSlots(dateStr, startH, endH, tz = 'America/Los_Angeles') {
  const out = []
  for (let mins = Math.round(startH * 60); mins < Math.round(endH * 60); mins += 30) {
    out.push(slotToUtcIso(dateStr, Math.floor(mins / 60), mins % 60, tz))
  }
  return out
}

function formatSlotInTz(isoStr, timeZone, options = {}) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      ...options,
    }).format(new Date(isoStr))
  } catch {
    return isoStr
  }
}

function getTzShortName(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(new Date())
    return parts.find(p => p.type === 'timeZoneName')?.value || timeZone
  } catch {
    return timeZone
  }
}

function toUserId(name) {
  const slug = String(name || 'user')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `user_${slug || 'member'}`
}

/**
 * Client-side natural language availability parser for the currently viewed week dates.
 */
function parseTextAvailabilityClient(text = '', dates = DEFAULT_DATES, timeZone = 'America/Los_Angeles') {
  const freeSlots = new Set()
  const busySlots = new Set()
  if (!text.trim()) return { freeSlots: [], busySlots: [] }

  const dayToDate = {}
  for (const dateStr of dates) {
    const { y, m, d } = parseDateParts(dateStr)
    const wk = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
      .toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
      .toLowerCase()
      .slice(0, 3)
    dayToDate[wk] = dateStr
  }

  const segments = text.split(/[;\n]+/)
  for (const seg of segments) {
    let mode = 'free'
    if (
      /\b(busy|unavailable|class|conflict|cannot|can't)\b/i.test(seg) &&
      !/^\s*(free|available)/i.test(seg)
    ) {
      mode = 'busy'
    }

    const regex =
      /\b(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|\d{4}-\d{2}-\d{2})\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:[-–to]+)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi

    let match
    while ((match = regex.exec(seg)) !== null) {
      const [, dayToken, shRaw, smRaw, sMer, ehRaw, emRaw, eMer] = match
      const dateStr = dayToken.includes('-')
        ? dayToken
        : dayToDate[dayToken.toLowerCase().slice(0, 3)]
      if (!dateStr) continue

      const toHours = (hStr, mStr, mer, fallbackMer) => {
        let h = parseInt(hStr, 10)
        const m = mStr ? parseInt(mStr, 10) : 0
        const eff = (mer || fallbackMer || '').toLowerCase()
        if (eff === 'pm' && h < 12) h += 12
        if (eff === 'am' && h === 12) h = 0
        return h + m / 60
      }

      const sh = toHours(shRaw, smRaw, sMer, eMer)
      const eh = toHours(ehRaw, emRaw, eMer, sMer)
      if (eh > sh) {
        for (const s of makeRangeSlots(dateStr, sh, eh, timeZone)) {
          if (mode === 'busy') {
            busySlots.add(s)
            freeSlots.delete(s)
          } else {
            freeSlots.add(s)
            busySlots.delete(s)
          }
        }
      }
    }
  }

  return {
    freeSlots: Array.from(freeSlots),
    busySlots: Array.from(busySlots),
  }
}

// ── Fallback Default Poll ───────────────────────────────────────────
const FALLBACK_POLL = {
  id: 'collab_ucsc_hackathon_2026',
  title: 'Cross-Club Hackathon & Fall Showcase Planning',
  description:
    'Find a common meeting time for CS Club, Debate Society, Art Collective & Robotics League officers to coordinate Fall Collaborations.',
  hostClubId: 'demo_ucsc_csclub',
  collaboratingClubs: [
    'Computer Science Club',
    'Debate Society',
    'Art Collective',
    'Robotics League',
  ],
  dates: DEFAULT_DATES,
  startHour: 9,
  endHour: 20,
  slotMinutes: 30,
  baseTimezone: 'America/Los_Angeles',
  location: 'Baskin Engineering 152',
  responses: [
    {
      userId: 'alex_cs',
      userName: 'Alex Lee (CS President)',
      clubId: 'demo_ucsc_csclub',
      clubName: 'Computer Science Club',
      timezone: 'America/Los_Angeles',
      freeSlots: [
        ...makeRangeSlots(DEFAULT_DATES[0], 13, 17, 'America/Los_Angeles'),
        ...makeRangeSlots(DEFAULT_DATES[2], 14, 18, 'America/Los_Angeles'),
        ...makeRangeSlots(DEFAULT_DATES[4], 10, 15, 'America/Los_Angeles'),
      ],
      busySlots: [
        ...makeRangeSlots(DEFAULT_DATES[1], 18, 20, 'America/Los_Angeles'),
      ],
    },
    {
      userId: 'maya_debate',
      userName: 'Maya Rodriguez (Debate VP)',
      clubId: 'demo_ucsc_debate',
      clubName: 'Debate Society',
      timezone: 'America/New_York',
      freeSlots: [
        ...makeRangeSlots(DEFAULT_DATES[0], 17, 20, 'America/New_York'),
        ...makeRangeSlots(DEFAULT_DATES[2], 17, 21, 'America/New_York'),
        ...makeRangeSlots(DEFAULT_DATES[4], 14, 18, 'America/New_York'),
      ],
      busySlots: [
        ...makeRangeSlots(DEFAULT_DATES[3], 16.5, 18, 'America/Los_Angeles'),
      ],
    },
    {
      userId: 'chloe_art',
      userName: 'Chloe Lindqvist (Art Collective)',
      clubId: 'demo_ucsc_artcollective',
      clubName: 'Art Collective',
      timezone: 'America/Los_Angeles',
      freeSlots: [
        ...makeRangeSlots(DEFAULT_DATES[0], 14, 16.5, 'America/Los_Angeles'),
        ...makeRangeSlots(DEFAULT_DATES[2], 14, 17, 'America/Los_Angeles'),
        ...makeRangeSlots(DEFAULT_DATES[4], 11, 14, 'America/Los_Angeles'),
      ],
      busySlots: [
        ...makeRangeSlots(DEFAULT_DATES[5], 13, 15, 'America/Los_Angeles'),
      ],
    },
    {
      userId: 'raj_robotics',
      userName: 'Raj Nair (Robotics Lead)',
      clubId: 'ucsc_robotics',
      clubName: 'Robotics League',
      timezone: 'America/Chicago',
      freeSlots: [
        ...makeRangeSlots(DEFAULT_DATES[0], 16, 19, 'America/Chicago'),
        ...makeRangeSlots(DEFAULT_DATES[2], 16, 19, 'America/Chicago'),
      ],
      busySlots: [],
    },
  ],
  calendarEvents: [],
}

export default function CollabScheduler({
  user = null,
  events = [],
  onEventBooked,
}) {
  const detectedLocalTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'
    } catch {
      return 'America/Los_Angeles'
    }
  }, [])

  const [polls, setPolls] = useState([FALLBACK_POLL])
  const [selectedPollId, setSelectedPollId] = useState(FALLBACK_POLL.id)
  const [userTimezone, setUserTimezone] = useState(detectedLocalTz)

  // Calendar View Mode ('week' | 'month') & Navigation State (Google Calendar style)
  const [calendarViewMode, setCalendarViewMode] = useState('week')
  const [weekStartMonday, setWeekStartMonday] = useState(BASE_MONDAY)
  const [monthCursor, setMonthCursor] = useState({ year: 2026, month: 10 }) // 10 = Nov (0-indexed)

  // Current user identity (each unique name gets its own responder record — unlimited people!)
  const defaultUserName =
    user?.fullName ||
    user?.primaryEmailAddress?.emailAddress?.split('@')[0] ||
    'Jane Doe (You)'
  const [userName, setUserName] = useState(defaultUserName)
  const [userClubName, setUserClubName] = useState('Computer Science Club')
  const currentUserId = useMemo(() => toUserId(userName), [userName])

  // Personal Free & Busy Sets (stored as canonical UTC ISO strings)
  const [myFreeSlots, setMyFreeSlots] = useState(
    () =>
      new Set([
        ...makeRangeSlots(DEFAULT_DATES[0], 14, 16.5, 'America/Los_Angeles'),
        ...makeRangeSlots(DEFAULT_DATES[2], 14, 17, 'America/Los_Angeles'),
      ])
  )
  const [myBusySlots, setMyBusySlots] = useState(
    () => new Set(makeRangeSlots(DEFAULT_DATES[1], 14, 15.5, 'America/Los_Angeles'))
  )

  // Paint mode: 'free' | 'busy' | 'erase'
  const [paintMode, setPaintMode] = useState('free')
  const [isDragging, setIsDragging] = useState(false)
  const [dragAction, setDragAction] = useState('add_free')

  // Natural language text input
  const [textInput, setTextInput] = useState(
    'Free Mon 2pm-4:30pm, Wed 2pm-5pm; Busy Tue 2pm-3:30pm'
  )

  // Selected/inspected slot on the heatmap
  const [activeSlotIso, setActiveSlotIso] = useState(null)
  const [hoveredSlotIso, setHoveredSlotIso] = useState(null)
  const [bookingDurationMins, setBookingDurationMins] = useState(60)
  const [bookingLoading, setBookingLoading] = useState(false)
  const [statusBanner, setStatusBanner] = useState(null)

  // New Collaboration Poll Modal
  const [showNewPollForm, setShowNewPollForm] = useState(false)
  const [newPollTitle, setNewPollTitle] = useState('')
  const [newPollClubs, setNewPollClubs] = useState(
    'Computer Science Club, Debate Society, Robotics League'
  )
  const [newPollLocation, setNewPollLocation] = useState('Baskin Engineering 152')

  const activePoll = useMemo(
    () => polls.find(p => p.id === selectedPollId) || polls[0] || FALLBACK_POLL,
    [polls, selectedPollId]
  )

  // Currently displayed 7-day week dates based on `weekStartMonday`
  const displayedWeekDates = useMemo(
    () => getWeekDatesFromStart(weekStartMonday),
    [weekStartMonday]
  )

  // Currently displayed 42-day month grid cells based on `monthCursor`
  const displayedMonthCells = useMemo(
    () => getMonthGridCells(monthCursor.year, monthCursor.month),
    [monthCursor.year, monthCursor.month]
  )

  // Load polls from SQLite database on mount
  const loadPolls = useCallback(async () => {
    const data = await getSchedulerPolls()
    if (Array.isArray(data) && data.length > 0) {
      setPolls(data)
      const current = data.find(p => p.id === selectedPollId) || data[0]
      setSelectedPollId(current.id)
    }
  }, [selectedPollId])

  useEffect(() => {
    loadPolls()
  }, [loadPolls])

  // Whenever currentUserId changes (user switches or types another person's name),
  // load that person's existing slots if they already responded, or keep current selection for new person
  function handleSwitchOrLoadPerson(targetUserObj) {
    if (!targetUserObj) return
    setUserName(targetUserObj.userName)
    if (targetUserObj.clubName) setUserClubName(targetUserObj.clubName)
    if (targetUserObj.timezone) setUserTimezone(targetUserObj.timezone)
    setMyFreeSlots(new Set(targetUserObj.freeSlots || []))
    setMyBusySlots(new Set(targetUserObj.busySlots || []))
    setStatusBanner(`Switched active schedule editor to ${targetUserObj.userName}`)
  }

  function handleAddNewParticipant() {
    const nextNum = allParticipants.length + 1
    const newName = `Member ${nextNum}`
    setUserName(newName)
    setStatusBanner(
      `👤 Added ${newName}! Paint Free/Busy slots or click Book to add ${newName}'s availability.`
    )
  }

  // Stop dragging when mouse released anywhere
  useEffect(() => {
    const handleUp = () => setIsDragging(false)
    window.addEventListener('mouseup', handleUp)
    return () => window.removeEventListener('mouseup', handleUp)
  }, [])

  // ── Week / Month Navigation Handlers (Google Calendar style) ──────
  function handlePrevPeriod() {
    if (calendarViewMode === 'week') {
      const nextMon = addDaysToYmd(weekStartMonday, -7)
      setWeekStartMonday(nextMon)
      const { y, m } = parseDateParts(nextMon)
      setMonthCursor({ year: y, month: m - 1 })
    } else {
      setMonthCursor(prev => {
        const dt = new Date(Date.UTC(prev.year, prev.month - 1, 1, 12, 0, 0))
        const firstMon = getMondayOfDate(formatYmd(dt))
        setWeekStartMonday(firstMon)
        return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() }
      })
    }
  }

  function handleNextPeriod() {
    if (calendarViewMode === 'week') {
      const nextMon = addDaysToYmd(weekStartMonday, 7)
      setWeekStartMonday(nextMon)
      const { y, m } = parseDateParts(nextMon)
      setMonthCursor({ year: y, month: m - 1 })
    } else {
      setMonthCursor(prev => {
        const dt = new Date(Date.UTC(prev.year, prev.month + 1, 1, 12, 0, 0))
        const firstMon = getMondayOfDate(formatYmd(dt))
        setWeekStartMonday(firstMon)
        return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() }
      })
    }
  }

  function handleJumpToDefaultWeek() {
    setWeekStartMonday(BASE_MONDAY)
    setMonthCursor({ year: 2026, month: 10 })
  }

  const periodHeaderLabel = useMemo(() => {
    if (calendarViewMode === 'month') {
      const dt = new Date(Date.UTC(monthCursor.year, monthCursor.month, 1, 12, 0, 0))
      return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    }
    const first = displayedWeekDates[0]
    const last = displayedWeekDates[6]
    const p1 = parseDateParts(first)
    const p2 = parseDateParts(last)
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
  }, [calendarViewMode, monthCursor, displayedWeekDates])

  // Build the 30-min time rows for the active poll
  const timeRows = useMemo(() => {
    const rows = []
    const startH = activePoll.startHour ?? 9
    const endH = activePoll.endHour ?? 20
    for (let mins = startH * 60; mins < endH * 60; mins += 30) {
      const h = Math.floor(mins / 60)
      const m = mins % 60
      rows.push({ hour: h, minute: m, label: `${h}:${m === 0 ? '00' : '30'}` })
    }
    return rows
  }, [activePoll.startHour, activePoll.endHour])

  // Map every (dateStr, hour, minute) cell in the displayed week to its canonical UTC ISO timestamp
  const gridSlots = useMemo(() => {
    const baseTz = activePoll.baseTimezone || 'America/Los_Angeles'
    const matrix = {}
    for (const d of displayedWeekDates) {
      matrix[d] = {}
      for (const r of timeRows) {
        const key = `${r.hour}:${r.minute}`
        matrix[d][key] = slotToUtcIso(d, r.hour, r.minute, baseTz)
      }
    }
    return matrix
  }, [displayedWeekDates, activePoll.baseTimezone, timeRows])

  // Combine all saved participants + current active user (unlimited participants!)
  const allParticipants = useMemo(() => {
    const others = (activePoll.responses || []).filter(
      r => r.userId !== currentUserId && r.userName?.toLowerCase() !== userName.trim().toLowerCase()
    )
    const me = {
      userId: currentUserId,
      userName: userName.trim() || 'You',
      clubName: userClubName,
      timezone: userTimezone,
      freeSlots: Array.from(myFreeSlots),
      busySlots: Array.from(myBusySlots),
    }
    return [me, ...others]
  }, [activePoll.responses, currentUserId, userName, userClubName, userTimezone, myFreeSlots, myBusySlots])

  // Index existing ClubHub Calendar events by 30-min UTC slot ISO AND by YYYY-MM-DD date
  const { calendarEventsBySlot, calendarEventsByDate, bookedCollabEvents } = useMemo(() => {
    const bySlot = {}
    const byDate = {}
    const collabList = []
    const allCalEvents = [
      ...(activePoll.calendarEvents || []),
      ...(Array.isArray(events) ? events : []),
    ]
    const seenIds = new Set()

    for (const ev of allCalEvents) {
      if (!ev || !ev.start || seenIds.has(ev.id)) continue
      seenIds.add(ev.id)

      if (String(ev.id).startsWith('collab_evt_')) {
        collabList.push(ev)
      }

      const startMs = new Date(ev.start).getTime()
      const endMs = ev.end ? new Date(ev.end).getTime() : startMs + 60 * 60 * 1000
      if (Number.isNaN(startMs)) continue

      const dateKey = new Date(startMs).toISOString().slice(0, 10)
      if (!byDate[dateKey]) byDate[dateKey] = []
      byDate[dateKey].push(ev)

      for (let t = startMs; t < endMs; t += 30 * 60 * 1000) {
        const slotIso = new Date(t).toISOString()
        if (!bySlot[slotIso]) bySlot[slotIso] = []
        bySlot[slotIso].push(ev)
      }
    }

    collabList.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    return {
      calendarEventsBySlot: bySlot,
      calendarEventsByDate: byDate,
      bookedCollabEvents: collabList,
    }
  }, [activePoll.calendarEvents, events])

  // Compute availability & busy lookup per UTC slot ISO across the displayed week
  const slotStatsMap = useMemo(() => {
    const map = {}
    for (const d of displayedWeekDates) {
      for (const r of timeRows) {
        const iso = gridSlots[d]?.[`${r.hour}:${r.minute}`]
        if (!iso) continue

        const availableUsers = []
        const busyUsers = []

        for (const p of allParticipants) {
          const isBusy = (p.busySlots || []).includes(iso)
          const isFree = !isBusy && (p.freeSlots || []).includes(iso)
          if (isBusy) busyUsers.push(p)
          else if (isFree) availableUsers.push(p)
        }

        // Visual intensity scales smoothly by headcount (no cap on participants)
        const intensity = Math.min(1, availableUsers.length / Math.max(4, allParticipants.length))

        map[iso] = {
          iso,
          dateStr: d,
          availableUsers,
          busyUsers,
          availableCount: availableUsers.length,
          busyCount: busyUsers.length,
          intensity,
          userIsFree: myFreeSlots.has(iso) && !myBusySlots.has(iso),
          userIsBusy: myBusySlots.has(iso),
          calendarEvents: calendarEventsBySlot[iso] || [],
        }
      }
    }
    return map
  }, [displayedWeekDates, timeRows, gridSlots, allParticipants, myFreeSlots, myBusySlots, calendarEventsBySlot])

  // Top best overlapping slots in the displayed week
  const bestOverlaps = useMemo(() => {
    return Object.values(slotStatsMap)
      .filter(s => s.availableCount >= 1)
      .sort((a, b) => b.availableCount - a.availableCount || a.iso.localeCompare(b.iso))
      .slice(0, 6)
  }, [slotStatsMap])

  // Apply paint to a single slot
  function applySlotPaint(iso, action) {
    if (!iso) return
    if (action === 'add_free') {
      setMyFreeSlots(prev => new Set(prev).add(iso))
      setMyBusySlots(prev => {
        const next = new Set(prev)
        next.delete(iso)
        return next
      })
    } else if (action === 'remove_free') {
      setMyFreeSlots(prev => {
        const next = new Set(prev)
        next.delete(iso)
        return next
      })
    } else if (action === 'add_busy') {
      setMyBusySlots(prev => new Set(prev).add(iso))
      setMyFreeSlots(prev => {
        const next = new Set(prev)
        next.delete(iso)
        return next
      })
    } else if (action === 'remove_busy' || action === 'erase') {
      setMyFreeSlots(prev => {
        const next = new Set(prev)
        next.delete(iso)
        return next
      })
      setMyBusySlots(prev => {
        const next = new Set(prev)
        next.delete(iso)
        return next
      })
    }
  }

  function handleCellMouseDown(iso) {
    setActiveSlotIso(iso)
    let action = 'add_free'
    if (paintMode === 'free') {
      action = myFreeSlots.has(iso) ? 'remove_free' : 'add_free'
    } else if (paintMode === 'busy') {
      action = myBusySlots.has(iso) ? 'remove_busy' : 'add_busy'
    } else {
      action = 'erase'
    }
    setDragAction(action)
    setIsDragging(true)
    applySlotPaint(iso, action)
  }

  function handleCellMouseEnter(iso) {
    if (!isDragging) return
    applySlotPaint(iso, dragAction)
  }

  // Save current user's Free & Busy availability to SQLite database
  async function handleSaveToDatabase(
    customFree = myFreeSlots,
    customBusy = myBusySlots,
    customText = textInput
  ) {
    setStatusBanner(`Saving ${userName}'s availability & timezone to the database…`)
    const updatedPoll = await saveSchedulerResponse(activePoll.id, {
      userId: currentUserId,
      userName: userName.trim() || 'Member',
      clubId: userClubName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      clubName: userClubName,
      timezone: userTimezone,
      freeSlots: Array.from(customFree),
      busySlots: Array.from(customBusy),
      rawTextInput: customText,
    })

    if (updatedPoll && updatedPoll.id) {
      setPolls(prev => prev.map(p => (p.id === updatedPoll.id ? updatedPoll : p)))
      setStatusBanner(
        `✅ Saved ${userName}'s ${customFree.size} free slots & ${customBusy.size} busy slots (${getTzShortName(userTimezone)}) to SQLite database!`
      )
    } else {
      setStatusBanner(
        `✅ Updated ${customFree.size} free slots & ${customBusy.size} busy slots locally!`
      )
    }
  }

  // Parse typed natural language availability and apply to grid + save to DB
  async function handleApplyTypedText(e) {
    if (e) e.preventDefault()
    const parsed = parseTextAvailabilityClient(
      textInput,
      displayedWeekDates,
      userTimezone
    )

    if (parsed.freeSlots.length === 0 && parsed.busySlots.length === 0) {
      setStatusBanner(
        '💡 Tip: Type day + time range like "Free Mon 2pm-5pm, Wed 1pm-4pm; Busy Tue 3pm-5pm"'
      )
      return
    }

    const nextFree = new Set([...myFreeSlots, ...parsed.freeSlots])
    const nextBusy = new Set([...myBusySlots, ...parsed.busySlots])
    for (const b of nextBusy) nextFree.delete(b)

    setMyFreeSlots(nextFree)
    setMyBusySlots(nextBusy)
    await handleSaveToDatabase(nextFree, nextBusy, textInput)
  }

  // Import existing ClubHub Calendar events into user's Busy slots
  function handleImportCalendarBusy() {
    const eventIsos = Object.keys(calendarEventsBySlot)
    if (eventIsos.length === 0) {
      setStatusBanner('No conflicting club calendar events found.')
      return
    }
    const nextBusy = new Set([...myBusySlots, ...eventIsos])
    const nextFree = new Set(myFreeSlots)
    for (const b of eventIsos) nextFree.delete(b)
    setMyBusySlots(nextBusy)
    setMyFreeSlots(nextFree)
    handleSaveToDatabase(nextFree, nextBusy, textInput)
  }

  // Book an overlapping slot onto the ClubHub Calendar (`events` table) + mark current user booked
  async function handleBookMeeting(slotIso) {
    const targetIso = slotIso || inspectedStats?.iso
    if (!targetIso) {
      setStatusBanner('⚠️ Click any time slot on the grid first to select a time to book.')
      return
    }
    setBookingLoading(true)
    const endIso = new Date(
      new Date(targetIso).getTime() + bookingDurationMins * 60 * 1000
    ).toISOString()

    // Ensure current user also has these slots marked free/booked locally
    const startMs = new Date(targetIso).getTime()
    const endMs = new Date(endIso).getTime()
    const nextFree = new Set(myFreeSlots)
    const nextBusy = new Set(myBusySlots)
    for (let t = startMs; t < endMs; t += 30 * 60 * 1000) {
      const sIso = new Date(t).toISOString()
      nextFree.add(sIso)
      nextBusy.delete(sIso)
    }
    setMyFreeSlots(nextFree)
    setMyBusySlots(nextBusy)

    setStatusBanner('Booking collaboration meeting onto ClubHub Calendar…')
    const res = await bookSchedulerSlot(activePoll.id, {
      start: targetIso,
      end: endIso,
      title: activePoll.title,
      clubId: activePoll.hostClubId || 'demo_ucsc_csclub',
      clubName: (activePoll.collaboratingClubs || []).slice(0, 2).join(' × ') || userClubName,
      location: activePoll.location || 'Baskin Engineering 152',
      userId: currentUserId,
      userName: userName.trim() || 'Member',
      userClubName,
      timezone: userTimezone,
    })
    setBookingLoading(false)

    if (res && res.booked) {
      setActiveSlotIso(targetIso)
      setPolls(prev => prev.map(p => (p.id === res.poll.id ? res.poll : p)))
      setStatusBanner(
        `🎉 Booked "${activePoll.title}" for ${formatSlotInTz(targetIso, detectedLocalTz, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })} (${bookingDurationMins} min, ${getTzShortName(detectedLocalTz)}) on ClubHub Calendar!`
      )
      if (onEventBooked) await onEventBooked()
    } else {
      setStatusBanner('⚠️ Could not reach backend database to book event.')
    }
  }

  // Unbook a slot or specific booked event from the ClubHub Calendar (`events` table)
  async function handleUnbookMeeting({ eventId = null, slotIso = null } = {}) {
    const targetIso = slotIso || inspectedStats?.iso
    setBookingLoading(true)
    setStatusBanner('Unbooking meeting from ClubHub Calendar…')

    // Also remove from local user's free slots if unbooking by slotIso
    if (targetIso) {
      setMyFreeSlots(prev => {
        const next = new Set(prev)
        next.delete(targetIso)
        return next
      })
    }

    const res = await unbookSchedulerSlot(activePoll.id, {
      eventId,
      start: targetIso,
      userId: currentUserId,
      removeUserAvailability: Boolean(targetIso),
      fallbackLatest: !eventId && !targetIso,
    })
    setBookingLoading(false)

    if (res && res.poll) {
      setPolls(prev => prev.map(p => (p.id === res.poll.id ? res.poll : p)))
      if (onEventBooked) await onEventBooked()
      setStatusBanner(
        `🗑️ Unbooked slot ${
          targetIso
            ? formatSlotInTz(targetIso, detectedLocalTz, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })
            : ''
        } and updated ClubHub Calendar!`
      )
    } else {
      setStatusBanner('🗑️ Unbooked slot locally.')
    }
  }

  // Create a new Collaboration Poll
  async function handleCreatePoll(e) {
    e.preventDefault()
    if (!newPollTitle.trim()) return
    const collabList = newPollClubs
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    const created = await createSchedulerPoll({
      title: newPollTitle.trim(),
      collaboratingClubs: collabList.length ? collabList : ['Computer Science Club'],
      location: newPollLocation.trim() || 'TBD',
      dates: displayedWeekDates,
      baseTimezone: userTimezone,
    })

    if (created && created.id) {
      setPolls(prev => [created, ...prev])
      setSelectedPollId(created.id)
      setNewPollTitle('')
      setShowNewPollForm(false)
      setStatusBanner(`✅ Created collaboration poll "${created.title}" in database!`)
    }
  }

  const inspectedStats = activeSlotIso
    ? slotStatsMap[activeSlotIso]
    : hoveredSlotIso
      ? slotStatsMap[hoveredSlotIso]
      : bestOverlaps[0] || Object.values(slotStatsMap)[0] || null

  const tzDiffersFromLocal = userTimezone !== detectedLocalTz

  return (
    <Card className="p-4 sm:p-[22px] mb-5 sm:mb-7 select-none" delay={3}>
      {/* ── Top Header: Title, Poll Selector & New Poll Button ── */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4 pb-3.5 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base sm:text-lg font-bold text-[var(--text)]">
              When2Meet × Google Calendar — Group Collaboration Scheduler
            </h2>
            <BubbleTag label="Live DB Sync" color="green" size="sm" dot />
            <BubbleTag
              label={`${allParticipants.length} People Participating`}
              color="blue"
              size="sm"
            />
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Switch weeks or months with <strong>&lt; / &gt;</strong>, paint or type when you are{' '}
            <strong>Free</strong> or <strong>Busy</strong>, and <strong>Book / Unbook</strong> directly with the ClubHub Calendar.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedPollId}
            onChange={e => setSelectedPollId(e.target.value)}
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--bg-surface)] text-[var(--text)] border border-[var(--border)] outline-none"
          >
            {polls.map(p => (
              <option key={p.id} value={p.id}>
                {cleanText(p.title)}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowNewPollForm(prev => !prev)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[var(--bg-surface)] text-[var(--blue-ink)] border border-[var(--border)] text-xs font-semibold cursor-pointer hover:opacity-90"
          >
            <Plus size={13} />
            {showNewPollForm ? 'Cancel' : 'New Collab Poll'}
          </button>

          <button
            type="button"
            onClick={() => handleSaveToDatabase()}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[var(--blue)] text-white border-none text-xs font-semibold cursor-pointer hover:opacity-90 shadow-xs"
          >
            <Check size={13} />
            Save Person&apos;s Schedule
          </button>
        </div>
      </div>

      {/* ── Optional: Create New Group Collaboration Poll Form ── */}
      {showNewPollForm && (
        <form
          onSubmit={handleCreatePoll}
          className="mb-4 p-3.5 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] grid grid-cols-1 md:grid-cols-[1.5fr_1.5fr_1fr_auto] gap-2.5 items-center"
        >
          <input
            type="text"
            value={newPollTitle}
            onChange={e => setNewPollTitle(e.target.value)}
            placeholder="Collaboration Title (e.g. CS × Debate AI Ethics Panel)"
            className="px-3 py-2 rounded-lg text-xs bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)]"
          />
          <input
            type="text"
            value={newPollClubs}
            onChange={e => setNewPollClubs(e.target.value)}
            placeholder="Clubs (comma-separated)"
            className="px-3 py-2 rounded-lg text-xs bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)]"
          />
          <input
            type="text"
            value={newPollLocation}
            onChange={e => setNewPollLocation(e.target.value)}
            placeholder="Location (e.g. E2 180 / Zoom)"
            className="px-3 py-2 rounded-lg text-xs bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)]"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-[var(--blue)] text-white text-xs font-semibold border-none cursor-pointer"
          >
            Create Poll
          </button>
        </form>
      )}

      {/* ── Collaborating Organizations + Unlimited Participant Switcher + Timezone Translation ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-3 mb-4">
        {/* Identity & Unlimited Participants */}
        <div className="p-3 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] flex flex-col justify-between gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--text)] inline-flex items-center gap-1.5">
              <Users size={14} className="text-[var(--blue)]" />
              Participants ({allParticipants.length} People — Unlimited)
            </span>
            <button
              type="button"
              onClick={handleAddNewParticipant}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--blue-light)] text-[var(--blue-ink)] border border-[var(--border)] text-[11px] font-semibold cursor-pointer hover:opacity-90"
            >
              <UserPlus size={12} />
              + Add Another Person
            </button>
          </div>

          {/* Clickable Participant Pills (Switch or Add Unlimited People) */}
          <div className="flex flex-wrap gap-1.5">
            {allParticipants.map(p => {
              const isCurrent = p.userId === currentUserId
              return (
                <button
                  key={p.userId}
                  type="button"
                  onClick={() => handleSwitchOrLoadPerson(p)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium cursor-pointer border transition-all ${
                    isCurrent
                      ? 'bg-[var(--blue)] text-white border-transparent'
                      : 'bg-[var(--bg-card)] text-[var(--text)] border-[var(--border)] hover:border-[var(--blue)]'
                  }`}
                >
                  {p.userName} ({ (p.freeSlots || []).length } slots)
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <input
              type="text"
              value={userName}
              onChange={e => setUserName(e.target.value)}
              placeholder="Type any Name to add/edit person..."
              className="px-2.5 py-1.5 rounded-lg text-xs bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)]"
            />
            <input
              type="text"
              value={userClubName}
              onChange={e => setUserClubName(e.target.value)}
              placeholder="Your Club / Organization"
              className="px-2.5 py-1.5 rounded-lg text-xs bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)]"
            />
          </div>
        </div>

        {/* Timezone Selector & Local Timezone Translator */}
        <div className="p-3 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--text)] inline-flex items-center gap-1.5">
              <Globe size={14} className="text-[var(--teal)]" />
              Timezone Converter &amp; Local Sync
            </span>
            <BubbleTag
              label={`Your Local TZ: ${detectedLocalTz} (${getTzShortName(detectedLocalTz)})`}
              color="teal"
              size="sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-[var(--text-muted)]">
              Input / View Schedule in Timezone:
            </label>
            <select
              value={userTimezone}
              onChange={e => setUserTimezone(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)] outline-none"
            >
              {TIMEZONES.map(tz => (
                <option key={tz.id} value={tz.id}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>

          <div className="text-[11px] text-[var(--text-muted)] flex items-center justify-between">
            {tzDiffersFromLocal ? (
              <span className="text-[var(--blue-ink)] font-medium">
                🔄 Translating <strong>{getTzShortName(userTimezone)}</strong> &rarr; your local{' '}
                <strong>{getTzShortName(detectedLocalTz)}</strong> automatically
              </span>
            ) : (
              <span>
                ✅ Synced with your local browser timezone ({getTzShortName(detectedLocalTz)})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Google Calendar Navigation Bar: < Prev | Today | Next > + Week / Month Switcher ── */}
      <div className="p-3 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevPeriod}
            title={calendarViewMode === 'week' ? 'Previous Week' : 'Previous Month'}
            className="w-8 h-8 rounded-full bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)] flex items-center justify-center cursor-pointer hover:border-[var(--blue)]"
          >
            <ChevronLeft size={16} />
          </button>

          <button
            type="button"
            onClick={handleJumpToDefaultWeek}
            className="px-3 py-1.5 rounded-full bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)] text-xs font-semibold cursor-pointer hover:border-[var(--blue)]"
          >
            Today / Default Week
          </button>

          <button
            type="button"
            onClick={handleNextPeriod}
            title={calendarViewMode === 'week' ? 'Next Week' : 'Next Month'}
            className="w-8 h-8 rounded-full bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)] flex items-center justify-center cursor-pointer hover:border-[var(--blue)]"
          >
            <ChevronRight size={16} />
          </button>

          <span className="text-sm sm:text-base font-bold text-[var(--text)] ml-1">
            {periodHeaderLabel}
          </span>
        </div>

        <div className="flex items-center gap-1.5 bg-[var(--bg-card)] p-1 rounded-full border border-[var(--border)]">
          <button
            type="button"
            onClick={() => setCalendarViewMode('week')}
            className={`px-3.5 py-1 rounded-full text-xs font-semibold cursor-pointer border-none transition-all ${
              calendarViewMode === 'week'
                ? 'bg-[var(--blue)] text-white'
                : 'bg-transparent text-[var(--text-muted)]'
            }`}
          >
            Week View
          </button>
          <button
            type="button"
            onClick={() => setCalendarViewMode('month')}
            className={`px-3.5 py-1 rounded-full text-xs font-semibold cursor-pointer border-none transition-all ${
              calendarViewMode === 'month'
                ? 'bg-[var(--blue)] text-white'
                : 'bg-transparent text-[var(--text-muted)]'
            }`}
          >
            Month View
          </button>
        </div>
      </div>

      {/* ── Type-In Natural Language Availability Bar + Paint Mode Controls ── */}
      <div className="p-3.5 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] mb-4 flex flex-col gap-3">
        <form
          onSubmit={handleApplyTypedText}
          className="grid grid-cols-1 lg:grid-cols-[auto_1fr_auto] gap-2 items-center"
        >
          <span className="text-xs font-semibold text-[var(--text)] inline-flex items-center gap-1.5">
            <Wand2 size={14} className="text-[var(--purple)]" />
            Type Availability ({getTzShortName(userTimezone)}):
          </span>

          <input
            type="text"
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            placeholder="e.g. Free Mon 2pm-5pm, Wed 1pm-4pm, Fri 10am-12pm; Busy Tue 2pm-4pm"
            className="px-3 py-2 rounded-lg text-xs bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)] w-full"
          />

          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-[var(--purple)] text-white text-xs font-semibold border-none cursor-pointer hover:opacity-90"
          >
            Apply Text &amp; Save
          </button>
        </form>

        {/* Click & Drag Mode Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border)]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-[var(--text-muted)] mr-1">
              Click &amp; Drag Mode:
            </span>

            <button
              type="button"
              onClick={() => setPaintMode('free')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer border transition-all ${
                paintMode === 'free'
                  ? 'bg-[var(--green)] text-white border-transparent shadow-xs'
                  : 'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border)]'
              }`}
            >
              <CheckCircle2 size={13} />
              Paint Free ({myFreeSlots.size})
            </button>

            <button
              type="button"
              onClick={() => setPaintMode('busy')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer border transition-all ${
                paintMode === 'busy'
                  ? 'bg-[var(--red)] text-white border-transparent shadow-xs'
                  : 'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border)]'
              }`}
            >
              <XCircle size={13} />
              Paint Busy ({myBusySlots.size})
            </button>

            <button
              type="button"
              onClick={() => setPaintMode('erase')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer border transition-all ${
                paintMode === 'erase'
                  ? 'bg-[var(--text)] text-[var(--bg-card)] border-transparent'
                  : 'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border)]'
              }`}
            >
              <Trash2 size={13} />
              Eraser
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleImportCalendarBusy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)] text-xs font-medium cursor-pointer hover:border-[var(--blue)]"
            >
              <CalendarIcon size={12.5} className="text-[var(--blue)]" />
              Auto-Mark Club Meetings as Busy
            </button>

            <button
              type="button"
              onClick={() => {
                setMyFreeSlots(new Set())
                setMyBusySlots(new Set())
              }}
              className="px-2.5 py-1.5 rounded-full bg-transparent text-[var(--text-muted)] hover:text-[var(--red)] text-xs border-none cursor-pointer"
            >
              Clear Grid
            </button>
          </div>
        </div>
      </div>

      {statusBanner && (
        <div className="mb-4 px-3.5 py-2 rounded-lg bg-[var(--blue-light)] text-[var(--blue-ink)] text-xs font-medium flex items-center justify-between">
          <span>{statusBanner}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-xs font-bold bg-transparent border-none cursor-pointer text-[var(--blue-ink)]"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── MONTH VIEW (Google Calendar Style Monthly Grid with < and > switching) ── */}
      {calendarViewMode === 'month' ? (
        <div className="p-4 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] mb-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-[var(--text)]">
                Monthly Collaboration &amp; Club Events Calendar — {periodHeaderLabel}
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Click any day to jump to that week&apos;s hourly grid, or click <strong>Book / Unbook</strong> directly on a day.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-[var(--text-muted)] mb-1.5">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {displayedMonthCells.map(cell => {
              const dayEvents = calendarEventsByDate[cell.dateStr] || []
              const defaultSlotIso = slotToUtcIso(
                cell.dateStr,
                14,
                0,
                activePoll.baseTimezone || 'America/Los_Angeles'
              )
              // Count how many people have any free slot on this date
              const peopleFreeOnDate = allParticipants.filter(p =>
                (p.freeSlots || []).some(iso => iso.startsWith(cell.dateStr))
              ).length
              const hasBookedCollab = dayEvents.some(e =>
                String(e.id || '').startsWith('collab_evt_')
              )

              return (
                <div
                  key={cell.dateStr}
                  onClick={() => {
                    const mon = getMondayOfDate(cell.dateStr)
                    setWeekStartMonday(mon)
                    setActiveSlotIso(defaultSlotIso)
                  }}
                  className={`min-h-[92px] p-2 rounded-lg border transition-all cursor-pointer flex flex-col justify-between ${
                    cell.inCurrentMonth
                      ? 'bg-[var(--bg-card)] border-[var(--border)] hover:border-[var(--blue)]'
                      : 'bg-[var(--bg-surface)] opacity-50 border-[var(--border)]'
                  } ${hasBookedCollab ? 'ring-2 ring-[var(--blue)]' : ''}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-[var(--text)]">
                      {cell.dayNumber}
                    </span>
                    {peopleFreeOnDate > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-[var(--green-light)] text-[var(--green)] text-[10px] font-bold">
                        {peopleFreeOnDate} free
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 my-1">
                    {dayEvents.slice(0, 2).map(ev => {
                      const isCollab = String(ev.id || '').startsWith('collab_evt_')
                      return (
                        <div
                          key={ev.id}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium truncate ${
                            isCollab
                              ? 'bg-[var(--blue)] text-white'
                              : 'bg-[var(--yellow-light)] text-[var(--text)]'
                          }`}
                          title={ev.title}
                        >
                          {isCollab ? '📅 ' : ''}
                          {cleanText(ev.title)}
                        </div>
                      )
                    })}
                    {dayEvents.length > 2 && (
                      <span className="text-[9.5px] text-[var(--text-muted)]">
                        +{dayEvents.length - 2} more
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-1 pt-1 border-t border-[var(--border)]">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        handleBookMeeting(defaultSlotIso)
                      }}
                      className="px-1.5 py-0.5 rounded bg-[var(--blue)] text-white text-[9.5px] font-semibold border-none cursor-pointer hover:opacity-90"
                    >
                      Book
                    </button>
                    {hasBookedCollab && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          const collabEv = dayEvents.find(ev =>
                            String(ev.id || '').startsWith('collab_evt_')
                          )
                          handleUnbookMeeting({ eventId: collabEv?.id, slotIso: defaultSlotIso })
                        }}
                        className="px-1.5 py-0.5 rounded bg-[var(--red)] text-white text-[9.5px] font-semibold border-none cursor-pointer hover:opacity-90"
                      >
                        Unbook
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        setWeekStartMonday(getMondayOfDate(cell.dateStr))
                        setCalendarViewMode('week')
                      }}
                      className="text-[9.5px] text-[var(--blue-ink)] bg-transparent border-none cursor-pointer font-semibold hover:underline"
                    >
                      Hours &rarr;
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* ── WEEK VIEW: Side-by-Side When2Meet Grids: Personal Input (Left) + Group Overlap & Calendar (Right) ── */
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
          {/* 1. LEFT GRID: Your Availability (Free vs Busy) */}
          <div className="p-3.5 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] overflow-x-auto">
            <div className="flex items-center justify-between mb-2.5">
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-[var(--text)]">
                  1. {userName}&apos;s Schedule ({periodHeaderLabel})
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Click &amp; drag cells to mark <strong>Free (Green)</strong> or <strong>Busy (Red)</strong>
                </p>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#22c55e] inline-block" /> Free
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#ef4444] inline-block" /> Busy
                </span>
              </div>
            </div>

            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="p-1 text-left text-[10px] text-[var(--text-muted)] font-semibold w-20">
                    {getTzShortName(userTimezone)}
                    {tzDiffersFromLocal ? ` / ${getTzShortName(detectedLocalTz)}` : ''}
                  </th>
                  {displayedWeekDates.map(dateStr => {
                    const { y, m, d } = parseDateParts(dateStr)
                    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
                    const dayShort = dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
                    const monthDay = dt.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'UTC' })
                    return (
                      <th key={dateStr} className="p-1 text-center font-semibold text-[var(--text)]">
                        <div>{dayShort}</div>
                        <div className="text-[9.5px] text-[var(--text-muted)] font-normal">{monthDay}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {timeRows.map(r => {
                  const sampleIso = gridSlots[displayedWeekDates[0]]?.[`${r.hour}:${r.minute}`]
                  const selectedTzLabel = sampleIso
                    ? formatSlotInTz(sampleIso, userTimezone, { hour: 'numeric', minute: '2-digit' })
                    : r.label
                  const localTzLabel =
                    tzDiffersFromLocal && sampleIso
                      ? formatSlotInTz(sampleIso, detectedLocalTz, { hour: 'numeric', minute: '2-digit' })
                      : null

                  return (
                    <tr key={`${r.hour}:${r.minute}`}>
                      <td className="pr-1.5 py-0.5 text-[10px] text-[var(--text-muted)] whitespace-nowrap font-mono-num">
                        {r.minute === 0 ? (
                          <div>
                            <span>{selectedTzLabel}</span>
                            {localTzLabel && (
                              <span className="block text-[9px] text-[var(--blue-ink)]">
                                ({localTzLabel} local)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="opacity-35">·</span>
                        )}
                      </td>
                      {displayedWeekDates.map(dateStr => {
                        const iso = gridSlots[dateStr]?.[`${r.hour}:${r.minute}`]
                        const isFree = myFreeSlots.has(iso)
                        const isBusy = myBusySlots.has(iso)
                        const calEvs = calendarEventsBySlot[iso] || []

                        let cellStyle = {
                          background: 'var(--bg-card)',
                        }
                        if (isBusy) {
                          cellStyle = {
                            background:
                              'repeating-linear-gradient(135deg, rgba(239,68,68,0.82), rgba(239,68,68,0.82) 4px, rgba(220,38,38,0.92) 4px, rgba(220,38,38,0.92) 8px)',
                            color: '#fff',
                          }
                        } else if (isFree) {
                          cellStyle = {
                            background: 'rgba(34, 197, 94, 0.85)',
                            color: '#fff',
                          }
                        }

                        return (
                          <td
                            key={iso}
                            onMouseDown={() => handleCellMouseDown(iso)}
                            onMouseEnter={() => handleCellMouseEnter(iso)}
                            title={`${formatSlotInTz(iso, userTimezone, {
                              weekday: 'short',
                              hour: 'numeric',
                              minute: '2-digit',
                            })} (${getTzShortName(userTimezone)})${
                              calEvs.length ? ` • Club Event: ${calEvs[0].title}` : ''
                            }`}
                            className="border border-[var(--border)] h-5 cursor-pointer transition-colors relative"
                            style={cellStyle}
                          >
                            {calEvs.length > 0 && (
                              <span
                                className="absolute inset-x-0.5 top-0.5 h-1.5 rounded-full bg-[var(--blue)] opacity-85"
                                title={`Calendar Event: ${calEvs.map(e => e.title).join(', ')}`}
                              />
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 2. RIGHT GRID: Group Collaboration Availability Heatmap + Google Calendar Overlay */}
          <div className="p-3.5 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] overflow-x-auto">
            <div className="flex items-center justify-between mb-2.5">
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-[var(--text)]">
                  2. Group Overlap Heatmap &amp; Club Calendar
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Shows how many people are available/booked per slot. Click any slot to Book or Unbook.
                </p>
              </div>

              {/* Heatmap Legend — Shows headcount without any /5 cap or infinity symbol */}
              <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                <span>0</span>
                <span className="w-3 h-2.5 rounded-xs bg-[var(--bg-card)] border border-[var(--border)]" />
                <span className="w-3 h-2.5 rounded-xs bg-[rgba(34,197,94,0.28)]" />
                <span className="w-3 h-2.5 rounded-xs bg-[rgba(34,197,94,0.55)]" />
                <span className="w-3 h-2.5 rounded-xs bg-[rgba(22,163,74,0.92)]" />
                <span>People</span>
              </div>
            </div>

            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="p-1 text-left text-[10px] text-[var(--text-muted)] font-semibold w-20">
                    Local ({getTzShortName(detectedLocalTz)})
                  </th>
                  {displayedWeekDates.map(dateStr => {
                    const { y, m, d } = parseDateParts(dateStr)
                    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
                    const dayShort = dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
                    const monthDay = dt.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'UTC' })
                    return (
                      <th key={dateStr} className="p-1 text-center font-semibold text-[var(--text)]">
                        <div>{dayShort}</div>
                        <div className="text-[9.5px] text-[var(--text-muted)] font-normal">{monthDay}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {timeRows.map(r => {
                  const sampleIso = gridSlots[displayedWeekDates[0]]?.[`${r.hour}:${r.minute}`]
                  const localLabel = sampleIso
                    ? formatSlotInTz(sampleIso, detectedLocalTz, { hour: 'numeric', minute: '2-digit' })
                    : r.label

                  return (
                    <tr key={`${r.hour}:${r.minute}`}>
                      <td className="pr-1.5 py-0.5 text-[10px] text-[var(--text-muted)] whitespace-nowrap font-mono-num">
                        {r.minute === 0 ? localLabel : <span className="opacity-35">·</span>}
                      </td>
                      {displayedWeekDates.map(dateStr => {
                        const iso = gridSlots[dateStr]?.[`${r.hour}:${r.minute}`]
                        const st = slotStatsMap[iso]
                        const count = st?.availableCount || 0
                        const intensity = st?.intensity || 0
                        const isSelected = activeSlotIso === iso
                        const calEvs = st?.calendarEvents || []
                        const isBookedCollabSlot = calEvs.some(e =>
                          String(e.id || '').startsWith('collab_evt_')
                        )

                        let bg = 'var(--bg-card)'
                        if (isBookedCollabSlot) {
                          bg = 'rgba(59, 130, 246, 0.88)'
                        } else if (count > 0) {
                          const alpha = (0.2 + intensity * 0.75).toFixed(2)
                          bg = `rgba(22, 163, 74, ${alpha})`
                        }

                        return (
                          <td
                            key={iso}
                            onClick={() => setActiveSlotIso(iso)}
                            onMouseEnter={() => {
                              if (!isDragging) setHoveredSlotIso(iso)
                            }}
                            onMouseLeave={() => setHoveredSlotIso(null)}
                            className={`border border-[var(--border)] h-5 cursor-pointer transition-all text-center text-[9.5px] font-semibold relative ${
                              isSelected
                                ? 'ring-2 ring-[var(--blue)] z-10'
                                : hoveredSlotIso === iso
                                  ? 'ring-1 ring-[var(--text-muted)] z-10'
                                  : ''
                            }`}
                            style={{
                              background: bg,
                              color: isBookedCollabSlot || intensity > 0.45 ? '#fff' : 'var(--text)',
                            }}
                          >
                            {/* Display ONLY how many people booked/are available (no /5 cap, no infinity symbol) */}
                            {isBookedCollabSlot ? (
                              <span title="Booked Collaboration Meeting">📅 {count}</span>
                            ) : (
                              count > 0 && <span>{count}</span>
                            )}
                            {calEvs.length > 0 && !isBookedCollabSlot && (
                              <span
                                className="absolute right-0.5 top-0.5 w-1.5 h-1.5 rounded-full bg-[var(--yellow)]"
                                title={`Club Event: ${calEvs.map(e => e.title).join(', ')}`}
                              />
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Bottom Section: Slot Inspector + Best Collaboration Times & Side-by-Side Book / Unbook ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Slot Inspector */}
        <div className="p-4 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] flex flex-col justify-between gap-3">
          {inspectedStats ? (
            <>
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Clock size={15} className="text-[var(--blue)]" />
                    <span className="text-xs sm:text-sm font-bold text-[var(--text)]">
                      {formatSlotInTz(inspectedStats.iso, detectedLocalTz, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}{' '}
                      ({getTzShortName(detectedLocalTz)})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {activeSlotIso && (
                      <BubbleTag label="📌 Selected" color="purple" size="sm" />
                    )}
                    <BubbleTag
                      label={`${inspectedStats.availableCount} ${
                        inspectedStats.availableCount === 1 ? 'Person' : 'People'
                      } Booked / Free`}
                      color="green"
                      size="sm"
                    />
                  </div>
                </div>

                {tzDiffersFromLocal && (
                  <div className="text-[11px] text-[var(--text-muted)] mb-2">
                    In selected input timezone ({userTimezone}):{' '}
                    <strong>
                      {formatSlotInTz(inspectedStats.iso, userTimezone, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}{' '}
                      ({getTzShortName(userTimezone)})
                    </strong>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-2">
                  {/* Available / Booked Responders */}
                  <div className="p-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]">
                    <div className="text-[11px] font-semibold text-[var(--green)] mb-1.5">
                      ✅ People Booked / Free ({inspectedStats.availableUsers.length})
                    </div>
                    {inspectedStats.availableUsers.length > 0 ? (
                      <ul className="m-0 p-0 list-none flex flex-col gap-1 text-[11px] text-[var(--text)]">
                        {inspectedStats.availableUsers.map(u => (
                          <li key={u.userId} className="flex items-center justify-between gap-1">
                            <span className="truncate">{u.userName}</span>
                            <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                              {getTzShortName(u.timezone || 'America/Los_Angeles')}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-[11px] text-[var(--text-muted)]">None booked yet</div>
                    )}
                  </div>

                  {/* Busy / Unavailable Responders */}
                  <div className="p-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]">
                    <div className="text-[11px] font-semibold text-[var(--red)] mb-1.5">
                      🔴 Marked Busy ({inspectedStats.busyUsers.length})
                    </div>
                    {inspectedStats.busyUsers.length > 0 ? (
                      <ul className="m-0 p-0 list-none flex flex-col gap-1 text-[11px] text-[var(--text)]">
                        {inspectedStats.busyUsers.map(u => (
                          <li key={u.userId} className="truncate">
                            {u.userName} ({u.clubName})
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-[11px] text-[var(--text-muted)]">No busy conflicts</div>
                    )}
                  </div>
                </div>

                {inspectedStats.calendarEvents.length > 0 && (
                  <div className="mt-2.5 p-2 rounded-lg bg-[var(--yellow-light)] text-xs text-[var(--text)]">
                    📅 <strong>On ClubHub Calendar:</strong>{' '}
                    {inspectedStats.calendarEvents.map(e => `${e.clubName || e.clubId}: ${e.title}`).join(' · ')}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-[var(--text-muted)]">
                    Meeting Duration:
                  </span>
                  <div className="flex items-center gap-1">
                    {[30, 60, 90, 120].map(mins => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setBookingDurationMins(mins)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer border ${
                          bookingDurationMins === mins
                            ? 'bg-[var(--blue)] text-white border-transparent'
                            : 'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border)]'
                        }`}
                      >
                        {mins === 30 ? '30m' : `${mins / 60}h`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Always-visible side-by-side BOOK and UNBOOK buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={bookingLoading}
                    onClick={() => handleBookMeeting(inspectedStats.iso)}
                    className="py-2.5 px-3 rounded-lg bg-[var(--blue)] text-white text-xs font-semibold border-none cursor-pointer hover:opacity-90 flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <CalendarIcon size={13.5} />
                    Book Slot ({bookingDurationMins}m)
                  </button>

                  <button
                    type="button"
                    disabled={bookingLoading}
                    onClick={() => {
                      const existingBooked = inspectedStats.calendarEvents.find(e =>
                        String(e.id || '').startsWith('collab_evt_')
                      )
                      handleUnbookMeeting({
                        eventId: existingBooked?.id || null,
                        slotIso: inspectedStats.iso,
                      })
                    }}
                    className="py-2.5 px-3 rounded-lg bg-[var(--red)] text-white text-xs font-semibold border-none cursor-pointer hover:opacity-90 flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Trash2 size={13.5} />
                    Unbook Slot
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-xs text-[var(--text-muted)]">
              Click any slot on the heatmap to inspect group availability.
            </div>
          )}
        </div>

        {/* Best Overlapping Times for Collaboration */}
        <div className="p-4 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] flex flex-col justify-between gap-3">
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs sm:text-sm font-bold text-[var(--text)] inline-flex items-center gap-1.5">
                <Sparkles size={15} className="text-[var(--yellow)]" />
                Best Overlapping Times ({periodHeaderLabel})
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">
                Auto-translated to {getTzShortName(detectedLocalTz)}
              </span>
            </div>

            {bestOverlaps.length > 0 ? (
              <div className="flex flex-col gap-2">
                {bestOverlaps.map(slot => {
                  const existingBooked = (slot.calendarEvents || []).find(e =>
                    String(e.id || '').startsWith('collab_evt_')
                  )
                  return (
                    <div
                      key={slot.iso}
                      onClick={() => setActiveSlotIso(slot.iso)}
                      className={`p-2.5 rounded-lg bg-[var(--bg-card)] border flex flex-wrap items-center justify-between gap-2 cursor-pointer transition-colors ${
                        activeSlotIso === slot.iso
                          ? 'border-[var(--blue)]'
                          : 'border-[var(--border)] hover:border-[var(--blue)]'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-semibold text-[var(--text)] flex items-center gap-1.5">
                          <span>
                            {formatSlotInTz(slot.iso, detectedLocalTz, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}{' '}
                            ({getTzShortName(detectedLocalTz)})
                          </span>
                          {existingBooked && (
                            <BubbleTag label="Booked ✓" color="blue" size="sm" />
                          )}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          {slot.availableUsers.map(u => u.clubName || u.userName).join(' · ')}
                        </div>
                      </div>

                      {/* Side-by-side count badge + Book + Unbook buttons */}
                      <div className="flex items-center gap-1.5">
                        <BubbleTag
                          label={`${slot.availableCount} Booked`}
                          color="green"
                          size="sm"
                        />
                        <button
                          type="button"
                          onClick={ev => {
                            ev.stopPropagation()
                            handleBookMeeting(slot.iso)
                          }}
                          className="px-2.5 py-1 rounded-full bg-[var(--blue)] text-white text-[11px] font-semibold border-none cursor-pointer hover:opacity-90"
                        >
                          Book
                        </button>
                        <button
                          type="button"
                          onClick={ev => {
                            ev.stopPropagation()
                            handleUnbookMeeting({
                              eventId: existingBooked?.id || null,
                              slotIso: slot.iso,
                            })
                          }}
                          className="px-2.5 py-1 rounded-full bg-[var(--red)] text-white text-[11px] font-semibold border-none cursor-pointer hover:opacity-90"
                        >
                          Unbook
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-xs text-[var(--text-muted)] py-4">
                Paint green Free slots on the grid for this week (or click Book on any slot) to see overlapping times!
              </div>
            )}
          </div>

          {/* Booked Collaboration Meetings Summary List */}
          {bookedCollabEvents.length > 0 && (
            <div className="pt-3 border-t border-[var(--border)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[var(--green)] inline-flex items-center gap-1.5">
                  📅 Booked Collaboration Meetings ({bookedCollabEvents.length})
                </span>
                <span className="text-[10.5px] text-[var(--text-muted)]">
                  Synced to ClubHub Calendar ↑
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {bookedCollabEvents.map(ev => (
                  <div
                    key={ev.id}
                    className="px-3 py-2 rounded-lg bg-[var(--green-light)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-[var(--text)]">
                        {cleanText(ev.title)}
                      </span>{' '}
                      <span className="text-[var(--text-muted)]">
                        —{' '}
                        {formatSlotInTz(ev.start, detectedLocalTz, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}{' '}
                        ({getTzShortName(detectedLocalTz)}) · {ev.location || 'TBD'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUnbookMeeting({ eventId: ev.id, slotIso: ev.start })}
                      className="px-2.5 py-1 rounded-full bg-[var(--red)] text-white text-[11px] font-semibold border-none cursor-pointer hover:opacity-90"
                    >
                      Unbook
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Status Confirmation Toast */}
      {statusBanner && (
        <div className="mt-3 px-3.5 py-2.5 rounded-lg bg-[var(--green-light)] border border-[var(--border)] text-[var(--text)] text-xs font-semibold flex items-center justify-between">
          <span>{statusBanner}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-xs font-bold bg-transparent border-none cursor-pointer text-[var(--text-muted)]"
          >
            ✕
          </button>
        </div>
      )}
    </Card>
  )
}
