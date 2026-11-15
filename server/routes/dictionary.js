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

const router = Router();

// ── 1. Collector Webhook Endpoint (DB_WEBHOOK_URL) ──────────────────
function handleWebhook(req, res) {
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
  const result = importCollectorFile(req.body?.file || null);
  if (!result.imported) {
    return res.status(404).json(result);
  }
  res.json(result);
});

// ── 3. Get all 5 lists in the exact Collector JSON format ───────────
router.get('/data', (req, res) => {
  res.json(getAllCollectorData({ clubId: req.query.clubId }));
});

// ── 4. Search clubs (uses collector/src/search.js) ──────────────────
router.get('/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) {
    const hub = buildClubHubDictionary();
    const now = new Date();
    return res.json(
      Object.values(hub).map(({ events, announcements, links, posts, ...club }) => ({
        club,
        upcomingEvents: events.filter(e => new Date(e.end || e.start) >= now),
        announcements: announcements.slice(0, 5),
        links,
      }))
    );
  }
  res.json(searchClubs(getAllCollectorData(), q));
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

// ── 6. Key-Value Dictionary Store (/api/dict) ───────────────────────
router.get('/dict', (req, res) => {
  const { namespace, clubId, club_id, source, prefix, q } = req.query;
  res.json(getDictionary({ namespace, clubId: clubId || club_id, source, prefix, q }));
});

router.get('/dict/:key', (req, res) => {
  const entry = getDictEntry(req.params.key);
  if (!entry) return res.status(404).json({ error: `Key "${req.params.key}" not found` });
  res.json(entry);
});

router.put('/dict/:key', (req, res) => {
  const { value, namespace, clubId, club_id, source } = req.body || {};
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
  const cid = normalizeClubId(clubId || club_id) || null;

  if (entries && typeof entries === 'object') {
    const results = setDictEntries(entries, { namespace, clubId: cid, source });
    return res.status(201).json({ updated: Object.keys(results).length, dictionary: results });
  }
  if (!key) {
    return res.status(400).json({ error: 'Provide either "key" + "value" or "entries" object' });
  }
  res.status(201).json(setDictEntry(key, value, { namespace, clubId: cid, source }));
});

router.delete('/dict/:key', (req, res) => {
  res.json(deleteDictEntry(req.params.key));
});

// ── 7. Single-post/message ingestion (uses ingestResourceItem) ──────
function handleSingleIngest(req, res) {
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

  res.status(201).json({
    success: true,
    ...result,
  });
}

router.post('/ingest', handleSingleIngest);
router.post('/ingest/:source', handleSingleIngest);

export default router;
