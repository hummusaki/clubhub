// ── Unified Outbound Discord & Email Dispatcher (Express Backend + Static Browser Fallbacks) ──
// Ensures Discord sharing & Email digests/invites work seamlessly both when connected to the
// Express backend (Bot / Webhook / SMTP / Resend) AND in static GitHub Pages mode (Direct
// Discord Incoming Webhook + mailto: + .ics download).

import {
  testDiscordIntegration,
  sendDiscordMessage,
  testEmailIntegration,
  sendEmailMessage,
} from '../api/client'
import { buildIcsCalendar, downloadIcsFile } from './calendarSync'

const LOCAL_INTEGRATIONS_STORAGE_KEY = 'clubhub_local_integrations_v1'

export const DISCORD_WEBHOOK_URL_RE =
  /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/(\d{15,22})\/([\w-]+)$/i

export function isValidDiscordWebhookUrl(url = '') {
  return DISCORD_WEBHOOK_URL_RE.test(String(url || '').trim().split(/[?#]/)[0])
}

export function sanitizeDiscordWebhookUrl(url = '') {
  const cleaned = String(url || '').trim().split(/[?#]/)[0]
  const match = cleaned.match(DISCORD_WEBHOOK_URL_RE)
  if (!match) return ''
  return `https://discord.com/api/webhooks/${match[1]}/${match[2]}`
}

export function getLocalIntegrationPrefs(accountKey = 'guest') {
  if (typeof localStorage === 'undefined') return {}
  try {
    const map = JSON.parse(localStorage.getItem(LOCAL_INTEGRATIONS_STORAGE_KEY) || '{}')
    return map[accountKey || 'guest'] || {}
  } catch {
    return {}
  }
}

export function saveLocalIntegrationPrefs(accountKey = 'guest', patch = {}) {
  if (typeof localStorage === 'undefined') return {}
  try {
    const key = accountKey || 'guest'
    const map = JSON.parse(localStorage.getItem(LOCAL_INTEGRATIONS_STORAGE_KEY) || '{}')
    const prev = map[key] || {}
    const next = { ...prev, ...patch }
    if (patch.discordWebhookUrl !== undefined && !String(patch.discordWebhookUrl).includes('••••')) {
      next.discordWebhookUrl = patch.discordWebhookUrl
        ? sanitizeDiscordWebhookUrl(patch.discordWebhookUrl)
        : ''
    }
    map[key] = next
    localStorage.setItem(LOCAL_INTEGRATIONS_STORAGE_KEY, JSON.stringify(map))
    return next
  } catch {
    return patch
  }
}

function buildBrowserDiscordPayload({
  kind = 'announcement',
  title = '',
  message = '',
  clubName = 'ClubHub',
  url = '',
  events = [],
  poll = null,
} = {}) {
  const nowIso = new Date().toISOString()

  if (kind === 'test') {
    return {
      username: 'ClubHub Campus Sync',
      embeds: [
        {
          title: title || 'ClubHub Discord Integration Connected',
          description:
            message ||
            'Direct Discord webhook alerts, schedule digests, and Group Availability polls are active.',
          color: 0x5865f2,
          footer: { text: 'ClubHub Campus Workspace' },
          timestamp: nowIso,
        },
      ],
    }
  }

  if (kind === 'digest') {
    const list = (events || []).slice(0, 10)
    const lines = list.map(ev => {
      const startRaw = ev.startIso || ev.start
      const dt = startRaw ? new Date(startRaw) : null
      const unix = dt && !Number.isNaN(dt.getTime()) ? Math.floor(dt.getTime() / 1000) : null
      const evTitle = ev.event || ev.title || 'Club Event'
      const evClub = ev.club || ev.clubName || ''
      const loc = ev.location ? ` · 📍 ${ev.location}` : ''
      const timeTag = unix ? `<t:${unix}:f> (<t:${unix}:R>)` : ev.date || 'Upcoming'
      return `• **${evClub ? `${evClub}: ` : ''}${evTitle}**\n  🗓️ ${timeTag}${loc}`
    })

    return {
      username: 'ClubHub Schedule Digest',
      embeds: [
        {
          title:
            title || `📅 Upcoming Club Schedule (${list.length} Event${list.length === 1 ? '' : 's'})`,
          description:
            lines.join('\n\n') || message || 'No upcoming events matched your current ClubHub filter.',
          url: url || undefined,
          color: 0xf2a900,
          footer: { text: 'Synced from ClubHub Calendar' },
          timestamp: nowIso,
        },
      ],
    }
  }

  if (kind === 'poll' || poll) {
    const pollTitle = poll?.title || title || 'Group Availability Poll'
    const voteUrl = poll?.url || url || ''
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
          footer: { text: `${clubName} · ClubHub Availability` },
          timestamp: nowIso,
        },
      ],
    }
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
  }
}

export async function dispatchDiscordNotification(options = {}) {
  const accountKey = options.accountKey || 'guest'
  const localPrefs = getLocalIntegrationPrefs(accountKey)
  const rawWebhook =
    options.webhookUrl && !String(options.webhookUrl).includes('••••')
      ? options.webhookUrl
      : localPrefs.discordWebhookUrl || ''

  const apiFn = options.kind === 'test' ? testDiscordIntegration : sendDiscordMessage
  const backendRes = await apiFn({
    ...options,
    webhookUrl: rawWebhook || options.webhookUrl,
  })

  if (backendRes?.ok) {
    return { ...backendRes, mode: 'server' }
  }

  // Fallback to direct browser-to-Discord Webhook POST when running in static mode
  const cleanWebhook = sanitizeDiscordWebhookUrl(rawWebhook)
  if (cleanWebhook && (backendRes?.offline || !options.channelId)) {
    const payload = buildBrowserDiscordPayload(options)
    const res = await fetch(cleanWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      throw new Error(`Discord Webhook returned HTTP ${res.status}. Check that the webhook URL is still active.`)
    }
    return { ok: true, via: 'browser_webhook', mode: 'direct' }
  }

  throw new Error(
    backendRes?.error ||
      'Connect a Discord Webhook URL or start the ClubHub backend server to post to Discord.'
  )
}

export function buildMailtoUrl({ to = '', subject = '', body = '' } = {}) {
  const cleanTo = String(to || '').trim()
  const params = new URLSearchParams()
  if (subject) params.set('subject', subject)
  if (body) params.set('body', body)
  const qs = params.toString().replace(/\+/g, '%20')
  return `mailto:${encodeURIComponent(cleanTo)}${qs ? `?${qs}` : ''}`
}

export function openMailtoLink(mailtoUrl) {
  if (typeof window === 'undefined' || !mailtoUrl) return
  const a = document.createElement('a')
  a.href = mailtoUrl
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export async function dispatchEmailNotification(
  options = {},
  { allowMailtoFallback = true, downloadIcsOnFallback = false } = {}
) {
  const accountKey = options.accountKey || 'guest'
  const localPrefs = getLocalIntegrationPrefs(accountKey)
  const recipient = String(options.to || localPrefs.recipientEmail || '').trim()

  const apiFn = options.kind === 'test' ? testEmailIntegration : sendEmailMessage
  const backendRes = await apiFn({
    ...options,
    to: recipient || undefined,
  })

  if (backendRes?.ok) {
    return { ...backendRes, mode: 'server' }
  }

  const canFallback =
    allowMailtoFallback &&
    (backendRes?.offline ||
      /not configured|not reachable|recipient email/i.test(backendRes?.error || ''))

  if (canFallback) {
    let subject = options.subject || options.title || 'ClubHub Update'
    let body = options.message || ''

    if (options.kind === 'digest') {
      const list = (options.events || []).slice(0, 15)
      subject = `ClubHub Schedule Digest (${list.length} Upcoming Events)`
      const lines = list.map(ev => {
        const evTitle = ev.event || ev.title || 'Club Event'
        const evClub = ev.club || ev.clubName || ''
        const dtStr = ev.time || ev.date || (ev.startIso ? new Date(ev.startIso).toLocaleString() : '')
        const loc = ev.location ? ` @ ${ev.location}` : ''
        return `• ${evClub ? `[${evClub}] ` : ''}${evTitle} — ${dtStr}${loc}`
      })
      body = `Upcoming ClubHub Schedule:\n\n${lines.join('\n') || 'No upcoming events.'}${
        options.url ? `\n\nView on ClubHub: ${options.url}` : ''
      }`
      if (downloadIcsOnFallback && list.length > 0) {
        const ics = buildIcsCalendar(list, { calendarName: 'ClubHub Schedule Digest' })
        downloadIcsFile(ics, 'clubhub-upcoming-events.ics')
      }
    } else if (options.kind === 'poll' || options.poll) {
      const pollTitle = options.poll?.title || options.title || 'Group Availability Poll'
      const voteUrl = options.poll?.url || options.url || ''
      subject = `[${options.clubName || 'ClubHub'}] Vote on Meeting Times: ${pollTitle}`
      body = [
        options.message || `Please mark the times you're free for "${pollTitle}".`,
        options.poll?.duration ? `Target Duration: ${options.poll.duration} hr` : '',
        voteUrl ? `Vote here: ${voteUrl}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
    } else if (options.url) {
      body = `${body}\n\n${options.url}`.trim()
    }

    const mailtoUrl = buildMailtoUrl({ to: recipient, subject, body })
    openMailtoLink(mailtoUrl)
    return { ok: true, via: 'mailto', mode: 'client_mailto' }
  }

  throw new Error(
    backendRes?.error ||
      'Configure Email SMTP (Gmail/UCSC App Password) or Resend API in Settings -> Integrations.'
  )
}
