import Select, { MenuSelect } from './Select'
import SearchDestination from './SearchDestination'
import Announcements from './Announcements'
import { FindClubsButton } from './ClubDiscoveryDialog'
import { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react'
import {
  Calendar,
  Plus,
  Mail,
  Clock,
  ArrowRight,
  X,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MapPin,
  RefreshCw,
  Settings,
  SlidersHorizontal,
} from 'lucide-react'
import {
  clubs as defaultClubs,
} from '../data/sampleData'
import {
  Card,
  PageToolbar,
  SearchBox,
  ActionDisclosure,
  ClubAvatar,
  ClubCategoryChip,
  BubbleTag,
  IconBadge,
  cleanText,
  cleanMultilineText,
  Button,
  IconButton,
} from './ui'
import { PlatformIcon } from './icons'
import { ingestFromSource, syncAllSources, getStaticSnapshot } from '../api/client'
import {
  getLocalIntegrationPrefs,
  dispatchDiscordNotification,
  dispatchEmailNotification,
} from '../utils/directIntegrations'
import {
  CLUB_CATEGORIES,
  categorizeClub,
  getClubCategoryMeta,
  getClubSummary,
} from '../utils/clubCategories'
import { filterAndRankBySearch, matchesSearchQuery, parseSearchQuery, rankClubSearch } from '../utils/search'
import { ClubPageLink } from './ClubPage'
import { isPublicRecord } from '../utils/publicRoster'

const SOURCE_FILTERS = [
  { id: 'all',       label: 'All Channels', color: 'blue' },
  { id: 'instagram', label: 'Instagram',    color: 'purple' },
  { id: 'discord',   label: 'Discord',      color: 'blue' },
  { id: 'email',     label: 'Email',        color: 'yellow' },
]

const SOURCE_META = {
  instagram:       { label: 'Instagram', color: 'purple' },
  instagram_story: { label: 'Instagram', color: 'purple' },
  discord:         { label: 'Discord',   color: 'blue' },
  email:           { label: 'Email',     color: 'yellow' },
  google_calendar: { label: 'Calendar',  color: 'green' },
  website:         { label: 'Website',   color: 'teal' },
}

const FEED_PAGE_SIZE = 24
const FEED_DATE_FMT =
  typeof Intl !== 'undefined'
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null
const FEED_EVENT_DATE_FMT =
  typeof Intl !== 'undefined'
    ? new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : null

const INLINE_URL_TOKEN_RE =
  /((?:https?:\/\/|www\.)[^\s<>()]+|(?:linktr\.ee|discord\.gg|discord\.com\/invite|forms\.gle|bit\.ly|tinyurl\.com|docs\.google\.com|drive\.google\.com|calendar\.app\.google|lu\.ma|eventbrite\.com|partiful\.com|give\.ucsc\.edu)\/[^\s<>()]+)/gi

function normalizeSourceChannel(rawSource) {
  const s = String(rawSource || 'instagram').toLowerCase()
  if (s.includes('instagram')) return 'instagram'
  if (s.includes('discord')) return 'discord'
  if (s.includes('email')) return 'email'
  return s
}

function parsePostTimestamp(raw) {
  if (!raw) return 0
  const normalized = String(raw).trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
  const ms = Date.parse(normalized)
  return Number.isNaN(ms) ? 0 : ms
}

function normalizeExternalHttpUrl(raw) {
  if (!raw || typeof raw !== 'string') return null
  let trimmed = raw.trim()
  if (!trimmed || trimmed === '#') return null

  if (!/^https?:\/\//i.test(trimmed)) {
    if (
      /^(?:www\.|instagram\.com\/|discord\.(?:gg|com)\/|linktr\.ee\/|forms\.gle\/|bit\.ly\/|tinyurl\.com\/|docs\.google\.com\/|drive\.google\.com\/|calendar\.app\.google\/|lu\.ma\/|eventbrite\.com\/|partiful\.com\/|give\.ucsc\.edu\/)/i.test(
        trimmed
      )
    ) {
      trimmed = `https://${trimmed}`
    } else {
      return null
    }
  }

  try {
    let parsed = new URL(trimmed)
    // Unwrap Instagram link-shim redirects (https://l.instagram.com/?u=...)
    if (/^(?:l|lm)\.instagram\.com$/i.test(parsed.hostname)) {
      let target = parsed.searchParams.get('u') || ''
      for (let i = 0; i < 2; i += 1) {
        if (/^https?%3A/i.test(target)) {
          try {
            target = decodeURIComponent(target)
          } catch {
            break
          }
        }
      }
      if (target) parsed = new URL(target)
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.toString()
  } catch {
    return null
  }
}

function isDemoClubId(clubId) {
  const id = String(clubId || '').trim().toLowerCase()
  return !id || id.startsWith('demo_')
}

function resolvePostLinkInfo(post, club, channel) {
  const clubId = post.clubId || club?.id || ''
  const isDemoClub = isDemoClubId(clubId)
  const directUrl = normalizeExternalHttpUrl(post.permalink || post.url || post.sourceUrl)

  if (directUrl && !(isDemoClub && /demo/i.test(directUrl))) {
    if (/instagram\.com\/(?:p|reel|reels|tv|stories)\//i.test(directUrl)) {
      const isReel = /instagram\.com\/reels?\//i.test(directUrl)
      return {
        url: directUrl,
        label: 'Original post',
        expandedLabel: isReel ? 'Watch Reel on Instagram' : 'View on Instagram',
        isDirectPost: true,
      }
    }
    if (/discord\.com\/channels\//i.test(directUrl)) {
      return {
        url: directUrl,
        label: 'Original message',
        expandedLabel: 'Jump to Discord message',
        isDirectPost: true,
      }
    }
    if (/discord\.(?:gg|com\/invite)\//i.test(directUrl)) {
      return {
        url: directUrl,
        label: 'Club Discord',
        expandedLabel: 'Open club Discord',
        isDirectPost: false,
      }
    }
    return {
      url: directUrl,
      label: 'Original post',
      expandedLabel: 'Open original post',
      isDirectPost: true,
    }
  }

  // Fallback to official club profile/page when no per-post permalink is stored
  if (!isDemoClub && !String(clubId).toLowerCase().startsWith('discord_')) {
    if (channel === 'instagram') {
      const handle = String(club?.instagram || clubId || '').replace(/^@+/, '').trim()
      const profileUrl = normalizeExternalHttpUrl(
        club?.instagramUrl || (handle ? `https://www.instagram.com/${handle}/` : '')
      )
      if (profileUrl) {
        return {
          url: profileUrl,
          label: handle ? `@${handle}` : 'Club Instagram',
          expandedLabel: handle ? `Visit @${handle} on Instagram` : 'Visit club Instagram',
          isDirectPost: false,
        }
      }
    }
    if (channel === 'website' && club?.website) {
      const siteUrl = normalizeExternalHttpUrl(club.website)
      if (siteUrl) {
        return {
          url: siteUrl,
          label: 'Club website',
          expandedLabel: 'Visit club website',
          isDirectPost: false,
        }
      }
    }
    if (channel === 'email' && club?.email) {
      return {
        url: `mailto:${club.email}`,
        label: club.email,
        expandedLabel: `Email ${club.email}`,
        isDirectPost: false,
      }
    }
  }

  return null
}

function stripRedundantTitlePrefix(bodyText, cleanTitle) {
  if (!bodyText || !cleanTitle) return bodyText || ''
  if (!bodyText.startsWith(cleanTitle)) return bodyText
  const remainder = bodyText.slice(cleanTitle.length)
  if (!remainder) return ''
  if (/^[\s\n—–\-:]+/.test(remainder)) {
    return remainder.replace(/^[\s\n—–\-:]+/, '').trim()
  }
  return bodyText
}

function extractTrailingHashtags(multilineText) {
  if (!multilineText) return { text: '', hashtags: [] }
  const lines = multilineText.split('\n')
  const collected = []

  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim()
    if (!last) {
      lines.pop()
      continue
    }
    if (/^(?:#[a-zA-Z0-9_]+\s*)+$/.test(last)) {
      const tags = last.match(/#[a-zA-Z0-9_]+/g) || []
      collected.unshift(...tags)
      lines.pop()
    } else {
      break
    }
  }

  const deduped = []
  const seen = new Set()
  for (const tag of collected) {
    const lower = tag.toLowerCase()
    if (!seen.has(lower)) {
      seen.add(lower)
      deduped.push(tag)
    }
  }

  return {
    text: lines.join('\n').trim(),
    hashtags: deduped,
  }
}

function friendlyPostResourceLabel(url, rawLabel = '') {
  const cleanedLabel = cleanText(rawLabel)
  if (
    cleanedLabel &&
    !/^(?:link|website|url|http)/i.test(cleanedLabel) &&
    cleanedLabel.length <= 36
  ) {
    return cleanedLabel
  }
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./i, '').toLowerCase()
    const path = u.pathname.toLowerCase()
    if (host === 'forms.gle' || (host.includes('docs.google.com') && path.includes('/forms'))) {
      return 'Sign-up form'
    }
    if (host.includes('docs.google.com') && path.includes('/presentation')) return 'Google Slides'
    if (host.includes('docs.google.com') && path.includes('/spreadsheets')) return 'Google Sheet'
    if (host.includes('docs.google.com')) return 'Google Doc'
    if (host.includes('drive.google.com')) return 'Google Drive'
    if (host.includes('linktr.ee')) return 'Linktree'
    if (host.includes('discord.gg') || host.includes('discord.com')) return 'Discord Invite'
    if (host.includes('give.ucsc.edu')) return 'UCSC Giving Day'
    if (host.includes('lu.ma') || host === 'luma.com') return 'Luma Event'
    if (host.includes('eventbrite.com')) return 'Eventbrite'
    if (host.includes('partiful.com')) return 'Partiful RSVP'
    return host
  } catch {
    return cleanedLabel || 'Open link'
  }
}

function cleanPostEventLocation(raw) {
  if (!raw || typeof raw !== 'string') return ''
  const stripped = cleanText(raw)
    .replace(/^(?:location|where|place|room)\s*:\s*/i, '')
    .trim()
  if (
    stripped.length < 3 ||
    /^[a-z0-9._]+ucsc$/i.test(stripped) ||
    /^(?:opers|be\s|to\s|and\s|our\s|we\s|have\s|having\s|join\s)/i.test(stripped)
  ) {
    return ''
  }
  return stripped
}

function renderLinkedText(text) {
  if (!text) return null
  const nodes = []
  let lastIndex = 0
  let keySeq = 0

  for (const match of text.matchAll(INLINE_URL_TOKEN_RE)) {
    const start = match.index ?? 0
    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start))
    }

    const rawToken = match[0]
    const trimmedToken = rawToken.replace(/[.,!?;:'")\]]+$/, '')
    const trailingPunct = rawToken.slice(trimmedToken.length)
    const safeHref = normalizeExternalHttpUrl(trimmedToken)

    if (safeHref) {
      nodes.push(
        <a
          key={`lnk_${keySeq++}`}
          href={safeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[var(--blue-ink)] underline decoration-[var(--blue)]/40 hover:decoration-[var(--blue-ink)] break-all"
        >
          {trimmedToken}
        </a>
      )
      if (trailingPunct) nodes.push(trailingPunct)
    } else {
      nodes.push(rawToken)
    }

    lastIndex = start + rawToken.length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }
  return nodes
}

function formatExpandedTimestamp(postedAtMs, rawPostedAt, use24h = false) {
  if (!postedAtMs) return ''
  const dt = new Date(postedAtMs)
  const datePart = FEED_DATE_FMT ? FEED_DATE_FMT.format(dt) : dt.toLocaleDateString()
  // Only include clock time when the source string actually carried a time component
  if (!rawPostedAt || !/T\d{2}:\d{2}/.test(String(rawPostedAt))) {
    return datePart
  }
  const timePart = dt.toLocaleTimeString('en-US', {
    hour: use24h ? '2-digit' : 'numeric',
    minute: '2-digit',
    hour12: !use24h,
  })
  return `${datePart} · ${timePart}`
}

function formatRelatedEventTime(evt, use24h = false) {
  const ms = parsePostTimestamp(evt?.start)
  if (!ms) return ''
  const dt = new Date(ms)
  const dayStr = FEED_EVENT_DATE_FMT ? FEED_EVENT_DATE_FMT.format(dt) : dt.toLocaleDateString()
  if (evt.allDay) return dayStr
  const timeStr = dt.toLocaleTimeString('en-US', {
    hour: use24h ? '2-digit' : 'numeric',
    minute: '2-digit',
    hour12: !use24h,
  })
  return `${dayStr} · ${timeStr}`
}

function buildNormalizedFeedItem(post, context = {}) {
  const club = typeof context === 'string' ? { name: context } : context.club || null
  const fallbackClubName =
    typeof context === 'string' ? context : context.fallbackClubName || club?.name || ''
  const postLinks = Array.isArray(context.postLinks) ? context.postLinks : []
  const postEvents = Array.isArray(context.postEvents) ? context.postEvents : []

  const rawSource = post.source || 'instagram'
  const channel = normalizeSourceChannel(rawSource)
  const clubIdStr = post.clubId ? String(post.clubId) : club?.id ? String(club.id) : ''
  const cleanClubName = cleanText(post.clubName || fallbackClubName || clubIdStr || '')
  const cleanTitle = cleanText(post.title || '')

  const rawFullText = post.caption || post.summary || ''
  const multilineCleaned = cleanMultilineText(rawFullText)
  const { text: withoutTrailingTags, hashtags } = extractTrailingHashtags(multilineCleaned)
  const fullBody = stripRedundantTitlePrefix(withoutTrailingTags, cleanTitle)
  const previewBody = fullBody.replace(/\s*\n+\s*/g, ' ').trim()

  const titlePrefixCore =
    cleanTitle.endsWith('...') && cleanTitle.length > 12
      ? cleanTitle.slice(0, -3).trim()
      : null
  const titleIsTruncatedPrefix = Boolean(
    titlePrefixCore && fullBody && fullBody.startsWith(titlePrefixCore)
  )

  const postedAtMs = parsePostTimestamp(post.postedAt)
  const dateLabel =
    postedAtMs > 0
      ? FEED_DATE_FMT
        ? FEED_DATE_FMT.format(postedAtMs)
        : new Date(postedAtMs).toLocaleDateString()
      : ''

  const linkInfo = resolvePostLinkInfo(post, club, channel)
  const primaryHrefLower = linkInfo?.url ? linkInfo.url.toLowerCase() : ''

  // Gather extracted links from this post (+ club Linktree/website when caption says "link in bio")
  const relatedLinks = []
  const seenLinkUrls = new Set(primaryHrefLower ? [primaryHrefLower] : [])
  const pushCandidateLink = (rawUrl, rawLabel) => {
    const safe = normalizeExternalHttpUrl(rawUrl)
    if (!safe) return
    const key = safe.toLowerCase()
    if (seenLinkUrls.has(key)) return
    if (isDemoClubId(clubIdStr) && /demo/i.test(safe)) return
    seenLinkUrls.add(key)
    relatedLinks.push({
      url: safe,
      label: friendlyPostResourceLabel(safe, rawLabel),
    })
  }

  for (const l of postLinks) {
    pushCandidateLink(l?.url, l?.label)
  }
  if (/link in (?:our )?bio/i.test(rawFullText) && club?.website) {
    const bioUrl = normalizeExternalHttpUrl(club.website)
    if (bioUrl) {
      const bioType = friendlyPostResourceLabel(bioUrl, '')
      pushCandidateLink(
        bioUrl,
        bioType && bioType !== 'Open link' ? `Bio · ${bioType}` : 'Link in bio'
      )
    }
  }

  // Gather up to 2 valid extracted events associated with this post
  const validEvents = postEvents
    .filter(ev => {
      const ms = parsePostTimestamp(ev?.start)
      return ms > 0 && new Date(ms).getFullYear() >= 2024
    })
    .sort((a, b) => parsePostTimestamp(a.start) - parsePostTimestamp(b.start))

  const relatedEvents = validEvents.slice(0, 2).map(ev => ({
    id: ev.id,
    start: ev.start,
    allDay: Boolean(ev.allDay),
    kind: ev.kind || 'event',
    location: cleanPostEventLocation(ev.location),
  }))
  const extraEventCount = Math.max(0, validEvents.length - relatedEvents.length)

  const rawHandle =
    !isDemoClubId(clubIdStr) && !clubIdStr.toLowerCase().startsWith('discord_')
      ? String(club?.instagram || (channel === 'instagram' ? clubIdStr : '') || '')
          .replace(/^@+/, '')
          .trim()
      : ''

  const hasHiddenContent =
    previewBody.length > 155 ||
    fullBody.includes('\n') ||
    titleIsTruncatedPrefix ||
    hashtags.length > 0 ||
    relatedLinks.length > 0 ||
    relatedEvents.length > 0

  return {
    id: post.id,
    clubIdStr,
    source: rawSource,
    channel,
    important: Boolean(post.important),
    cleanClubName,
    handleLabel: rawHandle,
    cleanTitle,
    titleIsTruncatedPrefix,
    previewBody,
    fullBody,
    hashtags,
    postedAtRaw: post.postedAt || '',
    postedAtMs,
    dateLabel,
    linkInfo,
    relatedLinks,
    relatedEvents,
    extraEventCount,
    hasHiddenContent,
    searchHaystack: `${cleanTitle} ${fullBody} ${hashtags.join(' ')} ${cleanClubName} ${rawHandle}`.toLowerCase(),
  }
}

const FeedPostCard = memo(function FeedPostCard({
  post,
  isCompactDensity,
  isExpanded,
  use24h,
  onToggleExpand,
  onOpenClub,
}) {
  const meta = SOURCE_META[post.source] || SOURCE_META[post.channel] || SOURCE_META.instagram

  const headerDateText = isExpanded
    ? formatExpandedTimestamp(post.postedAtMs, post.postedAtRaw, use24h) || post.dateLabel
    : post.dateLabel

  return (
    <article
      className={`${
        isExpanded
          ? 'border-[var(--border-strong)] shadow-[var(--shadow-tile-hover)]'
          : 'feed-tile-virtual'
      } content-tile content-tile-interactive ${
        isCompactDensity ? 'p-3 gap-2.5' : 'p-4 gap-3'
      } rounded-[var(--radius-sm)] flex items-start`}
    >
      <IconBadge color={meta.color} size={isCompactDensity ? 32 : 36} radius={10} className="mt-0.5">
        <PlatformIcon type={post.channel} size={isCompactDensity ? 16 : 18} />
      </IconBadge>

      <div className="flex-1 min-w-0">
        {/* Header Metadata */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <BubbleTag label={meta.label} color={meta.color} size="sm" />
            {post.important && <BubbleTag label="Urgent" color="red" size="sm" />}
            {post.clubIdStr ? (
              <ClubPageLink clubId={post.clubIdStr} onOpen={onOpenClub}
                className="ui-touch text-xs font-semibold text-[var(--blue-ink)] hover:underline">{post.cleanClubName}</ClubPageLink>
            ) : <span className="text-xs font-semibold">{post.cleanClubName}</span>}
            {isExpanded && post.handleLabel && (
              <span className="text-[11px] text-[var(--text-light)] font-mono-num truncate">
                @{post.handleLabel}
              </span>
            )}
          </div>
          {headerDateText && (
            <span className="text-[11px] text-[var(--text-light)] shrink-0">
              {headerDateText}
            </span>
          )}
        </div>

        {/* Post Title */}
        {post.cleanTitle && !(isExpanded && post.titleIsTruncatedPrefix) && (
          <div className="font-semibold text-sm text-[var(--text)] leading-snug break-words">
            {post.cleanTitle}
          </div>
        )}

        {/* Collapsed vs Expanded Body */}
        {!isExpanded ? (
          post.previewBody &&
          post.previewBody !== post.cleanTitle && (
            <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed line-clamp-3 break-words">
              {post.previewBody}
            </p>
          )
        ) : (
          <div className="space-y-2.5">
            {post.fullBody && (
              <div className="text-xs sm:text-[13px] text-[var(--text)] mt-1.5 leading-relaxed whitespace-pre-line break-words">
                {renderLinkedText(post.fullBody)}
              </div>
            )}

            {/* Extracted Event Dates & Locations from this Post */}
            {post.relatedEvents.length > 0 && (
              <div className="mt-2 px-2.5 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-1">
                {post.relatedEvents.map(ev => (
                  <div
                    key={ev.id}
                    className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] text-[var(--text)]"
                  >
                    <span className="inline-flex items-center gap-1 font-semibold text-[var(--blue-ink)]">
                      <Calendar size={11.5} className="shrink-0" />
                      <span>{formatRelatedEventTime(ev, use24h)}</span>
                    </span>
                    {ev.location && (
                      <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
                        <MapPin size={11.5} className="text-[var(--text-light)] shrink-0" />
                        <span>{ev.location}</span>
                      </span>
                    )}
                  </div>
                ))}
                {post.extraEventCount > 0 && (
                  <div className="text-[11px] text-[var(--text-light)]">
                    +{post.extraEventCount} more {post.extraEventCount === 1 ? 'date' : 'dates'} in this post
                  </div>
                )}
              </div>
            )}

            {/* Extracted Resource Links (Forms, Linktree / Link in Bio, Docs) */}
            {post.relatedLinks.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {post.relatedLinks.map(lnk => (
                  <a
                    key={lnk.url}
                    href={lnk.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-surface)] border border-[var(--border)] hover:border-[var(--blue)] text-[11px] font-semibold text-[var(--text)] hover:text-[var(--blue-ink)] no-underline transition-colors"
                  >
                    <span>{lnk.label}</span>
                    <ExternalLink size={11} className="opacity-70 shrink-0" />
                  </a>
                ))}
              </div>
            )}

            {/* Trailing Hashtags */}
            {post.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {post.hashtags.map(tag => (
                  <span
                    key={tag}
                    className="text-[11px] text-[var(--text-light)] font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer Actions: Expand/Collapse Toggle + Original Post Link */}
        <div
          className={`${
            isCompactDensity ? 'mt-2 pt-1.5' : 'mt-2.5 pt-2'
          } border-t border-[var(--border-subtle)] flex items-center justify-between gap-2 flex-wrap`}
        >
          <button
            type="button"
            aria-expanded={isExpanded}
            onClick={() => onToggleExpand(post.id)}
            className="ui-touch inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] bg-transparent border-none p-0 cursor-pointer transition-colors"
          >
            <span>
              {isExpanded
                ? 'Show less'
                : post.hasHiddenContent
                  ? 'Read full post'
                  : 'Post details'}
            </span>
            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {post.linkInfo &&
            (isExpanded ? (
              <a
                href={post.linkInfo.url}
                target={post.linkInfo.url.startsWith('mailto:') ? undefined : '_blank'}
                rel={post.linkInfo.url.startsWith('mailto:') ? undefined : 'noopener noreferrer'}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--blue-light)] text-[var(--blue-ink)] hover:opacity-90 text-[11.5px] font-semibold no-underline shrink-0 transition-opacity"
              >
                <span>{post.linkInfo.expandedLabel}</span>
                {post.linkInfo.url.startsWith('mailto:') ? (
                  <Mail size={11.5} className="shrink-0" />
                ) : (
                  <ExternalLink size={11.5} className="shrink-0" />
                )}
              </a>
            ) : (
              <a
                href={post.linkInfo.url}
                target={post.linkInfo.url.startsWith('mailto:') ? undefined : '_blank'}
                rel={post.linkInfo.url.startsWith('mailto:') ? undefined : 'noopener noreferrer'}
                title={post.linkInfo.expandedLabel}
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--blue-ink)] hover:underline no-underline shrink-0"
              >
                <span>{post.linkInfo.label}</span>
                {post.linkInfo.url.startsWith('mailto:') ? (
                  <Mail size={11} className="shrink-0 opacity-80" />
                ) : (
                  <ExternalLink size={11} className="shrink-0 opacity-80" />
                )}
              </a>
            ))}
        </div>
      </div>
    </article>
  )
})

export default function ClubsHub({
  accountKey = 'guest',
  items,
  clubsData,
  hubDict = {},
  initialSection = null,
  sectionRevision,
  onOpenClub,
  isDemo = false,
  userSettings = {},
  searchQuery = '',
  onSearchChange,
  searchTarget,
  onDismissSearchTarget,
  publicPeople = [],
  selectedAnnouncement,
  personalAnnouncements = [],
  onOpenAnnouncement,
  onFindClubs,
  onViewJoined,
  compact = false,
  onRefresh,
  onOpenSettings,
  localPosts: externalLocalPosts,
  onAddLocalPost,
  onPageContextChange,
  onNotify,
}) {
  const allClubs = useMemo(() => {
    const raw =
      items && items.length > 0
        ? items
        : clubsData && clubsData.length > 0
          ? clubsData
          : defaultClubs
    return raw.map(c => {
      if (c.category && c.categoryLabel && c.avatarBg) return c
      const catId = c.category || categorizeClub(c)
      const catMeta = getClubCategoryMeta(catId)
      const categoryLabel = c.categoryLabel || catMeta.label
      return {
        ...c,
        category: catId,
        categoryLabel,
        avatarBg: c.avatarBg || catMeta.gradient,
      }
    })
  }, [items, clubsData])

  const joinedClubs = useMemo(
    () => allClubs.filter(c => Boolean(c.joined)),
    [allClubs]
  )

  const [section, setSection] = useState(
    () => initialSection || (joinedClubs.length === 0 ? 'discover' : 'myclubs')
  )

  useEffect(() => {
    if (initialSection) setSection(initialSection)
  }, [initialSection, sectionRevision])

  const [category, setCategory] = useState('All')
  const [clubLayout, setClubLayout] = useState('grouped') // 'grouped' | 'grid'
  const [expandedCategories, setExpandedCategories] = useState({})
  const [selectedSource, setSelectedSource] = useState('all')
  const [visibleFeedCount, setVisibleFeedCount] = useState(FEED_PAGE_SIZE)
  const [expandedPostIds, setExpandedPostIds] = useState({})
  const feedSentinelRef = useRef(null)
  const hubPostsCacheRef = useRef({ hubRef: null, items: [] })

  const handleToggleFeedPost = useCallback(postId => {
    setExpandedPostIds(prev => {
      if (prev[postId]) {
        const next = { ...prev }
        delete next[postId]
        return next
      }
      return { ...prev, [postId]: true }
    })
  }, [])

  // Post Update form state
  const [showPostForm, setShowPostForm] = useState(false)
  const [postClubId, setPostClubId] = useState(
    () => joinedClubs[0]?.id || ''
  )
  const [postSource, setPostSource] = useState('discord')
  const [postTitle, setPostTitle] = useState('')
  const [postSummary, setPostSummary] = useState('')
  const [postPermalink, setPostPermalink] = useState('')
  const [pushToDiscord, setPushToDiscord] = useState(
    () => Boolean(getLocalIntegrationPrefs(accountKey).autoPushAnnouncements)
  )
  const [pushToEmail, setPushToEmail] = useState(false)
  const [syncingChannel, setSyncingChannel] = useState('')
  const [internalLocalPosts, setInternalLocalPosts] = useState([])

  useEffect(() => {
    const fallbackPostId = joinedClubs[0]?.id || ''
    if (!joinedClubs.some(c => String(c.id) === String(postClubId))) {
      setPostClubId(fallbackPostId ? String(fallbackPostId) : '')
    }
  }, [joinedClubs, postClubId])

  const localPosts = externalLocalPosts ?? internalLocalPosts
  const isCompactDensity = Boolean(userSettings?.compactCards)
  const use24h = userSettings?.timeFormat === '24h'

  useEffect(() => {
    if (compact || !onPageContextChange) return
    let label = `My Clubs (${joinedClubs.length})`
    if (section === 'discover') {
      if (category !== 'All') {
        const catMeta = getClubCategoryMeta(category)
        label = `All Clubs · ${catMeta.shortLabel || catMeta.label}`
      } else {
        label = 'All Clubs'
      }
    } else if (section === 'updates') {
      label = 'Club Updates'
    } else if (section === 'directory') {
      label = 'People'
    }
    onPageContextChange({ nav: 'clubs', label, modal: showPostForm ? 'post' : null })
  }, [compact, onPageContextChange, section, category, joinedClubs.length, showPostForm])

  const [visiblePeopleCount, setVisiblePeopleCount] = useState(36)
  const people = useMemo(() => section === 'directory' && !compact
    ? filterAndRankBySearch(publicPeople, searchQuery, person => ({
      primary: person.name, secondary: [person.club, person.role],
    })) : [], [section, compact, publicPeople, searchQuery])
  useEffect(() => setVisiblePeopleCount(36), [searchQuery])

  const categoryFilters = useMemo(() => {
    if (compact) return []
    const pool = section === 'discover' ? allClubs : joinedClubs
    const counts = new Map()
    for (const c of pool) {
      const key = c.category
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    const ordered = CLUB_CATEGORIES.filter(cat => (counts.get(cat.id) || 0) > 0).map(cat => ({
      value: cat.id,
      label: cat.label,
      shortLabel: cat.shortLabel,
      color: cat.color,
      count: counts.get(cat.id) || 0,
    }))
    return [{ value: 'All', label: 'All Categories', shortLabel: 'All', count: pool.length }, ...ordered]
  }, [compact, allClubs, joinedClubs, section])

  const filteredClubs = useMemo(() => {
    if (compact) return []
    const pool = section === 'discover' ? allClubs : joinedClubs
    const catLower = category === 'All' ? null : category.toLowerCase()
    const catScoped = catLower ? pool.filter(c => c.category === catLower) : pool
    return rankClubSearch(catScoped, searchQuery)
  }, [compact, allClubs, joinedClubs, section, category, searchQuery])

  const groupedClubs = useMemo(() => {
    if (compact) return []
    const groups = new Map()
    for (const c of filteredClubs) {
      const key = c.category
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(c)
    }
    return CLUB_CATEGORIES.filter(cat => groups.has(cat.id)).map(cat => ({
      ...cat,
      clubs: groups.get(cat.id),
    }))
  }, [compact, filteredClubs])

  const joinedLowerSet = useMemo(
    () => new Set(joinedClubs.map(c => String(c.id).toLowerCase())),
    [joinedClubs]
  )

  const feedPosts = useMemo(() => {
    if (compact || section !== 'updates') return []

    // Lazily build and cache normalized, chronologically sorted hub posts once per hubDict reference
    if (hubPostsCacheRef.current.hubRef !== hubDict) {
      const built = []
      for (const club of Object.values(hubDict || {})) {
        const linksByPostId = new Map()
        for (const lnk of club?.links || []) {
          if (!lnk?.postId) continue
          const pid = String(lnk.postId)
          if (!linksByPostId.has(pid)) linksByPostId.set(pid, [])
          linksByPostId.get(pid).push(lnk)
        }

        const eventsByPostId = new Map()
        for (const evt of club?.events || []) {
          if (!evt?.postId) continue
          const pid = String(evt.postId)
          if (!eventsByPostId.has(pid)) eventsByPostId.set(pid, [])
          eventsByPostId.get(pid).push(evt)
        }

        for (const post of club?.posts || []) {
          if (!isPublicRecord(post)) continue
          const pid = post?.id ? String(post.id) : ''
          built.push(
            buildNormalizedFeedItem(post, {
              club,
              postLinks: pid ? linksByPostId.get(pid) || [] : [],
              postEvents: pid ? eventsByPostId.get(pid) || [] : [],
            })
          )
        }
      }
      built.sort((a, b) => b.postedAtMs - a.postedAtMs)
      hubPostsCacheRef.current = { hubRef: hubDict, items: built }
    }

    const normalizedLocal = localPosts.filter(p => joinedLowerSet.has(String(p.clubId).toLowerCase())).map(p =>
      buildNormalizedFeedItem(p, {
        club: (p?.clubId && hubDict?.[p.clubId]) || null,
        fallbackClubName: p.clubName,
      })
    )
    const allNormalized =
      normalizedLocal.length > 0
        ? [...normalizedLocal, ...hubPostsCacheRef.current.items]
        : hubPostsCacheRef.current.items

    const channels = userSettings?.channels || {}
    const parsedFeedQuery = parseSearchQuery(searchQuery)

    return allNormalized.filter(post => {
      if (selectedSource === 'all') {
        if (post.channel === 'instagram' && channels.instagram === false) return false
        if (post.channel === 'discord' && channels.discord === false) return false
        if (post.channel === 'email' && channels.email === false) return false
      } else if (post.channel !== selectedSource) {
        return false
      }

      if (
        parsedFeedQuery.tokens.length > 0 &&
        !matchesSearchQuery(parsedFeedQuery, {
          primary: [post.title, post.clubName],
          secondary: [post.channel, post.eventLocation],
          tertiary: [post.summary, post.searchHaystack],
        })
      ) {
        return false
      }
      return true
    })
  }, [
    compact,
    section,
    hubDict,
    localPosts,
    joinedLowerSet,
    selectedSource,
    searchQuery,
    userSettings?.channels,
  ])

  // Reset pagination window whenever feed filters or search query change
  useEffect(() => {
    setVisibleFeedCount(FEED_PAGE_SIZE)
  }, [selectedSource, joinedLowerSet, searchQuery])

  const visibleFeedPosts = useMemo(
    () => feedPosts.slice(0, visibleFeedCount),
    [feedPosts, visibleFeedCount]
  )
  const hasMoreFeedPosts = visibleFeedCount < feedPosts.length

  // Smooth progressive loading as the user scrolls near the bottom of Club Feed
  useEffect(() => {
    if (compact || section !== 'updates' || !hasMoreFeedPosts) return
    const node = feedSentinelRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          setVisibleFeedCount(prev => Math.min(prev + FEED_PAGE_SIZE, feedPosts.length))
        }
      },
      { rootMargin: '480px 0px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [compact, section, hasMoreFeedPosts, feedPosts.length])

  async function handlePostUpdateSubmit(e) {
    e.preventDefault()
    if (!postTitle.trim() && !postSummary.trim()) return

    const clubObj = allClubs.find(c => String(c.id) === String(postClubId))
    const clubLabel = clubObj ? cleanText(clubObj.name) : 'Campus Club'
    const cleanHeadline = postTitle.trim()
    const cleanDetails = postSummary.trim()
    const cleanPermalink = normalizeExternalHttpUrl(postPermalink)
    const captionText = [cleanHeadline, cleanDetails].filter(Boolean).join('\n\n')
    const localPrefs = getLocalIntegrationPrefs(accountKey)

    const res = isDemo
      ? null
      : await ingestFromSource(postSource, {
          clubId: String(postClubId),
          clubName: clubLabel,
          title: cleanHeadline || undefined,
          caption: captionText,
          permalink: cleanPermalink || undefined,
          pushDiscord: pushToDiscord ? localPrefs.discordWebhookUrl || true : false,
          pushEmailTo: pushToEmail ? localPrefs.recipientEmail || '' : '',
        })

    if (res && res.success && onRefresh) {
      await onRefresh()
    } else {
      const createdPost = {
        id: `local_post_${Date.now()}`,
        clubId: String(postClubId),
        clubName: clubLabel,
        source: postSource,
        postedAt: new Date().toISOString(),
        title: cleanHeadline || clubLabel,
        caption: captionText,
        summary: cleanDetails || cleanHeadline,
        permalink: cleanPermalink || null,
      }
      if (onAddLocalPost) {
        onAddLocalPost(createdPost)
      } else {
        setInternalLocalPosts(prev => [createdPost, ...prev])
      }

      // Direct client-side outbound push fallback when running without backend
      if (pushToDiscord) {
        dispatchDiscordNotification({
          kind: 'announcement',
          accountKey,
          clubName: clubLabel,
          title: cleanHeadline || `${clubLabel} Update`,
          message: cleanDetails || captionText,
          url: cleanPermalink || window.location.href,
        }).catch(() => {})
      }
      if (pushToEmail) {
        dispatchEmailNotification(
          {
            kind: 'announcement',
            accountKey,
            clubName: clubLabel,
            title: cleanHeadline || `${clubLabel} Update`,
            message: cleanDetails || captionText,
            url: cleanPermalink || window.location.href,
          },
          { allowMailtoFallback: true }
        ).catch(() => {})
      }
    }

    setPostTitle('')
    setPostSummary('')
    setPostPermalink('')
    setShowPostForm(false)
    if (onNotify) {
      const pushedExtra =
        res?.outbound?.discord?.ok || res?.outbound?.email?.ok
          ? ' and pushed to external channel'
          : ''
      onNotify(`Published update to ${clubLabel} feed${pushedExtra}.`)
    }
  }

  async function handleSyncChannelNow(platform) {
    if (!platform || syncingChannel) return
    setSyncingChannel(platform)
    try {
      const res = await syncAllSources(platform)
      if (res && !res.error) {
        if (onRefresh) await onRefresh()
        if (onNotify) {
          const count = Number(res.result?.synced ?? res.synced ?? res.count ?? 0)
          onNotify(
            count > 0
              ? `Synced ${count} ${platform === 'discord' ? 'Discord' : 'Email'} update${count === 1 ? '' : 's'}!`
              : `${platform === 'discord' ? 'Discord' : 'Email'} sync completed — no new updates found.`,
            { type: count > 0 ? 'success' : 'info' }
          )
        }
      } else if (onNotify) {
        onNotify(
          res?.error ||
            `Connect ${platform === 'discord' ? 'Discord' : 'Email'} in Settings -> Integrations to sync live updates.`,
          {
            type: 'info',
            actionLabel: onOpenSettings ? 'Open Integrations' : undefined,
            onAction: onOpenSettings,
          }
        )
      }
    } finally {
      setSyncingChannel('')
    }
  }

  function renderClubCard(club) {
    const name = cleanText(club.name)
    const source = hubDict?.[club.id] || club
    const description = compact ? '' : getClubSummary(
      cleanMultilineText(source.description), cleanMultilineText(source.bio), cleanMultilineText(source.directoryDescription)
    )
    return (
      <ClubPageLink key={club.id} clubId={club.id} onOpen={onOpenClub} aria-label={`View ${name}`}
        className={compact ? 'club-card club-card-preview' : 'club-card club-directory-card'}>
        {compact ? (
          <>
            <ClubAvatar club={club} size={32} />
            <span className="min-w-0 line-clamp-2 text-sm font-medium wrap-anywhere">{name}</span>
            <ArrowRight aria-hidden="true" size={16} className="club-card-cue shrink-0 ml-auto" />
          </>
        ) : (
          <>
            <div className="club-card-meta">
              <ClubAvatar club={club} size={42} />
              <ClubCategoryChip club={club} />
            </div>
            <h3 className="club-card-name font-display">{name}</h3>
            <div className="club-card-summary">
              {description && <p>{description}</p>}
            </div>
            <span className="club-card-cue">View club <ArrowRight aria-hidden="true" size={15} /></span>
          </>
        )}
      </ClubPageLink>
    )
  }

  const clubGridClasses = `club-directory-grid${isCompactDensity ? ' club-directory-compact' : ''}`

  // ── 1. COMPACT OVERVIEW MODE ──────────────────────────────────────
  if (compact) {
    const previewLimit = isCompactDensity ? 4 : 3
    const previewClubs = rankClubSearch(joinedClubs, searchQuery, { limit: previewLimit })
    return (
      <Card className="section-pad space-y-2">
        <div className="dashboard-card-header">
          <h2 className="font-display text-base font-medium">My clubs</h2>
          {joinedClubs.length > 0 && onViewJoined && <Button size="sm" variant="text" onClick={onViewJoined}>View all</Button>}
        </div>
        {previewClubs.length > 0 ? (
          <div className="club-preview-grid">{previewClubs.map(club => renderClubCard(club))}</div>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            {joinedClubs.length > 0 ? 'No joined clubs match your search.' : 'Your joined clubs will appear here.'}
            {!joinedClubs.length && onFindClubs && <Button variant="text" size="sm" onClick={onFindClubs}>Browse clubs</Button>}
          </p>
        )}
      </Card>
    )
  }

  const showGroupedSections =
    !searchQuery.trim() && clubLayout === 'grouped' && category === 'All' && groupedClubs.length > 1

  const communitySections = [
    { id: 'discover', label: 'All clubs' },
    { id: 'myclubs', label: 'Joined' },
    { id: 'updates', label: 'Club feed' },
    { id: 'directory', label: 'People' },
  ]
  function selectCommunitySection(nextSection) {
    if (section !== nextSection) onDismissSearchTarget?.()
    setSection(nextSection)
    setCategory('All')
  }
  const sectionFilterLabel = {
    myclubs: 'Filter clubs',
    discover: 'Filter clubs',
    updates: 'Filter posts',
    directory: 'Filter people',
  }[section]
  const showClubFilters = (section === 'myclubs' || section === 'discover') &&
    (filteredClubs.length > 6 || categoryFilters.length > 1)

  const categoryOptions = categoryFilters.map(cat => ({ value: cat.value, label: `${cat.label} (${cat.count})` }))
  const layoutOptions = [
    { value: 'grouped', label: 'By category' },
    { value: 'grid', label: 'Grid view' },
  ]
  const effectiveLayout = category !== 'All' ? 'grid' : clubLayout
  const showLayout = filteredClubs.length > 6 || category !== 'All'

  function selectLayout(value) {
    setClubLayout(value)
    if (value === 'grouped') setCategory('All')
  }

  return (
    <div className="page-stack destination-accent" data-accent="clubs">
      <PageToolbar title="Clubs" />
      <nav aria-label="Community sections" className="flex flex-wrap items-center gap-1">
        {communitySections.map(tab => (
          <Button key={tab.id} size="sm" variant={section === tab.id ? 'tonal' : 'text-neutral'}
            aria-current={section === tab.id ? 'page' : undefined}
            className="!px-2.5 sm:!px-4"
            onClick={() => selectCommunitySection(tab.id)}>
            {tab.label}
          </Button>
        ))}
      </nav>

      <div className="flex flex-wrap min-h-11 min-w-0 items-center gap-1.5 sm:gap-2">
        {onSearchChange && sectionFilterLabel && (
          <div className="w-44 min-w-0 shrink">
            <SearchBox className="community-filter-field" placeholder={sectionFilterLabel} value={searchQuery} onChange={onSearchChange} />
          </div>
        )}
        {showClubFilters && (
          <>
            <div className="hidden sm:flex flex-wrap items-center gap-2">
              {categoryOptions.length > 1 && (
                <Select aria-label="Category" className="control-select [--select-width:12rem]" value={category}
                  onValueChange={setCategory} options={categoryOptions} search="auto" />
              )}
              {showLayout && (
                <Select aria-label="Layout" className="control-select [--select-width:8rem]" value={effectiveLayout}
                  onValueChange={selectLayout} options={layoutOptions} />
              )}
            </div>
            <ActionDisclosure label="Filters" iconOnly icon={<SlidersHorizontal size={15} />}
              count={Number(category !== 'All')} className="sm:!hidden" panelClassName="filter-popover">
              {() => (
                <div className="grid gap-3">
                  {categoryOptions.length > 1 && (
                    <MenuSelect label="Category" value={category} onValueChange={setCategory} options={categoryOptions} search="auto" />
                  )}
                  {showLayout && (
                    <MenuSelect label="Layout" value={effectiveLayout} onValueChange={selectLayout} options={layoutOptions} />
                  )}
                </div>
              )}
            </ActionDisclosure>
          </>
        )}
        <>
          {section === 'discover' && onFindClubs && <FindClubsButton onClick={onFindClubs} />}
          {section === 'updates' &&
            (joinedClubs.length > 0 ? (
              <Button
                variant="filled"
                size="sm"
                leadingIcon={showPostForm ? <X size={14} /> : <Plus size={14} />}
                onClick={() => setShowPostForm(prev => !prev)}
                className="self-start sm:self-auto"
              >
                {showPostForm ? 'Cancel' : 'Post update'}
              </Button>
            ) : (
              <Button
                variant="tonal"
                size="sm"
                trailingIcon={<ArrowRight size={14} />}
                onClick={() => {
                  setSection('discover')
                  setCategory('All')
                }}
                className="self-start sm:self-auto"
              >
                Browse clubs
              </Button>
            ))}

        </>
      </div>

      {section === 'updates' && selectedAnnouncement && (
        <SearchDestination key={searchTarget.revision} heading={selectedAnnouncement.title}
          onDismiss={onDismissSearchTarget} dismissLabel="Close announcement">
          <div className="flex flex-wrap items-center gap-2">
            <BubbleTag label={selectedAnnouncement.type} color={selectedAnnouncement.color} size="sm" />
            <span className="text-xs text-[var(--text-muted)]">{selectedAnnouncement.time}</span>
          </div>
          {selectedAnnouncement.description && <p className="text-sm whitespace-pre-wrap wrap-anywhere">{selectedAnnouncement.description}</p>}
        </SearchDestination>
      )}

      {/* ── SECTION 1 & 2: MY CLUBS / DISCOVER ── */}
      {(section === 'myclubs' || section === 'discover') && (
        <>
          {filteredClubs.length > 0 ? (
            showGroupedSections ? (
              <div className={isCompactDensity ? 'space-y-5' : 'space-y-7'}>
                {groupedClubs.map(group => {
                  const defaultCap = isCompactDensity ? 8 : 6
                  const isExpanded = Boolean(expandedCategories[group.id]) || Boolean(searchQuery.trim())
                  const visibleClubs = isExpanded ? group.clubs : group.clubs.slice(0, defaultCap)
                  const hiddenCount = group.clubs.length - visibleClubs.length

                  return (
                    <section key={group.id} className="space-y-3">
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <h3 className="text-sm sm:text-[15px] font-bold text-[var(--text)] truncate">
                            {group.label}
                          </h3>
                          <BubbleTag label={`${group.clubs.length}`} color={group.color} size="sm" />
                        </div>

                        {group.clubs.length > defaultCap && !searchQuery.trim() && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedCategories(prev => ({
                                ...prev,
                                [group.id]: !prev[group.id],
                              }))
                            }
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer shrink-0"
                          >
                            <span>
                              {isExpanded ? 'Show fewer' : `Show all ${group.clubs.length}`}
                            </span>
                            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                        )}
                      </div>

                      <div className={clubGridClasses}>
                        {visibleClubs.map(club => renderClubCard(club))}
                      </div>

                      {hiddenCount > 0 && !searchQuery.trim() && (
                        <div>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedCategories(prev => ({ ...prev, [group.id]: true }))
                            }
                            className="inline-flex items-center gap-1.5 px-3.5 min-h-[32px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] border border-[var(--border)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer transition-colors"
                          >
                            <span>View {hiddenCount} more in {group.shortLabel}</span>
                            <ChevronDown size={13} />
                          </button>
                        </div>
                      )}
                    </section>
                  )
                })}
              </div>
            ) : (
              <div className={clubGridClasses}>
                {filteredClubs.map(club => renderClubCard(club))}
              </div>
            )
          ) : (
            <div className="py-10 text-center space-y-2">
              <div className="text-sm font-semibold text-[var(--text)]">No clubs found</div>
              <p className="text-xs text-[var(--text-muted)]">
                {section === 'myclubs'
                  ? 'Browse all clubs to find a club to join.'
                  : 'Try selecting another category or clearing your search.'}
              </p>
              {section === 'myclubs' && (
                <Button
                  variant="filled"
                  size="md"
                  onClick={() => {
                    setSection('discover')
                    setCategory('All')
                  }}
                  className="mt-2"
                >
                  Browse clubs
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {/* ── SECTION 3: CLUB FEED / UPDATES ── */}
      {section === 'updates' && (
        <div className="space-y-4">
          <Announcements full items={personalAnnouncements} joinedCount={joinedClubs.length}
            userSettings={userSettings} searchQuery={searchQuery} onOpenAnnouncement={onOpenAnnouncement}
            onBrowseClubs={onFindClubs} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="mobile-pill-rail w-full sm:w-auto pb-0.5 sm:pb-0">
              {SOURCE_FILTERS.map(src => {
                const isActive = selectedSource === src.id
                return (
                  <button
                    key={src.id}
                    type="button"
                    onClick={() => setSelectedSource(src.id)}
                    className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-full text-xs font-semibold cursor-pointer border transition-colors ${
                      isActive
                        ? 'bg-[var(--blue-light)] text-[var(--blue-ink)] border-[var(--blue)]/30'
                        : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
                    }`}
                  >
                    <PlatformIcon type={src.id} size={14} />
                    <span>{src.label}</span>
                  </button>
                )
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {Object.keys(expandedPostIds).length > 1 && (
                <button
                  type="button"
                  onClick={() => setExpandedPostIds({})}
                  className="inline-flex items-center gap-1 px-3 min-h-[34px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] border border-[var(--border)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer transition-colors"
                >
                  <span>Collapse all</span>
                  <ChevronUp size={13} />
                </button>
              )}


            </div>
          </div>

          {showPostForm && joinedClubs.length > 0 && (
            <form
              onSubmit={handlePostUpdateSubmit}
              className="p-4 sm:p-5 rounded-2xl content-tile space-y-4 fade-in"
            >
              <div className="text-sm font-bold text-[var(--text)]">Post Club Announcement</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                    Club
                  </label>
                  <Select
                    aria-label="Post club"
                    value={postClubId}
                    onValueChange={setPostClubId}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                    search
                    options={joinedClubs.map(c => ({ value: c.id, label: cleanText(c.name) }))}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                    Channel
                  </label>
                  <Select
                    aria-label="Post source"
                    value={postSource}
                    onValueChange={setPostSource}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                    options={[
                      { value: "discord", label: "Discord" },
                      { value: "instagram", label: "Instagram" },
                      { value: "email", label: "Mailing List" },
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                    Headline
                  </label>
                  <input
                    type="text"
                    required
                    value={postTitle}
                    onChange={e => setPostTitle(e.target.value)}
                    placeholder="e.g. Friday Project Social"
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                    Original Post Link <span className="font-normal text-[var(--text-light)]">(optional)</span>
                  </label>
                  <input
                    type="url"
                    value={postPermalink}
                    onChange={e => setPostPermalink(e.target.value)}
                    placeholder="https://instagram.com/p/... or Discord message link"
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                    Details
                  </label>
                  <textarea
                    rows={3}
                    value={postSummary}
                    onChange={e => setPostSummary(e.target.value)}
                    placeholder="Full post details, meeting time, location, and sign-up links…"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)] resize-y"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-muted)]">
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={pushToDiscord}
                      onChange={e => setPushToDiscord(e.target.checked)}
                      className="rounded accent-[var(--blue)] cursor-pointer"
                    />
                    <PlatformIcon type="discord" size={13} />
                    <span>Also push to connected Discord</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={pushToEmail}
                      onChange={e => setPushToEmail(e.target.checked)}
                      className="rounded accent-[var(--blue)] cursor-pointer"
                    />
                    <PlatformIcon type="email" size={13} />
                    <span>Also send email alert</span>
                  </label>
                </div>

                <Button
                  variant="filled"
                  size="md"
                  type="submit"
                  className="shrink-0"
                >
                  Publish Update
                </Button>
              </div>
            </form>
          )}

          {visibleFeedPosts.length > 0 ? (
            <>
              <div
                className={`grid grid-cols-1 md:grid-cols-2 items-start ${
                  isCompactDensity ? 'gap-2.5' : 'gap-4'
                }`}
              >
                {visibleFeedPosts.map(post => (
                  <FeedPostCard
                    key={post.id}
                    post={post}
                    isCompactDensity={isCompactDensity}
                    isExpanded={Boolean(expandedPostIds[post.id])}
                    use24h={use24h}
                    onToggleExpand={handleToggleFeedPost}
                    onOpenClub={onOpenClub}
                  />
                ))}
              </div>

              {hasMoreFeedPosts && (
                <div ref={feedSentinelRef} className="pt-2 flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleFeedCount(prev => Math.min(prev + FEED_PAGE_SIZE, feedPosts.length))
                    }
                    className="inline-flex items-center gap-1.5 px-4 min-h-[36px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] border border-[var(--border)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer transition-colors"
                  >
                    <span>
                      Load more updates ({visibleFeedPosts.length.toLocaleString()} of{' '}
                      {feedPosts.length.toLocaleString()})
                    </span>
                    <ChevronDown size={14} />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="py-10 px-4 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-center space-y-3">
              <div className="text-xs font-medium text-[var(--text-muted)]">
                {selectedSource === 'discord'
                  ? 'No Discord announcements match the current filter yet.'
                  : selectedSource === 'email'
                    ? 'No club mailing list emails match the current filter yet.'
                    : 'No updates match the current filter.'}
              </div>
              {(selectedSource === 'discord' || selectedSource === 'email') && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    variant="filled"
                    size="sm"
                    pending={syncingChannel === selectedSource} pendingLabel="Syncing…"
                    onClick={() => handleSyncChannelNow(selectedSource)}
                    leadingIcon={
                      <RefreshCw
                        size={13}
                        className={syncingChannel === selectedSource ? 'animate-spin' : ''}
                      />
                    }
                  >
                    {`Sync ${selectedSource === 'discord' ? 'Discord' : 'Email'} Now`}
                  </Button>
                  {onOpenSettings && (
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      className="inline-flex items-center gap-1.5 px-3.5 min-h-[34px] rounded-xl bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--blue)] text-xs font-semibold cursor-pointer transition-colors"
                    >
                      <Settings size={13} className="text-[var(--text-muted)]" />
                      <span>Configure Integration</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {section === 'directory' && (
        <div className="space-y-3">
          {people.length ? (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {people.slice(0, visiblePeopleCount).map(person => (
                <li key={person.id} className="content-tile rounded-xl p-3">
                  <ClubPageLink clubId={person.clubId} section="members" personId={person.rosterId} onOpen={onOpenClub}
                    className="ui-touch inline-flex min-h-9 items-center text-sm font-medium text-[var(--blue-ink)] hover:underline">
                    {person.name}
                  </ClubPageLink>
                  <p className="text-xs text-[var(--text-muted)]">{person.role} · {person.club}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">{searchQuery.trim() ? 'No published people match your search.' : 'No published roster entries are available.'}</p>
          )}
          {people.length > visiblePeopleCount && <Button variant="outlined-neutral" size="sm"
            onClick={() => setVisiblePeopleCount(count => count + 36)}>Show more people</Button>}
        </div>
      )}
    </div>
  )
}
