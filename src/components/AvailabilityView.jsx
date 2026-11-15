import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
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
  Share2,
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
const LOCAL_SLOTS_STORAGE_KEY = 'clubhub_availability_user_slots_v2'

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

function getWeekStartOfDate(dateStr, weekStartsOn = 'monday') {
  const { y, m, d } = parseDateParts(dateStr)
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const day = dt.getUTCDay() // 0 = Sun ... 6 = Sat
  if (weekStartsOn === 'sunday') {
    dt.setUTCDate(dt.getUTCDate() - day)
  } else {
    const diffToMon = day === 0 ? -6 : 1 - day
    dt.setUTCDate(dt.getUTCDate() + diffToMon)
  }
  return formatYmdUtc(dt)
}

function getWeekDatesFromStart(startYmd) {
  return Array.from({ length: 7 }, (_, i) => addDaysToYmd(startYmd, i))
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

function formatTimeFromIso(isoStr, use24h = false, extraOptions = {}) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: !use24h,
      ...extraOptions,
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

function loadStoredUserSlots(defaultUserId) {
  try {
    const raw = localStorage.getItem(LOCAL_SLOTS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const hydrated = {}
      for (const [k, arr] of Object.entries(parsed)) {
        if (Array.isArray(arr)) hydrated[k] = new Set(arr)
      }
      if (Object.keys(hydrated).length > 0) return hydrated
    }
  } catch {
    // Ignore storage read errors
  }

  return {
    [defaultUserId]: new Set([
      ...makeRangeSlots(DEFAULT_DATES[0], 14, 16.5),
      ...makeRangeSlots(DEFAULT_DATES[2], 14, 17),
    ]),
  }
}

export default function AvailabilityView({
  user = null,
  userSettings = {},
  events = [],
  onEventBooked,
  onAddLocalEvent,
  onRemoveLocalEvent,
  onOpenCalendar,
  onNotify,
}) {
  const use24h = userSettings?.timeFormat === '24h'
  const weekStartsOn = userSettings?.weekStartsOn === 'sunday' ? 'sunday' : 'monday'

  const defaultUserName =
    userSettings?.displayName?.trim() ||
    user?.fullName ||
    user?.primaryEmailAddress?.emailAddress?.split('@')[0] ||
    user?.email?.split('@')[0] ||
    'Jane Doe'

  const [polls, setPolls] = useState([FALLBACK_POLL])
  const [selectedPollId, setSelectedPollId] = useState(FALLBACK_POLL.id)
  const [weekAnchorDate, setWeekAnchorDate] = useState(BASE_MONDAY)
  const [mobileDay, setMobileDay] = useState(BASE_MONDAY)

  // 'mine' = click & drag my free blocks | 'group' = inspect group heatmap
  const [gridMode, setGridMode] = useState('mine')

  // Current responder identity (defaults to signed-in user; guest override optional)
  const [guestOverrideName, setGuestOverrideName] = useState('')
  const [showGuestForm, setShowGuestForm] = useState(false)
  const [guestInput, setGuestInput] = useState('')

  const activePersonName = guestOverrideName || defaultUserName
  const currentUserId = useMemo(() => toUserId(activePersonName), [activePersonName])

  // Spotlight filter: click a responder chip on the right to highlight their free blocks
  const [spotlightUserId, setSpotlightUserId] = useState(null)

  const [localSlotsByUser, setLocalSlotsByUser] = useState(() =>
    loadStoredUserSlots(toUserId(defaultUserName))
  )

  const myFreeSlots = useMemo(
    () => localSlotsByUser[currentUserId] || new Set(),
    [localSlotsByUser, currentUserId]
  )

  const [isDragging, setIsDragging] = useState(false)
  const [dragAdding, setDragAdding] = useState(true)
  const [autoSaveState, setAutoSaveState] = useState('saved') // 'saving' | 'saved'

  // Hovered or clicked slot for inspection
  const [hoveredSlotIso, setHoveredSlotIso] = useState(null)
  const [pinnedSlotIso, setPinnedSlotIso] = useState(null)
  const [durationMins, setDurationMins] = useState(60)
  const [bookingBusy, setBookingBusy] = useState(false)

  // New Poll inline drawer
  const [showNewPollForm, setShowNewPollForm] = useState(false)
  const [newPollTitle, setNewPollTitle] = useState('')
  const [newPollDate, setNewPollDate] = useState(BASE_MONDAY)
  const [newPollLocation, setNewPollLocation] = useState('')

  const saveTimerRef = useRef(null)

  const activePoll = useMemo(
    () => polls.find(p => p.id === selectedPollId) || polls[0] || FALLBACK_POLL,
    [polls, selectedPollId]
  )

  const weekStartYmd = useMemo(
    () => getWeekStartOfDate(weekAnchorDate, weekStartsOn),
    [weekAnchorDate, weekStartsOn]
  )

  const displayedWeekDates = useMemo(
    () => getWeekDatesFromStart(weekStartYmd),
    [weekStartYmd]
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

  // Persist localSlotsByUser to localStorage & auto-sync to backend after painting
  const persistAvailability = useCallback(
    (nextMap, targetUserId, targetName) => {
      try {
        const serializable = {}
        for (const [k, setVal] of Object.entries(nextMap)) {
          serializable[k] = Array.from(setVal)
        }
        localStorage.setItem(LOCAL_SLOTS_STORAGE_KEY, JSON.stringify(serializable))
      } catch {
        // Ignore storage errors
      }

      setAutoSaveState('saving')
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(async () => {
        const freeArr = Array.from(nextMap[targetUserId] || [])
        const updated = await saveSchedulerResponse(activePoll.id, {
          userId: targetUserId,
          userName: targetName,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ,
          freeSlots: freeArr,
          busySlots: [],
        })
        if (updated && updated.id) {
          setPolls(prev => prev.map(p => (p.id === updated.id ? updated : p)))
        }
        setAutoSaveState('saved')
      }, 450)
    },
    [activePoll.id]
  )

  useEffect(() => {
    const stopDrag = () => setIsDragging(false)
    window.addEventListener('mouseup', stopDrag)
    return () => {
      window.removeEventListener('mouseup', stopDrag)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!displayedWeekDates.includes(mobileDay)) {
      setMobileDay(displayedWeekDates[0])
    }
  }, [displayedWeekDates, mobileDay])

  // Parse hour bounds from User Settings (e.g. '9-19', '9-17', '8-21')
  const { startHour, endHour } = useMemo(() => {
    const pref = userSettings?.availabilityHours || '9-19'
    const [s, e] = String(pref).split('-').map(Number)
    if (!Number.isNaN(s) && !Number.isNaN(e) && e > s) {
      return { startHour: s, endHour: e }
    }
    return {
      startHour: activePoll.startHour ?? 9,
      endHour: Math.min(activePoll.endHour ?? 19, 21),
    }
  }, [userSettings?.availabilityHours, activePoll.startHour, activePoll.endHour])

  const timeRows = useMemo(() => {
    const rows = []
    for (let mins = startHour * 60; mins < endHour * 60; mins += 30) {
      rows.push({ hour: Math.floor(mins / 60), minute: mins % 60 })
    }
    return rows
  }, [startHour, endHour])

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

  // Combine poll responders + current user's live slots
  const allParticipants = useMemo(() => {
    const map = new Map()

    for (const r of activePoll.responses || []) {
      const cleanName = cleanText(r.userName || 'Member').replace(/\s*\([^)]*\)\s*$/, '')
      const uid = r.userId || toUserId(cleanName)
      const localOverride = localSlotsByUser[uid]
      map.set(uid, {
        userId: uid,
        userName: cleanName,
        clubName: r.clubName || '',
        freeSlots: localOverride ? Array.from(localOverride) : r.freeSlots || [],
      })
    }

    if (!map.has(currentUserId)) {
      map.set(currentUserId, {
        userId: currentUserId,
        userName: activePersonName,
        clubName: 'You',
        freeSlots: Array.from(myFreeSlots),
      })
    } else {
      const existing = map.get(currentUserId)
      map.set(currentUserId, {
        ...existing,
        userName: activePersonName,
        freeSlots: localSlotsByUser[currentUserId]
          ? Array.from(localSlotsByUser[currentUserId])
          : existing.freeSlots,
      })
    }

    for (const [uid, slotSet] of Object.entries(localSlotsByUser)) {
      if (!map.has(uid) && slotSet.size > 0) {
        map.set(uid, {
          userId: uid,
          userName: uid
            .replace(/^user_/, '')
            .split('_')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' '),
          clubName: 'Guest',
          freeSlots: Array.from(slotSet),
        })
      }
    }

    return Array.from(map.values())
  }, [activePoll.responses, localSlotsByUser, currentUserId, activePersonName, myFreeSlots])

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
        const unavailableUsers = allParticipants.filter(p => !(p.freeSlots || []).includes(iso))
        const otherAvailableCount = availableUsers.filter(p => p.userId !== currentUserId).length
        stats[iso] = {
          iso,
          dateStr: d,
          availableUsers,
          unavailableUsers,
          availableCount: availableUsers.length,
          otherAvailableCount,
          ratio: availableUsers.length / total,
          scheduledEvent: scheduledEventsBySlot[iso] || null,
        }
      }
    }
    return stats
  }, [displayedWeekDates, timeRows, gridSlots, allParticipants, currentUserId, scheduledEventsBySlot])

  // Merge contiguous 30-min slots into real human-readable meeting windows that fit `durationMins`!
  const bestMeetingWindows = useMemo(() => {
    const requiredSlots = Math.max(1, Math.round(durationMins / 30))
    const windows = []

    for (const d of displayedWeekDates) {
      const dayIsos = timeRows
        .map(r => gridSlots[d]?.[`${r.hour}:${r.minute}`])
        .filter(Boolean)

      // Walk through the day and group contiguous runs with identical high participant sets
      let i = 0
      while (i < dayIsos.length) {
        const startIso = dayIsos[i]
        const startStat = slotStatsMap[startIso]
        if (!startStat || startStat.availableCount === 0) {
          i += 1
          continue
        }

        const startKey = startStat.availableUsers
          .map(u => u.userId)
          .sort()
          .join(',')

        let j = i + 1
        while (j < dayIsos.length) {
          const nextStat = slotStatsMap[dayIsos[j]]
          if (!nextStat || nextStat.availableCount === 0) break
          const nextKey = nextStat.availableUsers
            .map(u => u.userId)
            .sort()
            .join(',')
          if (nextKey !== startKey) break
          j += 1
        }

        const runLength = j - i
        if (runLength >= requiredSlots) {
          const windowStartMs = new Date(startIso).getTime()
          const windowEndMs = windowStartMs + runLength * 30 * 60 * 1000
          const windowEndIso = new Date(windowEndMs).toISOString()

          // Check if any slot inside this window already has a scheduled event
          let existingScheduled = null
          let existingSlotIso = startIso
          for (let k = i; k < j; k += 1) {
            const ev = slotStatsMap[dayIsos[k]]?.scheduledEvent
            if (ev) {
              existingScheduled = ev
              existingSlotIso = dayIsos[k]
              break
            }
          }

          windows.push({
            id: `${d}_${startIso}`,
            dateStr: d,
            startIso,
            endIso: windowEndIso,
            totalMinutes: runLength * 30,
            availableCount: startStat.availableCount,
            availableUsers: startStat.availableUsers,
            scheduledEvent: existingScheduled,
            scheduledSlotIso: existingSlotIso,
          })
        }

        i = j
      }
    }

    return windows
      .sort(
        (a, b) =>
          b.availableCount - a.availableCount ||
          b.totalMinutes - a.totalMinutes ||
          a.startIso.localeCompare(b.startIso)
      )
      .slice(0, 5)
  }, [displayedWeekDates, timeRows, gridSlots, slotStatsMap, durationMins])

  const inspectedSlot = useMemo(() => {
    const activeIso = hoveredSlotIso || pinnedSlotIso
    if (activeIso && slotStatsMap[activeIso]) {
      return slotStatsMap[activeIso]
    }
    const topWindow = bestMeetingWindows[0]
    if (topWindow && slotStatsMap[topWindow.startIso]) {
      return slotStatsMap[topWindow.startIso]
    }
    return null
  }, [hoveredSlotIso, pinnedSlotIso, slotStatsMap, bestMeetingWindows])

  const spotlightSet = useMemo(() => {
    if (!spotlightUserId) return null
    const person = allParticipants.find(p => p.userId === spotlightUserId)
    return person ? new Set(person.freeSlots || []) : null
  }, [spotlightUserId, allParticipants])

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

  function applySlotsForCurrentUser(updater) {
    setLocalSlotsByUser(prev => {
      const currentSet = new Set(prev[currentUserId] || [])
      const updatedSet = updater(currentSet)
      const nextMap = { ...prev, [currentUserId]: updatedSet }
      persistAvailability(nextMap, currentUserId, activePersonName)
      return nextMap
    })
  }

  function handleCellMouseDown(iso) {
    setPinnedSlotIso(iso)
    if (gridMode !== 'mine') return
    const willAdd = !myFreeSlots.has(iso)
    setDragAdding(willAdd)
    setIsDragging(true)
    applySlotsForCurrentUser(set => {
      if (willAdd) set.add(iso)
      else set.delete(iso)
      return set
    })
  }

  function handleCellMouseEnter(iso) {
    setHoveredSlotIso(iso)
    if (!isDragging || gridMode !== 'mine') return
    applySlotsForCurrentUser(set => {
      if (dragAdding) set.add(iso)
      else set.delete(iso)
      return set
    })
  }

  function handleMobileSlotTap(iso) {
    setPinnedSlotIso(iso)
    if (gridMode === 'mine') {
      const willAdd = !myFreeSlots.has(iso)
      applySlotsForCurrentUser(set => {
        if (willAdd) set.add(iso)
        else set.delete(iso)
        return set
      })
    }
  }

  function handleFillWeekdayAfternoons() {
    const baseTz = activePoll.baseTimezone || DEFAULT_TZ
    applySlotsForCurrentUser(set => {
      displayedWeekDates.forEach(d => {
        const { y, m, d: dayNum } = parseDateParts(d)
        const dow = new Date(Date.UTC(y, m - 1, dayNum, 12, 0, 0)).getUTCDay()
        if (dow >= 1 && dow <= 5) {
          makeRangeSlots(d, Math.max(startHour, 13), Math.min(endHour, 17), baseTz).forEach(s =>
            set.add(s)
          )
        }
      })
      return set
    })
    if (onNotify) {
      onNotify('Filled weekday afternoons (1–5 PM) and auto-saved.')
    }
  }

  function handleClearMyTimes() {
    applySlotsForCurrentUser(() => new Set())
    if (onNotify) {
      onNotify(`Cleared ${activePersonName}'s marked hours.`, { type: 'info' })
    }
  }

  function handleAddGuestSubmit(e) {
    e.preventDefault()
    const trimmed = guestInput.trim()
    if (!trimmed) return
    const uid = toUserId(trimmed)
    setLocalSlotsByUser(prev => ({
      ...prev,
      [uid]: prev[uid] || new Set(),
    }))
    setGuestOverrideName(trimmed)
    setGuestInput('')
    setShowGuestForm(false)
    setGridMode('mine')
    setSpotlightUserId(null)
    if (onNotify) {
      onNotify(`Now marking availability as guest "${trimmed}".`)
    }
  }

  async function handleCopyShareLink() {
    const shareUrl = `${window.location.origin}${window.location.pathname}?poll=${encodeURIComponent(activePoll.id)}`
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      // Clipboard fallback ignored
    }
    if (onNotify) {
      onNotify('Copied poll invite link to clipboard!')
    }
  }

  async function handleCreatePollSubmit(e) {
    e.preventDefault()
    if (!newPollTitle.trim()) return

    const startDay = getWeekStartOfDate(newPollDate || BASE_MONDAY, weekStartsOn)
    const weekDates = getWeekDatesFromStart(startDay)
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
    setWeekAnchorDate(startDay)
    setMobileDay(startDay)
    setNewPollTitle('')
    setNewPollLocation('')
    setShowNewPollForm(false)
    setGridMode('mine')
    if (onNotify) {
      onNotify(`Created poll "${pollObj.title}". Click or drag when you're free!`)
    }
  }

  async function handleScheduleSlot(slotIso) {
    if (!slotIso) return
    setBookingBusy(true)
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
    setBookingBusy(false)

    if (res && res.booked && res.poll) {
      setPolls(prev => prev.map(p => (p.id === res.poll.id ? res.poll : p)))
      if (onEventBooked) await onEventBooked()
    } else {
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

    if (onNotify) {
      onNotify(
        `Scheduled "${activePoll.title}" for ${formatTimeFromIso(slotIso, use24h, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })}`,
        {
          actionLabel: onOpenCalendar ? 'Open Calendar' : undefined,
          onAction: onOpenCalendar,
        }
      )
    }
  }

  async function handleCancelScheduledSlot(slotIso, existingEvent) {
    setBookingBusy(true)
    const eventId = existingEvent?.id
    const res = await unbookSchedulerSlot(activePoll.id, {
      eventId,
      start: slotIso,
      userId: currentUserId,
    })
    setBookingBusy(false)

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

    if (onNotify) {
      onNotify('Removed scheduled meeting from Calendar.', { type: 'info' })
    }
  }

  return (
    <div className="space-y-5">
      {/* ── 1. Clean Poll Switcher & Meeting Setup Bar ── */}
      <Card className="p-4 sm:p-5" delay={1}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
          {/* Poll Pills */}
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {polls.map(p => {
              const isSelected = p.id === activePoll.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelectedPollId(p.id)
                    setSpotlightUserId(null)
                  }}
                  className={`px-3.5 min-h-[38px] rounded-xl text-xs sm:text-[13px] font-semibold border cursor-pointer transition-all truncate max-w-full ${
                    isSelected
                      ? 'bg-[var(--blue)] text-white border-[var(--blue)] shadow-2xs'
                      : 'bg-[var(--bg-surface)] text-[var(--text)] border-[var(--border)] hover:border-[var(--blue)]'
                  }`}
                >
                  {cleanText(p.title)}
                </button>
              )
            })}

            <button
              type="button"
              onClick={() => setShowNewPollForm(prev => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                showNewPollForm
                  ? 'bg-[var(--bg-subtle)] text-[var(--text)] border-[var(--border-strong)]'
                  : 'bg-transparent text-[var(--blue-ink)] border-dashed border-[var(--border-strong)] hover:border-[var(--blue)] hover:bg-[var(--blue-light)]'
              }`}
            >
              {showNewPollForm ? <X size={14} /> : <Plus size={14} />}
              <span>{showNewPollForm ? 'Cancel' : 'New Poll'}</span>
            </button>
          </div>

          {/* Right Controls: Meeting Duration + Share Link */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {activePoll.location && (
              <BubbleTag label={activePoll.location} color="teal" size="md" />
            )}

            <div className="inline-flex items-center gap-1 bg-[var(--bg-surface)] p-1 rounded-xl border border-[var(--border)]">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] px-2">
                Length:
              </span>
              {[30, 60, 90, 120].map(mins => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setDurationMins(mins)}
                  className={`px-2.5 min-h-[28px] rounded-lg text-xs font-semibold cursor-pointer border-none transition-colors ${
                    durationMins === mins
                      ? 'bg-[var(--bg-card)] text-[var(--blue-ink)] shadow-2xs'
                      : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {mins === 30 ? '30m' : `${mins / 60}h`}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleCopyShareLink}
              className="inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text)] border border-[var(--border)] cursor-pointer transition-colors"
            >
              <Share2 size={13} className="text-[var(--blue)]" />
              <span>Share</span>
            </button>
          </div>
        </div>

        {/* New Poll Drawer */}
        {showNewPollForm && (
          <form
            onSubmit={handleCreatePollSubmit}
            className="mt-4 pt-4 border-t border-[var(--border)] space-y-3.5 fade-in"
          >
            <div className="text-sm font-bold text-[var(--text)]">Create New Availability Poll</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                  Meeting Title
                </label>
                <input
                  type="text"
                  required
                  value={newPollTitle}
                  onChange={e => setNewPollTitle(e.target.value)}
                  placeholder="e.g. Officer Weekly Sync"
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
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
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                  Location or Room
                </label>
                <input
                  type="text"
                  value={newPollLocation}
                  onChange={e => setNewPollLocation(e.target.value)}
                  placeholder="e.g. Baskin 152 or Zoom"
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
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
      </Card>

      {/* ── 2. Main Interactive Grid + Right Best-Windows & Responders Panel ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.68fr_1fr] gap-5 items-start">
        {/* LEFT: Intuitive Auto-Saving Availability Grid */}
        <Card className="p-4 sm:p-6 select-none" delay={2}>
          {/* Mode & Week Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-3.5 border-b border-[var(--border)]">
            {/* Segmented Step Switcher */}
            <div className="inline-flex items-center bg-[var(--bg-surface)] p-1 rounded-xl border border-[var(--border)] self-start">
              <button
                type="button"
                onClick={() => {
                  setGridMode('mine')
                  setSpotlightUserId(null)
                }}
                className={`px-3.5 min-h-[36px] rounded-lg text-xs sm:text-[13px] font-semibold border-none cursor-pointer transition-all ${
                  gridMode === 'mine'
                    ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
                    : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                1. Mark My Times ({myFreeSlots.size})
              </button>
              <button
                type="button"
                onClick={() => setGridMode('group')}
                className={`px-3.5 min-h-[36px] rounded-lg text-xs sm:text-[13px] font-semibold border-none cursor-pointer transition-all ${
                  gridMode === 'group'
                    ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
                    : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                2. Group Heatmap ({allParticipants.length})
              </button>
            </div>

            {/* Week Navigation */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setWeekAnchorDate(prev => addDaysToYmd(prev, -7))}
                aria-label="Previous week"
                className="w-9 h-9 rounded-xl bg-[var(--bg-surface)] text-[var(--text)] border border-[var(--border)] flex items-center justify-center cursor-pointer hover:border-[var(--blue)]"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs sm:text-sm font-bold text-[var(--text)] px-1">{weekLabel}</span>
              <button
                type="button"
                onClick={() => setWeekAnchorDate(prev => addDaysToYmd(prev, 7))}
                aria-label="Next week"
                className="w-9 h-9 rounded-xl bg-[var(--bg-surface)] text-[var(--text)] border border-[var(--border)] flex items-center justify-center cursor-pointer hover:border-[var(--blue)]"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Contextual Sub-Toolbar: Identity + Quick Helpers + Auto-Save Indicator */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            {gridMode === 'mine' ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                <span>
                  Marking as <strong className="text-[var(--text)]">{activePersonName}</strong>
                </span>
                {guestOverrideName ? (
                  <button
                    type="button"
                    onClick={() => setGuestOverrideName('')}
                    className="text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer"
                  >
                    Switch back to {defaultUserName}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowGuestForm(prev => !prev)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer"
                  >
                    <UserPlus size={12} />
                    <span>{showGuestForm ? 'Cancel' : 'Add Guest'}</span>
                  </button>
                )}

                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--green-light)] text-[var(--green-ink)] text-[11px] font-semibold">
                  <Check size={11} />
                  <span>{autoSaveState === 'saving' ? 'Saving…' : 'Auto-saved'}</span>
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                <span>
                  Darker green = more members free. Hover or click any slot to see who can make it.
                </span>
                {spotlightUserId && (
                  <button
                    type="button"
                    onClick={() => setSpotlightUserId(null)}
                    className="text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer"
                  >
                    Clear responder highlight
                  </button>
                )}
              </div>
            )}

            {gridMode === 'mine' && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleFillWeekdayAfternoons}
                  className="px-2.5 min-h-[30px] rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[11.5px] font-semibold text-[var(--text)] border border-[var(--border)] cursor-pointer transition-colors"
                >
                  Fill 1–5 PM
                </button>
                {myFreeSlots.size > 0 && (
                  <button
                    type="button"
                    onClick={handleClearMyTimes}
                    className="px-2.5 min-h-[30px] rounded-lg bg-transparent text-[11.5px] font-semibold text-[var(--text-muted)] hover:text-[var(--red-ink)] border-none cursor-pointer"
                  >
                    Clear Mine
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Optional Add Guest Responder Bar */}
          {showGuestForm && gridMode === 'mine' && (
            <form
              onSubmit={handleAddGuestSubmit}
              className="mb-4 p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] flex flex-col sm:flex-row gap-2 fade-in"
            >
              <input
                type="text"
                autoFocus
                required
                value={guestInput}
                onChange={e => setGuestInput(e.target.value)}
                placeholder="Teammate or guest name (e.g. Jordan Chen)"
                className="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              />
              <button
                type="submit"
                className="px-4 min-h-[42px] rounded-xl bg-[var(--blue)] text-white border-none text-xs sm:text-sm font-semibold cursor-pointer"
              >
                Mark Guest Hours
              </button>
            </form>
          )}

          {/* ── MOBILE VIEW (< md): 7-Day Selector + Chronological Top-to-Bottom Time Slots ── */}
          <div className="md:hidden space-y-3.5">
            <div className="grid grid-cols-7 gap-1">
              {displayedWeekDates.map(ymd => {
                const { y, m, d } = parseDateParts(ymd)
                const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
                const dayNarrow = dt.toLocaleDateString('en-US', {
                  weekday: 'narrow',
                  timeZone: 'UTC',
                })
                const isSelected = mobileDay === ymd
                const dayFreeCount = timeRows.filter(r => {
                  const iso = gridSlots[ymd]?.[`${r.hour}:${r.minute}`]
                  return gridMode === 'mine'
                    ? myFreeSlots.has(iso)
                    : (slotStatsMap[iso]?.availableCount || 0) > 0
                }).length

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
                        dayFreeCount > 0
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

            {/* Chronological Single-Column List (Easy Top-to-Bottom Scanning, Zero Scrollbars) */}
            <div className="flex flex-col gap-1.5">
              {timeRows.map(r => {
                const iso = gridSlots[mobileDay]?.[`${r.hour}:${r.minute}`]
                const endIso = iso
                  ? new Date(new Date(iso).getTime() + 30 * 60 * 1000).toISOString()
                  : ''
                const isMine = myFreeSlots.has(iso)
                const stat = slotStatsMap[iso]
                const count = stat?.availableCount || 0
                const otherCount = stat?.otherAvailableCount || 0
                const isInspected = inspectedSlot?.iso === iso
                const isSpotlit = spotlightSet ? spotlightSet.has(iso) : false

                let rowStyle =
                  'bg-[var(--bg-surface)] text-[var(--text)] border-[var(--border)]'
                if (gridMode === 'mine' && isMine) {
                  rowStyle = 'bg-[var(--green)] text-white border-[var(--green)] shadow-2xs'
                } else if (gridMode === 'group' && count > 0) {
                  rowStyle =
                    'bg-[var(--green-light)] text-[var(--green-ink)] border-[var(--green)]/40'
                }

                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => handleMobileSlotTap(iso)}
                    className={`w-full min-h-[44px] px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer transition-all ${rowStyle} ${
                      isInspected && gridMode === 'group' ? 'ring-2 ring-[var(--blue)]' : ''
                    } ${isSpotlit ? 'ring-2 ring-[var(--blue)]' : ''}`}
                  >
                    <span className="font-mono-num">
                      {formatTimeFromIso(iso, use24h)} – {formatTimeFromIso(endIso, use24h)}
                    </span>

                    <div className="flex items-center gap-2 shrink-0">
                      {stat?.scheduledEvent && (
                        <span className="px-2 py-0.5 rounded-full bg-[var(--blue-light)] text-[var(--blue-ink)] text-[10px] font-bold">
                          Scheduled
                        </span>
                      )}

                      {gridMode === 'mine' ? (
                        isMine ? (
                          <span className="inline-flex items-center gap-1 font-bold">
                            <Check size={14} /> Free
                          </span>
                        ) : otherCount > 0 ? (
                          <span className="text-[11px] text-[var(--text-muted)]">
                            {otherCount} teammate{otherCount === 1 ? '' : 's'} free
                          </span>
                        ) : (
                          <span className="text-[11px] text-[var(--text-light)]">Tap if free</span>
                        )
                      ) : (
                        <span className="text-xs font-bold font-mono-num">
                          {count}/{allParticipants.length} free
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── DESKTOP / TABLET VIEW (md+): Crisp 7-Day Interactive Grid ── */}
          <div
            className="hidden md:block"
            onMouseLeave={() => setHoveredSlotIso(null)}
          >
            <table className="w-full table-fixed border-collapse text-xs">
              <thead>
                <tr>
                  <th className="w-[68px] pb-2.5 pr-2 text-right text-[11px] font-semibold text-[var(--text-muted)]">
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
                        className="pb-2.5 px-1 text-center font-semibold text-[var(--text)]"
                      >
                        <div className="text-xs font-bold">{dayShort}</div>
                        <div className="text-[11px] font-normal text-[var(--text-muted)]">
                          {m}/{d}
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {timeRows.map((r, rowIdx) => {
                  const sampleIso = gridSlots[displayedWeekDates[0]]?.[`${r.hour}:${r.minute}`]
                  const timeLabel = sampleIso ? formatTimeFromIso(sampleIso, use24h) : `${r.hour}:00`
                  const isFullHour = r.minute === 0
                  const isLastRow = rowIdx === timeRows.length - 1

                  return (
                    <tr key={`${r.hour}:${r.minute}`}>
                      <td className="pr-2.5 py-0 text-right align-top text-[10.5px] text-[var(--text-muted)] font-mono-num whitespace-nowrap">
                        {isFullHour ? (
                          <span className="-mt-1.5 inline-block">{timeLabel}</span>
                        ) : null}
                      </td>
                      {displayedWeekDates.map(dateStr => {
                        const iso = gridSlots[dateStr]?.[`${r.hour}:${r.minute}`]
                        const isMine = myFreeSlots.has(iso)
                        const stat = slotStatsMap[iso]
                        const count = stat?.availableCount || 0
                        const otherCount = stat?.otherAvailableCount || 0
                        const ratio = stat?.ratio || 0
                        const isInspected = inspectedSlot?.iso === iso
                        const isSpotlit = spotlightSet ? spotlightSet.has(iso) : false
                        const isBooked = Boolean(stat?.scheduledEvent)

                        let bg = 'var(--bg-surface)'
                        let textColor = 'var(--text-muted)'

                        if (gridMode === 'mine') {
                          if (isMine) {
                            bg = 'var(--green)'
                            textColor = '#ffffff'
                          } else if (otherCount > 0) {
                            bg = 'var(--green-light)'
                            textColor = 'var(--green-ink)'
                          }
                        } else if (count > 0) {
                          const alpha = (0.18 + ratio * 0.74).toFixed(2)
                          bg = `rgba(16, 185, 129, ${alpha})`
                          textColor = ratio >= 0.55 ? '#ffffff' : 'var(--text)'
                        }

                        return (
                          <td
                            key={iso}
                            onMouseDown={() => handleCellMouseDown(iso)}
                            onMouseEnter={() => handleCellMouseEnter(iso)}
                            onClick={() => setPinnedSlotIso(iso)}
                            title={`${formatTimeFromIso(iso, use24h, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            })} — ${count}/${allParticipants.length} free`}
                            className={`h-[26px] border-x border-[var(--border)] ${
                              isFullHour
                                ? 'border-t border-t-[var(--border-strong)]'
                                : 'border-t border-dashed border-t-[var(--border)]'
                            } ${isLastRow ? 'border-b border-b-[var(--border-strong)]' : ''}
                              cursor-pointer text-center text-[10.5px] font-semibold transition-colors ${
                                isSpotlit
                                  ? 'ring-2 ring-[var(--blue)] relative z-10'
                                  : isInspected && gridMode === 'group'
                                    ? 'ring-1.5 ring-[var(--blue)] relative z-10'
                                    : ''
                              }`}
                            style={{ background: bg, color: textColor }}
                          >
                            {isBooked ? (
                              <span className="inline-block px-1 rounded bg-[var(--blue)] text-white text-[9.5px] font-bold leading-tight">
                                Booked
                              </span>
                            ) : gridMode === 'mine' ? (
                              isMine ? (
                                '✓'
                              ) : otherCount > 0 ? (
                                <span className="text-[9.5px] opacity-80">{otherCount}</span>
                              ) : (
                                ''
                              )
                            ) : count > 0 ? (
                              `${count}/${allParticipants.length}`
                            ) : (
                              ''
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Simple Visual Legend */}
            <div className="mt-3.5 pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
              {gridMode === 'mine' ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-[var(--green)] inline-block" />
                    <span>You are free</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-[var(--green-light)] border border-[var(--green)]/40 inline-block" />
                    <span>Teammates free (number = count)</span>
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span>Fewer</span>
                  {[0.2, 0.42, 0.68, 0.92].map(a => (
                    <span
                      key={a}
                      className="w-3.5 h-3.5 rounded inline-block"
                      style={{ background: `rgba(16, 185, 129, ${a})` }}
                    />
                  ))}
                  <span>Everyone free</span>
                </div>
              )}

              {inspectedSlot && (
                <span className="font-semibold text-[var(--text)] font-mono-num">
                  {formatTimeFromIso(inspectedSlot.iso, use24h, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}{' '}
                  · {inspectedSlot.availableCount}/{allParticipants.length} free
                </span>
              )}
            </div>
          </div>
        </Card>

        {/* RIGHT: 1) Merged Best Meeting Windows + 2) Responders & Slot Breakdown */}
        <div className="space-y-4">
          {/* Card 1: Best Meeting Windows (Contiguous Ranges + 1-Click Schedule!) */}
          <Card className="p-4 sm:p-5" delay={3}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-[var(--yellow)] shrink-0" />
                <h3 className="text-sm font-bold text-[var(--text)]">Best Meeting Windows</h3>
              </div>
              <BubbleTag
                label={`${durationMins === 30 ? '30m' : `${durationMins / 60}h`} fit`}
                color="blue"
                size="sm"
              />
            </div>
            <p className="text-xs text-[var(--text-muted)] mb-3.5">
              Top overlapping blocks where members can meet for at least{' '}
              {durationMins === 30 ? '30 mins' : `${durationMins} mins`}.
            </p>

            {bestMeetingWindows.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {bestMeetingWindows.map(win => {
                  const dayLabel = formatTimeFromIso(win.startIso, use24h, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  }).replace(/,?\s*\d{1,2}:\d{2}.*$/, '')
                  const startClock = formatTimeFromIso(win.startIso, use24h)
                  const endClock = formatTimeFromIso(win.endIso, use24h)
                  const isEveryone = win.availableCount === allParticipants.length

                  return (
                    <div
                      key={win.id}
                      onMouseEnter={() => setHoveredSlotIso(win.startIso)}
                      onMouseLeave={() => setHoveredSlotIso(null)}
                      onClick={() => setPinnedSlotIso(win.startIso)}
                      className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] hover:border-[var(--blue)]/60 transition-colors space-y-2.5 cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs sm:text-[13px] font-bold text-[var(--text)]">
                            {dayLabel} · {startClock} – {endClock}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                            {win.availableUsers.map(u => u.userName).join(', ')}
                          </div>
                        </div>

                        <BubbleTag
                          label={
                            isEveryone
                              ? `All ${win.availableCount} Free`
                              : `${win.availableCount}/${allParticipants.length} Free`
                          }
                          color="green"
                          size="sm"
                        />
                      </div>

                      {win.scheduledEvent ? (
                        <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[var(--border-subtle)]">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--blue-ink)]">
                            <Check size={13} /> Scheduled on Calendar
                          </span>
                          <div className="flex items-center gap-2">
                            {onOpenCalendar && (
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation()
                                  onOpenCalendar()
                                }}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer"
                              >
                                <span>View</span>
                                <ArrowRight size={12} />
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={bookingBusy}
                              onClick={e => {
                                e.stopPropagation()
                                handleCancelScheduledSlot(
                                  win.scheduledSlotIso,
                                  win.scheduledEvent
                                )
                              }}
                              className="inline-flex items-center gap-1 px-2.5 min-h-[30px] rounded-lg bg-[var(--red-light)] text-[var(--red-ink)] text-[11px] font-semibold border-none cursor-pointer hover:opacity-85"
                            >
                              <Trash2 size={11} />
                              <span>Cancel</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            disabled={bookingBusy}
                            onClick={e => {
                              e.stopPropagation()
                              handleScheduleSlot(win.startIso)
                            }}
                            className="inline-flex items-center gap-1.5 px-3.5 min-h-[34px] rounded-lg bg-[var(--blue)] text-white text-xs font-semibold border-none cursor-pointer hover:opacity-90 transition-opacity"
                          >
                            <CalendarPlus size={13} />
                            <span>
                              Schedule ({startClock},{' '}
                              {durationMins === 30 ? '30m' : `${durationMins / 60}h`})
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="py-5 px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-center text-xs text-[var(--text-muted)]">
                No {durationMins}-minute overlapping block found yet for this week. Mark more hours
                or switch Length to 30m.
              </div>
            )}
          </Card>

          {/* Card 2: Responders Spotlight & Selected Slot Breakdown */}
          <Card className="p-4 sm:p-5 space-y-4" delay={4}>
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Users size={15} className="text-[var(--blue)] shrink-0" />
                  <h3 className="text-sm font-bold text-[var(--text)]">
                    Responders ({allParticipants.length})
                  </h3>
                </div>
                <span className="text-[11px] text-[var(--text-muted)]">
                  Click to highlight
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {allParticipants.map(p => {
                  const isSpotlit = spotlightUserId === p.userId
                  const isMe = p.userId === currentUserId
                  return (
                    <button
                      key={p.userId}
                      type="button"
                      onClick={() =>
                        setSpotlightUserId(prev => (prev === p.userId ? null : p.userId))
                      }
                      className={`px-3 min-h-[32px] rounded-full text-xs font-semibold cursor-pointer border transition-all ${
                        isSpotlit
                          ? 'bg-[var(--blue)] text-white border-[var(--blue)]'
                          : 'bg-[var(--bg-surface)] text-[var(--text)] border-[var(--border)] hover:border-[var(--blue)]'
                      }`}
                    >
                      {p.userName}
                      {isMe ? ' (You)' : ''} · {(p.freeSlots || []).length}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Hovered / Selected Single-Slot Breakdown */}
            {inspectedSlot && (
              <div className="pt-3.5 border-t border-[var(--border)] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text)]">
                    <Clock size={13} className="text-[var(--blue)]" />
                    {formatTimeFromIso(inspectedSlot.iso, use24h, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>

                  {!inspectedSlot.scheduledEvent && (
                    <button
                      type="button"
                      disabled={bookingBusy}
                      onClick={() => handleScheduleSlot(inspectedSlot.iso)}
                      className="text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer"
                    >
                      Schedule this slot &rarr;
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)]">
                    <div className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--green-ink)] mb-1">
                      Free ({inspectedSlot.availableUsers.length})
                    </div>
                    {inspectedSlot.availableUsers.length > 0 ? (
                      <div className="space-y-0.5 text-[11.5px] text-[var(--text)]">
                        {inspectedSlot.availableUsers.map(u => (
                          <div key={u.userId} className="truncate">
                            ✓ {u.userName}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-[var(--text-light)]">None</div>
                    )}
                  </div>

                  <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)]">
                    <div className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--text-muted)] mb-1">
                      Busy ({inspectedSlot.unavailableUsers.length})
                    </div>
                    {inspectedSlot.unavailableUsers.length > 0 ? (
                      <div className="space-y-0.5 text-[11.5px] text-[var(--text-muted)]">
                        {inspectedSlot.unavailableUsers.map(u => (
                          <div key={u.userId} className="truncate">
                            — {u.userName}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-[var(--green-ink)] font-medium">
                        Everyone free!
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
