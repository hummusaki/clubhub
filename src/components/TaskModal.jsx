import { useState, useMemo, useEffect } from 'react'
import {
  X,
  Check,
  CheckSquare,
  Calendar,
  Layers,
  Lock,
  Search,
  Shield,
  Users,
} from 'lucide-react'
import { Avatar, SectionHeader, cleanText } from './ui'
import LeadershipShortcutBar, { resolveDeduplicatedTargets } from './LeadershipShortcutBar'

export const TASK_STATUS_META = {
  not_started: {
    label: 'To Do',
    bg: 'var(--bg-subtle)',
    color: 'var(--text-muted)',
    dot: 'var(--text-light)',
  },
  working_on_it: {
    label: 'In Progress',
    bg: 'var(--yellow-light)',
    color: 'var(--yellow-ink)',
    dot: 'var(--yellow)',
  },
  in_review: {
    label: 'In Review',
    bg: 'var(--purple-light)',
    color: 'var(--purple-ink)',
    dot: 'var(--purple)',
  },
  stuck: {
    label: 'Blocked',
    bg: 'var(--red-light)',
    color: 'var(--red-ink)',
    dot: 'var(--red)',
  },
  done: {
    label: 'Done',
    bg: 'var(--green-light)',
    color: 'var(--green-ink)',
    dot: 'var(--green)',
  },
}

export const TASK_PRIORITY_META = {
  low: {
    label: 'Low',
    bg: 'var(--blue-light)',
    color: 'var(--blue-ink)',
    dot: 'var(--blue)',
  },
  medium: {
    label: 'Medium',
    bg: 'var(--teal-light)',
    color: 'var(--teal-ink)',
    dot: 'var(--teal)',
  },
  high: {
    label: 'High',
    bg: 'var(--yellow-light)',
    color: 'var(--yellow-ink)',
    dot: 'var(--yellow)',
  },
  critical: {
    label: 'Urgent',
    bg: 'var(--red-light)',
    color: 'var(--red-ink)',
    dot: 'var(--red)',
  },
}

export const SECTION_COLOR_META = {
  blue: 'var(--blue)',
  purple: 'var(--purple)',
  teal: 'var(--teal)',
  green: 'var(--green)',
  yellow: 'var(--yellow)',
  red: 'var(--red)',
}

export const SECTION_INK_META = {
  blue: 'var(--blue-ink)',
  purple: 'var(--purple-ink)',
  teal: 'var(--teal-ink)',
  green: 'var(--green-ink)',
  yellow: 'var(--yellow-ink)',
  red: 'var(--red-ink)',
}

export function getLocalYmd(dateObj = new Date()) {
  const y = dateObj.getFullYear()
  const m = String(dateObj.getMonth() + 1).padStart(2, '0')
  const d = String(dateObj.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDaysYmd(days) {
  const dt = new Date()
  dt.setDate(dt.getDate() + days)
  return getLocalYmd(dt)
}

export function formatSmartDueDate(ymd, isDone = false) {
  if (!ymd) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd).trim())
  if (!match) return { label: ymd, tone: 'neutral' }
  const target = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000)

  if (isDone) {
    return {
      label: target.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      tone: 'done',
    }
  }
  if (diffDays < 0) {
    const abs = Math.abs(diffDays)
    return {
      label: abs === 1 ? 'Yesterday · Overdue' : `${abs}d overdue`,
      tone: 'overdue',
    }
  }
  if (diffDays === 0) return { label: 'Due Today', tone: 'soon' }
  if (diffDays === 1) return { label: 'Tomorrow', tone: 'soon' }
  if (diffDays <= 6) {
    return {
      label: target.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      tone: 'upcoming',
    }
  }
  return {
    label: target.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    tone: 'neutral',
  }
}

