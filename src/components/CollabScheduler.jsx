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
} from 'lucide-react'
import { Card, BubbleTag, cleanText } from './ui'
import {
  getSchedulerPolls,
  createSchedulerPoll,
  saveSchedulerResponse,
  bookSchedulerSlot,
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

const DEFAULT_DATES = [
  '2026-11-16',
  '2026-11-17',
  '2026-11-18',
  '2026-11-19',
  '2026-11-20',
  '2026-11-21',
  '2026-11-22',
]

// ── Timezone Conversion Utilities ───────────────────────────────────

/**
 * Convert a local date (`YYYY-MM-DD`), hour (0-23), minute (0 or 30) in `timeZone`
 * into a canonical UTC ISO timestamp string (`YYYY-MM-DDTHH:mm:00.000Z`).
 */
export function slotToUtcIso(dateStr, hour, minute, timeZone = 'America/Los_Angeles') {
  try {
    const [y, m, d] = dateStr.split('-').map(Number)
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
    const [y, m, d] = dateStr.split('-').map(Number)
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

/**
 * Format a UTC ISO string in a target timezone.
 */
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

/**
 * Client-side natural language availability parser so typing works instantaneously
 * even before the server round-trip completes.
 */
function parseTextAvailabilityClient(text = '', dates = DEFAULT_DATES, timeZone = 'America/Los_Angeles') {
  const freeSlots = new Set()
  const busySlots = new Set()
  if (!text.trim()) return { freeSlots: [], busySlots: [] }

  const dayToDate = {}
  for (const dateStr of dates) {
    const [y, m, d] = dateStr.split('-').map(Number)
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

// ── Fallback Default Poll (used before backend responds) ────────────
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
  clubs = [],
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

  // Current user identity
  const defaultUserName =
    user?.fullName ||
    user?.primaryEmailAddress?.emailAddress?.split('@')[0] ||
    'Jane Doe (You)'
  const [userName, setUserName] = useState(defaultUserName)
  const [userClubName, setUserClubName] = useState('Computer Science Club')

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
  const [statusBanner, setStatusBanner] = useState(null)

  // New Collaboration Poll Modal
  const [showNewPollForm, setShowNewPollForm] = useState(false)
  const [newPollTitle, setNewPollTitle] = useState('')
  const [newPollClubs, setNewPollClubs] = useState('Computer Science Club, Debate Society, Robotics League')
  const [newPollLocation, setNewPollLocation] = useState('Baskin Engineering 152')

  const activePoll = useMemo(
    () => polls.find(p => p.id === selectedPollId) || polls[0] || FALLBACK_POLL,
    [polls, selectedPollId]
  )

  // Load polls from SQLite database on mount
  const loadPolls = useCallback(async () => {
    const data = await getSchedulerPolls()
    if (Array.isArray(data) && data.length > 0) {
      setPolls(data)
      const current = data.find(p => p.id === selectedPollId) || data[0]
      setSelectedPollId(current.id)

      // Check if current user already has a saved response in DB
      const existingMe = (current.responses || []).find(r => r.userId === 'current_user')
      if (existingMe) {
        setMyFreeSlots(new Set(existingMe.freeSlots || []))
        setMyBusySlots(new Set(existingMe.busySlots || []))
        if (existingMe.rawTextInput) setTextInput(existingMe.rawTextInput)
        if (existingMe.timezone) setUserTimezone(existingMe.timezone)
      }
    }
  }, [selectedPollId])

  useEffect(() => {
    loadPolls()
  }, [loadPolls])

  // Stop dragging when mouse released anywhere
  useEffect(() => {
    const handleUp = () => setIsDragging(false)
    window.addEventListener('mouseup', handleUp)
    return () => window.removeEventListener('mouseup', handleUp)
  }, [])

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

  // Map every (dateStr, hour, minute) cell to its canonical UTC ISO timestamp
  // using the poll's baseTimezone so all participants share the exact same grid instants!
  const gridSlots = useMemo(() => {
    const baseTz = activePoll.baseTimezone || 'America/Los_Angeles'
    const matrix = {}
    for (const d of activePoll.dates || DEFAULT_DATES) {
      matrix[d] = {}
      for (const r of timeRows) {
        const key = `${r.hour}:${r.minute}`
        matrix[d][key] = slotToUtcIso(d, r.hour, r.minute, baseTz)
      }
    }
    return matrix
  }, [activePoll.dates, activePoll.baseTimezone, timeRows])

  // Combine other participants' responses + current user's live state
  const allParticipants = useMemo(() => {
    const others = (activePoll.responses || []).filter(r => r.userId !== 'current_user')
    const me = {
      userId: 'current_user',
      userName: userName || 'You',
      clubName: userClubName,
      timezone: userTimezone,
      freeSlots: Array.from(myFreeSlots),
      busySlots: Array.from(myBusySlots),
    }
    return [me, ...others]
  }, [activePoll.responses, userName, userClubName, userTimezone, myFreeSlots, myBusySlots])

  // Index existing ClubHub Calendar events by 30-min UTC slot ISO
  const calendarEventsBySlot = useMemo(() => {
    const map = {}
    const allCalEvents = [
      ...(activePoll.calendarEvents || []),
      ...(Array.isArray(events) ? events : []),
    ]
    const seenIds = new Set()

    for (const ev of allCalEvents) {
      if (!ev || !ev.start || seenIds.has(ev.id)) continue
      seenIds.add(ev.id)
      const startMs = new Date(ev.start).getTime()
      const endMs = ev.end ? new Date(ev.end).getTime() : startMs + 60 * 60 * 1000
      if (Number.isNaN(startMs)) continue

      for (let t = startMs; t < endMs; t += 30 * 60 * 1000) {
        const slotIso = new Date(t).toISOString()
        if (!map[slotIso]) map[slotIso] = []
        map[slotIso].push(ev)
      }
    }
    return map
  }, [activePoll.calendarEvents, events])

  // Compute availability & busy lookup per UTC slot ISO
  const slotStatsMap = useMemo(() => {
    const map = {}
    const total = allParticipants.length

    for (const d of activePoll.dates || DEFAULT_DATES) {
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

        map[iso] = {
          iso,
          dateStr: d,
          availableUsers,
          busyUsers,
          availableCount: availableUsers.length,
          busyCount: busyUsers.length,
          totalParticipants: total,
          ratio: total > 0 ? availableUsers.length / total : 0,
          userIsFree: myFreeSlots.has(iso) && !myBusySlots.has(iso),
          userIsBusy: myBusySlots.has(iso),
          calendarEvents: calendarEventsBySlot[iso] || [],
        }
      }
    }
    return map
  }, [activePoll.dates, timeRows, gridSlots, allParticipants, myFreeSlots, myBusySlots, calendarEventsBySlot])

  // Top best overlapping slots where the user + most collaborating clubs are available
  const bestOverlaps = useMemo(() => {
    return Object.values(slotStatsMap)
      .filter(s => s.availableCount >= 2 && s.userIsFree)
      .sort((a, b) => b.availableCount - a.availableCount || a.iso.localeCompare(b.iso))
      .slice(0, 5)
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

  // Save user's Free & Busy availability to SQLite database
  async function handleSaveToDatabase(customFree = myFreeSlots, customBusy = myBusySlots, customText = textInput) {
    setStatusBanner('Saving your availability & timezone to the database…')
    const updatedPoll = await saveSchedulerResponse(activePoll.id, {
      userId: 'current_user',
      userName,
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
        `✅ Saved ${customFree.size} free slots & ${customBusy.size} busy slots (${getTzShortName(userTimezone)}) to SQLite database!`
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
      activePoll.dates || DEFAULT_DATES,
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
      setStatusBanner('No conflicting club calendar events found in this week.')
      return
    }
    const nextBusy = new Set([...myBusySlots, ...eventIsos])
    const nextFree = new Set(myFreeSlots)
    for (const b of eventIsos) nextFree.delete(b)
    setMyBusySlots(nextBusy)
    setMyFreeSlots(nextFree)
    handleSaveToDatabase(nextFree, nextBusy, textInput)
  }

  // Book an overlapping slot onto the ClubHub Calendar (`events` table)
  async function handleBookMeeting(slotIso) {
    if (!slotIso) return
    const endIso = new Date(new Date(slotIso).getTime() + 60 * 60 * 1000).toISOString()
    setStatusBanner('Booking collaboration meeting onto ClubHub Calendar…')
    const res = await bookSchedulerSlot(activePoll.id, {
      start: slotIso,
      end: endIso,
      title: activePoll.title,
      clubId: activePoll.hostClubId || 'demo_ucsc_csclub',
      clubName: (activePoll.collaboratingClubs || []).slice(0, 2).join(' × ') || userClubName,
      location: activePoll.location || 'Baskin Engineering 152',
    })

    if (res && res.booked) {
      setPolls(prev => prev.map(p => (p.id === res.poll.id ? res.poll : p)))
      setStatusBanner(
        `🎉 Booked "${activePoll.title}" for ${formatSlotInTz(slotIso, detectedLocalTz, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })} (${getTzShortName(detectedLocalTz)}) and added to ClubHub Calendar!`
      )
      if (onEventBooked) onEventBooked()
    } else {
      setStatusBanner('⚠️ Could not reach backend database to book event.')
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
      dates: DEFAULT_DATES,
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
    : bestOverlaps[0] || null

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
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Click &amp; drag or type when you are <strong>Free</strong> or <strong>Busy</strong>. Automatically translates across timezones and books directly to the ClubHub Calendar.
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
            Save Availability to DB
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

      {/* ── Collaborating Organizations + Timezone Translation Bar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-3 mb-4">
        {/* Identity & Collaborating Clubs */}
        <div className="p-3 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] flex flex-col justify-between gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--text)] inline-flex items-center gap-1.5">
              <Users size={14} className="text-[var(--blue)]" />
              Collaborating Organizations ({(activePoll.collaboratingClubs || []).length})
            </span>
            <span className="text-[11px] text-[var(--text-muted)] inline-flex items-center gap-1">
              <MapPin size={12} /> {activePoll.location || 'TBD'}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(activePoll.collaboratingClubs || []).map((cName, i) => {
              const colors = ['blue', 'red', 'purple', 'teal', 'green']
              return (
                <BubbleTag
                  key={cName}
                  label={cName}
                  color={colors[i % colors.length]}
                  size="sm"
                />
              )
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <input
              type="text"
              value={userName}
              onChange={e => setUserName(e.target.value)}
              placeholder="Your Name"
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

      {/* ── Type-In Natural Language Availability Bar + Paint Mode Controls ── */}
      <div className="p-3.5 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] mb-4 flex flex-col gap-3">
        {/* Natural Language Input Row */}
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

      {/* ── Side-by-Side When2Meet Grids: Personal Input (Left) + Group Overlap & Calendar (Right) ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
        {/* 1. LEFT GRID: Your Availability (Free vs Busy) */}
        <div className="p-3.5 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] overflow-x-auto">
          <div className="flex items-center justify-between mb-2.5">
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[var(--text)]">
                1. Your Schedule ({userName})
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
                {(activePoll.dates || DEFAULT_DATES).map(dateStr => {
                  const [y, m, d] = dateStr.split('-').map(Number)
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
                const sampleIso = gridSlots[(activePoll.dates || DEFAULT_DATES)[0]]?.[`${r.hour}:${r.minute}`]
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
                    {(activePoll.dates || DEFAULT_DATES).map(dateStr => {
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
                2. Group Overlap Heatmap &amp; Club Calendar ({allParticipants.length} Responders)
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                Click any slot to inspect who is free/busy or book onto the ClubHub Calendar
              </p>
            </div>

            {/* Heatmap Legend */}
            <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
              <span>0/{allParticipants.length}</span>
              <span className="w-3 h-2.5 rounded-xs bg-[var(--bg-card)] border border-[var(--border)]" />
              <span className="w-3 h-2.5 rounded-xs bg-[rgba(34,197,94,0.28)]" />
              <span className="w-3 h-2.5 rounded-xs bg-[rgba(34,197,94,0.55)]" />
              <span className="w-3 h-2.5 rounded-xs bg-[rgba(22,163,74,0.92)]" />
              <span>{allParticipants.length}/{allParticipants.length}</span>
            </div>
          </div>

          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="p-1 text-left text-[10px] text-[var(--text-muted)] font-semibold w-20">
                  Local ({getTzShortName(detectedLocalTz)})
                </th>
                {(activePoll.dates || DEFAULT_DATES).map(dateStr => {
                  const [y, m, d] = dateStr.split('-').map(Number)
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
                const sampleIso = gridSlots[(activePoll.dates || DEFAULT_DATES)[0]]?.[`${r.hour}:${r.minute}`]
                const localLabel = sampleIso
                  ? formatSlotInTz(sampleIso, detectedLocalTz, { hour: 'numeric', minute: '2-digit' })
                  : r.label

                return (
                  <tr key={`${r.hour}:${r.minute}`}>
                    <td className="pr-1.5 py-0.5 text-[10px] text-[var(--text-muted)] whitespace-nowrap font-mono-num">
                      {r.minute === 0 ? localLabel : <span className="opacity-35">·</span>}
                    </td>
                    {(activePoll.dates || DEFAULT_DATES).map(dateStr => {
                      const iso = gridSlots[dateStr]?.[`${r.hour}:${r.minute}`]
                      const st = slotStatsMap[iso]
                      const count = st?.availableCount || 0
                      const total = st?.totalParticipants || 1
                      const ratio = count / total
                      const isSelected = activeSlotIso === iso
                      const calEvs = st?.calendarEvents || []

                      let bg = 'var(--bg-card)'
                      if (count > 0) {
                        const alpha = (0.18 + ratio * 0.78).toFixed(2)
                        bg = `rgba(22, 163, 74, ${alpha})`
                      }

                      return (
                        <td
                          key={iso}
                          onClick={() => setActiveSlotIso(iso)}
                          onMouseEnter={() => {
                            if (!isDragging) setActiveSlotIso(iso)
                          }}
                          className={`border border-[var(--border)] h-5 cursor-pointer transition-all text-center text-[9.5px] font-semibold relative ${
                            isSelected ? 'ring-2 ring-[var(--blue)] z-10' : ''
                          }`}
                          style={{
                            background: bg,
                            color: ratio > 0.5 ? '#fff' : 'var(--text)',
                          }}
                        >
                          {count > 0 && <span>{count}/{total}</span>}
                          {calEvs.length > 0 && (
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

      {/* ── Bottom Section: Slot Inspector + Best Collaboration Times & One-Click Calendar Booking ── */}
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
                  <BubbleTag
                    label={`${inspectedStats.availableCount}/${inspectedStats.totalParticipants} Available`}
                    color={inspectedStats.availableCount === inspectedStats.totalParticipants ? 'green' : 'blue'}
                    size="sm"
                  />
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
                  {/* Available Responders */}
                  <div className="p-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]">
                    <div className="text-[11px] font-semibold text-[var(--green)] mb-1.5">
                      ✅ Available ({inspectedStats.availableUsers.length})
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
                      <div className="text-[11px] text-[var(--text-muted)]">None selected yet</div>
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
                    📅 <strong>Existing ClubHub Calendar Event:</strong>{' '}
                    {inspectedStats.calendarEvents.map(e => `${e.clubName || e.clubId}: ${e.title}`).join(' · ')}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleBookMeeting(inspectedStats.iso)}
                className="w-full py-2 px-4 rounded-lg bg-[var(--blue)] text-white text-xs font-semibold border-none cursor-pointer hover:opacity-90 flex items-center justify-center gap-1.5"
              >
                <CalendarIcon size={13.5} />
                Book This Slot onto ClubHub Calendar
              </button>
            </>
          ) : (
            <div className="text-xs text-[var(--text-muted)]">
              Hover or click any slot on the heatmap to inspect group availability.
            </div>
          )}
        </div>

        {/* Best Overlapping Times for Collaboration */}
        <div className="p-4 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)]">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs sm:text-sm font-bold text-[var(--text)] inline-flex items-center gap-1.5">
              <Sparkles size={15} className="text-[var(--yellow)]" />
              Best Overlapping Times (You + Collaborating Clubs)
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              Auto-translated to {getTzShortName(detectedLocalTz)}
            </span>
          </div>

          {bestOverlaps.length > 0 ? (
            <div className="flex flex-col gap-2">
              {bestOverlaps.map(slot => (
                <div
                  key={slot.iso}
                  onClick={() => setActiveSlotIso(slot.iso)}
                  className="p-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-2 cursor-pointer hover:border-[var(--blue)] transition-colors"
                >
                  <div>
                    <div className="text-xs font-semibold text-[var(--text)]">
                      {formatSlotInTz(slot.iso, detectedLocalTz, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}{' '}
                      ({getTzShortName(detectedLocalTz)})
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {slot.availableUsers.map(u => u.clubName || u.userName).join(' · ')}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <BubbleTag
                      label={`${slot.availableCount}/${slot.totalParticipants} Free`}
                      color="green"
                      size="sm"
                    />
                    <button
                      type="button"
                      onClick={ev => {
                        ev.stopPropagation()
                        handleBookMeeting(slot.iso)
                      }}
                      className="px-3 py-1 rounded-full bg-[var(--blue)] text-white text-[11px] font-semibold border-none cursor-pointer hover:opacity-90"
                    >
                      Book
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-[var(--text-muted)] py-4">
              Mark more green Free slots on your grid (or type when you are free above) to see overlapping times with collaborating clubs!
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
