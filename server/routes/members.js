// ── Members API Routes ──
import { Router } from 'express';
import { getDb } from '../database.js';

const router = Router();

// GET /api/members — all members with their club memberships
router.get('/', (req, res) => {
  const db = getDb();
  const members = db.prepare('SELECT * FROM members ORDER BY name').all();

  const clubStmt = db.prepare(`
    SELECT c.id, c.name, c.abbreviation, cm.role FROM clubs c
    JOIN club_members cm ON c.id = cm.club_id
    WHERE cm.member_id = ?
  `);

  const result = members.map(member => ({
    ...member,
    clubs: clubStmt.all(member.id),
  }));

  res.json(result);
});

// GET /api/members/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  member.clubs = db.prepare(`
    SELECT c.id, c.name, c.abbreviation, cm.role FROM clubs c
    JOIN club_members cm ON c.id = cm.club_id WHERE cm.member_id = ?
  `).all(member.id);

  res.json(member);
});

// GET /api/clubs/:clubId/members — board + members of a club
router.get('/club/:clubId', (req, res) => {
  const db = getDb();
  const members = db.prepare(`
    SELECT m.*, cm.role FROM members m
    JOIN club_members cm ON m.id = cm.member_id
    WHERE cm.club_id = ?
    ORDER BY CASE cm.role
      WHEN 'president' THEN 1 WHEN 'vice_president' THEN 2
      WHEN 'treasurer' THEN 3 WHEN 'secretary' THEN 4
      WHEN 'social_chair' THEN 5 WHEN 'officer' THEN 6 ELSE 7 END
  `).all(req.params.clubId);

  res.json(members);
});

// POST /api/members
router.post('/', (req, res) => {
  const db = getDb();
  const { name, email } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  try {
    const result = db.prepare(
      'INSERT INTO members (name, email) VALUES (?, ?)'
    ).run(name, email || null);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Member with that email already exists' });
    }
    throw err;
  }
});

// POST /api/members/:id/join/:clubId — join a club
router.post('/:id/join/:clubId', (req, res) => {
  const db = getDb();
  const { role } = req.body;

  try {
    db.prepare(
      'INSERT INTO club_members (club_id, member_id, role) VALUES (?, ?, ?)'
    ).run(req.params.clubId, req.params.id, role || 'member');

    // Update member count
    db.prepare(`
      UPDATE clubs SET member_count = (
        SELECT COUNT(*) FROM club_members WHERE club_id = ?
      ), updated_at = datetime('now') WHERE id = ?
    `).run(req.params.clubId, req.params.clubId);

    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE') || err.message.includes('PRIMARY')) {
      return res.status(409).json({ error: 'Already a member of this club' });
    }
    throw err;
  }
});

export default router;
