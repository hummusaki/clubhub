import { useState } from 'react'
import { ExternalLink, Plus } from 'lucide-react'
import { links as defaultLinks } from '../data/sampleData'
import { Card, IconBadge, cleanText } from './ui'
import { PlatformIcon } from './icons'
import { createLink } from '../api/client'

const KIND_COLOR_MAP = {
  discord: 'purple',
  form: 'red',
  document: 'blue',
  website: 'green',
}

const KIND_ICON_MAP = {
  discord: 'discord',
  form: 'form',
  document: 'document',
  website: 'website',
}

export default function LinksResources({ items, clubs = [], onRefresh, onCountChange }) {
  const [localAdded, setLocalAdded] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [clubId, setClubId] = useState('demo_ucsc_csclub')
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState('website')

  const baseLinks = items && items.length > 0 ? items : defaultLinks
  const links = [...localAdded, ...baseLinks]

  async function handleAddLink(e) {
    e.preventDefault()
    if (!label.trim()) return
    const selectedClub = clubs.find(c => c.id === clubId)
    const cleanUrl = url.trim() || '#'

    const created = await createLink({
      clubId,
      clubName: selectedClub?.name || clubId,
      label: label.trim(),
      url: cleanUrl,
      kind,
    })

    if (created && onRefresh) {
      onRefresh()
    } else {
      setLocalAdded(prev => [
        {
          id: Date.now(),
          title: label.trim(),
          subtitle: cleanUrl === '#' ? 'Shared link · Added just now' : cleanUrl,
          url: cleanUrl,
          color: KIND_COLOR_MAP[kind] || 'teal',
          icon: KIND_ICON_MAP[kind] || 'website',
        },
        ...prev,
      ])
      if (onCountChange) onCountChange(c => c + 1)
    }

    setLabel('')
    setUrl('')
    setShowAdd(false)
  }

  return (
    <Card className="p-4 sm:p-[22px]" delay={6}>
      <div className="flex items-center justify-between mb-4 sm:mb-[18px]">
        <h2 className="text-base font-bold text-[var(--text)]">Links &amp; Resources</h2>

        <button
          type="button"
          onClick={() => setShowAdd(prev => !prev)}
          className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-[var(--blue)]
            text-white border-none text-xs font-semibold cursor-pointer hover:opacity-90
            transition-opacity"
        >
          <Plus size={13} />
          {showAdd ? 'Cancel' : 'Add Link'}
        </button>
      </div>

      {showAdd && (
        <form
          onSubmit={handleAddLink}
          className="mb-3.5 p-3 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] flex flex-col gap-2"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={clubId}
              onChange={e => setClubId(e.target.value)}
              placeholder="clubId (e.g. demo_ucsc_csclub)"
              className="px-2.5 py-1.5 rounded-lg text-xs bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
            />
            <select
              value={kind}
              onChange={e => setKind(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg text-xs bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
            >
              <option value="website">Website / Link in bio</option>
              <option value="discord">Discord Server</option>
              <option value="form">Sign-up Form</option>
              <option value="document">Document / Slides</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Label (e.g. Discord Server)"
              className="px-2.5 py-1.5 rounded-lg text-xs bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
            />
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://..."
              className="px-2.5 py-1.5 rounded-lg text-xs bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
            />
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-lg bg-[var(--blue)] text-white text-xs font-semibold border-none cursor-pointer"
            >
              Save
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-col gap-2.5">
        {links.map(link => {
          const c = link.color || 'blue'
          return (
            <a
              key={link.id}
              href={link.url || '#'}
              target={link.url && link.url !== '#' ? '_blank' : undefined}
              rel="noreferrer"
              onClick={e => {
                if (!link.url || link.url === '#') e.preventDefault()
              }}
              className="flex items-center gap-3 px-3.5 py-3 rounded-[var(--radius-sm)]
                bg-[var(--bg-surface)] border border-[var(--border-subtle)]
                hover:bg-[var(--blue-light)] no-underline transition-colors duration-200"
              style={{ textDecoration: 'none' }}
            >
              <IconBadge color={c} size={38} radius={11}>
                <PlatformIcon type={link.icon} size={19} />
              </IconBadge>

              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-[var(--text)] truncate">
                  {cleanText(link.title)}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] truncate">
                  {cleanText(link.subtitle)}
                </div>
              </div>

              <ExternalLink size={15} className="text-[var(--text-light)] shrink-0" />
            </a>
          )
        })}
      </div>
    </Card>
  )
}
