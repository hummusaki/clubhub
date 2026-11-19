// ── ClubHub Multi-User Workspace, RBAC, Roster Claims, Club Groups & Monday.com Tasks Router ──
// Backed exclusively by `server/privateDb.js` (Turso Cloud SQLite or isolated private DB).
// Zero private user data ever touches `clubhub.db` or `public/clubhub-data.json`.

import crypto from 'node:crypto';
import { Router } from 'express';
import { isPublishedRosterPerson } from '../../src/utils/publicRoster.js';
import { getClubById } from '../database.js';
import {
  privQueryAll,
  privQueryGet,
  privExecute,
  privBatch,
  getPrivateDbMode,
} from '../privateDb.js';
import {
  normalizeEmail,
  normalizeClubKey,
  classifyLeadershipTier,
  registerOrLoginEmailUser,
  syncExternalAuthUser,
  revokeSessionToken,
  extractBearerToken,
  getClubPermission,
  getUserWorkspaceOverview,
} from '../services/authService.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import {
  normalizeDueDateAndTime,
  buildUpdatedReminderConfigJson,
  formatTaskReminderForViewer,
  dispatchTaskReminderChannels,
  checkAndDispatchDueTaskReminders,
} from '../services/taskReminders.js';

const router = Router();

const VALID_TASK_STATUSES = new Set([
  'not_started',
  'working_on_it',
  'in_review',
  'stuck',
  'done',
]);

const VALID_TASK_PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);
const VALID_COLORS = new Set(['blue', 'purple', 'teal', 'green', 'yellow', 'red']);

function parseJsonSafe(raw, fallback) {
  if (!raw) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function toInitials(name = '') {
  return (
    String(name || 'MB')
      .replace(/["“][^"”]*["”]/g, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(w => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'MB'
  );
}

function makeMemberKey({ userId = '', email = '', name = '', rosterId = '' }) {
  if (userId) return `uid:${userId}`;
  if (email) return `email:${normalizeEmail(email)}`;
  if (rosterId) return `roster:${rosterId}`;
  return `name:${String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
}

/**
 * Builds the complete people, claims, groups, and leadership-shortcut directory for a club.
 * Masks private personal emails when requester is not a board leader of this club.
 */
export async function buildClubPeopleAndShortcuts(rawClubId, requesterUser = null, precomputedPerm = null) {
  const clubId = normalizeClubKey(rawClubId);
  const perm = precomputedPerm || (await getClubPermission(requesterUser, clubId));
  const canSeePrivateEmails = Boolean(perm.isBoard);

  let publicClub = null;
  try {
    publicClub = getClubById(clubId);
  } catch {
    publicClub = null;
  }

  const clubOfficialEmail = normalizeEmail(publicClub?.email || '');

  // 1. Private memberships joined with users
  const membershipRows = perm.isMember ? await privQueryAll(
    `SELECT m.*, u.email, u.fullName, u.major, u.gradYear, u.avatarBg, u.verifiedEdu
       FROM club_memberships m
       JOIN users u ON u.id = m.userId
      WHERE m.clubId = ?
      ORDER BY CASE m.tier WHEN 'president' THEN 0 WHEN 'board' THEN 1 ELSE 2 END, m.joinedAt ASC`,
    [clubId]
  ) : [];

  // 2. Approved & pending claims for this club
  const claimRows = requesterUser?.id ? await privQueryAll(
    `SELECT c.*, u.fullName AS claimerName, u.email AS claimerEmail, u.verifiedEdu AS claimerVerifiedEdu
       FROM roster_claims c
       JOIN users u ON u.id = c.userId
      WHERE c.clubId = ? AND c.status IN ('approved', 'pending')
        AND (c.userId = ? OR ? = 1 OR (? = 1 AND c.status = 'approved'))
      ORDER BY c.createdAt DESC`,
    [clubId, requesterUser.id, Number(perm.isBoard), Number(perm.isMember)]
  ) : [];

  const approvedClaimByRosterId = new Map();
  const pendingClaims = [];
  let myActiveClaim = null;
  for (const cl of claimRows) {
    if (cl.status === 'approved') {
      approvedClaimByRosterId.set(String(cl.rosterId).toLowerCase(), cl);
      if (requesterUser?.id && cl.userId === requesterUser.id) {
        myActiveClaim = {
          id: cl.id,
          clubId: cl.clubId,
          rosterId: cl.rosterId,
          requestedRole: cl.requestedRole,
          verificationMethod: cl.verificationMethod,
          createdAt: cl.createdAt,
        };
      }
    } else if (cl.status === 'pending') {
      pendingClaims.push({
        id: cl.id,
        clubId: cl.clubId,
        rosterId: cl.rosterId,
        userId: cl.userId,
        requestedRole: cl.requestedRole,
        rosterName: cl.rosterName,
        claimerName: cl.claimerName,
        isMine: cl.userId === requesterUser?.id,
        claimerEmail:
          canSeePrivateEmails || cl.userId === requesterUser?.id ? cl.claimerEmail : '',
        claimerVerifiedEdu: Boolean(cl.claimerVerifiedEdu),
        notes: cl.notes || '',
        createdAt: cl.createdAt,
      });
    }
  }

  // 3. Build unified Board & Member lists
  const boardMap = new Map();
  const memberMap = new Map();

  for (const m of membershipRows) {
    const isSelf = Boolean(requesterUser?.id && m.userId === requesterUser.id);
    const exposedEmail = canSeePrivateEmails || isSelf ? m.email : '';
    const key = `uid:${m.userId}`;
    const entry = {
      memberKey: key,
      userId: m.userId,
      rosterId: m.claimedRosterId || null,
      name: m.fullName,
      initials: toInitials(m.fullName),
      email: exposedEmail,
      roleTitle: m.roleTitle || (m.tier === 'member' ? 'Member' : 'Officer'),
      tier: m.tier,
      major: m.major || '',
      avatarBg: m.avatarBg || '',
      officeHours: m.officeHours || '',
      claimed: m.tier === 'board' || m.tier === 'president',
      isYou: isSelf,
      joinedAt: m.joinedAt,
    };

    if (m.tier === 'board' || m.tier === 'president') {
      boardMap.set(key, entry);
    } else {
      memberMap.set(key, entry);
    }
  }

  // Merge public scraped roster entries (marking which ones are claimed vs unclaimed!)
  const publicRoster = Array.isArray(publicClub?.roster) ? publicClub.roster : [];
  const enrichedPublicRoster = [];

  for (const r of publicRoster) {
    if (!isPublishedRosterPerson(r)) continue;
    const approvedClaim = approvedClaimByRosterId.get(String(r.id).toLowerCase()) || null;
    const isClaimedByYou = Boolean(
      approvedClaim && requesterUser?.id && approvedClaim.userId === requesterUser.id
    );

    enrichedPublicRoster.push({
      id: r.id,
      name: r.name,
      role: r.role,
      personType: r.personType,
      claimed: Boolean(approvedClaim),
      claimedByUserId: approvedClaim?.userId || null,
      claimedRole: approvedClaim?.requestedRole || r.role,
      isClaimedByYou,
    });

    if (r.personType === 'member') {
      if (!approvedClaim) {
        const key = makeMemberKey({ email: r.email, name: r.name, rosterId: r.id });
        if (!memberMap.has(key)) {
          memberMap.set(key, {
            memberKey: key,
            userId: null,
            rosterId: r.id,
            name: r.name,
            initials: r.initials || toInitials(r.name),
            email: '',
            roleTitle: r.role || 'Active Member',
            tier: 'member',
            major: r.major || '',
            avatarBg: '',
            officeHours: '',
            claimed: false,
            isYou: false,
          });
        }
      }
    } else if (!approvedClaim) {
      const key = makeMemberKey({ email: r.email, name: r.name, rosterId: r.id });
      if (!boardMap.has(key)) {
        boardMap.set(key, {
          memberKey: key,
          userId: null,
          rosterId: r.id,
          name: r.name,
          initials: r.initials || toInitials(r.name),
          email: clubOfficialEmail,
          roleTitle: r.role || 'Officer',
          tier: classifyLeadershipTier(r.role || 'Officer'),
          major: r.major || '',
          avatarBg: '',
          officeHours: r.office || '',
          claimed: false,
          isYou: false,
        });
      }
    }
  }

  // 4. Club groups & their members
  const groupRows = perm.isMember ? await privQueryAll(
    `SELECT * FROM club_groups WHERE clubId = ? ORDER BY createdAt ASC`,
    [clubId]
  ) : [];
  const groupMemberRows = perm.isMember ? await privQueryAll(
    `SELECT * FROM club_group_members WHERE clubId = ? ORDER BY addedAt ASC`,
    [clubId]
  ) : [];

  const membersByGroup = new Map();
  for (const gm of groupMemberRows) {
    if (!membersByGroup.has(gm.groupId)) membersByGroup.set(gm.groupId, []);
    const isSelf = Boolean(
      (requesterUser?.id && gm.userId === requesterUser.id) ||
        (requesterUser?.email && gm.email && normalizeEmail(gm.email) === normalizeEmail(requesterUser.email))
    );
    membersByGroup.get(gm.groupId).push({
      id: gm.id,
      memberKey: gm.memberKey,
      userId: gm.userId || null,
      name: gm.name,
      initials: toInitials(gm.name),
      email: canSeePrivateEmails || isSelf ? gm.email : '',
      roleTitle: gm.roleTitle || 'Member',
      personType: gm.personType || 'member',
      isYou: isSelf,
    });
  }

  const groups = groupRows.map(g => {
    const gMembers = membersByGroup.get(g.id) || [];
    const isMyGroup = gMembers.some(m => m.isYou);
    return {
      id: g.id,
      clubId: g.clubId,
      name: g.name,
      color: g.color || 'blue',
      description: g.description || '',
      memberCount: gMembers.length,
      isMyGroup,
      members: gMembers,
      createdAt: g.createdAt,
    };
  });

  const boardList = Array.from(boardMap.values());
  const membersList = Array.from(memberMap.values());

  // Deduplicated everyone list
  const everyoneMap = new Map();
  for (const p of [...boardList, ...membersList]) {
    const dedupe = p.userId ? `uid:${p.userId}` : `name:${p.name.toLowerCase()}`;
    if (!everyoneMap.has(dedupe)) everyoneMap.set(dedupe, p);
  }
  const everyoneList = Array.from(everyoneMap.values());

  return {
    clubId,
    clubName: publicClub?.name || clubId,
    clubOfficialEmail,
    permission: perm,
    board: boardList,
    members: membersList,
    everyone: everyoneList,
    publicRoster: enrichedPublicRoster,
    groups,
    myActiveClaim,
    pendingClaims: perm.isBoard
      ? pendingClaims
      : pendingClaims.filter(c => c.userId === requesterUser?.id),
    shortcuts: {
      allBoardCount: boardList.length,
      allMembersCount: membersList.length,
      everyoneCount: everyoneList.length,
      groups: groups.map(g => ({
        id: g.id,
        name: g.name,
        color: g.color,
        count: g.memberCount,
      })),
    },
  };
}

/**
 * Expands leadership shortcut tokens (`'all_board'`, `'all_members'`, `'everyone'`, `'group:<id>'`)
 * into a deduplicated array of participant/assignee objects.
 */
export function expandShortcutTargets(clubData, shortcutTargets = [], explicitPeople = []) {
  const map = new Map();

  const addPerson = (p, sourceLabel = '') => {
    if (!p?.name) return;
    const key = p.userId
      ? `uid:${p.userId}`
      : p.email
        ? `email:${normalizeEmail(p.email)}`
        : p.memberKey || `name:${String(p.name).toLowerCase()}`;
    if (map.has(key)) return;
    map.set(key, {
      memberKey: key,
      userId: p.userId || null,
      name: p.name,
      initials: p.initials || toInitials(p.name),
      email: p.email || '',
      roleTitle: p.roleTitle || p.role || 'Member',
      tier: p.tier || (p.personType === 'officer' ? 'board' : 'member'),
      sourceShortcut: sourceLabel,
    });
  };

  for (const token of shortcutTargets || []) {
    const t = String(token || '').trim();
    if (t === 'all_board') {
      for (const b of clubData.board || []) addPerson(b, 'All Board');
    } else if (t === 'all_members') {
      for (const m of clubData.members || []) addPerson(m, 'All Members');
    } else if (t === 'everyone') {
      for (const e of clubData.everyone || []) addPerson(e, 'Everyone');
    } else if (t.startsWith('group:')) {
      const gid = t.slice(6);
      const grp = (clubData.groups || []).find(g => g.id === gid);
      if (grp) {
        for (const gm of grp.members || []) addPerson(gm, grp.name);
      }
    }
  }

  for (const p of explicitPeople || []) {
    addPerson(p, p.sourceShortcut || 'Direct');
  }

  return Array.from(map.values());
}

/**
 * Returns the built-in personal to-do section metadata for a specific user & club/server.
 */
function makeDefaultPersonalSection(clubId, userId) {
  return {
    id: `sec_personal_${clubId}_${userId}`,
    clubId,
    title: 'My To-Do List',
    color: 'green',
    visibility: 'personal',
    position: -1,
    createdByUserId: userId,
    isPersonal: true,
    isDefaultPersonal: true,
  };
}

/**
 * Ensures default Monday.com sections exist for a club when first opened.
 */
async function ensureDefaultTaskSections(clubId, actorUserId = 'system') {
  const existing = await privQueryAll(
    `SELECT * FROM club_task_sections WHERE clubId = ? ORDER BY position ASC, createdAt ASC`,
    [clubId]
  );
  if (existing.some(s => s.visibility !== 'personal')) return existing;

  const nowIso = new Date().toISOString();
  const defaults = [
    {
      id: `sec_${clubId}_general`,
      title: 'General Club Checklist',
      color: 'teal',
      visibility: 'members',
      position: 0,
    },
    {
      id: `sec_${clubId}_sprint`,
      title: 'Team & Group Assignments',
      color: 'blue',
      visibility: 'members',
      position: 1,
    },
    {
      id: `sec_${clubId}_board`,
      title: 'Executive Board Internal',
      color: 'purple',
      visibility: 'board',
      position: 2,
    },
  ];

  await privBatch(
    defaults.map(s => ({
      sql: `INSERT OR IGNORE INTO club_task_sections (
              id, clubId, title, color, visibility, position, createdByUserId, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [s.id, clubId, s.title, s.color, s.visibility, s.position, actorUserId, nowIso],
    }))
  );

  return privQueryAll(
    `SELECT * FROM club_task_sections WHERE clubId = ? ORDER BY position ASC, createdAt ASC`,
    [clubId]
  );
}

