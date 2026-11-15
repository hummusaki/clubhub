// ── ClubHub Database – Built-in node:sqlite schema matching the Collector spec ──
// Tables: clubs, posts, events, announcements, links (+ dictionary_store).
// Every table links back to clubs(id) via `clubId` (= the club's Instagram handle).
// Every record has a unique string `id` and is upserted on conflict.

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { categorizeClub } from '../collector/src/categorize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.CLUBHUB_DB_PATH
  ? path.resolve(process.env.CLUBHUB_DB_PATH)
  : path.join(__dirname, 'clubhub.db');
const COLLECTOR_OUTPUT_PATH = path.resolve(__dirname, '../collector/output/clubhub-data.json');
const PUBLIC_SNAPSHOT_PATH = path.resolve(__dirname, '../public/clubhub-data.json');
const COLLECTOR_SAMPLE_PATH = path.resolve(__dirname, '../collector/fixtures/sample-output.json');

const VALID_TABLES = new Set(['clubs', 'posts', 'events', 'announcements', 'links', 'roster']);

let db;

/**
 * Normalize an Instagram handle / clubId (strips leading '@' and whitespace).
 */
export function normalizeClubId(id) {
  return String(id || '').trim().replace(/^@+/, '');
}

/**
 * Wraps Node's built-in DatabaseSync with:
 * - `.pragma(...)` helper
 * - `.stmt(sql)` prepared statement cache
 * - `.transaction(fn)` supporting nested transactions via SAVEPOINT
 */
function createDatabaseWrapper(rawDb) {
  let txDepth = 0;
  const stmtCache = new Map();

  rawDb.pragma = statement => rawDb.exec(`PRAGMA ${statement}`);

  rawDb.stmt = sql => {
    let cached = stmtCache.get(sql);
    if (!cached) {
      cached = rawDb.prepare(sql);
      stmtCache.set(sql, cached);
    }
    return cached;
  };

  rawDb.transaction = fn => (...args) => {
    const depth = txDepth++;
    const sp = `sp_${depth}`;
    rawDb.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${sp}`);
    try {
      const result = fn(...args);
      rawDb.exec(depth === 0 ? 'COMMIT' : `RELEASE SAVEPOINT ${sp}`);
      return result;
    } catch (err) {
      rawDb.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO SAVEPOINT ${sp}; RELEASE SAVEPOINT ${sp}`);
      throw err;
    } finally {
      txDepth--;
    }
  };

  return rawDb;
}

function openAndInitDb() {
  const instance = createDatabaseWrapper(new DatabaseSync(DB_PATH));
  instance.pragma('journal_mode = WAL');
  instance.pragma('synchronous = NORMAL');
  instance.pragma('foreign_keys = ON');
  instance.pragma('busy_timeout = 5000');
  instance.pragma('temp_store = MEMORY');
  instance.pragma('cache_size = -16000');
  initSchema(instance);
  // Full B-tree & index integrity check so corrupted tables/indexes trigger auto-recreation
  const check = instance.prepare('PRAGMA quick_check').get();
  if (check && check.quick_check && check.quick_check !== 'ok') {
    throw new Error(`database disk image is malformed (${check.quick_check})`);
  }
  return instance;
}

export function getDb() {
  if (!db) {
    try {
      db = openAndInitDb();
    } catch (err) {
      if (/malformed|not a database|corrupt/i.test(err.message || '')) {
        console.warn('⚠️ Corrupted SQLite file detected; recreating server/clubhub.db cleanly...');
        try {
          db?.close?.();
        } catch {
          // ignore
        }
        for (const ext of ['', '-wal', '-shm']) {
          try {
            if (fs.existsSync(DB_PATH + ext)) fs.unlinkSync(DB_PATH + ext);
          } catch {
            // ignore
          }
        }
        db = openAndInitDb();
      } else {
        throw err;
      }
    }
  }
  return db;
}

export function closeDb() {
  if (db) {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
    } catch {
      // Ignore close errors during shutdown
    }
    db = null;
  }
}

