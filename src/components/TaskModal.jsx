import Select from './Select'
import { useState, useMemo } from 'react'
import {
  Check,
  CheckSquare,
  Calendar,
  Bell,
  BellOff,
  Send,
  Layers,
  Lock,
  Search,
  Shield,
  Users,
} from 'lucide-react'
import { Avatar, ModalDialog, cleanText, Button, FilterChip } from './ui'
import LeadershipShortcutBar, { resolveDeduplicatedTargets } from './LeadershipShortcutBar'
import { DateInputField, TimePickerSelect } from './TimePickerSelect'
import {
  getLocalYmd,
  addDaysYmd,
  normalizeTime24h,
  formatClockTime,
  formatSmartDueDate,
  isTaskOverdue,
  REMINDER_OFFSET_OPTIONS,
  buildClientReminderPayload,
  computeTaskDueDateObj,
} from '../utils/taskReminders'
import { isValidDiscordWebhookUrl } from '../utils/directIntegrations'

export { getLocalYmd, addDaysYmd, formatClockTime, formatSmartDueDate, isTaskOverdue }

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

export default function TaskModal({
  clubName = '',
  sections = [],
  personalSections = [],
  personalOnly = false,
  clubOnly = false,
  clubPeople = null,
  initialTask = null,
  defaultSectionId = '',
  reminderDefaults = null,
  integrationSummary = null,
  accountEmail = '',
  timeFormat = '12h',
  busy = false,
  saveBlocked = false,
  sendingReminder = false,
  onSaveIntegrationChannelPrefs,
  onSendReminderNow,
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
    return sections[0]?.id || ''
  })
  const [status, setStatus] = useState(initialTask?.status || 'not_started')
  const [priority, setPriority] = useState(initialTask?.priority || 'medium')
  const [dueDate, setDueDate] = useState(initialTask?.dueDate || '')
  const [dueTime, setDueTime] = useState(() => normalizeTime24h(initialTask?.dueTime || ''))

  // Optional Reminder state ("if needed")
  const [reminderEnabled, setReminderEnabled] = useState(() => {
    if (initialTask?.reminder?.enabled !== undefined) {
      return Boolean(initialTask.reminder.enabled)
    }
    return Boolean(reminderDefaults?.autoRemindTimedTasks && initialTask?.dueDate)
  })
  const [reminderOffset, setReminderOffset] = useState(() => {
    if (initialTask?.reminder?.offsetMinutes !== undefined) {
      return Number(initialTask.reminder.offsetMinutes)
    }
    return Number(reminderDefaults?.defaultOffsetMinutes ?? 60)
  })
  const [reminderChannels, setReminderChannels] = useState(() => {
    if (
      Array.isArray(initialTask?.reminder?.channels) &&
      initialTask.reminder.channels.length > 0
    ) {
      return initialTask.reminder.channels
    }
    return Array.isArray(reminderDefaults?.defaultChannels) &&
      reminderDefaults.defaultChannels.length > 0
      ? reminderDefaults.defaultChannels
      : ['discord', 'email']
  })
  const [customEmail, setCustomEmail] = useState(
    () =>
      initialTask?.reminder?.recipientEmail ||
      integrationSummary?.recipientEmail ||
      accountEmail ||
      ''
  )
  const [customWebhook, setCustomWebhook] = useState('')
  const [showChannelInputs, setShowChannelInputs] = useState(false)

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
    if (clubOnly) return sections
    return [...sections, ...personalSections]
  }, [lockToPersonal, clubOnly, scopeMode, sections, personalSections])

  const reminderFirePreview = useMemo(() => {
    if (!dueDate || !reminderEnabled) return ''
    const baseDt = computeTaskDueDateObj(dueDate, dueTime, 9)
    if (!baseDt || Number.isNaN(baseDt.getTime())) return ''
    const fireDt = new Date(baseDt.getTime() - Number(reminderOffset || 0) * 60_000)
    return fireDt.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: timeFormat !== '24h',
    })
  }, [dueDate, dueTime, reminderEnabled, reminderOffset, timeFormat])

  const discordReady = Boolean(
    integrationSummary?.discordReady || isValidDiscordWebhookUrl(customWebhook)
  )
  const emailReady = Boolean(
    integrationSummary?.emailReady || String(customEmail || accountEmail || '').includes('@')
  )

  function applyDueDateAndTime(nextDate, nextTime = dueTime) {
    const cleanTime = nextDate ? normalizeTime24h(nextTime) : ''
    setDueDate(nextDate)
    setDueTime(cleanTime)
    if (!nextDate) {
      setReminderEnabled(false)
    } else if (!dueDate && reminderDefaults?.autoRemindTimedTasks && cleanTime) {
      setReminderEnabled(true)
    }
  }

  function handleDueTimeChange(rawTime) {
    const cleanTime = normalizeTime24h(rawTime)
    if (!cleanTime) {
      setDueTime('')
      return
    }
    // Never fail if the user picks a time before picking a date — default Date to Today
    const effectiveDate = dueDate || getLocalYmd()
    if (!dueDate) setDueDate(effectiveDate)
    setDueTime(cleanTime)
    if (reminderDefaults?.autoRemindTimedTasks && !reminderEnabled) {
      setReminderEnabled(true)
    }
  }

  function handleToggleReminderSwitch() {
    if (reminderEnabled) {
      setReminderEnabled(false)
      return
    }
    if (!dueDate) {
      setDueDate(getLocalYmd())
      if (!dueTime) setDueTime('17:00')
    }
    setReminderEnabled(true)
  }

  function toggleReminderChannel(ch) {
    setReminderChannels(prev => {
      const exists = prev.includes(ch)
      if (exists && prev.length === 1) return prev
      return exists ? prev.filter(x => x !== ch) : [...prev, ch]
    })
  }

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
    if (!title.trim() || busy || saveBlocked) return

    const cleanWebhook = isValidDiscordWebhookUrl(customWebhook) ? customWebhook.trim() : ''
    const cleanEmail = String(customEmail || '').trim()

    if (onSaveIntegrationChannelPrefs && (cleanWebhook || cleanEmail)) {
      onSaveIntegrationChannelPrefs({
        ...(cleanWebhook ? { discordWebhookUrl: cleanWebhook } : {}),
        ...(cleanEmail ? { recipientEmail: cleanEmail } : {}),
      })
    }

    const reminderPayload = buildClientReminderPayload({
      enabled: Boolean(reminderEnabled && dueDate),
      dueDate,
      dueTime,
      offsetMinutes: reminderOffset,
      channels: reminderChannels,
      recipientEmail: cleanEmail,
      discordWebhookUrl: cleanWebhook,
    })

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
        dueTime: dueDate ? dueTime : '',
        reminder: reminderPayload,
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
      dueTime: dueDate ? dueTime : '',
      reminder: reminderPayload,
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

  const todayStr = getLocalYmd()
  const tomorrowStr = addDaysYmd(1)
  const nextWeekStr = addDaysYmd(7)

  const dialogTitle = isPersonalScope
    ? (isEditing ? 'Edit personal task' : 'Add personal task')
    : (isEditing ? 'Edit club task' : 'Create club task')

  return (
    <ModalDialog
      title={dialogTitle}
      onClose={onClose}
      subtitle={isPersonalScope
        ? `${cleanText(clubName)} · Visible only to you`
        : `${cleanText(clubName)} · Choose who can see the task`}
      icon={isPersonalScope ? <Lock size={17} /> : <CheckSquare size={18} />}
      iconColor={isPersonalScope ? 'green' : 'blue'}
      maxWidth="max-w-2xl"
    >
        <form onSubmit={handleFormSubmit} className="dense-controls space-y-3">
          {/* 1. Task Title */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              What needs to be done?
            </label>
            <input
              type="text"
              required
              data-initial-focus
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
                {scopeOptions.filter(opt => !clubOnly || opt.id !== 'personal').map(opt => {
                  const IconComp = opt.icon
                  const active = scopeMode === opt.id
                  const isPersonalOpt = opt.id === 'personal'
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={active}
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

          {/* 3. Clean Labeled Dropdowns: List, Priority & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                {isPersonalScope ? 'Personal List' : 'Board Section'}
              </label>
              <Select
                aria-label="Task list or section"
                value={sectionId}
                onValueChange={nextValue => {
                  const sid = nextValue
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
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm font-medium text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)] cursor-pointer"
                search="auto"
                options={selectableSections.map(s => ({
                  value: s.id,
                  label: `${cleanText(s.title)}${s.visibility === 'personal' ? ' (Only You)' : s.visibility === 'board' ? ' (Board Only)' : ''}`,
                }))}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Priority
              </label>
              <Select
                value={priority}
                onValueChange={setPriority}
                aria-label="Task priority"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm font-medium text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)] cursor-pointer"
                options={Object.entries(TASK_PRIORITY_META).map(([k, meta]) => ({ value: k, label: meta.label }))}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Status
              </label>
              <Select
                value={status}
                onValueChange={setStatus}
                aria-label="Task status"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm font-medium text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)] cursor-pointer"
                options={Object.entries(TASK_STATUS_META).map(([k, meta]) => ({ value: k, label: meta.label }))}
              />
            </div>
          </div>

          {/* 4. Clean Due Date, Working Time Selector & Optional Reminder Card */}
          <div className="content-tile p-4 rounded-2xl space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text)]">
                <Calendar size={14} className="text-[var(--blue)]" />
                <span>Due Date &amp; Time</span>
                <span className="font-normal text-[var(--text-light)]">(Optional)</span>
              </div>

              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-[var(--text-light)] hidden xs:inline">Quick set:</span>
                <button
                  type="button"
                  onClick={() => applyDueDateAndTime(todayStr, dueTime)}
                  className={`font-semibold bg-transparent border-none cursor-pointer hover:underline ${
                    dueDate === todayStr ? 'text-[var(--blue-ink)] underline' : 'text-[var(--text-muted)]'
                  }`}
                >
                  Today
                </button>
                <span className="text-[var(--border-strong)]">·</span>
                <button
                  type="button"
                  onClick={() => applyDueDateAndTime(tomorrowStr, dueTime)}
                  className={`font-semibold bg-transparent border-none cursor-pointer hover:underline ${
                    dueDate === tomorrowStr ? 'text-[var(--blue-ink)] underline' : 'text-[var(--text-muted)]'
                  }`}
                >
                  Tomorrow
                </button>
                <span className="text-[var(--border-strong)]">·</span>
                <button
                  type="button"
                  onClick={() => applyDueDateAndTime(nextWeekStr, dueTime)}
                  className={`font-semibold bg-transparent border-none cursor-pointer hover:underline ${
                    dueDate === nextWeekStr ? 'text-[var(--blue-ink)] underline' : 'text-[var(--text-muted)]'
                  }`}
                >
                  Next week
                </button>
                {(dueDate || dueTime) && (
                  <>
                    <span className="text-[var(--border-strong)]">·</span>
                    <button
                      type="button"
                      onClick={() => applyDueDateAndTime('', '')}
                      className="font-semibold text-[var(--red-ink)] bg-transparent border-none cursor-pointer hover:underline"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Side-by-Side Date Input & 1-Click Time Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  Date
                </label>
                <DateInputField
                  value={dueDate}
                  onChange={nextDate => applyDueDateAndTime(nextDate, dueTime)}
                  ariaLabel="Due date"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  Time
                </label>
                <TimePickerSelect
                  value={dueTime}
                  onChange={handleDueTimeChange}
                  timeFormat={timeFormat}
                  placeholder="All day (no time)"
                  ariaLabel="Due time"
                />
              </div>
            </div>

            {/* Optional Discord & Email Reminder Switch */}
            <div className="pt-3 border-t border-[var(--border-subtle)] space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {reminderEnabled && dueDate ? (
                    <Bell size={15} className="text-[var(--blue)] shrink-0" />
                  ) : (
                    <BellOff size={15} className="text-[var(--text-light)] shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[var(--text)]">
                      Reminder Notification
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {reminderEnabled && dueDate
                        ? reminderFirePreview
                          ? `Scheduled for ${reminderFirePreview}`
                          : 'Active before due time'
                        : 'Get notified on Discord or Email before this task is due'}
                    </div>
                  </div>
                </div>

                {/* Standard Accessible Toggle Switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(reminderEnabled && dueDate)}
                  aria-label="Toggle reminder notification"
                  onClick={handleToggleReminderSwitch}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-none cursor-pointer transition-colors ${
                    reminderEnabled && dueDate ? 'bg-[var(--blue)]' : 'bg-[var(--bg-subtle)]'
                  }`}
                >
                  <span
                    className={`inline-block h-4.5 w-4.5 rounded-full bg-[var(--switch-thumb)] shadow-xs transition-transform ${
                      reminderEnabled && dueDate ? 'translate-x-5.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {reminderEnabled && dueDate && (
                <div className="space-y-3 pt-1 fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                        When to remind
                      </label>
                      <Select
                        value={reminderOffset}
                        onValueChange={nextValue => setReminderOffset(Number(nextValue))}
                        aria-label="Reminder timing"
                        className="w-full min-h-[38px] px-3 rounded-xl bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)] cursor-pointer"
                        options={REMINDER_OFFSET_OPTIONS.map(opt => ({ value: opt.value, label: opt.label }))}
                      />
                    </div>

                    <div>
                      <span className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                        Notify via
                      </span>
                      <div className="min-h-[38px] px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] flex flex-wrap items-center gap-3.5">
                        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text)] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={reminderChannels.includes('discord')}
                            onChange={() => toggleReminderChannel('discord')}
                            className="rounded accent-[var(--blue)]"
                          />
                          <span>Discord</span>
                        </label>
                        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text)] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={reminderChannels.includes('email')}
                            onChange={() => toggleReminderChannel('email')}
                            className="rounded accent-[var(--blue)]"
                          />
                          <span>Email</span>
                        </label>
                        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text)] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={reminderChannels.includes('browser')}
                            onChange={() => toggleReminderChannel('browser')}
                            className="rounded accent-[var(--blue)]"
                          />
                          <span>In-App</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Destination summary + optional inline webhook/email setup + optional Send Now */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setShowChannelInputs(v => !v)}
                      className="font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer p-0"
                    >
                      {showChannelInputs
                        ? 'Hide Discord / Email destination fields'
                        : discordReady || emailReady
                          ? 'Edit Discord webhook or email address'
                          : 'Set Discord webhook or email address'}
                    </button>

                    {isEditing && onSendReminderNow && initialTask?.id && (
                      <Button
                        type="button"
                        disabled={busy}
                        variant="outlined-neutral"
                        size="sm"
                        icon={<Send size={11} />}
                        pending={sendingReminder}
                        pendingLabel="Sending…"
                        onClick={() =>
                          onSendReminderNow({
                            ...initialTask,
                            title: title.trim() || initialTask.title,
                            notes: notes.trim(),
                            dueDate,
                            dueTime,
                            priority,
                            reminder: {
                              ...(initialTask.reminder || {}),
                              enabled: true,
                              offsetMinutes: reminderOffset,
                              channels: reminderChannels,
                            },
                          })
                        }
                      >
                        Send reminder now
                      </Button>
                    )}
                  </div>

                  {(showChannelInputs ||
                    (reminderChannels.includes('discord') && !discordReady) ||
                    (reminderChannels.includes('email') && !emailReady)) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5 fade-in">
                      {reminderChannels.includes('discord') && (
                        <div>
                          <label className="block text-[10.5px] font-semibold text-[var(--text-muted)] mb-1">
                            Discord Webhook URL{' '}
                            {integrationSummary?.discordReady ? '(Connected ✓)' : ''}
                          </label>
                          <input
                            type="url"
                            value={customWebhook}
                            onChange={e => setCustomWebhook(e.target.value)}
                            placeholder={
                              integrationSummary?.discordReady
                                ? 'Using saved Discord webhook'
                                : 'https://discord.com/api/webhooks/...'
                            }
                            className="w-full min-h-[36px] px-2.5 rounded-lg bg-[var(--bg-surface)] text-xs text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--md-primary)]"
                          />
                        </div>
                      )}
                      {reminderChannels.includes('email') && (
                        <div>
                          <label className="block text-[10.5px] font-semibold text-[var(--text-muted)] mb-1">
                            Reminder Email
                          </label>
                          <input
                            type="email"
                            value={customEmail}
                            onChange={e => setCustomEmail(e.target.value)}
                            placeholder="you@ucsc.edu"
                            className="w-full min-h-[36px] px-2.5 rounded-lg bg-[var(--bg-surface)] text-xs text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 5. Leadership Shortcuts & Assignee Pickers (for Shared Club Tasks) */}
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
                  <div className="text-xs font-medium text-[var(--text-muted)]">
                    Sub-Groups ({selectedGroupIds.length} selected)
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-[148px] overflow-y-auto">
                    {groups.map(g => {
                      const active = selectedGroupIds.includes(g.id)
                      return (
                        <FilterChip
                          key={g.id}
                          selected={active}
                          onClick={() => toggleGroup(g.id)}
                          leadingIcon={<Layers size={11} />}
                          label={cleanText(g.name)}
                        />
                      )
                    })}
                  </div>
                </div>
              )}

              {everyone.length > 0 && (
                <div className="content-tile p-3.5 rounded-xl space-y-2.5 sm:col-span-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium text-[var(--text-muted)]">
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
            <Button
              variant="text"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              variant="filled"
              type="submit"
              disabled={saveBlocked || !title.trim()}
              pending={busy}
              pendingLabel="Saving…"
            >
              {isEditing
                ? (isPersonalScope ? 'Save Changes' : 'Save Task')
                : (isPersonalScope ? 'Add personal task' : 'Create club task')}
            </Button>
          </div>
        </form>
    </ModalDialog>
  )
}