function formatTaskRow(row, viewerUserId = '') {
  const dueDate = row.dueDate || '';
  const dueTime = row.dueTime || '';
  return {
    id: row.id,
    clubId: row.clubId,
    sectionId: row.sectionId,
    title: row.title,
    notes: row.notes || '',
    visibility: row.visibility || 'members',
    audience: row.audience || 'general',
    status: row.status || 'not_started',
    priority: row.priority || 'medium',
    dueDate,
    dueTime,
    reminder: formatTaskReminderForViewer(row.reminderConfigJson || '{}', {
      dueDate,
      dueTime,
      viewerUserId,
      createdByUserId: row.createdByUserId || '',
    }),
    assignees: parseJsonSafe(row.assigneesJson, []),
    groupIds: parseJsonSafe(row.groupIdsJson, []),
    completedBy: parseJsonSafe(row.completedByJson, []),
    position: Number(row.position || 0),
    createdByUserId: row.createdByUserId,
    createdByName: row.createdByName || '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── 0. Workspace Health & Cloud Storage Mode (never leaks secrets) ────
router.get('/status', optionalAuth, async (req, res) => {
  const overview = req.user ? await getUserWorkspaceOverview(req.user) : null;
  res.json({
    ok: true,
    storageMode: getPrivateDbMode(),
    authenticated: Boolean(req.user),
    ...(overview || {}),
  });
});

// ── 1. Multi-User Authentication Endpoints ────────────────────────────

router.post('/auth/session', async (req, res) => {
  try {
    const { email, password, fullName, major, gradYear, avatarBg, mode = 'auto' } = req.body || {};
    const result = await registerOrLoginEmailUser({
      email,
      password,
      fullName,
      major,
      gradYear,
      avatarBg,
      mode,
    });
    const overview = await getUserWorkspaceOverview(result.user);
    res.status(result.created ? 201 : 200).json({
      ok: true,
      ...result,
      ...overview,
    });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Authentication failed.' });
  }
});

router.post('/auth/sync-external', async (req, res) => {
  try {
    const { provider, googleAccessToken, clerkUserId, email, fullName, avatarBg } = req.body || {};
    const result = await syncExternalAuthUser({
      provider,
      googleAccessToken,
      clerkUserId,
      email,
      fullName,
      avatarBg,
    });
    const overview = await getUserWorkspaceOverview(result.user);
    res.json({
      ok: true,
      ...result,
      ...overview,
    });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'External auth sync failed.' });
  }
});

router.post('/auth/logout', async (req, res) => {
  const token = extractBearerToken(req);
  await revokeSessionToken(token);
  res.json({ ok: true });
});

router.get('/auth/me', requireAuth, async (req, res) => {
  const overview = await getUserWorkspaceOverview(req.user);
  res.json({ ok: true, ...overview });
});

