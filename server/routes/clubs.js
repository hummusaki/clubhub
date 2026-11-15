// ── Clubs API Routes (clubs.id = Instagram handle) ──
import { Router } from 'express';
import {
  getDb,
  formatClubRow,
  formatRosterRow,
  getClubById,
  normalizeClubId,
  upsertCollectorData,
  deleteRecord,
} from '../database.js';

const router = Router();

function firstStr(val) {
  if (Array.isArray(val)) return String(val[0] ?? '').trim();
  return typeof val === 'string' ? val.trim() : '';
}

// GET /api/clubs — list all clubs (optionally filter by ?category= or ?q=)
router.get('/', (req, res) => {
  const db = getDb();
  const category = firstStr(req.query.category);
  const q = firstStr(req.query.q);

  let sql = 'SELECT * FROM clubs WHERE 1=1';
  const params = [];

  if (category) {
    sql += ' AND lower(category) = lower(?)';
    params.push(category);
  }
  if (q) {
    sql += ' AND (name LIKE ? OR id LIKE ? OR alsoKnownAs LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  sql += ' ORDER BY name ASC';
  res.json(db.prepare(sql).all(...params).map(formatClubRow));
});

// GET /api/clubs/:id/roster — daily roster & officers alongside a single club
router.get('/:id/roster', (req, res) => {
  const db = getDb();
  const cid = normalizeClubId(req.params.id);
  const clubRow = db.stmt('SELECT * FROM clubs WHERE lower(id) = lower(?)').get(cid);
  if (!clubRow) return res.status(404).json({ error: 'Club not found' });

  const roster = db
    .stmt("SELECT * FROM roster WHERE lower(clubId) = lower(?) ORDER BY CASE WHEN personType = 'officer' THEN 0 ELSE 1 END, name ASC")
    .all(clubRow.id)
    .map(formatRosterRow);

  res.json({
    clubId: clubRow.id,
    clubName: clubRow.name,
    memberCount: clubRow.memberCount || clubRow.followers || 0,
    discordMemberCount: clubRow.discordMemberCount ?? null,
    discordOnlineCount: clubRow.discordOnlineCount ?? null,
    rosterUpdatedAt: clubRow.rosterUpdatedAt || null,
    roster,
  });
});

// GET /api/clubs/:id — single club by Instagram handle (`id`) with events, announcements, links, posts, roster
router.get('/:id', (req, res) => {
  const club = getClubById(req.params.id);
  if (!club) return res.status(404).json({ error: 'Club not found' });
  res.json(club);
});

// POST /api/clubs — upsert a club by id (Instagram handle)
router.post('/', (req, res) => {
  const club = req.body || {};
  const clubId = normalizeClubId(club.id || club.instagram);
  if (!clubId || !club.name) {
    return res.status(400).json({ error: 'id (or instagram handle) and name are required' });
  }
  upsertCollectorData({ clubs: [{ ...club, id: clubId, instagram: normalizeClubId(club.instagram) || clubId }] });
  res.status(201).json(getClubById(clubId));
});

// DELETE /api/clubs/:id
router.delete('/:id', (req, res) => {
  res.json(deleteRecord('clubs', req.params.id));
});

export default router;
