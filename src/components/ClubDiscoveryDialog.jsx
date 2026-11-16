import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Plus, Search } from 'lucide-react'
import { Button, ClubAvatar, ModalDialog, SearchBox, cleanText } from './ui'
import { formatEventWhenLabel, recommendClubsForInterests } from '../utils/aiClubAgent'
import { getClubSearchDocument } from '../utils/search'
import { runGenerativeClubSearch } from '../api/aiClient'

const EXAMPLES = ['Cars', 'Hiking', 'Beginner coding']
const EXCERPT_LIMIT = 170

export function FindClubsButton({ onClick }) {
  return <Button variant="tonal" size="sm" icon={<Search size={15} />} aria-haspopup="dialog" onClick={onClick}>Find clubs</Button>
}

export default function ClubDiscoveryDialog({ open, onClose, clubs, events, userMajor, onViewClub, onViewEvent, onJoinClub }) {
  const [query, setQuery] = useState('')
  const [refinements, setRefinements] = useState([])
  const [assistant, setAssistant] = useState(null)
  const [joinPending, setJoinPending] = useState(new Set())
  const request = useRef(null)
  const joining = useRef(new Set())
  const input = useRef(null)
  const result = useMemo(() => recommendClubsForInterests(clubs, query, {
    events, userMajor, maxResults: 16,
  }), [clubs, events, query, userMajor])

  useEffect(() => () => request.current?.abort(), [])

  function updateQuery(next, refinement = false) {
    request.current?.abort()
    request.current = null
    setAssistant(null)
    setRefinements(prev => refinement ? [...prev, query].slice(-3) : [])
    setQuery(next)
  }

  async function askAssistant() {
    if (request.current || !result.matches.length) return
    const controller = new AbortController()
    request.current = controller
    setAssistant({ pending: true })
    const timeout = setTimeout(() => {
      if (request.current !== controller) return
      request.current = null
      controller.abort()
      setAssistant({ unavailable: true })
    }, 8000)
    try {
      const response = await runGenerativeClubSearch({
        clubs, events, query, ragResult: result, turns: [...refinements, query],
        userProfile: { major: userMajor }, signal: controller.signal,
      })
      if (request.current !== controller || controller.signal.aborted) return
      setAssistant(response?.assistantPicks?.length ? { picks: response.assistantPicks } : { unavailable: true })
    } catch {
      if (request.current === controller && !controller.signal.aborted) setAssistant({ unavailable: true })
    } finally {
      clearTimeout(timeout)
      if (request.current === controller) request.current = null
    }
  }

  async function join(club) {
    if (joining.current.has(club.id)) return
    joining.current.add(club.id)
    setJoinPending(new Set(joining.current))
    try { await onJoinClub?.(club) }
    finally {
      joining.current.delete(club.id)
      setJoinPending(new Set(joining.current))
    }
  }

  return (
    <ModalDialog open={open} onClose={onClose} title="Find clubs" maxWidth="max-w-xl">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">What are you interested in?</p>
        <SearchBox inputRef={input} initialFocus label="What are you interested in?"
          placeholder="Cars, hiking, or beginner coding" value={query}
          onChange={updateQuery} onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              onClose()
            }
          }} />
      </div>
      {!query.trim() ? (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map(example => <Button key={example} size="sm" variant="outlined-neutral" onClick={() => {
            updateQuery(example)
            input.current?.focus()
          }}>{example}</Button>)}
        </div>
      ) : (
        <>
          <p role="status" className={result.matches.length ? 'sr-only' : 'text-sm text-[var(--text-muted)] break-words'}>
            {result.matches.length
              ? `Showing ${Math.min(6, result.matches.length)} clubs for “${query.trim()}”.`
              : `No clubs match “${query.trim()}”. Try a more specific activity or a club name.`}
          </p>
          <ul className="grid gap-2 list-none">
            {result.matches.slice(0, 6).map(({ club, matchedTerms, nextEvent }) => {
              const name = cleanText(club.name)
              const doc = getClubSearchDocument(club)
              const description = doc.descriptions.find(text =>
                matchedTerms.some(term => (' ' + text.toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ').includes(' ' + term + ' '))
              ) || doc.descriptions[0] || ''
              const excerpt = cleanText(description)
              return (
                <li key={club.id} className="content-tile rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ClubAvatar club={club} size={34} />
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold break-words">{name}</h3>
                      <p className="text-xs text-[var(--text-muted)] break-words">
                        {[club.instagram ? `@${club.instagram}` : null, club.joined ? 'Member' : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                  {(excerpt || matchedTerms.length > 0) && (
                    <p className="text-sm text-[var(--text-muted)] break-words">
                      {excerpt ? (excerpt.length > EXCERPT_LIMIT ? excerpt.slice(0, EXCERPT_LIMIT).trimEnd() + '…' : excerpt)
                        : `Matches: ${matchedTerms.join(', ')}`}
                    </p>
                  )}
                  {nextEvent && onViewEvent && (
                    <Button variant="text-neutral" size="sm" onClick={() => onViewEvent(nextEvent)}>
                      {cleanText(nextEvent.event || nextEvent.title)} · {formatEventWhenLabel(nextEvent)}
                    </Button>
                  )}
                  <div className="flex flex-wrap gap-1">
                    <Button variant="text" size="sm" trailingIcon={<ArrowRight size={14} />}
                      aria-label={`View details for ${name}`} onClick={() => onViewClub(club)}>View details</Button>
                    {!club.joined && onJoinClub && (
                      <Button variant="outlined" size="sm" icon={<Plus size={14} />}
                        pending={joinPending.has(club.id)} pendingLabel="Joining…"
                        onClick={() => join(club)}>Join club</Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          {result.matches.length > 0 && (
            <div className="space-y-2">
              {(result.matches.some(match => match.club.joined) && !result.intent.excludeJoined) && (
                <Button size="sm" variant="text-neutral"
                  onClick={() => updateQuery(`${query}, exclude joined clubs`, true)}>Show clubs I haven’t joined</Button>
              )}
              <details className="text-sm text-[var(--text-muted)]">
                <summary className="ui-touch min-h-8 content-center cursor-pointer">Assistant suggestions</summary>
                <Button size="sm" variant="outlined-neutral" onClick={askAssistant}
                  pending={Boolean(assistant?.pending)} pendingLabel="Checking…">Ask for suggestions</Button>
                {assistant?.unavailable && <p role="status" className="mt-2">Assistant suggestions are unavailable. Club matches are shown above.</p>}
                {assistant?.picks && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    <p className="w-full">The assistant highlighted these catalog matches:</p>
                    {assistant.picks.map(club => (
                      <Button key={club.id} size="sm" variant="text" onClick={() => onViewClub(club)}>{cleanText(club.name)}</Button>
                    ))}
                  </div>
                )}
              </details>
            </div>
          )}
        </>
      )}
    </ModalDialog>
  )
}
