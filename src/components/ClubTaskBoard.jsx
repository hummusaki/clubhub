import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Plus,
  Check,
  Shield,
  Users,
  Layers,
  Calendar,
  Clock,
  Bell,
  BellRing,
  Send,
  ExternalLink,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Search,
  SlidersHorizontal,
  Lock,
  UserPlus,
  FolderPlus,
  Compass,
  X,
  Loader2,
} from 'lucide-react'
import {
  Card,
  BubbleTag,
  Avatar,
  ClubAvatar,
  IconBadge,
  cleanText,
  Button,
  IconButton,
  ActionDisclosure,
  ActionItem,
  PageToolbar,
  SegmentedControl,
  FilterChip,
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
  sendClubTaskReminder,
  onWorkspacePermissionChange,
} from '../api/workspaceClient'
import {
  getIntegrationsStatus,
  saveIntegrationSubscription,
} from '../api/client'
import {
  getLocalIntegrationPrefs,
  saveLocalIntegrationPrefs,
  isValidDiscordWebhookUrl,
  dispatchDiscordNotification,
  dispatchEmailNotification,
} from '../utils/directIntegrations'
import {
  readTaskBoardPrefs,
  writeTaskBoardPrefs,
  REMINDER_OFFSET_OPTIONS,
  normalizeTime24h,
  formatReminderOffsetLabel,
  buildClientReminderPayload,
  computeTaskDueDateObj,
  isTaskOverdue,
  hasLocalReminderFired,
  markLocalReminderFired,
} from '../utils/taskReminders'
import TaskModal, {
  TASK_STATUS_META,
  TASK_PRIORITY_META,
  SECTION_COLOR_META,
  SECTION_INK_META,
  getLocalYmd,
  addDaysYmd,
  formatSmartDueDate,
} from './TaskModal'
import { DateInputField, TimePickerSelect } from './TimePickerSelect'

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
        dueTime: '18:00',
        reminder: { enabled: false, offsetMinutes: 60, channels: ['discord', 'email'] },
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
        dueTime: '17:00',
        reminder: { enabled: false, offsetMinutes: 60, channels: ['discord', 'email'] },
        assignees: [],
        groupIds: [],
        completedBy: [],
      },
    ],
    groups: [],
    shortcuts: [],
  }
}

function DueDateBadge({
  dueDate,
  dueTime = '',
  reminder = null,
  isDone = false,
  now,
  timeFormat = '12h',
  onClick,
  title,
}) {
  const info = formatSmartDueDate(dueDate, dueTime, isDone, { now, timeFormat })
  if (!info) return null

  const remActive = Boolean(!isDone && reminder?.enabled)
  const remSent = Boolean(reminder?.sentAt)

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

  const content = (
    <>
      {dueTime ? <Clock size={11} /> : <Calendar size={11} />}
      <span>{info.label}</span>
      {remActive && (
        <span
          className="inline-flex items-center gap-0.5 pl-1 ml-0.5 border-l border-current/25 text-[10px]"
          title={
            remSent
              ? 'Reminder sent'
              : `Reminder set (${formatReminderOffsetLabel(reminder?.offsetMinutes ?? 60, true)})`
          }
        >
          <Bell size={9.5} />
          {remSent && <span>✓</span>}
        </span>
      )}
    </>
  )

  if (onClick && !isDone) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title || 'Edit due date, time, or reminder'}
        style={toneStyles}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold font-mono-num shrink-0 cursor-pointer hover:brightness-95 transition-all"
      >
        {content}
      </button>
    )
  }

  return (
    <span
      style={toneStyles}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold font-mono-num shrink-0"
    >
      {content}
    </span>
  )
}