router.patch('/auth/profile', requireAuth, async (req, res) => {
  const { fullName, major, gradYear, avatarBg, themeMode } = req.body || {};
  const cleanThemeMode =
    typeof themeMode === 'string' && ['system', 'light', 'dark'].includes(themeMode.trim())
      ? themeMode.trim()
      : null;
  const nowIso = new Date().toISOString();
  await privExecute(
    `UPDATE users
        SET fullName = COALESCE(?, fullName),
            major = COALESCE(?, major),
            gradYear = COALESCE(?, gradYear),
            avatarBg = COALESCE(?, avatarBg),
            themeMode = COALESCE(?, themeMode),
            updatedAt = ?
      WHERE id = ?`,
    [
      typeof fullName === 'string' && fullName.trim() ? fullName.trim() : null,
      typeof major === 'string' ? major.trim() : null,
      typeof gradYear === 'string' ? gradYear.trim() : null,
      typeof avatarBg === 'string' && avatarBg.trim() ? avatarBg.trim() : null,
      cleanThemeMode,
      nowIso,
      req.user.id,
    ]
  );
  const updated = await privQueryGet(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
  const overview = await getUserWorkspaceOverview({
    ...req.user,
    fullName: updated.fullName,
    major: updated.major,
    gradYear: updated.gradYear,
    avatarBg: updated.avatarBg,
    themeMode: updated.themeMode,
  });
  res.json({ ok: true, ...overview });
});

// ── 2. Club Memberships (Join / Leave / Sync Joined Clubs) ────────────

router.post('/clubs/:clubId/join', requireAuth, async (req, res) => {
  const clubId = normalizeClubKey(req.params.clubId);
  if (!clubId) return res.status(400).json({ error: 'clubId is required' });

  const nowIso = new Date().toISOString();
  const membershipId = `${clubId}::${req.user.id}`;
  await privExecute(
    `INSERT INTO club_memberships (
       id, clubId, userId, tier, roleTitle, claimedRosterId, officeHours, joinedAt, updatedAt
     ) VALUES (?, ?, ?, 'member', 'Member', NULL, '', ?, ?)
     ON CONFLICT(clubId, userId) DO UPDATE SET updatedAt = excluded.updatedAt`,
    [membershipId, clubId, req.user.id, nowIso, nowIso]
  );

  const overview = await getUserWorkspaceOverview(req.user);
  res.json({ ok: true, clubId, ...overview });
});

router.post('/clubs/:clubId/leave', requireAuth, async (req, res) => {
  const clubId = normalizeClubKey(req.params.clubId);
  const nowIso = new Date().toISOString();

  const tasks = await privQueryAll(
    `SELECT id, assigneesJson FROM club_tasks WHERE clubId = ? AND visibility != 'personal'`,
    [clubId]
  );
  const taskScrubStmts = [];
  for (const t of tasks) {
    const arr = parseJsonSafe(t.assigneesJson, []);
    if (Array.isArray(arr) && arr.some(a => a.userId === req.user.id)) {
      const filtered = arr.filter(a => a.userId !== req.user.id);
      taskScrubStmts.push({
        sql: `UPDATE club_tasks SET assigneesJson = ?, updatedAt = ? WHERE id = ?`,
        params: [JSON.stringify(filtered), nowIso, t.id],
      });
    }
  }

  await privBatch([
    ...taskScrubStmts,
    {
      sql: `UPDATE roster_claims
               SET status = 'revoked', updatedAt = ?
             WHERE clubId = ? AND userId = ? AND status IN ('approved', 'pending')`,
      params: [nowIso, clubId, req.user.id],
    },
    {
      sql: `DELETE FROM club_group_members
             WHERE clubId = ? AND (userId = ? OR LOWER(email) = ?)`,
      params: [clubId, req.user.id, normalizeEmail(req.user.email)],
    },
    {
      sql: `DELETE FROM club_memberships WHERE clubId = ? AND userId = ?`,
      params: [clubId, req.user.id],
    },
  ]);

  const overview = await getUserWorkspaceOverview(req.user);
  res.json({ ok: true, clubId, ...overview });
});

router.post('/memberships/sync', requireAuth, async (req, res) => {
  const { clubIds = [] } = req.body || {};
  if (!Array.isArray(clubIds)) {
    return res.status(400).json({ error: 'clubIds array is required' });
  }
  const nowIso = new Date().toISOString();
  const cleanIds = Array.from(new Set(clubIds.map(normalizeClubKey).filter(Boolean))).slice(0, 60);

  if (cleanIds.length > 0) {
    await privBatch(
      cleanIds.map(cid => ({
        sql: `INSERT INTO club_memberships (
                id, clubId, userId, tier, roleTitle, claimedRosterId, officeHours, joinedAt, updatedAt
              ) VALUES (?, ?, ?, 'member', 'Member', NULL, '', ?, ?)
              ON CONFLICT(clubId, userId) DO NOTHING`,
        params: [`${cid}::${req.user.id}`, cid, req.user.id, nowIso, nowIso],
      }))
    );
  }

  const overview = await getUserWorkspaceOverview(req.user);
  res.json({ ok: true, ...overview });
});

// ── 3. Club People, Roster Position Claiming & Board Approvals ────────

router.get('/clubs/:clubId/people', optionalAuth, async (req, res) => {
  const clubId = normalizeClubKey(req.params.clubId);
  const data = await buildClubPeopleAndShortcuts(clubId, req.user);
  res.set('Cache-Control', 'private, no-store').json({ ok: true, ...data });
});

router.post('/clubs/:clubId/claims', requireAuth, async (req, res) => {
  const clubId = normalizeClubKey(req.params.clubId);
  if (!clubId) return res.status(400).json({ error: 'clubId is required' });

  const {
    rosterId: rawRosterId = '',
    requestedRole: rawRole = '',
    rosterName: rawRosterName = '',
    officeHours = '',
    notes = '',
  } = req.body || {};

  let publicClub = null;
  try {
    publicClub = getClubById(clubId);
  } catch {
    publicClub = null;
  }

  const publicRoster = Array.isArray(publicClub?.roster) ? publicClub.roster : [];
  const matchedRosterEntry = rawRosterId
    ? publicRoster.find(r => r.id === rawRosterId) || null
    : null;

  const requestedRole = String(rawRole || matchedRosterEntry?.role || 'Officer')
    .trim()
    .slice(0, 80);
  if (!requestedRole) {
    return res.status(400).json({ error: 'A board/officer role title is required.' });
  }

  const rosterId =
    String(rawRosterId || '').trim() ||
    `claimed_role_${clubId}_${requestedRole.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
  const rosterName = String(rawRosterName || matchedRosterEntry?.name || req.user.fullName)
    .trim()
    .slice(0, 80);

  // 1. Check if this exact rosterId is already claimed by another user (case-insensitive)
  const existingSlotClaim = await privQueryGet(
    `SELECT * FROM roster_claims WHERE clubId = ? AND LOWER(rosterId) = LOWER(?) AND status = 'approved'`,
    [clubId, rosterId]
  );

  if (existingSlotClaim && existingSlotClaim.userId !== req.user.id) {
    return res.status(409).json({
      error: 'This roster position has already been claimed by another verified board member.',
      code: 'SLOT_ALREADY_CLAIMED',
    });
  }

  const nowIso = new Date().toISOString();

  // Idempotent update if this user already holds this exact claim
  if (existingSlotClaim && existingSlotClaim.userId === req.user.id) {
    const tier = classifyLeadershipTier(requestedRole);
    await privBatch([
      {
        sql: `UPDATE roster_claims
                 SET requestedRole = ?, notes = ?, updatedAt = ?
               WHERE id = ?`,
        params: [requestedRole, String(notes || '').trim(), nowIso, existingSlotClaim.id],
      },
      {
        sql: `UPDATE club_memberships
                 SET tier = ?, roleTitle = ?, officeHours = ?, updatedAt = ?
               WHERE clubId = ? AND userId = ?`,
        params: [
          tier,
          requestedRole,
          String(officeHours || '').trim(),
          nowIso,
          clubId,
          req.user.id,
        ],
      },
    ]);
    const overview = await getUserWorkspaceOverview(req.user);
    const clubPeople = await buildClubPeopleAndShortcuts(clubId, req.user);
    return res.json({
      ok: true,
      claimStatus: 'approved',
      claim: { ...existingSlotClaim, requestedRole },
      clubPeople,
      ...overview,
    });
  }

  // 2. Prevent one user from hoarding multiple board seats in the same club
  const userOtherApprovedClaim = await privQueryGet(
    `SELECT * FROM roster_claims
      WHERE clubId = ? AND userId = ? AND status = 'approved' AND rosterId != ?`,
    [clubId, req.user.id, rosterId]
  );
  if (userOtherApprovedClaim) {
    return res.status(409).json({
      error: `You already hold the "${userOtherApprovedClaim.requestedRole}" position in this club. Release your current seat first if changing positions.`,
      code: 'USER_ALREADY_ON_BOARD',
    });
  }

  // 3. Determine verification method & whether claim is auto-approved or pending board review
  const userEmail = normalizeEmail(req.user.email);
  const clubEmail = normalizeEmail(publicClub?.email || '');
  const rosterEntryEmail = normalizeEmail(matchedRosterEntry?.email || '');
  const hasDirectRosterEmailMatch =
    Boolean(rosterEntryEmail) &&
    rosterEntryEmail !== clubEmail &&
    userEmail === rosterEntryEmail;
  const hasOfficialClubEmailMatch = Boolean(clubEmail) && userEmail === clubEmail;

  const preInvite = await privQueryGet(
    `SELECT * FROM club_role_invites WHERE clubId = ? AND LOWER(email) = ?`,
    [clubId, userEmail]
  );

  const otherBoardCountRow = await privQueryGet(
    `SELECT COUNT(*) AS cnt
       FROM club_memberships
      WHERE clubId = ? AND tier IN ('board', 'president') AND userId != ?`,
    [clubId, req.user.id]
  );
  const existingBoardCount = Number(otherBoardCountRow?.cnt || 0);

  let status = 'pending';
  let verificationMethod = 'pending_board_review';

  if (hasOfficialClubEmailMatch) {
    status = 'approved';
    verificationMethod = 'official_email';
  } else if (hasDirectRosterEmailMatch) {
    status = 'approved';
    verificationMethod = 'roster_email_match';
  } else if (preInvite && (preInvite.tier === 'board' || preInvite.tier === 'president')) {
    status = 'approved';
    verificationMethod = 'board_invited';
  } else if (existingBoardCount === 0) {
    // Founding/first board leader onboarding this club onto ClubHub
    status = 'approved';
    verificationMethod = 'first_board_claim';
  }

  // Check if user already has a pending claim in this club (update instead of duplicating)
  const existingPending = await privQueryGet(
    `SELECT * FROM roster_claims WHERE clubId = ? AND userId = ? AND status = 'pending'`,
    [clubId, req.user.id]
  );

  const claimId =
    existingPending?.id || `claim_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const tier = status === 'approved' ? classifyLeadershipTier(requestedRole) : 'member';
  const membershipRoleTitle = status === 'approved' ? requestedRole : 'Member';
  const membershipId = `${clubId}::${req.user.id}`;

  const statements = [];
  if (existingPending) {
    statements.push({
      sql: `UPDATE roster_claims
               SET rosterId = ?, requestedRole = ?, rosterName = ?, status = ?,
                   verificationMethod = ?, notes = ?, updatedAt = ?
             WHERE id = ?`,
      params: [
        rosterId,
        requestedRole,
        rosterName,
        status,
        verificationMethod,
        String(notes || '').trim(),
        nowIso,
        claimId,
      ],
    });
  } else {
    statements.push({
      sql: `INSERT INTO roster_claims (
              id, clubId, rosterId, userId, requestedRole, rosterName,
              status, verificationMethod, notes, reviewedByUserId, reviewedAt, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
      params: [
        claimId,
        clubId,
        rosterId,
        req.user.id,
        requestedRole,
        rosterName,
        status,
        verificationMethod,
        String(notes || '').trim(),
        nowIso,
        nowIso,
      ],
    });
  }

  statements.push({
    sql: `INSERT INTO club_memberships (
            id, clubId, userId, tier, roleTitle, claimedRosterId, officeHours, joinedAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(clubId, userId) DO UPDATE SET
            tier = CASE
              WHEN ? = 'approved' THEN excluded.tier
              ELSE club_memberships.tier
            END,
            roleTitle = CASE
              WHEN ? = 'approved' THEN excluded.roleTitle
              ELSE club_memberships.roleTitle
            END,
            claimedRosterId = CASE
              WHEN ? = 'approved' THEN excluded.claimedRosterId
              ELSE club_memberships.claimedRosterId
            END,
            officeHours = CASE
              WHEN ? = 'approved' AND excluded.officeHours != '' THEN excluded.officeHours
              ELSE club_memberships.officeHours
            END,
            updatedAt = excluded.updatedAt`,
    params: [
      membershipId,
      clubId,
      req.user.id,
      tier,
      membershipRoleTitle,
      status === 'approved' ? rosterId : null,
      String(officeHours || '').trim(),
      nowIso,
      nowIso,
      status,
      status,
      status,
      status,
    ],
  });

  try {
    await privBatch(statements);
  } catch (err) {
    if (/UNIQUE constraint|23505/i.test(err?.message || '')) {
      return res.status(409).json({
        error: 'This roster position was simultaneously claimed by another verified member.',
        code: 'SLOT_ALREADY_CLAIMED',
      });
    }
    throw err;
  }

  if (status === 'approved') {
    await ensureDefaultTaskSections(clubId, req.user.id);
  }

  const savedClaim = await privQueryGet(`SELECT * FROM roster_claims WHERE id = ?`, [claimId]);
  const overview = await getUserWorkspaceOverview(req.user);
  const clubPeople = await buildClubPeopleAndShortcuts(clubId, req.user);

  res.status(201).json({
    ok: true,
    claimStatus: status,
    verificationMethod,
    claim: savedClaim,
    clubPeople,
    ...overview,
  });
});

// Approve or reject a pending roster claim (Board leaders of this club ONLY; never self-approve)
router.post('/clubs/:clubId/claims/:claimId/review', requireAuth, async (req, res) => {
  const clubId = normalizeClubKey(req.params.clubId);
  const perm = await getClubPermission(req.user, clubId);
  if (!perm.isBoard) {
    return res.status(403).json({
      error: 'Only verified board members of this club can review roster claims.',
    });
  }

  const claim = await privQueryGet(
    `SELECT * FROM roster_claims WHERE id = ? AND clubId = ?`,
    [req.params.claimId, clubId]
  );
  if (!claim) {
    return res.status(404).json({ error: 'Roster claim not found.' });
  }
  if (claim.userId === req.user.id) {
    return res.status(403).json({ error: 'You cannot approve or review your own roster claim.' });
  }
  if (claim.status !== 'pending') {
    return res.status(409).json({ error: `Claim has already been ${claim.status}.` });
  }

  const decision = String(req.body?.decision || '').toLowerCase();
  if (decision !== 'approve' && decision !== 'reject') {
    return res.status(400).json({ error: 'decision must be "approve" or "reject".' });
  }

  const nowIso = new Date().toISOString();

  if (decision === 'approve') {
    // Race condition check: ensure slot wasn't claimed in the meantime (case-insensitive)
    const slotConflict = await privQueryGet(
      `SELECT * FROM roster_claims
        WHERE clubId = ? AND LOWER(rosterId) = LOWER(?) AND status = 'approved' AND id != ?`,
      [clubId, claim.rosterId, claim.id]
    );
    if (slotConflict) {
      return res.status(409).json({
        error: 'Another board member was already approved for this exact roster slot.',
        code: 'SLOT_ALREADY_CLAIMED',
      });
    }

    const tier = classifyLeadershipTier(claim.requestedRole);
    const membershipId = `${clubId}::${claim.userId}`;
    try {
      await privBatch([
        {
          sql: `UPDATE roster_claims
                   SET status = 'approved',
                       verificationMethod = 'board_approved',
                       reviewedByUserId = ?,
                       reviewedAt = ?,
                       updatedAt = ?
                 WHERE id = ?`,
          params: [req.user.id, nowIso, nowIso, claim.id],
        },
        {
          sql: `INSERT INTO club_memberships (
                  id, clubId, userId, tier, roleTitle, claimedRosterId, officeHours, joinedAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, '', ?, ?)
                ON CONFLICT(clubId, userId) DO UPDATE SET
                  tier = excluded.tier,
                  roleTitle = excluded.roleTitle,
                  claimedRosterId = excluded.claimedRosterId,
                  updatedAt = excluded.updatedAt`,
          params: [
            membershipId,
            clubId,
            claim.userId,
            tier,
            claim.requestedRole,
            claim.rosterId,
            nowIso,
            nowIso,
          ],
        },
      ]);
    } catch (err) {
      if (/UNIQUE constraint|23505/i.test(err?.message || '')) {
        return res.status(409).json({
          error: 'Another board member was approved for this exact roster slot at the same time.',
          code: 'SLOT_ALREADY_CLAIMED',
        });
      }
      throw err;
    }
  } else {
    await privExecute(
      `UPDATE roster_claims
          SET status = 'rejected', reviewedByUserId = ?, reviewedAt = ?, updatedAt = ?
        WHERE id = ?`,
      [req.user.id, nowIso, nowIso, claim.id]
    );
  }

  const clubPeople = await buildClubPeopleAndShortcuts(clubId, req.user);
  res.json({
    ok: true,
    decision,
    clubPeople,
  });
});

// Step down from or revoke an approved/pending claim
router.post('/clubs/:clubId/claims/:claimId/revoke', requireAuth, async (req, res) => {
  const clubId = normalizeClubKey(req.params.clubId);
  const claim = await privQueryGet(
    `SELECT * FROM roster_claims WHERE id = ? AND clubId = ?`,
    [req.params.claimId, clubId]
  );
  if (!claim) return res.status(404).json({ error: 'Claim not found.' });

  const perm = await getClubPermission(req.user, clubId);
  const isSelf = claim.userId === req.user.id;
  if (!isSelf && !perm.isPresident) {
    return res.status(403).json({
      error: 'Only the position holder or a club President can revoke a claimed board position.',
    });
  }

  const nowIso = new Date().toISOString();
  await privBatch([
    {
      sql: `UPDATE roster_claims SET status = 'revoked', updatedAt = ? WHERE id = ?`,
      params: [nowIso, claim.id],
    },
    {
      sql: `UPDATE club_memberships
               SET tier = 'member', roleTitle = 'Member', claimedRosterId = NULL, updatedAt = ?
             WHERE clubId = ? AND userId = ?`,
      params: [nowIso, clubId, claim.userId],
    },
  ]);

  const overview = await getUserWorkspaceOverview(req.user);
  const clubPeople = await buildClubPeopleAndShortcuts(clubId, req.user);
  res.json({ ok: true, clubPeople, ...overview });
});

// Pre-invite or assign a role by email / userId (Board / President only)
router.post('/clubs/:clubId/roles/assign', requireAuth, async (req, res) => {
  const clubId = normalizeClubKey(req.params.clubId);
  const perm = await getClubPermission(req.user, clubId);
  if (!perm.isBoard) {
    return res.status(403).json({ error: 'Board leadership permissions required.' });
  }

  const {
    email: rawEmail = '',
    userId: targetUserId = '',
    fullName = '',
    roleTitle = 'Officer',
    tier: requestedTier = 'board',
  } = req.body || {};

  const tier =
    requestedTier === 'president'
      ? 'president'
      : requestedTier === 'board'
        ? 'board'
        : 'member';

  if (tier === 'president' && !perm.isPresident) {
    return res.status(403).json({
      error: 'Only a club President can assign another President-tier role.',
    });
  }

  const cleanEmail = normalizeEmail(rawEmail);
  let targetUser = null;
  if (targetUserId) {
    targetUser = await privQueryGet(`SELECT * FROM users WHERE id = ?`, [targetUserId]);
  } else if (cleanEmail) {
    targetUser = await privQueryGet(`SELECT * FROM users WHERE email = ?`, [cleanEmail]);
  }

  const nowIso = new Date().toISOString();
  const cleanTitle = String(roleTitle || (tier === 'member' ? 'Member' : 'Officer')).trim();

  if (targetUser) {
    // Prevent non-president board member from demoting a president
    const existingTargetPerm = await getClubPermission(targetUser, clubId);
    if (existingTargetPerm.isPresident && !perm.isPresident && targetUser.id !== req.user.id) {
      return res.status(403).json({
        error: 'Only a club President can modify another President’s role.',
      });
    }

    const rosterId =
      tier !== 'member'
        ? `assigned_${clubId}_${targetUser.id}`
        : null;
    await privBatch([
      {
        sql: `INSERT INTO club_memberships (
                id, clubId, userId, tier, roleTitle, claimedRosterId, officeHours, joinedAt, updatedAt
              ) VALUES (?, ?, ?, ?, ?, ?, '', ?, ?)
              ON CONFLICT(clubId, userId) DO UPDATE SET
                tier = excluded.tier,
                roleTitle = excluded.roleTitle,
                claimedRosterId = excluded.claimedRosterId,
                updatedAt = excluded.updatedAt`,
        params: [
          `${clubId}::${targetUser.id}`,
          clubId,
          targetUser.id,
          tier,
          cleanTitle,
          rosterId,
          nowIso,
          nowIso,
        ],
      },
      ...(tier !== 'member'
        ? [
            {
              sql: `INSERT INTO roster_claims (
                      id, clubId, rosterId, userId, requestedRole, rosterName,
                      status, verificationMethod, notes, reviewedByUserId, reviewedAt, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, 'approved', 'board_invited', 'Assigned by club leadership', ?, ?, ?, ?)`,
              params: [
                `claim_assign_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
                clubId,
                rosterId,
                targetUser.id,
                cleanTitle,
                targetUser.fullName,
                req.user.id,
                nowIso,
                nowIso,
                nowIso,
              ],
            },
          ]
        : [
            {
              sql: `UPDATE roster_claims SET status = 'revoked', updatedAt = ? WHERE clubId = ? AND userId = ? AND status IN ('approved', 'pending')`,
              params: [nowIso, clubId, targetUser.id],
            },
          ]),
    ]);
  } else if (cleanEmail && cleanEmail.includes('@')) {
    await privExecute(
      `INSERT INTO club_role_invites (
         id, clubId, email, fullName, tier, roleTitle, rosterId, invitedByUserId, acceptedByUserId, createdAt
       ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?)
       ON CONFLICT(clubId, email) DO UPDATE SET
         fullName = excluded.fullName,
         tier = excluded.tier,
         roleTitle = excluded.roleTitle,
         invitedByUserId = excluded.invitedByUserId`,
      [
        `inv_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        clubId,
        cleanEmail,
        String(fullName || '').trim(),
        tier,
        cleanTitle,
        req.user.id,
        nowIso,
      ]
    );
  } else {
    return res.status(400).json({ error: 'Valid email or userId is required.' });
  }

  const clubPeople = await buildClubPeopleAndShortcuts(clubId, req.user);
  res.status(201).json({ ok: true, clubPeople });
});

// ── 4. Club Groups / Sub-Teams Within Clubs ───────────────────────────

router.get('/clubs/:clubId/groups', optionalAuth, async (req, res) => {
  const clubId = normalizeClubKey(req.params.clubId);
  const clubPeople = await buildClubPeopleAndShortcuts(clubId, req.user);
  res.json({ clubId, groups: clubPeople.groups, permission: clubPeople.permission });
});

router.post('/clubs/:clubId/groups', requireAuth, async (req, res) => {
  const clubId = normalizeClubKey(req.params.clubId);
  const perm = await getClubPermission(req.user, clubId);
  if (!perm.isBoard) {
    return res.status(403).json({
      error: 'Only claimed board members of this club can create club groups.',
    });
  }

  const {
    name,
    color = 'blue',
    description = '',
    members = [],
    shortcutTargets = [],
  } = req.body || {};

  const cleanName = String(name || '').trim().slice(0, 60);
  if (!cleanName) {
    return res.status(400).json({ error: 'Group name is required.' });
  }

  const dupGroup = await privQueryGet(
    `SELECT id FROM club_groups WHERE clubId = ? AND LOWER(name) = LOWER(?)`,
    [clubId, cleanName]
  );
  if (dupGroup) {
    return res.status(409).json({
      error: `A sub-group named "${cleanName}" already exists in this club.`,
      code: 'GROUP_NAME_EXISTS',
    });
  }

  const safeColor = VALID_COLORS.has(color) ? color : 'blue';
  const groupId = `grp_${clubId}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const nowIso = new Date().toISOString();

  const clubData = await buildClubPeopleAndShortcuts(clubId, req.user, perm);
  const initialPeople = expandShortcutTargets(clubData, shortcutTargets, members);

  const statements = [
    {
      sql: `INSERT INTO club_groups (
              id, clubId, name, color, description, createdByUserId, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        groupId,
        clubId,
        cleanName,
        safeColor,
        String(description || '').trim().slice(0, 200),
        req.user.id,
        nowIso,
        nowIso,
      ],
    },
    ...initialPeople.map(p => ({
      sql: `INSERT OR IGNORE INTO club_group_members (
              id, groupId, clubId, memberKey, userId, email, name, roleTitle, personType, addedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        `gm_${groupId}_${crypto.randomBytes(4).toString('hex')}`,
        groupId,
        clubId,
        p.memberKey,
        p.userId || null,
        normalizeEmail(p.email || ''),
        p.name,
        p.roleTitle || 'Member',
        p.tier === 'board' || p.tier === 'president' ? 'officer' : 'member',
        nowIso,
      ],
    })),
  ];

  await privBatch(statements);
  const updatedPeople = await buildClubPeopleAndShortcuts(clubId, req.user);
  const createdGroup = updatedPeople.groups.find(g => g.id === groupId);
  res.status(201).json({ ok: true, group: createdGroup, clubPeople: updatedPeople });
});

