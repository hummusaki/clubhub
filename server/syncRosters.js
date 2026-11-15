// ── Daily Club Directory & Roster Sync CLI (`npm run sync:rosters`) ──
// Designed to run once a day in GitHub Actions (`.github/workflows/daily-roster-sync.yml`) or locally:
//   1. Refreshes `collector/clubs.json` from the official UCSC Student Org Directory (getinvolved.ucsc.edu)
//   2. Loads the existing `public/clubhub-data.json` snapshot into SQLite
//   3. Collects roster & membership info alongside every club (websites, Linktrees, Instagram board/spotlight posts, Discord counts, official UCSC contacts)
//   4. Exports the updated `public/clubhub-data.json` snapshot and writes a GitHub Actions Job Summary

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
import { syncRoster } from './services/roster.js';
import { sanitizePublicSnapshot } from './services/publicSnapshotSanitizer.js';
import { updateClubsCatalog } from '../collector/src/update-clubs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const OUTPUT_FILE = path.join(PUBLIC_DIR, 'clubhub-data.json');

const args = process.argv.slice(2);
const offline = args.includes('--offline');
const htmlIdx = args.indexOf('--directory-html');
const directoryHtmlPath = htmlIdx !== -1 ? args[htmlIdx + 1] : null;

async function main() {
  getDb();

  // 1. Refresh official UCSC Student Organization catalog (collector/clubs.json)
  let directorySummary = null;
  if (directoryHtmlPath && fs.existsSync(directoryHtmlPath)) {
    const htmlOverride = fs.readFileSync(directoryHtmlPath, 'utf8');
    directorySummary = await updateClubsCatalog({ htmlOverride });
    console.log(
      `📋 Refreshed collector/clubs.json from HTML override (${directorySummary.total} clubs, ${directorySummary.added} new).`
    );
  } else if (!offline) {
    try {
      directorySummary = await updateClubsCatalog();
      console.log(
        `📋 Refreshed collector/clubs.json from UCSC directory (${directorySummary.total} clubs, ${directorySummary.added} new).`
      );
    } catch (err) {
      console.warn('⚠️ Could not reach getinvolved.ucsc.edu; continuing with committed collector/clubs.json:', err.message);
    }
  }

  // 2. Pre-load existing public/clubhub-data.json into SQLite so posts/events/links are preserved
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const prev = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      if (prev && Array.isArray(prev.clubs)) {
        const cleanedErrors = (prev.errors || []).filter(
          e => !/rate[- ]?limit|deferred|request limit reached/i.test(e?.message || '')
        );
        upsertCollectorData({ ...prev, errors: cleanedErrors });
      }
    } catch (err) {
      console.warn('⚠️ Could not pre-load previous public/clubhub-data.json:', err.message);
    }
  }

  // 3. Run multi-source roster collection alongside every club
  console.log(
    `👥 Collecting club rosters (${offline ? 'offline snapshot mode' : 'live websites + Instagram + Discord + UCSC directory'})...`
  );
  const rosterRun = await syncRoster({
    refreshDirectory: false, // already refreshed in step 1
    crawlWebsites: !offline,
    refreshDiscordCounts: !offline,
    websiteConcurrency: 6,
  });

  // 4. Clean out any demo_* fixtures when real UCSC clubs exist, and prune out-of-range dates
  const db = getDb();
  const realCount =
    db.stmt("SELECT COUNT(*) AS c FROM clubs WHERE id NOT LIKE 'demo_%' AND id != 'media'").get()?.c || 0;
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
    DELETE FROM dictionary_store WHERE clubId IN (SELECT id FROM clubs WHERE orgStatus IN ('suspended', 'interim_suspension', 'dismissed'));
    DELETE FROM clubs WHERE orgStatus IN ('suspended', 'interim_suspension', 'dismissed');
  `);
  db.exec(`DELETE FROM events WHERE start < '2024-01-01' OR start > '2030-01-01';`);

  // 5. Export updated public/clubhub-data.json snapshot
  const collectorData = getAllCollectorData();
  collectorData.errors = (collectorData.errors || []).filter(
    e => !/rate[- ]?limit|deferred|request limit reached/i.test(e?.message || '')
  );
  const stats = getStats();
  const sources = Object.values(getDictionary({ namespace: 'sources' }));

  const snapshot = sanitizePublicSnapshot({
    exportedAt: new Date().toISOString(),
    rosterUpdatedAt: rosterRun.rosterUpdatedAt,
    stats: {
      ...stats,
      sources: sources.length,
    },
    ...collectorData,
  });

  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(snapshot));
  closeDb();

  const s = rosterRun.summary;
  console.log(
    `✅ Daily roster sync complete: ${s.clubsChecked} clubs checked, ${s.totalRosterEntries} roster entries (${s.officersCount} officers, ${s.membersCount} spotlighted members across ${s.clubsWithNamedPeople} clubs with named rosters, ${s.clubsWithDiscordCounts} Discord member counts) -> public/clubhub-data.json`
  );

  // 6. Write GitHub Actions Job Summary when running in CI
  if (process.env.GITHUB_STEP_SUMMARY) {
    const summaryMd = [
      '## 👥 Daily ClubHub Directory & Roster Sync',
      '',
      `- **Checked At:** \`${rosterRun.rosterUpdatedAt}\``,
      directorySummary
        ? `- **Official UCSC Directory (\`getinvolved.ucsc.edu\`):** **${directorySummary.total}** clubs (**${directorySummary.added}** newly added)`
        : `- **Official UCSC Directory:** Used committed \`collector/clubs.json\``,
      `- **Clubs Checked:** **${s.clubsChecked}**`,
      `- **Total Roster Entries:** **${s.totalRosterEntries}** (${s.officersCount} officers/contacts · ${s.membersCount} spotlighted members)`,
      `- **Clubs With Named Student Rosters:** **${s.clubsWithNamedPeople}** (websites yielding rosters: **${s.websitesYieldingRosters}**)`,
      `- **Clubs With Live Discord Member Counts:** **${s.clubsWithDiscordCounts}**`,
      '',
    ].join('\n');
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summaryMd}\n`);
    } catch {
      // ignore summary write errors
    }
  }
}

main().catch(err => {
  console.error('Daily roster sync failed:', err);
  closeDb();
  process.exit(1);
});
