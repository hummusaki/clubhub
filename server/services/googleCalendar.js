// ── Google Calendar Ingestion Service ──
// Pulls events from Google Calendars linked to clubs.
// Uses the Google Calendar API or public iCal feeds.

import { getDb } from '../database.js';

export class GoogleCalendarService {
  constructor() {
    this.db = getDb();
  }

  // ── Fetch & store events from a club's Google Calendar ──
  async syncClubCalendar(dataSourceId) {
    const db = this.db;
    const source = db.prepare('SELECT * FROM data_sources WHERE id = ?').get(dataSourceId);
    if (!source || source.platform !== 'google_calendar') {
      throw new Error(`Data source ${dataSourceId} is not a Google Calendar source`);
    }

    const logEntry = db.prepare(
      'INSERT INTO sync_log (source_id, status) VALUES (?, ?)'
    ).run(dataSourceId, 'running');
    const logId = logEntry.lastInsertRowid;

    try {
      // ── In production, use Google Calendar API ──
      // GET https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events
      //   ?timeMin={now}&maxResults=50&orderBy=startTime&singleEvents=true
      //   &key={API_KEY}  (or OAuth token in Authorization header)
      const calEvents = await this._fetchCalendarEvents(source);

      let itemsNew = 0;

      // Store raw items
      const upsertItem = db.prepare(`
        INSERT INTO ingested_items
          (source_id, platform, external_id, item_type, title, body, url, metadata, published_at)
        VALUES (?, 'google_calendar', ?, 'calendar_event', ?, ?, ?, ?, ?)
        ON CONFLICT(platform, external_id) DO UPDATE SET
          title = excluded.title,
          body = excluded.body,
          metadata = excluded.metadata
      `);

      // Also create proper events
      const upsertEvent = db.prepare(`
        INSERT INTO events (club_id, title, description, location, start_time, end_time, is_recurring, recurrence, source, source_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'google_calendar', ?)
        ON CONFLICT DO NOTHING
      `);

      const processAll = db.transaction(() => {
        for (const evt of calEvents) {
          // Store as ingested item
          const result = upsertItem.run(
            dataSourceId,
            evt.id,
            evt.summary || 'Calendar Event',
            evt.description || '',
            evt.htmlLink || '',
            JSON.stringify({
              location: evt.location,
              attendees: evt.attendees?.length || 0,
              status: evt.status,
              organizer: evt.organizer?.email,
            }),
            evt.start?.dateTime || evt.start?.date || new Date().toISOString()
          );
          if (result.changes > 0) itemsNew++;

          // Create/update ClubHub event
          upsertEvent.run(
            source.club_id,
            evt.summary || 'Calendar Event',
            evt.description || '',
            evt.location || '',
            evt.start?.dateTime || evt.start?.date || '',
            evt.end?.dateTime || evt.end?.date || '',
            evt.recurrence ? 1 : 0,
            evt.recurrence ? JSON.stringify(evt.recurrence) : null,
            evt.id
          );
        }
      });
      processAll();

      db.prepare(
        `UPDATE sync_log SET finished_at = datetime('now'),
         items_found = ?, items_new = ?, status = 'success' WHERE id = ?`
      ).run(calEvents.length, itemsNew, logId);

      db.prepare(
        `UPDATE data_sources SET last_synced = datetime('now') WHERE id = ?`
      ).run(dataSourceId);

      return { itemsFound: calEvents.length, itemsNew };
    } catch (err) {
      db.prepare(
        `UPDATE sync_log SET finished_at = datetime('now'),
         status = 'error', error_message = ? WHERE id = ?`
      ).run(err.message, logId);
      throw err;
    }
  }

  // ── Placeholder: Replace with real Google Calendar API call ──
  async _fetchCalendarEvents(source) {
    // In production:
    // const response = await fetch(
    //   `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(source.identifier)}/events` +
    //   `?timeMin=${new Date().toISOString()}&maxResults=50&orderBy=startTime&singleEvents=true`,
    //   { headers: { Authorization: `Bearer ${source.access_token}` } }
    // );
    // return (await response.json()).items;

    console.log(`📅 [Google Calendar] Would fetch events for ${source.identifier}`);
    return [];
  }

  // ── Get all calendar events for a club ──
  getClubCalendarEvents(clubId) {
    return this.db.prepare(`
      SELECT * FROM events
      WHERE club_id = ? AND source = 'google_calendar'
      ORDER BY start_time ASC
    `).all(clubId);
  }
}

export default new GoogleCalendarService();
