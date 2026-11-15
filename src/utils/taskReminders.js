// ── Task Board Persistent Preferences, Time-Aware Due Dates & Reminder Engine ──

export const TASK_BOARD_PREFS_KEY_PREFIX = 'clubhub_task_board_prefs_v1'
export const SENT_TASK_REMINDERS_LEDGER_KEY = 'clubhub_sent_task_reminders_v1'

const VALID_FOCUS_TABS = new Set(['all', 'personal', 'club'])
const VALID_KPI_FILTERS = new Set(['', 'stuck', 'overdue'])
const VALID_STATUS_FILTERS = new Set([
  'all',
  'not_started',
  'working_on_it',
  'in_review',
  'stuck',
  'done',
])
const VALID_PRIORITY_FILTERS = new Set(['all', 'low', 'medium', 'high', 'critical'])
const VALID_CHANNELS = new Set(['discord', 'email', 'browser'])

export const REMINDER_OFFSET_OPTIONS = [
  { value: 0, label: 'At due time', shortLabel: 'At due time' },
  { value: 15, label: '15 min before', shortLabel: '15m before' },
  { value: 60, label: '1 hour before', shortLabel: '1h before' },
  { value: 180, label: '3 hours before', shortLabel: '3h before' },
  { value: 1440, label: '1 day before', shortLabel: '1d before' },
]

export const DEFAULT_REMINDER_PREFS = {
  autoRemindTimedTasks: false,
  defaultOffsetMinutes: 60,
  defaultChannels: ['discord', 'email'],
  browserAlertsEnabled: false,
}

export const DEFAULT_TASK_BOARD_PREFS = {
  selectedClubId: '',
  focusTab: 'all',
  viewTiersByClub: {},
  searchQuery: '',
  onlyAssignedToMe: false,
  hideDone: false,
  kpiQuickFilter: '',
  showAdvancedFilters: false,
  statusFilter: 'all',
  priorityFilter: 'all',
  groupFilter: 'all',
  collapsedSections: {},
  showCompletedPersonal: {},
  reminderDefaults: DEFAULT_REMINDER_PREFS,
}

export function getTaskBoardPrefsStorageKey(accountKey = 'guest') {
  return `${TASK_BOARD_PREFS_KEY_PREFIX}:${String(accountKey || 'guest').trim() || 'guest'}`
}

function sanitizeBoolMap(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'boolean') out[k] = v
  }
  return out
}

function sanitizeTierMap(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === 'board' || v === 'member') out[k] = v
  }
  return out
}

export function normalizeReminderPrefs(raw = {}) {
  const input = raw && typeof raw === 'object' ? raw : {}
  const rawChannels = Array.isArray(input.defaultChannels)
    ? input.defaultChannels
    : DEFAULT_REMINDER_PREFS.defaultChannels
  const cleanChannels = Array.from(
    new Set(
      rawChannels
        .map(c => String(c || '').trim().toLowerCase())
        .filter(c => VALID_CHANNELS.has(c))
    )
  )
  const rawOffset = Number(input.defaultOffsetMinutes)
  return {
    autoRemindTimedTasks: Boolean(input.autoRemindTimedTasks),
    defaultOffsetMinutes: Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.round(rawOffset) : 60,
    defaultChannels: cleanChannels.length > 0 ? cleanChannels : ['discord', 'email'],
    browserAlertsEnabled: Boolean(input.browserAlertsEnabled),
  }
}

