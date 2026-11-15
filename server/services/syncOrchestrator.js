// ── Multi-Source Sync Orchestrator ──
// Coordinates syncing across Instagram, Discord, Email, Google Calendar, and Club Websites.

import instagramService from './instagram.js';
import discordService from './discord.js';
import emailService from './email.js';
import googleCalendarService from './googleCalendar.js';
import websiteService from './website.js';
import rosterService from './roster.js';
import { getDataSources } from './resourceIngestor.js';

export class SyncOrchestrator {
  async syncPlatform(platform, options = {}) {
    switch (platform) {
      case 'instagram':
        return instagramService.syncInstagram(options);
      case 'discord':
        return discordService.syncDiscord(options);
      case 'email':
        return emailService.syncEmail(options);
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
    const googleCalendar = await googleCalendarService.syncCalendar(options);
    const website = await websiteService.syncWebsite(options);

    return {
      syncedAt: new Date().toISOString(),
      instagram,
      discord,
      email,
      googleCalendar,
      website,
    };
  }

  getSources({ clubId, platform } = {}) {
    return getDataSources({ clubId, platform });
  }
}

export default new SyncOrchestrator();
