// ── Data Sources & Sync API Routes ──
// Manage external data source connections and trigger syncs.

import { Router } from 'express';
import { getDb } from '../database.js';
import syncOrchestrator from '../services/syncOrchestrator.js';

const router = Router();

// GET /api/sources — all data sources
router.get('/', (req, res) => {
  const db = getDb();
  const { club_id, platform } = req.query;

  let sql = `
    SELECT ds.*, c.name AS club_name,
      (SELECT COUNT(*) FROM ingested_items ii WHERE ii.source_id = ds.id) AS item_count
    FROM data_sources ds
    JOIN clubs c ON ds.club_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (club_id)  { sql += ' AND ds.club_id = ?'; params.push(club_id); }
  if (platform) { sql += ' AND ds.platform = ?'; params.push(platform); }

  sql += ' ORDER BY ds.club_id, ds.platform';
  res.json(db.prepare(sql).all(...params));
});

// POST /api/sources — register a new data source
router.post('/', (req, res) => {
  const db = getDb();
  const { club_id, platform, identifier, access_token, config } = req.body;

  if (!club_id || !platform || !identifier) {
    return res.status(400).json({ error: 'club_id, platform, and identifier are required' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO data_sources (club_id, platform, identifier, access_token, config)
      VALUES (?, ?, ?, ?, ?)
    `).run(club_id, platform, identifier, access_token || '', config ? JSON.stringify(config) : '');

    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'This source is already registered for this club' });
    }
    throw err;
  }
});

// PATCH /api/sources/:id — update a data source
router.patch('/:id', (req, res) => {
  const db = getDb();
  const { access_token, refresh_token, is_active, config } = req.body;
  const updates = [];
  const values = [];

  if (access_token !== undefined)  { updates.push('access_token = ?');  values.push(access_token); }
  if (refresh_token !== undefined) { updates.push('refresh_token = ?'); values.push(refresh_token); }
  if (is_active !== undefined)     { updates.push('is_active = ?');     values.push(is_active ? 1 : 0); }
  if (config !== undefined)        { updates.push('config = ?');        values.push(JSON.stringify(config)); }

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  values.push(req.params.id);
  db.prepare(`UPDATE data_sources SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ success: true });
});

// DELETE /api/sources/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM data_sources WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Sync Endpoints ──

// POST /api/sources/:id/sync — sync a single source
router.post('/:id/sync', async (req, res) => {
  try {
    const result = await syncOrchestrator.syncSource(parseInt(req.params.id));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync/club/:clubId — sync all sources for a club
router.post('/sync/club/:clubId', async (req, res) => {
  try {
    const results = await syncOrchestrator.syncClub(parseInt(req.params.clubId));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync/all — sync everything
router.post('/sync/all', async (req, res) => {
  try {
    const results = await syncOrchestrator.syncAll();
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sync/status — overall sync status
router.get('/sync/status', (req, res) => {
  res.json(syncOrchestrator.getSyncStatus());
});

// GET /api/sources/:id/history — sync history for a source
router.get('/:id/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(syncOrchestrator.getSyncHistory(parseInt(req.params.id), limit));
});

// ── Ingested Items ──

// GET /api/sources/items — search ingested items (the "dictionary")
router.get('/items/search', (req, res) => {
  const db = getDb();
  const { q, platform, club_id, type, limit } = req.query;

  let sql = `
    SELECT ii.*, ds.club_id, c.name AS club_name
    FROM ingested_items ii
    JOIN data_sources ds ON ii.source_id = ds.id
    JOIN clubs c ON ds.club_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (q) {
    sql += ' AND (ii.title LIKE ? OR ii.body LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  if (platform) { sql += ' AND ii.platform = ?';  params.push(platform); }
  if (club_id)  { sql += ' AND ds.club_id = ?';   params.push(club_id); }
  if (type)     { sql += ' AND ii.item_type = ?';  params.push(type); }

  sql += ' ORDER BY ii.ingested_at DESC';
  sql += ` LIMIT ${parseInt(limit) || 50}`;

  res.json(db.prepare(sql).all(...params));
});

export default router;
