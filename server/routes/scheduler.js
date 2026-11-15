// ── Collaborative When2Meet + Club Leadership Scheduler Routes (/api/scheduler) ──
// Backed exclusively by `server/privateDb.js` (`club_polls` & `club_poll_responses`).
// Guarantees:
//   1. ZERO fake/demo responders — only authenticated real users who submit availability appear.
//   2. ZERO private user availability data ever enters `clubhub.db` or `public/clubhub-data.json`.
//   3. Club leadership shortcuts (`all_board`, `all_members`, `everyone`, `group:<id>`) verified via RBAC.

import crypto from 'node:crypto';
import { Router } from 'express';
import {
  getDb,
  upsertCollectorData,
  deleteRecord,
  formatEventRow,
} from '../database.js';
import {
  privQueryAll,
  privQueryGet,
  privExecute,
  privBatch,
} from '../privateDb.js';
import { deletePollFromSupabase } from '../services/supabaseCloudPersistence.js';
import {
  normalizeClubKey,
  normalizeEmail,
  getClubPermission,
  getUserWorkspaceOverview,
} from '../services/authService.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import {
  buildClubPeopleAndShortcuts,
  expandShortcutTargets,
} from './workspace.js';

const router = Router();

function parseJsonSafe(raw, fallback) {
  if (!raw) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function getDefaultWeekDates() {
  return [
    '2026-11-16',
    '2026-11-17',
    '2026-11-18',
    '2026-11-19',
    '2026-11-20',
    '2026-11-21',
    '2026-11-22',
  ];
}

export function localSlotToUtcIso(dateStr, hour, minute, timeZone = 'America/Los_Angeles') {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const approxUtc = new Date(Date.UTC(y, m - 1, d, hour, minute, 0, 0));
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(approxUtc);

    const map = {};
    for (const p of parts) map[p.type] = p.value;
    const tzHour = Number(map.hour) === 24 ? 0 : Number(map.hour);
    const tzAsUtc = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      tzHour,
      Number(map.minute),
      0,
      0
    );
    const offsetMs = tzAsUtc - approxUtc.getTime();
    return new Date(approxUtc.getTime() - offsetMs).toISOString();
  } catch {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, hour + 8, minute, 0, 0)).toISOString();
  }
}

function makeSlotsRange(dateStr, startH, endH, timeZone = 'America/Los_Angeles') {
  const out = [];
  for (let mins = Math.round(startH * 60); mins < Math.round(endH * 60); mins += 30) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    out.push(localSlotToUtcIso(dateStr, h, m, timeZone));
  }
  return out;
}

export function parseAvailabilityText(text = '', dates = [], timeZone = 'America/Los_Angeles') {
  const freeSlots = new Set();
  const busySlots = new Set();

  if (!text.trim() || !dates.length) {
    return { freeSlots: [], busySlots: [] };
  }

  const dayToDate = {};
  for (const dateStr of dates) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
      .toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
      .toLowerCase()
      .slice(0, 3);
    dayToDate[weekday] = dateStr;
  }

  const segments = text.split(/[;\n]+/);
  for (const seg of segments) {
    let mode = 'free';
    if (
      /\b(busy|unavailable|class|conflict|cannot|can't)\b/i.test(seg) &&
      !/^\s*(free|available)/i.test(seg)
    ) {
      mode = 'busy';
    }

    const regex =
      /\b(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|\d{4}-\d{2}-\d{2})\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:[-–to]+)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi;

    let match;
    while ((match = regex.exec(seg)) !== null) {
      const [, dayToken, shRaw, smRaw, sMeridiem, ehRaw, emRaw, eMeridiem] = match;
      const dateStr = dayToken.includes('-')
        ? dayToken
        : dayToDate[dayToken.toLowerCase().slice(0, 3)];
      if (!dateStr) continue;

      const toHours = (hStr, mStr, mer, fallbackMer) => {
        let h = parseInt(hStr, 10);
        const m = mStr ? parseInt(mStr, 10) : 0;
        const effectiveMer = (mer || fallbackMer || '').toLowerCase();
        if (effectiveMer === 'pm' && h < 12) h += 12;
        if (effectiveMer === 'am' && h === 12) h = 0;
        return h + m / 60;
      };

      const startHour = toHours(shRaw, smRaw, sMeridiem, eMeridiem);
      const endHour = toHours(ehRaw, emRaw, eMeridiem, sMeridiem);

      if (endHour > startHour) {
        const slots = makeSlotsRange(dateStr, startHour, endHour, timeZone);
        for (const s of slots) {
          if (mode === 'busy') {
            busySlots.add(s);
            freeSlots.delete(s);
          } else {
            freeSlots.add(s);
            busySlots.delete(s);
          }
        }
      }
    }
  }

  return {
    freeSlots: Array.from(freeSlots),
    busySlots: Array.from(busySlots),
  };
}

