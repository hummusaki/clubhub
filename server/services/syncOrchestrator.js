// ── Multi-Source Sync Orchestrator ──
// Coordinates syncing across Instagram, Discord, Email, Google Calendar, and Club Websites.

import instagramService from './instagram.js';
import discordService from './discord.js';
import emailService from './email.js';
import googleCalendarService from './googleCalendar.js';
import websiteService from './website.js';
import rosterService from './roster.js';
import { syncDiscordEmailAgent } from './discordEmailAgent.js';
import { getDataSources } from './resourceIngestor.js';

export class SyncOrchestrator {
  async syncPlatform(platform, options = {}) {
    switch (platform) {
      case 'instagram':
        return instagramService.syncInstagram(options);
      case 'discord': {
        const botRes = await discordService.syncDiscord(options);
        const agentSummary = await syncDiscordEmailAgent(options);
        return {
          ...botRes,
          mode: botRes.mode === 'live' ? 'live' : 'autonomous',
          synced: (Number(botRes.synced) || 0) + (Number(agentSummary.discord?.postsCount) || 0),
          channelsChecked:
            (Number(botRes.channelsChecked) || 0) +
            (Number(agentSummary.discord?.serversIndexed) || 0),
          scheduledEventsSynced:
            (Number(botRes.scheduledEventsSynced) || 0) +
            (Number(agentSummary.discord?.eventsCount) || 0),
          agent: agentSummary.discord,
        };
      }
      case 'email': {
        const imapRes = await emailService.syncEmail(options);
        const agentSummary = await syncDiscordEmailAgent(options);
        return {
          ...imapRes,
          mode: imapRes.mode === 'live' ? 'live' : 'autonomous',
          synced: (Number(imapRes.synced) || 0) + (Number(agentSummary.email?.postsCount) || 0),
          messagesChecked:
            (Number(imapRes.messagesChecked) || 0) +
            (Number(agentSummary.email?.clubEmailsIndexed) || 0),
          agent: agentSummary.email,
        };
      }
      case 'discord_email':
        return syncDiscordEmailAgent(options);
      case 'google_calendar':
        return googleCalendarService.syncCalendar(options);
      case 'website':
        return websiteService.syncWebsite(options);
      case 'roster':
        return rosterService.syncRoster(options);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  async syncAll(options = {}) {
    const instagram = await instagramService.syncInstagram(options);
    const discord = await discordService.syncDiscord(options);
    const email = await emailService.syncEmail(options);
    const agent = await syncDiscordEmailAgent(options);
    const googleCalendar = await googleCalendarService.syncCalendar(options);
    const website = await websiteService.syncWebsite(options);

    return {
      syncedAt: new Date().toISOString(),
      instagram,
      discord,
      email,
      agent,
      googleCalendar,
      website,
    };
  }

  getSources({ clubId, platform } = {}) {
    return getDataSources({ clubId, platform });
  }
}

export default new SyncOrchestrator();
