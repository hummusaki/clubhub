import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Plus,
  Check,
  Shield,
  Users,
  Layers,
  Calendar,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Search,
  SlidersHorizontal,
  StickyNote,
  Lock,
  UserPlus,
  FolderPlus,
  Compass,
  X,
} from 'lucide-react'
import {
  Card,
  BubbleTag,
  Avatar,
  ClubAvatar,
  IconBadge,
  cleanText,
} from './ui'
import {
  getClubTasksBoard,
  getClubPeopleAndGroups,
  joinWorkspaceClub,
  createClubTaskSection,
  deleteClubTaskSection,
  createClubTask,
  updateClubTask,
  deleteClubTask,
  onWorkspacePermissionChange,
} from '../api/workspaceClient'
import TaskModal, {
  TASK_STATUS_META,
  TASK_PRIORITY_META,
  SECTION_COLOR_META,
  SECTION_INK_META,
  getLocalYmd,
  addDaysYmd,
  formatSmartDueDate,
} from './TaskModal'

const normalizeClubId = id =>
  String(id || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()

const PRIORITY_RANK = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

function makeDefaultPersonalSection(clubId, userId = 'self') {
  const cid = normalizeClubId(clubId)
  return {
    id: `sec_personal_${cid}_${userId || 'self'}`,
    clubId: cid,
    title: 'My To-Do List',
    color: 'green',
    visibility: 'personal',
    position: -1,
    createdByUserId: userId || null,
    isPersonal: true,
    isDefaultPersonal: true,
  }
}

function getOfflinePersonalStorageKey(accountKey, clubId) {
  return `clubhub_personal_todos_v1:${accountKey || 'guest'}:${normalizeClubId(clubId)}`
}

function readOfflinePersonalBoard(accountKey, clubId, userId) {
  const defaultSec = makeDefaultPersonalSection(clubId, userId)
  try {
    const raw = localStorage.getItem(getOfflinePersonalStorageKey(accountKey, clubId))
    if (!raw) return { personalSections: [defaultSec], personalTasks: [] }
    const parsed = JSON.parse(raw)
    const customSecs = Array.isArray(parsed?.customSections)
      ? parsed.customSections.filter(s => s && s.id && !s.isDefaultPersonal)
      : []
    const tasks = Array.isArray(parsed?.tasks) ? parsed.tasks : []
    return {
      personalSections: [defaultSec, ...customSecs],
      personalTasks: tasks,
    }
  } catch {
    return { personalSections: [defaultSec], personalTasks: [] }
  }
}

function writeOfflinePersonalBoard(accountKey, clubId, personalSections, personalTasks) {
  try {
    const customSections = (personalSections || []).filter(s => !s.isDefaultPersonal)
    localStorage.setItem(
      getOfflinePersonalStorageKey(accountKey, clubId),
      JSON.stringify({ customSections, tasks: personalTasks || [] })
    )
  } catch {
    // Ignore storage quota errors
  }
}

function createSeedDemoBoard(clubId, clubName) {
  const cid = normalizeClubId(clubId)
  const defaultPersonal = makeDefaultPersonalSection(cid, 'demo')
  const generalSecId = `sec_${cid}_general`
  const sprintSecId = `sec_${cid}_sprint`
  return {
    clubId: cid,
    permission: {
      clubId: cid,
      isMember: true,
      isBoard: false,
      tier: 'member',
      roleTitle: 'Member',
      groupIds: [],
    },
    sections: [
      {
        id: generalSecId,
        clubId: cid,
        title: 'General Club Checklist',
        color: 'teal',
        visibility: 'members',
      },
      {
        id: sprintSecId,
        clubId: cid,
        title: 'Team & Group Assignments',
        color: 'blue',
        visibility: 'members',
      },
    ],
    tasks: [
      {
        id: `demo_tsk_${cid}_1`,
        clubId: cid,
        sectionId: generalSecId,
        title: `RSVP for next ${cleanText(clubName || 'club')} general meeting`,
        notes: 'Check room location & agenda in Announcements.',
        visibility: 'members',
        audience: 'general',
        status: 'not_started',
        priority: 'medium',
        dueDate: addDaysYmd(2),
        assignees: [],
        groupIds: [],
        completedBy: [],
      },
    ],
    personalSections: [defaultPersonal],
    personalTasks: [
      {
        id: `demo_ptsk_${cid}_1`,
        clubId: cid,
        sectionId: defaultPersonal.id,
        title: `Jot down questions to ask at ${cleanText(clubName || 'club')}`,
        notes: 'Only visible to you on this server.',
        visibility: 'personal',
        audience: 'personal',
        isPersonal: true,
        status: 'not_started',
        priority: 'medium',
        dueDate: getLocalYmd(),
        assignees: [],
        groupIds: [],
        completedBy: [],
      },
    ],
    groups: [],
    shortcuts: [],
  }
}

function DueDateBadge({ dueDate, isDone = false }) {
  const info = formatSmartDueDate(dueDate, isDone)
  if (!info) return null

  const toneStyles =
    info.tone === 'overdue'
      ? {
          background: 'var(--red-light)',
          color: 'var(--red-ink)',
          borderColor: 'color-mix(in srgb, var(--red) 30%, transparent)',
        }
      : info.tone === 'soon'
        ? {
            background: 'var(--yellow-light)',
            color: 'var(--yellow-ink)',
            borderColor: 'color-mix(in srgb, var(--yellow) 30%, transparent)',
          }
        : {
            background: 'var(--bg-surface)',
            color: isDone ? 'var(--text-light)' : 'var(--text-muted)',
            borderColor: 'var(--border)',
          }

  return (
    <span
      style={toneStyles}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-semibold font-mono-num shrink-0"
    >
      <Calendar size={10.5} />
      <span>{info.label}</span>
    </span>
  )
}

function ColorPickerDots({ value, onChange }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 min-h-[38px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border)]">
      {Object.entries(SECTION_COLOR_META).map(([colorKey, cssColor]) => {
        const selected = value === colorKey
        return (
          <button
            key={colorKey}
            type="button"
            onClick={() => onChange(colorKey)}
            aria-label={`${colorKey} color`}
            title={colorKey}
            style={{ background: cssColor }}
            className={`w-4 h-4 rounded-full border-none cursor-pointer transition-transform ${
              selected
                ? 'scale-125 ring-2 ring-[var(--text)] ring-offset-2 ring-offset-[var(--bg-surface)]'
                : 'opacity-70 hover:opacity-100'
            }`}
          />
        )
      })}
    </div>
  )
}

