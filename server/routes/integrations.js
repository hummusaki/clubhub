// ── Discord & Email Integrations Management, Verification & Outbound Routes (/api/integrations) ──

import { Router } from 'express';
import {
  getIntegrationConfig,
  saveIntegrationConfig,
  maskSecret,
} from '../database.js';
import discordService, {
  isMaskedValue,
  sanitizeDiscordWebhookUrl,
} from '../services/discord.js';
import {
  getScoutedDiscordServers,
  scoutClubDiscordServers,
} from '../services/discordScout.js';
import emailService, {
  verifyImapConnection,
  verifySmtpConnection,
  isValidEmailAddress,
} from '../services/email.js';

const router = Router();

function cleanAccountKey(raw) {
  const s = String(raw || 'guest').trim().slice(0, 120);
  return s || 'guest';
}

function getSubscriptionRecord(accountKey) {
  const key = `sub:${cleanAccountKey(accountKey)}`;
  return getIntegrationConfig(key)?.config || {};
}

// GET /api/integrations/status — live Discord + Email configuration, bot guilds/channels, and sync counts
router.get('/status', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const discord = await discordService.getStatus({ forceRefresh });
    const email = emailService.getStatus();
    const accountKey = req.query.accountKey ? cleanAccountKey(req.query.accountKey) : null;
    const sub = accountKey ? getSubscriptionRecord(accountKey) : null;

    res.json({
      discord,
      email,
      subscription: sub
        ? {
            recipientEmail: sub.recipientEmail || '',
            discordChannelId: sub.discordChannelId || '',
            discordWebhookConfigured: Boolean(sub.discordWebhookUrl),
            discordWebhookMasked: maskSecret(sub.discordWebhookUrl || ''),
            autoPushAnnouncements: Boolean(sub.autoPushAnnouncements),
            digestIncludeRsvpOnly: Boolean(sub.digestIncludeRsvpOnly),
          }
        : null,
      webhooks: {
        discord: '/api/webhooks/discord',
        email: '/api/webhooks/email',
        instagram: '/api/webhooks/instagram',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/integrations/config — save runtime Discord and/or Email credentials & defaults
router.put('/config', async (req, res) => {
  try {
    const { discord, email, platform, config, verifyEmail = false } = req.body || {};
    const discordPatch =
      discord && typeof discord === 'object'
        ? discord
        : platform === 'discord' && config && typeof config === 'object'
          ? config
          : null;
    const emailPatch =
      email && typeof email === 'object'
        ? email
        : platform === 'email' && config && typeof config === 'object'
          ? config
          : null;

    if (discordPatch) {
      discordService.saveConfig(discordPatch);
    }
    if (emailPatch) {
      emailService.saveConfig(emailPatch);
    }

    let emailVerification = null;
    if (verifyEmail) {
      emailVerification = { imap: null, smtp: null };
      const emailStatus = emailService.getStatus();
      if (emailStatus.inboundReady) {
        try {
          emailVerification.imap = await verifyImapConnection();
        } catch (err) {
          emailVerification.imap = { ok: false, error: err.message };
        }
      }
      if (emailStatus.activeTransport === 'smtp') {
        try {
          emailVerification.smtp = await verifySmtpConnection();
        } catch (err) {
          emailVerification.smtp = { ok: false, error: err.message };
        }
      }
    }

    const discordStatus = await discordService.getStatus({ forceRefresh: Boolean(discord) });
    const emailStatus = emailService.getStatus();

    res.json({
      ok: true,
      discord: discordStatus,
      email: emailStatus,
      emailVerification,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/integrations/subscriptions — read user alert & digest preferences
router.get('/subscriptions', (req, res) => {
  const accountKey = cleanAccountKey(req.query.accountKey);
  const sub = getSubscriptionRecord(accountKey);
  res.json({
    accountKey,
    recipientEmail: sub.recipientEmail || '',
    discordChannelId: sub.discordChannelId || '',
    discordWebhookConfigured: Boolean(sub.discordWebhookUrl),
    discordWebhookMasked: maskSecret(sub.discordWebhookUrl || ''),
    autoPushAnnouncements: Boolean(sub.autoPushAnnouncements),
    digestIncludeRsvpOnly: Boolean(sub.digestIncludeRsvpOnly),
  });
});

// PUT /api/integrations/subscriptions — save user alert & digest preferences
router.put('/subscriptions', (req, res) => {
  try {
    const {
      accountKey: rawKey,
      recipientEmail,
      discordWebhookUrl,
      discordChannelId,
      autoPushAnnouncements,
      digestIncludeRsvpOnly,
    } = req.body || {};
    const accountKey = cleanAccountKey(rawKey);
    const prev = getSubscriptionRecord(accountKey);
    const next = { ...prev };

    if (recipientEmail !== undefined) {
      const cleanEmail = String(recipientEmail || '').trim();
      if (cleanEmail && !isValidEmailAddress(cleanEmail)) {
        return res.status(400).json({ error: `Invalid email address: "${cleanEmail}"` });
      }
      next.recipientEmail = cleanEmail;
    }

    if (discordWebhookUrl !== undefined && !isMaskedValue(discordWebhookUrl)) {
      const rawUrl = String(discordWebhookUrl || '').trim();
      next.discordWebhookUrl = rawUrl ? sanitizeDiscordWebhookUrl(rawUrl) : '';
    }

    if (discordChannelId !== undefined) {
      next.discordChannelId = String(discordChannelId || '').trim();
    }
    if (autoPushAnnouncements !== undefined) {
      next.autoPushAnnouncements = Boolean(autoPushAnnouncements);
    }
    if (digestIncludeRsvpOnly !== undefined) {
      next.digestIncludeRsvpOnly = Boolean(digestIncludeRsvpOnly);
    }

    saveIntegrationConfig(`sub:${accountKey}`, {
      scope: 'user',
      platform: 'alerts',
      config: next,
    });

    res.json({
      ok: true,
      accountKey,
      recipientEmail: next.recipientEmail || '',
      discordChannelId: next.discordChannelId || '',
      discordWebhookConfigured: Boolean(next.discordWebhookUrl),
      discordWebhookMasked: maskSecret(next.discordWebhookUrl || ''),
      autoPushAnnouncements: Boolean(next.autoPushAnnouncements),
      digestIncludeRsvpOnly: Boolean(next.digestIncludeRsvpOnly),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/integrations/discord/test — send a live verification embed to Discord
router.post('/discord/test', async (req, res) => {
  try {
    const { webhookUrl, channelId, accountKey, title, message } = req.body || {};
    const sub = accountKey ? getSubscriptionRecord(accountKey) : {};
    const effectiveWebhook =
      webhookUrl && !isMaskedValue(webhookUrl) ? webhookUrl : sub.discordWebhookUrl || undefined;
    const effectiveChannel = channelId || sub.discordChannelId || undefined;

    const result = await discordService.sendDiscordNotification({
      kind: 'test',
      webhookUrl: effectiveWebhook,
      channelId: effectiveChannel,
      title,
      message,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/integrations/discord/send — send schedule digest, announcement, or availability poll to Discord
router.post('/discord/send', async (req, res) => {
  try {
    const {
      kind = 'announcement',
      webhookUrl,
      channelId,
      accountKey,
      title,
      message,
      clubName,
      url,
      events,
      poll,
      task,
    } = req.body || {};
    const sub = accountKey ? getSubscriptionRecord(accountKey) : {};
    const effectiveWebhook =
      webhookUrl && !isMaskedValue(webhookUrl) ? webhookUrl : sub.discordWebhookUrl || undefined;
    const effectiveChannel = channelId || sub.discordChannelId || undefined;

    const result = await discordService.sendDiscordNotification({
      kind,
      webhookUrl: effectiveWebhook,
      channelId: effectiveChannel,
      title,
      message,
      clubName,
      url,
      events,
      poll,
      task,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/integrations/discord/scout — list discovered club Discord servers & followability status
router.get('/discord/scout', async (req, res) => {
  try {
    const report = await getScoutedDiscordServers({ checkBotLive: true });
    res.json({ ok: true, ...report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/integrations/discord/scout — actively crawl club websites/Linktrees & query Discord Invite API
router.post('/discord/scout', async (req, res) => {
  try {
    const {
      crawlWebsites = true,
      forceCrawlAll = false,
      forceRefreshInvites = false,
    } = req.body || {};
    const report = await scoutClubDiscordServers({
      crawlWebsites: Boolean(crawlWebsites),
      forceCrawlAll: Boolean(forceCrawlAll),
      forceRefreshInvites: Boolean(forceRefreshInvites),
      persistCatalog: true,
      writePublicJson: true,
    });
    res.json({ ok: true, ...report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/integrations/discord/follow — programmatically follow an Announcement Channel (`type: 5`) into aggregator
router.post('/discord/follow', async (req, res) => {
  try {
    const { sourceChannelId, targetChannelId } = req.body || {};
    const result = await discordService.followAnnouncementChannel({
      sourceChannelId,
      targetChannelId,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/integrations/email/verify — test live IMAP and/or SMTP socket login
router.post('/email/verify', async (req, res) => {
  try {
    const customConfig = req.body?.config && typeof req.body.config === 'object' ? req.body.config : {};
    const checkImap = req.body?.imap !== false;
    const checkSmtp = req.body?.smtp !== false;

    const out = { ok: true, imap: null, smtp: null };
    if (checkImap) {
      try {
        out.imap = await verifyImapConnection(customConfig);
      } catch (err) {
        out.imap = { ok: false, error: err.message };
        out.ok = false;
      }
    }
    if (checkSmtp) {
      try {
        out.smtp = await verifySmtpConnection(customConfig);
      } catch (err) {
        out.smtp = { ok: false, error: err.message };
        out.ok = false;
      }
    }
    res.status(out.ok ? 200 : 400).json(out);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/integrations/email/test — send a live verification email
router.post('/email/test', async (req, res) => {
  try {
    const { to, accountKey, title, message, url } = req.body || {};
    const sub = accountKey ? getSubscriptionRecord(accountKey) : {};
    const recipient = to || sub.recipientEmail || undefined;

    const result = await emailService.sendNotification({
      kind: 'test',
      to: recipient,
      title,
      message,
      url,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/integrations/email/send — send schedule digest (.ics), announcement, or poll invite via email
router.post('/email/send', async (req, res) => {
  try {
    const {
      kind = 'announcement',
      to,
      accountKey,
      subject,
      title,
      message,
      clubName,
      url,
      events,
      poll,
      attachIcs = true,
    } = req.body || {};
    const sub = accountKey ? getSubscriptionRecord(accountKey) : {};
    const recipient = to || sub.recipientEmail || undefined;

    const result = await emailService.sendNotification({
      kind,
      to: recipient,
      subject,
      title,
      message,
      clubName,
      url,
      events,
      poll,
      task: req.body?.task,
      attachIcs,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
