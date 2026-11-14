import { useState } from 'react'
import {
  RefreshCw,
  Code2,
  Plus,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { Card, BubbleTag, IconBadge, cleanText } from './ui'
import { PlatformIcon } from './icons'
import { ingestFromSource, syncAllSources } from '../api/client'

const SOURCE_TABS = [
  { id: 'all',             label: 'All Sources',     color: 'blue' },
  { id: 'instagram',       label: 'Instagram',       color: 'purple' },
  { id: 'discord',         label: 'Discord',         color: 'blue' },
  { id: 'email',           label: 'Mailing Lists',   color: 'yellow' },
  { id: 'google_calendar', label: 'Google Calendar', color: 'green' },
  { id: 'website',         label: 'Websites',        color: 'teal' },
]

const SOURCE_BADGES = Object.fromEntries(SOURCE_TABS.map(s => [s.id, s]))

export default function SourceFeedHub({ hubDict = {}, rawDict = {}, onRefresh }) {
  const [selectedSource, setSelectedSource] = useState('all')
  const [selectedClubId, setSelectedClubId] = useState('all')
  const [showDictModal, setShowDictModal] = useState(false)
  const [showIngestForm, setShowIngestForm] = useState(false)

  const clubEntries = Object.values(hubDict)
  const [clubId, setClubId] = useState('demo_ucsc_csclub')
  const [source, setSource] = useState('instagram')
  const [caption, setCaption] = useState('')
  const [status, setStatus] = useState(null)

  const filteredClubs =
    selectedClubId === 'all'
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
    setStatus({ ok: true, text: 'Syncing sources…' })
    const res = await syncAllSources('all')
    if (res && res.ok) {
      setStatus({ ok: true, text: 'Synced all sources into SQLite database.' })
      if (onRefresh) onRefresh()
    } else {
      setStatus({ ok: false, text: 'Backend API offline on port 3001 (run npm run server).' })
    }
  }

  async function handleIngestSubmit(e) {
    e.preventDefault()
    if (!caption.trim()) return
    setStatus({ ok: true, text: 'Extracting dates, times & locations…' })
    const res = await ingestFromSource(source, {
      clubId,
      caption: caption.trim(),
    })
    if (res && res.success) {
      const evCount = res.extracted?.events?.length || 0
      setStatus({
        ok: true,
        text: `Saved "${res.postId}" from ${source} (${evCount} event(s) extracted).`,
      })
      setCaption('')
      setShowIngestForm(false)
      if (onRefresh) onRefresh()
    } else {
      setStatus({ ok: false, text: 'Backend API offline on port 3001 (run npm run server).' })
    }
  }

  return (
    <Card className="p-4 sm:p-[22px] mb-5 sm:mb-7" delay={4}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-[var(--text)]">Multi-Source Feed</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Synced posts and events across Instagram, Discord, Email, and Calendar
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowIngestForm(prev => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--bg-surface)]
              text-[var(--text)] border border-[var(--border)] text-xs font-medium cursor-pointer"
          >
            <Plus size={13} />
            {showIngestForm ? 'Close Form' : 'Ingest Post'}
          </button>

          <button
            type="button"
            onClick={() => setShowDictModal(prev => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--bg-surface)]
              text-[var(--text-muted)] border border-[var(--border)] text-xs font-medium cursor-pointer"
          >
            <Code2 size={13} />
            {showDictModal ? 'Hide JSON' : 'Dictionary'}
          </button>

          <button
            type="button"
            onClick={handleSyncAll}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[var(--blue)]
              text-white border-none text-xs font-semibold cursor-pointer hover:opacity-90"
          >
            <RefreshCw size={12} />
            Sync
          </button>
        </div>
      </div>

      {/* Source Tabs + Club Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 sm:pb-0">
          {SOURCE_TABS.map(tab => {
            const isActive = selectedSource === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedSource(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                  cursor-pointer border transition-colors shrink-0
                  ${
                    isActive
                      ? 'bg-[var(--blue)] text-white border-[var(--blue)]'
                      : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
                  }`}
              >
                <PlatformIcon type={tab.id} size={14} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {clubEntries.length > 0 && (
          <select
            value={selectedClubId}
            onChange={e => setSelectedClubId(e.target.value)}
            className="px-3 py-1.5 rounded-full text-xs bg-[var(--bg-surface)] text-[var(--text)]
              border border-[var(--border)] outline-none"
          >
            <option value="all">All Clubs ({clubEntries.length})</option>
            {clubEntries.map(c => (
              <option key={c.id} value={c.id}>
                {cleanText(c.name)} (@{c.id})
              </option>
            ))}
          </select>
        )}
      </div>

      {status && (
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] mb-3">
          {status.ok ? (
            <CheckCircle2 size={13} className="text-[var(--green)] shrink-0" />
          ) : (
            <AlertCircle size={13} className="text-[var(--red)] shrink-0" />
          )}
          <span>{status.text}</span>
        </div>
      )}

      {showIngestForm && (
        <form
          onSubmit={handleIngestSubmit}
          className="mb-4 p-3.5 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)]"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr_auto] gap-2 items-center">
            <input
              type="text"
              value={clubId}
              onChange={e => setClubId(e.target.value)}
              placeholder="clubId (Instagram handle)"
              className="px-3 py-2 rounded-lg text-xs bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)] outline-none"
            />

            <select
              value={source}
              onChange={e => setSource(e.target.value)}
              className="px-3 py-2 rounded-lg text-xs bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)] outline-none"
            >
              <option value="instagram">Instagram</option>
              <option value="discord">Discord</option>
              <option value="email">Mailing List / Email</option>
              <option value="google_calendar">Google Calendar</option>
              <option value="website">Club Website</option>
            </select>

            <input
              type="text"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="Room change: Meeting tomorrow at 6pm in Engineering 152"
              className="px-3 py-2 rounded-lg text-xs bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)] w-full sm:col-span-2 lg:col-span-1 outline-none"
            />

            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[var(--blue)] text-white text-xs font-semibold border-none cursor-pointer sm:col-span-2 lg:col-span-1"
            >
              Save &amp; Extract
            </button>
          </div>
        </form>
      )}

      {showDictModal && (
        <div className="mb-4 p-3.5 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] overflow-x-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[var(--text)]">
              Dictionary JSON (<code>GET /api/hub</code>)
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              {Object.keys(rawDict || {}).length} keys
            </span>
          </div>
          <pre className="text-[11px] font-mono-num text-[var(--text-muted)] max-h-52 overflow-y-auto m-0">
            {JSON.stringify(
              selectedClubId === 'all' ? hubDict : hubDict[selectedClubId],
              null,
              2
            )}
          </pre>
        </div>
      )}

      {allPosts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {allPosts.map(post => {
            const srcMeta = SOURCE_BADGES[post.source] || SOURCE_BADGES.instagram
            return (
              <div
                key={post.id}
                className="p-3.5 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-start gap-3"
              >
                <IconBadge color={srcMeta.color} size={36} radius={10} className="mt-0.5">
                  <PlatformIcon type={post.source} size={18} />
                </IconBadge>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <BubbleTag label={srcMeta.label} color={srcMeta.color} size="sm" />
                      <BubbleTag label={`@${post.clubId}`} color="blue" size="sm" />
                    </div>
                    <span className="text-[11px] text-[var(--text-light)] shrink-0">
                      {post.postedAt ? new Date(post.postedAt).toLocaleDateString() : ''}
                    </span>
                  </div>
                  <div className="font-semibold text-[13px] text-[var(--text)]">
                    {cleanText(post.title || post.clubName)}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                    {cleanText(post.summary || post.caption)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
