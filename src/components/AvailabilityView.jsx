import Select from './Select'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Clock,
  Users,
  Check,
  Sparkles,
  Plus,
  Trash2,
  Archive,
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  Shield,
  CalendarPlus,
  Share2,
  ArrowRight,
  MapPin,
  RotateCcw,
  X,
  Mail,
} from 'lucide-react'
import { Card, BubbleTag, Avatar, cleanText, Button, IconButton, ActionDisclosure, ActionItem, ModalDialog, PageToolbar, SegmentedControl } from './ui'
import { PlatformIcon } from './icons'
import {
  getSchedulerPolls,
  getSchedulerPoll,
  bookSchedulerSlot,
  unbookSchedulerSlot,
} from '../api/client'
import {
  ensureWorkspaceAuthReady,
  getWorkspaceMe,
  getClubPeopleAndGroups,
  createVerifiedPoll,
  inviteShortcutsToPoll,
  submitVerifiedPollResponse,
  archiveVerifiedPoll,
  deleteVerifiedPoll,
} from '../api/workspaceClient'
import LeadershipShortcutBar, { resolveDeduplicatedTargets } from './LeadershipShortcutBar'
import {
  dispatchDiscordNotification,
  dispatchEmailNotification,
} from '../utils/directIntegrations'

const BASE_MONDAY = '2026-11-16'
const DEFAULT_TZ = 'America/Los_Angeles'
const PENDING_POLL_SESSION_KEY = 'clubhub_pending_poll_id'

