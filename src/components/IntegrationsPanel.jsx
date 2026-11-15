import { useState, useEffect, useCallback } from 'react'
import {
  Check,
  Copy,
  ExternalLink,
  RefreshCw,
  Send,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Calendar,
  AlertCircle,
  Sparkles,
  Search,
  X,
} from 'lucide-react'
import { Card, BubbleTag, ToggleSwitch, SectionHeader, cleanText, Button, IconButton, FilterChip } from './ui'
import { matchesSearchQuery } from '../utils/search'
import { PlatformIcon } from './icons'
import {
  getIntegrationsStatus,
  saveIntegrationConfig,
  saveIntegrationSubscription,
  verifyEmailIntegration,
  getScoutedDiscordServers,
  runDiscordServerScout,
  followDiscordAnnouncementChannel,
  registerSource,
  deleteSource,
  syncAllSources,
} from '../api/client'
import {
  isValidDiscordWebhookUrl,
  getLocalIntegrationPrefs,
  saveLocalIntegrationPrefs,
  dispatchDiscordNotification,
  dispatchEmailNotification,
} from '../utils/directIntegrations'

export default function IntegrationsPanel({
  accountKey = 'guest',
  accountEmail = '',
  clubs = [],
  syncedEvents = [],
  isCompact = false,
  delay = 0,
  onRefresh,
  onNotify,
}) {
  const [activeTab, setActiveTab] = useState('discord') // 'discord' | 'email'
  const [statusLoading, setStatusLoading] = useState(true)
  const [backendOnline, setBackendOnline] = useState(false)
  const [statusData, setStatusData] = useState(null)

  // User-level outbound destination state
  const localPrefs = getLocalIntegrationPrefs(accountKey)
  const [discordWebhookInput, setDiscordWebhookInput] = useState(localPrefs.discordWebhookUrl || '')
  const [selectedBotChannelId, setSelectedBotChannelId] = useState('')
  const [recipientEmailInput, setRecipientEmailInput] = useState(
    localPrefs.recipientEmail || accountEmail || ''
  )
  const [autoPushAnnouncements, setAutoPushAnnouncements] = useState(
    Boolean(localPrefs.autoPushAnnouncements)
  )

  // Action busy states & feedback banners
  const [busyAction, setBusyAction] = useState('')
  const [feedbackBanner, setFeedbackBanner] = useState(null) // { tone: 'green'|'red'|'blue'|'yellow', text }

  // Inbound source connection form state
  const [discordSourceClubId, setDiscordSourceClubId] = useState('all')
  const [discordSourceIdentifier, setDiscordSourceIdentifier] = useState('')
  const [emailSourceClubId, setEmailSourceClubId] = useState('')
  const [emailSourceIdentifier, setEmailSourceIdentifier] = useState('')

  // Advanced server credentials accordion state
  const [showDiscordConfig, setShowDiscordConfig] = useState(false)
  const [botTokenInput, setBotTokenInput] = useState('')
  const [aggGuildIdInput, setAggGuildIdInput] = useState('')
  const [defaultDiscordClubId, setDefaultDiscordClubId] = useState('')

  const [showEmailConfig, setShowEmailConfig] = useState(false)
  const [emailProvider, setEmailProvider] = useState('auto')
  const [emailUserInput, setEmailUserInput] = useState('')
  const [emailPasswordInput, setEmailPasswordInput] = useState('')
  const [imapHostInput, setImapHostInput] = useState('imap.gmail.com')
  const [imapPortInput, setImapPortInput] = useState(993)
  const [smtpHostInput, setSmtpHostInput] = useState('smtp.gmail.com')
  const [smtpPortInput, setSmtpPortInput] = useState(465)
  const [fromEmailInput, setFromEmailInput] = useState('')
  const [resendKeyInput, setResendKeyInput] = useState('')
  const [copiedKey, setCopiedKey] = useState('')

  // Club Discord Scout & Followability state
  const [scoutData, setScoutData] = useState(null)
  const [scoutFilter, setScoutFilter] = useState('all') // 'all' | 'followable' | 'synced' | 'other'
  const [scoutQuery, setScoutQuery] = useState('')

  const notify = useCallback(
    (msg, type = 'success') => {
      if (onNotify) onNotify(msg, { type })
    },
    [onNotify]
  )

  const loadStatus = useCallback(
    async (forceRefresh = false) => {
      setStatusLoading(true)
      const data = await getIntegrationsStatus({
        accountKey,
        ...(forceRefresh ? { refresh: '1' } : {}),
      })

      if (data && data.discord && data.email) {
        setBackendOnline(true)
        setStatusData(data)

        const d = data.discord
        const e = data.email
        const sub = data.subscription

        if (d.botTokenMasked && !botTokenInput) setBotTokenInput(d.botTokenMasked)
        if (d.aggregatorGuildId !== undefined) setAggGuildIdInput(d.aggregatorGuildId || '')
        if (d.defaultClubId !== undefined) setDefaultDiscordClubId(d.defaultClubId || '')
        setSelectedBotChannelId(prev => prev || sub?.discordChannelId || d.defaultChannelId || '')

        if (!discordWebhookInput) {
          if (sub?.discordWebhookMasked) setDiscordWebhookInput(sub.discordWebhookMasked)
          else if (d.webhookUrlMasked) setDiscordWebhookInput(d.webhookUrlMasked)
        }

        if (sub?.recipientEmail) {
          setRecipientEmailInput(sub.recipientEmail)
        } else if (e.defaultRecipient && !recipientEmailInput) {
          setRecipientEmailInput(e.defaultRecipient)
        }
        if (sub?.autoPushAnnouncements !== undefined) {
          setAutoPushAnnouncements(Boolean(sub.autoPushAnnouncements))
        }

        setEmailProvider(e.provider || 'auto')
        if (e.emailUser) setEmailUserInput(e.emailUser)
        if (e.emailPasswordMasked && !emailPasswordInput) setEmailPasswordInput(e.emailPasswordMasked)
        if (e.imapHost) setImapHostInput(e.imapHost)
        if (e.imapPort) setImapPortInput(e.imapPort)
        if (e.smtpHost) setSmtpHostInput(e.smtpHost)
        if (e.smtpPort) setSmtpPortInput(e.smtpPort)
        if (e.fromEmail) setFromEmailInput(e.fromEmail)
        if (e.resendApiKeyMasked && !resendKeyInput) setResendKeyInput(e.resendApiKeyMasked)
      } else {
        setBackendOnline(false)
      }

      const scout = await getScoutedDiscordServers()
      if (scout && Array.isArray(scout.servers)) {
        setScoutData(scout)
      }
      setStatusLoading(false)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountKey]
  )

  useEffect(() => {
    loadStatus(false)
  }, [loadStatus])

  useEffect(() => {
    if (!emailSourceClubId && clubs.length > 0) {
      setEmailSourceClubId(String(clubs[0].id))
    }
  }, [clubs, emailSourceClubId])

  useEffect(() => {
    const local = getLocalIntegrationPrefs(accountKey)
    if (local.recipientEmail) {
      setRecipientEmailInput(local.recipientEmail)
    } else if (accountEmail && !recipientEmailInput) {
      setRecipientEmailInput(accountEmail)
    }
    if (local.discordWebhookUrl && !discordWebhookInput) {
      setDiscordWebhookInput(local.discordWebhookUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountKey, accountEmail])

  async function handleCopyText(key, value, label = 'Copied to clipboard!') {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(prev => (prev === key ? '' : prev)), 2000)
      notify(label)
    } catch {
      // ignore clipboard errors
    }
  }

  // ── Discord Handlers ──

  async function handleSaveDiscordDestination() {
    const trimmedWebhook = discordWebhookInput.trim()
    if (
      trimmedWebhook &&
      !trimmedWebhook.includes('••••') &&
      !isValidDiscordWebhookUrl(trimmedWebhook)
    ) {
      setFeedbackBanner({
        tone: 'red',
        text: 'Invalid Discord Webhook URL. Expected https://discord.com/api/webhooks/<id>/<token>.',
      })
      return
    }

    setBusyAction('save_discord_dest')
    setFeedbackBanner(null)
    saveLocalIntegrationPrefs(accountKey, {
      discordWebhookUrl: trimmedWebhook,
      autoPushAnnouncements,
    })

    if (backendOnline) {
      const res = await saveIntegrationSubscription({
        accountKey,
        discordWebhookUrl: trimmedWebhook,
        discordChannelId: selectedBotChannelId,
        autoPushAnnouncements,
      })
      if (!res.ok) {
        setBusyAction('')
        setFeedbackBanner({ tone: 'red', text: res.error || 'Could not save Discord destination.' })
        return
      }
      await saveIntegrationConfig({
        discord: {
          webhookUrl: trimmedWebhook,
          defaultChannelId: selectedBotChannelId,
        },
      })
      await loadStatus(false)
    }

    setBusyAction('')
    setFeedbackBanner({
      tone: 'green',
      text: 'Saved Discord alert destination.',
    })
    notify('Saved Discord integration settings!')
  }

  async function handleSendDiscordTest() {
    setBusyAction('test_discord')
    setFeedbackBanner(null)
    try {
      const useWebhook =
        discordWebhookInput.trim() && !discordWebhookInput.includes('••••')
          ? discordWebhookInput.trim()
          : undefined
      const res = await dispatchDiscordNotification({
        kind: 'test',
        accountKey,
        webhookUrl: useWebhook,
        channelId: useWebhook ? undefined : selectedBotChannelId || undefined,
      })
      setFeedbackBanner({
        tone: 'green',
        text:
          res.via === 'bot'
            ? 'Sent test announcement embed to Discord via ClubHub Bot!'
            : 'Sent test announcement embed to your Discord Webhook!',
      })
      notify('Test message delivered to Discord!')
    } catch (err) {
      setFeedbackBanner({ tone: 'red', text: err.message })
      notify(err.message, 'error')
    } finally {
      setBusyAction('')
    }
  }

  async function handleSendDiscordDigest() {
    setBusyAction('digest_discord')
    setFeedbackBanner(null)
    try {
      const useWebhook =
        discordWebhookInput.trim() && !discordWebhookInput.includes('••••')
          ? discordWebhookInput.trim()
          : undefined
      await dispatchDiscordNotification({
        kind: 'digest',
        accountKey,
        webhookUrl: useWebhook,
        channelId: useWebhook ? undefined : selectedBotChannelId || undefined,
        events: syncedEvents,
        url: typeof window !== 'undefined' ? window.location.origin : '',
      })
      setFeedbackBanner({
        tone: 'green',
        text: `Posted schedule digest (${Math.min(syncedEvents.length, 10)} upcoming events) to Discord!`,
      })
      notify('Posted schedule digest to Discord!')
    } catch (err) {
      setFeedbackBanner({ tone: 'red', text: err.message })
      notify(err.message, 'error')
    } finally {
      setBusyAction('')
    }
  }

  async function handleSyncDiscordNow() {
    setBusyAction('sync_discord')
    setFeedbackBanner(null)
    const res = await syncAllSources('discord')
    setBusyAction('')
    if (!res || !res.ok) {
      setFeedbackBanner({
        tone: 'yellow',
        text: 'Start the Express backend (`npm run server`) to run live Discord bot channel & event sync.',
      })
      return
    }
    const r = res.result || {}
    if (onRefresh) await onRefresh()
    await loadStatus(true)

    const warnText = Array.isArray(r.warnings) && r.warnings.length > 0 ? ` ${r.warnings[0]}` : ''
    setFeedbackBanner({
      tone: r.synced > 0 ? 'green' : 'blue',
      text: `Checked ${r.channelsChecked ?? 0} channel(s) — synced ${r.synced ?? 0} Discord update(s)${
        r.scheduledEventsSynced ? ` (${r.scheduledEventsSynced} scheduled events)` : ''
      }.${warnText}`,
    })
    notify(`Synced ${r.synced ?? 0} Discord updates!`)
  }

  async function handleConnectDiscordSource(e) {
    e.preventDefault()
    const cleanIdent = discordSourceIdentifier.trim()
    if (!cleanIdent) return
    setBusyAction('add_discord_source')
    setFeedbackBanner(null)
    const selectedClub = clubs.find(c => String(c.id) === String(discordSourceClubId))
    const res = await registerSource({
      clubId: discordSourceClubId || 'all',
      platform: 'discord',
      identifier: cleanIdent,
      config: {
        clubName: selectedClub ? cleanText(selectedClub.name) : undefined,
      },
      syncNow: true,
    })
    setBusyAction('')
    if (!res || res.error) {
      setFeedbackBanner({
        tone: 'red',
        text: res?.error || 'Backend server is required to connect live Discord channels.',
      })
      return
    }
    setDiscordSourceIdentifier('')
    if (onRefresh) await onRefresh()
    await loadStatus(true)
    const count = res.syncResult?.synced ?? 0
    setFeedbackBanner({
      tone: 'green',
      text: `Connected Discord channel (${cleanIdent}) and synced ${count} item(s).`,
    })
    notify('Connected Discord channel!')
  }

  async function handleSaveDiscordServerConfig(e) {
    e.preventDefault()
    setBusyAction('save_discord_cfg')
    setFeedbackBanner(null)
    const res = await saveIntegrationConfig({
      discord: {
        botToken: botTokenInput.trim(),
        aggregatorGuildId: aggGuildIdInput.trim(),
        defaultChannelId: selectedBotChannelId,
        defaultClubId: defaultDiscordClubId,
        webhookUrl: discordWebhookInput.trim(),
      },
    })
    setBusyAction('')
    if (!res.ok) {
      setFeedbackBanner({ tone: 'red', text: res.error || 'Failed to save Discord configuration.' })
      return
    }
    await loadStatus(true)
    setFeedbackBanner({
      tone: res.discord?.apiError ? 'yellow' : 'green',
      text: res.discord?.apiError
        ? `Saved config, but Discord API reported: ${res.discord.apiError}`
        : `Discord Bot verified${res.discord?.bot?.tag ? ` (${res.discord.bot.tag})` : ''}!`,
    })
    notify('Saved Discord bot configuration!')
  }

  // ── Email Handlers ──

  async function handleSaveEmailRecipient() {
    const cleanEmail = recipientEmailInput.trim()
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setFeedbackBanner({ tone: 'red', text: 'Enter a valid email address.' })
      return
    }
    setBusyAction('save_email_dest')
    setFeedbackBanner(null)
    saveLocalIntegrationPrefs(accountKey, {
      recipientEmail: cleanEmail,
      autoPushAnnouncements,
    })
    if (backendOnline) {
      const res = await saveIntegrationSubscription({
        accountKey,
        recipientEmail: cleanEmail,
        autoPushAnnouncements,
      })
      if (!res.ok) {
        setBusyAction('')
        setFeedbackBanner({ tone: 'red', text: res.error || 'Could not save email preference.' })
        return
      }
      await saveIntegrationConfig({
        email: { defaultRecipient: cleanEmail },
      })
      await loadStatus(false)
    }
    setBusyAction('')
    setFeedbackBanner({ tone: 'green', text: `Saved ${cleanEmail || 'email'} for digests & alerts.` })
    notify('Saved email alert recipient!')
  }

  async function handleSendEmailTest() {
    const cleanEmail = recipientEmailInput.trim()
    if (!cleanEmail) {
      setFeedbackBanner({ tone: 'red', text: 'Enter a recipient email address first.' })
      return
    }
    setBusyAction('test_email')
    setFeedbackBanner(null)
    try {
      const res = await dispatchEmailNotification(
        {
          kind: 'test',
          to: cleanEmail,
          accountKey,
          url: typeof window !== 'undefined' ? window.location.origin : '',
        },
        { allowMailtoFallback: true }
      )
      setFeedbackBanner({
        tone: 'green',
        text:
          res.via === 'mailto'
            ? `Opened your mail client addressed to ${cleanEmail}. Configure Gmail App Password or Resend below for 1-click background delivery!`
            : `Delivered test email to ${cleanEmail} via ${res.via.toUpperCase()}!`,
      })
      notify(
        res.via === 'mailto'
          ? 'Opened verification draft in mail app!'
          : `Sent test email to ${cleanEmail}!`
      )
    } catch (err) {
      setFeedbackBanner({ tone: 'red', text: err.message })
      notify(err.message, 'error')
    } finally {
      setBusyAction('')
    }
  }

  async function handleSendEmailDigest() {
    const cleanEmail = recipientEmailInput.trim()
    if (!cleanEmail) {
      setFeedbackBanner({ tone: 'red', text: 'Enter a recipient email address first.' })
      return
    }
    setBusyAction('digest_email')
    setFeedbackBanner(null)
    try {
      const res = await dispatchEmailNotification(
        {
          kind: 'digest',
          to: cleanEmail,
          accountKey,
          events: syncedEvents,
          attachIcs: true,
          url: typeof window !== 'undefined' ? window.location.origin : '',
        },
        { allowMailtoFallback: true, downloadIcsOnFallback: true }
      )
      setFeedbackBanner({
        tone: 'green',
        text:
          res.via === 'mailto'
            ? `Opened schedule digest in your mail client and downloaded clubhub-upcoming-events.ics (${syncedEvents.length} events)!`
            : `Sent HTML schedule digest + .ics calendar attachment (${syncedEvents.length} events) to ${cleanEmail}!`,
      })
      notify(`Schedule digest sent to ${cleanEmail}!`)
    } catch (err) {
      setFeedbackBanner({ tone: 'red', text: err.message })
      notify(err.message, 'error')
    } finally {
      setBusyAction('')
    }
  }

  async function handleSyncEmailNow() {
    setBusyAction('sync_email')
    setFeedbackBanner(null)
    const res = await syncAllSources('email')
    setBusyAction('')
    if (!res || !res.ok) {
      setFeedbackBanner({
        tone: 'yellow',
        text: 'Start the Express backend (`npm run server`) and add IMAP credentials below to sync newsletters automatically.',
      })
      return
    }
    const r = res.result || {}
    if (onRefresh) await onRefresh()
    await loadStatus(true)
    const warnText = Array.isArray(r.warnings) && r.warnings.length > 0 ? ` ${r.warnings[0]}` : ''
    setFeedbackBanner({
      tone: r.synced > 0 ? 'green' : 'blue',
      text:
        r.mode === 'live_imap'
          ? `Checked ${r.checked ?? 0} inbox email(s) — synced ${r.synced ?? 0} club newsletter(s).${warnText}`
          : `${warnText || `Synced ${r.synced ?? 0} email item(s).`}`,
    })
    notify(`Email sync complete (${r.synced ?? 0} synced)!`)
  }

  async function handleConnectEmailSource(e) {
    e.preventDefault()
    const cleanAddr = emailSourceIdentifier.trim().toLowerCase()
    if (!cleanAddr || !emailSourceClubId) return
    setBusyAction('add_email_source')
    setFeedbackBanner(null)
    const selectedClub = clubs.find(c => String(c.id) === String(emailSourceClubId))
    const res = await registerSource({
      clubId: emailSourceClubId,
      platform: 'email',
      identifier: cleanAddr,
      config: {
        clubName: selectedClub ? cleanText(selectedClub.name) : undefined,
      },
      syncNow: Boolean(statusData?.email?.inboundReady),
    })
    setBusyAction('')
    if (!res || res.error) {
      setFeedbackBanner({
        tone: 'red',
        text: res?.error || 'Backend server is required to register club mailing list sources.',
      })
      return
    }
    setEmailSourceIdentifier('')
    if (onRefresh) await onRefresh()
    await loadStatus(true)
    setFeedbackBanner({
      tone: 'green',
      text: `Mapped ${cleanAddr} to ${selectedClub ? cleanText(selectedClub.name) : emailSourceClubId}.`,
    })
    notify('Connected club mailing list address!')
  }

  async function handleSaveAndVerifyEmailConfig(e) {
    e.preventDefault()
    setBusyAction('save_email_cfg')
    setFeedbackBanner(null)
    const res = await saveIntegrationConfig({
      email: {
        provider: emailProvider,
        emailUser: emailUserInput.trim(),
        emailPassword: emailPasswordInput.trim(),
        imapHost: imapHostInput.trim(),
        imapPort: Number(imapPortInput) || 993,
        smtpHost: smtpHostInput.trim(),
        smtpPort: Number(smtpPortInput) || 465,
        fromEmail: fromEmailInput.trim(),
        defaultRecipient: recipientEmailInput.trim() || emailUserInput.trim(),
        resendApiKey: resendKeyInput.trim(),
      },
      verifyEmail: true,
    })
    setBusyAction('')
    if (!res.ok) {
      setFeedbackBanner({ tone: 'red', text: res.error || 'Failed to save Email configuration.' })
      return
    }
    await loadStatus(true)

    const imapV = res.emailVerification?.imap
    const smtpV = res.emailVerification?.smtp
    if (imapV?.ok && smtpV?.ok) {
      setFeedbackBanner({
        tone: 'green',
        text: `Verified IMAP (${imapV.messagesInMailbox} emails in ${imapV.mailbox}) & SMTP (${smtpV.host}:${smtpV.port})!`,
      })
    } else if (imapV && !imapV.ok) {
      setFeedbackBanner({ tone: 'red', text: imapV.error })
    } else if (smtpV && !smtpV.ok) {
      setFeedbackBanner({ tone: 'red', text: smtpV.error })
    } else {
      setFeedbackBanner({
        tone: 'green',
        text: `Saved Email configuration (${res.email?.activeTransport?.toUpperCase() || 'Updated'}).`,
      })
    }
    notify('Saved Email integration settings!')
  }

  async function handleVerifySocketsOnly() {
    setBusyAction('verify_sockets')
    setFeedbackBanner(null)
    const res = await verifyEmailIntegration({
      config: {
        emailUser: emailUserInput.trim(),
        ...(emailPasswordInput && !emailPasswordInput.includes('••••')
          ? { emailPassword: emailPasswordInput.trim() }
          : {}),
        imapHost: imapHostInput.trim(),
        imapPort: Number(imapPortInput) || 993,
        smtpHost: smtpHostInput.trim(),
        smtpPort: Number(smtpPortInput) || 465,
      },
    })
    setBusyAction('')
    if (res.ok) {
      setFeedbackBanner({
        tone: 'green',
        text: `IMAP & SMTP connection verified (${res.imap?.messagesInMailbox ?? 0} messages in inbox)!`,
      })
      notify('IMAP & SMTP verified!')
    } else {
      const errMsg = res.imap?.error || res.smtp?.error || res.error || 'Verification failed'
      setFeedbackBanner({ tone: 'red', text: errMsg })
    }
  }

  async function handleDisconnectSource(sourceId) {
    setBusyAction(`del_${sourceId}`)
    await deleteSource(sourceId)
    await loadStatus(false)
    setBusyAction('')
    notify('Disconnected source.', 'info')
  }

  async function handleRunDiscordScout(forceCrawlAll = false) {
    setBusyAction('scout_discord')
    setFeedbackBanner(null)
    if (!backendOnline) {
      const staticScout = await getScoutedDiscordServers()
      if (staticScout) setScoutData(staticScout)
      setBusyAction('')
      setFeedbackBanner({
        tone: 'blue',
        text: 'Showing pre-scouted snapshot (GitHub Action runs daily & on club catalog updates, or run `npm run scout:discord` locally).',
      })
      return
    }

    const res = await runDiscordServerScout({
      crawlWebsites: true,
      forceCrawlAll,
      forceRefreshInvites: true,
    })
    setBusyAction('')
    if (!res.ok) {
      setFeedbackBanner({
        tone: 'red',
        text: res.error || 'Failed to scout club Discord servers.',
      })
      return
    }
    setScoutData(res)
    if (onRefresh && (res.summary?.newlyDiscovered || 0) > 0) {
      await onRefresh()
    }
    const s = res.summary || {}
    setFeedbackBanner({
      tone: 'green',
      text: `Scouted ${s.totalInvitesChecked ?? 0} invites across ${s.totalClubsWithDiscord ?? 0} clubs (${s.followableServers ?? 0} followable #announcements, ${s.newlyDiscovered ?? 0} newly discovered)!`,
    })
    notify('Scouted club Discord servers!')
  }

  async function handleAutoFollowChannel(srv) {
    const sourceChId =
      srv?.botAnnouncementChannels?.[0]?.id ||
      (srv?.landingChannel?.isAnnouncementChannel ? srv.landingChannel.id : '')
    const targetChId = selectedBotChannelId || dStatus?.defaultChannelId || botChannels[0]?.id || ''
    if (!sourceChId || !targetChId) {
      setFeedbackBanner({
        tone: 'yellow',
        text: 'Select a destination Bot channel above first so ClubHub knows where to crosspost followed #announcements.',
      })
      return
    }
    setBusyAction(`follow_${srv.code}`)
    setFeedbackBanner(null)
    const res = await followDiscordAnnouncementChannel({
      sourceChannelId: sourceChId,
      targetChannelId: targetChId,
    })
    setBusyAction('')
    if (!res.ok) {
      setFeedbackBanner({
        tone: 'red',
        text: res.error || 'Could not auto-follow announcement channel.',
      })
      return
    }
    await loadStatus(true)
    setFeedbackBanner({
      tone: 'green',
      text: `Followed ${srv.serverName || srv.clubName} #${srv.botAnnouncementChannels?.[0]?.name || srv.landingChannel?.name || 'announcements'} into ClubHub!`,
    })
    notify(`Followed ${srv.clubName} #announcements!`)
  }

  const dStatus = statusData?.discord || null
  const eStatus = statusData?.email || null
  const botChannels = dStatus?.channels || []
  const discordSources = dStatus?.sources || []
  const emailSources = eStatus?.sources || []

  // Client-side fallback if neither API nor static `discord-scout.json` returned servers yet
  const rawScoutServers = (() => {
    if (Array.isArray(scoutData?.servers) && scoutData.servers.length > 0) {
      return scoutData.servers
    }
    const fallback = []
    const inviteRe = /(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]{2,36})/i
    for (const c of clubs) {
      const allUrls = [
        c.discord,
        ...(Array.isArray(c.links) ? c.links.map(l => l.url || l) : []),
      ].filter(Boolean)
      for (const u of allUrls) {
        const m = String(u).match(inviteRe)
        if (!m) continue
        fallback.push({
          clubId: c.id,
          clubName: c.name || c.id,
          instagram: c.instagram || c.id,
          code: m[1],
          url: `https://discord.gg/${m[1]}`,
          status: c.discordFollowable ? 'valid' : 'unchecked',
          serverName: c.discordServerName || null,
          followable: Boolean(c.discordFollowable),
          syncState: c.discordFollowable ? 'followable' : 'unverified',
          syncedPosts: 0,
        })
        break
      }
    }
    return fallback
  })()

  const scoutSummary = scoutData?.summary || {
    totalClubsWithDiscord: rawScoutServers.filter(s => s.status !== 'expired').length,
    followableServers: rawScoutServers.filter(s => s.followable).length,
    syncedOrBotServers: rawScoutServers.filter(
      s => s.syncState === 'bot_connected' || s.syncState === 'synced'
    ).length,
  }

  const filteredScoutServers = rawScoutServers.filter(srv => {
    if (scoutFilter === 'followable' && !srv.followable) return false
    if (
      scoutFilter === 'synced' &&
      srv.syncState !== 'bot_connected' &&
      srv.syncState !== 'synced'
    ) {
      return false
    }
    if (
      scoutFilter === 'other' &&
      (srv.followable || srv.syncState === 'bot_connected' || srv.syncState === 'synced')
    ) {
      return false
    }
    if (scoutQuery.trim()) {
      if (
        !matchesSearchQuery(scoutQuery, {
          primary: [srv.clubName, srv.serverName],
          secondary: [srv.instagram, srv.code],
        })
      ) {
        return false
      }
    }
    return true
  })

  const hasLocalWebhook = isValidDiscordWebhookUrl(discordWebhookInput)
  const discordReady = Boolean(dStatus?.outboundReady || dStatus?.inboundReady || hasLocalWebhook)
  const emailReady = Boolean(eStatus?.configured || recipientEmailInput.trim())

  const originBase =
    typeof window !== 'undefined'
      ? window.location.port === '5173'
        ? 'http://localhost:3001'
        : window.location.origin
      : 'http://localhost:3001'
  const discordWebhookEndpoint = `${originBase}/api/webhooks/discord`
  const emailWebhookEndpoint = `${originBase}/api/webhooks/email`

  const cardPad = isCompact ? 'p-4 sm:p-5' : 'p-5 sm:p-6'

  return (
    <Card className={`${cardPad} ${isCompact ? 'space-y-4' : 'space-y-5'}`} delay={delay}>
      {/* ── Header ── */}
      <SectionHeader
        icon={<PlatformIcon type={activeTab === 'discord' ? 'discord' : 'email'} size={18} />}
        color={activeTab === 'discord' ? 'blue' : 'yellow'}
        title="Discord & Email Integrations"
        subtitle="Sync club Discord announcements & email newsletters into ClubHub, and push schedule digests or poll invites"
        badge={
          <div className="flex flex-wrap items-center gap-1.5">
            <BubbleTag
              label={
                dStatus?.bot
                  ? `Bot: ${dStatus.bot.tag}`
                  : discordReady
                    ? 'Discord Ready'
                    : 'Discord'
              }
              color={discordReady ? 'blue' : 'purple'}
              size="sm"
              dot={discordReady}
            />
            <BubbleTag
              label={
                eStatus?.inboundReady && eStatus?.outboundReady
                  ? 'IMAP + SMTP'
                  : eStatus?.outboundReady
                    ? `Email (${eStatus.activeTransport.toUpperCase()})`
                    : emailReady
                      ? 'Email Ready'
                      : 'Email'
              }
              color={eStatus?.configured ? 'green' : 'yellow'}
              size="sm"
              dot={Boolean(eStatus?.configured)}
            />
          </div>
        }
        action={
          <button
            type="button"
            onClick={() => loadStatus(true)}
            disabled={statusLoading}
            title="Refresh integration status"
            className="inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] cursor-pointer transition-colors shrink-0"
          >
            <RefreshCw size={13} className={statusLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        }
        className={`${isCompact ? 'pb-3.5' : 'pb-4'} border-b border-[var(--border)]`}
      />

      {/* ── Platform Switcher + Auto-Push Toggle ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="segmented-track self-start">
          <button
            type="button"
            onClick={() => {
              setActiveTab('discord')
              setFeedbackBanner(null)
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 min-h-[36px] rounded-lg text-xs sm:text-[13px] font-semibold border-none cursor-pointer transition-all ${
              activeTab === 'discord'
                ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-[var(--shadow-xs)]'
                : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            <PlatformIcon type="discord" size={15} />
            <span>Discord</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('email')
              setFeedbackBanner(null)
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 min-h-[36px] rounded-lg text-xs sm:text-[13px] font-semibold border-none cursor-pointer transition-all ${
              activeTab === 'email'
                ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-[var(--shadow-xs)]'
                : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            <PlatformIcon type="email" size={15} />
            <span>Email &amp; Newsletters</span>
          </button>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2.5 px-3 py-2 rounded-xl content-tile">
          <span className="text-xs font-medium text-[var(--text-muted)]">
            Offer push when posting updates
          </span>
          <ToggleSwitch
            size="sm"
            checked={autoPushAnnouncements}
            onChange={val => {
              setAutoPushAnnouncements(val)
              saveLocalIntegrationPrefs(accountKey, { autoPushAnnouncements: val })
              if (backendOnline) {
                saveIntegrationSubscription({ accountKey, autoPushAnnouncements: val })
              }
            }}
            ariaLabel="Offer external push when posting club updates"
          />
        </div>
      </div>

      {/* ── Feedback Banner ── */}
      {feedbackBanner && (
        <div
          className="px-3.5 py-2.5 rounded-xl border text-xs font-medium flex items-start gap-2 fade-in"
          style={{
            background: `var(--${feedbackBanner.tone}-light)`,
            color: `var(--${feedbackBanner.tone}-ink, var(--text))`,
            borderColor: `color-mix(in srgb, var(--${feedbackBanner.tone}) 35%, transparent)`,
          }}
        >
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span className="leading-relaxed">{feedbackBanner.text}</span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 1: DISCORD INTEGRATION
         ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'discord' && (
        <div className="space-y-4">
          {/* Stats & Bot Invite Strip */}
          <div className="p-3.5 sm:p-4 rounded-xl content-tile flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
              <span>
                <strong className="text-[var(--text)] font-mono-num">
                  {dStatus?.counts?.posts ?? 0}
                </strong>{' '}
                synced msgs
              </span>
              <span>
                <strong className="text-[var(--text)] font-mono-num">
                  {dStatus?.counts?.events ?? 0}
                </strong>{' '}
                Discord events
              </span>
              <span>
                <strong className="text-[var(--text)] font-mono-num">
                  {dStatus?.counts?.inviteLinks ?? 28}
                </strong>{' '}
                club Discord servers indexed
              </span>
              {dStatus?.guilds?.length > 0 && (
                <span>
                  Active in{' '}
                  <strong className="text-[var(--text)]">
                    {dStatus.guilds.map(g => g.name).join(', ')}
                  </strong>
                </span>
              )}
            </div>

            {dStatus?.bot?.inviteUrl && (
              <a
                href={dStatus.bot.inviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 min-h-[36px] rounded-xl bg-[var(--blue-light)] text-[var(--blue-ink)] text-xs font-semibold no-underline hover:opacity-90 shrink-0"
              >
                <span>Invite Bot to Server</span>
                <ExternalLink size={12} />
              </a>
            )}
          </div>

          {/* 1A. Outbound Discord Alerts & Schedule Digest */}
          <div className="p-4 sm:p-5 rounded-xl content-tile space-y-3.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="text-sm font-bold text-[var(--text)]">
                  Outbound Discord Alerts &amp; Digests
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
                  Post schedule digests, announcements, and availability polls via Bot channel or Incoming Webhook
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {botChannels.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                    Bot Destination Channel
                  </label>
                  <select
                    value={selectedBotChannelId}
                    onChange={e => setSelectedBotChannelId(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                  >
                    {botChannels.map(ch => (
                      <option key={ch.id} value={ch.id}>
                        #{ch.name} — {ch.guildName || ch.guildId}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={botChannels.length > 0 ? '' : 'sm:col-span-2'}>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                  Discord Incoming Webhook URL{' '}
                  <span className="font-normal text-[var(--text-light)]">
                    (optional — works without backend)
                  </span>
                </label>
                <input
                  type="url"
                  value={discordWebhookInput}
                  onChange={e => setDiscordWebhookInput(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSaveDiscordDestination}
                disabled={busyAction === 'save_discord_dest'}
                className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text)] border border-[var(--border)] cursor-pointer transition-colors"
              >
                <Check size={13} className="text-[var(--green)]" />
                <span>Save Destination</span>
              </button>

              <Button
                variant="filled"
                size="md"
                leadingIcon={<Send size={13} />}
                onClick={handleSendDiscordTest}
                disabled={busyAction === 'test_discord'}
              >
                {busyAction === 'test_discord' ? 'Sending…' : 'Send Test Embed'}
              </Button>

              <Button
                variant="tonal"
                size="md"
                leadingIcon={<Calendar size={13} />}
                onClick={handleSendDiscordDigest}
                disabled={busyAction === 'digest_discord'}
              >
                {busyAction === 'digest_discord'
                  ? 'Posting…'
                  : `Post Schedule Digest (${syncedEvents.length})`}
              </Button>
            </div>
          </div>

          {/* 1B. Inbound Club Discord Sync */}
          <div className="p-4 sm:p-5 rounded-xl content-tile space-y-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium font-display text-[var(--text)]">
                  Inbound Club Server &amp; #announcements Sync
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
                  Click &ldquo;Follow&rdquo; on any club&apos;s #announcements channel into your aggregator server, forward messages, or map a channel below
                </p>
              </div>

              <Button
                variant="filled"
                size="md"
                leadingIcon={
                  <RefreshCw
                    size={13}
                    className={busyAction === 'sync_discord' ? 'animate-spin' : ''}
                  />
                }
                onClick={handleSyncDiscordNow}
                disabled={busyAction === 'sync_discord'}
                className="shrink-0"
              >
                {busyAction === 'sync_discord' ? 'Syncing…' : 'Sync Discord Now'}
              </Button>
            </div>

            <form
              onSubmit={handleConnectDiscordSource}
              className="grid grid-cols-1 sm:grid-cols-[1fr_1.3fr_auto] gap-2.5 pt-1"
            >
              <select
                value={discordSourceClubId}
                onChange={e => setDiscordSourceClubId(e.target.value)}
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              >
                <option value="all">Auto-detect Club (Aggregator Channel)</option>
                {clubs.map(c => (
                  <option key={c.id} value={c.id}>
                    {cleanText(c.name)}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={discordSourceIdentifier}
                onChange={e => setDiscordSourceIdentifier(e.target.value)}
                placeholder="Channel ID or https://discord.com/channels/..."
                list="clubhub-bot-channels"
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              />
              <datalist id="clubhub-bot-channels">
                {botChannels.map(ch => (
                  <option key={ch.id} value={ch.id}>
                    #{ch.name} ({ch.guildName})
                  </option>
                ))}
              </datalist>

              <button
                type="submit"
                disabled={busyAction === 'add_discord_source'}
                className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[42px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text)] border border-[var(--border)] cursor-pointer shrink-0 transition-colors"
              >
                <Plus size={14} className="text-[var(--blue)]" />
                <span>Connect Channel</span>
              </button>
            </form>

            {discordSources.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] font-semibold text-[var(--text-muted)]">
                  Connected Discord Sources ({discordSources.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {discordSources.slice(0, 12).map(src => (
                    <span
                      key={src.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] text-xs text-[var(--text)]"
                    >
                      <span className="font-semibold text-[var(--blue-ink)]">{src.clubId}</span>
                      <span className="text-[var(--text-muted)] font-mono-num truncate max-w-[160px]">
                        {src.identifier}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDisconnectSource(src.id)}
                        aria-label={`Disconnect ${src.identifier}`}
                        className="text-[var(--text-light)] hover:text-[var(--red-ink)] bg-transparent border-none p-0.5 cursor-pointer flex items-center"
                      >
                        <Trash2 size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Collapsible Bot Token & Push Webhook Configuration */}
            <div className="pt-2.5 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setShowDiscordConfig(prev => !prev)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none p-0 cursor-pointer text-left"
              >
                <KeyRound size={13} className="shrink-0" />
                <span>Bot Token, Aggregator Server &amp; Push Webhook Settings</span>
                {showDiscordConfig ? <ChevronUp size={13} className="shrink-0" /> : <ChevronDown size={13} className="shrink-0" />}
              </button>

              {showDiscordConfig && (
                <form onSubmit={handleSaveDiscordServerConfig} className="mt-3.5 space-y-3.5 fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                        Discord Bot Token
                      </label>
                      <input
                        type="password"
                        value={botTokenInput}
                        onChange={e => setBotTokenInput(e.target.value)}
                        placeholder="Bot token from Discord Developer Portal"
                        className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                        Aggregator Server (Guild) ID
                      </label>
                      <input
                        type="text"
                        value={aggGuildIdInput}
                        onChange={e => setAggGuildIdInput(e.target.value)}
                        placeholder="e.g. 1571365388758024392"
                        className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                        Fallback Club for Unmatched Aggregator Posts
                      </label>
                      <select
                        value={defaultDiscordClubId}
                        onChange={e => setDefaultDiscordClubId(e.target.value)}
                        className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                      >
                        <option value="">Require club match (@handle, Follow, or [Club Name])</option>
                        {clubs.map(c => (
                          <option key={c.id} value={c.id}>
                            {cleanText(c.name)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                        Inbound Discord Relay Endpoint
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={discordWebhookEndpoint}
                          className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-xs font-mono-num text-[var(--text-muted)] border border-[var(--border)] outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyText(
                              'discord_wh',
                              discordWebhookEndpoint,
                              'Copied Discord inbound webhook URL!'
                            )
                          }
                          aria-label="Copy Discord webhook endpoint"
                          className="px-3 min-h-[42px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer shrink-0 transition-colors"
                        >
                          {copiedKey === 'discord_wh' ? <Check size={14} className="text-[var(--green)]" /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <span className="text-[11.5px] text-[var(--text-muted)] leading-relaxed">
                      Tip: Enable <strong>Message Content Intent</strong> in Discord Developer Portal &rarr; Bot so plain-text posts are readable.
                    </span>
                    <Button
                      variant="filled"
                      size="md"
                      type="submit"
                      disabled={busyAction === 'save_discord_cfg'}
                      className="w-full sm:w-auto shrink-0"
                    >
                      {busyAction === 'save_discord_cfg' ? 'Saving…' : 'Save & Verify Bot'}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* ── 1C. Scouted Club Discords & #announcements Followability ── */}
          <div className="p-4 sm:p-5 rounded-xl content-tile space-y-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-[var(--text)]">
                    Scouted Club Discords &amp; Followable #announcements
                  </span>
                  <BubbleTag
                    label={`${scoutSummary.totalClubsWithDiscord ?? rawScoutServers.length} Discovered`}
                    color="blue"
                    size="sm"
                  />
                  {(scoutSummary.followableServers ?? 0) > 0 && (
                    <BubbleTag
                      label={`${scoutSummary.followableServers} Followable (NEWS)`}
                      color="green"
                      size="sm"
                      dot
                    />
                  )}
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
                  Auto-discovers club Discord invites from the UCSC directory, Linktrees, club websites, and bios, checks if megaphone{' '}
                  <strong>#announcements</strong> channels are followable, and lets you follow them into your aggregator server
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleRunDiscordScout(false)}
                disabled={busyAction === 'scout_discord'}
                className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text)] border border-[var(--border)] cursor-pointer transition-colors shrink-0"
              >
                <RefreshCw
                  size={13}
                  className={`text-[var(--blue)] ${busyAction === 'scout_discord' ? 'animate-spin' : ''}`}
                />
                <span>
                  {busyAction === 'scout_discord' ? 'Scouting Clubs…' : 'Scout Club Discords'}
                </span>
              </button>
            </div>

            {/* Filter Pills + Search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'all', label: `All (${rawScoutServers.length})` },
                  {
                    id: 'followable',
                    label: `Followable #announcements (${scoutSummary.followableServers ?? 0})`,
                  },
                  {
                    id: 'synced',
                    label: `Synced / Bot (${scoutSummary.syncedOrBotServers ?? 0})`,
                  },
                  { id: 'other', label: 'Text-Only / Indexed' },
                ].map(tab => (
                  <FilterChip
                    key={tab.id}
                    selected={scoutFilter === tab.id}
                    onClick={() => setScoutFilter(tab.id)}
                    label={tab.label}
                  />
                ))}
              </div>

              <div className="relative w-full sm:w-60">
                <Search
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-light)] pointer-events-none"
                />
                <input
                  type="text"
                  value={scoutQuery}
                  onChange={e => setScoutQuery(e.target.value)}
                  placeholder="Filter clubs or invites…"
                  className="w-full min-h-[36px] pl-8 pr-7 py-1.5 rounded-xl bg-[var(--bg-surface)] text-base sm:text-xs text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                />
                {scoutQuery && (
                  <button
                    type="button"
                    onClick={() => setScoutQuery('')}
                    aria-label="Clear Discord server filter"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-light)] hover:text-[var(--text)] bg-transparent border-none cursor-pointer flex items-center"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Server List */}
            {filteredScoutServers.length === 0 ? (
              <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] text-center">
                No club Discord servers match this filter yet. Click{' '}
                <strong>Scout Club Discords</strong> to crawl club websites and check invite followability.
              </div>
            ) : (
              <div className="max-h-[320px] overflow-y-auto pr-1 space-y-2">
                {filteredScoutServers.map(srv => {
                  const canAutoFollow =
                    backendOnline &&
                    Array.isArray(srv.botAnnouncementChannels) &&
                    srv.botAnnouncementChannels.length > 0
                  const statusMeta =
                    srv.syncState === 'bot_connected'
                      ? { label: 'Bot Connected', color: 'green' }
                      : srv.syncState === 'synced'
                        ? {
                            label:
                              srv.syncedPosts > 0 ? `Synced (${srv.syncedPosts})` : 'Mapped',
                            color: 'teal',
                          }
                        : srv.syncState === 'followable'
                          ? { label: 'Followable (NEWS)', color: 'blue' }
                          : srv.syncState === 'standard'
                            ? { label: 'Text Channels Only', color: 'yellow' }
                            : srv.syncState === 'expired'
                              ? { label: 'Invite Expired', color: 'red' }
                              : { label: 'Invite Indexed', color: 'purple' }

                  return (
                    <div
                      key={`${srv.clubId}-${srv.code}`}
                      className="p-2.5 sm:p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {srv.iconUrl ? (
                          <img
                            src={srv.iconUrl}
                            alt=""
                            loading="lazy"
                            className="w-8 h-8 rounded-lg object-cover shrink-0 border border-[var(--border-subtle)]"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
                            <PlatformIcon type="discord" size={15} />
                          </div>
                        )}

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs sm:text-[13px] font-bold text-[var(--text)] truncate">
                              {cleanText(srv.clubName)}
                            </span>
                            {srv.instagram && (
                              <span className="text-[11px] font-mono-num text-[var(--text-muted)]">
                                @{srv.instagram}
                              </span>
                            )}
                            {srv.isNewlyDiscovered && (
                              <BubbleTag label="New" color="green" size="sm" />
                            )}
                            <BubbleTag
                              label={statusMeta.label}
                              color={statusMeta.color}
                              size="sm"
                            />
                          </div>

                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-[var(--text-muted)] mt-0.5">
                            {srv.serverName && (
                              <span className="font-medium text-[var(--text)]">
                                {cleanText(srv.serverName)}
                              </span>
                            )}
                            {srv.memberCount != null && (
                              <span className="font-mono-num">
                                {srv.memberCount.toLocaleString()} members
                                {srv.onlineCount != null
                                  ? ` · ${srv.onlineCount.toLocaleString()} online`
                                  : ''}
                              </span>
                            )}
                            {srv.landingChannel?.name && (
                              <span className="font-mono-num">
                                #{srv.landingChannel.name}
                                {srv.landingChannel.isAnnouncementChannel ? ' (📣)' : ''}
                              </span>
                            )}
                            <span className="font-mono-num text-[var(--text-light)]">
                              discord.gg/{srv.code}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                        {canAutoFollow && (
                          <Button
                            variant="filled"
                            size="sm"
                            onClick={() => handleAutoFollowChannel(srv)}
                            disabled={busyAction === `follow_${srv.code}`}
                          >
                            {busyAction === `follow_${srv.code}`
                              ? 'Following…'
                              : 'Auto-Follow'}
                          </Button>
                        )}

                        {srv.url && srv.status !== 'expired' && (
                          <a
                            href={srv.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 min-h-[32px] rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-subtle)] text-[11.5px] font-semibold text-[var(--text)] border border-[var(--border)] no-underline transition-colors"
                          >
                            <span>{srv.followable ? 'Open & Follow' : 'Open Server'}</span>
                            <ExternalLink size={11} className="text-[var(--text-muted)]" />
                          </a>
                        )}

                        {srv.url && (
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyText(
                                `inv_${srv.clubId}_${srv.code}`,
                                srv.url,
                                `Copied ${cleanText(srv.clubName)} Discord invite!`
                              )
                            }
                            aria-label={`Copy ${cleanText(srv.clubName)} Discord invite`}
                            className="p-1.5 min-h-[32px] min-w-[32px] rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer flex items-center justify-center transition-colors"
                          >
                            {copiedKey === `inv_${srv.clubId}_${srv.code}` ? (
                              <Check size={12} className="text-[var(--green)]" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 2: EMAIL & NEWSLETTERS INTEGRATION
         ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'email' && (
        <div className="space-y-4">
          {/* Stats Strip */}
          <div className="p-3.5 sm:p-4 rounded-xl content-tile flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
              <span>
                <strong className="text-[var(--text)] font-mono-num">
                  {eStatus?.counts?.posts ?? 0}
                </strong>{' '}
                synced newsletters
              </span>
              <span>
                <strong className="text-[var(--text)] font-mono-num">
                  {eStatus?.counts?.events ?? 0}
                </strong>{' '}
                extracted email events
              </span>
              <span>
                <strong className="text-[var(--text)] font-mono-num">
                  {eStatus?.counts?.clubDirectoryEmails ?? 137}
                </strong>{' '}
                club emails indexed
              </span>
              {eStatus?.emailUser && (
                <span>
                  Inbox: <strong className="text-[var(--text)]">{eStatus.emailUser}</strong>
                </span>
              )}
            </div>
          </div>

          {/* 2A. Outbound Email Schedule Digests & Alerts */}
          <div className="p-4 sm:p-5 rounded-xl content-tile space-y-3.5">
            <div>
              <div className="text-sm font-bold text-[var(--text)]">
                Outbound Schedule Digests (.ics) &amp; Poll Invites
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
                Receive HTML schedule digests with a 1-click .ics calendar file attached, or send test &amp; poll emails
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="email"
                value={recipientEmailInput}
                onChange={e => setRecipientEmailInput(e.target.value)}
                placeholder="your.email@ucsc.edu or @gmail.com"
                className="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              />
              <button
                type="button"
                onClick={handleSaveEmailRecipient}
                disabled={busyAction === 'save_email_dest'}
                className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[42px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text)] border border-[var(--border)] cursor-pointer shrink-0 transition-colors"
              >
                <Check size={13} className="text-[var(--green)]" />
                <span>Save Email</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="filled"
                size="md"
                leadingIcon={<Send size={13} />}
                onClick={handleSendEmailTest}
                disabled={busyAction === 'test_email'}
              >
                {busyAction === 'test_email' ? 'Sending…' : 'Send Test Email'}
              </Button>

              <Button
                variant="tonal"
                size="md"
                leadingIcon={<Sparkles size={13} />}
                onClick={handleSendEmailDigest}
                disabled={busyAction === 'digest_email'}
              >
                {busyAction === 'digest_email'
                  ? 'Sending…'
                  : `Email Schedule Digest + .ics (${syncedEvents.length})`}
              </Button>
            </div>
          </div>

          {/* 2B. Inbound Club Newsletter Sync (IMAP + Webhook) */}
          <div className="p-4 sm:p-5 rounded-xl content-tile space-y-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium font-display text-[var(--text)]">
                  Inbound Club Mailing List &amp; Newsletter Sync
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
                  Automatically matches all 137 UCSC club emails, forwarded newsletters, and{' '}
                  <code className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                    +club_handle
                  </code>{' '}
                  tags without marking inbox mail as read
                </p>
              </div>

              <Button
                variant="filled"
                size="md"
                leadingIcon={
                  <RefreshCw size={13} className={busyAction === 'sync_email' ? 'animate-spin' : ''} />
                }
                onClick={handleSyncEmailNow}
                disabled={busyAction === 'sync_email'}
                className="shrink-0"
              >
                {busyAction === 'sync_email' ? 'Syncing…' : 'Sync Email Inbox Now'}
              </Button>
            </div>

            <form
              onSubmit={handleConnectEmailSource}
              className="grid grid-cols-1 sm:grid-cols-[1fr_1.2fr_auto] gap-2.5 pt-1"
            >
              <select
                value={emailSourceClubId}
                onChange={e => setEmailSourceClubId(e.target.value)}
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              >
                {clubs.map(c => (
                  <option key={c.id} value={c.id}>
                    {cleanText(c.name)}
                  </option>
                ))}
              </select>

              <input
                type="email"
                value={emailSourceIdentifier}
                onChange={e => setEmailSourceIdentifier(e.target.value)}
                placeholder="Club list/sender address (e.g. newsletter@club.org)"
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              />

              <button
                type="submit"
                disabled={busyAction === 'add_email_source'}
                className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[42px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text)] border border-[var(--border)] cursor-pointer shrink-0 transition-colors"
              >
                <Plus size={14} className="text-[var(--blue)]" />
                <span>Map Sender</span>
              </button>
            </form>

            {emailSources.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] font-semibold text-[var(--text-muted)]">
                  Mapped Mailing List Senders ({emailSources.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {emailSources.slice(0, 12).map(src => (
                    <span
                      key={src.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] text-xs text-[var(--text)]"
                    >
                      <span className="font-semibold text-[var(--blue-ink)]">{src.clubId}</span>
                      <span className="text-[var(--text-muted)] truncate max-w-[180px]">
                        {src.identifier}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDisconnectSource(src.id)}
                        aria-label={`Disconnect ${src.identifier}`}
                        className="text-[var(--text-light)] hover:text-[var(--red-ink)] bg-transparent border-none p-0.5 cursor-pointer flex items-center"
                      >
                        <Trash2 size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Collapsible IMAP + SMTP App Password / Resend API Configuration */}
            <div className="pt-2.5 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setShowEmailConfig(prev => !prev)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none p-0 cursor-pointer text-left"
              >
                <KeyRound size={13} className="shrink-0" />
                <span>Configure Gmail / UCSC App Password (IMAP + SMTP), Resend API &amp; Inbound Webhook</span>
                {showEmailConfig ? <ChevronUp size={13} className="shrink-0" /> : <ChevronDown size={13} className="shrink-0" />}
              </button>

              {showEmailConfig && (
                <form onSubmit={handleSaveAndVerifyEmailConfig} className="mt-3.5 space-y-3.5 fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                        Outbound Transport Mode
                      </label>
                      <select
                        value={emailProvider}
                        onChange={e => setEmailProvider(e.target.value)}
                        className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                      >
                        <option value="auto">Auto (Resend API or Gmail/SMTP)</option>
                        <option value="smtp">Gmail / UCSC / Standard SMTP + IMAP</option>
                        <option value="resend">Resend HTTP API</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                        Gmail / UCSC / IMAP Email Address
                      </label>
                      <input
                        type="email"
                        value={emailUserInput}
                        onChange={e => setEmailUserInput(e.target.value)}
                        placeholder="you@gmail.com or you@ucsc.edu"
                        className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                        16-Char Google App Password / Mail Password
                      </label>
                      <input
                        type="password"
                        value={emailPasswordInput}
                        onChange={e => setEmailPasswordInput(e.target.value)}
                        placeholder="abcd efgh ijkl mnop"
                        className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                        Resend API Key <span className="font-normal text-[var(--text-light)]">(optional alternative)</span>
                      </label>
                      <input
                        type="password"
                        value={resendKeyInput}
                        onChange={e => setResendKeyInput(e.target.value)}
                        placeholder="re_..."
                        className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                      />
                    </div>

                    <div className="grid grid-cols-[1fr_88px] gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                          IMAP Host
                        </label>
                        <input
                          type="text"
                          value={imapHostInput}
                          onChange={e => setImapHostInput(e.target.value)}
                          placeholder="imap.gmail.com"
                          className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                          Port
                        </label>
                        <input
                          type="number"
                          value={imapPortInput}
                          onChange={e => setImapPortInput(e.target.value)}
                          className="w-full min-h-[42px] px-2.5 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-[1fr_88px] gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                          SMTP Host
                        </label>
                        <input
                          type="text"
                          value={smtpHostInput}
                          onChange={e => setSmtpHostInput(e.target.value)}
                          placeholder="smtp.gmail.com"
                          className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                          Port
                        </label>
                        <input
                          type="number"
                          value={smtpPortInput}
                          onChange={e => setSmtpPortInput(e.target.value)}
                          className="w-full min-h-[42px] px-2.5 py-2 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                        Inbound Email Webhook (Resend / SendGrid / Cloudflare / Apps Script)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={emailWebhookEndpoint}
                          className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] text-xs font-mono-num text-[var(--text-muted)] border border-[var(--border)] outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyText(
                              'email_wh',
                              emailWebhookEndpoint,
                              'Copied Inbound Email Webhook URL!'
                            )
                          }
                          aria-label="Copy Email webhook endpoint"
                          className="px-3 min-h-[42px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer shrink-0 transition-colors"
                        >
                          {copiedKey === 'email_wh' ? <Check size={14} className="text-[var(--green)]" /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <span className="text-[11.5px] text-[var(--text-muted)] leading-relaxed">
                      Create a Google App Password at{' '}
                      <a
                        href="https://myaccount.google.com/apppasswords"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--blue-ink)] underline"
                      >
                        myaccount.google.com/apppasswords
                      </a>
                      . Stored privately in local SQLite.
                    </span>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleVerifySocketsOnly}
                        disabled={busyAction === 'verify_sockets'}
                        className="flex-1 sm:flex-initial px-3.5 min-h-[40px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text)] border border-[var(--border)] cursor-pointer transition-colors"
                      >
                        {busyAction === 'verify_sockets' ? 'Testing…' : 'Test IMAP/SMTP'}
                      </button>
                      <Button
                        variant="filled"
                        size="md"
                        type="submit"
                        disabled={busyAction === 'save_email_cfg'}
                        className="flex-1 sm:flex-initial"
                      >
                        {busyAction === 'save_email_cfg' ? 'Verifying…' : 'Save & Verify'}
                      </Button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
