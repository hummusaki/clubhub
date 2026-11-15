// ── Seed / Auto-Import from Collector Output + Multi-Source Connections ──
// 1. Reads `collector/output/clubhub-data.json` (or `collector/fixtures/sample-output.json`)
//    and upserts all 5 lists (clubs, posts, events, announcements, links) by `id`.
// 2. Syncs initial Discord, Email, Google Calendar, and Website updates into the same tables.

import { getDb, importCollectorFile } from './database.js';
import discordService, { getEffectiveDiscordConfig } from './services/discord.js';
import emailService, { getEffectiveEmailConfig } from './services/email.js';
import googleCalendarService from './services/googleCalendar.js';
import websiteService from './services/website.js';

export async function seedDatabase() {
  const db = getDb();
  const result = importCollectorFile();
  const realClubCount = db.stmt("SELECT COUNT(*) AS c FROM clubs WHERE id NOT LIKE 'demo_%'").get()?.c || 0;
  const hasLiveData = realClubCount > 0 || Boolean(process.env.IG_ACCESS_TOKEN);

  if (getEffectiveDiscordConfig().botToken || !hasLiveData) {
    try {
      await discordService.syncDiscord();
    } catch (err) {
      console.warn('⚠️ Initial Discord sync skipped:', err.message);
    }
  }
  if (getEffectiveEmailConfig().imapReady || !hasLiveData) {
    try {
      await emailService.syncEmail();
    } catch (err) {
      console.warn('⚠️ Initial Email IMAP sync skipped:', err.message);
    }
  }
  if (!hasLiveData) {
    await googleCalendarService.syncCalendar();
    await websiteService.syncWebsite();
  }

  if (result.imported) {
    console.log(
      `✅ Loaded collector + multi-source data (Instagram, Discord, Email, GCal, Website)`
    );
  }
  return result;
}
