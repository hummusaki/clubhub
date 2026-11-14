// ── Website Ingestion Service ──
// Connects club websites & Linktrees to the ClubHub database.

import { getDb, formatPostRow } from '../database.js';
import { ingestResourceItem } from './resourceIngestor.js';

const DEMO_WEBSITE_UPDATES = [
  {
    id: 'web_cs_schedule',
    clubId: 'demo_ucsc_csclub',
    clubName: 'Computer Science Club',
    identifier: 'https://linktr.ee/demo_csclub',
    title: 'Website Schedule Update',
    caption: '🌐 [Club Website] General Body Meetings: Tuesdays at 6pm in Baskin Engineering 152. Website: https://linktr.ee/demo_csclub',
    permalink: 'https://linktr.ee/demo_csclub',
  },
];

export class WebsiteService {
  async syncWebsite({ clubId = null } = {}) {
    const items = clubId
      ? DEMO_WEBSITE_UPDATES.filter(w => w.clubId === clubId)
      : DEMO_WEBSITE_UPDATES;

    for (const item of items) {
      ingestResourceItem({
        ...item,
        source: 'website',
        postedAt: new Date().toISOString(),
      });
    }

    return { source: 'website', synced: items.length };
  }

  getClubWebContent(clubId) {
    const db = getDb();
    return db
      .stmt("SELECT * FROM posts WHERE clubId = ? AND source = 'website' ORDER BY postedAt DESC")
      .all(clubId)
      .map(formatPostRow);
  }
}

export default new WebsiteService();
