import { useState, useEffect } from 'react'
import {
  User,
  Sun,
  Moon,
  Monitor,
  Calendar,
  Bell,
  Download,
  RotateCcw,
  LogOut,
  LogIn,
  Check,
  Sparkles,
  ShieldCheck,
  Plug,
  Layers,
} from 'lucide-react'
import { Card, Avatar, BubbleTag, ToggleSwitch, SectionHeader } from './ui'
import CalendarSyncModal from './CalendarSyncModal'
import IntegrationsPanel from './IntegrationsPanel'
import {
  buildIcsCalendar,
  downloadIcsFile,
  normalizeCalendarSyncSettings,
} from '../utils/calendarSync'

const AVATAR_GRADIENTS = [
  { id: 'blue-purple', label: 'Ocean',   css: 'linear-gradient(135deg, var(--blue), var(--purple))' },
  { id: 'teal-green',  label: 'Redwood', css: 'linear-gradient(135deg, var(--teal), var(--green))' },
  { id: 'blue-teal',   label: 'Bay',     css: 'linear-gradient(135deg, var(--blue), var(--teal))' },
  { id: 'purple-red',  label: 'Sunset',  css: 'linear-gradient(135deg, var(--purple), var(--red))' },
  { id: 'yellow-red',  label: 'Gold',    css: 'linear-gradient(135deg, var(--yellow), var(--red))' },
  { id: 'green-blue',  label: 'Meadow',  css: 'linear-gradient(135deg, var(--green), var(--blue))' },
]

const SETTINGS_TABS = [
  { id: 'general',       label: 'Profile & Theme',   shortLabel: 'Profile',      icon: User },
  { id: 'calendar',      label: 'Calendar & Sync',   shortLabel: 'Calendar',     icon: Calendar },
  { id: 'integrations',  label: 'Discord & Email',   shortLabel: 'Integrations', icon: Plug },
  { id: 'notifications', label: 'Alerts & Account',  shortLabel: 'Account',      icon: Bell },
  { id: 'all',           label: 'All Settings',      shortLabel: 'All',          icon: Layers },
]

