import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Sparkles,
  X,
  Plus,
  Check,
  ArrowRight,
  CornerDownLeft,
  Compass,
  Tag,
  Zap,
  Calendar,
  Loader2,
  RotateCcw,
  Ban,
} from 'lucide-react'
import { ClubAvatar, cleanText } from './ui'
import { PlatformIcon } from './icons'
import {
  recommendClubsForInterests,
  buildConversationalQuery,
  formatEventWhenLabel,
  SAMPLE_INTEREST_PROMPTS,
} from '../utils/aiClubAgent'
import { getAiCapabilities, runGenerativeClubSearch } from '../api/aiClient'

export default function AiClubAgentModal({
  clubs = [],
  events = [],
  userSettings = {},
  onToggleJoinClub,
  onOpenClub,
  onOpenCalendar,
  onNotify,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [turns, setTurns] = useState([])
  const [aiCaps, setAiCaps] = useState({ generativeEnabled: false })
  const [llmResults, setLlmResults] = useState(null)
  const [isSynthesizing, setIsSynthesizing] = useState(false)
  const [lastInteractionId, setLastInteractionId] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    let active = true
    getAiCapabilities().then(caps => {
      if (active) setAiCaps(caps)
    })
    setTimeout(() => {
      if (inputRef.current) inputRef.current.focus()
    }, 60)
    return () => {
      active = false
    }
  }, [isOpen])

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const activeTurns = useMemo(() => {
    const cleanDraft = draft.trim()
    if (turns.length > 0) return cleanDraft ? [...turns, cleanDraft] : turns
    return cleanDraft ? [cleanDraft] : []
  }, [turns, draft])

  const effectiveQuery = useMemo(
    () => buildConversationalQuery(activeTurns),
    [activeTurns]
  )

  const ragResults = useMemo(() => {
    return recommendClubsForInterests(clubs, effectiveQuery, {
      maxResults: 6,
      events,
      userMajor: userSettings?.major || '',
    })
  }, [clubs, events, effectiveQuery, userSettings?.major])

  useEffect(() => {
    if (!isOpen || !effectiveQuery || !aiCaps.generativeEnabled) {
      setLlmResults(null)
      setIsSynthesizing(false)
      return
    }

    const controller = new AbortController()
    setIsSynthesizing(true)
    const timer = setTimeout(async () => {
      const upgraded = await runGenerativeClubSearch({
        clubs,
        events,
        query: effectiveQuery,
        turns: activeTurns,
        ragResult: ragResults,
        userProfile: {
          major: userSettings?.major || '',
          year: userSettings?.year || '',
        },
        previousInteractionId: lastInteractionId,
        maxResults: 6,
        signal: controller.signal,
      })
      if (!controller.signal.aborted) {
        if (upgraded) {
          setLlmResults({ forQuery: effectiveQuery, data: upgraded })
          if (upgraded.interactionId) setLastInteractionId(upgraded.interactionId)
        }
        setIsSynthesizing(false)
      }
    }, draft.trim() ? 550 : 80)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [
    isOpen,
    effectiveQuery,
    aiCaps.generativeEnabled,
    clubs,
    events,
    activeTurns,
    ragResults,
    userSettings?.major,
    userSettings?.year,
    draft,
    lastInteractionId,
  ])

  const displayResults =
    llmResults && llmResults.forQuery === effectiveQuery ? llmResults.data : ragResults

  const liveMatches = useMemo(() => {
    const byId = new Map(clubs.map(c => [String(c.id), c]))
    return (displayResults.matches || []).map(m => ({
      ...m,
      club: byId.get(String(m.club.id)) || m.club,
    }))
  }, [displayResults.matches, clubs])

  function handleSubmit(e) {
    e.preventDefault()
    const clean = draft.trim()
    if (!clean) return
    setTurns(prev => [...prev, clean])
    setDraft('')
  }

  function handleSelectStarter(queryText) {
    setTurns([queryText])
    setDraft('')
    setLastInteractionId('')
  }

  function handleSelectFollowUp(chip) {
    if (chip.replaceQuery) {
      setTurns([chip.replaceQuery])
      setDraft('')
      setLastInteractionId('')
    } else if (chip.appendQuery) {
      const base = turns.length > 0 ? turns : draft.trim() ? [draft.trim()] : []
      setTurns([...base, chip.appendQuery])
      setDraft('')
    }
  }

  function handleReset() {
    setTurns([])
    setDraft('')
    setLlmResults(null)
    setLastInteractionId('')
    if (inputRef.current) inputRef.current.focus()
  }

  function handleJoin(e, club) {
    e.stopPropagation()
    if (onToggleJoinClub) {
      onToggleJoinClub(club.id)
      if (onNotify) {
        if (!club.joined) {
          onNotify(`Joined ${club.name}! Added to your Overview & Calendar.`, { type: 'success' })
        } else {
          onNotify(`Left ${club.name}.`, { type: 'info' })
        }
      }
    }
  }

  function handleViewClub(club) {
    setIsOpen(false)
    if (onOpenClub) {
      onOpenClub({
        clubId: club.id,
        section: 'discover',
        searchQuery: club.name || '',
      })
    }
  }

  function handleViewEvent(e, ev) {
    e.stopPropagation()
    setIsOpen(false)
    if (onOpenCalendar) {
      onOpenCalendar({ view: 'month', searchQuery: ev.event || ev.title || '' })
    }
  }

  return (
    <>
      {/* ── AI Search Button (Beside normal search bar, never replacing it) ── */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title="Open AI Club Search & Advisor"
        aria-label="Open AI Club Search & Advisor"
        className="flex items-center gap-1.5 px-3 sm:px-3.5 min-h-[42px] rounded-xl
          bg-[var(--blue-light)] border border-[var(--blue)]/30 hover:border-[var(--blue)]
          text-xs font-bold text-[var(--blue-ink)] hover:opacity-95
          transition-all shadow-2xs hover:shadow-xs cursor-pointer shrink-0"
      >
        <Sparkles size={15} className="text-[var(--blue)]" />
        <span className="hidden sm:inline">AI Search</span>
        <span className="sm:hidden">AI</span>
      </button>

      {/* ── Grounded AI Club Search & Advisor Modal ── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/35 fade-in"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-w-[600px] bg-[var(--bg-card)] border border-[var(--border)]
              rounded-[24px] shadow-[var(--shadow-lg)] overflow-hidden flex flex-col max-h-[86vh]"
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
                      AI Club Search &amp; Advisor
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--green-light)] text-[var(--green-ink)]">
                      {aiCaps.generativeEnabled ? 'Gemini 4' : 'Grounded AI'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                    Combine interests, vibe preferences, exclusions, or upcoming events
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close AI Search"
                className="w-7 h-7 rounded-full hover:bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-muted)] border-none bg-transparent cursor-pointer shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              {/* Conversational Prompt Input */}
              <form onSubmit={handleSubmit} className="space-y-2">
                <div
                  className="flex items-center gap-2 px-3.5 min-h-[44px] rounded-xl bg-[var(--bg-surface)]
                    border border-[var(--border)] focus-within:border-[var(--blue)] focus-within:bg-[var(--bg-card)]
                    transition-all shadow-2xs"
                >
                  <Sparkles size={15} className="text-[var(--blue)] shrink-0" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    placeholder={
                      turns.length > 0
                        ? 'Ask a follow-up to refine results…'
                        : 'Ask AI about clubs, majors, or vibes…'
                    }
                    className="w-full min-w-0 bg-transparent border-none outline-none text-sm text-[var(--text)]
                      placeholder:text-[var(--text-light)]"
                  />
                  {draft && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setDraft('')
                          if (inputRef.current) inputRef.current.focus()
                        }}
                        className="text-[var(--text-light)] hover:text-[var(--text)] p-1 bg-transparent border-none cursor-pointer flex items-center"
                        aria-label="Clear prompt"
                      >
                        <X size={14} />
                      </button>
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--blue)] text-white border-none text-[11px] font-semibold cursor-pointer"
                      >
                        <span>{turns.length > 0 ? 'Refine' : 'Ask'}</span>
                        <CornerDownLeft size={11} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Multi-turn breadcrumbs */}
                {turns.length > 0 && (
                  <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {turns.map((t, idx) => (
                        <span
                          key={`${t}-${idx}`}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text)]"
                        >
                          <span className="truncate max-w-[220px]">{idx > 0 ? `+ ${t}` : t}</span>
                          <button
                            type="button"
                            onClick={() => setTurns(prev => prev.filter((_, i) => i !== idx))}
                            className="text-[var(--text-light)] hover:text-[var(--text)] bg-transparent border-none p-0 cursor-pointer flex items-center"
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleReset}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer p-0"
                    >
                      <RotateCcw size={11} />
                      <span>Reset</span>
                    </button>
                  </div>
                )}
              </form>

              {/* Starter Prompts when empty */}
              {!effectiveQuery && (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1">
                    <Compass size={12} className="text-[var(--blue)]" />
                    <span>Popular Natural-Language Prompts</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {SAMPLE_INTEREST_PROMPTS.map(p => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => handleSelectStarter(p.query)}
                        className="text-[11.5px] font-medium px-2.5 py-1 rounded-full bg-[var(--bg-surface)]
                          border border-[var(--border)] text-[var(--text)] hover:border-[var(--blue)]
                          hover:bg-[var(--blue-light)] hover:text-[var(--blue-ink)] transition-colors cursor-pointer"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Grounded AI Overview + Results */}
              {effectiveQuery ? (
                <div className="space-y-3 pt-1">
                  {/* AI Overview Card */}
                  <div className="p-3.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--blue)]/25 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--blue-ink)]">
                        <Sparkles size={13} className="text-[var(--blue)]" />
                        <span>AI Overview</span>
                      </div>
                      {isSynthesizing && (
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[var(--blue-ink)]">
                          <Loader2 size={11} className="animate-spin" />
                          <span>Synthesizing…</span>
                        </span>
                      )}
                    </div>

                    <p className="text-xs sm:text-[13px] text-[var(--text)] leading-relaxed">
                      {displayResults.aiOverview}
                    </p>

                    {displayResults.interpretedIntents?.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {displayResults.interpretedIntents.map((item, idx) => (
                          <span
                            key={`${item.label}-${idx}`}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              item.kind === 'exclusion'
                                ? 'bg-[var(--red-light)] text-[var(--red-ink)] border-[var(--red)]/20'
                                : item.kind === 'modifier'
                                  ? 'bg-[var(--green-light)] text-[var(--green-ink)] border-[var(--green)]/20'
                                  : 'bg-[var(--blue-light)] text-[var(--blue-ink)] border-[var(--blue)]/20'
                            }`}
                          >
                            {item.kind === 'exclusion' && <Ban size={9} />}
                            <span>{item.label}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {displayResults.followUpSuggestions?.length > 0 && (
                      <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10.5px] font-semibold text-[var(--text-muted)]">
                          {displayResults.hasMatches ? 'Refine:' : 'Try:'}
                        </span>
                        {displayResults.followUpSuggestions.map(chip => (
                          <button
                            key={chip.label}
                            type="button"
                            onClick={() => handleSelectFollowUp(chip)}
                            className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--blue)] hover:text-[var(--blue-ink)] transition-colors cursor-pointer"
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Club Cards */}
                  {liveMatches.length > 0 && (
                    <div className="space-y-2.5">
                      <div className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
                        <Zap size={13} className="text-[var(--yellow)]" />
                        <span>Recommended Clubs ({liveMatches.length})</span>
                      </div>

                      {liveMatches.map(
                        ({
                          club,
                          matchScore,
                          matchLabel,
                          aiRationale,
                          matchedTerms,
                          nextEvent,
                        }) => {
                          const isJoined = Boolean(club.joined)
                          const eventWhen = nextEvent ? formatEventWhenLabel(nextEvent) : ''
                          const discordLink = club.discordUrl || club.discord || null

                          return (
                            <div
                              key={club.id}
                              className="p-3.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)]
                                hover:border-[var(--blue)]/50 transition-all space-y-2.5 shadow-2xs"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <ClubAvatar club={club} size={36} />
                                  <div className="min-w-0">
                                    <div className="text-[13.5px] font-bold text-[var(--text)] truncate">
                                      {cleanText(club.name)}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] truncate">
                                      <span>{club.categoryLabel || club.category}</span>
                                      <span>•</span>
                                      <span>{club.members || 0} members</span>
                                      {discordLink && (
                                        <>
                                          <span>•</span>
                                          <a
                                            href={discordLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={e => e.stopPropagation()}
                                            className="inline-flex items-center gap-1 text-[var(--blue-ink)] font-semibold hover:underline no-underline"
                                          >
                                            <PlatformIcon type="discord" size={11} />
                                            <span>Discord</span>
                                          </a>
                                        </>
                                      )}
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
                                    {matchScore}% · {matchLabel || 'Match'}
                                  </span>

                                  <button
                                    type="button"
                                    onClick={e => handleJoin(e, club)}
                                    className={`px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer border ${
                                      isJoined
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

                              <div className="px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs text-[var(--text)] leading-relaxed flex items-start gap-2">
                                <Sparkles size={13} className="text-[var(--blue)] shrink-0 mt-0.5" />
                                <span>{aiRationale}</span>
                              </div>

                              {nextEvent && (
                                <button
                                  type="button"
                                  onClick={e => handleViewEvent(e, nextEvent)}
                                  className="w-full px-2.5 py-1.5 rounded-xl bg-[var(--bg-card)] hover:bg-[var(--blue-light)] border border-[var(--border)] text-left flex items-center justify-between gap-2 transition-colors cursor-pointer"
                                >
                                  <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-[var(--text)]">
                                    <Calendar size={11} className="text-[var(--blue)] shrink-0" />
                                    <span className="font-semibold truncate">
                                      {nextEvent.event || nextEvent.title || 'Upcoming Event'}
                                    </span>
                                  </div>
                                  {eventWhen && (
                                    <span className="text-[10.5px] text-[var(--text-muted)] shrink-0">
                                      {eventWhen}
                                    </span>
                                  )}
                                </button>
                              )}

                              <div className="flex items-center justify-between text-[11px] pt-0.5">
                                <div className="flex items-center gap-1 flex-wrap">
                                  {(matchedTerms || []).map(tag => (
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
                        }
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-5 px-4 rounded-2xl bg-[var(--bg-surface)] border border-dashed border-[var(--border)] text-center space-y-1.5">
                  <div className="w-9 h-9 rounded-full bg-[var(--blue-light)] text-[var(--blue)] flex items-center justify-center mx-auto">
                    <Sparkles size={18} />
                  </div>
                  <div className="text-xs font-bold text-[var(--text)]">
                    Ask anything about UCSC clubs &amp; campus involvement
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] max-w-sm mx-auto">
                    Try multi-part prompts like &quot;beginner coding and creative clubs, no Greek life&quot; or &quot;clubs with upcoming events&quot;.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-[var(--bg-surface)] border-t border-[var(--border)] flex items-center justify-between text-xs">
              <span className="text-[11px] text-[var(--text-muted)]">
                Grounded on {clubs.length} UCSC clubs &amp; live calendar events
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