export default function TaskModal({
  clubName = '',
  sections = [],
  personalSections = [],
  personalOnly = false,
  clubPeople = null,
  initialTask = null,
  defaultSectionId = '',
  busy = false,
  onClose,
  onSubmit,
}) {
  const isEditing = Boolean(initialTask?.id)
  const isEditingPersonal = Boolean(
    initialTask?.visibility === 'personal' || initialTask?.isPersonal
  )
  const lockToPersonal = personalOnly || isEditingPersonal

  const initialScope =
    lockToPersonal || String(defaultSectionId || '').startsWith('sec_personal_')
      ? 'personal'
      : initialTask?.visibility === 'board'
        ? 'board'
        : initialTask?.audience === 'targeted'
          ? 'targeted'
          : 'general'

  const [scopeMode, setScopeMode] = useState(initialScope)

  const [title, setTitle] = useState(initialTask?.title || '')
  const [notes, setNotes] = useState(initialTask?.notes || '')
  const [sectionId, setSectionId] = useState(() => {
    if (initialTask?.sectionId) return initialTask.sectionId
    if (defaultSectionId) return defaultSectionId
    if (initialScope === 'personal') return personalSections[0]?.id || ''
    return sections[0]?.id || personalSections[0]?.id || ''
  })
  const [status, setStatus] = useState(initialTask?.status || 'not_started')
  const [priority, setPriority] = useState(initialTask?.priority || 'medium')
  const [dueDate, setDueDate] = useState(initialTask?.dueDate || '')

  const [selectedShortcuts, setSelectedShortcuts] = useState([])
  const [selectedGroupIds, setSelectedGroupIds] = useState(() => initialTask?.groupIds || [])
  const [selectedAssignees, setSelectedAssignees] = useState(() => initialTask?.assignees || [])
  const [personQuery, setPersonQuery] = useState('')

  const groups = clubPeople?.groups || []
  const everyone = clubPeople?.everyone || []
  const isPersonalScope = lockToPersonal || scopeMode === 'personal'

  const filteredEveryone = useMemo(() => {
    const q = personQuery.trim().toLowerCase()
    if (!q) return everyone
    return everyone.filter(p =>
      `${p.name || ''} ${p.roleTitle || ''} ${p.email || ''}`.toLowerCase().includes(q)
    )
  }, [everyone, personQuery])

  const selectableSections = useMemo(() => {
    if (lockToPersonal || scopeMode === 'personal') return personalSections
    return [...sections, ...personalSections]
  }, [lockToPersonal, scopeMode, sections, personalSections])

  const quickDatePresets = useMemo(
    () => [
      { label: 'Today', value: getLocalYmd() },
      { label: 'Tomorrow', value: addDaysYmd(1) },
      { label: '+3 Days', value: addDaysYmd(3) },
      { label: 'Next Week', value: addDaysYmd(7) },
    ],
    []
  )

  function handleScopeModeSelect(nextMode) {
    setScopeMode(nextMode)
    if (nextMode === 'personal') {
      const hasPersonal = personalSections.some(s => s.id === sectionId)
      if (!hasPersonal && personalSections[0]?.id) {
        setSectionId(personalSections[0].id)
      }
      return
    }
    const isCurrPersonal = personalSections.some(s => s.id === sectionId)
    if (isCurrPersonal) {
      const fallbackSec =
        nextMode === 'board'
          ? sections.find(s => s.visibility === 'board') || sections[0]
          : sections.find(s => s.visibility !== 'board') || sections[0]
      if (fallbackSec?.id) setSectionId(fallbackSec.id)
    } else if (nextMode === 'board') {
      const boardSec = sections.find(s => s.visibility === 'board')
      if (boardSec?.id) setSectionId(boardSec.id)
    }
  }

  useEffect(() => {
    const handleKey = e => {
      if (e.key === 'Escape' && onClose) onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  function toggleShortcut(token) {
    setSelectedShortcuts(prev => {
      const exists = prev.includes(token)
      const next = exists ? prev.filter(t => t !== token) : [...prev, token]
      if (!exists && scopeMode === 'general' && token !== 'everyone' && token !== 'all_members') {
        setScopeMode('targeted')
      }
      if (!exists && (token === 'everyone' || token === 'all_members') && scopeMode !== 'board') {
        setScopeMode('general')
      }
      return next
    })
  }

  function toggleGroup(groupId) {
    setSelectedGroupIds(prev => {
      const exists = prev.includes(groupId)
      const next = exists ? prev.filter(id => id !== groupId) : [...prev, groupId]
      if (!exists && scopeMode === 'general') setScopeMode('targeted')
      return next
    })
  }

  function togglePerson(person) {
    const key = person.userId
      ? `uid:${person.userId}`
      : `name:${String(person.name || '').toLowerCase()}`
    setSelectedAssignees(prev => {
      const exists = prev.some(p =>
        person.userId ? p.userId === person.userId : p.name === person.name
      )
      const next = exists
        ? prev.filter(p => (person.userId ? p.userId !== person.userId : p.name !== person.name))
        : [
            ...prev,
            {
              memberKey: person.memberKey || key,
              userId: person.userId || null,
              name: person.name,
              initials: person.initials || '',
              email: person.email || '',
              roleTitle: person.roleTitle || person.role || 'Member',
              tier: person.tier || 'member',
            },
          ]
      if (!exists && scopeMode === 'general') setScopeMode('targeted')
      return next
    })
  }

  const previewResolvedAssignees = useMemo(
    () => resolveDeduplicatedTargets(clubPeople, selectedShortcuts, selectedAssignees),
    [clubPeople, selectedShortcuts, selectedAssignees]
  )

  function handleFormSubmit(e) {
    e.preventDefault()
    if (!title.trim() || busy) return

    if (isPersonalScope) {
      const resolvedPersonalSec =
        personalSections.find(s => s.id === sectionId) || personalSections[0] || null
      onSubmit({
        title: title.trim(),
        notes: notes.trim(),
        sectionId: resolvedPersonalSec?.id || sectionId || '',
        sectionTitle: resolvedPersonalSec?.title || 'My To-Do List',
        sectionColor: resolvedPersonalSec?.color || 'green',
        status,
        priority,
        dueDate,
        visibility: 'personal',
        audience: 'personal',
        isPersonal: true,
        assignees: [],
        groupIds: [],
        shortcutTargets: [],
      })
      return
    }

    const visibility = scopeMode === 'board' ? 'board' : 'members'
    const audience =
      scopeMode === 'board' ? 'board' : scopeMode === 'targeted' ? 'targeted' : 'general'

    onSubmit({
      title: title.trim(),
      notes: notes.trim(),
      sectionId,
      status,
      priority,
      dueDate,
      visibility,
      audience,
      assignees: selectedAssignees,
      groupIds: selectedGroupIds,
      shortcutTargets: selectedShortcuts,
    })
  }

  const scopeOptions = [
    {
      id: 'general',
      title: 'Everyone in Club',
      desc: 'Shared checklist for all members',
      icon: Users,
    },
    {
      id: 'targeted',
      title: 'Specific People / Groups',
      desc: 'Only selected owners & sub-groups',
      icon: Layers,
    },
    {
      id: 'board',
      title: 'Board Officers Only',
      desc: 'Private to club leadership',
      icon: Shield,
    },
    {
      id: 'personal',
      title: 'Just Me (Personal)',
      desc: 'Private to-do on this server',
      icon: Lock,
    },
  ]

  return (
    <div
      className="fixed inset-0 z-[110] modal-backdrop flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={
          isPersonalScope
            ? isEditing
              ? 'Edit Personal To-Do'
              : 'Add Personal To-Do'
            : isEditing
              ? 'Edit Club Task'
              : 'Create Club Task'
        }
        className="modal-panel w-full max-w-2xl p-5 sm:p-6 space-y-4 max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] overflow-y-auto fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="pb-3.5 border-b border-[var(--border)]">
          <SectionHeader
            icon={isPersonalScope ? <Lock size={17} /> : <CheckSquare size={18} />}
            color={isPersonalScope ? 'green' : 'blue'}
            title={
              isPersonalScope
                ? isEditing
                  ? 'Edit Personal To-Do'
                  : 'New Personal To-Do'
                : isEditing
                  ? 'Edit Club Task'
                  : 'New Club Task'
            }
            subtitle={
              isPersonalScope
                ? `${cleanText(clubName)} · Visible only to you on this server`
                : `${cleanText(clubName)} · Share with all members, sub-groups, or board officers`
            }
            action={
              <button
                type="button"
                onClick={onClose}
                aria-label="Close modal"
                className="w-9 h-9 rounded-xl bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] flex items-center justify-center cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            }
          />
        </div>

        <form onSubmit={handleFormSubmit} className="space-y-4">
          {/* 1. Task Title */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              What needs to be done?
            </label>
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={
                isPersonalScope
                  ? 'e.g. Finish my slide deck before Thursday meeting'
                  : 'e.g. Finalize Spring Showcase flyer & room reservation'
              }
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm font-medium text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
            />
          </div>

          {/* 2. Audience / Scope (only shown when user has Board permissions and isn't locked to personal) */}
          {lockToPersonal ? (
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[var(--green-light)] border border-[var(--green)]/30 text-xs font-medium text-[var(--green-ink)]">
              <Lock size={13} className="shrink-0" />
              <span>
                Private to you in <strong>{cleanText(clubName || 'this server')}</strong> — hidden from other members and officers.
              </span>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Who is this task for?
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {scopeOptions.map(opt => {
                  const IconComp = opt.icon
                  const active = scopeMode === opt.id
                  const isPersonalOpt = opt.id === 'personal'
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleScopeModeSelect(opt.id)}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                        active
                          ? isPersonalOpt
                            ? 'bg-[var(--green-light)] border-[var(--green)] text-[var(--green-ink)] shadow-2xs'
                            : 'bg-[var(--blue-light)] border-[var(--blue)] text-[var(--blue-ink)] shadow-2xs'
                          : 'content-tile text-[var(--text)] hover:border-[var(--blue)]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-bold">
                        <IconComp size={13} />
                        <span>{opt.title}</span>
                      </div>
                      <div className="text-[11px] opacity-80 mt-0.5">{opt.desc}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 3. List / Section + Smart Due Date Picker */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                {isPersonalScope ? 'Personal List' : 'Board Section'}
              </label>
              <select
                value={sectionId}
                onChange={e => {
                  const sid = e.target.value
                  setSectionId(sid)
                  const pSec = personalSections.find(s => s.id === sid)
                  if (pSec) {
                    setScopeMode('personal')
                    return
                  }
                  const sec = sections.find(s => s.id === sid)
                  if (sec?.visibility === 'board') setScopeMode('board')
                  else if (scopeMode === 'personal') setScopeMode('general')
                }}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              >
                {selectableSections.map(s => (
                  <option key={s.id} value={s.id}>
                    {cleanText(s.title)}{' '}
                    {s.visibility === 'personal'
                      ? '(Only You)'
                      : s.visibility === 'board'
                        ? '(Board Only)'
                        : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="text-xs font-semibold text-[var(--text-muted)]">
                  Due Date <span className="font-normal text-[var(--text-light)]">(Optional)</span>
                </label>
                {dueDate && (
                  <button
                    type="button"
                    onClick={() => setDueDate('')}
                    className="text-[11px] font-semibold text-[var(--text-light)] hover:text-[var(--red-ink)] bg-transparent border-none cursor-pointer"
                  >
                    Clear date
                  </button>
                )}
              </div>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              />
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {quickDatePresets.map(preset => {
                  const active = dueDate === preset.value
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setDueDate(active ? '' : preset.value)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border cursor-pointer transition-colors ${
                        active
                          ? 'bg-[var(--blue-light)] border-[var(--blue)] text-[var(--blue-ink)]'
                          : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      <Calendar size={10} />
                      <span>{preset.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* 4. Visual Clickable Priority & Status Pills */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Priority
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {Object.entries(TASK_PRIORITY_META).map(([k, meta]) => {
                  const active = priority === k
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setPriority(k)}
                      style={
                        active
                          ? {
                              background: meta.bg,
                              color: meta.color,
                              borderColor: meta.dot,
                            }
                          : undefined
                      }
                      className={`min-h-[38px] px-2 rounded-xl text-xs font-bold border cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                        active
                          ? 'shadow-2xs'
                          : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: meta.dot }}
                      />
                      <span>{meta.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Status
              </label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(TASK_STATUS_META).map(([k, meta]) => {
                  const active = status === k
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setStatus(k)}
                      style={
                        active
                          ? {
                              background: meta.bg,
                              color: meta.color,
                              borderColor: meta.dot,
                            }
                          : undefined
                      }
                      className={`min-h-[38px] px-2.5 rounded-xl text-xs font-bold border cursor-pointer transition-all inline-flex items-center gap-1.5 ${
                        active
                          ? 'shadow-2xs'
                          : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: meta.dot }}
                      />
                      <span>{meta.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* 5. One-Click Leadership Shortcuts & Assignee Pickers (for Shared Club Tasks) */}
          {!isPersonalScope && clubPeople?.permission?.isBoard && (
            <LeadershipShortcutBar
              clubPeople={clubPeople}
              selectedShortcuts={selectedShortcuts}
              onToggleShortcut={toggleShortcut}
              label="Quick Assign Shortcuts"
              compact
            />
          )}

          {!isPersonalScope && (groups.length > 0 || everyone.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {groups.length > 0 && (
                <div className="content-tile p-3.5 rounded-xl space-y-2.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Sub-Groups ({selectedGroupIds.length} selected)
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-[148px] overflow-y-auto">
                    {groups.map(g => {
                      const active = selectedGroupIds.includes(g.id)
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => toggleGroup(g.id)}
                          className={`inline-flex items-center gap-1.5 px-2.5 min-h-[32px] rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                            active
                              ? 'bg-[var(--teal)] text-white border-[var(--teal)]'
                              : 'bg-[var(--bg-surface)] text-[var(--text)] border-[var(--border)] hover:border-[var(--teal)]'
                          }`}
                        >
                          {active ? <Check size={11} /> : <Layers size={11} />}
                          <span>{cleanText(g.name)}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {everyone.length > 0 && (
                <div className="content-tile p-3.5 rounded-xl space-y-2.5 sm:col-span-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      People ({previewResolvedAssignees.length} assigned)
                    </div>
                  </div>
                  {everyone.length > 5 && (
                    <div className="relative">
                      <Search
                        size={12}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-light)] pointer-events-none"
                      />
                      <input
                        type="text"
                        value={personQuery}
                        onChange={e => setPersonQuery(e.target.value)}
                        placeholder="Search members…"
                        className="w-full min-h-[32px] pl-7 pr-2.5 rounded-lg bg-[var(--bg-surface)] text-xs text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                      />
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                    {filteredEveryone.map(person => {
                      const checked = selectedAssignees.some(a =>
                        person.userId ? a.userId === person.userId : a.name === person.name
                      )
                      return (
                        <button
                          key={person.memberKey || person.userId || person.name}
                          type="button"
                          onClick={() => togglePerson(person)}
                          className={`flex items-center justify-between gap-2 px-2.5 min-h-[36px] py-1.5 rounded-lg text-xs border cursor-pointer text-left transition-colors ${
                            checked
                              ? 'bg-[var(--blue-light)] border-[var(--blue)] text-[var(--blue-ink)] font-semibold'
                              : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text)] hover:border-[var(--blue)]'
                          }`}
                        >
                          <span className="flex items-center gap-2 min-w-0 truncate">
                            <Avatar initials={person.initials || 'MB'} size={20} />
                            <span className="truncate">{cleanText(person.name)}</span>
                          </span>
                          <span className="text-[10.5px] opacity-75 shrink-0">
                            {checked ? 'Assigned ✓' : cleanText(person.roleTitle || 'Member')}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 6. Notes */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              Notes or Links <span className="font-normal text-[var(--text-light)]">(Optional)</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add helpful links, checklist details, or context…"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)] resize-y"
            />
          </div>

          <div className="flex flex-col-reverse xs:flex-row items-stretch xs:items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 min-h-[42px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-sm font-semibold text-[var(--text)] border border-[var(--border)] cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !title.trim()}
              className="px-5 min-h-[42px] rounded-xl bg-[var(--blue)] text-white text-sm font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {busy
                ? 'Saving…'
                : isEditing
                  ? isPersonalScope
                    ? 'Save Changes'
                    : 'Save Task'
                  : isPersonalScope
                    ? 'Add To-Do'
                    : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
