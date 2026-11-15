// ── Webhook, Collector Data, Search, and Dictionary Routes ──
//
// Collector Webhook URL (for collector/.env DB_WEBHOOK_URL):
//   POST http://localhost:3001/api/webhook
//
// File Import:
//   POST http://localhost:3001/api/import-file
//
// Full Collector JSON from DB:
//   GET  http://localhost:3001/api/data
//
// Club Search (uses collector/src/search.js):
//   GET  http://localhost:3001/api/search?q=debate
//
// Dictionary Views:
//   GET  http://localhost:3001/api/hub
//   GET  http://localhost:3001/api/hub/:clubId
//   GET  http://localhost:3001/api/dict

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import {
  getDb,
  normalizeClubId,
  upsertCollectorData,
  importCollectorFile,
  getAllCollectorData,
  buildClubHubDictionary,
  getDictionary,
  getDictEntry,
  setDictEntry,
  setDictEntries,
  deleteDictEntry,
} from '../database.js';
import { searchClubs } from '../../collector/src/search.js';
import { ingestResourceItem } from '../services/resourceIngestor.js';
import discordService from '../services/discord.js';
import emailService from '../services/email.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALLOWED_IMPORT_ROOT = path.resolve(__dirname, '../../collector');
const router = Router();

function firstStr(val) {
  if (Array.isArray(val)) return String(val[0] ?? '').trim();
  return typeof val === 'string' ? val.trim() : '';
}

function checkWebhookAuth(req) {
  const expected = (process.env.WEBHOOK_SECRET || '').trim();
  if (!expected) return true;
  const provided = req.get('x-webhook-secret') || firstStr(req.query.secret);
  return provided === expected;
}

// ── 1. Collector Webhook Endpoint (DB_WEBHOOK_URL) ──────────────────
function handleWebhook(req, res) {
  if (!checkWebhookAuth(req)) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }
  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Expected JSON payload from collector' });
  }

  res.json({
    ok: true,
    ...upsertCollectorData(payload),
  });
}

router.post('/webhook', handleWebhook);
router.post('/collect', handleWebhook);
router.post('/data', handleWebhook);

// ── 2. Import collector/output/clubhub-data.json from disk ──────────
router.post('/import-file', (req, res) => {
  if (!checkWebhookAuth(req)) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }
  let safePath = null;
  if (typeof req.body?.file === 'string' && req.body.file.trim()) {
    const resolved = path.resolve(ALLOWED_IMPORT_ROOT, req.body.file.trim());
    if (
      !resolved.startsWith(ALLOWED_IMPORT_ROOT + path.sep) ||
      !resolved.endsWith('.json')
    ) {
      return res.status(400).json({ error: 'Import file must be a .json file inside collector/' });
    }
    safePath = resolved;
  }
  const result = importCollectorFile(safePath);
  if (!result.imported) {
    return res.status(404).json(result);
  }
  res.json(result);
});

// ── 3. Get all 5 lists in the exact Collector JSON format ───────────
router.get('/data', (req, res) => {
  res.json(getAllCollectorData({ clubId: firstStr(req.query.clubId) || undefined }));
});

// ── 4. Search clubs (uses collector/src/search.js) ──────────────────
router.get('/search', (req, res) => {
  const q = firstStr(req.query.q);
  if (!q) {
    const hub = buildClubHubDictionary();
    const now = new Date();
    return res.json(
      Object.values(hub).map(({ events, announcements, links, posts, roster, ...club }) => ({
        club,
        upcomingEvents: events.filter(e => new Date(e.end || e.start) >= now),
        announcements: announcements.slice(0, 5),
        links,
        roster,
      }))
    );
  }
  res.json(searchClubs(getAllCollectorData(), q));
});