export default function ClubTaskBoard({
  user = null,
  accountKey = 'guest',
  isDemo = false,
  clubs = [],
  joinedClubIds = [],
  initialClubId = '',
  onClubJoined,
  onOpenClubsRbac,
  onBrowseClubs,
  onNotify,
}) {
  const effectiveUser = isDemo ? null : user
  const isAuthenticated = Boolean(effectiveUser?.id)
  const canUseBoard = isAuthenticated || isDemo

  // Strictly restrict selectable & visible clubs to clubs the user is actually a member of
  const joinedKeySet = useMemo(
    () => new Set((joinedClubIds || []).map(normalizeClubId).filter(Boolean)),
    [joinedClubIds]
  )

  const memberClubs = useMemo(
    () =>
      (clubs || []).filter(
        c => Boolean(c?.joined) || joinedKeySet.has(normalizeClubId(c?.id))
      ),
    [clubs, joinedKeySet]
  )

  const resolveMemberClubMatch = useCallback(
    candidateId => {
      if (!candidateId) return null
      const norm = normalizeClubId(candidateId)
      return memberClubs.find(c => normalizeClubId(c.id) === norm) || null
    },
    [memberClubs]
  )

  const defaultClubId = useMemo(() => {
    const matchedInitial = resolveMemberClubMatch(initialClubId)
    if (matchedInitial) return matchedInitial.id
    return memberClubs[0]?.id || ''
  }, [initialClubId, memberClubs, resolveMemberClubMatch])

  const [selectedClubId, setSelectedClubId] = useState(defaultClubId)
  const lastAppliedInitialRef = useRef(initialClubId)

  useEffect(() => {
    if (memberClubs.length === 0) {
      if (selectedClubId !== '') setSelectedClubId('')
      return
    }
    if (initialClubId && initialClubId !== lastAppliedInitialRef.current) {
      lastAppliedInitialRef.current = initialClubId
      const matched = resolveMemberClubMatch(initialClubId)
      if (matched) {
        setSelectedClubId(matched.id)
        return
      }
    }
    const stillMember = resolveMemberClubMatch(selectedClubId)
    if (!stillMember) {
      setSelectedClubId(defaultClubId)
    }
  }, [initialClubId, defaultClubId, selectedClubId, memberClubs, resolveMemberClubMatch])

  const [boardData, setBoardData] = useState(null)
  const [clubPeople, setClubPeople] = useState(null)
  const [loading, setLoading] = useState(false)
  const [notMember, setNotMember] = useState(false)
  const [offlineLocalMode, setOfflineLocalMode] = useState(false)
  const [viewTier, setViewTier] = useState('member') // 'member' | 'board'
  const [focusTab, setFocusTab] = useState('all') // 'all' | 'personal' | 'club'
  const [collapsedSections, setCollapsedSections] = useState({})
  const [showCompletedPersonal, setShowCompletedPersonal] = useState({})
  const demoBoardsRef = useRef(new Map())

  // Smart filters
  const [searchQuery, setSearchQuery] = useState('')
  const [onlyAssignedToMe, setOnlyAssignedToMe] = useState(false)
  const [hideDone, setHideDone] = useState(false)
  const [kpiQuickFilter, setKpiQuickFilter] = useState('') // '' | 'stuck' | 'overdue'
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')

  // Contextual section creators (separate clear drawers for Personal List vs. Club Section)
  const [sectionCreatorMode, setSectionCreatorMode] = useState(null) // null | 'personal' | 'club'
  const [newSectionTitle, setNewSectionTitle] = useState('')
  const [newSectionColor, setNewSectionColor] = useState('green')
  const [newSectionVis, setNewSectionVis] = useState('members')

  // Quick-add state per personal section: { [sectionId]: { title, notes, showNote, priority, dueDate } }
  const [quickDrafts, setQuickDrafts] = useState({})
  const [quickAddBusySecId, setQuickAddBusySecId] = useState('')

  // Inline click-to-rename state for personal to-dos
  const [inlineEditingId, setInlineEditingId] = useState(null)
  const [inlineEditTitle, setInlineEditTitle] = useState('')

  // Task Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [modalPersonalOnly, setModalPersonalOnly] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [modalDefaultSectionId, setModalDefaultSectionId] = useState('')
  const [actionBusy, setActionBusy] = useState(false)

  const selectedClub = useMemo(
    () => resolveMemberClubMatch(selectedClubId),
    [resolveMemberClubMatch, selectedClubId]
  )

  const loadBoard = useCallback(async () => {
    if (!selectedClubId || !selectedClub || !canUseBoard) {
      setBoardData(null)
      setClubPeople(null)
      setNotMember(false)
      setOfflineLocalMode(false)
      return
    }

    const cid = normalizeClubId(selectedClubId)

    if (isDemo) {
      if (!demoBoardsRef.current.has(cid)) {
        demoBoardsRef.current.set(cid, createSeedDemoBoard(cid, selectedClub?.name))
      }
      setNotMember(false)
      setOfflineLocalMode(false)
      setClubPeople(null)
      setBoardData(demoBoardsRef.current.get(cid))
      setViewTier('member')
      return
    }

    setLoading(true)
    let [tasksRes, peopleRes] = await Promise.all([
      getClubTasksBoard(selectedClubId),
      getClubPeopleAndGroups(selectedClubId),
    ])

    // Reconcile local joinedClubIds with backend memberships if dev server restarted in-memory DB
    if (
      !tasksRes?.ok &&
      tasksRes?.status === 403 &&
      tasksRes?.code === 'NOT_CLUB_MEMBER' &&
      Boolean(selectedClub)
    ) {
      const syncedJoin = await joinWorkspaceClub(selectedClubId)
      if (syncedJoin?.ok) {
        ;[tasksRes, peopleRes] = await Promise.all([
          getClubTasksBoard(selectedClubId),
          getClubPeopleAndGroups(selectedClubId),
        ])
      }
    }

    setLoading(false)

    if (peopleRes?.ok) setClubPeople(peopleRes)

    if (!tasksRes?.ok) {
      if (tasksRes?.offline) {
        const localPersonal = readOfflinePersonalBoard(accountKey, cid, effectiveUser?.id)
        setOfflineLocalMode(true)
        setNotMember(false)
        setBoardData({
          clubId: cid,
          permission: {
            clubId: cid,
            isMember: true,
            isBoard: false,
            tier: 'member',
            roleTitle: 'Member',
            groupIds: [],
          },
          sections: [
            {
              id: `sec_${cid}_general`,
              clubId: cid,
              title: 'General Club Checklist',
              color: 'teal',
              visibility: 'members',
            },
          ],
          tasks: [],
          personalSections: localPersonal.personalSections,
          personalTasks: localPersonal.personalTasks,
          groups: [],
          shortcuts: [],
        })
        setViewTier('member')
        return
      }
      if (tasksRes?.status === 403 && tasksRes?.code === 'NOT_CLUB_MEMBER') {
        setNotMember(true)
        setOfflineLocalMode(false)
        setBoardData(null)
        setViewTier('member')
        return
      }
      setNotMember(false)
      setOfflineLocalMode(false)
      setBoardData(null)
      return
    }

    setOfflineLocalMode(false)
    setNotMember(false)
    const fallbackPersonal = makeDefaultPersonalSection(cid, effectiveUser?.id)
    setBoardData({
      ...tasksRes,
      personalSections:
        Array.isArray(tasksRes.personalSections) && tasksRes.personalSections.length > 0
          ? tasksRes.personalSections
          : [fallbackPersonal],
      personalTasks: Array.isArray(tasksRes.personalTasks) ? tasksRes.personalTasks : [],
    })
    if (tasksRes.permission?.isBoard) {
      setViewTier(prev => (prev === 'board' || prev === 'member' ? prev : 'board'))
    } else {
      setViewTier('member')
    }
  }, [selectedClubId, selectedClub, canUseBoard, isDemo, accountKey, effectiveUser?.id])

  useEffect(() => {
    loadBoard()
  }, [loadBoard])

  const isBoard = Boolean(boardData?.permission?.isBoard)
  useEffect(() => {
    if (isBoard) setViewTier('board')
    else setViewTier('member')
    setSectionCreatorMode(null)
    setInlineEditingId(null)
    setKpiQuickFilter('')
  }, [selectedClubId, isBoard])

  useEffect(() => {
    if (isDemo) return undefined
    return onWorkspacePermissionChange(() => {
      loadBoard()
    })
  }, [isDemo, loadBoard])

  const effectiveTier = isBoard ? viewTier : 'member'
  const groupsMap = useMemo(() => {
    const m = new Map()
    for (const g of boardData?.groups || clubPeople?.groups || []) {
      m.set(g.id, g)
    }
    return m
  }, [boardData?.groups, clubPeople?.groups])

  const myGroupIds = boardData?.permission?.groupIds || []
  const userEmailLower = String(effectiveUser?.email || '').trim().toLowerCase()

  const isAssignedToMeOrMyGroup = useCallback(
    task => {
      const direct = (task.assignees || []).some(
        a =>
          (effectiveUser?.id && a.userId === effectiveUser.id) ||
          (userEmailLower && String(a.email || '').toLowerCase() === userEmailLower)
      )
      const viaGroup = (task.groupIds || []).some(gid => myGroupIds.includes(gid))
      return direct || viaGroup
    },
    [effectiveUser?.id, userEmailLower, myGroupIds]
  )

  const visibleSections = useMemo(() => {
    const allSecs = (boardData?.sections || []).filter(s => s.visibility !== 'personal')
    return effectiveTier === 'board'
      ? allSecs
      : allSecs.filter(s => s.visibility !== 'board')
  }, [boardData?.sections, effectiveTier])

  const personalSections = useMemo(() => {
    const secs = boardData?.personalSections
    if (Array.isArray(secs) && secs.length > 0) return secs
    if (!selectedClubId) return []
    return [makeDefaultPersonalSection(selectedClubId, isDemo ? 'demo' : effectiveUser?.id)]
  }, [boardData?.personalSections, selectedClubId, isDemo, effectiveUser?.id])

  const allPersonalTasks = useMemo(
    () => (Array.isArray(boardData?.personalTasks) ? boardData.personalTasks : []),
    [boardData?.personalTasks]
  )

  const todayYmd = useMemo(() => getLocalYmd(), [])

  const filteredPersonalTasks = useMemo(() => {
    return allPersonalTasks.filter(t => {
      if (hideDone && t.status === 'done') return false
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false
      if (kpiQuickFilter === 'stuck' && t.status !== 'stuck' && t.priority !== 'critical') {
        return false
      }
      if (kpiQuickFilter === 'overdue' && (!t.dueDate || t.dueDate >= todayYmd || t.status === 'done')) {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const hay = `${t.title} ${t.notes || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [allPersonalTasks, hideDone, statusFilter, priorityFilter, kpiQuickFilter, todayYmd, searchQuery])

  // Base visible shared tasks (before user filter chips) for accurate counters & Board KPIs
  const accessibleClubTasks = useMemo(() => {
    const raw = (boardData?.tasks || []).filter(t => t.visibility !== 'personal')
    return raw.filter(t => {
      if (effectiveTier === 'member') {
        if (t.visibility === 'board' || t.audience === 'board') return false
        if (t.audience !== 'general' && !isAssignedToMeOrMyGroup(t)) return false
      }
      return true
    })
  }, [boardData?.tasks, effectiveTier, isAssignedToMeOrMyGroup])

  const selfId = isDemo ? 'demo' : effectiveUser?.id

  const isClubTaskDoneForViewer = useCallback(
    task => {
      if (!isBoard && task.audience === 'general') {
        return (task.completedBy || []).some(c => c.userId === selfId)
      }
      return task.status === 'done'
    },
    [isBoard, selfId]
  )

  const filteredTasks = useMemo(() => {
    return accessibleClubTasks.filter(t => {
      if (onlyAssignedToMe && !isAssignedToMeOrMyGroup(t)) return false
      if (hideDone && isClubTaskDoneForViewer(t)) return false
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false
      if (groupFilter !== 'all' && !(t.groupIds || []).includes(groupFilter)) return false
      if (kpiQuickFilter === 'stuck' && t.status !== 'stuck' && t.priority !== 'critical') {
        return false
      }
      if (kpiQuickFilter === 'overdue' && (!t.dueDate || t.dueDate >= todayYmd || t.status === 'done')) {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const hay = `${t.title} ${t.notes || ''} ${(t.assignees || []).map(a => a.name).join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [
    accessibleClubTasks,
    onlyAssignedToMe,
    isAssignedToMeOrMyGroup,
    hideDone,
    isClubTaskDoneForViewer,
    statusFilter,
    priorityFilter,
    groupFilter,
    kpiQuickFilter,
    todayYmd,
    searchQuery,
  ])

  const openPersonalCount = useMemo(
    () => allPersonalTasks.filter(t => t.status !== 'done').length,
    [allPersonalTasks]
  )
  const openClubCount = useMemo(
    () => accessibleClubTasks.filter(t => !isClubTaskDoneForViewer(t)).length,
    [accessibleClubTasks, isClubTaskDoneForViewer]
  )
  const assignedToMeCount = useMemo(
    () => accessibleClubTasks.filter(t => isAssignedToMeOrMyGroup(t)).length,
    [accessibleClubTasks, isAssignedToMeOrMyGroup]
  )

  const advancedFilterCount =
    (statusFilter !== 'all' ? 1 : 0) +
    (priorityFilter !== 'all' ? 1 : 0) +
    (groupFilter !== 'all' ? 1 : 0)

  const hasAnyActiveFilter =
    Boolean(searchQuery.trim()) ||
    onlyAssignedToMe ||
    hideDone ||
    Boolean(kpiQuickFilter) ||
    advancedFilterCount > 0

  function resetAllFilters() {
    setSearchQuery('')
    setOnlyAssignedToMe(false)
    setHideDone(false)
    setKpiQuickFilter('')
    setStatusFilter('all')
    setPriorityFilter('all')
    setGroupFilter('all')
  }

  const kpis = useMemo(() => {
    const all = accessibleClubTasks
    const total = all.length
    const done = all.filter(t => t.status === 'done').length
    const stuck = all.filter(t => t.status === 'stuck' || t.priority === 'critical').length
    const overdue = all.filter(t => t.dueDate && t.dueDate < todayYmd && t.status !== 'done').length
    return {
      total,
      done,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
      stuck,
      overdue,
    }
  }, [accessibleClubTasks, todayYmd])

  function applyServerBoardUpdate(res) {
    setBoardData(prev => ({
      ...(prev || {}),
      permission: res.permission || prev?.permission,
      sections: res.sections || prev?.sections || [],
      tasks: res.tasks || prev?.tasks || [],
      personalSections: res.personalSections || prev?.personalSections || personalSections,
      personalTasks: res.personalTasks || prev?.personalTasks || [],
    }))
  }

  function mutateLocalOrDemoBoard(mutator) {
    const cid = normalizeClubId(selectedClubId)
    setBoardData(prev => {
      const base = prev || createSeedDemoBoard(cid, selectedClub?.name)
      const next = mutator(base, cid)
      if (isDemo) {
        demoBoardsRef.current.set(cid, next)
      } else if (offlineLocalMode) {
        writeOfflinePersonalBoard(accountKey, cid, next.personalSections, next.personalTasks)
      }
      return next
    })
  }

  function getDraftForSection(secId) {
    return (
      quickDrafts[secId] || {
        title: '',
        notes: '',
        showNote: false,
        priority: 'medium',
        dueDate: '',
      }
    )
  }

  function updateDraftForSection(secId, patch) {
    setQuickDrafts(prev => ({
      ...prev,
      [secId]: {
        ...(prev[secId] || {
          title: '',
          notes: '',
          showNote: false,
          priority: 'medium',
          dueDate: '',
        }),
        ...patch,
      },
    }))
  }

  function cycleDraftPriority(secId) {
    const order = ['medium', 'high', 'critical', 'low']
    const cur = getDraftForSection(secId).priority || 'medium'
    const next = order[(order.indexOf(cur) + 1) % order.length]
    updateDraftForSection(secId, { priority: next })
  }

  async function handleQuickAddPersonalTask(e, pSec) {
    e.preventDefault()
    const draft = getDraftForSection(pSec.id)
    const cleanTitle = String(draft.title || '').trim()
    const cleanNotes = String(draft.notes || '').trim()
    if (!cleanTitle || quickAddBusySecId) return

    if (isDemo || offlineLocalMode) {
      mutateLocalOrDemoBoard((base, cid) => {
        const created = {
          id: `local_ptsk_${cid}_${Date.now()}`,
          clubId: cid,
          sectionId: pSec.id,
          title: cleanTitle,
          notes: cleanNotes,
          visibility: 'personal',
          audience: 'personal',
          isPersonal: true,
          status: 'not_started',
          priority: draft.priority || 'medium',
          dueDate: draft.dueDate || '',
          assignees: [],
          groupIds: [],
          completedBy: [],
        }
        return {
          ...base,
          personalTasks: [...(base.personalTasks || []), created],
        }
      })
      updateDraftForSection(pSec.id, { title: '', notes: '', showNote: false, dueDate: '' })
      if (onNotify) onNotify('Added to your to-do list!')
      return
    }

    setQuickAddBusySecId(pSec.id)
    const res = await createClubTask(selectedClubId, {
      title: cleanTitle,
      notes: cleanNotes,
      sectionId: pSec.id,
      sectionTitle: pSec.title,
      sectionColor: pSec.color || 'green',
      status: 'not_started',
      priority: draft.priority || 'medium',
      dueDate: draft.dueDate || '',
      visibility: 'personal',
      audience: 'personal',
      isPersonal: true,
    })
    setQuickAddBusySecId('')

    if (res?.ok) {
      applyServerBoardUpdate(res)
      updateDraftForSection(pSec.id, { title: '', notes: '', showNote: false, dueDate: '' })
      if (onNotify) onNotify('Added to your to-do list!')
    } else {
      if (res?.status === 403) loadBoard()
      if (onNotify) onNotify(res?.error || 'Could not add personal to-do.', { type: 'error' })
    }
  }

  async function commitInlinePersonalRename(task) {
    const trimmed = String(inlineEditTitle || '').trim()
    setInlineEditingId(null)
    if (!trimmed || trimmed === task.title) return
    await handleInlineTaskPatch(task, { title: trimmed })
  }

  async function handleJoinCurrentClub() {
    if (!selectedClubId || actionBusy) return
    setActionBusy(true)
    const res = await joinWorkspaceClub(selectedClubId)
    setActionBusy(false)
    if (res?.ok) {
      if (onClubJoined) onClubJoined(selectedClubId, res)
      if (onNotify) onNotify(`Joined ${cleanText(selectedClub?.name || 'club')}!`)
      loadBoard()
    } else if (onNotify) {
      onNotify(res?.error || 'Could not join club.', { type: 'error' })
    }
  }

  async function handleModalSave(payload) {
    const isPersonalPayload = Boolean(
      payload?.isPersonal ||
        payload?.visibility === 'personal' ||
        editingTask?.visibility === 'personal'
    )

    if (isDemo || (offlineLocalMode && isPersonalPayload)) {
      mutateLocalOrDemoBoard((base, cid) => {
        if (editingTask?.id) {
          return {
            ...base,
            personalTasks: (base.personalTasks || []).map(t =>
              t.id === editingTask.id
                ? {
                    ...t,
                    title: payload.title,
                    notes: payload.notes || '',
                    sectionId: payload.sectionId || t.sectionId,
                    status: payload.status || t.status,
                    priority: payload.priority || t.priority,
                    dueDate: payload.dueDate || '',
                  }
                : t
            ),
          }
        }
        const created = {
          id: `local_ptsk_${cid}_${Date.now()}`,
          clubId: cid,
          sectionId: payload.sectionId || personalSections[0]?.id || '',
          title: payload.title,
          notes: payload.notes || '',
          visibility: 'personal',
          audience: 'personal',
          isPersonal: true,
          status: payload.status || 'not_started',
          priority: payload.priority || 'medium',
          dueDate: payload.dueDate || '',
          assignees: [],
          groupIds: [],
          completedBy: [],
        }
        return {
          ...base,
          personalTasks: [...(base.personalTasks || []), created],
        }
      })
      setModalOpen(false)
      setEditingTask(null)
      setModalPersonalOnly(false)
      if (onNotify) onNotify(editingTask?.id ? 'To-do updated.' : 'Added to your to-do list!')
      return
    }

    setActionBusy(true)
    const res = editingTask?.id
      ? await updateClubTask(selectedClubId, editingTask.id, payload)
      : await createClubTask(selectedClubId, payload)
    setActionBusy(false)
    if (res?.ok) {
      applyServerBoardUpdate(res)
      setModalOpen(false)
      setEditingTask(null)
      setModalPersonalOnly(false)
      if (onNotify) {
        onNotify(
          editingTask?.id
            ? isPersonalPayload
              ? 'To-do updated.'
              : 'Task updated.'
            : isPersonalPayload
              ? 'Added to your to-do list!'
              : 'Task created!'
        )
      }
    } else {
      if (res?.status === 403) loadBoard()
      if (onNotify) onNotify(res?.error || 'Permission denied.', { type: 'error' })
    }
  }

  async function handleInlineTaskPatch(task, patch) {
    const isPersonalTask = task.visibility === 'personal' || task.isPersonal

    if (isDemo || (offlineLocalMode && isPersonalTask)) {
      mutateLocalOrDemoBoard(base => {
        if (isPersonalTask) {
          return {
            ...base,
            personalTasks: (base.personalTasks || []).map(t => {
              if (t.id !== task.id) return t
              const nextStatus = patch.toggleCompletedForSelf
                ? t.status === 'done'
                  ? 'not_started'
                  : 'done'
                : patch.status || t.status
              return {
                ...t,
                ...(patch.title ? { title: patch.title } : {}),
                ...(patch.priority ? { priority: patch.priority } : {}),
                status: nextStatus,
              }
            }),
          }
        }
        return {
          ...base,
          tasks: (base.tasks || []).map(t => {
            if (t.id !== task.id) return t
            if (patch.toggleCompletedForSelf) {
              const hasSelf = (t.completedBy || []).some(c => c.userId === 'demo')
              return {
                ...t,
                completedBy: hasSelf ? [] : [{ userId: 'demo' }],
              }
            }
            return { ...t, ...patch }
          }),
        }
      })
      return
    }

    const res = await updateClubTask(selectedClubId, task.id, patch)
    if (res?.ok) {
      applyServerBoardUpdate(res)
    } else {
      if (res?.status === 403) loadBoard()
      if (onNotify) onNotify(res?.error || 'Could not update task.', { type: 'error' })
    }
  }

  async function handleDeleteTaskClick(task) {
    const taskId = typeof task === 'string' ? task : task?.id
    const isPersonalTask =
      typeof task === 'object' && (task?.visibility === 'personal' || task?.isPersonal)

    if (isDemo || (offlineLocalMode && isPersonalTask)) {
      mutateLocalOrDemoBoard(base => ({
        ...base,
        personalTasks: (base.personalTasks || []).filter(t => t.id !== taskId),
        tasks: (base.tasks || []).filter(t => t.id !== taskId),
      }))
      if (onNotify) onNotify(isPersonalTask ? 'To-do removed.' : 'Task deleted.', { type: 'info' })
      return
    }

    const res = await deleteClubTask(selectedClubId, taskId)
    if (res?.ok) {
      applyServerBoardUpdate(res)
      if (onNotify) onNotify(isPersonalTask ? 'To-do removed.' : 'Task deleted.', { type: 'info' })
    } else if (onNotify) {
      onNotify(res?.error || 'Could not delete task.', { type: 'error' })
    }
  }

  async function handleClearCompletedPersonal(sectionId) {
    const completedInSection = allPersonalTasks.filter(
      t => t.sectionId === sectionId && t.status === 'done'
    )
    if (completedInSection.length === 0 || actionBusy) return

    if (isDemo || offlineLocalMode) {
      const removeIds = new Set(completedInSection.map(t => t.id))
      mutateLocalOrDemoBoard(base => ({
        ...base,
        personalTasks: (base.personalTasks || []).filter(t => !removeIds.has(t.id)),
      }))
      if (onNotify) onNotify('Cleared completed to-dos.', { type: 'info' })
      return
    }

    setActionBusy(true)
    let latestRes = null
    for (const item of completedInSection) {
      const r = await deleteClubTask(selectedClubId, item.id)
      if (r?.ok) latestRes = r
    }
    setActionBusy(false)
    if (latestRes) {
      applyServerBoardUpdate(latestRes)
      if (onNotify) onNotify('Cleared completed to-dos.', { type: 'info' })
    } else {
      loadBoard()
    }
  }

  function openSectionCreator(mode) {
    if (sectionCreatorMode === mode) {
      setSectionCreatorMode(null)
      return
    }
    setSectionCreatorMode(mode)
    setNewSectionTitle('')
    if (mode === 'personal') {
      setNewSectionColor('green')
    } else {
      setNewSectionColor('blue')
      setNewSectionVis('members')
    }
  }

  async function handleCreateSection(e) {
    e.preventDefault()
    if (!newSectionTitle.trim() || actionBusy) return
    const targetVis = sectionCreatorMode === 'club' && isBoard ? newSectionVis : 'personal'

    if ((isDemo || offlineLocalMode) && targetVis === 'personal') {
      mutateLocalOrDemoBoard((base, cid) => {
        const createdSec = {
          id: `sec_personal_custom_${cid}_${Date.now()}`,
          clubId: cid,
          title: newSectionTitle.trim(),
          color: newSectionColor || 'green',
          visibility: 'personal',
          isPersonal: true,
          isDefaultPersonal: false,
        }
        return {
          ...base,
          personalSections: [...(base.personalSections || []), createdSec],
        }
      })
      setNewSectionTitle('')
      setSectionCreatorMode(null)
      if (onNotify) onNotify('Created personal list!')
      return
    }

    setActionBusy(true)
    const res = await createClubTaskSection(selectedClubId, {
      title: newSectionTitle.trim(),
      color: newSectionColor,
      visibility: targetVis,
    })
    setActionBusy(false)
    if (res?.ok) {
      applyServerBoardUpdate(res)
      setNewSectionTitle('')
      setSectionCreatorMode(null)
      if (onNotify) {
        onNotify(targetVis === 'personal' ? 'Created personal list!' : 'Created club section!')
      }
    } else if (onNotify) {
      onNotify(res?.error || 'Could not create section.', { type: 'error' })
    }
  }

  async function handleRemoveSection(section) {
    const sectionId = typeof section === 'string' ? section : section?.id
    const isPersonalSec =
      typeof section === 'object' && (section?.visibility === 'personal' || section?.isPersonal)

    if ((isDemo || offlineLocalMode) && isPersonalSec) {
      mutateLocalOrDemoBoard(base => ({
        ...base,
        personalSections: (base.personalSections || []).filter(s => s.id !== sectionId),
        personalTasks: (base.personalTasks || []).filter(t => t.sectionId !== sectionId),
      }))
      if (onNotify) onNotify('Deleted personal list.', { type: 'info' })
      return
    }

    const res = await deleteClubTaskSection(selectedClubId, sectionId)
    if (res?.ok) {
      applyServerBoardUpdate(res)
      if (onNotify) onNotify('Deleted section.', { type: 'info' })
    } else if (onNotify) {
      onNotify(res?.error || 'Could not delete section.', { type: 'error' })
    }
  }

  if (!canUseBoard) {
    return (
      <Card className="p-6 text-center space-y-2">
        <Lock size={22} className="mx-auto text-[var(--blue)]" />
        <h3 className="text-base font-bold text-[var(--text)]">Sign In to Access Club Task Boards</h3>
        <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
          Sign in with your account to view tasks for the clubs you&apos;re in, keep your own private to-do list per server, or manage your club&apos;s Board Task View.
        </p>
      </Card>
    )
  }

  // Strictly enforce: you can only see task boards for clubs you are in
  if (memberClubs.length === 0) {
    return (
      <Card className="p-7 text-center space-y-3" delay={1}>
        <div className="w-12 h-12 rounded-2xl bg-[var(--blue-light)] text-[var(--blue-ink)] flex items-center justify-center mx-auto">
          <Users size={22} />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-[var(--text)]">Join a Club to Unlock Its Task Board</h3>
          <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
            Task boards only show servers you&apos;re a member of. Once you join a club, you&apos;ll get its shared club checklist plus your own private to-do list for that server.
          </p>
        </div>
        {(onBrowseClubs || onOpenClubsRbac) && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => (onBrowseClubs ? onBrowseClubs() : onOpenClubsRbac(''))}
              className="inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-xl bg-[var(--blue)] text-white text-xs font-semibold border-none cursor-pointer hover:opacity-90 transition-opacity"
            >
              <Compass size={14} />
              <span>Browse &amp; Join Clubs</span>
            </button>
          </div>
        )}
      </Card>
    )
  }

  const showPersonalZone = focusTab === 'all' || focusTab === 'personal'
  const showClubZone = focusTab === 'all' || focusTab === 'club'

  return (
    <div className="space-y-5">
      {/* ── Top Workspace Card: Joined Server Switcher + Active Server Header + Smart Focus/Filter Bar ── */}
      <Card className="p-4 sm:p-5 space-y-4" delay={1}>
        {/* Server Switcher Rail (only shown when member of 2+ clubs — zero redundant dual dropdowns) */}
        {memberClubs.length > 1 && (
          <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-[var(--border-subtle)]">
            <div className="mobile-pill-rail flex-1 min-w-0">
              {memberClubs.map(c => {
                const isSelected = normalizeClubId(c.id) === normalizeClubId(selectedClubId)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedClubId(c.id)}
                    className={`inline-flex items-center gap-2 pl-1.5 pr-3 min-h-[36px] rounded-xl text-xs font-semibold border shrink-0 cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[var(--blue-light)] border-[var(--blue)] text-[var(--blue-ink)] shadow-2xs'
                        : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <ClubAvatar club={c} size={24} className="rounded-lg" />
                    <span className="truncate max-w-[170px]">{cleanText(c.name)}</span>
                  </button>
                )
              })}
            </div>

            {memberClubs.length > 6 && (
              <select
                value={selectedClub?.id || selectedClubId}
                onChange={e => setSelectedClubId(e.target.value)}
                aria-label="Jump to joined club server"
                className="hidden sm:block min-h-[36px] px-2.5 rounded-xl bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text)] border border-[var(--border)] shrink-0"
              >
                {memberClubs.map(c => (
                  <option key={c.id} value={c.id}>
                    {cleanText(c.name)}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Active Server Identity & Primary Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <ClubAvatar club={selectedClub} size={44} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-[var(--text)] truncate">
                  {cleanText(selectedClub?.name || 'Club Server')}
                </h2>
                {boardData?.permission && (
                  <BubbleTag
                    label={
                      isBoard
                        ? `Board · ${cleanText(boardData.permission.roleTitle || 'Officer')}`
                        : isDemo
                          ? 'Demo Member'
                          : 'Member'
                    }
                    color={isBoard ? 'purple' : 'blue'}
                    size="sm"
                  />
                )}
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {openPersonalCount === 0
                  ? 'All caught up on personal to-dos'
                  : `${openPersonalCount} personal ${openPersonalCount === 1 ? 'to-do' : 'to-dos'} left`}
                {' · '}
                {openClubCount === 0
                  ? '0 open club tasks'
                  : `${openClubCount} open club ${openClubCount === 1 ? 'task' : 'tasks'}`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isBoard && (
              <div className="segmented-track w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setViewTier('member')}
                  className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 min-h-[34px] rounded-lg text-xs font-semibold border-none cursor-pointer transition-all ${
                    effectiveTier === 'member'
                      ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
                      : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  <Users size={13} />
                  <span>Member View</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewTier('board')}
                  className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 min-h-[34px] rounded-lg text-xs font-semibold border-none cursor-pointer transition-all ${
                    effectiveTier === 'board'
                      ? 'bg-[var(--purple)] text-white shadow-2xs'
                      : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  <Shield size={13} />
                  <span>Board View</span>
                </button>
              </div>
            )}

            {onOpenClubsRbac && selectedClub && (
              <button
                type="button"
                onClick={() => onOpenClubsRbac(selectedClub.id)}
                className="inline-flex items-center justify-center gap-1.5 px-3 min-h-[38px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] cursor-pointer transition-colors"
              >
                <Users size={13} />
                <span>{isBoard ? 'Roster & Groups' : 'Roles & Groups'}</span>
              </button>
            )}

            {isBoard && (
              <button
                type="button"
                onClick={() => {
                  setEditingTask(null)
                  setModalPersonalOnly(false)
                  setModalDefaultSectionId(visibleSections[0]?.id || '')
                  setModalOpen(true)
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[38px] rounded-xl bg-[var(--blue)] text-white text-xs font-semibold border-none cursor-pointer hover:opacity-90 transition-opacity"
              >
                <Plus size={14} />
                <span>New Club Task</span>
              </button>
            )}
          </div>
        </div>

        {/* Focus Tabs + Search + Quick Filter Chips */}
        {!notMember && boardData && (
          <div className="pt-3.5 border-t border-[var(--border-subtle)] space-y-3">
            {/* Interactive Board KPIs (Board View only — click Blocked or Overdue to triage!) */}
            {effectiveTier === 'board' && showClubZone && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="content-tile px-3 py-2.5 rounded-xl">
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Club Tasks
                  </div>
                  <div className="text-base font-extrabold font-mono-num text-[var(--text)] mt-0.5">
                    {kpis.total}
                  </div>
                </div>
                <div className="px-3 py-2.5 rounded-xl bg-[var(--green-light)] border border-[var(--green)]/30">
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--green-ink)]">
                    Completed
                  </div>
                  <div className="text-base font-extrabold font-mono-num text-[var(--green-ink)] mt-0.5">
                    {kpis.done} ({kpis.pct}%)
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setKpiQuickFilter(prev => (prev === 'stuck' ? '' : 'stuck'))}
                  className={`px-3 py-2.5 rounded-xl text-left cursor-pointer transition-all border ${
                    kpiQuickFilter === 'stuck'
                      ? 'bg-[var(--red-light)] border-[var(--red)] ring-2 ring-[var(--red)]/25'
                      : 'bg-[var(--red-light)]/80 border-[var(--red)]/30 hover:border-[var(--red)]'
                  }`}
                >
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--red-ink)]">
                    Blocked / Urgent
                  </div>
                  <div className="text-base font-extrabold font-mono-num text-[var(--red-ink)] mt-0.5">
                    {kpis.stuck}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setKpiQuickFilter(prev => (prev === 'overdue' ? '' : 'overdue'))}
                  className={`px-3 py-2.5 rounded-xl text-left cursor-pointer transition-all border ${
                    kpiQuickFilter === 'overdue'
                      ? 'bg-[var(--yellow-light)] border-[var(--yellow)] ring-2 ring-[var(--yellow)]/25'
                      : 'bg-[var(--yellow-light)]/80 border-[var(--yellow)]/30 hover:border-[var(--yellow)]'
                  }`}
                >
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--yellow-ink)]">
                    Overdue
                  </div>
                  <div className="text-base font-extrabold font-mono-num text-[var(--yellow-ink)] mt-0.5">
                    {kpis.overdue}
                  </div>
                </button>
              </div>
            )}

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
              {/* Focus Mode Tabs */}
              <div className="segmented-track w-full md:w-auto">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'personal', label: 'My To-Dos', count: openPersonalCount },
                  { id: 'club', label: 'Club Board', count: openClubCount },
                ].map(tab => {
                  const active = focusTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setFocusTab(tab.id)}
                      className={`flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-3 min-h-[34px] rounded-lg text-xs font-semibold border-none cursor-pointer transition-all ${
                        active
                          ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
                          : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      <span>{tab.label}</span>
                      {tab.count !== undefined && (
                        <span
                          className={`px-1.5 py-0.2 rounded-full text-[10.5px] font-mono-num ${
                            active
                              ? 'bg-[var(--bg-surface)] text-[var(--text)]'
                              : 'bg-[var(--bg-subtle)]/70 text-[var(--text-muted)]'
                          }`}
                        >
                          {tab.count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Search + Quick Filter Pills */}
              <div className="flex flex-wrap items-center gap-2 flex-1 md:justify-end">
                <div className="relative flex-1 min-w-[170px] md:max-w-[250px]">
                  <Search
                    size={13}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-light)] pointer-events-none"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search tasks…"
                    className="w-full min-h-[36px] pl-8 pr-7 rounded-xl bg-[var(--bg-surface)] text-base sm:text-xs text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-light)] hover:text-[var(--text)] bg-transparent border-none cursor-pointer p-0.5"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {showClubZone && assignedToMeCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setOnlyAssignedToMe(v => !v)}
                    className={`inline-flex items-center gap-1.5 px-2.5 min-h-[36px] rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                      onlyAssignedToMe
                        ? 'bg-[var(--blue-light)] border-[var(--blue)] text-[var(--blue-ink)]'
                        : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    <span>Assigned to Me</span>
                    <span className="font-mono-num text-[10.5px] opacity-80">({assignedToMeCount})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setHideDone(v => !v)}
                  className={`inline-flex items-center gap-1.5 px-2.5 min-h-[36px] rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                    hideDone
                      ? 'bg-[var(--teal-light)] border-[var(--teal)] text-[var(--teal-ink)]'
                      : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  <span>Hide Done</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters(v => !v)}
                  className={`inline-flex items-center gap-1.5 px-2.5 min-h-[36px] rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                    showAdvancedFilters || advancedFilterCount > 0
                      ? 'bg-[var(--blue-light)] border-[var(--blue)] text-[var(--blue-ink)]'
                      : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  <SlidersHorizontal size={12} />
                  <span>Filters</span>
                  {advancedFilterCount > 0 && (
                    <span className="px-1.5 rounded-full bg-[var(--blue)] text-white text-[10px] font-mono-num">
                      {advancedFilterCount}
                    </span>
                  )}
                </button>

                {hasAnyActiveFilter && (
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="px-2 min-h-[34px] rounded-lg bg-transparent text-xs font-semibold text-[var(--blue-ink)] hover:underline border-none cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {showAdvancedFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 fade-in">
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  aria-label="Filter by status"
                  className="min-h-[38px] px-3 rounded-xl bg-[var(--bg-surface)] text-base sm:text-xs font-medium text-[var(--text)] border border-[var(--border)]"
                >
                  <option value="all">All Statuses</option>
                  {Object.entries(TASK_STATUS_META).map(([k, m]) => (
                    <option key={k} value={k}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <select
                  value={priorityFilter}
                  onChange={e => setPriorityFilter(e.target.value)}
                  aria-label="Filter by priority"
                  className="min-h-[38px] px-3 rounded-xl bg-[var(--bg-surface)] text-base sm:text-xs font-medium text-[var(--text)] border border-[var(--border)]"
                >
                  <option value="all">All Priorities</option>
                  {Object.entries(TASK_PRIORITY_META).map(([k, m]) => (
                    <option key={k} value={k}>
                      {m.label}
                    </option>
                  ))}
                </select>
                {(boardData.groups || []).length > 0 ? (
                  <select
                    value={groupFilter}
                    onChange={e => setGroupFilter(e.target.value)}
                    aria-label="Filter by sub-group"
                    className="min-h-[38px] px-3 rounded-xl bg-[var(--bg-surface)] text-base sm:text-xs font-medium text-[var(--text)] border border-[var(--border)]"
                  >
                    <option value="all">All Sub-Groups</option>
                    {(boardData.groups || []).map(g => (
                      <option key={g.id} value={g.id}>
                        {cleanText(g.name)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="hidden sm:flex items-center px-3 text-[11px] text-[var(--text-light)]">
                    No sub-groups created on this server yet
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Loading Skeleton */}
      {loading && (
        <Card className="p-6 text-center text-xs text-[var(--text-muted)]">
          Loading {cleanText(selectedClub?.name || 'server')} tasks…
        </Card>
      )}

      {/* Fallback Non-Member Sync Prompt */}
      {notMember && (
        <Card className="p-6 text-center space-y-3">
          <Users size={22} className="mx-auto text-[var(--blue)]" />
          <div className="text-sm font-bold text-[var(--text)]">
            Sync membership with {cleanText(selectedClub?.name || 'this club')}
          </div>
          <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
            Confirm your membership on this server to load its shared task board and your personal to-do list.
          </p>
          <button
            type="button"
            disabled={actionBusy}
            onClick={handleJoinCurrentClub}
            className="inline-flex items-center gap-1.5 px-4 min-h-[38px] rounded-xl bg-[var(--blue)] text-white text-xs font-semibold border-none cursor-pointer"
          >
            <UserPlus size={14} />
            <span>{actionBusy ? 'Syncing…' : 'Confirm Membership'}</span>
          </button>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ZONE 1: YOUR PERSONAL TO-DO LISTS (Private per user, isolated per server)
         ══════════════════════════════════════════════════════════════════════ */}
      {!notMember && !loading && boardData && showPersonalZone && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <IconBadge color="green" size={30} radius={9}>
                <Lock size={14} />
              </IconBadge>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-extrabold text-[var(--text)]">
                    Your Personal To-Dos
                  </h3>
                  <span className="text-[11px] font-medium text-[var(--green-ink)] bg-[var(--green-light)] px-2 py-0.5 rounded-full">
                    Only visible to you
                  </span>
                </div>
                <p className="text-[11.5px] text-[var(--text-muted)]">
                  Jot down reminders &amp; action items for yourself in {cleanText(selectedClub?.name || 'this server')}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => openSectionCreator('personal')}
              className="inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-tile)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] cursor-pointer transition-colors"
            >
              <FolderPlus size={13} />
              <span>{sectionCreatorMode === 'personal' ? 'Cancel' : 'New Personal List'}</span>
            </button>
          </div>

          {sectionCreatorMode === 'personal' && (
            <Card className="p-3.5 fade-in">
              <form
                onSubmit={handleCreateSection}
                className="flex flex-col sm:flex-row sm:items-center gap-2.5"
              >
                <input
                  type="text"
                  required
                  autoFocus
                  value={newSectionTitle}
                  onChange={e => setNewSectionTitle(e.target.value)}
                  placeholder="Personal list name (e.g. Exam Prep, My Deliverables)"
                  className="flex-1 min-h-[38px] px-3.5 rounded-xl bg-[var(--bg-surface)] text-base sm:text-xs text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--green)]"
                />
                <div className="flex items-center justify-between sm:justify-end gap-2">
                  <ColorPickerDots value={newSectionColor} onChange={setNewSectionColor} />
                  <button
                    type="submit"
                    disabled={actionBusy || !newSectionTitle.trim()}
                    className="px-4 min-h-[38px] rounded-xl bg-[var(--blue)] text-white text-xs font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50"
                  >
                    Create List
                  </button>
                </div>
              </form>
            </Card>
          )}

          {personalSections.map(pSec => {
            const totalInSec = allPersonalTasks.filter(t => t.sectionId === pSec.id)
            const doneInSecCount = totalInSec.filter(t => t.status === 'done').length
            const pctDone =
              totalInSec.length > 0 ? Math.round((doneInSecCount / totalInSec.length) * 100) : 0

            const matchingTasks = filteredPersonalTasks.filter(t => t.sectionId === pSec.id)
            const activeItems = [...matchingTasks.filter(t => t.status !== 'done')].sort(
              (a, b) => {
                const aOver = a.dueDate && a.dueDate < todayYmd ? 0 : 1
                const bOver = b.dueDate && b.dueDate < todayYmd ? 0 : 1
                if (aOver !== bOver) return aOver - bOver
                const pDiff =
                  (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2)
                if (pDiff !== 0) return pDiff
                if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
                if (a.dueDate) return -1
                if (b.dueDate) return 1
                return 0
              }
            )
            const completedItems = matchingTasks.filter(t => t.status === 'done')
            const showCompleted =
              showCompletedPersonal[pSec.id] !== undefined
                ? showCompletedPersonal[pSec.id]
                : activeItems.length === 0

            const accent = SECTION_COLOR_META[pSec.color] || SECTION_COLOR_META.green
            const accentInk = SECTION_INK_META[pSec.color] || SECTION_INK_META.green
            const isCollapsed = Boolean(collapsedSections[pSec.id])
            const draft = getDraftForSection(pSec.id)
            const quickBusy = quickAddBusySecId === pSec.id
            const draftPriorityMeta =
              TASK_PRIORITY_META[draft.priority] || TASK_PRIORITY_META.medium

            return (
              <Card key={pSec.id} className="overflow-hidden p-0" delay={2}>
                {/* Personal List Header */}
                <div
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-[var(--bg-surface)] border-b border-[var(--border)]"
                  style={{ borderLeft: `5px solid ${accent}` }}
                >
                  <button
                    type="button"
                    onClick={() => setCollapsedSections(p => ({ ...p, [pSec.id]: !p[pSec.id] }))}
                    className="flex items-center gap-2 min-h-[32px] bg-transparent border-none cursor-pointer text-left flex-wrap"
                  >
                    {isCollapsed ? (
                      <ChevronRight size={16} style={{ color: accentInk }} />
                    ) : (
                      <ChevronDown size={16} style={{ color: accentInk }} />
                    )}
                    <CheckSquare size={15} style={{ color: accentInk }} />
                    <span className="text-sm font-extrabold" style={{ color: accentInk }}>
                      {cleanText(pSec.title)}
                    </span>
                    {totalInSec.length > 0 && (
                      <span className="inline-flex items-center gap-2 ml-1">
                        <span className="w-14 h-1.5 rounded-full bg-[var(--bg-subtle)] overflow-hidden hidden xs:inline-block">
                          <span
                            className="block h-full rounded-full transition-[width] duration-300"
                            style={{ width: `${pctDone}%`, background: accent }}
                          />
                        </span>
                        <span className="text-xs text-[var(--text-muted)] font-mono-num">
                          {doneInSecCount}/{totalInSec.length}
                        </span>
                      </span>
                    )}
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {doneInSecCount > 0 && (
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => handleClearCompletedPersonal(pSec.id)}
                        className="px-2.5 min-h-[30px] rounded-lg bg-transparent hover:bg-[var(--bg-card)] text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--red-ink)] border border-transparent hover:border-[var(--border)] cursor-pointer transition-colors"
                      >
                        Clear Done ({doneInSecCount})
                      </button>
                    )}
                    {!pSec.isDefaultPersonal && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSection(pSec)}
                        aria-label="Delete personal list"
                        className="w-8 h-8 rounded-xl bg-transparent hover:bg-[var(--red-light)] text-[var(--text-light)] hover:text-[var(--red-ink)] border-none flex items-center justify-center cursor-pointer transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {!isCollapsed && (
                  <div>
                    {/* Effortless 1-Line To-Do Composer + Instant Chips */}
                    <form
                      onSubmit={e => handleQuickAddPersonalTask(e, pSec)}
                      className="p-3 sm:px-4 bg-[var(--bg-card)] border-b border-[var(--border-subtle)] space-y-2"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-5 h-5 rounded-md border border-dashed flex items-center justify-center shrink-0"
                          style={{ borderColor: accent, color: accentInk }}
                        >
                          <Plus size={12} />
                        </span>
                        <input
                          type="text"
                          value={draft.title}
                          onChange={e => updateDraftForSection(pSec.id, { title: e.target.value })}
                          placeholder={`Add a to-do for ${cleanText(selectedClub?.name || 'this server')}…`}
                          aria-label={`Add a to-do in ${cleanText(pSec.title)}`}
                          className="flex-1 min-h-[38px] px-3 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--green)]"
                        />
                        <button
                          type="submit"
                          disabled={quickBusy || !String(draft.title || '').trim()}
                          className="px-3.5 min-h-[38px] rounded-xl bg-[var(--blue)] text-white text-xs font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-45 shrink-0 transition-opacity"
                        >
                          {quickBusy ? 'Adding…' : 'Add'}
                        </button>
                      </div>

                      {/* Lightweight Optional Quick Chips (Today / Tomorrow / Priority / Note) */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pl-7">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {[
                            { label: 'Today', val: todayYmd },
                            { label: 'Tomorrow', val: addDaysYmd(1) },
                            { label: 'Next Week', val: addDaysYmd(7) },
                          ].map(chip => {
                            const active = draft.dueDate === chip.val
                            return (
                              <button
                                key={chip.label}
                                type="button"
                                onClick={() =>
                                  updateDraftForSection(pSec.id, {
                                    dueDate: active ? '' : chip.val,
                                  })
                                }
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border cursor-pointer transition-colors ${
                                  active
                                    ? 'bg-[var(--blue-light)] border-[var(--blue)] text-[var(--blue-ink)]'
                                    : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                                }`}
                              >
                                <Calendar size={10} />
                                <span>{chip.label}</span>
                              </button>
                            )
                          })}

                          <label className="relative inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">
                            <Calendar size={10} />
                            <span>
                              {draft.dueDate &&
                              draft.dueDate !== todayYmd &&
                              draft.dueDate !== addDaysYmd(1) &&
                              draft.dueDate !== addDaysYmd(7)
                                ? formatSmartDueDate(draft.dueDate)?.label || draft.dueDate
                                : 'Pick date'}
                            </span>
                            <input
                              type="date"
                              value={draft.dueDate}
                              onChange={e =>
                                updateDraftForSection(pSec.id, { dueDate: e.target.value })
                              }
                              aria-label="Pick custom due date"
                              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            />
                          </label>

                          {draft.dueDate && (
                            <button
                              type="button"
                              onClick={() => updateDraftForSection(pSec.id, { dueDate: '' })}
                              aria-label="Clear due date"
                              className="text-[11px] text-[var(--text-light)] hover:text-[var(--red-ink)] bg-transparent border-none cursor-pointer px-1"
                            >
                              ×
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => cycleDraftPriority(pSec.id)}
                            title="Click to cycle priority"
                            style={{
                              background: draftPriorityMeta.bg,
                              color: draftPriorityMeta.color,
                              borderColor: `color-mix(in srgb, ${draftPriorityMeta.dot} 32%, transparent)`,
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold border cursor-pointer"
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: draftPriorityMeta.dot }}
                            />
                            <span>{draftPriorityMeta.label}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              updateDraftForSection(pSec.id, { showNote: !draft.showNote })
                            }
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border cursor-pointer transition-colors ${
                              draft.showNote || draft.notes
                                ? 'bg-[var(--teal-light)] border-[var(--teal)] text-[var(--teal-ink)]'
                                : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                            }`}
                          >
                            <StickyNote size={10} />
                            <span>Note</span>
                          </button>
                        </div>
                      </div>

                      {draft.showNote && (
                        <div className="pl-7 fade-in">
                          <input
                            type="text"
                            value={draft.notes}
                            onChange={e =>
                              updateDraftForSection(pSec.id, { notes: e.target.value })
                            }
                            placeholder="Optional note or link…"
                            className="w-full min-h-[34px] px-3 rounded-xl bg-[var(--bg-surface)] text-base sm:text-xs text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--teal)]"
                          />
                        </div>
                      )}
                    </form>

                    {/* Checklist Items */}
                    {matchingTasks.length === 0 ? (
                      <div className="px-4 py-6 text-xs text-[var(--text-muted)] text-center">
                        {totalInSec.length === 0
                          ? `Nothing on your ${cleanText(selectedClub?.name || 'server')} to-do list yet — type above and press Enter.`
                          : 'No personal to-dos match your active filter.'}
                      </div>
                    ) : (
                      <div className="divide-y divide-[var(--border-subtle)]">
                        {activeItems.map(task => {
                          const sMeta =
                            TASK_STATUS_META[task.status] || TASK_STATUS_META.not_started
                          const pMeta =
                            TASK_PRIORITY_META[task.priority] || TASK_PRIORITY_META.medium
                          const isInlineEditing = inlineEditingId === task.id

                          return (
                            <div
                              key={task.id}
                              className="group px-3.5 sm:px-4 py-3 hover:bg-[var(--bg-surface)]/55 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                            >
                              <div className="flex items-start gap-3 min-w-0 flex-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleInlineTaskPatch(task, { toggleCompletedForSelf: true })
                                  }
                                  aria-label={`Complete "${cleanText(task.title)}"`}
                                  className="mt-0.5 w-[22px] h-[22px] rounded-lg border-2 border-[var(--border-strong)] hover:border-[var(--green)] bg-[var(--bg-card)] text-transparent hover:text-[var(--green)] flex items-center justify-center shrink-0 cursor-pointer transition-all"
                                >
                                  <Check size={13} strokeWidth={2.75} />
                                </button>

                                <div className="min-w-0 flex-1">
                                  {isInlineEditing ? (
                                    <input
                                      type="text"
                                      autoFocus
                                      value={inlineEditTitle}
                                      onChange={e => setInlineEditTitle(e.target.value)}
                                      onBlur={() => commitInlinePersonalRename(task)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault()
                                          commitInlinePersonalRename(task)
                                        } else if (e.key === 'Escape') {
                                          setInlineEditingId(null)
                                        }
                                      }}
                                      className="w-full min-h-[30px] px-2 py-0.5 rounded-lg bg-[var(--bg-card)] text-sm font-semibold text-[var(--text)] border border-[var(--blue)] outline-none"
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setInlineEditingId(task.id)
                                        setInlineEditTitle(task.title)
                                      }}
                                      title="Click to rename"
                                      className="text-left font-semibold text-sm text-[var(--text)] hover:text-[var(--blue-ink)] bg-transparent border-none cursor-text p-0 leading-snug break-words"
                                    >
                                      {cleanText(task.title)}
                                    </button>
                                  )}

                                  {task.notes && (
                                    <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed line-clamp-2">
                                      {cleanText(task.notes)}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 pl-8 sm:pl-0 shrink-0">
                                <DueDateBadge dueDate={task.dueDate} isDone={false} />

                                {task.status !== 'not_started' && (
                                  <select
                                    value={task.status}
                                    onChange={e =>
                                      handleInlineTaskPatch(task, { status: e.target.value })
                                    }
                                    aria-label={`Status for ${cleanText(task.title)}`}
                                    style={{
                                      background: sMeta.bg,
                                      color: sMeta.color,
                                      border: `1px solid color-mix(in srgb, ${sMeta.dot} 30%, transparent)`,
                                    }}
                                    className="min-h-[28px] px-2 rounded-lg text-[11px] font-bold cursor-pointer"
                                  >
                                    {Object.entries(TASK_STATUS_META).map(([k, m]) => (
                                      <option
                                        key={k}
                                        value={k}
                                        className="bg-[var(--bg-card)] text-[var(--text)]"
                                      >
                                        {m.label}
                                      </option>
                                    ))}
                                  </select>
                                )}

                                <select
                                  value={task.priority || 'medium'}
                                  onChange={e =>
                                    handleInlineTaskPatch(task, { priority: e.target.value })
                                  }
                                  aria-label={`Priority for ${cleanText(task.title)}`}
                                  style={{
                                    background: pMeta.bg,
                                    color: pMeta.color,
                                    border: `1px solid color-mix(in srgb, ${pMeta.dot} 28%, transparent)`,
                                  }}
                                  className="min-h-[28px] px-2 rounded-lg text-[11px] font-bold cursor-pointer"
                                >
                                  {Object.entries(TASK_PRIORITY_META).map(([k, m]) => (
                                    <option
                                      key={k}
                                      value={k}
                                      className="bg-[var(--bg-card)] text-[var(--text)]"
                                    >
                                      {m.label}
                                    </option>
                                  ))}
                                </select>

                                <div className="inline-flex items-center gap-1 sm:opacity-70 sm:group-hover:opacity-100 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingTask(task)
                                      setModalPersonalOnly(true)
                                      setModalOpen(true)
                                    }}
                                    aria-label="Edit personal to-do details"
                                    title="Edit details, status, or notes"
                                    className="w-7 h-7 rounded-lg bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--blue-ink)] border border-[var(--border)] flex items-center justify-center cursor-pointer transition-colors"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteTaskClick(task)}
                                    aria-label="Delete personal to-do"
                                    title="Delete to-do"
                                    className="w-7 h-7 rounded-lg bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--red-ink)] border border-[var(--border)] flex items-center justify-center cursor-pointer transition-colors"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}

                        {/* Collapsible Completed Personal To-Dos Drawer */}
                        {completedItems.length > 0 && (
                          <div className="bg-[var(--bg-surface)]/35">
                            <button
                              type="button"
                              onClick={() =>
                                setShowCompletedPersonal(prev => ({
                                  ...prev,
                                  [pSec.id]: !showCompleted,
                                }))
                              }
                              className="w-full px-4 py-2 flex items-center justify-between text-[11.5px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] bg-transparent border-none cursor-pointer"
                            >
                              <span className="inline-flex items-center gap-1.5">
                                {showCompleted ? (
                                  <ChevronDown size={13} />
                                ) : (
                                  <ChevronRight size={13} />
                                )}
                                <span>Completed ({completedItems.length})</span>
                              </span>
                              <span className="text-[11px] text-[var(--text-light)]">
                                {showCompleted ? 'Hide' : 'Show'}
                              </span>
                            </button>

                            {showCompleted && (
                              <div className="divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
                                {completedItems.map(task => (
                                  <div
                                    key={task.id}
                                    className="px-3.5 sm:px-4 py-2.5 flex items-center justify-between gap-2.5 opacity-80 hover:opacity-100 transition-opacity"
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleInlineTaskPatch(task, {
                                            toggleCompletedForSelf: true,
                                          })
                                        }
                                        aria-label={`Mark "${cleanText(task.title)}" incomplete`}
                                        style={{
                                          background: 'var(--green)',
                                          borderColor: 'var(--green)',
                                          color: '#ffffff',
                                        }}
                                        className="w-[22px] h-[22px] rounded-lg border flex items-center justify-center shrink-0 cursor-pointer"
                                      >
                                        <Check size={13} strokeWidth={3} />
                                      </button>
                                      <span className="text-sm line-through text-[var(--text-muted)] truncate">
                                        {cleanText(task.title)}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <DueDateBadge dueDate={task.dueDate} isDone={true} />
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteTaskClick(task)}
                                        aria-label="Delete completed to-do"
                                        className="w-7 h-7 rounded-lg bg-transparent hover:bg-[var(--red-light)] text-[var(--text-light)] hover:text-[var(--red-ink)] border-none flex items-center justify-center cursor-pointer transition-colors"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ZONE 2: SHARED CLUB TASK BOARD (General Checklists, Sub-Groups & Board)
         ══════════════════════════════════════════════════════════════════════ */}
      {!notMember && !loading && boardData && showClubZone && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <IconBadge
                color={effectiveTier === 'board' ? 'purple' : 'blue'}
                size={30}
                radius={9}
              >
                {effectiveTier === 'board' ? <Shield size={14} /> : <Users size={14} />}
              </IconBadge>
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-[var(--text)]">
                  {cleanText(selectedClub?.name || 'Club')} Shared Tasks
                </h3>
                <p className="text-[11.5px] text-[var(--text-muted)]">
                  {effectiveTier === 'board'
                    ? 'Master Board View across club checklists, sub-group sprints, and officer tasks'
                    : 'Club-wide checklists and tasks assigned to you or your sub-groups'}
                </p>
              </div>
            </div>

            {effectiveTier === 'board' && isBoard && (
              <button
                type="button"
                onClick={() => openSectionCreator('club')}
                className="inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-tile)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] cursor-pointer transition-colors"
              >
                <FolderPlus size={13} />
                <span>{sectionCreatorMode === 'club' ? 'Cancel' : 'New Club Section'}</span>
              </button>
            )}
          </div>

          {sectionCreatorMode === 'club' && isBoard && (
            <Card className="p-3.5 fade-in">
              <form
                onSubmit={handleCreateSection}
                className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5"
              >
                <input
                  type="text"
                  required
                  autoFocus
                  value={newSectionTitle}
                  onChange={e => setNewSectionTitle(e.target.value)}
                  placeholder="Club section title (e.g. Marketing Sprint, Showcase Logistics)"
                  className="flex-1 min-w-[180px] min-h-[38px] px-3.5 rounded-xl bg-[var(--bg-surface)] text-base sm:text-xs text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <ColorPickerDots value={newSectionColor} onChange={setNewSectionColor} />
                  <div className="segmented-track">
                    {[
                      { id: 'members', label: 'All Members' },
                      { id: 'board', label: 'Board Only' },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setNewSectionVis(opt.id)}
                        className={`px-2.5 min-h-[30px] rounded-lg text-xs font-semibold border-none cursor-pointer transition-all ${
                          newSectionVis === opt.id
                            ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
                            : 'bg-transparent text-[var(--text-muted)]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="submit"
                    disabled={actionBusy || !newSectionTitle.trim()}
                    className="px-4 min-h-[38px] rounded-xl bg-[var(--blue)] text-white text-xs font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50"
                  >
                    Create Section
                  </button>
                </div>
              </form>
            </Card>
          )}

          {visibleSections.map(sec => {
            const secTasks = filteredTasks.filter(t => t.sectionId === sec.id)
            const accent = SECTION_COLOR_META[sec.color] || SECTION_COLOR_META.blue
            const accentInk = SECTION_INK_META[sec.color] || SECTION_INK_META.blue
            const isCollapsed = Boolean(collapsedSections[sec.id])

            return (
              <Card key={sec.id} className="overflow-hidden p-0" delay={2}>
                <div
                  className="flex items-center justify-between gap-2 px-4 py-3 bg-[var(--bg-surface)] border-b border-[var(--border)]"
                  style={{ borderLeft: `5px solid ${accent}` }}
                >
                  <button
                    type="button"
                    onClick={() => setCollapsedSections(p => ({ ...p, [sec.id]: !p[sec.id] }))}
                    className="flex items-center gap-2 min-h-[32px] bg-transparent border-none cursor-pointer text-left flex-wrap"
                  >
                    {isCollapsed ? (
                      <ChevronRight size={16} style={{ color: accentInk }} />
                    ) : (
                      <ChevronDown size={16} style={{ color: accentInk }} />
                    )}
                    <span className="text-sm font-extrabold" style={{ color: accentInk }}>
                      {cleanText(sec.title)}
                    </span>
                    <span className="text-xs text-[var(--text-muted)] font-mono-num">
                      ({secTasks.length})
                    </span>
                    {sec.visibility === 'board' && (
                      <BubbleTag label="Board Only" color="purple" size="sm" />
                    )}
                  </button>

                  {effectiveTier === 'board' && isBoard && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTask(null)
                          setModalPersonalOnly(false)
                          setModalDefaultSectionId(sec.id)
                          setModalOpen(true)
                        }}
                        className="inline-flex items-center gap-1 px-2.5 min-h-[32px] rounded-xl bg-[var(--bg-card)] text-xs font-semibold text-[var(--text)] border border-[var(--border)] cursor-pointer hover:border-[var(--blue)] transition-colors"
                      >
                        <Plus size={13} />
                        <span>Add Task</span>
                      </button>
                      {!sec.id.endsWith('_general') &&
                        !sec.id.endsWith('_sprint') &&
                        !sec.id.endsWith('_board') && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSection(sec)}
                            aria-label="Delete section"
                            className="w-8 h-8 rounded-xl bg-transparent hover:bg-[var(--red-light)] text-[var(--text-light)] hover:text-[var(--red-ink)] border-none flex items-center justify-center cursor-pointer transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                    </div>
                  )}
                </div>

                {!isCollapsed &&
                  (secTasks.length === 0 ? (
                    <div className="px-4 py-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                      <span>
                        {hasAnyActiveFilter
                          ? 'No tasks in this section match your active filters.'
                          : 'No active tasks in this section right now.'}
                      </span>
                      {effectiveTier === 'board' && isBoard && !hasAnyActiveFilter && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTask(null)
                            setModalPersonalOnly(false)
                            setModalDefaultSectionId(sec.id)
                            setModalOpen(true)
                          }}
                          className="inline-flex items-center gap-1 text-xs font-bold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer"
                        >
                          <Plus size={12} />
                          <span>Add first task</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="divide-y divide-[var(--border-subtle)]">
                      {secTasks.map(task => {
                        const isGeneral = task.audience === 'general'
                        const mySelfDone = (task.completedBy || []).some(
                          c => c.userId === selfId
                        )
                        const isDoneDisplay = !isBoard && isGeneral ? mySelfDone : task.status === 'done'
                        const canMemberUpdateStatus =
                          isBoard || isGeneral || isAssignedToMeOrMyGroup(task)
                        const displayStatusKey =
                          !isBoard && isGeneral
                            ? mySelfDone
                              ? 'done'
                              : 'not_started'
                            : task.status || 'not_started'
                        const sMeta =
                          TASK_STATUS_META[displayStatusKey] || TASK_STATUS_META.not_started
                        const pMeta =
                          TASK_PRIORITY_META[task.priority] || TASK_PRIORITY_META.medium
                        const assignees = task.assignees || []
                        const taskGroups = (task.groupIds || [])
                          .map(gid => groupsMap.get(gid))
                          .filter(Boolean)

                        return (
                          <div
                            key={task.id}
                            className="group px-3.5 sm:px-4 py-3.5 hover:bg-[var(--bg-surface)]/55 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                          >
                            {/* Left: Checkbox/Dot + Title + Notes + Owners */}
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              {!isBoard && isGeneral ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleInlineTaskPatch(task, { toggleCompletedForSelf: true })
                                  }
                                  aria-label={
                                    mySelfDone
                                      ? `Mark "${cleanText(task.title)}" incomplete`
                                      : `Check off "${cleanText(task.title)}" for yourself`
                                  }
                                  style={
                                    mySelfDone
                                      ? {
                                          background: 'var(--green)',
                                          borderColor: 'var(--green)',
                                          color: '#ffffff',
                                        }
                                      : undefined
                                  }
                                  className={`mt-0.5 w-[22px] h-[22px] rounded-lg border-2 flex items-center justify-center shrink-0 cursor-pointer transition-all ${
                                    mySelfDone
                                      ? ''
                                      : 'border-[var(--border-strong)] hover:border-[var(--green)] bg-[var(--bg-card)] text-transparent hover:text-[var(--green)]'
                                  }`}
                                >
                                  <Check size={13} strokeWidth={2.75} />
                                </button>
                              ) : (
                                <span
                                  className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ background: sMeta.dot }}
                                />
                              )}

                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span
                                    className={`font-semibold text-sm leading-snug ${
                                      isDoneDisplay
                                        ? 'line-through text-[var(--text-muted)]'
                                        : 'text-[var(--text)]'
                                    }`}
                                  >
                                    {cleanText(task.title)}
                                  </span>
                                  {isGeneral && (
                                    <BubbleTag label="Everyone" color="blue" size="sm" />
                                  )}
                                  {task.visibility === 'board' && (
                                    <BubbleTag label="Board" color="purple" size="sm" />
                                  )}
                                </div>

                                {task.notes && (
                                  <p className="text-xs text-[var(--text-muted)] leading-relaxed line-clamp-2">
                                    {cleanText(task.notes)}
                                  </p>
                                )}

                                {/* Clear Readable Assignees & Sub-Group Chips */}
                                {(assignees.length > 0 || taskGroups.length > 0) && (
                                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                    {assignees.length > 0 && assignees.length <= 2 ? (
                                      assignees.map((a, idx) => (
                                        <span
                                          key={a.memberKey || a.userId || idx}
                                          className="inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border)] text-[11px] font-medium text-[var(--text)]"
                                        >
                                          <Avatar initials={a.initials || 'MB'} size={18} />
                                          <span className="truncate max-w-[120px]">
                                            {cleanText(a.name)}
                                          </span>
                                        </span>
                                      ))
                                    ) : assignees.length > 2 ? (
                                      <div className="inline-flex items-center gap-1.5">
                                        <div className="flex items-center -space-x-1.5">
                                          {assignees.slice(0, 4).map((a, idx) => (
                                            <div
                                              key={a.memberKey || a.userId || idx}
                                              title={`${a.name} (${a.roleTitle || 'Member'})`}
                                              className="rounded-full ring-1 ring-[var(--bg-card)]"
                                            >
                                              <Avatar initials={a.initials || 'MB'} size={20} />
                                            </div>
                                          ))}
                                        </div>
                                        <span className="text-[11px] font-medium text-[var(--text-muted)]">
                                          {assignees.length} people
                                        </span>
                                      </div>
                                    ) : null}

                                    {taskGroups.map(g => (
                                      <span
                                        key={g.id}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--teal-light)] text-[var(--teal-ink)] text-[10.5px] font-bold"
                                      >
                                        <Layers size={10} />
                                        <span>{cleanText(g.name)}</span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Right: Due Date + Status Control + Priority + Board Actions */}
                            <div className="flex flex-wrap items-center gap-2 pl-8 lg:pl-0 shrink-0">
                              <DueDateBadge dueDate={task.dueDate} isDone={isDoneDisplay} />

                              {!isBoard && isGeneral ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleInlineTaskPatch(task, { toggleCompletedForSelf: true })
                                  }
                                  style={{
                                    background: sMeta.bg,
                                    color: sMeta.color,
                                    border: `1px solid color-mix(in srgb, ${sMeta.dot} 32%, transparent)`,
                                  }}
                                  className="min-h-[32px] px-3 rounded-xl text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"
                                >
                                  <CheckCircle2 size={13} />
                                  <span>{mySelfDone ? 'Done for You' : 'Check Off'}</span>
                                </button>
                              ) : (
                                <select
                                  disabled={!canMemberUpdateStatus}
                                  value={task.status || 'not_started'}
                                  onChange={e =>
                                    handleInlineTaskPatch(task, { status: e.target.value })
                                  }
                                  aria-label={`Status for ${cleanText(task.title)}`}
                                  style={{
                                    background: sMeta.bg,
                                    color: sMeta.color,
                                    border: `1px solid color-mix(in srgb, ${sMeta.dot} 32%, transparent)`,
                                  }}
                                  className="min-h-[32px] px-2.5 rounded-xl text-base sm:text-xs font-bold cursor-pointer disabled:opacity-60"
                                >
                                  {Object.entries(TASK_STATUS_META).map(([k, m]) => (
                                    <option
                                      key={k}
                                      value={k}
                                      className="bg-[var(--bg-card)] text-[var(--text)]"
                                    >
                                      {m.label}
                                    </option>
                                  ))}
                                </select>
                              )}

                              {effectiveTier === 'board' && isBoard ? (
                                <select
                                  value={task.priority || 'medium'}
                                  onChange={e =>
                                    handleInlineTaskPatch(task, { priority: e.target.value })
                                  }
                                  aria-label={`Priority for ${cleanText(task.title)}`}
                                  style={{
                                    background: pMeta.bg,
                                    color: pMeta.color,
                                    border: `1px solid color-mix(in srgb, ${pMeta.dot} 28%, transparent)`,
                                  }}
                                  className="min-h-[32px] px-2.5 rounded-xl text-base sm:text-xs font-bold cursor-pointer"
                                >
                                  {Object.entries(TASK_PRIORITY_META).map(([k, m]) => (
                                    <option
                                      key={k}
                                      value={k}
                                      className="bg-[var(--bg-card)] text-[var(--text)]"
                                    >
                                      {m.label}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span
                                  style={{
                                    background: pMeta.bg,
                                    color: pMeta.color,
                                    border: `1px solid color-mix(in srgb, ${pMeta.dot} 28%, transparent)`,
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 min-h-[28px] rounded-lg text-[11px] font-bold"
                                >
                                  <span
                                    className="w-1.5 h-1.5 rounded-full"
                                    style={{ background: pMeta.dot }}
                                  />
                                  <span>{pMeta.label}</span>
                                </span>
                              )}

                              {effectiveTier === 'board' && isBoard && (
                                <div className="inline-flex items-center gap-1 sm:opacity-75 sm:group-hover:opacity-100 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingTask(task)
                                      setModalPersonalOnly(false)
                                      setModalOpen(true)
                                    }}
                                    aria-label="Edit task"
                                    className="w-8 h-8 rounded-lg bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--blue-ink)] border border-[var(--border)] flex items-center justify-center cursor-pointer transition-colors"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteTaskClick(task)}
                                    aria-label="Delete task"
                                    className="w-8 h-8 rounded-lg bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--red-ink)] border border-[var(--border)] flex items-center justify-center cursor-pointer transition-colors"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ))}
              </Card>
            )
          })}
        </section>
      )}

      {modalOpen && (
        <TaskModal
          clubName={selectedClub?.name || ''}
          sections={(boardData?.sections || []).filter(s => s.visibility !== 'personal')}
          personalSections={personalSections}
          personalOnly={!isBoard || modalPersonalOnly}
          clubPeople={clubPeople}
          initialTask={editingTask}
          defaultSectionId={modalDefaultSectionId}
          busy={actionBusy}
          onClose={() => {
            setModalOpen(false)
            setEditingTask(null)
            setModalPersonalOnly(false)
          }}
          onSubmit={handleModalSave}
        />
      )}
    </div>
  )
}
