// ── Links API Routes (id, clubId, clubName, url, label, kind, postId) ──
import { Router } from 'express';
import {
  getDb,
  normalizeClubId,
  upsertCollectorData,
  deleteRecord,
} from '../database.js';

const router = Router();

// GET /api/links — filterable by ?clubId= or ?kind=
router.get('/', (req, res) => {
  const db = getDb();
  const { clubId, club_id, kind } = req.query;
  const cid = normalizeClubId(clubId || club_id);

  let sql = 'SELECT * FROM links WHERE 1=1';
  const params = [];

  if (cid)  { sql += ' AND lower(clubId) = lower(?)'; params.push(cid); }
  if (kind) { sql += ' AND kind = ?';                params.push(kind); }

  sql += ' ORDER BY id ASC';
  res.json(db.prepare(sql).all(...params));
});

// POST /api/links — upsert a link by id (`${clubId}:${url}`)
router.post('/', (req, res) => {
  const link = req.body || {};
  const clubId = normalizeClubId(link.clubId || link.club_id);
  if (!clubId || !link.url) {
    return res.status(400).json({ error: 'clubId and url are required' });
  }
  const id = String(link.id || `${clubId}:${link.url}`);
  upsertCollectorData({ links: [{ ...link, id, clubId }] });
  res.status(201).json({ id, clubId });
});

// DELETE /api/links/:id
router.delete('/:id', (req, res) => {
  res.json(deleteRecord('links', req.params.id));
});

export default router;
