import { useState, useMemo } from 'react'
import { ExternalLink, Plus, Pin, X } from 'lucide-react'
import { links as defaultLinks } from '../data/sampleData'
import { Card, IconBadge, BubbleTag, cleanText } from './ui'
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

const KIND_CATEGORY_MAP = {
  discord: 'Community',
  form: 'Events',
  document: 'Documents',
  website: 'Resources',
}

function normalizeUrl(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed || trimmed === '#') return 'https://ucsc.edu'
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export default function LinksResources({
  items,
  clubs = [],
  searchQuery = '',
  onRefresh,
  onCountChange,
  localAdded: externalLocalAdded,
  onAddLocalLink,
  pinnedOverrides: externalPinnedOverrides,
  onTogglePinOverride,
  onNotify,
}) {
  const [internalLocalAdded, setInternalLocalAdded] = useState([])
  const [internalPinnedOverrides, setInternalPinnedOverrides] = useState({})
  const [filterTab, setFilterTab] = useState('All')

  const localAdded = externalLocalAdded ?? internalLocalAdded
  const pinnedOverrides = externalPinnedOverrides ?? internalPinnedOverrides

  // Add Resource form state (44px comfortable inputs, friendly club dropdown)
  const [showAdd, setShowAdd] = useState(false)
  const [selectedClubId, setSelectedClubId] = useState(clubs[0]?.id || 'demo_ucsc_csclub')
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState('website')

  const baseLinks = items && items.length > 0 ? items : defaultLinks

  const allLinks = useMemo(() => {
    const merged = [...localAdded, ...baseLinks].map(l => {
      const isPinned =
        pinnedOverrides[l.id] !== undefined ? pinnedOverrides[l.id] : Boolean(l.pinned)
      return {
        ...l,
        url: normalizeUrl(l.url || l.subtitle),
        isPinned,
        category: l.category || 'Resources',
      }
    })

    return merged.sort((a, b) => Number(b.isPinned) - Number(a.isPinned))
  }, [localAdded, baseLinks, pinnedOverrides])

  const filteredLinks = useMemo(() => {
    return allLinks.filter(link => {
      if (filterTab === 'Pinned' && !link.isPinned) return false
      if (
        filterTab !== 'All' &&
        filterTab !== 'Pinned' &&
        link.category.toLowerCase() !== filterTab.toLowerCase()
      ) {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          (link.title || '').toLowerCase().includes(q) ||
          (link.subtitle || '').toLowerCase().includes(q) ||
          (link.category || '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [allLinks, filterTab, searchQuery])

  function togglePin(id, currentPinned, e) {
    e.preventDefault()
    e.stopPropagation()
    if (onTogglePinOverride) {
      onTogglePinOverride(id, !currentPinned)
    } else {
      setInternalPinnedOverrides(prev => ({ ...prev, [id]: !currentPinned }))
    }
  }

  async function handleAddLink(e) {
    e.preventDefault()
    if (!label.trim() || !url.trim()) return

    const selectedClub = clubs.find(c => String(c.id) === String(selectedClubId))
    const clubLabel = selectedClub ? cleanText(selectedClub.name) : ''
    const validUrl = normalizeUrl(url)

    const created = await createLink({
      clubId: String(selectedClubId || 'demo_ucsc_csclub'),
      clubName: clubLabel || 'Campus Club',
      label: label.trim(),
      url: validUrl,
      kind,
    })

    if (created && onRefresh) {
      await onRefresh()
      if (onNotify) onNotify('Shared resource added!')
    } else {
      const newLinkItem = {
        id: `link_${Date.now()}`,
        title: clubLabel ? `${clubLabel} — ${label.trim()}` : label.trim(),
        subtitle: validUrl,
        url: validUrl,
        category: KIND_CATEGORY_MAP[kind] || 'Resources',
        color: KIND_COLOR_MAP[kind] || 'blue',
        icon: KIND_ICON_MAP[kind] || 'website',
        pinned: true,
      }
      if (onAddLocalLink) {
        onAddLocalLink(newLinkItem)
      } else {
        setInternalLocalAdded(prev => [newLinkItem, ...prev])
      }
      if (onCountChange) onCountChange(c => c + 1)
    }

    setLabel('')
    setUrl('')
    setShowAdd(false)
  }

  return (
    <Card className="p-4 sm:p-6" delay={2}>
      {/* Top Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-5 border-b border-[var(--border)]">
        <div className="flex flex-wrap items-center gap-1.5">
          {['All', 'Pinned', 'Resources', 'Documents', 'Community', 'Events'].map(tab => {
            const active = filterTab === tab
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setFilterTab(tab)}
                className={`px-3.5 min-h-[36px] rounded-xl text-xs sm:text-[13px] font-semibold cursor-pointer border transition-colors ${
                  active
                    ? 'bg-[var(--blue)] text-white border-[var(--blue)]'
                    : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
                }`}
              >
                {tab}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={() => setShowAdd(prev => !prev)}
          className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[40px] rounded-xl bg-[var(--blue)] text-white border-none text-xs sm:text-sm font-semibold cursor-pointer hover:opacity-90 transition-opacity self-start sm:self-auto"
        >
          {showAdd ? <X size={15} /> : <Plus size={15} />}
          <span>{showAdd ? 'Cancel' : 'Add Resource'}</span>
        </button>
      </div>

      {/* Add Resource Form (Spacious 44px fields, friendly Club dropdown, valid URL) */}
      {showAdd && (
        <form
          onSubmit={handleAddLink}
          className="mb-5 p-4 sm:p-5 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] space-y-4 fade-in"
        >
          <div className="text-sm font-bold text-[var(--text)]">Share Club Resource</div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Resource Title
              </label>
              <input
                type="text"
                required
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="e.g. Winter Zine Submission Form"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Link URL
              </label>
              <input
                type="text"
                required
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://docs.google.com/..."
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Club
              </label>
              <select
                value={selectedClubId}
                onChange={e => setSelectedClubId(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              >
                {clubs.map(c => (
                  <option key={c.id} value={c.id}>
                    {cleanText(c.name)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Resource Type
              </label>
              <select
                value={kind}
                onChange={e => setKind(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              >
                <option value="website">Website</option>
                <option value="document">Document / Slides</option>
                <option value="form">Sign-up Form</option>
                <option value="discord">Discord Server</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="px-4 min-h-[42px] rounded-xl bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border)] text-sm font-semibold cursor-pointer hover:text-[var(--text)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 min-h-[42px] rounded-xl bg-[var(--blue)] text-white border-none text-sm font-semibold cursor-pointer hover:opacity-90"
            >
              Save Resource
            </button>
          </div>
        </form>
      )}

      {/* Resources Grid */}
      {filteredLinks.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredLinks.map(link => {
            const c = link.color || 'blue'
            return (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3.5 p-3.5 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--blue)] hover:bg-[var(--blue-light)]/50 no-underline transition-all min-w-0"
              >
                <IconBadge color={c} size={40} radius={11}>
                  <PlatformIcon type={link.icon} size={19} />
                </IconBadge>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-semibold text-[var(--text)] truncate">
                      {cleanText(link.title)}
                    </span>
                    {link.isPinned && (
                      <BubbleTag label="Pinned" color="blue" size="sm" />
                    )}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                    {cleanText(link.subtitle)}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={e => togglePin(link.id, link.isPinned, e)}
                    title={link.isPinned ? 'Unpin resource' : 'Pin resource'}
                    className={`w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer transition-colors ${
                      link.isPinned
                        ? 'bg-[var(--blue-light)] text-[var(--blue-ink)] border-[var(--blue)]/30'
                        : 'bg-[var(--bg-card)] text-[var(--text-light)] border-[var(--border)] hover:text-[var(--text)]'
                    }`}
                  >
                    <Pin size={13} />
                  </button>
                  <ExternalLink size={15} className="text-[var(--text-light)]" />
                </div>
              </a>
            )
          })}
        </div>
      ) : (
        <div className="py-10 text-center text-sm text-[var(--text-muted)]">
          No resources match the selected filter.
        </div>
      )}
    </Card>
  )
}
