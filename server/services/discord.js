// ── Discord Ingestion Service ──
// Connects Discord server announcements & messages to the ClubHub database.
// Uses Discord REST API when DISCORD_BOT_TOKEN is configured, or built-in UCSC club Discord messages in dev/demo mode.

import { getDb, formatPostRow } from '../database.js';
import { ingestResourceItem } from './resourceIngestor.js';

const DEMO_DISCORD_MESSAGES = [
  {
    id: 'discord_cs_msg_1',
    clubId: 'demo_ucsc_csclub',
    clubName: 'Computer Science Club',
    identifier: 'https://discord.gg/demoCSclub',
    title: 'Discord #announcements — Hackathon Team Formation',
    caption: '💬 [Discord #announcements] Hackathon team formation & pizza social on Friday at 5:00pm in Baskin Engineering 152! Join our Discord: https://discord.gg/demoCSclub',
    permalink: 'https://discord.gg/demoCSclub',
  },
  {
    id: 'discord_debate_msg_1',
    clubId: 'demo_ucsc_debate',
    clubName: 'Debate Society',
    identifier: 'https://discord.gg/ucscdebate',
    title: 'Discord #practice — Topic Announcement',
    caption: '💬 [Discord #practice] Motion for Thursday 4:30pm practice in Humanities 1 room 110 is now posted in #motions!',
    permalink: 'https://discord.gg/ucscdebate',
  },
];

export class DiscordService {
  async syncDiscord({ clubId = null, channelId = null } = {}) {
    const token = process.env.DISCORD_BOT_TOKEN;

    if (token && channelId) {
      const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=20`, {
        headers: { Authorization: `Bot ${token}` },
      });
      if (!res.ok) throw new Error(`Discord API returned ${res.status}`);
      const messages = await res.json();
      const results = [];
      for (const msg of messages) {
        if (!msg.content) continue;
        results.push(
          ingestResourceItem({
            clubId: clubId || 'demo_ucsc_csclub',
            source: 'discord',
            id: `discord_${msg.id}`,
            caption: msg.content,
            postedAt: msg.timestamp,
            identifier: `channel:${channelId}`,
          })
        );
      }
      return { source: 'discord', synced: results.length, mode: 'live' };
    }

    // Demo / local sync
    const items = clubId
      ? DEMO_DISCORD_MESSAGES.filter(m => m.clubId === clubId)
      : DEMO_DISCORD_MESSAGES;

    for (const item of items) {
      ingestResourceItem({
        ...item,
        source: 'discord',
        postedAt: new Date().toISOString(),
      });
    }

    return { source: 'discord', synced: items.length, mode: 'demo' };
  }

  getClubMessages(clubId) {
    const db = getDb();
    return db
      .stmt("SELECT * FROM posts WHERE clubId = ? AND source = 'discord' ORDER BY postedAt DESC")
      .all(clubId)
      .map(formatPostRow);
  }
}

export default new DiscordService();
