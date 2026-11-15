// ── ClubHub Task Due-Time & Automated Discord / Email Reminder Service ──
// Backed exclusively by `server/privateDb.js` (`club_tasks.dueTime` + `club_tasks.reminderConfigJson`).
// Supports per-task opt-in reminders ("if needed") across Discord & Email, both via background
// server scheduling and on-demand manual/client triggers, with strict multi-user privacy isolation.

import { getClubById, getIntegrationConfig } from '../database.js';
import { privQueryAll, privExecute } from '../privateDb.js';
import discordService, { isMaskedValue } from './discord.js';
import emailService from './email.js';

const VALID_REMINDER_CHANNELS = new Set(['discord', 'email', 'browser']);
const MAX_OFFSET_MINUTES = 60 * 24 * 14; // up to 14 days before

function parseJsonObject(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function normalizeDueDateAndTime(rawDueDate = '', rawDueTime = '') {
  let datePart = String(rawDueDate || '').trim();
  let timePart = String(rawDueTime || '').trim();

  // Support combined ISO-like input `YYYY-MM-DDTHH:MM` seamlessly
  const combinedMatch = /^(\d{4}-\d{2}-\d{2})[T\s](\d{1,2}:\d{2})/.exec(datePart);
  if (combinedMatch) {
    datePart = combinedMatch[1];
    if (!timePart) timePart = combinedMatch[2];
  }

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : '';
  if (!validDate) {
    return { dueDate: '', dueTime: '' };
  }

  let validTime = '';
  if (timePart) {
    const tm = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(timePart);
    if (tm) {
      const hh = Number(tm[1]);
      const mm = Number(tm[2]);
      if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
        validTime = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      }
    }
  }

  return { dueDate: validDate, dueTime: validTime };
}

