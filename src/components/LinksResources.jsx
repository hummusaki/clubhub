import Select, { MenuSelect } from './Select'
import SearchDestination from './SearchDestination'
import { useState, useMemo, useEffect } from 'react'
import {
  ExternalLink,
  Plus,
  Pin,
  X,
  Copy,
  Check,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  FileText,
  ClipboardList,
  Calendar,
  Globe,
  Mail,
} from 'lucide-react'
import { links as defaultLinks } from '../data/sampleData'
import { Card, IconBadge, BubbleTag, ClubAvatar, cleanText, Button, IconButton, PageToolbar, ActionDisclosure, SearchBox } from './ui'
import { PlatformIcon } from './icons'
import { createLink } from '../api/client'
import { filterAndRankBySearch } from '../utils/search'

const RESOURCE_SECTIONS = [
  {
    id: 'forms',
    label: 'Forms & Sign-Ups',
    shortLabel: 'Forms',
    desc: 'Interest forms, officer applications, and event RSVPs',
    color: 'red',
  },
  {
    id: 'docs',
    label: 'Docs, Slides & Guides',
    shortLabel: 'Docs & Guides',
    desc: 'Shared Google Docs, spreadsheets, slides, Notion pages, and recordings',
    color: 'blue',
  },
  {
    id: 'chat',
    label: 'Discord & Group Chats',
    shortLabel: 'Discord & Chat',
    desc: 'Official club Discord servers and community group chats',
    color: 'purple',
  },
  {
    id: 'events',
    label: 'Calendars & Event Pages',
    shortLabel: 'Calendars',
    desc: 'Public Google Calendars, Luma pages, and ticket links',
    color: 'yellow',
  },
  {
    id: 'websites',
    label: 'Websites & Link Hubs',
    shortLabel: 'Websites',
    desc: 'Club websites, Linktrees, and project portals',
    color: 'green',
  },
  {
    id: 'socials',
    label: 'Socials & Direct Contact',
    shortLabel: 'Socials & Email',
    desc: 'Club Instagram profiles and official campus email addresses',
    color: 'teal',
  },
]

const SECTION_MAP = Object.fromEntries(RESOURCE_SECTIONS.map(s => [s.id, s]))

function normalizeUrl(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed || trimmed === '#') return 'https://ucsc.edu'
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function extractFriendlyDomain(urlStr) {
  if (!urlStr) return 'Link'
  if (/^mailto:/i.test(urlStr)) {
    return urlStr.replace(/^mailto:/i, '').split('?')[0]
  }
  try {
    const u = new URL(urlStr)
    const host = u.hostname.replace(/^www\./i, '').toLowerCase()
    const path = u.pathname.toLowerCase()

    if (host === 'forms.gle' || (host.includes('docs.google.com') && path.includes('/forms'))) {
      return 'Google Forms'
    }
    if (host.includes('docs.google.com') && path.includes('/spreadsheets')) {
      return 'Google Sheets'
    }
    if (host.includes('docs.google.com') && path.includes('/presentation')) {
      return 'Google Slides'
    }
    if (host.includes('docs.google.com')) return 'Google Docs'
    if (host.includes('drive.google.com')) return 'Google Drive'
    if (host.includes('calendar.google.com')) return 'Google Calendar'
    if (host.includes('discord.gg') || host.includes('discord.com')) return 'Discord Invite'
    if (host.includes('linktr.ee')) return 'Linktree'
    if (host.includes('beacons.ai')) return 'Beacons Hub'
    if (host.includes('carrd.co')) return 'Carrd Site'
    if (host.includes('notion.so') || host.includes('notion.site')) return 'Notion Workspace'
    if (host.includes('lu.ma') || host === 'luma.com') return 'Luma Event'
    if (host.includes('eventbrite.com')) return 'Eventbrite'
    if (host.includes('partiful.com')) return 'Partiful'
    if (host.includes('instagram.com')) {
      const seg = u.pathname.split('/').filter(Boolean)[0]
      return seg && !['p', 'reel', 'stories'].includes(seg.toLowerCase())
        ? `Instagram · @${seg}`
        : 'Instagram'
    }
    if (host.includes('youtube.com') || host === 'youtu.be') return 'YouTube'
    if (host.includes('github.com')) return 'GitHub'
    if (host.includes('slack.com')) return 'Slack'
    return host
  } catch {
    return cleanText(urlStr).slice(0, 42)
  }
}

