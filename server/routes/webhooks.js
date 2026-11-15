// ── Official Incoming Webhooks: Discord Push + Instagram Story Mentions / DM Shares ──
//
// 1. Instagram Messaging Webhook (zero-ban Stories + personal accounts via @mention or DM):
//      GET  /api/webhooks/instagram  -> Meta hub.challenge verification
//      POST /api/webhooks/instagram  -> Ingests story_mention, post/reel DM shares, & text updates
//
// 2. Discord Push Webhook (optional real-time alternative to polling):
//      POST /api/webhooks/discord    -> Ingests a pushed Discord message payload immediately

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { getDb, normalizeClubId } from '../database.js';
import { ingestResourceItem } from '../services/resourceIngestor.js';
import { parseDiscordMessage, matchClubFromDiscordContext } from '../services/discord.js';
import { extractWithClaude, llmEnabled } from '../../collector/src/llm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLUBS_JSON_PATH = path.resolve(__dirname, '../../collector/clubs.json');

const router = Router();

function loadFileClubs() {
  try {
    if (fs.existsSync(CLUBS_JSON_PATH)) {
      return JSON.parse(fs.readFileSync(CLUBS_JSON_PATH, 'utf8'));
    }
  } catch {
    // ignore
  }
  return [];
}

function verifyInstagramSignature(req) {
  const appSecret = (process.env.INSTAGRAM_APP_SECRET || '').trim();
  // Only enforce signature when a real secret is configured AND header is present (or secret enforced)
  if (!appSecret || appSecret === 'your_app_secret') return true;

  const sigHeader = req.get('x-hub-signature-256') || '';
  if (!sigHeader.startsWith('sha256=') || !req.rawBody) return false;

  const expected =
    'sha256=' + crypto.createHmac('sha256', appSecret).update(req.rawBody).digest('hex');
  const a = Buffer.from(sigHeader);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function resolveInstagramSender(sender = {}) {
  if (sender.username) {
    return {
      username: normalizeClubId(sender.username),
      name: sender.name || null,
    };
  }

  const token = (process.env.IG_ACCESS_TOKEN || '').trim();
  if (sender.id && token) {
    try {
      const version = process.env.GRAPH_API_VERSION || 'v26.0';
      const url = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(sender.id)}`);
      url.searchParams.set('fields', 'username,name');
      url.searchParams.set('access_token', token);
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const body = await res.json();
        if (body?.username) {
          return { username: normalizeClubId(body.username), name: body.name || null };
        }
      }
    } catch (err) {
      console.warn('[IG Webhook] Could not resolve sender profile:', err.message);
    }
  }

  return {
    username: sender.id ? `ig_user_${sender.id}` : null,
    name: sender.name || null,
  };
}

// ── 1A. Meta Webhook Verification Handshake ─────────────────────────
router.get('/instagram', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expectedToken = (process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || 'clubhub_verify').trim();

  if (mode === 'subscribe' && token === expectedToken) {
    return res.status(200).send(String(challenge || ''));
  }
  return res.status(403).json({ error: 'Verification token mismatch' });
});

// ── 1B. Meta Instagram Messaging Events (story_mention, share, DM) ──
router.post('/instagram', async (req, res) => {
  if (!verifyInstagramSignature(req)) {
    return res.status(401).json({ error: 'Invalid X-Hub-Signature-256' });
  }

  const body = req.body || {};
  if (body.object && body.object !== 'instagram') {
    return res.status(400).json({ error: `Unsupported webhook object "${body.object}"` });
  }

  const entries = Array.isArray(body.entry) ? body.entry : [];
  const fileClubs = loadFileClubs();
  const db = getDb();
  const ingested = [];

  for (const entry of entries) {
    const events = Array.isArray(entry.messaging) ? entry.messaging : [];
    for (const evt of events) {
      const msg = evt?.message;
      if (!msg || msg.is_echo) continue;

      const senderInfo = await resolveInstagramSender(evt.sender || {});
      if (!senderInfo.username) continue;

      const cid = senderInfo.username;
      const dbClub = db.stmt('SELECT name FROM clubs WHERE lower(id) = lower(?)').get(cid);
      const fileClub = fileClubs.find(
        c => normalizeClubId(c.instagram || '').toLowerCase() === cid.toLowerCase()
      );
      const clubName = dbClub?.name || fileClub?.name || senderInfo.name || cid;

      const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];
      const primaryAtt = attachments[0] || null;
      const attType = primaryAtt?.type || 'text'; // 'story_mention', 'share', 'ig_reel', 'image'
      const mediaUrl = primaryAtt?.payload?.url || null;
      const isStory = attType === 'story_mention';

      const postedAt = evt.timestamp
        ? new Date(Number(evt.timestamp)).toISOString()
        : new Date().toISOString();
      const postId = `ig_${isStory ? 'story' : 'dm'}_${msg.mid || Date.now()}`;
      const rawText = (msg.text || primaryAtt?.payload?.title || '').trim();

      // If an image/story flyer URL is present and Claude vision is enabled, extract dates/rooms from the image
      let extractedInfo = null;
      if (mediaUrl && llmEnabled()) {
        try {
          extractedInfo = await extractWithClaude(
            {
              id: postId,
              caption: rawText,
              postedAt,
              imageUrl: mediaUrl,
            },
            { username: cid, name: clubName }
          );
        } catch (err) {
          console.warn(`[IG Webhook] Vision flyer extraction failed for ${postId}:`, err.message);
        }
      }

      const fallbackCaption =
        rawText ||
        extractedInfo?.summary ||
        (isStory
          ? `New Instagram Story announcement from @${cid}`
          : `Shared Instagram update from @${cid}`);

      const permalink = isStory
        ? `https://www.instagram.com/stories/${cid}/`
        : `https://www.instagram.com/${cid}/`;

      // Per Meta Platform Policy, do not persist ephemeral story_mention CDN URLs in the DB
      const storedImageUrl = isStory ? null : mediaUrl;

      const result = ingestResourceItem({
        clubId: cid,
        clubName,
        source: isStory ? 'instagram_story' : 'instagram',
        id: postId,
        title: extractedInfo?.title || (isStory ? `${clubName} Story Update` : undefined),
        caption: fallbackCaption,
        permalink,
        imageUrl: storedImageUrl,
        postedAt,
        identifier: isStory ? `story:@${cid}` : `@${cid}`,
        forceAnnouncement: isStory ? true : null,
        extractedInfo,
      });

      ingested.push(result);
    }
  }

  return res.status(200).json({ ok: true, ingested: ingested.length, items: ingested });
});

