// ── Multi-Source Resource Ingestor ──
// Uses the Collector rule extractor (`collector/src/extract.js`) and `server/database.js`
// to ingest items from Instagram, Discord, Email, Google Calendar, and Websites
// into the 5 core tables (`clubs`, `posts`, `events`, `announcements`, `links`) and `dictionary_store`.

import {
  getDb,
  normalizeClubId,
  upsertCollectorData,
  setDictEntry,
  getDictionary,
  deleteDictEntry,
} from '../database.js';
import { extractPost } from '../../collector/src/extract.js';

export function upsertDataSource({ clubId, platform, identifier, isActive = true, config = {} }) {
  const cid = normalizeClubId(clubId);
  const id = `${cid}:${platform}:${identifier}`;
  const value = {
    id,
    clubId: cid,
    platform,
    identifier,
    isActive: Boolean(isActive),
    lastSynced: new Date().toISOString(),
    config,
  };
  setDictEntry(`source:${id}`, value, {
    namespace: 'sources',
    clubId: cid,
    source: platform,
  });
  return value;
}

export function deleteDataSource(idOrKey) {
  const raw = String(idOrKey || '').trim();
  if (!raw) return { deleted: false, id: raw };
  const dictKey = raw.startsWith('source:') ? raw : `source:${raw}`;
  const res = deleteDictEntry(dictKey);
  return { deleted: res.deleted, id: raw.replace(/^source:/, '') };
}

export function getDataSources({ clubId, platform } = {}) {
  const dict = getDictionary({
    namespace: 'sources',
    clubId: clubId ? normalizeClubId(clubId) : undefined,
    source: platform || undefined,
  });
  return Object.values(dict);
}

export function ingestResourceItem({
  clubId,
  clubName,
  source = 'instagram',
  id,
  caption,
  title,
  permalink = null,
  imageUrl = null,
  postedAt = null,
  identifier = null,
  forceAnnouncement = null,
  extractedInfo = null,
}) {
  const db = getDb();
  const cid = normalizeClubId(clubId);
  if (!cid) throw new Error('clubId is required');

  const existingClub = db.stmt('SELECT * FROM clubs WHERE lower(id) = lower(?)').get(cid);
  const resolvedClubName = clubName || existingClub?.name || cid;
  const postTime = postedAt || new Date().toISOString();
  const postId = String(id || `${source}_${cid}_${Date.now()}`);
  const fullText =
    title && caption && !caption.includes(title) ? `${title}\n${caption}` : caption || title || '';

  // Run the collector's extractor (unless pre-extracted by vision LLM)
  const info =
    extractedInfo ||
    extractPost(
      { id: postId, caption: fullText, postedAt: postTime, permalink, imageUrl },
      { username: cid, name: resolvedClubName }
    );

  // Record the connected data source in dictionary_store
  if (identifier || source) {
    upsertDataSource({
      clubId: cid,
      platform: source,
      identifier: identifier || (source === 'instagram' ? `@${cid}` : `${cid}_${source}`),
    });
  }

  // Discord #announcements, club Email newsletters, and Instagram Story Mentions should always
  // surface in Announcements even when they also contain an event date/time.
  const shouldCreateAnnouncement =
    forceAnnouncement !== null
      ? Boolean(forceAnnouncement)
      : source === 'discord' ||
        source === 'email' ||
        source === 'instagram_story' ||
        info.type === 'announcement' ||
        Boolean(info.important);

  const payload = {
    collectedAt: new Date().toISOString(),
    clubs: existingClub ? [] : [{ id: cid, name: resolvedClubName, instagram: cid }],
    posts: [
      {
        id: postId,
        clubId: cid,
        postedAt: postTime,
        permalink,
        imageUrl,
        caption: fullText,
        type: info.type,
        important: info.important,
        title: title || info.title,
        summary: info.summary,
        extractedBy: source === 'instagram' ? info.extractedBy : source,
        source,
      },
    ],
    events: (info.events || []).map((e, i) => ({
      id: `${postId}-${i}`,
      clubId: cid,
      clubName: resolvedClubName,
      postId,
      permalink,
      ...e,
      source,
    })),
    announcements: shouldCreateAnnouncement
      ? [
          {
            id: postId,
            clubId: cid,
            clubName: resolvedClubName,
            title: title || info.title,
            summary: info.summary,
            important: info.important,
            postedAt: postTime,
            permalink,
            source,
          },
        ]
      : [],
    links: (info.links || []).map(l => ({
      id: `${cid}:${l.url}`,
      clubId: cid,
      clubName: resolvedClubName,
      ...l,
      postId,
    })),
  };

  const upserted = upsertCollectorData(payload);
  return {
    postId,
    clubId: cid,
    source,
    extracted: info,
    upserted: upserted.upserted,
  };
}