function MemberTaskReminderModal({
  task,
  reminderDefaults,
  dueLabel,
  busy,
  sendingNow,
  onSave,
  onSendNow,
  onClose,
}) {
  const [enabled, setEnabled] = useState(() =>
    task?.reminder?.enabled !== undefined ? Boolean(task.reminder.enabled) : true
  )
  const [offsetMinutes, setOffsetMinutes] = useState(() =>
    Number(task?.reminder?.offsetMinutes ?? reminderDefaults?.defaultOffsetMinutes ?? 60)
  )
  const [channels, setChannels] = useState(() =>
    Array.isArray(task?.reminder?.channels) && task.reminder.channels.length > 0
      ? task.reminder.channels
      : reminderDefaults?.defaultChannels || ['discord', 'email']
  )

  function toggleChannel(ch) {
    setChannels(prev => {
      const exists = prev.includes(ch)
      if (exists && prev.length === 1) return prev
      return exists ? prev.filter(x => x !== ch) : [...prev, ch]
    })
  }

  return (
    <div
      className="fixed inset-0 z-[115] modal-backdrop flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Personal task reminder"
        className="modal-panel w-full max-w-md p-5 space-y-4 fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[var(--border)]">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text)]">
              <Bell size={15} className="text-[var(--blue)] shrink-0" />
              <span>Personal Reminder</span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
              {cleanText(task?.title)} · {dueLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close reminder dialog"
            className="w-8 h-8 rounded-xl bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] flex items-center justify-center cursor-pointer shrink-0"
          >
            <X size={15} />
          </button>
        </div>

        <div className="space-y-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-[var(--text)]">Remind me about this task</div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Only sends to your connected channels
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled(v => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-none cursor-pointer transition-colors ${
                enabled ? 'bg-[var(--blue)]' : 'bg-[var(--bg-subtle)]'
              }`}
            >
              <span
                className={`inline-block h-4.5 w-4.5 rounded-full bg-[var(--switch-thumb)] shadow-xs transition-transform ${
                  enabled ? 'translate-x-5.5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {enabled && (
            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  When to remind
                </label>
                <select
                  value={offsetMinutes}
                  onChange={e => setOffsetMinutes(Number(e.target.value))}
                  className="w-full min-h-[38px] px-3 rounded-xl bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)] cursor-pointer"
                >
                  {REMINDER_OFFSET_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  Notify via
                </span>
                <div className="min-h-[38px] px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] flex flex-wrap items-center gap-4">
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={channels.includes('discord')}
                      onChange={() => toggleChannel('discord')}
                      className="rounded accent-[var(--blue)]"
                    />
                    <span>Discord</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={channels.includes('email')}
                      onChange={() => toggleChannel('email')}
                      className="rounded accent-[var(--blue)]"
                    />
                    <span>Email</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={channels.includes('browser')}
                      onChange={() => toggleChannel('browser')}
                      className="rounded accent-[var(--blue)]"
                    />
                    <span>In-App</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[var(--border)]">
          <button
            type="button"
            disabled={sendingNow || busy}
            onClick={() =>
              onSendNow({
                ...task,
                reminder: {
                  ...(task?.reminder || {}),
                  enabled: true,
                  offsetMinutes,
                  channels,
                },
              })
            }
            className="inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--blue-light)] text-xs font-semibold text-[var(--text)] hover:text-[var(--blue-ink)] border border-[var(--border)] cursor-pointer transition-colors disabled:opacity-50"
          >
            <Send size={12} />
            <span>{sendingNow ? 'Sending…' : 'Send now'}</span>
          </button>

          <div className="flex items-center gap-2">
            <Button
              variant="text"
              size="sm"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              variant="filled"
              size="sm"
              disabled={busy}
              onClick={() => onSave({ enabled, offsetMinutes, channels })}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
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
  accountEmail = '',
  userSettings = null,
  isDemo = false,
  clubs = [],
  joinedClubIds = [],
  initialClubId = '',
  onClubJoined,
  onOpenClubsRbac,
  onBrowseClubs,
  onOpenSettings,
  onNotify,
}) {
  const effectiveUser = isDemo ? null : user
  const isAuthenticated = Boolean(effectiveUser?.id)
  const canUseBoard = isAuthenticated || isDemo
  const timeFormat = userSettings?.timeFormat === '24h' ? '24h' : '12h'
  const prefsAccountKey = isDemo ? 'demo' : accountKey || 'guest'

  // Load saved Task Board preferences synchronously for the active account
  const initialPrefs = useMemo(
    () => readTaskBoardPrefs(prefsAccountKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  const savedClubPrefRef = useRef(initialPrefs.selectedClubId || '')
  const hydratedAccountRef = useRef(prefsAccountKey)

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
    const matchedSaved = resolveMemberClubMatch(savedClubPrefRef.current)
    if (matchedSaved) return matchedSaved.id
    return memberClubs[0]?.id || ''
  }, [initialClubId, memberClubs, resolveMemberClubMatch])

  const [selectedClubId, setSelectedClubId] = useState(defaultClubId)
  const lastAppliedInitialRef = useRef(initialClubId)

  // View & Filter state (initialized from persisted preferences!)
  const [viewTiersByClub, setViewTiersByClub] = useState(
    () => initialPrefs.viewTiersByClub || {}
  )
  const [focusTab, setFocusTab] = useState(() => initialPrefs.focusTab || 'all')
  const [collapsedSections, setCollapsedSections] = useState(
    () => initialPrefs.collapsedSections || {}
  )
  const [showCompletedPersonal, setShowCompletedPersonal] = useState(
    () => initialPrefs.showCompletedPersonal || {}
  )
  const [searchQuery, setSearchQuery] = useState(() => initialPrefs.searchQuery || '')
  const [onlyAssignedToMe, setOnlyAssignedToMe] = useState(() =>
    Boolean(initialPrefs.onlyAssignedToMe)
  )
  const [hideDone, setHideDone] = useState(() => Boolean(initialPrefs.hideDone))
  const [kpiQuickFilter, setKpiQuickFilter] = useState(() => initialPrefs.kpiQuickFilter || '')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(() =>
    Boolean(initialPrefs.showAdvancedFilters)
  )
  const [statusFilter, setStatusFilter] = useState(() => initialPrefs.statusFilter || 'all')
  const [priorityFilter, setPriorityFilter] = useState(
    () => initialPrefs.priorityFilter || 'all'
  )
  const [groupFilter, setGroupFilter] = useState(() => initialPrefs.groupFilter || 'all')
  const [reminderDefaults, setReminderDefaults] = useState(
    () => initialPrefs.reminderDefaults
  )

  // Re-hydrate cleanly if `accountKey` transitions after Clerk/Supabase session loads
  useEffect(() => {
    if (hydratedAccountRef.current === prefsAccountKey) return
    hydratedAccountRef.current = prefsAccountKey
    const nextPrefs = readTaskBoardPrefs(prefsAccountKey)
    savedClubPrefRef.current = nextPrefs.selectedClubId || ''
    setViewTiersByClub(nextPrefs.viewTiersByClub || {})
    setFocusTab(nextPrefs.focusTab || 'all')
    setCollapsedSections(nextPrefs.collapsedSections || {})
    setShowCompletedPersonal(nextPrefs.showCompletedPersonal || {})
    setSearchQuery(nextPrefs.searchQuery || '')
    setOnlyAssignedToMe(Boolean(nextPrefs.onlyAssignedToMe))
    setHideDone(Boolean(nextPrefs.hideDone))
    setKpiQuickFilter(nextPrefs.kpiQuickFilter || '')
    setShowAdvancedFilters(Boolean(nextPrefs.showAdvancedFilters))
    setStatusFilter(nextPrefs.statusFilter || 'all')
    setPriorityFilter(nextPrefs.priorityFilter || 'all')
    setGroupFilter(nextPrefs.groupFilter || 'all')
    setReminderDefaults(nextPrefs.reminderDefaults)
    if (!initialClubId && nextPrefs.selectedClubId) {
      const matched = resolveMemberClubMatch(nextPrefs.selectedClubId)
      if (matched) setSelectedClubId(matched.id)
    }
  }, [prefsAccountKey, initialClubId, resolveMemberClubMatch])

  useEffect(() => {
    if (memberClubs.length === 0) {
      if (selectedClubId !== '') setSelectedClubId('')
      return
    }
    if (initialClubId && initialClubId !== lastAppliedInitialRef.current) {
      lastAppliedInitialRef.current = initialClubId
      const matched = resolveMemberClubMatch(initialClubId)
      if (matched) {
        savedClubPrefRef.current = matched.id
        setSelectedClubId(matched.id)
        return
      }
    }
    const stillMember = resolveMemberClubMatch(selectedClubId)
    if (!stillMember) {
      const matchedSaved = resolveMemberClubMatch(savedClubPrefRef.current)
      const nextId = matchedSaved ? matchedSaved.id : defaultClubId
      setSelectedClubId(nextId)
    } else {
      savedClubPrefRef.current = stillMember.id
    }
  }, [initialClubId, defaultClubId, selectedClubId, memberClubs, resolveMemberClubMatch])

  // Persist filters, selected server, view tiers, and reminder preferences across page loads
  useEffect(() => {
    if (isDemo || hydratedAccountRef.current !== prefsAccountKey) return
    writeTaskBoardPrefs(prefsAccountKey, {
      selectedClubId: selectedClubId || savedClubPrefRef.current || '',
      focusTab,
      viewTiersByClub,
      searchQuery,
      onlyAssignedToMe,
      hideDone,
      kpiQuickFilter,
      showAdvancedFilters,
      statusFilter,
      priorityFilter,
      groupFilter,
      collapsedSections,
      showCompletedPersonal,
      reminderDefaults,
    })
  }, [
    isDemo,
    prefsAccountKey,
    selectedClubId,
    focusTab,
    viewTiersByClub,
    searchQuery,
    onlyAssignedToMe,
    hideDone,
    kpiQuickFilter,
    showAdvancedFilters,
    statusFilter,
    priorityFilter,
    groupFilter,
    collapsedSections,
    showCompletedPersonal,
    reminderDefaults,
  ])

  const [boardData, setBoardData] = useState(null)
  const [clubPeople, setClubPeople] = useState(null)
  const [loading, setLoading] = useState(false)
  const [notMember, setNotMember] = useState(false)
  const [offlineLocalMode, setOfflineLocalMode] = useState(false)
  const demoBoardsRef = useRef(new Map())

  // Live clock tick every 30s for time-aware badges & reminder triggers
  const [clockNow, setClockNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setClockNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  // Discord & Email Integration Connection State + Inline Reminder Drawer
  const [showReminderPanel, setShowReminderPanel] = useState(false)
  const [channelWebhookDraft, setChannelWebhookDraft] = useState('')
  const [channelEmailDraft, setChannelEmailDraft] = useState('')
  const [serverIntegrationMeta, setServerIntegrationMeta] = useState({
    discordServerReady: false,
    emailServerReady: false,
    webhookMasked: '',
  })
  const [remindingTaskId, setRemindingTaskId] = useState('')

  const syncChannelDraftsFromPrefs = useCallback(() => {
    const localPrefs = getLocalIntegrationPrefs(prefsAccountKey)
    setChannelWebhookDraft(localPrefs.discordWebhookUrl || '')
    setChannelEmailDraft(
      localPrefs.recipientEmail || accountEmail || effectiveUser?.email || ''
    )
  }, [prefsAccountKey, accountEmail, effectiveUser?.email])

  useEffect(() => {
    syncChannelDraftsFromPrefs()
    if (isDemo) return
    let cancelled = false
    getIntegrationsStatus({ accountKey: prefsAccountKey })
      .then(status => {
        if (cancelled || !status) return
        setServerIntegrationMeta({
          discordServerReady: Boolean(
            status.discord?.botConfigured ||
              status.discord?.webhookConfigured ||
              status.subscription?.discordWebhookConfigured
          ),
          emailServerReady: Boolean(status.email?.outboundReady),
          webhookMasked: status.subscription?.discordWebhookMasked || '',
        })
        if (status.subscription?.recipientEmail) {
          setChannelEmailDraft(prev => prev || status.subscription.recipientEmail)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isDemo, prefsAccountKey, syncChannelDraftsFromPrefs])

  const integrationSummary = useMemo(() => {
    const localPrefs = getLocalIntegrationPrefs(prefsAccountKey)
    const effectiveWebhook = channelWebhookDraft || localPrefs.discordWebhookUrl || ''
    const effectiveEmail =
      channelEmailDraft ||
      localPrefs.recipientEmail ||
      accountEmail ||
      effectiveUser?.email ||
      ''
    return {
      discordReady:
        Boolean(serverIntegrationMeta.discordServerReady) ||
        isValidDiscordWebhookUrl(effectiveWebhook),
      emailReady:
        Boolean(serverIntegrationMeta.emailServerReady) || effectiveEmail.includes('@'),
      recipientEmail: effectiveEmail,
      discordWebhookUrl: isValidDiscordWebhookUrl(effectiveWebhook) ? effectiveWebhook : '',
      webhookMasked: serverIntegrationMeta.webhookMasked,
    }
  }, [
    prefsAccountKey,
    channelWebhookDraft,
    channelEmailDraft,
    accountEmail,
    effectiveUser?.email,
    serverIntegrationMeta,
  ])

  const handleSaveChannelPrefs = useCallback(
    async (patch = {}) => {
      if (isDemo) return
      const nextWebhook =
        patch.discordWebhookUrl !== undefined ? patch.discordWebhookUrl : channelWebhookDraft
      const nextEmail =
        patch.recipientEmail !== undefined ? patch.recipientEmail : channelEmailDraft

      if (nextWebhook && !isValidDiscordWebhookUrl(nextWebhook)) {
        if (onNotify) {
          onNotify(
            'Enter a valid Discord Incoming Webhook URL (https://discord.com/api/webhooks/...).',
            { type: 'error' }
          )
        }
        return false
      }

      const savedLocal = saveLocalIntegrationPrefs(prefsAccountKey, {
        discordWebhookUrl: nextWebhook,
        recipientEmail: String(nextEmail || '').trim(),
      })
      setChannelWebhookDraft(savedLocal.discordWebhookUrl || '')
      setChannelEmailDraft(savedLocal.recipientEmail || '')

      await saveIntegrationSubscription({
        accountKey: prefsAccountKey,
        discordWebhookUrl: savedLocal.discordWebhookUrl || '',
        recipientEmail: savedLocal.recipientEmail || '',
      }).catch(() => {})

      return true
    },
    [isDemo, prefsAccountKey, channelWebhookDraft, channelEmailDraft, onNotify]
  )

  // Contextual section creators (separate clear drawers for Personal List vs. Club Section)
  const [sectionCreatorMode, setSectionCreatorMode] = useState(null) // null | 'personal' | 'club'
  const [newSectionTitle, setNewSectionTitle] = useState('')
  const [newSectionColor, setNewSectionColor] = useState('green')
  const [newSectionVis, setNewSectionVis] = useState('members')

  // Quick-add state per personal section: { [sectionId]: { title, notes, showNote, priority, dueDate, dueTime, remind } }
  const [quickDrafts, setQuickDrafts] = useState({})
  const [quickAddBusySecId, setQuickAddBusySecId] = useState('')

  // Inline click-to-rename state for personal to-dos
  const [inlineEditingId, setInlineEditingId] = useState(null)
  const [inlineEditTitle, setInlineEditTitle] = useState('')

  // Task Modal & Member Reminder Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [modalPersonalOnly, setModalPersonalOnly] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [modalDefaultSectionId, setModalDefaultSectionId] = useState('')
  const [memberReminderTask, setMemberReminderTask] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)

  const selectedClub = useMemo(
    () => resolveMemberClubMatch(selectedClubId),
    [resolveMemberClubMatch, selectedClubId]
  )

  const normSelectedClubId = normalizeClubId(selectedClubId)
  const isBoard = Boolean(boardData?.permission?.isBoard)

  const viewTier = useMemo(() => {
    if (!isBoard) return 'member'
    const saved = viewTiersByClub[normSelectedClubId]
    return saved === 'member' || saved === 'board' ? saved : 'board'
  }, [isBoard, viewTiersByClub, normSelectedClubId])

  const setViewTierForCurrentClub = useCallback(
    nextTier => {
      if (!normSelectedClubId) return
      setViewTiersByClub(prev => ({
        ...prev,
        [normSelectedClubId]: nextTier === 'member' ? 'member' : 'board',
      }))
    },
    [normSelectedClubId]
  )

  const loadSeqRef = useRef(0)
  const selectedClubName = selectedClub?.name || ''
  const isLocallyMember = Boolean(selectedClub)

  const loadBoard = useCallback(async () => {
    if (!selectedClubId || !canUseBoard) {
      setBoardData(null)
      setClubPeople(null)
      setNotMember(false)
      setOfflineLocalMode(false)
      return
    }

    const cid = normalizeClubId(selectedClubId)
    const seq = ++loadSeqRef.current

    if (isDemo) {
      if (!demoBoardsRef.current.has(cid)) {
        demoBoardsRef.current.set(cid, createSeedDemoBoard(cid, selectedClubName))
      }
      setNotMember(false)
      setOfflineLocalMode(false)
      setClubPeople(null)
      setBoardData(demoBoardsRef.current.get(cid))
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      let [tasksRes, peopleRes] = await Promise.all([
        getClubTasksBoard(selectedClubId),
        getClubPeopleAndGroups(selectedClubId),
      ])

      if (seq !== loadSeqRef.current) return

      // Reconcile local joinedClubIds with backend memberships if dev server restarted in-memory DB
      if (
        !tasksRes?.ok &&
        tasksRes?.status === 403 &&
        tasksRes?.code === 'NOT_CLUB_MEMBER' &&
        isLocallyMember
      ) {
        const syncedJoin = await joinWorkspaceClub(selectedClubId)
        if (seq !== loadSeqRef.current) return
        if (syncedJoin?.ok) {
          ;[tasksRes, peopleRes] = await Promise.all([
            getClubTasksBoard(selectedClubId),
            getClubPeopleAndGroups(selectedClubId),
          ])
          if (seq !== loadSeqRef.current) return
        }
      }

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
          return
        }
        if (tasksRes?.status === 403 && tasksRes?.code === 'NOT_CLUB_MEMBER') {
          setNotMember(true)
          setOfflineLocalMode(false)
          setBoardData(null)
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
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false)
      }
    }
  }, [
    selectedClubId,
    selectedClubName,
    isLocallyMember,
    canUseBoard,
    isDemo,
    accountKey,
    effectiveUser?.id,
  ])

  useEffect(() => {
    loadBoard()
  }, [loadBoard])

  useEffect(() => {
    setSectionCreatorMode(null)
    setInlineEditingId(null)
  }, [selectedClubId])

  useEffect(() => {
    if (isDemo) return undefined
    return onWorkspacePermissionChange(detail => {
      if (
        detail?.code === 'NOT_CLUB_MEMBER' ||
        detail?.code === 'SUPABASE_AUTH_SETUP_REQUIRED' ||
        detail?.method === 'GET'
      ) {
        return
      }
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

  // Clear saved groupFilter automatically if that group doesn't exist on the current server
  useEffect(() => {
    if (groupFilter !== 'all' && boardData && !groupsMap.has(groupFilter)) {
      setGroupFilter('all')
    }
  }, [groupFilter, boardData, groupsMap])

  const myGroupIds = boardData?.permission?.groupIds || []
  const userEmailLower = String(effectiveUser?.email || accountEmail || '')
    .trim()
    .toLowerCase()

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

  const todayYmd = useMemo(() => getLocalYmd(clockNow), [clockNow])

  const filteredPersonalTasks = useMemo(() => {
    return allPersonalTasks.filter(t => {
      if (hideDone && t.status === 'done') return false
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false
      if (kpiQuickFilter === 'stuck' && t.status !== 'stuck' && t.priority !== 'critical') {
        return false
      }
      if (kpiQuickFilter === 'overdue' && !isTaskOverdue(t, clockNow)) {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const hay = `${t.title} ${t.notes || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [
    allPersonalTasks,
    hideDone,
    statusFilter,
    priorityFilter,
    kpiQuickFilter,
    clockNow,
    searchQuery,
  ])

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
      if (kpiQuickFilter === 'overdue' && (!isTaskOverdue(t, clockNow) || isClubTaskDoneForViewer(t))) {
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
    clockNow,
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

  const activeReminderCount = useMemo(() => {
    const personalActive = allPersonalTasks.filter(
      t => t.status !== 'done' && t.dueDate && t.reminder?.enabled
    ).length
    const clubActive = accessibleClubTasks.filter(
      t => !isClubTaskDoneForViewer(t) && t.dueDate && t.reminder?.enabled
    ).length
    return personalActive + clubActive
  }, [allPersonalTasks, accessibleClubTasks, isClubTaskDoneForViewer])

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
    const overdue = all.filter(t => isTaskOverdue(t, clockNow)).length
    return {
      total,
      done,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
      stuck,
      overdue,
    }
  }, [accessibleClubTasks, clockNow])

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

  // Dispatch a reminder (manual or automatic due-time trigger) across Discord / Email / Browser
  const executeTaskReminderDispatch = useCallback(
    async (task, { isAutomatic = false } = {}) => {
      if (!task) return
      if (isDemo) {
        if (!isAutomatic && onNotify) {
          onNotify('Sign in to send live Discord and Email task reminders.', { type: 'info' })
        }
        return
      }

      const dueInfo = formatSmartDueDate(task.dueDate, task.dueTime, false, {
        now: new Date(),
        timeFormat,
      })
      const dueLabel = dueInfo?.label || task.dueDate || 'Upcoming'
      const clubLabel = cleanText(selectedClub?.name || 'ClubHub')
      const channels =
        Array.isArray(task.reminder?.channels) && task.reminder.channels.length > 0
          ? task.reminder.channels
          : reminderDefaults.defaultChannels || ['discord', 'email']
      const dueDt = computeTaskDueDateObj(task.dueDate, task.dueTime, 9)
      const taskUrl = typeof window !== 'undefined' ? window.location.href : ''

      // 1. In-app toast + optional Browser Notification on automatic due triggers
      if (isAutomatic) {
        if (onNotify) {
          onNotify(`⏰ Reminder: "${cleanText(task.title)}" (${dueLabel})`)
        }
        if (
          (channels.includes('browser') || reminderDefaults.browserAlertsEnabled) &&
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted'
        ) {
          try {
            new Notification(`⏰ ${cleanText(task.title)}`, {
              body: `${clubLabel} · ${dueLabel}`,
            })
          } catch {
            // Ignore desktop notification errors
          }
        }
      }

      if (!isAutomatic) setRemindingTaskId(task.id)

      const deliveredVia = []
      let serverResults = {}

      if (!offlineLocalMode && selectedClubId) {
        const srvRes = await sendClubTaskReminder(selectedClubId, task.id, {
          channels,
          webhookUrl: integrationSummary.discordWebhookUrl || undefined,
          recipientEmail: integrationSummary.recipientEmail || undefined,
          accountKey: prefsAccountKey,
          url: taskUrl,
          markAutoSent: isAutomatic,
        })
        if (srvRes?.ok) {
          serverResults = srvRes.results || {}
          applyServerBoardUpdate(srvRes)
          if (serverResults.discord?.ok) deliveredVia.push('Discord')
          if (serverResults.email?.ok) deliveredVia.push('Email')
        }
      }

      // Client-side fallback for Discord Webhook / Email if server wasn't configured or offline
      const taskCardPayload = {
        id: task.id,
        title: task.title,
        notes: task.notes || '',
        priority: task.priority || 'medium',
        dueDate: task.dueDate || '',
        dueTime: task.dueTime || '',
        dueAtIso: dueDt ? dueDt.toISOString() : null,
        dueLabel,
        visibility: task.visibility,
        isPersonal: Boolean(task.visibility === 'personal' || task.isPersonal),
      }

      if (channels.includes('discord') && !serverResults.discord?.ok) {
        if (integrationSummary.discordWebhookUrl) {
          try {
            await dispatchDiscordNotification({
              kind: 'task_reminder',
              accountKey: prefsAccountKey,
              webhookUrl: integrationSummary.discordWebhookUrl,
              clubName: clubLabel,
              title: task.title,
              message: task.notes || '',
              url: taskUrl,
              task: taskCardPayload,
            })
            deliveredVia.push('Discord')
          } catch (err) {
            if (!isAutomatic && onNotify && channels.length === 1) {
              onNotify(err?.message || 'Discord reminder failed.', { type: 'error' })
            }
          }
        }
      }

      if (channels.includes('email') && !serverResults.email?.ok) {
        if (integrationSummary.recipientEmail) {
          try {
            const emailOut = await dispatchEmailNotification(
              {
                kind: 'task_reminder',
                accountKey: prefsAccountKey,
                to: integrationSummary.recipientEmail,
                clubName: clubLabel,
                title: task.title,
                message: task.notes || '',
                url: taskUrl,
                task: taskCardPayload,
              },
              { allowMailtoFallback: !isAutomatic }
            )
            if (emailOut?.ok) {
              deliveredVia.push(emailOut.via === 'mailto' ? 'Email draft' : 'Email')
            }
          } catch {
            // Handled below if nothing delivered on manual send
          }
        }
      }

      if (!isAutomatic) {
        setRemindingTaskId('')
        if (deliveredVia.length > 0) {
          if (onNotify) {
            onNotify(`Sent task reminder via ${deliveredVia.join(' & ')}!`)
          }
        } else {
          setShowReminderPanel(true)
          if (onNotify) {
            onNotify(
              'Connect a Discord Webhook URL or Email below to send task reminders.',
              { type: 'info' }
            )
          }
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      isDemo,
      timeFormat,
      selectedClub?.name,
      reminderDefaults,
      offlineLocalMode,
      selectedClubId,
      integrationSummary,
      prefsAccountKey,
      onNotify,
    ]
  )

  // Active Due-Reminder Watcher (runs on clockNow ticks while board is open)
  useEffect(() => {
    if (isDemo || !boardData) return
    const nowMs = clockNow.getTime()
    const candidates = [
      ...allPersonalTasks.filter(t => t.status !== 'done'),
      ...accessibleClubTasks.filter(t => !isClubTaskDoneForViewer(t)),
    ]

    for (const task of candidates) {
      if (!task.dueDate || !task.reminder?.enabled) continue
      if (hasLocalReminderFired(task)) continue

      let remindMs = task.reminder.remindAtIso
        ? new Date(task.reminder.remindAtIso).getTime()
        : NaN
      if (Number.isNaN(remindMs)) {
        const baseDt = computeTaskDueDateObj(task.dueDate, task.dueTime, 9)
        if (baseDt) {
          remindMs = baseDt.getTime() - Number(task.reminder.offsetMinutes ?? 60) * 60_000
        }
      }
      if (!Number.isNaN(remindMs) && remindMs <= nowMs) {
        markLocalReminderFired(task)
        executeTaskReminderDispatch(task, { isAutomatic: true })
      }
    }
  }, [
    isDemo,
    boardData,
    clockNow,
    allPersonalTasks,
    accessibleClubTasks,
    isClubTaskDoneForViewer,
    executeTaskReminderDispatch,
  ])

  function makeBlankDraft() {
    return {
      title: '',
      notes: '',
      showSchedule: false,
      priority: 'medium',
      dueDate: '',
      dueTime: '',
      remindOffset: 'off', // 'off' | number (minutes)
    }
  }

  function getDraftForSection(secId) {
    return quickDrafts[secId] || makeBlankDraft()
  }

  function updateDraftForSection(secId, patch) {
    setQuickDrafts(prev => {
      const curr = prev[secId] || makeBlankDraft()
      const next = { ...curr, ...patch }

      // If user picks a time before picking a date, automatically set Date to Today so Time Selector always works!
      if (patch.dueTime !== undefined) {
        const cleanT = normalizeTime24h(patch.dueTime)
        next.dueTime = cleanT
        if (cleanT && !next.dueDate) {
          next.dueDate = todayYmd
        }
        if (
          cleanT &&
          !curr.dueTime &&
          reminderDefaults?.autoRemindTimedTasks &&
          patch.remindOffset === undefined &&
          curr.remindOffset === 'off'
        ) {
          next.remindOffset = Number(reminderDefaults.defaultOffsetMinutes ?? 60)
        }
      }

      // If user turns on a reminder before picking a date, automatically default Date to Today
      if (
        patch.remindOffset !== undefined &&
        patch.remindOffset !== 'off' &&
        !next.dueDate
      ) {
        next.dueDate = todayYmd
      }

      // Clearing date clears time & reminder
      if (patch.dueDate === '') {
        next.dueTime = ''
        next.remindOffset = 'off'
      }

      return {
        ...prev,
        [secId]: next,
      }
    })
  }

  async function handleQuickAddPersonalTask(e, pSec) {
    e.preventDefault()
    const draft = getDraftForSection(pSec.id)
    const cleanTitle = String(draft.title || '').trim()
    const cleanNotes = String(draft.notes || '').trim()
    if (!cleanTitle || quickAddBusySecId) return

    const cleanDate = draft.dueDate || ''
    const cleanTime = cleanDate ? normalizeTime24h(draft.dueTime || '') : ''
    const remindEnabled = Boolean(cleanDate && draft.remindOffset !== 'off')
    const effectiveOffset =
      draft.remindOffset !== 'off'
        ? Number(draft.remindOffset)
        : Number(reminderDefaults.defaultOffsetMinutes ?? 60)

    const reminderPayload = buildClientReminderPayload({
      enabled: remindEnabled,
      dueDate: cleanDate,
      dueTime: cleanTime,
      offsetMinutes: effectiveOffset,
      channels: reminderDefaults.defaultChannels,
      recipientEmail: integrationSummary.recipientEmail,
    })

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
          dueDate: cleanDate,
          dueTime: cleanTime,
          reminder: reminderPayload,
          assignees: [],
          groupIds: [],
          completedBy: [],
        }
        return {
          ...base,
          personalTasks: [...(base.personalTasks || []), created],
        }
      })
      setQuickDrafts(prev => ({ ...prev, [pSec.id]: makeBlankDraft() }))
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
      dueDate: cleanDate,
      dueTime: cleanTime,
      reminder: reminderPayload,
      visibility: 'personal',
      audience: 'personal',
      isPersonal: true,
    })
    setQuickAddBusySecId('')

    if (res?.ok) {
      applyServerBoardUpdate(res)
      setQuickDrafts(prev => ({ ...prev, [pSec.id]: makeBlankDraft() }))
      if (onNotify) {
        onNotify(
          reminderPayload.enabled
            ? 'Added to-do with reminder scheduled!'
            : 'Added to your to-do list!'
        )
      }
    } else {
      const isConstraintError =
        res?.code === 'TASKS_CHECK_CONSTRAINT_VIOLATION' ||
        /tasks_(audience|visibility)_check/i.test(res?.error || '')
      if (isConstraintError) {
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
            dueDate: cleanDate,
            dueTime: cleanTime,
            reminder: reminderPayload,
            assignees: [],
            groupIds: [],
            completedBy: [],
          }
          return {
            ...base,
            personalTasks: [...(base.personalTasks || []), created],
          }
        })
        setQuickDrafts(prev => ({ ...prev, [pSec.id]: makeBlankDraft() }))
        if (onNotify) {
          onNotify(
            'Saved to your local to-do list. Update your Supabase schema (tasks_audience_check) to sync to cloud.',
            { type: 'warning' }
          )
        }
        return
      }

      if (res?.status === 403) loadBoard()
      if (onNotify) onNotify(res?.error || 'Could not add personal to-do.', { type: 'error' })
    }
  }

  async function handleSaveMemberReminder(task, { enabled, offsetMinutes, channels }) {
    if (!task?.dueDate) return
    const nextReminder = buildClientReminderPayload({
      enabled,
      dueDate: task.dueDate,
      dueTime: task.dueTime || '',
      offsetMinutes,
      channels,
      recipientEmail: integrationSummary.recipientEmail,
    })
    setActionBusy(true)
    await handleInlineTaskPatch(task, { reminder: nextReminder })
    setActionBusy(false)
    setMemberReminderTask(null)
    if (onNotify) {
      onNotify(
        enabled
          ? `Reminder set (${formatReminderOffsetLabel(offsetMinutes, true)})`
          : 'Reminder turned off.',
        { type: enabled ? 'success' : 'info' }
      )
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
                    dueTime: payload.dueDate ? payload.dueTime || '' : '',
                    reminder: payload.reminder || t.reminder,
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
          dueTime: payload.dueDate ? payload.dueTime || '' : '',
          reminder: payload.reminder || { enabled: false, offsetMinutes: 60, channels: ['discord', 'email'] },
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
      const isConstraintError =
        res?.code === 'TASKS_CHECK_CONSTRAINT_VIOLATION' ||
        /tasks_(audience|visibility)_check/i.test(res?.error || '')
      if (isConstraintError && isPersonalPayload) {
        mutateLocalOrDemoBoard((base, cid) => {
          const created = {
            id: editingTask?.id || `local_ptsk_${cid}_${Date.now()}`,
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
            dueTime: payload.dueDate ? payload.dueTime || '' : '',
            reminder: payload.reminder || { enabled: false, offsetMinutes: 60, channels: ['discord', 'email'] },
            assignees: [],
            groupIds: [],
            completedBy: [],
          }
          return {
            ...base,
            personalTasks: editingTask?.id
              ? (base.personalTasks || []).map(t => (t.id === editingTask.id ? { ...t, ...created } : t))
              : [...(base.personalTasks || []), created],
          }
        })
        setModalOpen(false)
        setEditingTask(null)
        setModalPersonalOnly(false)
        if (onNotify) {
          onNotify(
            'Saved to your local to-do list. Update your Supabase schema (tasks_audience_check) to sync to cloud.',
            { type: 'warning' }
          )
        }
        return
      }

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
                ...(patch.reminder ? { reminder: patch.reminder } : {}),
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

  async function handleToggleBrowserDesktopAlerts() {
    const nextVal = !reminderDefaults.browserAlertsEnabled
    if (nextVal && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try {
        const perm = await Notification.requestPermission()
        if (perm !== 'granted') {
          if (onNotify) {
            onNotify('Browser desktop notifications were blocked by your browser settings.', {
              type: 'info',
            })
          }
          return
        }
      } catch {
        // Ignore permission request errors
      }
    }
    setReminderDefaults(prev => ({
      ...prev,
      browserAlertsEnabled: nextVal,
    }))
  }

  function toggleDefaultReminderChannel(ch) {
    setReminderDefaults(prev => {
      const curr = prev.defaultChannels || ['discord', 'email']
      const exists = curr.includes(ch)
      if (exists && curr.length === 1) return prev
      return {
        ...prev,
        defaultChannels: exists ? curr.filter(x => x !== ch) : [...curr, ch],
      }
    })
  }

  if (!canUseBoard) {
    return (
      <div className="page-stack">
        <PageToolbar title="Task board" />
        <Card className="p-6 text-center space-y-2">
          <Lock size={22} className="mx-auto text-[var(--blue)]" />
          <h3 className="text-base font-bold text-[var(--text)]">Sign In to Access Club Task Boards</h3>
          <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
            Sign in with your account to view tasks for the clubs you&apos;re in, keep your own private to-do list per server, or manage your club&apos;s Board Task View.
          </p>
        </Card>
      </div>
    )
  }

  // Strictly enforce: you can only see task boards for clubs you are in
  if (memberClubs.length === 0) {
    return (
      <div className="page-stack">
        <PageToolbar title="Task board" />
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
              <Button
                variant="filled"
                size="md"
                leadingIcon={<Compass size={14} />}
                onClick={() => (onBrowseClubs ? onBrowseClubs() : onOpenClubsRbac(''))}
              >
                Browse &amp; Join Clubs
              </Button>
            </div>
          )}
        </Card>
      </div>
    )
  }

  const showPersonalZone = focusTab === 'all' || focusTab === 'personal'
  const showClubZone = focusTab === 'all' || focusTab === 'club'

  const filterCount = advancedFilterCount + Number(hideDone) + Number(onlyAssignedToMe) + Number(Boolean(kpiQuickFilter))

  return (
    <div className="page-stack">
      <div className="space-y-2 dense-controls">
        <PageToolbar title="Task board" actions={
          <>
            <ActionDisclosure label="Task settings" icon={<SlidersHorizontal size={14} />}>
              {close => (
                <>
                  <ActionItem icon={<BellRing size={14} />} onClick={() => {
                    setShowReminderPanel(value => !value)
                    close()
                  }}>
                    {showReminderPanel ? 'Hide reminders' : 'Configure reminders'}
                  </ActionItem>
                  {onOpenClubsRbac && selectedClub && (
                    <ActionItem icon={<Users size={14} />} onClick={() => {
                      close()
                      onOpenClubsRbac(selectedClub.id)
                    }}>
                      {isBoard ? 'Roster & groups' : 'Roles & groups'}
                    </ActionItem>
                  )}
                </>
              )}
            </ActionDisclosure>
            {isBoard && (
              <Button size="sm" icon={<Plus size={14} />} onClick={() => {
                setEditingTask(null)
                setModalPersonalOnly(false)
                setModalDefaultSectionId(visibleSections[0]?.id || '')
                setModalOpen(true)
              }}>
                Create club task
              </Button>
            )}
          </>
        } />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 w-full sm:w-auto sm:max-w-full min-w-0">
            <ClubAvatar club={selectedClub} size={28} />
            {memberClubs.length > 1 ? (
              <select value={selectedClub?.id || selectedClubId}
                onChange={e => setSelectedClubId(e.target.value)}
                aria-label="Task board club" className="control-select min-w-0 max-w-full flex-1 sm:max-w-72">
                {memberClubs.map(c => <option key={c.id} value={c.id}>{cleanText(c.name)}</option>)}
              </select>
            ) : (
              <span className="text-sm font-medium break-words min-w-0">{cleanText(selectedClub?.name)}</span>
            )}
          </div>
          <div className="flex items-center flex-wrap gap-x-2 text-xs text-[var(--text-muted)]">
            <span>{openPersonalCount} open personal · {openClubCount} open club</span>
            {boardData?.permission && (
              <span>{isBoard ? cleanText(boardData.permission.roleTitle || 'Officer') : isDemo ? 'Demo member' : 'Member'}</span>
            )}
            {activeReminderCount > 0 && <span>{activeReminderCount} active reminders</span>}
            {loading && boardData?.clubId === normSelectedClubId && <span role="status">Syncing…</span>}
          </div>
          {isBoard && (
            <SegmentedControl size="sm" ariaLabel="Task board view" value={effectiveTier}
              onChange={setViewTierForCurrentClub}
              options={[{ value: 'member', label: 'Member view' }, { value: 'board', label: 'Board view' }]} />
          )}
        </div>

        {/* Inline Discord & Email Reminder Settings Drawer */}
        {showReminderPanel && (
          <div className="content-tile p-3.5 sm:p-4 rounded-2xl space-y-3 fade-in">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text)]">
                  <BellRing size={13.5} className="text-[var(--blue)]" />
                  <span>Task Reminder Notifications (Discord &amp; Email)</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  Saved automatically across page loads. Enable reminders per task or set defaults for timed deadlines.
                </p>
              </div>
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer"
                >
                  <span>Full Discord &amp; Email Settings</span>
                  <ExternalLink size={11} />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-1">
              {/* Left: Clean Labeled Default Lead Time & Checkboxes */}
              <div className="space-y-3 bg-[var(--bg-card)] p-3.5 rounded-xl border border-[var(--border)]">
                <div className="text-xs font-medium text-[var(--text-muted)]">
                  Default reminder preferences
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10.5px] font-semibold text-[var(--text-muted)] mb-1">
                      Default timing
                    </label>
                    <select
                      value={reminderDefaults.defaultOffsetMinutes}
                      onChange={e =>
                        setReminderDefaults(prev => ({
                          ...prev,
                          defaultOffsetMinutes: Number(e.target.value),
                        }))
                      }
                      className="w-full min-h-[34px] px-2.5 rounded-lg bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text)] border border-[var(--border)] cursor-pointer"
                    >
                      {REMINDER_OFFSET_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <span className="block text-[10.5px] font-semibold text-[var(--text-muted)] mb-1">
                      Default channels
                    </span>
                    <div className="min-h-[34px] px-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] flex flex-wrap items-center gap-3">
                      <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(reminderDefaults.defaultChannels || []).includes('discord')}
                          onChange={() => toggleDefaultReminderChannel('discord')}
                          className="rounded accent-[var(--blue)]"
                        />
                        <span>Discord</span>
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(reminderDefaults.defaultChannels || []).includes('email')}
                          onChange={() => toggleDefaultReminderChannel('email')}
                          className="rounded accent-[var(--blue)]"
                        />
                        <span>Email</span>
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(reminderDefaults.browserAlertsEnabled)}
                          onChange={handleToggleBrowserDesktopAlerts}
                          className="rounded accent-[var(--blue)]"
                        />
                        <span>Desktop</span>
                      </label>
                    </div>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs text-[var(--text)] cursor-pointer pt-0.5">
                  <input
                    type="checkbox"
                    checked={Boolean(reminderDefaults.autoRemindTimedTasks)}
                    onChange={e =>
                      setReminderDefaults(prev => ({
                        ...prev,
                        autoRemindTimedTasks: e.target.checked,
                      }))
                    }
                    className="rounded accent-[var(--blue)]"
                  />
                  <span>Automatically enable reminders whenever I pick a due time</span>
                </label>
              </div>

              {/* Right: Quick Discord Webhook + Email Destination Config */}
              <div className="space-y-2 bg-[var(--bg-card)] p-3 rounded-xl border border-[var(--border)]">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-medium text-[var(--text-muted)]">
                    Notification destinations
                  </div>
                  <span className="text-[10.5px] font-semibold text-[var(--green-ink)]">
                    {integrationSummary.discordReady && integrationSummary.emailReady
                      ? 'Discord & Email Ready ✓'
                      : integrationSummary.discordReady
                        ? 'Discord Ready ✓'
                        : integrationSummary.emailReady
                          ? 'Email Ready ✓'
                          : 'Add Webhook or Email'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10.5px] font-semibold text-[var(--text-muted)] mb-1">
                      Discord Incoming Webhook URL
                    </label>
                    <input
                      type="url"
                      value={channelWebhookDraft}
                      onChange={e => setChannelWebhookDraft(e.target.value)}
                      placeholder={
                        serverIntegrationMeta.discordServerReady
                          ? serverIntegrationMeta.webhookMasked || 'Connected via server ✓'
                          : 'https://discord.com/api/webhooks/...'
                      }
                      className="w-full min-h-[34px] px-2.5 rounded-lg bg-[var(--bg-surface)] text-xs text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--md-primary)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10.5px] font-semibold text-[var(--text-muted)] mb-1">
                      Reminder Email Address
                    </label>
                    <input
                      type="email"
                      value={channelEmailDraft}
                      onChange={e => setChannelEmailDraft(e.target.value)}
                      placeholder="you@ucsc.edu"
                      className="w-full min-h-[34px] px-2.5 rounded-lg bg-[var(--bg-surface)] text-xs text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    variant="filled"
                    size="sm"
                    onClick={async () => {
                      const ok = await handleSaveChannelPrefs()
                      if (ok && onNotify) {
                        onNotify('Saved reminder Discord & Email destinations!')
                      }
                    }}
                  >
                    Save Channels
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Focus Tabs + Search + Quick Filter Chips */}
        {!notMember && boardData && (
          <div className="pt-3.5 border-t border-[var(--border-subtle)] space-y-3">
            {/* Interactive Board KPIs (Board View only — click Blocked or Overdue to triage!) */}
            {effectiveTier === 'board' && showClubZone && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="content-tile px-3 py-2.5 rounded-xl">
                  <div className="text-xs font-medium text-[var(--text-muted)]">
                    Club tasks
                  </div>
                  <div className="text-base font-semibold font-mono-num text-[var(--text)] mt-0.5">
                    {kpis.total}
                  </div>
                </div>
                <div className="px-3 py-2.5 rounded-xl bg-[var(--green-light)] border border-[var(--green)]/30">
                  <div className="text-xs font-medium text-[var(--green-ink)]">
                    Completed
                  </div>
                  <div className="text-base font-semibold font-mono-num text-[var(--green-ink)] mt-0.5">
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
                  <div className="text-xs font-medium text-[var(--red-ink)]">
                    Blocked / Urgent
                  </div>
                  <div className="text-base font-semibold font-mono-num text-[var(--red-ink)] mt-0.5">
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
                  <div className="text-xs font-medium text-[var(--yellow-ink)]">
                    Overdue
                  </div>
                  <div className="text-base font-semibold font-mono-num text-[var(--yellow-ink)] mt-0.5">
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
                      aria-pressed={active}
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

              {/* Search and filters */}
              <div className="flex flex-wrap items-center gap-2 flex-1 md:justify-end">
                <div className="relative flex-1 min-w-0 md:max-w-[250px]">
                  <Search
                    size={13}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-light)] pointer-events-none"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search tasks…"
                    aria-label="Search tasks"
                    className="w-full min-h-[36px] max-sm:min-h-11 pl-8 pr-11 rounded-xl bg-[var(--bg-surface)] text-base sm:text-xs text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                      className="ui-touch flex items-center justify-center absolute right-0 top-1/2 -translate-y-1/2 text-[var(--text-light)] hover:text-[var(--text)] bg-transparent border-none cursor-pointer p-0.5"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  aria-expanded={showAdvancedFilters}
                  aria-controls="task-board-filters"
                  onKeyDown={e => {
                    if (e.key === 'Escape' && showAdvancedFilters) {
                      e.stopPropagation()
                      setShowAdvancedFilters(false)
                    }
                  }}
                  onClick={() => setShowAdvancedFilters(v => !v)}
                  className={`inline-flex items-center gap-1.5 px-2.5 min-h-[36px] rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                    showAdvancedFilters || advancedFilterCount > 0
                      ? 'bg-[var(--blue-light)] border-[var(--blue)] text-[var(--blue-ink)]'
                      : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  <SlidersHorizontal size={12} />
                  <span>Filters</span>
                  {filterCount > 0 && (
                    <span className="px-1.5 rounded-full bg-[var(--secondary-container)] text-[var(--on-secondary-container)] text-[10px] font-mono-num">
                      {filterCount}
                    </span>
                  )}
                </button>

              </div>
            </div>

            {showAdvancedFilters && (
              <div id="task-board-filters" className="section-pad bg-[var(--bg-card)] rounded-xl border border-[var(--border)] space-y-2"
                onKeyDown={e => {
                  if (e.key !== 'Escape') return
                  e.stopPropagation()
                  e.currentTarget.previousElementSibling?.querySelector('[aria-controls="task-board-filters"]')?.focus()
                  setShowAdvancedFilters(false)
                }}>
                <div className="flex flex-wrap items-center gap-2">
                {showClubZone && (assignedToMeCount > 0 || onlyAssignedToMe) && (
                  <button
                    type="button"
                    aria-pressed={onlyAssignedToMe}
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
                  aria-pressed={hideDone}
                  onClick={() => setHideDone(v => !v)}
                  className={`inline-flex items-center gap-1.5 px-2.5 min-h-[36px] rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                    hideDone
                      ? 'bg-[var(--teal-light)] border-[var(--teal)] text-[var(--teal-ink)]'
                      : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  <span>Hide Done</span>
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
              </div>
            )}
          </div>
        )}
      </div>

      {/* Loading Skeleton */}
      {loading && (!boardData || boardData.clubId !== normSelectedClubId) && (
        <Card className="p-6 text-center text-xs text-[var(--text-muted)]">
          <div className="flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin text-[var(--blue)]" />
            <span>Loading {cleanText(selectedClub?.name || 'server')} tasks…</span>
          </div>
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
          <Button
            variant="filled"
            size="md"
            leadingIcon={<UserPlus size={14} />}
            disabled={actionBusy}
            onClick={handleJoinCurrentClub}
          >
            {actionBusy ? 'Syncing…' : 'Confirm Membership'}
          </Button>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ZONE 1: YOUR PERSONAL TO-DO LISTS (Private per user, isolated per server)
         ══════════════════════════════════════════════════════════════════════ */}
      {!notMember && boardData && showPersonalZone && (!loading || boardData.clubId === normSelectedClubId) && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <div>
              <h2 className="text-sm font-semibold">Personal tasks</h2>
              <span className="text-xs text-[var(--text-muted)]">Only visible to you</span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Button variant="text-neutral" size="sm" className="!px-2"
                onClick={() => openSectionCreator('personal')}>
                {sectionCreatorMode === 'personal' ? 'Close list form' : 'New list'}
              </Button>
              <Button variant={isBoard ? 'outlined' : 'filled'} size="sm" className="!px-2"
                onClick={() => {
                  setEditingTask(null)
                  setModalPersonalOnly(true)
                  setModalDefaultSectionId(personalSections[0]?.id || '')
                  setModalOpen(true)
                }}>
                Add personal task
              </Button>
            </div>
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
                  <Button
                    variant="filled"
                    size="sm"
                    type="submit"
                    disabled={actionBusy || !newSectionTitle.trim()}
                  >
                    Create List
                  </Button>
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
                const aOver = isTaskOverdue(a, clockNow) ? 0 : 1
                const bOver = isTaskOverdue(b, clockNow) ? 0 : 1
                if (aOver !== bOver) return aOver - bOver
                const pDiff =
                  (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2)
                if (pDiff !== 0) return pDiff
                if (a.dueDate && b.dueDate) {
                  const aKey = `${a.dueDate}T${a.dueTime || '23:59'}`
                  const bKey = `${b.dueDate}T${b.dueTime || '23:59'}`
                  return aKey.localeCompare(bKey)
                }
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
            const draftDueSummary = draft.dueDate
              ? formatSmartDueDate(draft.dueDate, draft.dueTime, false, {
                  now: clockNow,
                  timeFormat,
                })?.label || draft.dueDate
              : ''
            const hasDraftExtras = Boolean(
              draft.dueDate ||
                draft.dueTime ||
                draft.remindOffset !== 'off' ||
                (draft.priority && draft.priority !== 'medium') ||
                draft.notes
            )

            return (
              <Card key={pSec.id} className="overflow-visible p-0" delay={2}>
                {/* Personal List Header */}
                <div
                  className={`flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-[var(--bg-surface)] ${
                    isCollapsed
                      ? 'rounded-[var(--radius)]'
                      : 'rounded-t-[var(--radius)] border-b border-[var(--border)]'
                  }`}
                  style={{ borderLeft: `5px solid ${accent}` }}
                >
                  <button
                    type="button"
                    onClick={() => setCollapsedSections(p => ({ ...p, [pSec.id]: !p[pSec.id] }))}
                    className="ui-touch flex items-center gap-2 min-h-[32px] bg-transparent border-none cursor-pointer text-left flex-wrap"
                  >
                    {isCollapsed ? (
                      <ChevronRight size={16} style={{ color: accentInk }} />
                    ) : (
                      <ChevronDown size={16} style={{ color: accentInk }} />
                    )}
                    <CheckSquare size={15} style={{ color: accentInk }} />
                    <span className="text-sm font-semibold" style={{ color: accentInk }}>
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
                    {/* Checklist Items */}
                    {matchingTasks.length === 0 ? (
                      <div className="px-4 py-6 text-xs text-[var(--text-muted)] text-center rounded-b-[var(--radius)]">
                        {totalInSec.length === 0
                          ? `Nothing on your ${cleanText(selectedClub?.name || 'server')} to-do list yet. Add a task below.`
                          : 'No personal to-dos match your active filter.'}
                      </div>
                    ) : (
                      <div className="task-rows divide-y divide-[var(--border-subtle)]">
                        {activeItems.map(task => {
                          const sMeta =
                            TASK_STATUS_META[task.status] || TASK_STATUS_META.not_started
                          const pMeta =
                            TASK_PRIORITY_META[task.priority] || TASK_PRIORITY_META.medium
                          const isInlineEditing = inlineEditingId === task.id
                          const openPersonalEditor = () => {
                            setEditingTask(task)
                            setModalPersonalOnly(true)
                            setModalOpen(true)
                          }

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
                                  className="ui-touch mt-0.5 w-[22px] h-[22px] rounded-lg border-2 border-[var(--border-strong)] hover:border-[var(--green)] bg-[var(--bg-card)] text-transparent hover:text-[var(--green)] flex items-center justify-center shrink-0 cursor-pointer transition-all"
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
                                    <p className="hidden sm:block text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed line-clamp-2">
                                      {cleanText(task.notes)}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                <DueDateBadge
                                  dueDate={task.dueDate}
                                  dueTime={task.dueTime}
                                  reminder={task.reminder}
                                  isDone={false}
                                  now={clockNow}
                                  timeFormat={timeFormat}
                                  onClick={openPersonalEditor}
                                  title="Click to edit due date, time, or reminder"
                                />

                                {task.status && task.status !== 'not_started' && (
                                  <span
                                    style={{
                                      background: sMeta.bg,
                                      color: sMeta.color,
                                      border: `1px solid color-mix(in srgb, ${sMeta.dot} 30%, transparent)`,
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold"
                                  >
                                    <span
                                      className="w-1.5 h-1.5 rounded-full"
                                      style={{ background: sMeta.dot }}
                                    />
                                    <span>{sMeta.label}</span>
                                  </span>
                                )}

                                {task.priority && task.priority !== 'medium' && (
                                  <span
                                    style={{
                                      background: pMeta.bg,
                                      color: pMeta.color,
                                      border: `1px solid color-mix(in srgb, ${pMeta.dot} 28%, transparent)`,
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold"
                                  >
                                    <span
                                      className="w-1.5 h-1.5 rounded-full"
                                      style={{ background: pMeta.dot }}
                                    />
                                    <span>{pMeta.label}</span>
                                  </span>
                                )}

                                <div className="inline-flex items-center gap-1 sm:opacity-75 sm:group-hover:opacity-100 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={openPersonalEditor}
                                    aria-label="Edit personal to-do details"
                                    title="Edit due date, time, reminder, or priority"
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
                                        className="ui-touch w-[22px] h-[22px] rounded-lg border flex items-center justify-center shrink-0 cursor-pointer"
                                      >
                                        <Check size={13} strokeWidth={3} />
                                      </button>
                                      <span className="text-sm line-through text-[var(--text-muted)] truncate">
                                        {cleanText(task.title)}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <DueDateBadge
                                        dueDate={task.dueDate}
                                        dueTime={task.dueTime}
                                        isDone={true}
                                        now={clockNow}
                                        timeFormat={timeFormat}
                                      />
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
                    {/* Clean 1-Line To-Do Composer + Optional Structured Schedule Drawer */}
                    <form
                      onSubmit={e => handleQuickAddPersonalTask(e, pSec)}
                      className="px-2 py-2 sm:px-3 bg-[var(--bg-card)] border-t border-[var(--border-subtle)] space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-[160px]">
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
                            className="flex-1 min-w-0 min-h-[40px] px-3 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--green)]"
                          />
                        </div>

                        <div className="flex items-center gap-2 ml-auto shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              updateDraftForSection(pSec.id, { showSchedule: !draft.showSchedule })
                            }
                            className={`inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                              draft.showSchedule || hasDraftExtras
                                ? 'bg-[var(--blue-light)] border-[var(--blue)] text-[var(--blue-ink)]'
                                : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                            }`}
                          >
                            {draft.dueTime ? <Clock size={13} /> : <Calendar size={13} />}
                            <span>{draftDueSummary || 'Due date'}</span>
                            {draft.remindOffset !== 'off' && draft.dueDate && (
                              <Bell size={11} className="shrink-0" />
                            )}
                            <ChevronDown
                              size={13}
                              className={`transition-transform ${draft.showSchedule ? 'rotate-180' : ''}`}
                            />
                          </button>

                          <Button
                            variant="filled"
                            size="md"
                            type="submit"
                            disabled={quickBusy || !String(draft.title || '').trim()}
                            className="shrink-0"
                          >
                            {quickBusy ? 'Adding…' : 'Add'}
                          </Button>
                        </div>
                      </div>

                      {/* Clean, Labeled Schedule & Options Panel (only open when user clicks "Due date") */}
                      {draft.showSchedule && (
                        <div className="p-3 rounded-xl bg-[var(--bg-surface)]/55 border border-[var(--border)] space-y-2.5 fade-in">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div>
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <label className="text-[11px] font-semibold text-[var(--text-muted)]">
                                  Date
                                </label>
                                <div className="flex items-center gap-1.5 text-[10.5px]">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateDraftForSection(pSec.id, { dueDate: todayYmd })
                                    }
                                    className="font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer p-0"
                                  >
                                    Today
                                  </button>
                                  <span className="text-[var(--border-strong)]">·</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateDraftForSection(pSec.id, {
                                        dueDate: addDaysYmd(1, clockNow),
                                      })
                                    }
                                    className="font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer p-0"
                                  >
                                    Tomorrow
                                  </button>
                                </div>
                              </div>
                              <DateInputField
                                compact
                                value={draft.dueDate}
                                onChange={val => updateDraftForSection(pSec.id, { dueDate: val })}
                                ariaLabel="Due date"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                                Time
                              </label>
                              <TimePickerSelect
                                compact
                                value={draft.dueTime}
                                onChange={val => updateDraftForSection(pSec.id, { dueTime: val })}
                                timeFormat={timeFormat}
                                placeholder="All day (no time)"
                                ariaLabel="Due time"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                                Reminder (Discord / Email)
                              </label>
                              <select
                                value={String(draft.remindOffset)}
                                onChange={e => {
                                  const raw = e.target.value
                                  updateDraftForSection(pSec.id, {
                                    remindOffset: raw === 'off' ? 'off' : Number(raw),
                                  })
                                }}
                                aria-label="Reminder timing"
                                className="w-full min-h-[38px] px-3 rounded-xl bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)] cursor-pointer"
                              >
                                <option value="off">No reminder</option>
                                {REMINDER_OFFSET_OPTIONS.map(opt => (
                                  <option key={opt.value} value={String(opt.value)}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-[150px_1fr_auto] gap-2.5 items-end pt-0.5">
                            <div>
                              <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                                Priority
                              </label>
                              <select
                                value={draft.priority || 'medium'}
                                onChange={e =>
                                  updateDraftForSection(pSec.id, { priority: e.target.value })
                                }
                                aria-label="Priority"
                                className="w-full min-h-[36px] px-2.5 rounded-xl bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)] cursor-pointer"
                              >
                                {Object.entries(TASK_PRIORITY_META).map(([k, m]) => (
                                  <option key={k} value={k}>
                                    {m.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                                Note <span className="font-normal text-[var(--text-light)]">(Optional)</span>
                              </label>
                              <input
                                type="text"
                                value={draft.notes}
                                onChange={e =>
                                  updateDraftForSection(pSec.id, { notes: e.target.value })
                                }
                                placeholder="Add a short note or link…"
                                className="w-full min-h-[36px] px-3 rounded-xl bg-[var(--bg-surface)] text-xs text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                              />
                            </div>

                            <div className="flex items-center justify-end gap-2">
                              {hasDraftExtras && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateDraftForSection(pSec.id, {
                                      dueDate: '',
                                      dueTime: '',
                                      remindOffset: 'off',
                                      priority: 'medium',
                                      notes: '',
                                    })
                                  }
                                  className="px-2.5 min-h-[34px] rounded-lg bg-transparent text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--red-ink)] border-none cursor-pointer"
                                >
                                  Reset
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </form>

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
      {!notMember && boardData && showClubZone && (!loading || boardData.clubId === normSelectedClubId) && (
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
                <h3 className="text-sm font-semibold text-[var(--text)]">
                  {cleanText(selectedClub?.name || 'Club')} Shared Tasks
                </h3>
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
                  <Button
                    variant="filled"
                    size="sm"
                    type="submit"
                    disabled={actionBusy || !newSectionTitle.trim()}
                  >
                    Create Section
                  </Button>
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
              <Card key={sec.id} className="task-rows p-0" delay={2}>
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
                    <span className="text-sm font-semibold" style={{ color: accentInk }}>
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

                            {/* Right: Clean Due Date/Time Badge + Status + Priority + Actions */}
                            <div className="flex flex-wrap items-center gap-2 pl-8 lg:pl-0 shrink-0">
                              <DueDateBadge
                                dueDate={task.dueDate}
                                dueTime={task.dueTime}
                                reminder={task.reminder}
                                isDone={isDoneDisplay}
                                now={clockNow}
                                timeFormat={timeFormat}
                                onClick={
                                  effectiveTier === 'board' && isBoard
                                    ? () => {
                                        setEditingTask(task)
                                        setModalPersonalOnly(false)
                                        setModalOpen(true)
                                      }
                                    : !isDoneDisplay && task.dueDate
                                      ? () => setMemberReminderTask(task)
                                      : undefined
                                }
                                title={
                                  effectiveTier === 'board' && isBoard
                                    ? 'Edit due date, time, or reminder'
                                    : 'Configure personal reminder'
                                }
                              />

                              {!isBoard && isGeneral ? (
                                <span
                                  style={{
                                    background: sMeta.bg,
                                    color: sMeta.color,
                                    border: `1px solid color-mix(in srgb, ${sMeta.dot} 32%, transparent)`,
                                  }}
                                  className="inline-flex items-center gap-1.5 px-2.5 min-h-[28px] rounded-lg text-[11px] font-bold"
                                >
                                  <span
                                    className="w-1.5 h-1.5 rounded-full"
                                    style={{ background: sMeta.dot }}
                                  />
                                  <span>{mySelfDone ? 'Done' : 'To Do'}</span>
                                </span>
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

                              {effectiveTier === 'board' && isBoard ? (
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
                              ) : (
                                !isDoneDisplay &&
                                task.dueDate && (
                                  <button
                                    type="button"
                                    onClick={() => setMemberReminderTask(task)}
                                    aria-label={`Reminder settings for ${cleanText(task.title)}`}
                                    title="Personal reminder settings"
                                    className={`w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer transition-colors ${
                                      task.reminder?.enabled
                                        ? 'bg-[var(--blue-light)] border-[var(--blue)]/40 text-[var(--blue-ink)]'
                                        : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--blue-ink)] sm:opacity-75 sm:group-hover:opacity-100'
                                    }`}
                                  >
                                    <Bell size={13} />
                                  </button>
                                )
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
          clubOnly={isBoard && !modalPersonalOnly && !editingTask}
          clubPeople={clubPeople}
          initialTask={editingTask}
          defaultSectionId={modalDefaultSectionId}
          reminderDefaults={reminderDefaults}
          integrationSummary={integrationSummary}
          accountEmail={accountEmail || effectiveUser?.email || ''}
          timeFormat={timeFormat}
          busy={actionBusy}
          sendingReminder={Boolean(editingTask?.id && remindingTaskId === editingTask.id)}
          onSaveIntegrationChannelPrefs={handleSaveChannelPrefs}
          onSendReminderNow={t => executeTaskReminderDispatch(t, { isAutomatic: false })}
          onClose={() => {
            setModalOpen(false)
            setEditingTask(null)
            setModalPersonalOnly(false)
          }}
          onSubmit={handleModalSave}
        />
      )}

      {memberReminderTask && (
        <MemberTaskReminderModal
          task={memberReminderTask}
          reminderDefaults={reminderDefaults}
          dueLabel={
            formatSmartDueDate(
              memberReminderTask.dueDate,
              memberReminderTask.dueTime,
              false,
              { now: clockNow, timeFormat }
            )?.label || memberReminderTask.dueDate
          }
          busy={actionBusy}
          sendingNow={remindingTaskId === memberReminderTask.id}
          onSave={opts => handleSaveMemberReminder(memberReminderTask, opts)}
          onSendNow={t => executeTaskReminderDispatch(t, { isAutomatic: false })}
          onClose={() => setMemberReminderTask(null)}
        />
      )}
    </div>
  )
}
