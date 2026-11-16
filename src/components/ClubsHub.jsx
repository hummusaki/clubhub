import Select from './Select'
import SearchDestination from './SearchDestination'
import { FindClubsButton } from './ClubDiscoveryDialog'
import { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react'
import {
  Calendar,
  Check,
  Plus,
  Mail,
  Copy,
  Clock,
  Users,
  Shield,
  ArrowRight,
  UserPlus,
  X,
  Layers,
  LayoutGrid,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MapPin,
  Building2,
  Search,
  GraduationCap,
  Trash2,
  RotateCcw,
  RefreshCw,
  Settings,
  SlidersHorizontal,
} from 'lucide-react'
import {
  clubs as defaultClubs,
  boardMembers as initialOfficers,
  memberActivity as initialMembers,
} from '../data/sampleData'
import {
  Card,
  PageToolbar,
  SearchBox,
  ActionDisclosure,
  ClubAvatar,
  Avatar,
  BubbleTag,
  IconBadge,
  cleanText,
  cleanMultilineText,
  Button,
  IconButton,
  SegmentedControl,
  FilterChip,
  Tabs,
} from './ui'
import { PlatformIcon } from './icons'
import { ingestFromSource, syncAllSources, getStaticSnapshot } from '../api/client'
import IntegrationsPanel from './IntegrationsPanel'
import {
  getLocalIntegrationPrefs,
  dispatchDiscordNotification,
  dispatchEmailNotification,
} from '../utils/directIntegrations'
import {
  CLUB_CATEGORIES,
  categorizeClub,
  getClubCategoryMeta,
} from '../utils/clubCategories'
import { buildClubDirectoryData, toInitials } from '../utils/clubDirectory'
import { filterAndRankBySearch, matchesSearchQuery, parseSearchQuery, rankClubSearch } from '../utils/search'
import ClubRbacPanel from './ClubRbacPanel'

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
            <span className="text-xs font-semibold text-[var(--blue-ink)] truncate">
              {post.cleanClubName}
            </span>
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

function loadCustomRoster() {
  return { officers: [], members: [] }
}

function clubMatchesFilter(personClubName, personClubId, selectedClubFilter) {
  if (!selectedClubFilter || selectedClubFilter === 'all') return true
  if (personClubId && String(personClubId) === String(selectedClubFilter)) return true
  const pLower = String(personClubName || '').toLowerCase()
  const fLower = String(selectedClubFilter).toLowerCase()
  if (pLower && fLower && (pLower.includes(fLower) || fLower.includes(pLower))) return true
  return false
}

// ── Searchable Club Picker Combobox for Officers & Members Directory ──
function DirectoryClubPicker({
  allClubs = [],
  joinedClubs = [],
  clubPeopleCounts = new Map(),
  selectedClubId = 'all',
  onSelectClub,
  totalListedPeople = 0,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  const selectedClub = useMemo(
    () =>
      selectedClubId !== 'all'
        ? allClubs.find(c => String(c.id) === String(selectedClubId)) || null
        : null,
    [allClubs, selectedClubId]
  )

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      inputRef.current?.focus()
    }, 15)

    function handleOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    window.addEventListener('keydown', handleKey)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleOutside)
      window.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const { joinedMatches, rosterMatches, contactMatches } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const joinedSet = new Set(joinedClubs.map(c => String(c.id)))

    const parsedPickerQuery = parseSearchQuery(query)
    const matchesQuery = c => {
      if (parsedPickerQuery.tokens.length === 0) return true
      return matchesSearchQuery(parsedPickerQuery, {
        primary: [cleanText(c.name || ''), c.abbr, ...(c.alsoKnownAs || [])],
        secondary: [c.instagram, c.id, c.categoryLabel],
      })
    }

    const joinedList = joinedClubs
      .filter(matchesQuery)
      .sort(
        (a, b) =>
          (clubPeopleCounts.get(String(b.id)) || 0) - (clubPeopleCounts.get(String(a.id)) || 0) ||
          cleanText(a.name).localeCompare(cleanText(b.name))
      )

    const rosterList = []
    const contactList = []

    for (const c of allClubs) {
      const cid = String(c.id)
      if (joinedSet.has(cid) || !matchesQuery(c)) continue
      const count = clubPeopleCounts.get(cid) || 0
      if (count > 0) rosterList.push(c)
      else contactList.push(c)
    }

    rosterList.sort(
      (a, b) =>
        (clubPeopleCounts.get(String(b.id)) || 0) - (clubPeopleCounts.get(String(a.id)) || 0) ||
        cleanText(a.name).localeCompare(cleanText(b.name))
    )
    contactList.sort((a, b) => cleanText(a.name).localeCompare(cleanText(b.name)))

    return {
      joinedMatches: joinedList,
      rosterMatches: rosterList,
      contactMatches: contactList,
    }
  }, [allClubs, joinedClubs, clubPeopleCounts, query])

  const firstMatchClub = joinedMatches[0] || rosterMatches[0] || contactMatches[0] || null

  function chooseClub(nextId) {
    onSelectClub(nextId)
    setOpen(false)
    setQuery('')
  }

  function renderOptionRow(club) {
    const cid = String(club.id)
    const isSelected = String(selectedClubId) === cid
    const count = clubPeopleCounts.get(cid) || 0

    return (
      <button
        key={cid}
        type="button"
        onClick={() => chooseClub(cid)}
        className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl text-left border-none cursor-pointer transition-colors ${
          isSelected
            ? 'bg-[var(--blue-light)] text-[var(--blue-ink)]'
            : 'bg-transparent text-[var(--text)] hover:bg-[var(--bg-surface)]'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <ClubAvatar club={club} size={24} className="!rounded-[7px]" />
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate">{cleanText(club.name)}</div>
            <div className="text-[10.5px] text-[var(--text-muted)] truncate">
              {club.instagram ? `@${club.instagram}` : club.categoryLabel || 'Campus Club'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {count > 0 ? (
            <span
              className={`px-2 py-0.5 rounded-full text-[10.5px] font-mono-num font-semibold ${
                isSelected
                  ? 'bg-[var(--bg-card)] text-[var(--blue-ink)]'
                  : 'bg-[var(--bg-tile)] text-[var(--text-muted)] border border-[var(--border)]'
              }`}
            >
              {count}
            </span>
          ) : (
            <span className="text-[10px] font-medium text-[var(--text-light)]">Contact</span>
          )}
          {isSelected && <Check size={13} className="text-[var(--blue-ink)]" />}
        </div>
      </button>
    )
  }

  return (
    <div ref={containerRef} className="relative w-full sm:w-auto">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen(prev => !prev)}
          aria-expanded={open}
          aria-label="Filter directory by club"
          className={`w-full sm:w-auto sm:min-w-[235px] sm:max-w-[300px] min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer transition-all ${
            selectedClub
              ? 'bg-[var(--blue-light)] text-[var(--blue-ink)] border-[var(--blue)]/40 shadow-2xs'
              : 'bg-[var(--bg-tile)] hover:bg-[var(--bg-tile-hover)] text-[var(--text)] border-[var(--border-tile)] hover:border-[var(--border-strong)] shadow-2xs'
          }`}
        >
          <span className="flex items-center gap-2 min-w-0">
            {selectedClub ? (
              <ClubAvatar club={selectedClub} size={20} className="!rounded-[6px]" />
            ) : (
              <Building2 size={14} className="text-[var(--blue)] shrink-0" />
            )}
            <span className="truncate">
              {selectedClub ? cleanText(selectedClub.name) : `Filter by Club (${allClubs.length})`}
            </span>
          </span>

          <ChevronDown
            size={14}
            className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${
              selectedClub ? 'text-[var(--blue-ink)]' : 'text-[var(--text-muted)]'
            }`}
          />
        </button>

        {selectedClub && (
          <button
            type="button"
            onClick={() => chooseClub('all')}
            title="Clear club filter"
            aria-label="Clear club filter"
            className="w-[38px] h-[38px] rounded-xl bg-[var(--bg-tile)] hover:bg-[var(--bg-tile-hover)] border border-[var(--border-tile)] hover:border-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--text)] flex items-center justify-center cursor-pointer shrink-0 transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 sm:left-auto sm:right-0 top-full mt-1.5 sm:w-[350px] rounded-[var(--radius)] bg-[var(--bg-card)] border border-[var(--border-strong)] shadow-[var(--shadow-lg)] p-2 z-50 fade-in">
          {/* Instant Club Search Input */}
          <div className="flex items-center gap-2 px-3 min-h-[38px] rounded-xl bg-[var(--bg-tile)] border border-[var(--border-tile)] focus-within:border-[var(--blue)] mb-2">
            <Search size={14} className="text-[var(--text-light)] shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && query.trim() && firstMatchClub) {
                  e.preventDefault()
                  chooseClub(String(firstMatchClub.id))
                }
              }}
              placeholder={`Search ${allClubs.length} clubs or @handles…`}
              className="w-full min-w-0 bg-transparent border-none outline-none text-base sm:text-xs text-[var(--text)] placeholder:text-[var(--text-light)]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear club search"
                className="p-0.5 bg-transparent border-none text-[var(--text-light)] hover:text-[var(--text)] cursor-pointer flex items-center"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="max-h-[310px] overflow-y-auto space-y-2 pr-0.5">
            {!query.trim() && (
              <button
                type="button"
                onClick={() => chooseClub('all')}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left border-none cursor-pointer transition-colors ${
                  selectedClubId === 'all'
                    ? 'bg-[var(--blue-light)] text-[var(--blue-ink)] font-semibold'
                    : 'bg-transparent text-[var(--text)] hover:bg-[var(--bg-surface)] font-medium'
                }`}
              >
                <span className="flex items-center gap-2 text-xs">
                  <Building2 size={14} className="text-[var(--blue)] shrink-0" />
                  <span>All Campus Clubs</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-[10.5px] font-mono-num text-[var(--text-muted)]">
                    {totalListedPeople} people
                  </span>
                  {selectedClubId === 'all' && <Check size={13} className="text-[var(--blue-ink)]" />}
                </span>
              </button>
            )}

            {joinedMatches.length > 0 && (
              <div className="space-y-0.5">
                <div className="px-2.5 pt-1.5 pb-0.5 text-xs font-medium text-[var(--text-muted)]">
                  My joined clubs ({joinedMatches.length})
                </div>
                {joinedMatches.map(renderOptionRow)}
              </div>
            )}

            {rosterMatches.length > 0 && (
              <div className="space-y-0.5">
                <div className="px-2.5 pt-1.5 pb-0.5 text-xs font-medium text-[var(--text-muted)]">
                  Clubs with listed roster ({rosterMatches.length})
                </div>
                {rosterMatches.map(renderOptionRow)}
              </div>
            )}

            {contactMatches.length > 0 && (
              <div className="space-y-0.5">
                <div className="px-2.5 pt-1.5 pb-0.5 text-xs font-medium text-[var(--text-muted)]">
                  Official club contacts ({contactMatches.length})
                </div>
                {contactMatches.map(renderOptionRow)}
              </div>
            )}

            {joinedMatches.length === 0 &&
              rosterMatches.length === 0 &&
              contactMatches.length === 0 && (
                <div className="py-6 text-center text-xs text-[var(--text-muted)]">
                  No clubs match &ldquo;{query.trim()}&rdquo;
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ClubsHub({
  user = null,
  accountKey = 'guest',
  items,
  clubsData,
  hubDict = {},
  events = [],
  calendarIntegration = null,
  initialSection = null,
  initialRbacClubId = '',
  isDemo = false,
  userSettings = {},
  onToggleJoin,
  onOpenTasks,
  onRefreshAnnouncements,
  searchQuery = '',
  onSearchChange,
  searchTarget,
  onDismissSearchTarget,
  publicPeople = [],
  selectedAnnouncement,
  onFindClubs,
  onMembershipConfirmed,
  compact = false,
  onOpenClubs,
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
  ) // 'myclubs' | 'rbac' | 'discover' | 'updates' | 'directory'

  useEffect(() => {
    if (initialSection) setSection(initialSection)
  }, [initialSection, searchTarget?.revision])

  useEffect(() => {
    if (initialRbacClubId) setDirectoryClubFilter(String(initialRbacClubId))
  }, [initialRbacClubId])
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

  // Directory filters & state
  const DIRECTORY_PAGE_SIZE = 36
  const DIRECTORY_CLUB_GROUP_PAGE_SIZE = 16
  const [roleFilter, setRoleFilter] = useState('all') // 'all' | 'officers' | 'members'
  const [directoryScope, setDirectoryScope] = useState('all') // 'all' | 'myclubs'
  const [directoryClubFilter, setDirectoryClubFilter] = useState('all')
  const [rbacInitialSeat, setRbacInitialSeat] = useState({ seatId: '', roleTitle: '' })
  const [directoryCategory, setDirectoryCategory] = useState('All')
  const [directoryGroupMode, setDirectoryGroupMode] = useState('role') // 'role' | 'club'
  const [visibleOfficersCount, setVisibleOfficersCount] = useState(DIRECTORY_PAGE_SIZE)
  const [visibleMembersCount, setVisibleMembersCount] = useState(DIRECTORY_PAGE_SIZE)
  const [visibleClubGroupsCount, setVisibleClubGroupsCount] = useState(
    DIRECTORY_CLUB_GROUP_PAGE_SIZE
  )
  const [copiedEmailId, setCopiedEmailId] = useState(null)
  const [customRoster, setCustomRoster] = useState(() => loadCustomRoster(isDemo))

  // Add Person to Directory form
  const [showAddPersonForm, setShowAddPersonForm] = useState(false)
  const [personName, setPersonName] = useState('')
  const [personEmail, setPersonEmail] = useState('')
  const [personType, setPersonType] = useState('officer') // 'officer' | 'member'
  const [personRoleTitle, setPersonRoleTitle] = useState('')
  const [personClubId, setPersonClubId] = useState(
    () => joinedClubs[0]?.id || allClubs[0]?.id || 'demo_ucsc_csclub'
  )
  const [personMajor, setPersonMajor] = useState('')
  const [personOfficeHours, setPersonOfficeHours] = useState('')

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
    const fallbackPersonId = joinedClubs[0]?.id || allClubs[0]?.id
    if (fallbackPersonId && !allClubs.some(c => String(c.id) === String(personClubId))) {
      setPersonClubId(String(fallbackPersonId))
    }
    const fallbackPostId = joinedClubs[0]?.id || ''
    if (!joinedClubs.some(c => String(c.id) === String(postClubId))) {
      setPostClubId(fallbackPostId ? String(fallbackPostId) : '')
    }
  }, [allClubs, joinedClubs, personClubId, postClubId])

  // Keep Add Form pre-synced to active club filter when filtering by a specific club
  useEffect(() => {
    if (
      directoryClubFilter !== 'all' &&
      allClubs.some(c => String(c.id) === String(directoryClubFilter))
    ) {
      setPersonClubId(String(directoryClubFilter))
    }
  }, [directoryClubFilter, allClubs])

  useEffect(() => {
    if (directoryScope === 'myclubs' && joinedClubs.length === 0) {
      setDirectoryScope('all')
    }
  }, [directoryScope, joinedClubs.length])

  const selectedDirectoryClub = useMemo(
    () =>
      directoryClubFilter !== 'all'
        ? allClubs.find(c => String(c.id) === String(directoryClubFilter)) || null
        : null,
    [allClubs, directoryClubFilter]
  )

  const localPosts = externalLocalPosts ?? internalLocalPosts
  const isCompactDensity = Boolean(userSettings?.compactCards)
  const use24h = userSettings?.timeFormat === '24h'

  useEffect(() => {
    if (compact || !onPageContextChange) return
    let label = `My Clubs (${joinedClubs.length})`
    if (section === 'discover') {
      if (category !== 'All') {
        const catMeta = getClubCategoryMeta(category)
        label = `Discover · ${catMeta.shortLabel || catMeta.label}`
      } else {
        label = 'Discover Clubs'
      }
    } else if (section === 'updates') {
      label = 'Club Updates'
    } else if (section === 'directory') {
      label = selectedDirectoryClub
        ? `${cleanText(selectedDirectoryClub.name)} Roster`
        : 'Officers & Members'
    }
    onPageContextChange({
      nav: 'clubs',
      label,
      modal: showPostForm ? 'post' : showAddPersonForm ? 'person' : null,
    })
  }, [
    compact,
    onPageContextChange,
    section,
    category,
    joinedClubs.length,
    selectedDirectoryClub,
    showPostForm,
    showAddPersonForm,
  ])

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

  const joinedIdSet = useMemo(
    () => new Set(joinedClubs.map(c => String(c.id))),
    [joinedClubs]
  )

  const joinedLowerSet = useMemo(
    () => new Set(joinedClubs.map(c => String(c.id).toLowerCase())),
    [joinedClubs]
  )

  const feedPosts = useMemo(() => {
    if (compact || section !== 'updates' || joinedLowerSet.size === 0) return []

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

    const normalizedLocal = localPosts.map(p =>
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
      if (
        !post.clubIdStr ||
        (!joinedIdSet.has(post.clubIdStr) && !joinedLowerSet.has(post.clubIdStr.toLowerCase()))
      ) {
        return false
      }

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
    joinedIdSet,
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

  const directoryData = useMemo(
    () =>
      compact
        ? { officers: [], members: [], clubPeopleCounts: new Map() }
        : buildClubDirectoryData({
            allClubs,
            hubDict,
            customRoster,
            initialOfficers,
            initialMembers,
            user,
            userSettings,
            isDemo,
          }),
    [compact, allClubs, hubDict, customRoster, user, userSettings, isDemo]
  )

  const allOfficers = directoryData.officers
  const allMembers = directoryData.members
  const clubPeopleCounts = directoryData.clubPeopleCounts

  // Pre-category scoped lists (applies Scope + Specific Club + Search Query so category pills show live counts)
  const { preCatOfficers, preCatMembers } = useMemo(() => {
    if (compact || section !== 'directory') {
      return { preCatOfficers: allOfficers, preCatMembers: allMembers }
    }
    const scopeToJoined =
      directoryClubFilter === 'all' && directoryScope === 'myclubs' && joinedIdSet.size > 0

    const scopedOfficers = allOfficers.filter(m => {
      if (directoryClubFilter !== 'all') {
        const matchById = String(m.clubId || '') === String(directoryClubFilter)
        const matchByName =
          selectedDirectoryClub &&
          clubMatchesFilter(m.club, m.clubId, selectedDirectoryClub.name)
        if (!matchById && !matchByName) return false
      } else if (scopeToJoined) {
        if (!m.clubId || !joinedIdSet.has(String(m.clubId))) return false
      }
      return true
    })

    const nextOfficers = filterAndRankBySearch(scopedOfficers, searchQuery, m => ({
      primary: [m.name, m.role],
      secondary: [m.club, m.email, m.categoryLabel],
      tertiary: [m.major],
    }))

    const scopedMembers = allMembers.filter(m => {
      if (directoryClubFilter !== 'all') {
        const inSelectedClub = (m.clubs || []).some(
          c =>
            String(c.clubId || '') === String(directoryClubFilter) ||
            (selectedDirectoryClub &&
              clubMatchesFilter(c.label, c.clubId, selectedDirectoryClub.name))
        )
        if (!inSelectedClub) return false
      } else if (scopeToJoined) {
        const inJoinedClub = (m.clubs || []).some(
          c => c.clubId && joinedIdSet.has(String(c.clubId))
        )
        if (!inJoinedClub) return false
      }
      return true
    })

    const nextMembers = filterAndRankBySearch(scopedMembers, searchQuery, m => ({
      primary: [m.name, m.role],
      secondary: [...(m.clubs || []).map(c => c.label), m.email],
      tertiary: [m.major],
    }))

    return { preCatOfficers: nextOfficers, preCatMembers: nextMembers }
  }, [
    compact,
    section,
    allOfficers,
    allMembers,
    directoryClubFilter,
    directoryScope,
    joinedIdSet,
    selectedDirectoryClub,
    searchQuery,
  ])

  const directoryCategoryFilters = useMemo(() => {
    const counts = new Map()
    const includeOfficers = roleFilter === 'all' || roleFilter === 'officers'
    const includeMembers = roleFilter === 'all' || roleFilter === 'members'

    if (includeOfficers) {
      for (const o of preCatOfficers) {
        if (!o.category) continue
        counts.set(o.category, (counts.get(o.category) || 0) + 1)
      }
    }
    if (includeMembers) {
      for (const m of preCatMembers) {
        const memberCats = new Set((m.clubs || []).map(c => c.category).filter(Boolean))
        for (const catId of memberCats) {
          counts.set(catId, (counts.get(catId) || 0) + 1)
        }
      }
    }

    const totalCount =
      (includeOfficers ? preCatOfficers.length : 0) +
      (includeMembers ? preCatMembers.length : 0)

    const items = CLUB_CATEGORIES.filter(cat => (counts.get(cat.id) || 0) > 0).map(cat => ({
      value: cat.id,
      label: cat.shortLabel || cat.label,
      color: cat.color,
      count: counts.get(cat.id) || 0,
    }))

    return [{ value: 'All', label: 'All Categories', color: 'blue', count: totalCount }, ...items]
  }, [preCatOfficers, preCatMembers, roleFilter])

  // Auto-reset directoryCategory if current category has 0 people after scope/role change
  useEffect(() => {
    if (
      directoryCategory !== 'All' &&
      !directoryCategoryFilters.some(f => f.value === directoryCategory)
    ) {
      setDirectoryCategory('All')
    }
  }, [directoryCategory, directoryCategoryFilters])

  const filteredOfficers = useMemo(() => {
    if (directoryCategory === 'All' || directoryClubFilter !== 'all') return preCatOfficers
    return preCatOfficers.filter(m => m.category === directoryCategory)
  }, [preCatOfficers, directoryCategory, directoryClubFilter])

  const filteredMembers = useMemo(() => {
    if (directoryCategory === 'All' || directoryClubFilter !== 'all') return preCatMembers
    return preCatMembers.filter(m =>
      (m.clubs || []).some(c => c.category === directoryCategory)
    )
  }, [preCatMembers, directoryCategory, directoryClubFilter])

  // Reset progressive directory slices whenever directory filters or search change
  useEffect(() => {
    setVisibleOfficersCount(DIRECTORY_PAGE_SIZE)
    setVisibleMembersCount(DIRECTORY_PAGE_SIZE)
    setVisibleClubGroupsCount(DIRECTORY_CLUB_GROUP_PAGE_SIZE)
  }, [
    directoryClubFilter,
    directoryScope,
    directoryCategory,
    roleFilter,
    directoryGroupMode,
    searchQuery,
  ])

  // Grouped-by-Club directory sections for "By Club" mode
  const groupedDirectoryByClub = useMemo(() => {
    if (directoryGroupMode !== 'club' || directoryClubFilter !== 'all') return []
    const clubById = new Map(allClubs.map(c => [String(c.id), c]))
    const groups = new Map()

    function ensureGroup(clubId, fallbackName = 'Campus Club') {
      const key = clubId ? String(clubId) : fallbackName.toLowerCase()
      if (!groups.has(key)) {
        const clubObj = (clubId && clubById.get(String(clubId))) || {
          id: key,
          name: fallbackName,
          abbr: toInitials(fallbackName),
          category: categorizeClub({ name: fallbackName }),
        }
        groups.set(key, {
          key,
          club: clubObj,
          clubName: cleanText(clubObj.name || fallbackName),
          officers: [],
          members: [],
        })
      }
      return groups.get(key)
    }

    if (roleFilter === 'all' || roleFilter === 'officers') {
      for (const o of filteredOfficers) {
        ensureGroup(o.clubId, o.club).officers.push(o)
      }
    }

    if (roleFilter === 'all' || roleFilter === 'members') {
      for (const m of filteredMembers) {
        for (const c of m.clubs || []) {
          if (
            directoryScope === 'myclubs' &&
            directoryClubFilter === 'all' &&
            joinedIdSet.size > 0 &&
            (!c.clubId || !joinedIdSet.has(String(c.clubId)))
          ) {
            continue
          }
          if (
            directoryCategory !== 'All' &&
            directoryClubFilter === 'all' &&
            c.category !== directoryCategory
          ) {
            continue
          }
          ensureGroup(c.clubId, c.label).members.push(m)
        }
      }
    }

    return Array.from(groups.values())
      .filter(g => g.officers.length > 0 || g.members.length > 0)
      .sort((a, b) => {
        const aJoined = joinedIdSet.has(String(a.key)) ? 1 : 0
        const bJoined = joinedIdSet.has(String(b.key)) ? 1 : 0
        if (aJoined !== bJoined) return bJoined - aJoined
        const totalDiff =
          b.officers.length + b.members.length - (a.officers.length + a.members.length)
        if (totalDiff !== 0) return totalDiff
        return a.clubName.localeCompare(b.clubName)
      })
  }, [
    directoryGroupMode,
    directoryClubFilter,
    allClubs,
    roleFilter,
    filteredOfficers,
    filteredMembers,
    directoryScope,
    joinedIdSet,
    directoryCategory,
  ])

  // Official Club Board Contacts surfaced when searching by club name or viewing joined clubs without named officers
  const matchingClubContacts = useMemo(() => {
    if (directoryClubFilter !== 'all') return []
    const listedOfficerClubIds = new Set(filteredOfficers.map(o => String(o.clubId || '')))
    const q = searchQuery.trim().toLowerCase()

    if (q) {
      const candidates = allClubs.filter(
        c =>
          c.email &&
          !listedOfficerClubIds.has(String(c.id)) &&
          (directoryCategory === 'All' || c.category === directoryCategory)
      )
      return rankClubSearch(candidates, searchQuery, { limit: 6 })
    }

    if (directoryScope === 'myclubs' && joinedClubs.length > 0 && roleFilter !== 'members') {
      return joinedClubs.filter(
        c =>
          c.email &&
          !listedOfficerClubIds.has(String(c.id)) &&
          (directoryCategory === 'All' || c.category === directoryCategory)
      )
    }

    return []
  }, [
    directoryClubFilter,
    filteredOfficers,
    searchQuery,
    allClubs,
    directoryCategory,
    directoryScope,
    joinedClubs,
    roleFilter,
  ])

  async function handleCopyEmail(personId, emailAddr) {
    if (!emailAddr) return
    try {
      await navigator.clipboard.writeText(emailAddr)
    } catch {
      // Ignore clipboard fallback
    }
    setCopiedEmailId(personId)
    setTimeout(() => {
      setCopiedEmailId(prev => (prev === personId ? null : prev))
    }, 2000)
    if (onNotify) {
      onNotify(`Copied ${emailAddr}`)
    }
  }

  function handleOpenClubRoster(clubId) {
    setSection('directory')
    setDirectoryClubFilter(String(clubId))
    setDirectoryCategory('All')
    setRoleFilter('all')
  }

  function handleSelectDirectoryClub(nextClubId) {
    setDirectoryClubFilter(String(nextClubId))
    if (nextClubId !== 'all') {
      setDirectoryCategory('All')
    }
  }

  function handleResetDirectoryFilters() {
    setDirectoryClubFilter('all')
    setDirectoryScope('all')
    setDirectoryCategory('All')
    setRoleFilter('all')
  }

  function handleOpenAddPersonForClub(targetClubId = null, defaultType = null) {
    if (targetClubId && allClubs.some(c => String(c.id) === String(targetClubId))) {
      setPersonClubId(String(targetClubId))
    } else if (
      directoryClubFilter !== 'all' &&
      allClubs.some(c => String(c.id) === String(directoryClubFilter))
    ) {
      setPersonClubId(String(directoryClubFilter))
    }
    if (defaultType) {
      setPersonType(defaultType)
    } else if (roleFilter === 'members') {
      setPersonType('member')
    } else if (roleFilter === 'officers') {
      setPersonType('officer')
    }
    setShowAddPersonForm(true)
  }

  function handleRemoveCustomPerson(personId, kind = 'officer') {
    const nextRoster = {
      officers:
        kind === 'officer'
          ? (customRoster.officers || []).filter(o => o.id !== personId)
          : customRoster.officers || [],
      members:
        kind === 'member'
          ? (customRoster.members || []).filter(m => m.id !== personId)
          : customRoster.members || [],
    }
    setCustomRoster(nextRoster)
    if (onNotify) {
      onNotify('Removed custom entry from session directory.', { type: 'info' })
    }
  }

  function handleAddPersonSubmit(e) {
    e.preventDefault()
    const cleanName = personName.trim()
    const cleanEmail = personEmail.trim()
    if (!cleanName || !cleanEmail) return

    const clubObj = allClubs.find(c => String(c.id) === String(personClubId))
    const clubLabel = clubObj ? cleanText(clubObj.name) : 'Campus Club'
    const catMeta = getClubCategoryMeta(clubObj?.category || clubObj)
    const accentColor = catMeta?.color || 'blue'
    const initials = toInitials(cleanName)

    const nextRoster = { ...customRoster }
    if (personType === 'officer') {
      const newOfficer = {
        id: `custom_off_${Date.now()}`,
        name: cleanName,
        initials,
        role: personRoleTitle.trim() || 'Officer',
        club: clubLabel,
        clubId: String(personClubId),
        major: personMajor.trim() || '',
        color: accentColor,
        email: cleanEmail,
        isBoardEmail: false,
        office: personOfficeHours.trim() || '',
      }
      nextRoster.officers = [newOfficer, ...(nextRoster.officers || [])]
    } else {
      const newMember = {
        id: `custom_mem_${Date.now()}`,
        name: cleanName,
        initials,
        email: cleanEmail,
        role: personRoleTitle.trim() || 'Active Member',
        major: personMajor.trim() || 'UCSC Undergraduate',
        avatarBg: clubObj?.avatarBg || '#1A73E8',
        clubs: [{ label: clubLabel, clubId: String(personClubId), color: accentColor }],
        joined: 'Nov 2026',
      }
      nextRoster.members = [newMember, ...(nextRoster.members || [])]
    }

    setCustomRoster(nextRoster)

    setPersonName('')
    setPersonEmail('')
    setPersonRoleTitle('')
    setPersonMajor('')
    setPersonOfficeHours('')
    setShowAddPersonForm(false)
    if (onNotify) {
      onNotify(`Added ${cleanName} to ${clubLabel} directory.`)
    }
  }

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

  function renderClubCard(club, expandDetails = false) {
    const isJoined = Boolean(club.joined)
    const clubLinks = hubDict?.[club.id]?.links || []
    const discordInvite = clubLinks.find(
      l =>
        l?.url &&
        (String(l.kind || '').toLowerCase() === 'discord' ||
          /discord\.(?:gg|com\/invite)\//i.test(String(l.url)))
    )
    const clubDiscordUrl = normalizeExternalHttpUrl(club.discordUrl || discordInvite?.url || '')
    const clubEmailAddr = !isDemoClubId(club.id) && club.email ? String(club.email).trim() : ''

    const title = cleanText(club.name)
    const openClub = compact
      ? () => onOpenClubs?.({ section: 'directory', clubId: club.id })
      : () => handleOpenClubRoster(club.id)

    return (
      <article key={club.id} className="content-tile rounded-[var(--radius-sm)] px-2 py-2 sm:px-3 min-w-0">
        <div className="flex items-center gap-2">
          <ClubAvatar club={club} size={32} />
          <div className="min-w-0 flex-1">
            <button type="button" onClick={openClub}
              className="ui-touch text-left text-sm font-medium leading-snug break-words text-[var(--text)] hover:text-[var(--blue)] hover:underline">
              {title}
            </button>
            <div className="text-xs text-[var(--text-muted)]">
              {club.members != null && `${club.members} ${club.members === 1 ? 'member' : 'members'}`}
              {club.members != null && club.categoryLabel && ' · '}
              {club.categoryLabel}
            </div>
          </div>
          {onToggleJoin && (
            <Button size="sm" variant={isJoined ? 'tonal' : 'outlined'} className="!px-2.5"
              ariaLabel={isJoined ? `Leave ${title}` : `Join ${title}`}
              icon={isJoined ? <Check size={13} /> : undefined}
              onClick={async () => {
                if (await onToggleJoin(club.id) === false) return
                onNotify?.(isJoined ? `Left ${title}` : `Joined ${title}!`, { type: isJoined ? 'info' : 'success' })
              }}>
              {isJoined ? 'Joined' : 'Join'}
            </Button>
          )}
        </div>
        {!compact && (
          <details open={expandDetails || undefined} className="group/club-details mt-2 text-xs text-[var(--text-muted)]">
            <summary className="club-details-toggle ui-touch inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border border-[var(--md-outline-variant)] px-3 font-medium text-[var(--text)] hover:bg-[var(--md-surface-container)]">
              Club details
              <ChevronDown size={14} aria-hidden="true" className="transition-transform group-open/club-details:rotate-180" />
            </summary>
            <div className="mt-2 space-y-2 pb-1">
              {club.description && <p className="break-words">{cleanText(club.description)}</p>}
              <p>{cleanText(club.schedule || 'Weekly meetings')}</p>
              <div className="flex flex-wrap gap-1">
                {(club.tags || []).map(tag => <BubbleTag key={tag.label} label={tag.label} color={tag.color || 'blue'} size="sm" />)}
              </div>
              <div className="flex flex-wrap items-center gap-x-3">
                {clubDiscordUrl && (
                  <a href={clubDiscordUrl} target="_blank" rel="noopener noreferrer"
                    className="ui-touch inline-flex items-center gap-1 text-[var(--blue)] hover:underline">
                    {section !== 'discover' && <PlatformIcon type="discord" size={14} />}
                    {club.discordMemberCount ? `Discord · ${club.discordMemberCount}` : 'Discord'}
                  </a>
                )}
                {clubEmailAddr && (
                  <a href={`mailto:${clubEmailAddr}`} className="ui-touch inline-flex items-center gap-1 text-[var(--blue)] hover:underline">
                    <Mail size={14} /> Email club
                  </a>
                )}
                <button type="button" className="ui-touch text-[var(--blue)] hover:underline"
                  onClick={() => {
                    setSection('rbac')
                    setDirectoryClubFilter(String(club.id))
                  }}>
                  Roles &amp; groups
                </button>
              </div>
            </div>
          </details>
        )}
      </article>
    )
  }

  const clubGridClasses = isCompactDensity
    ? 'grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2'
    : 'grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2.5'

  // ── 1. COMPACT OVERVIEW MODE ──────────────────────────────────────
  if (compact) {
    const previewLimit = isCompactDensity ? 4 : 3
    const previewClubs = rankClubSearch(joinedClubs, searchQuery, { limit: previewLimit })
    return (
      <Card className="section-pad space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <h2 className="font-display text-base font-medium">My clubs</h2>
          {joinedClubs.length > 0 && onOpenClubs && (
            <Button variant="text" size="sm" onClick={() => onOpenClubs({ section: 'myclubs' })}>
              View my clubs
            </Button>
          )}
        </div>
        {previewClubs.length > 0 ? (
          <div className={clubGridClasses}>{previewClubs.map(club => renderClubCard(club))}</div>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            {joinedClubs.length > 0 ? 'No joined clubs match your search.' : 'Your joined clubs will appear here.'}
          </p>
        )}
      </Card>
    )
  }

  const totalDirectoryPeople = filteredOfficers.length + filteredMembers.length
  const hasActiveDirectoryFilters =
    directoryClubFilter !== 'all' ||
    directoryScope !== 'all' ||
    directoryCategory !== 'All' ||
    roleFilter !== 'all'

  const directoryGridClasses = isCompactDensity
    ? 'grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2'
    : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'

  const unjoinedClubsForSelect = allClubs.filter(c => !joinedIdSet.has(String(c.id)))

  const selectedClubHub = selectedDirectoryClub ? hubDict?.[selectedDirectoryClub.id] : null
  const selectedClubHandle =
    selectedDirectoryClub && !isDemoClubId(selectedDirectoryClub.id) && selectedDirectoryClub.instagram
      ? String(selectedDirectoryClub.instagram).replace(/^@+/, '').trim()
      : ''
  const selectedClubInstagramUrl = selectedClubHandle
    ? normalizeExternalHttpUrl(
        selectedDirectoryClub.instagramUrl || `https://www.instagram.com/${selectedClubHandle}/`
      )
    : null
  const rawSelectedClubSite =
    selectedDirectoryClub?.website ||
    selectedClubHub?.website ||
    (selectedClubHub?.links || []).find(l => normalizeExternalHttpUrl(l?.url))?.url ||
    ''
  const selectedClubSiteUrl =
    selectedDirectoryClub && !isDemoClubId(selectedDirectoryClub.id)
      ? normalizeExternalHttpUrl(rawSelectedClubSite)
      : null
  const selectedClubSiteLabel = selectedClubSiteUrl
    ? friendlyPostResourceLabel(selectedClubSiteUrl, 'Website')
    : null

  function renderOfficerCard(m, keySuffix = '') {
    const isCopied = copiedEmailId === m.id
    const officerColor = m.color || 'blue'
    const introPostUrl = !isDemoClubId(m.clubId) ? normalizeExternalHttpUrl(m.permalink) : null
    const canFilterToClub =
      Boolean(m.clubId) && String(directoryClubFilter) !== String(m.clubId)

    return (
      <div
        key={keySuffix ? `${m.id}_${keySuffix}` : m.id}
        className={`feed-tile-virtual content-tile content-tile-interactive ${
          isCompactDensity ? 'p-3 gap-2.5' : 'p-4 gap-3.5'
        } rounded-[var(--radius-sm)] flex flex-col justify-between`}
      >
        <div className="space-y-2.5">
          <div className="flex items-start justify-between gap-2.5">
            <div className={`flex items-center ${isCompactDensity ? 'gap-2.5' : 'gap-3'} min-w-0`}>
              <Avatar
                initials={m.initials}
                bg={`var(--${officerColor})`}
                size={isCompactDensity ? 34 : 40}
              />
              <div className="min-w-0">
                <div
                  className={`font-bold ${
                    isCompactDensity ? 'text-[13px]' : 'text-sm'
                  } text-[var(--text)] truncate`}
                >
                  {m.name}
                </div>
                {canFilterToClub ? (
                  <button
                    type="button"
                    onClick={() => handleSelectDirectoryClub(m.clubId)}
                    title={`Filter directory by ${m.club}`}
                    className="block max-w-full p-0 bg-transparent border-none text-left text-xs font-semibold text-[var(--blue-ink)] hover:underline truncate cursor-pointer"
                  >
                    {m.club}
                  </button>
                ) : (
                  <div className="text-xs font-semibold text-[var(--blue-ink)] truncate">
                    {m.club}
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0">
              <BubbleTag label={m.role} color={officerColor} size="sm" />
            </div>
          </div>

          {(m.major || m.office || introPostUrl) && (
            <div className="space-y-1.5 text-xs text-[var(--text-muted)]">
              {m.major && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <GraduationCap size={12} className="text-[var(--text-light)] shrink-0" />
                  <span className="truncate">{m.major}</span>
                </div>
              )}
              {m.office && (
                <div className="flex items-center gap-1.5 text-[var(--text)] font-medium min-w-0">
                  <Clock size={12} className="text-[var(--teal-ink)] shrink-0" />
                  <span className="truncate">Office Hours: {m.office}</span>
                </div>
              )}
              {introPostUrl && (
                <div className="pt-0.5">
                  <a
                    href={introPostUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--blue-ink)] no-underline transition-colors"
                  >
                    <span>Board intro post</span>
                    <ExternalLink size={11} className="shrink-0" />
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs text-[var(--text-muted)] font-mono-num truncate">
              {m.email || 'Contact via club'}
            </span>
            {m.email && m.isBoardEmail && (
              <span
                title="Official club executive board email"
                className="px-1.5 py-0.5 rounded-md bg-[var(--bg-surface)] text-[10px] font-semibold text-[var(--text-muted)] shrink-0"
              >
                Board
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!isDemo && m.clubId && !m.isSyntheticContact && (
              <button
                type="button"
                onClick={() => {
                  setDirectoryClubFilter(String(m.clubId))
                  setRbacInitialSeat({
                    seatId: String(m.id || ''),
                    roleTitle: String(m.role || 'Officer'),
                  })
                  setSection('rbac')
                }}
                title="Request this officer role"
                className="inline-flex items-center gap-1 px-2.5 min-h-[32px] rounded-lg bg-[var(--purple-light)] hover:opacity-90 text-xs font-semibold text-[var(--purple-ink)] cursor-pointer transition-opacity"
              >
                <Shield size={12} />
                <span>Request role</span>
              </button>
            )}
            {m.email && (
              <>
                  <button
                    type="button"
                    onClick={() => handleCopyEmail(m.id, m.email)}
                    title="Copy email address"
                    className="inline-flex items-center gap-1 px-2.5 min-h-[32px] rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--blue)] text-xs font-semibold text-[var(--text)] cursor-pointer transition-colors"
                  >
                    {isCopied ? (
                      <>
                        <Check size={12} className="text-[var(--green-ink)]" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} className="text-[var(--text-muted)]" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>

                  <a
                    href={`mailto:${m.email}`}
                    title={`Email ${m.name}`}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--blue-light)] text-[var(--blue-ink)] hover:opacity-90 no-underline transition-opacity"
                  >
                    <Mail size={13} />
                  </a>
                </>
              )}

              {m.isCustom && (
                <button
                  type="button"
                  onClick={() => handleRemoveCustomPerson(m.id, 'officer')}
                  title="Remove custom entry"
                  aria-label={`Remove ${m.name}`}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--red)] text-[var(--text-light)] hover:text-[var(--red-ink)] cursor-pointer transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              )}
          </div>
        </div>
      </div>
    )
  }

  function renderMemberCard(m, keySuffix = '') {
    const isCopied = copiedEmailId === m.id
    const visibleClubTags = (m.clubs || []).slice(0, 4)
    const extraClubCount = Math.max(0, (m.clubs || []).length - visibleClubTags.length)

    return (
      <div
        key={keySuffix ? `${m.id}_${keySuffix}` : m.id}
        className={`feed-tile-virtual content-tile content-tile-interactive ${
          isCompactDensity ? 'p-3 gap-2.5' : 'p-4 gap-3'
        } rounded-[var(--radius-sm)] flex flex-col justify-between`}
      >
        <div className="space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className={`flex items-center ${isCompactDensity ? 'gap-2.5' : 'gap-3'} min-w-0`}>
              <Avatar
                initials={m.initials}
                bg={m.avatarBg}
                size={isCompactDensity ? 34 : 38}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`font-bold ${
                      isCompactDensity ? 'text-[13px]' : 'text-sm'
                    } text-[var(--text)] truncate`}
                  >
                    {m.name}
                  </span>
                  {m.isYou && <BubbleTag label="You" color="blue" size="sm" />}
                </div>
                <div className="text-xs text-[var(--text-muted)] truncate">
                  {m.role}
                  {m.joined
                    ? ` · ${m.joined === 'Current' ? 'Active' : `Since ${m.joined}`}`
                    : ''}
                </div>
              </div>
            </div>
          </div>

          {m.major && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] min-w-0">
              <GraduationCap size={12} className="text-[var(--text-light)] shrink-0" />
              <span className="truncate">{m.major}</span>
            </div>
          )}

          {visibleClubTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {visibleClubTags.map(c => (
                <button
                  key={`${c.clubId || c.label}`}
                  type="button"
                  onClick={() => {
                    if (c.clubId) handleSelectDirectoryClub(c.clubId)
                  }}
                  title={`Filter directory by ${c.label}`}
                  className="bg-transparent border-none p-0 cursor-pointer hover:opacity-85 transition-opacity"
                >
                  <BubbleTag label={c.label} color={c.color || 'blue'} size="sm" />
                </button>
              ))}
              {extraClubCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[var(--bg-surface)] text-[10.5px] font-semibold text-[var(--text-muted)]">
                  +{extraClubCount} more
                </span>
              )}
            </div>
          )}
        </div>

        <div className="pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2 min-w-0">
          <span className="text-xs text-[var(--text-muted)] font-mono-num truncate">
            {m.email}
          </span>

          <div className="flex items-center gap-1.5 shrink-0">
            {m.email && (
              <>
                <button
                  type="button"
                  onClick={() => handleCopyEmail(m.id, m.email)}
                  title="Copy email address"
                  className="inline-flex items-center gap-1 px-2.5 min-h-[32px] rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--blue)] text-xs font-semibold text-[var(--text)] cursor-pointer transition-colors"
                >
                  {isCopied ? (
                    <>
                      <Check size={12} className="text-[var(--green-ink)]" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} className="text-[var(--text-muted)]" />
                      <span>Copy</span>
                    </>
                  )}
                </button>

                <a
                  href={`mailto:${m.email}`}
                  title={`Email ${m.name}`}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--blue-light)] text-[var(--blue-ink)] hover:opacity-90 no-underline transition-opacity"
                >
                  <Mail size={13} />
                </a>
              </>
            )}

            {m.isCustom && (
              <button
                type="button"
                onClick={() => handleRemoveCustomPerson(m.id, 'member')}
                title="Remove custom entry"
                aria-label={`Remove ${m.name}`}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--red)] text-[var(--text-light)] hover:text-[var(--red-ink)] cursor-pointer transition-colors"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  function renderClubContactCard(club, { isSelectedClubFallback = false } = {}) {
    const cid = String(club.id)
    const copyKey = `club_contact_${cid}`
    const isCopied = copiedEmailId === copyKey
    const catMeta = getClubCategoryMeta(club.category)
    const accentColor = catMeta?.color || 'blue'
    const clubEmail =
      club.email ||
      `${cid.replace(/^demo_/, '').replace(/[^a-zA-Z0-9._-]/g, '.')}@ucsc.edu`
    const handle =
      !isDemoClubId(cid) && club.instagram
        ? String(club.instagram).replace(/^@+/, '').trim()
        : ''

    return (
      <div
        key={copyKey}
        className={`feed-tile-virtual content-tile content-tile-interactive ${
          isCompactDensity ? 'p-3 gap-2.5' : 'p-4 gap-3.5'
        } rounded-[var(--radius-sm)] flex flex-col justify-between`}
      >
        <div className="space-y-2.5">
          <div className="flex items-start justify-between gap-2.5">
            <div className={`flex items-center ${isCompactDensity ? 'gap-2.5' : 'gap-3'} min-w-0`}>
              <ClubAvatar club={club} size={isCompactDensity ? 34 : 40} />
              <div className="min-w-0">
                <div className="font-bold text-sm text-[var(--text)] truncate">
                  {isSelectedClubFallback ? 'Executive Board Inbox' : cleanText(club.name)}
                </div>
                <div className="text-xs font-semibold text-[var(--blue-ink)] truncate">
                  {isSelectedClubFallback
                    ? `${cleanText(club.name)} · Official Contact`
                    : `${club.categoryLabel || 'Campus Club'}${handle ? ` · @${handle}` : ''}`}
                </div>
              </div>
            </div>

            <div className="shrink-0">
              <BubbleTag label="Board Contact" color={accentColor} size="sm" />
            </div>
          </div>

          <p className="text-xs text-[var(--text-muted)] leading-relaxed line-clamp-2">
            {isSelectedClubFallback
              ? 'Individual officer names have not been published yet. Reach the executive board directly via their official club email or add an officer to the roster.'
              : cleanText(
                  club.description || club.schedule || 'Reach the club executive board directly.'
                )}
          </p>

          {isSelectedClubFallback ? (
            <div>
              <button
                type="button"
                onClick={() => handleOpenAddPersonForClub(club.id, 'officer')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none p-0 cursor-pointer"
              >
                <UserPlus size={12} />
                <span>Add named officer for {cleanText(club.name)}</span>
              </button>
            </div>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => handleSelectDirectoryClub(club.id)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none p-0 cursor-pointer"
              >
                <span>Open club details &amp; roster</span>
                <ArrowRight size={12} />
              </button>
            </div>
          )}
        </div>

        <div className="pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2 min-w-0">
          <span className="text-xs text-[var(--text-muted)] font-mono-num truncate">
            {clubEmail}
          </span>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => handleCopyEmail(copyKey, clubEmail)}
              title="Copy club email"
              className="inline-flex items-center gap-1 px-2.5 min-h-[32px] rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--blue)] text-xs font-semibold text-[var(--text)] cursor-pointer transition-colors"
            >
              {isCopied ? (
                <>
                  <Check size={12} className="text-[var(--green-ink)]" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy size={12} className="text-[var(--text-muted)]" />
                  <span>Copy</span>
                </>
              )}
            </button>

            <a
              href={`mailto:${clubEmail}`}
              title={`Email ${cleanText(club.name)}`}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--blue-light)] text-[var(--blue-ink)] hover:opacity-90 no-underline transition-opacity"
            >
              <Mail size={13} />
            </a>
          </div>
        </div>
      </div>
    )
  }

  const selectedSearchClub = searchTarget?.type === 'club' ? allClubs.find(club => String(club.id) === searchTarget.id) : null
  const selectedSearchPerson = searchTarget?.type === 'person' ? publicPeople.find(person => person.id === searchTarget.id) : null

  const showGroupedSections =
    !searchQuery.trim() && clubLayout === 'grouped' && category === 'All' && groupedClubs.length > 1

  const communitySections = [
    { id: 'myclubs', label: `My clubs (${joinedClubs.length})` },
    { id: 'rbac', label: 'Roles & sub-groups' },
    { id: 'discover', label: `Discover (${allClubs.length})` },
    { id: 'updates', label: 'Club feed' },
    { id: 'directory', label: 'Officers & members' },
    { id: 'integrations', label: 'Discord & email' },
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

  return (
    <div className="page-stack">
      <PageToolbar title="Clubs & Community" />
      <div className="min-w-0">
        <Select
          aria-label="Community section"
          className="control-select ui-touch sm:hidden flex-1 [--select-width:14rem]"
          value={section}
          onValueChange={selectCommunitySection}
          options={communitySections.map(tab => ({ value: tab.id, label: tab.label }))}
        />
        <nav aria-label="Community sections" className="hidden sm:flex flex-wrap items-center gap-1">
          {communitySections.map(tab => (
            <Button key={tab.id} size="sm" variant={section === tab.id ? 'tonal' : 'text-neutral'}
              aria-current={section === tab.id ? 'page' : undefined}
              onClick={() => selectCommunitySection(tab.id)}>
              {tab.label}
            </Button>
          ))}
        </nav>
      </div>

      <div className="flex min-h-11 min-w-0 items-center gap-1.5 sm:gap-2">
        {onSearchChange && sectionFilterLabel && (
          <div className="w-44 min-w-0 shrink">
            <SearchBox className="community-filter-field" placeholder={sectionFilterLabel} value={searchQuery} onChange={onSearchChange} />
          </div>
        )}
        {showClubFilters && (
          <ActionDisclosure label="Filters" iconOnly icon={<SlidersHorizontal size={15} />} count={Number(category !== 'All')} panelClassName="w-52 p-2">
            {() => (
              <div className="grid gap-2">
                {categoryFilters.length > 1 && (
                  <label className="grid gap-1 text-xs">
                    Category
                    <Select
                      aria-label="Club category"
                      value={category}
                      onValueChange={setCategory}
                      className="control-select"
                      search="auto"
                      options={categoryFilters.map(cat => ({ value: cat.value, label: `${cat.label} (${cat.count})` }))}
                    />
                  </label>
                )}
                {(filteredClubs.length > 6 || category !== 'All') && (
                  <label className="grid gap-1 text-xs">
                    Layout
                    <Select
                      aria-label="Club layout"
                      value={clubLayout === 'grid' || category !== 'All' ? 'grid' : 'grouped'}
                      className="control-select [--select-width:8rem]"
                      onValueChange={nextValue => {
                        setClubLayout(nextValue)
                        if (nextValue === 'grouped') setCategory('All')
                      }}
                      options={[
                        { value: "grouped", label: "By category" },
                        { value: "grid", label: "Grid view" },
                      ]}
                    />
                  </label>
                )}
              </div>
            )}
          </ActionDisclosure>
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
                Discover Clubs
              </Button>
            ))}

          {section === 'directory' && (
            <Button
              variant="filled"
              size="sm"
              leadingIcon={showAddPersonForm ? <X size={14} /> : <UserPlus size={14} />}
              reserveLabels={['Cancel', 'Add person']}
              onClick={() => {
                if (showAddPersonForm) setShowAddPersonForm(false)
                else handleOpenAddPersonForClub()
              }}
              className="self-start sm:self-auto"
            >
              {showAddPersonForm ? 'Cancel' : 'Add person'}
            </Button>
          )}
        </>
      </div>

      {selectedSearchClub && (
        <SearchDestination key={searchTarget.revision} heading={cleanText(selectedSearchClub.name)} onDismiss={onDismissSearchTarget}>
          {renderClubCard(selectedSearchClub, true)}
        </SearchDestination>
      )}
      {selectedSearchPerson && (
        <SearchDestination key={searchTarget.revision} heading={selectedSearchPerson.name} onDismiss={onDismissSearchTarget}>
          <p className="text-sm text-[var(--text-muted)]">{selectedSearchPerson.role} · {selectedSearchPerson.club}</p>
        </SearchDestination>
      )}
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
                  ? 'Switch to Discover to browse and join campus clubs.'
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
                  Discover Clubs
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {/* ── SECTION 2B: ROLES, ROSTER CLAIMING & SUB-GROUPS (RBAC) ── */}
      {section === 'rbac' && (
        <ClubRbacPanel
          clubs={allClubs}
          selectedClubId={directoryClubFilter}
          initialSeatId={rbacInitialSeat.seatId}
          initialRoleTitle={rbacInitialSeat.roleTitle}
          onSelectClub={cid => {
            setDirectoryClubFilter(String(cid))
            setRbacInitialSeat({ seatId: '', roleTitle: '' })
          }}
          user={user}
          isDemo={isDemo}
          onMembershipConfirmed={onMembershipConfirmed}
          onOpenTasks={onOpenTasks}
          onRefreshAnnouncements={onRefreshAnnouncements}
          onNotify={onNotify}
        />
      )}

      {/* ── SECTION 3: CLUB FEED / UPDATES ── */}
      {section === 'updates' && (
        <div className="space-y-4">
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

              {joinedClubs.length > 0 && (
                <span className="inline-flex items-center px-3 min-h-[34px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-xs font-semibold text-[var(--text)]">
                  My Clubs ({joinedClubs.length})
                </span>
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
          ) : joinedClubs.length === 0 ? (
            <div className="py-10 px-4 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-center space-y-3">
              <div className="text-sm font-bold text-[var(--text)]">
                Join a club to receive incoming updates &amp; announcements
              </div>
              <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
                You aren&apos;t in any clubs yet. Once you join a club, its official announcements, Discord updates, and Instagram posts appear here.
              </p>
              <Button
                variant="filled"
                size="sm"
                icon={ArrowRight}
                iconPosition="end"
                onClick={() => {
                  setSection('discover')
                  setCategory('All')
                }}
              >
                Discover Clubs
              </Button>
            </div>
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

      {/* ── SECTION 4: REFINED OFFICERS & MEMBERS DIRECTORY ── */}
      {section === 'directory' && (
        <div className="space-y-5">
          {/* Structured Directory Control Bar (replaces truncated 6-club pill strip) */}
          <div className="space-y-2.5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
              {/* Left Cluster: Role Filter + Campus/My Clubs Scope */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="segmented-track w-full xs:w-auto">
                  {[
                    { id: 'all',      label: `All (${totalDirectoryPeople})` },
                    { id: 'officers', label: `Officers (${filteredOfficers.length})` },
                    { id: 'members',  label: `Members (${filteredMembers.length})` },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setRoleFilter(tab.id)}
                      className={`flex-1 xs:flex-initial px-3 min-h-[34px] rounded-lg text-xs font-semibold border-none cursor-pointer transition-all ${
                        roleFilter === tab.id
                          ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
                          : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {joinedClubs.length > 0 && directoryClubFilter === 'all' && (
                  <div className="segmented-track">
                    {[
                      { id: 'all',     label: 'All Campus' },
                      { id: 'myclubs', label: `My Clubs (${joinedClubs.length})` },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setDirectoryScope(opt.id)}
                        className={`px-2.5 min-h-[34px] rounded-lg text-xs font-semibold border-none cursor-pointer transition-all ${
                          directoryScope === opt.id
                            ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
                            : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Cluster: By Role / By Club Toggle + Searchable Club Picker across all clubs */}
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full lg:w-auto">
                {directoryClubFilter === 'all' && (
                  <div className="segmented-track shrink-0">
                    <button
                      type="button"
                      onClick={() => setDirectoryGroupMode('role')}
                      className={`inline-flex items-center gap-1.5 px-2.5 min-h-[32px] rounded-lg text-xs font-semibold border-none cursor-pointer transition-all ${
                        directoryGroupMode === 'role'
                          ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
                          : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      <Shield size={12} />
                      <span>By Role</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDirectoryGroupMode('club')}
                      className={`inline-flex items-center gap-1.5 px-2.5 min-h-[32px] rounded-lg text-xs font-semibold border-none cursor-pointer transition-all ${
                        directoryGroupMode === 'club'
                          ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
                          : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      <Layers size={12} />
                      <span>By Club</span>
                    </button>
                  </div>
                )}

                <DirectoryClubPicker
                  allClubs={allClubs}
                  joinedClubs={joinedClubs}
                  clubPeopleCounts={clubPeopleCounts}
                  selectedClubId={directoryClubFilter}
                  onSelectClub={handleSelectDirectoryClub}
                  totalListedPeople={allOfficers.length + allMembers.length}
                />
              </div>
            </div>

            {/* Elevated Category Filter Pills (replaces muddy low-contrast club pills) */}
            {directoryClubFilter === 'all' && directoryCategoryFilters.length > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                <div className="mobile-pill-rail w-full sm:w-auto pb-0.5 sm:pb-0">
                  {directoryCategoryFilters.map(cat => {
                    const active = directoryCategory === cat.value
                    return (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => setDirectoryCategory(cat.value)}
                        className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-full text-xs cursor-pointer border transition-all ${
                          active
                            ? 'bg-[var(--blue-light)] text-[var(--blue-ink)] border-[var(--blue)]/35 font-semibold shadow-2xs'
                            : 'bg-[var(--bg-tile)] hover:bg-[var(--bg-tile-hover)] text-[var(--text-muted)] hover:text-[var(--text)] border-[var(--border-tile)] hover:border-[var(--border-strong)] font-medium'
                        }`}
                      >
                        {cat.value !== 'All' && (
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: `var(--${cat.color || 'blue'})` }}
                          />
                        )}
                        <span>{cat.label}</span>
                        <span
                          className={`text-[10.5px] font-mono-num ${
                            active ? 'text-[var(--blue-ink)]' : 'text-[var(--text-light)]'
                          }`}
                        >
                          {cat.count}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {hasActiveDirectoryFilters && (
                  <button
                    type="button"
                    onClick={handleResetDirectoryFilters}
                    className="inline-flex items-center gap-1 px-2.5 min-h-[28px] rounded-lg bg-transparent hover:bg-[var(--bg-surface)] border-none text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer transition-colors"
                  >
                    <RotateCcw size={12} />
                    <span>Reset filters</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Add Officer / Member Form */}
          {showAddPersonForm && (
            <form
              onSubmit={handleAddPersonSubmit}
              className="p-4 sm:p-5 rounded-[var(--radius-sm)] bg-[var(--bg-tile)] border border-[var(--border-tile)] shadow-2xs space-y-4 fade-in"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-[var(--text)]">
                    Add to Club Directory
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    Add an executive officer, committee lead, or active member for any campus club.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddPersonForm(false)}
                  aria-label="Close form"
                  className="w-8 h-8 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] flex items-center justify-center cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={personName}
                    onChange={e => setPersonName(e.target.value)}
                    placeholder="e.g. Jordan Chen"
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                    Campus or Club Email
                  </label>
                  <input
                    type="email"
                    required
                    value={personEmail}
                    onChange={e => setPersonEmail(e.target.value)}
                    placeholder="jchen@ucsc.edu"
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                    Club
                  </label>
                  <Select
                    aria-label="Directory club"
                    value={personClubId}
                    onValueChange={setPersonClubId}
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                    search
                    options={joinedClubs.length > 0 ? [
                      ...joinedClubs.map(c => ({ value: c.id, label: cleanText(c.name), group: "My Joined Clubs" })),
                      ...unjoinedClubsForSelect.map(c => ({ value: c.id, label: cleanText(c.name), group: "All Campus Clubs" })),
                    ] : allClubs.map(c => ({ value: c.id, label: cleanText(c.name) }))}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                    Directory Group
                  </label>
                  <Select
                    aria-label="Directory group"
                    value={personType}
                    onValueChange={setPersonType}
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                    options={[
                      { value: "officer", label: "Executive Officer / Lead" },
                      { value: "member", label: "Club Member" },
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                    Role / Title
                  </label>
                  <input
                    type="text"
                    value={personRoleTitle}
                    onChange={e => setPersonRoleTitle(e.target.value)}
                    placeholder={
                      personType === 'officer' ? 'e.g. Events Chair' : 'e.g. Project Member'
                    }
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                    Major &amp; Class Year{' '}
                    <span className="font-normal text-[var(--text-light)]">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={personMajor}
                    onChange={e => setPersonMajor(e.target.value)}
                    placeholder="e.g. Computer Science '27"
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                  />
                </div>

                {personType === 'officer' && (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                      Office Hours &amp; Room{' '}
                      <span className="font-normal text-[var(--text-light)]">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={personOfficeHours}
                      onChange={e => setPersonOfficeHours(e.target.value)}
                      placeholder="e.g. Thu 2–4 PM · Baskin Engineering 152"
                      className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-card)] text-base sm:text-sm text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="text"
                  size="md"
                  onClick={() => setShowAddPersonForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="filled"
                  size="md"
                  type="submit"
                >
                  Save to Directory
                </Button>
              </div>
            </form>
          )}

          {/* Selected Club Spotlight & Official Contact Banner */}
          {selectedDirectoryClub &&
            (() => {
              const clubCatMeta = getClubCategoryMeta(selectedDirectoryClub.category)
              const clubAccent = clubCatMeta?.color || 'blue'
              const isSelectedJoined = Boolean(selectedDirectoryClub.joined)
              const spotlightCopyKey = `spotlight_email_${selectedDirectoryClub.id}`
              const isSpotlightCopied = copiedEmailId === spotlightCopyKey
              const clubBoardEmail = selectedDirectoryClub.email || ''

              return (
                <div
                  className="content-tile p-4 sm:p-4.5 rounded-[var(--radius-sm)] space-y-3 fade-in"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex items-start gap-3.5 min-w-0">
                      <ClubAvatar club={selectedDirectoryClub} size={44} />
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm sm:text-base font-bold text-[var(--text)]">
                            {cleanText(selectedDirectoryClub.name)}
                          </h3>
                          <BubbleTag
                            label={selectedDirectoryClub.categoryLabel || clubCatMeta.label}
                            color={clubAccent}
                            size="sm"
                          />
                          {selectedDirectoryClub.members != null && (
                            <span className="text-xs text-[var(--text-muted)] font-mono-num">
                              {selectedDirectoryClub.members}{' '}
                              {selectedDirectoryClub.members === 1 ? 'member' : 'members'}
                            </span>
                          )}
                        </div>
                        {(selectedDirectoryClub.description || selectedDirectoryClub.schedule) && (
                          <p className="text-sm text-[var(--text-muted)] leading-relaxed break-words">
                            {cleanText(
                              selectedDirectoryClub.description || selectedDirectoryClub.schedule
                            )}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {onToggleJoin && (
                        <Button
                          variant={isSelectedJoined ? 'tonal' : 'filled'}
                          size="sm"
                          leadingIcon={isSelectedJoined ? <Check size={12} /> : <Plus size={12} />}
                          onClick={async () => {
                            if (await onToggleJoin(selectedDirectoryClub.id) === false) return
                            if (onNotify) {
                              onNotify(
                                isSelectedJoined
                                  ? `Left ${cleanText(selectedDirectoryClub.name)}`
                                  : `Joined ${cleanText(selectedDirectoryClub.name)}!`,
                                { type: isSelectedJoined ? 'info' : 'success' }
                              )
                            }
                          }}
                        >
                          {isSelectedJoined ? 'Joined' : 'Join Club'}
                        </Button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleOpenAddPersonForClub(selectedDirectoryClub.id)}
                        className="inline-flex items-center gap-1.5 px-3 min-h-[32px] rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-surface)] border border-[var(--border)] text-xs font-semibold text-[var(--text)] cursor-pointer transition-colors"
                      >
                        <UserPlus size={13} className="text-[var(--blue)]" />
                        <span>Add to Roster</span>
                      </button>

                      {!isDemo && (
                        <button
                          type="button"
                          onClick={() => {
                            setDirectoryClubFilter(String(selectedDirectoryClub.id))
                            setRbacInitialSeat({ seatId: '', roleTitle: '' })
                            setSection('rbac')
                          }}
                          className="inline-flex items-center gap-1.5 px-3 min-h-[32px] rounded-xl bg-[var(--purple-light)] hover:opacity-90 text-xs font-semibold text-[var(--purple-ink)] cursor-pointer transition-opacity"
                        >
                          <Shield size={13} />
                          <span>Roles & Sub-Groups</span>
                        </button>
                      )}

                      {onOpenTasks && (
                        <button
                          type="button"
                          onClick={() => onOpenTasks(selectedDirectoryClub.id)}
                          className="inline-flex items-center gap-1.5 px-3 min-h-[32px] rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-surface)] border border-[var(--border)] text-xs font-semibold text-[var(--text)] cursor-pointer transition-colors"
                        >
                          <Layers size={13} className="text-[var(--teal)]" />
                          <span>Task Board</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleSelectDirectoryClub('all')}
                        className="inline-flex items-center gap-1 px-2.5 min-h-[32px] rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-surface)] border border-[var(--border)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer transition-colors"
                      >
                        <X size={13} />
                        <span>All Clubs</span>
                      </button>
                    </div>
                  </div>

                  {(clubBoardEmail ||
                    selectedClubInstagramUrl ||
                    selectedClubSiteUrl ||
                    selectedDirectoryClub.schedule) && (
                    <div className="pt-2.5 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2.5 text-xs">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[var(--text-muted)]">
                        {clubBoardEmail && (
                          <div className="inline-flex items-center gap-1.5">
                            <Mail size={12} className="text-[var(--blue)] shrink-0" />
                            <span className="font-mono-num text-[var(--text)]">
                              {clubBoardEmail}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyEmail(spotlightCopyKey, clubBoardEmail)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--blue)] text-[11px] font-semibold text-[var(--text)] cursor-pointer transition-colors"
                            >
                              {isSpotlightCopied ? (
                                <>
                                  <Check size={11} className="text-[var(--green)]" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={11} className="text-[var(--text-muted)]" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                            <a
                              href={`mailto:${clubBoardEmail}`}
                              className="text-[11px] font-semibold text-[var(--blue-ink)] hover:underline no-underline"
                            >
                              Email
                            </a>
                          </div>
                        )}

                        {selectedDirectoryClub.schedule && (
                          <div className="inline-flex items-center gap-1.5">
                            <Calendar size={12} className="text-[var(--text-light)] shrink-0" />
                            <span>{cleanText(selectedDirectoryClub.schedule)}</span>
                          </div>
                        )}
                      </div>

                      {(selectedClubInstagramUrl || selectedClubSiteUrl) && (
                        <div className="flex flex-wrap items-center gap-2">
                          {selectedClubInstagramUrl && (
                            <a
                              href={selectedClubInstagramUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 min-h-[28px] rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--purple)] text-xs font-semibold text-[var(--text)] no-underline transition-colors"
                            >
                              <PlatformIcon type="instagram" size={12} />
                              <span>@{selectedClubHandle}</span>
                              <ExternalLink size={11} className="text-[var(--text-light)]" />
                            </a>
                          )}

                          {selectedClubSiteUrl && (
                            <a
                              href={selectedClubSiteUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 min-h-[28px] rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--teal)] text-xs font-semibold text-[var(--text)] no-underline transition-colors"
                            >
                              <span>{selectedClubSiteLabel}</span>
                              <ExternalLink size={11} className="text-[var(--text-light)]" />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

          {/* Directory Content: Grouped by Club OR Grouped by Role */}
          {(() => {
            const showOfficersSection = roleFilter === 'all' || roleFilter === 'officers'
            const showMembersSection = roleFilter === 'all' || roleFilter === 'members'
            const showSelectedClubBoardFallback =
              Boolean(selectedDirectoryClub) &&
              showOfficersSection &&
              filteredOfficers.length === 0 &&
              !searchQuery.trim()

            const visibleOfficerItemsCount = showOfficersSection
              ? filteredOfficers.length + (showSelectedClubBoardFallback ? 1 : 0)
              : 0
            const visibleMemberItemsCount = showMembersSection ? filteredMembers.length : 0
            const hasAnyDirectoryContent =
              visibleOfficerItemsCount > 0 ||
              visibleMemberItemsCount > 0 ||
              matchingClubContacts.length > 0

            if (!hasAnyDirectoryContent) {
              return (
                <div className="py-10 px-4 text-center rounded-[var(--radius-sm)] bg-[var(--bg-tile)] border border-[var(--border-tile)] space-y-3">
                  <div className="w-10 h-10 rounded-full bg-[var(--bg-surface)] text-[var(--text-muted)] flex items-center justify-center mx-auto">
                    <Users size={18} />
                  </div>
                  <div className="space-y-1 max-w-md mx-auto">
                    <div className="text-sm font-bold text-[var(--text)]">
                      {selectedDirectoryClub
                        ? `No ${
                            roleFilter === 'members' ? 'active members' : 'directory entries'
                          } listed yet for ${cleanText(selectedDirectoryClub.name)}`
                        : searchQuery.trim()
                          ? `No people or clubs match “${searchQuery.trim()}”`
                          : 'No directory entries match the current filters'}
                    </div>
                    <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                      {selectedDirectoryClub
                        ? !selectedDirectoryClub.joined && roleFilter === 'members'
                          ? 'Join this club to appear as an active member, or add a club member directly to the directory.'
                          : 'Add an executive officer or club member to help classmates connect with this organization.'
                        : 'Try resetting your active filters, switching club scope, or adding a new officer or member.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    {selectedDirectoryClub &&
                      !selectedDirectoryClub.joined &&
                      roleFilter === 'members' &&
                      onToggleJoin && (
                        <Button
                          variant="filled"
                          size="md"
                          leadingIcon={<Plus size={14} />}
                          onClick={() => onToggleJoin(selectedDirectoryClub.id)}
                        >
                          Join {cleanText(selectedDirectoryClub.name)}
                        </Button>
                      )}

                    <button
                      type="button"
                      onClick={() =>
                        handleOpenAddPersonForClub(
                          selectedDirectoryClub?.id || null,
                          roleFilter === 'members' ? 'member' : 'officer'
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-4 min-h-[36px] rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-surface)] border border-[var(--border)] text-xs font-semibold text-[var(--text)] cursor-pointer transition-colors"
                    >
                      <UserPlus size={14} className="text-[var(--blue)]" />
                      <span>
                        Add {roleFilter === 'members' ? 'Member' : 'Officer / Member'}
                      </span>
                    </button>

                    {hasActiveDirectoryFilters && (
                      <button
                        type="button"
                        onClick={handleResetDirectoryFilters}
                        className="inline-flex items-center gap-1.5 px-3.5 min-h-[36px] rounded-xl bg-transparent hover:bg-[var(--bg-surface)] border border-[var(--border)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer transition-colors"
                      >
                        <RotateCcw size={13} />
                        <span>Reset filters</span>
                      </button>
                    )}
                  </div>
                </div>
              )
            }

            const visibleOfficersSlice =
              directoryClubFilter === 'all'
                ? filteredOfficers.slice(0, visibleOfficersCount)
                : filteredOfficers
            const remainingOfficersCount = Math.max(
              0,
              filteredOfficers.length - visibleOfficersSlice.length
            )

            const visibleMembersSlice =
              directoryClubFilter === 'all'
                ? filteredMembers.slice(0, visibleMembersCount)
                : filteredMembers
            const remainingMembersCount = Math.max(
              0,
              filteredMembers.length - visibleMembersSlice.length
            )

            const visibleClubGroupsSlice = groupedDirectoryByClub.slice(0, visibleClubGroupsCount)
            const remainingClubGroupsCount = Math.max(
              0,
              groupedDirectoryByClub.length - visibleClubGroupsSlice.length
            )

            return (
              <div className="space-y-6">
                {directoryClubFilter === 'all' && directoryGroupMode === 'club' ? (
                  /* ── BY CLUB GROUPED VIEW ── */
                  groupedDirectoryByClub.length > 0 && (
                    <div className={isCompactDensity ? 'space-y-5' : 'space-y-6'}>
                      {visibleClubGroupsSlice.map(group => {
                        const groupCatMeta = getClubCategoryMeta(group.club.category)
                        const groupColor = groupCatMeta?.color || 'blue'
                        const groupPeopleTotal = group.officers.length + group.members.length

                        return (
                          <section key={group.key} className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <ClubAvatar club={group.club} size={28} />
                                <button
                                  type="button"
                                  onClick={() => handleSelectDirectoryClub(group.club.id)}
                                  className="p-0 bg-transparent border-none text-left text-sm sm:text-[15px] font-bold text-[var(--text)] hover:text-[var(--blue-ink)] truncate cursor-pointer transition-colors"
                                >
                                  {group.clubName}
                                </button>
                                <BubbleTag
                                  label={`${groupPeopleTotal}`}
                                  color={groupColor}
                                  size="sm"
                                />
                                {group.club.joined && (
                                  <BubbleTag label="Joined" color="green" size="sm" />
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => handleSelectDirectoryClub(group.club.id)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer shrink-0"
                              >
                                <span>Club contact &amp; roster</span>
                                <ArrowRight size={12} />
                              </button>
                            </div>

                            <div className={directoryGridClasses}>
                              {group.officers.map(o => renderOfficerCard(o, group.key))}
                              {group.members.map(m => renderMemberCard(m, group.key))}
                            </div>
                          </section>
                        )
                      })}

                      {remainingClubGroupsCount > 0 && (
                        <div className="pt-1 flex flex-wrap items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setVisibleClubGroupsCount(prev =>
                                Math.min(
                                  prev + DIRECTORY_CLUB_GROUP_PAGE_SIZE,
                                  groupedDirectoryByClub.length
                                )
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-4 min-h-[36px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] border border-[var(--border)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer transition-colors"
                          >
                            <span>
                              Show more club rosters ({visibleClubGroupsSlice.length} of{' '}
                              {groupedDirectoryByClub.length} clubs)
                            </span>
                            <ChevronDown size={14} />
                          </button>
                          {remainingClubGroupsCount > DIRECTORY_CLUB_GROUP_PAGE_SIZE && (
                            <button
                              type="button"
                              onClick={() =>
                                setVisibleClubGroupsCount(groupedDirectoryByClub.length)
                              }
                              className="inline-flex items-center gap-1 px-3.5 min-h-[36px] rounded-xl bg-transparent hover:bg-[var(--bg-surface)] border border-[var(--border)] text-xs font-semibold text-[var(--blue-ink)] cursor-pointer transition-colors"
                            >
                              <span>Show all {groupedDirectoryByClub.length} clubs</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  /* ── BY ROLE VIEW (DEFAULT) ── */
                  <>
                    {showOfficersSection && visibleOfficerItemsCount > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Shield size={15} className="text-[var(--blue)]" />
                            <h3 className="text-sm font-bold text-[var(--text)]">
                              Club Leadership &amp; Officers
                            </h3>
                            <BubbleTag
                              label={`${filteredOfficers.length}`}
                              color="blue"
                              size="sm"
                            />
                          </div>
                        </div>

                        <div className={directoryGridClasses}>
                          {filteredOfficers.length > 0
                            ? visibleOfficersSlice.map(m => renderOfficerCard(m))
                            : renderClubContactCard(selectedDirectoryClub, {
                                isSelectedClubFallback: true,
                              })}
                        </div>

                        {remainingOfficersCount > 0 && (
                          <div className="pt-1 flex flex-wrap items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setVisibleOfficersCount(prev =>
                                  Math.min(prev + DIRECTORY_PAGE_SIZE, filteredOfficers.length)
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-4 min-h-[36px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] border border-[var(--border)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer transition-colors"
                            >
                              <span>
                                Show more officers ({visibleOfficersSlice.length.toLocaleString()} of{' '}
                                {filteredOfficers.length.toLocaleString()})
                              </span>
                              <ChevronDown size={14} />
                            </button>
                            {remainingOfficersCount > DIRECTORY_PAGE_SIZE && (
                              <button
                                type="button"
                                onClick={() => setVisibleOfficersCount(filteredOfficers.length)}
                                className="inline-flex items-center gap-1 px-3.5 min-h-[36px] rounded-xl bg-transparent hover:bg-[var(--bg-surface)] border border-[var(--border)] text-xs font-semibold text-[var(--blue-ink)] cursor-pointer transition-colors"
                              >
                                <span>Show all {filteredOfficers.length.toLocaleString()}</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {showMembersSection && (
                      <>
                        {filteredMembers.length > 0 ? (
                          <div className="space-y-3 pt-1">
                            <div className="flex items-center gap-2">
                              <Users size={15} className="text-[var(--teal)]" />
                              <h3 className="text-sm font-bold text-[var(--text)]">
                                Active Members
                              </h3>
                              <BubbleTag
                                label={`${filteredMembers.length}`}
                                color="teal"
                                size="sm"
                              />
                            </div>

                            <div className={directoryGridClasses}>
                              {visibleMembersSlice.map(m => renderMemberCard(m))}
                            </div>

                            {remainingMembersCount > 0 && (
                              <div className="pt-1 flex flex-wrap items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setVisibleMembersCount(prev =>
                                      Math.min(prev + DIRECTORY_PAGE_SIZE, filteredMembers.length)
                                    )
                                  }
                                  className="inline-flex items-center gap-1.5 px-4 min-h-[36px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] border border-[var(--border)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer transition-colors"
                                >
                                  <span>
                                    Show more members ({visibleMembersSlice.length.toLocaleString()}{' '}
                                    of {filteredMembers.length.toLocaleString()})
                                  </span>
                                  <ChevronDown size={14} />
                                </button>
                                {remainingMembersCount > DIRECTORY_PAGE_SIZE && (
                                  <button
                                    type="button"
                                    onClick={() => setVisibleMembersCount(filteredMembers.length)}
                                    className="inline-flex items-center gap-1 px-3.5 min-h-[36px] rounded-xl bg-transparent hover:bg-[var(--bg-surface)] border border-[var(--border)] text-xs font-semibold text-[var(--teal)] cursor-pointer transition-colors"
                                  >
                                    <span>Show all {filteredMembers.length.toLocaleString()}</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          selectedDirectoryClub &&
                          roleFilter === 'all' && (
                            <div className="px-4 py-3 rounded-xl bg-[var(--bg-tile)] border border-[var(--border-tile)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                                <Users size={14} className="text-[var(--teal)] shrink-0" />
                                <span>
                                  {selectedDirectoryClub.joined
                                    ? `No other active members listed yet for ${cleanText(selectedDirectoryClub.name)}.`
                                    : `Join ${cleanText(selectedDirectoryClub.name)} to appear in Active Members, or add a club member manually.`}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {!selectedDirectoryClub.joined && onToggleJoin && (
                                  <Button
                                    variant="filled"
                                    size="sm"
                                    leadingIcon={<Plus size={12} />}
                                    onClick={() => onToggleJoin(selectedDirectoryClub.id)}
                                  >
                                    Join Club
                                  </Button>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleOpenAddPersonForClub(
                                      selectedDirectoryClub.id,
                                      'member'
                                    )
                                  }
                                  className="inline-flex items-center gap-1 px-3 min-h-[30px] rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-xs font-semibold text-[var(--text)] cursor-pointer hover:border-[var(--blue)] transition-colors"
                                >
                                  <UserPlus size={12} className="text-[var(--teal)]" />
                                  <span>Add Member</span>
                                </button>
                              </div>
                            </div>
                          )
                        )}
                      </>
                    )}
                  </>
                )}

                {/* Official Club Board Contacts (when searching by club name or viewing joined clubs without named officers) */}
                {matchingClubContacts.length > 0 && (
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center gap-2">
                      <Building2 size={15} className="text-[var(--purple)]" />
                      <h3 className="text-sm font-bold text-[var(--text)]">
                        Official Club Board Contacts
                      </h3>
                      <BubbleTag
                        label={`${matchingClubContacts.length}`}
                        color="purple"
                        size="sm"
                      />
                    </div>

                    <div className={directoryGridClasses}>
                      {matchingClubContacts.map(club => renderClubContactCard(club))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* ── SECTION 5: AUTONOMOUS DISCORD & EMAIL INTEGRATION HUB ── */}
      {section === 'integrations' && (
        <div className="space-y-5 fade-in">
          {/* GitHub Actions Autonomous Agent Banner */}
          <div
            className="p-4 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] flex flex-col md:flex-row md:items-center justify-between gap-3.5"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--on-blue)] shrink-0 shadow-xs"
                style={{ backgroundColor: '#1A73E8' }}
              >
                <PlatformIcon type="discord" size={22} />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-[var(--text)]">
                    Autonomous GitHub Actions Discord &amp; Email Agent
                  </span>
                  <BubbleTag label="Runs Every 6 Hours" color="green" size="sm" />
                  <BubbleTag
                    label={`${
                      allClubs.filter(
                        c =>
                          c.discordUrl ||
                          c.discord ||
                          (hubDict?.[c.id]?.links || []).some(l =>
                            /discord\.(?:gg|com\/invite)\//i.test(String(l?.url || ''))
                          )
                      ).length
                    } Discord Servers`}
                    color="blue"
                    size="sm"
                  />
                  <BubbleTag
                    label={`${allClubs.filter(c => c.email).length} Club Emails`}
                    color="yellow"
                    size="sm"
                  />
                </div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  A scheduled GitHub Action (<code>discord-email-sync.yml</code>) automatically
                  discovers Discord invites and official club emails across all {allClubs.length}{' '}
                  clubs and organizations, verifies live server rosters via the Discord API,
                  ingests Discord &amp; mailing-list updates, and keeps every club&apos;s official
                  logo in sync.
                </p>
              </div>
            </div>
          </div>

          <IntegrationsPanel
            embedded={true}
            user={user}
            accountKey={accountKey}
            clubs={allClubs}
            events={events}
            calendarIntegration={calendarIntegration}
            onRefresh={onRefresh}
            onNotify={onNotify}
          />
        </div>
      )}
    </div>
  )
}
