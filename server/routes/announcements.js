// ── Announcements API Routes (id, clubId, title, summary, important, postedAt, permalink) ──
import { Router } from 'express';
import {
  getDb,
  formatAnnouncementRow,
  normalizeClubId,
  upsertCollectorData,
  deleteRecord,
} from '../database.js';

const router = Router();

// GET /api/announcements — filterable by ?clubId=, ?important=, ?limit=
router.get('/', (req, res) => {
  const db = getDb();
  const { clubId, club_id, important, limit } = req.query;
  const cid = normalizeClubId(clubId || club_id);

  let sql = 'SELECT * FROM announcements WHERE 1=1';
  const params = [];

  if (cid) {
    sql += ' AND lower(clubId) = lower(?)';
    params.push(cid);
  }
  if (important !== undefined) {
    sql += ' AND important = ?';
    params.push(important === 'true' || important === '1' ? 1 : 0);
  }

  sql += ' ORDER BY postedAt DESC';
  const parsedLimit = parseInt(limit, 10);
  if (parsedLimit > 0) {
    sql += ' LIMIT ?';
    params.push(parsedLimit);
  }

  res.json(db.prepare(sql).all(...params).map(formatAnnouncementRow));
});

// POST /api/announcements — upsert an announcement by id
router.post('/', (req, res) => {
  const ann = req.body || {};
  const clubId = normalizeClubId(ann.clubId || ann.club_id);
  if (!clubId || !ann.title) {
    return res.status(400).json({ error: 'clubId and title are required' });
  }
  const id = String(ann.id || `${clubId}_ann_${Date.now()}`);
  upsertCollectorData({
    announcements: [
      {
        ...ann,
        id,
        clubId,
        postedAt: ann.postedAt || new Date().toISOString(),
      },
    ],
  });
  res.status(201).json({ id, clubId });
});

// DELETE /api/announcements/:id
router.delete('/:id', (req, res) => {
  res.json(deleteRecord('announcements', req.params.id));
});

export default router;
