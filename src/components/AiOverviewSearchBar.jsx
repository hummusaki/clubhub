import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Sparkles,
  X,
  ArrowRight,
  Check,
  Plus,
  Compass,
  Tag,
  Zap,
} from 'lucide-react'
import { BubbleTag, Avatar } from './ui'
import { recommendClubsForInterests, SAMPLE_INTEREST_PROMPTS } from '../utils/aiClubAgent'

export default function AiOverviewSearchBar({
  query = '',
  onChangeQuery,
  clubs = [],
  onToggleJoinClub,
  onOpenClub,
  onNotify,
  placeholder = '✨ Describe your interests to get club recommendations…',
  width = '100%',
}) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  // Compute AI recommendations based on current query
  const aiResults = useMemo(() => {
    return recommendClubsForInterests(clubs, query)
  }, [clubs, query])

  // Handle clicking outside to dismiss dropdown
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  function handleSelectPrompt(promptQuery) {
    if (onChangeQuery) {
      onChangeQuery(promptQuery)
    }
    setIsOpen(true)
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }

  function handleJoinClick(e, club) {
    e.stopPropagation()
    if (onToggleJoinClub) {
      onToggleJoinClub(club.id)
      if (onNotify) {
        if (!club.joined) {
          onNotify(`Joined ${club.name}! Added to your Overview and Calendar.`, 'success')
        } else {
          onNotify(`Left ${club.name}.`, 'info')
        }
      }
    }
  }

  function handleViewClub(club) {
    setIsOpen(false)
    if (onOpenClub) {
      onOpenClub({ clubId: club.id, section: 'discover' })
    }
  }

  return (
    <div ref={containerRef} className="relative w-full" style={{ maxWidth: width }}>
      {/* ── Main AI Search Input ── */}
      <div
        className={`flex items-center gap-2 px-3 sm:px-3.5 min-h-[42px] rounded-xl bg-[var(--bg-card)]
          border transition-all duration-200 max-w-full min-w-0
          ${isOpen
            ? 'border-[var(--blue)] shadow-[0_0_0_3px_rgba(82,141,244,0.18)]'
            : 'border-[var(--border)] hover:border-[var(--border-strong)]'
          }`}
      >
        {/* Animated AI Sparkles Badge */}
        <button
          type="button"
          onClick={() => {
            setIsOpen(prev => !prev)
            if (!isOpen && inputRef.current) inputRef.current.focus()
          }}
          title="ClubHub AI Club Recommendation Agent"
          aria-label="Toggle AI Club Matchmaker"
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-[var(--blue-light)] text-[var(--blue-ink)]
            border border-[var(--blue)]/25 hover:opacity-90 transition-all cursor-pointer shrink-0"
        >
          <Sparkles size={14} className="animate-pulse text-[var(--blue)]" />
          <span className="text-[11px] font-bold tracking-tight hidden xs:inline">AI Agent</span>
        </button>

        {/* Search Input Field */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={e => onChangeQuery && onChangeQuery(e.target.value)}
          placeholder={placeholder}
          className="border-none outline-none bg-transparent text-[var(--text)] text-sm w-full min-w-0
            placeholder:text-[var(--text-light)] font-normal"
        />

        {/* Clear Search Action */}
        {query && (
          <button
            type="button"
            onClick={() => {
              if (onChangeQuery) onChangeQuery('')
              if (inputRef.current) inputRef.current.focus()
            }}
            className="text-[var(--text-light)] hover:text-[var(--text)] p-1 cursor-pointer bg-transparent border-none flex items-center shrink-0"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* ── AI Agent Recommendation Dropdown Popover ── */}
      {isOpen && (
        <div
          className="absolute left-0 right-0 sm:left-auto sm:right-0 sm:w-[480px] md:w-[520px] top-full mt-2
            bg-[var(--bg-card)] border border-[var(--border)] rounded-[20px] shadow-[var(--shadow-lg)]
            z-50 overflow-hidden fade-in flex flex-col max-h-[82vh] sm:max-h-[580px]"
        >
          {/* Header Banner */}
          <div className="px-4 py-3 bg-[var(--bg-surface)] border-b border-[var(--border)] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-lg bg-[var(--blue-light)] text-[var(--blue-ink)] flex items-center justify-center shrink-0">
                <Sparkles size={13} />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
                  <span>ClubHub AI Club Matchmaker</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[9.5px] font-semibold bg-[var(--green-light)] text-[var(--green-ink)]">
                    Active
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] truncate">
                  {query.trim()
                    ? `Matching campus clubs for "${query}"`
                    : 'Tell me your interests or choose an interest below'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-6 h-6 rounded-full hover:bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-muted)] border-none bg-transparent cursor-pointer shrink-0"
              aria-label="Close recommendations"
            >
              <X size={14} />
            </button>
          </div>

          {/* Body Content (Scrollable) */}
          <div className="p-3.5 sm:p-4 overflow-y-auto space-y-3.5 flex-1">
            {/* 1. Quick Interest Prompts Pills */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1">
                <Compass size={12} className="text-[var(--blue)]" />
                <span>Popular Student Interests</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_INTEREST_PROMPTS.map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handleSelectPrompt(p.query)}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-[var(--bg-surface)]
                      border border-[var(--border)] text-[var(--text)] hover:border-[var(--blue)]
                      hover:bg-[var(--blue-light)] hover:text-[var(--blue-ink)] transition-colors cursor-pointer"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. AI Recommended Clubs Section */}
            {query.trim() && (
              <div className="space-y-2 pt-1 border-t border-[var(--border)]">
                <div className="flex items-center justify-between">
                  <div className="text-[11.5px] font-bold text-[var(--text)] flex items-center gap-1.5">
                    <Zap size={13} className="text-[var(--yellow)]" />
                    <span>Top Recommended Clubs ({aiResults.matches.length})</span>
                  </div>
                  {query && (
                    <button
                      type="button"
                      onClick={() => onChangeQuery && onChangeQuery('')}
                      className="text-[11px] text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer p-0"
                    >
                      Clear search
                    </button>
                  )}
                </div>

                {aiResults.hasMatches ? (
                  <div className="space-y-2.5">
                    {aiResults.matches.map(({ club, matchScore, aiRationale, matchedTerms }) => {
                      const isJoined = Boolean(club.joined)
                      const initials = (club.abbr || club.name || 'CH')
                        .split(' ')
                        .map(w => w[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()

                      return (
                        <div
                          key={club.id}
                          className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)]
                            hover:border-[var(--blue)]/50 transition-all space-y-2"
                        >
                          {/* Top Row: Club info + Match Badge + Action */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Avatar
                                initials={initials}
                                bg={club.avatarBg || 'linear-gradient(135deg, var(--blue), var(--purple))'}
                                size={34}
                              />
                              <div className="min-w-0">
                                <div className="text-[13px] font-bold text-[var(--text)] truncate">
                                  {club.name}
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                                  <span>{club.categoryLabel || club.category}</span>
                                  <span>•</span>
                                  <span>{club.members || 0} members</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* Match Score Badge */}
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10.5px] font-extrabold ${matchScore >= 80
                                  ? 'bg-[var(--green-light)] text-[var(--green-ink)] border border-[var(--green)]/20'
                                  : 'bg-[var(--blue-light)] text-[var(--blue-ink)] border border-[var(--blue)]/20'
                                  }`}
                              >
                                {matchScore}% Match
                              </span>

                              {/* Join / Joined Button */}
                              <button
                                type="button"
                                onClick={e => handleJoinClick(e, club)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer border ${isJoined
                                  ? 'bg-[var(--bg-card)] border-[var(--green)]/35 text-[var(--green-ink)]'
                                  : 'bg-[var(--blue)] hover:opacity-90 border-[var(--blue)] text-white shadow-2xs'
                                  }`}
                              >
                                {isJoined ? (
                                  <>
                                    <Check size={11} />
                                    <span>Joined</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus size={11} />
                                    <span>Join</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* AI Rationale Box */}
                          <div className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[11px] text-[var(--text)] leading-relaxed flex items-start gap-1.5">
                            <Sparkles size={12} className="text-[var(--blue)] shrink-0 mt-0.5" />
                            <span>{aiRationale}</span>
                          </div>

                          {/* Matched Tags & View link */}
                          <div className="flex items-center justify-between text-[11px] pt-0.5">
                            <div className="flex items-center gap-1 flex-wrap">
                              {matchedTerms.map(term => (
                                <span
                                  key={term}
                                  className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-[var(--bg-card)] text-[10px] text-[var(--text-muted)] border border-[var(--border-subtle)] font-medium"
                                >
                                  <Tag size={9} />
                                  <span>{term}</span>
                                </span>
                              ))}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleViewClub(club)}
                              className="text-[var(--blue-ink)] hover:underline font-semibold inline-flex items-center gap-0.5 bg-transparent border-none cursor-pointer shrink-0 ml-2"
                            >
                              <span>View details</span>
                              <ArrowRight size={11} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="py-6 text-center space-y-1.5">
                    <p className="text-xs font-semibold text-[var(--text)]">
                      No direct club matches found for &quot;{query}&quot;
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] max-w-xs mx-auto">
                      Try searching with broader interest keywords like coding, outdoors, visual arts, debate, robotics, or music!
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer note */}
          <div className="px-4 py-2 bg-[var(--bg-surface)] border-t border-[var(--border)] text-[10.5px] text-[var(--text-light)] flex items-center justify-between">
            <span>Instant semantic AI matching across all campus clubs</span>
            <span className="hidden sm:inline">Press Esc to close</span>
          </div>
        </div>
      )}
    </div>
  )
}
