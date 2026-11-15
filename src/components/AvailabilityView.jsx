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
  MapPin,
  RotateCcw,
  X,
  Mail,
} from 'lucide-react'
import { Card, BubbleTag, Avatar, cleanText } from './ui'
import { PlatformIcon } from './icons'
import {
  getSchedulerPolls,
  createSchedulerPoll,
  saveSchedulerResponse,
  bookSchedulerSlot,
  unbookSchedulerSlot,
} from '../api/client'
import {
  dispatchDiscordNotification,
  dispatchEmailNotification,
} from '../utils/directIntegrations'

const BASE_MONDAY = '2026-11-16'
const DEFAULT_TZ = 'America/Los_Angeles'
const LOCAL_SLOTS_STORAGE_KEY = 'clubhub_availability_user_slots_v2'
const CUSTOM_POLLS_STORAGE_KEY = 'clubhub_custom_polls_v1'
const PENDING_POLL_SESSION_KEY = 'clubhub_pending_poll_id'

const RESPONDER_GRADIENTS = [
  'linear-gradient(135deg, var(--blue), var(--teal))',
  'linear-gradient(135deg, var(--purple), var(--blue))',
  'linear-gradient(135deg, var(--teal), var(--green))',
  'linear-gradient(135deg, var(--yellow), var(--red))',
  'linear-gradient(135deg, var(--green), var(--blue))',
]