export default function SettingsView({
  user = null,
  accountKey = 'guest',
  isDemo = false,
  hasClerkKey = false,
  initialSection = null,
  userSettings = {},
  onUpdateSettings,
  onSetThemeMode,
  clubs = [],
  events = [],
  calendarIntegration = null,
  onRefresh,
  onResetLocalData,
  onSignOut,
  onExitDemo,
  onNotify,
}) {
  const [activeSection, setActiveSection] = useState(() =>
    SETTINGS_TABS.some(t => t.id === initialSection) ? initialSection : 'general'
  )

  useEffect(() => {
    if (initialSection && SETTINGS_TABS.some(t => t.id === initialSection)) {
      setActiveSection(initialSection)
    }
  }, [initialSection])

  const effectiveUser = isDemo ? null : user
  const realUserEmail =
    effectiveUser?.primaryEmailAddress?.emailAddress || effectiveUser?.email || ''
  const accountEmail = realUserEmail || (isDemo ? 'guest@ucsc.edu' : '')

  const defaultName =
    userSettings?.displayName ||
    effectiveUser?.fullName ||
    realUserEmail.split('@')[0] ||
    (isDemo ? 'Demo Guest' : 'Student')

  const [displayName, setDisplayName] = useState(defaultName)
  const [major, setMajor] = useState(userSettings?.major || '')
  const [avatarBg, setAvatarBg] = useState(
    userSettings?.avatarBg || AVATAR_GRADIENTS[0].css
  )

  useEffect(() => {
    setDisplayName(
      userSettings?.displayName ||
        effectiveUser?.fullName ||
        realUserEmail.split('@')[0] ||
        (isDemo ? 'Demo Guest' : 'Student')
    )
    setMajor(userSettings?.major || '')
    if (userSettings?.avatarBg) setAvatarBg(userSettings.avatarBg)
  }, [userSettings?.displayName, userSettings?.major, userSettings?.avatarBg, effectiveUser?.fullName, realUserEmail, isDemo])

  const initials = (displayName || 'ST')
    .split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'ST'

  const activeThemeMode =
    userSettings?.themeMode === 'light' ||
    userSettings?.themeMode === 'dark' ||
    userSettings?.themeMode === 'system'
      ? userSettings.themeMode
      : 'system'
  const channels = userSettings?.channels || {
    instagram: true,
    discord: true,
    email: true,
  }

  function handleSaveProfile(e) {
    e.preventDefault()
    onUpdateSettings({
      displayName: displayName.trim(),
      major: major.trim(),
      avatarBg,
    })
    if (onNotify) {
      onNotify('Saved profile settings.')
    }
  }

  function handleToggleChannel(key) {
    const current = channels[key] !== false
    onUpdateSettings({
      channels: {
        ...channels,
        [key]: !current,
      },
    })
  }

  const calSyncSettings = normalizeCalendarSyncSettings(userSettings?.calendarSync)

  function handleUpdateCalendarSync(patch) {
    onUpdateSettings({
      calendarSync: {
        ...calSyncSettings,
        ...patch,
      },
    })
  }

  function handleExportIcs() {
    if (calendarIntegration?.onDownloadIcs) {
      calendarIntegration.onDownloadIcs()
      return
    }
    const validEvents = (events || []).filter(ev => ev.startIso || ev.start)
    const ics = buildIcsCalendar(validEvents, { settings: calSyncSettings })
    downloadIcsFile(ics, 'clubhub-schedule.ics')
    if (onNotify) {
      onNotify(`Exported ${validEvents.length} events to clubhub-schedule.ics`)
    }
  }

  const isCompact = Boolean(userSettings?.compactCards)
  const cardPad = isCompact ? 'p-4 sm:p-5' : 'p-5 sm:p-6'
  const rowPad = isCompact ? 'p-3' : 'p-3.5 sm:p-4'
  const showAll = activeSection === 'all'

  return (
    <div className={`max-w-4xl ${isCompact ? 'space-y-4' : 'space-y-5'}`}>
      {/* ── Focused Settings Section Navigation Bar ── */}
      <Card className={isCompact ? 'p-2.5 sm:p-3' : 'p-3 sm:p-3.5'} delay={0}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="mobile-pill-rail" role="tablist" aria-label="Settings sections">
            {SETTINGS_TABS.map(tab => {
              const Icon = tab.icon
              const isSelected = activeSection === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setActiveSection(tab.id)}
                  className={`inline-flex items-center gap-2 px-3.5 min-h-[38px] rounded-xl text-xs sm:text-[13px] font-semibold border cursor-pointer shrink-0 transition-all ${
                    isSelected
                      ? 'bg-[var(--blue)] text-white border-[var(--blue)] shadow-[var(--shadow-xs)]'
                      : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <Icon size={14} className="shrink-0" />
                  <span className="sm:hidden">{tab.shortLabel}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              )
            })}
          </div>

          <div className="hidden md:flex items-center gap-2 shrink-0 pr-1">
            <Avatar initials={initials} bg={avatarBg} size={26} />
            <span className="text-xs font-semibold text-[var(--text-muted)] truncate max-w-[160px]">
              {accountEmail || 'Guest Session'}
            </span>
          </div>
        </div>
      </Card>

      {/* ── 1. Profile & Campus Identity ── */}
      {(showAll || activeSection === 'general') && (
        <Card className={cardPad} delay={1}>
          <SectionHeader
            icon={<User size={18} />}
            color="blue"
            title="Profile & Identity"
            subtitle="Used in your dashboard greeting, club rosters, and availability polls"
            badge={
              <BubbleTag
                label={isDemo ? 'Guest Preview' : 'Synced'}
                color={isDemo ? 'yellow' : 'green'}
                size="sm"
              />
            }
            className={`${isCompact ? 'pb-3.5 mb-4' : 'pb-4 mb-5'} border-b border-[var(--border)]`}
          />

          <form onSubmit={handleSaveProfile} className={isCompact ? 'space-y-4' : 'space-y-5'}>
            <div className="p-3.5 sm:p-4 rounded-xl content-tile flex flex-col sm:flex-row sm:items-center gap-4">
              <Avatar initials={initials} bg={avatarBg} size={isCompact ? 48 : 56} />
              <div className="space-y-2 min-w-0">
                <div className="text-xs font-semibold text-[var(--text-muted)]">
                  Avatar Accent Gradient
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  {AVATAR_GRADIENTS.map(g => {
                    const selected = avatarBg === g.css
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => {
                          setAvatarBg(g.css)
                          onUpdateSettings({ avatarBg: g.css })
                        }}
                        title={g.label}
                        aria-label={`Select ${g.label} avatar gradient`}
                        className={`w-9 h-9 rounded-full cursor-pointer border-2 flex items-center justify-center transition-transform ${
                          selected
                            ? 'border-[var(--text)] scale-105 shadow-[var(--shadow-xs)]'
                            : 'border-transparent hover:scale-105'
                        }`}
                        style={{ background: g.css }}
                      >
                        {selected && <Check size={14} className="text-white" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                  Major &amp; Class Year
                </label>
                <input
                  type="text"
                  value={major}
                  onChange={e => setMajor(e.target.value)}
                  placeholder="e.g. Computer Science '27"
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[var(--border-subtle)]">
              <div className="text-xs text-[var(--text-muted)] truncate">
                {accountEmail ? `Signed in as ${accountEmail}` : 'Active session: Guest Preview'}
              </div>
              <button
                type="submit"
                className="w-full sm:w-auto px-5 min-h-[42px] rounded-xl bg-[var(--blue)] text-white border-none text-sm font-semibold cursor-pointer hover:opacity-90 transition-opacity shrink-0"
              >
                Save Profile
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* ── 2. Appearance & Display ── */}
      {(showAll || activeSection === 'general') && (
        <Card className={`${cardPad} ${isCompact ? 'space-y-4' : 'space-y-5'}`} delay={2}>
          <SectionHeader
            icon={<Sparkles size={18} />}
            color="purple"
            title="Appearance & Display"
            subtitle="Follows your system theme by default — synced per account with zero page-load flash"
            className={`${isCompact ? 'pb-3.5' : 'pb-4'} border-b border-[var(--border)]`}
          />

          {/* Theme Mode Cards */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-2">
              Color Theme
            </label>
            <div className={`grid grid-cols-1 sm:grid-cols-3 ${isCompact ? 'gap-2.5' : 'gap-3'}`}>
              {[
                { id: 'system', label: 'System', desc: 'Match device OS', icon: Monitor },
                { id: 'light',  label: 'Light',  desc: 'Warm stone, low glare', icon: Sun },
                { id: 'dark',   label: 'Dark',   desc: 'Vivid midnight', icon: Moon },
              ].map(opt => {
                const Icon = opt.icon
                const isSelected = activeThemeMode === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onSetThemeMode(opt.id)}
                    className={`${rowPad} rounded-xl border text-left flex items-center justify-between gap-3 cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[var(--blue-light)] border-[var(--blue)] shadow-[var(--shadow-xs)]'
                        : 'content-tile content-tile-interactive'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon
                        size={18}
                        className={`shrink-0 ${
                          isSelected ? 'text-[var(--blue-ink)]' : 'text-[var(--text-muted)]'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-[var(--text)]">{opt.label}</div>
                        <div className="text-[11.5px] text-[var(--text-muted)] truncate">{opt.desc}</div>
                      </div>
                    </div>
                    {isSelected && <Check size={15} className="text-[var(--blue-ink)] shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Toggle Rows: Compact Cards & Reduce Motion */}
          <div className={`${isCompact ? 'space-y-2.5' : 'space-y-3'}`}>
            <div className={`flex items-center justify-between gap-4 ${rowPad} rounded-xl content-tile`}>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--text)]">Compact Card Density</div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
                  Fit more events, resources, and clubs on screen with tighter spacing
                </div>
              </div>
              <ToggleSwitch
                checked={Boolean(userSettings?.compactCards)}
                onChange={val => onUpdateSettings({ compactCards: val })}
                ariaLabel="Toggle compact card density"
              />
            </div>

            <div className={`flex items-center justify-between gap-4 ${rowPad} rounded-xl content-tile`}>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--text)]">Reduce Motion</div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
                  Minimize animations and page transitions across ClubHub
                </div>
              </div>
              <ToggleSwitch
                checked={Boolean(userSettings?.reduceMotion)}
                onChange={val => onUpdateSettings({ reduceMotion: val })}
                ariaLabel="Toggle reduce motion"
              />
            </div>
          </div>
        </Card>
      )}

      {/* ── 3. Calendar & Availability Preferences ── */}
      {(showAll || activeSection === 'calendar') && (
        <Card
          className={`${cardPad} ${isCompact ? 'space-y-4' : 'space-y-5'}`}
          delay={showAll ? 3 : 0}
        >
          <SectionHeader
            icon={<Calendar size={18} />}
            color="green"
            title="Calendar & Availability Preferences"
            subtitle="Customize clock format, start of week, default view, and availability poll hours"
            className={`${isCompact ? 'pb-3.5' : 'pb-4'} border-b border-[var(--border)]`}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Time Format
              </label>
              <select
                value={userSettings?.timeFormat || '12h'}
                onChange={e => onUpdateSettings({ timeFormat: e.target.value })}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              >
                <option value="12h">12-hour (2:30 PM)</option>
                <option value="24h">24-hour (14:30)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Week Starts On
              </label>
              <select
                value={userSettings?.weekStartsOn || 'monday'}
                onChange={e => onUpdateSettings({ weekStartsOn: e.target.value })}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              >
                <option value="monday">Monday</option>
                <option value="sunday">Sunday</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Default Calendar View
              </label>
              <select
                value={userSettings?.defaultCalendarView || 'month'}
                onChange={e => onUpdateSettings({ defaultCalendarView: e.target.value })}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              >
                <option value="month">Full Calendar (Month Grid)</option>
                <option value="week">Week Board</option>
                <option value="agenda">Agenda List</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Availability Poll Hours
              </label>
              <select
                value={userSettings?.availabilityHours || '9-19'}
                onChange={e => onUpdateSettings({ availabilityHours: e.target.value })}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              >
                <option value="9-17">Workday (9:00 AM – 5:00 PM)</option>
                <option value="9-19">Standard (9:00 AM – 7:00 PM)</option>
                <option value="8-21">Extended (8:00 AM – 9:00 PM)</option>
              </select>
            </div>
          </div>
        </Card>
      )}

      {/* ── 3b. Google & Apple Calendar Integration & Sync Rules ── */}
      {(showAll || activeSection === 'calendar') && calendarIntegration && (
        <CalendarSyncModal
          variant="card"
          syncSettings={calSyncSettings}
          onUpdateSyncSettings={handleUpdateCalendarSync}
          syncedEvents={calendarIntegration.syncedEvents}
          joinedClubs={calendarIntegration.joinedClubs}
          feedWebcalUrl={calendarIntegration.feedWebcalUrl}
          feedHttpUrl={calendarIntegration.feedHttpUrl}
          feedMode={calendarIntegration.feedMode}
          onSubscribeApple={calendarIntegration.onSubscribeApple}
          onIntegrateGoogle={calendarIntegration.onIntegrateGoogle}
          onConnectGoogleLive={calendarIntegration.onConnectGoogleLive}
          onDisconnectGoogleLive={calendarIntegration.onDisconnectGoogleLive}
          onDownloadIcs={calendarIntegration.onDownloadIcs}
          onRegenerateFeedToken={calendarIntegration.onRegenerateFeedToken}
          onBrowseClubs={calendarIntegration.onBrowseClubs}
          googleLiveMeta={calendarIntegration.googleLiveMeta}
          googleSyncBusy={calendarIntegration.googleSyncBusy}
          hasGoogleClientId={calendarIntegration.hasGoogleClientId}
          onSaveGoogleClientId={calendarIntegration.onSaveGoogleClientId}
          isCompact={isCompact}
          delay={showAll ? 4 : 1}
          onNotify={onNotify}
        />
      )}

      {/* ── 3c. Live Discord & Email Integrations ── */}
      {(showAll || activeSection === 'integrations') && (
        <IntegrationsPanel
          accountKey={accountKey}
          accountEmail={accountEmail}
          clubs={clubs}
          syncedEvents={calendarIntegration?.syncedEvents || events}
          isCompact={isCompact}
          delay={showAll ? 4 : 0}
          onRefresh={onRefresh}
          onNotify={onNotify}
        />
      )}

      {/* ── 4. Notifications & Feed Channels ── */}
      {(showAll || activeSection === 'notifications') && (
        <Card
          className={`${cardPad} ${isCompact ? 'space-y-3' : 'space-y-4'}`}
          delay={showAll ? 5 : 0}
        >
          <SectionHeader
            icon={<Bell size={18} />}
            color="yellow"
            title="Notifications & Feed Channels"
            subtitle="Choose which club channels appear in your notifications and overview feed"
            className={`${isCompact ? 'pb-3.5' : 'pb-4'} border-b border-[var(--border)]`}
          />

          <div className={isCompact ? 'space-y-2.5' : 'space-y-3'}>
            {[
              {
                key: 'discord',
                title: 'Discord Announcements',
                desc: 'Show announcements synced from club Discord servers',
              },
              {
                key: 'instagram',
                title: 'Instagram Posts & Flyers',
                desc: 'Show event flyers and posts from club Instagram accounts',
              },
              {
                key: 'email',
                title: 'Email Newsletters',
                desc: 'Show weekly digests from campus mailing lists',
              },
            ].map(ch => {
              const enabled = channels[ch.key] !== false
              return (
                <div
                  key={ch.key}
                  className={`flex items-center justify-between gap-4 ${rowPad} rounded-xl content-tile`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[var(--text)]">{ch.title}</div>
                    <div className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
                      {ch.desc}
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={enabled}
                    onChange={() => handleToggleChannel(ch.key)}
                    ariaLabel={`Toggle ${ch.title}`}
                  />
                </div>
              )
            })}

            <div className={`flex items-center justify-between gap-4 ${rowPad} rounded-xl content-tile`}>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--text)]">
                  Urgent-Only Notification Badge
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
                  Only count urgent room or time changes on the header notification bell badge
                </div>
              </div>
              <ToggleSwitch
                checked={Boolean(userSettings?.urgentOnlyBadge)}
                onChange={val => onUpdateSettings({ urgentOnlyBadge: val })}
                ariaLabel="Toggle urgent-only badge"
              />
            </div>
          </div>
        </Card>
      )}

      {/* ── 5. Schedule Export, Data Reset & Account Session ── */}
      {(showAll || activeSection === 'notifications') && (
        <Card
          className={`${cardPad} ${isCompact ? 'space-y-3.5' : 'space-y-4.5'}`}
          delay={showAll ? 5 : 1}
        >
          <SectionHeader
            icon={<ShieldCheck size={18} />}
            color="teal"
            title="Data & Account Session"
            subtitle="Export your club schedule, reset local customizations, or manage your signed-in session"
            badge={
              <BubbleTag
                label={
                  isDemo
                    ? 'Guest Preview'
                    : hasClerkKey
                      ? 'Google / Clerk SSO'
                      : 'Campus Account'
                }
                color={isDemo ? 'yellow' : 'green'}
                size="sm"
              />
            }
            className={`${isCompact ? 'pb-3.5' : 'pb-4'} border-b border-[var(--border)]`}
          />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleExportIcs}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 min-h-[42px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs sm:text-sm font-semibold text-[var(--text)] border border-[var(--border)] cursor-pointer transition-colors"
              >
                <Download size={15} className="text-[var(--blue)] shrink-0" />
                <span>Export Schedule (.ics)</span>
              </button>

              {onResetLocalData && (
                <button
                  type="button"
                  onClick={onResetLocalData}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 min-h-[42px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs sm:text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] cursor-pointer transition-colors"
                >
                  <RotateCcw size={15} className="shrink-0" />
                  <span>Reset Customizations</span>
                </button>
              )}
            </div>

            {isDemo && onExitDemo ? (
              <button
                type="button"
                onClick={onExitDemo}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 min-h-[42px] rounded-xl bg-[var(--blue)] text-white text-xs sm:text-sm font-semibold border-none cursor-pointer hover:opacity-90 shrink-0"
              >
                <LogIn size={15} />
                <span>Exit Demo &amp; Sign In</span>
              </button>
            ) : onSignOut ? (
              <button
                type="button"
                onClick={onSignOut}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 min-h-[42px] rounded-xl bg-[var(--red-light)] text-[var(--red-ink)] border border-[var(--red)]/30 text-xs sm:text-sm font-semibold cursor-pointer hover:opacity-90 shrink-0"
              >
                <LogOut size={15} />
                <span>Sign Out</span>
              </button>
            ) : null}
          </div>
        </Card>
      )}
    </div>
  )
}
