import { useState, useMemo } from 'react'
import {
  Calendar,
  Check,
  Plus,
  Mail,
  ArrowRight,
  X,
} from 'lucide-react'
import {
  clubs as defaultClubs,
  boardMembers,
  memberActivity,
} from '../data/sampleData'
import { Card, ClubAvatar, Avatar, BubbleTag, IconBadge, cleanText } from './ui'
import { PlatformIcon } from './icons'
import { ingestFromSource } from '../api/client'

const CATEGORY_FILTERS = ['All', 'Academic', 'Arts', 'Social']

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

export default function ClubsHub({
  items,
  clubsData,
  hubDict = {},
  onToggleJoin,
  searchQuery = '',
  compact = false,
  onOpenClubs,
  onRefresh,
  localPosts: externalLocalPosts,
  onAddLocalPost,
}) {
  const [section, setSection] = useState('myclubs') // 'myclubs' | 'discover' | 'updates' | 'directory'
  const [category, setCategory] = useState('All')
  const [selectedSource, setSelectedSource] = useState('all')

  // Post Update form state (works online & offline)
  const [showPostForm, setShowPostForm] = useState(false)
  const [postClubId, setPostClubId] = useState('demo_ucsc_csclub')
  const [postSource, setPostSource] = useState('discord')
  const [postTitle, setPostTitle] = useState('')
  const [postSummary, setPostSummary] = useState('')
  const [internalLocalPosts, setInternalLocalPosts] = useState([])

  const localPosts = externalLocalPosts ?? internalLocalPosts

  const allClubs = useMemo(() => {
    if (items && items.length > 0) return items
    return clubsData && clubsData.length > 0 ? clubsData : defaultClubs
  }, [items, clubsData])

  const joinedClubs = useMemo(
    () => allClubs.filter(c => c.joined !== false),
    [allClubs]
  )

  const filteredClubs = useMemo(() => {
    const pool = section === 'discover' ? allClubs : joinedClubs
    return pool.filter(c => {
      if (
        category !== 'All' &&
        (c.category || '').toLowerCase() !== category.toLowerCase()
      ) {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          (c.name || '').toLowerCase().includes(q) ||
          (c.description || '').toLowerCase().includes(q) ||
          (c.tags || []).some(t => t.label.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [allClubs, joinedClubs, section, category, searchQuery])

  const feedPosts = useMemo(() => {
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
      if (selectedSource !== 'all' && post.source !== selectedSource) return false
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
  }, [hubDict, localPosts, selectedSource, searchQuery])

  const filteredBoard = useMemo(() => {
    if (!searchQuery.trim()) return boardMembers
    const q = searchQuery.toLowerCase()
    return boardMembers.filter(
      m =>
        m.name.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q) ||
        (m.club || '').toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q)
    )
  }, [searchQuery])

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return memberActivity
    const q = searchQuery.toLowerCase()
    return memberActivity.filter(
      m =>
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.clubs.some(c => c.label.toLowerCase().includes(q))
    )
  }, [searchQuery])

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
  }

  function renderClubCard(club) {
    const isJoined = club.joined !== false
    return (
      <div
        key={club.id}
        className="p-4 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] flex flex-col justify-between gap-3.5 transition-all hover:border-[var(--border-strong)]"
      >
        <div>
          <div className="flex items-start justify-between gap-3 mb-2.5">
            <div className="flex items-center gap-3 min-w-0">
              <ClubAvatar club={club} size={42} />
              <div className="min-w-0">
                <div className="font-semibold text-sm text-[var(--text)] truncate">
                  {cleanText(club.name)}
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  {club.members} members
                </div>
              </div>
            </div>

            {onToggleJoin && (
              <button
                type="button"
                onClick={() => onToggleJoin(club.id)}
                className={`inline-flex items-center gap-1 px-3 min-h-[32px] rounded-full text-xs font-semibold cursor-pointer border shrink-0 transition-colors ${
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
            <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-3 line-clamp-2">
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

        <div className="pt-2.5 border-t border-[var(--border-subtle)] flex items-center gap-1.5 text-xs text-[var(--text-muted)] min-w-0">
          <Calendar size={13} className="text-[var(--text-light)] shrink-0" />
          <span className="truncate">{cleanText(club.schedule || 'Weekly meetings')}</span>
        </div>
      </div>
    )
  }

  // ── 1. COMPACT OVERVIEW MODE ──────────────────────────────────────
  if (compact) {
    const previewClubs = joinedClubs.slice(0, 3)
    return (
      <Card className="p-4 sm:p-[22px]" delay={4}>
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-[var(--text)]">My Clubs</h2>
            <BubbleTag label={`${joinedClubs.length}`} color="blue" size="sm" />
          </div>

          {onOpenClubs && (
            <button
              type="button"
              onClick={onOpenClubs}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer"
            >
              <span>Browse All Clubs</span>
              <ArrowRight size={13} />
            </button>
          )}
        </div>

        {previewClubs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {previewClubs.map(c => renderClubCard(c))}
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-[var(--text-muted)]">
            You haven&apos;t joined any clubs yet.
          </div>
        )}
      </Card>
    )
  }

  // ── 2. FULL CLUBS HUB PAGE ────────────────────────────────────────
  return (
    <Card className="p-4 sm:p-6" delay={2}>
      {/* Sub-navigation Tabs (Wrapping cleanly — ZERO horizontal scrollbars on mobile!) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-5 border-b border-[var(--border)]">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'myclubs',   label: `My Clubs (${joinedClubs.length})` },
            { id: 'discover',  label: `Discover (${allClubs.length})` },
            { id: 'updates',   label: 'Club Feed' },
            { id: 'directory', label: 'Officers & Members' },
          ].map(tab => {
            const isActive = section === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSection(tab.id)}
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

        {/* Contextual Action or Category Filter */}
        {(section === 'myclubs' || section === 'discover') && (
          <div className="flex flex-wrap items-center gap-1.5">
            {CATEGORY_FILTERS.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`px-3 min-h-[32px] rounded-full text-xs font-medium cursor-pointer border transition-colors ${
                  category === cat
                    ? 'bg-[var(--blue-light)] text-[var(--blue-ink)] border-[var(--blue)]/30 font-semibold'
                    : 'bg-transparent text-[var(--text-muted)] border-transparent hover:bg-[var(--bg-surface)]'
                }`}
              >
                {cat}
              </button>
            ))}
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
      </div>

      {/* ── SECTION 1 & 2: MY CLUBS / DISCOVER ── */}
      {(section === 'myclubs' || section === 'discover') && (
        <>
          {filteredClubs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredClubs.map(club => renderClubCard(club))}
            </div>
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
          {/* Wrapping Channel Filter Pills (No horizontal scrollbar!) */}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {feedPosts.map(post => {
                const meta = SOURCE_META[post.source] || SOURCE_META.instagram
                return (
                  <div
                    key={post.id}
                    className="p-4 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-start gap-3"
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

      {/* ── SECTION 4: OFFICERS & MEMBERS DIRECTORY ── */}
      {section === 'directory' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Club Officers */}
          <div>
            <h3 className="text-sm font-bold text-[var(--text)] mb-3">Club Officers</h3>
            <div className="flex flex-col gap-2.5">
              {filteredBoard.map(m => (
                <div
                  key={m.id}
                  className="p-3.5 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar initials={m.initials} bg={`var(--${m.color})`} size={34} />
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-[var(--text)] truncate">
                        {m.name}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] truncate">
                        {m.club ? `${m.club} · ` : ''}{m.role}
                      </div>
                    </div>
                  </div>

                  <a
                    href={`mailto:${m.email}`}
                    className="inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-xl bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--blue)] text-xs font-semibold text-[var(--text)] no-underline shrink-0 transition-colors"
                  >
                    <Mail size={13} className="text-[var(--blue)]" />
                    <span>Email</span>
                  </a>
                </div>
              ))}
            </div>
          </div>

          {/* Active Members */}
          <div>
            <h3 className="text-sm font-bold text-[var(--text)] mb-3">Active Members</h3>
            <div className="flex flex-col gap-2.5">
              {filteredMembers.map(m => (
                <div
                  key={m.id}
                  className="p-3.5 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar initials={m.initials} bg={m.avatarBg} size={34} />
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-[var(--text)] truncate">
                        {m.name}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] truncate">
                        {m.role} · Joined {m.joined}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-1 shrink-0">
                    {m.clubs.map(c => (
                      <BubbleTag key={c.label} label={c.label} color={c.color} size="sm" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