const RESPONDER_GRADIENTS = [
  '#1A73E8', // Google Blue
  '#6750A4', // Google Purple
  '#00796B', // Google Teal
  '#E37400', // Google Amber
  '#1E8E3E', // Google Green
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

const EMPTY_POLL_TEMPLATE = {
  id: '',
  title: 'No Poll Selected',
  hostClubId: '',
  hostClubName: '',
  visibility: 'public_link',
  dates: DEFAULT_DATES,
  startHour: 9,
  endHour: 19,
  slotMinutes: 30,
  baseTimezone: DEFAULT_TZ,
  location: '',
  invitedParticipants: [],
  responses: [],
  calendarEvents: [],
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

export default function AvailabilityView({
  user = null,
  accountKey = 'guest',
  isDemo = false,
  userSettings = {},
  clubs = [],
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
  const isAuthenticated = Boolean(effectiveUser?.id)

  const defaultUserName =
    userSettings?.displayName?.trim() ||
    effectiveUser?.fullName ||
    effectiveUser?.primaryEmailAddress?.emailAddress?.split('@')[0] ||
    effectiveUser?.email?.split('@')[0] ||
    'Guest'

  const signedInUserId = effectiveUser?.id || ''
  const [workspaceUserId, setWorkspaceUserId] = useState('')
  const signedInAvatarBg =
    userSettings?.avatarBg ||
    effectiveUser?.avatarBg ||
    '#1A73E8'

  const [polls, setPolls] = useState([])
  const [pollsLoading, setPollsLoading] = useState(true)
  const [selectedPollId, setSelectedPollId] = useState(() => getInitialRequestedPollId() || '')
  const [weekAnchorDate, setWeekAnchorDate] = useState(BASE_MONDAY)
  const [mobileDay, setMobileDay] = useState(BASE_MONDAY)

  // 'mine' = click & drag to add or deselect free times | 'group' = view everyone's overlap
  const [gridMode, setGridMode] = useState('mine')

  const activePersonName = defaultUserName
  const currentUserId = workspaceUserId || signedInUserId
  const isMyUserId = useCallback(
    uid =>
      Boolean(
        uid &&
          ((workspaceUserId && uid === workspaceUserId) ||
            (signedInUserId && uid === signedInUserId))
      ),
    [workspaceUserId, signedInUserId]
  )

  // Spotlight filter: click a responder in the Responders card to highlight their free times
  const [spotlightUserId, setSpotlightUserId] = useState(null)

  const [slotsByPoll, setSlotsByPoll] = useState({})

  // Synchronous drag session ref + lightweight visual preview state
  const dragRef = useRef(null)
  const tbodyRef = useRef(null)
  const handledByPointerDownRef = useRef(false)
  const slotsByPollRef = useRef(slotsByPoll)
  slotsByPollRef.current = slotsByPoll
  const [dragUiState, setDragUiState] = useState(null)
  const [autoSaveState, setAutoSaveState] = useState('saved')

  // Hovered or clicked slot & contiguous window range for full-block grid highlighting
  const [hoveredSlotIso, setHoveredSlotIso] = useState(null)
  const [hoveredWindowRange, setHoveredWindowRange] = useState(null)
  const [pinnedSlotIso, setPinnedSlotIso] = useState(null)
  const [durationMins, setDurationMins] = useState(60)
  const [bookingBusy, setBookingBusy] = useState(false)

  // New Poll inline drawer + Leadership Targeting Shortcuts
  const [showNewPollForm, setShowNewPollForm] = useState(false)
  const [newPollTitle, setNewPollTitle] = useState('')
  const [newPollDate, setNewPollDate] = useState(BASE_MONDAY)
  const [newPollLocation, setNewPollLocation] = useState('')
  const [newPollClubId, setNewPollClubId] = useState('')
  const [newPollVisibility, setNewPollVisibility] = useState('public_link')
  const [newPollShortcuts, setNewPollShortcuts] = useState([])
  const [createPollBusy, setCreatePollBusy] = useState(false)

  // Leadership shortcut invite drawer on an existing club poll
  const [showExistingInviteShortcuts, setShowExistingInviteShortcuts] = useState(false)
  const [existingInviteShortcuts, setExistingInviteShortcuts] = useState([])
  const [inviteBusy, setInviteBusy] = useState(false)
  const [clubPeopleCache, setClubPeopleCache] = useState({})

  // Poll creator lifecycle controls (Archive / Unarchive & Delete)
  const [pollActionBusy, setPollActionBusy] = useState('')
  const [confirmDeletePollId, setConfirmDeletePollId] = useState(null)

  const saveTimerRef = useRef(null)

  const activePolls = useMemo(() => polls.filter(p => !p.archived), [polls])
  const archivedPolls = useMemo(() => polls.filter(p => Boolean(p.archived)), [polls])

  const activePoll = useMemo(() => {
    const explicit = selectedPollId ? polls.find(p => p.id === selectedPollId) : null
    if (explicit) return explicit
    return (
      activePolls[0] ||
      EMPTY_POLL_TEMPLATE
    )
  }, [polls, selectedPollId, activePolls])

  const hasActivePoll = Boolean(activePoll.id)
  const isActivePollArchived = Boolean(hasActivePoll && activePoll.archived)
  const isActivePollCreator = Boolean(
    hasActivePoll &&
      isAuthenticated &&
      (activePoll.isCreator || isMyUserId(activePoll.createdByUserId))
  )

  useEffect(() => {
    let cancelled = false
    if (!isAuthenticated) {
      setWorkspaceUserId('')
      return undefined
    }
    ;(async () => {
      await ensureWorkspaceAuthReady(effectiveUser)
      const me = await getWorkspaceMe()
      if (!cancelled && me?.ok && me.user?.id) {
        setWorkspaceUserId(me.user.id)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, signedInUserId, effectiveUser])

  // Load club people & sub-groups for RBAC shortcut buttons when creating or viewing a club poll
  const ensureClubPeopleLoaded = useCallback(async clubId => {
    if (!clubId) return
    const res = await getClubPeopleAndGroups(clubId)
    if (res?.ok) {
      setClubPeopleCache(prev => ({ ...prev, [clubId]: res }))
    }
  }, [])

  useEffect(() => {
    if (newPollClubId && isAuthenticated) {
      ensureClubPeopleLoaded(newPollClubId)
    }
  }, [newPollClubId, isAuthenticated, ensureClubPeopleLoaded])

  useEffect(() => {
    if (activePoll.hostClubId && isAuthenticated) {
      ensureClubPeopleLoaded(activePoll.hostClubId)
    }
  }, [activePoll.hostClubId, isAuthenticated, ensureClubPeopleLoaded])

  const newPollClubPeople = newPollClubId ? clubPeopleCache[newPollClubId] || null : null
  const activePollClubPeople = activePoll.hostClubId
    ? clubPeopleCache[activePoll.hostClubId] || null
    : null

  const newPollPreviewTargets = useMemo(
    () => resolveDeduplicatedTargets(newPollClubPeople, newPollShortcuts, []),
    [newPollClubPeople, newPollShortcuts]
  )

  useEffect(() => {
    if (!onPageContextChange) return
    const pollTitle = hasActivePoll ? cleanText(activePoll?.title || '') : ''
    onPageContextChange({
      nav: 'availability',
      label: pollTitle ? `${pollTitle}${gridMode === 'group' ? ' (Group Overlap)' : ''}` : null,
      modal: showNewPollForm ? 'new_poll' : null,
    })
  }, [onPageContextChange, hasActivePoll, activePoll?.title, gridMode, showNewPollForm])

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

  const loadPolls = useCallback(async () => {
    setPollsLoading(true)
    const requestedPollId = getInitialRequestedPollId()
    if (requestedPollId) {
      try {
        sessionStorage.removeItem(PENDING_POLL_SESSION_KEY)
      } catch {
        // Ignore sessionStorage errors
      }
    }

    if (isAuthenticated) {
      await ensureWorkspaceAuthReady(effectiveUser)
    }

    const data = await getSchedulerPolls({ includeArchived: '1' })
    let list = Array.isArray(data) ? data : []
    if (requestedPollId && !list.some(p => p.id === requestedPollId)) {
      const directPoll = await getSchedulerPoll(requestedPollId)
      if (directPoll?.id) {
        list = [directPoll, ...list]
      }
    }
    setPolls(list)
    if (list.length > 0) {
      const requestedMatch = requestedPollId ? list.find(p => p.id === requestedPollId) : null
      setSelectedPollId(prev => {
        if (requestedMatch) return requestedMatch.id
        if (prev && list.some(p => p.id === prev)) return prev
        const firstActive = list.find(p => !p.archived)
        return firstActive ? firstActive.id : ''
      })
    } else {
      setSelectedPollId('')
    }
    setPollsLoading(false)
  }, [isAuthenticated, effectiveUser])

  useEffect(() => {
    loadPolls()
  }, [loadPolls, signedInUserId, workspaceUserId])

  // Sync displayed week whenever the user switches to a poll with its own target week
  useEffect(() => {
    const firstDate = activePoll?.dates?.[0]
    if (firstDate) {
      setWeekAnchorDate(firstDate)
      setMobileDay(firstDate)
    }
    setPinnedSlotIso(null)
    setShowExistingInviteShortcuts(false)
    setExistingInviteShortcuts([])
    setConfirmDeletePollId(null)
  }, [activePoll?.id])

  const pollLocalMap = useMemo(
    () => (activePoll.id ? slotsByPoll[activePoll.id] || {} : {}),
    [slotsByPoll, activePoll.id]
  )

  // Authenticated user's live free slots on the active poll (strictly bound to DB responses + in-flight edits)
  const myFreeSlots = useMemo(() => {
    if (!currentUserId || !activePoll.id) return new Set()
    const localSet =
      pollLocalMap[currentUserId] ||
      (workspaceUserId ? pollLocalMap[workspaceUserId] : null) ||
      (signedInUserId ? pollLocalMap[signedInUserId] : null)
    if (localSet) {
      return localSet
    }
    const existingResp = (activePoll.responses || []).find(r => isMyUserId(r.userId))
    if (existingResp && Array.isArray(existingResp.freeSlots)) {
      return new Set(existingResp.freeSlots)
    }
    return new Set()
  }, [
    pollLocalMap,
    currentUserId,
    workspaceUserId,
    signedInUserId,
    isMyUserId,
    activePoll.responses,
    activePoll.id,
  ])

  // Sync authenticated user's availability directly to the database (zero localStorage PII)
  const persistPollUserSlots = useCallback(
    (nextByPoll, targetPollId, targetUserId) => {
      if (!targetPollId || !targetUserId) return
      setAutoSaveState('saving')
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(async () => {
        const freeArr = Array.from(nextByPoll?.[targetPollId]?.[targetUserId] || [])
        const res = await submitVerifiedPollResponse(
          targetPollId,
          {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ,
            freeSlots: freeArr,
            busySlots: [],
          },
          effectiveUser
        )
        const updatedPoll = res?.data?.id ? res.data : res?.poll?.id ? res.poll : res?.id ? res : null
        if (res?.ok && updatedPoll?.id) {
          setPolls(prev => prev.map(p => (p.id === updatedPoll.id ? updatedPoll : p)))
        } else if (!res?.ok && onNotify) {
          onNotify(res?.error || 'Could not save poll response.', { type: 'error' })
        }
        setAutoSaveState('saved')
      }, 350)
    },
    [onNotify, effectiveUser]
  )

  const commitUserSet = useCallback(
    (updatedSet, targetPollId = activePoll.id, targetUserId = currentUserId) => {
      if (!isAuthenticated || !targetUserId) {
        if (onNotify) {
          onNotify('Sign in with your account to mark availability on polls.', { type: 'info' })
        }
        return
      }
      if (!targetPollId) return
      const targetPollObj = polls.find(p => p.id === targetPollId)
      if (targetPollObj?.archived) {
        if (onNotify) {
          onNotify('This poll is archived. Unarchive it first to edit availability.', {
            type: 'info',
          })
        }
        return
      }
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
      persistPollUserSlots(nextByPoll, targetPollId, targetUserId)
    },
    [activePoll.id, currentUserId, isAuthenticated, onNotify, persistPollUserSlots, polls]
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
    persistPollUserSlots(nextByPoll, session.pollId, session.userId)

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

  // Strictly real authenticated poll responders (plus live in-flight edits for the signed-in user)
  const allParticipants = useMemo(() => {
    if (!hasActivePoll) return []
    const map = new Map()
    let colorIdx = 0

    if (isAuthenticated && currentUserId) {
      const signedUserLocalSet =
        pollLocalMap[currentUserId] ||
        (workspaceUserId ? pollLocalMap[workspaceUserId] : null) ||
        (signedInUserId ? pollLocalMap[signedInUserId] : null)
      const signedExistingResp = (activePoll.responses || []).find(r => isMyUserId(r.userId))
      const liveSlots = signedUserLocalSet
        ? Array.from(signedUserLocalSet)
        : signedExistingResp?.freeSlots || []

      if (signedExistingResp || (signedUserLocalSet && signedUserLocalSet.size > 0)) {
        map.set(currentUserId, {
          userId: currentUserId,
          userName: signedExistingResp?.userName || defaultUserName,
          initials: getInitials(signedExistingResp?.userName || defaultUserName),
          avatarBg: signedInAvatarBg,
          roleTitle: signedExistingResp?.roleTitle || '',
          clubName: signedExistingResp?.clubName || '',
          isYou: true,
          freeSlots: liveSlots,
        })
      }
    }

    for (const r of activePoll.responses || []) {
      if (!r?.userId) continue
      if (isMyUserId(r.userId) && map.has(currentUserId)) continue
      const cleanName = cleanText(r.userName || 'Member')
      const isSelf = isMyUserId(r.userId)
      map.set(r.userId, {
        userId: r.userId,
        userName: cleanName,
        initials: getInitials(cleanName),
        avatarBg: isSelf
          ? signedInAvatarBg
          : RESPONDER_GRADIENTS[colorIdx++ % RESPONDER_GRADIENTS.length],
        roleTitle: cleanText(r.roleTitle || ''),
        clubName: cleanText(r.clubName || ''),
        isYou: isSelf,
        freeSlots: r.freeSlots || [],
      })
    }

    return Array.from(map.values())
  }, [
    hasActivePoll,
    isAuthenticated,
    activePoll.responses,
    pollLocalMap,
    currentUserId,
    workspaceUserId,
    signedInUserId,
    isMyUserId,
    defaultUserName,
    signedInAvatarBg,
  ])

  const activeParticipant = useMemo(
    () =>
      allParticipants.find(p => p.isYou || isMyUserId(p.userId)) || {
        userName: activePersonName,
        initials: getInitials(activePersonName),
        avatarBg: signedInAvatarBg,
      },
    [allParticipants, isMyUserId, activePersonName, signedInAvatarBg]
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
    const lastDay = p1.m === p2.m ? p2.d : d2.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    return `${s1} – ${lastDay}, ${p2.y}`
  }, [displayedWeekDates])

  function beginDragAtCell(e, colIdx, rowIdx, iso, isSingleDayMobile = false) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    setHoveredSlotIso(iso)

    if (gridMode !== 'mine') {
      setPinnedSlotIso(prev => (prev === iso ? null : iso))
      return
    }

    if (!hasActivePoll) {
      if (onNotify) onNotify('Create or select a poll first to mark your free times.', { type: 'info' })
      return
    }

    if (!isAuthenticated || !currentUserId) {
      if (onNotify) onNotify('Sign in with your account to mark availability.', { type: 'info' })
      return
    }

    if (isActivePollArchived) {
      if (onNotify) {
        onNotify('This poll is archived. Unarchive it first to edit availability.', {
          type: 'info',
        })
      }
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

  function toggleNewPollShortcut(token) {
    setNewPollShortcuts(prev =>
      prev.includes(token) ? prev.filter(t => t !== token) : [...prev, token]
    )
  }

  function toggleExistingPollShortcut(token) {
    setExistingInviteShortcuts(prev =>
      prev.includes(token) ? prev.filter(t => t !== token) : [...prev, token]
    )
  }

  async function handleApplyExistingShortcuts() {
    if (!hasActivePoll || !activePoll.hostClubId || existingInviteShortcuts.length === 0) return
    setInviteBusy(true)
    const res = await inviteShortcutsToPoll(
      activePoll.id,
      {
        clubId: activePoll.hostClubId,
        shortcutTargets: existingInviteShortcuts,
      },
      effectiveUser
    )
    setInviteBusy(false)
    const updatedPoll = res?.data?.id ? res.data : res?.poll?.id ? res.poll : res?.id ? res : null
    if (res?.ok && updatedPoll?.id) {
      setPolls(prev => prev.map(p => (p.id === updatedPoll.id ? updatedPoll : p)))
      setExistingInviteShortcuts([])
      setShowExistingInviteShortcuts(false)
      if (onNotify) {
        onNotify(
          `Invited ${updatedPoll.invitedParticipants?.length || 0} deduplicated club members to "${updatedPoll.title}".`
        )
      }
    } else if (onNotify) {
      onNotify(res?.error || 'Could not invite club shortcuts.', { type: 'error' })
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
    if (!newPollTitle.trim() || createPollBusy) return
    if (!isAuthenticated) {
      if (onNotify) onNotify('Sign in with your account to create an availability poll.', { type: 'info' })
      return
    }

    setCreatePollBusy(true)
    const startDay = getWeekStartOfDate(newPollDate || BASE_MONDAY, weekStartsOn)
    const weekDates = getWeekDatesFromStart(startDay)
    const selectedClub = clubs.find(c => c.id === newPollClubId)
    const payload = {
      title: newPollTitle.trim(),
      location: newPollLocation.trim() || 'TBD',
      dates: weekDates,
      baseTimezone: DEFAULT_TZ,
      hostClubId: newPollClubId || '',
      hostClubName: selectedClub?.name || '',
      visibility: newPollClubId ? newPollVisibility : 'public_link',
      shortcutTargets:
        newPollClubId && newPollClubPeople?.permission?.isBoard ? newPollShortcuts : [],
    }

    const res = await createVerifiedPoll(payload, effectiveUser)
      .catch(() => ({ ok: false, error: 'Could not confirm the poll change. Check the poll and try again.' }))
      .finally(() => setCreatePollBusy(false))

    const pollObj = res?.data?.id ? res.data : res?.poll?.id ? res.poll : res?.id ? res : null
    if (!res?.ok || !pollObj?.id) {
      if (onNotify) {
        onNotify(res?.error || 'Could not create poll.', { type: 'error' })
      }
      return
    }

    setPolls(prev => [pollObj, ...prev.filter(p => p.id !== pollObj.id)])
    setSelectedPollId(pollObj.id)
    setWeekAnchorDate(startDay)
    setMobileDay(startDay)
    setNewPollTitle('')
    setNewPollLocation('')
    setNewPollShortcuts([])
    setShowNewPollForm(false)
    setGridMode('mine')
    setSpotlightUserId(null)
    if (onNotify) {
      onNotify(`Created poll "${pollObj.title}". Click or drag when you're free!`)
    }
  }

  async function handleToggleArchivePoll(
    targetPoll = activePoll,
    nextArchived = !targetPoll?.archived
  ) {
    if (!targetPoll?.id || pollActionBusy) return
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    setPollActionBusy('archive')
    const res = await archiveVerifiedPoll(targetPoll.id, nextArchived, effectiveUser)
      .catch(() => ({ ok: false, error: 'Could not confirm the poll change. Check the poll and try again.' }))
      .finally(() => setPollActionBusy(''))

    const updatedPoll = res?.poll || res?.data || null
    if (!res?.ok || !updatedPoll?.id) {
      if (onNotify) {
        onNotify(res?.error || 'Could not update poll archive status.', { type: 'error' })
      }
      return
    }

    setConfirmDeletePollId(null)
    setPolls(prev => {
      const nextList = prev.map(p => (p.id === updatedPoll.id ? updatedPoll : p))
      if (nextArchived) {
        const nextActive = nextList.find(p => !p.archived)
        setSelectedPollId(nextActive ? nextActive.id : '')
      } else {
        setSelectedPollId(updatedPoll.id)
      }
      return nextList
    })

    if (onNotify) {
      const titleText = cleanText(updatedPoll.title || targetPoll.title)
      if (nextArchived) {
        onNotify(`Archived "${titleText}".`, {
          actionLabel: 'Undo',
          onAction: () => handleToggleArchivePoll(updatedPoll, false),
        })
      } else {
        onNotify(`Restored "${titleText}" to active polls.`)
      }
    }
  }

  async function handleDeletePoll(targetPoll = activePoll) {
    if (!targetPoll?.id || pollActionBusy) return
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    setPollActionBusy('delete')
    const res = await deleteVerifiedPoll(targetPoll.id, effectiveUser)
      .catch(() => ({ ok: false, error: 'Could not confirm the poll change. Check the poll and try again.' }))
      .finally(() => setPollActionBusy(''))

    if (!res?.ok) {
      if (onNotify) {
        onNotify(res?.error || 'Could not delete poll.', { type: 'error' })
      }
      return
    }

    const deletedId = targetPoll.id
    const titleText = cleanText(targetPoll.title)
    setConfirmDeletePollId(null)
    setSpotlightUserId(null)

    const nextByPoll = { ...slotsByPollRef.current }
    delete nextByPoll[deletedId]
    slotsByPollRef.current = nextByPoll
    setSlotsByPoll(nextByPoll)

    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href)
        if (url.searchParams.get('poll') === deletedId) {
          url.searchParams.delete('poll')
          window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
        }
      } catch {
        // Ignore history state errors
      }
    }

    if (Array.isArray(res?.removedEventIds) && res.removedEventIds.length > 0) {
      if (onEventBooked) await onEventBooked()
      if (onRemoveLocalEvent) {
        for (const rid of res.removedEventIds) onRemoveLocalEvent(rid)
      }
    }

    setPolls(prev => {
      const remaining = prev.filter(p => p.id !== deletedId)
      const remainingActive = remaining.filter(p => !p.archived)
      const remainingArchived = remaining.filter(p => p.archived)
      if (selectedPollId === deletedId || !selectedPollId) {
        const fallback =
          remainingActive[0]?.id ||
          (targetPoll.archived ? remainingArchived[0]?.id : '') ||
          ''
        setSelectedPollId(fallback)
      }
      return remaining
    })

    if (onNotify) {
      onNotify(`Deleted poll "${titleText}".`, { type: 'info' })
    }
  }

  async function handleScheduleSlot(slotIso) {
    if (!slotIso) return
    if (isActivePollArchived) {
      if (onNotify) {
        onNotify('This poll is archived. Unarchive it before scheduling a meeting.', {
          type: 'info',
        })
      }
      return
    }
    setBookingBusy(true)
    const endIso = new Date(new Date(slotIso).getTime() + durationMins * 60 * 1000).toISOString()
    const eventId = `collab_evt_${activePoll.id}_${new Date(slotIso).getTime()}`

    const res = await bookSchedulerSlot(activePoll.id, {
      start: slotIso,
      end: endIso,
      title: activePoll.title,
      clubId: activePoll.hostClubId || 'personal_poll',
      clubName: activePoll.hostClubName || 'Group Poll',
      location: activePoll.location || 'TBD',
    })
    setBookingBusy(false)

    if (res && res.booked && res.poll) {
      setPolls(prev => prev.map(p => (p.id === res.poll.id ? res.poll : p)))
      if (onEventBooked) await onEventBooked()
    } else if (res?.error) {
      if (onNotify) onNotify(res.error, { type: 'error' })
      return
    } else {
      const localEv = {
        id: eventId,
        clubId: activePoll.hostClubId || 'personal_poll',
        clubName: activePoll.hostClubName || 'Group Poll',
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


  return (
    <div className="page-stack">
      <PageToolbar title="Group availability" actions={
        <Button size="sm" variant={showNewPollForm ? 'outlined-neutral' : 'filled'}
          icon={showNewPollForm ? <X size={14} /> : <Plus size={14} />}
          reserveLabels={['New poll', 'Close poll form']}
          aria-expanded={showNewPollForm} aria-controls="create-availability-poll"
          onClick={() => setShowNewPollForm(prev => !prev)}>
          {showNewPollForm ? 'Close poll form' : 'New poll'}
        </Button>
      } />

      <div className="flex flex-wrap items-center justify-between gap-2 dense-controls">
        <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
          {(activePolls.length > 0 || archivedPolls.length > 0) && (
            <Select
              className="control-select w-full sm:w-auto sm:max-w-80 [--select-width:19rem]"
              aria-label="Select poll"
              value={activePoll.id || ''}
              onValueChange={nextValue => {
                setSelectedPollId(nextValue)
                setSpotlightUserId(null)
                setConfirmDeletePollId(null)
              }}
              search="auto"
              options={[
                ...(!hasActivePoll ? [{ value: "", label: "Select a poll", disabled: true }] : []),
                ...(activePolls.length > 0 ? activePolls.map(poll => ({ value: poll.id, label: cleanText(poll.title), group: "Active polls" })) : []),
                ...(archivedPolls.length > 0 ? archivedPolls.map(poll => ({ value: poll.id, label: cleanText(poll.title), group: "Archived polls" })) : []),
              ]}
            />
          )}
          {hasActivePoll && activePoll.location && (
            <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] min-w-0 break-words">
              <MapPin size={14} className="shrink-0" />
              {cleanText(activePoll.location)}
            </span>
          )}
          {isActivePollArchived && <BubbleTag label="Archived · responses are read-only" color="yellow" />}
          {!hasActivePoll && !showNewPollForm && (
            <span className="text-xs text-[var(--text-muted)]" role="status">
              {pollsLoading ? 'Loading polls…' : 'No active polls'}
            </span>
          )}
        </div>
        {(hasActivePoll || isActivePollCreator) && (
          <div className="flex items-center gap-2 ml-auto">
            {!isActivePollArchived && (
              <ActionDisclosure label="Share poll" pending={Boolean(shareBusy)} pendingLabel="Sharing…" icon={<Share2 size={14} />}>
                {() => (
                  <>
                    <ActionItem onClick={handleCopyShareLink}>Copy invite link</ActionItem>
                    <ActionItem disabled={Boolean(shareBusy)} onClick={handleSharePollDiscord}
                      icon={<PlatformIcon type="discord" size={14} />} pending={shareBusy === 'discord'} pendingLabel="Posting…">
                      Share to Discord
                    </ActionItem>
                    <ActionItem disabled={Boolean(shareBusy)} onClick={handleSharePollEmail} icon={<Mail size={14} />} pending={shareBusy === 'email'} pendingLabel="Sending…">
                      Share by email
                    </ActionItem>
                  </>
                )}
              </ActionDisclosure>
            )}
            {isActivePollCreator && (
              <ActionDisclosure key={activePoll.id} label="Poll actions" iconOnly>
                {close => (
                  <>
                    <ActionItem pending={pollActionBusy === 'archive'} pendingLabel="Updating…"
                      onClick={() => handleToggleArchivePoll(activePoll, !isActivePollArchived)}
                      icon={isActivePollArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}>
                      {isActivePollArchived ? 'Unarchive poll' : 'Archive poll'}
                    </ActionItem>
                    <ActionItem danger disabled={Boolean(pollActionBusy)} icon={<Trash2 size={14} />}
                      onClick={() => {
                        close()
                        setConfirmDeletePollId(activePoll.id)
                      }}>
                      Delete poll
                    </ActionItem>
                  </>
                )}
              </ActionDisclosure>
            )}
          </div>
        )}
      </div>

      {isActivePollCreator && confirmDeletePollId === activePoll.id && (
        <ModalDialog title="Delete poll?" onClose={() => setConfirmDeletePollId(null)} footer={
          <>
            <Button variant="text" onClick={() => setConfirmDeletePollId(null)}>Cancel</Button>
            <Button variant="danger" pending={pollActionBusy === 'delete'} pendingLabel="Deleting…" onClick={() => handleDeletePoll(activePoll)}>
              Delete poll
            </Button>
          </>
        }>
          <p className="text-sm text-[var(--text-muted)]">
            Deleting {cleanText(activePoll.title)} permanently removes the poll and its responses.
          </p>
        </ModalDialog>
      )}

        {/* New Poll Drawer */}
        {showNewPollForm && (
          <form
            id="create-availability-poll"
            onSubmit={handleCreatePollSubmit}
            className="section-pad content-tile rounded-xl space-y-3 fade-in"
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

            {clubs.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                    Host Club (Optional)
                  </label>
                  <Select
                    aria-label="Host club"
                    value={newPollClubId}
                    onValueChange={nextValue => {
                      setNewPollClubId(nextValue)
                      setNewPollShortcuts([])
                      setNewPollVisibility('public_link')
                    }}
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                    search
                    options={[
                      { value: "", label: "Personal / Cross-Club Poll" },
                      ...clubs.map(c => ({ value: c.id, label: cleanText(c.name) })),
                    ]}
                  />
                </div>

                {newPollClubId && (
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                      Poll Access Tier
                    </label>
                    <Select
                      aria-label="Poll access tier"
                      value={newPollVisibility}
                      onValueChange={setNewPollVisibility}
                      className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                      options={[
                        { value: "public_link", label: "Anyone with Invite Link" },
                        { value: "club_members", label: "Club Members & Board Only" },
                        ...(newPollClubPeople?.permission?.isBoard ? [{ value: "board_only", label: "Board / Leadership Only" }] : []),
                      ]}
                    />
                  </div>
                )}
              </div>
            )}

            {newPollClubId && newPollClubPeople?.permission?.isBoard && (
              <div className="space-y-2">
                <LeadershipShortcutBar
                  clubPeople={newPollClubPeople}
                  selectedShortcuts={newPollShortcuts}
                  onToggleShortcut={toggleNewPollShortcut}
                  label="Leadership Poll Invite Shortcuts"
                />
                {newPollPreviewTargets.length > 0 && (
                  <div className="text-xs text-[var(--text-muted)] px-1">
                    Inviting{' '}
                    <strong className="text-[var(--text)] font-semibold">
                      {newPollPreviewTargets.length}
                    </strong>{' '}
                    unique club member{newPollPreviewTargets.length === 1 ? '' : 's'} (deduplicated across overlapping roles & sub-groups).
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="filled"
                size="md"
                type="submit"
                pending={createPollBusy} pendingLabel="Creating…"
              >
                Create Poll
              </Button>
            </div>
          </form>
        )}

      {/* ── 2. Balanced 2-Column Workspace: Interactive Schedule + Sticky Right Rail ── */}
      <div
        className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-[var(--section-gap)] items-start"
      >
        {/* LEFT: 7-Day Availability Schedule */}
        <Card className="section-pad select-none min-w-0" delay={1}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex flex-wrap items-center gap-0.5">
              <IconButton size="sm" ariaLabel="Previous week" onClick={() => setWeekAnchorDate(prev => addDaysToYmd(prev, -7))}>
                <ChevronLeft size={16} />
              </IconButton>
              <span className="text-sm font-medium">{weekLabel}</span>
              <IconButton size="sm" ariaLabel="Next week" onClick={() => setWeekAnchorDate(prev => addDaysToYmd(prev, 7))}>
                <ChevronRight size={16} />
              </IconButton>
            </div>
            {!isDefaultWeek && (
              <Button size="sm" variant="text" icon={<RotateCcw size={13} />}
                onClick={() => setWeekAnchorDate(defaultPollWeekStart)}>
                Go to poll week
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SegmentedControl
              ariaLabel="Availability view"
              className="availability-mode max-w-full"
              size="sm"
              options={[
                { value: 'mine', label: 'My Availability', badge: formatHoursFromSlots(myWeekFreeCount) },
                { value: 'group', label: 'Group Overlap', badge: allParticipants.length },
              ]}
              value={gridMode}
              onChange={setGridMode}
            />

            {gridMode === 'mine' && hasActivePoll && isAuthenticated && !isActivePollArchived && (
              <>
                <ActionDisclosure label="Fill week">
                  {close => (
                    <>
                      <ActionItem onClick={() => {
                        handleToggleWeekdayPreset(9, 12, 'mornings (9 AM–12 PM)')
                        close()
                      }}>{morningsAllSelected ? 'Clear mornings' : 'Mark mornings free'}</ActionItem>
                      <ActionItem onClick={() => {
                        handleToggleWeekdayPreset(13, 17, 'afternoons (1–5 PM)')
                        close()
                      }}>{afternoonsAllSelected ? 'Clear afternoons' : 'Mark afternoons free'}</ActionItem>
                      {myWeekFreeCount > 0 && (
                        <ActionItem onClick={() => { handleClearWeekTimes(); close() }}>Clear week</ActionItem>
                      )}
                    </>
                  )}
                </ActionDisclosure>
                <span className="text-xs text-[var(--text-muted)]" role="status">
                  {dragUiState ? (dragUiState.mode === 'remove' ? 'Deselecting…' : 'Selecting…') :
                    (autoSaveState === 'saving' ? 'Saving…' : 'Saved')}
                </span>
              </>
            )}
          </div>

          {/* Clear Contextual Instruction / Active Identity Banner */}
          <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs text-[var(--text-muted)]">
            {gridMode === 'mine' ? (
              <div className="flex flex-wrap items-center gap-2">
                {!isAuthenticated ? (
                  <span>Sign in with your account to mark availability on real club polls.</span>
                ) : !hasActivePoll ? (
                  <span>Create a poll above to begin collecting verified member availability.</span>
                ) : isActivePollArchived ? null : (
                  <span>Tap or click a time to toggle availability. Drag to select a range with a mouse.</span>
                )}
              </div>
            ) : (
              <span>
                Darker green shows stronger overlap. Select a time to see who is free.
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
          <div className="poll-day-grid space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Select
                aria-label="Availability day"
                value={mobileDay}
                onValueChange={setMobileDay}
                className="control-select ui-touch [--select-width:12rem]"
                options={displayedWeekDates.map(ymd => {
                  const { y, m, d } = parseDateParts(ymd)
                  const label = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
                  })
                  return { value: ymd, label: label }
                })}
              />
              {gridMode === 'mine' && hasActivePoll && isAuthenticated && !isActivePollArchived && (
                <div className="flex flex-wrap items-center gap-1">
                  {mobileDayFreeCount < timeRows.length && (
                    <Button variant="text" size="sm" className="!px-2" onClick={() => handleToggleMobileDay(true)}>
                      Select all day
                    </Button>
                  )}
                  {mobileDayFreeCount > 0 && (
                    <Button variant="text-neutral" size="sm" className="!px-2" onClick={() => handleToggleMobileDay(false)}>
                      Clear day
                    </Button>
                  )}
                </div>
              )}
            </div>

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
                      'bg-[var(--green)]/22 text-[var(--green-ink)] border-[var(--green)]/42'
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
                    aria-pressed={gridMode === 'mine' ? isMine : isPinned}
                    className={`w-full min-h-11 py-1.5 px-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer transition-colors ${rowStyle} ${
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
            className="poll-week-grid hidden md:block"
            onMouseLeave={() => setHoveredSlotIso(null)}
          >
            <div className="rounded-2xl border border-[var(--border)] overflow-hidden bg-[var(--bg-card)]">
              <table
                onDragStart={e => e.preventDefault()}
                className="w-full table-fixed border-collapse text-xs select-none"
              >
                <thead>
                  <tr className="bg-[var(--bg-surface)] border-b border-[var(--border)]">
                    <th className="w-[68px] py-2.5 px-2 text-right text-xs font-medium text-[var(--text-muted)] border-r border-[var(--border)]">
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
                          <div className="text-xs font-medium text-[var(--text-muted)]">
                            {dayShort}
                          </div>
                          <div className="mt-0.5 flex items-center justify-center gap-1">
                            <span className="text-sm font-semibold font-mono-num text-[var(--text)]">
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
                                ? 'border-t border-t-[var(--border-strong)]'
                                : 'border-t border-t-[var(--border)]'
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
                              const otherRatio = otherCount / Math.max(1, allParticipants.length)
                              const otherPct = Math.round((0.22 + otherRatio * 0.20) * 100)
                              bg = `color-mix(in srgb, var(--green) ${otherPct}%, transparent)`
                              textColor = 'var(--green-ink)'
                            }
                          } else if (count > 0) {
                            const pct = Math.round((0.18 + ratio * 0.74) * 100)
                            bg = `color-mix(in srgb, var(--green) ${pct}%, transparent)`
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
                              tabIndex={rowIdx === 0 && colIdx === 0 ? 0 : -1}
                              onKeyDown={e => {
                                const direction = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key]
                                if (direction) {
                                  e.preventDefault()
                                  const [rowStep, colStep] = direction
                                  e.currentTarget.closest('table')?.querySelector(
                                    `[data-slot-col="${colIdx + colStep}"][data-slot-row="${rowIdx + rowStep}"]`
                                  )?.focus()
                                } else if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  handleMobileSlotTap(iso)
                                }
                              }}
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
                                    : 'border-t border-t-[var(--border)]'
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
                                <span className="pointer-events-none inline-block px-1.5 py-0.5 rounded-full bg-[var(--blue)] text-[var(--on-blue)] text-[9.5px] font-medium leading-tight">
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
                    <Button
                      variant="filled"
                      size="sm"
                      leadingIcon={<CalendarPlus size={11} />}
                      disabled={bookingBusy}
                      onClick={() => handleScheduleSlot(pinnedSlotStat.iso)}
                    >
                      Schedule {formatDurationShort(durationMins)}
                    </Button>
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
                  <div className="text-xs font-medium text-[var(--green-ink)] mb-1">
                    Free ({pinnedSlotStat.availableUsers.length})
                  </div>
                  <div className="text-[11.5px] text-[var(--text)]">
                    {pinnedSlotStat.availableUsers.length > 0
                      ? pinnedSlotStat.availableUsers.map(u => u.userName).join(', ')
                      : 'No one marked free'}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl content-tile">
                  <div className="text-xs font-medium text-[var(--text-muted)] mb-1">
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
        <div className="page-stack min-w-0">
          {/* Ranked best meeting windows */}
          <Card className={isCompact ? 'p-3.5 sm:p-4' : 'p-4 sm:p-5'} delay={3}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-[var(--yellow)] shrink-0" />
                <h3 className="text-sm font-bold text-[var(--text)]">Best Meeting Windows</h3>
              </div>

              {/* Meeting Length Selector right inside Best Meeting Windows */}
              <div
                className="segmented-track !p-0.5 !rounded-lg"
                aria-label="Meeting duration"
              >
                {[30, 60, 90, 120].map(mins => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setDurationMins(mins)}
                    className={`px-2.5 min-h-[28px] rounded-md text-[11px] font-semibold cursor-pointer border-none transition-colors ${
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
                  }).replace(/(?:\s+at)?,?\s*\d{1,2}:\d{2}.*$/, '')
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
                      className={`content-tile ${
                        isCompact ? 'p-2.5 space-y-2' : 'p-3.5 space-y-2.5'
                      } rounded-xl hover:border-[var(--blue)] transition-colors`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={`inline-flex items-center justify-center shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono-num ${
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
                          className="whitespace-nowrap shrink-0"
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
                          <Button
                            variant="filled"
                            size="sm"
                            leadingIcon={<CalendarPlus size={12} />}
                            disabled={bookingBusy}
                            onClick={e => {
                              e.stopPropagation()
                              handleScheduleSlot(win.startIso)
                            }}
                            className="shrink-0"
                          >
                            Schedule {formatDurationShort(durationMins)}
                          </Button>
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
          <details className="section-pad rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-card)]">
            <summary className="cursor-pointer text-sm font-medium py-2 max-sm:min-h-11">
              Responders ({allParticipants.length})
            </summary>
            <div className="flex items-center justify-between gap-2 mb-1">
              {hasActivePoll && !isActivePollArchived && activePollClubPeople?.permission?.isBoard && (
                <button
                  type="button"
                  onClick={() => setShowExistingInviteShortcuts(prev => !prev)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer"
                >
                  {showExistingInviteShortcuts ? <X size={12} /> : <Shield size={12} />}
                  <span>{showExistingInviteShortcuts ? 'Cancel' : 'Invite Shortcuts'}</span>
                </button>
              )}
            </div>

            <p className="text-xs text-[var(--text-muted)] mb-3">
              Verified account responses only. Click anyone to highlight their free times.
            </p>

            {showExistingInviteShortcuts && activePollClubPeople?.permission?.isBoard && (
              <div className="mb-3 space-y-2 fade-in">
                <LeadershipShortcutBar
                  clubPeople={activePollClubPeople}
                  selectedShortcuts={existingInviteShortcuts}
                  onToggleShortcut={toggleExistingPollShortcut}
                  label="Add Roster / Sub-Groups"
                  compact
                />
                <div className="flex justify-end">
                  <Button
                    variant="filled"
                    size="sm"
                    disabled={existingInviteShortcuts.length === 0} pending={inviteBusy} pendingLabel="Adding…"
                    onClick={handleApplyExistingShortcuts}
                  >
                    Apply Invites
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5 max-h-[252px] overflow-y-auto pr-0.5">
              {allParticipants.length === 0 ? (
                <div className="py-4 px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-center text-xs text-[var(--text-muted)]">
                  No verified responses yet. Share the poll link or mark your free slots on the grid.
                </div>
              ) : (
                allParticipants.map(p => {
                  const isSpotlit = spotlightUserId === p.userId
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
                          </div>
                          {(p.roleTitle || p.clubName) && (
                            <div className="text-[10.5px] text-[var(--text-muted)] truncate">
                              {[p.roleTitle, p.clubName].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
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
                })
              )}

              {(activePoll.invitedParticipants || []).filter(inv => !inv.hasResponded).length > 0 && (
                <div className="pt-2 mt-1 border-t border-[var(--border-subtle)] space-y-1">
                  <div className="text-xs font-medium text-[var(--text-muted)] px-1">
                    Awaiting response (
                    {(activePoll.invitedParticipants || []).filter(inv => !inv.hasResponded).length}
                    )
                  </div>
                  {(activePoll.invitedParticipants || [])
                    .filter(inv => !inv.hasResponded)
                    .map(inv => (
                      <div
                        key={inv.memberKey || inv.name}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-[var(--bg-surface)]/70 border border-dashed border-[var(--border)] text-xs"
                      >
                        <span className="font-medium text-[var(--text-muted)] truncate">
                          {cleanText(inv.name)}
                        </span>
                        <span className="text-[10.5px] text-[var(--text-light)] shrink-0">
                          {cleanText(inv.sourceShortcut || inv.roleTitle || 'Invited')}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </details>

        </div>
      </div>
    </div>
  )
}
