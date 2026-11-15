// ── Multi-Source Connections & Sync Routes (/api/sources) ──
// Connects Instagram, Discord, Email, Google Calendar, and Websites to the database.

import { Router } from 'express';
import { upsertDataSource, deleteDataSource } from '../services/resourceIngestor.js';
import syncOrchestrator from '../services/syncOrchestrator.js';

const router = Router();

// GET /api/sources — list all connected sources (Instagram, Discord, Email, GCal, Website)
router.get('/', (req, res) => {
  const { clubId, club_id, platform } = req.query;
  res.json(syncOrchestrator.getSources({ clubId: clubId || club_id, platform }));
});

// POST /api/sources — register a new Discord, Email, Instagram, GCal, or Website connection
router.post('/', async (req, res) => {
  try {
    const { clubId, club_id, platform, identifier, config, syncNow } = req.body || {};
    const cid = clubId || club_id;
    if (!cid || !platform || !identifier) {
      return res.status(400).json({ error: 'clubId, platform, and identifier are required' });
    }
    const source = upsertDataSource({ clubId: cid, platform, identifier, config });

    let syncResult = null;
    if (syncNow) {
      syncResult = await syncOrchestrator.syncPlatform(platform, {
        clubId: cid === 'all' || cid === 'campus' ? null : cid,
        channelId: platform === 'discord' ? config?.channelId || identifier : undefined,
      });
    }

    res.status(201).json({ ...source, syncResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sources & DELETE /api/sources/:id — disconnect a registered source
router.delete('/', (req, res) => {
  const id = req.query.id || req.body?.id || '';
  if (!id) return res.status(400).json({ error: 'Source id is required' });
  res.json(deleteDataSource(id));
});

router.delete('/:id', (req, res) => {
  res.json(deleteDataSource(req.params.id));
});

// POST /api/sources/sync — sync all platforms (or a specific platform: instagram, discord, email, google_calendar, website)
router.post('/sync', async (req, res) => {
  try {
    const { platform, clubId, channelId, limit } = req.body || {};
    if (platform && platform !== 'all') {
      const result = await syncOrchestrator.syncPlatform(platform, { clubId, channelId, limit });
      return res.json({ ok: true, result });
    }
    const results = await syncOrchestrator.syncAll({ clubId, channelId, limit });
    res.json({ ok: true, ...results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
