// ── Events API Routes ──
import { Router } from 'express';
import { getDb } from '../database.js';

const router = Router();

// GET /api/events — all events, optionally filtered
router.get('/', (req, res) => {
  const db = getDb();
  const { club_id, from, to, source } = req.query;

  let sql = `
    SELECT e.*, c.name AS club_name, c.abbreviation AS club_abbr
    FROM events e
    LEFT JOIN clubs c ON e.club_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (club_id) { sql += ' AND e.club_id = ?'; params.push(club_id); }
  if (from)    { sql += ' AND e.start_time >= ?'; params.push(from); }
  if (to)      { sql += ' AND e.start_time <= ?'; params.push(to); }
  if (source)  { sql += ' AND e.source = ?'; params.push(source); }

  sql += ' ORDER BY e.start_time ASC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/events/today — today's schedule
router.get('/today', (req, res) => {
  const db = getDb();
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

  const events = db.prepare(`
    SELECT e.*, c.name AS club_name, c.abbreviation AS club_abbr
    FROM events e
    LEFT JOIN clubs c ON e.club_id = c.id
    WHERE e.start_time >= ? AND e.start_time < ?
    ORDER BY e.start_time ASC
  `).all(startOfDay, endOfDay);

  res.json(events);
});

// GET /api/events/upcoming — next 7 days
router.get('/upcoming', (req, res) => {
  const db = getDb();
  const now = new Date().toISOString();
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const events = db.prepare(`
    SELECT e.*, c.name AS club_name, c.abbreviation AS club_abbr
    FROM events e
    LEFT JOIN clubs c ON e.club_id = c.id
    WHERE e.start_time >= ? AND e.start_time <= ?
    ORDER BY e.start_time ASC
  `).all(now, nextWeek);

  res.json(events);
});

// POST /api/events — create a new event
router.post('/', (req, res) => {
  const db = getDb();
  const { club_id, title, description, location, start_time, end_time, is_recurring, recurrence } = req.body;

  if (!club_id || !title || !start_time) {
    return res.status(400).json({ error: 'club_id, title, and start_time are required' });
  }

  const result = db.prepare(`
    INSERT INTO events (club_id, title, description, location, start_time, end_time, is_recurring, recurrence, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual')
  `).run(club_id, title, description || '', location || '', start_time, end_time || '', is_recurring ? 1 : 0, recurrence || '');

  res.status(201).json({ id: result.lastInsertRowid });
});

// DELETE /api/events/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
