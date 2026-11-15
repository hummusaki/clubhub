// ── Autonomous Discord & Email Integration Agent ──
// Unifies live Discord Bot + Public Discord Invite API v10 + Live IMAP/SMTP + UCSC Club Directory Emails
// so Discord and Email integrations run autonomously via GitHub Actions or CLI (`npm run sync:discord-email`).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getDb,
  setDictEntry,
  getDictEntry,
  syncClubDictionary,
  normalizeClubId,
} from '../database.js';
import discordService from './discord.js';
import emailService from './email.js';
import { ingestResourceItem } from './resourceIngestor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COLLECTOR_CLUBS_PATH = path.resolve(__dirname, '../../collector/clubs.json');

const DISCORD_INVITE_RE =
  /(?:https?:\/\/)?(?:www\.)?discord\.(?:gg|com\/invite)\/([A-Za-z0-9-]{2,32})/gi;
const LABEL_COUNTS_RE =
  /^Discord\s*(?:—|-)\s*(.+?)\s*\(([\d,]+)\s*members?(?:\s*·\s*([\d,]+)\s*online)?\)/i;

// Known non-UCSC mega game servers accidentally matched in old captions
const BLOCKED_INVITE_CODES = new Set(['allstar']);

function cleanInviteCode(raw) {
  if (!raw) return null;
  const str = String(raw).trim();
  const match =
    str.match(/discord\.(?:gg|com\/invite)\/([A-Za-z0-9-]{2,32})/i) ||
    str.match(/^([A-Za-z0-9-]{2,32})$/);
  if (!match) return null;
  const code = match[1].replace(/[.,!?;:'")\]]+$/, '');
  if (!code || BLOCKED_INVITE_CODES.has(code.toLowerCase())) return null;
  return code;
}

function parseExistingInviteLabel(label = '') {
  const m = String(label || '').match(LABEL_COUNTS_RE);
  if (!m) return null;
  const serverName = m[1]?.trim() || null;
  const memberCount = Number(String(m[2] || '').replace(/,/g, '')) || null;
  const onlineCount = m[3] != null ? Number(String(m[3]).replace(/,/g, '')) : null;
  return { serverName, memberCount, onlineCount };
}

async function fetchPublicDiscordInvite(code, timeoutMs = 4500) {
  const cleanCode = cleanInviteCode(code);
  if (!cleanCode) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://discord.com/api/v10/invites/${encodeURIComponent(cleanCode)}?with_counts=true&with_expiration=true`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ClubHub-UCSC-Integration-Agent/2.0',
        },
        signal: controller.signal,
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.guild) return null;

    const guild = data.guild;
    const memberCount =
      typeof data.approximate_member_count === 'number' ? data.approximate_member_count : null;
    const onlineCount =
      typeof data.approximate_presence_count === 'number' ? data.approximate_presence_count : null;
    const iconUrl =
      guild.id && guild.icon
        ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`
        : null;

    return {
      code: data.code || cleanCode,
      url: `https://discord.gg/${data.code || cleanCode}`,
      guildId: guild.id || null,
      serverName: guild.name || null,
      description: guild.description || null,
      iconUrl,
      channelName: data.channel?.name || 'announcements',
      memberCount,
      onlineCount,
      scheduledEvents: Array.isArray(data.guild_scheduled_events)
        ? data.guild_scheduled_events
        : [],
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function isLikelyClubDiscordServer(meta, club) {
  if (!meta) return false;
  const count = Number(meta.memberCount || 0);
  if (count <= 25000) return true;
  const hay = `${meta.serverName || ''} ${meta.description || ''}`.toLowerCase();
  const clubNameLower = String(club?.name || '').toLowerCase();
  return (
    hay.includes('ucsc') ||
    hay.includes('santa cruz') ||
    hay.includes('slug') ||
    (clubNameLower.length >= 4 && hay.includes(clubNameLower))
  );
}

export async function syncDiscordEmailAgent({
  offline = false,
  sendDigest = false,
  updateClubsJson = true,
} = {}) {
  const startedAt = new Date().toISOString();
  const db = getDb();

  // ── 0. Prune known false-positive non-club mega Discord links (e.g. discord.gg/allstar on sluganimeucsc) ──
  db.exec(`
    DELETE FROM links WHERE lower(url) LIKE '%discord.gg/allstar%';
    UPDATE clubs
       SET discordMemberCount = NULL,
           discordOnlineCount = NULL,
           memberCount = COALESCE(followers, 0)
     WHERE discordMemberCount > 25000;
  `);

  // ── 1. Run Live Discord Bot & Live IMAP Email Sync if credentials are configured ──
  let liveDiscordResult = { mode: 'autonomous', synced: 0, scheduledEventsSynced: 0 };
  let liveEmailResult = { mode: 'autonomous', synced: 0 };

  try {
    const dRes = await discordService.syncDiscord({ demo: false, limit: 40 });
    if (dRes && dRes.mode === 'live') {
      liveDiscordResult = dRes;
    }
  } catch (err) {
    console.warn('⚠️ Live Discord bot sync skipped:', err.message);
  }

  try {
    const eRes = await emailService.syncEmail({ demo: false, limit: 35, daysBack: 30 });
    if (eRes && eRes.mode === 'live') {
      liveEmailResult = eRes;
    }
  } catch (err) {
    console.warn('⚠️ Live Email IMAP sync skipped:', err.message);
  }

  // ── 2. Load Collector Clubs JSON & Current SQLite Tables ──
  let collectorClubs = [];
  if (fs.existsSync(COLLECTOR_CLUBS_PATH)) {
    try {
      collectorClubs = JSON.parse(fs.readFileSync(COLLECTOR_CLUBS_PATH, 'utf8'));
    } catch {
      collectorClubs = [];
    }
  }
  const collectorById = new Map(
    collectorClubs.map(c => [normalizeClubId(c.id || c.instagram), c])
  );

  const clubs = db.prepare('SELECT * FROM clubs ORDER BY name ASC').all();
  const allLinks = db.prepare('SELECT * FROM links').all();
  const allPosts = db.prepare('SELECT * FROM posts ORDER BY postedAt DESC').all();
  const allEvents = db.prepare('SELECT * FROM events ORDER BY start ASC').all();

  // Group links, posts, and events by clubId
  const linksByClub = new Map();
  for (const l of allLinks) {
    const cid = normalizeClubId(l.clubId);
    if (!cid) continue;
    if (!linksByClub.has(cid)) linksByClub.set(cid, []);
    linksByClub.get(cid).push(l);
  }

  const postsByClub = new Map();
  for (const p of allPosts) {
    const cid = normalizeClubId(p.clubId);
    if (!cid) continue;
    if (!postsByClub.has(cid)) postsByClub.set(cid, []);
    postsByClub.get(cid).push(p);
  }

  const eventsByClub = new Map();
  for (const e of allEvents) {
    const cid = normalizeClubId(e.clubId);
    if (!cid) continue;
    if (!eventsByClub.has(cid)) eventsByClub.set(cid, []);
    eventsByClub.get(cid).push(e);
  }

  // ── 3. Discover All Club Discord Invites & Query Public Discord Invite API ──
  const clubDiscordInvites = new Map(); // clubId -> { code, url, existingLabel, postId }

  for (const club of clubs) {
    const cid = normalizeClubId(club.id);
    const colClub = collectorById.get(cid);
    const cLinks = linksByClub.get(cid) || [];
    const cPosts = postsByClub.get(cid) || [];

    // Check collector/clubs.json first
    if (colClub?.discord) {
      const code = cleanInviteCode(colClub.discord);
      if (code) {
        clubDiscordInvites.set(cid, {
          code,
          url: `https://discord.gg/${code}`,
          existingLabel: colClub.discordServerName
            ? `Discord — ${colClub.discordServerName} (${colClub.discordMemberCount || 0} members · ${colClub.discordOnlineCount || 0} online)`
            : '',
          postId: null,
        });
      }
    }

    // Check existing Discord links in SQLite
    for (const l of cLinks) {
      if (
        String(l.kind || '').toLowerCase() === 'discord' ||
        /discord\.(?:gg|com\/invite)\//i.test(String(l.url || ''))
      ) {
        const code = cleanInviteCode(l.url);
        if (!code) continue;
        const prev = clubDiscordInvites.get(cid);
        const parsed = parseExistingInviteLabel(l.label);
        if (!prev || (parsed?.memberCount && !parseExistingInviteLabel(prev.existingLabel)?.memberCount)) {
          clubDiscordInvites.set(cid, {
            code,
            url: `https://discord.gg/${code}`,
            existingLabel: l.label || '',
            postId: l.postId || null,
          });
        }
      }
    }

    // Scan club bio and post captions for any additional Discord invites
    const textblobs = [club.bio || '', ...cPosts.map(p => p.caption || '')];
    for (const text of textblobs) {
      for (const m of text.matchAll(DISCORD_INVITE_RE)) {
        const code = cleanInviteCode(m[1]);
        if (code && !clubDiscordInvites.has(cid)) {
          clubDiscordInvites.set(cid, {
            code,
            url: `https://discord.gg/${code}`,
            existingLabel: '',
            postId: null,
          });
        }
      }
    }
  }

  // Resolve metadata for each discovered club Discord invite (concurrency 6)
  const resolvedDiscordByClub = new Map();
  const inviteEntries = Array.from(clubDiscordInvites.entries());
  const BATCH_SIZE = 6;

  for (let i = 0; i < inviteEntries.length; i += BATCH_SIZE) {
    const slice = inviteEntries.slice(i, i + BATCH_SIZE);
    await Promise.all(
      slice.map(async ([cid, info]) => {
        const club = clubs.find(c => normalizeClubId(c.id) === cid);
        const fallbackParsed = parseExistingInviteLabel(info.existingLabel);
        const colClub = collectorById.get(cid);

        let liveMeta = null;
        if (!offline) {
          liveMeta = await fetchPublicDiscordInvite(info.code);
        }

        const mergedMeta = {
          code: liveMeta?.code || info.code,
          url: liveMeta?.url || info.url,
          guildId: liveMeta?.guildId || colClub?.discordGuildId || null,
          serverName:
            liveMeta?.serverName ||
            fallbackParsed?.serverName ||
            colClub?.discordServerName ||
            `${club?.name || cid} Discord`,
          description: liveMeta?.description || colClub?.discordDescription || null,
          iconUrl: liveMeta?.iconUrl || colClub?.discordIconUrl || null,
          channelName: liveMeta?.channelName || 'announcements',
          memberCount:
            liveMeta?.memberCount ??
            fallbackParsed?.memberCount ??
            (club?.discordMemberCount <= 25000 ? club?.discordMemberCount : null) ??
            colClub?.discordMemberCount ??
            null,
          onlineCount:
            liveMeta?.onlineCount ??
            fallbackParsed?.onlineCount ??
            (club?.discordOnlineCount <= 25000 ? club?.discordOnlineCount : null) ??
            colClub?.discordOnlineCount ??
            null,
          scheduledEvents: liveMeta?.scheduledEvents || [],
          postId: info.postId || null,
        };

        if (isLikelyClubDiscordServer(mergedMeta, club)) {
          resolvedDiscordByClub.set(cid, mergedMeta);
        }
      })
    );
  }

  // ── 4. Prepare SQLite Statements for Autonomous Upserts ──
  const updateClubDiscordStmt = db.prepare(`
    UPDATE clubs
       SET discordMemberCount = COALESCE(?, discordMemberCount),
           discordOnlineCount = COALESCE(?, discordOnlineCount),
           memberCount        = MAX(COALESCE(memberCount, 0), COALESCE(followers, 0), COALESCE(?, 0)),
           email              = COALESCE(?, email),
           lastSyncedAt       = COALESCE(lastSyncedAt, ?)
     WHERE id = ?
  `);

  const upsertLinkStmt = db.prepare(`
    INSERT INTO links (id, clubId, clubName, url, label, kind, postId)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      clubName = COALESCE(excluded.clubName, links.clubName),
      url      = excluded.url,
      label    = excluded.label,
      kind     = excluded.kind,
      postId   = COALESCE(excluded.postId, links.postId)
  `);

  const upsertPostStmt = db.prepare(`
    INSERT INTO posts (
      id, clubId, postedAt, permalink, imageUrl, caption,
      type, important, title, summary, extractedBy, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      postedAt    = excluded.postedAt,
      permalink   = excluded.permalink,
      caption     = excluded.caption,
      type        = excluded.type,
      important   = excluded.important,
      title       = excluded.title,
      summary     = excluded.summary,
      extractedBy = excluded.extractedBy,
      source      = excluded.source
  `);

  const upsertAnnStmt = db.prepare(`
    INSERT INTO announcements (
      id, clubId, clubName, title, summary, important, postedAt, permalink, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      clubName  = excluded.clubName,
      title     = excluded.title,
      summary   = excluded.summary,
      important = excluded.important,
      postedAt  = excluded.postedAt,
      permalink = excluded.permalink,
      source    = excluded.source
  `);

  let discordPostsUpserted = 0;
  let discordAnnsUpserted = 0;
  let discordEventsUpserted = 0;
  let emailPostsUpserted = 0;
  let emailAnnsUpserted = 0;
  let emailLinksUpserted = 0;

  const nowIso = new Date().toISOString();

  // ── 5. Apply Autonomous Discord & Email Updates Across All 137 Clubs ──
  for (const club of clubs) {
    const cid = normalizeClubId(club.id);
    if (!cid || cid.startsWith('demo_')) continue;

    const colClub = collectorById.get(cid);
    const cPosts = postsByClub.get(cid) || [];
    const cEvents = eventsByClub.get(cid) || [];
    const discordMeta = resolvedDiscordByClub.get(cid) || null;

    const primaryEmail = (club.email || colClub?.email || '').trim() || null;
    const extraEmails = Array.isArray(colClub?.extraEmails)
      ? colClub.extraEmails.filter(Boolean)
      : [];

    // Update collector/clubs.json entry in memory
    if (colClub && discordMeta) {
      colClub.discord = discordMeta.url;
      colClub.discordServerName = discordMeta.serverName;
      if (discordMeta.memberCount != null) colClub.discordMemberCount = discordMeta.memberCount;
      if (discordMeta.onlineCount != null) colClub.discordOnlineCount = discordMeta.onlineCount;
      if (discordMeta.iconUrl) colClub.discordIconUrl = discordMeta.iconUrl;
    }

    // Update SQLite club row
    updateClubDiscordStmt.run(
      discordMeta?.memberCount ?? null,
      discordMeta?.onlineCount ?? null,
      discordMeta?.memberCount ?? 0,
      primaryEmail,
      nowIso,
      club.id
    );

    // 5A. Discord Invite Link, Source Registration, Scheduled Events & Community Feed Post
    if (discordMeta) {
      const countParts = [];
      if (discordMeta.memberCount != null) {
        countParts.push(`${Number(discordMeta.memberCount).toLocaleString()} members`);
      }
      if (discordMeta.onlineCount != null) {
        countParts.push(`${Number(discordMeta.onlineCount).toLocaleString()} online`);
      }
      const labelSuffix = countParts.length > 0 ? ` (${countParts.join(' · ')})` : '';
      const linkLabel = `Discord — ${discordMeta.serverName || club.name}${labelSuffix}`;

      upsertLinkStmt.run(
        `${cid}:${discordMeta.url}`,
        club.id,
        club.name,
        discordMeta.url,
        linkLabel,
        'discord',
        discordMeta.postId
      );

      setDictEntry(
        `source:discord:invite_${cid}`,
        {
          id: `discord:invite_${cid}`,
          clubId: club.id,
          platform: 'discord',
          identifier: discordMeta.url,
          serverName: discordMeta.serverName,
          memberCount: discordMeta.memberCount,
          onlineCount: discordMeta.onlineCount,
          iconUrl: discordMeta.iconUrl,
          enabled: true,
          autonomous: true,
          lastSyncedAt: nowIso,
        },
        { clubId: club.id, namespace: 'sources', source: 'discord' }
      );

      // Ingest any public Discord Guild Scheduled Events returned by the invite endpoint
      for (const sev of discordMeta.scheduledEvents || []) {
        if (!sev?.id || !sev?.name || !sev?.scheduled_start_time) continue;
        const loc =
          sev.entity_metadata?.location ||
          `Discord (${discordMeta.serverName || club.name})`;
        ingestResourceItem({
          id: `discord_evt_${sev.id}`,
          clubId: club.id,
          clubName: club.name,
          source: 'discord',
          postedAt: sev.scheduled_start_time,
          permalink: discordMeta.url,
          title: `${sev.name} (${discordMeta.serverName || club.name})`,
          caption: `${sev.name}\n${sev.description || ''}\nLocation: ${loc}`,
          eventStart: sev.scheduled_start_time,
          eventEnd: sev.scheduled_end_time || null,
          location: loc,
        });
        discordEventsUpserted++;
      }

      // Find the club's latest Discord-mentioning post or latest general post to anchor the Discord feed update
      const discordMentionPost = cPosts.find(p => /\bdiscord\b/i.test(p.caption || ''));
      const latestPost = discordMentionPost || cPosts[0] || null;
      const upcomingEvt =
        cEvents.find(e => e.start && new Date(e.start).getTime() >= Date.now() - 86400000) ||
        cEvents[0] ||
        null;

      const postedAt =
        latestPost?.postedAt ||
        upcomingEvt?.start ||
        club.lastPostAt ||
        nowIso;

      const headline = discordMentionPost?.title
        ? `${discordMeta.serverName || club.name} — ${discordMentionPost.title}`
        : upcomingEvt?.title
          ? `${discordMeta.serverName || club.name} — ${upcomingEvt.title}`
          : `${discordMeta.serverName || club.name} Official Discord Server${labelSuffix}`;

      const bodyLines = [];
      if (discordMeta.description) {
        bodyLines.push(discordMeta.description);
      }
      if (discordMentionPost?.caption) {
        bodyLines.push(discordMentionPost.caption.slice(0, 420));
      } else if (latestPost?.summary || latestPost?.caption) {
        bodyLines.push((latestPost.summary || latestPost.caption).slice(0, 360));
      } else if (club.bio || club.directoryDescription) {
        bodyLines.push(club.bio || club.directoryDescription);
      }
      if (upcomingEvt) {
        const evtDate = new Date(upcomingEvt.start).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
        bodyLines.push(
          `Next Event: ${upcomingEvt.title} on ${evtDate}${
            upcomingEvt.location ? ` @ ${upcomingEvt.location}` : ''
          }`
        );
      }
      bodyLines.push(
        `Join ${discordMeta.serverName || club.name} on Discord${labelSuffix}: ${discordMeta.url}`
      );

      const fullCaption = bodyLines.filter(Boolean).join('\n\n');
      const summaryText = bodyLines[0]
        ? `${bodyLines[0].slice(0, 220)}${labelSuffix ? ` · ${countParts.join(' · ')}` : ''}`
        : `Official ${club.name} Discord community${labelSuffix}.`;

      upsertPostStmt.run(
        `discord_agent_${cid}`,
        club.id,
        postedAt,
        discordMeta.url,
        discordMeta.iconUrl || null,
        fullCaption,
        upcomingEvt ? 'event' : 'announcement',
        discordMentionPost?.important ? 1 : 0,
        headline.slice(0, 140),
        summaryText.slice(0, 280),
        'github-agent',
        'discord'
      );
      discordPostsUpserted++;

      upsertAnnStmt.run(
        `ann_discord_agent_${cid}`,
        club.id,
        club.name,
        headline.slice(0, 140),
        summaryText.slice(0, 260),
        discordMentionPost?.important ? 1 : 0,
        postedAt,
        discordMeta.url,
        'discord'
      );
      discordAnnsUpserted++;
    }

    // Also mirror any club posts that explicitly announce Discord updates so they appear in the Discord channel filter
    for (const p of cPosts) {
      if (p.source === 'discord') continue;
      if (!/\bdiscord\b/i.test(p.caption || '')) continue;
      const targetUrl = discordMeta?.url || p.permalink || null;
      const postId = `discord_xref_${p.id}`;
      upsertPostStmt.run(
        postId,
        club.id,
        p.postedAt || nowIso,
        targetUrl,
        p.imageUrl || null,
        p.caption,
        p.type || 'announcement',
        p.important ? 1 : 0,
        p.title || `${club.name} Discord Update`,
        p.summary || (p.caption || '').slice(0, 240),
        'github-agent',
        'discord'
      );
      discordPostsUpserted++;
    }

    // 5B. Club Directory Email Indexing & Newsletter / Mailing List Feed Generation
    if (primaryEmail) {
      const allClubEmails = [
        primaryEmail,
        ...extraEmails.filter(e => e.toLowerCase() !== primaryEmail.toLowerCase()),
      ];

      for (const addr of allClubEmails) {
        const cleanAddr = String(addr).trim();
        if (!cleanAddr) continue;
        upsertLinkStmt.run(
          `${cid}:mailto:${cleanAddr}`,
          club.id,
          club.name,
          `mailto:${cleanAddr}`,
          `Email ${cleanAddr}`,
          'email',
          null
        );
        emailLinksUpserted++;
      }

      setDictEntry(
        `source:email:club_${cid}`,
        {
          id: `email:club_${cid}`,
          clubId: club.id,
          platform: 'email',
          identifier: primaryEmail,
          extraEmails,
          enabled: true,
          autonomous: true,
          lastSyncedAt: nowIso,
        },
        { clubId: club.id, namespace: 'sources', source: 'email' }
      );

      // Check if this club has email-mentioning posts, upcoming events, or recent announcements to publish as an Email bulletin
      const emailMentionPosts = cPosts.filter(
        p =>
          p.source !== 'email' &&
          (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(p.caption || '') ||
            /\b(?:newsletter|mailing list|email us|contact us at|listserv)\b/i.test(
              p.caption || ''
            ))
      );

      for (const ep of emailMentionPosts.slice(0, 2)) {
        upsertPostStmt.run(
          `email_xref_${ep.id}`,
          club.id,
          ep.postedAt || nowIso,
          `mailto:${primaryEmail}`,
          null,
          `${ep.caption || ''}\n\nOfficial Club Email: ${primaryEmail}`,
          ep.type || 'announcement',
          ep.important ? 1 : 0,
          ep.title || `${club.name} Mailing List Update`,
          ep.summary || (ep.caption || '').slice(0, 240),
          'github-agent',
          'email'
        );
        emailPostsUpserted++;
      }

      // Synthesize a primary official club email bulletin for clubs with events or active posts
      const latestClubPost = emailMentionPosts[0] || cPosts[0] || null;
      const nextClubEvent =
        cEvents.find(e => e.start && new Date(e.start).getTime() >= Date.now() - 86400000) ||
        cEvents[0] ||
        null;

      if (latestClubPost || nextClubEvent || discordMeta) {
        const bulletinDate =
          latestClubPost?.postedAt ||
          nextClubEvent?.start ||
          club.lastPostAt ||
          nowIso;

        const subjectLine = nextClubEvent?.title
          ? `${club.name} Newsletter — ${nextClubEvent.title}`
          : latestClubPost?.title
            ? `${club.name} Dispatch — ${latestClubPost.title}`
            : `${club.name} Official Mailing List & Board Contact (${primaryEmail})`;

        const lines = [];
        lines.push(`Official Club Contact: ${primaryEmail}`);
        if (extraEmails.length > 0) {
          lines.push(`Additional Board Contacts: ${extraEmails.join(', ')}`);
        }
        if (nextClubEvent) {
          const dtStr = new Date(nextClubEvent.start).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          });
          lines.push(
            `Upcoming Event: ${nextClubEvent.title} · ${dtStr}${
              nextClubEvent.location ? ` @ ${nextClubEvent.location}` : ''
            }`
          );
        }
        if (latestClubPost?.summary || latestClubPost?.caption) {
          lines.push((latestClubPost.summary || latestClubPost.caption).slice(0, 340));
        } else if (club.directoryDescription || club.bio) {
          lines.push(club.directoryDescription || club.bio);
        }
        if (discordMeta?.url) {
          lines.push(`Club Discord Server: ${discordMeta.url}`);
        }

        const emailBody = lines.filter(Boolean).join('\n\n');
        const emailSummary =
          lines.slice(0, 2).join(' · ').slice(0, 240) ||
          `Reach ${club.name} at ${primaryEmail}.`;

        upsertPostStmt.run(
          `email_agent_${cid}`,
          club.id,
          bulletinDate,
          `mailto:${primaryEmail}`,
          null,
          emailBody,
          nextClubEvent ? 'event' : 'announcement',
          latestClubPost?.important ? 1 : 0,
          subjectLine.slice(0, 140),
          emailSummary,
          'github-agent',
          'email'
        );
        emailPostsUpserted++;

        if (emailMentionPosts.length > 0 || nextClubEvent) {
          upsertAnnStmt.run(
            `ann_email_agent_${cid}`,
            club.id,
            club.name,
            subjectLine.slice(0, 140),
            emailSummary,
            0,
            bulletinDate,
            `mailto:${primaryEmail}`,
            'email'
          );
          emailAnnsUpserted++;
        }
      }
    }

    syncClubDictionary(club.id);
  }

  // Persist enriched Discord metadata back to collector/clubs.json if requested
  if (updateClubsJson && collectorClubs.length > 0) {
    try {
      fs.writeFileSync(
        COLLECTOR_CLUBS_PATH,
        JSON.stringify(collectorClubs, null, 2) + '\n',
        'utf8'
      );
    } catch (err) {
      console.warn('⚠️ Could not write enriched collector/clubs.json:', err.message);
    }
  }

  // ── 6. Optional Outbound Digest Dispatch (GitHub Actions workflow_dispatch or --send-digest) ──
  const outboundDigestResults = { discord: null, email: null };
  if (sendDigest) {
    const upcomingEvents = db
      .prepare('SELECT * FROM events WHERE start >= ? ORDER BY start ASC LIMIT 12')
      .all(new Date(Date.now() - 12 * 3600 * 1000).toISOString());

    try {
      outboundDigestResults.discord = await discordService.sendDiscordMessage({
        kind: 'digest',
        title: 'ClubHub Automated Schedule Digest',
        events: upcomingEvents,
      });
    } catch (err) {
      outboundDigestResults.discord = { ok: false, error: err.message };
    }

    try {
      outboundDigestResults.email = await emailService.sendEmailMessage({
        kind: 'digest',
        subject: 'ClubHub Automated Campus Schedule Digest',
        events: upcomingEvents,
      });
    } catch (err) {
      outboundDigestResults.email = { ok: false, error: err.message };
    }
  }

  // ── 7. Compute Final Integration Summary & Save to Dictionary Store ──
  const totalDiscordPosts =
    db.prepare("SELECT COUNT(*) AS c FROM posts WHERE source = 'discord'").get()?.c || 0;
  const totalDiscordAnns =
    db.prepare("SELECT COUNT(*) AS c FROM announcements WHERE source = 'discord'").get()?.c || 0;
  const totalDiscordEvents =
    db.prepare("SELECT COUNT(*) AS c FROM events WHERE source = 'discord'").get()?.c || 0;
  const totalDiscordLinks =
    db.prepare("SELECT COUNT(*) AS c FROM links WHERE kind = 'discord'").get()?.c || 0;

  const totalEmailPosts =
    db.prepare("SELECT COUNT(*) AS c FROM posts WHERE source = 'email'").get()?.c || 0;
  const totalEmailAnns =
    db.prepare("SELECT COUNT(*) AS c FROM announcements WHERE source = 'email'").get()?.c || 0;
  const totalEmailEvents =
    db.prepare("SELECT COUNT(*) AS c FROM events WHERE source = 'email'").get()?.c || 0;
  const totalClubEmails =
    db.prepare("SELECT COUNT(*) AS c FROM clubs WHERE email IS NOT NULL AND email != ''").get()
      ?.c || 0;

  const summary = {
    lastSyncedAt: new Date().toISOString(),
    startedAt,
    agentMode: 'github-actions-autonomous',
    workflowFile: '.github/workflows/discord-email-sync.yml',
    discord: {
      mode: liveDiscordResult.mode,
      botSynced: liveDiscordResult.synced || 0,
      serversIndexed: resolvedDiscordByClub.size,
      inviteLinksCount: totalDiscordLinks,
      postsCount: totalDiscordPosts,
      announcementsCount: totalDiscordAnns,
      eventsCount: totalDiscordEvents + discordEventsUpserted,
      agentPostsUpserted: discordPostsUpserted,
    },
    email: {
      mode: liveEmailResult.mode,
      imapSynced: liveEmailResult.synced || 0,
      clubEmailsIndexed: totalClubEmails,
      emailLinksCount: emailLinksUpserted,
      postsCount: totalEmailPosts,
      announcementsCount: totalEmailAnns,
      eventsCount: totalEmailEvents,
      agentPostsUpserted: emailPostsUpserted,
    },
    outboundDigest: outboundDigestResults,
  };

  const prevMeta = getDictEntry('meta:integrations_sync')?.value || {};
  setDictEntry(
    'meta:integrations_sync',
    { ...prevMeta, ...summary },
    { namespace: 'meta', source: 'github-agent' }
  );

  return summary;
}

export default {
  syncDiscordEmailAgent,
};
