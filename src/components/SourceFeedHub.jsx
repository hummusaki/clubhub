import { useState } from 'react'
import { Card, BubbleTag } from './ui'
import { ingestFromSource, syncAllSources } from '../api/client'

const SOURCE_TABS = [
  { id: 'all',             label: 'All Sources',     badge: '🌐', color: 'blue' },
  { id: 'instagram',       label: 'Instagram',       badge: '📸', color: 'purple' },
  { id: 'discord',         label: 'Discord',         badge: '💬', color: 'blue' },
  { id: 'email',           label: 'Mailing Lists',   badge: '📧', color: 'yellow' },
  { id: 'google_calendar', label: 'Google Calendar', badge: '📅', color: 'green' },
  { id: 'website',         label: 'Websites',        badge: '🔗', color: 'teal' },
]

const SOURCE_BADGES = Object.fromEntries(SOURCE_TABS.map(s => [s.id, s]))

export default function SourceFeedHub({ hubDict = {}, rawDict = {}, onRefresh }) {
  const [selectedSource, setSelectedSource] = useState('all')
  const [selectedClubId, setSelectedClubId] = useState('all')
  const [showDictModal, setShowDictModal] = useState(false)

  // Quick-ingest form state
  const clubEntries = Object.values(hubDict)
  const [clubId, setClubId] = useState('demo_ucsc_csclub')
  const [source, setSource] = useState('instagram')
  const [caption, setCaption] = useState('')
  const [statusMsg, setStatusMsg] = useState(null)

  const filteredClubs = selectedClubId === 'all'
    ? clubEntries
    : clubEntries.filter(c => c.id === selectedClubId)

  const allPosts = []
  for (const club of filteredClubs) {
    for (const post of club.posts || []) {
      const postSource = post.source || 'instagram'
      if (selectedSource !== 'all' && postSource !== selectedSource) continue
      allPosts.push({
        ...post,
        source: postSource,
        clubName: club.name,
      })
    }
  }

  async function handleSyncAll() {
    setStatusMsg('Syncing Instagram, Discord, Email, Google Calendar & Websites…')
    const res = await syncAllSources('all')
    if (res && res.ok) {
      setStatusMsg('✅ Synced all sources into SQLite database & dictionary!')
      if (onRefresh) onRefresh()
    } else {
      setStatusMsg('⚠️ Could not reach backend API on port 3001. Run `npm run server`!')
    }
  }

  async function handleIngestSubmit(e) {
    e.preventDefault()
    if (!caption.trim()) return
    setStatusMsg('Extracting dates, times, locations & links…')
    const res = await ingestFromSource(source, {
      clubId,
      caption: caption.trim(),
    })
    if (res && res.success) {
      const evCount = res.extracted?.events?.length || 0
      const locInfo = res.extracted?.events?.[0]?.location
        ? `📍 ${res.extracted.events[0].location}`
        : 'saved'
      setStatusMsg(`✅ Upserted "${res.postId}" from ${source} (${evCount} event(s), ${locInfo})`)
      setCaption('')
      if (onRefresh) onRefresh()
    } else {
      setStatusMsg('⚠️ Could not reach backend API on port 3001. Run `npm run server`!')
    }
  }

  return (
    <Card className="p-[22px] mb-7" delay={4}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-[var(--text)]">
            Multi-Source Feed & ClubHub Dictionary
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Combines meeting times, locations & links from Instagram, Discord, Mailing Lists, Google Calendars & Websites (keyed by <code>clubId</code>)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncAll}
            className="px-3.5 py-1.5 rounded-full bg-[var(--blue)] text-white
              border-none text-xs font-semibold cursor-pointer hover:opacity-90"
          >
            🔄 Sync All Sources
          </button>

          <button
            onClick={() => setShowDictModal(prev => !prev)}
            className="px-3.5 py-1.5 rounded-full bg-[var(--bg-surface)] text-[var(--blue)]
              border border-[var(--border)] text-xs font-semibold cursor-pointer hover:opacity-90"
          >
            {showDictModal ? 'Hide Dictionary JSON' : '📖 View Dictionary JSON'}
          </button>
        </div>
      </div>

      {/* Source Tabs + Club Selector */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex flex-wrap gap-1.5">
          {SOURCE_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedSource(tab.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer border-none transition-all
                ${selectedSource === tab.id
                  ? 'bg-[var(--blue)] text-white'
                  : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
            >
              {tab.badge} {tab.label}
            </button>
          ))}
        </div>

        <select
          value={selectedClubId}
          onChange={e => setSelectedClubId(e.target.value)}
          className="px-3 py-1.5 rounded-full text-xs bg-[var(--bg-surface)] text-[var(--text)]
            border border-[var(--border)] outline-none"
        >
          <option value="all">All Clubs ({clubEntries.length})</option>
          {clubEntries.map(c => (
            <option key={c.id} value={c.id}>{c.name} (@{c.id})</option>
          ))}
        </select>
      </div>

      {showDictModal && (
        <div className="mb-5 p-4 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] overflow-x-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[var(--text)]">
              Live Dictionary Response (<code>GET /api/hub</code> & <code>GET /api/data</code>)
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              {Object.keys(rawDict || {}).length} keys in dictionary_store
            </span>
          </div>
          <pre className="text-[11px] text-[var(--text-muted)] max-h-60 overflow-y-auto m-0">
            {JSON.stringify(
              selectedClubId === 'all' ? hubDict : hubDict[selectedClubId],
              null,
              2
            )}
          </pre>
        </div>
      )}

      {allPosts.length > 0 && (
        <div className="grid grid-cols-2 gap-3.5 mb-5">
          {allPosts.map(post => {
            const srcMeta = SOURCE_BADGES[post.source] || SOURCE_BADGES.instagram
            return (
              <div
                key={post.id}
                className="p-3.5 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] flex flex-col justify-between gap-2"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <BubbleTag label={`${srcMeta.badge} ${srcMeta.label}`} color={srcMeta.color} size="sm" />
                      <BubbleTag label={`@${post.clubId}`} color="blue" size="sm" />
                      <BubbleTag label={post.type || 'post'} color={post.important ? 'red' : 'teal'} size="sm" />
                    </div>
                    <span className="text-[11px] text-[var(--text-light)]">
                      {post.postedAt ? new Date(post.postedAt).toLocaleDateString() : ''}
                    </span>
                  </div>
                  <div className="font-semibold text-[13px] text-[var(--text)]">
                    {post.important ? '⚠️ ' : ''}{post.title || post.clubName}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                    {post.summary || post.caption}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <form
        onSubmit={handleIngestSubmit}
        className="p-3.5 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)]"
      >
        <div className="text-xs font-semibold text-[var(--text)] mb-2.5">
          ➕ Add / Upsert Information from Instagram, Discord, Mailing Lists, Google Calendar, or Website
        </div>
        <div className="grid grid-cols-[1fr_1fr_2fr_auto] gap-2 items-center">
          <input
            type="text"
            value={clubId}
            onChange={e => setClubId(e.target.value)}
            placeholder="clubId (Instagram handle)"
            className="px-3 py-2 rounded-lg text-xs bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)]"
          />

          <select
            value={source}
            onChange={e => setSource(e.target.value)}
            className="px-3 py-2 rounded-lg text-xs bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)]"
          >
            <option value="instagram">📸 Instagram</option>
            <option value="discord">💬 Discord</option>
            <option value="email">📧 Mailing List / Email</option>
            <option value="google_calendar">📅 Google Calendar</option>
            <option value="website">🔗 Club Website</option>
          </select>

          <input
            type="text"
            value={caption}
            onChange={e => setCaption(e.target.value)}
            placeholder="e.g. ⚠️ ROOM CHANGE: Meeting tomorrow at 6pm in Baskin Engineering 152"
            className="px-3 py-2 rounded-lg text-xs bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)] w-full"
          />

          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-[var(--blue)] text-white text-xs font-semibold border-none cursor-pointer hover:opacity-90"
          >
            Save & Extract
          </button>
        </div>
        {statusMsg && (
          <div className="text-[11px] text-[var(--text-muted)] mt-2">{statusMsg}</div>
        )}
      </form>
    </Card>
  )
}
