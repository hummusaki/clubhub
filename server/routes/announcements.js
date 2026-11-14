// ── Announcements API Routes ──
import { Router } from 'express';
import { getDb } from '../database.js';

const router = Router();

// GET /api/announcements — all announcements
router.get('/', (req, res) => {
  const db = getDb();
  const { club_id, type, source, limit } = req.query;

  let sql = `
    SELECT a.*, c.name AS club_name
    FROM announcements a
    LEFT JOIN clubs c ON a.club_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (club_id) { sql += ' AND a.club_id = ?'; params.push(club_id); }
  if (type)    { sql += ' AND a.type = ?'; params.push(type); }
  if (source)  { sql += ' AND a.source = ?'; params.push(source); }

  sql += ' ORDER BY a.created_at DESC';
  if (limit) { sql += ' LIMIT ?'; params.push(parseInt(limit)); }

  res.json(db.prepare(sql).all(...params));
});

// POST /api/announcements
router.post('/', (req, res) => {
  const db = getDb();
  const { club_id, title, body, type } = req.body;

  if (!title) return res.status(400).json({ error: 'Title is required' });

  const result = db.prepare(`
    INSERT INTO announcements (club_id, title, body, type, source)
    VALUES (?, ?, ?, ?, 'manual')
  `).run(club_id || null, title, body || '', type || 'info');

  res.status(201).json({ id: result.lastInsertRowid });
});

// DELETE /api/announcements/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