// ── 2. Real-Time Discord Push Endpoint (for custom bots/relays) ──────
router.post('/discord', (req, res) => {
  const expectedSecret = (process.env.WEBHOOK_SECRET || '').trim();
  if (expectedSecret) {
    const provided = req.get('x-webhook-secret') || req.query.secret || '';
    if (provided !== expectedSecret) {
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }
  }

  const {
    clubId: rawClubId,
    clubName,
    guildId,
    channelId,
    channelName,
    channelTopic,
    message,
  } = req.body || {};

  const msgObj = message || req.body;
  const parsed = parseDiscordMessage(msgObj, { guildId, channelId });
  if (!parsed) {
    return res.status(400).json({ error: 'No readable content or image found in Discord message' });
  }

  const catalog = loadFileClubs().map(c => ({
    id: normalizeClubId(c.instagram),
    name: c.name,
    alsoKnownAs: c.alsoKnownAs || [],
    discordChannelId: c.discordChannelId || null,
  }));

  const matched = matchClubFromDiscordContext(
    {
      explicitClubId: rawClubId,
      channelName,
      channelTopic,
      webhookAuthor: parsed.webhookAuthor,
      originChannelId: parsed.originChannelId,
    },
    catalog
  );

  if (!matched.clubId) {
    return res.status(400).json({
      error: 'Could not determine clubId. Pass "clubId" or include "@instagram_handle" in the channel topic.',
    });
  }

  const result = ingestResourceItem({
    clubId: matched.clubId,
    clubName: clubName || matched.clubName || undefined,
    source: 'discord',
    id: parsed.id,
    title: parsed.title,
    caption: parsed.caption,
    imageUrl: parsed.imageUrl,
    permalink: parsed.permalink,
    postedAt: parsed.postedAt,
    identifier: channelId ? `channel:${channelId}` : 'discord_webhook',
    forceAnnouncement: true,
  });

  return res.status(201).json({ ok: true, ...result });
});

export default router;
