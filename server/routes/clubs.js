// ── Clubs API Routes ──
import { Router } from 'express';
import { getDb } from '../database.js';

const router = Router();

// GET /api/clubs — list all clubs with their tags
router.get('/', (req, res) => {
  const db = getDb();
  const clubs = db.prepare('SELECT * FROM clubs ORDER BY name').all();

  // Attach tags to each club
  const tagStmt = db.prepare(`
    SELECT t.label, t.color FROM tags t
    JOIN club_tags ct ON t.id = ct.tag_id
    WHERE ct.club_id = ?
  `);

  const result = clubs.map(club => ({
    ...club,
    tags: tagStmt.all(club.id),
    is_active: !!club.is_active,
  }));

  res.json(result);
});

// GET /api/clubs/:id — single club with full details
router.get('/:id', (req, res) => {
  const db = getDb();
  const club = db.prepare('SELECT * FROM clubs WHERE id = ?').get(req.params.id);
  if (!club) return res.status(404).json({ error: 'Club not found' });

  const tags = db.prepare(`
    SELECT t.label, t.color FROM tags t
    JOIN club_tags ct ON t.id = ct.tag_id WHERE ct.club_id = ?
  `).all(club.id);

  const members = db.prepare(`
    SELECT m.*, cm.role FROM members m
    JOIN club_members cm ON m.id = cm.member_id
    WHERE cm.club_id = ?
    ORDER BY CASE cm.role
      WHEN 'president' THEN 1 WHEN 'vice_president' THEN 2
      WHEN 'treasurer' THEN 3 WHEN 'secretary' THEN 4
      WHEN 'social_chair' THEN 5 WHEN 'officer' THEN 6 ELSE 7 END
  `).all(club.id);

  const events = db.prepare(`
    SELECT * FROM events WHERE club_id = ? ORDER BY start_time ASC
  `).all(club.id);

  const links = db.prepare(`
    SELECT * FROM links WHERE club_id = ? ORDER BY created_at DESC
  `).all(club.id);

  const dataSources = db.prepare(`
    SELECT id, platform, identifier, is_active, last_synced FROM data_sources
    WHERE club_id = ?
  `).all(club.id);

  res.json({
    ...club,
    is_active: !!club.is_active,
    tags,
    members,
    events,
    links,
    dataSources,
  });
});

// POST /api/clubs — create a new club
router.post('/', (req, res) => {
  const db = getDb();
  const { name, abbreviation, description, category, website_url } = req.body;

  if (!name) return res.status(400).json({ error: 'Club name is required' });

  try {
    const result = db.prepare(`
      INSERT INTO clubs (name, abbreviation, description, category, website_url)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, abbreviation || '', description || '', category || 'other', website_url || '');

    res.status(201).json({ id: result.lastInsertRowid, name });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Club with that name already exists' });
    }
    throw err;
  }
});

// PATCH /api/clubs/:id — update a club
router.patch('/:id', (req, res) => {
  const db = getDb();
  const fields = ['name', 'abbreviation', 'description', 'category', 'website_url', 'logo_url', 'is_active'];
  const updates = [];
  const values = [];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  updates.push(`updated_at = datetime('now')`);
  values.push(req.params.id);

  db.prepare(`UPDATE clubs SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ success: true });
});

// DELETE /api/clubs/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM clubs WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
