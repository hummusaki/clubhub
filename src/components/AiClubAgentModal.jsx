import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Sparkles,
  X,
  Plus,
  Check,
  ArrowRight,
  Compass,
  Tag,
  Zap,
} from 'lucide-react'
import { BubbleTag, Avatar } from './ui'
import { recommendClubsForInterests, SAMPLE_INTEREST_PROMPTS } from '../utils/aiClubAgent'

export default function AiClubAgentModal({
  clubs = [],
  onToggleJoinClub,
  onOpenClub,
  onNotify,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const inputRef = useRef(null)

  // Compute AI recommendations based on current prompt
  const aiResults = useMemo(() => {
    return recommendClubsForInterests(clubs, prompt)
  }, [clubs, prompt])

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus()
      }, 60)
    }
  }, [isOpen])

  // Handle Escape key to close modal
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  function handleSelectPrompt(queryText) {
    setPrompt(queryText)
    if (inputRef.current) inputRef.current.focus()
  }

  function handleJoin(e, club) {
    e.stopPropagation()
    if (onToggleJoinClub) {
      onToggleJoinClub(club.id)
      if (onNotify) {
        if (!club.joined) {
          onNotify(`Joined ${club.name}! Added to your Overview & Calendar.`, 'success')
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
    <>
      {/* ── AI Agent Button (Placed on the side of the search bar) ── */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title="Ask AI Club Matchmaker: Type interests to find clubs"
        aria-label="Open AI Club Matchmaker"
        className="flex items-center gap-1.5 px-3 sm:px-3.5 min-h-[42px] rounded-xl
          bg-[var(--blue-light)] border border-[var(--blue)]/30 hover:border-[var(--blue)]
          text-xs font-bold text-[var(--blue-ink)] hover:opacity-95
          transition-all shadow-2xs hover:shadow-xs cursor-pointer shrink-0"
      >
        <Sparkles size={15} className="text-[var(--blue)] animate-pulse" />
        <span className="hidden sm:inline">AI Matchmaker</span>
        <span className="sm:hidden">AI Agent</span>
      </button>

      {/* ── AI Club Matchmaker Modal ── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/30 fade-in"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-w-[540px] bg-[var(--bg-card)] border border-[var(--border)]
              rounded-[24px] shadow-[var(--shadow-lg)] overflow-hidden flex flex-col max-h-[85vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 bg-[var(--bg-surface)] border-b border-[var(--border)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[var(--blue-light)] text-[var(--blue-ink)] flex items-center justify-center shrink-0">
                  <Sparkles size={16} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-bold text-[var(--text)] truncate">
                      AI Club Matchmaker
                    </h3>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--green-light)] text-[var(--green-ink)]">
                      Agent Active
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                    Type your interests or goals to find campus clubs to join
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close AI Matchmaker"
                className="w-7 h-7 rounded-full hover:bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-muted)] border-none bg-transparent cursor-pointer shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              {/* Interest Prompt Input Box */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[var(--text)]">
                  What are you interested in?
                </label>
                <div
                  className="flex items-center gap-2 px-3.5 min-h-[44px] rounded-xl bg-[var(--bg-surface)]
                    border border-[var(--border)] focus-within:border-[var(--blue)] focus-within:bg-[var(--bg-card)]
                    transition-all shadow-2xs"
                >
                  <Sparkles size={15} className="text-[var(--blue)] shrink-0" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    placeholder="e.g. game dev, hiking redwoods, practicing debate, singing..."
                    className="w-full bg-transparent border-none outline-none text-sm text-[var(--text)]
                      placeholder:text-[var(--text-light)]"
                  />
                  {prompt && (
                    <button
                      type="button"
                      onClick={() => {
                        setPrompt('')
                        if (inputRef.current) inputRef.current.focus()
                      }}
                      className="text-[var(--text-light)] hover:text-[var(--text)] p-1 bg-transparent border-none cursor-pointer flex items-center shrink-0"
                      aria-label="Clear prompt"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Interest Suggestions Pills */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1">
                  <Compass size={12} className="text-[var(--blue)]" />
                  <span>Popular Student Interests (1-Tap Prompt)</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SAMPLE_INTEREST_PROMPTS.map(p => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => handleSelectPrompt(p.query)}
                      className="text-[11.5px] font-medium px-2.5 py-1 rounded-full bg-[var(--bg-surface)]
                        border border-[var(--border)] text-[var(--text)] hover:border-[var(--blue)]
                        hover:bg-[var(--blue-light)] hover:text-[var(--blue-ink)] transition-colors cursor-pointer"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recommendations Results List */}
              {prompt.trim() ? (
                <div className="space-y-2.5 pt-2 border-t border-[var(--border)]">
                  <div className="flex items-center justify-between text-xs">
                    <div className="font-bold text-[var(--text)] flex items-center gap-1.5">
                      <Zap size={13} className="text-[var(--yellow)]" />
                      <span>Recommended Clubs ({aiResults.matches.length})</span>
                    </div>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      Sorted by semantic match score
                    </span>
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
                            className="p-3.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)]
                              hover:border-[var(--blue)]/50 transition-all space-y-2.5 shadow-2xs"
                          >
                            {/* Club Header & Join Button */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Avatar
                                  initials={initials}
                                  bg={club.avatarBg || 'linear-gradient(135deg, var(--blue), var(--purple))'}
                                  size={36}
                                />
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
                                  className={`px-2 py-0.5 rounded-full text-[10.5px] font-extrabold ${matchScore >= 80
                                      ? 'bg-[var(--green-light)] text-[var(--green-ink)] border border-[var(--green)]/20'
                                      : 'bg-[var(--blue-light)] text-[var(--blue-ink)] border border-[var(--blue)]/20'
                                    }`}
                                >
                                  {matchScore}% Match
                                </span>

                                <button
                                  type="button"
                                  onClick={e => handleJoin(e, club)}
                                  className={`px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer border ${isJoined
                                      ? 'bg-[var(--bg-card)] border-[var(--green)]/35 text-[var(--green-ink)]'
                                      : 'bg-[var(--blue)] hover:opacity-90 border-[var(--blue)] text-white shadow-2xs'
                                    }`}
                                >
                                  {isJoined ? (
                                    <>
                                      <Check size={12} />
                                      <span>Joined</span>
                                    </>
                                  ) : (
                                    <>
                                      <Plus size={12} />
                                      <span>Join</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* AI Agent Rationale */}
                            <div className="px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs text-[var(--text)] leading-relaxed flex items-start gap-2">
                              <Sparkles size={13} className="text-[var(--blue)] shrink-0 mt-0.5" />
                              <span>{aiRationale}</span>
                            </div>

                            {/* Matched Tags & Navigation */}
                            <div className="flex items-center justify-between text-[11px] pt-0.5">
                              <div className="flex items-center gap-1 flex-wrap">
                                {matchedTerms.map(tag => (
                                  <span
                                    key={tag}
                                    className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-[var(--bg-card)] text-[10px] text-[var(--text-muted)] border border-[var(--border-subtle)] font-medium"
                                  >
                                    <Tag size={9} />
                                    <span>{tag}</span>
                                  </span>
                                ))}
                              </div>

                              <button
                                type="button"
                                onClick={() => handleViewClub(club)}
                                className="text-[var(--blue-ink)] hover:underline font-semibold inline-flex items-center gap-0.5 bg-transparent border-none cursor-pointer shrink-0 ml-2"
                              >
                                <span>View Club</span>
                                <ArrowRight size={12} />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="py-6 text-center space-y-1.5">
                      <p className="text-xs font-semibold text-[var(--text)]">
                        No direct club matches found for &quot;{prompt}&quot;
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] max-w-xs mx-auto">
                        Try typing broader interest keywords like coding, outdoors, arts, debate, robotics, or music!
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-6 px-4 rounded-2xl bg-[var(--bg-surface)] border border-dashed border-[var(--border)] text-center space-y-1.5">
                  <div className="w-9 h-9 rounded-full bg-[var(--blue-light)] text-[var(--blue)] flex items-center justify-center mx-auto">
                    <Sparkles size={18} />
                  </div>
                  <div className="text-xs font-bold text-[var(--text)]">
                    Type your interests above to get AI recommendations
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] max-w-sm mx-auto">
                    Describe any topic, career path, or hobby you care about and the AI Agent will match you with active UCSC student clubs.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-[var(--bg-surface)] border-t border-[var(--border)] flex items-center justify-between text-xs">
              <span className="text-[11px] text-[var(--text-muted)]">
                Instant semantic matching across campus clubs
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-xs font-semibold text-[var(--text)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
