import { useState, useMemo } from 'react'
import { Megaphone, X, Send } from 'lucide-react'
import { BubbleTag } from './ui'
import LeadershipShortcutBar, { resolveDeduplicatedTargets } from './LeadershipShortcutBar'
import { createClubAnnouncement } from '../api/workspaceClient'

const ANNOUNCEMENT_TYPES = ['Update', 'Event', 'Urgent']

export default function TargetedAnnouncementModal({
  clubId,
  clubName,
  clubPeople,
  onClose,
  onCreated,
  onNotify,
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [type, setType] = useState('Update')
  const [visibility, setVisibility] = useState('members')
  const [selectedShortcuts, setSelectedShortcuts] = useState(['everyone'])
  const [permalink, setPermalink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function handleToggleShortcut(token) {
    setSelectedShortcuts(prev => {
      const exists = prev.includes(token)
      const next = exists ? prev.filter(t => t !== token) : [...prev, token]
      if (next.length === 1 && next[0] === 'all_board') {
        setVisibility('board')
      } else if (next.some(t => t.startsWith('group:')) && !next.includes('everyone')) {
        setVisibility('group')
      } else if (next.includes('everyone')) {
        setVisibility('members')
      }
      return next
    })
  }

  const resolvedTargets = useMemo(
    () => resolveDeduplicatedTargets(clubPeople, selectedShortcuts, []),
    [clubPeople, selectedShortcuts]
  )

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Announcement title is required.')
      return
    }
    setBusy(true)
    setError('')

    const targetGroupIds = selectedShortcuts
      .filter(s => s.startsWith('group:'))
      .map(s => s.slice(6))

    const res = await createClubAnnouncement(clubId, {
      title: title.trim(),
      body: body.trim(),
      type,
      visibility,
      targetGroupIds,
      shortcutTargets: selectedShortcuts,
      permalink: permalink.trim(),
    })
    setBusy(false)

    if (!res.ok) {
      setError(res.error || 'Could not publish announcement.')
      return
    }

    if (onNotify) {
      onNotify(`Published "${title.trim()}" (${res.announcement?.recipientsSummary || 'Club'})!`)
    }
    if (onCreated) onCreated(res.announcement)
    if (onClose) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] shadow-[var(--shadow-lg)] p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Megaphone size={18} className="text-[var(--blue)]" />
            <h3 className="text-base font-bold text-[var(--text)]">
              New Targeted Announcement · {clubName}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg bg-transparent hover:bg-[var(--bg-surface)] border-none cursor-pointer text-[var(--text-muted)]"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <LeadershipShortcutBar
            clubPeople={clubPeople}
            selectedShortcuts={selectedShortcuts}
            onToggleShortcut={handleToggleShortcut}
          />

          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <span>Audience scope:</span>
            <BubbleTag
              label={
                visibility === 'board'
                  ? 'Board Leadership Only'
                  : visibility === 'group'
                    ? 'Selected Sub-Groups'
                    : visibility === 'public'
                      ? 'Public Campus-Wide'
                      : 'All Club Members'
              }
              color={visibility === 'board' ? 'purple' : visibility === 'group' ? 'teal' : 'blue'}
              size="sm"
            />
            {resolvedTargets.length > 0 && (
              <span className="font-semibold text-[var(--text)]">
                · {resolvedTargets.length} deduplicated{' '}
                {resolvedTargets.length === 1 ? 'recipient' : 'recipients'}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                Category
              </label>
              <select
                value={type}
                onChange={e => setType(e.target.value)}
                className="w-full min-h-[38px] px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-xs font-medium text-[var(--text)]"
              >
                {ANNOUNCEMENT_TYPES.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                Visibility Tier
              </label>
              <select
                value={visibility}
                onChange={e => setVisibility(e.target.value)}
                className="w-full min-h-[38px] px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-xs font-medium text-[var(--text)]"
              >
                <option value="members">All Club Members</option>
                <option value="group">Targeted Sub-Groups Only</option>
                <option value="board">Board / Leadership Only</option>
                <option value="public">Public Campus Feed</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
              Headline
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g., Marketing sprint kickoff moved to Room 152"
              className="w-full min-h-[38px] px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-sm text-[var(--text)]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
              Details
            </label>
            <textarea
              rows={3}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Share agenda notes, action items, or links..."
              className="w-full p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-sm text-[var(--text)] resize-y"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
              Optional Link
            </label>
            <input
              type="url"
              value={permalink}
              onChange={e => setPermalink(e.target.value)}
              placeholder="https://..."
              className="w-full min-h-[36px] px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-xs text-[var(--text)]"
            />
          </div>

          {error && (
            <div className="text-xs font-semibold text-[var(--red-ink)] bg-[var(--red-light)] px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 min-h-[36px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-xs font-semibold text-[var(--text-muted)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 min-h-[36px] rounded-xl bg-[var(--blue)] text-white text-xs font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50"
            >
              <Send size={13} />
              <span>{busy ? 'Publishing…' : 'Publish Announcement'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
