// ── ClubHub Supabase Cloud Persistence & Live Relational Table Sync ──
// Keeps local disk 100% free of user data (`:memory:` engine) while persisting all
// workspace state & syncing relational rows into the 9 Supabase PostgreSQL tables:
// `users`, `clubs`, `club_members`, `club_groups`, `group_members`, `polls`, `poll_responses`, `announcements`, `tasks`.

import crypto from 'node:crypto';
import { getSupabaseAdminClient, isServerSupabaseConfigured } from '../supabaseClient.js';

const PRIVATE_BUCKET = 'clubhub-private-state';
const STATE_OBJECT_PATH = 'workspace-state-v1.json';
const UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

const PERSISTED_TABLES = [
  'users',
  'user_sessions',
  'club_memberships',
  'roster_claims',
  'club_role_invites',
  'club_groups',
  'club_group_members',
  'club_task_sections',
  'club_tasks',
  'club_polls',
  'club_poll_responses',
  'club_announcements_private',
  'club_subscriptions',
  'club_events_private',
  'calendar_sync_profiles',
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function toDeterministicUuid(rawId) {
  const s = String(rawId || '').trim();
  if (UUID_RE.test(s)) return s.toLowerCase();
  const hash = crypto.createHash('sha1').update(`${UUID_NAMESPACE}:${s}`).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    ((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') +
      hash.slice(18, 20),
    hash.slice(20, 32),
  ].join('-');
}

function parseJson(raw, fallback) {
  if (!raw) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

let bucketReady = false;
async function ensurePrivateBucket(admin) {
  if (bucketReady) return;
  const { data: buckets } = await admin.storage.listBuckets();
  if (!(buckets || []).some(b => b.name === PRIVATE_BUCKET)) {
    await admin.storage.createBucket(PRIVATE_BUCKET, { public: false });
  }
  bucketReady = true;
}

export async function hydrateInMemoryDbFromSupabase(sqliteDb) {
  if (!isServerSupabaseConfigured()) return false;
  const admin = getSupabaseAdminClient();
  if (!admin?.storage) return false;

  try {
    await ensurePrivateBucket(admin);
    const { data, error } = await admin.storage.from(PRIVATE_BUCKET).download(STATE_OBJECT_PATH);
    if (error || !data) return false;

    const text = await data.text();
    const snapshot = JSON.parse(text);
    if (!snapshot || typeof snapshot !== 'object') return false;

    sqliteDb.exec('PRAGMA foreign_keys = OFF;');
    sqliteDb.exec('BEGIN');
    try {
      for (const table of PERSISTED_TABLES) {
        const rows = snapshot[table];
        if (!Array.isArray(rows) || rows.length === 0) continue;
        const cols = Object.keys(rows[0]);
        const placeholders = cols.map(() => '?').join(', ');
        const stmt = sqliteDb.prepare(
          `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`
        );
        for (const row of rows) {
          stmt.run(...cols.map(c => (row[c] === undefined ? null : row[c])));
        }
      }
      sqliteDb.exec('COMMIT');
    } catch (err) {
      sqliteDb.exec('ROLLBACK');
      throw err;
    } finally {
      sqliteDb.exec('PRAGMA foreign_keys = ON;');
    }
    return true;
  } catch {
    return false;
  }
}

const authUuidCache = new Map();
async function resolveSupabaseUserUuid(admin, userRow) {
  const email = String(userRow.email || '').trim().toLowerCase();
  if (!email) return null;
  if (authUuidCache.has(email)) return authUuidCache.get(email);

  const { data: existingPub } = await admin
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existingPub?.id) {
    authUuidCache.set(email, existingPub.id);
    return existingPub.id;
  }

  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: userRow.fullName || email.split('@')[0] },
  });

  if (created?.data?.user?.id) {
    authUuidCache.set(email, created.data.user.id);
    return created.data.user.id;
  }

  // Fallback: look up in auth.users list if already created
  const { data: listData } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = (listData?.users || []).find(u => (u.email || '').toLowerCase() === email);
  if (found?.id) {
    authUuidCache.set(email, found.id);
    return found.id;
  }
  return null;
}