router.patch('/clubs/:clubId/groups/:groupId', requireAuth, async (req, res) => {
  const clubId = normalizeClubKey(req.params.clubId);
  const perm = await getClubPermission(req.user, clubId);
  if (!perm.isBoard) {
    return res.status(403).json({
      error: 'Only claimed board members can modify club groups.',
    });
  }

  const group = await privQueryGet(
    `SELECT * FROM club_groups WHERE id = ? AND clubId = ?`,
    [req.params.groupId, clubId]
  );
  if (!group) return res.status(404).json({ error: 'Group not found.' });

  const {
    name,
    color,
    description,
    addMembers = [],
    removeMemberKeys = [],
    shortcutTargets = [],
  } = req.body || {};

  const nowIso = new Date().toISOString();
  const nextName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : group.name;
  const nextColor = color && VALID_COLORS.has(color) ? color : group.color;
  const nextDesc =
    typeof description === 'string' ? description.trim().slice(0, 200) : group.description;

  const clubData = await buildClubPeopleAndShortcuts(clubId, req.user, perm);
  const peopleToAdd = expandShortcutTargets(clubData, shortcutTargets, addMembers);

  const statements = [
    {
      sql: `UPDATE club_groups SET name = ?, color = ?, description = ?, updatedAt = ? WHERE id = ?`,
      params: [nextName, nextColor, nextDesc, nowIso, group.id],
    },
    ...peopleToAdd.map(p => ({
      sql: `INSERT OR IGNORE INTO club_group_members (
              id, groupId, clubId, memberKey, userId, email, name, roleTitle, personType, addedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        `gm_${group.id}_${crypto.randomBytes(4).toString('hex')}`,
        group.id,
        clubId,
        p.memberKey,
        p.userId || null,
        normalizeEmail(p.email || ''),
        p.name,
        p.roleTitle || 'Member',
        p.tier === 'board' || p.tier === 'president' ? 'officer' : 'member',
        nowIso,
      ],
    })),
    ...(Array.isArray(removeMemberKeys) ? removeMemberKeys : []).map(mk => ({
      sql: `DELETE FROM club_group_members WHERE groupId = ? AND memberKey = ?`,
      params: [group.id, String(mk)],
    })),
  ];

  await privBatch(statements);
  const updatedPeople = await buildClubPeopleAndShortcuts(clubId, req.user);
  const updatedGroup = updatedPeople.groups.find(g => g.id === group.id);
  res.json({ ok: true, group: updatedGroup, clubPeople: updatedPeople });
});

router.delete('/clubs/:clubId/groups/:groupId', requireAuth, async (req, res) => {
  const clubId = normalizeClubKey(req.params.clubId);
  const perm = await getClubPermission(req.user, clubId);
  if (!perm.isBoard) {
    return res.status(403).json({
      error: 'Only claimed board members can delete club groups.',
      code: 'BOARD_PERMISSION_REQUIRED',
    });
  }

  const groupId = req.params.groupId;
  const nowIso = new Date().toISOString();

  // Scrub deleted groupId from active tasks & announcements so zero dangling references remain
  const affectedTasks = await privQueryAll(
    `SELECT id, groupIdsJson FROM club_tasks WHERE clubId = ?`,
    [clubId]
  );
  const taskCleanupStmts = [];
  for (const t of affectedTasks) {
    const gids = parseJsonSafe(t.groupIdsJson, []);
    if (Array.isArray(gids) && gids.includes(groupId)) {
      const nextGids = gids.filter(id => id !== groupId);
      taskCleanupStmts.push({
        sql: `UPDATE club_tasks SET groupIdsJson = ?, updatedAt = ? WHERE id = ?`,
        params: [JSON.stringify(nextGids), nowIso, t.id],
      });
    }
  }

  const affectedAnns = await privQueryAll(
    `SELECT id, targetGroupIdsJson FROM club_announcements_private WHERE clubId = ?`,
    [clubId]
  );
  const annCleanupStmts = [];
  for (const a of affectedAnns) {
    const gids = parseJsonSafe(a.targetGroupIdsJson, []);
    if (Array.isArray(gids) && gids.includes(groupId)) {
      const nextGids = gids.filter(id => id !== groupId);
      annCleanupStmts.push({
        sql: `UPDATE club_announcements_private SET targetGroupIdsJson = ? WHERE id = ?`,
        params: [JSON.stringify(nextGids), a.id],
      });
    }
  }

  await privBatch([
    ...taskCleanupStmts,
    ...annCleanupStmts,
    { sql: `DELETE FROM club_group_members WHERE groupId = ? AND clubId = ?`, params: [groupId, clubId] },
    { sql: `DELETE FROM club_groups WHERE id = ? AND clubId = ?`, params: [groupId, clubId] },
  ]);

  const updatedPeople = await buildClubPeopleAndShortcuts(clubId, req.user);
  res.json({ ok: true, clubPeople: updatedPeople });
});

// ── 5. Monday.com-Style Two-Tier Club Tasks, Per-Server Personal To-Do & Higher-Perm Board View ──

async function buildClubTasksBoardPayload(clubId, user, perm) {
  const allSections = await ensureDefaultTaskSections(clubId, user?.id || 'system');
  const [rawTasks, activeGroups, activeMemberships] = await Promise.all([
    privQueryAll(
      `SELECT * FROM club_tasks WHERE clubId = ? ORDER BY position ASC, createdAt ASC`,
      [clubId]
    ),
    privQueryAll(`SELECT id FROM club_groups WHERE clubId = ?`, [clubId]),
    privQueryAll(`SELECT userId FROM club_memberships WHERE clubId = ?`, [clubId]),
  ]);

  const validGroupIds = new Set(activeGroups.map(g => g.id));
  const activeClubUserIds = new Set(activeMemberships.map(m => m.userId));
  const userEmailLower = normalizeEmail(user?.email || '');

  // Shared club sections (never includes private `visibility = 'personal'` sections)
  const sharedClubSections = allSections.filter(s => s.visibility !== 'personal');

  // Strict server-side RBAC filter: strip `visibility = 'board'` sections & tasks unless `perm.isBoard`,
  // and scope regular members to general club tasks + tasks assigned to them or their sub-groups!
  const visibleSections = perm.isBoard
    ? sharedClubSections
    : sharedClubSections.filter(s => s.visibility !== 'board');

  const visibleSectionIds = new Set(visibleSections.map(s => s.id));
  const formattedTasks = rawTasks
    .filter(row => row.visibility !== 'personal')
    .map(row => {
      const t = formatTaskRow(row, user?.id || '');
      const cleanGroupIds = (t.groupIds || []).filter(gid => validGroupIds.has(gid));
      const cleanAssignees = (t.assignees || []).filter(
        a => !a.userId || activeClubUserIds.has(a.userId)
      );
      return {
        ...t,
        groupIds: cleanGroupIds,
        assignees: cleanAssignees,
      };
    })
    .filter(t => {
      if (!visibleSectionIds.has(t.sectionId)) return false;
      if (perm.isBoard) return true;
      if (t.visibility === 'board' || t.audience === 'board') return false;
      if (t.audience === 'general') return true;

      // Targeted task: visible to regular member ONLY if assigned directly to them or one of their sub-groups
      const isDirectlyAssigned = t.assignees.some(
        a =>
          (user?.id && a.userId === user.id) ||
          (userEmailLower && a.email && normalizeEmail(a.email) === userEmailLower)
      );
      const isGroupAssigned = t.groupIds.some(gid => (perm.groupIds || []).includes(gid));
      return isDirectlyAssigned || isGroupAssigned;
    });

  // Per-server personal to-do sections & tasks: strictly isolated to `user.id` (private even from Board)
  const defaultPersonalSection = user?.id ? makeDefaultPersonalSection(clubId, user.id) : null;
  const customPersonalSections = user?.id
    ? allSections
        .filter(s => s.visibility === 'personal' && s.createdByUserId === user.id)
        .map(s => ({ ...s, isPersonal: true, isDefaultPersonal: false }))
    : [];
  const personalSections = defaultPersonalSection
    ? [defaultPersonalSection, ...customPersonalSections]
    : [];
  const validPersonalSectionIds = new Set(personalSections.map(s => s.id));

  const personalTasks = user?.id
    ? rawTasks
        .filter(row => row.visibility === 'personal' && row.createdByUserId === user.id)
        .map(row => {
          const t = formatTaskRow(row, user.id);
          const resolvedSectionId = validPersonalSectionIds.has(t.sectionId)
            ? t.sectionId
            : defaultPersonalSection.id;
          return {
            ...t,
            sectionId: resolvedSectionId,
            visibility: 'personal',
            audience: 'personal',
            isPersonal: true,
          };
        })
    : [];

  return {
    clubId,
    permission: perm,
    sections: visibleSections,
    tasks: formattedTasks,
    personalSections,
    personalTasks,
  };
}

router.get('/clubs/:clubId/tasks', requireAuth, async (req, res) => {
  const clubId = normalizeClubKey(req.params.clubId);
  const perm = await getClubPermission(req.user, clubId);
  if (!perm.isMember && !perm.isBoard) {
    return res.status(403).json({
      error: 'Join this club to access its member task board.',
      code: 'NOT_CLUB_MEMBER',
    });
  }

  const boardPayload = await buildClubTasksBoardPayload(clubId, req.user, perm);
  const clubPeople = await buildClubPeopleAndShortcuts(clubId, req.user, perm);
  res.json({
    ...boardPayload,
    groups: clubPeople.groups,
    shortcuts: clubPeople.shortcuts,
  });
});

router.post('/clubs/:clubId/task-sections', requireAuth, async (req, res) => {
  const clubId = normalizeClubKey(req.params.clubId);
  const perm = await getClubPermission(req.user, clubId);
  const { title, color = 'blue', visibility = 'members' } = req.body || {};
  const isPersonalSection = visibility === 'personal';

  if (isPersonalSection) {
    if (!perm.isMember && !perm.isBoard) {
      return res.status(403).json({
        error: 'Join this club before adding personal task sections.',
        code: 'NOT_CLUB_MEMBER',
      });
    }
  } else if (!perm.isBoard) {
    return res.status(403).json({
      error: 'Only claimed board members can create task sections.',
    });
  }

  const cleanTitle = String(title || '').trim().slice(0, 80);
  if (!cleanTitle) return res.status(400).json({ error: 'Section title is required.' });

  const safeColor = VALID_COLORS.has(color) ? color : isPersonalSection ? 'green' : 'blue';
  const safeVis = isPersonalSection ? 'personal' : visibility === 'board' ? 'board' : 'members';
  const existing = await ensureDefaultTaskSections(clubId, req.user.id);
  const nextPos = existing.length;
  const sectionId = isPersonalSection
    ? `sec_personal_custom_${clubId}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`
    : `sec_${clubId}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const nowIso = new Date().toISOString();

  await privExecute(
    `INSERT INTO club_task_sections (
       id, clubId, title, color, visibility, position, createdByUserId, createdAt
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [sectionId, clubId, cleanTitle, safeColor, safeVis, nextPos, req.user.id, nowIso]
  );

  const payload = await buildClubTasksBoardPayload(clubId, req.user, perm);
  res.status(201).json({ ok: true, ...payload });
});

router.delete('/clubs/:clubId/task-sections/:sectionId', requireAuth, async (req, res) => {
  const clubId = normalizeClubKey(req.params.clubId);
  const perm = await getClubPermission(req.user, clubId);
  if (!perm.isMember && !perm.isBoard) {
    return res.status(403).json({
      error: 'Club membership required.',
      code: 'NOT_CLUB_MEMBER',
    });
  }

  const sectionId = req.params.sectionId;
  const existingSection = await privQueryGet(
    `SELECT * FROM club_task_sections WHERE clubId = ? AND id = ?`,
    [clubId, sectionId]
  );

  if (existingSection && existingSection.visibility === 'personal') {
    if (existingSection.createdByUserId !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own personal task sections.' });
    }
    await privBatch([
      {
        sql: `DELETE FROM club_tasks WHERE clubId = ? AND sectionId = ? AND createdByUserId = ? AND visibility = 'personal'`,
        params: [clubId, sectionId, req.user.id],
      },
      {
        sql: `DELETE FROM club_task_sections WHERE clubId = ? AND id = ? AND createdByUserId = ?`,
        params: [clubId, sectionId, req.user.id],
      },
    ]);
    const payload = await buildClubTasksBoardPayload(clubId, req.user, perm);
    return res.json({ ok: true, ...payload });
  }

  if (!perm.isBoard) {
    return res.status(403).json({ error: 'Only claimed board members can delete task sections.' });
  }

  await privBatch([
    {
      sql: `DELETE FROM club_tasks WHERE clubId = ? AND sectionId = ? AND visibility != 'personal'`,
      params: [clubId, sectionId],
    },
    { sql: `DELETE FROM club_task_sections WHERE clubId = ? AND id = ?`, params: [clubId, sectionId] },
  ]);

  const payload = await buildClubTasksBoardPayload(clubId, req.user, perm);
  res.json({ ok: true, ...payload });
});

router.post('/clubs/:clubId/tasks', requireAuth, async (req, res) => {
  const clubId = normalizeClubKey(req.params.clubId);
  const perm = await getClubPermission(req.user, clubId);

  const {
    title,
    notes = '',
    sectionId: rawSectionId = '',
    visibility: rawVisibility = 'members',
    audience: rawAudience = 'general',
    status: rawStatus = 'not_started',
    priority: rawPriority = 'medium',
    dueDate: rawDueDate = '',
    dueTime: rawDueTime = '',
    reminder: rawReminder = undefined,
    assignees = [],
    groupIds = [],
    shortcutTargets = [],
    isPersonal = false,
  } = req.body || {};

  const { dueDate: cleanDueDate, dueTime: cleanDueTime } = normalizeDueDateAndTime(
    rawDueDate,
    rawDueTime
  );

  const wantsPersonalTask =
    Boolean(isPersonal) ||
    rawVisibility === 'personal' ||
    rawAudience === 'personal' ||
    String(rawSectionId || '').startsWith('sec_personal_');

  if (wantsPersonalTask) {
    if (!perm.isMember && !perm.isBoard) {
      return res.status(403).json({
        error: 'Join this club to add personal to-do tasks.',
        code: 'NOT_CLUB_MEMBER',
      });
    }

    const cleanTitle = String(title || '').trim().slice(0, 160);
    if (!cleanTitle) return res.status(400).json({ error: 'Task title is required.' });

    const allSections = await ensureDefaultTaskSections(clubId, req.user.id);
    const defaultPersonalSec = makeDefaultPersonalSection(clubId, req.user.id);
    const ownedPersonalSectionIds = new Set([
      defaultPersonalSec.id,
      ...allSections
        .filter(s => s.visibility === 'personal' && s.createdByUserId === req.user.id)
        .map(s => s.id),
    ]);
    const targetPersonalSecId = ownedPersonalSectionIds.has(String(rawSectionId || ''))
      ? String(rawSectionId)
      : defaultPersonalSec.id;

    const status = VALID_TASK_STATUSES.has(rawStatus) ? rawStatus : 'not_started';
    const priority = VALID_TASK_PRIORITIES.has(rawPriority) ? rawPriority : 'medium';
    const taskId = `ptsk_${clubId}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const nowIso = new Date().toISOString();
    const selfAssignee = [
      {
        memberKey: `uid:${req.user.id}`,
        userId: req.user.id,
        name: req.user.fullName,
        initials: toInitials(req.user.fullName),
        email: req.user.email || '',
        roleTitle: perm.roleTitle || 'Member',
        tier: perm.tier || 'member',
      },
    ];
    const initialCompletedBy =
      status === 'done'
        ? [{ userId: req.user.id, name: req.user.fullName, completedAt: nowIso }]
        : [];
    const reminderConfigJson = buildUpdatedReminderConfigJson({
      existingRawJson: '{}',
      incomingReminder: rawReminder,
      dueDate: cleanDueDate,
      dueTime: cleanDueTime,
      actorUserId: req.user.id,
      isPersonalOrBoardOwner: true,
    });

    await privExecute(
      `INSERT INTO club_tasks (
         id, clubId, sectionId, title, notes, visibility, audience,
         status, priority, dueDate, dueTime, reminderConfigJson,
         assigneesJson, groupIdsJson, completedByJson,
         position, createdByUserId, createdByName, createdAt, updatedAt
       ) VALUES (?, ?, ?, ?, ?, 'personal', 'personal', ?, ?, ?, ?, ?, ?, '[]', ?, 0, ?, ?, ?, ?)`,
      [
        taskId,
        clubId,
        targetPersonalSecId,
        cleanTitle,
        String(notes || '').trim().slice(0, 800),
        status,
        priority,
        cleanDueDate,
        cleanDueTime,
        reminderConfigJson,
        JSON.stringify(selfAssignee),
        JSON.stringify(initialCompletedBy),
        req.user.id,
        req.user.fullName,
        nowIso,
        nowIso,
      ]
    );

    const payload = await buildClubTasksBoardPayload(clubId, req.user, perm);
    const createdPersonal = payload.personalTasks.find(t => t.id === taskId) || null;
    return res.status(201).json({ ok: true, task: createdPersonal, ...payload });
  }

  if (!perm.isBoard) {
    return res.status(403).json({
      error: 'Only claimed board members of this club can create and assign tasks.',
    });
  }

  const cleanTitle = String(title || '').trim().slice(0, 160);
  if (!cleanTitle) return res.status(400).json({ error: 'Task title is required.' });

  const sections = await ensureDefaultTaskSections(clubId, req.user.id);
  const sharedSections = sections.filter(s => s.visibility !== 'personal');
  const clubData = await buildClubPeopleAndShortcuts(clubId, req.user, perm);

  let visibility = rawVisibility === 'board' ? 'board' : 'members';
  let audience =
    visibility === 'board'
      ? 'board'
      : rawAudience === 'targeted' || rawAudience === 'board'
        ? rawAudience
        : 'general';

  // Extract group IDs from shortcutTargets if any `group:<id>` shortcuts were clicked
  const mergedGroupIds = new Set(Array.isArray(groupIds) ? groupIds.map(String) : []);
  const personShortcuts = [];
  let hasAllMembersShortcut = false;

  for (const st of shortcutTargets || []) {
    const s = String(st || '');
    if (s === 'all_members' || s === 'everyone') {
      hasAllMembersShortcut = true;
    } else if (s.startsWith('group:')) {
      mergedGroupIds.add(s.slice(6));
    } else {
      personShortcuts.push(s);
    }
  }

  const resolvedAssignees = expandShortcutTargets(clubData, personShortcuts, assignees);
  const finalGroupIds = Array.from(mergedGroupIds).filter(gid =>
    clubData.groups.some(g => g.id === gid)
  );

  if (visibility !== 'board') {
    if (hasAllMembersShortcut && resolvedAssignees.length === 0 && finalGroupIds.length === 0) {
      audience = 'general';
    } else if (resolvedAssignees.length > 0 || finalGroupIds.length > 0) {
      audience = 'targeted';
    }
  }

  // Pick section matching visibility if none provided
  let targetSection = sharedSections.find(s => s.id === rawSectionId);
  if (!targetSection) {
    if (visibility === 'board') {
      targetSection = sharedSections.find(s => s.visibility === 'board') || sharedSections[0];
    } else if (audience === 'targeted') {
      targetSection =
        sharedSections.find(s => s.id.endsWith('_sprint')) ||
        sharedSections.find(s => s.visibility === 'members') ||
        sharedSections[0];
    } else {
      targetSection = sharedSections.find(s => s.visibility === 'members') || sharedSections[0];
    }
  }
  if (targetSection?.visibility === 'board') {
    visibility = 'board';
    audience = 'board';
  }

  const status = VALID_TASK_STATUSES.has(rawStatus) ? rawStatus : 'not_started';
  const priority = VALID_TASK_PRIORITIES.has(rawPriority) ? rawPriority : 'medium';
  const taskId = `tsk_${clubId}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const nowIso = new Date().toISOString();
  const sharedReminderJson = buildUpdatedReminderConfigJson({
    existingRawJson: '{}',
    incomingReminder: rawReminder,
    dueDate: cleanDueDate,
    dueTime: cleanDueTime,
    actorUserId: req.user.id,
    isPersonalOrBoardOwner: true,
  });

  await privExecute(
    `INSERT INTO club_tasks (
       id, clubId, sectionId, title, notes, visibility, audience,
       status, priority, dueDate, dueTime, reminderConfigJson,
       assigneesJson, groupIdsJson, completedByJson,
       position, createdByUserId, createdByName, createdAt, updatedAt
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 0, ?, ?, ?, ?)`,
    [
      taskId,
      clubId,
      targetSection.id,
      cleanTitle,
      String(notes || '').trim().slice(0, 800),
      visibility,
      audience,
      status,
      priority,
      cleanDueDate,
      cleanDueTime,
      sharedReminderJson,
      JSON.stringify(resolvedAssignees),
      JSON.stringify(finalGroupIds),
      req.user.id,
      req.user.fullName,
      nowIso,
      nowIso,
    ]
  );

  const payload = await buildClubTasksBoardPayload(clubId, req.user, perm);
  const createdTask = payload.tasks.find(t => t.id === taskId);
  res.status(201).json({ ok: true, task: createdTask, ...payload });
});

router.patch('/clubs/:clubId/tasks/:taskId', requireAuth, async (req, res) => {
  const clubId = normalizeClubKey(req.params.clubId);
  const perm = await getClubPermission(req.user, clubId);
  if (!perm.isMember && !perm.isBoard) {
    return res.status(403).json({
      error: 'Club membership required.',
      code: 'NOT_CLUB_MEMBER',
    });
  }

  const rawRow = await privQueryGet(
    `SELECT * FROM club_tasks WHERE id = ? AND clubId = ?`,
    [req.params.taskId, clubId]
  );
  if (!rawRow) return res.status(404).json({ error: 'Task not found.' });

  const task = formatTaskRow(rawRow, req.user.id);
  const nowIso = new Date().toISOString();
  const body = req.body || {};

  // Private Personal To-Do Task Path: strictly accessible ONLY by `task.createdByUserId` (even Board cannot touch another user's personal todo)
  if (task.visibility === 'personal') {
    if (task.createdByUserId !== req.user.id) {
      return res.status(403).json({
        error: 'Personal tasks are private and can only be modified by their creator.',
      });
    }

    const nextTitle =
      typeof body.title === 'string' && body.title.trim()
        ? body.title.trim().slice(0, 160)
        : task.title;
    const nextNotes =
      typeof body.notes === 'string' ? body.notes.trim().slice(0, 800) : task.notes;
    const nextPriority =
      body.priority && VALID_TASK_PRIORITIES.has(body.priority) ? body.priority : task.priority;

    const rawNextDueDate = typeof body.dueDate === 'string' ? body.dueDate : task.dueDate;
    const rawNextDueTime =
      typeof body.dueTime === 'string'
        ? body.dueTime
        : body.dueDate === ''
          ? ''
          : task.dueTime;
    const { dueDate: nextDueDate, dueTime: nextDueTime } = normalizeDueDateAndTime(
      rawNextDueDate,
      rawNextDueTime
    );

    let nextStatus = task.status;
    let nextCompletedBy = [...task.completedBy];

    if (body.toggleCompletedForSelf) {
      const willBeDone = task.status !== 'done';
      nextStatus = willBeDone ? 'done' : 'not_started';
      nextCompletedBy = willBeDone
        ? [{ userId: req.user.id, name: req.user.fullName, completedAt: nowIso }]
        : [];
    } else if (body.status !== undefined) {
      if (!VALID_TASK_STATUSES.has(body.status)) {
        return res.status(400).json({ error: 'Invalid status value.' });
      }
      nextStatus = body.status;
      nextCompletedBy =
        nextStatus === 'done'
          ? [{ userId: req.user.id, name: req.user.fullName, completedAt: nowIso }]
          : [];
    }

    let nextSectionId = task.sectionId;
    if (typeof body.sectionId === 'string' && body.sectionId) {
      const allSections = await ensureDefaultTaskSections(clubId, req.user.id);
      const defaultPersonalSec = makeDefaultPersonalSection(clubId, req.user.id);
      const ownedPersonalSectionIds = new Set([
        defaultPersonalSec.id,
        ...allSections
          .filter(s => s.visibility === 'personal' && s.createdByUserId === req.user.id)
          .map(s => s.id),
      ]);
      if (ownedPersonalSectionIds.has(body.sectionId)) {
        nextSectionId = body.sectionId;
      }
    }

    const nextReminderJson = buildUpdatedReminderConfigJson({
      existingRawJson: rawRow.reminderConfigJson || '{}',
      incomingReminder: body.reminder,
      dueDate: nextDueDate,
      dueTime: nextDueTime,
      actorUserId: req.user.id,
      isPersonalOrBoardOwner: true,
      reopenedFromDone: task.status === 'done' && nextStatus !== 'done',
    });

    await privExecute(
      `UPDATE club_tasks
          SET sectionId = ?, title = ?, notes = ?, visibility = 'personal', audience = 'personal',
              status = ?, priority = ?, dueDate = ?, dueTime = ?, reminderConfigJson = ?,
              completedByJson = ?, updatedAt = ?
        WHERE id = ? AND clubId = ? AND createdByUserId = ?`,
      [
        nextSectionId,
        nextTitle,
        nextNotes,
        nextStatus,
        nextPriority,
        nextDueDate,
        nextDueTime,
        nextReminderJson,
        JSON.stringify(nextCompletedBy),
        nowIso,
        task.id,
        clubId,
        req.user.id,
      ]
    );

    const payload = await buildClubTasksBoardPayload(clubId, req.user, perm);
    const updatedPersonal = payload.personalTasks.find(t => t.id === task.id) || null;
    return res.json({ ok: true, task: updatedPersonal, ...payload });
  }

  if (!perm.isBoard && (task.visibility === 'board' || task.audience === 'board')) {
    return res.status(403).json({ error: 'Board leadership permissions required for board tasks.' });
  }

  // Regular Member RBAC path: strictly scoped to own completion, assigned status, or own personal reminder override
  if (!perm.isBoard) {
    const forbiddenFields = [
      'title',
      'notes',
      'priority',
      'dueDate',
      'dueTime',
      'visibility',
      'audience',
      'assignees',
      'groupIds',
      'shortcutTargets',
      'sectionId',
    ];
    for (const f of forbiddenFields) {
      if (body[f] !== undefined) {
        return res.status(403).json({
          error: `Only club board members can edit task ${f}.`,
        });
      }
    }

    const userEmailLower = normalizeEmail(req.user.email);
    const isDirectlyAssigned = task.assignees.some(
      a =>
        (a.userId && a.userId === req.user.id) ||
        (a.email && normalizeEmail(a.email) === userEmailLower)
    );
    const isGroupAssigned = task.groupIds.some(gid => perm.groupIds.includes(gid));
    const canModifyTargeted = isDirectlyAssigned || isGroupAssigned;

    if (task.audience !== 'general' && !canModifyTargeted) {
      return res.status(403).json({
        error: 'This task is assigned to specific members or groups.',
      });
    }

    let nextStatus = task.status;
    let nextCompletedBy = [...task.completedBy];

    if (body.toggleCompletedForSelf) {
      const alreadyIdx = nextCompletedBy.findIndex(c => c.userId === req.user.id);
      if (alreadyIdx >= 0) {
        nextCompletedBy.splice(alreadyIdx, 1);
      } else {
        nextCompletedBy.push({
          userId: req.user.id,
          name: req.user.fullName,
          completedAt: nowIso,
        });
      }
    }

    if (body.status !== undefined) {
      if (task.audience === 'general' && !body.toggleCompletedForSelf) {
        // On general club checklists, clicking status for a regular member toggles their own personal completion!
        const markDone = body.status === 'done';
        const alreadyIdx = nextCompletedBy.findIndex(c => c.userId === req.user.id);
        if (markDone && alreadyIdx === -1) {
          nextCompletedBy.push({
            userId: req.user.id,
            name: req.user.fullName,
            completedAt: nowIso,
          });
        } else if (!markDone && alreadyIdx >= 0) {
          nextCompletedBy.splice(alreadyIdx, 1);
        }
      } else {
        if (!canModifyTargeted) {
          return res.status(403).json({
            error: 'Only assigned members, group members, or club board leaders can change this task status.',
          });
        }
        if (!VALID_TASK_STATUSES.has(body.status)) {
          return res.status(400).json({ error: 'Invalid status value.' });
        }
        nextStatus = body.status;
      }
    }

    const nextMemberReminderJson =
      body.reminder !== undefined
        ? buildUpdatedReminderConfigJson({
            existingRawJson: rawRow.reminderConfigJson || '{}',
            incomingReminder: body.reminder,
            dueDate: task.dueDate,
            dueTime: task.dueTime,
            actorUserId: req.user.id,
            isPersonalOrBoardOwner: false,
          })
        : rawRow.reminderConfigJson || '{}';

    await privExecute(
      `UPDATE club_tasks
          SET status = ?, completedByJson = ?, reminderConfigJson = ?, updatedAt = ?
        WHERE id = ?`,
      [nextStatus, JSON.stringify(nextCompletedBy), nextMemberReminderJson, nowIso, task.id]
    );

    const payload = await buildClubTasksBoardPayload(clubId, req.user, perm);
    const updatedTask = payload.tasks.find(t => t.id === task.id) || null;
    return res.json({ ok: true, task: updatedTask, ...payload });
  }

  // Board Leader full edit path (for shared club tasks)
  const clubData = await buildClubPeopleAndShortcuts(clubId, req.user, perm);
  const nextTitle =
    typeof body.title === 'string' && body.title.trim()
      ? body.title.trim().slice(0, 160)
      : task.title;
  const nextNotes =
    typeof body.notes === 'string' ? body.notes.trim().slice(0, 800) : task.notes;
  const nextStatus =
    body.status && VALID_TASK_STATUSES.has(body.status) ? body.status : task.status;
  const nextPriority =
    body.priority && VALID_TASK_PRIORITIES.has(body.priority) ? body.priority : task.priority;

  const rawBoardDueDate = typeof body.dueDate === 'string' ? body.dueDate : task.dueDate;
  const rawBoardDueTime =
    typeof body.dueTime === 'string'
      ? body.dueTime
      : body.dueDate === ''
        ? ''
        : task.dueTime;
  const { dueDate: nextDueDate, dueTime: nextDueTime } = normalizeDueDateAndTime(
    rawBoardDueDate,
    rawBoardDueTime
  );

  const nextSectionId =
    typeof body.sectionId === 'string' && body.sectionId ? body.sectionId : task.sectionId;
  let nextVisibility =
    body.visibility === 'board' || body.visibility === 'members'
      ? body.visibility
      : task.visibility;

  let nextAssignees = task.assignees;
  let nextGroupIds = task.groupIds;
  let nextAudience =
    body.audience === 'general' || body.audience === 'targeted' || body.audience === 'board'
      ? body.audience
      : task.audience;

  if (body.assignees !== undefined || body.groupIds !== undefined || body.shortcutTargets !== undefined) {
    const grpSet = new Set(Array.isArray(body.groupIds) ? body.groupIds.map(String) : nextGroupIds);
    const pShortcuts = [];
    let allMem = false;
    for (const st of body.shortcutTargets || []) {
      const s = String(st || '');
      if (s === 'all_members' || s === 'everyone') allMem = true;
      else if (s.startsWith('group:')) grpSet.add(s.slice(6));
      else pShortcuts.push(s);
    }
    nextAssignees = expandShortcutTargets(
      clubData,
      pShortcuts,
      body.assignees !== undefined ? body.assignees : nextAssignees
    );
    nextGroupIds = Array.from(grpSet).filter(gid => clubData.groups.some(g => g.id === gid));

    if (nextVisibility !== 'board' && body.audience === undefined) {
      if (allMem && nextAssignees.length === 0 && nextGroupIds.length === 0) {
        nextAudience = 'general';
      } else {
        nextAudience = nextAssignees.length > 0 || nextGroupIds.length > 0 ? 'targeted' : 'general';
      }
    }
  }

  if (nextVisibility === 'board') nextAudience = 'board';

  let nextCompletedBy = [...task.completedBy];
  if (body.toggleCompletedForSelf) {
    const idx = nextCompletedBy.findIndex(c => c.userId === req.user.id);
    if (idx >= 0) nextCompletedBy.splice(idx, 1);
    else nextCompletedBy.push({ userId: req.user.id, name: req.user.fullName, completedAt: nowIso });
  }

  const nextBoardReminderJson = buildUpdatedReminderConfigJson({
    existingRawJson: rawRow.reminderConfigJson || '{}',
    incomingReminder: body.reminder,
    dueDate: nextDueDate,
    dueTime: nextDueTime,
    actorUserId: req.user.id,
    isPersonalOrBoardOwner: true,
    reopenedFromDone: task.status === 'done' && nextStatus !== 'done',
  });

  await privExecute(
    `UPDATE club_tasks
        SET sectionId = ?, title = ?, notes = ?, visibility = ?, audience = ?,
            status = ?, priority = ?, dueDate = ?, dueTime = ?, reminderConfigJson = ?,
            assigneesJson = ?, groupIdsJson = ?, completedByJson = ?, updatedAt = ?
      WHERE id = ? AND clubId = ?`,
    [
      nextSectionId,
      nextTitle,
      nextNotes,
      nextVisibility,
      nextAudience,
      nextStatus,
      nextPriority,
      nextDueDate,
      nextDueTime,
      nextBoardReminderJson,
      JSON.stringify(nextAssignees),
      JSON.stringify(nextGroupIds),
      JSON.stringify(nextCompletedBy),
      nowIso,
      task.id,
      clubId,
    ]
  );

  const payload = await buildClubTasksBoardPayload(clubId, req.user, perm);
  const updatedTask = payload.tasks.find(t => t.id === task.id) || null;
  res.json({ ok: true, task: updatedTask, ...payload });
});

router.post('/clubs/:clubId/tasks/:taskId/remind', requireAuth, async (req, res) => {
  const clubId = normalizeClubKey(req.params.clubId);
  const perm = await getClubPermission(req.user, clubId);
  if (!perm.isMember && !perm.isBoard) {
    return res.status(403).json({
      error: 'Club membership required.',
      code: 'NOT_CLUB_MEMBER',
    });
  }

  const rawRow = await privQueryGet(
    `SELECT * FROM club_tasks WHERE id = ? AND clubId = ?`,
    [req.params.taskId, clubId]
  );
  if (!rawRow) return res.status(404).json({ error: 'Task not found.' });

  if (rawRow.visibility === 'personal' && rawRow.createdByUserId !== req.user.id) {
    return res.status(403).json({
      error: 'Personal tasks are private and can only be accessed by their creator.',
    });
  }
  if (!perm.isBoard && (rawRow.visibility === 'board' || rawRow.audience === 'board')) {
    return res.status(403).json({ error: 'Board leadership permissions required.' });
  }

  const task = formatTaskRow(rawRow, req.user.id);
  if (!perm.isBoard && rawRow.visibility !== 'personal' && task.audience !== 'general') {
    const userEmailLower = normalizeEmail(req.user.email);
    const isAssigned = task.assignees.some(
      a =>
        (a.userId && a.userId === req.user.id) ||
        (a.email && normalizeEmail(a.email) === userEmailLower)
    );
    const isGroup = task.groupIds.some(gid => perm.groupIds.includes(gid));
    if (!isAssigned && !isGroup) {
      return res.status(403).json({ error: 'You do not have access to this targeted task.' });
    }
  }

  const {
    channels = null,
    webhookUrl = '',
    recipientEmail = '',
    accountKey = '',
    url = '',
    markAutoSent = false,
  } = req.body || {};

  const cfgObj = parseJsonSafe(rawRow.reminderConfigJson, {});
  const isOwnerOrBoard = rawRow.visibility === 'personal' || perm.isBoard;
  const activeEntry =
    !isOwnerOrBoard && cfgObj.userReminders?.[req.user.id]
      ? cfgObj.userReminders[req.user.id]
      : cfgObj;

  const dispatchOut = await dispatchTaskReminderChannels({
    task: rawRow,
    clubId,
    targetUser: req.user,
    reminderEntry: activeEntry,
    channelsOverride: Array.isArray(channels) ? channels : null,
    webhookUrlOverride: webhookUrl,
    recipientEmailOverride: recipientEmail,
    accountKey,
    url,
  });

  const nowIso = new Date().toISOString();
  if (!isOwnerOrBoard && cfgObj.userReminders) {
    const prevU = cfgObj.userReminders[req.user.id] || {};
    cfgObj.userReminders[req.user.id] = {
      ...prevU,
      lastManualSentAt: nowIso,
      ...(markAutoSent ? { sentAt: nowIso } : {}),
    };
  } else {
    cfgObj.lastManualSentAt = nowIso;
    if (markAutoSent) cfgObj.sentAt = nowIso;
  }

  await privExecute(
    `UPDATE club_tasks SET reminderConfigJson = ?, updatedAt = ? WHERE id = ?`,
    [JSON.stringify(cfgObj), nowIso, rawRow.id]
  );

  const boardPayload = await buildClubTasksBoardPayload(clubId, req.user, perm);
  const updatedTask =
    rawRow.visibility === 'personal'
      ? boardPayload.personalTasks.find(t => t.id === rawRow.id) || null
      : boardPayload.tasks.find(t => t.id === rawRow.id) || null;

  res.json({
    ok: true,
    anyDelivered: dispatchOut.anyDelivered,
    results: dispatchOut.results,
    dueLabel: dispatchOut.dueLabel,
    task: updatedTask,
    ...boardPayload,
  });
});

router.post('/tasks/reminders/check', requireAuth, async (req, res) => {
  const { accountKey = '', markSentOnAttempt = false, nowIso = '' } = req.body || {};
  const checkDate = nowIso && !Number.isNaN(new Date(nowIso).getTime()) ? new Date(nowIso) : new Date();
  const out = await checkAndDispatchDueTaskReminders({
    onlyUserId: req.user.id,
    accountKey,
    now: checkDate,
    markSentOnAttempt: Boolean(markSentOnAttempt),
  });
  res.json({ ok: true, ...out });
});

router.delete('/clubs/:clubId/tasks/:taskId', requireAuth, async (req, res) => {
  const clubId = normalizeClubKey(req.params.clubId);
  const perm = await getClubPermission(req.user, clubId);
  if (!perm.isMember && !perm.isBoard) {
    return res.status(403).json({
      error: 'Club membership required.',
      code: 'NOT_CLUB_MEMBER',
    });
  }

  const rawRow = await privQueryGet(
    `SELECT * FROM club_tasks WHERE id = ? AND clubId = ?`,
    [req.params.taskId, clubId]
  );

  if (rawRow && rawRow.visibility === 'personal') {
    if (rawRow.createdByUserId !== req.user.id) {
      return res.status(403).json({
        error: 'Personal tasks are private and can only be deleted by their creator.',
      });
    }
    await privExecute(
      `DELETE FROM club_tasks WHERE id = ? AND clubId = ? AND createdByUserId = ?`,
      [req.params.taskId, clubId, req.user.id]
    );
    const payload = await buildClubTasksBoardPayload(clubId, req.user, perm);
    return res.json({ ok: true, ...payload });
  }

  if (!perm.isBoard) {
    return res.status(403).json({ error: 'Only claimed board members can delete tasks.' });
  }

  await privExecute(`DELETE FROM club_tasks WHERE id = ? AND clubId = ? AND visibility != 'personal'`, [
    req.params.taskId,
    clubId,
  ]);
  const payload = await buildClubTasksBoardPayload(clubId, req.user, perm);
  res.json({ ok: true, ...payload });
});

// ── 6. Board-Verified Club Announcements with Audience Shortcuts ──────

router.get('/announcements', optionalAuth, async (req, res) => {
  if (!req.user) {
    return res.json({ announcements: [] });
  }

  const overview = await getUserWorkspaceOverview(req.user);
  const perms = overview?.permissionsByClub || {};
  const joinedClubKeys = Object.keys(perms).filter(cid => perms[cid]?.isMember);
  if (joinedClubKeys.length === 0) {
    return res.json({ announcements: [] });
  }

  const rows = await privQueryAll(
    `SELECT * FROM club_announcements_private ORDER BY createdAt DESC LIMIT 100`
  );

  const visible = rows
    .filter(r => {
      const p = perms[r.clubId];
      if (!p || !p.isMember) return false;
      if (r.visibility === 'board') return Boolean(p.isBoard);
      if (r.visibility === 'group') {
        if (p.isBoard) return true;
        const targetGroups = parseJsonSafe(r.targetGroupIdsJson, []);
        return targetGroups.some(gid => (p.groupIds || []).includes(gid));
      }
      return true;
    })
    .map(r => ({
      id: r.id,
      clubId: r.clubId,
      clubName: r.clubName,
      title: r.title,
      body: r.body,
      type: r.type || 'Update',
      visibility: r.visibility || 'members',
      targetGroupIds: parseJsonSafe(r.targetGroupIdsJson, []),
      recipientsSummary: r.recipientsSummary || '',
      permalink: r.permalink || '',
      authorName: r.authorName,
      authorRole: r.authorRole,
      createdAt: r.createdAt,
    }));

  res.json({ announcements: visible });
});

router.post('/clubs/:clubId/announcements', requireAuth, async (req, res) => {
  const clubId = normalizeClubKey(req.params.clubId);
  const perm = await getClubPermission(req.user, clubId);
  if (!perm.isBoard) {
    return res.status(403).json({
      error: 'Only verified board members of this club can publish official club announcements.',
    });
  }

  const {
    title,
    body = '',
    type = 'Update',
    visibility: rawVisibility = 'members',
    targetGroupIds = [],
    shortcutTargets = [],
    permalink = '',
  } = req.body || {};

  const cleanTitle = String(title || '').trim().slice(0, 140);
  if (!cleanTitle) return res.status(400).json({ error: 'Announcement title is required.' });

  const clubData = await buildClubPeopleAndShortcuts(clubId, req.user, perm);
  const recipients = expandShortcutTargets(clubData, shortcutTargets, []);
  const grpIds = new Set(Array.isArray(targetGroupIds) ? targetGroupIds.map(String) : []);
  for (const st of shortcutTargets || []) {
    if (String(st).startsWith('group:')) grpIds.add(String(st).slice(6));
  }

  let visibility = ['public', 'members', 'group', 'board'].includes(rawVisibility)
    ? rawVisibility
    : 'members';
  if (
    shortcutTargets?.length === 1 &&
    shortcutTargets[0] === 'all_board' &&
    rawVisibility === 'members'
  ) {
    visibility = 'board';
  } else if (grpIds.size > 0 && rawVisibility === 'members' && !shortcutTargets?.includes('all_members')) {
    visibility = 'group';
  }

  const recipientsSummary =
    recipients.length > 0
      ? `${recipients.length} ${recipients.length === 1 ? 'person' : 'people'} notified`
      : visibility === 'board'
        ? 'Board Officers Only'
        : 'All Club Members';

  const id = `ann_priv_${clubId}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const nowIso = new Date().toISOString();

  await privExecute(
    `INSERT INTO club_announcements_private (
       id, clubId, clubName, title, body, type, visibility,
       targetGroupIdsJson, recipientsSummary, permalink,
       authorUserId, authorName, authorRole, createdAt
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      clubId,
      clubData.clubName,
      cleanTitle,
      String(body || '').trim().slice(0, 2000),
      String(type || 'Update').slice(0, 32),
      visibility,
      JSON.stringify(Array.from(grpIds)),
      recipientsSummary,
      String(permalink || '').trim().slice(0, 400),
      req.user.id,
      req.user.fullName,
      perm.roleTitle || 'Officer',
      nowIso,
    ]
  );

  res.status(201).json({
    ok: true,
    announcement: {
      id,
      clubId,
      clubName: clubData.clubName,
      title: cleanTitle,
      body: String(body || '').trim(),
      type,
      visibility,
      targetGroupIds: Array.from(grpIds),
      recipientsSummary,
      recipientCount: recipients.length,
      permalink,
      authorName: req.user.fullName,
      authorRole: perm.roleTitle || 'Officer',
      createdAt: nowIso,
    },
  });
});

export default router;
