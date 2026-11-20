// ── Announcements API Routes (id, clubId, title, summary, important, postedAt, permalink) ──
import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { getClubPermission } from '../services/authService.js';
import { hasImportantFlag } from '../../src/utils/clubSubscriptions.js';
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
router.post('/', optionalAuth, async (req, res) => {
  const ann = req.body || {};
  const clubId = normalizeClubId(ann.clubId || ann.club_id);
  if (!clubId || !ann.title) {
    return res.status(400).json({ error: 'clubId and title are required' });
  }
  const id = String(ann.id || `${clubId}_ann_${Date.now()}`);
  const existing = getDb().stmt('SELECT clubId, important FROM announcements WHERE id = ?').get(id);
  if (hasImportantFlag(ann.important) || existing?.important) {
    const ids = new Set([clubId, existing?.clubId].filter(Boolean));
    for (const target of ids) {
      if (!(await getClubPermission(req.user, target)).isBoard) {
        return res.status(403).json({ error: 'Only verified board members can update important announcements.' });
      }
    }
  }
  upsertCollectorData({
    announcements: [
      {
        ...ann,
        important: hasImportantFlag(ann.important),
        id,
        clubId,
        postedAt: ann.postedAt || new Date().toISOString(),
      },
    ],
  });
  res.status(201).json({ id, clubId });
});

// DELETE /api/announcements/:id
router.delete('/:id', optionalAuth, async (req, res) => {
  const existing = getDb().stmt('SELECT clubId, important FROM announcements WHERE id = ?').get(req.params.id);
  if (existing?.important && !(await getClubPermission(req.user, existing.clubId)).isBoard) {
    return res.status(403).json({ error: 'Only verified board members can delete important announcements.' });
  }
  res.json(deleteRecord('announcements', req.params.id));
});

export default router;