export function formatTime12h(hhmm = '') {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return '';
  const h24 = Number(m[1]);
  const mins = m[2];
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mins} ${period}`;
}

export function buildHumanDueLabel(dueDate = '', dueTime = '') {
  if (!dueDate) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
  if (!m) return dueDate;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const dateLabel = dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timeLabel = formatTime12h(dueTime);
  return timeLabel ? `${dateLabel} at ${timeLabel}` : dateLabel;
}

export function computeDueAndRemindIso({
  dueDate = '',
  dueTime = '',
  offsetMinutes = 60,
  clientDueAtIso = '',
  clientRemindAtIso = '',
} = {}) {
  if (!dueDate) return { dueAtIso: null, remindAtIso: null };

  const safeOffset = Math.max(0, Math.min(MAX_OFFSET_MINUTES, Math.round(Number(offsetMinutes) || 0)));

  let dueMs = NaN;
  if (clientDueAtIso) {
    const parsedClient = new Date(clientDueAtIso).getTime();
    if (!Number.isNaN(parsedClient)) {
      dueMs = parsedClient;
    }
  }

  if (Number.isNaN(dueMs)) {
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
    const effectiveTime = dueTime || '09:00';
    const tm = /^(\d{2}):(\d{2})$/.exec(effectiveTime);
    if (dm && tm) {
      const localDt = new Date(
        Number(dm[1]),
        Number(dm[2]) - 1,
        Number(dm[3]),
        Number(tm[1]),
        Number(tm[2]),
        0,
        0
      );
      dueMs = localDt.getTime();
    }
  }

  if (Number.isNaN(dueMs)) return { dueAtIso: null, remindAtIso: null };

  let remindMs = dueMs - safeOffset * 60_000;
  if (clientRemindAtIso) {
    const parsedRemind = new Date(clientRemindAtIso).getTime();
    if (!Number.isNaN(parsedRemind)) {
      remindMs = parsedRemind;
    }
  }

  return {
    dueAtIso: new Date(dueMs).toISOString(),
    remindAtIso: new Date(remindMs).toISOString(),
  };
}

export function normalizeSingleReminderEntry(
  rawInput = {},
  { dueDate = '', dueTime = '', prevEntry = {}, ownerUserId = '', reopenedFromDone = false } = {}
) {
  const input = rawInput && typeof rawInput === 'object' ? rawInput : {};
  const enabled = Boolean(input.enabled) && Boolean(dueDate);

  const rawOffset =
    input.offsetMinutes !== undefined ? Number(input.offsetMinutes) : Number(prevEntry.offsetMinutes ?? 60);
  const offsetMinutes = Number.isFinite(rawOffset)
    ? Math.max(0, Math.min(MAX_OFFSET_MINUTES, Math.round(rawOffset)))
    : 60;

  const rawChannels = Array.isArray(input.channels)
    ? input.channels
    : Array.isArray(prevEntry.channels)
      ? prevEntry.channels
      : ['discord', 'email'];
  const cleanChannels = Array.from(
    new Set(
      rawChannels
        .map(c => String(c || '').trim().toLowerCase())
        .filter(c => VALID_REMINDER_CHANNELS.has(c))
    )
  );
  const channels = cleanChannels.length > 0 ? cleanChannels : ['discord', 'email'];

  const { dueAtIso, remindAtIso } = computeDueAndRemindIso({
    dueDate,
    dueTime,
    offsetMinutes,
    clientDueAtIso: input.dueAtIso || prevEntry.dueAtIso || '',
    clientRemindAtIso: input.remindAtIso || '',
  });

  const scheduleKey = dueDate ? `${dueDate}|${dueTime || ''}|${offsetMinutes}` : '';
  const prevScheduleKey = String(prevEntry.scheduleKey || '');
  const scheduleUnchanged = Boolean(scheduleKey) && scheduleKey === prevScheduleKey;

  let sentAt = null;
  if (enabled && scheduleUnchanged && !reopenedFromDone && !input.resetSent) {
    sentAt = input.sentAt !== undefined ? input.sentAt : prevEntry.sentAt || null;
  } else if (enabled && input.markSentNow) {
    sentAt = new Date().toISOString();
  }

  const recipientEmail =
    input.recipientEmail !== undefined
      ? String(input.recipientEmail || '').trim().slice(0, 160)
      : String(prevEntry.recipientEmail || '').trim().slice(0, 160);

  const discordWebhookUrl =
    input.discordWebhookUrl !== undefined && !isMaskedValue(input.discordWebhookUrl)
      ? String(input.discordWebhookUrl || '').trim().slice(0, 320)
      : String(prevEntry.discordWebhookUrl || '').trim().slice(0, 320);

  return {
    enabled,
    offsetMinutes,
    channels,
    dueAtIso: enabled ? dueAtIso : dueAtIso || null,
    remindAtIso: enabled ? remindAtIso : null,
    scheduleKey,
    ownerUserId: ownerUserId || prevEntry.ownerUserId || '',
    recipientEmail,
    discordWebhookUrl,
    sentAt,
    lastManualSentAt: prevEntry.lastManualSentAt || null,
  };
}

export function buildUpdatedReminderConfigJson({
  existingRawJson = '{}',
  incomingReminder = undefined,
  dueDate = '',
  dueTime = '',
  actorUserId = '',
  isPersonalOrBoardOwner = true,
  reopenedFromDone = false,
} = {}) {
  const existing = parseJsonObject(existingRawJson);
  const userReminders =
    existing.userReminders && typeof existing.userReminders === 'object'
      ? { ...existing.userReminders }
      : {};

  // Non-board member setting their own private reminder on a shared club task
  if (!isPersonalOrBoardOwner && actorUserId) {
    if (incomingReminder !== undefined) {
      const prevUserEntry = userReminders[actorUserId] || {};
      userReminders[actorUserId] = normalizeSingleReminderEntry(incomingReminder, {
        dueDate,
        dueTime,
        prevEntry: prevUserEntry,
        ownerUserId: actorUserId,
        reopenedFromDone,
      });
    }
    return JSON.stringify({
      ...existing,
      userReminders,
    });
  }

  // Primary task reminder (Personal To-Do owner or Board Officer)
  const mergedInput =
    incomingReminder !== undefined
      ? incomingReminder
      : existing.enabled !== undefined
        ? existing
        : { enabled: false };

  const primary = normalizeSingleReminderEntry(mergedInput, {
    dueDate,
    dueTime,
    prevEntry: existing,
    ownerUserId: actorUserId || existing.ownerUserId || '',
    reopenedFromDone,
  });

  // Also refresh any per-user reminders on shared tasks if dueDate/dueTime changed
  for (const [uid, uEntry] of Object.entries(userReminders)) {
    if (uEntry && typeof uEntry === 'object') {
      userReminders[uid] = normalizeSingleReminderEntry(uEntry, {
        dueDate,
        dueTime,
        prevEntry: uEntry,
        ownerUserId: uid,
        reopenedFromDone,
      });
    }
  }

  return JSON.stringify({
    ...primary,
    userReminders: Object.keys(userReminders).length > 0 ? userReminders : undefined,
  });
}

export function formatTaskReminderForViewer(
  rawJson = '{}',
  { dueDate = '', dueTime = '', viewerUserId = '', createdByUserId = '' } = {}
) {
  const cfg = parseJsonObject(rawJson);
  const userEntry =
    viewerUserId && cfg.userReminders && cfg.userReminders[viewerUserId]
      ? cfg.userReminders[viewerUserId]
      : null;

  const source = userEntry || cfg;
  const isOwner = Boolean(
    viewerUserId &&
      (source.ownerUserId === viewerUserId || (!source.ownerUserId && createdByUserId === viewerUserId))
  );

  const enabled = Boolean(source.enabled) && Boolean(dueDate);
  const offsetMinutes = Number.isFinite(Number(source.offsetMinutes))
    ? Number(source.offsetMinutes)
    : 60;
  const channels = Array.isArray(source.channels) && source.channels.length > 0
    ? source.channels.filter(c => VALID_REMINDER_CHANNELS.has(c))
    : ['discord', 'email'];

  const { dueAtIso, remindAtIso } = computeDueAndRemindIso({
    dueDate,
    dueTime,
    offsetMinutes,
    clientDueAtIso: source.dueAtIso || '',
    clientRemindAtIso: source.remindAtIso || '',
  });

  return {
    enabled,
    offsetMinutes,
    channels,
    dueAtIso,
    remindAtIso: enabled ? remindAtIso : null,
    sentAt: source.sentAt || null,
    lastManualSentAt: source.lastManualSentAt || null,
    hasCustomWebhook: Boolean(source.discordWebhookUrl),
    recipientEmail: isOwner ? source.recipientEmail || '' : '',
    isPersonalOverride: Boolean(userEntry),
  };
}

function resolveSavedSubscriptionForUser(user) {
  if (!user) return {};
  const candidateKeys = [];
  if (user.externalAuthId && String(user.externalAuthId).startsWith('user_')) {
    candidateKeys.push(`sub:clerk:${user.externalAuthId}`);
  }
  if (user.email) {
    candidateKeys.push(`sub:email:${String(user.email).trim().toLowerCase()}`);
  }
  if (user.id) {
    candidateKeys.push(`sub:uid:${user.id}`);
  }
  for (const key of candidateKeys) {
    const rec = getIntegrationConfig(key)?.config;
    if (rec && (rec.discordWebhookUrl || rec.discordChannelId || rec.recipientEmail)) {
      return rec;
    }
  }
  return {};
}

export async function dispatchTaskReminderChannels({
  task,
  clubId,
  clubName = '',
  sectionTitle = '',
  targetUser = null,
  reminderEntry = {},
  channelsOverride = null,
  webhookUrlOverride = '',
  recipientEmailOverride = '',
  accountKey = '',
  url = '',
} = {}) {
  let resolvedClubName = clubName;
  if (!resolvedClubName && clubId) {
    try {
      resolvedClubName = getClubById(clubId)?.name || clubId;
    } catch {
      resolvedClubName = clubId;
    }
  }

  const subByAccountKey = accountKey
    ? getIntegrationConfig(`sub:${String(accountKey).trim().slice(0, 120)}`)?.config || {}
    : {};
  const subByUser = resolveSavedSubscriptionForUser(targetUser);
  const sub = { ...subByUser, ...subByAccountKey };

  const activeChannels = Array.isArray(channelsOverride) && channelsOverride.length > 0
    ? channelsOverride
    : Array.isArray(reminderEntry.channels) && reminderEntry.channels.length > 0
      ? reminderEntry.channels
      : ['discord', 'email'];

  const { dueAtIso } = computeDueAndRemindIso({
    dueDate: task.dueDate,
    dueTime: task.dueTime,
    offsetMinutes: reminderEntry.offsetMinutes ?? 60,
    clientDueAtIso: reminderEntry.dueAtIso || '',
  });
  const dueLabel = buildHumanDueLabel(task.dueDate, task.dueTime);

  const taskMeta = {
    id: task.id,
    title: task.title,
    notes: task.notes || '',
    priority: task.priority || 'medium',
    dueDate: task.dueDate || '',
    dueTime: task.dueTime || '',
    dueAtIso,
    dueLabel,
    visibility: task.visibility || 'members',
    isPersonal: task.visibility === 'personal',
    sectionTitle:
      sectionTitle ||
      (task.visibility === 'personal' ? 'My To-Do List' : 'Club Task Board'),
  };

  const results = {};
  let anyDelivered = false;

  if (activeChannels.includes('discord')) {
    const effectiveWebhook =
      (webhookUrlOverride && !isMaskedValue(webhookUrlOverride) ? webhookUrlOverride : '') ||
      reminderEntry.discordWebhookUrl ||
      sub.discordWebhookUrl ||
      undefined;
    const effectiveChannelId = sub.discordChannelId || undefined;

    try {
      const dRes = await discordService.sendDiscordNotification({
        kind: 'task_reminder',
        webhookUrl: effectiveWebhook,
        channelId: effectiveChannelId,
        clubName: resolvedClubName || 'ClubHub',
        title: task.title,
        message: task.notes || '',
        url,
        task: taskMeta,
      });
      results.discord = { ok: true, via: dRes.via || 'discord' };
      anyDelivered = true;
    } catch (err) {
      results.discord = { ok: false, error: err?.message || 'Discord not configured' };
    }
  }

  if (activeChannels.includes('email')) {
    const toEmail =
      String(
        recipientEmailOverride ||
          reminderEntry.recipientEmail ||
          sub.recipientEmail ||
          targetUser?.email ||
          ''
      ).trim();

    if (!toEmail) {
      results.email = { ok: false, error: 'No recipient email address configured.' };
    } else {
      try {
        const eRes = await emailService.sendNotification({
          kind: 'task_reminder',
          to: toEmail,
          clubName: resolvedClubName || 'ClubHub',
          title: task.title,
          message: task.notes || '',
          url,
          task: taskMeta,
        });
        results.email = { ok: true, via: eRes.via || 'email', to: eRes.to };
        anyDelivered = true;
      } catch (err) {
        results.email = { ok: false, error: err?.message || 'Email transport not configured' };
      }
    }
  }

  return {
    anyDelivered,
    results,
    dueLabel,
    dueAtIso,
  };
}

/**
 * Checks all open tasks with enabled reminders whose `remindAtIso <= now`.
 * Dispatches configured Discord / Email reminders and stamps `sentAt` when delivered
 * (or when `markSentEvenIfUnconfigured` is requested by a client that handled local delivery).
 */
export async function checkAndDispatchDueTaskReminders({
  onlyUserId = '',
  accountKey = '',
  now = new Date(),
  markSentOnAttempt = false,
} = {}) {
  const nowMs = now.getTime();
  const nowIso = now.toISOString();

  const rows = await privQueryAll(
    `SELECT t.*, u.email AS creatorEmail, u.fullName AS creatorFullName, u.externalAuthId AS creatorExternalAuthId
       FROM club_tasks t
       LEFT JOIN users u ON u.id = t.createdByUserId
      WHERE t.status != 'done' AND t.dueDate != '' AND t.reminderConfigJson != '{}'`
  );

  const dueEvents = [];

  for (const row of rows) {
    const cfg = parseJsonObject(row.reminderConfigJson);
    let mutated = false;

    // 1. Check primary reminder entry
    const primaryOwnerId = cfg.ownerUserId || row.createdByUserId || '';
    if (
      cfg.enabled &&
      !cfg.sentAt &&
      (!onlyUserId || primaryOwnerId === onlyUserId || row.createdByUserId === onlyUserId)
    ) {
      const { dueAtIso, remindAtIso } = computeDueAndRemindIso({
        dueDate: row.dueDate,
        dueTime: row.dueTime,
        offsetMinutes: cfg.offsetMinutes ?? 60,
        clientDueAtIso: cfg.dueAtIso || '',
        clientRemindAtIso: cfg.remindAtIso || '',
      });
      const remindMs = remindAtIso ? new Date(remindAtIso).getTime() : NaN;
      if (!Number.isNaN(remindMs) && remindMs <= nowMs) {
        const ownerUser = {
          id: primaryOwnerId,
          email: row.creatorEmail || '',
          fullName: row.creatorFullName || row.createdByName || '',
          externalAuthId: row.creatorExternalAuthId || null,
        };
        const dispatchOut = await dispatchTaskReminderChannels({
          task: row,
          clubId: row.clubId,
          targetUser: ownerUser,
          reminderEntry: cfg,
          accountKey: onlyUserId && primaryOwnerId === onlyUserId ? accountKey : '',
        });

        const browserOnly =
          Array.isArray(cfg.channels) &&
          cfg.channels.length === 1 &&
          cfg.channels[0] === 'browser';

        if (dispatchOut.anyDelivered || markSentOnAttempt || browserOnly) {
          cfg.sentAt = nowIso;
          mutated = true;
        }

        dueEvents.push({
          taskId: row.id,
          clubId: row.clubId,
          title: row.title,
          dueDate: row.dueDate,
          dueTime: row.dueTime || '',
          dueAtIso,
          remindAtIso,
          dueLabel: dispatchOut.dueLabel,
          channels: cfg.channels || ['discord', 'email'],
          deliveredOnServer: dispatchOut.anyDelivered,
          sentAt: cfg.sentAt || null,
          results: dispatchOut.results,
        });
      }
    }

    // 2. Check per-member overrides on shared tasks
    if (cfg.userReminders && typeof cfg.userReminders === 'object') {
      for (const [uid, uEntry] of Object.entries(cfg.userReminders)) {
        if (!uEntry?.enabled || uEntry.sentAt) continue;
        if (onlyUserId && uid !== onlyUserId) continue;

        const { dueAtIso, remindAtIso } = computeDueAndRemindIso({
          dueDate: row.dueDate,
          dueTime: row.dueTime,
          offsetMinutes: uEntry.offsetMinutes ?? 60,
          clientDueAtIso: uEntry.dueAtIso || '',
          clientRemindAtIso: uEntry.remindAtIso || '',
        });
        const remindMs = remindAtIso ? new Date(remindAtIso).getTime() : NaN;
        if (!Number.isNaN(remindMs) && remindMs <= nowMs) {
          const [uRow] = await privQueryAll(`SELECT * FROM users WHERE id = ?`, [uid]);
          const dispatchOut = await dispatchTaskReminderChannels({
            task: row,
            clubId: row.clubId,
            targetUser: uRow || { id: uid },
            reminderEntry: uEntry,
            accountKey: onlyUserId && uid === onlyUserId ? accountKey : '',
          });

          const browserOnly =
            Array.isArray(uEntry.channels) &&
            uEntry.channels.length === 1 &&
            uEntry.channels[0] === 'browser';

          if (dispatchOut.anyDelivered || markSentOnAttempt || browserOnly) {
            cfg.userReminders[uid] = { ...uEntry, sentAt: nowIso };
            mutated = true;
          }

          dueEvents.push({
            taskId: row.id,
            clubId: row.clubId,
            title: row.title,
            dueDate: row.dueDate,
            dueTime: row.dueTime || '',
            dueAtIso,
            remindAtIso,
            dueLabel: dispatchOut.dueLabel,
            channels: uEntry.channels || ['discord', 'email'],
            deliveredOnServer: dispatchOut.anyDelivered,
            sentAt: cfg.userReminders[uid]?.sentAt || null,
            results: dispatchOut.results,
          });
        }
      }
    }

    if (mutated) {
      await privExecute(
        `UPDATE club_tasks SET reminderConfigJson = ?, updatedAt = ? WHERE id = ?`,
        [JSON.stringify(cfg), nowIso, row.id]
      );
    }
  }

  return {
    checkedAt: nowIso,
    dueCount: dueEvents.length,
    dueReminders: dueEvents,
  };
}

let schedulerInterval = null;

export function startTaskReminderScheduler({ intervalMs = 45_000 } = {}) {
  if (schedulerInterval) return schedulerInterval;
  schedulerInterval = setInterval(() => {
    checkAndDispatchDueTaskReminders().catch(err => {
      console.error('Task reminder scheduler error:', err?.message || err);
    });
  }, intervalMs);
  if (typeof schedulerInterval.unref === 'function') {
    schedulerInterval.unref();
  }
  return schedulerInterval;
}
