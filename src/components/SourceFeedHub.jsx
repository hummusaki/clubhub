import { useState } from 'react'
import { Card, BubbleTag } from './ui'
import { ingestFromSource } from '../api/client'

const PLATFORM_META = {
  all:             { label: 'All Sources',     color: 'blue',   badge: '🌐' },
  instagram:       { label: 'Instagram',       color: 'purple', badge: '📸' },
  discord:         { label: 'Discord',         color: 'blue',   badge: '💬' },
  email:           { label: 'Emails / Lists',  color: 'yellow', badge: '📧' },
  google_calendar: { label: 'Google Calendar', color: 'green',  badge: '📅' },
  website:         { label: 'Websites',        color: 'teal',   badge: '🔗' },
}

export default function SourceFeedHub({ hubDict = {}, rawDict = {}, onRefresh }) {
  const [selectedPlatform, setSelectedPlatform] = useState('all')
  const [selectedClubKey, setSelectedClubKey] = useState('all')
  const [showDictModal, setShowDictModal] = useState(false)

  // Quick-ingest form state
  const [clubKey, setClubKey] = useState('cs')
  const [platform, setPlatform] = useState('instagram')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [statusMsg, setStatusMsg] = useState(null)

  const clubEntries = Object.values(hubDict)

  // Flatten all ingested items from the hub dictionary
  const allItems = []
  for (const club of clubEntries) {
    if (selectedClubKey !== 'all' && club.key !== selectedClubKey) continue
    const sources = club.sources || {}
    for (const plat of ['instagram', 'discord', 'email', 'google_calendar', 'website']) {
      if (selectedPlatform !== 'all' && selectedPlatform !== plat) continue
      for (const item of sources[plat] || []) {
        allItems.push({
          ...item,
          clubName: club.name,
          clubAbbr: club.abbreviation,
          clubKey: club.key,
        })
      }
    }
  }

  async function handleIngestSubmit(e) {
    e.preventDefault()
    if (!body.trim() && !title.trim()) return
    setStatusMsg('Saving & extracting meeting info…')
    const res = await ingestFromSource(platform, {
      club_key: clubKey,
      title: title.trim(),
      body: body.trim(),
    })
    if (res && res.success) {
      const timeInfo = res.ingested?.extractedTime ? `⏰ ${res.ingested.extractedTime}` : 'no time detected'
      const locInfo = res.ingested?.extractedLocation ? `📍 ${res.ingested.extractedLocation}` : 'no location detected'
      setStatusMsg(`✅ Stored under "${res.dictionary_key}" (${timeInfo}, ${locInfo})`)
      setTitle('')
      setBody('')
      if (onRefresh) onRefresh()
    } else {
      setStatusMsg('⚠️ Could not reach backend API on port 3001. Run `npm run server`!')
    }
  }

  return (
    <Card className="p-[22px] mb-7" delay={4}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-[var(--text)]">
            Multi-Source Club Intelligence & Dictionary Hub
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Automatically combines meeting times, locations & updates from Instagram, Discord, Emails, Google Calendar, and Websites
          </p>
        </div>

        <button
          onClick={() => setShowDictModal(prev => !prev)}
          className="px-3.5 py-1.5 rounded-full bg-[var(--bg-surface)] text-[var(--blue)]
            border border-[var(--border)] text-xs font-semibold cursor-pointer hover:opacity-90"
        >
          {showDictModal ? 'Hide Raw Dictionary JSON' : '📖 View Dictionary JSON'}
        </button>
      </div>

      {/* Platform Filter Pills */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(PLATFORM_META).map(([key, meta]) => (
            <button
              key={key}
              onClick={() => setSelectedPlatform(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer border-none transition-all
                ${selectedPlatform === key
                  ? 'bg-[var(--blue)] text-white'
                  : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
            >
              {meta.badge} {meta.label}
            </button>
          ))}
        </div>

        {/* Club Filter */}
        <select
          value={selectedClubKey}
          onChange={e => setSelectedClubKey(e.target.value)}
          className="px-3 py-1.5 rounded-full text-xs bg-[var(--bg-surface)] text-[var(--text)]
            border border-[var(--border)] outline-none"
        >
          <option value="all">All Clubs</option>
          {clubEntries.map(c => (
            <option key={c.key} value={c.key}>{c.name} ({c.key})</option>
          ))}
        </select>
      </div>

      {/* Dictionary JSON Inspector */}
      {showDictModal && (
        <div className="mb-5 p-4 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] overflow-x-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[var(--text)]">
              Live Dictionary Response (<code>GET /api/hub</code> & <code>GET /api/dict</code>)
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              {Object.keys(rawDict || {}).length} keys in dictionary_store
            </span>
          </div>
          <pre className="text-[11px] text-[var(--text-muted)] max-h-60 overflow-y-auto m-0">
            {JSON.stringify(
              selectedClubKey === 'all' ? hubDict : hubDict[selectedClubKey],
              null,
              2
            )}
          </pre>
        </div>
      )}

      {/* Feed Grid */}
      <div className="grid grid-cols-2 gap-3.5 mb-5">
        {allItems.map(item => {
          const meta = PLATFORM_META[item.platform] || PLATFORM_META.all
          return (
            <div
              key={`${item.platform}_${item.id || item.external_id}`}
              className="p-3.5 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] flex flex-col justify-between gap-2"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <BubbleTag label={`${meta.badge} ${meta.label}`} color={meta.color} size="sm" />
                    <BubbleTag label={item.clubName} color="blue" size="sm" />
                  </div>
                  <span className="text-[11px] text-[var(--text-light)]">{item.author}</span>
                </div>
                <div className="font-semibold text-[13px] text-[var(--text)]">{item.title}</div>
                <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">{item.body}</p>
              </div>

              {(item.extracted_time || item.extracted_location) && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border)] text-[11px] text-[var(--text)]">
                  {item.extracted_time && (
                    <span className="px-2 py-0.5 rounded bg-[var(--bg-card)]">
                      ⏰ <strong>Time:</strong> {item.extracted_time}
                    </span>
                  )}
                  {item.extracted_location && (
                    <span className="px-2 py-0.5 rounded bg-[var(--bg-card)]">
                      📍 <strong>Location:</strong> {item.extracted_location}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Quick Ingest Form: Add a post/message/email and auto-extract meeting time + location */}
      <form
        onSubmit={handleIngestSubmit}
        className="p-3.5 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)]"
      >
        <div className="text-xs font-semibold text-[var(--text)] mb-2.5">
          ➕ Ingest New Post / Message / Email into Dictionary (Auto-Extracts Time & Location)
        </div>
        <div className="grid grid-cols-[1fr_1fr_2fr_auto] gap-2 items-center">
          <select
            value={clubKey}
            onChange={e => setClubKey(e.target.value)}
            className="px-3 py-2 rounded-lg text-xs bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)]"
          >
            <option value="cs">Computer Science Club (cs)</option>
            <option value="ds">Debate Society (ds)</option>
            <option value="ac">Art Collective (ac)</option>
            <option value="ec">Econ Society (ec)</option>
            <option value="acappella">A Cappella Group (acappella)</option>
          </select>

          <select
            value={platform}
            onChange={e => setPlatform(e.target.value)}
            className="px-3 py-2 rounded-lg text-xs bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)]"
          >
            <option value="instagram">📸 Instagram Post</option>
            <option value="discord">💬 Discord Message</option>
            <option value="email">📧 Mailing List Email</option>
            <option value="google_calendar">📅 Google Calendar</option>
            <option value="website">🔗 Club Website</option>
          </select>

          <input
            type="text"
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="e.g. Urgent! CS Club meeting moved to Tuesdays at 3:00 PM in Engineering Hall 105"
            className="px-3 py-2 rounded-lg text-xs bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)] w-full"
          />

          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-[var(--blue)] text-white text-xs font-semibold border-none cursor-pointer hover:opacity-90"
          >
            Ingest & Parse
          </button>
        </div>
        {statusMsg && (
          <div className="text-[11px] text-[var(--text-muted)] mt-2">{statusMsg}</div>
        )}
      </form>
    </Card>
  )
}
