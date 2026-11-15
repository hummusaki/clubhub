import { useState, useMemo, useEffect } from 'react'
import {
  Calendar,
  Check,
  Plus,
  Mail,
  Copy,
  Clock,
  Users,
  Shield,
  ArrowRight,
  UserPlus,
  X,
  Layers,
  LayoutGrid,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import {
  clubs as defaultClubs,
  boardMembers as initialOfficers,
  memberActivity as initialMembers,
} from '../data/sampleData'
import { Card, ClubAvatar, Avatar, BubbleTag, IconBadge, cleanText } from './ui'
import { PlatformIcon, ClubEmblemSvg } from './icons'
import { ingestFromSource } from '../api/client'
import {
  CLUB_CATEGORIES,
  categorizeClub,
  getClubCategoryMeta,
} from '../utils/clubCategories'

const SOURCE_FILTERS = [
  { id: 'all',       label: 'All Channels', color: 'blue' },
  { id: 'instagram', label: 'Instagram',    color: 'purple' },
  { id: 'discord',   label: 'Discord',      color: 'blue' },
  { id: 'email',     label: 'Email',        color: 'yellow' },
]

const SOURCE_META = {
  instagram:       { label: 'Instagram', color: 'purple' },
  discord:         { label: 'Discord',   color: 'blue' },
  email:           { label: 'Email',     color: 'yellow' },
  google_calendar: { label: 'Calendar',  color: 'green' },
  website:         { label: 'Website',   color: 'teal' },
}

const CUSTOM_ROSTER_STORAGE_KEY = 'clubhub_custom_roster_v1'

function loadCustomRoster() {
  try {
    const raw = localStorage.getItem(CUSTOM_ROSTER_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (parsed && Array.isArray(parsed.officers) && Array.isArray(parsed.members)) {
      return parsed
    }
  } catch {
    // Ignore storage errors
  }
  return { officers: [], members: [] }
}

function clubMatchesFilter(personClubName, personClubId, selectedClubFilter) {
  if (!selectedClubFilter || selectedClubFilter === 'all') return true
  if (personClubId && String(personClubId) === String(selectedClubFilter)) return true
  const pLower = String(personClubName || '').toLowerCase()
  const fLower = String(selectedClubFilter).toLowerCase()
  if (pLower && fLower && (pLower.includes(fLower) || fLower.includes(pLower))) return true
  return false
}

export default function ClubsHub({
  items,
  clubsData,
  hubDict = {},
  initialSection = null,
  userSettings = {},
  onToggleJoin,
  searchQuery = '',
  compact = false,
  onOpenClubs,
  onRefresh,
  localPosts: externalLocalPosts,
  onAddLocalPost,
  onPageContextChange,
  onNotify,
}) {
  const allClubs = useMemo(() => {
    const raw =
      items && items.length > 0
        ? items
        : clubsData && clubsData.length > 0
          ? clubsData
          : defaultClubs
    return raw.map(c => {
      const catId = categorizeClub(c)
      const catMeta = getClubCategoryMeta(catId)
      return {
        ...c,
        category: catId,
        categoryLabel: c.categoryLabel || catMeta.label,
        avatarBg: c.avatarBg || catMeta.gradient,
      }
    })
  }, [items, clubsData])

  const joinedClubs = useMemo(
    () => allClubs.filter(c => Boolean(c.joined)),
    [allClubs]
  )

  const [section, setSection] = useState(
    () => initialSection || (joinedClubs.length === 0 ? 'discover' : 'myclubs')
  ) // 'myclubs' | 'discover' | 'updates' | 'directory'
  const [category, setCategory] = useState('All')
  const [clubLayout, setClubLayout] = useState('grouped') // 'grouped' | 'grid'
  const [expandedCategories, setExpandedCategories] = useState({})
  const [selectedSource, setSelectedSource] = useState('all')
  const [feedScope, setFeedScope] = useState('myclubs') // 'myclubs' | 'all'

  // Directory filters & state
  const [roleFilter, setRoleFilter] = useState('all') // 'all' | 'officers' | 'members'
  const [directoryClubFilter, setDirectoryClubFilter] = useState('all')
  const [copiedEmailId, setCopiedEmailId] = useState(null)
  const [customRoster, setCustomRoster] = useState(loadCustomRoster)

  // Add Person to Directory form
  const [showAddPersonForm, setShowAddPersonForm] = useState(false)
  const [personName, setPersonName] = useState('')
  const [personEmail, setPersonEmail] = useState('')
  const [personType, setPersonType] = useState('officer') // 'officer' | 'member'
  const [personRoleTitle, setPersonRoleTitle] = useState('')
  const [personClubId, setPersonClubId] = useState('demo_ucsc_csclub')
  const [personMajor, setPersonMajor] = useState('')
  const [personOfficeHours, setPersonOfficeHours] = useState('')

  // Post Update form state
  const [showPostForm, setShowPostForm] = useState(false)
  const [postClubId, setPostClubId] = useState('demo_ucsc_csclub')
  const [postSource, setPostSource] = useState('discord')
  const [postTitle, setPostTitle] = useState('')
  const [postSummary, setPostSummary] = useState('')
  const [internalLocalPosts, setInternalLocalPosts] = useState([])

  const localPosts = externalLocalPosts ?? internalLocalPosts
  const isCompactDensity = Boolean(userSettings?.compactCards)

  useEffect(() => {
    if (compact || !onPageContextChange) return
    let label = `My Clubs (${joinedClubs.length})`
    if (section === 'discover') {
      if (category !== 'All') {
        const catMeta = getClubCategoryMeta(category)
        label = `Discover · ${catMeta.shortLabel || catMeta.label}`
      } else {
        label = 'Discover Clubs'
      }
    } else if (section === 'updates') {
      label = 'Club Updates'
    } else if (section === 'directory') {
      label = 'Club Directory'
    }
    onPageContextChange({
      nav: 'clubs',
      label,
      modal: showPostForm ? 'post' : showAddPersonForm ? 'person' : null,
    })
  }, [
    compact,
    onPageContextChange,
    section,
    category,
    joinedClubs.length,
    showPostForm,
    showAddPersonForm,
  ])

  const categoryFilters = useMemo(() => {
    const pool = section === 'discover' ? allClubs : joinedClubs
    const counts = new Map()
    for (const c of pool) {
      const key = categorizeClub(c)
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    const ordered = CLUB_CATEGORIES.filter(cat => (counts.get(cat.id) || 0) > 0).map(cat => ({
      value: cat.id,
      label: cat.label,
      shortLabel: cat.shortLabel,
      color: cat.color,
      count: counts.get(cat.id) || 0,
    }))
    return [{ value: 'All', label: 'All Categories', shortLabel: 'All', count: pool.length }, ...ordered]
  }, [allClubs, joinedClubs, section])

  const filteredClubs = useMemo(() => {
    const pool = section === 'discover' ? allClubs : joinedClubs
    return pool.filter(c => {
      if (
        category !== 'All' &&
        categorizeClub(c) !== category.toLowerCase()
      ) {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          (c.name || '').toLowerCase().includes(q) ||
          (c.description || '').toLowerCase().includes(q) ||
          (c.categoryLabel || '').toLowerCase().includes(q) ||
          (c.tags || []).some(t => t.label.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [allClubs, joinedClubs, section, category, searchQuery])

  const groupedClubs = useMemo(() => {
    const groups = new Map()
    for (const c of filteredClubs) {
      const key = categorizeClub(c)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(c)
    }
    return CLUB_CATEGORIES.filter(cat => groups.has(cat.id)).map(cat => ({
      ...cat,
      clubs: groups.get(cat.id),
    }))
  }, [filteredClubs])

  const joinedIdSet = useMemo(
    () => new Set(joinedClubs.map(c => String(c.id))),
    [joinedClubs]
  )

  const feedPosts = useMemo(() => {
    const channels = userSettings?.channels || {}
    const combined = [...localPosts]
    for (const club of Object.values(hubDict || {})) {
      for (const post of club.posts || []) {
        combined.push({
          ...post,
          source: post.source || 'instagram',
          clubName: club.name || post.clubId,
        })
      }
    }

    return combined.filter(post => {
      if (
        joinedIdSet.size > 0 &&
        feedScope === 'myclubs' &&
        post.clubId &&
        !joinedIdSet.has(String(post.clubId))
      ) {
        return false
      }

      const src = String(post.source || '').toLowerCase()
      if (selectedSource === 'all') {
        if (src.includes('instagram') && channels.instagram === false) return false
        if (src.includes('discord') && channels.discord === false) return false
        if (src.includes('email') && channels.email === false) return false
      } else if (post.source !== selectedSource) {
        return false
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          (post.title || '').toLowerCase().includes(q) ||
          (post.summary || post.caption || '').toLowerCase().includes(q) ||
          (post.clubName || '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [hubDict, localPosts, joinedIdSet, feedScope, selectedSource, searchQuery, userSettings?.channels])

  const allOfficers = useMemo(
    () => [...customRoster.officers, ...initialOfficers],
    [customRoster.officers]
  )

  const allMembers = useMemo(
    () => [...customRoster.members, ...initialMembers],
    [customRoster.members]
  )

  const filteredOfficers = useMemo(() => {
    return allOfficers.filter(m => {
      if (directoryClubFilter !== 'all') {
        const selectedClub = allClubs.find(c => String(c.id) === String(directoryClubFilter))
        const matchById = String(m.clubId || '') === String(directoryClubFilter)
        const matchByName =
          selectedClub &&
          clubMatchesFilter(m.club, m.clubId, selectedClub.name)
        if (!matchById && !matchByName) return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          m.name.toLowerCase().includes(q) ||
          m.role.toLowerCase().includes(q) ||
          (m.club || '').toLowerCase().includes(q) ||
          (m.major || '').toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [allOfficers, directoryClubFilter, allClubs, searchQuery])

  const filteredMembers = useMemo(() => {
    return allMembers.filter(m => {
      if (directoryClubFilter !== 'all') {
        const selectedClub = allClubs.find(c => String(c.id) === String(directoryClubFilter))
        const inSelectedClub = (m.clubs || []).some(
          c =>
            String(c.clubId || '') === String(directoryClubFilter) ||
            (selectedClub &&
              clubMatchesFilter(c.label, c.clubId, selectedClub.name))
        )
        if (!inSelectedClub) return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          m.name.toLowerCase().includes(q) ||
          (m.role || '').toLowerCase().includes(q) ||
          (m.major || '').toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          (m.clubs || []).some(c => c.label.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [allMembers, directoryClubFilter, allClubs, searchQuery])

  async function handleCopyEmail(personId, emailAddr) {
    try {
      await navigator.clipboard.writeText(emailAddr)
    } catch {
      // Ignore clipboard fallback
    }
    setCopiedEmailId(personId)
    setTimeout(() => {
      setCopiedEmailId(prev => (prev === personId ? null : prev))
    }, 2000)
    if (onNotify) {
      onNotify(`Copied ${emailAddr}`)
    }
  }

  function handleOpenClubRoster(clubId) {
    setSection('directory')
    setDirectoryClubFilter(String(clubId))
    setRoleFilter('all')
  }

  function handleAddPersonSubmit(e) {
    e.preventDefault()
    const cleanName = personName.trim()
    const cleanEmail = personEmail.trim()
    if (!cleanName || !cleanEmail) return

    const clubObj = allClubs.find(c => String(c.id) === String(personClubId))
    const clubLabel = clubObj ? cleanText(clubObj.name) : 'Campus Club'
    const initials = cleanName
      .split(' ')
      .filter(Boolean)
      .map(w => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'MB'

    const nextRoster = { ...customRoster }
    if (personType === 'officer') {
      const newOfficer = {
        id: `custom_off_${Date.now()}`,
        name: cleanName,
        initials,
        role: personRoleTitle.trim() || 'Officer',
        club: clubLabel,
        clubId: String(personClubId),
        major: personMajor.trim() || 'UCSC Undergraduate',
        color: 'blue',
        email: cleanEmail,
        office: personOfficeHours.trim() || 'By appointment',
      }
      nextRoster.officers = [newOfficer, ...nextRoster.officers]
    } else {
      const newMember = {
        id: `custom_mem_${Date.now()}`,
        name: cleanName,
        initials,
        email: cleanEmail,
        role: personRoleTitle.trim() || 'Active Member',
        major: personMajor.trim() || 'UCSC Undergraduate',
        avatarBg: 'linear-gradient(135deg, var(--blue), var(--teal))',
        clubs: [{ label: clubLabel, clubId: String(personClubId), color: 'blue' }],
        joined: 'Nov 2026',
      }
      nextRoster.members = [newMember, ...nextRoster.members]
    }

    setCustomRoster(nextRoster)
    try {
      localStorage.setItem(CUSTOM_ROSTER_STORAGE_KEY, JSON.stringify(nextRoster))
    } catch {
      // Ignore storage errors
    }

    setPersonName('')
    setPersonEmail('')
    setPersonRoleTitle('')
    setPersonMajor('')
    setPersonOfficeHours('')
    setShowAddPersonForm(false)
    if (onNotify) {
      onNotify(`Added ${cleanName} to ${clubLabel} directory.`)
    }
  }

  async function handlePostUpdateSubmit(e) {
    e.preventDefault()
    if (!postTitle.trim() && !postSummary.trim()) return

    const clubObj = allClubs.find(c => String(c.id) === String(postClubId))
    const clubLabel = clubObj ? cleanText(clubObj.name) : 'Campus Club'
    const captionText = [postTitle.trim(), postSummary.trim()].filter(Boolean).join(' — ')

    const res = await ingestFromSource(postSource, {
      clubId: String(postClubId),
      caption: captionText,
    })

    if (res && res.success && onRefresh) {
      await onRefresh()
    } else {
      const createdPost = {
        id: `local_post_${Date.now()}`,
        clubId: String(postClubId),
        clubName: clubLabel,
        source: postSource,
        postedAt: new Date().toISOString(),
        title: postTitle.trim() || clubLabel,
        summary: postSummary.trim() || postTitle.trim(),
      }
      if (onAddLocalPost) {
        onAddLocalPost(createdPost)
      } else {
        setInternalLocalPosts(prev => [createdPost, ...prev])
      }
    }

    setPostTitle('')
    setPostSummary('')
    setShowPostForm(false)
    if (onNotify) {
      onNotify(`Published update to ${clubLabel} feed.`)
    }
  }

  function renderClubCard(club) {
    const isJoined = Boolean(club.joined)
    const catMeta = getClubCategoryMeta(club.category)
    const accentColor = catMeta?.color || 'blue'
    return (
      <div
        key={club.id}
        style={{
          borderTopWidth: '3px',
          borderTopColor: `var(--${accentColor})`,
        }}
        className={`content-tile content-tile-interactive ${
          isCompactDensity ? 'p-3 gap-2' : 'p-4 gap-3.5'
        } rounded-[var(--radius-sm)] flex flex-col justify-between`}
      >
        <div>
          <div className={`flex items-start justify-between gap-2.5 ${isCompactDensity ? 'mb-1.5' : 'mb-2.5'}`}>
            <div className={`flex items-center ${isCompactDensity ? 'gap-2.5' : 'gap-3'} min-w-0`}>
              <ClubAvatar club={club} size={isCompactDensity ? 34 : 42} />
              <div className="min-w-0">
                <div
                  className={`font-semibold ${
                    isCompactDensity ? 'text-[13px]' : 'text-sm'
                  } text-[var(--text)] truncate`}
                >
                  {cleanText(club.name)}
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  {club.members} {club.members === 1 ? 'member' : 'members'}
                </div>
              </div>
            </div>

            {onToggleJoin && (
              <button
                type="button"
                onClick={() => {
                  onToggleJoin(club.id)
                  if (onNotify) {
                    onNotify(
                      isJoined
                        ? `Left ${cleanText(club.name)}`
                        : `Joined ${cleanText(club.name)}!`,
                      { type: isJoined ? 'info' : 'success' }
                    )
                  }
                }}
                className={`inline-flex items-center gap-1 ${
                  isCompactDensity ? 'px-2.5 min-h-[27px] text-[11px]' : 'px-3 min-h-[32px] text-xs'
                } rounded-full font-semibold cursor-pointer border shrink-0 transition-colors ${
                  isJoined
                    ? 'bg-[var(--green-light)] text-[var(--green-ink)] border-transparent hover:opacity-85'
                    : 'bg-[var(--blue)] text-white border-[var(--blue)] hover:opacity-90'
                }`}
              >
                {isJoined ? <Check size={12} /> : <Plus size={12} />}
                <span>{isJoined ? 'Joined' : 'Join'}</span>
              </button>
            )}
          </div>

          {club.description && (
            <p
              className={`text-xs text-[var(--text-muted)] leading-relaxed ${
                isCompactDensity ? 'mb-2 line-clamp-1' : 'mb-3 line-clamp-2'
              }`}
            >
              {cleanText(club.description)}
            </p>
          )}

          <div className="flex gap-1.5 flex-wrap">
            {(club.tags || []).map(tag => (
              <BubbleTag
                key={tag.label}
                label={tag.label}
                color={tag.color || 'blue'}
                size="sm"
              />
            ))}
          </div>
        </div>

        <div
          className={`${
            isCompactDensity ? 'pt-2' : 'pt-2.5'
          } border-t border-[var(--border-subtle)] flex items-center justify-between gap-2 text-xs text-[var(--text-muted)] min-w-0`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Calendar size={12} className="text-[var(--text-light)] shrink-0" />
            <span className="truncate">{cleanText(club.schedule || 'Weekly meetings')}</span>
          </div>

          {!compact && (
            <button
              type="button"
              onClick={() => handleOpenClubRoster(club.id)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer shrink-0"
            >
              <span>Roster</span>
              <ArrowRight size={12} />
            </button>
          )}
        </div>
      </div>
    )
  }

  const clubGridClasses = isCompactDensity
    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2.5'
    : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'

  // ── 1. COMPACT OVERVIEW MODE ──────────────────────────────────────
  if (compact) {
    const previewLimit = isCompactDensity ? 4 : 3
    const previewClubs = joinedClubs.slice(0, previewLimit)
    const suggestedClubs = allClubs.slice(0, previewLimit)
    const overviewGridClasses = isCompactDensity
      ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5'
      : 'grid grid-cols-1 md:grid-cols-3 gap-3.5'

    return (
      <Card className={isCompactDensity ? 'p-3.5 sm:p-4' : 'p-4 sm:p-[22px]'} delay={4}>
        <div className={`flex items-center justify-between gap-2 ${isCompactDensity ? 'mb-3' : 'mb-4'}`}>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-[var(--text)]">My Clubs</h2>
            <BubbleTag label={`${joinedClubs.length}`} color="blue" size="sm" />
          </div>

          {onOpenClubs && (
            <button
              type="button"
              onClick={() =>
                onOpenClubs(
                  joinedClubs.length === 0 ? { section: 'discover' } : { section: 'myclubs' }
                )
              }
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer"
            >
              <span>
                {joinedClubs.length === 0
                  ? `Discover All ${allClubs.length} Clubs`
                  : 'Manage My Clubs'}
              </span>
              <ArrowRight size={13} />
            </button>
          )}
        </div>

        {previewClubs.length > 0 ? (
          <div className={overviewGridClasses}>
            {previewClubs.map(c => renderClubCard(c))}
          </div>
        ) : (
          <div className={isCompactDensity ? 'space-y-2.5' : 'space-y-3.5'}>
            <div className="px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs text-[var(--text-muted)]">
                You haven&apos;t joined any clubs yet. Join a club below or browse all campus clubs automatically organized by category.
              </span>
              {onOpenClubs && (
                <button
                  type="button"
                  onClick={() => onOpenClubs({ section: 'discover' })}
                  className="px-3 min-h-[32px] rounded-lg bg-[var(--blue)] text-white text-xs font-semibold border-none cursor-pointer shrink-0 self-start sm:self-auto hover:opacity-90"
                >
                  Browse Campus Clubs
                </button>
              )}
            </div>

            {suggestedClubs.length > 0 && (
              <div className={overviewGridClasses}>
                {suggestedClubs.map(c => renderClubCard(c))}
              </div>
            )}
          </div>
        )}
      </Card>
    )
  }

  const totalDirectoryPeople = filteredOfficers.length + filteredMembers.length
  const showGroupedSections =
    clubLayout === 'grouped' && category === 'All' && groupedClubs.length > 1

  // ── 2. FULL CLUBS & COMMUNITY PAGE ────────────────────────────────
  return (
    <Card className={isCompactDensity ? 'p-3.5 sm:p-4.5' : 'p-4 sm:p-6'} delay={2}>
      {/* Sub-navigation Tabs */}
      <div className={`flex flex-col gap-3 ${isCompactDensity ? 'pb-3 mb-4' : 'pb-4 mb-5'} border-b border-[var(--border)]`}>
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'myclubs',   label: `My Clubs (${joinedClubs.length})` },
              { id: 'discover',  label: `Discover (${allClubs.length})` },
              { id: 'updates',   label: 'Club Feed' },
              { id: 'directory', label: `Officers & Members (${allOfficers.length + allMembers.length})` },
            ].map(tab => {
              const isActive = section === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setSection(tab.id)
                    setCategory('All')
                  }}
                  className={`px-3.5 min-h-[36px] rounded-xl text-xs sm:text-[13px] font-semibold cursor-pointer border transition-colors ${
                    isActive
                      ? 'bg-[var(--blue)] text-white border-[var(--blue)]'
                      : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          {(section === 'myclubs' || section === 'discover') && filteredClubs.length > 6 && (
            <div className="inline-flex items-center bg-[var(--bg-surface)] p-1 rounded-xl border border-[var(--border)]">
              <button
                type="button"
                onClick={() => {
                  setClubLayout('grouped')
                  setCategory('All')
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 min-h-[30px] rounded-lg text-xs font-semibold border-none cursor-pointer transition-all ${
                  clubLayout === 'grouped' && category === 'All'
                    ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
                    : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                <Layers size={13} />
                <span>By Category</span>
              </button>
              <button
                type="button"
                onClick={() => setClubLayout('grid')}
                className={`inline-flex items-center gap-1.5 px-2.5 min-h-[30px] rounded-lg text-xs font-semibold border-none cursor-pointer transition-all ${
                  clubLayout === 'grid' || category !== 'All'
                    ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
                    : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                <LayoutGrid size={13} />
                <span>All Grid</span>
              </button>
            </div>
          )}

          {section === 'updates' && (
            <button
              type="button"
              onClick={() => setShowPostForm(prev => !prev)}
              className="inline-flex items-center gap-1.5 px-4 min-h-[38px] rounded-xl bg-[var(--blue)] text-white text-xs sm:text-sm font-semibold border-none cursor-pointer hover:opacity-90 self-start sm:self-auto"
            >
              {showPostForm ? <X size={14} /> : <Plus size={14} />}
              <span>{showPostForm ? 'Cancel' : 'Post Update'}</span>
            </button>
          )}

          {section === 'directory' && (
            <button
              type="button"
              onClick={() => setShowAddPersonForm(prev => !prev)}
              className="inline-flex items-center gap-1.5 px-4 min-h-[38px] rounded-xl bg-[var(--blue)] text-white text-xs sm:text-sm font-semibold border-none cursor-pointer hover:opacity-90 self-start sm:self-auto"
            >
              {showAddPersonForm ? <X size={14} /> : <UserPlus size={14} />}
              <span>{showAddPersonForm ? 'Cancel' : 'Add Member / Officer'}</span>
            </button>
          )}
        </div>

        {/* Auto-Categorized Filter Pills */}
        {(section === 'myclubs' || section === 'discover') && categoryFilters.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {categoryFilters.map(cat => {
              const active = category === cat.value
              return (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={`inline-flex items-center gap-1.5 px-3 min-h-[30px] rounded-full text-xs cursor-pointer border transition-colors ${
                    active
                      ? 'bg-[var(--blue-light)] text-[var(--blue-ink)] border-[var(--blue)]/35 font-semibold'
                      : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)] font-medium'
                  }`}
                >
                  <span>{cat.shortLabel || cat.label}</span>
                  <span
                    className={`text-[10.5px] font-mono-num ${
                      active ? 'text-[var(--blue-ink)]' : 'text-[var(--text-light)]'
                    }`}
                  >
                    {cat.count}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── SECTION 1 & 2: MY CLUBS / DISCOVER ── */}
      {(section === 'myclubs' || section === 'discover') && (
        <>
          {filteredClubs.length > 0 ? (
            showGroupedSections ? (
              <div className={isCompactDensity ? 'space-y-5' : 'space-y-7'}>
                {groupedClubs.map(group => {
                  const defaultCap = isCompactDensity ? 8 : 6
                  const isExpanded = Boolean(expandedCategories[group.id]) || Boolean(searchQuery.trim())
                  const visibleClubs = isExpanded ? group.clubs : group.clubs.slice(0, defaultCap)
                  const hiddenCount = group.clubs.length - visibleClubs.length

                  return (
                    <section key={group.id} className="space-y-3">
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-2xs"
                            style={{ background: group.gradient }}
                          >
                            <ClubEmblemSvg club={{ category: group.id }} size={15} />
                          </div>
                          <h3 className="text-sm sm:text-[15px] font-bold text-[var(--text)] truncate">
                            {group.label}
                          </h3>
                          <BubbleTag label={`${group.clubs.length}`} color={group.color} size="sm" />
                        </div>

                        {group.clubs.length > defaultCap && !searchQuery.trim() && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedCategories(prev => ({
                                ...prev,
                                [group.id]: !prev[group.id],
                              }))
                            }
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer shrink-0"
                          >
                            <span>
                              {isExpanded ? 'Show fewer' : `Show all ${group.clubs.length}`}
                            </span>
                            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                        )}
                      </div>

                      <div className={clubGridClasses}>
                        {visibleClubs.map(club => renderClubCard(club))}
                      </div>

                      {hiddenCount > 0 && !searchQuery.trim() && (
                        <div>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedCategories(prev => ({ ...prev, [group.id]: true }))
                            }
                            className="inline-flex items-center gap-1.5 px-3.5 min-h-[32px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] border border-[var(--border)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer transition-colors"
                          >
                            <span>View {hiddenCount} more in {group.shortLabel}</span>
                            <ChevronDown size={13} />
                          </button>
                        </div>
                      )}
                    </section>
                  )
                })}
              </div>
            ) : (
              <div className={clubGridClasses}>
                {filteredClubs.map(club => renderClubCard(club))}
              </div>
            )
          ) : (
            <div className="py-10 text-center space-y-2">
              <div className="text-sm font-semibold text-[var(--text)]">No clubs found</div>
              <p className="text-xs text-[var(--text-muted)]">
                {section === 'myclubs'
                  ? 'Switch to Discover to browse and join campus clubs.'
                  : 'Try selecting another category or clearing your search.'}
              </p>
              {section === 'myclubs' && (
                <button
                  type="button"
                  onClick={() => {
                    setSection('discover')
                    setCategory('All')
                  }}
                  className="mt-2 px-4 min-h-[38px] rounded-xl bg-[var(--blue)] text-white text-xs font-semibold border-none cursor-pointer"
                >
                  Discover Clubs
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* ── SECTION 3: CLUB FEED / UPDATES ── */}
      {section === 'updates' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {SOURCE_FILTERS.map(src => {
                const isActive = selectedSource === src.id
                return (
                  <button
                    key={src.id}
                    type="button"
                    onClick={() => setSelectedSource(src.id)}
                    className={`inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-full text-xs font-semibold cursor-pointer border transition-colors ${
                      isActive
                        ? 'bg-[var(--blue-light)] text-[var(--blue-ink)] border-[var(--blue)]/30'
                        : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
                    }`}
                  >
                    <PlatformIcon type={src.id} size={14} />
                    <span>{src.label}</span>
                  </button>
                )
              })}
            </div>

            {joinedClubs.length > 0 && (
              <div className="inline-flex items-center bg-[var(--bg-surface)] p-1 rounded-xl border border-[var(--border)]">
                {[
                  { id: 'myclubs', label: `My Clubs (${joinedClubs.length})` },
                  { id: 'all',     label: 'All Campus' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFeedScope(opt.id)}
                    className={`px-3 min-h-[30px] rounded-lg text-xs font-semibold border-none cursor-pointer transition-all ${
                      feedScope === opt.id
                        ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
                        : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {showPostForm && (
            <form
              onSubmit={handlePostUpdateSubmit}
              className="p-4 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] space-y-3.5 fade-in"
            >
              <div className="text-sm font-bold text-[var(--text)]">Post Club Announcement</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                    Club
                  </label>
                  <select
                    value={postClubId}
                    onChange={e => setPostClubId(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                  >
                    {allClubs.map(c => (
                      <option key={c.id} value={c.id}>
                        {cleanText(c.name)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                    Channel
                  </label>
                  <select
                    value={postSource}
                    onChange={e => setPostSource(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                  >
                    <option value="discord">Discord</option>
                    <option value="instagram">Instagram</option>
                    <option value="email">Mailing List</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                    Headline
                  </label>
                  <input
                    type="text"
                    required
                    value={postTitle}
                    onChange={e => setPostTitle(e.target.value)}
                    placeholder="e.g. Friday Project Social"
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                    Details
                  </label>
                  <input
                    type="text"
                    value={postSummary}
                    onChange={e => setPostSummary(e.target.value)}
                    placeholder="e.g. Friday at 5 PM in Baskin 152"
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="submit"
                  className="px-5 min-h-[42px] rounded-xl bg-[var(--blue)] text-white border-none text-sm font-semibold cursor-pointer hover:opacity-90"
                >
                  Publish Update
                </button>
              </div>
            </form>
          )}

          {feedPosts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {feedPosts.map(post => {
                const meta = SOURCE_META[post.source] || SOURCE_META.instagram
                return (
                  <div
                    key={post.id}
                    style={{
                      borderLeftWidth: '3.5px',
                      borderLeftColor: `var(--${meta.color})`,
                    }}
                    className="content-tile content-tile-interactive p-4 rounded-[var(--radius-sm)] flex items-start gap-3"
                  >
                    <IconBadge color={meta.color} size={36} radius={10} className="mt-0.5">
                      <PlatformIcon type={post.source} size={18} />
                    </IconBadge>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <BubbleTag label={meta.label} color={meta.color} size="sm" />
                          <span className="text-xs font-semibold text-[var(--blue-ink)] truncate">
                            {cleanText(post.clubName || post.clubId)}
                          </span>
                        </div>
                        <span className="text-[11px] text-[var(--text-light)] shrink-0">
                          {post.postedAt ? new Date(post.postedAt).toLocaleDateString() : ''}
                        </span>
                      </div>

                      <div className="font-semibold text-sm text-[var(--text)]">
                        {cleanText(post.title)}
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                        {cleanText(post.summary || post.caption)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-[var(--text-muted)]">
              No updates match the current filter.
            </div>
          )}
        </div>
      )}

      {/* ── SECTION 4: REFINED OFFICERS & MEMBERS DIRECTORY ── */}
      {section === 'directory' && (
        <div className="space-y-5">
          {/* Role Segmented Toggle + Club Filter Pills */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="inline-flex items-center bg-[var(--bg-surface)] p-1 rounded-xl border border-[var(--border)] self-start">
              {[
                { id: 'all',      label: `All (${totalDirectoryPeople})` },
                { id: 'officers', label: `Officers (${filteredOfficers.length})` },
                { id: 'members',  label: `Members (${filteredMembers.length})` },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRoleFilter(tab.id)}
                  className={`px-3 min-h-[34px] rounded-lg text-xs font-semibold border-none cursor-pointer transition-all ${
                    roleFilter === tab.id
                      ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
                      : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Club Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setDirectoryClubFilter('all')}
                className={`px-3 min-h-[32px] rounded-full text-xs font-semibold border cursor-pointer transition-colors ${
                  directoryClubFilter === 'all'
                    ? 'bg-[var(--blue-light)] text-[var(--blue-ink)] border-[var(--blue)]/35'
                    : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
                }`}
              >
                All Clubs
              </button>
              {allClubs.slice(0, 6).map(c => {
                const active = String(directoryClubFilter) === String(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      setDirectoryClubFilter(prev =>
                        String(prev) === String(c.id) ? 'all' : String(c.id)
                      )
                    }
                    className={`px-3 min-h-[32px] rounded-full text-xs font-semibold border cursor-pointer transition-colors ${
                      active
                        ? 'bg-[var(--blue-light)] text-[var(--blue-ink)] border-[var(--blue)]/35'
                        : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
                    }`}
                  >
                    {cleanText(c.name)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Add Officer / Member Form */}
          {showAddPersonForm && (
            <form
              onSubmit={handleAddPersonSubmit}
              className="p-4 sm:p-5 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] space-y-4 fade-in"
            >
              <div className="text-sm font-bold text-[var(--text)]">Add to Club Directory</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={personName}
                    onChange={e => setPersonName(e.target.value)}
                    placeholder="e.g. Jordan Chen"
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                    Campus Email
                  </label>
                  <input
                    type="email"
                    required
                    value={personEmail}
                    onChange={e => setPersonEmail(e.target.value)}
                    placeholder="jchen@ucsc.edu"
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                    Club
                  </label>
                  <select
                    value={personClubId}
                    onChange={e => setPersonClubId(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                  >
                    {allClubs.map(c => (
                      <option key={c.id} value={c.id}>
                        {cleanText(c.name)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                    Directory Group
                  </label>
                  <select
                    value={personType}
                    onChange={e => setPersonType(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                  >
                    <option value="officer">Executive Officer / Lead</option>
                    <option value="member">Club Member</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                    Role / Title
                  </label>
                  <input
                    type="text"
                    value={personRoleTitle}
                    onChange={e => setPersonRoleTitle(e.target.value)}
                    placeholder={personType === 'officer' ? 'e.g. Events Chair' : 'e.g. Project Member'}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                    {personType === 'officer' ? 'Office Hours & Room' : 'Major & Class Year'}
                  </label>
                  <input
                    type="text"
                    value={personType === 'officer' ? personOfficeHours : personMajor}
                    onChange={e =>
                      personType === 'officer'
                        ? setPersonOfficeHours(e.target.value)
                        : setPersonMajor(e.target.value)
                    }
                    placeholder={
                      personType === 'officer'
                        ? 'e.g. Thu 2–4 PM · Baskin 152'
                        : "e.g. Computer Science '27"
                    }
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddPersonForm(false)}
                  className="px-4 min-h-[42px] rounded-xl bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border)] text-sm font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 min-h-[42px] rounded-xl bg-[var(--blue)] text-white border-none text-sm font-semibold cursor-pointer hover:opacity-90"
                >
                  Save to Directory
                </button>
              </div>
            </form>
          )}

          {/* 1. Club Leadership & Officers */}
          {(roleFilter === 'all' || roleFilter === 'officers') && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Shield size={15} className="text-[var(--blue)]" />
                <h3 className="text-sm font-bold text-[var(--text)]">
                  Club Leadership & Officers
                </h3>
                <BubbleTag label={`${filteredOfficers.length}`} color="blue" size="sm" />
              </div>

              {filteredOfficers.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredOfficers.map(m => {
                    const isCopied = copiedEmailId === m.id
                    const officerColor = m.color || 'blue'
                    return (
                      <div
                        key={m.id}
                        style={{
                          borderTopWidth: '3px',
                          borderTopColor: `var(--${officerColor})`,
                        }}
                        className="content-tile content-tile-interactive p-4 rounded-[var(--radius-sm)] flex flex-col justify-between gap-3.5"
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="flex items-center gap-3 min-w-0">
                              <Avatar
                                initials={m.initials}
                                bg={`linear-gradient(135deg, var(--${m.color || 'blue'}), var(--purple))`}
                                size={40}
                              />
                              <div className="min-w-0">
                                <div className="font-bold text-sm text-[var(--text)] truncate">
                                  {m.name}
                                </div>
                                <div className="text-xs font-semibold text-[var(--blue-ink)] truncate">
                                  {m.club}
                                </div>
                              </div>
                            </div>

                            <BubbleTag
                              label={m.role}
                              color={m.color || 'blue'}
                              size="sm"
                            />
                          </div>

                          <div className="space-y-1 text-xs text-[var(--text-muted)]">
                            {m.major && <div className="truncate">{m.major}</div>}
                            {m.office && (
                              <div className="flex items-center gap-1.5 text-[var(--text)] font-medium">
                                <Clock size={12} className="text-[var(--teal)] shrink-0" />
                                <span className="truncate">Office Hours: {m.office}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
                          <span className="text-xs text-[var(--text-muted)] font-mono-num truncate">
                            {m.email}
                          </span>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleCopyEmail(m.id, m.email)}
                              title="Copy email address"
                              className="inline-flex items-center gap-1 px-2.5 min-h-[32px] rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--blue)] text-xs font-semibold text-[var(--text)] cursor-pointer transition-colors"
                            >
                              {isCopied ? (
                                <>
                                  <Check size={12} className="text-[var(--green)]" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={12} className="text-[var(--text-muted)]" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>

                            <a
                              href={`mailto:${m.email}`}
                              title={`Email ${m.name}`}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--blue-light)] text-[var(--blue-ink)] hover:opacity-90 no-underline transition-opacity"
                            >
                              <Mail size={14} />
                            </a>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-[var(--text-muted)] bg-[var(--bg-surface)] rounded-xl border border-[var(--border)]">
                  No officers match the current club or search filter.
                </div>
              )}
            </div>
          )}

          {/* 2. Active Club Members */}
          {(roleFilter === 'all' || roleFilter === 'members') && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-2">
                <Users size={15} className="text-[var(--teal)]" />
                <h3 className="text-sm font-bold text-[var(--text)]">Active Members</h3>
                <BubbleTag label={`${filteredMembers.length}`} color="teal" size="sm" />
              </div>

              {filteredMembers.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredMembers.map(m => {
                    const isCopied = copiedEmailId === m.id
                    return (
                      <div
                        key={m.id}
                        style={{
                          borderTopWidth: '3px',
                          borderTopColor: 'var(--teal)',
                        }}
                        className="content-tile content-tile-interactive p-4 rounded-[var(--radius-sm)] flex flex-col justify-between gap-3"
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar initials={m.initials} bg={m.avatarBg} size={38} />
                            <div className="min-w-0">
                              <div className="font-bold text-sm text-[var(--text)] truncate">
                                {m.name}
                              </div>
                              <div className="text-xs text-[var(--text-muted)] truncate">
                                {m.role} · Since {m.joined}
                              </div>
                            </div>
                          </div>

                          {m.major && (
                            <div className="text-xs text-[var(--text-muted)] truncate">
                              {m.major}
                            </div>
                          )}

                          <div className="flex flex-wrap gap-1.5">
                            {(m.clubs || []).map(c => (
                              <button
                                key={c.label}
                                type="button"
                                onClick={() => {
                                  if (c.clubId) setDirectoryClubFilter(String(c.clubId))
                                }}
                                className="bg-transparent border-none p-0 cursor-pointer"
                              >
                                <BubbleTag label={c.label} color={c.color || 'blue'} size="sm" />
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
                          <span className="text-xs text-[var(--text-muted)] font-mono-num truncate">
                            {m.email}
                          </span>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleCopyEmail(m.id, m.email)}
                              className="inline-flex items-center gap-1 px-2.5 min-h-[30px] rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--blue)] text-xs font-semibold text-[var(--text)] cursor-pointer transition-colors"
                            >
                              {isCopied ? (
                                <>
                                  <Check size={12} className="text-[var(--green)]" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={12} className="text-[var(--text-muted)]" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>

                            <a
                              href={`mailto:${m.email}`}
                              title={`Email ${m.name}`}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--blue)] text-[var(--blue-ink)] no-underline transition-colors"
                            >
                              <Mail size={14} />
                            </a>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-[var(--text-muted)] bg-[var(--bg-surface)] rounded-xl border border-[var(--border)]">
                  No members match the current club or search filter.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
