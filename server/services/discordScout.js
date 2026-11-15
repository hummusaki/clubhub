// ── Automated Club Discord Server Discovery & Followability Scout ──
// Discovers Discord servers for current UCSC clubs and checks whether their #announcements
// channels are followable (`NEWS` / Announcement Channel type 5):
//   1. Extracts Discord invites from `collector/clubs.json`, SQLite `links`, club bios, and post captions.
//   2. Crawls club bio websites, Linktrees, Carrds, Beacons, and `/links` or `/join` subpages to find new invites.
//   3. Searches Discord's public Server Discovery API for public UCSC community servers.
//   4. Queries Discord's public `GET /api/v10/invites/{code}?with_counts=true&with_expiration=true`
//      to inspect `guild.features` (`NEWS` = followable Announcement Channels enabled), landing channel
//      type (`5` = direct Announcement Channel), member/online counts, and invite expiration.
//   5. Cross-references live ClubHub Bot guild membership & synced Discord message counts.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, normalizeClubId, upsertCollectorData } from '../database.js';
import { unpackBioWebsite } from '../../collector/src/enrichWeb.js';
import { getDataSources } from './resourceIngestor.js';
import discordService from './discord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLUBS_JSON_PATH = path.resolve(__dirname, '../../collector/clubs.json');
const SCOUT_CACHE_PATH = path.resolve(__dirname, '../../collector/output/discord-scout-cache.json');
const PUBLIC_SCOUT_PATH = path.resolve(__dirname, '../../public/discord-scout.json');

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const DISCORD_INVITE_GLOBAL_RE =
  /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]{2,36})/gi;
const IGNORED_INVITE_CODES = new Set([
  'invite',
  'login',
  'register',
  'download',
  'nitro',
  'safety',
  'terms',
  'privacy',
  'guidelines',
  'developers',
]);

