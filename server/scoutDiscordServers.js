// ── Automated Club Discord Server Discovery & Followability CLI (`npm run scout:discord`) ──
// Designed to run in GitHub Actions (`.github/workflows/discord-server-discovery.yml`) or locally:
//   1. Refreshes `collector/clubs.json` from the official UCSC Student Org Directory (`getinvolved.ucsc.edu`)
//   2. Pre-loads `public/clubhub-data.json` into SQLite so existing club bios, Linktrees, and captions are scanned
//   3. Crawls club websites, Linktrees, Beacons, Carrds, `/links` & `/join` subpages, and Discord Public Discovery
//   4. Inspects every invite via Discord's public Invite API (`NEWS` followability, landing channel type 5, member counts)
//   5. Optionally auto-follows followable `#announcements` channels where `@clubhub` Bot is a member (`--auto-follow`)
//   6. Persists `collector/clubs.json`, `public/discord-scout.json`, and (when new links are found) `public/clubhub-data.json`

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
import { scoutClubDiscordServers } from './services/discordScout.js';
import discordService from './services/discord.js';
import { updateClubsCatalog } from '../collector/src/update-clubs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const DATA_OUTPUT_FILE = path.join(PUBLIC_DIR, 'clubhub-data.json');

const args = process.argv.slice(2);
const offline = args.includes('--offline');
const skipDirectory = args.includes('--skip-directory');
const forceCrawlAll = args.includes('--force-crawl');
const forceRefreshInvites = args.includes('--force-refresh');
const autoFollow = args.includes('--auto-follow');