export function readTaskBoardPrefs(accountKey = 'guest', storage = globalThis?.localStorage) {
  if (!storage || accountKey === 'demo') {
    return {
      ...DEFAULT_TASK_BOARD_PREFS,
      reminderDefaults: { ...DEFAULT_REMINDER_PREFS },
    }
  }
  try {
    const raw = storage.getItem(getTaskBoardPrefsStorageKey(accountKey))
    if (!raw) {
      return {
        ...DEFAULT_TASK_BOARD_PREFS,
        reminderDefaults: { ...DEFAULT_REMINDER_PREFS },
      }
    }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      return {
        ...DEFAULT_TASK_BOARD_PREFS,
        reminderDefaults: { ...DEFAULT_REMINDER_PREFS },
      }
    }
    return {
      selectedClubId: typeof parsed.selectedClubId === 'string' ? parsed.selectedClubId : '',
      focusTab: VALID_FOCUS_TABS.has(parsed.focusTab) ? parsed.focusTab : 'all',
      viewTiersByClub: sanitizeTierMap(parsed.viewTiersByClub),
      searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery.slice(0, 120) : '',
      onlyAssignedToMe: Boolean(parsed.onlyAssignedToMe),
      hideDone: Boolean(parsed.hideDone),
      kpiQuickFilter: VALID_KPI_FILTERS.has(parsed.kpiQuickFilter) ? parsed.kpiQuickFilter : '',
      showAdvancedFilters: Boolean(parsed.showAdvancedFilters),
      statusFilter: VALID_STATUS_FILTERS.has(parsed.statusFilter) ? parsed.statusFilter : 'all',
      priorityFilter: VALID_PRIORITY_FILTERS.has(parsed.priorityFilter)
        ? parsed.priorityFilter
        : 'all',
      groupFilter: typeof parsed.groupFilter === 'string' && parsed.groupFilter ? parsed.groupFilter : 'all',
      collapsedSections: sanitizeBoolMap(parsed.collapsedSections),
      showCompletedPersonal: sanitizeBoolMap(parsed.showCompletedPersonal),
      reminderDefaults: normalizeReminderPrefs(parsed.reminderDefaults),
    }
  } catch {
    return {
      ...DEFAULT_TASK_BOARD_PREFS,
      reminderDefaults: { ...DEFAULT_REMINDER_PREFS },
    }
  }
}

export function writeTaskBoardPrefs(
  accountKey = 'guest',
  prefs = {},
  storage = globalThis?.localStorage
) {
  if (!storage || accountKey === 'demo') return
  try {
    const prev = readTaskBoardPrefs(accountKey, storage)
    const merged = {
      ...prev,
      ...prefs,
      // Preserve last non-empty selectedClubId if caller hasn't hydrated memberClubs yet
      selectedClubId:
        prefs.selectedClubId !== undefined && prefs.selectedClubId !== ''
          ? String(prefs.selectedClubId)
          : prev.selectedClubId || '',
      reminderDefaults: normalizeReminderPrefs(
        prefs.reminderDefaults !== undefined ? prefs.reminderDefaults : prev.reminderDefaults
      ),
    }
    storage.setItem(getTaskBoardPrefsStorageKey(accountKey), JSON.stringify(merged))
  } catch {
    // Ignore storage quota errors
  }
}

export function clearTaskBoardPrefsForAccount(
  accountKey = 'guest',
  storage = globalThis?.localStorage
) {
  if (!storage) return
  try {
    storage.removeItem(getTaskBoardPrefsStorageKey(accountKey))
  } catch {
    // Ignore storage errors
  }
}

