import { useState } from 'react'
import {
  Calendar,
  Check,
  Copy,
  Download,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Unlink,
  Users,
  KeyRound,
  ArrowRight,
} from 'lucide-react'
import { Card, BubbleTag, ToggleSwitch, SectionHeader, cleanText, Button, ModalDialog } from './ui'
import {
  normalizeCalendarSyncSettings,
  isLocalhostUrl,
} from '../utils/calendarSync'

export function GoogleCalendarLogo({ size = 18, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <rect x="3" y="3" width="18" height="18" rx="4.2" fill="#F6F4EE" stroke="#D5D2C8" strokeWidth="1.2" />
      <path d="M3.6 7.5C3.6 5.35 5.35 3.6 7.5 3.6H16.5C18.65 3.6 20.4 5.35 20.4 7.5V8.4H3.6V7.5Z" fill="#4285F4" />
      <rect x="16.5" y="8.4" width="3.9" height="8.1" fill="#FBBC04" />
      <path d="M16.5 16.5H20.4L16.5 20.4V16.5Z" fill="#34A853" />
      <path d="M3.6 16.5H16.5V20.4H7.5C5.35 20.4 3.6 18.65 3.6 16.5Z" fill="#34A853" fillOpacity="0.88" />
      <rect x="3.6" y="8.4" width="3.6" height="8.1" fill="#4285F4" fillOpacity="0.16" />
      <text
        x="12"
        y="15.3"
        textAnchor="middle"
        fill="#1A73E8"
        fontSize="7.4"
        fontWeight="800"
        fontFamily="Plus Jakarta Sans, system-ui, sans-serif"
      >
        31
      </text>
    </svg>
  )
}

export function AppleCalendarLogo({ size = 17, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d="M16.67 12.64c-.02-2.21 1.81-3.28 1.89-3.33-1.03-1.51-2.64-1.72-3.21-1.74-1.36-.14-2.67.81-3.36.81-.7 0-1.77-.79-2.91-.77-1.49.02-2.88.88-3.65 2.22-1.56 2.71-.4 6.72 1.12 8.92.74 1.08 1.63 2.28 2.79 2.24 1.12-.05 1.55-.72 2.9-.72 1.35 0 1.74.72 2.92.7 1.21-.02 1.97-1.09 2.71-2.17.85-1.25 1.2-2.46 1.22-2.52-.03-.01-2.4-.92-2.42-3.64ZM14.44 6.08c.62-.75 1.03-1.79.92-2.83-.89.04-1.97.59-2.61 1.34-.57.66-1.07 1.72-.94 2.74.99.08 2.01-.5 2.63-1.25Z" />
    </svg>
  )
}

