// ── Events API Routes (id, clubId, start, end, allDay, kind, location, recurring) ──
import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { getClubPermission } from '../services/authService.js';
import { hasImportantFlag } from '../../src/utils/clubSubscriptions.js';
import {
  getDb,
  formatEventRow,
  normalizeClubId,
  upsertCollectorData,
  deleteRecord,
} from '../database.js';

const router = Router();

// GET /api/events — filterable by ?clubId=, ?from=, ?to=, ?kind=
router.get('/', (req, res) => {
  const db = getDb();
  const { clubId, club_id, from, to, kind } = req.query;
  const cid = normalizeClubId(clubId || club_id);

  let sql = 'SELECT * FROM events WHERE cancelled = 0';
  const params = [];

  if (cid)  { sql += ' AND lower(clubId) = lower(?)'; params.push(cid); }
  if (from) { sql += ' AND COALESCE(end, start) >= ?'; params.push(from); }
  if (to)   { sql += ' AND start <= ?'; params.push(to); }
  if (kind) { sql += ' AND kind = ?';   params.push(kind); }

  sql += ' ORDER BY start ASC';
  res.json(db.prepare(sql).all(...params).map(formatEventRow));
});

// GET /api/events/today — events occurring today
router.get('/today', (req, res) => {
  const db = getDb();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

  const events = db
    .stmt('SELECT * FROM events WHERE cancelled = 0 AND start < ? AND COALESCE(end, start) >= ? ORDER BY start ASC')
    .all(endOfDay, startOfDay)
    .map(formatEventRow);
  res.json(events);
});

// GET /api/events/upcoming — upcoming events starting from now
router.get('/upcoming', (req, res) => {
  const db = getDb();
  const now = new Date().toISOString();
  const events = db
    .stmt('SELECT * FROM events WHERE cancelled = 0 AND COALESCE(end, start) >= ? ORDER BY start ASC')
    .all(now)
    .map(formatEventRow);
  res.json(events);
});

// POST /api/events — upsert an event by id
router.post('/', optionalAuth, async (req, res) => {
  const evt = req.body || {};
  const clubId = normalizeClubId(evt.clubId || evt.club_id);
  if (!clubId || !evt.title || !evt.start) {
    return res.status(400).json({ error: 'clubId, title, and start (ISO UTC string) are required' });
  }
  const id = String(evt.id || `${clubId}_${Date.now()}`);
  const existing = getDb().stmt('SELECT clubId, important FROM events WHERE id = ?').get(id);
  if (hasImportantFlag(evt.important) || existing?.important) {
    const ids = new Set([clubId, existing?.clubId].filter(Boolean));
    for (const target of ids) {
      if (!(await getClubPermission(req.user, target)).isBoard) {
        return res.status(403).json({ error: 'Only verified board members can update important events.' });
      }
    }
  }
  upsertCollectorData({ events: [{ ...evt, id, clubId, important: hasImportantFlag(evt.important), source: 'manual' }] });
  res.status(201).json({ id, clubId });
});

// DELETE /api/events/:id
router.delete('/:id', optionalAuth, async (req, res) => {
  const existing = getDb().stmt('SELECT clubId, important FROM events WHERE id = ?').get(req.params.id);
  if (existing?.important && !(await getClubPermission(req.user, existing.clubId)).isBoard) {
    return res.status(403).json({ error: 'Only verified board members can delete important events.' });
  }
  res.json(deleteRecord('events', req.params.id));
});

export default router;
