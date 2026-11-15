import { useState, useMemo } from 'react'
import {
  ExternalLink,
  Plus,
  Pin,
  X,
  Copy,
  Check,
  Layers,
  Building2,
  ChevronDown,
  ChevronUp,
  FileText,
  ClipboardList,
  Calendar,
  Globe,
  Mail,
} from 'lucide-react'
import { links as defaultLinks } from '../data/sampleData'
import { Card, IconBadge, BubbleTag, ClubAvatar, cleanText } from './ui'
import { PlatformIcon } from './icons'
import { createLink } from '../api/client'

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
  clubs = [],
  userSettings = {},
  searchQuery = '',
  onRefresh,
  onCountChange,
  localAdded: externalLocalAdded,
  onAddLocalLink,
  pinnedOverrides: externalPinnedOverrides,
  onTogglePinOverride,
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
  const [selectedClubId, setSelectedClubId] = useState(clubs[0]?.id || 'demo_ucsc_csclub')
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState('form')

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
    return allLinks.filter(link => {
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

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          (link.displayLabel || '').toLowerCase().includes(q) ||
          (link.clubName || '').toLowerCase().includes(q) ||
          (link.sourceDomain || '').toLowerCase().includes(q) ||
          (link.sectionLabel || '').toLowerCase().includes(q) ||
          (link.url || '').toLowerCase().includes(q)
        )
      }
      return true
    })
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
  }, [filteredLinks, clubById, joinedClubIdSet])

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

  function togglePin(id, currentPinned, e) {
    e.preventDefault()
    e.stopPropagation()
    if (onTogglePinOverride) {
      onTogglePinOverride(id, !currentPinned)
    } else {
      setInternalPinnedOverrides(prev => ({ ...prev, [id]: !currentPinned }))
    }
  }

  async function handleCopyUrl(id, targetUrl, e) {
    e.preventDefault()
    e.stopPropagation()
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
    setShowAdd(false)
  }

  const cardGridClass = isCompact
    ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2'
    : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3'

  function renderResourceCard(link, { hideClubName = false } = {}) {
    const isCopied = copiedId === link.id
    return (
      <a
        key={link.id}
        href={link.url}
        target={/^mailto:/i.test(link.url) ? undefined : '_blank'}
        rel={/^mailto:/i.test(link.url) ? undefined : 'noreferrer'}
        className={`group flex items-center justify-between ${
          isCompact ? 'gap-2.5 p-2.5' : 'gap-3 p-3.5'
        } rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--blue)] hover:bg-[var(--blue-light)]/40 no-underline transition-all min-w-0`}
      >
        <div className={`flex items-center ${isCompact ? 'gap-2.5' : 'gap-3'} min-w-0 flex-1`}>
          <IconBadge
            color={link.color || 'blue'}
            size={isCompact ? 32 : 38}
            radius={isCompact ? 9 : 11}
          >
            <ResourceGlyph iconKey={link.iconKey} size={isCompact ? 15 : 18} />
          </IconBadge>

          <div className="min-w-0 flex-1">
            {!hideClubName && link.clubName && (
              <div className="flex items-center gap-1.5 min-w-0 mb-0.5">
                <span className="text-[11px] font-semibold text-[var(--blue-ink)] truncate">
                  {link.clubName}
                </span>
                {link.isPinned && (
                  <span className="inline-flex items-center px-1.5 py-0 rounded-full bg-[var(--blue-light)] text-[var(--blue-ink)] text-[9.5px] font-bold shrink-0">
                    Pinned
                  </span>
                )}
              </div>
            )}

            <div
              className={`${
                isCompact ? 'text-[13px]' : 'text-sm'
              } font-semibold text-[var(--text)] truncate`}
            >
              {link.displayLabel}
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] truncate mt-0.5">
              <span className="truncate">{link.sourceDomain}</span>
              {hideClubName && (
                <>
                  <span className="text-[var(--text-light)]">·</span>
                  <span className="text-[var(--text-light)] shrink-0">{link.sectionLabel}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={e => handleCopyUrl(link.id, link.url, e)}
            title="Copy link"
            aria-label="Copy link"
            className={`${
              isCompact ? 'w-7 h-7' : 'w-8 h-8'
            } rounded-lg border flex items-center justify-center cursor-pointer transition-colors ${
              isCopied
                ? 'bg-[var(--green-light)] text-[var(--green-ink)] border-[var(--green)]/30'
                : 'bg-[var(--bg-card)] text-[var(--text-light)] border-[var(--border)] hover:text-[var(--text)] hover:border-[var(--border-strong)]'
            }`}
          >
            {isCopied ? <Check size={12} /> : <Copy size={12} />}
          </button>

          <button
            type="button"
            onClick={e => togglePin(link.id, link.isPinned, e)}
            title={link.isPinned ? 'Unpin resource' : 'Pin resource to top'}
            aria-label={link.isPinned ? 'Unpin resource' : 'Pin resource'}
            className={`${
              isCompact ? 'w-7 h-7' : 'w-8 h-8'
            } rounded-lg border flex items-center justify-center cursor-pointer transition-colors ${
              link.isPinned
                ? 'bg-[var(--blue-light)] text-[var(--blue-ink)] border-[var(--blue)]/35'
                : 'bg-[var(--bg-card)] text-[var(--text-light)] border-[var(--border)] hover:text-[var(--text)] hover:border-[var(--border-strong)]'
            }`}
          >
            <Pin size={12} />
          </button>

          <ExternalLink
            size={14}
            className="text-[var(--text-light)] group-hover:text-[var(--blue-ink)] ml-0.5 transition-colors"
          />
        </div>
      </a>
    )
  }

  return (
    <Card className={isCompact ? 'p-3.5 sm:p-4.5' : 'p-4 sm:p-6'} delay={2}>
      {/* ── Top Organization & Filter Header ── */}
      <div
        className={`flex flex-col gap-3 ${
          isCompact ? 'pb-3 mb-4' : 'pb-4 mb-5'
        } border-b border-[var(--border)]`}
      >
        {/* Row 1: Grouping Mode + Club Filter + Add Resource */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {/* Group By Switcher */}
            <div className="inline-flex items-center bg-[var(--bg-surface)] p-1 rounded-xl border border-[var(--border)]">
              <button
                type="button"
                onClick={() => setGroupMode('category')}
                className={`inline-flex items-center gap-1.5 px-3 min-h-[32px] rounded-lg text-xs font-semibold border-none cursor-pointer transition-all ${
                  groupMode === 'category'
                    ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
                    : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                <Layers size={13} />
                <span>By Category</span>
              </button>
              <button
                type="button"
                onClick={() => setGroupMode('club')}
                className={`inline-flex items-center gap-1.5 px-3 min-h-[32px] rounded-lg text-xs font-semibold border-none cursor-pointer transition-all ${
                  groupMode === 'club'
                    ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
                    : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                <Building2 size={13} />
                <span>By Club</span>
              </button>
            </div>

            {/* Club Scope Selector */}
            <select
              value={clubFilter}
              onChange={e => setClubFilter(e.target.value)}
              aria-label="Filter resources by club"
              className="min-h-[38px] max-w-[230px] px-3 py-1.5 rounded-xl bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)] cursor-pointer"
            >
              <option value="all">All Campus Clubs ({allLinks.length})</option>
              {joinedClubIdSet.size > 0 && (
                <option value="myclubs">My Joined Clubs ({joinedClubIdSet.size})</option>
              )}
              {clubsWithResources.map(c => (
                <option key={c.id} value={c.id}>
                  {cleanText(c.name)}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setShowAdd(prev => !prev)}
            className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[38px] rounded-xl bg-[var(--blue)] text-white border-none text-xs sm:text-sm font-semibold cursor-pointer hover:opacity-90 transition-opacity self-start sm:self-auto"
          >
            {showAdd ? <X size={15} /> : <Plus size={15} />}
            <span>{showAdd ? 'Cancel' : 'Add Resource'}</span>
          </button>
        </div>

        {/* Row 2: Resource Category Filter Pills With Live Counts */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'All', label: 'All Resources', count: sectionCounts.All },
            ...(sectionCounts.Pinned > 0
              ? [{ id: 'Pinned', label: 'Pinned', count: sectionCounts.Pinned }]
              : []),
            ...RESOURCE_SECTIONS.filter(s => (sectionCounts[s.id] || 0) > 0).map(s => ({
              id: s.id,
              label: s.shortLabel,
              count: sectionCounts[s.id] || 0,
            })),
          ].map(tab => {
            const active = filterTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 min-h-[31px] rounded-full text-xs cursor-pointer border transition-colors ${
                  active
                    ? 'bg-[var(--blue-light)] text-[var(--blue-ink)] border-[var(--blue)]/35 font-semibold'
                    : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)] font-medium'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10.5px] font-mono-num ${
                    active ? 'text-[var(--blue-ink)]' : 'text-[var(--text-light)]'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Add Resource Form ── */}
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
                Category
              </label>
              <select
                value={kind}
                onChange={e => setKind(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              >
                <option value="form">Form / Sign-Up</option>
                <option value="document">Document / Slides / Sheet</option>
                <option value="discord">Discord / Group Chat</option>
                <option value="event">Calendar / Event Page</option>
                <option value="website">Website / Link Hub</option>
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

      {/* ── Organized Resources Display ── */}
      {filteredLinks.length > 0 ? (
        groupMode === 'category' ? (
          <div className={isCompact ? 'space-y-5' : 'space-y-6'}>
            {/* 1. Pinned Quick-Access Shelf */}
            {pinnedShelfLinks.length > 0 && (
              <section className="space-y-2.5">
                <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-subtle)]">
                  <IconBadge color="blue" size={26} radius={8}>
                    <Pin size={13} />
                  </IconBadge>
                  <h3 className="text-sm font-bold text-[var(--text)]">Pinned Quick Access</h3>
                  <BubbleTag label={`${pinnedShelfLinks.length}`} color="blue" size="sm" />
                </div>
                <div className={cardGridClass}>
                  {pinnedShelfLinks.map(link => renderResourceCard(link))}
                </div>
              </section>
            )}

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
              const remaining = sec.items.length - visibleItems.length

              return (
                <section key={sec.id} className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <IconBadge color={sec.color} size={28} radius={8}>
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
                          <h3 className="text-sm sm:text-[15px] font-bold text-[var(--text)]">
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
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedGroups(prev => ({
                            ...prev,
                            [sec.id]: !prev[sec.id],
                          }))
                        }
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer shrink-0"
                      >
                        <span>
                          {isExpanded ? 'Show fewer' : `Show all ${sec.items.length}`}
                        </span>
                        {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                    )}
                  </div>

                  <div className={cardGridClass}>
                    {visibleItems.map(link => renderResourceCard(link))}
                  </div>

                  {remaining > 0 && !searchQuery.trim() && (
                    <div>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedGroups(prev => ({ ...prev, [sec.id]: true }))
                        }
                        className="inline-flex items-center gap-1.5 px-3.5 min-h-[32px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] border border-[var(--border)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer transition-colors"
                      >
                        <span>
                          View {remaining} more in {sec.shortLabel}
                        </span>
                        <ChevronDown size={13} />
                      </button>
                    </div>
                  )}
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
                            <h3 className="text-sm font-bold text-[var(--text)] truncate">
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
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedGroups(prev => ({
                                    ...prev,
                                    [`club_${group.key}`]: !prev[`club_${group.key}`],
                                  }))
                                }
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer shrink-0"
                              >
                                <span>
                                  {clubExpanded
                                    ? 'Show fewer'
                                    : `All ${group.items.length} links`}
                                </span>
                                {clubExpanded ? (
                                  <ChevronUp size={13} />
                                ) : (
                                  <ChevronDown size={13} />
                                )}
                              </button>
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
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedGroups(prev => ({
                            ...prev,
                            __all_clubs__: !prev.__all_clubs__,
                          }))
                        }
                        className="inline-flex items-center gap-1.5 px-4 min-h-[36px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] border border-[var(--border)] text-xs font-semibold text-[var(--text)] cursor-pointer transition-colors"
                      >
                        <span>Show {remainingClubs} more clubs with resources</span>
                        <ChevronDown size={14} />
                      </button>
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
            <button
              type="button"
              onClick={() => {
                setFilterTab('All')
                setClubFilter('all')
              }}
              className="mt-1 px-4 min-h-[36px] rounded-xl bg-[var(--blue)] text-white text-xs font-semibold border-none cursor-pointer"
            >
              Reset Resource Filters
            </button>
          )}
        </div>
      )}
    </Card>
  )
}
