import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, MapPin } from 'lucide-react'
import ClubRbacPanel from './ClubRbacPanel'
import { Button, Card, ClubAvatar, PageToolbar, cleanText, cleanMultilineText } from './ui'
import { getClubPeopleAndGroups, onWorkspacePermissionChange } from '../api/workspaceClient'
import { normalizeExternalPostUrl } from '../utils/calendarSync'
import { isPublicRecord, mergeClubRoster } from '../utils/publicRoster'
import { clubPageHref } from '../utils/workspaceEntry'

export function ClubPageLink({ clubId, section, personId, onOpen, children, ...props }) {
  return (
    <a href={clubPageHref(clubId, section, personId)} {...props} onClick={event => {
      if (!onOpen || event.defaultPrevented || event.button !== 0 ||
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      onOpen({ clubId, section: section || 'overview', personId: personId || '' }, event.currentTarget)
    }}>
      {children}
    </a>
  )
}

const linkClass = 'ui-touch inline-flex min-h-9 items-center gap-1 text-sm text-[var(--blue-ink)] hover:underline'

function formatEventTime(event, use24h) {
  const date = new Date(event.startIso)
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    ...(event.allDay ? {} : { timeStyle: 'short', hour12: !use24h }),
  }).format(date)
}

function getOfficialLinks(club, record) {
  const instagram = String(club.instagram || '').replace(/^@+/, '')
  const email = String(club.email || '').trim()
  return [
    ['Website', normalizeExternalPostUrl(club.website)],
    ['Instagram', normalizeExternalPostUrl(record?.instagramUrl ||
      (instagram && !instagram.startsWith('demo_') ? 'https://www.instagram.com/' + encodeURIComponent(instagram) + '/' : ''))],
    ['Discord', normalizeExternalPostUrl(club.discordUrl || club.discord)],
    ['Email club', /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email) ? 'mailto:' + email : ''],
  ].filter(([, url]) => url)
}