export async function syncSnapshotToSupabase(sqliteDb) {
  if (!isServerSupabaseConfigured() || !sqliteDb) return;
  const admin = getSupabaseAdminClient();
  if (!admin) return;

  const snapshot = {};
  for (const table of PERSISTED_TABLES) {
    snapshot[table] = sqliteDb.prepare(`SELECT * FROM ${table}`).all();
  }

  // 1. Save complete atomic snapshot to private service-role-only Supabase Storage bucket
  await ensurePrivateBucket(admin);
  await admin.storage.from(PRIVATE_BUCKET).upload(
    STATE_OBJECT_PATH,
    Buffer.from(JSON.stringify(snapshot)),
    { contentType: 'application/json', upsert: true }
  );

  // 2. Map internal userIds -> Supabase `auth.users` / `public.users` UUIDs
  const userUuidByLocalId = new Map();
  const userUpsertsWithExtId = [];
  const userUpsertsWithoutExtId = [];
  for (const u of snapshot.users || []) {
    const sbUuid = await resolveSupabaseUserUuid(admin, u);
    if (!sbUuid) continue;
    userUuidByLocalId.set(u.id, sbUuid);
    const baseUser = {
      id: sbUuid,
      email: String(u.email || '').toLowerCase(),
      full_name: u.fullName || '',
      major: u.major || '',
      grad_year: u.gradYear || '',
      avatar_bg: u.avatarBg || '',
      verified_edu: Boolean(u.verifiedEdu),
    };
    const extId = String(u.externalAuthId || '').trim();
    if (extId) {
      userUpsertsWithExtId.push({ ...baseUser, external_auth_id: extId });
    } else {
      userUpsertsWithoutExtId.push(baseUser);
    }
  }
  if (userUpsertsWithExtId.length > 0) {
    const { error } = await admin.from('users').upsert(userUpsertsWithExtId, { onConflict: 'id' });
    if (error && /external_auth_id/i.test(error.message || '')) {
      await admin.from('users').upsert(
        userUpsertsWithExtId.map(({ external_auth_id: _omit, ...rest }) => rest),
        { onConflict: 'id' }
      );
    }
  }
  if (userUpsertsWithoutExtId.length > 0) {
    await admin.from('users').upsert(userUpsertsWithoutExtId, { onConflict: 'id' });
  }

  // 3. Ensure referenced clubs exist in `public.clubs`
  const clubIds = new Set([
    ...(snapshot.club_memberships || []).map(r => r.clubId),
    ...(snapshot.club_groups || []).map(r => r.clubId),
    ...(snapshot.club_tasks || []).map(r => r.clubId),
    ...(snapshot.club_announcements_private || []).map(r => r.clubId),
    ...(snapshot.club_events_private || []).map(r => r.clubId),
    ...(snapshot.club_polls || []).map(r => r.hostClubId).filter(Boolean),
  ]);
  if (clubIds.size > 0) {
    await admin.from('clubs').upsert(
      Array.from(clubIds).map(cid => ({ id: cid, name: cid })),
      { onConflict: 'id', ignoreDuplicates: true }
    );
  }

  // 4. Sync `club_members`, `club_groups`, `group_members`, `polls`, `poll_responses`, `announcements`, `tasks`
  const claimsByKey = new Map();
  for (const c of snapshot.roster_claims || []) {
    claimsByKey.set(`${c.clubId}::${c.userId}`, c);
  }

  const memberRows = (snapshot.club_memberships || [])
    .filter(m => userUuidByLocalId.has(m.userId))
    .map(m => {
      const claim = claimsByKey.get(`${m.clubId}::${m.userId}`);
      return {
        id: toDeterministicUuid(m.id),
        club_id: m.clubId,
        user_id: userUuidByLocalId.get(m.userId),
        role: ['member', 'board', 'president'].includes(m.tier) ? m.tier : 'member',
        role_title: m.roleTitle || 'Member',
        claimed_position: m.claimedRosterId || claim?.rosterId || null,
        claim_status: claim?.status || (m.claimedRosterId ? 'approved' : 'none'),
        verification_method: claim?.verificationMethod || 'member_join',
        office_hours: m.officeHours || '',
      };
    });
  if (memberRows.length > 0) {
    await admin.from('club_members').upsert(memberRows, { onConflict: 'club_id,user_id' });
  }

  const groupRows = (snapshot.club_groups || []).map(g => ({
    id: toDeterministicUuid(g.id),
    club_id: g.clubId,
    name: g.name,
    color: g.color || 'blue',
    description: g.description || '',
    created_by: userUuidByLocalId.get(g.createdByUserId) || null,
  }));
  if (groupRows.length > 0) {
    await admin.from('club_groups').upsert(groupRows, { onConflict: 'id' });
  }

  const groupMemRows = (snapshot.club_group_members || [])
    .filter(gm => gm.userId && userUuidByLocalId.has(gm.userId))
    .map(gm => ({
      id: toDeterministicUuid(gm.id),
      group_id: toDeterministicUuid(gm.groupId),
      club_id: gm.clubId,
      user_id: userUuidByLocalId.get(gm.userId),
    }));
  if (groupMemRows.length > 0) {
    await admin.from('group_members').upsert(groupMemRows, { onConflict: 'group_id,user_id' });
  }

  const pollRows = (snapshot.club_polls || [])
    .filter(p => p.createdByUserId && userUuidByLocalId.has(p.createdByUserId))
    .map(p => ({
      id: toDeterministicUuid(p.id),
      club_id: p.hostClubId || null,
      title: p.title,
      description: p.description || '',
      dates: parseJson(p.datesJson, []),
      start_hour: Number(p.startHour || 9),
      end_hour: Number(p.endHour || 20),
      slot_minutes: [15, 30, 60].includes(Number(p.slotMinutes)) ? Number(p.slotMinutes) : 30,
      timezone: p.baseTimezone || 'America/Los_Angeles',
      location: p.location || 'TBD',
      visibility: ['public_link', 'club_members', 'board_only'].includes(p.visibility)
        ? p.visibility
        : 'public_link',
      archived: Boolean(p.archived),
      archived_at: p.archivedAt || null,
      created_by: userUuidByLocalId.get(p.createdByUserId),
    }));
  if (pollRows.length > 0) {
    const { error: pollUpsertErr } = await admin
      .from('polls')
      .upsert(pollRows, { onConflict: 'id' });
    if (pollUpsertErr && /archived/i.test(pollUpsertErr.message || '')) {
      const legacyPollRows = pollRows.map(({ archived: _a, archived_at: _at, ...rest }) => rest);
      await admin.from('polls').upsert(legacyPollRows, { onConflict: 'id' });
    }
  }

  const pollIdsSet = new Set(pollRows.map(p => p.id));
  const respRows = (snapshot.club_poll_responses || [])
    .filter(
      r =>
        userUuidByLocalId.has(r.userId) &&
        pollIdsSet.has(toDeterministicUuid(r.pollId))
    )
    .map(r => ({
      id: toDeterministicUuid(r.id),
      poll_id: toDeterministicUuid(r.pollId),
      user_id: userUuidByLocalId.get(r.userId),
      timezone: r.timezone || 'America/Los_Angeles',
      free_slots: parseJson(r.freeSlotsJson, []),
      busy_slots: parseJson(r.busySlotsJson, []),
      notes: r.rawTextInput || '',
    }));
  if (respRows.length > 0) {
    await admin.from('poll_responses').upsert(respRows, { onConflict: 'poll_id,user_id' });
  }

  const eventRows = (snapshot.club_events_private || []).filter(e => userUuidByLocalId.has(e.authorUserId)).map(e => ({
    id: toDeterministicUuid(e.id), club_id: e.clubId, title: e.title, start_at: e.start,
    end_at: e.end, all_day: Boolean(e.allDay), location: e.location || '', important: Boolean(e.important),
    author_id: userUuidByLocalId.get(e.authorUserId),
  }));
  if (eventRows.length) await admin.from('club_events').upsert(eventRows, { onConflict: 'id' });

  const annRows = (snapshot.club_announcements_private || []).map(a => ({
    id: toDeterministicUuid(a.id),
    club_id: a.clubId,
    title: a.title,
    body: a.body || '',
    type: a.type || 'Update',
    important: Boolean(a.important),
    created_at: a.createdAt,
    visibility: ['public', 'members', 'group', 'board'].includes(a.visibility)
      ? a.visibility
      : 'members',
    target_group_ids: parseJson(a.targetGroupIdsJson, []).map(toDeterministicUuid),
    permalink: a.permalink || '',
    author_id: userUuidByLocalId.get(a.authorUserId) || null,
  }));
  if (annRows.length > 0) {
    await admin.from('announcements').upsert(annRows, { onConflict: 'id' });
  }

  const sectionTitleById = new Map(
    (snapshot.club_task_sections || []).map(s => [s.id, { title: s.title, color: s.color }])
  );
  const taskRows = (snapshot.club_tasks || []).map(t => {
    const fallbackSec =
      t.visibility === 'personal'
        ? { title: 'My To-Do List', color: 'green' }
        : { title: 'General Club Tasks', color: 'blue' };
    const sec = sectionTitleById.get(t.sectionId) || fallbackSec;
    const assignedUuids = parseJson(t.assigneesJson, [])
      .map(a => userUuidByLocalId.get(a.userId))
      .filter(Boolean);
    const completedUuids = parseJson(t.completedByJson, [])
      .map(c => userUuidByLocalId.get(c.userId))
      .filter(Boolean);
    return {
      id: toDeterministicUuid(t.id),
      club_id: t.clubId,
      section_title: sec.title,
      section_color: sec.color || 'blue',
      title: t.title,
      notes: t.notes || '',
      visibility:
        t.visibility === 'personal'
          ? 'personal'
          : t.visibility === 'board'
            ? 'board'
            : 'members',
      audience: ['general', 'targeted', 'board', 'personal'].includes(t.audience)
        ? t.audience
        : 'general',
      status: t.status || 'not_started',
      priority: t.priority || 'medium',
      due_date: /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate || '') ? t.dueDate : null,
      due_time: String(t.dueTime || ''),
      reminder_config: parseJson(t.reminderConfigJson, {}),
      assigned_user_ids: assignedUuids,
      assigned_group_ids: parseJson(t.groupIdsJson, []).map(toDeterministicUuid),
      completed_by_user_ids: completedUuids,
      position: Number(t.position || 0),
      created_by: userUuidByLocalId.get(t.createdByUserId) || null,
    };
  });
  if (taskRows.length > 0) {
    let { error: taskUpsertErr } = await admin
      .from('tasks')
      .upsert(taskRows, { onConflict: 'id' });
    if (taskUpsertErr && /(due_time|reminder_config)/i.test(taskUpsertErr.message || '')) {
      const legacyTaskRows = taskRows.map(
        ({ due_time: _dt, reminder_config: _rc, ...rest }) => rest
      );
      const res = await admin.from('tasks').upsert(legacyTaskRows, { onConflict: 'id' });
      taskUpsertErr = res.error;
    }
    if (taskUpsertErr && /tasks_(audience|visibility)_check/i.test(taskUpsertErr.message || '')) {
      console.warn(
        '[SupabaseCloudPersistence] Supabase table "tasks" has legacy constraint (tasks_audience_check). Skipping personal tasks sync until ALTER TABLE script in supabase/schema.sql is executed in Supabase SQL editor.'
      );
      const nonPersonalTaskRows = taskRows
        .filter(t => t.audience !== 'personal' && t.visibility !== 'personal')
        .map(({ due_time: _dt, reminder_config: _rc, ...rest }) => rest);
      if (nonPersonalTaskRows.length > 0) {
        await admin.from('tasks').upsert(nonPersonalTaskRows, { onConflict: 'id' });
      }
    }
  }
}

export async function deletePollFromSupabase(pollId) {
  if (!isServerSupabaseConfigured() || !pollId) return;
  const admin = getSupabaseAdminClient();
  if (!admin) return;
  try {
    await admin.from('polls').delete().eq('id', toDeterministicUuid(pollId));
  } catch {
    // Ignore best-effort relational cleanup errors
  }
}
