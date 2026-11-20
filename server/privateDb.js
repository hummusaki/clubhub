// ── ClubHub Secure Private Multi-User Database Layer ──
// Strictly isolated from the public club catalog (`clubhub.db` / `public/clubhub-data.json`).
// Guarantees ZERO user accounts, claims, poll responses, groups, or club tasks ever touch public code or static snapshots.
//
// Supported Free Cloud & Dev Backends:
//   1. Turso Cloud SQLite over HTTPS (`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`) — 100% free hosted cloud DB (not on your PC).
//   2. Isolated Private SQLite (`PRIVATE_DB_PATH` or `server/data/private-users.db`, `.gitignore`d; `:memory:` in tests).
//      (For Cloudflare Workers + D1 or Supabase Free Cloud Postgres, see `cloudflare/` and `supabase/schema.sql`.)

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { isServerSupabaseConfigured } from './supabaseClient.js';
import {
  hydrateInMemoryDbFromSupabase,
  syncSnapshotToSupabase,
} from './services/supabaseCloudPersistence.js';

// Default to ephemeral `:memory:` when cloud keys are unset so ZERO user data ever touches local disk
const DEFAULT_LOCAL_PRIVATE_DB = ':memory:';

export const PRIVATE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id             TEXT PRIMARY KEY,
    email          TEXT UNIQUE NOT NULL,
    fullName       TEXT NOT NULL,
    major          TEXT NOT NULL DEFAULT '',
    gradYear       TEXT NOT NULL DEFAULT '',
    avatarBg       TEXT NOT NULL DEFAULT '',
    themeMode      TEXT NOT NULL DEFAULT 'system',
    passwordHash   TEXT,
    passwordSalt   TEXT,
    authProvider   TEXT NOT NULL DEFAULT 'email',
    externalAuthId TEXT,
    verifiedEdu    INTEGER NOT NULL DEFAULT 0,
    createdAt      TEXT NOT NULL,
    updatedAt      TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_priv_users_email ON users(email)`,

  `CREATE TABLE IF NOT EXISTS user_sessions (
    tokenHash  TEXT PRIMARY KEY,
    userId     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expiresAt  TEXT NOT NULL,
    createdAt  TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_priv_sessions_user ON user_sessions(userId)`,

  `CREATE TABLE IF NOT EXISTS club_memberships (
    id              TEXT PRIMARY KEY,
    clubId          TEXT NOT NULL,
    userId          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier            TEXT NOT NULL DEFAULT 'member',
    roleTitle       TEXT NOT NULL DEFAULT 'Member',
    claimedRosterId TEXT,
    officeHours     TEXT NOT NULL DEFAULT '',
    joinedAt        TEXT NOT NULL,
    updatedAt       TEXT NOT NULL,
    UNIQUE(clubId, userId)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_priv_memberships_club ON club_memberships(clubId)`,
  `CREATE INDEX IF NOT EXISTS idx_priv_memberships_user ON club_memberships(userId)`,

  `CREATE TABLE IF NOT EXISTS roster_claims (
    id                 TEXT PRIMARY KEY,
    clubId             TEXT NOT NULL,
    rosterId           TEXT NOT NULL,
    userId             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requestedRole      TEXT NOT NULL,
    rosterName         TEXT NOT NULL,
    status             TEXT NOT NULL DEFAULT 'pending',
    verificationMethod TEXT NOT NULL DEFAULT 'self_claim',
    notes              TEXT NOT NULL DEFAULT '',
    reviewedByUserId   TEXT,
    reviewedAt         TEXT,
    createdAt          TEXT NOT NULL,
    updatedAt          TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_priv_claims_club ON roster_claims(clubId, status)`,
  `CREATE INDEX IF NOT EXISTS idx_priv_claims_user ON roster_claims(userId)`,
  `CREATE INDEX IF NOT EXISTS idx_priv_claims_roster ON roster_claims(clubId, rosterId, status)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_priv_unique_approved_claim_slot
     ON roster_claims(clubId, LOWER(rosterId))
     WHERE status = 'approved'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_priv_unique_user_approved_club_claim
     ON roster_claims(clubId, userId)
     WHERE status = 'approved'`,

  `CREATE TABLE IF NOT EXISTS club_role_invites (
    id              TEXT PRIMARY KEY,
    clubId          TEXT NOT NULL,
    email           TEXT NOT NULL,
    fullName        TEXT NOT NULL DEFAULT '',
    tier            TEXT NOT NULL DEFAULT 'board',
    roleTitle       TEXT NOT NULL DEFAULT 'Officer',
    rosterId        TEXT,
    invitedByUserId TEXT NOT NULL,
    acceptedByUserId TEXT,
    createdAt       TEXT NOT NULL,
    UNIQUE(clubId, email)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_priv_invites_email ON club_role_invites(email)`,

  `CREATE TABLE IF NOT EXISTS club_groups (
    id              TEXT PRIMARY KEY,
    clubId          TEXT NOT NULL,
    name            TEXT NOT NULL,
    color           TEXT NOT NULL DEFAULT 'blue',
    description     TEXT NOT NULL DEFAULT '',
    createdByUserId TEXT NOT NULL,
    createdAt       TEXT NOT NULL,
    updatedAt       TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_priv_groups_club ON club_groups(clubId)`,

  `CREATE TABLE IF NOT EXISTS club_group_members (
    id         TEXT PRIMARY KEY,
    groupId    TEXT NOT NULL REFERENCES club_groups(id) ON DELETE CASCADE,
    clubId     TEXT NOT NULL,
    memberKey  TEXT NOT NULL,
    userId     TEXT,
    email      TEXT NOT NULL DEFAULT '',
    name       TEXT NOT NULL,
    roleTitle  TEXT NOT NULL DEFAULT 'Member',
    personType TEXT NOT NULL DEFAULT 'member',
    addedAt    TEXT NOT NULL,
    UNIQUE(groupId, memberKey)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_priv_group_members_group ON club_group_members(groupId)`,
  `CREATE INDEX IF NOT EXISTS idx_priv_group_members_club ON club_group_members(clubId)`,

  `CREATE TABLE IF NOT EXISTS club_task_sections (
    id              TEXT PRIMARY KEY,
    clubId          TEXT NOT NULL,
    title           TEXT NOT NULL,
    color           TEXT NOT NULL DEFAULT 'blue',
    visibility      TEXT NOT NULL DEFAULT 'members',
    position        INTEGER NOT NULL DEFAULT 0,
    createdByUserId TEXT NOT NULL,
    createdAt       TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_priv_task_sections_club ON club_task_sections(clubId)`,

  `CREATE TABLE IF NOT EXISTS club_tasks (
    id               TEXT PRIMARY KEY,
    clubId           TEXT NOT NULL,
    sectionId        TEXT NOT NULL,
    title            TEXT NOT NULL,
    notes            TEXT NOT NULL DEFAULT '',
    visibility       TEXT NOT NULL DEFAULT 'members',
    audience         TEXT NOT NULL DEFAULT 'general',
    status           TEXT NOT NULL DEFAULT 'not_started',
    priority         TEXT NOT NULL DEFAULT 'medium',
    dueDate          TEXT NOT NULL DEFAULT '',
    dueTime          TEXT NOT NULL DEFAULT '',
    reminderConfigJson TEXT NOT NULL DEFAULT '{}',
    assigneesJson    TEXT NOT NULL DEFAULT '[]',
    groupIdsJson     TEXT NOT NULL DEFAULT '[]',
    completedByJson  TEXT NOT NULL DEFAULT '[]',
    position         INTEGER NOT NULL DEFAULT 0,
    createdByUserId  TEXT NOT NULL,
    createdByName    TEXT NOT NULL DEFAULT '',
    createdAt        TEXT NOT NULL,
    updatedAt        TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_priv_tasks_club ON club_tasks(clubId, visibility)`,

  `CREATE TABLE IF NOT EXISTS club_polls (
    id                      TEXT PRIMARY KEY,
    title                   TEXT NOT NULL,
    description             TEXT NOT NULL DEFAULT '',
    hostClubId              TEXT NOT NULL DEFAULT '',
    hostClubName            TEXT NOT NULL DEFAULT '',
    collaboratingClubsJson  TEXT NOT NULL DEFAULT '[]',
    datesJson               TEXT NOT NULL DEFAULT '[]',
    startHour               INTEGER NOT NULL DEFAULT 9,
    endHour                 INTEGER NOT NULL DEFAULT 20,
    slotMinutes             INTEGER NOT NULL DEFAULT 30,
    baseTimezone            TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    location                TEXT NOT NULL DEFAULT 'TBD',
    visibility              TEXT NOT NULL DEFAULT 'public_link',
    invitedParticipantsJson TEXT NOT NULL DEFAULT '[]',
    bookedEventsJson        TEXT NOT NULL DEFAULT '[]',
    archived                INTEGER NOT NULL DEFAULT 0,
    archivedAt              TEXT,
    createdByUserId         TEXT,
    createdByName           TEXT NOT NULL DEFAULT '',
    createdAt               TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_priv_polls_club ON club_polls(hostClubId)`,

  `CREATE TABLE IF NOT EXISTS club_poll_responses (
    id           TEXT PRIMARY KEY,
    pollId       TEXT NOT NULL REFERENCES club_polls(id) ON DELETE CASCADE,
    userId       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    userName     TEXT NOT NULL,
    userEmail    TEXT NOT NULL DEFAULT '',
    roleTitle    TEXT NOT NULL DEFAULT '',
    clubId       TEXT NOT NULL DEFAULT '',
    clubName     TEXT NOT NULL DEFAULT '',
    timezone     TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    freeSlotsJson TEXT NOT NULL DEFAULT '[]',
    busySlotsJson TEXT NOT NULL DEFAULT '[]',
    rawTextInput TEXT NOT NULL DEFAULT '',
    updatedAt    TEXT NOT NULL,
    UNIQUE(pollId, userId)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_priv_poll_resp_poll ON club_poll_responses(pollId)`,

  `CREATE TABLE IF NOT EXISTS club_subscriptions (
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    clubId TEXT NOT NULL,
    events TEXT NOT NULL DEFAULT 'all' CHECK (events IN ('all', 'important', 'off')),
    announcements TEXT NOT NULL DEFAULT 'all' CHECK (announcements IN ('all', 'important', 'off')),
    PRIMARY KEY (userId, clubId)
  )`,
  `CREATE TABLE IF NOT EXISTS club_events_private (
    id TEXT PRIMARY KEY,
    clubId TEXT NOT NULL,
    clubName TEXT NOT NULL,
    title TEXT NOT NULL,
    start TEXT NOT NULL,
    end TEXT,
    allDay INTEGER NOT NULL DEFAULT 0,
    location TEXT NOT NULL DEFAULT '',
    important INTEGER NOT NULL DEFAULT 0,
    authorUserId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_priv_events_club ON club_events_private(clubId, start)`,
  `CREATE TABLE IF NOT EXISTS club_announcements_private (
    id                 TEXT PRIMARY KEY,
    clubId             TEXT NOT NULL,
    clubName           TEXT NOT NULL,
    title              TEXT NOT NULL,
    body               TEXT NOT NULL DEFAULT '',
    type               TEXT NOT NULL DEFAULT 'Update',
    important          INTEGER NOT NULL DEFAULT 0,
    visibility         TEXT NOT NULL DEFAULT 'members',
    targetGroupIdsJson TEXT NOT NULL DEFAULT '[]',
    recipientsSummary  TEXT NOT NULL DEFAULT '',
    permalink          TEXT NOT NULL DEFAULT '',
    authorUserId       TEXT NOT NULL,
    authorName         TEXT NOT NULL,
    authorRole         TEXT NOT NULL DEFAULT 'Officer',
    createdAt          TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_priv_ann_club ON club_announcements_private(clubId, visibility)`,

  `CREATE TABLE IF NOT EXISTS calendar_sync_profiles (
    token       TEXT PRIMARY KEY,
    accountHash TEXT,
    payload     TEXT NOT NULL DEFAULT '{}',
    updatedAt   TEXT NOT NULL
  )`,
];

function getTursoConfig() {
  const rawUrl = (process.env.TURSO_DATABASE_URL || '').trim();
  const authToken = (process.env.TURSO_AUTH_TOKEN || '').trim();
  if (!rawUrl || !authToken) return null;

  const httpsUrl = rawUrl
    .replace(/^libsql:\/\//i, 'https://')
    .replace(/^wss:\/\//i, 'https://')
    .replace(/\/+$/, '');
  return { endpoint: `${httpsUrl}/v2/pipeline`, authToken };
}

function encodeTursoArg(val) {
  if (val === null || val === undefined) return { type: 'null' };
  if (typeof val === 'boolean') return { type: 'integer', value: val ? '1' : '0' };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { type: 'integer', value: String(val) };
    return { type: 'float', value: val };
  }
  return { type: 'text', value: String(val) };
}

function decodeTursoCell(cell) {
  if (!cell || cell.type === 'null') return null;
  if (cell.type === 'integer') return Number(cell.value);
  if (cell.type === 'float') return Number(cell.value);
  return cell.value;
}

async function runTursoPipeline(config, statements) {
  const requests = statements.map(({ sql, params = [] }) => ({
    type: 'execute',
    stmt: {
      sql,
      args: params.map(encodeTursoArg),
    },
  }));
  requests.push({ type: 'close' });

  const res = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Turso private DB HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const payload = await res.json();
  const outputs = [];
  for (let i = 0; i < statements.length; i += 1) {
    const item = payload?.results?.[i];
    if (!item) {
      outputs.push({ rows: [], changes: 0 });
      continue;
    }
    if (item.type === 'error') {
      throw new Error(item.error?.message || 'Turso SQL execution error');
    }
    const result = item.response?.result || {};
    const cols = result.cols || [];
    const rows = (result.rows || []).map(rawRow => {
      const obj = {};
      for (let c = 0; c < cols.length; c += 1) {
        obj[cols[c].name] = decodeTursoCell(rawRow[c]);
      }
      return obj;
    });
    outputs.push({
      rows,
      changes: Number(result.affected_row_count || 0),
    });
  }
  return outputs;
}

let localDb = null;
let localStmtCache = new Map();
let schemaInitPromise = null;
let activeDbPathOverride = null;
let cloudSyncTimer = null;

function scheduleSupabaseCloudSync() {
  if (activeDbPathOverride || !isServerSupabaseConfigured() || !localDb) return;
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(() => {
    cloudSyncTimer = null;
    if (localDb) {
      syncSnapshotToSupabase(localDb).catch(err => {
        console.error('Supabase cloud sync warning:', err?.message || err);
      });
    }
  }, 250);
  if (typeof cloudSyncTimer.unref === 'function') {
    cloudSyncTimer.unref();
  }
}

export function setPrivateDbPathForTesting(customPath) {
  closePrivateDb();
  activeDbPathOverride = customPath;
}

function getLocalPrivateDb() {
  if (localDb) return localDb;
  const targetPath =
    activeDbPathOverride ||
    (process.env.PRIVATE_DB_PATH || '').trim() ||
    DEFAULT_LOCAL_PRIVATE_DB;

  if (targetPath !== ':memory:') {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  }
  localDb = new DatabaseSync(targetPath);
  if (targetPath !== ':memory:') {
    localDb.exec('PRAGMA journal_mode = WAL;');
  }
  localDb.exec('PRAGMA foreign_keys = ON;');
  localStmtCache = new Map();
  return localDb;
}

function getLocalStmt(db, sql) {
  let stmt = localStmtCache.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    localStmtCache.set(sql, stmt);
  }
  return stmt;
}

export function getPrivateDbMode() {
  if (isServerSupabaseConfigured()) return 'supabase_cloud';
  if (getTursoConfig()) return 'turso_cloud';
  return 'ephemeral_memory';
}

export async function ensurePrivateSchema() {
  if (schemaInitPromise) return schemaInitPromise;
  schemaInitPromise = (async () => {
    const turso = getTursoConfig();
    if (turso) {
      await runTursoPipeline(
        turso,
        PRIVATE_SCHEMA_STATEMENTS.map(sql => ({ sql, params: [] }))
      );
      const [tableInfo, userTableInfo, taskTableInfo, announcementTableInfo] = await runTursoPipeline(turso, [
        { sql: 'PRAGMA table_info(club_polls)', params: [] },
        { sql: 'PRAGMA table_info(users)', params: [] },
        { sql: 'PRAGMA table_info(club_tasks)', params: [] },
        { sql: 'PRAGMA table_info(club_announcements_private)', params: [] },
      ]);
      const colNames = new Set((tableInfo?.rows || []).map(r => r.name));
      const userColNames = new Set((userTableInfo?.rows || []).map(r => r.name));
      const taskColNames = new Set((taskTableInfo?.rows || []).map(r => r.name));
      const migrations = [];
      if (!(announcementTableInfo?.rows || []).some(row => row.name === 'important')) {
        migrations.push(
          { sql: 'ALTER TABLE club_announcements_private ADD COLUMN important INTEGER NOT NULL DEFAULT 0', params: [] },
          { sql: "UPDATE club_announcements_private SET important = 1 WHERE lower(type) = 'urgent'", params: [] }
        );
      }
      if (!colNames.has('archived')) {
        migrations.push({
          sql: 'ALTER TABLE club_polls ADD COLUMN archived INTEGER NOT NULL DEFAULT 0',
          params: [],
        });
      }
      if (!colNames.has('archivedAt')) {
        migrations.push({
          sql: 'ALTER TABLE club_polls ADD COLUMN archivedAt TEXT',
          params: [],
        });
      }
      if (!userColNames.has('themeMode')) {
        migrations.push({
          sql: "ALTER TABLE users ADD COLUMN themeMode TEXT NOT NULL DEFAULT 'system'",
          params: [],
        });
      }
      if (!taskColNames.has('dueTime')) {
        migrations.push({
          sql: "ALTER TABLE club_tasks ADD COLUMN dueTime TEXT NOT NULL DEFAULT ''",
          params: [],
        });
      }
      if (!taskColNames.has('reminderConfigJson')) {
        migrations.push({
          sql: "ALTER TABLE club_tasks ADD COLUMN reminderConfigJson TEXT NOT NULL DEFAULT '{}'",
          params: [],
        });
      }
      if (migrations.length > 0) {
        await runTursoPipeline(turso, migrations);
      }
      return;
    }
    const db = getLocalPrivateDb();
    for (const sql of PRIVATE_SCHEMA_STATEMENTS) {
      db.exec(sql);
    }
    if (!db.prepare('PRAGMA table_info(club_announcements_private)').all().some(row => row.name === 'important')) {
      db.exec(`ALTER TABLE club_announcements_private ADD COLUMN important INTEGER NOT NULL DEFAULT 0;
        UPDATE club_announcements_private SET important = 1 WHERE lower(type) = 'urgent'`);
    }
    const pollCols = new Set(
      db
        .prepare('PRAGMA table_info(club_polls)')
        .all()
        .map(c => c.name)
    );
    if (!pollCols.has('archived')) {
      db.exec('ALTER TABLE club_polls ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
    }
    if (!pollCols.has('archivedAt')) {
      db.exec('ALTER TABLE club_polls ADD COLUMN archivedAt TEXT');
    }
    const userCols = new Set(
      db
        .prepare('PRAGMA table_info(users)')
        .all()
        .map(c => c.name)
    );
    if (!userCols.has('themeMode')) {
      db.exec("ALTER TABLE users ADD COLUMN themeMode TEXT NOT NULL DEFAULT 'system'");
    }
    const taskCols = new Set(
      db
        .prepare('PRAGMA table_info(club_tasks)')
        .all()
        .map(c => c.name)
    );
    if (!taskCols.has('dueTime')) {
      db.exec("ALTER TABLE club_tasks ADD COLUMN dueTime TEXT NOT NULL DEFAULT ''");
    }
    if (!taskCols.has('reminderConfigJson')) {
      db.exec("ALTER TABLE club_tasks ADD COLUMN reminderConfigJson TEXT NOT NULL DEFAULT '{}'");
    }
    if (!activeDbPathOverride && isServerSupabaseConfigured()) {
      await hydrateInMemoryDbFromSupabase(db);
    }
  })();
  try {
    await schemaInitPromise;
  } catch (err) {
    schemaInitPromise = null;
    throw err;
  }
}

export async function privQueryAll(sql, params = []) {
  await ensurePrivateSchema();
  const turso = getTursoConfig();
  if (turso) {
    const [out] = await runTursoPipeline(turso, [{ sql, params }]);
    return out.rows;
  }
  const db = getLocalPrivateDb();
  return getLocalStmt(db, sql).all(...params);
}

export async function privQueryGet(sql, params = []) {
  await ensurePrivateSchema();
  const turso = getTursoConfig();
  if (turso) {
    const [out] = await runTursoPipeline(turso, [{ sql, params }]);
    return out.rows[0] || null;
  }
  const db = getLocalPrivateDb();
  return getLocalStmt(db, sql).get(...params) || null;
}

export async function privExecute(sql, params = []) {
  await ensurePrivateSchema();
  const turso = getTursoConfig();
  if (turso) {
    const [out] = await runTursoPipeline(turso, [{ sql, params }]);
    return { changes: out.changes };
  }
  const db = getLocalPrivateDb();
  const res = getLocalStmt(db, sql).run(...params);
  scheduleSupabaseCloudSync();
  return { changes: Number(res.changes || 0) };
}

export async function privBatch(statements = []) {
  if (!statements.length) return [];
  await ensurePrivateSchema();
  const turso = getTursoConfig();
  if (turso) {
    return runTursoPipeline(turso, statements);
  }
  const db = getLocalPrivateDb();
  db.exec('BEGIN');
  try {
    const results = [];
    for (const { sql, params = [] } of statements) {
      const res = getLocalStmt(db, sql).run(...params);
      results.push({ rows: [], changes: Number(res.changes || 0) });
    }
    db.exec('COMMIT');
    scheduleSupabaseCloudSync();
    return results;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback error
    }
    throw err;
  }
}

export function closePrivateDb() {
  if (localDb) {
    try {
      localDb.close();
    } catch {
      // ignore close error
    }
    localDb = null;
    localStmtCache = new Map();
  }
  schemaInitPromise = null;
}
