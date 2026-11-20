// ── Live Subscribed Calendar Feed & Sync Profile Routes (/api/calendar) ──
// Powers live auto-updating Apple Calendar (webcal://) and Google Calendar (.ics URL)
// subscriptions that stay in sync with the user's currently joined clubs, RSVPs, and settings.

import crypto from 'node:crypto';
import { Router } from 'express';
import {
  getDb,
  formatEventRow,
} from '../database.js';
import { privQueryAll, privQueryGet, privExecute } from '../privateDb.js';
import { optionalAuth } from '../middleware/auth.js';
import { getFeedSubscriptions, getOwnedPollEvents, getWorkspaceClubEvents } from '../services/personalFeed.js';
import { normalizeClubKey, subscriptionMap } from '../../src/utils/clubSubscriptions.js';
import {
  DEFAULT_CALENDAR_SYNC_SETTINGS,
  normalizeCalendarSyncSettings,
  filterEventsForCalendarSync,
  buildIcsCalendar,
} from '../../src/utils/calendarSync.js';

const router = Router();

function hashAccountKey(accountKey) {
  const clean = String(accountKey || '').trim().toLowerCase();
  if (!clean) return null;
  return crypto.createHash('sha256').update(clean).digest('hex');
}

async function getPrivateCalendarSyncProfile(token) {
  if (!token) return null;
  const row = await privQueryGet(
    'SELECT * FROM calendar_sync_profiles WHERE token = ?',
    [String(token).trim()]
  );
  if (!row) return null;
  let parsed = {};
  try {
    parsed = row.payload ? JSON.parse(row.payload) : {};
  } catch {
    parsed = {};
  }
  return {
    token: row.token,
    accountHash: row.accountHash || null,
    updatedAt: row.updatedAt,
    payload: parsed,
  };
}

async function savePrivateCalendarSyncProfile(token, payload = {}, accountKey = null) {
  const cleanToken = String(token || '').trim();
  if (!cleanToken) return null;
  const nowIso = new Date().toISOString();
  const accountHash = hashAccountKey(accountKey);
  await privExecute(
    `INSERT INTO calendar_sync_profiles (token, accountHash, payload, updatedAt)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(token) DO UPDATE SET
       accountHash = COALESCE(excluded.accountHash, calendar_sync_profiles.accountHash),
       payload = excluded.payload,
       updatedAt = excluded.updatedAt
     WHERE json_extract(calendar_sync_profiles.payload, '$.ownerUserId') IS NULL
        OR json_extract(calendar_sync_profiles.payload, '$.ownerUserId') = json_extract(excluded.payload, '$.ownerUserId')`,
    [cleanToken, accountHash, JSON.stringify(payload), nowIso]
  );
  return getPrivateCalendarSyncProfile(cleanToken);
}

