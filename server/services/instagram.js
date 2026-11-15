// ── Instagram Ingestion Service ──
// Connects to the Collector pipeline (`collector/src/index.js`) and the SQLite database.

import { collect } from '../../collector/src/index.js';
import { upsertCollectorData, getDb, formatPostRow } from '../database.js';

export class InstagramService {
  // Sync Instagram posts using the Collector pipeline (uses live API if IG_ACCESS_TOKEN is set, otherwise demo fixtures)
  async syncInstagram({
    clubId = null,
    demo = !process.env.IG_ACCESS_TOKEN,
    fallbackPersonal = process.env.IG_PERSONAL_FALLBACK === 'true',
    stories = process.env.IG_SCRAPER_STORIES === 'true',
  } = {}) {
    const data = await collect({ demo, only: clubId || undefined, fallbackPersonal, stories });
    return upsertCollectorData(data);
  }

  getClubPosts(clubId) {
    const db = getDb();
    return db
      .stmt("SELECT * FROM posts WHERE clubId = ? AND source = 'instagram' ORDER BY postedAt DESC")
      .all(clubId)
      .map(formatPostRow);
  }
}

export default new InstagramService();