export default function CalendarSyncModal({
  variant = 'modal', // 'modal' | 'card'
  open = true,
  onClose,
  syncSettings: rawSyncSettings = {},
  onUpdateSyncSettings,
  syncedEvents = [],
  joinedClubs = [],
  feedWebcalUrl = '',
  feedHttpUrl = '',
  feedMode = 'static', // 'server' | 'dev-feed' | 'static'
  onSubscribeApple,
  onIntegrateGoogle,
  onConnectGoogleLive,
  onDisconnectGoogleLive,
  onDownloadIcs,
  onRegenerateFeedToken,
  onBrowseClubs,
  googleLiveMeta = null,
  googleSyncBusy = false,
  hasGoogleClientId = false,
  onSaveGoogleClientId,
  isCompact = false,
  delay = 0,
  onNotify,
}) {
  const settings = normalizeCalendarSyncSettings(rawSyncSettings)
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [showClientIdInput, setShowClientIdInput] = useState(false)
  const [clientIdDraft, setClientIdDraft] = useState('')

  if (variant === 'modal' && !open) return null

  const hasLiveFeedUrl = Boolean(feedWebcalUrl)
  const isPublicFeed = hasLiveFeedUrl && !isLocalhostUrl(feedHttpUrl || feedWebcalUrl)
  const googleConnected = Boolean(googleLiveMeta?.connected)
  const cardPad = isCompact ? 'p-4 sm:p-5' : 'p-5 sm:p-6'
  const rowPad = isCompact ? 'p-3' : 'p-3.5 sm:p-4'

  async function handleCopyFeedUrl(urlToCopy = feedWebcalUrl || feedHttpUrl) {
    if (!urlToCopy) return
    try {
      await navigator.clipboard.writeText(urlToCopy)
      setCopiedUrl(true)
      setTimeout(() => setCopiedUrl(false), 2200)
      if (onNotify) {
        onNotify('Copied live calendar subscription URL!')
      }
    } catch {
      // Ignore clipboard permission errors
    }
  }

  function handleSaveClientId(e) {
    e.preventDefault()
    const trimmed = clientIdDraft.trim()
    if (!trimmed) return
    if (onSaveGoogleClientId) {
      onSaveGoogleClientId(trimmed)
    }
    setClientIdDraft('')
    setShowClientIdInput(false)
    if (onNotify) {
      onNotify('Saved Google OAuth Client ID — ready for live Google Calendar auto-sync.')
    }
  }

  const innerContent = (
    <div className="dense-controls space-y-3">
      {/* ── Header ── */}
      {variant === 'card' && <SectionHeader
        icon={<Calendar size={18} />}
        color="blue"
        title="Google & Apple Calendar Sync"
        subtitle="Updates automatically with your currently joined clubs, RSVPs, and schedule rules"
        badge={
          <div className="flex flex-wrap items-center gap-1.5">
            <BubbleTag
              label={`${syncedEvents.length} ${syncedEvents.length === 1 ? 'event' : 'events'} synced`}
              color="blue"
              size="sm"
            />
            {settings.rsvpOnly && (
              <BubbleTag label="RSVP'd Only" color="green" size="sm" dot />
            )}
          </div>
        }
        className={`${isCompact ? 'pb-3.5' : 'pb-4'} border-b border-[var(--border)]`}
      />}

      {/* ── Live Joined Clubs Summary Strip ── */}
      <div className={`${rowPad} rounded-xl content-tile flex flex-col sm:flex-row sm:items-center justify-between gap-2.5`}>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-[var(--text)]">
            <Users size={13.5} className="text-[var(--blue)] shrink-0" />
            {settings.clubScope === 'joined' ? (
              <span>
                Tracking Joined Clubs ({joinedClubs.length})
              </span>
            ) : (
              <span>Tracking All Campus Clubs</span>
            )}
            <span className="text-[var(--text-light)]">·</span>
            <span className="text-[var(--green-ink)] inline-flex items-center gap-1">
              <Sparkles size={12} />
              {hasLiveFeedUrl || googleConnected
                ? 'Auto-updates on club join/leave'
                : 'Ready to export or connect Google sync'}
            </span>
          </div>

          {settings.clubScope === 'joined' && joinedClubs.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {joinedClubs.slice(0, 6).map(club => (
                <span
                  key={club.id}
                  className="px-2 py-0.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border)] text-[11px] font-medium text-[var(--text-muted)] truncate max-w-[180px]"
                >
                  {cleanText(club.name)}
                </span>
              ))}
              {joinedClubs.length > 6 && (
                <span className="text-[11px] font-semibold text-[var(--blue-ink)]">
                  +{joinedClubs.length - 6} more
                </span>
              )}
            </div>
          )}

          {settings.clubScope === 'joined' && joinedClubs.length === 0 && (
            <p className="text-[11.5px] text-[var(--text-muted)]">
              You haven&apos;t joined any clubs yet — join clubs to automatically populate your synced calendar, or switch Club Source to All Campus below.
            </p>
          )}
        </div>

        {settings.clubScope === 'joined' && joinedClubs.length === 0 && onBrowseClubs && (
          <Button
            variant="tonal"
            size="sm"
            trailingIcon={<ArrowRight size={13} />}
            onClick={() => {
              if (onClose) onClose()
              onBrowseClubs()
            }}
            className="shrink-0 self-start sm:self-center"
          >
            Join Clubs
          </Button>
        )}
      </div>

      {/* ── Integration Cards: Google Calendar & Apple Calendar ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* 1. Google Calendar */}
        <div className="p-4 rounded-xl content-tile flex flex-col justify-between gap-3.5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <GoogleCalendarLogo size={20} />
                <span className="text-sm font-medium font-display text-[var(--text)]">Google Calendar</span>
              </div>
              <BubbleTag
                label={
                  googleConnected
                    ? 'Live Connected'
                    : isPublicFeed
                      ? 'URL Feed'
                      : 'Ready'
                }
                color={googleConnected ? 'green' : 'blue'}
                size="sm"
                dot={googleConnected}
              />
            </div>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              {googleConnected
                ? `Auto-syncing "${googleLiveMeta?.calendarTitle || 'ClubHub'}" directly in your Google Calendar.`
                : isPublicFeed
                  ? 'Subscribe via live calendar URL so Google Calendar stays updated with your clubs.'
                  : hasGoogleClientId
                    ? 'Connect your Google account to auto-create and live-sync a ClubHub calendar.'
                    : 'Import your filtered ClubHub schedule straight into Google Calendar or connect live sync.'}
            </p>
          </div>

          <div className="space-y-2.5">
            {googleConnected ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="filled"
                  size="md"
                  disabled={googleSyncBusy}
                  leadingIcon={<RefreshCw size={14} className={googleSyncBusy ? 'animate-spin' : ''} />}
                  onClick={() => onConnectGoogleLive && onConnectGoogleLive()}
                  className="flex-1"
                >
                  {googleSyncBusy ? 'Syncing…' : 'Sync Google Calendar Now'}
                </Button>
                <Button
                  variant="outlined-neutral"
                  size="md"
                  trailingIcon={<ExternalLink size={12.5} />}
                  onClick={() => window.open('https://calendar.google.com', '_blank', 'noopener,noreferrer')}
                >
                  Open
                </Button>
              </div>
            ) : hasGoogleClientId ? (
              <Button
                variant="filled"
                size="md"
                disabled={googleSyncBusy}
                leadingIcon={<GoogleCalendarLogo size={16} />}
                onClick={() => onConnectGoogleLive && onConnectGoogleLive()}
                className="w-full"
              >
                {googleSyncBusy ? 'Connecting…' : 'Connect Google Calendar (Auto-Sync)'}
              </Button>
            ) : (
              <Button
                variant="filled"
                size="md"
                leadingIcon={<GoogleCalendarLogo size={16} />}
                onClick={() => onIntegrateGoogle && onIntegrateGoogle()}
                className="w-full"
              >
                {isPublicFeed
                  ? 'Subscribe in Google Calendar'
                  : 'Add to Google Calendar'}
              </Button>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[var(--text-muted)]">
              {googleConnected ? (
                <>
                  <span>
                    {googleLiveMeta?.lastSyncedAt
                      ? `Synced ${new Date(googleLiveMeta.lastSyncedAt).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}`
                      : 'Auto-sync enabled'}
                  </span>
                  {onDisconnectGoogleLive && (
                    <button
                      type="button"
                      onClick={onDisconnectGoogleLive}
                      className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--red-ink)] hover:underline bg-transparent border-none cursor-pointer p-0"
                    >
                      <Unlink size={11} />
                      <span>Disconnect</span>
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onIntegrateGoogle && onIntegrateGoogle({ forceImport: true })}
                    className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer p-0"
                  >
                    <ExternalLink size={11} />
                    <span>Export .ics &amp; Open Google Import</span>
                  </button>

                  {!hasGoogleClientId && onSaveGoogleClientId && (
                    <button
                      type="button"
                      onClick={() => setShowClientIdInput(v => !v)}
                      className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[var(--text-muted)] hover:text-[var(--text)] bg-transparent border-none cursor-pointer p-0"
                    >
                      <KeyRound size={11} />
                      <span>Live API Key</span>
                    </button>
                  )}
                </>
              )}
            </div>

            {showClientIdInput && !hasGoogleClientId && (
              <form onSubmit={handleSaveClientId} className="pt-1.5 flex items-center gap-2">
                <input
                  type="text"
                  value={clientIdDraft}
                  onChange={e => setClientIdDraft(e.target.value)}
                  placeholder="Google OAuth Client ID (.apps.googleusercontent.com)"
                  className="flex-1 min-w-0 min-h-[40px] px-3 rounded-lg bg-[var(--bg-surface)] text-base sm:text-xs text-[var(--text)] border border-[var(--md-outline)] outline-none focus:border-[var(--blue)]"
                />
                <Button
                  variant="filled"
                  size="sm"
                  type="submit"
                >
                  Save
                </Button>
              </form>
            )}
          </div>
        </div>

        {/* 2. Apple Calendar */}
        <div className="p-4 rounded-xl content-tile flex flex-col justify-between gap-3.5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text)] inline-flex items-center justify-center shrink-0">
                  <AppleCalendarLogo size={13.5} />
                </span>
                <span className="text-sm font-medium font-display text-[var(--text)]">Apple Calendar</span>
              </div>
              <BubbleTag
                label={hasLiveFeedUrl ? 'Live webcal:// Feed' : '.ics Calendar'}
                color={hasLiveFeedUrl ? 'green' : 'purple'}
                size="sm"
                dot={hasLiveFeedUrl}
              />
            </div>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              {hasLiveFeedUrl
                ? 'One-click webcal:// subscription opens macOS or iOS Calendar and refreshes automatically as your clubs or RSVPs change.'
                : 'Open your filtered ClubHub schedule directly in Apple Calendar on Mac, iPhone, or iPad.'}
            </p>
          </div>

          <div className="space-y-2.5">
            <Button
              variant="outlined-neutral"
              size="md"
              leadingIcon={<AppleCalendarLogo size={15} />}
              onClick={() => onSubscribeApple && onSubscribeApple()}
              className="w-full"
            >
              {hasLiveFeedUrl
                ? 'Subscribe in Apple Calendar'
                : 'Add to Apple Calendar'}
            </Button>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[var(--text-muted)]">
              <button
                type="button"
                onClick={() => onDownloadIcs && onDownloadIcs()}
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer p-0"
              >
                <Download size={11} />
                <span>Download .ics Snapshot</span>
              </button>

              {hasLiveFeedUrl && (
                <button
                  type="button"
                  onClick={() => handleCopyFeedUrl(feedWebcalUrl)}
                  className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[var(--text-muted)] hover:text-[var(--text)] bg-transparent border-none cursor-pointer p-0"
                >
                  {copiedUrl ? <Check size={11} className="text-[var(--green)]" /> : <Copy size={11} />}
                  <span>{copiedUrl ? 'Copied webcal://' : 'Copy webcal:// Link'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── How Calendar Sync Should Work (Settings Menu) ── */}
      <div className="pt-1 space-y-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={14} className="text-[var(--purple-ink)]" />
          <h3 className="text-xs font-medium text-[var(--text-muted)]">
            Sync Filter Rules
          </h3>
        </div>

        {/* Featured Setting: Only RSVP'd Events */}
        <div
          className={`flex items-center justify-between gap-4 ${rowPad} rounded-xl border transition-colors ${
            settings.rsvpOnly
              ? 'bg-[var(--green-light)] border-[var(--green)]/40'
              : 'content-tile'
          }`}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-[var(--text)]">
                Only show events I RSVP&apos;d to (&ldquo;Going&rdquo;)
              </span>
              {settings.rsvpOnly && (
                <BubbleTag label="Active" color="green" size="sm" />
              )}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
              Only events you&apos;ve RSVP&apos;d to will appear on your integrated Google / Apple Calendar
            </div>
          </div>
          <ToggleSwitch
            checked={settings.rsvpOnly}
            onChange={val => onUpdateSyncSettings({ rsvpOnly: val })}
            ariaLabel="Only include events I RSVP'd to on synced calendar"
          />
        </div>

        {/* Companion Setting: Also filter in-app ClubHub Calendar to RSVP'd only */}
        <div className={`flex items-center justify-between gap-4 ${rowPad} rounded-xl content-tile`}>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[var(--text)]">
              Also filter in-app ClubHub Calendar to RSVP&apos;d events only
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
              Only display RSVP&apos;d events across ClubHub&apos;s Month, Week, and Overview calendar views
            </div>
          </div>
          <ToggleSwitch
            checked={settings.inAppRsvpOnly}
            onChange={val => onUpdateSyncSettings({ inAppRsvpOnly: val })}
            ariaLabel="Only show RSVP'd events on in-app ClubHub Calendar"
          />
        </div>

        {/* Club Membership Scope Banner */}
        <div>
          <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
            Clubs Included on Calendar
          </label>
          <div className={`${rowPad} rounded-xl border bg-[var(--blue-light)] border-[var(--blue)]/35 flex flex-wrap items-center justify-between gap-2.5`}>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-medium font-display text-[var(--text)]">
                Currently Joined Clubs ({joinedClubs.length})
              </div>
              <div className="text-[11.5px] text-[var(--text-muted)] mt-0.5 leading-snug">
                {joinedClubs.length > 0
                  ? 'Events sync exclusively from clubs you have joined and update automatically when your memberships change.'
                  : 'You are not in any clubs yet — join a club to start syncing club events onto your calendar.'}
              </div>
            </div>
            {joinedClubs.length === 0 && onBrowseClubs && (
              <Button
                variant="tonal"
                size="sm"
                trailingIcon={<ArrowRight size={12} />}
                onClick={() => {
                  if (onClose) onClose()
                  onBrowseClubs()
                }}
                className="shrink-0"
              >
                Browse Clubs
              </Button>
            )}
          </div>
        </div>

        {/* Additional Sync Behavior Toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className={`flex items-center justify-between gap-3 ${rowPad} rounded-xl content-tile`}>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-semibold text-[var(--text)]">
                Include Poll &amp; Custom Meetings
              </div>
              <div className="text-[11.5px] text-[var(--text-muted)] mt-0.5">
                Sync Availability Poll bookings &amp; custom events
              </div>
            </div>
            <ToggleSwitch
              checked={settings.includeCustomAndPolls}
              onChange={val => onUpdateSyncSettings({ includeCustomAndPolls: val })}
              ariaLabel="Include poll and custom meetings"
            />
          </div>

          <div className={`flex items-center justify-between gap-3 ${rowPad} rounded-xl content-tile`}>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-semibold text-[var(--text)]">
                Prefix Club Name in Titles
              </div>
              <div className="text-[11.5px] text-[var(--text-muted)] mt-0.5">
                Format as &ldquo;Club Name: Event Title&rdquo;
              </div>
            </div>
            <ToggleSwitch
              checked={settings.titlePrefixClub}
              onChange={val => onUpdateSyncSettings({ titlePrefixClub: val })}
              ariaLabel="Prefix club name in calendar titles"
            />
          </div>

          <div className={`flex items-center justify-between gap-3 ${rowPad} rounded-xl content-tile sm:col-span-2`}>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-semibold text-[var(--text)]">
                Include Past Event History
              </div>
              <div className="text-[11.5px] text-[var(--text-muted)] mt-0.5">
                Keep past semester meetings on your synced calendar alongside upcoming events
              </div>
            </div>
            <ToggleSwitch
              checked={settings.includePastEvents}
              onChange={val => onUpdateSyncSettings({ includePastEvents: val })}
              ariaLabel="Include past events in calendar sync"
            />
          </div>
        </div>

        {/* Reminders & Refresh Cadence */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              Default Calendar Alert
            </label>
            <select
              value={String(settings.reminderMinutes)}
              onChange={e => onUpdateSyncSettings({ reminderMinutes: Number(e.target.value) })}
              className="w-full min-h-[40px] px-3 rounded-lg bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--md-outline)] outline-none focus:border-[var(--blue)]"
            >
              <option value="0">None (No reminder alert)</option>
              <option value="10">10 minutes before</option>
              <option value="15">15 minutes before</option>
              <option value="30">30 minutes before</option>
              <option value="60">1 hour before</option>
              <option value="1440">1 day before</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              Subscription Auto-Refresh
            </label>
            <select
              value={settings.refreshInterval}
              onChange={e => onUpdateSyncSettings({ refreshInterval: e.target.value })}
              className="w-full min-h-[40px] px-3 rounded-lg bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--md-outline)] outline-none focus:border-[var(--blue)]"
            >
              <option value="PT15M">Every 15 minutes</option>
              <option value="PT1H">Every hour (Recommended)</option>
              <option value="PT6H">Every 6 hours</option>
              <option value="P1D">Once daily</option>
            </select>
          </div>
        </div>

        {/* Live Subscription URL Box */}
        {hasLiveFeedUrl && (
          <div className="pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label className="text-xs font-semibold text-[var(--text-muted)]">
                Live Calendar Subscription URL ({feedMode === 'server' ? 'SQLite Feed' : 'Local Live Feed'})
              </label>
              {onRegenerateFeedToken && (
                <button
                  type="button"
                  onClick={onRegenerateFeedToken}
                  className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] bg-transparent border-none cursor-pointer p-0"
                >
                  <RotateCcw size={11} />
                  <span>Reset URL</span>
                </button>
              )}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <input
                type="text"
                readOnly
                value={feedWebcalUrl}
                onFocus={e => e.target.select()}
                aria-label="Calendar subscription URL"
                className="flex-1 min-w-0 min-h-[40px] px-3 rounded-lg bg-[var(--bg-surface)] font-mono text-xs text-[var(--text-muted)] border border-[var(--md-outline)] outline-none"
              />
              <Button
                variant="tonal"
                size="md"
                leadingIcon={copiedUrl ? <Check size={13.5} className="text-[var(--green)]" /> : <Copy size={13.5} />}
                onClick={() => handleCopyFeedUrl(feedWebcalUrl)}
                className="shrink-0"
              >
                {copiedUrl ? 'Copied' : 'Copy URL'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  if (variant === 'card') {
    return (
      <Card className={cardPad} delay={delay}>
        {innerContent}
      </Card>
    )
  }

  return (
    <ModalDialog open={open} onClose={onClose} title="Calendar sync"
      subtitle="Google sync, Apple subscriptions, and calendar exports"
      maxWidth="max-w-2xl">
      {innerContent}
    </ModalDialog>
  )
}
