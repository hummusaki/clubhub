// ── Dictionary & Unified Hub API Routes ──
// Exposes the database like a Python/JS dictionary:
//   - GET    /api/dict              -> { [key]: value, ... }
//   - GET    /api/dict/:key         -> single key lookup
//   - PUT    /api/dict/:key         -> set dict[key] = value
//   - POST   /api/dict              -> set dict[key] = value (or bulk dictionary update)
//   - DELETE /api/dict/:key         -> delete dict[key]
//   - GET    /api/hub               -> unified club dictionary keyed by club slug
//   - GET    /api/hub/:clubKey      -> single club's full dictionary entry
//   - POST   /api/ingest(/:platform)-> ingest Instagram/Discord/Email/GCal/Website info,
//                                      auto-extract meeting time & location, and store in dict

import { Router } from 'express';
import {
  getDb,
  getDictionary,
  getDictEntry,
  setDictEntry,
  buildClubHubDictionary,
} from '../database.js';
import { ingestAndIndexItem, extractMeetingInfo } from '../services/extractor.js';

const router = Router();

// ── 1. Key-Value Dictionary Endpoints (/api/dict) ──────────────────

// GET /api/dict?namespace=clubs&club_id=1&source=instagram&prefix=cs:
router.get('/dict', (req, res) => {
  const { namespace, club_id, source, prefix } = req.query;
  const dict = getDictionary({
    namespace,
    clubId: club_id,
    source,
    prefix,
  });
  res.json(dict);
});

// GET /api/dict/:key
router.get('/dict/:key', (req, res) => {
  const entry = getDictEntry(req.params.key);
  if (!entry) {
    return res.status(404).json({ error: `Key "${req.params.key}" not found in dictionary` });
  }
  res.json(entry);
});

// PUT /api/dict/:key — set dict[key] = value
router.put('/dict/:key', (req, res) => {
  const { value, namespace, club_id, source } = req.body;
  const storedValue = value !== undefined ? value : req.body;
  const entry = setDictEntry(req.params.key, storedValue, {
    namespace: namespace || 'custom',
    clubId: club_id || null,
    source: source || 'manual',
  });
  res.json(entry);
});

// POST /api/dict — set one key `{ key, value, ... }` OR bulk dictionary `{ entries: { k1: v1, k2: v2 } }`
router.post('/dict', (req, res) => {
  const { key, value, entries, namespace = 'custom', club_id = null, source = 'manual' } = req.body;

  if (entries && typeof entries === 'object') {
    const db = getDb();
    const results = {};
    const saveAll = db.transaction(() => {
      for (const [k, v] of Object.entries(entries)) {
        const saved = setDictEntry(k, v, { namespace, clubId: club_id, source });
        results[k] = saved.value;
      }
    });
    saveAll();
    return res.status(201).json({ updated: Object.keys(results).length, dictionary: results });
  }

  if (!key) {
    return res.status(400).json({ error: 'Provide either "key" + "value" or "entries" object' });
  }

  const saved = setDictEntry(key, value, { namespace, clubId: club_id, source });
  res.status(201).json(saved);
});

// DELETE /api/dict/:key
router.delete('/dict/:key', (req, res) => {
  const db = getDb();
  const info = db.prepare('DELETE FROM dictionary_store WHERE key = ?').run(req.params.key);
  res.json({ deleted: info.changes > 0, key: req.params.key });
});

// ── 2. Unified ClubHub Dictionary Endpoints (/api/hub) ─────────────

// GET /api/hub — returns all clubs as a dictionary `{ cs: {...}, ds: {...}, ... }`
router.get('/hub', (req, res) => {
  res.json(buildClubHubDictionary());
});

// GET /api/hub/:clubKey — returns a single club's dictionary entry (by slug, abbr, or id)
router.get('/hub/:clubKey', (req, res) => {
  const dict = buildClubHubDictionary(req.params.clubKey);
  const keys = Object.keys(dict);
  if (keys.length === 0) {
    return res.status(404).json({ error: `Club "${req.params.clubKey}" not found` });
  }
  res.json(dict[keys[0]]);
});

// ── 3. Multi-Source Ingestion & Parser Endpoints (/api/ingest) ─────

function handleIngest(req, res) {
  const db = getDb();
  const platform = (req.params.platform || req.body.platform || '').toLowerCase();
  const validPlatforms = ['instagram', 'discord', 'email', 'google_calendar', 'website'];

  if (!validPlatforms.includes(platform)) {
    return res.status(400).json({
      error: `Invalid platform "${platform}". Must be one of: ${validPlatforms.join(', ')}`,
    });
  }

  let { club_id, club_key, title, body, text, caption, subject, author, url, identifier, external_id, metadata, meeting_time, location } = req.body;

  // Allow resolving club by slug/abbreviation/name if club_id is not passed
  if (!club_id && club_key) {
    const club = db.prepare(
      'SELECT id FROM clubs WHERE lower(slug) = lower(?) OR lower(abbreviation) = lower(?) OR lower(name) = lower(?)'
    ).get(club_key, club_key, club_key);
    if (club) club_id = club.id;
  }

  if (!club_id) {
    return res.status(400).json({ error: 'Provide either club_id or club_key (e.g. "cs", "ds", "ac", "ec")' });
  }

  const finalTitle = title || subject || '';
  const finalBody = body || text || caption || '';

  if (!finalTitle && !finalBody) {
    return res.status(400).json({ error: 'Provide text content via "body", "text", "caption", or "title"' });
  }

  const itemTypeMap = {
    instagram: 'post',
    discord: 'message',
    email: 'email',
    google_calendar: 'calendar_event',
    website: 'page_content',
  };

  const result = ingestAndIndexItem({
    clubId: Number(club_id),
    platform,
    identifier: identifier || author || `${platform}_feed`,
    externalId: external_id,
    itemType: req.body.item_type || itemTypeMap[platform] || 'other',
    title: finalTitle,
    body: finalBody,
    author: author || identifier || platform,
    url: url || '',
    metadata: metadata || {},
    explicitTime: meeting_time || null,
    explicitLocation: location || null,
    createEventIfFound: req.body.create_event !== false,
    createAnnouncementIfFound: req.body.create_announcement !== false,
  });

  res.status(201).json({
    success: true,
    ingested: result,
    dictionary_key: `${result.clubKey}:${platform}:${result.externalId}`,
  });
}

router.post('/ingest', handleIngest);
router.post('/ingest/:platform', handleIngest);

// POST /api/parse — preview what meeting time & location the extractor finds in any text
router.post('/parse', (req, res) => {
  const { text, title } = req.body;
  res.json(extractMeetingInfo(text || '', title || ''));
});

export default router;
