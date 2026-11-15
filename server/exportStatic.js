// ── Static Data Snapshot Exporter (for GitHub Pages & 2-Hour Scheduled Sync) ──
// 1. Preserves any previously scraped club posts/events from `public/clubhub-data.json`
// 2. Runs live Instagram Business Discovery + Instaloader Personal-Account Fallback + Linktree/GCal/Discord-Invite enrichment
// 3. Syncs live Discord channels across all servers the ClubHub bot can see
// 4. Exports merged `public/clubhub-data.json` for the Vite static build

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
import { seedDatabase } from './seed.js';
import instagramService from './services/instagram.js';
import { syncRoster } from './services/roster.js';
import { sanitizePublicSnapshot } from './services/publicSnapshotSanitizer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const OUTPUT_FILE = path.join(PUBLIC_DIR, 'clubhub-data.json');

async function main() {
  const exportOnly = process.argv.includes('--export-only');
  getDb();

  // 1. Pre-load existing public/clubhub-data.json so previously scraped personal-account
  //    clubs, posts, and daily rosters are preserved across incremental 2-hour GitHub Actions runs.
  let prevSyncedCount = 0;
  let prevRosterUpdatedAt = null;
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const prev = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      if (prev && Array.isArray(prev.clubs)) {
        prevSyncedCount = prev.clubs.filter(c => c?.syncStatus === 'synced').length;
        prevRosterUpdatedAt = prev.rosterUpdatedAt || null;
        const cleanedErrors = (prev.errors || []).filter(
          e => !/rate[- ]?limit|deferred|request limit reached/i.test(e?.message || '')
        );
        if (!exportOnly || (getStats().clubs || 0) === 0) {
          upsertCollectorData({ ...prev, errors: cleanedErrors });
        }
      }
    } catch (err) {
      console.warn('⚠️ Could not pre-load previous public/clubhub-data.json:', err.message);
    }
  }

  // On `git push` CI deploys, `public/clubhub-data.json` is already committed in the repo (often just
  // synced locally minutes earlier). Avoid burning Meta's hourly Graph API quota on every push;
  // scheduled 2-hour cron runs and manual `workflow_dispatch` runs perform live rotated Instagram syncs.
  const isCiPush =
    process.env.GITHUB_ACTIONS === 'true' &&
    process.env.GITHUB_EVENT_NAME === 'push' &&
    process.env.IG_SYNC_ON_PUSH !== 'true';

  const canSyncInstagram =
    Boolean(process.env.IG_USER_ID && process.env.IG_ACCESS_TOKEN) ||
    process.env.IG_PERSONAL_FALLBACK === 'true';

  // 2. Sync live Instagram (Business Discovery + optional Instaloader personal fallback + Linktree/GCal/Discord-Invite crawl)
  if (!exportOnly && canSyncInstagram) {
    if (isCiPush && prevSyncedCount > 0) {
      console.log(
        `ℹ️ Push deploy detected with ${prevSyncedCount} synced clubs in public/clubhub-data.json — skipping redundant Instagram re-scrape to preserve API rate limits.`
      );
    } else {
      try {
        console.log('📸 Syncing live Instagram Business Discovery + personal fallback...');
        await instagramService.syncInstagram({
          demo: false,
          fallbackPersonal: process.env.IG_PERSONAL_FALLBACK === 'true',
        });
      } catch (err) {
        console.warn('⚠️ Live Instagram sync skipped:', err.message);
      }
    }
  }

  // 3. Import local collector output (if newer) + sync live Discord / Email
  if (!exportOnly) {
    await seedDatabase();
  }

  // 3b. Run roster extraction if explicitly requested (`SYNC_ROSTERS=true`) or if snapshot has no roster yet
  const shouldSyncRosters =
    process.env.SYNC_ROSTERS === 'true' ||
    (!exportOnly && (getStats().roster || 0) === 0);
  if (shouldSyncRosters) {
    try {
      console.log('👥 Populating club rosters alongside snapshot...');
      const rosterRun = await syncRoster({
        refreshDirectory: process.env.SYNC_ROSTERS === 'true',
        crawlWebsites: !isCiPush,
        refreshDiscordCounts: !isCiPush,
      });
      prevRosterUpdatedAt = rosterRun.rosterUpdatedAt;
    } catch (err) {
      console.warn('⚠️ Roster sync skipped during static export:', err.message);
    }
  }

  // Remove placeholder demo_* fixtures (and any CSS @media false-positive) whenever real UCSC clubs are loaded
  const db = getDb();
  const realCount = db.stmt("SELECT COUNT(*) AS c FROM clubs WHERE id NOT LIKE 'demo_%' AND id != 'media'").get()?.c || 0;
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

  // Prune bogus historical false-positive event dates (e.g. anniversary captions parsed as 1991/2003)
  db.exec(`
    DELETE FROM events WHERE start < '2024-01-01' OR start > '2030-01-01';
  `);

  const collectorData = getAllCollectorData();
  collectorData.errors = (collectorData.errors || []).filter(
    e => !/rate[- ]?limit|deferred|request limit reached/i.test(e?.message || '')
  );
  const stats = getStats();
  const sources = Object.values(getDictionary({ namespace: 'sources' }));

  // Note: Do NOT duplicate `hub` or dump raw `dictionary_store` (`dict`) into the public static bundle:
  // 1) `hub` is reconstructed client-side in <1ms from `{ clubs, posts, events, announcements, links, roster }`,
  //    saving ~11.5 MB of redundant JSON payload.
  // 2) Omitting `dict` guarantees local `user_theme:<email>` / `user_clubs:<email>` entries in SQLite
  //    can never leak into `public/clubhub-data.json`.
  const snapshot = sanitizePublicSnapshot({
    exportedAt: new Date().toISOString(),
    ...(prevRosterUpdatedAt ? { rosterUpdatedAt: prevRosterUpdatedAt } : {}),
    stats: {
      ...stats,
      sources: sources.length,
    },
    ...collectorData,
  });

  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(snapshot));
  closeDb();

  console.log(
    `📦 Exported static snapshot (${snapshot.clubs.length} clubs, ${snapshot.posts.length} posts, ${snapshot.announcements.length} announcements, ${snapshot.events.length} events, ${snapshot.links.length} links, ${snapshot.roster.length} roster entries) -> public/clubhub-data.json`
  );
}

main().catch(err => {
  console.error('Export failed:', err);
  closeDb();
  process.exit(1);
});
