import { useState } from 'react'
import { FileText, Table, MessageCircle, PlayCircle, CheckCircle, ExternalLink, Globe } from 'lucide-react'
import { links as defaultLinks } from '../data/sampleData'
import { Card } from './ui'
import { createLink } from '../api/client'

const iconMap = { FileText, Table, MessageCircle, PlayCircle, CheckCircle, Globe }

export default function LinksResources({ items, clubs = [], onRefresh }) {
  const links = items && items.length > 0 ? items : defaultLinks
  const [showAdd, setShowAdd] = useState(false)
  const [clubId, setClubId] = useState('demo_ucsc_csclub')
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState('website')

  async function handleAddLink(e) {
    e.preventDefault()
    if (!url.trim() || !label.trim()) return
    const selectedClub = clubs.find(c => c.id === clubId)
    await createLink({
      clubId,
      clubName: selectedClub?.name || clubId,
      label: label.trim(),
      url: url.trim(),
      kind,
    })
    setLabel('')
    setUrl('')
    setShowAdd(false)
    if (onRefresh) onRefresh()
  }

  return (
    <Card className="p-[22px]" delay={6}>
      <div className="flex items-center justify-between mb-[18px]">
        <h2 className="text-base font-bold text-[var(--text)]">Links & Resources</h2>
        <button
          onClick={() => setShowAdd(prev => !prev)}
          className="px-3.5 py-1.5 rounded-full bg-[var(--blue)] text-white border-none
            text-xs font-semibold cursor-pointer hover:opacity-90 transition-opacity"
        >
          {showAdd ? 'Cancel' : '+ Add Link'}
        </button>
      </div>

      {showAdd && (
        <form
          onSubmit={handleAddLink}
          className="mb-3.5 p-3 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] flex flex-col gap-2"
        >
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={clubId}
              onChange={e => setClubId(e.target.value)}
              placeholder="clubId (e.g. demo_ucsc_csclub)"
              className="px-2.5 py-1.5 rounded text-xs bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)]"
            />
            <select
              value={kind}
              onChange={e => setKind(e.target.value)}
              className="px-2.5 py-1.5 rounded text-xs bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)]"
            >
              <option value="website">Website / Link in bio</option>
              <option value="discord">Discord Server</option>
              <option value="form">Sign-up Form</option>
              <option value="document">Document / Slides</option>
            </select>
          </div>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Label (e.g. Discord Server)"
              className="px-2.5 py-1.5 rounded text-xs bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)]"
            />
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://..."
              className="px-2.5 py-1.5 rounded text-xs bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)]"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded bg-[var(--blue)] text-white text-xs font-semibold border-none cursor-pointer"
            >
              Save
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-col gap-2.5">
        {links.map(link => {
          const Icon = iconMap[link.icon] || Globe
          return (
            <a
              key={link.id}
              href={link.url || '#'}
              target={link.url ? '_blank' : undefined}
              rel="noreferrer"
              className="flex items-center gap-3 px-3.5 py-3 rounded-[var(--radius-sm)]
                bg-[var(--bg-surface)] no-underline transition-colors duration-200
                hover:bg-[var(--blue-light)] group"
              style={{ textDecoration: 'none' }}
            >
              <div
                className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
                style={{ background: `var(--${link.color || 'blue'}-light)` }}
              >
                {Icon && <Icon size={18} style={{ color: `var(--${link.color || 'blue'})` }} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-[var(--text)]">{link.title}</div>
                <div className="text-[11px] text-[var(--text-muted)] truncate">{link.subtitle}</div>
              </div>
              <ExternalLink size={16} className="text-[var(--text-light)] shrink-0" />
            </a>
          )
        })}
      </div>
    </Card>
  )
}