function getInitials(name) {
  return (
    String(name || 'MB')
      .split(' ')
      .filter(Boolean)
      .map(w => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'MB'
  )
}

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

function formatHoursFromSlots(slotCount) {
  const count = Number(slotCount) || 0
  if (count <= 0) return '0h'
  if (count === 1) return '30m'
  const hours = count * 0.5
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`
}

function formatDurationShort(mins) {
  if (mins === 30) return '30m'
  const hrs = mins / 60
  return Number.isInteger(hrs) ? `${hrs}h` : `${hrs}h`
}

function formatDurationProse(mins) {
  if (mins === 30) return '30-min'
  if (mins === 60) return '1-hour'
  if (mins === 90) return '1.5-hour'
  if (mins === 120) return '2-hour'
  return `${mins}-min`
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

const STARTER_DEMO_SLOTS = [
  ...makeRangeSlots(DEFAULT_DATES[0], 14, 16.5),
  ...makeRangeSlots(DEFAULT_DATES[2], 14, 17),
]

function loadStoredSlotsByPoll(defaultUserId, isDemo = false) {
  if (!isDemo && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_SLOTS_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          if (parsed.byPoll && typeof parsed.byPoll === 'object') {
            const byPoll = {}
            for (const [pollId, userMap] of Object.entries(parsed.byPoll)) {
              if (userMap && typeof userMap === 'object') {
                byPoll[pollId] = {}
                for (const [uid, arr] of Object.entries(userMap)) {
                  if (Array.isArray(arr)) byPoll[pollId][uid] = new Set(arr)
                }
              }
            }
            return { byPoll, fromStorage: true }
          }

          // Migrate legacy flat { [userId]: [...slots] } map
          const migrated = {}
          for (const [uid, arr] of Object.entries(parsed)) {
            if (Array.isArray(arr)) migrated[uid] = new Set(arr)
          }
          if (Object.keys(migrated).length > 0) {
            return {
              byPoll: { [FALLBACK_POLL.id]: migrated },
              fromStorage: true,
            }
          }
        }
      }
    } catch {
      // Ignore storage read errors
    }
  }

  return {
    byPoll: {
      [FALLBACK_POLL.id]: {
        [defaultUserId]: new Set(STARTER_DEMO_SLOTS),
      },
    },
    fromStorage: false,
  }
}

function serializeSlotsByPoll(byPoll) {
  const out = {}
  for (const [pollId, userMap] of Object.entries(byPoll || {})) {
    if (!userMap || typeof userMap !== 'object') continue
    out[pollId] = {}
    for (const [uid, setVal] of Object.entries(userMap)) {
      out[pollId][uid] = Array.from(setVal || [])
    }
  }
  return { byPoll: out }
}

function getInitialRequestedPollId() {
  if (typeof window === 'undefined') return null
  try {
    const urlPoll = new URLSearchParams(window.location.search).get('poll')
    if (urlPoll) return urlPoll
    return sessionStorage.getItem(PENDING_POLL_SESSION_KEY) || null
  } catch {
    return null
  }
}

function loadStoredCustomPolls(isDemo = false) {
  if (isDemo || typeof localStorage === 'undefined') return [FALLBACK_POLL]
  try {
    const raw = localStorage.getItem(CUSTOM_POLLS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed) && parsed.length > 0) {
      const hasFallback = parsed.some(p => p?.id === FALLBACK_POLL.id)
      return hasFallback ? parsed : [...parsed, FALLBACK_POLL]
    }
  } catch {
    // Ignore storage errors
  }
  return [FALLBACK_POLL]
}

export default function AvailabilityView({
  user = null,
  accountKey = 'guest',
  isDemo = false,
  userSettings = {},
  events = [],
  onEventBooked,
  onAddLocalEvent,
  onRemoveLocalEvent,
  onOpenCalendar,
  onOpenSettings,
  onPageContextChange,
  onNotify,
}) {
  const isCompact = Boolean(userSettings?.compactCards)
  const use24h = userSettings?.timeFormat === '24h'
  const weekStartsOn = userSettings?.weekStartsOn === 'sunday' ? 'sunday' : 'monday'
  const effectiveUser = isDemo ? null : user

  const defaultUserName =
    userSettings?.displayName?.trim() ||
    effectiveUser?.fullName ||
    effectiveUser?.primaryEmailAddress?.emailAddress?.split('@')[0] ||
    effectiveUser?.email?.split('@')[0] ||
    (isDemo ? 'Demo Guest' : 'Student')

  const signedInUserId = useMemo(() => toUserId(defaultUserName), [defaultUserName])
  const signedInAvatarBg =
    userSettings?.avatarBg ||
    effectiveUser?.avatarBg ||
    'linear-gradient(135deg, var(--blue), var(--purple))'

  const [polls, setPolls] = useState(() => loadStoredCustomPolls(isDemo))
  const [selectedPollId, setSelectedPollId] = useState(() => {
    const reqId = getInitialRequestedPollId()
    const initialPolls = loadStoredCustomPolls(isDemo)
    if (reqId && initialPolls.some(p => p.id === reqId)) return reqId
    return initialPolls[0]?.id || FALLBACK_POLL.id
  })
  const [weekAnchorDate, setWeekAnchorDate] = useState(BASE_MONDAY)
  const [mobileDay, setMobileDay] = useState(BASE_MONDAY)

  // 'mine' = click & drag to add or deselect free times | 'group' = view everyone's overlap
  const [gridMode, setGridMode] = useState('mine')

  // Current responder identity (defaults to signed-in user; teammate/guest override optional)
  const [guestOverrideName, setGuestOverrideName] = useState('')
  const [showGuestForm, setShowGuestForm] = useState(false)
  const [guestInput, setGuestInput] = useState('')

  const activePersonName = guestOverrideName || defaultUserName
  const currentUserId = useMemo(() => toUserId(activePersonName), [activePersonName])

  // Spotlight filter: click a responder in the Responders card to highlight their free times
  const [spotlightUserId, setSpotlightUserId] = useState(null)

  const initialSlotStore = useMemo(
    () => loadStoredSlotsByPoll(toUserId(defaultUserName), isDemo),
    // Only compute initial seed once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  const [slotsByPoll, setSlotsByPoll] = useState(() => initialSlotStore.byPoll)
  const [hasEditedLocally, setHasEditedLocally] = useState(() => initialSlotStore.fromStorage)

  // Synchronous drag session ref + lightweight visual preview state
  const dragRef = useRef(null)
  const tbodyRef = useRef(null)
  const handledByPointerDownRef = useRef(false)
  const slotsByPollRef = useRef(slotsByPoll)
  slotsByPollRef.current = slotsByPoll
  const [dragUiState, setDragUiState] = useState(null) // { mode: 'add' | 'remove', minCol, maxCol, minRow, maxRow }
  const [autoSaveState, setAutoSaveState] = useState('saved') // 'saving' | 'saved'

  // Hovered or clicked slot & contiguous window range for full-block grid highlighting
  const [hoveredSlotIso, setHoveredSlotIso] = useState(null)
  const [hoveredWindowRange, setHoveredWindowRange] = useState(null) // { startMs, endMs }
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

  useEffect(() => {
    if (!onPageContextChange) return
    const pollTitle = cleanText(activePoll?.title || '')
    onPageContextChange({
      nav: 'availability',
      label: pollTitle ? `${pollTitle}${gridMode === 'group' ? ' (Group Overlap)' : ''}` : null,
      modal: showNewPollForm ? 'new_poll' : null,
    })
  }, [onPageContextChange, activePoll?.title, gridMode, showNewPollForm])

  const defaultPollWeekStart = useMemo(
    () => getWeekStartOfDate(activePoll.dates?.[0] || BASE_MONDAY, weekStartsOn),
    [activePoll.dates, weekStartsOn]
  )

  const weekStartYmd = useMemo(
    () => getWeekStartOfDate(weekAnchorDate, weekStartsOn),
    [weekAnchorDate, weekStartsOn]
  )

  const displayedWeekDates = useMemo(
    () => getWeekDatesFromStart(weekStartYmd),
    [weekStartYmd]
  )

  useEffect(() => {
    if (isDemo) return
    try {
      localStorage.setItem(CUSTOM_POLLS_STORAGE_KEY, JSON.stringify(polls))
    } catch {
      // Ignore storage errors
    }
  }, [polls, isDemo])

  const loadPolls = useCallback(async () => {
    const requestedPollId = getInitialRequestedPollId()
    if (requestedPollId) {
      try {
        sessionStorage.removeItem(PENDING_POLL_SESSION_KEY)
      } catch {
        // Ignore sessionStorage errors
      }
    }

    const data = await getSchedulerPolls()
    if (Array.isArray(data) && data.length > 0) {
      setPolls(prev => {
        const backendIds = new Set(data.map(p => p.id))
        const localOnly = prev.filter(
          p => p?.id && !backendIds.has(p.id) && p.id !== FALLBACK_POLL.id
        )
        return [...data, ...localOnly]
      })
      setSelectedPollId(prev => {
        if (requestedPollId && data.some(p => p.id === requestedPollId)) return requestedPollId
        return data.some(p => p.id === prev) ? prev : data[0].id
      })
    } else if (requestedPollId) {
      setSelectedPollId(prev => {
        const stored = loadStoredCustomPolls(isDemo)
        return stored.some(p => p.id === requestedPollId) ? requestedPollId : prev
      })
    }
  }, [isDemo])

  useEffect(() => {
    loadPolls()
  }, [loadPolls])

  // Sync displayed week whenever the user switches to a poll with its own target week
  useEffect(() => {
    const firstDate = activePoll?.dates?.[0]
    if (firstDate) {
      setWeekAnchorDate(firstDate)
      setMobileDay(firstDate)
    }
    setPinnedSlotIso(null)
  }, [activePoll?.id])

  const pollLocalMap = useMemo(
    () => slotsByPoll[activePoll.id] || {},
    [slotsByPoll, activePoll.id]
  )

  // Current user's live free slots on the active poll (always stays in sync with local & backend state)
  const myFreeSlots = useMemo(() => {
    if (pollLocalMap[currentUserId]) {
      return pollLocalMap[currentUserId]
    }
    const existingResp = (activePoll.responses || []).find(r => {
      const cleanName = cleanText(r.userName || 'Member').replace(/\s*\([^)]*\)\s*$/, '')
      const uid = r.userId || toUserId(cleanName)
      return uid === currentUserId
    })
    if (existingResp && Array.isArray(existingResp.freeSlots)) {
      return new Set(existingResp.freeSlots)
    }
    if (!hasEditedLocally && activePoll.id === FALLBACK_POLL.id && currentUserId === signedInUserId) {
      return new Set(STARTER_DEMO_SLOTS)
    }
    return new Set()
  }, [
    pollLocalMap,
    currentUserId,
    activePoll.responses,
    activePoll.id,
    hasEditedLocally,
    signedInUserId,
  ])

  // Persist slotsByPoll to localStorage & auto-sync to backend (never called inside a setState updater)
  const persistPollUserSlots = useCallback(
    (nextByPoll, targetPollId, targetUserId, targetName) => {
      if (!isDemo && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(
            LOCAL_SLOTS_STORAGE_KEY,
            JSON.stringify(serializeSlotsByPoll(nextByPoll))
          )
        } catch {
          // Ignore storage errors
        }
      }

      setAutoSaveState('saving')
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(async () => {
        const freeArr = Array.from(nextByPoll?.[targetPollId]?.[targetUserId] || [])
        const updated = await saveSchedulerResponse(targetPollId, {
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
      }, 400)
    },
    [isDemo]
  )

  const commitUserSet = useCallback(
    (updatedSet, targetPollId = activePoll.id, targetUserId = currentUserId, targetName = activePersonName) => {
      setHasEditedLocally(true)
      const prev = slotsByPollRef.current
      const nextByPoll = {
        ...prev,
        [targetPollId]: {
          ...(prev[targetPollId] || {}),
          [targetUserId]: updatedSet,
        },
      }
      slotsByPollRef.current = nextByPoll
      setSlotsByPoll(nextByPoll)
      persistPollUserSlots(nextByPoll, targetPollId, targetUserId, targetName)
    },
    [activePoll.id, currentUserId, activePersonName, persistPollUserSlots]
  )

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

  // Keep latest grid lookup in a ref for window-level pointermove / pointerup listeners
  const gridLookupRef = useRef({ displayedWeekDates, timeRows, gridSlots })
  gridLookupRef.current = { displayedWeekDates, timeRows, gridSlots }

  const updateDragSelection = useCallback((colIdx, rowIdx) => {
    const session = dragRef.current
    if (!session || !session.active) return

    const { displayedWeekDates: dates, timeRows: rows, gridSlots: matrix } = gridLookupRef.current
    if (!dates.length || !rows.length) return

    const clampedCol = session.isSingleDayMobile
      ? session.startCol
      : Math.max(0, Math.min(dates.length - 1, colIdx))
    const clampedRow = Math.max(0, Math.min(rows.length - 1, rowIdx))

    if (clampedCol === session.curCol && clampedRow === session.curRow) return
    session.curCol = clampedCol
    session.curRow = clampedRow

    const minCol = Math.min(session.startCol, clampedCol)
    const maxCol = Math.max(session.startCol, clampedCol)
    const minRow = Math.min(session.startRow, clampedRow)
    const maxRow = Math.max(session.startRow, clampedRow)

    const nextSet = new Set(session.baseSet)
    for (let c = minCol; c <= maxCol; c += 1) {
      const d = dates[c]
      for (let r = minRow; r <= maxRow; r += 1) {
        const rowObj = rows[r]
        const cellIso = matrix[d]?.[`${rowObj.hour}:${rowObj.minute}`]
        if (!cellIso) continue
        if (session.mode === 'add') nextSet.add(cellIso)
        else nextSet.delete(cellIso)
      }
    }

    session.latestSet = nextSet
    setDragUiState({ mode: session.mode, minCol, maxCol, minRow, maxRow })
    setSlotsByPoll(prev => ({
      ...prev,
      [session.pollId]: {
        ...(prev[session.pollId] || {}),
        [session.userId]: nextSet,
      },
    }))
  }, [])

  const finishActiveDrag = useCallback(() => {
    const session = dragRef.current
    if (!session || !session.active) return
    dragRef.current = null
    setDragUiState(null)
    setHasEditedLocally(true)

    const prev = slotsByPollRef.current
    const nextByPoll = {
      ...prev,
      [session.pollId]: {
        ...(prev[session.pollId] || {}),
        [session.userId]: session.latestSet,
      },
    }
    slotsByPollRef.current = nextByPoll
    setSlotsByPoll(nextByPoll)
    persistPollUserSlots(nextByPoll, session.pollId, session.userId, session.userName)

    setTimeout(() => {
      handledByPointerDownRef.current = false
    }, 0)
  }, [persistPollUserSlots])

  useEffect(() => {
    function handleWindowPointerMove(e) {
      const session = dragRef.current
      if (!session || !session.active) return

      // Hit-test directly under pointer (works for fast drags, touch drags, and edge overshoots)
      let targetEl = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-slot-row]')

      if (!targetEl && !session.isSingleDayMobile && tbodyRef.current) {
        const rect = tbodyRef.current.getBoundingClientRect()
        if (rect.width > 80 && rect.height > 10) {
          const clampedX = Math.min(Math.max(e.clientX, rect.left + 74), rect.right - 4)
          const clampedY = Math.min(Math.max(e.clientY, rect.top + 4), rect.bottom - 4)
          targetEl = document.elementFromPoint(clampedX, clampedY)?.closest?.('[data-slot-row]')
        }
      }

      if (targetEl) {
        const rIdx = Number(targetEl.getAttribute('data-slot-row'))
        const cAttr = targetEl.getAttribute('data-slot-col')
        const cIdx = cAttr !== null ? Number(cAttr) : session.startCol
        if (!Number.isNaN(rIdx) && !Number.isNaN(cIdx)) {
          updateDragSelection(cIdx, rIdx)
        }
      }
    }

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: true })
    window.addEventListener('pointerup', finishActiveDrag)
    window.addEventListener('mouseup', finishActiveDrag)
    window.addEventListener('pointercancel', finishActiveDrag)
    window.addEventListener('blur', finishActiveDrag)

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', finishActiveDrag)
      window.removeEventListener('mouseup', finishActiveDrag)
      window.removeEventListener('pointercancel', finishActiveDrag)
      window.removeEventListener('blur', finishActiveDrag)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [updateDragSelection, finishActiveDrag])

  // Combine poll responders + current user's live slots (with "You" always listed first)
  const allParticipants = useMemo(() => {
    const map = new Map()
    let colorIdx = 0

    // Seed signed-in user first so "You" appears at the top of Responders
    const signedUserLocalSet = pollLocalMap[signedInUserId]
    const signedExistingResp = (activePoll.responses || []).find(r => {
      const cleanName = cleanText(r.userName || 'Member').replace(/\s*\([^)]*\)\s*$/, '')
      const uid = r.userId || toUserId(cleanName)
      return uid === signedInUserId
    })

    const signedInitialFree = signedUserLocalSet
      ? Array.from(signedUserLocalSet)
      : signedExistingResp?.freeSlots
        ? signedExistingResp.freeSlots
        : !hasEditedLocally && activePoll.id === FALLBACK_POLL.id
          ? STARTER_DEMO_SLOTS
          : []

    map.set(signedInUserId, {
      userId: signedInUserId,
      userName: defaultUserName,
      initials: getInitials(defaultUserName),
      avatarBg: signedInAvatarBg,
      clubName: signedExistingResp?.clubName || '',
      isGuest: false,
      isYou: true,
      freeSlots: signedInitialFree,
    })

    for (const r of activePoll.responses || []) {
      const cleanName = cleanText(r.userName || 'Member').replace(/\s*\([^)]*\)\s*$/, '')
      const uid = r.userId || toUserId(cleanName)
      if (uid === signedInUserId) continue
      const localOverride = pollLocalMap[uid]
      map.set(uid, {
        userId: uid,
        userName: cleanName,
        initials: getInitials(cleanName),
        avatarBg: RESPONDER_GRADIENTS[colorIdx++ % RESPONDER_GRADIENTS.length],
        clubName: cleanText(r.clubName || ''),
        isGuest: false,
        isYou: false,
        freeSlots: localOverride ? Array.from(localOverride) : r.freeSlots || [],
      })
    }

    for (const [uid, slotSet] of Object.entries(pollLocalMap)) {
      if (!map.has(uid) && (slotSet.size > 0 || uid === currentUserId)) {
        const prettyName =
          uid === currentUserId && guestOverrideName
            ? guestOverrideName
            : uid
                .replace(/^user_/, '')
                .split('_')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ')
        map.set(uid, {
          userId: uid,
          userName: prettyName,
          initials: getInitials(prettyName),
          avatarBg: RESPONDER_GRADIENTS[colorIdx++ % RESPONDER_GRADIENTS.length],
          clubName: 'Added responder',
          isGuest: true,
          isYou: false,
          freeSlots: Array.from(slotSet),
        })
      }
    }

    return Array.from(map.values())
  }, [
    activePoll.responses,
    activePoll.id,
    pollLocalMap,
    signedInUserId,
    defaultUserName,
    signedInAvatarBg,
    currentUserId,
    guestOverrideName,
    hasEditedLocally,
  ])

  const activeParticipant = useMemo(
    () =>
      allParticipants.find(p => p.userId === currentUserId) || {
        userName: activePersonName,
        initials: getInitials(activePersonName),
        avatarBg: signedInAvatarBg,
      },
    [allParticipants, currentUserId, activePersonName, signedInAvatarBg]
  )

  const spotlitPerson = useMemo(
    () => (spotlightUserId ? allParticipants.find(p => p.userId === spotlightUserId) || null : null),
    [spotlightUserId, allParticipants]
  )

  const { scheduledEventsBySlot, campusEventsBySlot } = useMemo(() => {
    const bookedBySlot = {}
    const campusBySlot = {}
    const allEvs = [...(activePoll.calendarEvents || []), ...(Array.isArray(events) ? events : [])]
    const seen = new Set()

    for (const ev of allEvs) {
      const idStr = String(ev?.id || '')
      if (!ev?.start || seen.has(idStr)) continue
      seen.add(idStr)
      const sMs = new Date(ev.start).getTime()
      if (Number.isNaN(sMs)) continue
      const eMs = ev.end ? new Date(ev.end).getTime() : sMs + 60 * 60 * 1000
      const isCollab = idStr.startsWith('collab_evt_') || Boolean(ev.isBookedCollab)

      for (let t = sMs; t < eMs; t += 30 * 60 * 1000) {
        const iso = new Date(t).toISOString()
        if (isCollab) {
          bookedBySlot[iso] = ev
        } else if (!campusBySlot[iso]) {
          campusBySlot[iso] = ev
        }
      }
    }
    return { scheduledEventsBySlot: bookedBySlot, campusEventsBySlot: campusBySlot }
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
          ms: new Date(iso).getTime(),
          dateStr: d,
          availableUsers,
          unavailableUsers,
          availableCount: availableUsers.length,
          otherAvailableCount,
          ratio: availableUsers.length / total,
          scheduledEvent: scheduledEventsBySlot[iso] || null,
          campusConflict: campusEventsBySlot[iso] || null,
        }
      }
    }
    return stats
  }, [
    displayedWeekDates,
    timeRows,
    gridSlots,
    allParticipants,
    currentUserId,
    scheduledEventsBySlot,
    campusEventsBySlot,
  ])

  //Displayed-week slot count for the active user so hours badge reflects the week in view
  const displayedWeekSlotsSet = useMemo(() => {
    const set = new Set()
    for (const d of displayedWeekDates) {
      for (const r of timeRows) {
        const iso = gridSlots[d]?.[`${r.hour}:${r.minute}`]
        if (iso) set.add(iso)
      }
    }
    return set
  }, [displayedWeekDates, timeRows, gridSlots])

  const myWeekFreeCount = useMemo(() => {
    let n = 0
    for (const iso of myFreeSlots) {
      if (displayedWeekSlotsSet.has(iso)) n += 1
    }
    return n
  }, [myFreeSlots, displayedWeekSlotsSet])

  // Check whether weekday preset ranges are currently completely filled (so buttons act as clean toggles)
  const getWeekdayPresetSlots = useCallback(
    (rangeStartH, rangeEndH) => {
      const baseTz = activePoll.baseTimezone || DEFAULT_TZ
      const slots = []
      for (const d of displayedWeekDates) {
        const { y, m, d: dayNum } = parseDateParts(d)
        const dow = new Date(Date.UTC(y, m - 1, dayNum, 12, 0, 0)).getUTCDay()
        if (dow >= 1 && dow <= 5) {
          const sH = Math.max(startHour, rangeStartH)
          const eH = Math.min(endHour, rangeEndH)
          if (eH > sH) {
            slots.push(...makeRangeSlots(d, sH, eH, baseTz))
          }
        }
      }
      return slots
    },
    [activePoll.baseTimezone, displayedWeekDates, startHour, endHour]
  )

  const morningsAllSelected = useMemo(() => {
    const slots = getWeekdayPresetSlots(9, 12)
    return slots.length > 0 && slots.every(s => myFreeSlots.has(s))
  }, [getWeekdayPresetSlots, myFreeSlots])

  const afternoonsAllSelected = useMemo(() => {
    const slots = getWeekdayPresetSlots(13, 17)
    return slots.length > 0 && slots.every(s => myFreeSlots.has(s))
  }, [getWeekdayPresetSlots, myFreeSlots])

  // Merge contiguous 30-min slots into ranked meeting windows that fit `durationMins`
  const bestMeetingWindows = useMemo(() => {
    const requiredSlots = Math.max(1, Math.round(durationMins / 30))
    const windows = []

    for (const d of displayedWeekDates) {
      const dayIsos = timeRows
        .map(r => gridSlots[d]?.[`${r.hour}:${r.minute}`])
        .filter(Boolean)

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
            startMs: windowStartMs,
            endMs: windowEndMs,
            totalMinutes: runLength * 30,
            availableCount: startStat.availableCount,
            availableUsers: startStat.availableUsers,
            unavailableUsers: startStat.unavailableUsers,
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
    return null
  }, [hoveredSlotIso, pinnedSlotIso, slotStatsMap])

  const pinnedSlotStat = useMemo(
    () => (pinnedSlotIso && slotStatsMap[pinnedSlotIso] ? slotStatsMap[pinnedSlotIso] : null),
    [pinnedSlotIso, slotStatsMap]
  )

  const spotlightSet = useMemo(() => {
    if (!spotlitPerson) return null
    return new Set(spotlitPerson.freeSlots || [])
  }, [spotlitPerson])

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

  function beginDragAtCell(e, colIdx, rowIdx, iso, isSingleDayMobile = false) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    setHoveredSlotIso(iso)

    if (gridMode !== 'mine') {
      setPinnedSlotIso(prev => (prev === iso ? null : iso))
      return
    }

    // Prevent browser text selection and native HTML5 dragstart on '✓' cells so drag-to-deselect never stalls
    e.preventDefault()
    e.currentTarget?.releasePointerCapture?.(e.pointerId)

    const baseSet = new Set(myFreeSlots)
    const mode = baseSet.has(iso) ? 'remove' : 'add'
    const nextSet = new Set(baseSet)
    if (mode === 'add') nextSet.add(iso)
    else nextSet.delete(iso)

    dragRef.current = {
      active: true,
      mode,
      baseSet,
      latestSet: nextSet,
      startCol: colIdx,
      startRow: rowIdx,
      curCol: colIdx,
      curRow: rowIdx,
      pollId: activePoll.id,
      userId: currentUserId,
      userName: activePersonName,
      isSingleDayMobile,
    }

    setDragUiState({
      mode,
      minCol: colIdx,
      maxCol: colIdx,
      minRow: rowIdx,
      maxRow: rowIdx,
    })

    setSlotsByPoll(prev => ({
      ...prev,
      [activePoll.id]: {
        ...(prev[activePoll.id] || {}),
        [currentUserId]: nextSet,
      },
    }))
  }

  function handleCellPointerEnter(colIdx, rowIdx, iso) {
    setHoveredSlotIso(iso)
    if (dragRef.current?.active) {
      updateDragSelection(colIdx, rowIdx)
    }
  }

  function handleMobileSlotTap(iso) {
    if (gridMode !== 'mine') {
      setPinnedSlotIso(prev => (prev === iso ? null : iso))
      return
    }
    const nextSet = new Set(myFreeSlots)
    if (nextSet.has(iso)) nextSet.delete(iso)
    else nextSet.add(iso)
    commitUserSet(nextSet)
  }

  function handleToggleMobileDay(fill) {
    const nextSet = new Set(myFreeSlots)
    for (const r of timeRows) {
      const iso = gridSlots[mobileDay]?.[`${r.hour}:${r.minute}`]
      if (!iso) continue
      if (fill) nextSet.add(iso)
      else nextSet.delete(iso)
    }
    commitUserSet(nextSet)
  }

  function handleToggleWeekdayPreset(rangeStartH, rangeEndH, labelText) {
    const targetSlots = getWeekdayPresetSlots(rangeStartH, rangeEndH)
    if (targetSlots.length === 0) return
    const allSelected = targetSlots.every(s => myFreeSlots.has(s))
    const nextSet = new Set(myFreeSlots)

    for (const s of targetSlots) {
      if (allSelected) nextSet.delete(s)
      else nextSet.add(s)
    }

    commitUserSet(nextSet)
    if (onNotify) {
      onNotify(
        allSelected
          ? `Deselected weekday ${labelText}.`
          : `Added weekday ${labelText}.`,
        { type: allSelected ? 'info' : 'success' }
      )
    }
  }

  function handleClearWeekTimes() {
    const nextSet = new Set(myFreeSlots)
    for (const iso of displayedWeekSlotsSet) {
      nextSet.delete(iso)
    }
    commitUserSet(nextSet)
    if (onNotify) {
      onNotify(`Cleared ${activePersonName}'s times for this week.`, { type: 'info' })
    }
  }

  function handleAddGuestSubmit(e) {
    e.preventDefault()
    const trimmed = guestInput.trim()
    if (!trimmed) return
    const uid = toUserId(trimmed)
    setSlotsByPoll(prev => ({
      ...prev,
      [activePoll.id]: {
        ...(prev[activePoll.id] || {}),
        [uid]: prev[activePoll.id]?.[uid] || new Set(),
      },
    }))
    setGuestOverrideName(trimmed)
    setGuestInput('')
    setShowGuestForm(false)
    setGridMode('mine')
    setSpotlightUserId(null)
    if (onNotify) {
      onNotify(`Now marking availability for "${trimmed}".`)
    }
  }

  const [shareBusy, setShareBusy] = useState('')

  function buildActivePollShareUrl() {
    return `${window.location.origin}${window.location.pathname}?poll=${encodeURIComponent(activePoll.id)}`
  }

  async function handleCopyShareLink() {
    const shareUrl = buildActivePollShareUrl()
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      // Clipboard fallback ignored
    }
    if (onNotify) {
      onNotify('Copied poll invite link to clipboard!')
    }
  }

  async function handleSharePollDiscord() {
    if (shareBusy) return
    const shareUrl = buildActivePollShareUrl()
    setShareBusy('discord')
    try {
      await dispatchDiscordNotification({
        kind: 'poll',
        accountKey,
        title: activePoll.title,
        poll: {
          title: activePoll.title,
          url: shareUrl,
          duration: durationMins / 60,
          organizer: activePersonName,
        },
      })
      if (onNotify) {
        onNotify(`Posted "${activePoll.title}" availability poll to Discord!`)
      }
    } catch {
      try {
        await navigator.clipboard.writeText(shareUrl)
      } catch {
        // Ignore clipboard errors
      }
      if (onNotify) {
        onNotify(
          'Copied poll link! Connect a Discord Webhook or Bot channel in Settings -> Integrations to post directly.',
          {
            type: 'info',
            actionLabel: onOpenSettings ? 'Open Integrations' : undefined,
            onAction: onOpenSettings,
          }
        )
      }
    } finally {
      setShareBusy('')
    }
  }

  async function handleSharePollEmail() {
    if (shareBusy) return
    const shareUrl = buildActivePollShareUrl()
    setShareBusy('email')
    try {
      const res = await dispatchEmailNotification(
        {
          kind: 'poll',
          accountKey,
          title: activePoll.title,
          poll: {
            title: activePoll.title,
            url: shareUrl,
            duration: durationMins / 60,
            organizer: activePersonName,
          },
        },
        { allowMailtoFallback: true }
      )
      if (onNotify) {
        onNotify(
          res?.mode === 'client_mailto'
            ? 'Opened pre-filled poll invite in your email app!'
            : `Sent "${activePoll.title}" poll invite via email!`
        )
      }
    } catch (err) {
      if (onNotify) {
        onNotify(err.message || 'Unable to send email invite.', { type: 'error' })
      }
    } finally {
      setShareBusy('')
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
    setSpotlightUserId(null)
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
        isBookedCollab: true,
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

  const isDefaultWeek = weekStartYmd === defaultPollWeekStart
  const mobileColIdx = Math.max(0, displayedWeekDates.indexOf(mobileDay))
  const mobileDayFreeCount = useMemo(() => {
    return timeRows.filter(r => {
      const iso = gridSlots[mobileDay]?.[`${r.hour}:${r.minute}`]
      return iso && myFreeSlots.has(iso)
    }).length
  }, [timeRows, gridSlots, mobileDay, myFreeSlots])

  const mobileDayParsed = parseDateParts(mobileDay)
  const mobileDayFullLabel = new Date(
    Date.UTC(mobileDayParsed.y, mobileDayParsed.m - 1, mobileDayParsed.d, 12, 0, 0)
  ).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <div className={isCompact ? 'space-y-3.5' : 'space-y-4 sm:space-y-5'}>
      {/* ── 1. Streamlined Poll & Week Bar ── */}
      <Card className={isCompact ? 'p-3.5 sm:p-4' : 'p-4 sm:p-5'} delay={1}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Left: Poll Switcher + Location + New Poll */}
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
                    if (p.dates?.[0]) {
                      setWeekAnchorDate(getWeekStartOfDate(p.dates[0], weekStartsOn))
                    }
                  }}
                  className={`px-3.5 min-h-[36px] rounded-xl text-xs sm:text-[13px] font-semibold border cursor-pointer transition-all truncate max-w-full ${
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
              className={`inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                showNewPollForm
                  ? 'bg-[var(--bg-subtle)] text-[var(--text)] border-[var(--border-strong)]'
                  : 'bg-transparent text-[var(--blue-ink)] border-dashed border-[var(--border-strong)] hover:border-[var(--blue)] hover:bg-[var(--blue-light)]'
              }`}
            >
              {showNewPollForm ? <X size={14} /> : <Plus size={14} />}
              <span>{showNewPollForm ? 'Cancel' : 'New Poll'}</span>
            </button>

            {activePoll.location && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] text-xs text-[var(--text-muted)] font-medium border border-[var(--border-subtle)]">
                <MapPin size={12} className="text-[var(--teal)] shrink-0" />
                <span className="truncate max-w-[200px]">{cleanText(activePoll.location)}</span>
              </span>
            )}
          </div>

          {/* Right: Week Stepper + Invite Link */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex items-center gap-1 bg-[var(--bg-surface)] p-1 rounded-xl border border-[var(--border)]">
              <button
                type="button"
                onClick={() => setWeekAnchorDate(prev => addDaysToYmd(prev, -7))}
                aria-label="Previous week"
                className="w-7 h-7 rounded-lg bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border-subtle)] flex items-center justify-center cursor-pointer hover:border-[var(--blue)]"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs font-bold text-[var(--text)] px-2 whitespace-nowrap">
                {weekLabel}
              </span>
              <button
                type="button"
                onClick={() => setWeekAnchorDate(prev => addDaysToYmd(prev, 7))}
                aria-label="Next week"
                className="w-7 h-7 rounded-lg bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border-subtle)] flex items-center justify-center cursor-pointer hover:border-[var(--blue)]"
              >
                <ChevronRight size={14} />
              </button>
              {!isDefaultWeek && (
                <button
                  type="button"
                  onClick={() => setWeekAnchorDate(defaultPollWeekStart)}
                  title="Jump back to poll week"
                  className="inline-flex items-center gap-1 px-2 h-7 rounded-lg bg-[var(--blue-light)] text-[var(--blue-ink)] text-[11px] font-semibold border-none cursor-pointer"
                >
                  <RotateCcw size={11} />
                  <span>Poll Week</span>
                </button>
              )}
            </div>

            <div className="inline-flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={handleCopyShareLink}
                className="inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text)] border border-[var(--border)] cursor-pointer transition-colors"
              >
                <Share2 size={13} className="text-[var(--blue)]" />
                <span>Copy Invite Link</span>
              </button>

              <button
                type="button"
                disabled={Boolean(shareBusy)}
                onClick={handleSharePollDiscord}
                title="Post availability poll invite to Discord"
                className="inline-flex items-center gap-1.5 px-2.5 min-h-[36px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text)] border border-[var(--border)] cursor-pointer transition-colors disabled:opacity-60"
              >
                <span className="text-[var(--blue)] flex items-center">
                  <PlatformIcon type="discord" size={13.5} />
                </span>
                <span>{shareBusy === 'discord' ? 'Posting…' : 'Discord'}</span>
              </button>

              <button
                type="button"
                disabled={Boolean(shareBusy)}
                onClick={handleSharePollEmail}
                title="Send availability poll invite via Email"
                className="inline-flex items-center gap-1.5 px-2.5 min-h-[36px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text)] border border-[var(--border)] cursor-pointer transition-colors disabled:opacity-60"
              >
                <Mail size={13} className="text-[var(--yellow)]" />
                <span>{shareBusy === 'email' ? 'Sending…' : 'Email'}</span>
              </button>
            </div>
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
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
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
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
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
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="submit"
                className="px-5 min-h-[40px] rounded-xl bg-[var(--blue)] text-white border-none text-sm font-semibold cursor-pointer hover:opacity-90"
              >
                Create Poll
              </button>
            </div>
          </form>
        )}
      </Card>

      {/* ── 2. Balanced 2-Column Workspace: Interactive Schedule + Sticky Right Rail ── */}
      <div
        className={`grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_368px] ${
          isCompact ? 'gap-3.5' : 'gap-4 sm:gap-5'
        } items-start`}
      >
        {/* LEFT: 7-Day Availability Schedule */}
        <Card className={`${isCompact ? 'p-3.5 sm:p-4.5' : 'p-4 sm:p-5'} select-none`} delay={2}>
          {/* Mode Switcher + Quick Fill Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-[var(--border)]">
            <div className="inline-flex items-center bg-[var(--bg-surface)] p-1 rounded-xl border border-[var(--border)]">
              <button
                type="button"
                onClick={() => setGridMode('mine')}
                className={`inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-lg text-xs sm:text-[13px] font-semibold border-none cursor-pointer transition-all ${
                  gridMode === 'mine'
                    ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
                    : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                <span>My Availability</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-bold font-mono-num ${
                    gridMode === 'mine'
                      ? 'bg-[var(--green-light)] text-[var(--green-ink)]'
                      : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
                  }`}
                >
                  {formatHoursFromSlots(myWeekFreeCount)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setGridMode('group')}
                className={`inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-lg text-xs sm:text-[13px] font-semibold border-none cursor-pointer transition-all ${
                  gridMode === 'group'
                    ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
                    : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                <span>Group Overlap</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-bold font-mono-num ${
                    gridMode === 'group'
                      ? 'bg-[var(--blue-light)] text-[var(--blue-ink)]'
                      : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
                  }`}
                >
                  {allParticipants.length}
                </span>
              </button>
            </div>

            {gridMode === 'mine' ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    handleToggleWeekdayPreset(9, 12, 'mornings (9 AM–12 PM)')
                  }
                  title="Toggle Mon–Fri 9:00 AM – 12:00 PM"
                  className={`px-2.5 min-h-[30px] rounded-lg text-[11.5px] font-semibold border cursor-pointer transition-colors ${
                    morningsAllSelected
                      ? 'bg-[var(--green-light)] text-[var(--green-ink)] border-[var(--green)]/40'
                      : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text)] border-[var(--border)]'
                  }`}
                >
                  {morningsAllSelected ? '✓ Mornings' : '+ Mornings'}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleToggleWeekdayPreset(13, 17, 'afternoons (1–5 PM)')
                  }
                  title="Toggle Mon–Fri 1:00 PM – 5:00 PM"
                  className={`px-2.5 min-h-[30px] rounded-lg text-[11.5px] font-semibold border cursor-pointer transition-colors ${
                    afternoonsAllSelected
                      ? 'bg-[var(--green-light)] text-[var(--green-ink)] border-[var(--green)]/40'
                      : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text)] border-[var(--border)]'
                  }`}
                >
                  {afternoonsAllSelected ? '✓ Afternoons' : '+ Afternoons'}
                </button>

                {myWeekFreeCount > 0 && (
                  <button
                    type="button"
                    onClick={handleClearWeekTimes}
                    className="px-2.5 min-h-[30px] rounded-lg bg-transparent hover:bg-[var(--red-light)] text-[11.5px] font-semibold text-[var(--text-muted)] hover:text-[var(--red-ink)] border-none cursor-pointer transition-colors"
                  >
                    Clear All
                  </button>
                )}

                {dragUiState ? (
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                      dragUiState.mode === 'remove'
                        ? 'bg-[var(--red-light)] text-[var(--red-ink)]'
                        : 'bg-[var(--green-light)] text-[var(--green-ink)]'
                    }`}
                  >
                    <span>
                      {dragUiState.mode === 'remove' ? 'Deselecting…' : 'Selecting…'}
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--green-light)] text-[var(--green-ink)] text-[11px] font-semibold">
                    <Check size={11} />
                    <span>{autoSaveState === 'saving' ? 'Saving…' : 'Saved'}</span>
                  </span>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2.5 text-[11.5px] text-[var(--text-muted)]">
                <div className="inline-flex items-center gap-1.5">
                  <span>Fewer</span>
                  {[0.2, 0.44, 0.68, 0.92].map(a => (
                    <span
                      key={a}
                      className="w-3.5 h-3.5 rounded inline-block"
                      style={{ background: `rgba(16, 185, 129, ${a})` }}
                    />
                  ))}
                  <span>Everyone</span>
                </div>
                <button
                  type="button"
                  onClick={() => setGridMode('mine')}
                  className="px-2.5 min-h-[28px] rounded-lg bg-[var(--blue-light)] text-[var(--blue-ink)] text-[11.5px] font-semibold border-none cursor-pointer hover:opacity-90"
                >
                  Edit My Times
                </button>
              </div>
            )}
          </div>

          {/* Clear Contextual Instruction / Active Identity Banner */}
          <div className="flex flex-wrap items-center justify-between gap-2 py-2.5 mb-1 text-xs text-[var(--text-muted)]">
            {gridMode === 'mine' ? (
              <div className="flex flex-wrap items-center gap-2">
                {guestOverrideName ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--blue-light)] text-[var(--blue-ink)] font-semibold">
                    <Avatar
                      initials={activeParticipant.initials}
                      bg={activeParticipant.avatarBg}
                      size={18}
                    />
                    <span>Marking as {activePersonName}</span>
                    <button
                      type="button"
                      onClick={() => setGuestOverrideName('')}
                      className="ml-1 underline bg-transparent border-none text-[var(--blue-ink)] font-bold cursor-pointer p-0 text-[11px]"
                    >
                      Switch to You
                    </button>
                  </span>
                ) : null}
                <span>
                  <strong className="font-semibold text-[var(--text)]">Click or drag</strong> empty
                  slots to mark free, or green slots to{' '}
                  <strong className="font-semibold text-[var(--text)]">deselect</strong>.
                </span>
              </div>
            ) : (
              <span>
                Darker green shows stronger overlap. Click any time slot to inspect who is free or
                busy.
              </span>
            )}

            {spotlitPerson && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--blue-light)] text-[var(--blue-ink)] text-[11.5px] font-semibold">
                <span>Highlighting {spotlitPerson.userName}</span>
                <button
                  type="button"
                  onClick={() => setSpotlightUserId(null)}
                  className="inline-flex items-center justify-center bg-transparent border-none text-[var(--blue-ink)] cursor-pointer p-0 hover:opacity-75"
                  aria-label="Clear responder highlight"
                >
                  <X size={12} />
                </button>
              </span>
            )}
          </div>

          {/* ── MOBILE VIEW (< md): 7-Day Selector + Chronological Time Slots ── */}
          <div className="md:hidden space-y-3">
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

            {gridMode === 'mine' && (
              <div className="flex items-center justify-between gap-2 px-1 text-xs">
                <span className="font-semibold text-[var(--text)]">{mobileDayFullLabel}</span>
                <div className="flex items-center gap-2">
                  {mobileDayFreeCount < timeRows.length && (
                    <button
                      type="button"
                      onClick={() => handleToggleMobileDay(true)}
                      className="text-[11.5px] font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer p-0"
                    >
                      Select all day
                    </button>
                  )}
                  {mobileDayFreeCount > 0 && (
                    <button
                      type="button"
                      onClick={() => handleToggleMobileDay(false)}
                      className="text-[11.5px] font-semibold text-[var(--red-ink)] hover:underline bg-transparent border-none cursor-pointer p-0"
                    >
                      Clear day
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              {timeRows.map((r, rowIdx) => {
                const iso = gridSlots[mobileDay]?.[`${r.hour}:${r.minute}`]
                const endIso = iso
                  ? new Date(new Date(iso).getTime() + 30 * 60 * 1000).toISOString()
                  : ''
                const isMine = myFreeSlots.has(iso)
                const stat = slotStatsMap[iso]
                const count = stat?.availableCount || 0
                const otherCount = stat?.otherAvailableCount || 0
                const isPinned = pinnedSlotIso === iso
                const isSpotlit = spotlightSet ? spotlightSet.has(iso) : false
                const wasSelectedAtDragStart = Boolean(dragRef.current?.baseSet?.has(iso))
                const inRemovePreview = Boolean(
                  dragUiState &&
                    dragUiState.mode === 'remove' &&
                    wasSelectedAtDragStart &&
                    mobileColIdx >= dragUiState.minCol &&
                    mobileColIdx <= dragUiState.maxCol &&
                    rowIdx >= dragUiState.minRow &&
                    rowIdx <= dragUiState.maxRow
                )

                let rowStyle =
                  'bg-[var(--bg-surface)] text-[var(--text)] border-[var(--border)]'
                if (gridMode === 'mine') {
                  if (inRemovePreview) {
                    rowStyle =
                      'bg-[var(--red-light)] text-[var(--red-ink)] border-[var(--red)]/50'
                  } else if (isMine) {
                    rowStyle = 'bg-[var(--green)] text-white border-[var(--green)] shadow-2xs'
                  } else if (otherCount > 0) {
                    rowStyle =
                      'bg-[var(--green-light)] text-[var(--green-ink)] border-[var(--green)]/30'
                  }
                } else if (count > 0) {
                  rowStyle =
                    'bg-[var(--green-light)] text-[var(--green-ink)] border-[var(--green)]/40'
                }

                return (
                  <button
                    key={iso}
                    type="button"
                    data-slot-col={mobileColIdx}
                    data-slot-row={rowIdx}
                    onPointerDown={e => {
                      // Use drag selection for mouse/stylus; let touch scroll naturally and toggle via onClick
                      if (e.pointerType && e.pointerType !== 'touch' && gridMode === 'mine') {
                        if (e.pointerType === 'mouse' && e.button !== 0) return
                        handledByPointerDownRef.current = true
                        beginDragAtCell(e, mobileColIdx, rowIdx, iso, true)
                      }
                    }}
                    onPointerEnter={() => handleCellPointerEnter(mobileColIdx, rowIdx, iso)}
                    onClick={() => {
                      if (handledByPointerDownRef.current) {
                        handledByPointerDownRef.current = false
                        return
                      }
                      handleMobileSlotTap(iso)
                    }}
                    className={`w-full ${
                      isCompact ? 'min-h-[38px] py-1.5' : 'min-h-[44px] py-2'
                    } px-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer transition-colors ${rowStyle} ${
                      isPinned && gridMode === 'group' ? 'ring-2 ring-[var(--blue)]' : ''
                    } ${isSpotlit ? 'ring-2 ring-[var(--blue)]' : ''}`}
                  >
                    <span className="font-mono-num pointer-events-none">
                      {formatTimeFromIso(iso, use24h)} – {formatTimeFromIso(endIso, use24h)}
                    </span>

                    <div className="flex items-center gap-2 shrink-0 pointer-events-none">
                      {stat?.scheduledEvent && (
                        <span className="px-2 py-0.5 rounded-full bg-[var(--blue-light)] text-[var(--blue-ink)] text-[10px] font-bold">
                          Scheduled
                        </span>
                      )}

                      {gridMode === 'mine' ? (
                        inRemovePreview ? (
                          <span className="text-[11px] font-bold">Deselecting</span>
                        ) : isMine ? (
                          <span className="inline-flex items-center gap-1 font-bold">
                            <Check size={14} /> Free · Tap to remove
                          </span>
                        ) : otherCount > 0 ? (
                          <span className="text-[11px] opacity-85">
                            {otherCount} free · Tap to add
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

          {/* ── DESKTOP / TABLET VIEW (md+): Framed 7-Day Interactive Grid ── */}
          <div
            className="hidden md:block"
            onMouseLeave={() => setHoveredSlotIso(null)}
          >
            <div className="rounded-2xl border border-[var(--border)] overflow-hidden bg-[var(--bg-card)]">
              <table
                onDragStart={e => e.preventDefault()}
                className="w-full table-fixed border-collapse text-xs select-none"
              >
                <thead>
                  <tr className="bg-[var(--bg-surface)] border-b border-[var(--border)]">
                    <th className="w-[68px] py-2.5 px-2 text-right text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-light)] border-r border-[var(--border)]">
                      Time
                    </th>
                    {displayedWeekDates.map((dateStr, colIdx) => {
                      const { y, m, d } = parseDateParts(dateStr)
                      const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
                      const dayShort = dt.toLocaleDateString('en-US', {
                        weekday: 'short',
                        timeZone: 'UTC',
                      })
                      const dayMarkedCount = timeRows.filter(r => {
                        const iso = gridSlots[dateStr]?.[`${r.hour}:${r.minute}`]
                        return gridMode === 'mine'
                          ? myFreeSlots.has(iso)
                          : (slotStatsMap[iso]?.availableCount || 0) === allParticipants.length
                      }).length

                      return (
                        <th
                          key={dateStr}
                          className={`py-2 px-1 text-center ${
                            colIdx < 6 ? 'border-r border-[var(--border)]' : ''
                          }`}
                        >
                          <div className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                            {dayShort}
                          </div>
                          <div className="mt-0.5 flex items-center justify-center gap-1">
                            <span className="text-sm font-extrabold font-mono-num text-[var(--text)]">
                              {m}/{d}
                            </span>
                            {dayMarkedCount > 0 && (
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-[var(--green)]"
                                title={
                                  gridMode === 'mine'
                                    ? `${formatHoursFromSlots(dayMarkedCount)} marked free`
                                    : `${formatHoursFromSlots(dayMarkedCount)} with everyone free`
                                }
                              />
                            )}
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody ref={tbodyRef}>
                  {timeRows.map((r, rowIdx) => {
                    const sampleIso = gridSlots[displayedWeekDates[0]]?.[`${r.hour}:${r.minute}`]
                    const timeLabel = sampleIso
                      ? formatTimeFromIso(sampleIso, use24h)
                      : `${r.hour}:00`
                    const isFullHour = r.minute === 0
                    const isFirstRow = rowIdx === 0

                    return (
                      <tr key={`${r.hour}:${r.minute}`}>
                        <td
                          className={`pr-2 py-0 text-right align-middle text-[10.5px] text-[var(--text-muted)] font-mono-num whitespace-nowrap bg-[var(--bg-surface)]/55 border-r border-[var(--border)] select-none ${
                            !isFirstRow
                              ? isFullHour
                                ? 'border-t border-t-[var(--border)]'
                                : 'border-t border-dashed border-t-[var(--border-subtle)]'
                              : ''
                          }`}
                        >
                          {isFullHour ? timeLabel : ''}
                        </td>
                        {displayedWeekDates.map((dateStr, colIdx) => {
                          const iso = gridSlots[dateStr]?.[`${r.hour}:${r.minute}`]
                          const isMine = myFreeSlots.has(iso)
                          const stat = slotStatsMap[iso]
                          const slotMs = stat?.ms || 0
                          const count = stat?.availableCount || 0
                          const otherCount = stat?.otherAvailableCount || 0
                          const ratio = stat?.ratio || 0
                          const isPinned = pinnedSlotIso === iso
                          const isSpotlit = spotlightSet ? spotlightSet.has(iso) : false
                          const isInHoveredWindow = Boolean(
                            hoveredWindowRange &&
                              slotMs >= hoveredWindowRange.startMs &&
                              slotMs < hoveredWindowRange.endMs
                          )
                          const isInDragRect = Boolean(
                            dragUiState &&
                              colIdx >= dragUiState.minCol &&
                              colIdx <= dragUiState.maxCol &&
                              rowIdx >= dragUiState.minRow &&
                              rowIdx <= dragUiState.maxRow
                          )
                          const wasSelectedAtDragStart = Boolean(
                            dragRef.current?.baseSet?.has(iso)
                          )
                          const isRemovePreview =
                            isInDragRect &&
                            dragUiState?.mode === 'remove' &&
                            wasSelectedAtDragStart
                          const isRemoveRectOutline =
                            isInDragRect && dragUiState?.mode === 'remove'
                          const isAddPreview = isInDragRect && dragUiState?.mode === 'add'
                          const isBooked = Boolean(stat?.scheduledEvent)
                          const campusConflict = stat?.campusConflict

                          let bg = 'transparent'
                          let textColor = 'var(--text-muted)'

                          if (gridMode === 'mine') {
                            if (isRemovePreview) {
                              bg = 'var(--red-light)'
                              textColor = 'var(--red-ink)'
                            } else if (isMine) {
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

                          const conflictNote = campusConflict
                            ? ` · Club event: ${cleanText(campusConflict.title || 'Scheduled Event')}`
                            : ''
                          const actionHint =
                            gridMode === 'mine'
                              ? isMine
                                ? ' (Click or drag to deselect)'
                                : ' (Click or drag to mark free)'
                              : ' (Click to inspect)'

                          return (
                            <td
                              key={iso}
                              data-slot-col={colIdx}
                              data-slot-row={rowIdx}
                              onPointerDown={e => beginDragAtCell(e, colIdx, rowIdx, iso, false)}
                              onPointerEnter={() => handleCellPointerEnter(colIdx, rowIdx, iso)}
                              title={`${formatTimeFromIso(iso, use24h, {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })} — ${count}/${allParticipants.length} free${conflictNote}${actionHint}`}
                              className={`relative ${
                                gridMode === 'mine' ? 'touch-none select-none' : 'select-none'
                              } ${isCompact ? 'h-[22px]' : 'h-[26px]'} ${
                                colIdx < 6 ? 'border-r border-[var(--border)]' : ''
                              } ${
                                !isFirstRow
                                  ? isFullHour
                                    ? 'border-t border-t-[var(--border-strong)]'
                                    : 'border-t border-dashed border-t-[var(--border-subtle)]'
                                  : ''
                              } cursor-pointer text-center text-[10.5px] font-semibold transition-colors ${
                                isRemovePreview
                                  ? 'ring-1.5 ring-inset ring-[var(--red)] z-10'
                                  : isRemoveRectOutline
                                    ? 'ring-1 ring-inset ring-[var(--border-strong)] z-10'
                                    : isAddPreview
                                      ? 'ring-1.5 ring-inset ring-white/75 z-10'
                                      : isInHoveredWindow || isSpotlit
                                        ? 'ring-2 ring-inset ring-[var(--blue)] z-10'
                                        : isPinned && gridMode === 'group'
                                          ? 'ring-2 ring-inset ring-[var(--blue)] z-10'
                                          : 'hover:brightness-95'
                              }`}
                              style={{ background: bg, color: textColor }}
                            >
                              {campusConflict && !isBooked && (
                                <span
                                  className="pointer-events-none absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[var(--yellow)]"
                                  aria-hidden="true"
                                />
                              )}

                              {isBooked ? (
                                <span className="pointer-events-none inline-block px-1.5 rounded bg-[var(--blue)] text-white text-[9.5px] font-bold leading-tight">
                                  Booked
                                </span>
                              ) : gridMode === 'mine' ? (
                                isRemovePreview ? (
                                  <span className="pointer-events-none font-bold">–</span>
                                ) : isMine ? (
                                  <span className="pointer-events-none">✓</span>
                                ) : (
                                  ''
                                )
                              ) : count > 0 ? (
                                <span className="pointer-events-none font-mono-num text-[10px]">
                                  {count}/{allParticipants.length}
                                </span>
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
            </div>

            {/* Clean Footer Legend & Live Hovered Slot Readout */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
              <div className="flex flex-wrap items-center gap-3.5">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-[var(--green)] inline-block" />
                  <span>{gridMode === 'mine' ? 'You are free (✓)' : 'Group overlap'}</span>
                </span>
                {gridMode === 'mine' && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-[var(--green-light)] border border-[var(--green)]/40 inline-block" />
                    <span>Teammates free</span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[var(--yellow)] inline-block" />
                  <span>Club event on calendar</span>
                </span>
              </div>

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

          {/* Selected Slot Inspector (appears below the grid when inspecting Group Overlap so the right rail never shifts) */}
          {gridMode === 'group' && pinnedSlotStat && (
            <div className="mt-3.5 pt-3.5 border-t border-[var(--border)] space-y-2.5 fade-in">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-[var(--blue)] shrink-0" />
                  <span className="text-xs font-bold text-[var(--text)]">
                    {formatTimeFromIso(pinnedSlotStat.iso, use24h, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <BubbleTag
                    label={`${pinnedSlotStat.availableCount}/${allParticipants.length} free`}
                    color={
                      pinnedSlotStat.availableCount === allParticipants.length ? 'green' : 'blue'
                    }
                    size="sm"
                  />
                </div>

                <div className="flex items-center gap-2">
                  {!pinnedSlotStat.scheduledEvent && (
                    <button
                      type="button"
                      disabled={bookingBusy}
                      onClick={() => handleScheduleSlot(pinnedSlotStat.iso)}
                      className="inline-flex items-center gap-1 px-2.5 min-h-[28px] rounded-lg bg-[var(--blue)] text-white text-[11px] font-semibold border-none cursor-pointer hover:opacity-90"
                    >
                      <CalendarPlus size={11} />
                      <span>Schedule {formatDurationShort(durationMins)}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPinnedSlotIso(null)}
                    aria-label="Close slot details"
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-[var(--text-light)] hover:text-[var(--text)] bg-transparent border-none cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>

              {pinnedSlotStat.campusConflict && (
                <div className="px-2.5 py-1.5 rounded-lg bg-[var(--yellow-light)] text-[var(--yellow-ink)] text-[11px] font-medium">
                  Club event at this time:{' '}
                  {cleanText(pinnedSlotStat.campusConflict.title || 'Scheduled Event')}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl content-tile">
                  <div className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--green-ink)] mb-1">
                    Free ({pinnedSlotStat.availableUsers.length})
                  </div>
                  <div className="text-[11.5px] text-[var(--text)]">
                    {pinnedSlotStat.availableUsers.length > 0
                      ? pinnedSlotStat.availableUsers.map(u => u.userName).join(', ')
                      : 'No one marked free'}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl content-tile">
                  <div className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--text-muted)] mb-1">
                    Unavailable ({pinnedSlotStat.unavailableUsers.length})
                  </div>
                  <div className="text-[11.5px] text-[var(--text-muted)]">
                    {pinnedSlotStat.unavailableUsers.length > 0
                      ? pinnedSlotStat.unavailableUsers.map(u => u.userName).join(', ')
                      : 'Everyone is free!'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* RIGHT STICKY RAIL: 1) Responders (Above) + 2) Best Meeting Windows (Below) */}
        <div className={`lg:sticky lg:top-5 ${isCompact ? 'space-y-3.5' : 'space-y-4'}`}>
          {/* Card 1 (TOP): Team Responders */}
          <Card className={isCompact ? 'p-3.5 sm:p-4' : 'p-4 sm:p-5'} delay={3}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <Users size={15} className="text-[var(--blue)] shrink-0" />
                <h3 className="text-sm font-bold text-[var(--text)]">
                  Responders ({allParticipants.length})
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setShowGuestForm(prev => !prev)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer"
              >
                {showGuestForm ? <X size={12} /> : <UserPlus size={12} />}
                <span>{showGuestForm ? 'Cancel' : 'Add Person'}</span>
              </button>
            </div>

            <p className="text-xs text-[var(--text-muted)] mb-3">
              Click anyone to highlight their free times on the schedule.
            </p>

            {showGuestForm && (
              <form
                onSubmit={handleAddGuestSubmit}
                className="mb-3 p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] flex gap-2 fade-in"
              >
                <input
                  type="text"
                  autoFocus
                  required
                  value={guestInput}
                  onChange={e => setGuestInput(e.target.value)}
                  placeholder="Teammate name…"
                  className="flex-1 min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--bg-card)] text-xs text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                />
                <button
                  type="submit"
                  className="px-3 min-h-[36px] rounded-lg bg-[var(--blue)] text-white border-none text-xs font-semibold cursor-pointer shrink-0"
                >
                  Add & Mark
                </button>
              </form>
            )}

            <div className="flex flex-col gap-1.5 max-h-[252px] overflow-y-auto pr-0.5">
              {allParticipants.map(p => {
                const isSpotlit = spotlightUserId === p.userId
                const isEditingThisPerson = p.userId === currentUserId
                const weekSlotCount = (p.freeSlots || []).filter(s =>
                  displayedWeekSlotsSet.has(s)
                ).length

                return (
                  <div
                    key={p.userId}
                    onClick={() =>
                      setSpotlightUserId(prev => (prev === p.userId ? null : p.userId))
                    }
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSpotlightUserId(prev => (prev === p.userId ? null : p.userId))
                      }
                    }}
                    title={`Click to ${isSpotlit ? 'clear highlight' : `highlight ${p.userName}'s free times`}`}
                    className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border cursor-pointer transition-all ${
                      isSpotlit
                        ? 'bg-[var(--blue-light)] border-[var(--blue)] shadow-2xs'
                        : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] border-[var(--border)]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar initials={p.initials} bg={p.avatarBg} size={26} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs font-semibold text-[var(--text)] truncate">
                            {p.userName}
                          </span>
                          {p.isYou && (
                            <span className="px-1.5 py-0.5 rounded-md bg-[var(--blue-light)] text-[var(--blue-ink)] text-[10px] font-bold shrink-0">
                              You
                            </span>
                          )}
                          {isEditingThisPerson && !p.isYou && (
                            <span className="px-1.5 py-0.5 rounded-md bg-[var(--green-light)] text-[var(--green-ink)] text-[10px] font-bold shrink-0">
                              Editing
                            </span>
                          )}
                        </div>
                        {p.clubName && (
                          <div className="text-[10.5px] text-[var(--text-muted)] truncate">
                            {p.clubName}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {p.isGuest && !isEditingThisPerson && (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation()
                            setGuestOverrideName(p.userName)
                            setGridMode('mine')
                            setSpotlightUserId(null)
                          }}
                          className="px-2 py-0.5 rounded-md bg-[var(--bg-card)] text-[10.5px] font-semibold text-[var(--blue-ink)] border border-[var(--border)] cursor-pointer hover:border-[var(--blue)]"
                        >
                          Edit
                        </button>
                      )}

                      {p.isYou && guestOverrideName && (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation()
                            setGuestOverrideName('')
                            setGridMode('mine')
                            setSpotlightUserId(null)
                          }}
                          className="px-2 py-0.5 rounded-md bg-[var(--bg-card)] text-[10.5px] font-semibold text-[var(--blue-ink)] border border-[var(--border)] cursor-pointer hover:border-[var(--blue)]"
                        >
                          Edit Mine
                        </button>
                      )}

                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold font-mono-num ${
                          weekSlotCount > 0
                            ? 'bg-[var(--green-light)] text-[var(--green-ink)]'
                            : 'bg-[var(--bg-card)] text-[var(--text-light)]'
                        }`}
                      >
                        {weekSlotCount > 0 ? `${formatHoursFromSlots(weekSlotCount)} free` : 'None'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Card 2 (BELOW RESPONDERS): Ranked Best Meeting Windows */}
          <Card className={isCompact ? 'p-3.5 sm:p-4' : 'p-4 sm:p-5'} delay={4}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-[var(--yellow)] shrink-0" />
                <h3 className="text-sm font-bold text-[var(--text)]">Best Meeting Windows</h3>
              </div>

              {/* Meeting Length Selector right inside Best Meeting Windows */}
              <div
                className="inline-flex items-center gap-0.5 bg-[var(--bg-surface)] p-0.5 rounded-lg border border-[var(--border)]"
                aria-label="Meeting duration"
              >
                {[30, 60, 90, 120].map(mins => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setDurationMins(mins)}
                    className={`px-2 min-h-[24px] rounded-md text-[11px] font-semibold cursor-pointer border-none transition-colors ${
                      durationMins === mins
                        ? 'bg-[var(--bg-card)] text-[var(--blue-ink)] shadow-2xs'
                        : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {formatDurationShort(mins)}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-[var(--text-muted)] mb-3">
              Top overlapping times for a {formatDurationProse(durationMins)} meeting. Hover to
              preview on the grid.
            </p>

            {bestMeetingWindows.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {bestMeetingWindows.map((win, idx) => {
                  const dayLabel = formatTimeFromIso(win.startIso, use24h, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  }).replace(/,?\s*\d{1,2}:\d{2}.*$/, '')
                  const startClock = formatTimeFromIso(win.startIso, use24h)
                  const endClock = formatTimeFromIso(win.endIso, use24h)
                  const isEveryone = win.availableCount === allParticipants.length
                  const pct = Math.round(
                    (win.availableCount / Math.max(1, allParticipants.length)) * 100
                  )
                  const missingNames = (win.unavailableUsers || []).map(
                    u => u.userName.split(' ')[0]
                  )

                  return (
                    <div
                      key={win.id}
                      onMouseEnter={() => {
                        setHoveredSlotIso(win.startIso)
                        setHoveredWindowRange({ startMs: win.startMs, endMs: win.endMs })
                      }}
                      onMouseLeave={() => {
                        setHoveredSlotIso(null)
                        setHoveredWindowRange(null)
                      }}
                      style={{
                        borderLeftWidth: '3.5px',
                        borderLeftColor: win.scheduledEvent
                          ? 'var(--blue)'
                          : idx === 0
                            ? 'var(--green)'
                            : 'var(--teal)',
                      }}
                      className={`content-tile ${
                        isCompact ? 'p-2.5 space-y-2' : 'p-3.5 space-y-2.5'
                      } rounded-xl hover:border-[var(--blue)] transition-colors`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-extrabold font-mono-num ${
                                idx === 0
                                  ? 'bg-[var(--green-light)] text-[var(--green-ink)]'
                                  : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
                              }`}
                            >
                              #{idx + 1}
                            </span>
                            <span className="text-xs sm:text-[13px] font-bold text-[var(--text)] truncate">
                              {dayLabel} · {startClock} – {endClock}
                            </span>
                          </div>
                        </div>

                        <BubbleTag
                          label={
                            isEveryone
                              ? `All ${win.availableCount} free`
                              : `${win.availableCount}/${allParticipants.length} free`
                          }
                          color={isEveryone ? 'green' : 'blue'}
                          size="sm"
                        />
                      </div>

                      {/* Overlap Progress Bar */}
                      <div className="w-full h-1.5 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--green)] transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      {/* Responder Summary + Schedule Action */}
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="flex items-center -space-x-1.5 shrink-0">
                            {win.availableUsers.slice(0, 4).map(u => (
                              <div
                                key={u.userId}
                                title={u.userName}
                                className="rounded-full ring-1 ring-[var(--bg-surface)]"
                              >
                                <Avatar initials={u.initials} bg={u.avatarBg} size={20} />
                              </div>
                            ))}
                          </div>
                          <span className="text-[11px] text-[var(--text-muted)] truncate">
                            {isEveryone
                              ? 'Everyone can make it'
                              : missingNames.length <= 2
                                ? `Missing: ${missingNames.join(', ')}`
                                : win.availableUsers.map(u => u.userName.split(' ')[0]).join(', ')}
                          </span>
                        </div>

                        {win.scheduledEvent ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {onOpenCalendar && (
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation()
                                  onOpenCalendar()
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer"
                              >
                                <span>Calendar</span>
                                <ArrowRight size={11} />
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
                              className="inline-flex items-center gap-1 px-2 min-h-[28px] rounded-lg bg-[var(--red-light)] text-[var(--red-ink)] text-[11px] font-semibold border-none cursor-pointer hover:opacity-85"
                            >
                              <Trash2 size={11} />
                              <span>Cancel</span>
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={bookingBusy}
                            onClick={e => {
                              e.stopPropagation()
                              handleScheduleSlot(win.startIso)
                            }}
                            className="inline-flex items-center gap-1 px-3 min-h-[30px] rounded-lg bg-[var(--blue)] text-white text-[11.5px] font-semibold border-none cursor-pointer hover:opacity-90 transition-opacity shrink-0"
                          >
                            <CalendarPlus size={12} />
                            <span>Schedule {formatDurationShort(durationMins)}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="py-5 px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-center text-xs text-[var(--text-muted)]">
                No {formatDurationProse(durationMins)} overlap found yet for this week. Mark more
                free times or switch length to 30m.
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
