// ── Posts API Routes (id, clubId, postedAt, permalink, imageUrl, caption, type, important, title, summary, extractedBy) ──
import { Router } from 'express';
import {
  getDb,
  formatPostRow,
  normalizeClubId,
  upsertCollectorData,
  deleteRecord,
} from '../database.js';

const router = Router();

// GET /api/posts — filterable by ?clubId=, ?type=, ?limit=
router.get('/', (req, res) => {
  const db = getDb();
  const { clubId, club_id, type, limit } = req.query;
  const cid = normalizeClubId(clubId || club_id);

  let sql = 'SELECT * FROM posts WHERE 1=1';
  const params = [];

  if (cid)  { sql += ' AND lower(clubId) = lower(?)'; params.push(cid); }
  if (type) { sql += ' AND type = ?';                 params.push(type); }

  sql += ' ORDER BY postedAt DESC';
  const parsedLimit = parseInt(limit, 10);
  if (parsedLimit > 0) {
    sql += ' LIMIT ?';
    params.push(parsedLimit);
  }

  res.json(db.prepare(sql).all(...params).map(formatPostRow));
});

// POST /api/posts — upsert a post by id
router.post('/', (req, res) => {
  const post = req.body || {};
  const clubId = normalizeClubId(post.clubId || post.club_id);
  if (!clubId) {
    return res.status(400).json({ error: 'clubId is required' });
  }
  const id = String(post.id || `post_${clubId}_${Date.now()}`);
  upsertCollectorData({ posts: [{ ...post, id, clubId }] });
  res.status(201).json({ id, clubId });
});

// DELETE /api/posts/:id
router.delete('/:id', (req, res) => {
  res.json(deleteRecord('posts', req.params.id));
});

export default router;
