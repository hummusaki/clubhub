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
} from 'lucide-react'
import { Card, Avatar, BubbleTag, cleanText } from './ui'
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

export default function SettingsView({
  user = null,
  accountKey = 'guest',
  isDemo = false,
  hasClerkKey = false,
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
  const cardPad = isCompact ? 'p-4 sm:p-4.5' : 'p-5 sm:p-6'
  const rowPad = isCompact ? 'p-2.5' : 'p-3.5'

  return (
    <div className={`max-w-4xl ${isCompact ? 'space-y-3.5' : 'space-y-5'}`}>
      {/* ── 1. Profile & Campus Identity ── */}
      <Card className={cardPad} delay={1}>
        <div className={`flex items-center gap-2.5 ${isCompact ? 'pb-3 mb-3.5' : 'pb-4 mb-5'} border-b border-[var(--border)]`}>
          <User size={18} className="text-[var(--blue)]" />
          <div>
            <h2 className="text-base font-bold text-[var(--text)]">Profile & Identity</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Used in your dashboard greeting, user cards, and availability polls
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className={isCompact ? 'space-y-3' : 'space-y-4'}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-2">
            <Avatar initials={initials} bg={avatarBg} size={isCompact ? 48 : 56} />
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-[var(--text-muted)]">
                Avatar Color
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
                      className={`w-8 h-8 rounded-full cursor-pointer border-2 flex items-center justify-center transition-transform ${
                        selected
                          ? 'border-[var(--text)] scale-110'
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
                Major & Class Year
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

          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="text-xs text-[var(--text-muted)] truncate">
              {accountEmail ? `Account: ${accountEmail}` : 'Guest Session'}
            </div>
            <button
              type="submit"
              className="px-5 min-h-[42px] rounded-xl bg-[var(--blue)] text-white border-none text-sm font-semibold cursor-pointer hover:opacity-90 transition-opacity shrink-0"
            >
              Save Profile
            </button>
          </div>
        </form>
      </Card>

      {/* ── 2. Appearance & Display ── */}
      <Card className={`${cardPad} ${isCompact ? 'space-y-3.5' : 'space-y-5'}`} delay={2}>
        <div className={`flex items-center gap-2.5 ${isCompact ? 'pb-3' : 'pb-4'} border-b border-[var(--border)]`}>
          <Sparkles size={18} className="text-[var(--purple)]" />
          <div>
            <h2 className="text-base font-bold text-[var(--text)]">Appearance & Display</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Follows your system theme by default — synced per account with zero page-load flash
            </p>
          </div>
        </div>

        {/* Theme Mode Cards */}
        <div>
          <label className="block text-xs font-semibold text-[var(--text-muted)] mb-2">
            Color Theme
          </label>
          <div className={`grid grid-cols-1 sm:grid-cols-3 ${isCompact ? 'gap-2' : 'gap-3'}`}>
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
                      ? 'bg-[var(--blue-light)] border-[var(--blue)] shadow-2xs'
                      : 'content-tile content-tile-interactive'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      size={18}
                      className={isSelected ? 'text-[var(--blue-ink)]' : 'text-[var(--text-muted)]'}
                    />
                    <div>
                      <div className="text-sm font-bold text-[var(--text)]">{opt.label}</div>
                      <div className="text-[11px] text-[var(--text-muted)]">{opt.desc}</div>
                    </div>
                  </div>
                  {isSelected && <Check size={15} className="text-[var(--blue-ink)] shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>

        {/* Toggle Rows: Compact Cards & Reduce Motion */}
        <div className={`${isCompact ? 'space-y-2.5' : 'space-y-3'} pt-1`}>
          <div className={`flex items-center justify-between gap-4 ${rowPad} rounded-xl content-tile`}>
            <div>
              <div className="text-sm font-semibold text-[var(--text)]">Compact Card Density</div>
              <div className="text-xs text-[var(--text-muted)]">
                Fit more events, resources, and clubs on screen with tighter spacing
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({ compactCards: !userSettings?.compactCards })
              }
              aria-label="Toggle compact card density"
              className="w-11 h-6 rounded-full relative cursor-pointer border-none shrink-0 transition-colors"
              style={{
                background: userSettings?.compactCards ? 'var(--blue)' : 'var(--border-strong)',
              }}
            >
              <span
                className="w-5 h-5 rounded-full bg-[var(--switch-thumb)] absolute top-0.5 transition-transform shadow-2xs"
                style={{
                  left: 2,
                  transform: userSettings?.compactCards ? 'translateX(20px)' : 'translateX(0)',
                }}
              />
            </button>
          </div>

          <div className={`flex items-center justify-between gap-4 ${rowPad} rounded-xl content-tile`}>
            <div>
              <div className="text-sm font-semibold text-[var(--text)]">Reduce Motion</div>
              <div className="text-xs text-[var(--text-muted)]">
                Minimize animations and page transitions across ClubHub
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({ reduceMotion: !userSettings?.reduceMotion })
              }
              aria-label="Toggle reduce motion"
              className="w-11 h-6 rounded-full relative cursor-pointer border-none shrink-0 transition-colors"
              style={{
                background: userSettings?.reduceMotion ? 'var(--blue)' : 'var(--border-strong)',
              }}
            >
              <span
                className="w-5 h-5 rounded-full bg-[var(--switch-thumb)] absolute top-0.5 transition-transform shadow-2xs"
                style={{
                  left: 2,
                  transform: userSettings?.reduceMotion ? 'translateX(20px)' : 'translateX(0)',
                }}
              />
            </button>
          </div>
        </div>
      </Card>

      {/* ── 3. Calendar & Availability Preferences ── */}
      <Card className={`${cardPad} ${isCompact ? 'space-y-3' : 'space-y-4'}`} delay={3}>
        <div className="flex items-center gap-2.5 pb-4 border-b border-[var(--border)]">
          <Calendar size={18} className="text-[var(--green)]" />
          <div>
            <h2 className="text-base font-bold text-[var(--text)]">
              Calendar & Availability
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Customize clock format, start of week, and availability poll hours
            </p>
          </div>
        </div>

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

      {/* ── 3b. Google & Apple Calendar Integration & Sync Rules ── */}
      {calendarIntegration && (
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
          onNotify={onNotify}
        />
      )}

      {/* ── 3c. Live Discord & Email Integrations ── */}
      <IntegrationsPanel
        accountKey={accountKey}
        accountEmail={accountEmail}
        clubs={clubs}
        syncedEvents={calendarIntegration?.syncedEvents || events}
        isCompact={isCompact}
        onRefresh={onRefresh}
        onNotify={onNotify}
      />

      {/* ── 4. Notifications & Feed Channels ── */}
      <Card className={`${cardPad} ${isCompact ? 'space-y-2.5' : 'space-y-3.5'}`} delay={4}>
        <div className={`flex items-center gap-2.5 ${isCompact ? 'pb-2.5' : 'pb-3.5'} border-b border-[var(--border)]`}>
          <Bell size={18} className="text-[var(--yellow)]" />
          <div>
            <h2 className="text-base font-bold text-[var(--text)]">
              Notifications & Feed Channels
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Choose which club channels appear in your notifications and overview feed
            </p>
          </div>
        </div>

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
              <div>
                <div className="text-sm font-semibold text-[var(--text)]">{ch.title}</div>
                <div className="text-xs text-[var(--text-muted)]">{ch.desc}</div>
              </div>
              <button
                type="button"
                onClick={() => handleToggleChannel(ch.key)}
                aria-label={`Toggle ${ch.title}`}
                className="w-11 h-6 rounded-full relative cursor-pointer border-none shrink-0 transition-colors"
                style={{
                  background: enabled ? 'var(--blue)' : 'var(--border-strong)',
                }}
              >
                <span
                  className="w-5 h-5 rounded-full bg-[var(--switch-thumb)] absolute top-0.5 transition-transform shadow-2xs"
                  style={{
                    left: 2,
                    transform: enabled ? 'translateX(20px)' : 'translateX(0)',
                  }}
                />
              </button>
            </div>
          )
        })}

        <div className={`flex items-center justify-between gap-4 ${rowPad} rounded-xl content-tile`}>
          <div>
            <div className="text-sm font-semibold text-[var(--text)]">
              Urgent-Only Notification Badge
            </div>
            <div className="text-xs text-[var(--text-muted)]">
              Only count urgent room/time changes on the red notification bell badge
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              onUpdateSettings({ urgentOnlyBadge: !userSettings?.urgentOnlyBadge })
            }
            aria-label="Toggle urgent-only badge"
            className="w-11 h-6 rounded-full relative cursor-pointer border-none shrink-0 transition-colors"
            style={{
              background: userSettings?.urgentOnlyBadge ? 'var(--blue)' : 'var(--border-strong)',
            }}
          >
            <span
              className="w-5 h-5 rounded-full bg-[var(--switch-thumb)] absolute top-0.5 transition-transform shadow-2xs"
              style={{
                left: 2,
                transform: userSettings?.urgentOnlyBadge ? 'translateX(20px)' : 'translateX(0)',
              }}
            />
          </button>
        </div>
      </Card>

      {/* ── 5. Schedule Export, Data Reset & Account Session ── */}
      <Card className={`${cardPad} ${isCompact ? 'space-y-3' : 'space-y-4'}`} delay={5}>
        <div className={`flex flex-wrap items-center justify-between gap-3 ${isCompact ? 'pb-3' : 'pb-4'} border-b border-[var(--border)]`}>
          <div>
            <h2 className="text-base font-bold text-[var(--text)]">Data & Session</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Export your club calendar or manage your signed-in session
            </p>
          </div>
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
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportIcs}
            className="inline-flex items-center gap-2 px-4 min-h-[42px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs sm:text-sm font-semibold text-[var(--text)] border border-[var(--border)] cursor-pointer transition-colors"
          >
            <Download size={15} className="text-[var(--blue)]" />
            <span>Export Schedule (.ics)</span>
          </button>

          {onResetLocalData && (
            <button
              type="button"
              onClick={onResetLocalData}
              className="inline-flex items-center gap-2 px-4 min-h-[42px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs sm:text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] cursor-pointer transition-colors"
            >
              <RotateCcw size={15} />
              <span>Reset Local Customizations</span>
            </button>
          )}

          {isDemo && onExitDemo ? (
            <button
              type="button"
              onClick={onExitDemo}
              className="inline-flex items-center gap-2 px-4 min-h-[42px] rounded-xl bg-[var(--blue)] text-white text-xs sm:text-sm font-semibold border-none cursor-pointer hover:opacity-90 ml-auto"
            >
              <LogIn size={15} />
              <span>Exit Demo & Sign In</span>
            </button>
          ) : onSignOut ? (
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-2 px-4 min-h-[42px] rounded-xl bg-[var(--red-light)] text-[var(--red-ink)] border border-[var(--red)]/25 text-xs sm:text-sm font-semibold cursor-pointer hover:opacity-90 ml-auto"
            >
              <LogOut size={15} />
              <span>Sign Out</span>
            </button>
          ) : null}
        </div>
      </Card>
    </div>
  )
}
