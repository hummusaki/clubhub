import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Sparkles,
  X,
  ArrowRight,
  CornerDownLeft,
  Check,
  Plus,
  Compass,
  Tag,
  Zap,
  Calendar,
  KeyRound,
  Loader2,
  RotateCcw,
  Ban,
} from 'lucide-react'
import {
  Card,
  ClubAvatar,
  BubbleTag,
  Button,
  IconButton,
  FilterChip,
} from './ui'
import {
  recommendClubsForInterests,
  buildConversationalQuery,
  formatEventWhenLabel,
  SAMPLE_INTEREST_PROMPTS,
} from '../utils/aiClubAgent'
import {
  getAiCapabilities,
  getStoredGeminiKey,
  hasEnvGeminiKey,
  saveStoredGeminiKey,
  runGenerativeClubSearch,
} from '../api/aiClient'

export default function AiOverviewSearchBar({
  open,
  onClose,
  query: controlledQuery,
  onChangeQuery,
  clubs = [],
  events = [],
  userSettings = {},
  onToggleJoinClub,
  onOpenClub,
  onOpenCalendar,
  onNotify,
  placeholder = 'Ask AI about clubs, majors, or vibes…',
}) {
  const [draftInput, setDraftInput] = useState(controlledQuery || '')
  const [committedTurns, setCommittedTurns] = useState([])
  const [showPrompts, setShowPrompts] = useState(false)
  const [showKeyConfig, setShowKeyConfig] = useState(false)
  const [apiKeyDraft, setApiKeyDraft] = useState(() => getStoredGeminiKey())
  const [aiCaps, setAiCaps] = useState({
    generativeEnabled: Boolean(getStoredGeminiKey()),
    serverConfigured: false,
    hasClientKey: Boolean(getStoredGeminiKey()),
    model: 'gemini-4-hydrogen',
  })
  const [llmResults, setLlmResults] = useState(null)
  const [isSynthesizing, setIsSynthesizing] = useState(false)
  const [lastInteractionId, setLastInteractionId] = useState('')

  const inputRef = useRef(null)

  const isControlled = controlledQuery !== undefined && typeof onChangeQuery === 'function'
  const currentDraft = isControlled ? controlledQuery : draftInput

  function updateDraft(nextValue) {
    if (isControlled) {
      onChangeQuery(nextValue)
    } else {
      setDraftInput(nextValue)
    }
  }

  useEffect(() => {
    let active = true
    getAiCapabilities().then(caps => {
      if (active) setAiCaps(caps)
    })
    return () => {
      active = false
    }
  }, [])

  const activeTurns = useMemo(() => {
    const trimmedDraft = String(currentDraft || '').trim()
    if (committedTurns.length > 0) {
      return trimmedDraft ? [...committedTurns, trimmedDraft] : committedTurns
    }
    return trimmedDraft ? [trimmedDraft] : []
  }, [committedTurns, currentDraft])

  const effectiveQuery = useMemo(
    () => buildConversationalQuery(activeTurns),
    [activeTurns]
  )

  const hasActiveSearch = Boolean(effectiveQuery)
  const isExpanded = showPrompts || hasActiveSearch || showKeyConfig

  const ragResults = useMemo(() => {
    return recommendClubsForInterests(clubs, effectiveQuery, {
      maxResults: 6,
      events,
      userMajor: userSettings?.major || '',
    })
  }, [clubs, events, effectiveQuery, userSettings?.major])

  useEffect(() => {
    if (!effectiveQuery || !aiCaps.generativeEnabled) {
      setLlmResults(null)
      setIsSynthesizing(false)
      return
    }

    const controller = new AbortController()
    setIsSynthesizing(true)

    const debounceMs = currentDraft.trim() ? 580 : 80
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
          if (upgraded.interactionId) {
            setLastInteractionId(upgraded.interactionId)
          }
        }
        setIsSynthesizing(false)
      }
    }, debounceMs)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [
    effectiveQuery,
    aiCaps.generativeEnabled,
    clubs,
    events,
    activeTurns,
    ragResults,
    userSettings?.major,
    userSettings?.year,
    currentDraft,
    lastInteractionId,
  ])

  const displayResults =
    llmResults && llmResults.forQuery === effectiveQuery ? llmResults.data : ragResults

  const liveMatches = useMemo(() => {
    const clubsById = new Map(clubs.map(c => [String(c.id), c]))
    return (displayResults.matches || []).map(item => ({
      ...item,
      club: clubsById.get(String(item.club.id)) || item.club,
    }))
  }, [displayResults.matches, clubs])

  function handleSubmitPrompt(e) {
    if (e) e.preventDefault()
    const trimmed = String(currentDraft || '').trim()
    if (!trimmed) {
      setShowPrompts(true)
      return
    }
    setCommittedTurns(prev => [...prev, trimmed])
    updateDraft('')
    setShowPrompts(true)
  }

  function handleSelectStarterPrompt(promptQuery) {
    setCommittedTurns([promptQuery])
    updateDraft('')
    setLastInteractionId('')
    setShowPrompts(true)
  }

  function handleSelectFollowUp(chip) {
    if (chip.replaceQuery) {
      setCommittedTurns([chip.replaceQuery])
      updateDraft('')
      setLastInteractionId('')
    } else if (chip.appendQuery) {
      const base =
        committedTurns.length > 0
          ? committedTurns
          : currentDraft.trim()
            ? [currentDraft.trim()]
            : []
      setCommittedTurns([...base, chip.appendQuery])
      updateDraft('')
    }
    setShowPrompts(true)
  }

  function handleRemoveTurn(idx) {
    setCommittedTurns(prev => prev.filter((_, i) => i !== idx))
  }

  function handleResetConversation() {
    setCommittedTurns([])
    updateDraft('')
    setLlmResults(null)
    setLastInteractionId('')
    if (inputRef.current) inputRef.current.focus()
  }

  function handleSaveApiKey(e) {
    e.preventDefault()
    const saved = saveStoredGeminiKey(apiKeyDraft)
    setAiCaps(prev => ({
      ...prev,
      hasClientKey: Boolean(saved),
      generativeEnabled: Boolean(prev.serverConfigured || saved),
    }))
    setShowKeyConfig(false)
    if (onNotify) {
      onNotify(
        saved
          ? 'Gemini 4 API key saved locally for live AI Search synthesis.'
          : 'Cleared custom Gemini API key. Using Hybrid Semantic AI.',
        { type: saved ? 'success' : 'info' }
      )
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

  function handleViewEvent(e, ev) {
    e.stopPropagation()
    setShowPrompts(false)
    if (onOpenCalendar) {
      onOpenCalendar({ view: 'month', searchQuery: ev.event || ev.title || '' })
    }
  }

  const dynamicPlaceholder =
    committedTurns.length > 0 ? 'Ask a follow-up to refine results…' : placeholder

  return (
    <div id="overview-ai" hidden={!open} onKeyDown={event => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }}>
      <Card
        delay={1}
        className="section-pad space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-medium">AI club discovery</h2>
          <IconButton size="sm" ariaLabel="Close AI discovery" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="space-y-2">
          {/* Google Search AI Pill Form */}
          <form
            onSubmit={handleSubmitPrompt}
            className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full min-w-0"
          >
            <div
              className={`flex items-center gap-2 pl-4 pr-1.5 h-11 rounded-full transition-all duration-150 w-full min-w-0 ${
                isExpanded
                  ? 'bg-[var(--bg-card)] border border-[var(--blue)] ring-1 ring-[var(--blue)] shadow-[var(--shadow-xs)]'
                  : 'bg-[var(--md-surface-container)] border border-transparent hover:bg-[var(--md-surface-container-high)]'
              }`}
            >
              <Sparkles size={16} className="text-[var(--blue)] shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={currentDraft}
                onChange={e => updateDraft(e.target.value)}
                placeholder={dynamicPlaceholder}
                aria-label="Ask AI about campus clubs, majors, or upcoming events"
                className="border-none outline-none focus-visible:shadow-none bg-transparent text-[var(--text)] text-base sm:text-sm w-full min-w-0 placeholder:text-[var(--text-muted)] font-normal"
              />

            </div>
            {currentDraft && (
              <div className="flex items-center gap-1">
                <IconButton size="sm" ariaLabel="Clear input" onClick={() => {
                  updateDraft('')
                  inputRef.current?.focus()
                }}>
                  <X size={15} />
                </IconButton>
                <Button type="submit" size="sm" trailingIcon={<CornerDownLeft size={12} />}>
                  {committedTurns.length > 0 ? 'Refine search' : 'Ask AI'}
                </Button>
              </div>
            )}
          </form>
          <div className="flex items-center justify-between gap-2">
            <Button variant="text" size="sm" icon={<Compass size={14} />}
              aria-expanded={showPrompts} aria-controls="overview-ai-prompts"
              onClick={() => setShowPrompts(prev => !prev)}>
              Example prompts
            </Button>
            <IconButton size="sm" selected={aiCaps.generativeEnabled}
              title="Configure Gemini API key" ariaLabel="Configure Gemini API key"
              aria-expanded={showKeyConfig} aria-controls="overview-ai-config"
              onClick={() => setShowKeyConfig(prev => !prev)}>
              <KeyRound size={14} />
            </IconButton>
          </div>
        </div>

        {/* ── Optional Gemini 4 API Key Configuration Drawer ── */}
          <form
            hidden={!showKeyConfig}
            id="overview-ai-config"
            onSubmit={handleSaveApiKey}
            className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] space-y-3 fade-in"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-[var(--text)] flex items-center gap-1.5">
                <KeyRound size={14} className="text-[var(--blue)]" />
                <span>Gemini 4 Live AI Synthesis (Optional)</span>
              </div>
              <span className="text-xs text-[var(--text-muted)]">
                {aiCaps.serverConfigured
                  ? 'Active on server'
                  : hasEnvGeminiKey()
                    ? 'Active via VITE_GEMINI_API_KEY'
                    : aiCaps.hasClientKey
                      ? 'Saved in browser'
                      : 'Using built-in Hybrid AI'}
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              AI Search works immediately offline using UCSC Hybrid Semantic RAG. Paste a Google AI Studio{' '}
              <code className="px-1.5 py-0.5 rounded bg-[var(--bg-card)] text-[11px]">GEMINI_API_KEY</code>{' '}
              (or set it in <code className="px-1.5 py-0.5 rounded bg-[var(--bg-card)] text-[11px]">.env</code>)
              to upgrade overviews with live <strong>Gemini 4 Hydrogen</strong> reasoning.
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="password"
                value={apiKeyDraft}
                onChange={e => setApiKeyDraft(e.target.value)}
                placeholder="AIzaSy... (stored only in your browser localStorage)"
                disabled={hasEnvGeminiKey()}
                className="flex-1 h-10 px-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--md-outline)] text-xs text-[var(--text)] outline-none focus:border-[var(--blue)] focus:ring-1 focus:ring-[var(--blue)]"
              />
              <div className="flex items-center gap-2 shrink-0">
                {apiKeyDraft && !hasEnvGeminiKey() && (
                  <Button
                    variant="outlined-neutral"
                    size="sm"
                    onClick={() => {
                      setApiKeyDraft('')
                      saveStoredGeminiKey('')
                      setAiCaps(prev => ({
                        ...prev,
                        hasClientKey: false,
                        generativeEnabled: Boolean(prev.serverConfigured),
                      }))
                    }}
                  >
                    Clear
                  </Button>
                )}
                <Button type="submit" variant="filled" size="sm">
                  Save
                </Button>
              </div>
            </div>
          </form>

        <div id="overview-ai-prompts" hidden={!showPrompts}>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_INTEREST_PROMPTS.map(prompt => (
              <FilterChip key={prompt.label} label={prompt.label}
                onClick={() => handleSelectStarterPrompt(prompt.query)} />
            ))}
          </div>
        </div>

        {hasActiveSearch && (
          <div className="pt-3 border-t border-[var(--border)] space-y-3 fade-in">
              <div className="space-y-3.5">
                <div className="p-4 sm:p-5 rounded-2xl bg-[var(--md-surface-container)] border border-[var(--border)] space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-sm font-display font-medium text-[var(--text)]">
                      <Sparkles size={16} className="text-[var(--blue)]" />
                      <span>AI Overview</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isSynthesizing ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 h-6 rounded-full text-xs font-medium bg-[var(--secondary-container)] text-[var(--on-secondary-container)]">
                          <Loader2 size={12} className="animate-spin" />
                          <span>Synthesizing with Gemini 4…</span>
                        </span>
                      ) : displayResults.mode === 'gemini-4' ? (
                        <BubbleTag label="Gemini 4 Grounded" color="green" size="sm" dot />
                      ) : (
                        <BubbleTag label="Hybrid Semantic RAG" color="blue" size="sm" />
                      )}

                      {committedTurns.length === 0 && (
                        <Button
                          variant="text-neutral"
                          size="sm"
                          onClick={handleResetConversation}
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-[var(--text)] leading-relaxed">
                    {displayResults.aiOverview}
                  </p>

                  {displayResults.interpretedIntents?.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      {displayResults.interpretedIntents.map((item, i) => {
                        const isExclusion = item.kind === 'exclusion'
                        const isModifier = item.kind === 'modifier'
                        return (
                          <span
                            key={`${item.label}-${i}`}
                            className={`inline-flex items-center gap-1 px-2.5 h-6 rounded-full text-xs font-medium ${
                              isExclusion
                                ? 'bg-[var(--red-light)] text-[var(--red-ink)]'
                                : isModifier
                                  ? 'bg-[var(--green-light)] text-[var(--green-ink)]'
                                  : 'bg-[var(--blue-light)] text-[var(--blue-ink)]'
                            }`}
                          >
                            {isExclusion && <Ban size={11} />}
                            <span>{item.label}</span>
                          </span>
                        )
                      })}
                    </div>
                  )}

                  {displayResults.followUpSuggestions?.length > 0 && (
                    <div className="pt-2.5 border-t border-[var(--border)] flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-[var(--text-muted)]">
                        {displayResults.hasMatches ? 'Ask a follow-up:' : 'Try:'}
                      </span>
                      {displayResults.followUpSuggestions.map(chip => (
                        <FilterChip
                          key={chip.label}
                          label={chip.label}
                          onClick={() => handleSelectFollowUp(chip)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* 4. Grounded Club Match Cards */}
                {liveMatches.length > 0 && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-display font-medium text-[var(--text)] flex items-center gap-1.5">
                        <Zap size={14} className="text-[var(--yellow)]" />
                        <span>Top club matches ({liveMatches.length})</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

                          return (
                            <div
                              key={club.id}
                              className="p-4 rounded-2xl content-tile flex flex-col justify-between gap-3"
                            >
                              <div className="space-y-2.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <ClubAvatar club={club} size={38} />
                                    <div className="min-w-0">
                                      <div className="text-sm font-medium text-[var(--text)] truncate">
                                        {club.name}
                                      </div>
                                      <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] truncate">
                                        <span>{club.categoryLabel || club.category}</span>
                                        <span>·</span>
                                        <span>{club.members || 0} members</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <BubbleTag
                                      label={`${matchScore}% · ${matchLabel || 'Match'}`}
                                      color={matchScore >= 80 ? 'green' : 'blue'}
                                      size="sm"
                                    />

                                    <Button
                                      size="sm"
                                      variant={isJoined ? 'outlined' : 'tonal'}
                                      icon={isJoined ? <Check size={13} /> : <Plus size={13} />}
                                      onClick={e => handleJoinClick(e, club)}
                                    >
                                      {isJoined ? 'Joined' : 'Join'}
                                    </Button>
                                  </div>
                                </div>

                                <div className="px-3 py-2 rounded-xl bg-[var(--bg-surface)] text-xs text-[var(--text)] leading-relaxed flex items-start gap-2">
                                  <Sparkles size={13} className="text-[var(--blue)] shrink-0 mt-0.5" />
                                  <span>{aiRationale}</span>
                                </div>

                                {nextEvent && (
                                  <button
                                    type="button"
                                    onClick={e => handleViewEvent(e, nextEvent)}
                                    className="md-state-layer w-full px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--blue)] text-left flex items-center justify-between gap-2 transition-colors cursor-pointer"
                                  >
                                    <div className="flex items-center gap-2 min-w-0 text-xs text-[var(--text)]">
                                      <Calendar size={13} className="text-[var(--blue)] shrink-0" />
                                      <span className="font-medium truncate">
                                        {nextEvent.event || nextEvent.title || 'Upcoming Event'}
                                      </span>
                                    </div>
                                    {eventWhen && (
                                      <span className="text-xs text-[var(--text-muted)] shrink-0">
                                        {eventWhen}
                                      </span>
                                    )}
                                  </button>
                                )}
                              </div>

                              <div className="flex items-center justify-between text-xs pt-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {(matchedTerms || []).map(term => (
                                    <span
                                      key={term}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg-surface)] text-[11px] text-[var(--text-muted)] font-medium"
                                    >
                                      <Tag size={10} />
                                      <span>{term}</span>
                                    </span>
                                  ))}
                                </div>

                                <Button
                                  variant="text"
                                  size="sm"
                                  trailingIcon={<ArrowRight size={13} />}
                                  onClick={() => handleViewClub(club)}
                                >
                                  View details
                                </Button>
                              </div>
                            </div>
                          )
                        }
                      )}
                    </div>
                  </div>
                )}

                {/* 5. Related Upcoming Events Strip */}
                {displayResults.relatedEvents?.length > 0 && (
                  <div className="pt-3 border-t border-[var(--border)] space-y-2">
                    <div className="text-xs font-medium text-[var(--text-muted)] flex items-center gap-1.5">
                      <Calendar size={13} className="text-[var(--blue)]" />
                      <span>Related upcoming campus events</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {displayResults.relatedEvents.slice(0, 4).map(ev => {
                        const whenStr = formatEventWhenLabel(ev)
                        return (
                          <button
                            key={ev.id || `${ev.clubId}-${ev.title}`}
                            type="button"
                            onClick={e => handleViewEvent(e, ev)}
                            className="md-state-layer p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--blue)] text-left flex items-center justify-between gap-2 transition-colors cursor-pointer"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-[var(--text)] truncate">
                                {ev.event || ev.title || 'Club Event'}
                              </div>
                              <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                                {ev.club || ev.clubName}
                                {whenStr ? ` · ${whenStr}` : ''}
                              </div>
                            </div>
                            <ArrowRight size={14} className="text-[var(--blue)] shrink-0" />
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
          </div>
        )}
      </Card>
    </div>
  )
}
