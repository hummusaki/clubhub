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
  ChevronUp,
} from 'lucide-react'
import { Card, IconBadge, ClubAvatar, BubbleTag } from './ui'
import { recommendClubsForInterests, SAMPLE_INTEREST_PROMPTS } from '../utils/aiClubAgent'

export default function AiOverviewSearchBar({
  query: controlledQuery,
  onChangeQuery,
  clubs = [],
  userSettings = {},
  onToggleJoinClub,
  onOpenClub,
  onNotify,
  placeholder = 'Try: coding, hiking, film, debate…',
}) {
  const [internalQuery, setInternalQuery] = useState(controlledQuery || '')
  const [showPrompts, setShowPrompts] = useState(false)
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  const isCompact = Boolean(userSettings?.compactCards)
  const isControlled = controlledQuery !== undefined && typeof onChangeQuery === 'function'
  const query = isControlled ? controlledQuery : internalQuery
  const hasQuery = Boolean(query.trim())
  const isExpanded = showPrompts || hasQuery

  function updateQuery(nextValue) {
    if (isControlled) {
      onChangeQuery(nextValue)
    } else {
      setInternalQuery(nextValue)
    }
  }

  // Compute AI recommendations based on current query
  const aiResults = useMemo(() => {
    return recommendClubsForInterests(clubs, query, 6)
  }, [clubs, query])

  // Dismiss expanded prompt tray on outside click (when query is empty) or Escape
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowPrompts(false)
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setShowPrompts(false)
        if (inputRef.current === document.activeElement) {
          inputRef.current.blur()
        }
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
    updateQuery(promptQuery)
    setShowPrompts(true)
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
          onNotify(`Joined ${club.name}! Added to your Overview and Calendar.`, {
            type: 'success',
          })
        } else {
          onNotify(`Left ${club.name}.`, { type: 'info' })
        }
      }
    }
  }

  function handleViewClub(club) {
    setShowPrompts(false)
    if (onOpenClub) {
      onOpenClub({
        clubId: club.id,
        section: 'discover',
        searchQuery: club.name || '',
      })
    }
  }

  return (
    <div ref={containerRef}>
      <Card
        delay={1}
        style={{
          borderLeftWidth: '3.5px',
          borderLeftColor: 'var(--blue)',
        }}
        className={isCompact ? 'p-3 sm:p-4 space-y-3' : 'p-4 sm:p-5 space-y-3.5'}
      >
        {/* ── Top Row: AI Matchmaker Identity + Dedicated Interest Prompt Input ── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            <IconBadge
              color="blue"
              size={isCompact ? 34 : 40}
              radius={isCompact ? 10 : 12}
            >
              <Sparkles size={isCompact ? 16 : 19} />
            </IconBadge>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-[15px] font-bold text-[var(--text)] leading-snug">
                  AI Club Matchmaker
                </h2>
                <BubbleTag label="AI Agent" color="blue" size="sm" dot />
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Describe your interests, major, or hobbies to get personalized club matches
              </p>
            </div>
          </div>

          {/* Dedicated Interest Input Bar */}
          <div className="flex items-center gap-2 w-full lg:flex-1 lg:max-w-[520px] min-w-0">
            <div
              className={`flex items-center gap-2.5 px-3.5 min-h-[42px] rounded-xl bg-[var(--bg-tile)]
                border transition-all duration-200 w-full min-w-0
                ${
                  isExpanded
                    ? 'border-[var(--blue)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--blue)_16%,transparent)]'
                    : 'border-[var(--border-tile)] hover:border-[var(--border-strong)]'
                }`}
            >
              <Sparkles size={15} className="text-[var(--blue)] shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onFocus={() => setShowPrompts(true)}
                onClick={() => setShowPrompts(true)}
                onChange={e => {
                  updateQuery(e.target.value)
                  setShowPrompts(true)
                }}
                placeholder={placeholder}
                aria-label="Describe your interests for AI club recommendations"
                className="border-none outline-none focus-visible:shadow-none bg-transparent text-[var(--text)] text-base sm:text-sm w-full min-w-0
                  placeholder:text-[var(--text-light)] font-normal"
              />

              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    updateQuery('')
                    if (inputRef.current) inputRef.current.focus()
                  }}
                  className="text-[var(--text-light)] hover:text-[var(--text)] p-1 cursor-pointer bg-transparent border-none flex items-center shrink-0"
                  aria-label="Clear AI interest prompt"
                >
                  <X size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowPrompts(prev => !prev)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer shrink-0 transition-colors"
                >
                  <Compass size={12} className="text-[var(--blue)]" />
                  <span className="hidden sm:inline">{showPrompts ? 'Hide Ideas' : 'Ideas'}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Expandable Prompts & Live Recommendations Drawer ── */}
        {isExpanded && (
          <div className="pt-3 border-t border-[var(--border)] space-y-3.5 fade-in">
            {/* 1. Quick Interest Prompts Pills */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                  <Compass size={12} className="text-[var(--blue)]" />
                  <span>Popular Student Interests</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    updateQuery('')
                    setShowPrompts(false)
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] bg-transparent border-none cursor-pointer p-0"
                >
                  <span>Collapse</span>
                  <ChevronUp size={13} />
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_INTEREST_PROMPTS.map(p => {
                  const isActivePrompt = query.trim().toLowerCase() === p.query.toLowerCase()
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => handleSelectPrompt(p.query)}
                      className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                        isActivePrompt
                          ? 'bg-[var(--blue-light)] border-[var(--blue)] text-[var(--blue-ink)] font-semibold'
                          : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text)] hover:border-[var(--blue)] hover:bg-[var(--blue-light)] hover:text-[var(--blue-ink)]'
                      }`}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 2. AI Recommended Clubs Grid */}
            {hasQuery && (
              <div className="space-y-2.5 pt-2.5 border-t border-[var(--border-subtle)]">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
                    <Zap size={13} className="text-[var(--yellow)]" />
                    <span>Top Recommended Clubs ({aiResults.matches.length})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateQuery('')}
                    className="text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer p-0"
                  >
                    Clear prompt
                  </button>
                </div>

                {aiResults.hasMatches ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {aiResults.matches.map(({ club, matchScore, aiRationale, matchedTerms }) => {
                      const isJoined = Boolean(club.joined)

                      return (
                        <div
                          key={club.id}
                          className="p-3.5 rounded-2xl content-tile flex flex-col justify-between gap-2.5"
                        >
                          <div className="space-y-2.5">
                            {/* Club Header + Match Score + Join */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <ClubAvatar club={club} size={36} />
                                <div className="min-w-0">
                                  <div className="text-[13.5px] font-bold text-[var(--text)] truncate">
                                    {club.name}
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] truncate">
                                    <span>{club.categoryLabel || club.category}</span>
                                    <span>•</span>
                                    <span>{club.members || 0} members</span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10.5px] font-extrabold ${
                                    matchScore >= 80
                                      ? 'bg-[var(--green-light)] text-[var(--green-ink)] border border-[var(--green)]/20'
                                      : 'bg-[var(--blue-light)] text-[var(--blue-ink)] border border-[var(--blue)]/20'
                                  }`}
                                >
                                  {matchScore}% Match
                                </span>

                                <button
                                  type="button"
                                  onClick={e => handleJoinClick(e, club)}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer border ${
                                    isJoined
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
                            <div className="px-2.5 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[11.5px] text-[var(--text)] leading-relaxed flex items-start gap-1.5">
                              <Sparkles size={12} className="text-[var(--blue)] shrink-0 mt-0.5" />
                              <span>{aiRationale}</span>
                            </div>
                          </div>

                          {/* Matched Tags & View details */}
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
                  <div className="py-5 text-center space-y-1">
                    <p className="text-xs font-semibold text-[var(--text)]">
                      No direct club matches found for &quot;{query}&quot;
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] max-w-sm mx-auto">
                      Try broader interest keywords like coding, outdoors, visual arts, debate, robotics, pre-med, or music.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
