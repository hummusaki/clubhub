import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Star, X } from 'lucide-react'
import { normalizeClubKey } from '../utils/calendarSync'
import { matchesSearchQuery, parseSearchQuery } from '../utils/search'
import { ClubAvatar, cleanText } from './ui'

const clubNameCollator = new Intl.Collator(undefined, { sensitivity: 'base' })

function FavoriteButton({ club, favorite, onToggle, buttonRef }) {
  const name = cleanText(club.name)
  return (
    <button type="button" ref={buttonRef} className="task-club-star"
      aria-label={`Favorite ${name}`} aria-pressed={favorite} onClick={() => onToggle(club.id)}>
      <Star aria-hidden="true" size={18} fill={favorite ? 'currentColor' : 'none'} />
    </button>
  )
}

export default function TaskClubSwitcher({ clubs, selectedClub, favoriteClubIds, onSelect, onToggleFavorite }) {
  const panelId = useId()
  const trigger = useRef(null)
  const panel = useRef(null)
  const search = useRef(null)
  const stars = useRef(new Map())
  const refocusId = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const favorites = new Set(favoriteClubIds)
  const selectedId = normalizeClubKey(selectedClub?.id)
  const searchTerms = parseSearchQuery(query)
  const matches = clubs.filter(club => matchesSearchQuery(searchTerms, {
    primary: [cleanText(club.name)], secondary: [club.instagram, club.id],
  })).sort((a, b) => clubNameCollator.compare(a.name, b.name) || String(a.id).localeCompare(String(b.id)))
  const favoriteMatches = matches.filter(club => favorites.has(normalizeClubKey(club.id)))
  const otherMatches = matches.filter(club => !favorites.has(normalizeClubKey(club.id)))
  const firstMatch = favoriteMatches[0] || otherMatches[0]
  const singleClub = clubs.length === 1 ? clubs[0] : null

  function close(restoreFocus = true) {
    panel.current?.close()
    setOpen(false)
    setQuery('')
    if (restoreFocus) trigger.current?.focus({ preventScroll: true })
  }

  useLayoutEffect(() => {
    if (!open || !panel.current) return
    const dialog = panel.current
    const mobile = window.matchMedia('(max-width: 639px)')
    function show() {
      if (dialog.open) dialog.close()
      if (mobile.matches) dialog.showModal()
      else dialog.show()
      search.current?.focus({ preventScroll: true })
    }
    show()
    mobile.addEventListener('change', show)
    return () => {
      mobile.removeEventListener('change', show)
      if (dialog.open) dialog.close()
    }
  }, [open, singleClub])

  useEffect(() => {
    if (!open) return
    function onOutside(event) {
      if (trigger.current?.contains(event.target)) return
      const dialog = panel.current
      if (!dialog?.contains(event.target)) {
        close(false)
        return
      }
      if (event.target !== dialog) return
      const { left, right, top, bottom } = dialog.getBoundingClientRect()
      if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) close()
    }
    document.addEventListener('pointerdown', onOutside)
    return () => document.removeEventListener('pointerdown', onOutside)
  }, [open])

  useLayoutEffect(() => {
    const id = refocusId.current
    if (!id) return
    refocusId.current = null
    stars.current.get(id)?.focus()
  }, [favoriteClubIds])

  useEffect(() => {
    if (singleClub && open) close(false)
  }, [singleClub, open])

  function select(club) {
    onSelect(club.id)
    close()
  }

  function renderGroup(label, list) {
    if (!list.length) return []
    return [
      <li key={label} className="task-club-group"><h3>{label}</h3></li>,
      ...list.map(club => {
        const id = normalizeClubKey(club.id)
        const current = id === selectedId
        return (
          <li key={club.id} className="task-club-row" data-current={current || undefined}>
            <button className="task-club-option" type="button" aria-current={current || undefined}
              onClick={() => select(club)}>
              <ClubAvatar club={club} size={32} />
              <span className="wrap-anywhere min-w-0">{cleanText(club.name)}</span>
              {current && <Check size={17} aria-hidden="true" className="ml-auto shrink-0" />}
            </button>
            <FavoriteButton club={club} favorite={favorites.has(id)}
              buttonRef={element => { if (element) stars.current.set(id, element); else stars.current.delete(id) }}
              onToggle={clubId => {
                refocusId.current = id
                onToggleFavorite(clubId)
              }} />
          </li>
        )
      }),
    ]
  }

  if (singleClub) {
    return (
      <div className="task-club-trigger">
        <ClubAvatar club={singleClub} size={34} />
        <span className="text-sm font-semibold wrap-anywhere">{cleanText(singleClub.name)}</span>
        <FavoriteButton club={singleClub} favorite={favorites.has(normalizeClubKey(singleClub.id))} onToggle={onToggleFavorite} />
      </div>
    )
  }

  return (
    <div className="task-switcher">
      <button type="button" ref={trigger} className="task-club-trigger"
        aria-expanded={open} aria-haspopup="dialog" aria-controls={panelId}
        onClick={() => open ? close() : setOpen(true)}>
        <ClubAvatar club={selectedClub} size={34} />
        <span className="text-left min-w-0">
          <span className="block text-xs font-medium">Switch club</span>
          <span className="block text-sm font-semibold wrap-anywhere">{cleanText(selectedClub?.name || 'Choose a club')}</span>
        </span>
        <ChevronsUpDown size={17} aria-hidden="true" className="ml-auto shrink-0" />
      </button>
      <dialog id={panelId} ref={panel} className="task-switcher-panel" aria-label="Switch club"
        onCancel={event => { event.preventDefault(); close() }}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault()
            close()
          }
        }}>
        <div className="task-switcher-content">
          <form className="task-switcher-search" onSubmit={event => {
            event.preventDefault()
            if (firstMatch) select(firstMatch)
          }}>
            <input ref={search} type="search" aria-label="Search clubs" placeholder="Search clubs…"
              autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} />
            <button type="button" className="task-club-star" aria-label="Close switcher" onClick={() => close()}>
              <X size={18} aria-hidden="true" />
            </button>
          </form>
          {firstMatch ? (
            <ul className="task-club-list">
              {[...renderGroup('Favorites', favoriteMatches), ...renderGroup('Other clubs', otherMatches)]}
            </ul>
          ) : <p className="p-3 text-sm text-[var(--text-muted)]" role="status">No clubs match your search.</p>}
        </div>
      </dialog>
    </div>
  )
}