// ── 4b. Roster directory endpoints (/api/roster) ────────────────────
router.get('/roster', (req, res) => {
  const clubId = firstStr(req.query.clubId) || undefined;
  const personType = firstStr(req.query.personType) || undefined;
  const data = getAllCollectorData(clubId ? { clubId } : {});
  let items = data.roster || [];
  if (personType) {
    items = items.filter(r => String(r.personType).toLowerCase() === personType.toLowerCase());
  }
  res.json(items);
});

router.post('/roster', (req, res) => {
  const body = req.body || {};
  const clubId = normalizeClubId(body.clubId);
  if (!clubId || !body.name) {
    return res.status(400).json({ error: 'clubId and name are required' });
  }
  const id = body.id || `custom_roster_${clubId}_${Date.now()}`;
  const entry = {
    id,
    clubId,
    clubName: body.clubName || clubId,
    name: String(body.name).trim(),
    initials: body.initials || null,
    role: String(body.role || 'Member').trim(),
    personType: body.personType === 'member' ? 'member' : 'officer',
    major: body.major || null,
    year: body.year || null,
    email: body.email || null,
    office: body.office || null,
    instagram: body.instagram || null,
    color: body.color || 'blue',
    source: body.source || 'manual',
    sourceUrl: body.sourceUrl || null,
  };
  upsertCollectorData({ roster: [entry] });
  res.status(201).json(entry);
});

// ── 5. ClubHub Dictionary View (/api/hub & /api/hub/:clubId) ────────
router.get('/hub', (req, res) => {
  res.json(buildClubHubDictionary());
});

router.get('/hub/:clubId', (req, res) => {
  const cid = normalizeClubId(req.params.clubId);
  const dict = buildClubHubDictionary(cid);
  const club = Object.values(dict)[0];
  if (!club) {
    return res.status(404).json({ error: `Club "${cid}" not found` });
  }
  res.json(club);
});

// ── 6. Key-Value Dictionary Store (/api/dict — Strictly Public Club Metadata Only) ──
function isPrivateUserDictKey(key) {
  const clean = String(key || '').trim();
  return /^user[_:]|@/i.test(clean);
}

router.get('/dict', (req, res) => {
  const namespace = firstStr(req.query.namespace) || undefined;
  if (namespace && /^user/i.test(namespace)) {
    return res.json({});
  }
  const clubId = firstStr(req.query.clubId) || firstStr(req.query.club_id) || undefined;
  const source = firstStr(req.query.source) || undefined;
  const prefix = firstStr(req.query.prefix) || undefined;
  const q = firstStr(req.query.q) || undefined;
  const rawDict = getDictionary({ namespace, clubId, source, prefix, q });
  const safeDict = {};
  for (const [k, v] of Object.entries(rawDict || {})) {
    if (!isPrivateUserDictKey(k) && !/^user/i.test(v?.namespace || '')) {
      safeDict[k] = v;
    }
  }
  res.json(safeDict);
});

router.get('/dict/:key', (req, res) => {
  if (isPrivateUserDictKey(req.params.key)) {
    return res.status(403).json({
      error: 'User-scoped keys and email identifiers are forbidden in the public dictionary store.',
      code: 'USER_PII_FORBIDDEN_IN_PUBLIC_DICT',
    });
  }
  const entry = getDictEntry(req.params.key);
  if (!entry || /^user/i.test(entry.namespace || '')) {
    return res.status(404).json({ error: `Key "${req.params.key}" not found` });
  }
  res.json(entry);
});

router.put('/dict/:key', (req, res) => {
  const { value, namespace, clubId, club_id, source } = req.body || {};
  if (isPrivateUserDictKey(req.params.key) || /^user/i.test(namespace || '')) {
    return res.status(403).json({
      error: 'Private user data cannot be stored in the public dictionary store. Use /api/workspace/* instead.',
      code: 'USER_PII_FORBIDDEN_IN_PUBLIC_DICT',
    });
  }
  const storedValue = value !== undefined ? value : req.body;
  res.json(
    setDictEntry(req.params.key, storedValue, {
      namespace: namespace || 'custom',
      clubId: normalizeClubId(clubId || club_id) || null,
      source: source || 'manual',
    })
  );
});