function classifyResource(raw, clubById) {
  const url = normalizeUrl(raw.url || raw.subtitle)
  const urlLower = url.toLowerCase()
  const kindLower = String(raw.kind || raw.icon || '').toLowerCase()
  const rawTitle = cleanText(raw.title || '')
  const rawLabel = cleanText(raw.rawLabel || '')

  // Separate club name from resource label if combined as "Club Name — Label"
  let clubName = cleanText(raw.clubName || '')
  let displayLabel = rawLabel || rawTitle

  if (!clubName && raw.clubId && clubById.has(String(raw.clubId))) {
    clubName = cleanText(clubById.get(String(raw.clubId)).name)
  }

  if (rawTitle.includes(' — ')) {
    const [left, ...rest] = rawTitle.split(' — ')
    if (!clubName) clubName = left.trim()
    if (!rawLabel) displayLabel = rest.join(' — ').trim()
  }

  const combinedText = `${displayLabel} ${kindLower} ${raw.category || ''}`.toLowerCase()

  let sectionId = 'websites'
  let iconKey = 'website'

  if (/^mailto:/i.test(urlLower) || kindLower === 'email') {
    sectionId = 'socials'
    iconKey = 'mail'
  } else if (
    kindLower === 'instagram' ||
    (/instagram\.com\/[^/]+\/?$/i.test(urlLower) &&
      !/instagram\.com\/(p|reel|tv)\//i.test(urlLower))
  ) {
    sectionId = 'socials'
    iconKey = 'instagram'
  } else if (
    kindLower === 'discord' ||
    /discord\.(gg|com\/invite)|slack\.com|groupme\.com|chat\.whatsapp\.com/i.test(urlLower) ||
    /\bdiscord\b|\bgroup chat\b/.test(combinedText)
  ) {
    sectionId = 'chat'
    iconKey = 'discord'
  } else if (
    kindLower === 'form' ||
    /forms\.gle|docs\.google\.com\/forms|typeform\.com|jotform\.com|qualtrics\.com|airtable\.com\/shr/i.test(
      urlLower
    ) ||
    /\b(form|application|apply|sign[- ]?up|rsvp|survey|interest|waiver)\b/.test(combinedText)
  ) {
    sectionId = 'forms'
    iconKey = 'form'
  } else if (
    kindLower === 'document' ||
    /docs\.google\.com\/(document|spreadsheets|presentation)|drive\.google\.com|notion\.(so|site)|\.pdf($|\?)|youtube\.com|youtu\.be|github\.com/i.test(
      urlLower
    ) ||
    /\b(doc|constitution|bylaws|slides|deck|sheet|budget|guide|syllabus|recording|zine|minutes)\b/.test(
      combinedText
    )
  ) {
    sectionId = 'docs'
    if (/spreadsheets|sheet|budget|finance/i.test(`${urlLower} ${combinedText}`)) {
      iconKey = 'sheet'
    } else if (/youtube|youtu\.be|recording|video/i.test(`${urlLower} ${combinedText}`)) {
      iconKey = 'video'
    } else {
      iconKey = 'document'
    }
  } else if (
    kindLower === 'event' ||
    /calendar\.google\.com|lu\.ma|eventbrite\.com|partiful\.com/i.test(urlLower) ||
    /\b(calendar|schedule|eventbrite|luma)\b/.test(combinedText)
  ) {
    sectionId = 'events'
    iconKey = 'calendar'
  } else {
    sectionId = 'websites'
    iconKey = 'website'
  }

  const sectionMeta = SECTION_MAP[sectionId] || SECTION_MAP.websites
  const sourceDomain = extractFriendlyDomain(url)

  // Polish generic labels like "Link in bio" or "Website"
  if (!displayLabel || /^link$/i.test(displayLabel)) {
    displayLabel = sourceDomain
  } else if (/^link in bio$/i.test(displayLabel) && sourceDomain === 'Linktree') {
    displayLabel = 'Official Linktree'
  }

  return {
    ...raw,
    url,
    clubName,
    displayLabel,
    sourceDomain,
    sectionId,
    sectionLabel: sectionMeta.shortLabel,
    color: sectionMeta.color,
    iconKey,
  }
}

function ResourceGlyph({ iconKey, size = 18 }) {
  if (iconKey === 'discord' || iconKey === 'instagram' || iconKey === 'sheet' || iconKey === 'video') {
    return <PlatformIcon type={iconKey} size={size} />
  }
  if (iconKey === 'form') return <ClipboardList size={size} />
  if (iconKey === 'document') return <FileText size={size} />
  if (iconKey === 'calendar') return <Calendar size={size} />
  if (iconKey === 'mail') return <Mail size={size} />
  return <Globe size={size} />
}

export default function LinksResources({
  items,
  compact = false,
  onOpenResources,
  clubs = [],
  isDemo = false,
  userSettings = {},
  searchQuery = '',
  onSearchChange,
  searchTarget,
  onDismissSearchTarget,
  onRefresh,
  onCountChange,
  localAdded: externalLocalAdded,
  onAddLocalLink,
  pinnedOverrides: externalPinnedOverrides,
  onTogglePinOverride,
  onPageContextChange,
  onNotify,
}) {
  const isCompact = Boolean(userSettings?.compactCards)

  const [internalLocalAdded, setInternalLocalAdded] = useState([])
  const [internalPinnedOverrides, setInternalPinnedOverrides] = useState({})
  const [filterTab, setFilterTab] = useState('All')
  const [groupMode, setGroupMode] = useState('category') // 'category' | 'club'
  const [expandedGroups, setExpandedGroups] = useState({})
  const [copiedId, setCopiedId] = useState(null)

  const joinedClubIdSet = useMemo(
    () => new Set(clubs.filter(c => Boolean(c.joined)).map(c => String(c.id))),
    [clubs]
  )

  const [clubFilter, setClubFilter] = useState(() =>
    joinedClubIdSet.size > 0 ? 'myclubs' : 'all'
  )

  const clubById = useMemo(
    () => new Map(clubs.map(c => [String(c.id), c])),
    [clubs]
  )

  const localAdded = externalLocalAdded ?? internalLocalAdded
  const pinnedOverrides = externalPinnedOverrides ?? internalPinnedOverrides

  // Add Resource form state
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedClubId, setSelectedClubId] = useState(
    () => clubs.find(c => c.joined)?.id || clubs[0]?.id || 'demo_ucsc_csclub'
  )
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState('form')

  useEffect(() => {
    const fallbackId = clubs.find(c => c.joined)?.id || clubs[0]?.id
    if (fallbackId && !clubs.some(c => String(c.id) === String(selectedClubId))) {
      setSelectedClubId(String(fallbackId))
    }
  }, [clubs, selectedClubId])

  const baseLinks = items && items.length > 0 ? items : defaultLinks

  // Deduplicate & enrich all links
  const allLinks = useMemo(() => {
    const seen = new Set()
    const enriched = []

    for (const raw of [...localAdded, ...baseLinks]) {
      const item = classifyResource(raw, clubById)
      const dedupeKey = `${item.clubId || item.clubName}::${item.url.toLowerCase()}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      const isPinned =
        pinnedOverrides[item.id] !== undefined
          ? pinnedOverrides[item.id]
          : Boolean(item.pinned)

      enriched.push({
        ...item,
        isPinned,
      })
    }

    return enriched.sort((a, b) => Number(b.isPinned) - Number(a.isPinned))
  }, [localAdded, baseLinks, clubById, pinnedOverrides])

  // Apply Club scope + Search query first so category tab badges show accurate counts!
  const scopedLinks = useMemo(() => {
    const clubFiltered = allLinks.filter(link => {
      const isUserAdded = String(link.id || '').startsWith('link_')
      if (clubFilter === 'myclubs' && joinedClubIdSet.size > 0) {
        if (!isUserAdded && (!link.clubId || !joinedClubIdSet.has(String(link.clubId)))) {
          return false
        }
      } else if (clubFilter !== 'all' && clubFilter !== 'myclubs') {
        if (String(link.clubId || '') !== String(clubFilter)) {
          return false
        }
      }
      return true
    })

    return filterAndRankBySearch(clubFiltered, searchQuery, link => ({
      primary: [link.displayLabel, link.rawLabel, link.title],
      secondary: [link.clubName, link.sourceDomain, link.sectionLabel, link.kind],
      tertiary: [link.url],
    }))
  }, [allLinks, clubFilter, joinedClubIdSet, searchQuery])

  const sectionCounts = useMemo(() => {
    const counts = { All: scopedLinks.length, Pinned: 0 }
    for (const sec of RESOURCE_SECTIONS) counts[sec.id] = 0
    for (const l of scopedLinks) {
      if (l.isPinned) counts.Pinned += 1
      counts[l.sectionId] = (counts[l.sectionId] || 0) + 1
    }
    return counts
  }, [scopedLinks])

  const filteredLinks = useMemo(() => {
    if (filterTab === 'All') return scopedLinks
    if (filterTab === 'Pinned') return scopedLinks.filter(l => l.isPinned)
    return scopedLinks.filter(l => l.sectionId === filterTab)
  }, [scopedLinks, filterTab])

  useEffect(() => {
    if (!onPageContextChange) return
    let label = null
    if (filterTab === 'Pinned') {
      label = `Pinned (${sectionCounts.Pinned || 0})`
    } else if (filterTab !== 'All') {
      label = SECTION_MAP[filterTab]?.shortLabel || SECTION_MAP[filterTab]?.label || filterTab
    }
    onPageContextChange({
      nav: 'links',
      label,
      modal: showAdd ? 'add' : null,
    })
  }, [onPageContextChange, filterTab, sectionCounts.Pinned, showAdd])

  const pinnedShelfLinks = useMemo(
    () => (filterTab === 'All' ? filteredLinks.filter(l => l.isPinned) : []),
    [filteredLinks, filterTab]
  )

  const groupedByCategory = useMemo(() => {
    return RESOURCE_SECTIONS.map(sec => ({
      ...sec,
      items: filteredLinks.filter(
        l => l.sectionId === sec.id && !(filterTab === 'All' && l.isPinned)
      ),
    })).filter(sec => sec.items.length > 0)
  }, [filteredLinks, filterTab])

  const groupedByClub = useMemo(() => {
    const map = new Map()
    for (const l of filteredLinks) {
      if (filterTab === 'All' && l.isPinned) continue
      const key = l.clubId || l.clubName || 'campus'
      if (!map.has(key)) {
        const clubObj = (l.clubId && clubById.get(String(l.clubId))) || {
          id: key,
          name: l.clubName || 'Campus Resources',
          abbr: (l.clubName || 'CR').slice(0, 2).toUpperCase(),
        }
        map.set(key, {
          key,
          club: clubObj,
          clubName: cleanText(clubObj.name || l.clubName || 'Campus Resources'),
          items: [],
        })
      }
      map.get(key).items.push(l)
    }

    return Array.from(map.values()).sort((a, b) => {
      const aJoined = joinedClubIdSet.has(String(a.key)) ? 1 : 0
      const bJoined = joinedClubIdSet.has(String(b.key)) ? 1 : 0
      if (aJoined !== bJoined) return bJoined - aJoined
      // Prioritize clubs with actionable non-social resources
      const aActionable = a.items.filter(i => i.sectionId !== 'socials').length
      const bActionable = b.items.filter(i => i.sectionId !== 'socials').length
      if (aActionable !== bActionable) return bActionable - aActionable
      return a.clubName.localeCompare(b.clubName)
    })
  }, [filteredLinks, filterTab, clubById, joinedClubIdSet])

  const clubsWithResources = useMemo(() => {
    const counts = new Map()
    for (const l of allLinks) {
      if (l.clubId) {
        counts.set(String(l.clubId), (counts.get(String(l.clubId)) || 0) + 1)
      }
    }
    return clubs
      .filter(c => counts.has(String(c.id)))
      .sort((a, b) => cleanText(a.name).localeCompare(cleanText(b.name)))
  }, [clubs, allLinks])

  function togglePin(id, currentPinned) {
    if (onTogglePinOverride) {
      onTogglePinOverride(id, !currentPinned)
    } else {
      setInternalPinnedOverrides(prev => ({ ...prev, [id]: !currentPinned }))
    }
  }

  async function handleCopyUrl(id, targetUrl) {
    const cleanTarget = targetUrl.replace(/^mailto:/i, '')
    try {
      await navigator.clipboard.writeText(cleanTarget)
    } catch {
      // Ignore clipboard fallback
    }
    setCopiedId(id)
    setTimeout(() => {
      setCopiedId(prev => (prev === id ? null : prev))
    }, 1800)
    if (onNotify) {
      onNotify(`Copied ${cleanTarget.length > 42 ? 'resource link' : cleanTarget}`)
    }
  }

  async function handleAddLink(e) {
    e.preventDefault()
    if (saving || !label.trim() || !url.trim()) return
    setSaving(true)
    try {
      const selectedClub = clubs.find(c => String(c.id) === String(selectedClubId))
      const clubLabel = selectedClub ? cleanText(selectedClub.name) : ''
      const validUrl = normalizeUrl(url)

      const created = isDemo
        ? null
        : await createLink({
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
          clubId: String(selectedClubId || 'demo_ucsc_csclub'),
          clubName: clubLabel || 'Campus Club',
          rawLabel: label.trim(),
          kind,
          title: clubLabel ? `${clubLabel} — ${label.trim()}` : label.trim(),
          subtitle: validUrl,
          url: validUrl,
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
    } catch {
      onNotify?.('Could not add the resource. Please try again.', { type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const cardGridClass = 'grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2'

  function renderResourceCard(link, { hideClubName = false } = {}) {
    const isCopied = copiedId === link.id
    const isEmailLink = /^mailto:/i.test(link.url)

    return (
      <article key={link.id} className="content-tile flex min-w-0 items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 sm:px-3">
        <IconBadge color={link.color || 'blue'} size={28} radius={9999}>
          <ResourceGlyph iconKey={link.iconKey} size={14} />
        </IconBadge>
        <div className="min-w-0 flex-1">
          <a href={link.url} target={isEmailLink ? undefined : '_blank'}
            rel={isEmailLink ? undefined : 'noreferrer'}
            className="block text-sm font-medium leading-snug break-words text-[var(--text)] hover:text-[var(--blue)] hover:underline">
            {link.displayLabel}
          </a>
          <div className="text-xs text-[var(--text-muted)] break-words">
            {[hideClubName ? null : link.clubName, link.sectionLabel, link.sourceDomain].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="flex items-center shrink-0">
          {!compact && (
            <IconButton size="sm" title={isCopied ? 'Link copied' : 'Copy resource link'}
              onClick={() => handleCopyUrl(link.id, link.url)}>
              {isCopied ? <Check size={14} /> : <Copy size={14} />}
            </IconButton>
          )}
          <IconButton size="sm" selected={link.isPinned} title={link.isPinned ? 'Unpin resource' : 'Pin resource'}
            aria-pressed={link.isPinned} onClick={() => togglePin(link.id, link.isPinned)}>
            <Pin size={14} />
          </IconButton>
        </div>
      </article>
    )
  }

  if (compact) {
    const preview = [...scopedLinks].sort((a, b) => Number(b.isPinned) - Number(a.isPinned)).slice(0, 4)
    return (
      <Card className="section-pad space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <h2 className="font-display text-base font-medium">Resources</h2>
          <Button variant="text" size="sm" onClick={onOpenResources}>View resources</Button>
        </div>
        {preview.length > 0 ? <div className={cardGridClass}>{preview.map(link => renderResourceCard(link))}</div>
          : <p className="text-sm text-[var(--text-muted)]">No matching resources.</p>}
      </Card>
    )
  }

  const selectedSearchLink = searchTarget?.type === 'resource'
    ? allLinks.find(link => String(link.id) === searchTarget.id) : null
  const filterCount = Number(filterTab !== 'All') + Number(clubFilter !== 'all') + Number(groupMode !== 'category')

  return (
    <div className="page-stack">
      <PageToolbar title="Shared resources" actions={
        <>
          {onSearchChange && <div className="w-full sm:w-48 min-w-0">
            <SearchBox placeholder="Filter resources" value={searchQuery} onChange={onSearchChange} />
          </div>}
          <ActionDisclosure label="Filters" count={filterCount} icon={<SlidersHorizontal size={14} />}
            panelClassName="left-0 right-auto filter-popover">
            {() => (
              <div className="grid gap-3">
                <MenuSelect
                  label="Group by"
                  value={groupMode}
                  onValueChange={setGroupMode}
                  options={[
                    { value: "category", label: "Category" },
                    { value: "club", label: "Club" },
                  ]}
                />
                <MenuSelect
                  label="Club"
                  value={clubFilter}
                  onValueChange={setClubFilter}
                  search
                  options={[
                    { value: "all", label: "All campus clubs" },
                    ...(joinedClubIdSet.size > 0 ? [{ value: "myclubs", label: "My joined clubs" }] : []),
                    ...clubsWithResources.map(c => ({ value: c.id, label: cleanText(c.name) })),
                  ]}
                />
                <MenuSelect
                  label="Resource type"
                  value={filterTab}
                  onValueChange={setFilterTab}
                  search="auto"
                  options={[
                    { value: "All", label: `All resources (${sectionCounts.All})` },
                    ...(sectionCounts.Pinned > 0 || filterTab === 'Pinned' ? [{ value: "Pinned", label: `Pinned (${sectionCounts.Pinned})` }] : []),
                    ...RESOURCE_SECTIONS.filter(section => sectionCounts[section.id] > 0 || filterTab === section.id).map(section => ({ value: section.id, label: `${section.shortLabel} (${sectionCounts[section.id]})` })),
                  ]}
                />
              </div>
            )}
          </ActionDisclosure>
          <Button size="sm" variant={showAdd ? 'outlined-neutral' : 'filled'}
            icon={showAdd ? <X size={14} /> : <Plus size={14} />}
            reserveLabels={['Add resource', 'Close resource form']}
            aria-expanded={showAdd} aria-controls="add-resource-form"
            onClick={() => setShowAdd(prev => !prev)}>
            {showAdd ? 'Close resource form' : 'Add resource'}
          </Button>
        </>
      } />
      {selectedSearchLink && (
        <SearchDestination key={searchTarget.revision} heading={cleanText(selectedSearchLink.displayLabel)} onDismiss={onDismissSearchTarget}>
          {renderResourceCard(selectedSearchLink)}
        </SearchDestination>
      )}


      {/* ── Add Resource Form ── */}
      {showAdd && (
        <form
          id="add-resource-form"
          onSubmit={handleAddLink}
          className="mb-5 p-4 sm:p-5 rounded-2xl content-tile space-y-4 fade-in"
        >
          <div className="text-sm font-medium font-display text-[var(--text)]">Share Club Resource</div>

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
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
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
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Club
              </label>
              <Select
                aria-label="Resource club"
                value={selectedClubId}
                onValueChange={setSelectedClubId}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                search
                options={clubs.map(c => ({ value: c.id, label: cleanText(c.name) }))}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                Category
              </label>
              <Select
                aria-label="Resource category"
                value={kind}
                onValueChange={setKind}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                options={[
                  { value: "form", label: "Form / Sign-Up" },
                  { value: "document", label: "Document / Slides / Sheet" },
                  { value: "discord", label: "Discord / Group Chat" },
                  { value: "event", label: "Calendar / Event Page" },
                  { value: "website", label: "Website / Link Hub" },
                ]}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="text"
              onClick={() => setShowAdd(false)}
            >
              Cancel
            </Button>
            <Button
              variant="filled"
              type="submit"
              pending={saving} pendingLabel="Saving…"
            >
              Save resource
            </Button>
          </div>
        </form>
      )}

      {pinnedShelfLinks.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-subtle)]">
            <IconBadge color="blue" size={26} radius={9999}>
              <Pin size={13} />
            </IconBadge>
            <h3 className="text-sm font-medium font-display text-[var(--text)]">Pinned Quick Access</h3>
            <BubbleTag label={`${pinnedShelfLinks.length}`} color="blue" size="sm" />
          </div>
          <div className={cardGridClass}>
            {pinnedShelfLinks.map(link => renderResourceCard(link))}
          </div>
        </section>
      )}

      {/* ── Organized Resources Display ── */}
      {filteredLinks.length > 0 ? (
        groupMode === 'category' ? (
          <div className={isCompact ? 'space-y-5' : 'space-y-6'}>
            {/* 2. Structured Category Sections */}
            {groupedByCategory.map(sec => {
              const isSocialsInOverview = filterTab === 'All' && sec.id === 'socials'
              const defaultCap =
                filterTab !== 'All'
                  ? isCompact
                    ? 24
                    : 18
                  : isSocialsInOverview
                    ? isCompact
                      ? 6
                      : 6
                    : isCompact
                      ? 9
                      : 6

              const isExpanded =
                Boolean(expandedGroups[sec.id]) || Boolean(searchQuery.trim())
              const visibleItems = isExpanded ? sec.items : sec.items.slice(0, defaultCap)

              return (
                <section key={sec.id} className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <IconBadge color={sec.color} size={28} radius={9999}>
                        <ResourceGlyph
                          iconKey={
                            sec.id === 'forms'
                              ? 'form'
                              : sec.id === 'docs'
                                ? 'document'
                                : sec.id === 'chat'
                                  ? 'discord'
                                  : sec.id === 'events'
                                    ? 'calendar'
                                    : sec.id === 'socials'
                                      ? 'instagram'
                                      : 'website'
                          }
                          size={14}
                        />
                      </IconBadge>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm sm:text-[15px] font-medium font-display text-[var(--text)]">
                            {sec.label}
                          </h3>
                          <BubbleTag label={`${sec.items.length}`} color={sec.color} size="sm" />
                        </div>
                        {!isCompact && (
                          <p className="text-[11.5px] text-[var(--text-muted)] hidden sm:block">
                            {sec.desc}
                          </p>
                        )}
                      </div>
                    </div>

                    {sec.items.length > defaultCap && !searchQuery.trim() && (
                      <Button
                        variant="text"
                        size="sm"
                        trailingIcon={isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        onClick={() =>
                          setExpandedGroups(prev => ({
                            ...prev,
                            [sec.id]: !prev[sec.id],
                          }))
                        }
                      >
                        {isExpanded ? 'Show fewer' : `Show all ${sec.items.length}`}
                      </Button>
                    )}
                  </div>

                  <div className={cardGridClass}>
                    {visibleItems.map(link => renderResourceCard(link))}
                  </div>

                </section>
              )
            })}
          </div>
        ) : (
          /* ── Group By Club Mode ── */
          <div className={isCompact ? 'space-y-4' : 'space-y-5'}>
            {(() => {
              const clubCap = Boolean(searchQuery.trim()) || clubFilter !== 'all' ? 200 : 12
              const showAllClubs = Boolean(expandedGroups.__all_clubs__)
              const visibleClubGroups = showAllClubs
                ? groupedByClub
                : groupedByClub.slice(0, clubCap)
              const remainingClubs = groupedByClub.length - visibleClubGroups.length

              return (
                <>
                  {visibleClubGroups.map(group => {
                    const itemCap = isCompact ? 9 : 6
                    const clubExpanded =
                      Boolean(expandedGroups[`club_${group.key}`]) ||
                      Boolean(searchQuery.trim()) ||
                      clubFilter !== 'all'
                    const shownItems = clubExpanded
                      ? group.items
                      : group.items.slice(0, itemCap)

                    return (
                      <section key={group.key} className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <ClubAvatar club={group.club} size={28} />
                            <h3 className="text-sm font-medium font-display text-[var(--text)] truncate">
                              {group.clubName}
                            </h3>
                            <BubbleTag
                              label={`${group.items.length}`}
                              color="blue"
                              size="sm"
                            />
                          </div>

                          {group.items.length > itemCap &&
                            !searchQuery.trim() &&
                            clubFilter === 'all' && (
                              <Button
                                variant="text"
                                size="sm"
                                trailingIcon={clubExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                onClick={() =>
                                  setExpandedGroups(prev => ({
                                    ...prev,
                                    [`club_${group.key}`]: !prev[`club_${group.key}`],
                                  }))
                                }
                              >
                                {clubExpanded
                                  ? 'Show fewer'
                                  : `All ${group.items.length} links`}
                              </Button>
                            )}
                        </div>

                        <div className={cardGridClass}>
                          {shownItems.map(link =>
                            renderResourceCard(link, { hideClubName: true })
                          )}
                        </div>
                      </section>
                    )
                  })}

                  {remainingClubs > 0 && (
                    <div className="pt-1">
                      <Button
                        variant="tonal"
                        size="sm"
                        trailingIcon={<ChevronDown size={14} />}
                        onClick={() =>
                          setExpandedGroups(prev => ({
                            ...prev,
                            __all_clubs__: !prev.__all_clubs__,
                          }))
                        }
                      >
                        Show {remainingClubs} more clubs with resources
                      </Button>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )
      ) : (
        <div className="py-10 text-center space-y-2">
          <div className="text-sm font-semibold text-[var(--text)]">
            No resources match the selected filter
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Try switching to All Resources or selecting All Campus Clubs.
          </p>
          {(filterTab !== 'All' || clubFilter !== 'all') && (
            <Button
              variant="filled"
              size="sm"
              onClick={() => {
                setFilterTab('All')
                setClubFilter('all')
              }}
              className="mt-1"
            >
              Reset Resource Filters
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
