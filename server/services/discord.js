// ── Discord Announcements Ingestion Service ──
// Connects Discord server #announcements channels to the ClubHub SQLite database.
//
// Supports 3 zero-ban live modes when DISCORD_BOT_TOKEN is set:
//   1. Aggregator Server ("Follow Channel" mode): set DISCORD_AGGREGATOR_GUILD_ID to your own
//      ClubHub Discord server ID and click "Follow" on any UCSC club's #announcements channel.
//   2. Per-Club Channel Mapping: set DISCORD_CHANNEL_MAP="clubHandle:channelId,..." in .env,
//      add "discordChannelId" to collector/clubs.json, or connect channels in the dashboard UI.
//   3. Direct API / Incoming Webhook push: POST /api/webhooks/discord or syncDiscord({ clubId, channelId }).
// Falls back to built-in UCSC demo messages when DISCORD_BOT_TOKEN is not configured.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, formatPostRow, normalizeClubId } from '../database.js';
import { ingestResourceItem, getDataSources } from './resourceIngestor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLUBS_JSON_PATH = path.resolve(__dirname, '../../collector/clubs.json');
const DISCORD_API_BASE = 'https://discord.com/api/v10';

const DEMO_DISCORD_MESSAGES = [
  {
    id: 'discord_cs_msg_1',
    clubId: 'demo_ucsc_csclub',
    clubName: 'Computer Science Club',
    identifier: 'https://discord.gg/demoCSclub',
    title: 'Hackathon Team Formation & Pizza Social',
    caption:
      'Hackathon team formation & pizza social this Friday at 5:00pm in Baskin Engineering 152! Join our Discord: https://discord.gg/demoCSclub',
    permalink: 'https://discord.gg/demoCSclub',
  },
  {
    id: 'discord_debate_msg_1',
    clubId: 'demo_ucsc_debate',
    clubName: 'Debate Society',
    identifier: 'https://discord.gg/ucscdebate',
    title: 'Thursday Practice Motion Posted',
    caption:
      'Motion for Thursday 4:30pm practice in Humanities 1 room 110 is now posted in #motions! Sign up form: https://discord.gg/ucscdebate',
    permalink: 'https://discord.gg/ucscdebate',
  },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Parse a Discord channel identifier from raw snowflake, "channel:123", or
 * full URL "https://discord.com/channels/<guildId>/<channelId>".
 */
export function parseDiscordIdentifier(raw = '', config = {}) {
  const str = String(config?.channelId || raw || '').trim();
  const urlMatch = str.match(/discord\.com\/channels\/(\d+|@me)\/(\d{15,22})/i);
  if (urlMatch) {
    return {
      guildId: urlMatch[1] === '@me' ? null : urlMatch[1],
      channelId: urlMatch[2],
      inviteUrl: config?.inviteUrl || null,
    };
  }
  const chanPrefix = str.match(/^(?:channel:)?(\d{15,22})$/);
  if (chanPrefix) {
    return {
      guildId: config?.guildId || null,
      channelId: chanPrefix[1],
      inviteUrl: config?.inviteUrl || (/discord\.(?:gg|com\/invite)/i.test(raw) ? raw : null),
    };
  }
  return {
    guildId: config?.guildId || null,
    channelId: null,
    inviteUrl: /discord\.(?:gg|com\/invite)/i.test(str) ? str : config?.inviteUrl || null,
  };
}

/**
 * Convert Discord markdown, mentions, and <t:UNIX:style> timestamps into clean text
 * that collector/src/extract.js (chrono-node) parses accurately.
 */
export function cleanDiscordText(raw = '') {
  if (!raw) return '';

  let text = String(raw);

  // Convert Discord Unix timestamps <t:1731630000:F> -> readable Pacific date/time
  text = text.replace(/<t:(\d{9,11})(?::([tTdDfFR]))?>/g, (_, sec, style) => {
    const dt = new Date(Number(sec) * 1000);
    if (Number.isNaN(dt.getTime())) return _;
    const tz = 'America/Los_Angeles';
    if (style === 't' || style === 'T') {
      return dt.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
    }
    if (style === 'd' || style === 'D') {
      return dt.toLocaleDateString('en-US', {
        timeZone: tz,
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
    return dt.toLocaleString('en-US', {
      timeZone: tz,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  });

  // Strip @everyone/@here, user/role mentions, channel mentions, custom emojis, and heavy markdown
  return text
    .replace(/@(?:everyone|here)\b/g, '')
    .replace(/<@!?\d+>/g, '')
    .replace(/<@&\d+>/g, '')
    .replace(/<#\d+>/g, '#channel')
    .replace(/<a?:([a-zA-Z0-9_]+):\d+>/g, '')
    .replace(/\*\*|__|~~|\|\|/g, '')
    .replace(/^>>>\s?/gm, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function loadClubsCatalog() {
  let fileClubs = [];
  try {
    if (fs.existsSync(CLUBS_JSON_PATH)) {
      fileClubs = JSON.parse(fs.readFileSync(CLUBS_JSON_PATH, 'utf8'));
    }
  } catch {
    fileClubs = [];
  }

  let dbClubs = [];
  try {
    dbClubs = getDb().stmt('SELECT id, name, instagram, alsoKnownAs FROM clubs').all();
  } catch {
    dbClubs = [];
  }

  const byId = new Map();
  for (const c of fileClubs) {
    const cid = normalizeClubId(c.instagram || c.id);
    if (!cid) continue;
    byId.set(cid.toLowerCase(), {
      id: cid,
      name: c.name || cid,
      alsoKnownAs: Array.isArray(c.alsoKnownAs) ? c.alsoKnownAs : [],
      discordChannelId: c.discordChannelId || null,
      discordInvite: c.discord || c.discordInvite || null,
    });
  }
  for (const c of dbClubs) {
    const cid = normalizeClubId(c.id || c.instagram);
    if (!cid || byId.has(cid.toLowerCase())) continue;
    let aka = [];
    try {
      aka = JSON.parse(c.alsoKnownAs || '[]');
    } catch {
      aka = [];
    }
    byId.set(cid.toLowerCase(), {
      id: cid,
      name: c.name || cid,
      alsoKnownAs: Array.isArray(aka) ? aka : [],
      discordChannelId: null,
      discordInvite: null,
    });
  }

  return [...byId.values()];
}

function slugify(s = '') {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Match a followed/crossposted Discord message or aggregator channel back to a ClubHub clubId.
 */
export function matchClubFromDiscordContext(
  { explicitClubId, channelName, channelTopic, webhookAuthor, originChannelId } = {},
  catalog = []
) {
  if (explicitClubId) {
    const cid = normalizeClubId(explicitClubId);
    const found = catalog.find(c => c.id.toLowerCase() === cid.toLowerCase());
    return { clubId: found ? found.id : cid, clubName: found?.name || null };
  }

  // 1. Origin channel ID match from clubs.json
  if (originChannelId) {
    const byChan = catalog.find(c => String(c.discordChannelId || '') === String(originChannelId));
    if (byChan) return { clubId: byChan.id, clubName: byChan.name };
  }

  // 2. Explicit @handle or instagram.com/handle inside channel topic
  if (channelTopic) {
    const igUrlMatch = channelTopic.match(/instagram\.com\/([a-zA-Z0-9._]+)/i);
    const handleMatch =
      igUrlMatch || channelTopic.match(/(?:clubId\s*[:=]\s*|@)([a-zA-Z0-9._]{3,30})/i);
    if (handleMatch) {
      const candidate = normalizeClubId(handleMatch[1]);
      const found = catalog.find(c => c.id.toLowerCase() === candidate.toLowerCase());
      return { clubId: found ? found.id : candidate, clubName: found?.name || null };
    }
  }

  // 3. Match Followed Announcement Channel webhook author ("Club Server Name #announcements")
  //    or aggregator channel name ("#ucsc-cs-club" / "#8thrankchess")
  const candidates = [];
  if (webhookAuthor) {
    candidates.push(String(webhookAuthor).split('#')[0].trim());
  }
  if (channelName && !/^(announcements?|general|updates?|events?|welcome)$/i.test(channelName)) {
    candidates.push(channelName);
  }

  for (const rawCandidate of candidates) {
    const targetSlug = slugify(rawCandidate);
    if (targetSlug.length < 3) continue;

    // Exact handle or name slug match first
    for (const club of catalog) {
      const slugs = [club.id, club.name, ...(club.alsoKnownAs || [])].map(slugify).filter(Boolean);
      if (slugs.includes(targetSlug)) {
        return { clubId: club.id, clubName: club.name };
      }
    }

    // Substring match (e.g. "UCSC Debate Society" <-> "Debate Society")
    for (const club of catalog) {
      const nameSlug = slugify(club.name);
      const idSlug = slugify(club.id);
      if (
        (nameSlug.length >= 6 && (targetSlug.includes(nameSlug) || nameSlug.includes(targetSlug))) ||
        (idSlug.length >= 5 && (targetSlug.includes(idSlug) || idSlug.includes(targetSlug)))
      ) {
        return { clubId: club.id, clubName: club.name };
      }
    }
  }

  // Fallback slug if webhookAuthor has a server name not yet in clubs.json
  if (webhookAuthor && webhookAuthor.includes('#')) {
    const serverTitle = webhookAuthor.split('#')[0].trim();
    const fallbackId = serverTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (fallbackId) return { clubId: `discord_${fallbackId}`, clubName: serverTitle };
  }

  return { clubId: null, clubName: null };
}

/**
 * Extract structured caption, title, image flyer, and permalink from a Discord API message object.
 */
export function parseDiscordMessage(msg, { guildId = null, channelId = null, fallbackUrl = null } = {}) {
  if (!msg || typeof msg !== 'object') return null;
  // Allow default messages (0) and replies (19); skip join/pin/boost system notices
  if (msg.type !== undefined && msg.type !== 0 && msg.type !== 19) return null;

  const parts = [];
  if (msg.content) parts.push(cleanDiscordText(msg.content));

  let embedTitle = null;
  let embedImage = null;

  if (Array.isArray(msg.embeds)) {
    for (const emb of msg.embeds) {
      if (!embedTitle && emb.title) embedTitle = cleanDiscordText(emb.title);
      if (emb.title) parts.push(cleanDiscordText(emb.title));
      if (emb.description) parts.push(cleanDiscordText(emb.description));
      if (Array.isArray(emb.fields)) {
        for (const f of emb.fields) {
          if (f?.name || f?.value) {
            parts.push(cleanDiscordText(`${f.name || ''}: ${f.value || ''}`));
          }
        }
      }
      if (emb.url && !parts.some(p => p.includes(emb.url))) {
        parts.push(emb.url);
      }
      if (!embedImage) {
        embedImage = emb.image?.url || emb.thumbnail?.url || null;
      }
    }
  }

  let attachmentImage = null;
  if (Array.isArray(msg.attachments)) {
    for (const att of msg.attachments) {
      const isImg =
        att.content_type?.startsWith('image/') ||
        /\.(png|jpe?g|webp|gif)(\?|$)/i.test(att.url || '');
      if (isImg && !attachmentImage) {
        attachmentImage = att.url;
      }
    }
  }

  const combinedText = parts.filter(Boolean).join('\n').trim();
  const imageUrl = attachmentImage || embedImage || null;
  if (!combinedText && !imageUrl) return null;

  // Prefer linking to the original club server message if crossposted via "Follow Channel"
  const ref = msg.message_reference;
  let permalink = fallbackUrl || null;
  if (ref?.guild_id && ref?.channel_id && ref?.message_id) {
    permalink = `https://discord.com/channels/${ref.guild_id}/${ref.channel_id}/${ref.message_id}`;
  } else if (guildId && channelId && msg.id) {
    permalink = `https://discord.com/channels/${guildId}/${channelId}/${msg.id}`;
  }

  return {
    id: `discord_${msg.id}`,
    title: embedTitle || undefined,
    caption: combinedText || 'Announcement flyer posted on Discord',
    imageUrl,
    permalink,
    postedAt: msg.timestamp || new Date().toISOString(),
    webhookAuthor: msg.webhook_id ? msg.author?.username || null : null,
    originChannelId: ref?.channel_id || null,
  };
}

async function discordFetch(endpoint, token) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${DISCORD_API_BASE}${endpoint}`, {
      headers: {
        Authorization: `Bot ${token}`,
        'User-Agent': 'ClubHubBot (https://github.com/clubhub, 1.0)',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 429 && attempt < 3) {
      const body = await res.json().catch(() => ({}));
      const waitMs = Math.ceil((Number(body.retry_after) || 1.5) * 1000) + 250;
      await sleep(waitMs);
      continue;
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Discord API ${res.status} on ${endpoint}: ${errBody.slice(0, 180)}`);
    }

    return res.json();
  }
  throw new Error(`Discord API rate-limited on ${endpoint}`);
}

export class DiscordService {
  /**
   * Gather all configured Discord channels from:
   *  - explicit args ({ clubId, channelId })
   *  - DISCORD_CHANNEL_MAP env var ("clubHandle:channelId,clubHandle2:channelId2")
   *  - collector/clubs.json entries with "discordChannelId"
   *  - registered Discord sources in dictionary_store (POST /api/sources)
   *  - DISCORD_AGGREGATOR_GUILD_ID env var (reads all text/news channels in your aggregator server)
   */
  async discoverTargets({ clubId = null, channelId = null, token = null } = {}) {
    const catalog = loadClubsCatalog();
    const targets = new Map(); // channelId -> { channelId, clubId, clubName, guildId, channelName, channelTopic, inviteUrl }
    const filterCid = clubId ? normalizeClubId(clubId).toLowerCase() : null;

    const addTarget = entry => {
      if (!entry?.channelId) return;
      if (filterCid && entry.clubId && entry.clubId.toLowerCase() !== filterCid) return;
      const prev = targets.get(entry.channelId) || {};
      targets.set(entry.channelId, {
        channelId: String(entry.channelId),
        clubId: entry.clubId || prev.clubId || null,
        clubName: entry.clubName || prev.clubName || null,
        guildId: entry.guildId || prev.guildId || null,
        channelName: entry.channelName || prev.channelName || null,
        channelTopic: entry.channelTopic || prev.channelTopic || null,
        inviteUrl: entry.inviteUrl || prev.inviteUrl || null,
      });
    };

    // 1. Explicit call parameter
    if (channelId) {
      const parsed = parseDiscordIdentifier(channelId);
      if (parsed.channelId) {
        addTarget({
          channelId: parsed.channelId,
          guildId: parsed.guildId,
          clubId: clubId ? normalizeClubId(clubId) : null,
        });
      }
    }

    // 2. DISCORD_CHANNEL_MAP env ("ucsc_csclub:123456789012345678,ucscdebate:234567890123456789")
    const envMap = (process.env.DISCORD_CHANNEL_MAP || '').trim();
    if (envMap) {
      for (const pair of envMap.split(',')) {
        const [rawClub, rawChan] = pair.split(':').map(s => (s || '').trim());
        if (rawClub && /^\d{15,22}$/.test(rawChan)) {
          const cid = normalizeClubId(rawClub);
          const clubEntry = catalog.find(c => c.id.toLowerCase() === cid.toLowerCase());
          addTarget({
            channelId: rawChan,
            clubId: clubEntry ? clubEntry.id : cid,
            clubName: clubEntry?.name || null,
          });
        }
      }
    }

    // 3. collector/clubs.json entries with discordChannelId
    for (const club of catalog) {
      const rawChans = Array.isArray(club.discordChannelId)
        ? club.discordChannelId
        : club.discordChannelId
          ? [club.discordChannelId]
          : [];
      for (const ch of rawChans) {
        const parsed = parseDiscordIdentifier(ch);
        if (parsed.channelId) {
          addTarget({
            channelId: parsed.channelId,
            guildId: parsed.guildId,
            clubId: club.id,
            clubName: club.name,
            inviteUrl: club.discordInvite,
          });
        }
      }
    }

    // 4. Registered sources in dictionary_store (from UI or POST /api/sources)
    const savedSources = getDataSources({ platform: 'discord' });
    for (const src of savedSources) {
      if (src.isActive === false) continue;
      const parsed = parseDiscordIdentifier(src.identifier, src.config);
      if (parsed.channelId) {
        const cid = normalizeClubId(src.clubId);
        const clubEntry = catalog.find(c => c.id.toLowerCase() === cid.toLowerCase());
        addTarget({
          channelId: parsed.channelId,
          guildId: parsed.guildId,
          clubId: clubEntry ? clubEntry.id : cid,
          clubName: src.config?.clubName || clubEntry?.name || null,
          inviteUrl: parsed.inviteUrl,
        });
      }
    }

    // 5. Aggregator Guild ("Follow Channel" mode) + Auto-discover ALL servers the bot is invited to
    const aggGuildId = (process.env.DISCORD_AGGREGATOR_GUILD_ID || '').trim();
    if (token && !channelId) {
      const guildsToScan = new Map(); // guildId -> { id, name, isAggregator }
      if (/^\d{15,22}$/.test(aggGuildId)) {
        guildsToScan.set(aggGuildId, { id: aggGuildId, name: null, isAggregator: true });
      }

      try {
        const botGuilds = await discordFetch('/users/@me/guilds', token);
        for (const g of botGuilds || []) {
          if (!g?.id) continue;
          const isAgg = g.id === aggGuildId;
          guildsToScan.set(g.id, { id: g.id, name: g.name || null, isAggregator: isAgg });
        }
      } catch (err) {
        console.warn('[Discord] Could not auto-list bot guilds (/users/@me/guilds):', err.message);
      }

      for (const guild of guildsToScan.values()) {
        try {
          const channels = await discordFetch(`/guilds/${guild.id}/channels`, token);
          const matchedGuildClub =
            !guild.isAggregator && guild.name
              ? matchClubFromDiscordContext({ webhookAuthor: `${guild.name} #announcements` }, catalog)
              : { clubId: null, clubName: null };

          for (const ch of channels || []) {
            // 0 = GUILD_TEXT (regular non-megaphone channel), 5 = GUILD_ANNOUNCEMENT (megaphone)
            if (ch.type !== 0 && ch.type !== 5) continue;

            // In a club's own server, automatically pick announcement/event/update/schedule channels
            // even when they do NOT use Discord's megaphone Announcement Channel type!
            if (
              !guild.isAggregator &&
              ch.type !== 5 &&
              !/(announce|event|update|news|gbm|meeting|schedule|important|flyer)/i.test(ch.name || '')
            ) {
              continue;
            }

            addTarget({
              channelId: ch.id,
              guildId: guild.id,
              clubId: matchedGuildClub.clubId || null,
              clubName: matchedGuildClub.clubName || guild.name || null,
              channelName: ch.name,
              channelTopic: ch.topic || '',
            });
          }
        } catch (err) {
          console.warn(`[Discord] Could not list channels for guild ${guild.id}:`, err.message);
        }
      }
    }

    return { targets: [...targets.values()], catalog };
  }

  async syncDiscord({ clubId = null, channelId = null, limit = 25 } = {}) {
    const token = (process.env.DISCORD_BOT_TOKEN || '').trim();
    const hasRealToken = Boolean(token && token !== 'your_bot_token');

    if (hasRealToken) {
      const { targets, catalog } = await this.discoverTargets({ clubId, channelId, token });

      if (targets.length > 0) {
        let syncedCount = 0;
        const channelSummaries = [];
        const errors = [];

        for (const target of targets) {
          try {
            const messages = await discordFetch(
              `/channels/${target.channelId}/messages?limit=${Math.min(Math.max(Number(limit) || 25, 1), 100)}`,
              token
            );

            let channelIngested = 0;
            // Oldest first so newer updates overwrite cleanly
            for (const msg of [...(messages || [])].reverse()) {
              const parsed = parseDiscordMessage(msg, {
                guildId: target.guildId,
                channelId: target.channelId,
                fallbackUrl: target.inviteUrl,
              });
              if (!parsed) continue;

              const matched = matchClubFromDiscordContext(
                {
                  explicitClubId: target.clubId,
                  channelName: target.channelName,
                  channelTopic: target.channelTopic,
                  webhookAuthor: parsed.webhookAuthor,
                  originChannelId: parsed.originChannelId,
                },
                catalog
              );

              if (!matched.clubId) continue;
              if (clubId && matched.clubId.toLowerCase() !== normalizeClubId(clubId).toLowerCase()) {
                continue;
              }

              ingestResourceItem({
                clubId: matched.clubId,
                clubName: target.clubName || matched.clubName || undefined,
                source: 'discord',
                id: parsed.id,
                title: parsed.title,
                caption: parsed.caption,
                imageUrl: parsed.imageUrl,
                permalink: parsed.permalink,
                postedAt: parsed.postedAt,
                identifier: `channel:${target.channelId}`,
                forceAnnouncement: true,
              });

              syncedCount++;
              channelIngested++;
            }

            channelSummaries.push({
              channelId: target.channelId,
              channelName: target.channelName || undefined,
              clubId: target.clubId || 'auto',
              ingested: channelIngested,
            });
            await sleep(250);
          } catch (err) {
            console.warn(`[Discord] Failed syncing channel ${target.channelId}:`, err.message);
            errors.push({ channelId: target.channelId, error: err.message });
          }
        }

        return {
          source: 'discord',
          mode: 'live',
          channelsChecked: targets.length,
          synced: syncedCount,
          channels: channelSummaries,
          errors,
        };
      }
    }

    // Demo / local fallback when DISCORD_BOT_TOKEN or channels aren't configured yet
    const items = clubId
      ? DEMO_DISCORD_MESSAGES.filter(m => m.clubId.toLowerCase() === normalizeClubId(clubId).toLowerCase())
      : DEMO_DISCORD_MESSAGES;

    for (const item of items) {
      ingestResourceItem({
        ...item,
        source: 'discord',
        postedAt: new Date().toISOString(),
        forceAnnouncement: true,
      });
    }

    return {
      source: 'discord',
      synced: items.length,
      mode: hasRealToken ? 'demo_no_channels_configured' : 'demo',
    };
  }

  getClubMessages(clubId) {
    const db = getDb();
    return db
      .stmt("SELECT * FROM posts WHERE lower(clubId) = lower(?) AND source = 'discord' ORDER BY postedAt DESC")
      .all(normalizeClubId(clubId))
      .map(formatPostRow);
  }
}

export default new DiscordService();
