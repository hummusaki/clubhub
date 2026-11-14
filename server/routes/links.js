// ── Links & Resources API Routes ──
import { Router } from 'express';
import { getDb } from '../database.js';

const router = Router();

// GET /api/links
router.get('/', (req, res) => {
  const db = getDb();
  const { club_id } = req.query;

  let sql = `
    SELECT l.*, c.name AS club_name FROM links l
    LEFT JOIN clubs c ON l.club_id = c.id
  `;
  const params = [];

  if (club_id) {
    sql += ' WHERE l.club_id = ?';
    params.push(club_id);
  }
  sql += ' ORDER BY l.created_at DESC';

  res.json(db.prepare(sql).all(...params));
});

// POST /api/links
router.post('/', (req, res) => {
  const db = getDb();
  const { club_id, title, url, description, icon, color } = req.body;

  if (!title || !url) return res.status(400).json({ error: 'title and url are required' });

  const result = db.prepare(`
    INSERT INTO links (club_id, title, url, description, icon, color)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(club_id || null, title, url, description || '', icon || 'Link', color || 'blue');

  res.status(201).json({ id: result.lastInsertRowid });
});

// DELETE /api/links/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM links WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