async function loadMergedEventsForProfile(profilePayload = {}, joinedClubIds = []) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT e.*, COALESCE(e.clubName, c.name, e.clubId) AS resolvedClubName
       FROM events e
       LEFT JOIN clubs c ON lower(c.id) = lower(e.clubId)
       ORDER BY e.start ASC`
    )
    .all()
    .map(row => ({
      ...formatEventRow(row),
      clubName: row.resolvedClubName || row.clubName || row.clubId,
    }));

  const removedSet = new Set(
    Array.isArray(profilePayload.removedEventIds)
      ? profilePayload.removedEventIds.map(String)
      : []
  );

  const customEvents = Array.isArray(profilePayload.customEvents)
    ? profilePayload.customEvents
    : [];
  const fallbackEvents = Array.isArray(profilePayload.fallbackEvents)
    ? profilePayload.fallbackEvents
    : [];

  // Merge custom events, live SQLite events (taking priority on matching IDs), and client schedule events
  const [workspaceEvents, bookings] = profilePayload.ownerUserId
    ? await Promise.all([getWorkspaceClubEvents(joinedClubIds), getOwnedPollEvents(profilePayload.ownerUserId)])
    : [[], []];
  const basePool = [...customEvents, ...workspaceEvents, ...bookings, ...rows, ...fallbackEvents];
  const seen = new Set();
  const merged = [];

  for (const ev of basePool) {
    if (!ev || !ev.id) continue;
    const idStr = String(ev.id);
    if (removedSet.has(idStr) || seen.has(idStr)) continue;
    seen.add(idStr);
    if (!ev.cancelled) merged.push(ev);
  }

  return merged;
}

function readSavedSubscriptions(input) {
  return subscriptionMap(Object.entries(input || {}).map(([clubId, modes]) => ({ ...modes, clubId })));
}

async function getFeedScope(profile, fallbackClubs) {
  if (!profile.ownerUserId) {
    return { joinedClubIds: fallbackClubs, subscriptions: readSavedSubscriptions(profile.subscriptions) };
  }
  const [memberships, subscriptions] = await Promise.all([
    privQueryAll('SELECT clubId FROM club_memberships WHERE userId = ?', [profile.ownerUserId]),
    getFeedSubscriptions(profile.ownerUserId),
  ]);
  return { joinedClubIds: memberships.map(row => normalizeClubKey(row.clubId)), subscriptions };
}

// GET /api/calendar/profile/:token — inspect stored sync profile metadata
router.get('/profile/:rawToken', optionalAuth, async (req, res) => {
  const cleanToken = String(req.params.rawToken || '').replace(/\.ics$/i, '').trim();
  const record = await getPrivateCalendarSyncProfile(cleanToken);
  if (!record) {
    return res.json({
      exists: false,
      token: cleanToken,
      settings: DEFAULT_CALENDAR_SYNC_SETTINGS,
    });
  }
  const { ownerUserId, ...metadata } = record.payload;
  if (ownerUserId && ownerUserId !== req.user?.id) return res.sendStatus(404);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({
    exists: true,
    token: record.token,
    updatedAt: record.updatedAt,
    ...metadata,
  });
});

// PUT /api/calendar/profile/:token — live-sync joined clubs, RSVPs, and calendar preferences
router.put('/profile/:rawToken', optionalAuth, async (req, res) => {
  const cleanToken = String(req.params.rawToken || '').replace(/\.ics$/i, '').trim();
  if (!cleanToken) {
    return res.status(400).json({ error: 'Sync token is required' });
  }

  const existing = await getPrivateCalendarSyncProfile(cleanToken);
  if (existing?.payload?.ownerUserId && existing.payload.ownerUserId !== req.user?.id) return res.sendStatus(404);
  const body = req.body || {};
  const settings = normalizeCalendarSyncSettings(body.settings);
  const joinedClubIds = Array.isArray(body.joinedClubIds)
    ? Array.from(new Set(body.joinedClubIds.map(String)))
    : [];
  const rsvpIds = Array.isArray(body.rsvpIds)
    ? Array.from(new Set(body.rsvpIds.map(String)))
    : [];

  const rawDisplayName = body.displayName ? String(body.displayName).slice(0, 80) : '';
  const safeDisplayName = rawDisplayName.includes('@') ? rawDisplayName.split('@')[0] : rawDisplayName;

  const payload = {
    ownerUserId: req.user?.id || null,
    subscriptions: req.user ? undefined : readSavedSubscriptions(body.subscriptions),
    joinedClubIds,
    rsvpIds,
    customEvents: Array.isArray(body.customEvents) ? body.customEvents : [],
    fallbackEvents: Array.isArray(body.fallbackEvents) ? body.fallbackEvents.filter(event => event && event.source !== 'workspace' && (!req.user || event.source !== 'scheduler')) : [],
    removedEventIds: Array.isArray(body.removedEventIds) ? body.removedEventIds.map(String) : [],
    settings,
    displayName: safeDisplayName,
    updatedAt: new Date().toISOString(),
  };

  const saved = await savePrivateCalendarSyncProfile(cleanToken, payload, body.accountKey || null);
  if (saved?.payload?.ownerUserId !== payload.ownerUserId) return res.sendStatus(404);
  const scope = await getFeedScope(payload, joinedClubIds);
  const mergedEvents = await loadMergedEventsForProfile(payload, scope.joinedClubIds);
  const filtered = filterEventsForCalendarSync(mergedEvents, {
    ...scope,
    rsvpIds,
    settings,
  });

  res.json({
    ok: true,
    token: cleanToken,
    feedPath: `/api/calendar/feed/${encodeURIComponent(cleanToken)}.ics`,
    syncedCount: filtered.length,
    joinedCount: scope.joinedClubIds.length,
    updatedAt: payload.updatedAt,
  });
});

async function handleServeIcsFeed(req, res) {
  const rawToken = req.params.rawToken || req.query.token || 'default';
  const cleanToken = String(rawToken).replace(/\.ics$/i, '').trim();
  const stored = (await getPrivateCalendarSyncProfile(cleanToken))?.payload || {};

  const queryClubs =
    typeof req.query.clubs === 'string' && req.query.clubs.trim()
      ? req.query.clubs
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : null;

  const queryRsvps =
    typeof req.query.rsvps === 'string' && req.query.rsvps.trim()
      ? req.query.rsvps
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : null;

  const scope = await getFeedScope(stored, queryClubs ?? (Array.isArray(stored.joinedClubIds) ? stored.joinedClubIds : []));
  const rsvpIds = queryRsvps ?? (Array.isArray(stored.rsvpIds) ? stored.rsvpIds : []);

  const settings = normalizeCalendarSyncSettings({
    ...(stored.settings || {}),
    ...(req.query.scope ? { clubScope: req.query.scope } : {}),
    ...(req.query.rsvpOnly !== undefined
      ? { rsvpOnly: req.query.rsvpOnly === '1' || req.query.rsvpOnly === 'true' }
      : {}),
    ...(req.query.past !== undefined
      ? { includePastEvents: req.query.past === '1' || req.query.past === 'true' }
      : {}),
    ...(req.query.reminders !== undefined
      ? { reminderMinutes: Number(req.query.reminders) }
      : {}),
  });

  const mergedEvents = await loadMergedEventsForProfile(stored, scope.joinedClubIds);
  const filteredEvents = filterEventsForCalendarSync(mergedEvents, {
    ...scope,
    rsvpIds,
    settings,
  });

  const icsBody = buildIcsCalendar(filteredEvents, {
    settings,
    rsvpIds,
    joinedCount: scope.joinedClubIds.length,
  });

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="clubhub-calendar.ics"');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.send(icsBody);
}

router.get('/feed.ics', handleServeIcsFeed);
router.get('/feed/:rawToken', handleServeIcsFeed);

export default router;
