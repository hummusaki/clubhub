// ── Sync Orchestrator ──
// Coordinates all ingestion services and provides a unified sync interface.
// Can be triggered manually via API or scheduled with node-cron.

import { getDb } from '../database.js';
import instagramService from './instagram.js';
import discordService from './discord.js';
import emailService from './email.js';
import googleCalendarService from './googleCalendar.js';
import websiteService from './website.js';

const serviceMap = {
  instagram:       instagramService,
  discord:         discordService,
  email:           emailService,
  google_calendar: googleCalendarService,
  website:         websiteService,
};

const syncMethodMap = {
  instagram:       'syncClubInstagram',
  discord:         'syncClubDiscord',
  email:           'syncClubEmail',
  google_calendar: 'syncClubCalendar',
  website:         'syncClubWebsite',
};

export class SyncOrchestrator {
  constructor() {
    this.db = getDb();
  }

  // ── Sync a single data source ──
  async syncSource(dataSourceId) {
    const source = this.db.prepare('SELECT * FROM data_sources WHERE id = ?').get(dataSourceId);
    if (!source) throw new Error(`Data source ${dataSourceId} not found`);
    if (!source.is_active) throw new Error(`Data source ${dataSourceId} is disabled`);

    const service = serviceMap[source.platform];
    const method = syncMethodMap[source.platform];
    if (!service || !method) {
      throw new Error(`No service found for platform: ${source.platform}`);
    }

    return service[method](dataSourceId);
  }

  // ── Sync all sources for a specific club ──
  async syncClub(clubId) {
    const sources = this.db.prepare(
      'SELECT * FROM data_sources WHERE club_id = ? AND is_active = 1'
    ).all(clubId);

    const results = [];
    for (const source of sources) {
      try {
        const result = await this.syncSource(source.id);
        results.push({ sourceId: source.id, platform: source.platform, ...result });
      } catch (err) {
        results.push({ sourceId: source.id, platform: source.platform, error: err.message });
      }
    }
    return results;
  }

  // ── Sync ALL active data sources across all clubs ──
  async syncAll() {
    const sources = this.db.prepare(
      'SELECT * FROM data_sources WHERE is_active = 1'
    ).all();

    const results = [];
    for (const source of sources) {
      try {
        const result = await this.syncSource(source.id);
        results.push({ sourceId: source.id, platform: source.platform, clubId: source.club_id, ...result });
      } catch (err) {
        results.push({ sourceId: source.id, platform: source.platform, clubId: source.club_id, error: err.message });
      }
    }
    return results;
  }

  // ── Get sync history for a data source ──
  getSyncHistory(dataSourceId, limit = 20) {
    return this.db.prepare(
      'SELECT * FROM sync_log WHERE source_id = ? ORDER BY started_at DESC LIMIT ?'
    ).all(dataSourceId, limit);
  }

  // ── Get overall sync status ──
  getSyncStatus() {
    const sources = this.db.prepare(`
      SELECT ds.*, c.name AS club_name,
        (SELECT COUNT(*) FROM ingested_items ii WHERE ii.source_id = ds.id) AS item_count
      FROM data_sources ds
      JOIN clubs c ON ds.club_id = c.id
      WHERE ds.is_active = 1
      ORDER BY ds.last_synced ASC
    `).all();

    return sources;
  }
}

export default new SyncOrchestrator();
