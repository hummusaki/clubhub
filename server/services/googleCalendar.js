// ── Google Calendar Ingestion Service ──
// Connects club Google Calendars to the ClubHub database.

import { getDb, formatEventRow } from '../database.js';
import { ingestResourceItem } from './resourceIngestor.js';

const DEMO_GCAL_EVENTS = [
  {
    id: 'gcal_cs_officehours',
    clubId: 'demo_ucsc_csclub',
    clubName: 'Computer Science Club',
    identifier: 'csclub@ucsc.edu',
    title: 'CS Club Officer Hours & Resume Review',
    caption: '📅 [Google Calendar] Officer Hours & Resume Review on Friday from 2pm to 4pm at Baskin Engineering 152',
  },
];

export class GoogleCalendarService {
  async syncCalendar({ clubId = null } = {}) {
    const items = clubId
      ? DEMO_GCAL_EVENTS.filter(e => e.clubId === clubId)
      : DEMO_GCAL_EVENTS;

    for (const item of items) {
      ingestResourceItem({
        ...item,
        source: 'google_calendar',
        postedAt: new Date().toISOString(),
      });
    }

    return { source: 'google_calendar', synced: items.length };
  }

  getClubCalendarEvents(clubId) {
    const db = getDb();
    return db
      .stmt("SELECT * FROM events WHERE clubId = ? AND source = 'google_calendar' ORDER BY start ASC")
      .all(clubId)
      .map(formatEventRow);
  }
}

export default new GoogleCalendarService();