export function getLocalYmd(dateObj = new Date()) {
  const y = dateObj.getFullYear()
  const m = String(dateObj.getMonth() + 1).padStart(2, '0')
  const d = String(dateObj.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDaysYmd(days, baseDate = new Date()) {
  const dt = new Date(baseDate.getTime())
  dt.setDate(dt.getDate() + days)
  return getLocalYmd(dt)
}

export function normalizeTime24h(rawTime = '') {
  const s = String(rawTime || '').trim()
  if (!s) return ''
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s)
  if (!m) return ''
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return ''
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export function formatClockTime(hhmm = '', timeFormat = '12h') {
  const clean = normalizeTime24h(hhmm)
  if (!clean) return ''
  const [hStr, mStr] = clean.split(':')
  const h24 = Number(hStr)
  if (timeFormat === '24h') return `${String(h24).padStart(2, '0')}:${mStr}`
  const period = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${mStr} ${period}`
}

export function computeTaskDueDateObj(dueDate = '', dueTime = '', fallbackHour = 9) {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dueDate || '').trim())
  if (!dm) return null
  const cleanTime = normalizeTime24h(dueTime)
  if (cleanTime) {
    const [hStr, mStr] = cleanTime.split(':')
    return new Date(
      Number(dm[1]),
      Number(dm[2]) - 1,
      Number(dm[3]),
      Number(hStr),
      Number(mStr),
      0,
      0
    )
  }
  return new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), fallbackHour, 0, 0, 0)
}

export function isTaskOverdue(task, now = new Date()) {
  if (!task?.dueDate || task.status === 'done') return false
  const cleanTime = normalizeTime24h(task.dueTime)
  if (cleanTime) {
    const target = computeTaskDueDateObj(task.dueDate, cleanTime)
    return Boolean(target && target.getTime() < now.getTime())
  }
  return String(task.dueDate) < getLocalYmd(now)
}

export function formatSmartDueDate(
  ymd,
  dueTimeOrIsDone = '',
  maybeIsDone = false,
  options = {}
) {
  if (!ymd) return null

  // Backwards-compatible 2-arg call: `formatSmartDueDate(dueDate, isDone)`
  let dueTime = ''
  let isDone = false
  if (typeof dueTimeOrIsDone === 'boolean') {
    isDone = dueTimeOrIsDone
  } else {
    dueTime = normalizeTime24h(dueTimeOrIsDone)
    isDone = Boolean(maybeIsDone)
  }

  const now = options.now instanceof Date ? options.now : new Date()
  const timeFormat = options.timeFormat || '12h'
  const timeLabel = dueTime ? formatClockTime(dueTime, timeFormat) : ''

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd).trim())
  if (!match) {
    return { label: timeLabel ? `${ymd} · ${timeLabel}` : String(ymd), tone: 'neutral' }
  }

  const targetDay = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.round((targetDay.getTime() - todayDay.getTime()) / 86400000)

  if (isDone) {
    const baseLabel = targetDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return {
      label: timeLabel ? `${baseLabel} · ${timeLabel}` : baseLabel,
      tone: 'done',
    }
  }

  if (dueTime) {
    const exactTarget = computeTaskDueDateObj(ymd, dueTime)
    const diffMs = exactTarget.getTime() - now.getTime()
    const diffMins = Math.round(diffMs / 60000)

    if (diffMs < 0) {
      const absMins = Math.abs(diffMins)
      if (absMins < 60) {
        return {
          label: `Overdue · ${Math.max(1, absMins)}m ago`,
          tone: 'overdue',
        }
      }
      const absHours = Math.round(absMins / 60)
      if (absHours < 24 && diffDays >= -1) {
        return {
          label: `${absHours}h overdue · ${timeLabel}`,
          tone: 'overdue',
        }
      }
      const absDays = Math.max(1, Math.abs(diffDays))
      return {
        label: `${absDays}d overdue · ${timeLabel}`,
        tone: 'overdue',
      }
    }

    if (diffMins <= 60) {
      return {
        label: diffMins <= 1 ? `Due now · ${timeLabel}` : `Due in ${diffMins}m · ${timeLabel}`,
        tone: 'soon',
      }
    }
    if (diffDays === 0) {
      return { label: `Today · ${timeLabel}`, tone: 'soon' }
    }
    if (diffDays === 1) {
      return { label: `Tomorrow · ${timeLabel}`, tone: 'soon' }
    }
    if (diffDays <= 6) {
      const weekdayDate = targetDay.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
      return { label: `${weekdayDate} · ${timeLabel}`, tone: 'upcoming' }
    }
    const futureDate = targetDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return { label: `${futureDate} · ${timeLabel}`, tone: 'neutral' }
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
      label: targetDay.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      tone: 'upcoming',
    }
  }
  return {
    label: targetDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    tone: 'neutral',
  }
}

export function formatReminderOffsetLabel(offsetMinutes = 60, short = false) {
  const num = Number(offsetMinutes)
  const found = REMINDER_OFFSET_OPTIONS.find(o => o.value === num)
  if (found) return short ? found.shortLabel : found.label
  if (num <= 0) return 'At due time'
  if (num < 60) return `${num}m before`
  if (num % 1440 === 0) {
    const days = num / 1440
    return short ? `${days}d before` : `${days} ${days === 1 ? 'day' : 'days'} before`
  }
  if (num % 60 === 0) {
    const hrs = num / 60
    return short ? `${hrs}h before` : `${hrs} ${hrs === 1 ? 'hour' : 'hours'} before`
  }
  return `${num}m before`
}

export function buildClientReminderPayload({
  enabled = false,
  dueDate = '',
  dueTime = '',
  offsetMinutes = 60,
  channels = ['discord', 'email'],
  recipientEmail = '',
  discordWebhookUrl = '',
} = {}) {
  const cleanDate = /^\d{4}-\d{2}-\d{2}$/.test(String(dueDate || '').trim())
    ? String(dueDate).trim()
    : ''
  const cleanTime = normalizeTime24h(dueTime)
  const isEnabled = Boolean(enabled) && Boolean(cleanDate)
  const safeOffset = Number.isFinite(Number(offsetMinutes)) ? Math.max(0, Math.round(Number(offsetMinutes))) : 60
  const cleanChannels = Array.from(
    new Set(
      (Array.isArray(channels) ? channels : ['discord', 'email'])
        .map(c => String(c || '').trim().toLowerCase())
        .filter(c => VALID_CHANNELS.has(c))
    )
  )

  let dueAtIso = null
  let remindAtIso = null
  if (cleanDate) {
    // When no specific time is chosen, schedule reminders relative to 9:00 AM local time on dueDate
    const dueDt = computeTaskDueDateObj(cleanDate, cleanTime, 9)
    if (dueDt && !Number.isNaN(dueDt.getTime())) {
      dueAtIso = dueDt.toISOString()
      if (isEnabled) {
        remindAtIso = new Date(dueDt.getTime() - safeOffset * 60_000).toISOString()
      }
    }
  }

  return {
    enabled: isEnabled,
    offsetMinutes: safeOffset,
    channels: cleanChannels.length > 0 ? cleanChannels : ['discord', 'email'],
    dueAtIso,
    remindAtIso,
    ...(recipientEmail ? { recipientEmail: String(recipientEmail).trim() } : {}),
    ...(discordWebhookUrl ? { discordWebhookUrl: String(discordWebhookUrl).trim() } : {}),
  }
}

export function makeReminderLedgerKey(task) {
  if (!task?.id) return ''
  const offset = task.reminder?.offsetMinutes ?? 60
  return `${task.id}::${task.dueDate || ''}::${task.dueTime || ''}::${offset}`
}

export function hasLocalReminderFired(task, storage = globalThis?.localStorage) {
  if (task?.reminder?.sentAt) return true
  if (!storage) return false
  const key = makeReminderLedgerKey(task)
  if (!key) return false
  try {
    const map = JSON.parse(storage.getItem(SENT_TASK_REMINDERS_LEDGER_KEY) || '{}')
    return Boolean(map[key])
  } catch {
    return false
  }
}

export function markLocalReminderFired(task, storage = globalThis?.localStorage) {
  if (!storage) return
  const key = makeReminderLedgerKey(task)
  if (!key) return
  try {
    const map = JSON.parse(storage.getItem(SENT_TASK_REMINDERS_LEDGER_KEY) || '{}')
    const entries = Object.entries(map)
    // Cap ledger at 250 recent entries so localStorage stays tiny
    const trimmed = entries.length > 250 ? Object.fromEntries(entries.slice(-200)) : map
    trimmed[key] = new Date().toISOString()
    storage.setItem(SENT_TASK_REMINDERS_LEDGER_KEY, JSON.stringify(trimmed))
  } catch {
    // Ignore storage errors
  }
}