async function main() {
  getDb();

  // 1. Refresh official UCSC Student Organization catalog (`collector/clubs.json`) unless offline/skipped
  let directorySummary = null;
  if (!offline && !skipDirectory) {
    try {
      directorySummary = await updateClubsCatalog();
      console.log(
        `📋 Refreshed collector/clubs.json from UCSC directory (${directorySummary.total} clubs, ${directorySummary.added} new).`
      );
    } catch (err) {
      console.warn(
        '⚠️ Could not reach getinvolved.ucsc.edu; continuing with committed collector/clubs.json:',
        err.message
      );
    }
  }

  // 2. Pre-load existing `public/clubhub-data.json` into SQLite so fresh CI runners have all scraped links/posts/bios
  let prevRosterUpdatedAt = null;
  if (fs.existsSync(DATA_OUTPUT_FILE)) {
    try {
      const prev = JSON.parse(fs.readFileSync(DATA_OUTPUT_FILE, 'utf8'));
      prevRosterUpdatedAt = prev?.rosterUpdatedAt || null;
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

  // 3. Run multi-vector club Discord server discovery & followability inspection
  console.log(
    `🔭 Scouting club Discord servers (${offline ? 'offline snapshot mode' : 'live website crawl + Discord Invite & Discovery API'})...`
  );
  const report = await scoutClubDiscordServers({
    crawlWebsites: !offline,
    forceCrawlAll,
    searchPublicDiscovery: !offline,
    forceRefreshInvites,
    offline,
    persistCatalog: !offline,
    writePublicJson: true,
    websiteConcurrency: 6,
  });

  // 4. Optional auto-follow when @clubhub Bot is inside discovered club servers with Announcement Channels
  const autoFollowed = [];
  if (autoFollow && !offline) {
    const targetChannelId = process.env.DISCORD_FOLLOW_TARGET_CHANNEL_ID || '';
    if (targetChannelId && process.env.DISCORD_BOT_TOKEN) {
      for (const srv of report.servers) {
        if (!Array.isArray(srv.botAnnouncementChannels) || srv.botAnnouncementChannels.length === 0) {
          continue;
        }
        const primaryAnnCh = srv.botAnnouncementChannels[0];
        try {
          await discordService.followAnnouncementChannel({
            sourceChannelId: primaryAnnCh.id,
            targetChannelId,
          });
          autoFollowed.push({
            clubName: srv.clubName,
            serverName: srv.serverName || srv.clubName,
            channelName: primaryAnnCh.name,
          });
        } catch (err) {
          console.warn(
            `⚠️ Auto-follow skipped for ${srv.clubName} (#${primaryAnnCh.name}): ${err.message}`
          );
        }
      }
    }
  }

  // 5. Re-export `public/clubhub-data.json` whenever new valid Discord links were discovered
  if (report.summary.newlyDiscovered > 0) {
    const db = getDb();
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
    db.exec(`DELETE FROM events WHERE start < '2024-01-01' OR start > '2030-01-01';`);

    const collectorData = getAllCollectorData();
    collectorData.errors = (collectorData.errors || []).filter(
      e => !/rate[- ]?limit|deferred|request limit reached/i.test(e?.message || '')
    );
    const stats = getStats();
    const sources = Object.values(getDictionary({ namespace: 'sources' }));

    const snapshot = {
      exportedAt: new Date().toISOString(),
      ...(prevRosterUpdatedAt ? { rosterUpdatedAt: prevRosterUpdatedAt } : {}),
      stats: {
        ...stats,
        sources: sources.length,
      },
      ...collectorData,
    };

    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    fs.writeFileSync(DATA_OUTPUT_FILE, JSON.stringify(snapshot));
  }

  closeDb();

  const s = report.summary;
  console.log(
    `✅ Discord scout complete: ${s.totalInvitesChecked} invites checked across ${s.totalClubsWithDiscord} clubs (${s.followableServers} followable NEWS servers, ${s.newlyDiscovered} newly discovered, ${s.expiredInvites} expired) -> public/discord-scout.json`
  );

  // 6. Write rich GitHub Actions Step Summary when running in CI
  if (process.env.GITHUB_STEP_SUMMARY) {
    const newServers = report.servers.filter(srv => srv.isNewlyDiscovered && srv.status !== 'expired');
    const followableList = report.servers.filter(srv => srv.followable && srv.status === 'valid');
    const expiredList = report.servers.filter(srv => srv.status === 'expired');

    const lines = [
      '## 🔭 Club Discord Server Discovery & Followability Report',
      '',
      `- **Scouted At:** \`${report.scoutedAt}\``,
      directorySummary
        ? `- **Official UCSC Directory (\`getinvolved.ucsc.edu\`):** **${directorySummary.total}** clubs (**${directorySummary.added}** newly added)`
        : `- **Official UCSC Directory:** Used committed \`collector/clubs.json\``,
      `- **Clubs With Active Discord Invites:** **${s.totalClubsWithDiscord}** (${s.totalInvitesChecked} invites inspected)`,
      `- **Followable Announcement Servers (\`NEWS\` / \`#announcements\`):** **${s.followableServers}**`,
      `- **Newly Discovered Club Discord Servers:** **${s.newlyDiscovered}**`,
      `- **Expired Invites Flagged:** **${s.expiredInvites}**`,
      autoFollowed.length > 0
        ? `- **Auto-Followed via Bot:** **${autoFollowed.length}** (${autoFollowed.map(a => `${a.clubName} #${a.channelName}`).join(', ')})`
        : '',
      '',
    ].filter(Boolean);

    if (newServers.length > 0) {
      lines.push('### 🆕 Newly Discovered Club Discord Servers', '');
      lines.push('| Club | Server Name | Invite | Followable (`NEWS`) | Members | Source |');
      lines.push('| --- | --- | --- | --- | --- | --- |');
      for (const srv of newServers.slice(0, 30)) {
        lines.push(
          `| **${srv.clubName}** (\`@${srv.instagram}\`) | ${srv.serverName || '—'} | ${srv.url} | ${srv.followable ? '✅ Yes' : '💬 Text Only'} | ${srv.memberCount ?? '—'} | \`${srv.discoveredVia}\` |`
        );
      }
      lines.push('');
    }

    if (followableList.length > 0) {
      lines.push('### 📣 Followable Club Discord Servers (`#announcements` Enabled)', '');
      lines.push('| Club | Discord Server | Landing Channel | Members | Invite |');
      lines.push('| --- | --- | --- | --- | --- |');
      for (const srv of followableList.slice(0, 50)) {
        const chLabel = srv.landingChannel?.name
          ? `#${srv.landingChannel.name}${srv.landingChannel.isAnnouncementChannel ? ' (📣)' : ''}`
          : '—';
        lines.push(
          `| **${srv.clubName}** | ${srv.serverName || '—'} | ${chLabel} | ${srv.memberCount ?? '—'} | ${srv.url} |`
        );
      }
      lines.push('');
    }

    if (expiredList.length > 0) {
      lines.push('### ⚠️ Expired Club Discord Invites', '');
      for (const srv of expiredList.slice(0, 20)) {
        lines.push(`- **${srv.clubName}** (\`@${srv.instagram}\`): \`${srv.url}\``);
      }
      lines.push('');
    }

    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
    } catch {
      // ignore summary write errors
    }
  }
}

main().catch(err => {
  console.error('Discord server scout failed:', err);
  closeDb();
  process.exit(1);
});
