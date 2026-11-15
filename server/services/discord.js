// ── Discord Integration Service (Inbound Sync + Outbound Alerts & Sharing) ──
// Connects Discord server #announcements, Followed channels, forwarded messages, threads,
// and Guild Scheduled Events to the ClubHub SQLite database, and sends outbound Discord
// embeds via Incoming Webhooks or the connected ClubHub Bot.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getDb,
  formatPostRow,
  normalizeClubId,
  getDictEntry,
  setDictEntry,
  getIntegrationConfig,
  saveIntegrationConfig,
  maskSecret,
} from '../database.js';
import { ingestResourceItem, getDataSources } from './resourceIngestor.js';
import { extractPost } from '../../collector/src/extract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLUBS_JSON_PATH = path.resolve(__dirname, '../../collector/clubs.json');
const DISCORD_API_BASE = 'https://discord.com/api/v10';

export const DISCORD_WEBHOOK_URL_RE =
  /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/(\d{15,22})\/([\w-]+)$/i;

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

let cachedBotStatus = { key: '', expiresAt: 0, data: null };

export function isMaskedValue(val) {
  return typeof val === 'string' && val.includes('••••');
}

export function isValidDiscordWebhookUrl(rawUrl = '') {
  return DISCORD_WEBHOOK_URL_RE.test(String(rawUrl || '').trim());
}

export function sanitizeDiscordWebhookUrl(rawUrl = '') {
  const trimmed = String(rawUrl || '').trim().split(/[?#]/)[0];
  const match = trimmed.match(DISCORD_WEBHOOK_URL_RE);
  if (!match) {
    throw new Error(
      'Invalid Discord Webhook URL. Expected https://discord.com/api/webhooks/<id>/<token>.'
    );
  }
  return `https://discord.com/api/webhooks/${match[1]}/${match[2]}`;
}

export function extractDiscordInviteCode(raw = '') {
  const match = String(raw || '').match(
    /(?:discord\.gg|discord(?:app)?\.com\/invite)\/([a-zA-Z0-9-]{2,64})/i
  );
  return match ? match[1] : null;
}

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
  const chanPrefix = str.match(/^(?:channel:|<#)?(\d{15,22})>?$/);
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

export function getEffectiveDiscordConfig() {
  const saved = getIntegrationConfig('discord_global')?.config || {};
  const envToken = (process.env.DISCORD_BOT_TOKEN || '').trim();
  const rawToken = (saved.botToken || envToken || '').trim();
  const botToken = rawToken && rawToken !== 'your_bot_token' ? rawToken : '';

  const aggregatorGuildId = String(
    saved.aggregatorGuildId || process.env.DISCORD_AGGREGATOR_GUILD_ID || ''
  ).trim();
  const channelMap = String(saved.channelMap || process.env.DISCORD_CHANNEL_MAP || '').trim();
  const rawWebhook = String(saved.webhookUrl || process.env.DISCORD_WEBHOOK_URL || '').trim();
  const webhookUrl = isValidDiscordWebhookUrl(rawWebhook) ? sanitizeDiscordWebhookUrl(rawWebhook) : '';
  const defaultChannelId = String(
    saved.defaultChannelId || process.env.DISCORD_DEFAULT_CHANNEL_ID || ''
  ).trim();
  const defaultClubId = saved.defaultClubId ? normalizeClubId(saved.defaultClubId) : '';

  return {
    botToken,
    tokenSource: saved.botToken ? 'saved' : botToken ? 'env' : 'none',
    aggregatorGuildId,
    channelMap,
    webhookUrl,
    webhookSource: saved.webhookUrl ? 'saved' : webhookUrl ? 'env' : 'none',
    defaultChannelId,
    defaultClubId,
  };
}

export function loadClubsCatalog() {
  let fileClubs = [];
  try {
    if (fs.existsSync(CLUBS_JSON_PATH)) {
      fileClubs = JSON.parse(fs.readFileSync(CLUBS_JSON_PATH, 'utf8'));
    }
  } catch {
    fileClubs = [];
  }

  let dbClubs = [];
  let discordLinks = [];
  try {
    const db = getDb();
    dbClubs = db.stmt('SELECT id, name, instagram, alsoKnownAs FROM clubs').all();
    discordLinks = db
      .stmt(
        "SELECT clubId, url FROM links WHERE kind = 'discord' OR url LIKE '%discord.gg/%' OR url LIKE '%discord.com/invite/%'"
      )
      .all();
  } catch {
    dbClubs = [];
    discordLinks = [];
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
      discordGuildId: c.discordGuildId || null,
      discordInvites: c.discord || c.discordInvite ? [c.discord || c.discordInvite] : [],
    });
  }

  for (const c of dbClubs) {
    const cid = normalizeClubId(c.id || c.instagram);
    if (!cid) continue;
    if (byId.has(cid.toLowerCase())) continue;
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
      discordGuildId: null,
      discordInvites: [],
    });
  }

  for (const link of discordLinks) {
    const cid = normalizeClubId(link.clubId);
    const entry = byId.get(cid.toLowerCase());
    if (!entry || !link.url) continue;
    if (!entry.discordInvites.includes(link.url)) {
      entry.discordInvites.push(link.url);
    }
    const code = extractDiscordInviteCode(link.url);
    if (code) {
      const cached = getDictEntry(`discord_invite_meta:${code.toLowerCase()}`)?.value;
      if (cached?.guildId && !entry.discordGuildId) {
        entry.discordGuildId = String(cached.guildId);
      }
      if (cached?.channelId && !entry.discordChannelId) {
        entry.discordChannelId = String(cached.channelId);
      }
    }
  }

  return [...byId.values()];
}

