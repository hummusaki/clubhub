// ── Instagram Ingestion Service ──
// Pulls posts & stories from Instagram accounts linked to clubs.
// In production, use the Instagram Graph API with proper OAuth tokens.
// This module provides the structure and a mock implementation.

import { getDb } from '../database.js';

export class InstagramService {
  constructor() {
    this.db = getDb();
  }

  // ── Fetch & store posts from a club's Instagram account ──
  async syncClubInstagram(dataSourceId) {
    const db = this.db;
    const source = db.prepare('SELECT * FROM data_sources WHERE id = ?').get(dataSourceId);
    if (!source || source.platform !== 'instagram') {
      throw new Error(`Data source ${dataSourceId} is not an Instagram source`);
    }

    // Start sync log
    const logEntry = db.prepare(
      'INSERT INTO sync_log (source_id, status) VALUES (?, ?)'
    ).run(dataSourceId, 'running');
    const logId = logEntry.lastInsertRowid;

    try {
      // ── In production, call the Instagram Graph API here ──
      // GET https://graph.instagram.com/me/media?fields=id,caption,media_type,
      //     media_url,thumbnail_url,timestamp,permalink&access_token={token}
      const posts = await this._fetchInstagramPosts(source);

      let itemsNew = 0;
      const upsert = db.prepare(`
        INSERT INTO ingested_items
          (source_id, platform, external_id, item_type, title, body, author, url, media_urls, metadata, published_at)
        VALUES (?, 'instagram', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(platform, external_id) DO UPDATE SET
          body = excluded.body,
          media_urls = excluded.media_urls,
          metadata = excluded.metadata
      `);

      const processAll = db.transaction(() => {
        for (const post of posts) {
          const result = upsert.run(
            dataSourceId,
            post.id,
            post.media_type === 'VIDEO' ? 'story' : 'post',
            post.caption?.substring(0, 100) || 'Instagram Post',
            post.caption || '',
            source.identifier,
            post.permalink || '',
            JSON.stringify(post.media_urls || []),
            JSON.stringify({ likes: post.like_count, comments: post.comments_count }),
            post.timestamp
          );
          if (result.changes > 0) itemsNew++;
        }
      });
      processAll();

      // Auto-create announcements from posts that look like event notices
      this._extractEventsFromPosts(posts, source);

      // Update sync log
      db.prepare(
        `UPDATE sync_log SET finished_at = datetime('now'),
         items_found = ?, items_new = ?, status = 'success' WHERE id = ?`
      ).run(posts.length, itemsNew, logId);

      // Update last_synced
      db.prepare(
        `UPDATE data_sources SET last_synced = datetime('now') WHERE id = ?`
      ).run(dataSourceId);

      return { itemsFound: posts.length, itemsNew };
    } catch (err) {
      db.prepare(
        `UPDATE sync_log SET finished_at = datetime('now'),
         status = 'error', error_message = ? WHERE id = ?`
      ).run(err.message, logId);
      throw err;
    }
  }

  // ── Placeholder: Replace with real Instagram Graph API call ──
  async _fetchInstagramPosts(source) {
    // In production:
    // const response = await fetch(
    //   `https://graph.instagram.com/me/media?fields=id,caption,media_type,media_url,timestamp,permalink,like_count,comments_count&access_token=${source.access_token}`
    // );
    // return (await response.json()).data;

    console.log(`📸 [Instagram] Would fetch posts for ${source.identifier}`);
    return []; // Return empty in dev; real API returns array of post objects
  }

  // ── Scan post captions for event-like keywords and create events ──
  _extractEventsFromPosts(posts, source) {
    const db = this.db;
    const dateRegex = /(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2})/i;
    const timeRegex = /(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i;
    const locationKeywords = /(?:at|in|@|room|hall|building|center)\s+(.+?)(?:\.|,|$)/i;

    for (const post of posts) {
      if (!post.caption) continue;

      const hasDate = dateRegex.test(post.caption);
      const hasTime = timeRegex.test(post.caption);
      const eventKeywords = /(?:meeting|event|workshop|session|practice|rehearsal|social)/i;

      if (hasDate && (hasTime || eventKeywords.test(post.caption))) {
        const existing = db.prepare(
          `SELECT id FROM events WHERE source = 'instagram' AND source_id = ?`
        ).get(post.id);

        if (!existing) {
          db.prepare(`
            INSERT INTO announcements (club_id, title, body, type, source, source_id)
            VALUES (?, ?, ?, 'event', 'instagram', ?)
          `).run(
            source.club_id,
            post.caption.substring(0, 100),
            post.caption,
            post.id
          );
        }
      }
    }
  }

  // ── Get all ingested Instagram items for a club ──
  getClubPosts(clubId) {
    return this.db.prepare(`
      SELECT ii.* FROM ingested_items ii
      JOIN data_sources ds ON ii.source_id = ds.id
      WHERE ds.club_id = ? AND ii.platform = 'instagram'
      ORDER BY ii.published_at DESC
    `).all(clubId);
  }
}

export default new InstagramService();
