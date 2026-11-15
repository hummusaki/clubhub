import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Plus,
  Shield,
  Users,
  Layers,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Search,
  Lock,
  UserPlus,
  FolderPlus,
} from 'lucide-react'
import { Card, BubbleTag, Avatar, cleanText } from './ui'
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
} from './TaskModal'

export default function ClubTaskBoard({
  user = null,
  isDemo = false,
  clubs = [],
  joinedClubIds = [],
  initialClubId = '',
  onClubJoined,
  onOpenClubsRbac,
  onNotify,
}) {
  const effectiveUser = isDemo ? null : user
  const isAuthenticated = Boolean(effectiveUser?.id)

  const defaultClubId = useMemo(() => {
    if (initialClubId && clubs.some(c => c.id === initialClubId)) return initialClubId
    if (joinedClubIds.length > 0 && clubs.some(c => c.id === joinedClubIds[0])) {
      return joinedClubIds[0]
    }
    return clubs[0]?.id || ''
  }, [initialClubId, joinedClubIds, clubs])

  const [selectedClubId, setSelectedClubId] = useState(defaultClubId)
  useEffect(() => {
    if (initialClubId && clubs.some(c => c.id === initialClubId)) {
      setSelectedClubId(initialClubId)
    } else if (!selectedClubId && defaultClubId) {
      setSelectedClubId(defaultClubId)
    }
  }, [initialClubId, defaultClubId, selectedClubId, clubs])

  const [boardData, setBoardData] = useState(null)
  const [clubPeople, setClubPeople] = useState(null)
  const [loading, setLoading] = useState(false)
  const [notMember, setNotMember] = useState(false)
  const [viewTier, setViewTier] = useState('member') // 'member' | 'board'
  const [collapsedSections, setCollapsedSections] = useState({})

  // Board filters & section creator
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')
  const [showNewSection, setShowNewSection] = useState(false)
  const [newSectionTitle, setNewSectionTitle] = useState('')
  const [newSectionColor, setNewSectionColor] = useState('teal')
  const [newSectionVis, setNewSectionVis] = useState('members')

  // Task Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [modalDefaultSectionId, setModalDefaultSectionId] = useState('')
  const [actionBusy, setActionBusy] = useState(false)

  const selectedClub = useMemo(
    () => clubs.find(c => c.id === selectedClubId) || null,
    [clubs, selectedClubId]
  )

  const loadBoard = useCallback(async () => {
    if (!selectedClubId || !isAuthenticated) {
      setBoardData(null)
      setClubPeople(null)
      setNotMember(false)
      return
    }
    setLoading(true)
    const [tasksRes, peopleRes] = await Promise.all([
      getClubTasksBoard(selectedClubId),
      getClubPeopleAndGroups(selectedClubId),
    ])
    setLoading(false)

    if (peopleRes?.ok) setClubPeople(peopleRes)

    if (!tasksRes?.ok) {
      if (tasksRes?.status === 403 && tasksRes?.code === 'NOT_CLUB_MEMBER') {
        setNotMember(true)
        setBoardData(null)
        setViewTier('member')
        return
      }
      setNotMember(false)
      setBoardData(null)
      return
    }

    setNotMember(false)
    setBoardData(tasksRes)
    if (tasksRes.permission?.isBoard) {
      setViewTier(prev => (prev === 'board' || prev === 'member' ? prev : 'board'))
    } else {
      setViewTier('member')
    }
  }, [selectedClubId, isAuthenticated])

  useEffect(() => {
    loadBoard()
  }, [loadBoard])

  // Auto-select Board View when loading a club where the user is Board
  const isBoard = Boolean(boardData?.permission?.isBoard)
  useEffect(() => {
    if (isBoard) setViewTier('board')
    else setViewTier('member')
  }, [selectedClubId, isBoard])

  // Handle mid-session permission revocations immediately
  useEffect(() => {
    return onWorkspacePermissionChange(() => {
      loadBoard()
    })
  }, [loadBoard])

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
    const allSecs = boardData?.sections || []
    return effectiveTier === 'board'
      ? allSecs
      : allSecs.filter(s => s.visibility !== 'board')
  }, [boardData?.sections, effectiveTier])

  const filteredTasks = useMemo(() => {
    const raw = boardData?.tasks || []
    return raw.filter(t => {
      if (effectiveTier === 'member') {
        if (t.visibility === 'board' || t.audience === 'board') return false
        if (t.audience !== 'general' && !isAssignedToMeOrMyGroup(t)) return false
      }
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false
      if (groupFilter !== 'all' && !(t.groupIds || []).includes(groupFilter)) return false
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const hay = `${t.title} ${t.notes || ''} ${(t.assignees || []).map(a => a.name).join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [
    boardData?.tasks,
    effectiveTier,
    isAssignedToMeOrMyGroup,
    statusFilter,
    priorityFilter,
    groupFilter,
    searchQuery,
  ])

  const kpis = useMemo(() => {
    const all = filteredTasks
    const total = all.length
    const done = all.filter(t => t.status === 'done').length
    const stuck = all.filter(t => t.status === 'stuck' || t.priority === 'critical').length
    const todayYmd = new Date().toISOString().slice(0, 10)
    const overdue = all.filter(t => t.dueDate && t.dueDate < todayYmd && t.status !== 'done').length
    return {
      total,
      done,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
      stuck,
      overdue,
    }
  }, [filteredTasks])

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
    setActionBusy(true)
    const res = editingTask?.id
      ? await updateClubTask(selectedClubId, editingTask.id, payload)
      : await createClubTask(selectedClubId, payload)
    setActionBusy(false)
    if (res?.ok) {
      setBoardData(prev => ({
        ...(prev || {}),
        permission: res.permission || prev?.permission,
        sections: res.sections || prev?.sections || [],
        tasks: res.tasks || prev?.tasks || [],
      }))
      setModalOpen(false)
      setEditingTask(null)
      if (onNotify) onNotify(editingTask?.id ? 'Task updated.' : 'Task created!')
    } else {
      if (res?.status === 403) loadBoard()
      if (onNotify) onNotify(res?.error || 'Permission denied.', { type: 'error' })
    }
  }

  async function handleInlineTaskPatch(task, patch) {
    const res = await updateClubTask(selectedClubId, task.id, patch)
    if (res?.ok) {
      setBoardData(prev => ({
        ...(prev || {}),
        permission: res.permission || prev?.permission,
        sections: res.sections || prev?.sections || [],
        tasks: res.tasks || prev?.tasks || [],
      }))
    } else {
      if (res?.status === 403) loadBoard()
      if (onNotify) onNotify(res?.error || 'Could not update task.', { type: 'error' })
    }
  }

  async function handleDeleteTaskClick(taskId) {
    const res = await deleteClubTask(selectedClubId, taskId)
    if (res?.ok) {
      setBoardData(prev => ({ ...(prev || {}), tasks: res.tasks || [] }))
      if (onNotify) onNotify('Task deleted.', { type: 'info' })
    } else if (onNotify) {
      onNotify(res?.error || 'Could not delete task.', { type: 'error' })
    }
  }

  async function handleCreateSection(e) {
    e.preventDefault()
    if (!newSectionTitle.trim() || actionBusy) return
    setActionBusy(true)
    const res = await createClubTaskSection(selectedClubId, {
      title: newSectionTitle.trim(),
      color: newSectionColor,
      visibility: newSectionVis,
    })
    setActionBusy(false)
    if (res?.ok) {
      setBoardData(prev => ({ ...(prev || {}), sections: res.sections || [], tasks: res.tasks || [] }))
      setNewSectionTitle('')
      setShowNewSection(false)
      if (onNotify) onNotify('Created task section!')
    } else if (onNotify) {
      onNotify(res?.error || 'Could not create section.', { type: 'error' })
    }
  }

  async function handleRemoveSection(sectionId) {
    const res = await deleteClubTaskSection(selectedClubId, sectionId)
    if (res?.ok) {
      setBoardData(prev => ({ ...(prev || {}), sections: res.sections || [], tasks: res.tasks || [] }))
      if (onNotify) onNotify('Deleted section.', { type: 'info' })
    }
  }

  if (!isAuthenticated) {
    return (
      <Card className="p-6 text-center space-y-2">
        <Lock size={22} className="mx-auto text-[var(--blue)]" />
        <h3 className="text-base font-bold text-[var(--text)]">Sign In to Access Club Task Boards</h3>
        <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
          Sign in with your account to view assigned club tasks, update progress pills, or manage your club&apos;s Board Task View.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Top Bar: Club Selector + Two-Tier View Switcher + Actions */}
      <Card className="p-4 sm:p-5 space-y-3.5" delay={1}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={selectedClubId}
              onChange={e => setSelectedClubId(e.target.value)}
              aria-label="Select club workspace"
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[var(--bg-surface)] text-sm font-bold text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
            >
              {clubs.map(c => (
                <option key={c.id} value={c.id}>
                  {cleanText(c.name)}
                </option>
              ))}
            </select>

            {boardData?.permission && (
              <BubbleTag
                label={
                  isBoard
                    ? `Board · ${cleanText(boardData.permission.roleTitle || 'Officer')}`
                    : 'Regular Member'
                }
                color={isBoard ? 'purple' : 'blue'}
                size="sm"
              />
            )}

            {onOpenClubsRbac && (
              <button
                type="button"
                onClick={() => onOpenClubsRbac(selectedClubId)}
                className="px-3 min-h-[34px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] cursor-pointer"
              >
                Roster &amp; Sub-Groups
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Two-Tier Monday.com Mode Switcher */}
            <div className="inline-flex items-center bg-[var(--bg-surface)] p-1 rounded-xl border border-[var(--border)]">
              <button
                type="button"
                onClick={() => setViewTier('member')}
                className={`inline-flex items-center gap-1.5 px-3 min-h-[32px] rounded-lg text-xs font-semibold border-none cursor-pointer ${
                  effectiveTier === 'member'
                    ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
                    : 'bg-transparent text-[var(--text-muted)]'
                }`}
              >
                <Users size={13} />
                <span>Member View</span>
              </button>
              <button
                type="button"
                disabled={!isBoard}
                onClick={() => isBoard && setViewTier('board')}
                title={
                  isBoard
                    ? 'Elevated master overview across all club tasks, sub-groups & bottlenecks'
                    : 'Claim a Board / Leadership role to unlock Board View'
                }
                className={`inline-flex items-center gap-1.5 px-3 min-h-[32px] rounded-lg text-xs font-semibold border-none transition-all ${
                  !isBoard
                    ? 'opacity-45 cursor-not-allowed text-[var(--text-light)] bg-transparent'
                    : effectiveTier === 'board'
                      ? 'bg-[var(--purple)] text-white shadow-2xs cursor-pointer'
                      : 'bg-transparent text-[var(--text-muted)] cursor-pointer'
                }`}
              >
                {isBoard ? <Shield size={13} /> : <Lock size={12} />}
                <span>Board View</span>
              </button>
            </div>

            {isBoard && (
              <>
                <button
                  type="button"
                  onClick={() => setShowNewSection(prev => !prev)}
                  className="inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-xl bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text)] border border-[var(--border)] cursor-pointer hover:border-[var(--blue)]"
                >
                  <FolderPlus size={13} />
                  <span>Add Section</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingTask(null)
                    setModalDefaultSectionId(visibleSections[0]?.id || '')
                    setModalOpen(true)
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 min-h-[36px] rounded-xl bg-[var(--blue)] text-white text-xs font-semibold border-none cursor-pointer hover:opacity-90"
                >
                  <Plus size={14} />
                  <span>New Task</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Elevated Board View KPIs + Filters */}
        {!notMember && boardData && (
          <div className="pt-3 border-t border-[var(--border)] space-y-3">
            {effectiveTier === 'board' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)]">
                  <div className="text-[10.5px] font-bold uppercase text-[var(--text-muted)]">Master Tasks</div>
                  <div className="text-lg font-extrabold font-mono-num text-[var(--text)]">{kpis.total}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--green-light)]/50 border border-[var(--green)]/30">
                  <div className="text-[10.5px] font-bold uppercase text-[var(--green-ink)]">Completed</div>
                  <div className="text-lg font-extrabold font-mono-num text-[var(--green-ink)]">
                    {kpis.done} ({kpis.pct}%)
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--red-light)]/50 border border-[var(--red)]/30">
                  <div className="text-[10.5px] font-bold uppercase text-[var(--red-ink)]">Bottlenecks / Stuck</div>
                  <div className="text-lg font-extrabold font-mono-num text-[var(--red-ink)]">{kpis.stuck}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--yellow-light)]/50 border border-[var(--yellow)]/30">
                  <div className="text-[10.5px] font-bold uppercase text-[var(--yellow-ink)]">Overdue</div>
                  <div className="text-lg font-extrabold font-mono-num text-[var(--yellow-ink)]">{kpis.overdue}</div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-light)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Filter tasks or owners…"
                  className="w-full min-h-[34px] pl-8 pr-3 rounded-xl bg-[var(--bg-surface)] text-xs text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                />
              </div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="min-h-[34px] px-2.5 rounded-xl bg-[var(--bg-surface)] text-xs text-[var(--text)] border border-[var(--border)]"
              >
                <option value="all">All Statuses</option>
                {Object.entries(TASK_STATUS_META).map(([k, m]) => (
                  <option key={k} value={k}>{m.label}</option>
                ))}
              </select>
              <select
                value={priorityFilter}
                onChange={e => setPriorityFilter(e.target.value)}
                className="min-h-[34px] px-2.5 rounded-xl bg-[var(--bg-surface)] text-xs text-[var(--text)] border border-[var(--border)]"
              >
                <option value="all">All Priorities</option>
                {Object.entries(TASK_PRIORITY_META).map(([k, m]) => (
                  <option key={k} value={k}>{m.label}</option>
                ))}
              </select>
              {(boardData.groups || []).length > 0 && (
                <select
                  value={groupFilter}
                  onChange={e => setGroupFilter(e.target.value)}
                  className="min-h-[34px] px-2.5 rounded-xl bg-[var(--bg-surface)] text-xs text-[var(--text)] border border-[var(--border)]"
                >
                  <option value="all">All Sub-Groups</option>
                  {(boardData.groups || []).map(g => (
                    <option key={g.id} value={g.id}>{cleanText(g.name)}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        {showNewSection && isBoard && (
          <form onSubmit={handleCreateSection} className="pt-3 border-t border-[var(--border)] flex flex-wrap gap-2">
            <input
              type="text"
              required
              value={newSectionTitle}
              onChange={e => setNewSectionTitle(e.target.value)}
              placeholder="New section title (e.g. Marketing Sprint)"
              className="flex-1 min-w-[180px] min-h-[36px] px-3 rounded-xl bg-[var(--bg-surface)] text-xs text-[var(--text)] border border-[var(--border)]"
            />
            <select
              value={newSectionColor}
              onChange={e => setNewSectionColor(e.target.value)}
              className="min-h-[36px] px-2.5 rounded-xl bg-[var(--bg-surface)] text-xs text-[var(--text)] border border-[var(--border)]"
            >
              {Object.keys(SECTION_COLOR_META).map(c => (
                <option key={c} value={c}>{c.toUpperCase()}</option>
              ))}
            </select>
            <select
              value={newSectionVis}
              onChange={e => setNewSectionVis(e.target.value)}
              className="min-h-[36px] px-2.5 rounded-xl bg-[var(--bg-surface)] text-xs text-[var(--text)] border border-[var(--border)]"
            >
              <option value="members">Member-Visible Section</option>
              <option value="board">Board-Only Section</option>
            </select>
            <button type="submit" className="px-4 min-h-[36px] rounded-xl bg-[var(--blue)] text-white text-xs font-semibold border-none cursor-pointer">
              Create Section
            </button>
          </form>
        )}
      </Card>

      {/* Non-Member Prompt */}
      {notMember && (
        <Card className="p-6 text-center space-y-3">
          <Users size={22} className="mx-auto text-[var(--blue)]" />
          <div className="text-sm font-bold text-[var(--text)]">
            Join {cleanText(selectedClub?.name || 'this club')} to view its Member Task Board
          </div>
          <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
            Club task boards are protected by Row-Level Access Control. Join the club to view general checklists and tasks assigned to you or your sub-groups.
          </p>
          <button
            type="button"
            disabled={actionBusy}
            onClick={handleJoinCurrentClub}
            className="inline-flex items-center gap-1.5 px-4 min-h-[38px] rounded-xl bg-[var(--blue)] text-white text-xs font-semibold border-none cursor-pointer"
          >
            <UserPlus size={14} />
            <span>{actionBusy ? 'Joining…' : 'Join Club'}</span>
          </button>
        </Card>
      )}

      {/* Monday.com Group Sections */}
      {!notMember && !loading && visibleSections.map(sec => {
        const secTasks = filteredTasks.filter(t => t.sectionId === sec.id)
        const accent = SECTION_COLOR_META[sec.color] || SECTION_COLOR_META.blue
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
                className="flex items-center gap-2 bg-transparent border-none cursor-pointer text-left"
              >
                {isCollapsed ? <ChevronRight size={15} style={{ color: accent }} /> : <ChevronDown size={15} style={{ color: accent }} />}
                <span className="text-sm font-extrabold" style={{ color: accent }}>
                  {cleanText(sec.title)}
                </span>
                <span className="text-xs text-[var(--text-muted)] font-mono-num">({secTasks.length})</span>
                {sec.visibility === 'board' && <BubbleTag label="Board Only" color="purple" size="sm" />}
              </button>

              {effectiveTier === 'board' && isBoard && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTask(null)
                      setModalDefaultSectionId(sec.id)
                      setModalOpen(true)
                    }}
                    className="inline-flex items-center gap-1 px-2.5 min-h-[28px] rounded-lg bg-[var(--bg-card)] text-xs font-semibold text-[var(--text)] border border-[var(--border)] cursor-pointer hover:border-[var(--blue)]"
                  >
                    <Plus size={12} />
                    <span>Add Item</span>
                  </button>
                  {!sec.id.endsWith('_general') && !sec.id.endsWith('_sprint') && !sec.id.endsWith('_board') && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSection(sec.id)}
                      aria-label="Delete section"
                      className="w-7 h-7 rounded-lg bg-transparent hover:bg-[var(--red-light)] text-[var(--text-light)] hover:text-[var(--red-ink)] border-none flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {!isCollapsed && (
              secTasks.length === 0 ? (
                <div className="px-4 py-5 text-xs text-[var(--text-muted)] text-center">
                  No tasks in this section yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-[var(--bg-card)] border-b border-[var(--border)] text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-light)]">
                        <th className="py-2.5 px-4 text-left min-w-[220px]">Task</th>
                        <th className="py-2.5 px-3 text-left min-w-[150px]">Owners &amp; Groups</th>
                        <th className="py-2.5 px-3 text-center w-[150px]">Status</th>
                        <th className="py-2.5 px-3 text-center w-[124px]">Priority</th>
                        <th className="py-2.5 px-3 text-center w-[120px]">Due Date</th>
                        {effectiveTier === 'board' && isBoard && (
                          <th className="py-2.5 px-3 text-right w-[84px]">Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {secTasks.map(task => {
                        const isGeneral = task.audience === 'general'
                        const mySelfDone = (task.completedBy || []).some(c => c.userId === effectiveUser?.id)
                        const canMemberUpdateStatus = isBoard || isGeneral || isAssignedToMeOrMyGroup(task)
                        const displayStatusKey = !isBoard && isGeneral
                          ? (mySelfDone ? 'done' : 'not_started')
                          : (task.status || 'not_started')
                        const sMeta = TASK_STATUS_META[displayStatusKey] || TASK_STATUS_META.not_started
                        const pMeta = TASK_PRIORITY_META[task.priority] || TASK_PRIORITY_META.medium

                        return (
                          <tr key={task.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-surface)]/55">
                            <td className="py-2.5 px-4">
                              <div className="font-semibold text-[var(--text)] flex items-center gap-1.5 flex-wrap">
                                <span>{cleanText(task.title)}</span>
                                {isGeneral && <BubbleTag label="Club-Wide" color="blue" size="sm" />}
                                {task.visibility === 'board' && <BubbleTag label="Board" color="purple" size="sm" />}
                              </div>
                              {task.notes && (
                                <div className="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-1">
                                  {cleanText(task.notes)}
                                </div>
                              )}
                            </td>

                            <td className="py-2.5 px-3">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {(task.assignees || []).length > 0 && (
                                  <div className="flex items-center -space-x-1.5">
                                    {task.assignees.slice(0, 4).map((a, i) => (
                                      <div key={a.memberKey || a.userId || i} title={`${a.name} (${a.roleTitle || 'Member'})`} className="rounded-full ring-1 ring-[var(--bg-card)]">
                                        <Avatar initials={a.initials || 'MB'} size={22} />
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {(task.groupIds || []).map(gid => {
                                  const g = groupsMap.get(gid)
                                  if (!g) return null
                                  return (
                                    <span key={gid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[var(--teal)] text-[10.5px] font-bold">
                                      <Layers size={10} />
                                      <span>{cleanText(g.name)}</span>
                                    </span>
                                  )
                                })}
                                {(task.assignees || []).length === 0 && (task.groupIds || []).length === 0 && (
                                  <span className="text-[11px] text-[var(--text-light)]">All Members</span>
                                )}
                              </div>
                            </td>

                            <td className="py-2.5 px-3 text-center">
                              {!isBoard && isGeneral ? (
                                <button
                                  type="button"
                                  onClick={() => handleInlineTaskPatch(task, { toggleCompletedForSelf: true })}
                                  style={{ background: sMeta.bg, color: sMeta.color }}
                                  className="w-full min-h-[30px] px-2.5 rounded-lg text-[11px] font-bold border-none cursor-pointer inline-flex items-center justify-center gap-1"
                                >
                                  <CheckCircle2 size={12} />
                                  <span>{mySelfDone ? 'Done (You)' : 'Mark Done'}</span>
                                </button>
                              ) : (
                                <select
                                  disabled={!canMemberUpdateStatus}
                                  value={task.status || 'not_started'}
                                  onChange={e => handleInlineTaskPatch(task, { status: e.target.value })}
                                  style={{ background: sMeta.bg, color: sMeta.color }}
                                  className="w-full min-h-[30px] px-2 rounded-lg text-[11px] font-bold border-none text-center cursor-pointer disabled:opacity-60"
                                >
                                  {Object.entries(TASK_STATUS_META).map(([k, m]) => (
                                    <option key={k} value={k} className="bg-[var(--bg-card)] text-[var(--text)]">
                                      {m.label}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>

                            <td className="py-2.5 px-3 text-center">
                              {effectiveTier === 'board' && isBoard ? (
                                <select
                                  value={task.priority || 'medium'}
                                  onChange={e => handleInlineTaskPatch(task, { priority: e.target.value })}
                                  style={{ background: pMeta.bg, color: pMeta.color }}
                                  className="w-full min-h-[28px] px-2 rounded-lg text-[11px] font-bold border-none text-center cursor-pointer"
                                >
                                  {Object.entries(TASK_PRIORITY_META).map(([k, m]) => (
                                    <option key={k} value={k} className="bg-[var(--bg-card)] text-[var(--text)]">
                                      {m.label}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span
                                  style={{ background: pMeta.bg, color: pMeta.color }}
                                  className="inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold"
                                >
                                  {pMeta.label}
                                </span>
                              )}
                            </td>

                            <td className="py-2.5 px-3 text-center font-mono-num text-[11px] text-[var(--text-muted)]">
                              {task.dueDate ? (
                                <span className="inline-flex items-center gap-1">
                                  <Calendar size={11} />
                                  <span>{task.dueDate}</span>
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>

                            {effectiveTier === 'board' && isBoard && (
                              <td className="py-2.5 px-3 text-right">
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingTask(task)
                                      setModalOpen(true)
                                    }}
                                    aria-label="Edit task"
                                    className="w-7 h-7 rounded-lg bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--blue)] border border-[var(--border-subtle)] flex items-center justify-center cursor-pointer"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteTaskClick(task.id)}
                                    aria-label="Delete task"
                                    className="w-7 h-7 rounded-lg bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--red-ink)] border border-[var(--border-subtle)] flex items-center justify-center cursor-pointer"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </Card>
        )
      })}

      {modalOpen && isBoard && (
        <TaskModal
          clubName={selectedClub?.name || ''}
          sections={boardData?.sections || []}
          clubPeople={clubPeople}
          initialTask={editingTask}
          defaultSectionId={modalDefaultSectionId}
          busy={actionBusy}
          onClose={() => {
            setModalOpen(false)
            setEditingTask(null)
          }}
          onSubmit={handleModalSave}
        />
      )}
    </div>
  )
}
