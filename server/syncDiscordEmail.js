// ── Autonomous Discord & Email Integration Agent CLI (for GitHub Actions & Local Sync) ──
// Usage:
//   npm run sync:discord-email
//   node --no-warnings server/syncDiscordEmail.js [--offline] [--send-digest]

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getDb,
  closeDb,
  upsertCollectorData,
  getAllCollectorData,
  getDictionary,
  getStats,
} from './database.js';
import { syncDiscordEmailAgent } from './services/discordEmailAgent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const OUTPUT_FILE = path.join(PUBLIC_DIR, 'clubhub-data.json');

async function main() {
  const args = new Set(process.argv.slice(2));
  const offline = args.has('--offline') || process.env.DISCORD_EMAIL_OFFLINE === 'true';
  const sendDigest = args.has('--send-digest') || process.env.SEND_DIGEST === 'true';

  const db = getDb();

  // 1. Pre-load existing public/clubhub-data.json so all previously scraped clubs, posts, and rosters are preserved
  let prevRosterUpdatedAt = null;
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const prev = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      if (prev && Array.isArray(prev.clubs)) {
        prevRosterUpdatedAt = prev.rosterUpdatedAt || null;
        upsertCollectorData(prev);
      }
    } catch (err) {
      console.warn('⚠️ Could not pre-load previous public/clubhub-data.json:', err.message);
    }
  }

  console.log('🤖 Running Autonomous Discord & Email Integration Agent...');
  const agentSummary = await syncDiscordEmailAgent({
    offline,
    sendDigest,
    updateClubsJson: true,
  });

  // 2. Clean any demo_* fixtures when real clubs are present
  const realCount =
    db.stmt("SELECT COUNT(*) AS c FROM clubs WHERE id NOT LIKE 'demo_%' AND id != 'media'").get()
      ?.c || 0;
  if (realCount > 0) {
    db.exec(`
      DELETE FROM posts WHERE clubId LIKE 'demo_%' OR clubId = 'media';
      DELETE FROM events WHERE clubId LIKE 'demo_%' OR clubId = 'media';
      DELETE FROM announcements WHERE clubId LIKE 'demo_%' OR clubId = 'media';
      DELETE FROM links WHERE clubId LIKE 'demo_%' OR clubId = 'media';
      DELETE FROM roster WHERE clubId LIKE 'demo_%' OR clubId = 'media';
      DELETE FROM clubs WHERE id LIKE 'demo_%' OR id = 'media';
      DELETE FROM dictionary_store WHERE clubId LIKE 'demo_%' OR clubId = 'media' OR key LIKE 'club:demo_%' OR key = 'club:media';
    `);
  }

  db.exec(`
    DELETE FROM events WHERE start < '2024-01-01' OR start > '2030-01-01';
  `);

  // 3. Export updated static snapshot (`public/clubhub-data.json`)
  const collectorData = getAllCollectorData();
  collectorData.errors = (collectorData.errors || []).filter(
    e => !/rate[- ]?limit|deferred|request limit reached/i.test(e?.message || '')
  );
  const stats = getStats();
  const sources = Object.values(getDictionary({ namespace: 'sources' }));

  const snapshot = {
    exportedAt: new Date().toISOString(),
    ...(prevRosterUpdatedAt ? { rosterUpdatedAt: prevRosterUpdatedAt } : {}),
    integrations: agentSummary,
    stats: {
      ...stats,
      sources: sources.length,
    },
    ...collectorData,
  };

  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(snapshot));
  closeDb();

  console.log(
    `✅ Discord & Email Agent Sync Complete:\n` +
      `   • Discord: ${agentSummary.discord.serversIndexed} club servers indexed, ${agentSummary.discord.postsCount} posts, ${agentSummary.discord.announcementsCount} announcements, ${agentSummary.discord.eventsCount} events (mode: ${agentSummary.discord.mode})\n` +
      `   • Email:   ${agentSummary.email.clubEmailsIndexed} club emails indexed, ${agentSummary.email.postsCount} bulletins, ${agentSummary.email.announcementsCount} announcements (mode: ${agentSummary.email.mode})\n` +
      `   • Snapshot exported -> public/clubhub-data.json (${snapshot.clubs.length} clubs, ${snapshot.posts.length} posts)`
  );

  // 4. Write GitHub Actions Step Summary if running in CI
  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = [
      '## 🤖 ClubHub Autonomous Discord & Email Integration Agent',
      '',
      `- **Synced At**: \`${agentSummary.lastSyncedAt}\``,
      `- **Discord Mode**: \`${agentSummary.discord.mode}\` (${agentSummary.discord.serversIndexed} verified UCSC club Discord servers)`,
      `- **Email Mode**: \`${agentSummary.email.mode}\` (${agentSummary.email.clubEmailsIndexed} official UCSC club emails)`,
      '',
      '| Channel | Connected Clubs / Servers | Feed Posts | Announcements | Events |',
      '| --- | ---: | ---: | ---: | ---: |',
      `| **Discord** | ${agentSummary.discord.serversIndexed} | ${agentSummary.discord.postsCount} | ${agentSummary.discord.announcementsCount} | ${agentSummary.discord.eventsCount} |`,
      `| **Email & Mailing Lists** | ${agentSummary.email.clubEmailsIndexed} | ${agentSummary.email.postsCount} | ${agentSummary.email.announcementsCount} | ${agentSummary.email.eventsCount} |`,
      '',
    ].join('\n');
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n', 'utf8');
    } catch {
      // ignore summary write errors
    }
  }
}

main().catch(err => {
  console.error('❌ Discord & Email Agent sync failed:', err);
  closeDb();
  process.exit(1);
});
