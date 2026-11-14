// ── Email / Mailing List Ingestion Service ──
// Connects club mailing lists & newsletters to the ClubHub database.
// Parses meeting times, rooms, deadlines, and links from email bodies.

import { getDb, formatPostRow } from '../database.js';
import { ingestResourceItem } from './resourceIngestor.js';

const DEMO_EMAILS = [
  {
    id: 'email_cs_newsletter_1',
    clubId: 'demo_ucsc_csclub',
    clubName: 'Computer Science Club',
    identifier: 'csclub@ucsc.edu',
    title: '[CS Club Mailing List] Weekly Digest & Technical Interview Prep',
    caption: '📧 [Mailing List: csclub@ucsc.edu] Reminder: Technical Interview Prep session this Wednesday from 7pm to 8:30pm in Baskin Engineering 152. Slides: https://docs.google.com/presentation/d/demoCSPrep',
  },
  {
    id: 'email_art_newsletter_1',
    clubId: 'demo_ucsc_artcollective',
    clubName: 'Art Collective',
    identifier: 'artcollective@ucsc.edu',
    title: '[Art Collective Newsletter] Winter Zine Submissions Open',
    caption: '📧 [Mailing List: artcollective@ucsc.edu] Submit your artwork for the Winter Zine! Open studio hours every Sunday at 1pm in Porter D-Building studio 3B.',
  },
];

export class EmailService {
  async syncEmail({ clubId = null } = {}) {
    const items = clubId
      ? DEMO_EMAILS.filter(e => e.clubId === clubId)
      : DEMO_EMAILS;

    for (const item of items) {
      ingestResourceItem({
        ...item,
        source: 'email',
        postedAt: new Date().toISOString(),
      });
    }

    return { source: 'email', synced: items.length };
  }

  getClubEmails(clubId) {
    const db = getDb();
    return db
      .stmt("SELECT * FROM posts WHERE clubId = ? AND source = 'email' ORDER BY postedAt DESC")
      .all(clubId)
      .map(formatPostRow);
  }
}

export default new EmailService();