function getCampusCalendarEvents() {
  try {
    const db = getDb();
    return db
      .stmt('SELECT * FROM events ORDER BY start ASC LIMIT 500')
      .all()
      .map(formatEventRow);
  } catch {
    return [];
  }
}

async function isUserPollCreator(pollRow, user) {
  if (!pollRow || !user?.id) return false;
  if (pollRow.createdByUserId) {
    if (pollRow.createdByUserId === user.id) return true;
    if (user.externalAuthId && pollRow.createdByUserId === user.externalAuthId) return true;
    if (user.email) {
      const creatorUser = await privQueryGet(
        `SELECT email, externalAuthId FROM users WHERE id = ?`,
        [pollRow.createdByUserId]
      );
      if (creatorUser) {
        if (
          creatorUser.email &&
          normalizeEmail(creatorUser.email) === normalizeEmail(user.email)
        ) {
          return true;
        }
        if (
          user.externalAuthId &&
          creatorUser.externalAuthId &&
          creatorUser.externalAuthId === user.externalAuthId
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

async function canUserAccessPoll(pollRow, user, explicitById = false) {
  const vis = pollRow.visibility || 'public_link';
  if (vis === 'public_link' && explicitById) return true;
  if (await isUserPollCreator(pollRow, user)) return true;

  // Check if user was explicitly invited by userId or email
  if (user) {
    const invited = parseJsonSafe(pollRow.invitedParticipantsJson, []);
    const userEmail = normalizeEmail(user.email);
    const isInvited = invited.some(
      p => (p.userId && p.userId === user.id) || (p.email && normalizeEmail(p.email) === userEmail)
    );
    if (isInvited && vis !== 'board_only') return true;
  }

  if (!pollRow.hostClubId) {
    return vis === 'public_link';
  }

  const perm = await getClubPermission(user, pollRow.hostClubId);
  if (vis === 'board_only') return Boolean(perm.isBoard);
  if (vis === 'club_members') return Boolean(perm.isMember || perm.isBoard);
  // For public_link in list view: show if public_link and either general poll or user is in club / responded
  return true;
}

async function formatFullPoll(row, requesterUser = null, campusEvents = null, requesterClubIds = null) {
  if (!row) return null;
  const hostPerm = row.hostClubId
    ? await getClubPermission(requesterUser, row.hostClubId)
    : { isBoard: false };
  const isCreator = await isUserPollCreator(row, requesterUser);
  const canSeeEmails = Boolean(hostPerm.isBoard || isCreator);

  let myClubIds = requesterClubIds;
  if (!myClubIds) {
    if (requesterUser) {
      const overview = await getUserWorkspaceOverview(requesterUser);
      myClubIds = new Set(Object.keys(overview?.permissionsByClub || {}));
    } else {
      myClubIds = new Set();
    }
  }

  const responseRows = await privQueryAll(
    `SELECT r.*
       FROM club_poll_responses r
       INNER JOIN users u ON u.id = r.userId
      WHERE r.pollId = ?
      ORDER BY r.updatedAt DESC`,
    [row.id]
  );

  const responses = responseRows.map(r => ({
    id: r.id,
    pollId: r.pollId,
    userId: r.userId,
    userName: r.userName,
    roleTitle: r.roleTitle || '',
    clubId: r.clubId || '',
    clubName: r.clubName || '',
    timezone: r.timezone || 'America/Los_Angeles',
    freeSlots: parseJsonSafe(r.freeSlotsJson, []),
    busySlots: parseJsonSafe(r.busySlotsJson, []),
    rawTextInput: r.rawTextInput || '',
    updatedAt: r.updatedAt,
    isVerifiedUser: true,
  }));

  const respondedUserIds = new Set(responses.map(r => r.userId));
  const respondedNamesLower = new Set(
    responses.map(r => String(r.userName || '').trim().toLowerCase())
  );

  const rawInvited = parseJsonSafe(row.invitedParticipantsJson, []);
  const candidateUserIds = rawInvited.map(inv => inv?.userId).filter(Boolean);
  let validUserIdSet = new Set();
  if (candidateUserIds.length > 0) {
    const placeholders = candidateUserIds.map(() => '?').join(',');
    const existingUsers = await privQueryAll(
      `SELECT id FROM users WHERE id IN (${placeholders})`,
      candidateUserIds
    );
    validUserIdSet = new Set(existingUsers.map(u => u.id));
  }

  const invitedParticipants = rawInvited
    .filter(inv => !inv?.userId || validUserIdSet.has(inv.userId))
    .map(inv => {
      const hasResponded = Boolean(
        (inv.userId && respondedUserIds.has(inv.userId)) ||
          (inv.name && respondedNamesLower.has(String(inv.name).trim().toLowerCase()))
      );
      return {
        memberKey: inv.memberKey || inv.userId || inv.name,
        userId: inv.userId || null,
        name: inv.name,
        initials: inv.initials || '',
        email: canSeeEmails ? inv.email || '' : '',
        roleTitle: inv.roleTitle || 'Member',
        tier: inv.tier || 'member',
        sourceShortcut: inv.sourceShortcut || '',
        hasResponded,
      };
    });

  const privateBookedEvents = parseJsonSafe(row.bookedEventsJson, []);
  const rawCampusEvents = myClubIds.size > 0 ? campusEvents ?? getCampusCalendarEvents() : [];
  const sharedEvents =
    myClubIds.size > 0
      ? rawCampusEvents.filter(ev => ev?.clubId && myClubIds.has(normalizeClubKey(ev.clubId)))
      : [];

  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    hostClubId: row.hostClubId || '',
    hostClubName: row.hostClubName || '',
    collaboratingClubs: parseJsonSafe(row.collaboratingClubsJson, []),
    dates: parseJsonSafe(row.datesJson, []),
    startHour: Number(row.startHour ?? 9),
    endHour: Number(row.endHour ?? 20),
    slotMinutes: Number(row.slotMinutes ?? 30),
    baseTimezone: row.baseTimezone || 'America/Los_Angeles',
    location: row.location || 'TBD',
    visibility: row.visibility || 'public_link',
    archived: Boolean(row.archived),
    archivedAt: row.archivedAt || null,
    isCreator,
    createdByUserId: row.createdByUserId || null,
    createdByName: row.createdByName || '',
    createdAt: row.createdAt,
    invitedParticipants,
    responses,
    calendarEvents: myClubIds.size > 0 ? [...privateBookedEvents, ...sharedEvents] : privateBookedEvents,
  };
}

// GET /api/scheduler/polls — list real polls visible to the signed-in user (ZERO fake demo polls!)
router.get('/polls', optionalAuth, async (req, res) => {
  const includeArchived =
    req.query?.includeArchived === '1' || req.query?.includeArchived === 'true';
  const rows = await privQueryAll(`SELECT * FROM club_polls ORDER BY createdAt DESC LIMIT 50`);
  const overview = req.user ? await getUserWorkspaceOverview(req.user) : null;
  const myClubIds = new Set(Object.keys(overview?.permissionsByClub || {}));
  const campusEvents = myClubIds.size > 0 ? getCampusCalendarEvents() : [];

  // Also include polls the user has already responded to
  const myRespondedPollIds = new Set();
  if (req.user?.id) {
    const myResps = await privQueryAll(
      `SELECT pollId FROM club_poll_responses WHERE userId = ?`,
      [req.user.id]
    );
    for (const r of myResps) myRespondedPollIds.add(r.pollId);
  }

  const visiblePolls = [];
  for (const row of rows) {
    const isArchived = Boolean(row.archived);
    if (isArchived) {
      if (!includeArchived || !(await isUserPollCreator(row, req.user))) {
        continue;
      }
    }
    if (!(await canUserAccessPoll(row, req.user, false))) continue;
    // Scope list view to polls created by user, responded by user, invited user, or belonging to user's clubs (or general campus polls if no hostClubId)
    if (req.user) {
      const invited = parseJsonSafe(row.invitedParticipantsJson, []);
      const userEmail = normalizeEmail(req.user.email);
      const isInvited = invited.some(
        p => (p.userId && p.userId === req.user.id) || (p.email && normalizeEmail(p.email) === userEmail)
      );
      const isMine = row.createdByUserId === req.user.id;
      const isMyClub = row.hostClubId && myClubIds.has(row.hostClubId);
      const isResponded = myRespondedPollIds.has(row.id);
      if (isMine || isMyClub || isInvited || isResponded || !row.hostClubId) {
        visiblePolls.push(await formatFullPoll(row, req.user, campusEvents, myClubIds));
      }
    } else if (!row.hostClubId && row.visibility === 'public_link') {
      visiblePolls.push(await formatFullPoll(row, null, [], new Set()));
    }
  }

  res.json(visiblePolls);
});

// GET /api/scheduler/polls/:id — single poll (supports shared `?poll=<id>` links)
router.get('/polls/:id', optionalAuth, async (req, res) => {
  const row = await privQueryGet(`SELECT * FROM club_polls WHERE id = ?`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Poll not found.' });
  if (!(await canUserAccessPoll(row, req.user, true))) {
    return res.status(403).json({
      error: 'You do not have permission to view this private club poll.',
    });
  }
  res.json(await formatFullPoll(row, req.user));
});

// POST /api/scheduler/polls — create a real multi-user availability poll (with leadership shortcuts!)
router.post('/polls', requireAuth, async (req, res) => {
  const {
    id,
    title,
    description = '',
    hostClubId: rawHostClubId = '',
    hostClubName = '',
    collaboratingClubs = [],
    dates = getDefaultWeekDates(),
    startHour = 9,
    endHour = 20,
    slotMinutes = 30,
    baseTimezone = 'America/Los_Angeles',
    location = 'TBD',
    visibility: rawVisibility = 'public_link',
    shortcutTargets = [],
    invitedParticipants = [],
  } = req.body || {};

  const cleanTitle = String(title || '').trim().slice(0, 140);
  if (!cleanTitle) return res.status(400).json({ error: 'Poll title is required.' });

  const hostClubId = rawHostClubId ? normalizeClubKey(rawHostClubId) : '';
  let resolvedClubName = String(hostClubName || '').trim();
  let resolvedInvited = Array.isArray(invitedParticipants) ? [...invitedParticipants] : [];
  let visibility = ['public_link', 'club_members', 'board_only'].includes(rawVisibility)
    ? rawVisibility
    : 'public_link';

  if (hostClubId) {
    const perm = await getClubPermission(req.user, hostClubId);
    if (visibility === 'board_only' && !perm.isBoard) {
      return res.status(403).json({
        error: 'Only claimed board members can create board-only polls.',
      });
    }
    if (Array.isArray(shortcutTargets) && shortcutTargets.length > 0) {
      if (!perm.isBoard) {
        return res.status(403).json({
          error: 'Only claimed club leadership can use bulk board/member invite shortcuts.',
        });
      }
      const clubData = await buildClubPeopleAndShortcuts(hostClubId, req.user, perm);
      resolvedClubName = resolvedClubName || clubData.clubName;
      resolvedInvited = expandShortcutTargets(clubData, shortcutTargets, resolvedInvited);
    } else if (!resolvedClubName) {
      const clubData = await buildClubPeopleAndShortcuts(hostClubId, req.user, perm);
      resolvedClubName = clubData.clubName;
    }
  } else {
    visibility = 'public_link';
  }

  const pollId =
    (typeof id === 'string' && id.trim()) ||
    `poll_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const nowIso = new Date().toISOString();

  const existing = await privQueryGet(`SELECT * FROM club_polls WHERE id = ?`, [pollId]);
  if (existing && existing.createdByUserId && existing.createdByUserId !== req.user.id) {
    return res.status(403).json({ error: 'Only the poll organizer can overwrite this poll.' });
  }

  await privExecute(
    `INSERT INTO club_polls (
       id, title, description, hostClubId, hostClubName,
       collaboratingClubsJson, datesJson, startHour, endHour, slotMinutes,
       baseTimezone, location, visibility, invitedParticipantsJson, bookedEventsJson,
       createdByUserId, createdByName, createdAt
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title                   = excluded.title,
       description             = excluded.description,
       collaboratingClubsJson  = excluded.collaboratingClubsJson,
       datesJson               = excluded.datesJson,
       startHour               = excluded.startHour,
       endHour                 = excluded.endHour,
       baseTimezone            = excluded.baseTimezone,
       location                = excluded.location,
       visibility              = excluded.visibility,
       invitedParticipantsJson = excluded.invitedParticipantsJson`,
    [
      pollId,
      cleanTitle,
      String(description || '').trim().slice(0, 500),
      hostClubId,
      resolvedClubName,
      JSON.stringify(Array.isArray(collaboratingClubs) ? collaboratingClubs : []),
      JSON.stringify(Array.isArray(dates) && dates.length ? dates : getDefaultWeekDates()),
      Number(startHour),
      Number(endHour),
      Number(slotMinutes),
      baseTimezone,
      String(location || 'TBD').trim().slice(0, 120),
      visibility,
      JSON.stringify(resolvedInvited),
      req.user.id,
      req.user.fullName,
      nowIso,
    ]
  );

  const savedRow = await privQueryGet(`SELECT * FROM club_polls WHERE id = ?`, [pollId]);
  res.status(201).json(await formatFullPoll(savedRow, req.user));
});

// POST /api/scheduler/polls/:id/invite — Leadership shortcut to add All Board / All Members / Club Groups to an existing poll!
router.post('/polls/:id/invite', requireAuth, async (req, res) => {
  const row = await privQueryGet(`SELECT * FROM club_polls WHERE id = ?`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Poll not found.' });
  if (Boolean(row.archived)) {
    return res.status(409).json({
      error: 'This poll is archived. Unarchive it before inviting participants.',
    });
  }

  const targetClubId = normalizeClubKey(req.body?.clubId || row.hostClubId || '');
  if (!targetClubId) {
    return res.status(400).json({ error: 'Select a club to use leadership invite shortcuts.' });
  }

  const perm = await getClubPermission(req.user, targetClubId);
  if (!perm.isBoard) {
    return res.status(403).json({
      error: 'Only claimed board members of this club can bulk-invite board or member rosters.',
    });
  }

  const { shortcutTargets = [], participants = [] } = req.body || {};
  const clubData = await buildClubPeopleAndShortcuts(targetClubId, req.user, perm);
  const existingInvited = parseJsonSafe(row.invitedParticipantsJson, []);
  const mergedInvited = expandShortcutTargets(clubData, shortcutTargets, [
    ...existingInvited,
    ...(Array.isArray(participants) ? participants : []),
  ]);

  await privExecute(
    `UPDATE club_polls
        SET hostClubId = CASE WHEN hostClubId = '' THEN ? ELSE hostClubId END,
            hostClubName = CASE WHEN hostClubName = '' THEN ? ELSE hostClubName END,
            invitedParticipantsJson = ?
      WHERE id = ?`,
    [targetClubId, clubData.clubName, JSON.stringify(mergedInvited), row.id]
  );

  const updatedRow = await privQueryGet(`SELECT * FROM club_polls WHERE id = ?`, [row.id]);
  res.json(await formatFullPoll(updatedRow, req.user));
});

// POST /api/scheduler/polls/:id/respond — Save authenticated user's availability (strictly bound to req.user!)
router.post('/polls/:id/respond', requireAuth, async (req, res) => {
  const pollId = req.params.id;
  const row = await privQueryGet(`SELECT * FROM club_polls WHERE id = ?`, [pollId]);
  if (!row) return res.status(404).json({ error: 'Poll not found.' });
  if (Boolean(row.archived)) {
    return res.status(409).json({
      error: 'This poll is archived and no longer accepting responses.',
    });
  }

  if (!(await canUserAccessPoll(row, req.user, true))) {
    return res.status(403).json({ error: 'You do not have permission to respond to this poll.' });
  }

  const {
    timezone = 'America/Los_Angeles',
    freeSlots,
    availableSlots,
    busySlots = [],
    rawTextInput = '',
    parseText = false,
  } = req.body || {};

  const dates = parseJsonSafe(row.datesJson, getDefaultWeekDates());
  const effectiveFreeSlots = Array.isArray(freeSlots)
    ? freeSlots
    : Array.isArray(availableSlots)
      ? availableSlots
      : [];
  let finalFree = [...effectiveFreeSlots];
  let finalBusy = Array.isArray(busySlots) ? [...busySlots] : [];

  if (parseText && rawTextInput) {
    const parsed = parseAvailabilityText(rawTextInput, dates, timezone);
    const freeSet = new Set([...finalFree, ...parsed.freeSlots]);
    const busySet = new Set([...finalBusy, ...parsed.busySlots]);
    for (const b of busySet) freeSet.delete(b);
    finalFree = Array.from(freeSet);
    finalBusy = Array.from(busySet);
  }

  // Look up user's verified role in hostClubId if any
  const perm = row.hostClubId ? await getClubPermission(req.user, row.hostClubId) : null;
  const roleTitle = perm?.roleTitle || '';
  const clubName = row.hostClubName || '';
  const respId = `${pollId}::${req.user.id}`;
  const nowIso = new Date().toISOString();

  if (finalFree.length === 0 && finalBusy.length === 0 && !rawTextInput) {
    await privExecute(`DELETE FROM club_poll_responses WHERE id = ?`, [respId]);
  } else {
    await privExecute(
      `INSERT INTO club_poll_responses (
         id, pollId, userId, userName, userEmail, roleTitle, clubId, clubName,
         timezone, freeSlotsJson, busySlotsJson, rawTextInput, updatedAt
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(pollId, userId) DO UPDATE SET
         userName      = excluded.userName,
         userEmail     = excluded.userEmail,
         roleTitle     = excluded.roleTitle,
         timezone      = excluded.timezone,
         freeSlotsJson = excluded.freeSlotsJson,
         busySlotsJson = excluded.busySlotsJson,
         rawTextInput  = excluded.rawTextInput,
         updatedAt     = excluded.updatedAt`,
      [
        respId,
        pollId,
        req.user.id,
        req.user.fullName,
        normalizeEmail(req.user.email),
        roleTitle,
        row.hostClubId || '',
        clubName,
        timezone,
        JSON.stringify(finalFree),
        JSON.stringify(finalBusy),
        String(rawTextInput || ''),
        nowIso,
      ]
    );
  }

  const updatedRow = await privQueryGet(`SELECT * FROM club_polls WHERE id = ?`, [pollId]);
  res.json(await formatFullPoll(updatedRow, req.user));
});

router.post('/parse-text', (req, res) => {
  const {
    text = '',
    dates = getDefaultWeekDates(),
    timezone = 'America/Los_Angeles',
  } = req.body || {};
  res.json(parseAvailabilityText(text, dates, timezone));
});

// POST /api/scheduler/polls/:id/book — Book overlapping window onto calendar
router.post('/polls/:id/book', requireAuth, async (req, res) => {
  const row = await privQueryGet(`SELECT * FROM club_polls WHERE id = ?`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Poll not found.' });
  if (Boolean(row.archived)) {
    return res.status(409).json({
      error: 'This poll is archived. Unarchive it before scheduling a meeting.',
    });
  }

  const hostPerm = row.hostClubId
    ? await getClubPermission(req.user, row.hostClubId)
    : { isBoard: false };
  const isOrganizer = row.createdByUserId === req.user.id;

  if (row.hostClubId && !hostPerm.isBoard && !isOrganizer) {
    return res.status(403).json({
      error: 'Only club board members or the poll organizer can book the finalized meeting slot.',
    });
  }

  const {
    start,
    end,
    title = row.title,
    location = row.location || 'TBD',
  } = req.body || {};

  if (!start) return res.status(400).json({ error: 'start ISO string is required.' });

  const endIso = end || new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();
  const eventId = `collab_evt_${row.id}_${new Date(start).getTime()}`;

  const bookedEvent = {
    id: eventId,
    clubId: row.hostClubId || 'personal_poll',
    clubName: row.hostClubName || 'Group Poll',
    title,
    kind: 'meeting',
    start,
    end: endIso,
    allDay: false,
    location,
    isBookedCollab: true,
    source: 'scheduler',
  };

  const prevBooked = parseJsonSafe(row.bookedEventsJson, []).filter(e => e.id !== eventId);
  prevBooked.push(bookedEvent);

  await privExecute(`UPDATE club_polls SET bookedEventsJson = ? WHERE id = ?`, [
    JSON.stringify(prevBooked),
    row.id,
  ]);

  // Only publish to official campus club calendar if booked by a verified board member of that club
  if (row.hostClubId && hostPerm.isBoard) {
    try {
      upsertCollectorData({ events: [bookedEvent] });
    } catch {
      // Ignore public calendar write failure
    }
  }

  const updatedRow = await privQueryGet(`SELECT * FROM club_polls WHERE id = ?`, [row.id]);
  res.status(201).json({
    booked: true,
    eventId,
    officialClubEvent: Boolean(row.hostClubId && hostPerm.isBoard),
    poll: await formatFullPoll(updatedRow, req.user),
  });
});

router.post('/polls/:id/unbook', requireAuth, async (req, res) => {
  const row = await privQueryGet(`SELECT * FROM club_polls WHERE id = ?`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Poll not found.' });

  const hostPerm = row.hostClubId
    ? await getClubPermission(req.user, row.hostClubId)
    : { isBoard: false };
  const isOrganizer = row.createdByUserId === req.user.id;
  if (row.hostClubId && !hostPerm.isBoard && !isOrganizer) {
    return res.status(403).json({
      error: 'Only club board members or the poll organizer can unbook a meeting.',
    });
  }

  const { eventId, start } = req.body || {};
  const prevBooked = parseJsonSafe(row.bookedEventsJson, []);
  const slotMs = start ? new Date(start).getTime() : NaN;

  const removedIds = [];
  const nextBooked = prevBooked.filter(ev => {
    if (eventId && ev.id === eventId) {
      removedIds.push(ev.id);
      return false;
    }
    if (!Number.isNaN(slotMs)) {
      const sMs = new Date(ev.start).getTime();
      const eMs = ev.end ? new Date(ev.end).getTime() : sMs + 60 * 60 * 1000;
      if (slotMs >= sMs && slotMs < eMs) {
        removedIds.push(ev.id);
        return false;
      }
    }
    return true;
  });

  await privExecute(`UPDATE club_polls SET bookedEventsJson = ? WHERE id = ?`, [
    JSON.stringify(nextBooked),
    row.id,
  ]);

  for (const rid of removedIds) {
    try {
      deleteRecord('events', rid);
    } catch {
      // ignore if not in public events
    }
  }

  const updatedRow = await privQueryGet(`SELECT * FROM club_polls WHERE id = ?`, [row.id]);
  res.json({
    unbooked: true,
    removedIds,
    poll: await formatFullPoll(updatedRow, req.user),
  });
});

// PATCH /api/scheduler/polls/:id/archive — Archive or unarchive a poll (strictly poll creator only)
router.patch('/polls/:id/archive', requireAuth, async (req, res) => {
  const row = await privQueryGet(`SELECT * FROM club_polls WHERE id = ?`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Poll not found.' });

  if (!(await isUserPollCreator(row, req.user))) {
    return res.status(403).json({
      error: 'Only the creator of this poll can archive or unarchive it.',
    });
  }

  const nextArchived = req.body?.archived === undefined ? true : Boolean(req.body.archived);
  const archivedAt = nextArchived ? new Date().toISOString() : null;

  await privExecute(`UPDATE club_polls SET archived = ?, archivedAt = ? WHERE id = ?`, [
    nextArchived ? 1 : 0,
    archivedAt,
    row.id,
  ]);

  const updatedRow = await privQueryGet(`SELECT * FROM club_polls WHERE id = ?`, [row.id]);
  res.json({
    ok: true,
    archived: nextArchived,
    poll: await formatFullPoll(updatedRow, req.user),
  });
});

// DELETE /api/scheduler/polls/:id — Permanently delete a poll & its responses (strictly poll creator only)
router.delete('/polls/:id', requireAuth, async (req, res) => {
  const row = await privQueryGet(`SELECT * FROM club_polls WHERE id = ?`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Poll not found.' });

  if (!(await isUserPollCreator(row, req.user))) {
    return res.status(403).json({
      error: 'Only the creator of this poll can delete it.',
    });
  }

  const prevBooked = parseJsonSafe(row.bookedEventsJson, []);
  const removedEventIds = prevBooked.map(ev => ev?.id).filter(Boolean);

  await privBatch([
    { sql: `DELETE FROM club_poll_responses WHERE pollId = ?`, params: [row.id] },
    { sql: `DELETE FROM club_polls WHERE id = ?`, params: [row.id] },
  ]);

  for (const rid of removedEventIds) {
    try {
      deleteRecord('events', rid);
    } catch {
      // ignore if not in public events
    }
  }

  deletePollFromSupabase(row.id).catch(() => {});

  res.json({
    ok: true,
    deleted: true,
    id: row.id,
    removedEventIds,
  });
});

export default router;
