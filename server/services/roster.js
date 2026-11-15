// ── Club Roster & Official UCSC Directory Sync Service ──
// Collects per-club leadership, officers, spotlighted members, Discord/Instagram member counts,
// and official UCSC SOMeCA contacts alongside each club and upserts them into SQLite.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getAllCollectorData,
  normalizeClubId,
  upsertCollectorData,
} from '../database.js';
import { collectRosters } from '../../collector/src/roster.js';
import { updateClubsCatalog } from '../../collector/src/update-clubs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.resolve(__dirname, '../../collector/clubs.json');

function loadMergedClubsForRoster(dbClubs = [], targetClubId = null) {
  let catalog = [];
  try {
    if (fs.existsSync(CATALOG_PATH)) {
      catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    }
  } catch {
    catalog = [];
  }

  const catalogById = new Map(
    catalog.map(c => [String(c.instagram || c.id || '').toLowerCase(), c])
  );
  const dbById = new Map(
    dbClubs.map(c => [String(c.id || c.instagram || '').toLowerCase(), c])
  );

  const allKeys = new Set([...dbById.keys(), ...catalogById.keys()]);
  const merged = [];

  for (const key of allKeys) {
    if (!key || key.startsWith('demo_') || key === 'media') continue;
    if (targetClubId && key !== targetClubId.toLowerCase()) continue;

    const dbClub = dbById.get(key) || {};
    const catClub = catalogById.get(key) || {};
    const rawIg = dbClub.instagram ?? catClub.instagram ?? '';
    const cleanIg =
      rawIg && !/^(?:noig_|discord_)/i.test(String(rawIg)) ? String(rawIg).trim() : '';
    merged.push({
      ...catClub,
      ...dbClub,
      id: dbClub.id || catClub.id || catClub.instagram || key,
      name: catClub.name || dbClub.name || key,
      instagram: cleanIg,
      ...(cleanIg ? {} : { noInstagram: true }),
      profilePictureUrl: dbClub.profilePictureUrl || catClub.iconUrl || null,
      email: catClub.email || dbClub.email || null,
      extraEmails: catClub.extraEmails || [],
      discord: catClub.discord || dbClub.discord || null,
      website: dbClub.website || catClub.website || null,
      orgStatus: catClub.orgStatus || dbClub.orgStatus || 'active',
      orgStatusNote: catClub.orgStatusNote || dbClub.orgStatusNote || null,
      directoryDescription: catClub.description || dbClub.directoryDescription || null,
    });
  }

  return merged;
}

export async function syncRoster({
  clubId = null,
  refreshDirectory = false,
  crawlWebsites = true,
  refreshDiscordCounts = true,
  websiteConcurrency = 6,
} = {}) {
  let directoryResult = null;
  if (refreshDirectory && !clubId) {
    try {
      directoryResult = await updateClubsCatalog();
    } catch (err) {
      console.warn('⚠️ UCSC directory refresh skipped (using existing collector/clubs.json):', err.message);
    }
  }

  const cleanClubId = clubId ? normalizeClubId(clubId) : null;
  const current = getAllCollectorData(cleanClubId ? { clubId: cleanClubId } : {});
  const clubsToCheck = loadMergedClubsForRoster(current.clubs, cleanClubId);

  const result = await collectRosters({
    clubs: clubsToCheck,
    posts: current.posts || [],
    links: current.links || [],
    crawlWebsites,
    refreshDiscordCounts,
    websiteConcurrency,
  });

  const dbRes = upsertCollectorData(
    {
      collectedAt: result.rosterUpdatedAt,
      clubs: result.clubs,
      roster: result.roster,
    },
    { replaceRosterForClubs: true }
  );

  return {
    platform: 'roster',
    rosterUpdatedAt: result.rosterUpdatedAt,
    directory: directoryResult,
    summary: result.summary,
    upserted: dbRes.upserted,
  };
}

export default {
  syncRoster,
};