router.post('/dict', (req, res) => {
  const { key, value, entries, namespace = 'custom', clubId, club_id, source = 'manual' } = req.body || {};
  if (/^user/i.test(namespace || '')) {
    return res.status(403).json({
      error: 'Private user namespaces cannot be stored in the public dictionary store.',
      code: 'USER_PII_FORBIDDEN_IN_PUBLIC_DICT',
    });
  }
  const cid = normalizeClubId(clubId || club_id) || null;

  if (entries && typeof entries === 'object') {
    if (Object.keys(entries).some(k => isPrivateUserDictKey(k))) {
      return res.status(403).json({
        error: 'Private user keys or emails cannot be stored in the public dictionary store.',
        code: 'USER_PII_FORBIDDEN_IN_PUBLIC_DICT',
      });
    }
    const results = setDictEntries(entries, { namespace, clubId: cid, source });
    return res.status(201).json({ updated: Object.keys(results).length, dictionary: results });
  }
  if (!key) {
    return res.status(400).json({ error: 'Provide either "key" + "value" or "entries" object' });
  }
  if (isPrivateUserDictKey(key)) {
    return res.status(403).json({
      error: 'Private user keys or emails cannot be stored in the public dictionary store.',
      code: 'USER_PII_FORBIDDEN_IN_PUBLIC_DICT',
    });
  }
  res.status(201).json(setDictEntry(key, value, { namespace, clubId: cid, source }));
});

router.delete('/dict/:key', (req, res) => {
  res.json(deleteDictEntry(req.params.key));
});

// ── 7. Single-post/message ingestion (uses ingestResourceItem + optional outbound push) ──
async function handleSingleIngest(req, res) {
  const source = req.params.source || req.body?.source || 'instagram';
  const {
    clubId: rawClubId,
    club_id,
    clubName,
    id,
    title,
    caption,
    body,
    text,
    permalink,
    imageUrl,
    postedAt,
    pushDiscord = false,
    pushEmailTo = '',
    discordWebhookUrl = '',
    discordChannelId = '',
  } = req.body || {};
  const clubId = normalizeClubId(rawClubId || club_id);

  if (!clubId) {
    return res.status(400).json({ error: 'clubId (Instagram handle) is required' });
  }

  const rawText = (caption || body || text || '').trim();
  if (!rawText && !title) {
    return res.status(400).json({ error: 'caption, body, or text is required' });
  }

  const result = ingestResourceItem({
    clubId,
    clubName,
    source,
    id,
    title,
    caption: rawText,
    permalink: permalink || null,
    imageUrl: imageUrl || null,
    postedAt: postedAt || null,
  });

  const outbound = {};
  if (pushDiscord) {
    try {
      outbound.discord = await discordService.sendDiscordNotification({
        kind: 'announcement',
        webhookUrl: discordWebhookUrl || undefined,
        channelId: discordChannelId || undefined,
        clubName: clubName || clubId,
        title: title || result.extracted?.title,
        message: rawText,
        url: permalink || undefined,
      });
    } catch (err) {
      outbound.discord = { ok: false, error: err.message };
    }
  }
  if (pushEmailTo) {
    try {
      outbound.email = await emailService.sendNotification({
        kind: 'announcement',
        to: pushEmailTo,
        clubName: clubName || clubId,
        title: title || result.extracted?.title,
        message: rawText,
        url: permalink || undefined,
      });
    } catch (err) {
      outbound.email = { ok: false, error: err.message };
    }
  }

  res.status(201).json({
    success: true,
    ...result,
    ...(Object.keys(outbound).length > 0 ? { outbound } : {}),
  });
}

router.post('/ingest', handleSingleIngest);
router.post('/ingest/:source', handleSingleIngest);

export default router;