function ClubMembers({ club, user, membershipChanging, publishedPeople, personId }) {
  const [requestVersion, setRequestVersion] = useState(0)
  const [result, setResult] = useState(null)
  const [loadedVersion, setLoadedVersion] = useState(null)
  const [error, setError] = useState(false)
  const person = useRef(null)
  const versionKey = `${requestVersion}:${club.joined}`

  useEffect(() => {
    if (!user || membershipChanging) return
    const controller = new AbortController()
    getClubPeopleAndGroups(club.id, controller.signal).then(response => {
      if (controller.signal.aborted) return
      setResult(response?.ok ? response : null)
      const restricted = response?.status === 403 && response.code === 'NOT_CLUB_MEMBER'
      setError(!response?.ok && !restricted)
      setLoadedVersion(versionKey)
    }).catch(() => {
      if (controller.signal.aborted) return
      setResult(null)
      setError(true)
      setLoadedVersion(versionKey)
    })
    return () => controller.abort()
  }, [club.id, membershipChanging, user?.id, versionKey])

  useEffect(() => {
    if (!user) return
    return onWorkspacePermissionChange(detail => {
      if (detail.method !== 'GET') setRequestVersion(version => version + 1)
    })
  }, [user])

  const loading = Boolean(user && (membershipChanging || loadedVersion !== versionKey))
  const currentResult = user && !loading ? result : null
  const canSeeMembers = Boolean(currentResult?.permission?.isMember)
  const { confirmed, published } = mergeClubRoster(publishedPeople, canSeeMembers ? currentResult : null)
  const requestedPerson = publishedPeople.find(entry => entry.id === personId || entry.rosterId === personId)
  const requestedSeat = requestedPerson?.rosterId.toLowerCase()
  useEffect(() => {
    if (personId) person.current?.focus()
  }, [personId, requestedSeat, canSeeMembers, loading])

  return (
    <div className="page-stack">
      {canSeeMembers && confirmed.length > 0 && (
        <Card className="section-pad space-y-3">
          <h2 className="font-display text-lg">Workspace members</h2>
          <ul className="divide-y divide-[var(--border)]">
            {confirmed.map(entry => (
              <li key={entry.userId} ref={requestedSeat && entry.rosterId?.toLowerCase() === requestedSeat ? person : null}
                tabIndex={requestedSeat && entry.rosterId?.toLowerCase() === requestedSeat ? -1 : undefined} className="py-2">
                <p className="text-sm font-medium">{cleanText(entry.name)}{entry.isYou ? ' (you)' : ''}</p>
                <p className="text-xs text-[var(--text-muted)]">{cleanText(entry.roleTitle || 'Member')}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="section-pad space-y-3">
        <h2 className="font-display text-lg">Published roster</h2>
        {published.length ? (
          <ul className="divide-y divide-[var(--border)]">
            {published.map(entry => (
              <li key={entry.id} ref={entry.id === requestedPerson?.id ? person : null}
                tabIndex={entry.id === requestedPerson?.id ? -1 : undefined} className="py-2">
                <p className="text-sm font-medium">{entry.name}</p>
                <p className="text-xs text-[var(--text-muted)]">{entry.role}</p>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-[var(--text-muted)]">
          {publishedPeople.length ? 'Published roster entries appear under Workspace members.' : 'This club hasn’t published a roster.'}
        </p>}
      </Card>

      <div aria-live="polite" className="text-sm text-[var(--text-muted)]">
        {loading ? 'Loading workspace members…' : error && user ? (
          <div className="flex flex-wrap items-center gap-2">
            <span>Could not load workspace members.</span>
            <Button variant="outlined" size="sm" onClick={() => setRequestVersion(version => version + 1)}>Retry</Button>
          </div>
        ) : !canSeeMembers ? 'Workspace members are visible to signed-in members of this club.'
          : !confirmed.length ? 'There are no workspace members to show.' : null}
      </div>
    </div>
  )
}

export default function ClubPage({
  route, club, loading, record, events, posts, resources, publishedPeople, user, use24h,
  onOpen, onBack, onMembershipChange, onMembershipConfirmed, onEvent, onTaskBoard,
  onResource, onRefreshAnnouncements, onNotify,
}) {
  const heading = useRef(null)
  const [membershipAction, setMembershipAction] = useState('')
  const [membershipError, setMembershipError] = useState(false)
  const [actionsVersion, setActionsVersion] = useState(0)
  const [inFlight, setInFlight] = useState(false)
  const writing = useRef(false)

  useEffect(() => {
    if (!route.personId) heading.current?.querySelector('h1')?.focus({ preventScroll: true })
  }, [route.section, route.personId, club?.id, loading])

  async function changeMembership() {
    if (writing.current) return
    const leaving = club.joined
    writing.current = true
    setInFlight(true)
    setMembershipAction(leaving ? 'Leaving…' : 'Joining…')
    setMembershipError(false)
    try {
      if (!await onMembershipChange(club.id)) {
        setMembershipError(true)
        return
      }
      setActionsVersion(version => version + 1)
      onNotify?.(`${leaving ? 'Left' : 'Joined'} ${cleanText(club.name)}.`)
    } catch {
      setMembershipError(true)
    } finally {
      writing.current = false
      setMembershipAction('')
      setInFlight(false)
    }
  }

  const breadcrumb = (
    <nav aria-label="Breadcrumb">
      <Button variant="text-neutral" size="sm" icon={<ChevronLeft size={16} />} onClick={onBack}>Clubs</Button>
    </nav>
  )
  if (!club) {
    return (
      <div ref={heading} className="page-stack">
        {breadcrumb}
        <PageToolbar title={loading ? 'Loading club…' : 'Club unavailable'} />
        {!loading && <p>This address doesn’t match a club in the catalog.</p>}
      </div>
    )
  }

  const title = cleanText(club.name)
  const officialLinks = getOfficialLinks(club, record)
  const description = cleanMultilineText(club.description || club.bio || club.directoryDescription || '')
  const meetingTime = cleanText(record?.meetingTime || club.meetingTime || '')
  const meetingLocation = cleanText(record?.meetingLocation || club.meetingLocation || '')
  const publishedSchedule = cleanText(record?.meetingSchedule || club.meetingSchedule || '')
  const meetingSchedule = /^weekly meetings[.!]?$/i.test(publishedSchedule) ? '' : publishedSchedule
  const nextEvent = events[0]
  const nextMeeting = events.find(event => event.kind === 'meeting')
  const recentPosts = posts.filter(isPublicRecord).slice(0, 3)
  const overview = route.section === 'overview'
  const members = route.section === 'members'

  return (
    <div className="page-stack">
      {breadcrumb}
      <div ref={heading}>
        <PageToolbar title={title} context={<span className="flex items-center gap-2"><ClubAvatar club={club} size={32} />{club.categoryLabel}</span>} actions={
          <Button variant={club.joined ? 'outlined-neutral' : 'filled'} pending={inFlight} pendingLabel={membershipAction}
            onClick={changeMembership}>{club.joined ? 'Leave club' : 'Join club'}</Button>
        } />
      </div>
      {membershipError && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-[var(--red-ink)]">
        Could not {club.joined ? 'leave' : 'join'} this club.
        <Button variant="outlined-neutral" size="sm" onClick={changeMembership}>Retry</Button>
      </div>}

      <nav aria-label="Club sections" className="flex flex-wrap gap-x-4">
        <ClubPageLink clubId={club.id} onOpen={onOpen} className={linkClass} aria-current={overview ? 'page' : undefined}>Overview</ClubPageLink>
        <ClubPageLink clubId={club.id} section="members" onOpen={onOpen} className={linkClass} aria-current={members ? 'page' : undefined}>Members</ClubPageLink>
        {user && <ClubPageLink clubId={club.id} section="roles" onOpen={onOpen} className={linkClass}
          aria-current={route.section === 'roles' ? 'page' : undefined}>Roles &amp; groups</ClubPageLink>}
      </nav>

      {overview ? (
        <div className="page-stack">
          <Card className="section-pad space-y-3">
            {description && <p className="whitespace-pre-line break-words">{description}</p>}
            <div className="space-y-1">
              <h2 className="font-display text-lg">Meetings</h2>
              <p className="text-sm text-[var(--text-muted)]">
                {meetingSchedule || [meetingTime, meetingLocation].filter(Boolean).join(' · ') ||
                  (nextMeeting ? [formatEventTime(nextMeeting, use24h), nextMeeting.location].filter(Boolean).join(' · ')
                    : 'Meeting details haven’t been published.')}
              </p>
            </div>
            {officialLinks.length > 0 && <div className="flex flex-wrap gap-x-4">
              {officialLinks.map(([label, url]) => (
                <a key={label} className={linkClass} href={url}
                  target={url.startsWith('mailto:') ? undefined : '_blank'} rel="noopener noreferrer">{label}</a>
              ))}
            </div>}
          </Card>

          {(nextEvent || club.joined || resources.length > 0) && (
            <Card className="section-pad space-y-3">
              {nextEvent && <div className="space-y-1">
                <h2 className="font-display text-lg">Next event</h2>
                <Button variant="text" size="sm" icon={<CalendarDays size={16} />} onClick={() => onEvent(nextEvent)}>
                  {nextEvent.event}
                </Button>
                <p className="text-sm text-[var(--text-muted)]">{formatEventTime(nextEvent, use24h)}</p>
                {nextEvent.location && <p className="flex items-center gap-1 text-sm text-[var(--text-muted)]"><MapPin size={14} />{nextEvent.location}</p>}
              </div>}
              {resources.length > 0 && <div className="space-y-1">
                <h2 className="font-display text-lg">Resources</h2>
                <ul>
                  {resources.slice(0, 3).map(resource => <li key={resource.id}>
                    <Button variant="text" size="sm" onClick={() => onResource(resource)}>
                      {cleanText(resource.rawLabel || resource.label || resource.title)}
                    </Button>
                  </li>)}
                </ul>
              </div>}
              {club.joined && <Button variant="outlined-neutral" size="sm" onClick={() => onTaskBoard(club.id)}>Open task board</Button>}
            </Card>
          )}

          <Card className="section-pad space-y-3">
            <h2 className="font-display text-lg">Recent updates</h2>
            {recentPosts.length ? <ul className="divide-y divide-[var(--border)]">
              {recentPosts.map(post => {
                const url = normalizeExternalPostUrl(post.permalink)
                const title = cleanText(post.title || 'Club update')
                return <li key={post.id} className="py-2 space-y-1">
                  {url ? <a className={linkClass} href={url} target="_blank" rel="noopener noreferrer">{title}</a>
                    : <p className="text-sm font-medium">{title}</p>}
                  {post.summary && <p className="text-sm text-[var(--text-muted)] break-words">{cleanText(post.summary)}</p>}
                </li>
              })}
            </ul> : <p className="text-sm text-[var(--text-muted)]">No published updates yet.</p>}
          </Card>
        </div>
      ) : members || !user ? (
        <ClubMembers club={club} user={user} membershipChanging={inFlight} publishedPeople={publishedPeople} personId={route.personId} />
      ) : !inFlight && (
        <ClubRbacPanel key={actionsVersion} club={club} publishedPeople={publishedPeople} user={user}
          onMembershipConfirmed={onMembershipConfirmed} onRefreshAnnouncements={onRefreshAnnouncements} onNotify={onNotify} />
      )}
    </div>
  )
}
