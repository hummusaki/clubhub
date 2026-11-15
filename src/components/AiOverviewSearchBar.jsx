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
  ChevronUp,
  Calendar,
  KeyRound,
  Loader2,
  RotateCcw,
  Ban,
} from 'lucide-react'
import { Card, IconBadge, ClubAvatar, BubbleTag } from './ui'
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

  const containerRef = useRef(null)
  const inputRef = useRef(null)

  const isCompact = Boolean(userSettings?.compactCards)
  const isControlled = controlledQuery !== undefined && typeof onChangeQuery === 'function'
  const currentDraft = isControlled ? controlledQuery : draftInput

  function updateDraft(nextValue) {
    if (isControlled) {
      onChangeQuery(nextValue)
    } else {
      setDraftInput(nextValue)
    }
  }

  // Probe server/client Gemini 4 capability once on mount
  useEffect(() => {
    let active = true
    getAiCapabilities().then(caps => {
      if (active) setAiCaps(caps)
    })
    return () => {
      active = false
    }
  }, [])

  // Effective multi-turn conversational query combines committed turns + live draft
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

  // Instant Hybrid Semantic RAG + Intent/Negation/Event grounding (<2ms)
  const ragResults = useMemo(() => {
    return recommendClubsForInterests(clubs, effectiveQuery, {
      maxResults: 6,
      events,
      userMajor: userSettings?.major || '',
    })
  }, [clubs, events, effectiveQuery, userSettings?.major])

  // Upgrade with live Gemini 4 (`gemini-4-hydrogen`) synthesis when configured
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

  // Keep `club.joined` reactive even when displaying cached Gemini 4 recommendations
  const liveMatches = useMemo(() => {
    const clubsById = new Map(clubs.map(c => [String(c.id), c]))
    return (displayResults.matches || []).map(item => ({
      ...item,
      club: clubsById.get(String(item.club.id)) || item.club,
    }))
  }, [displayResults.matches, clubs])

  // Dismiss expanded prompt tray on outside click (only when no active query) or Escape
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowPrompts(false)
        setShowKeyConfig(false)
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setShowPrompts(false)
        setShowKeyConfig(false)
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
    <div ref={containerRef}>
      <Card
        delay={1}
        style={{
          borderLeftWidth: '3.5px',
          borderLeftColor: 'var(--blue)',
        }}
        className={isCompact ? 'p-3 sm:p-4 space-y-3' : 'p-4 sm:p-5 space-y-3.5'}
      >
        {/* ── Top Row: AI Search Identity + Conversational Input Bar ── */}
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
                  AI Club Search &amp; Advisor
                </h2>
                <BubbleTag
                  label={aiCaps.generativeEnabled ? 'Gemini 4' : 'AI Search'}
                  color="blue"
                  size="sm"
                  dot
                />
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Ask in natural language — combine interests, exclusions, or upcoming events
              </p>
            </div>
          </div>

          {/* Dedicated Conversational AI Search Form */}
          <form
            onSubmit={handleSubmitPrompt}
            className="flex items-center gap-2 w-full lg:flex-1 lg:max-w-[560px] min-w-0"
          >
            <div
              className={`flex items-center gap-2 px-3 sm:px-3.5 min-h-[42px] rounded-xl bg-[var(--bg-tile)]
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
                value={currentDraft}
                onFocus={() => setShowPrompts(true)}
                onClick={() => setShowPrompts(true)}
                onChange={e => {
                  updateDraft(e.target.value)
                  setShowPrompts(true)
                }}
                placeholder={dynamicPlaceholder}
                aria-label="Ask AI about campus clubs, majors, or upcoming events"
                className="border-none outline-none focus-visible:shadow-none bg-transparent text-[var(--text)] text-base sm:text-sm w-full min-w-0
                  placeholder:text-[var(--text-light)] font-normal"
              />

              {currentDraft ? (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      updateDraft('')
                      if (inputRef.current) inputRef.current.focus()
                    }}
                    className="text-[var(--text-light)] hover:text-[var(--text)] p-1 cursor-pointer bg-transparent border-none flex items-center"
                    aria-label="Clear input"
                  >
                    <X size={14} />
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--blue)] hover:opacity-90 border-none text-white text-[11px] font-semibold cursor-pointer shadow-2xs transition-opacity"
                  >
                    <span>{committedTurns.length > 0 ? 'Refine' : 'Ask'}</span>
                    <CornerDownLeft size={11} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowPrompts(prev => !prev)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer transition-colors"
                  >
                    <Compass size={12} className="text-[var(--blue)]" />
                    <span className="hidden sm:inline">{showPrompts ? 'Hide' : 'Prompts'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowKeyConfig(prev => !prev)}
                    title={
                      aiCaps.generativeEnabled
                        ? 'Gemini 4 live synthesis enabled'
                        : 'Optional: Connect Gemini 4 API key for live LLM synthesis'
                    }
                    aria-label="Configure Gemini API key"
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border cursor-pointer transition-colors ${
                      aiCaps.generativeEnabled
                        ? 'bg-[var(--green-light)] border-[var(--green)]/30 text-[var(--green-ink)]'
                        : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    <KeyRound size={12} />
                  </button>
                </div>
              )}
            </div>
          </form>
        </div>

        {/* ── Optional Gemini 4 API Key Configuration Drawer ── */}
        {showKeyConfig && (
          <form
            onSubmit={handleSaveApiKey}
            className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] space-y-2 fade-in"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
                <KeyRound size={13} className="text-[var(--blue)]" />
                <span>Gemini 4 Live AI Synthesis (Optional)</span>
              </div>
              <span className="text-[11px] text-[var(--text-muted)]">
                {aiCaps.serverConfigured
                  ? 'Active on server'
                  : hasEnvGeminiKey()
                    ? 'Active via VITE_GEMINI_API_KEY'
                    : aiCaps.hasClientKey
                      ? 'Saved in browser'
                      : 'Using built-in Hybrid AI'}
              </span>
            </div>
            <p className="text-[11.5px] text-[var(--text-muted)] leading-relaxed">
              AI Search works immediately offline using UCSC Hybrid Semantic RAG. Paste a Google AI Studio{' '}
              <code className="px-1 py-0.5 rounded bg-[var(--bg-card)] text-[10.5px]">GEMINI_API_KEY</code>{' '}
              (or set it in <code className="px-1 py-0.5 rounded bg-[var(--bg-card)] text-[10.5px]">.env</code>)
              to upgrade overviews with live <strong>Gemini 4 Hydrogen</strong> reasoning.
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="password"
                value={apiKeyDraft}
                onChange={e => setApiKeyDraft(e.target.value)}
                placeholder="AIzaSy... (stored only in your browser localStorage)"
                disabled={hasEnvGeminiKey()}
                className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-xs text-[var(--text)] outline-none focus:border-[var(--blue)]"
              />
              <div className="flex items-center gap-1.5 shrink-0">
                {apiKeyDraft && !hasEnvGeminiKey() && (
                  <button
                    type="button"
                    onClick={() => {
                      setApiKeyDraft('')
                      saveStoredGeminiKey('')
                      setAiCaps(prev => ({
                        ...prev,
                        hasClientKey: false,
                        generativeEnabled: Boolean(prev.serverConfigured),
                      }))
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-[var(--blue)] text-white border-none text-xs font-semibold cursor-pointer hover:opacity-90"
                >
                  Save
                </button>
              </div>
            </div>
          </form>
        )}

        {/* ── Expandable Starter Prompts, AI Overview & Recommendations ── */}
        {isExpanded && (
          <div className="pt-3 border-t border-[var(--border)] space-y-3.5 fade-in">
            {/* 1. Starter Prompts (shown when no search is active, or collapsible) */}
            {!hasActiveSearch && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                    <Compass size={12} className="text-[var(--blue)]" />
                    <span>Try a Natural-Language Prompt</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPrompts(false)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] bg-transparent border-none cursor-pointer p-0"
                  >
                    <span>Collapse</span>
                    <ChevronUp size={13} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {SAMPLE_INTEREST_PROMPTS.map(p => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => handleSelectStarterPrompt(p.query)}
                      className="text-xs font-medium px-2.5 py-1 rounded-full border transition-colors cursor-pointer bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text)] hover:border-[var(--blue)] hover:bg-[var(--blue-light)] hover:text-[var(--blue-ink)]"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 2. Multi-Turn Conversation Breadcrumbs */}
            {committedTurns.length > 0 && (
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mr-0.5">
                    Context:
                  </span>
                  {committedTurns.map((turn, idx) => (
                    <span
                      key={`${turn}-${idx}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text)] max-w-full"
                    >
                      <span className="truncate max-w-[240px] sm:max-w-[340px]">
                        {idx > 0 ? `+ ${turn}` : turn}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTurn(idx)}
                        aria-label={`Remove refinement: ${turn}`}
                        className="text-[var(--text-light)] hover:text-[var(--text)] bg-transparent border-none p-0 cursor-pointer flex items-center shrink-0"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleResetConversation}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer p-0 shrink-0"
                >
                  <RotateCcw size={12} />
                  <span>New search</span>
                </button>
              </div>
            )}

            {/* 3. Grounded AI Overview Box + Interpreted Intents + Follow-up Refinements */}
            {hasActiveSearch && (
              <div className="space-y-3">
                <div className="p-3.5 sm:p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--blue)]/25 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--blue-ink)]">
                      <Sparkles size={14} className="text-[var(--blue)]" />
                      <span>AI Overview</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isSynthesizing ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[var(--blue-light)] text-[var(--blue-ink)]">
                          <Loader2 size={11} className="animate-spin" />
                          <span>Synthesizing with Gemini 4…</span>
                        </span>
                      ) : displayResults.mode === 'gemini-4' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[var(--green-light)] text-[var(--green-ink)]">
                          <Sparkles size={10} />
                          <span>Gemini 4 Grounded</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                          <span>Hybrid Semantic RAG</span>
                        </span>
                      )}

                      {committedTurns.length === 0 && (
                        <button
                          type="button"
                          onClick={handleResetConversation}
                          className="text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] bg-transparent border-none cursor-pointer p-0"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Synthesized Natural-Language Overview */}
                  <p className="text-[13px] sm:text-[13.5px] text-[var(--text)] leading-relaxed">
                    {displayResults.aiOverview}
                  </p>

                  {/* Parsed Intent & Exclusion Badges */}
                  {displayResults.interpretedIntents?.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      {displayResults.interpretedIntents.map((item, i) => {
                        const isExclusion = item.kind === 'exclusion'
                        const isModifier = item.kind === 'modifier'
                        return (
                          <span
                            key={`${item.label}-${i}`}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold border ${
                              isExclusion
                                ? 'bg-[var(--red-light)] text-[var(--red-ink)] border-[var(--red)]/20'
                                : isModifier
                                  ? 'bg-[var(--green-light)] text-[var(--green-ink)] border-[var(--green)]/20'
                                  : 'bg-[var(--blue-light)] text-[var(--blue-ink)] border-[var(--blue)]/20'
                            }`}
                          >
                            {isExclusion && <Ban size={10} />}
                            <span>{item.label}</span>
                          </span>
                        )
                      })}
                    </div>
                  )}

                  {/* Contextual Follow-Up Chips */}
                  {displayResults.followUpSuggestions?.length > 0 && (
                    <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-semibold text-[var(--text-muted)] mr-0.5">
                        {displayResults.hasMatches ? 'Refine:' : 'Try:'}
                      </span>
                      {displayResults.followUpSuggestions.map(chip => (
                        <button
                          key={chip.label}
                          type="button"
                          onClick={() => handleSelectFollowUp(chip)}
                          className="text-[11.5px] font-medium px-2.5 py-1 rounded-full bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--blue)] hover:bg-[var(--blue-light)] hover:text-[var(--blue-ink)] transition-colors cursor-pointer"
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 4. Grounded Club Match Cards */}
                {liveMatches.length > 0 && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
                        <Zap size={13} className="text-[var(--yellow)]" />
                        <span>Top Club Matches ({liveMatches.length})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowPrompts(false)
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] bg-transparent border-none cursor-pointer p-0"
                      >
                        <span>Minimize</span>
                        <ChevronUp size={13} />
                      </button>
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
                              className="p-3.5 rounded-2xl content-tile flex flex-col justify-between gap-2.5"
                            >
                              <div className="space-y-2.5">
                                {/* Club Header + Calibrated Score + Join */}
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
                                      {matchScore}% · {matchLabel || 'Match'}
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

                                {/* Grounded AI Rationale */}
                                <div className="px-2.5 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[11.5px] text-[var(--text)] leading-relaxed flex items-start gap-1.5">
                                  <Sparkles size={12} className="text-[var(--blue)] shrink-0 mt-0.5" />
                                  <span>{aiRationale}</span>
                                </div>

                                {/* Upcoming Event Callout on Matched Club */}
                                {nextEvent && (
                                  <button
                                    type="button"
                                    onClick={e => handleViewEvent(e, nextEvent)}
                                    className="w-full px-2.5 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--blue-light)] border border-[var(--border)] hover:border-[var(--blue)]/40 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer"
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-[var(--text)]">
                                      <Calendar size={11} className="text-[var(--blue)] shrink-0" />
                                      <span className="font-semibold truncate">
                                        {nextEvent.event || nextEvent.title || 'Upcoming Event'}
                                      </span>
                                    </div>
                                    {eventWhen && (
                                      <span className="text-[10.5px] font-medium text-[var(--text-muted)] shrink-0">
                                        {eventWhen}
                                      </span>
                                    )}
                                  </button>
                                )}
                              </div>

                              {/* Matched Concept Tags & View Details */}
                              <div className="flex items-center justify-between text-[11px] pt-0.5">
                                <div className="flex items-center gap-1 flex-wrap">
                                  {(matchedTerms || []).map(term => (
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
                        }
                      )}
                    </div>
                  </div>
                )}

                {/* 5. Related Upcoming Events Strip */}
                {displayResults.relatedEvents?.length > 0 && (
                  <div className="pt-2.5 border-t border-[var(--border-subtle)] space-y-2">
                    <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar size={12} className="text-[var(--blue)]" />
                      <span>Related Upcoming Campus Events</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {displayResults.relatedEvents.slice(0, 4).map(ev => {
                        const whenStr = formatEventWhenLabel(ev)
                        return (
                          <button
                            key={ev.id || `${ev.clubId}-${ev.title}`}
                            type="button"
                            onClick={e => handleViewEvent(e, ev)}
                            className="p-2.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--blue-light)] border border-[var(--border)] hover:border-[var(--blue)]/40 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-[var(--text)] truncate">
                                {ev.event || ev.title || 'Club Event'}
                              </div>
                              <div className="text-[11px] text-[var(--text-muted)] truncate">
                                {ev.club || ev.clubName}
                                {whenStr ? ` · ${whenStr}` : ''}
                              </div>
                            </div>
                            <ArrowRight size={12} className="text-[var(--blue)] shrink-0" />
                          </button>
                        )
                      })}
                    </div>
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
