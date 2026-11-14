// ── Discord Ingestion Service ──
// Connects to Discord servers/channels linked to clubs and pulls
// messages, announcements, and event info using Discord.js or the REST API.

import { getDb } from '../database.js';

export class DiscordService {
  constructor() {
    this.db = getDb();
  }

  // ── Fetch & store messages from a club's Discord server ──
  async syncClubDiscord(dataSourceId) {
    const db = this.db;
    const source = db.prepare('SELECT * FROM data_sources WHERE id = ?').get(dataSourceId);
    if (!source || source.platform !== 'discord') {
      throw new Error(`Data source ${dataSourceId} is not a Discord source`);
    }

    const logEntry = db.prepare(
      'INSERT INTO sync_log (source_id, status) VALUES (?, ?)'
    ).run(dataSourceId, 'running');
    const logId = logEntry.lastInsertRowid;

    try {
      // ── In production, use Discord REST API or Discord.js ──
      // GET https://discord.com/api/v10/channels/{channel_id}/messages
      // Headers: { Authorization: `Bot ${source.access_token}` }
      const messages = await this._fetchDiscordMessages(source);

      let itemsNew = 0;
      const upsert = db.prepare(`
        INSERT INTO ingested_items
          (source_id, platform, external_id, item_type, title, body, author, url, metadata, published_at)
        VALUES (?, 'discord', ?, 'message', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(platform, external_id) DO UPDATE SET
          body = excluded.body,
          metadata = excluded.metadata
      `);

      const processAll = db.transaction(() => {
        for (const msg of messages) {
          const result = upsert.run(
            dataSourceId,
            msg.id,
            msg.content?.substring(0, 100) || 'Discord Message',
            msg.content || '',
            msg.author?.username || 'Unknown',
            `https://discord.com/channels/${source.identifier}/${msg.channel_id}/${msg.id}`,
            JSON.stringify({
              reactions: msg.reactions,
              pinned: msg.pinned,
              attachments: msg.attachments?.length || 0,
            }),
            msg.timestamp
          );
          if (result.changes > 0) itemsNew++;
        }
      });
      processAll();

      // Auto-detect announcements (pinned messages or from announcement channels)
      this._extractAnnouncements(messages, source);

      // Auto-detect scheduled events
      const scheduledEvents = await this._fetchScheduledEvents(source);
      this._storeDiscordEvents(scheduledEvents, source);

      db.prepare(
        `UPDATE sync_log SET finished_at = datetime('now'),
         items_found = ?, items_new = ?, status = 'success' WHERE id = ?`
      ).run(messages.length, itemsNew, logId);

      db.prepare(
        `UPDATE data_sources SET last_synced = datetime('now') WHERE id = ?`
      ).run(dataSourceId);

      return { itemsFound: messages.length, itemsNew };
    } catch (err) {
      db.prepare(
        `UPDATE sync_log SET finished_at = datetime('now'),
         status = 'error', error_message = ? WHERE id = ?`
      ).run(err.message, logId);
      throw err;
    }
  }

  // ── Placeholder: Replace with real Discord API call ──
  async _fetchDiscordMessages(source) {
    // In production, parse source.config for channel IDs to monitor:
    // const config = JSON.parse(source.config || '{}');
    // const channels = config.channels || [];
    // for (const channelId of channels) {
    //   const res = await fetch(
    //     `https://discord.com/api/v10/channels/${channelId}/messages?limit=50`,
    //     { headers: { Authorization: `Bot ${source.access_token}` } }
    //   );
    //   messages.push(...await res.json());
    // }

    console.log(`💬 [Discord] Would fetch messages for server ${source.identifier}`);
    return [];
  }

  // ── Fetch Discord scheduled events ──
  async _fetchScheduledEvents(source) {
    // GET https://discord.com/api/v10/guilds/{guild_id}/scheduled-events
    console.log(`📅 [Discord] Would fetch scheduled events for server ${source.identifier}`);
    return [];
  }

  // ── Store Discord scheduled events as ClubHub events ──
  _storeDiscordEvents(events, source) {
    const db = this.db;
    const upsert = db.prepare(`
      INSERT INTO events (club_id, title, description, location, start_time, end_time, source, source_id)
      VALUES (?, ?, ?, ?, ?, ?, 'discord', ?)
      ON CONFLICT DO NOTHING
    `);

    for (const event of events) {
      upsert.run(
        source.club_id,
        event.name,
        event.description || '',
        event.entity_metadata?.location || 'Discord Voice Channel',
        event.scheduled_start_time,
        event.scheduled_end_time,
        event.id
      );
    }
  }

  // ── Extract announcements from pinned/important messages ──
  _extractAnnouncements(messages, source) {
    const db = this.db;
    for (const msg of messages) {
      if (!msg.pinned) continue;

      const existing = db.prepare(
        `SELECT id FROM announcements WHERE source = 'discord' AND source_id = ?`
      ).get(msg.id);

      if (!existing) {
        db.prepare(`
          INSERT INTO announcements (club_id, title, body, type, source, source_id)
          VALUES (?, ?, ?, 'info', 'discord', ?)
        `).run(
          source.club_id,
          msg.content?.substring(0, 100) || 'Discord Announcement',
          msg.content || '',
          msg.id
        );
      }
    }
  }

  // ── Get all ingested Discord items for a club ──
  getClubMessages(clubId) {
    return this.db.prepare(`
      SELECT ii.* FROM ingested_items ii
      JOIN data_sources ds ON ii.source_id = ds.id
      WHERE ds.club_id = ? AND ii.platform = 'discord'
      ORDER BY ii.published_at DESC
    `).all(clubId);
  }
}

export default new DiscordService();