function slugify(s = '') {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Match a followed/crossposted/forwarded Discord message or channel back to a ClubHub clubId.
 */
export function matchClubFromDiscordContext(
  {
    explicitClubId,
    defaultClubId,
    channelName,
    channelTopic,
    webhookAuthor,
    originChannelId,
    originGuildId,
    messageText,
    messageTitle,
  } = {},
  catalog = []
) {
  if (explicitClubId) {
    const cid = normalizeClubId(explicitClubId);
    const found = catalog.find(c => c.id.toLowerCase() === cid.toLowerCase());
    return { clubId: found ? found.id : cid, clubName: found?.name || null };
  }

  // 1. Origin Guild ID match (resolved from club Discord invite links or clubs.json)
  if (originGuildId) {
    const byGuild = catalog.find(c => String(c.discordGuildId || '') === String(originGuildId));
    if (byGuild) return { clubId: byGuild.id, clubName: byGuild.name };
  }

  // 2. Origin Channel ID match
  if (originChannelId) {
    const byChan = catalog.find(c => {
      if (Array.isArray(c.discordChannelId)) {
        return c.discordChannelId.map(String).includes(String(originChannelId));
      }
      return String(c.discordChannelId || '') === String(originChannelId);
    });
    if (byChan) return { clubId: byChan.id, clubName: byChan.name };
  }

  // 3. Explicit @handle or instagram.com/handle inside channel topic
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

  // 4. Match Followed Announcement Channel webhook author ("Club Server Name #announcements")
  //    or aggregator channel name ("#ucsc-cs-club" / "#8thrankchess")
  const candidates = [];
  if (webhookAuthor) {
    candidates.push(String(webhookAuthor).split('#')[0].trim());
  }
  if (channelName && !/^(announcements?|general|updates?|events?|welcome|chat|bot|feed|clubhub)$/i.test(channelName)) {
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

  // 5. Match explicit @instagram_handle, Discord invite link, or [Club Name] header inside message text/title
  const combinedBody = `${messageTitle || ''}\n${messageText || ''}`.trim();
  if (combinedBody) {
    // 5a. Discord invite URL inside the message matching a known club's Discord invite code
    const msgInviteCode = extractDiscordInviteCode(combinedBody);
    if (msgInviteCode) {
      const byInvite = catalog.find(c =>
        (c.discordInvites || []).some(
          u => (extractDiscordInviteCode(u) || '').toLowerCase() === msgInviteCode.toLowerCase()
        )
      );
      if (byInvite) return { clubId: byInvite.id, clubName: byInvite.name };
    }

    // 5b. Instagram URL or @handle mention matching a known catalog club
    const igUrlMatches = [...combinedBody.matchAll(/instagram\.com\/([a-zA-Z0-9._]{3,30})/gi)];
    for (const m of igUrlMatches) {
      const candidate = normalizeClubId(m[1]).toLowerCase();
      const found = catalog.find(c => c.id.toLowerCase() === candidate);
      if (found) return { clubId: found.id, clubName: found.name };
    }
    const atMatches = [...combinedBody.matchAll(/(?:^|\s)@([a-zA-Z0-9._]{3,30})\b/g)];
    for (const m of atMatches) {
      const candidate = normalizeClubId(m[1]).toLowerCase();
      const found = catalog.find(c => c.id.toLowerCase() === candidate);
      if (found) return { clubId: found.id, clubName: found.name };
    }

    // 5c. Bracketed prefix "[Club Name] ..." or "Club Name: ..." on the first line
    const firstLine = combinedBody.split('\n')[0].trim();
    const headerMatch =
      firstLine.match(/^\[([^\]]{3,60})\]/) || firstLine.match(/^([A-Za-z0-9 &'().-]{4,50}):\s+/);
    if (headerMatch) {
      const hSlug = slugify(headerMatch[1]);
      if (hSlug.length >= 4) {
        for (const club of catalog) {
          const slugs = [club.id, club.name, ...(club.alsoKnownAs || [])].map(slugify).filter(Boolean);
          if (slugs.includes(hSlug)) {
            return { clubId: club.id, clubName: club.name };
          }
        }
      }
    }
  }

  // 6. Optional fallback club configured on the source or global aggregator
  if (defaultClubId) {
    const cid = normalizeClubId(defaultClubId);
    const found = catalog.find(c => c.id.toLowerCase() === cid.toLowerCase());
    return { clubId: found ? found.id : cid, clubName: found?.name || null };
  }

  // 7. Fallback slug if webhookAuthor has a server name not yet in clubs.json
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

function collectMessageParts(msgObj) {
  const parts = [];
  let embedTitle = null;
  let embedImage = null;

  if (msgObj?.content) {
    parts.push(cleanDiscordText(msgObj.content));
  }

  if (Array.isArray(msgObj?.embeds)) {
    for (const emb of msgObj.embeds) {
      if (!embedTitle && emb.title) embedTitle = cleanDiscordText(emb.title);
      if (emb.author?.name && !embedTitle) embedTitle = cleanDiscordText(emb.author.name);
      if (emb.title) parts.push(cleanDiscordText(emb.title));
      if (emb.description) parts.push(cleanDiscordText(emb.description));
      if (Array.isArray(emb.fields)) {
        for (const f of emb.fields) {
          if (f?.name || f?.value) {
            parts.push(cleanDiscordText(`${f.name || ''}: ${f.value || ''}`));
          }
        }
      }
      if (emb.footer?.text) {
        parts.push(cleanDiscordText(emb.footer.text));
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
  if (Array.isArray(msgObj?.attachments)) {
    for (const att of msgObj.attachments) {
      const isImg =
        att.content_type?.startsWith('image/') ||
        /\.(png|jpe?g|webp|gif)(\?|$)/i.test(att.url || '');
      if (isImg && !attachmentImage) {
        attachmentImage = att.url;
      }
    }
  }

  return {
    parts,
    embedTitle,
    imageUrl: attachmentImage || embedImage || null,
  };
}

/**
 * Extract structured caption, title, image flyer, and permalink from a Discord API message object.
 * Supports normal messages, replies, slash commands, crossposted messages, and forwarded snapshots.
 */
export function parseDiscordMessage(msg, { guildId = null, channelId = null, fallbackUrl = null } = {}) {
  if (!msg || typeof msg !== 'object') return null;
  const allowedTypes = new Set([0, 19, 20, 21]);
  if (msg.type !== undefined && !allowedTypes.has(msg.type)) return null;

  const primary = collectMessageParts(msg);
  const allParts = [...primary.parts];
  let embedTitle = primary.embedTitle;
  let imageUrl = primary.imageUrl;

  // Support Discord Forwarded Messages (`message_snapshots` in API v10)
  if (Array.isArray(msg.message_snapshots)) {
    for (const snap of msg.message_snapshots) {
      if (snap?.message) {
        const snapExtracted = collectMessageParts(snap.message);
        allParts.push(...snapExtracted.parts);
        if (!embedTitle && snapExtracted.embedTitle) embedTitle = snapExtracted.embedTitle;
        if (!imageUrl && snapExtracted.imageUrl) imageUrl = snapExtracted.imageUrl;
      }
    }
  }

  const combinedText = allParts.filter(Boolean).join('\n').trim();
  if (!combinedText && !imageUrl) {
    const likelyIntentIssue = Boolean(
      msg.id &&
        !msg.webhook_id &&
        !msg.author?.bot &&
        msg.content === '' &&
        (!msg.embeds || msg.embeds.length === 0) &&
        (!msg.attachments || msg.attachments.length === 0)
    );
    return likelyIntentIssue ? { emptyContentWarning: true, id: `discord_${msg.id}` } : null;
  }

  // Prefer linking to the original club server message if crossposted/forwarded
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
    originGuildId: ref?.guild_id || null,
  };
}

async function discordRequest(endpoint, { method = 'GET', token = null, body = undefined } = {}) {
  const headers = {
    'User-Agent': 'ClubHubBot (https://github.com/clubhub, 1.0)',
  };
  if (token) headers.Authorization = `Bot ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${DISCORD_API_BASE}${endpoint}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 429 && attempt < 3) {
      const retryBody = await res.json().catch(() => ({}));
      const waitMs = Math.ceil((Number(retryBody.retry_after) || 1.5) * 1000) + 250;
      await sleep(waitMs);
      continue;
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Discord API ${res.status} on ${endpoint}: ${errBody.slice(0, 220)}`);
    }

    if (res.status === 204) return null;
    return res.json();
  }
  throw new Error(`Discord API rate-limited on ${endpoint}`);
}

export class DiscordService {
  saveConfig(updates = {}) {
    const prev = getIntegrationConfig('discord_global')?.config || {};
    const next = { ...prev };

    if (updates.botToken !== undefined && !isMaskedValue(updates.botToken)) {
      next.botToken = String(updates.botToken || '').trim();
    }
    if (updates.aggregatorGuildId !== undefined) {
      next.aggregatorGuildId = String(updates.aggregatorGuildId || '').trim();
    }
    if (updates.channelMap !== undefined) {
      next.channelMap = String(updates.channelMap || '').trim();
    }
    if (updates.defaultChannelId !== undefined) {
      next.defaultChannelId = String(updates.defaultChannelId || '').trim();
    }
    if (updates.defaultClubId !== undefined) {
      next.defaultClubId = updates.defaultClubId ? normalizeClubId(updates.defaultClubId) : '';
    }
    if (updates.webhookUrl !== undefined && !isMaskedValue(updates.webhookUrl)) {
      const rawUrl = String(updates.webhookUrl || '').trim();
      next.webhookUrl = rawUrl ? sanitizeDiscordWebhookUrl(rawUrl) : '';
    }

    cachedBotStatus = { key: '', expiresAt: 0, data: null };
    return saveIntegrationConfig('discord_global', {
      scope: 'global',
      platform: 'discord',
      config: next,
    });
  }

  /**
   * Resolve uncached club Discord invite codes to their Guild ID + Channel ID so crossposted
   * Followed Channel messages match the exact club automatically.
   */
  async warmInviteGuildCache(catalog = [], token = null, maxLookups = 12) {
    let lookups = 0;
    for (const club of catalog) {
      if (club.discordGuildId || !Array.isArray(club.discordInvites)) continue;
      for (const inv of club.discordInvites) {
        const code = extractDiscordInviteCode(inv);
        if (!code) continue;
        const cacheKey = `discord_invite_meta:${code.toLowerCase()}`;
        const existing = getDictEntry(cacheKey)?.value;
        if (existing) {
          if (existing.guildId) club.discordGuildId = String(existing.guildId);
          if (existing.channelId && !club.discordChannelId) {
            club.discordChannelId = String(existing.channelId);
          }
          break;
        }
        if (lookups >= maxLookups) break;
        lookups++;
        try {
          const info = await discordRequest(`/invites/${encodeURIComponent(code)}?with_counts=false`, {
            token: token || null,
          });
          const meta = {
            code,
            guildId: info?.guild?.id || null,
            guildName: info?.guild?.name || null,
            channelId: info?.channel?.id || null,
            channelName: info?.channel?.name || null,
            resolvedAt: new Date().toISOString(),
          };
          setDictEntry(cacheKey, meta, {
            namespace: 'discord_invites',
            clubId: club.id,
            source: 'discord',
          });
          if (meta.guildId) club.discordGuildId = String(meta.guildId);
          if (meta.channelId && !club.discordChannelId) {
            club.discordChannelId = String(meta.channelId);
          }
          await sleep(180);
          break;
        } catch {
          setDictEntry(
            cacheKey,
            { code, guildId: null, invalid: true, resolvedAt: new Date().toISOString() },
            { namespace: 'discord_invites', clubId: club.id, source: 'discord' }
          );
        }
      }
    }
  }

  async getStatus({ forceRefresh = false } = {}) {
    const cfg = getEffectiveDiscordConfig();
    const db = getDb();
    const counts = db
      .stmt(`
        SELECT
          (SELECT COUNT(*) FROM posts WHERE source = 'discord')         AS posts,
          (SELECT COUNT(*) FROM announcements WHERE source = 'discord') AS announcements,
          (SELECT COUNT(*) FROM events WHERE source = 'discord')        AS events,
          (SELECT COUNT(*) FROM links WHERE kind = 'discord' OR url LIKE '%discord.gg/%' OR url LIKE '%discord.com/invite/%') AS inviteLinks
      `)
      .get();

    const sources = getDataSources({ platform: 'discord' });
    const cacheKey = `${cfg.botToken.slice(-8)}:${cfg.aggregatorGuildId}`;
    let botInfo = null;
    let guilds = [];
    let channels = [];
    let apiError = null;

    if (cfg.botToken) {
      if (!forceRefresh && cachedBotStatus.key === cacheKey && Date.now() < cachedBotStatus.expiresAt) {
        botInfo = cachedBotStatus.data.botInfo;
        guilds = cachedBotStatus.data.guilds;
        channels = cachedBotStatus.data.channels;
        apiError = cachedBotStatus.data.apiError;
      } else {
        try {
          const me = await discordRequest('/users/@me', { token: cfg.botToken });
          botInfo = {
            id: me.id,
            username: me.username,
            tag: me.discriminator && me.discriminator !== '0' ? `${me.username}#${me.discriminator}` : `@${me.username}`,
            inviteUrl: `https://discord.com/oauth2/authorize?client_id=${me.id}&permissions=85056&scope=bot`,
          };
          const rawGuilds = (await discordRequest('/users/@me/guilds', { token: cfg.botToken })) || [];
          guilds = rawGuilds.map(g => ({
            id: g.id,
            name: g.name,
            isAggregator: g.id === cfg.aggregatorGuildId,
          }));

          for (const g of guilds.slice(0, 15)) {
            try {
              const gChans = (await discordRequest(`/guilds/${g.id}/channels`, { token: cfg.botToken })) || [];
              for (const ch of gChans) {
                if (ch.type === 0 || ch.type === 5 || ch.type === 15) {
                  channels.push({
                    id: ch.id,
                    name: ch.name,
                    type: ch.type,
                    topic: ch.topic || '',
                    guildId: g.id,
                    guildName: g.name,
                    isAggregator: g.isAggregator,
                  });
                }
              }
            } catch {
              // ignore individual guild channel fetch errors
            }
          }

          cachedBotStatus = {
            key: cacheKey,
            expiresAt: Date.now() + 60_000,
            data: { botInfo, guilds, channels, apiError: null },
          };
        } catch (err) {
          apiError = err.message;
        }
      }
    }

    const canSendViaBot = Boolean(cfg.botToken && (cfg.defaultChannelId || channels.length > 0));
    const canSendViaWebhook = Boolean(cfg.webhookUrl);

    return {
      configured: Boolean(cfg.botToken || cfg.webhookUrl),
      inboundReady: Boolean(cfg.botToken),
      outboundReady: canSendViaWebhook || canSendViaBot,
      botTokenConfigured: Boolean(cfg.botToken),
      botTokenMasked: maskSecret(cfg.botToken),
      tokenSource: cfg.tokenSource,
      aggregatorGuildId: cfg.aggregatorGuildId,
      channelMap: cfg.channelMap,
      defaultChannelId: cfg.defaultChannelId || channels.find(c => c.isAggregator)?.id || channels[0]?.id || '',
      defaultClubId: cfg.defaultClubId,
      webhookConfigured: canSendViaWebhook,
      webhookUrlMasked: maskSecret(cfg.webhookUrl),
      webhookSource: cfg.webhookSource,
      bot: botInfo,
      guilds,
      channels,
      sources,
      counts,
      apiError,
    };
  }

  /**
   * Gather all configured Discord channels & guilds to sync.
   */
  async discoverTargets({ clubId = null, channelId = null, token = null } = {}) {
    const cfg = getEffectiveDiscordConfig();
    const effectiveToken = token || cfg.botToken;
    const catalog = loadClubsCatalog();
    const targets = new Map();
    const guildsScanned = [];
    const filterCid = clubId ? normalizeClubId(clubId).toLowerCase() : null;

    const addTarget = entry => {
      if (!entry?.channelId) return;
      if (filterCid && entry.clubId && entry.clubId.toLowerCase() !== filterCid) return;
      const prev = targets.get(String(entry.channelId)) || {};
      targets.set(String(entry.channelId), {
        channelId: String(entry.channelId),
        clubId: entry.clubId || prev.clubId || null,
        defaultClubId: entry.defaultClubId || prev.defaultClubId || cfg.defaultClubId || null,
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

    // 2. DISCORD_CHANNEL_MAP ("ucsc_csclub:123456789012345678,ucscdebate:234567890123456789")
    if (cfg.channelMap) {
      for (const pair of cfg.channelMap.split(',')) {
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

    // 3. collector/clubs.json entries with explicit discordChannelId (skip unverified invite defaults unless bot is in guild)
    for (const club of catalog) {
      let rawFileClub = null;
      const rawChans = Array.isArray(club.discordChannelId)
        ? club.discordChannelId
        : club.discordChannelId
          ? [club.discordChannelId]
          : [];
      for (const ch of rawChans) {
        // Only auto-poll channels if explicitly set or if bot has guild access
        const parsed = parseDiscordIdentifier(ch);
        if (parsed.channelId && !rawFileClub) {
          addTarget({
            channelId: parsed.channelId,
            guildId: parsed.guildId || club.discordGuildId || null,
            clubId: club.id,
            clubName: club.name,
            inviteUrl: club.discordInvites?.[0] || null,
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
        const isAggregatorMapping = cid === 'all' || cid === 'campus';
        const clubEntry = !isAggregatorMapping
          ? catalog.find(c => c.id.toLowerCase() === cid.toLowerCase())
          : null;
        addTarget({
          channelId: parsed.channelId,
          guildId: parsed.guildId,
          clubId: isAggregatorMapping ? null : clubEntry ? clubEntry.id : cid,
          clubName: src.config?.clubName || clubEntry?.name || null,
          inviteUrl: parsed.inviteUrl,
        });
      }
    }

    // 5. Aggregator Guild + All servers the ClubHub Bot is invited to
    const aggGuildId = cfg.aggregatorGuildId;
    if (effectiveToken && !channelId) {
      await this.warmInviteGuildCache(catalog, effectiveToken, 10);

      const guildsToScan = new Map();
      if (/^\d{15,22}$/.test(aggGuildId)) {
        guildsToScan.set(aggGuildId, { id: aggGuildId, name: null, isAggregator: true });
      }

      try {
        const botGuilds = await discordRequest('/users/@me/guilds', { token: effectiveToken });
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
          const channels = await discordRequest(`/guilds/${guild.id}/channels`, { token: effectiveToken });
          const matchedGuildClub =
            !guild.isAggregator && guild.name
              ? matchClubFromDiscordContext(
                  {
                    originGuildId: guild.id,
                    webhookAuthor: `${guild.name} #announcements`,
                  },
                  catalog
                )
              : { clubId: null, clubName: null };

          guildsScanned.push({
            id: guild.id,
            name: guild.name,
            isAggregator: guild.isAggregator,
            clubId: matchedGuildClub.clubId,
            clubName: matchedGuildClub.clubName || guild.name || null,
          });

          for (const ch of channels || []) {
            if (ch.type !== 0 && ch.type !== 5) continue;

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

          // Also check active threads (e.g. Forum / Announcement threads)
          try {
            const activeThreads = await discordRequest(`/guilds/${guild.id}/threads/active`, {
              token: effectiveToken,
            });
            for (const th of activeThreads?.threads || []) {
              if (guild.isAggregator || matchedGuildClub.clubId) {
                addTarget({
                  channelId: th.id,
                  guildId: guild.id,
                  clubId: matchedGuildClub.clubId || null,
                  clubName: matchedGuildClub.clubName || guild.name || null,
                  channelName: th.name,
                  channelTopic: '',
                });
              }
            }
          } catch {
            // ignore thread list permission errors
          }
        } catch (err) {
          console.warn(`[Discord] Could not list channels for guild ${guild.id}:`, err.message);
        }
      }
    }

    return { targets: [...targets.values()], guildsScanned, catalog };
  }

  /**
   * Sync Discord Guild Scheduled Events (`/guilds/{id}/scheduled-events`) directly into ClubHub events.
   */
  async syncGuildScheduledEvents(guildsScanned = [], catalog = [], token = null, filterClubId = null) {
    if (!token || !guildsScanned.length) return 0;
    let eventsIngested = 0;

    for (const guild of guildsScanned) {
      try {
        const scheduled = await discordRequest(
          `/guilds/${guild.id}/scheduled-events?with_user_count=true`,
          { token }
        );
        for (const ev of scheduled || []) {
          if (!ev?.id || !ev?.scheduled_start_time || ev.status === 4) continue;
          const matched = matchClubFromDiscordContext(
            {
              explicitClubId: guild.clubId,
              originGuildId: guild.id,
              messageTitle: ev.name || '',
              messageText: ev.description || '',
            },
            catalog
          );
          if (!matched.clubId) continue;
          if (filterClubId && matched.clubId.toLowerCase() !== normalizeClubId(filterClubId).toLowerCase()) {
            continue;
          }

          const postId = `discord_sched_${ev.id}`;
          const permalink = `https://discord.com/events/${guild.id}/${ev.id}`;
          const location =
            ev.entity_metadata?.location ||
            (ev.entity_type === 2 ? 'Discord Voice Channel' : ev.entity_type === 1 ? 'Discord Stage' : 'Discord / TBD');
          const imageUrl = ev.image
            ? `https://cdn.discordapp.com/guild-events/${ev.id}/${ev.image}.png?size=1024`
            : null;
          const caption = [ev.name, ev.description, `Location: ${location}`].filter(Boolean).join('\n');
          const baseExtracted = extractPost(
            { id: postId, caption, postedAt: ev.scheduled_start_time, permalink, imageUrl },
            { username: matched.clubId, name: matched.clubName || guild.name || matched.clubId }
          );

          ingestResourceItem({
            clubId: matched.clubId,
            clubName: matched.clubName || guild.name || undefined,
            source: 'discord',
            id: postId,
            title: ev.name,
            caption,
            imageUrl,
            permalink,
            postedAt: ev.scheduled_start_time,
            identifier: `guild_events:${guild.id}`,
            forceAnnouncement: true,
            extractedInfo: {
              ...baseExtracted,
              type: 'event',
              title: ev.name,
              summary: (ev.description || `${ev.name} at ${location}`).slice(0, 280),
              events: [
                {
                  title: ev.name,
                  kind: 'event',
                  start: new Date(ev.scheduled_start_time).toISOString(),
                  end: ev.scheduled_end_time ? new Date(ev.scheduled_end_time).toISOString() : null,
                  allDay: false,
                  recurring: null,
                  location,
                },
              ],
            },
          });
          eventsIngested++;
        }
      } catch {
        // Skip if bot lacks View Events in a guild
      }
    }

    return eventsIngested;
  }

  async syncDiscord({ clubId = null, channelId = null, limit = 30, demo = false } = {}) {
    const cfg = getEffectiveDiscordConfig();
    const token = cfg.botToken;
    const hasRealToken = Boolean(token);

    if (hasRealToken && !demo) {
      const { targets, guildsScanned, catalog } = await this.discoverTargets({ clubId, channelId, token });

      let scheduledEventsSynced = 0;
      if (!channelId && guildsScanned.length > 0) {
        scheduledEventsSynced = await this.syncGuildScheduledEvents(guildsScanned, catalog, token, clubId);
      }

      if (targets.length > 0 || scheduledEventsSynced > 0) {
        let syncedCount = scheduledEventsSynced;
        let unmatchedCount = 0;
        let messageContentIntentWarning = false;
        const channelSummaries = [];
        const errors = [];

        for (const target of targets) {
          try {
            const messages = await discordRequest(
              `/channels/${target.channelId}/messages?limit=${Math.min(Math.max(Number(limit) || 30, 1), 100)}`,
              { token }
            );

            let channelIngested = 0;
            let channelUnmatched = 0;

            // Oldest first so newer updates overwrite cleanly
            for (const msg of [...(messages || [])].reverse()) {
              const parsed = parseDiscordMessage(msg, {
                guildId: target.guildId,
                channelId: target.channelId,
                fallbackUrl: target.inviteUrl,
              });
              if (!parsed) continue;
              if (parsed.emptyContentWarning) {
                messageContentIntentWarning = true;
                continue;
              }

              const matched = matchClubFromDiscordContext(
                {
                  explicitClubId: target.clubId,
                  defaultClubId: target.defaultClubId,
                  channelName: target.channelName,
                  channelTopic: target.channelTopic,
                  webhookAuthor: parsed.webhookAuthor,
                  originChannelId: parsed.originChannelId,
                  originGuildId: parsed.originGuildId,
                  messageText: parsed.caption,
                  messageTitle: parsed.title,
                },
                catalog
              );

              if (!matched.clubId) {
                channelUnmatched++;
                unmatchedCount++;
                continue;
              }
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
              unmatched: channelUnmatched || undefined,
            });
            await sleep(200);
          } catch (err) {
            // Skip noisy 403/404s for unjoined external club channels while recording real errors
            if (!/Discord API (403|404)/i.test(err.message || '') || channelId) {
              console.warn(`[Discord] Failed syncing channel ${target.channelId}:`, err.message);
              errors.push({ channelId: target.channelId, error: err.message });
            }
          }
        }

        const warnings = [];
        if (messageContentIntentWarning) {
          warnings.push(
            'Some regular Discord messages had empty content. Enable "Message Content Intent" under Privileged Gateway Intents in the Discord Developer Portal so the bot can read non-embed text.'
          );
        }
        if (unmatchedCount > 0 && syncedCount === 0) {
          warnings.push(
            `${unmatchedCount} message(s) could not be matched to a club. Click "Follow" on a club's #announcements channel, include @instagram_handle or [Club Name] in the message/channel topic, or map the channel to a club in Settings.`
          );
        }

        return {
          source: 'discord',
          mode: 'live',
          channelsChecked: targets.length,
          scheduledEventsSynced,
          synced: syncedCount,
          unmatched: unmatchedCount,
          channels: channelSummaries,
          warnings,
          errors,
        };
      }

      return {
        source: 'discord',
        mode: 'live_no_channels',
        channelsChecked: 0,
        synced: 0,
        warnings: [
          'Discord Bot is authenticated, but no accessible channels were found yet. Invite the bot to your aggregator server or connect a channel ID in Settings.',
        ],
      };
    }

    // Only insert demo fixtures when no real clubs exist in DB (or demo=true explicitly requested)
    const realClubCount =
      getDb().stmt("SELECT COUNT(*) AS c FROM clubs WHERE id NOT LIKE 'demo_%'").get()?.c || 0;
    if (!demo && realClubCount > 0) {
      return {
        source: 'discord',
        mode: 'unconfigured',
        synced: 0,
        warnings: ['Set DISCORD_BOT_TOKEN in .env or Settings -> Integrations to sync live Discord channels.'],
      };
    }

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
      mode: 'demo',
    };
  }

  /**
   * Build a Discord message + rich embed payload for outbound notifications.
   */
  buildOutboundPayload({
    kind = 'announcement',
    title = '',
    message = '',
    clubName = 'ClubHub',
    url = '',
    events = [],
    poll = null,
    task = null,
  } = {}) {
    const nowIso = new Date().toISOString();

    if (kind === 'task_reminder' || task) {
      const taskTitle = task?.title || title || 'Upcoming Task';
      const priorityRaw = String(task?.priority || 'medium').toLowerCase();
      const priorityLabel =
        priorityRaw === 'critical'
          ? '🔴 Urgent'
          : priorityRaw === 'high'
            ? '🟡 High'
            : priorityRaw === 'low'
              ? '🔵 Low'
              : '🟢 Medium';
      const embedColor =
        priorityRaw === 'critical'
          ? 0xed4245
          : priorityRaw === 'high'
            ? 0xfee75c
            : 0x5865f2;
      const dueDt = task?.dueAtIso ? new Date(task.dueAtIso) : null;
      const dueUnix =
        dueDt && !Number.isNaN(dueDt.getTime()) ? Math.floor(dueDt.getTime() / 1000) : null;
      const dueFieldVal = dueUnix
        ? `<t:${dueUnix}:f> (<t:${dueUnix}:R>)`
        : task?.dueLabel || [task?.dueDate, task?.dueTime].filter(Boolean).join(' · ') || 'Upcoming';
      const scopeLabel =
        task?.visibility === 'personal' || task?.isPersonal
          ? 'Personal To-Do'
          : task?.visibility === 'board'
            ? 'Board Task'
            : 'Club Task';
      const fields = [
        { name: 'Due', value: String(dueFieldVal), inline: true },
        { name: 'Priority', value: priorityLabel, inline: true },
        { name: 'List', value: String(task?.sectionTitle || scopeLabel), inline: true },
      ];
      return {
        username: 'ClubHub Task Reminders',
        embeds: [
          {
            author: clubName ? { name: `${clubName} · ${scopeLabel}` } : undefined,
            title: `⏰ ${taskTitle}`,
            description:
              String(task?.notes || message || '').slice(0, 2000) ||
              'Heads-up: this task is coming up on your ClubHub board.',
            url: url || undefined,
            color: embedColor,
            fields,
            footer: { text: 'ClubHub Task Reminder' },
            timestamp: nowIso,
          },
        ],
      };
    }

    if (kind === 'test') {
      return {
        username: 'ClubHub Campus Sync',
        embeds: [
          {
            title: title || 'ClubHub Discord Integration Connected',
            description:
              message ||
              'Outbound alerts, event digests, club announcements, and Group Availability polls are ready to post to this channel.',
            color: 0x5865f2,
            footer: { text: 'ClubHub Campus Workspace' },
            timestamp: nowIso,
          },
        ],
      };
    }

    if (kind === 'digest') {
      const list = (events || []).slice(0, 10);
      const lines = list.map(ev => {
        const startRaw = ev.startIso || ev.start;
        const dt = startRaw ? new Date(startRaw) : null;
        const unix = dt && !Number.isNaN(dt.getTime()) ? Math.floor(dt.getTime() / 1000) : null;
        const evTitle = ev.event || ev.title || 'Club Event';
        const evClub = ev.club || ev.clubName || '';
        const loc = ev.location ? ` · 📍 ${ev.location}` : '';
        const timeTag = unix ? `<t:${unix}:f> (<t:${unix}:R>)` : ev.date || 'Upcoming';
        return `• **${evClub ? `${evClub}: ` : ''}${evTitle}**\n  🗓️ ${timeTag}${loc}`;
      });

      return {
        username: 'ClubHub Schedule Digest',
        embeds: [
          {
            title: title || `📅 Upcoming Club Schedule (${list.length} Event${list.length === 1 ? '' : 's'})`,
            description:
              lines.join('\n\n') ||
              message ||
              'No upcoming events matched your current ClubHub filter.',
            url: url || undefined,
            color: 0xf2a900,
            footer: { text: 'Synced from ClubHub Calendar' },
            timestamp: nowIso,
          },
        ],
      };
    }

    if (kind === 'poll' || poll) {
      const pollTitle = poll?.title || title || 'Group Availability Poll';
      const voteUrl = poll?.url || url || '';
      const fields = [];
      if (poll?.duration) {
        fields.push({ name: 'Target Duration', value: `${poll.duration} hr`, inline: true });
      }
      if (poll?.organizer) {
        fields.push({ name: 'Organizer', value: String(poll.organizer), inline: true });
      }
      if (poll?.bestSlot) {
        fields.push({ name: 'Leading Window', value: String(poll.bestSlot), inline: false });
      }
      return {
        username: 'ClubHub Availability Poll',
        content: voteUrl ? `🗳️ **Vote on meeting availability:** ${voteUrl}` : undefined,
        embeds: [
          {
            title: `🗓️ ${pollTitle}`,
            description:
              message ||
              'Click the link above to mark the times you are free so we can lock in the best meeting slot.',
            url: voteUrl || undefined,
            color: 0x57f287,
            fields: fields.length ? fields : undefined,
            footer: { text: `${clubName} · ClubHub Availability` },
            timestamp: nowIso,
          },
        ],
      };
    }

    return {
      username: 'ClubHub Announcements',
      embeds: [
        {
          author: clubName ? { name: clubName } : undefined,
          title: title || `${clubName} Update`,
          description: String(message || '').slice(0, 3800) || 'New update posted on ClubHub.',
          url: url || undefined,
          color: 0x5865f2,
          footer: { text: 'Shared via ClubHub' },
          timestamp: nowIso,
        },
      ],
    };
  }

  /**
   * Send an outbound notification to Discord via Incoming Webhook URL OR the ClubHub Bot.
   */
  async sendDiscordNotification(options = {}) {
    const cfg = getEffectiveDiscordConfig();
    const rawWebhook = options.webhookUrl && !isMaskedValue(options.webhookUrl)
      ? options.webhookUrl
      : cfg.webhookUrl;
    const payload = this.buildOutboundPayload(options);

    // 1. Prefer explicit or saved Discord Incoming Webhook URL when provided and no specific bot channel overrides it
    if (rawWebhook && !options.channelId) {
      const cleanWebhook = sanitizeDiscordWebhookUrl(rawWebhook);
      const res = await fetch(`${cleanWebhook}?wait=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Discord Webhook error (${res.status}): ${errText.slice(0, 200)}`);
      }
      const msg = await res.json().catch(() => ({}));
      return {
        ok: true,
        via: 'webhook',
        messageId: msg?.id || null,
        channelId: msg?.channel_id || null,
      };
    }

    // 2. Otherwise send via the connected ClubHub Discord Bot to a channel
    if (!cfg.botToken) {
      throw new Error(
        'Provide a Discord Webhook URL or configure DISCORD_BOT_TOKEN to send Discord messages.'
      );
    }

    let targetChannelId = String(options.channelId || cfg.defaultChannelId || '').trim();
    if (!targetChannelId) {
      const status = await this.getStatus();
      const preferred =
        status.channels.find(c => c.isAggregator && /announce|general|club/i.test(c.name || '')) ||
        status.channels.find(c => c.isAggregator) ||
        status.channels[0];
      targetChannelId = preferred?.id || '';
    }

    if (!/^\d{15,22}$/.test(targetChannelId)) {
      throw new Error(
        'No destination Discord channel found. Select a channel or paste a Discord Incoming Webhook URL.'
      );
    }

    const { username, ...botPayload } = payload;
    const msg = await discordRequest(`/channels/${targetChannelId}/messages`, {
      method: 'POST',
      token: cfg.botToken,
      body: botPayload,
    });

    return {
      ok: true,
      via: 'bot',
      channelId: targetChannelId,
      messageId: msg?.id || null,
    };
  }

  /**
   * Programmatically follow a Discord Announcement Channel (`type: 5`) into the ClubHub
   * aggregator server channel (`POST /channels/{announcement_channel_id}/followers`).
   * Requires the Bot to have visibility of `sourceChannelId` and `MANAGE_WEBHOOKS` in `targetChannelId`.
   */
  async followAnnouncementChannel({ sourceChannelId, targetChannelId = '' } = {}) {
    const cfg = getEffectiveDiscordConfig();
    if (!cfg.botToken) {
      throw new Error('DISCORD_BOT_TOKEN is required to auto-follow an announcement channel.');
    }
    const cleanSource = String(sourceChannelId || '').trim();
    if (!/^\d{15,22}$/.test(cleanSource)) {
      throw new Error('Valid source Discord Announcement Channel ID is required.');
    }

    let destChannel = String(targetChannelId || cfg.defaultChannelId || '').trim();
    if (!destChannel) {
      const status = await this.getStatus();
      const aggChan =
        status.channels.find(c => c.isAggregator && c.type === 0 && /announce|general|club/i.test(c.name || '')) ||
        status.channels.find(c => c.isAggregator && c.type === 0) ||
        status.channels.find(c => c.type === 0);
      destChannel = aggChan?.id || '';
    }
    if (!/^\d{15,22}$/.test(destChannel)) {
      throw new Error('No destination aggregator text channel found for following.');
    }

    const res = await discordRequest(`/channels/${cleanSource}/followers`, {
      method: 'POST',
      token: cfg.botToken,
      body: { webhook_channel_id: destChannel },
    });

    return {
      ok: true,
      sourceChannelId: cleanSource,
      webhookId: res?.webhook_id || null,
      targetChannelId: destChannel,
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
