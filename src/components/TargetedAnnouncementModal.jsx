import { useState, useMemo } from 'react'
import { Megaphone, Send } from 'lucide-react'
import { BubbleTag, ModalDialog, cleanText, Button } from './ui'
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
    <ModalDialog title="New targeted announcement"
      subtitle={`${cleanText(clubName)} · Choose who will receive this announcement`}
      icon={<Megaphone size={18} />} iconColor="purple" onClose={onClose}>
        <form onSubmit={handleSubmit} className="dense-controls space-y-3">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Category
              </label>
              <select
                value={type}
                onChange={e => setType(e.target.value)}
                className="w-full min-h-[40px] px-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--md-outline)] text-base sm:text-sm font-medium text-[var(--text)] outline-none focus:border-[var(--blue)]"
              >
                {ANNOUNCEMENT_TYPES.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Visibility Tier
              </label>
              <select
                value={visibility}
                onChange={e => setVisibility(e.target.value)}
                className="w-full min-h-[40px] px-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--md-outline)] text-base sm:text-sm font-medium text-[var(--text)] outline-none focus:border-[var(--blue)]"
              >
                <option value="members">All Club Members</option>
                <option value="group">Targeted Sub-Groups Only</option>
                <option value="board">Board / Leadership Only</option>
                <option value="public">Public Campus Feed</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              Headline
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g., Marketing sprint kickoff moved to Room 152"
              className="w-full min-h-[40px] px-3.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--md-outline)] text-base sm:text-sm text-[var(--text)] outline-none focus:border-[var(--blue)]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              Details
            </label>
            <textarea
              rows={3}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Share agenda notes, action items, or links..."
              className="w-full p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--md-outline)] text-base sm:text-sm text-[var(--text)] resize-y outline-none focus:border-[var(--blue)]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              Optional Link
            </label>
            <input
              type="url"
              value={permalink}
              onChange={e => setPermalink(e.target.value)}
              placeholder="https://..."
              className="w-full min-h-[40px] px-3.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--md-outline)] text-base sm:text-sm text-[var(--text)] outline-none focus:border-[var(--blue)]"
            />
          </div>

          {error && (
            <div className="text-xs font-semibold text-[var(--red-ink)] bg-[var(--red-light)] border border-[var(--red)]/30 px-3 py-2.5 rounded-xl">
              {error}
            </div>
          )}

          <div className="flex flex-col-reverse xs:flex-row items-stretch xs:items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
            <Button
              variant="text"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              variant="filled"
              type="submit"
              disabled={busy}
              leadingIcon={<Send size={14} />}
            >
              {busy ? 'Publishing…' : 'Publish Announcement'}
            </Button>
          </div>
        </form>
    </ModalDialog>
  )
}
