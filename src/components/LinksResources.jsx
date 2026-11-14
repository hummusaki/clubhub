import { useState } from 'react'
<<<<<<< HEAD
import { FileText, Table, MessageCircle, PlayCircle, CheckCircle, ExternalLink, Globe } from 'lucide-react'
import { links as defaultLinks } from '../data/sampleData'
import { Card } from './ui'
import { createLink } from '../api/client'
=======
import {
  FileText, Table, MessageCircle, PlayCircle, CheckCircle, ArrowUpRight, Plus,
} from 'lucide-react'
import { links as initialLinks } from '../data/sampleData'
import { Card, BubbleTag } from './ui'
>>>>>>> 9a2a3a902f9ab8eef6d18195ce87b0cf54464fde

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

<<<<<<< HEAD
=======
export default function LinksResources({ onCountChange }) {
  const [items, setItems] = useState(initialLinks)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')

  function handleAdd(e) {
    e.preventDefault()
    if (!title.trim()) return
    const next = {
      id: Date.now(),
      title: title.trim(),
      subtitle: subtitle.trim() || 'Shared link · Added just now',
      category: 'Resource',
      color: 'teal',
      icon: 'FileText',
      pinned: false,
    }
    setItems(prev => [next, ...prev])
    if (onCountChange) onCountChange(c => c + 1)
    setTitle('')
    setSubtitle('')
    setAdding(false)
  }

>>>>>>> 9a2a3a902f9ab8eef6d18195ce87b0cf54464fde
  return (
    <Card className="p-[22px] flex flex-col" delay={6}>
      <div className="flex items-center justify-between mb-[18px]">
        <div>
          <h2 className="text-[16px] font-extrabold tracking-tight text-[var(--text)]">
            Links &amp; Resources
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Pinned club docs, sheets &amp; channels
          </p>
        </div>

        <button
<<<<<<< HEAD
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
=======
          type="button"
          onClick={() => setAdding(a => !a)}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[var(--blue)]
            text-white border-none text-xs font-bold cursor-pointer hover:opacity-90
            transition-opacity shadow-xs"
        >
          <Plus size={13} strokeWidth={2.5} />
          {adding ? 'Close' : 'Add Link'}
        </button>
      </div>

      {adding && (
        <form
          onSubmit={handleAdd}
          className="mb-3 p-3 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] flex flex-col sm:flex-row gap-2"
        >
          <input
            type="text"
            placeholder="Resource title…"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="flex-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]
              text-xs text-[var(--text)] outline-none focus:border-[var(--blue)]"
          />
          <input
            type="text"
            placeholder="Source or URL note…"
            value={subtitle}
            onChange={e => setSubtitle(e.target.value)}
            className="flex-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]
              text-xs text-[var(--text)] outline-none focus:border-[var(--blue)]"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-[var(--blue)] text-white text-xs font-bold border-none cursor-pointer"
          >
            Save
          </button>
>>>>>>> 9a2a3a902f9ab8eef6d18195ce87b0cf54464fde
        </form>
      )}

      <div className="flex flex-col gap-2.5">
<<<<<<< HEAD
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
=======
        {items.map(link => {
          const Icon = iconMap[link.icon] || FileText
          return (
            <a
              key={link.id}
              href="#resource"
              onClick={e => e.preventDefault()}
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
                  background: `var(--${link.color}-light)`,
                  border: `1px solid color-mix(in srgb, var(--${link.color}) 22%, transparent)`,
                }}
              >
                <Icon
                  size={17}
                  strokeWidth={2.2}
                  style={{ color: `var(--${link.color}-ink, var(--${link.color}))` }}
                />
>>>>>>> 9a2a3a902f9ab8eef6d18195ce87b0cf54464fde
              </div>

              <div className="flex-1 min-w-0">
<<<<<<< HEAD
                <div className="text-[13px] font-semibold text-[var(--text)]">{link.title}</div>
                <div className="text-[11px] text-[var(--text-muted)] truncate">{link.subtitle}</div>
=======
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] font-bold text-[var(--text)] truncate group-hover:text-[var(--blue-ink)] transition-colors">
                    {link.title}
                  </span>
                  {link.category && (
                    <BubbleTag label={link.category} color={link.color} size="sm" />
                  )}
                </div>
                <div className="text-[11.5px] text-[var(--text-muted)] truncate mt-0.5">
                  {link.subtitle}
                </div>
              </div>

              <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0
                  bg-[var(--bg-card)] border border-[var(--border-subtle)]
                  text-[var(--text-light)] group-hover:text-[var(--blue-ink)]
                  group-hover:border-[var(--blue)] transition-all"
              >
                <ArrowUpRight
                  size={14}
                  className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                />
>>>>>>> 9a2a3a902f9ab8eef6d18195ce87b0cf54464fde
              </div>
            </a>
          )
        })}
      </div>
    </Card>
  )
}
