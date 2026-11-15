import { useState, useMemo } from 'react'
import { X, Check, Calendar, Layers, Shield, Users } from 'lucide-react'
import { Avatar, cleanText } from './ui'
import LeadershipShortcutBar, { resolveDeduplicatedTargets } from './LeadershipShortcutBar'

export const TASK_STATUS_META = {
  not_started: {
    label: 'Not Started',
    bg: 'var(--bg-subtle)',
    color: 'var(--text-muted)',
    dot: '#94a3b8',
  },
  working_on_it: {
    label: 'Working on it',
    bg: '#f59e0b',
    color: '#ffffff',
    dot: '#f59e0b',
  },
  in_review: {
    label: 'In Review',
    bg: '#8b5cf6',
    color: '#ffffff',
    dot: '#8b5cf6',
  },
  stuck: {
    label: 'Stuck',
    bg: '#ef4444',
    color: '#ffffff',
    dot: '#ef4444',
  },
  done: {
    label: 'Done',
    bg: '#10b981',
    color: '#ffffff',
    dot: '#10b981',
  },
}

export const TASK_PRIORITY_META = {
  low: {
    label: 'Low',
    bg: 'var(--blue-light)',
    color: 'var(--blue-ink)',
  },
  medium: {
    label: 'Medium',
    bg: 'var(--teal-light, rgba(20,184,166,0.14))',
    color: 'var(--teal)',
  },
  high: {
    label: 'High',
    bg: 'var(--yellow-light)',
    color: 'var(--yellow-ink)',
  },
  critical: {
    label: 'Critical ⚠',
    bg: 'var(--red-light)',
    color: 'var(--red-ink)',
  },
}

export const SECTION_COLOR_META = {
  blue: '#3b82f6',
  purple: '#8b5cf6',
  teal: '#14b8a6',
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#ef4444',
}

export default function TaskModal({
  clubName = '',
  sections = [],
  clubPeople = null,
  initialTask = null,
  defaultSectionId = '',
  busy = false,
  onClose,
  onSubmit,
}) {
  const isEditing = Boolean(initialTask?.id)

  const [title, setTitle] = useState(initialTask?.title || '')
  const [notes, setNotes] = useState(initialTask?.notes || '')
  const [sectionId, setSectionId] = useState(
    initialTask?.sectionId || defaultSectionId || sections[0]?.id || ''
  )
  const [status, setStatus] = useState(initialTask?.status || 'not_started')
  const [priority, setPriority] = useState(initialTask?.priority || 'medium')
  const [dueDate, setDueDate] = useState(initialTask?.dueDate || '')

  const initialScope =
    initialTask?.visibility === 'board'
      ? 'board'
      : initialTask?.audience === 'targeted'
        ? 'targeted'
        : 'general'
  const [scopeMode, setScopeMode] = useState(initialScope)

  const [selectedShortcuts, setSelectedShortcuts] = useState([])
  const [selectedGroupIds, setSelectedGroupIds] = useState(() => initialTask?.groupIds || [])
  const [selectedAssignees, setSelectedAssignees] = useState(() => initialTask?.assignees || [])

  const groups = clubPeople?.groups || []
  const everyone = clubPeople?.everyone || []

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

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] shadow-xl p-5 sm:p-6 space-y-4 my-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[var(--border)]">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[var(--text)]">
              {isEditing ? 'Edit Club Task' : 'Create Club Task'}
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {cleanText(clubName)} · Assign to the general club, specific sub-groups, or individuals
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-xl bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] flex items-center justify-center cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              Task Item Name
            </label>
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Finalize Spring Showcase flyer & room reservation"
              className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Group Section
              </label>
              <select
                value={sectionId}
                onChange={e => {
                  const sid = e.target.value
                  setSectionId(sid)
                  const sec = sections.find(s => s.id === sid)
                  if (sec?.visibility === 'board') setScopeMode('board')
                }}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--bg-surface)] text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              >
                {sections.map(s => (
                  <option key={s.id} value={s.id}>
                    {cleanText(s.title)} {s.visibility === 'board' ? '(Board Only)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Due Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--bg-surface)] text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Status Pill
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--bg-surface)] text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              >
                {Object.entries(TASK_STATUS_META).map(([k, meta]) => (
                  <option key={k} value={k}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Priority Tag
              </label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--bg-surface)] text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              >
                {Object.entries(TASK_PRIORITY_META).map(([k, meta]) => (
                  <option key={k} value={k}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Visibility & Audience Tier */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              Visibility & Assignment Tier
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                {
                  id: 'general',
                  title: 'General Club',
                  desc: 'Visible to all club members',
                  icon: Users,
                },
                {
                  id: 'targeted',
                  title: 'Assigned / Groups',
                  desc: 'Only assignees & sub-groups',
                  icon: Layers,
                },
                {
                  id: 'board',
                  title: 'Board Internal',
                  desc: 'Strictly Board / Leadership',
                  icon: Shield,
                },
              ].map(opt => {
                const IconComp = opt.icon
                const active = scopeMode === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setScopeMode(opt.id)}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      active
                        ? 'bg-[var(--blue-light)] border-[var(--blue)] text-[var(--blue-ink)]'
                        : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text)] hover:border-[var(--blue)]'
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

          {/* One-Click Leadership Shortcuts */}
          {clubPeople?.permission?.isBoard && (
            <LeadershipShortcutBar
              clubPeople={clubPeople}
              selectedShortcuts={selectedShortcuts}
              onToggleShortcut={toggleShortcut}
              label="One-Click Assignment Shortcuts"
              compact
            />
          )}

          {/* Sub-Group & Individual Assignee Pickers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {groups.length > 0 && (
              <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Assign Sub-Groups ({selectedGroupIds.length})
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-[116px] overflow-y-auto">
                  {groups.map(g => {
                    const active = selectedGroupIds.includes(g.id)
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => toggleGroup(g.id)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                          active
                            ? 'bg-[var(--teal)] text-white border-[var(--teal)]'
                            : 'bg-[var(--bg-card)] text-[var(--text)] border-[var(--border)]'
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
              <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] space-y-2 sm:col-span-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Individual Owners ({previewResolvedAssignees.length} resolved)
                </div>
                <div className="flex flex-col gap-1 max-h-[116px] overflow-y-auto pr-1">
                  {everyone.map(person => {
                    const checked = selectedAssignees.some(a =>
                      person.userId ? a.userId === person.userId : a.name === person.name
                    )
                    return (
                      <button
                        key={person.memberKey || person.userId || person.name}
                        type="button"
                        onClick={() => togglePerson(person)}
                        className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs border cursor-pointer text-left ${
                          checked
                            ? 'bg-[var(--blue-light)] border-[var(--blue)] text-[var(--blue-ink)] font-semibold'
                            : 'bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text)]'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0 truncate">
                          <Avatar initials={person.initials || 'MB'} size={18} />
                          <span className="truncate">{cleanText(person.name)}</span>
                        </span>
                        <span className="text-[10.5px] opacity-75 shrink-0">
                          {cleanText(person.roleTitle || 'Member')}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              Notes / Deliverables (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add links, acceptance criteria, or context…"
              className="w-full px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-xs sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)] resize-y"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 min-h-[38px] rounded-xl bg-[var(--bg-surface)] text-xs sm:text-sm font-semibold text-[var(--text)] border border-[var(--border)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !title.trim()}
              className="px-5 min-h-[38px] rounded-xl bg-[var(--blue)] text-white text-xs sm:text-sm font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Saving…' : isEditing ? 'Save Task' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
