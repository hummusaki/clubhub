// ── ClubHub Database – Built-in node:sqlite schema, connection & dictionary helpers ──
// Uses Node's built-in `node:sqlite` (DatabaseSync) for a zero-config, zero-native-build embedded database.
// The DB file lives at server/clubhub.db (gitignored).

import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'clubhub.db');

let db;

/**
 * Wraps Node's built-in DatabaseSync so it supports `.pragma(...)` and `.transaction(fn)`
 * just like better-sqlite3, plus dictionary-style helper methods.
 */
function createDatabaseWrapper(rawDb) {
  rawDb.pragma = function (statement) {
    return rawDb.exec(`PRAGMA ${statement}`);
  };

  rawDb.transaction = function (fn) {
    return (...args) => {
      rawDb.exec('BEGIN');
      try {
        const result = fn(...args);
        rawDb.exec('COMMIT');
        return result;
      } catch (err) {
        rawDb.exec('ROLLBACK');
        throw err;
      }
    };
  };

  return rawDb;
}

export function getDb() {
  if (!db) {
    const rawDb = new DatabaseSync(DB_PATH);
    db = createDatabaseWrapper(rawDb);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

// ── Schema ──────────────────────────────────────────────────────────
function initSchema(db) {
  db.exec(`
    -- ╔══════════════════════════════════════════════════════════════╗
    -- ║  DICTIONARY STORE – key-value JSON store ("like a dict")     ║
    -- ╚══════════════════════════════════════════════════════════════╝
    CREATE TABLE IF NOT EXISTS dictionary_store (
      key         TEXT    PRIMARY KEY,
      namespace   TEXT    NOT NULL DEFAULT 'general',
      club_id     INTEGER REFERENCES clubs(id) ON DELETE CASCADE,
      source      TEXT    DEFAULT 'manual',
      value       TEXT    NOT NULL,            -- JSON-encoded value
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ╔══════════════════════════════════════════════════════════════╗
    -- ║  CLUBS – the core entity                                    ║
    -- ╚══════════════════════════════════════════════════════════════╝
    CREATE TABLE IF NOT EXISTS clubs (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      slug             TEXT    UNIQUE,
      name             TEXT    NOT NULL UNIQUE,
      abbreviation     TEXT,
      description      TEXT,
      category         TEXT    CHECK(category IN (
                           'academic','social','arts','sports',
                           'cultural','professional','volunteer','other'
                       )) DEFAULT 'other',
      meeting_schedule TEXT,
      meeting_location TEXT,
      avatar_bg        TEXT,
      logo_url         TEXT,
      website_url      TEXT,
      instagram_handle TEXT,
      discord_invite   TEXT,
      mailing_list     TEXT,
      gcal_id          TEXT,
      is_active        INTEGER NOT NULL DEFAULT 1,
      member_count     INTEGER NOT NULL DEFAULT 0,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ╔══════════════════════════════════════════════════════════════╗
    -- ║  TAGS – freeform labels for filtering / discovery           ║
    -- ╚══════════════════════════════════════════════════════════════╝
    CREATE TABLE IF NOT EXISTS tags (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT    NOT NULL UNIQUE,
      color TEXT    DEFAULT 'blue'
    );

    CREATE TABLE IF NOT EXISTS club_tags (
      club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
      PRIMARY KEY (club_id, tag_id)
    );

    -- ╔══════════════════════════════════════════════════════════════╗
    -- ║  EVENTS – meeting times, workshops, socials, etc.           ║
    -- ╚══════════════════════════════════════════════════════════════╝
    CREATE TABLE IF NOT EXISTS events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id       INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      title         TEXT    NOT NULL,
      description   TEXT,
      location      TEXT,
      start_time    TEXT    NOT NULL,            -- ISO-8601
      end_time      TEXT,
      duration      TEXT    DEFAULT '1 hr',
      color         TEXT    DEFAULT 'blue',
      is_recurring  INTEGER NOT NULL DEFAULT 0,
      recurrence    TEXT,                         -- RRULE or human schedule string
      source        TEXT    CHECK(source IN (
                        'manual','instagram','discord','email',
                        'google_calendar','website','other'
                    )) DEFAULT 'manual',
      source_id     TEXT,                         -- external ID for dedup
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ╔══════════════════════════════════════════════════════════════╗
    -- ║  ANNOUNCEMENTS – urgent notices, news, updates              ║
    -- ╚══════════════════════════════════════════════════════════════╝
    CREATE TABLE IF NOT EXISTS announcements (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id     INTEGER REFERENCES clubs(id) ON DELETE SET NULL,
      title       TEXT    NOT NULL,
      body        TEXT,
      type        TEXT    CHECK(type IN ('urgent','event','update','info'))
                         DEFAULT 'info',
      source      TEXT    CHECK(source IN (
                        'manual','instagram','discord','email',
                        'google_calendar','website','other'
                  )) DEFAULT 'manual',
      source_id   TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ╔══════════════════════════════════════════════════════════════╗
    -- ║  MEMBERS & BOARD MEMBERS                                    ║
    -- ╚══════════════════════════════════════════════════════════════╝
    CREATE TABLE IF NOT EXISTS members (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      email       TEXT    UNIQUE,
      avatar_url  TEXT,
      attendance  INTEGER DEFAULT 85,
      joined_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      status      TEXT    CHECK(status IN ('active','moderate','inactive'))
                         DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS club_members (
      club_id   INTEGER NOT NULL REFERENCES clubs(id)   ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      role      TEXT    CHECK(role IN (
                    'member','president','vice_president',
                    'treasurer','secretary','social_chair','officer'
                )) DEFAULT 'member',
      joined_at TEXT    NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (club_id, member_id)
    );

    -- ╔══════════════════════════════════════════════════════════════╗
    -- ║  LINKS & RESOURCES – docs, videos, forms, etc.              ║
    -- ╚══════════════════════════════════════════════════════════════╝
    CREATE TABLE IF NOT EXISTS links (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id     INTEGER REFERENCES clubs(id) ON DELETE SET NULL,
      title       TEXT    NOT NULL,
      url         TEXT    NOT NULL,
      description TEXT,
      icon        TEXT    DEFAULT 'Link',
      color       TEXT    DEFAULT 'blue',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ╔══════════════════════════════════════════════════════════════╗
    -- ║  DATA SOURCES – connection configs for each integration      ║
    -- ╚══════════════════════════════════════════════════════════════╝
    CREATE TABLE IF NOT EXISTS data_sources (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id       INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      platform      TEXT    NOT NULL CHECK(platform IN (
                        'instagram','discord','email',
                        'google_calendar','website'
                    )),
      identifier    TEXT    NOT NULL,   -- @handle, server_id, address, cal url, site url
      access_token  TEXT,               -- encrypted in prod
      refresh_token TEXT,
      is_active     INTEGER NOT NULL DEFAULT 1,
      last_synced   TEXT,
      config        TEXT,               -- JSON blob for extra settings
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(club_id, platform, identifier)
    );

    -- ╔══════════════════════════════════════════════════════════════╗
    -- ║  INGESTED ITEMS – raw data pulled from external sources     ║
    -- ║  Acts as a dictionary / lookup cache of all scraped info     ║
    -- ╚══════════════════════════════════════════════════════════════╝
    CREATE TABLE IF NOT EXISTS ingested_items (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id           INTEGER NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
      platform            TEXT    NOT NULL,
      external_id         TEXT,               -- dedup key from the platform
      item_type           TEXT    NOT NULL CHECK(item_type IN (
                              'post','message','email','calendar_event',
                              'story','announcement','page_content','other'
                          )),
      title               TEXT,
      body                TEXT,
      author              TEXT,
      url                 TEXT,
      media_urls          TEXT,               -- JSON array
      extracted_time      TEXT,               -- parsed meeting time if found
      extracted_location  TEXT,               -- parsed location if found
      metadata            TEXT,               -- JSON blob (likes, reactions, etc.)
      published_at        TEXT,
      ingested_at         TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(platform, external_id)
    );

    -- ╔══════════════════════════════════════════════════════════════╗
    -- ║  SYNC LOG – audit trail for ingestion runs                  ║
    -- ╚══════════════════════════════════════════════════════════════╝
    CREATE TABLE IF NOT EXISTS sync_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id     INTEGER NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
      started_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      finished_at   TEXT,
      items_found   INTEGER DEFAULT 0,
      items_new     INTEGER DEFAULT 0,
      status        TEXT    CHECK(status IN ('running','success','error'))
                           DEFAULT 'running',
      error_message TEXT
    );

    -- ── Indexes for common queries ──
    CREATE INDEX IF NOT EXISTS idx_dict_namespace    ON dictionary_store(namespace);
    CREATE INDEX IF NOT EXISTS idx_dict_club         ON dictionary_store(club_id);
    CREATE INDEX IF NOT EXISTS idx_dict_source       ON dictionary_store(source);
    CREATE INDEX IF NOT EXISTS idx_events_club       ON events(club_id);
    CREATE INDEX IF NOT EXISTS idx_events_start      ON events(start_time);
    CREATE INDEX IF NOT EXISTS idx_events_source     ON events(source, source_id);
    CREATE INDEX IF NOT EXISTS idx_announcements_club ON announcements(club_id);
    CREATE INDEX IF NOT EXISTS idx_ingested_platform ON ingested_items(platform, external_id);
    CREATE INDEX IF NOT EXISTS idx_ingested_source   ON ingested_items(source_id);
    CREATE INDEX IF NOT EXISTS idx_data_sources_club ON data_sources(club_id);
  `);
}

// ── Dictionary Helper Functions ─────────────────────────────────────

/**
 * Set a key-value entry in the dictionary store.
 */
export function setDictEntry(key, value, { namespace = 'general', clubId = null, source = 'manual' } = {}) {
  const db = getDb();
  const jsonValue = JSON.stringify(value);
  db.prepare(`
    INSERT INTO dictionary_store (key, namespace, club_id, source, value, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      namespace  = excluded.namespace,
      club_id    = excluded.club_id,
      source     = excluded.source,
      value      = excluded.value,
      updated_at = datetime('now')
  `).run(key, namespace, clubId, source, jsonValue);
  return { key, namespace, club_id: clubId, source, value };
}

/**
 * Get a single entry from the dictionary store by key.
 */
export function getDictEntry(key) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM dictionary_store WHERE key = ?').get(key);
  if (!row) return null;
  return {
    ...row,
    value: safeParseJSON(row.value),
  };
}

/**
 * Return a plain JS object (dictionary: `{ [key]: value }`) matching optional filters.
 */
export function getDictionary({ namespace, clubId, source, prefix } = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM dictionary_store WHERE 1=1';
  const params = [];

  if (namespace) { sql += ' AND namespace = ?'; params.push(namespace); }
  if (clubId)    { sql += ' AND club_id = ?';   params.push(Number(clubId)); }
  if (source)    { sql += ' AND source = ?';    params.push(source); }
  if (prefix)    { sql += ' AND key LIKE ?';    params.push(`${prefix}%`); }

  sql += ' ORDER BY key ASC';
  const rows = db.prepare(sql).all(...params);

  const dict = {};
  for (const row of rows) {
    dict[row.key] = safeParseJSON(row.value);
  }
  return dict;
}

/**
 * Build a complete dictionary of all clubs and their aggregated info
 * (meeting times, locations, Instagram, Discord, email, Google Calendar, website, announcements, links).
 */
export function buildClubHubDictionary(filterClubSlugOrId = null) {
  const db = getDb();
  let clubs = db.prepare('SELECT * FROM clubs ORDER BY id ASC').all();
  if (filterClubSlugOrId !== null) {
    clubs = clubs.filter(
      c => String(c.id) === String(filterClubSlugOrId) ||
           c.slug === String(filterClubSlugOrId).toLowerCase() ||
           c.abbreviation?.toLowerCase() === String(filterClubSlugOrId).toLowerCase()
    );
  }

  const tagStmt = db.prepare(`
    SELECT t.label, t.color FROM tags t
    JOIN club_tags ct ON t.id = ct.tag_id
    WHERE ct.club_id = ?
  `);

  const eventStmt = db.prepare(`
    SELECT id, title, description, location, start_time, end_time, duration, color, is_recurring, recurrence, source
    FROM events WHERE club_id = ? ORDER BY start_time ASC
  `);

  const announcementStmt = db.prepare(`
    SELECT id, title, body, type, source, created_at
    FROM announcements WHERE club_id = ? ORDER BY created_at DESC
  `);

  const linkStmt = db.prepare(`
    SELECT id, title, url, description, icon, color
    FROM links WHERE club_id = ? ORDER BY id ASC
  `);

  const sourceStmt = db.prepare(`
    SELECT id, platform, identifier, is_active, last_synced
    FROM data_sources WHERE club_id = ?
  `);

  const ingestedByClubStmt = db.prepare(`
    SELECT ii.id, ii.platform, ii.external_id, ii.item_type, ii.title, ii.body,
           ii.author, ii.url, ii.extracted_time, ii.extracted_location,
           ii.metadata, ii.published_at, ii.ingested_at
    FROM ingested_items ii
    JOIN data_sources ds ON ii.source_id = ds.id
    WHERE ds.club_id = ?
    ORDER BY ii.published_at DESC, ii.ingested_at DESC
  `);

  const hubDict = {};

  for (const club of clubs) {
    const key = club.slug || club.abbreviation?.toLowerCase() || `club_${club.id}`;
    const tags = tagStmt.all(club.id);
    const events = eventStmt.all(club.id);
    const announcements = announcementStmt.all(club.id);
    const links = linkStmt.all(club.id);
    const dataSources = sourceStmt.all(club.id);
    const ingested = ingestedByClubStmt.all(club.id).map(item => ({
      ...item,
      metadata: safeParseJSON(item.metadata),
    }));

    // Group ingested items by source platform (instagram, discord, email, google_calendar, website)
    const byPlatform = {
      instagram: [],
      discord: [],
      email: [],
      google_calendar: [],
      website: [],
    };
    for (const item of ingested) {
      if (!byPlatform[item.platform]) byPlatform[item.platform] = [];
      byPlatform[item.platform].push(item);
    }

    // Also include custom key-value dictionary entries for this club
    const customKv = getDictionary({ clubId: club.id });

    hubDict[key] = {
      id: club.id,
      key,
      name: club.name,
      abbreviation: club.abbreviation,
      description: club.description,
      category: club.category,
      members: club.member_count,
      active: Boolean(club.is_active),
      avatarBg: club.avatar_bg || 'linear-gradient(135deg, var(--blue), #5B8DEF)',
      meeting: {
        schedule: club.meeting_schedule || 'TBD',
        location: club.meeting_location || 'TBD',
        upcoming_events: events,
      },
      contacts: {
        website: club.website_url,
        instagram: club.instagram_handle,
        discord: club.discord_invite,
        email: club.mailing_list,
        google_calendar: club.gcal_id,
      },
      tags,
      announcements,
      links,
      sources: {
        configured: dataSources,
        instagram: byPlatform.instagram,
        discord: byPlatform.discord,
        email: byPlatform.email,
        google_calendar: byPlatform.google_calendar,
        website: byPlatform.website,
      },
      dictionary: customKv,
    };
  }

  return hubDict;
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