const VALID_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours for valid invites
const EXPIRED_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours for expired invites

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function slugify(s = '') {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function extractAllDiscordCodes(text = '') {
  if (!text) return [];
  const codes = [];
  const seen = new Set();
  for (const m of String(text).matchAll(DISCORD_INVITE_GLOBAL_RE)) {
    const code = String(m[1] || '').trim();
    const lower = code.toLowerCase();
    if (!code || IGNORED_INVITE_CODES.has(lower) || seen.has(lower)) continue;
    seen.add(lower);
    codes.push(code);
  }
  return codes;
}

function loadScoutCache() {
  try {
    if (fs.existsSync(SCOUT_CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(SCOUT_CACHE_PATH, 'utf8')) || {};
    }
  } catch {
    // ignore corrupt cache
  }
  return {};
}

function saveScoutCache(cacheObj) {
  try {
    fs.mkdirSync(path.dirname(SCOUT_CACHE_PATH), { recursive: true });
    fs.writeFileSync(SCOUT_CACHE_PATH, JSON.stringify(cacheObj, null, 2));
  } catch {
    // ignore write failures
  }
}

function loadClubsJsonFile() {
  try {
    if (fs.existsSync(CLUBS_JSON_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(CLUBS_JSON_PATH, 'utf8'));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

/**
 * Crawl a club's website (and up to 2 high-signal subpages like /links, /join, /social)
 * to discover any `discord.gg/...` or `discord.com/invite/...` URLs.
 */
async function discoverInvitesFromWebsite(websiteUrl) {
  if (!websiteUrl || !/^https?:\/\//i.test(websiteUrl)) return [];
  if (/(?:instagram\.com|tiktok\.com|spotify\.com|facebook\.com)/i.test(websiteUrl)) return [];

  const foundCodes = new Set();

  // 1. Use Linktree / Beacons / Carrd / anchor unpacker first
  try {
    const unpacked = await unpackBioWebsite(websiteUrl);
    for (const item of unpacked) {
      for (const code of extractAllDiscordCodes(item.url)) {
        foundCodes.add(code);
      }
    }
  } catch {
    // ignore
  }

  // 2. Direct HTML scan + 1-hop subpage check (/links, /join, /connect, /discord, /about)
  try {
    const res = await fetch(websiteUrl, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return [...foundCodes];
    const html = await res.text();
    for (const code of extractAllDiscordCodes(html)) {
      foundCodes.add(code);
    }

    if (foundCodes.size === 0 && !/(?:linktr\.ee|beacons\.ai|bento\.me|carrd\.co)/i.test(websiteUrl)) {
      const baseOrigin = new URL(res.url || websiteUrl).origin;
      const subpageCandidates = new Set();
      const hrefRe = /href=["']([^"'#\s>]+)["']/gi;
      for (const m of html.matchAll(hrefRe)) {
        const rawHref = m[1];
        if (!rawHref) continue;
        try {
          const resolved = new URL(rawHref, res.url || websiteUrl);
          if (
            resolved.origin === baseOrigin &&
            /\/(?:links?|join|connect|discord|social|community|contact|get-involved)\b/i.test(
              resolved.pathname
            )
          ) {
            subpageCandidates.add(resolved.toString());
          }
        } catch {
          // ignore invalid href
        }
        if (subpageCandidates.size >= 2) break;
      }

      for (const subUrl of subpageCandidates) {
        try {
          const subRes = await fetch(subUrl, {
            headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
            redirect: 'follow',
            signal: AbortSignal.timeout(6000),
          });
          if (subRes.ok) {
            const subHtml = await subRes.text();
            for (const code of extractAllDiscordCodes(subHtml)) {
              foundCodes.add(code);
            }
          }
        } catch {
          // ignore subpage error
        }
      }
    }
  } catch {
    // ignore fetch error
  }

  return [...foundCodes];
}

/**
 * Query Discord's public Server Discovery search for UCSC-related community guilds
 * that publish a vanity invite code (`vanity_url_code`), and match them to catalog clubs.
 */
async function searchDiscordPublicDiscovery(clubsBySlug) {
  const matchedInvitesByClub = new Map();
  const queries = ['UCSC', 'UC Santa Cruz'];

  for (const q of queries) {
    try {
      const res = await fetch(
        `https://discord.com/api/v10/discovery/search?query=${encodeURIComponent(q)}&limit=48`,
        {
          headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
          signal: AbortSignal.timeout(7000),
        }
      );
      if (!res.ok) continue;
      const body = await res.json().catch(() => ({}));
      const hits = Array.isArray(body?.hits) ? body.hits : [];

      for (const guild of hits) {
        const vanity = guild?.vanity_url_code;
        if (!vanity || !guild?.name) continue;
        const gSlug = slugify(guild.name);
        if (gSlug.length < 4) continue;

        const club = clubsBySlug.get(gSlug);
        if (club) {
          if (!matchedInvitesByClub.has(club.id)) matchedInvitesByClub.set(club.id, new Set());
          matchedInvitesByClub.get(club.id).add(vanity);
        }
      }
    } catch {
      // Public discovery endpoint is best-effort
    }
  }

  return matchedInvitesByClub;
}

/**
 * Inspect a single Discord invite code via `GET /api/v10/invites/{code}?with_counts=true&with_expiration=true`.
 */
async function inspectDiscordInviteCode(code, cache, { forceRefresh = false, offline = false } = {}) {
  const key = String(code || '').trim().toLowerCase();
  if (!key) return null;

  const cached = cache[key];
  const now = Date.now();
  if (cached && !forceRefresh) {
    const ttl = cached.status === 'expired' ? EXPIRED_CACHE_TTL_MS : VALID_CACHE_TTL_MS;
    if (offline || (cached.checkedAtMs && now - cached.checkedAtMs < ttl)) {
      return cached;
    }
  }
  if (offline) {
    return (
      cached || {
        code,
        url: `https://discord.gg/${code}`,
        status: 'unchecked',
        guildId: null,
        serverName: null,
        description: null,
        iconUrl: null,
        features: [],
        hasNewsFeature: false,
        isCommunity: false,
        followable: false,
        landingChannel: null,
        memberCount: null,
        onlineCount: null,
        expiresAt: null,
        checkedAtMs: 0,
      }
    );
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await sleep(320);
      const res = await fetch(
        `https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true&with_expiration=true`,
        {
          headers: { 'user-agent': 'ClubHub (https://github.com/clubhub, 1.0)' },
          signal: AbortSignal.timeout(8500),
        }
      );

      if (res.status === 429) {
        const retryBody = await res.json().catch(() => ({}));
        const retrySec = Number(retryBody.retry_after) || Number(res.headers.get('retry-after')) || 5;
        if (attempt === 1 && retrySec <= 8) {
          await sleep(Math.ceil(retrySec * 1000) + 300);
          continue;
        }
        return cached || null;
      }

      if (res.status === 404 || res.status === 410) {
        const expiredEntry = {
          code,
          url: `https://discord.gg/${code}`,
          status: 'expired',
          guildId: cached?.guildId || null,
          serverName: cached?.serverName || null,
          description: cached?.description || null,
          iconUrl: cached?.iconUrl || null,
          features: cached?.features || [],
          hasNewsFeature: false,
          isCommunity: false,
          followable: false,
          landingChannel: null,
          memberCount: null,
          onlineCount: null,
          expiresAt: null,
          checkedAtMs: Date.now(),
        };
        cache[key] = expiredEntry;
        return expiredEntry;
      }

      if (!res.ok) return cached || null;

      const data = await res.json();
      const guild = data.guild || {};
      const features = Array.isArray(guild.features) ? guild.features : [];
      const hasNewsFeature = features.includes('NEWS');
      const isCommunity = features.includes('COMMUNITY');
      const chType = data.channel?.type ?? null;
      const isDirectAnnouncementInvite = chType === 5;
      // Discord servers with the `NEWS` feature support followable megaphone Announcement Channels (`type: 5`)
      const followable = Boolean(hasNewsFeature || isDirectAnnouncementInvite);
      const iconHash = guild.icon || null;
      const iconExt = iconHash && String(iconHash).startsWith('a_') ? 'gif' : 'png';
      const iconUrl =
        guild.id && iconHash
          ? `https://cdn.discordapp.com/icons/${guild.id}/${iconHash}.${iconExt}?size=128`
          : null;

      const validEntry = {
        code: data.code || code,
        url: `https://discord.gg/${data.code || code}`,
        status: 'valid',
        guildId: guild.id || null,
        serverName: guild.name || null,
        description: guild.description || null,
        vanityUrlCode: guild.vanity_url_code || null,
        iconUrl,
        features,
        hasNewsFeature,
        isCommunity,
        followable,
        landingChannel: data.channel
          ? {
              id: data.channel.id || null,
              name: data.channel.name || null,
              type: chType,
              isAnnouncementChannel: isDirectAnnouncementInvite,
            }
          : null,
        memberCount: data.approximate_member_count ?? null,
        onlineCount: data.approximate_presence_count ?? null,
        expiresAt: data.expires_at || null,
        checkedAtMs: Date.now(),
      };
      cache[key] = validEntry;
      return validEntry;
    } catch {
      if (attempt === 2) return cached || null;
    }
  }
  return cached || null;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) break;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Collect all known clubs + candidate Discord invite codes + website URLs from SQLite and `clubs.json`.
 */
function buildClubCandidateMap() {
  const db = getDb();
  const fileClubs = loadClubsJsonFile();
  const dbClubs = db
    .stmt("SELECT id, name, instagram, bio, website, email, category FROM clubs WHERE id NOT LIKE 'demo_%'")
    .all();

  const clubsMap = new Map();
  for (const fc of fileClubs) {
    const cid = normalizeClubId(fc.instagram || fc.id);
    if (!cid || cid.startsWith('demo_')) continue;
    const cleanIg =
      fc.instagram && !/^(?:noig_|discord_)/i.test(String(fc.instagram)) ? fc.instagram : '';
    clubsMap.set(cid.toLowerCase(), {
      id: cid,
      name: fc.name || cid,
      instagram: cleanIg,
      category: fc.category || null,
      email: fc.email || null,
      bio: '',
      websites: new Set([fc.website].filter(Boolean)),
      codes: new Map(), // lowerCode -> { code, discoveredVia }
      alsoKnownAs: Array.isArray(fc.alsoKnownAs) ? fc.alsoKnownAs : [],
    });
    for (const code of extractAllDiscordCodes(fc.discord || '')) {
      clubsMap.get(cid.toLowerCase()).codes.set(code.toLowerCase(), {
        code,
        discoveredVia: 'ucsc_directory',
      });
    }
  }

  for (const dc of dbClubs) {
    const cid = normalizeClubId(dc.id || dc.instagram);
    if (!cid || cid.startsWith('demo_') || cid === 'media') continue;
    const key = cid.toLowerCase();
    const cleanDcIg =
      dc.instagram && !/^(?:noig_|discord_)/i.test(String(dc.instagram)) ? dc.instagram : '';
    if (!clubsMap.has(key)) {
      clubsMap.set(key, {
        id: cid,
        name: dc.name || cid,
        instagram: cleanDcIg,
        category: dc.category || null,
        email: dc.email || null,
        bio: dc.bio || '',
        websites: new Set(),
        codes: new Map(),
        alsoKnownAs: [],
      });
    }
    const entry = clubsMap.get(key);
    if (dc.name && (!entry.name || entry.name === entry.id)) entry.name = dc.name;
    if (dc.bio) entry.bio = dc.bio;
    if (dc.website) entry.websites.add(dc.website);
    for (const code of extractAllDiscordCodes(`${dc.bio || ''} ${dc.website || ''}`)) {
      if (!entry.codes.has(code.toLowerCase())) {
        entry.codes.set(code.toLowerCase(), { code, discoveredVia: 'instagram_bio' });
      }
    }
  }

  // Scan SQLite `links` table (Discord invites + Linktrees/club websites to crawl)
  const allLinks = db
    .stmt("SELECT clubId, url, kind FROM links WHERE clubId NOT LIKE 'demo_%'")
    .all();
  for (const row of allLinks) {
    const entry = clubsMap.get(normalizeClubId(row.clubId).toLowerCase());
    if (!entry || !row.url) continue;
    const codes = extractAllDiscordCodes(row.url);
    if (codes.length > 0) {
      for (const code of codes) {
        if (!entry.codes.has(code.toLowerCase())) {
          entry.codes.set(code.toLowerCase(), { code, discoveredVia: 'club_links' });
        }
      }
    } else if (
      row.kind === 'linktree' ||
      row.kind === 'website' ||
      /(?:linktr\.ee|beacons\.ai|bento\.me|carrd\.co)/i.test(row.url)
    ) {
      entry.websites.add(row.url);
    }
  }

  // Scan SQLite `posts.caption` for any Discord invite codes mentioned in post captions
  const postRows = db
    .stmt(
      "SELECT clubId, caption FROM posts WHERE (caption LIKE '%discord.gg/%' OR caption LIKE '%discord.com/invite/%') AND clubId NOT LIKE 'demo_%'"
    )
    .all();
  for (const row of postRows) {
    const entry = clubsMap.get(normalizeClubId(row.clubId).toLowerCase());
    if (!entry) continue;
    for (const code of extractAllDiscordCodes(row.caption)) {
      if (!entry.codes.has(code.toLowerCase())) {
        entry.codes.set(code.toLowerCase(), { code, discoveredVia: 'post_caption' });
      }
    }
  }

  return clubsMap;
}

/**
 * Overlay live SQLite Discord sync counts and Bot guild membership onto a list of scouted servers.
 */
async function enrichServersWithLiveSyncState(servers, { checkBotLive = false } = {}) {
  const db = getDb();
  const postCounts = new Map(
    db
      .stmt("SELECT lower(clubId) AS cid, COUNT(*) AS c FROM posts WHERE source = 'discord' GROUP BY lower(clubId)")
      .all()
      .map(r => [r.cid, r.c])
  );
  const mappedClubIds = new Set(
    getDataSources({ platform: 'discord' })
      .map(s => normalizeClubId(s.clubId).toLowerCase())
      .filter(Boolean)
  );

  let botGuildIds = new Set();
  let botAnnouncementChannelsByGuild = new Map();
  if (checkBotLive) {
    try {
      const dStatus = await discordService.getStatus({ forceRefresh: false });
      for (const g of dStatus?.guilds || []) {
        botGuildIds.add(g.id);
      }
      for (const ch of dStatus?.channels || []) {
        if (ch.type === 5 && ch.guildId) {
          if (!botAnnouncementChannelsByGuild.has(ch.guildId)) {
            botAnnouncementChannelsByGuild.set(ch.guildId, []);
          }
          botAnnouncementChannelsByGuild.get(ch.guildId).push({
            id: ch.id,
            name: ch.name,
          });
        }
      }
    } catch {
      // ignore bot status errors
    }
  }

  return servers.map(srv => {
    const cidLower = String(srv.clubId || '').toLowerCase();
    const syncedPosts = postCounts.get(cidLower) || 0;
    const isMappedSource = mappedClubIds.has(cidLower);
    const botInGuild = Boolean(srv.guildId && botGuildIds.has(srv.guildId));
    const botAnnouncementChannels =
      (srv.guildId && botAnnouncementChannelsByGuild.get(srv.guildId)) || [];

    let syncState = 'unverified';
    if (srv.status === 'expired') {
      syncState = 'expired';
    } else if (botInGuild) {
      syncState = 'bot_connected';
    } else if (syncedPosts > 0 || isMappedSource) {
      syncState = 'synced';
    } else if (srv.status === 'valid' && srv.followable) {
      syncState = 'followable';
    } else if (srv.status === 'valid') {
      syncState = 'standard';
    }

    return {
      ...srv,
      syncedPosts,
      isMappedSource,
      botInGuild,
      botAnnouncementChannels,
      syncState,
    };
  });
}

function summarizeServers(servers) {
  let validServers = 0;
  let followableServers = 0;
  let syncedOrBotServers = 0;
  let standardServers = 0;
  let expiredInvites = 0;
  let newlyDiscovered = 0;

  for (const s of servers) {
    if (s.isNewlyDiscovered) newlyDiscovered++;
    if (s.status === 'expired') {
      expiredInvites++;
      continue;
    }
    if (s.status === 'valid') validServers++;
    if (s.followable) followableServers++;
    if (s.syncState === 'bot_connected' || s.syncState === 'synced') syncedOrBotServers++;
    else if (s.status === 'valid' && !s.followable) standardServers++;
  }

  return {
    totalClubsWithDiscord: new Set(servers.filter(s => s.status !== 'expired').map(s => s.clubId)).size,
    totalInvitesChecked: servers.length,
    validServers,
    followableServers,
    syncedOrBotServers,
    standardServers,
    expiredInvites,
    newlyDiscovered,
  };
}

/**
 * Fast read of scouted Discord servers (merges `public/discord-scout.json` + SQLite `links` + live sync counts)
 * without waiting on external HTTP crawls.
 */
export async function getScoutedDiscordServers({ checkBotLive = true } = {}) {
  const cache = loadScoutCache();
  const clubsMap = buildClubCandidateMap();
  const rawServers = [];
  const seenClubGuild = new Set();

  // Also merge any previously exported `public/discord-scout.json` metadata
  let prevScoutedAt = null;
  if (fs.existsSync(PUBLIC_SCOUT_PATH)) {
    try {
      const saved = JSON.parse(fs.readFileSync(PUBLIC_SCOUT_PATH, 'utf8'));
      prevScoutedAt = saved?.scoutedAt || null;
      for (const s of saved?.servers || []) {
        if (s?.code && !cache[s.code.toLowerCase()]) {
          cache[s.code.toLowerCase()] = s;
        }
      }
    } catch {
      // ignore
    }
  }

  for (const club of clubsMap.values()) {
    for (const { code, discoveredVia } of club.codes.values()) {
      const meta = await inspectDiscordInviteCode(code, cache, { offline: true });
      const dedupeKey = `${club.id.toLowerCase()}:${meta.guildId || code.toLowerCase()}`;
      if (seenClubGuild.has(dedupeKey)) continue;
      seenClubGuild.add(dedupeKey);

      rawServers.push({
        clubId: club.id,
        clubName: club.name,
        instagram: club.instagram,
        category: club.category,
        discoveredVia,
        isNewlyDiscovered: false,
        ...meta,
      });
    }
  }

  const enriched = await enrichServersWithLiveSyncState(rawServers, { checkBotLive });
  enriched.sort((a, b) => {
    const rank = s =>
      s.syncState === 'bot_connected'
        ? 0
        : s.syncState === 'synced'
          ? 1
          : s.syncState === 'followable'
            ? 2
            : s.syncState === 'standard'
              ? 3
              : s.syncState === 'unverified'
                ? 4
                : 5;
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return (b.memberCount || 0) - (a.memberCount || 0) || a.clubName.localeCompare(b.clubName);
  });

  return {
    scoutedAt: prevScoutedAt,
    summary: summarizeServers(enriched),
    servers: enriched,
  };
}

/**
 * Full multi-vector discovery & Discord API scout:
 *   - Crawls club bio websites/Linktrees/subpages for undiscovered Discord invites
 *   - Searches Discord public discovery for UCSC servers
 *   - Queries `GET /api/v10/invites/{code}` for `NEWS` followability, channel info, and member counts
 *   - Persists newly discovered valid links to SQLite, `collector/clubs.json`, and `public/discord-scout.json`
 */
export async function scoutClubDiscordServers({
  crawlWebsites = true,
  forceCrawlAll = false,
  searchPublicDiscovery = true,
  forceRefreshInvites = false,
  offline = false,
  persistCatalog = true,
  writePublicJson = true,
  websiteConcurrency = 5,
} = {}) {
  const cache = loadScoutCache();
  const clubsMap = buildClubCandidateMap();

  // Track which codes already existed before web/discovery crawling
  const preExistingCodes = new Set();
  for (const club of clubsMap.values()) {
    for (const codeKey of club.codes.keys()) {
      preExistingCodes.add(`${club.id.toLowerCase()}:${codeKey}`);
    }
  }

  // 1. Crawl club bio websites / Linktrees / subpages to discover NEW Discord servers
  if (crawlWebsites && !offline) {
    const crawlTargets = [];
    for (const club of clubsMap.values()) {
      if (!forceCrawlAll && club.codes.size > 0) {
        // Still crawl if all known codes for this club are known-expired in cache
        const allExpired = [...club.codes.keys()].every(k => cache[k]?.status === 'expired');
        if (!allExpired) continue;
      }
      for (const siteUrl of club.websites) {
        crawlTargets.push({ club, siteUrl });
      }
    }

    await mapWithConcurrency(crawlTargets, websiteConcurrency, async ({ club, siteUrl }) => {
      const discovered = await discoverInvitesFromWebsite(siteUrl);
      for (const code of discovered) {
        if (!club.codes.has(code.toLowerCase())) {
          club.codes.set(code.toLowerCase(), { code, discoveredVia: 'website_crawl' });
        }
      }
    });
  }

  // 2. Search Discord Public Guild Discovery for UCSC servers
  if (searchPublicDiscovery && !offline) {
    const clubsBySlug = new Map();
    for (const club of clubsMap.values()) {
      for (const label of [club.id, club.name, ...(club.alsoKnownAs || [])]) {
        const s = slugify(label);
        if (s.length >= 4 && !clubsBySlug.has(s)) clubsBySlug.set(s, club);
      }
    }
    const pubMatches = await searchDiscordPublicDiscovery(clubsBySlug);
    for (const [clubId, vanityCodes] of pubMatches.entries()) {
      const entry = clubsMap.get(clubId.toLowerCase());
      if (!entry) continue;
      for (const code of vanityCodes) {
        if (!entry.codes.has(code.toLowerCase())) {
          entry.codes.set(code.toLowerCase(), { code, discoveredVia: 'discord_discovery' });
        }
      }
    }
  }

  // 3. Inspect every candidate invite against Discord's Invite API
  const rawServers = [];
  const seenClubGuild = new Set();
  const newLinksToUpsert = [];
  const bestValidByClub = new Map();

  for (const club of clubsMap.values()) {
    for (const { code, discoveredVia } of club.codes.values()) {
      const meta = await inspectDiscordInviteCode(code, cache, {
        forceRefresh: forceRefreshInvites,
        offline,
      });
      if (!meta) continue;

      const dedupeKey = `${club.id.toLowerCase()}:${meta.guildId || code.toLowerCase()}`;
      if (seenClubGuild.has(dedupeKey)) continue;
      seenClubGuild.add(dedupeKey);

      const isNewlyDiscovered = !preExistingCodes.has(`${club.id.toLowerCase()}:${code.toLowerCase()}`);
      const serverRecord = {
        clubId: club.id,
        clubName: club.name,
        instagram: club.instagram,
        category: club.category,
        discoveredVia,
        isNewlyDiscovered,
        ...meta,
      };
      rawServers.push(serverRecord);

      if (meta.status === 'valid') {
        const prevBest = bestValidByClub.get(club.id.toLowerCase());
        if (!prevBest || (meta.memberCount || 0) > (prevBest.memberCount || 0)) {
          bestValidByClub.set(club.id.toLowerCase(), serverRecord);
        }
        if (isNewlyDiscovered) {
          newLinksToUpsert.push({
            id: `${club.id}:${meta.url}`,
            clubId: club.id,
            clubName: club.name,
            url: meta.url,
            label: meta.serverName ? `${meta.serverName} Discord` : `${club.name} Discord`,
            kind: 'discord',
            postId: null,
          });
        }
      }
    }
  }

  if (!offline) {
    saveScoutCache(cache);
  }

  // 4. Upsert newly discovered Discord links into SQLite
  if (newLinksToUpsert.length > 0) {
    upsertCollectorData({
      clubs: [],
      posts: [],
      events: [],
      announcements: [],
      links: newLinksToUpsert,
    });
  }

  // 5. Enrich `collector/clubs.json` with discovered `discord`, `discordGuildId`, and `discordFollowable`
  if (persistCatalog && bestValidByClub.size > 0 && fs.existsSync(CLUBS_JSON_PATH)) {
    try {
      const fileClubs = JSON.parse(fs.readFileSync(CLUBS_JSON_PATH, 'utf8'));
      let changed = false;
      for (const fc of fileClubs) {
        const cid = normalizeClubId(fc.instagram || fc.id).toLowerCase();
        const best = bestValidByClub.get(cid);
        if (!best) continue;
        if (fc.discord !== best.url) {
          fc.discord = best.url;
          changed = true;
        }
        if (best.guildId && fc.discordGuildId !== best.guildId) {
          fc.discordGuildId = best.guildId;
          changed = true;
        }
        if (best.serverName && fc.discordServerName !== best.serverName) {
          fc.discordServerName = best.serverName;
          changed = true;
        }
        if (fc.discordFollowable !== Boolean(best.followable)) {
          fc.discordFollowable = Boolean(best.followable);
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(CLUBS_JSON_PATH, `${JSON.stringify(fileClubs, null, 2)}\n`);
      }
    } catch (err) {
      console.warn('[DiscordScout] Could not update collector/clubs.json:', err.message);
    }
  }

  const enriched = await enrichServersWithLiveSyncState(rawServers, { checkBotLive: !offline });
  enriched.sort((a, b) => {
    const rank = s =>
      s.syncState === 'bot_connected'
        ? 0
        : s.syncState === 'synced'
          ? 1
          : s.syncState === 'followable'
            ? 2
            : s.syncState === 'standard'
              ? 3
              : s.syncState === 'unverified'
                ? 4
                : 5;
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return (b.memberCount || 0) - (a.memberCount || 0) || a.clubName.localeCompare(b.clubName);
  });

  const scoutedAt = new Date().toISOString();
  const report = {
    scoutedAt,
    summary: summarizeServers(enriched),
    servers: enriched,
  };

  if (writePublicJson) {
    try {
      fs.mkdirSync(path.dirname(PUBLIC_SCOUT_PATH), { recursive: true });
      // Strip internal bot channel IDs before writing the public static JSON snapshot
      const publicReport = {
        scoutedAt,
        summary: report.summary,
        servers: enriched.map(({ botAnnouncementChannels, ...pub }) => pub),
      };
      fs.writeFileSync(PUBLIC_SCOUT_PATH, JSON.stringify(publicReport, null, 2));
    } catch (err) {
      console.warn('[DiscordScout] Could not write public/discord-scout.json:', err.message);
    }
  }

  return report;
}
