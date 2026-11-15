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
import { Card, ClubAvatar, BubbleTag, IconBadge, Button, cleanText } from './ui'
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
        <div className="flex items-center gap-3 min-w-0">
          <IconBadge color="blue" size={38} radius={9999}>
            <Search size={17} />
          </IconBadge>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display text-base font-medium text-[var(--text)] truncate">
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
          <Button
            variant="outlined-neutral"
            size="sm"
            icon={<X size={14} />}
            onClick={onClearQuery}
          >
            Clear search
          </Button>
        )}
      </div>

      {totalMatches === 0 ? (
        <div className="py-6 text-center space-y-1.5">
          <p className="text-sm font-medium text-[var(--text)]">
            No clubs, events, announcements, or links matched &ldquo;{trimmedQuery}&rdquo;
          </p>
          <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
            Try searching by club name, @handle, building/room, or topic — or use the AI Club Search &amp; Advisor below to explore by interest.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 1. Matching Clubs */}
          {matchedClubs.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-display font-medium text-[var(--text)]">
                  Clubs ({matchedClubs.length})
                </span>
                {onNav && (
                  <Button
                    variant="text"
                    size="sm"
                    trailingIcon={<ArrowRight size={13} />}
                    onClick={() =>
                      onNav('clubs', { section: 'discover', searchQuery: trimmedQuery })
                    }
                  >
                    View all in Clubs
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {matchedClubs.slice(0, 6).map(club => {
                  const isJoined = Boolean(club.joined)
                  return (
                    <div
                      key={club.id}
                      className="p-2.5 rounded-xl content-tile flex items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ClubAvatar club={club} size={36} />
                        <div className="min-w-0">
                          <button type="button" className="ui-touch text-left text-sm font-medium hover:underline break-words"
                            onClick={() => onNav?.('clubs', {
                              clubId: club.id, section: 'discover', searchQuery: club.name || trimmedQuery,
                            })}>
                            {cleanText(club.name)}
                          </button>
                          <div className="text-xs text-[var(--text-muted)] truncate">
                            {club.categoryLabel || club.category}
                            {club.instagram ? ` · @${club.instagram}` : ''}
                          </div>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant={isJoined ? 'outlined' : 'tonal'}
                        icon={isJoined ? <Check size={13} /> : <Plus size={13} />}
                        onClick={e => handleJoin(e, club)}
                      >
                        {isJoined ? 'Joined' : 'Join'}
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 2. Matching Events */}
          {matchedEvents.length > 0 && (
            <div className="space-y-2.5 pt-3 border-t border-[var(--border)]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-display font-medium text-[var(--text)]">
                  Upcoming events ({matchedEvents.length})
                </span>
                {onNav && (
                  <Button
                    variant="text"
                    size="sm"
                    trailingIcon={<ArrowRight size={13} />}
                    onClick={() => onNav('calendar', { searchQuery: trimmedQuery })}
                  >
                    Open in Calendar
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {matchedEvents.slice(0, 4).map(ev => (
                  <div
                    key={ev.id}
                    className="p-2.5 rounded-xl content-tile flex flex-wrap items-start justify-between gap-2"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <button type="button" className="ui-touch text-left text-sm font-medium hover:underline break-words"
                        onClick={() => onNav?.('calendar', { searchQuery: trimmedQuery })}>
                        {cleanText(ev.event)}
                      </button>
                      <div className="text-xs font-medium text-[var(--blue)] truncate">
                        {cleanText(ev.club)}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] truncate pt-0.5">
                        <span className="inline-flex items-center gap-1 shrink-0">
                          <Calendar size={12} />
                          {ev.day} {ev.date} · {ev.time}
                        </span>
                        {ev.location && (
                          <span className="inline-flex items-center gap-1 truncate">
                            <MapPin size={12} className="shrink-0" />
                            <span className="truncate">{cleanText(ev.location)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    {ev.permalink && (
                      <a
                        href={ev.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open original post"
                        className="md-state-layer inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-transparent text-xs font-medium text-[var(--blue)] border border-[var(--md-outline)] hover:border-[var(--blue)] no-underline shrink-0"
                      >
                        <span>Original Post</span>
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Matching Shared Links */}
          {matchedLinks.length > 0 && (
            <div className="space-y-2.5 pt-3 border-t border-[var(--border)]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-display font-medium text-[var(--text)]">
                  Shared links &amp; docs ({matchedLinks.length})
                </span>
                {onNav && (
                  <Button
                    variant="text"
                    size="sm"
                    trailingIcon={<ArrowRight size={13} />}
                    onClick={() => onNav('links', { searchQuery: trimmedQuery })}
                  >
                    View in Resources
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {matchedLinks.slice(0, 4).map(link => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3 rounded-xl content-tile content-tile-interactive no-underline flex items-center justify-between gap-2.5"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[var(--text)] truncate">
                        {cleanText(link.rawLabel || link.title)}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                        {link.clubName ? `${cleanText(link.clubName)} · ` : ''}
                        {link.category || 'Resource'}
                      </div>
                    </div>
                    <ExternalLink size={14} className="text-[var(--text-muted)] shrink-0" />
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
