import { useState } from 'react'
import {
  FileText, Table, MessageCircle, PlayCircle, CheckCircle, ArrowUpRight, Plus, Globe,
} from 'lucide-react'
import { links as defaultLinks } from '../data/sampleData'
import { Card, BubbleTag } from './ui'
import { createLink } from '../api/client'

const iconMap = { FileText, Table, MessageCircle, PlayCircle, CheckCircle, Globe }

const KIND_COLOR_MAP = {
  discord: 'purple',
  form: 'red',
  document: 'blue',
  website: 'green',
}

const KIND_ICON_MAP = {
  discord: 'MessageCircle',
  form: 'CheckCircle',
  document: 'FileText',
  website: 'Globe',
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
          category: kind,
          color: KIND_COLOR_MAP[kind] || 'teal',
          icon: KIND_ICON_MAP[kind] || 'Globe',
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
    <Card className="p-4 sm:p-[22px] flex flex-col" delay={6}>
      <div className="flex items-center justify-between mb-4 sm:mb-[18px]">
        <div>
          <h2 className="text-[15.5px] sm:text-[16px] font-extrabold tracking-tight text-[var(--text)]">
            Links &amp; Resources
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Pinned club docs, sheets &amp; channels
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAdd(prev => !prev)}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[var(--blue)]
            text-white border-none text-xs font-bold cursor-pointer hover:opacity-90
            transition-opacity shadow-xs"
        >
          <Plus size={13} strokeWidth={2.5} />
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
              className="px-3.5 py-1.5 rounded-lg bg-[var(--blue)] text-white text-xs font-bold border-none cursor-pointer"
            >
              Save
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-col gap-2.5">
        {links.map(link => {
          const c = link.color || 'blue'
          const Icon = iconMap[link.icon] || Globe
          return (
            <a
              key={link.id}
              href={link.url || '#resource'}
              target={link.url && link.url !== '#' ? '_blank' : undefined}
              rel="noreferrer"
              onClick={e => {
                if (!link.url || link.url === '#') e.preventDefault()
              }}
              className="group flex items-center gap-3.5 px-3.5 py-2.5 rounded-[var(--radius-sm)]
                bg-[var(--bg-card)] border border-[var(--border)] shadow-[var(--shadow-xs)]
                hover:border-[var(--border-strong)] hover:shadow-[var(--shadow)]
                no-underline transition-all duration-200"
              style={{ textDecoration: 'none' }}
            >
              <div
                className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0
                  transition-transform duration-200 group-hover:scale-105"
                style={{
                  background: `var(--${c}-light)`,
                  border: `1px solid color-mix(in srgb, var(--${c}) 22%, transparent)`,
                }}
              >
                <Icon
                  size={17}
                  strokeWidth={2.2}
                  style={{ color: `var(--${c}-ink, var(--${c}))` }}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] font-bold text-[var(--text)] truncate group-hover:text-[var(--blue-ink)] transition-colors">
                    {link.title}
                  </span>
                  {link.category && (
                    <BubbleTag label={link.category} color={c} size="sm" />
                  )}
                </div>
                <div className="text-[11.5px] text-[var(--text-muted)] truncate mt-0.5">
                  {link.subtitle}
                </div>
              </div>

              <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0
                  bg-[var(--bg-surface)] border border-[var(--border-subtle)]
                  text-[var(--text-light)] group-hover:text-[var(--blue-ink)]
                  group-hover:border-[var(--blue)] transition-all"
              >
                <ArrowUpRight
                  size={14}
                  className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                />
              </div>
            </a>
          )
        })}
      </div>
    </Card>
  )
}