// ── Schema (1 table per collector list + dictionary_store) ──────────
function initSchema(db) {
  db.exec(`
    -- 1. CLUBS (id = Instagram handle)
    CREATE TABLE IF NOT EXISTS clubs (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      alsoKnownAs       TEXT DEFAULT '[]',
      instagram         TEXT NOT NULL,
      instagramUrl      TEXT,
      category          TEXT,
      bio               TEXT,
      website           TEXT,
      profilePictureUrl TEXT,
      followers         INTEGER DEFAULT 0,
      lastPostAt        TEXT,
      lastSyncedAt      TEXT,
      email             TEXT,
      syncStatus        TEXT DEFAULT 'synced',   -- 'synced' | 'unavailable' (personal/private Instagram)
      syncNote          TEXT,                    -- plain-language reason shown when unavailable
      updatedAt         TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 2. POSTS (links to clubs.id via clubId)
    CREATE TABLE IF NOT EXISTS posts (
      id          TEXT PRIMARY KEY,
      clubId      TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      postedAt    TEXT,
      permalink   TEXT,
      imageUrl    TEXT,
      caption     TEXT,
      type        TEXT,
      important   INTEGER NOT NULL DEFAULT 0,
      title       TEXT,
      summary     TEXT,
      extractedBy TEXT,
      source      TEXT DEFAULT 'instagram'
    );

    -- 3. EVENTS (links to clubs.id via clubId; times are ISO UTC; allDay boolean)
    CREATE TABLE IF NOT EXISTS events (
      id          TEXT PRIMARY KEY,
      clubId      TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      clubName    TEXT,
      postId      TEXT,
      permalink   TEXT,
      title       TEXT NOT NULL,
      kind        TEXT DEFAULT 'event',
      start       TEXT NOT NULL,
      end         TEXT,
      allDay      INTEGER NOT NULL DEFAULT 0,
      recurring   TEXT,
      location    TEXT,
      source      TEXT DEFAULT 'instagram'
    );

    -- 4. ANNOUNCEMENTS (links to clubs.id via clubId)
    CREATE TABLE IF NOT EXISTS announcements (
      id          TEXT PRIMARY KEY,
      clubId      TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      clubName    TEXT,
      title       TEXT NOT NULL,
      summary     TEXT,
      important   INTEGER NOT NULL DEFAULT 0,
      postedAt    TEXT,
      permalink   TEXT,
      source      TEXT DEFAULT 'instagram'
    );

    -- 5. LINKS (links to clubs.id via clubId)
    CREATE TABLE IF NOT EXISTS links (
      id          TEXT PRIMARY KEY,
      clubId      TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      clubName    TEXT,
      url         TEXT NOT NULL,
      label       TEXT,
      kind        TEXT,
      postId      TEXT
    );

    -- 6. DICTIONARY STORE (public club key-value lookup & metadata only; zero user PII)
    CREATE TABLE IF NOT EXISTS dictionary_store (
      key         TEXT PRIMARY KEY,
      namespace   TEXT NOT NULL DEFAULT 'general',
      clubId      TEXT,
      source      TEXT DEFAULT 'collector',
      value       TEXT NOT NULL,
      updatedAt   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 7. INTEGRATION CONFIGS (club webhook configs; never exported publicly)
    CREATE TABLE IF NOT EXISTS integration_configs (
      id          TEXT PRIMARY KEY,
      scope       TEXT NOT NULL DEFAULT 'global',
      platform    TEXT NOT NULL,
      config      TEXT NOT NULL,
      updatedAt   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 9. ROSTER (daily club leadership, officers, spotlighted members & official contacts)
    CREATE TABLE IF NOT EXISTS roster (
      id         TEXT PRIMARY KEY,
      clubId     TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      clubName   TEXT,
      name       TEXT NOT NULL,
      initials   TEXT,
      role       TEXT NOT NULL,
      personType TEXT DEFAULT 'officer',
      major      TEXT,
      year       TEXT,
      email      TEXT,
      office     TEXT,
      instagram  TEXT,
      color      TEXT DEFAULT 'blue',
      source     TEXT DEFAULT 'directory',
      sourceUrl  TEXT,
      updatedAt  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Indexes for fast lookups, filtering, and sorting
    CREATE INDEX IF NOT EXISTS idx_clubs_name           ON clubs(name);
    CREATE INDEX IF NOT EXISTS idx_clubs_category       ON clubs(category);
    CREATE INDEX IF NOT EXISTS idx_events_start         ON events(start);
    CREATE INDEX IF NOT EXISTS idx_events_clubId        ON events(clubId);
    CREATE INDEX IF NOT EXISTS idx_announcements_clubId ON announcements(clubId);
    CREATE INDEX IF NOT EXISTS idx_announcements_posted ON announcements(postedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_links_clubId         ON links(clubId);
    CREATE INDEX IF NOT EXISTS idx_posts_clubId         ON posts(clubId);
    CREATE INDEX IF NOT EXISTS idx_posts_posted         ON posts(postedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_roster_clubId        ON roster(clubId);
    CREATE INDEX IF NOT EXISTS idx_dict_clubId          ON dictionary_store(clubId);
    CREATE INDEX IF NOT EXISTS idx_dict_namespace       ON dictionary_store(namespace);
    CREATE INDEX IF NOT EXISTS idx_integration_platform ON integration_configs(platform);
    CREATE INDEX IF NOT EXISTS idx_integration_scope    ON integration_configs(scope);
  `);

  // Add newer club columns to databases created before they existed.
  const clubCols = new Set(db.prepare('PRAGMA table_info(clubs)').all().map(c => c.name));
  for (const [col, def] of [
    ['email', 'TEXT'],
    ['syncStatus', "TEXT DEFAULT 'synced'"],
    ['syncNote', 'TEXT'],
    ['lastSyncedAt', 'TEXT'],
    ['memberCount', 'INTEGER DEFAULT 0'],
    ['discordMemberCount', 'INTEGER'],
    ['discordOnlineCount', 'INTEGER'],
    ['rosterCount', 'INTEGER DEFAULT 0'],
    ['rosterUpdatedAt', 'TEXT'],
    ['orgStatus', "TEXT DEFAULT 'active'"],
    ['orgStatusNote', 'TEXT'],
    ['directoryDescription', 'TEXT'],
  ]) {
    if (!clubCols.has(col)) db.exec(`ALTER TABLE clubs ADD COLUMN ${col} ${def}`);
  }

  // Purge any legacy user-scoped tables or dictionary keys so public clubhub.db stays 100% PII-free.
  db.exec(`
    DROP TABLE IF EXISTS calendar_sync_profiles;
    DROP TABLE IF EXISTS scheduler_responses;
    DROP TABLE IF EXISTS scheduler_polls;
    DELETE FROM dictionary_store WHERE key LIKE 'user_%' OR key LIKE 'user:%' OR key LIKE '%@%' OR namespace LIKE 'user%';
  `);
}

