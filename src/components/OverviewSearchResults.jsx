import { useMemo } from 'react'
import {
  Search,
  X,
  ArrowRight,
  Calendar,
  ExternalLink,
  Check,
  Plus,
  MapPin,
} from 'lucide-react'
import { Card, ClubAvatar, BubbleTag, IconBadge, cleanText } from './ui'
import { filterAndRankBySearch } from '../utils/search'

export default function OverviewSearchResults({
  query = '',
  onClearQuery,
  clubs = [],
  events = [],
  announcements = [],
  links = [],
  userSettings = {},
  onToggleJoinClub,
  onNav,
  onNotify,
}) {
  const isCompact = Boolean(userSettings?.compactCards)
  const trimmedQuery = query.trim()

  const matchedClubs = useMemo(
    () =>
      filterAndRankBySearch(clubs, trimmedQuery, c => ({
        primary: [c.name, c.abbr, ...(c.alsoKnownAs || [])],
        secondary: [c.instagram, c.id, c.categoryLabel, ...(c.tags || []).map(t => t.label)],
        tertiary: [c.description, c.directoryDescription, c.email, c.schedule],
      })),
    [clubs, trimmedQuery]
  )

  const matchedEvents = useMemo(
    () =>
      filterAndRankBySearch(events, trimmedQuery, ev => ({
        primary: [ev.event, ev.title],
        secondary: [ev.club, ev.location, ev.dateLabel, ev.time],
        tertiary: [ev.description, ev.notes, ev.source],
      })),
    [events, trimmedQuery]
  )

  const matchedLinks = useMemo(
    () =>
      filterAndRankBySearch(links, trimmedQuery, l => ({
        primary: [l.rawLabel, l.title],
        secondary: [l.clubName, l.category, l.kind],
        tertiary: [l.url, l.subtitle],
      })),
    [links, trimmedQuery]
  )

  const matchedAnnouncements = useMemo(
    () =>
      filterAndRankBySearch(announcements, trimmedQuery, a => ({
        primary: [a.title],
        secondary: [a.club, a.type, a.source],
        tertiary: [a.description],
      })),
    [announcements, trimmedQuery]
  )

  if (!trimmedQuery) return null

  const totalMatches =
    matchedClubs.length +
    matchedEvents.length +
    matchedLinks.length +
    matchedAnnouncements.length

  function handleJoin(e, club) {
    e.stopPropagation()
    if (!onToggleJoinClub) return
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

  return (
    <Card className={`${isCompact ? 'p-3.5 sm:p-4' : 'p-4 sm:p-5'} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2.5 min-w-0">
          <IconBadge color="blue" size={34} radius={10}>
            <Search size={16} />
          </IconBadge>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-bold text-[var(--text)] truncate">
                Search results for &ldquo;{trimmedQuery}&rdquo;
              </h2>
              <BubbleTag
                label={`${totalMatches} ${totalMatches === 1 ? 'result' : 'results'}`}
                color="blue"
                size="sm"
              />
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Across all campus clubs, upcoming events, announcements, and shared resources
            </p>
          </div>
        </div>

        {onClearQuery && (
          <button
            type="button"
            onClick={onClearQuery}
            className="inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] border border-[var(--border)] text-xs font-semibold text-[var(--text)] cursor-pointer transition-colors shrink-0"
          >
            <X size={13} />
            <span>Clear search</span>
          </button>
        )}
      </div>

      {totalMatches === 0 ? (
        <div className="py-6 text-center space-y-1.5">
          <p className="text-sm font-semibold text-[var(--text)]">
            No clubs, events, announcements, or links matched &ldquo;{trimmedQuery}&rdquo;
          </p>
          <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
            Try searching by club name, @handle, building/room, or topic — or use the AI Club Matchmaker below to explore by interest.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 1. Matching Clubs */}
          {matchedClubs.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Clubs ({matchedClubs.length})
                </span>
                {onNav && (
                  <button
                    type="button"
                    onClick={() =>
                      onNav('clubs', { section: 'discover', searchQuery: trimmedQuery })
                    }
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer p-0"
                  >
                    <span>View all in Clubs</span>
                    <ArrowRight size={12} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {matchedClubs.slice(0, 6).map(club => {
                  const isJoined = Boolean(club.joined)
                  return (
                    <div
                      key={club.id}
                      onClick={() =>
                        onNav &&
                        onNav('clubs', {
                          clubId: club.id,
                          section: 'discover',
                          searchQuery: club.name || trimmedQuery,
                        })
                      }
                      className="p-3 rounded-xl content-tile content-tile-interactive cursor-pointer flex items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ClubAvatar club={club} size={34} />
                        <div className="min-w-0">
                          <div className="text-xs sm:text-[13px] font-bold text-[var(--text)] truncate">
                            {cleanText(club.name)}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] truncate">
                            {club.categoryLabel || club.category}
                            {club.instagram ? ` · @${club.instagram}` : ''}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={e => handleJoin(e, club)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer border shrink-0 ${
                          isJoined
                            ? 'bg-[var(--bg-card)] border-[var(--green)]/35 text-[var(--green-ink)]'
                            : 'bg-[var(--blue)] hover:opacity-90 border-[var(--blue)] text-white'
                        }`}
                      >
                        {isJoined ? <Check size={11} /> : <Plus size={11} />}
                        <span>{isJoined ? 'Joined' : 'Join'}</span>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 2. Matching Events */}
          {matchedEvents.length > 0 && (
            <div className="space-y-2.5 pt-2 border-t border-[var(--border-subtle)]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Upcoming Events ({matchedEvents.length})
                </span>
                {onNav && (
                  <button
                    type="button"
                    onClick={() => onNav('calendar', { searchQuery: trimmedQuery })}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer p-0"
                  >
                    <span>Open in Calendar</span>
                    <ArrowRight size={12} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {matchedEvents.slice(0, 4).map(ev => (
                  <div
                    key={ev.id}
                    onClick={() => onNav && onNav('calendar', { searchQuery: trimmedQuery })}
                    className="p-3 rounded-xl content-tile content-tile-interactive cursor-pointer flex items-start justify-between gap-2.5"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-xs sm:text-[13px] font-bold text-[var(--text)] truncate">
                        {cleanText(ev.event)}
                      </div>
                      <div className="text-[11px] font-medium text-[var(--blue-ink)] truncate">
                        {cleanText(ev.club)}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] truncate">
                        <span className="inline-flex items-center gap-1 shrink-0">
                          <Calendar size={11} />
                          {ev.day} {ev.date} · {ev.time}
                        </span>
                        {ev.location && (
                          <span className="inline-flex items-center gap-1 truncate">
                            <MapPin size={11} className="shrink-0" />
                            <span className="truncate">{cleanText(ev.location)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Matching Shared Links */}
          {matchedLinks.length > 0 && (
            <div className="space-y-2.5 pt-2 border-t border-[var(--border-subtle)]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Shared Links &amp; Docs ({matchedLinks.length})
                </span>
                {onNav && (
                  <button
                    type="button"
                    onClick={() => onNav('links', { searchQuery: trimmedQuery })}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer p-0"
                  >
                    <span>View in Resources</span>
                    <ArrowRight size={12} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {matchedLinks.slice(0, 4).map(link => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 rounded-xl content-tile content-tile-interactive no-underline flex items-center justify-between gap-2.5"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[var(--text)] truncate">
                        {cleanText(link.rawLabel || link.title)}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] truncate">
                        {link.clubName ? `${cleanText(link.clubName)} · ` : ''}
                        {link.category || 'Resource'}
                      </div>
                    </div>
                    <ExternalLink size={13} className="text-[var(--text-light)] shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