// ── Sync a club's current relational state into dictionary_store ────
export function syncClubDictionary(clubId) {
  const cid = normalizeClubId(clubId);
  if (!cid) return null;

  const club = getClubById(cid);
  if (!club) {
    deleteDictEntry(`club:${cid}`);
    return null;
  }

  return setDictEntry(`club:${cid}`, club, {
    namespace: 'clubs',
    clubId: cid,
    source: 'collector',
  });
}

// ── Upsert full or partial collector payload by ID ──────────────────
export function upsertCollectorData(data = {}, { replaceRosterForClubs = false } = {}) {
  const db = getDb();
  const {
    collectedAt = new Date().toISOString(),
    clubs = [],
    posts = [],
    events = [],
    announcements = [],
    links = [],
    roster = [],
    errors,
  } = data;

  const ensureClubStmt = db.stmt(`
    INSERT OR IGNORE INTO clubs (id, name, instagram, instagramUrl, category, updatedAt)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);

  const upsertClubStmt = db.stmt(`
    INSERT INTO clubs (
      id, name, alsoKnownAs, instagram, instagramUrl, category,
      bio, website, profilePictureUrl, followers, lastPostAt, lastSyncedAt,
      email, syncStatus, syncNote,
      memberCount, discordMemberCount, discordOnlineCount, rosterCount, rosterUpdatedAt,
      orgStatus, orgStatusNote, directoryDescription, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name                 = excluded.name,
      alsoKnownAs          = excluded.alsoKnownAs,
      instagram            = excluded.instagram,
      instagramUrl         = excluded.instagramUrl,
      category             = CASE
                               WHEN clubs.category IS NOT NULL
                                AND clubs.category NOT IN ('other', 'community', '')
                                AND (excluded.category IS NULL OR excluded.category IN ('other', 'community', ''))
                               THEN clubs.category
                               ELSE COALESCE(excluded.category, clubs.category)
                             END,
      bio                  = COALESCE(excluded.bio, clubs.bio),
      website              = COALESCE(excluded.website, clubs.website),
      profilePictureUrl    = COALESCE(excluded.profilePictureUrl, clubs.profilePictureUrl),
      followers            = CASE WHEN excluded.followers > 0 THEN excluded.followers ELSE clubs.followers END,
      lastPostAt           = COALESCE(excluded.lastPostAt, clubs.lastPostAt),
      lastSyncedAt         = COALESCE(excluded.lastSyncedAt, clubs.lastSyncedAt),
      email                = COALESCE(excluded.email, clubs.email),
      syncStatus           = CASE WHEN clubs.syncStatus = 'synced' AND excluded.syncStatus = 'unavailable' THEN 'synced' ELSE COALESCE(excluded.syncStatus, clubs.syncStatus) END,
      syncNote             = CASE WHEN clubs.syncStatus = 'synced' AND excluded.syncStatus = 'unavailable' THEN clubs.syncNote ELSE excluded.syncNote END,
      memberCount          = CASE WHEN excluded.memberCount > 0 THEN excluded.memberCount ELSE clubs.memberCount END,
      discordMemberCount   = COALESCE(excluded.discordMemberCount, clubs.discordMemberCount),
      discordOnlineCount   = COALESCE(excluded.discordOnlineCount, clubs.discordOnlineCount),
      rosterCount          = CASE WHEN excluded.rosterCount > 0 THEN excluded.rosterCount ELSE clubs.rosterCount END,
      rosterUpdatedAt      = COALESCE(excluded.rosterUpdatedAt, clubs.rosterUpdatedAt),
      orgStatus            = COALESCE(excluded.orgStatus, clubs.orgStatus),
      orgStatusNote        = COALESCE(excluded.orgStatusNote, clubs.orgStatusNote),
      directoryDescription = COALESCE(excluded.directoryDescription, clubs.directoryDescription),
      updatedAt            = datetime('now')
  `);

  const upsertPostStmt = db.stmt(`
    INSERT INTO posts (
      id, clubId, postedAt, permalink, imageUrl, caption,
      type, important, title, summary, extractedBy, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      clubId      = excluded.clubId,
      postedAt    = excluded.postedAt,
      permalink   = excluded.permalink,
      imageUrl    = excluded.imageUrl,
      caption     = excluded.caption,
      type        = excluded.type,
      important   = excluded.important,
      title       = excluded.title,
      summary     = excluded.summary,
      extractedBy = excluded.extractedBy,
      source      = excluded.source
  `);

  const upsertEventStmt = db.stmt(`
    INSERT INTO events (
      id, clubId, clubName, postId, permalink, title,
      kind, start, end, allDay, recurring, location, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      clubId    = excluded.clubId,
      clubName  = COALESCE(excluded.clubName, events.clubName),
      postId    = COALESCE(excluded.postId, events.postId),
      permalink = COALESCE(excluded.permalink, events.permalink),
      title     = excluded.title,
      kind      = excluded.kind,
      start     = excluded.start,
      end       = excluded.end,
      allDay    = excluded.allDay,
      recurring = excluded.recurring,
      location  = excluded.location,
      source    = excluded.source
  `);

  const upsertAnnouncementStmt = db.stmt(`
    INSERT INTO announcements (
      id, clubId, clubName, title, summary, important, postedAt, permalink, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      clubId    = excluded.clubId,
      clubName  = COALESCE(excluded.clubName, announcements.clubName),
      title     = excluded.title,
      summary   = excluded.summary,
      important = excluded.important,
      postedAt  = excluded.postedAt,
      permalink = COALESCE(excluded.permalink, announcements.permalink),
      source    = excluded.source
  `);

  const upsertLinkStmt = db.stmt(`
    INSERT INTO links (
      id, clubId, clubName, url, label, kind, postId
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      clubId   = excluded.clubId,
      clubName = COALESCE(excluded.clubName, links.clubName),
      url      = excluded.url,
      label    = excluded.label,
      kind     = excluded.kind,
      postId   = COALESCE(excluded.postId, links.postId)
  `);

  const clearAutoRosterStmt = db.stmt(`
    DELETE FROM roster WHERE lower(clubId) = lower(?) AND id NOT LIKE 'custom_%'
  `);

  const upsertRosterStmt = db.stmt(`
    INSERT INTO roster (
      id, clubId, clubName, name, initials, role, personType,
      major, year, email, office, instagram, color, source, sourceUrl, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      clubId     = excluded.clubId,
      clubName   = COALESCE(excluded.clubName, roster.clubName),
      name       = excluded.name,
      initials   = COALESCE(excluded.initials, roster.initials),
      role       = excluded.role,
      personType = COALESCE(excluded.personType, roster.personType),
      major      = COALESCE(excluded.major, roster.major),
      year       = COALESCE(excluded.year, roster.year),
      email      = COALESCE(excluded.email, roster.email),
      office     = COALESCE(excluded.office, roster.office),
      instagram  = COALESCE(excluded.instagram, roster.instagram),
      color      = COALESCE(excluded.color, roster.color),
      source     = COALESCE(excluded.source, roster.source),
      sourceUrl  = COALESCE(excluded.sourceUrl, roster.sourceUrl),
      updatedAt  = datetime('now')
  `);

  const affectedClubs = new Set();
  const ensureClub = (rawId, fallbackName) => {
    const cid = normalizeClubId(rawId);
    if (!cid) return null;
    const autoCat = categorizeClub({ id: cid, name: fallbackName || cid, instagram: cid });
    ensureClubStmt.run(cid, fallbackName || cid, cid, `https://www.instagram.com/${cid}/`, autoCat);
    affectedClubs.add(cid);
    return cid;
  };

  const counts = { clubs: 0, posts: 0, events: 0, announcements: 0, links: 0, roster: 0 };

  const runTransaction = db.transaction(() => {
    for (const c of clubs) {
      const cid = normalizeClubId(c.id || c.instagram);
      if (!cid) continue;
      const resolvedCategory = categorizeClub({
        ...c,
        id: cid,
        name: c.name || cid,
        instagram: normalizeClubId(c.instagram) || cid,
      });
      upsertClubStmt.run(
        cid,
        c.name || cid,
        JSON.stringify(Array.isArray(c.alsoKnownAs) ? c.alsoKnownAs : []),
        normalizeClubId(c.instagram) || cid,
        c.instagramUrl || `https://www.instagram.com/${cid}/`,
        resolvedCategory,
        c.bio || null,
        c.website || null,
        c.profilePictureUrl || null,
        Number(c.followers) || 0,
        c.lastPostAt || null,
        c.lastSyncedAt || null,
        c.email || null,
        c.syncStatus || 'synced',
        c.syncNote || null,
        Number(c.memberCount) || 0,
        c.discordMemberCount != null ? Number(c.discordMemberCount) : null,
        c.discordOnlineCount != null ? Number(c.discordOnlineCount) : null,
        Number(c.rosterCount) || 0,
        c.rosterUpdatedAt || null,
        c.orgStatus || null,
        c.orgStatusNote || null,
        c.directoryDescription || c.description || null
      );
      if (replaceRosterForClubs) {
        clearAutoRosterStmt.run(cid);
      }
      affectedClubs.add(cid);
      counts.clubs++;
    }

    for (const p of posts) {
      const cid = ensureClub(p.clubId, p.clubName);
      if (!p.id || !cid) continue;
      upsertPostStmt.run(
        String(p.id),
        cid,
        p.postedAt || null,
        p.permalink || null,
        p.imageUrl || null,
        p.caption || null,
        p.type || 'other',
        p.important ? 1 : 0,
        p.title || null,
        p.summary || null,
        p.extractedBy || 'rules',
        p.source || 'instagram'
      );
      counts.posts++;
    }

    for (const e of events) {
      const cid = ensureClub(e.clubId, e.clubName);
      if (!e.id || !cid || !e.start) continue;
      upsertEventStmt.run(
        String(e.id),
        cid,
        e.clubName || null,
        e.postId || null,
        e.permalink || null,
        e.title || 'Untitled Event',
        e.kind || 'event',
        e.start,
        e.end || null,
        e.allDay ? 1 : 0,
        e.recurring || null,
        e.location || null,
        e.source || 'instagram'
      );
      counts.events++;
    }

    for (const a of announcements) {
      const cid = ensureClub(a.clubId, a.clubName);
      if (!a.id || !cid) continue;
      upsertAnnouncementStmt.run(
        String(a.id),
        cid,
        a.clubName || null,
        a.title || 'Announcement',
        a.summary || null,
        a.important ? 1 : 0,
        a.postedAt || null,
        a.permalink || null,
        a.source || 'instagram'
      );
      counts.announcements++;
    }

    for (const l of links) {
      const cid = ensureClub(l.clubId, l.clubName);
      if (!l.id || !cid || !l.url) continue;
      upsertLinkStmt.run(
        String(l.id),
        cid,
        l.clubName || null,
        l.url,
        l.label || l.url,
        l.kind || 'website',
        l.postId || null
      );
      counts.links++;
    }

    for (const r of roster) {
      const cid = ensureClub(r.clubId, r.clubName);
      if (!r.id || !cid || !r.name) continue;
      upsertRosterStmt.run(
        String(r.id),
        cid,
        r.clubName || null,
        r.name,
        r.initials || null,
        r.role || 'Member',
        r.personType || 'officer',
        r.major || null,
        r.year || null,
        r.email || null,
        r.office || null,
        r.instagram || null,
        r.color || 'blue',
        r.source || 'directory',
        r.sourceUrl || null
      );
      counts.roster++;
    }

    // Sync every affected club's full record into dictionary_store
    for (const cid of affectedClubs) {
      syncClubDictionary(cid);
    }

    // Update collection metadata with live database totals
    const prevMeta = getDictEntry('meta:last_collection')?.value || {};
    const liveTotals = getStats();
    setDictEntry(
      'meta:last_collection',
      {
        collectedAt: data.collectedAt || prevMeta.collectedAt || collectedAt,
        updatedAt: new Date().toISOString(),
        counts: liveTotals,
        errors: Array.isArray(errors) ? errors : prevMeta.errors || [],
      },
      { namespace: 'meta', source: 'collector' }
    );
  });

  runTransaction();

  return {
    collectedAt,
    upserted: counts,
    errors: Array.isArray(errors) ? errors.length : 0,
  };
}

// ── Load from collector JSON file (output/clubhub-data.json, public/clubhub-data.json, or fixtures/sample-output.json) ──
export function importCollectorFile(customFilePath = null) {
  const db = getDb();
  const realClubCount = db.stmt("SELECT COUNT(*) AS c FROM clubs WHERE id NOT LIKE 'demo_%'").get()?.c || 0;
  const targetPath =
    customFilePath ||
    (fs.existsSync(COLLECTOR_OUTPUT_PATH)
      ? COLLECTOR_OUTPUT_PATH
      : fs.existsSync(PUBLIC_SNAPSHOT_PATH)
        ? PUBLIC_SNAPSHOT_PATH
        : realClubCount === 0
          ? COLLECTOR_SAMPLE_PATH
          : null);

  if (!targetPath || !fs.existsSync(targetPath)) {
    return { imported: false, reason: 'No collector output file to import' };
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
  } catch (err) {
    console.warn(`⚠️ Skipping malformed JSON in ${targetPath}: ${err.message}`);
    if (targetPath !== COLLECTOR_SAMPLE_PATH && realClubCount === 0 && fs.existsSync(COLLECTOR_SAMPLE_PATH)) {
      data = JSON.parse(fs.readFileSync(COLLECTOR_SAMPLE_PATH, 'utf8'));
    } else {
      return { imported: false, reason: `Invalid JSON in ${targetPath}` };
    }
  }
  return {
    imported: true,
    file: targetPath,
    ...upsertCollectorData(data),
  };
}

// ── Fast single-query database counts ───────────────────────────────
export function getStats() {
  const db = getDb();
  return db
    .stmt(`
      SELECT
        (SELECT COUNT(*) FROM clubs)            AS clubs,
        (SELECT COUNT(*) FROM events)           AS events,
        (SELECT COUNT(*) FROM announcements)    AS announcements,
        (SELECT COUNT(*) FROM links)            AS links,
        (SELECT COUNT(*) FROM posts)            AS posts,
        (SELECT COUNT(*) FROM roster)           AS roster,
        (SELECT COUNT(*) FROM dictionary_store) AS dictKeys
    `)
    .get();
}

// ── Get a single club with all its events, announcements, links, posts, and roster ──
export function getClubById(clubId) {
  const db = getDb();
  const cid = normalizeClubId(clubId);
  if (!cid) return null;

  const row = db.stmt('SELECT * FROM clubs WHERE lower(id) = lower(?)').get(cid);
  if (!row) return null;

  const club = formatClubRow(row);
  return {
    ...club,
    events: db.stmt('SELECT * FROM events WHERE clubId = ? ORDER BY start ASC').all(club.id).map(formatEventRow),
    announcements: db.stmt('SELECT * FROM announcements WHERE clubId = ? ORDER BY postedAt DESC').all(club.id).map(formatAnnouncementRow),
    links: db.stmt('SELECT * FROM links WHERE clubId = ? ORDER BY id ASC').all(club.id),
    posts: db.stmt('SELECT * FROM posts WHERE clubId = ? ORDER BY postedAt DESC').all(club.id).map(formatPostRow),
    roster: db
      .stmt("SELECT * FROM roster WHERE clubId = ? ORDER BY CASE WHEN personType = 'officer' THEN 0 ELSE 1 END, name ASC")
      .all(club.id)
      .map(formatRosterRow),
  };
}

// ── Delete a record from any table by ID and sync dictionary_store ──
export function deleteRecord(table, id) {
  if (!VALID_TABLES.has(table)) {
    throw new Error(`Invalid table "${table}"`);
  }
  const db = getDb();
  const cleanId = table === 'clubs' ? normalizeClubId(id) : String(id);
  const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(cleanId);
  if (!existing) return { deleted: false, id: cleanId };

  const clubId = table === 'clubs' ? existing.id : existing.clubId;
  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(cleanId);

  if (clubId) syncClubDictionary(clubId);
  return { deleted: true, id: cleanId, clubId };
}

// ── Read all 6 collections in the exact Collector JSON format ──────
export function getAllCollectorData({ clubId } = {}) {
  const db = getDb();
  const cid = clubId ? normalizeClubId(clubId) : null;
  const where = cid ? 'WHERE lower(clubId) = lower(?)' : '';
  const clubWhere = cid ? 'WHERE lower(id) = lower(?)' : '';
  const params = cid ? [cid] : [];

  const clubs = db.prepare(`SELECT * FROM clubs ${clubWhere} ORDER BY name ASC`).all(...params).map(formatClubRow);
  const posts = db.prepare(`SELECT * FROM posts ${where} ORDER BY postedAt DESC`).all(...params).map(formatPostRow);
  const events = db.prepare(`SELECT * FROM events ${where} ORDER BY start ASC`).all(...params).map(formatEventRow);
  const announcements = db.prepare(`SELECT * FROM announcements ${where} ORDER BY postedAt DESC`).all(...params).map(formatAnnouncementRow);
  const links = db.prepare(`SELECT * FROM links ${where} ORDER BY id ASC`).all(...params);
  const roster = db
    .prepare(
      `SELECT * FROM roster ${where} ORDER BY CASE WHEN personType = 'officer' THEN 0 ELSE 1 END, clubName ASC, name ASC`
    )
    .all(...params)
    .map(formatRosterRow);

  const meta = getDictEntry('meta:last_collection')?.value || {};

  return {
    collectedAt: meta.collectedAt || new Date().toISOString(),
    clubs,
    posts,
    events,
    announcements,
    links,
    roster,
    errors: meta.errors || [],
  };
}

// ── Build a dictionary keyed by clubId in O(N) single pass ──────────
export function buildClubHubDictionary(filterClubId = null) {
  const data = getAllCollectorData(filterClubId ? { clubId: filterClubId } : {});
  const dict = {};

  for (const club of data.clubs) {
    dict[club.id] = {
      ...club,
      events: [],
      announcements: [],
      links: [],
      posts: [],
      roster: [],
    };
  }

  for (const e of data.events) dict[e.clubId]?.events.push(e);
  for (const a of data.announcements) dict[a.clubId]?.announcements.push(a);
  for (const l of data.links) dict[l.clubId]?.links.push(l);
  for (const p of data.posts) dict[p.clubId]?.posts.push(p);
  for (const r of data.roster) dict[r.clubId]?.roster.push(r);

  return dict;
}

// ── Dictionary Key-Value Helpers ────────────────────────────────────
export function setDictEntry(key, value, { namespace = 'general', clubId = null, source = 'manual' } = {}) {
  const db = getDb();
  const jsonValue = JSON.stringify(value ?? null);
  db.stmt(`
    INSERT INTO dictionary_store (key, namespace, clubId, source, value, updatedAt)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      namespace = excluded.namespace,
      clubId    = excluded.clubId,
      source    = excluded.source,
      value     = excluded.value,
      updatedAt = datetime('now')
  `).run(key, namespace, clubId, source, jsonValue);
  return { key, namespace, clubId, source, value };
}

export function setDictEntries(entriesObj, options = {}) {
  const db = getDb();
  const results = {};
  const saveAll = db.transaction(() => {
    for (const [k, v] of Object.entries(entriesObj)) {
      results[k] = setDictEntry(k, v, options).value;
    }
  });
  saveAll();
  return results;
}

export function getDictEntry(key) {
  const db = getDb();
  const row = db.stmt('SELECT * FROM dictionary_store WHERE key = ?').get(key);
  return row ? { ...row, value: safeParseJSON(row.value) } : null;
}

export function deleteDictEntry(key) {
  const db = getDb();
  const info = db.stmt('DELETE FROM dictionary_store WHERE key = ?').run(key);
  return { deleted: info.changes > 0, key };
}

export function getDictionary({ namespace, clubId, source, prefix, q } = {}) {
  const db = getDb();
  let sql = 'SELECT key, value FROM dictionary_store WHERE 1=1';
  const params = [];

  if (namespace) { sql += ' AND namespace = ?'; params.push(namespace); }
  if (clubId) { sql += ' AND clubId = ?'; params.push(normalizeClubId(clubId)); }
  if (source) { sql += ' AND source = ?'; params.push(source); }
  if (prefix) { sql += ' AND key LIKE ?'; params.push(`${prefix}%`); }
  if (q) { sql += ' AND (key LIKE ? OR value LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }

  sql += ' ORDER BY key ASC';
  const out = {};
  for (const row of db.prepare(sql).all(...params)) {
    out[row.key] = safeParseJSON(row.value);
  }
  return out;
}

// ── Private Integration Config & Subscription Helpers ───────────────
export function maskSecret(str) {
  if (!str || typeof str !== 'string') return '';
  const s = str.trim();
  if (!s) return '';
  const webhookMatch = s.match(/^(https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/)([\w-]+)$/i);
  if (webhookMatch) {
    const [, prefix, secret] = webhookMatch;
    return `${prefix}••••${secret.slice(-4)}`;
  }
  if (s.length <= 8) return '••••••••';
  return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

export function saveIntegrationConfig(id, { scope = 'global', platform, config = {} } = {}) {
  const db = getDb();
  const cleanId = String(id || '').trim();
  const cleanPlatform = String(platform || '').trim();
  if (!cleanId || !cleanPlatform) {
    throw new Error('Integration config id and platform are required');
  }
  const jsonConfig = JSON.stringify(config ?? {});
  db.stmt(`
    INSERT INTO integration_configs (id, scope, platform, config, updatedAt)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      scope     = excluded.scope,
      platform  = excluded.platform,
      config    = excluded.config,
      updatedAt = datetime('now')
  `).run(cleanId, scope || 'global', cleanPlatform, jsonConfig);
  return getIntegrationConfig(cleanId);
}

export function getIntegrationConfig(id) {
  const db = getDb();
  const cleanId = String(id || '').trim();
  if (!cleanId) return null;
  const row = db
    .stmt('SELECT id, scope, platform, config, updatedAt FROM integration_configs WHERE id = ?')
    .get(cleanId);
  if (!row) return null;
  return {
    id: row.id,
    scope: row.scope,
    platform: row.platform,
    config: safeParseJSON(row.config) || {},
    updatedAt: row.updatedAt,
  };
}

export function listIntegrationConfigs({ scope, platform } = {}) {
  const db = getDb();
  let sql = 'SELECT id, scope, platform, config, updatedAt FROM integration_configs WHERE 1=1';
  const params = [];
  if (scope) {
    sql += ' AND scope = ?';
    params.push(scope);
  }
  if (platform) {
    sql += ' AND platform = ?';
    params.push(platform);
  }
  sql += ' ORDER BY updatedAt DESC';
  return db
    .prepare(sql)
    .all(...params)
    .map(row => ({
      id: row.id,
      scope: row.scope,
      platform: row.platform,
      config: safeParseJSON(row.config) || {},
      updatedAt: row.updatedAt,
    }));
}

export function deleteIntegrationConfig(id) {
  const db = getDb();
  const cleanId = String(id || '').trim();
  if (!cleanId) return { deleted: false, id: cleanId };
  const info = db.stmt('DELETE FROM integration_configs WHERE id = ?').run(cleanId);
  return { deleted: info.changes > 0, id: cleanId };
}

// ── Concise Row Formatters (convert SQLite ints/JSON to JS types) ───
export function formatClubRow(row) {
  if (!row) return null;
  const { updatedAt, ...rest } = row;
  return { ...rest, alsoKnownAs: safeParseJSON(row.alsoKnownAs) || [] };
}

export function formatPostRow(row) {
  return row ? { ...row, important: Boolean(row.important), source: row.source || 'instagram' } : null;
}

export function formatEventRow(row) {
  return row ? { ...row, allDay: Boolean(row.allDay), source: row.source || 'instagram' } : null;
}

export function formatAnnouncementRow(row) {
  return row ? { ...row, important: Boolean(row.important), source: row.source || 'instagram' } : null;
}

export function formatRosterRow(row) {
  if (!row) return null;
  const { updatedAt, ...rest } = row;
  return rest;
}

function safeParseJSON(str) {
  if (str === null || str === undefined) return null;
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

export default getDb;
