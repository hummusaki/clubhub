// ClubHub collector: pulls UCSC club Instagram posts, extracts events/meetings/announcements/links,
// writes output/clubhub-data.json and (optionally) POSTs it to your database endpoint.
//
//   npm run demo                      -> runs on built-in sample posts, no Instagram setup needed
//   npm run collect                   -> runs on every club in clubs.json
//   npm run collect -- --club handle  -> just one club
//   npm run collect -- --watch 360    -> keep running, re-collect every 360 minutes

process.env.TZ = process.env.TZ || 'America/Los_Angeles'

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchClub, isRateLimitError } from './instagram.js'
import { scrapePersonalClubs } from './instagramFallback.js'
import { classify, extractPost, extractLinks, filterActualEvents } from './extract.js'
import { extractWithClaude, llmEnabled } from './llm.js'
import {
  unpackBioWebsite,
  extractGoogleCalendarId,
  fetchPublicGoogleCalendarEvents,
  fetchDiscordInviteMetadata,
} from './enrichWeb.js'
import { categorizeClub } from './categorize.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
for (const envCandidate of [path.join(ROOT, '.env'), path.resolve(ROOT, '../.env')]) {
  if (fs.existsSync(envCandidate)) {
    try {
      process.loadEnvFile(envCandidate)
    } catch {
      // ignore unreadable env file
    }
  }
}

const getIgHandle = c => String(c?.instagram || '').trim().toLowerCase().replace(/^@+/, '')
const getClubId = c => getIgHandle(c) || String(c?.id || '').trim().toLowerCase().replace(/^@+/, '')

export function isGraphTokenOrPermissionBlock(err) {
  if (!err) return false
  if (err.code === 190 || err.code === 200 || err.code === 10) return true
  return /API access blocked|access token|OAuthException|permission|not authorized/i.test(
    String(err.message || '')
  )
}

const args = process.argv.slice(2)
const flag = name => args.includes(`--${name}`)
const option = name => {
  const i = args.indexOf(`--${name}`)
  return i !== -1 ? args[i + 1] : undefined
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

function loadPreviousSnapshot() {
  const clubsById = new Map()
  const postsByClubId = new Map()
  const eventsByClubId = new Map()
  const announcementsByClubId = new Map()
  const linksByClubId = new Map()
  const rosterByClubId = new Map()
  const postsById = new Map()
  const eventsByPostId = new Map()
  const personalClubIds = new Set()

  const pushToMap = (map, key, val) => {
    if (!key) return
    let arr = map.get(key)
    if (!arr) {
      arr = []
      map.set(key, arr)
    }
    arr.push(val)
  }

  for (const candidateFile of [
    path.resolve(ROOT, '../public/clubhub-data.json'),
    path.join(ROOT, 'output/clubhub-data.json'),
  ]) {
    try {
      if (!fs.existsSync(candidateFile)) continue
      const prev = JSON.parse(fs.readFileSync(candidateFile, 'utf8'))
      if (!prev || !Array.isArray(prev.clubs)) continue

      for (const c of prev.clubs) {
        const cid = String(c?.id || c?.instagram || '').toLowerCase()
        if (cid && !clubsById.has(cid)) clubsById.set(cid, c)
      }
      for (const p of prev.posts || []) {
        const cid = String(p?.clubId || '').toLowerCase()
        if (!cid || !p?.id || postsById.has(p.id)) continue
        postsById.set(p.id, p)
        pushToMap(postsByClubId, cid, p)
        if (String(p.id).startsWith('ig_')) personalClubIds.add(cid)
      }
      for (const e of prev.events || []) {
        const cid = String(e?.clubId || '').toLowerCase()
        if (cid) pushToMap(eventsByClubId, cid, e)
        if (e?.postId) pushToMap(eventsByPostId, e.postId, e)
      }
      for (const a of prev.announcements || []) {
        const cid = String(a?.clubId || '').toLowerCase()
        if (cid) pushToMap(announcementsByClubId, cid, a)
      }
      for (const l of prev.links || []) {
        const cid = String(l?.clubId || '').toLowerCase()
        if (cid) pushToMap(linksByClubId, cid, l)
      }
      for (const r of prev.roster || []) {
        const cid = String(r?.clubId || '').toLowerCase()
        if (cid) pushToMap(rosterByClubId, cid, r)
      }
      break // prefer the primary snapshot once loaded
    } catch {
      // ignore unreadable snapshot
    }
  }

  return {
    clubsById,
    postsByClubId,
    eventsByClubId,
    announcementsByClubId,
    linksByClubId,
    rosterByClubId,
    postsById,
    eventsByPostId,
    personalClubIds,
  }
}

function sortClubsByStaleness(list, clubsById) {
  return [...list].sort((a, b) => {
    const ca = clubsById.get(getClubId(a))
    const cb = clubsById.get(getClubId(b))
    const aSynced = ca?.syncStatus === 'synced'
    const bSynced = cb?.syncStatus === 'synced'
    if (aSynced !== bSynced) return aSynced ? 1 : -1

    const aSyncAt = ca?.lastSyncedAt || ''
    const bSyncAt = cb?.lastSyncedAt || ''
    if (Boolean(aSyncAt) !== Boolean(bSyncAt)) return aSyncAt ? 1 : -1
    if (aSyncAt !== bSyncAt) return aSyncAt.localeCompare(bSyncAt)

    return String(ca?.lastPostAt || '').localeCompare(String(cb?.lastPostAt || ''))
  })
}

async function* runPersonalBatch(queue, { stories = false, clubsById = new Map() } = {}) {
  const igQueue = []
  for (const c of queue) {
    if (getIgHandle(c)) igQueue.push(c)
    else yield { club: c, noInstagram: true }
  }
  if (!igQueue.length) return
  const sortedQueue = sortClubsByStaleness(igQueue, clubsById)
  const queueByHandle = new Map(sortedQueue.map(c => [getIgHandle(c), c]))

  const fb = await scrapePersonalClubs(sortedQueue, { stories })
  const resolvedSet = new Set([
    ...fb.items.map(i => getIgHandle(i.club)),
    ...fb.errors.map(e => String(e.club || '').toLowerCase().replace(/^@+/, '')),
  ])

  for (const item of fb.items) yield item

  let rateLimitedPersonalCount = 0
  for (const err of fb.errors) {
    const errHandle = String(err.club || '').toLowerCase().replace(/^@+/, '')
    const origClub = queueByHandle.get(errHandle) || { instagram: err.club }
    if (err.rateLimited || /rate[- ]?limit|deferred/i.test(err.message || '')) {
      rateLimitedPersonalCount++
      yield { club: origClub, deferred: true, reason: 'rate_limit' }
    } else {
      yield { club: origClub, error: err.message }
    }
  }
  if (rateLimitedPersonalCount > 0) {
    console.log(
      `ℹ️ Personal-account scraper hit Instagram IP rate limit; deferred ${rateLimitedPersonalCount} club(s) cleanly without overwriting cached data.`
    )
  }

  for (const club of sortedQueue) {
    if (!resolvedSet.has(getIgHandle(club))) {
      yield { club, deferred: true, reason: 'rotation' }
    }
  }
}

// ── Sources ────────────────────────────────────────────────────────────────

async function* liveSource(
  clubs,
  {
    fallbackPersonal = false,
    personalOnly = false,
    stories = false,
    prevSnapshot = null,
    explicitOnly = false,
  } = {}
) {
  const clubsById = prevSnapshot?.clubsById || new Map()
  const personalClubIds = prevSnapshot?.personalClubIds || new Set()

  const igClubs = []
  for (const club of clubs) {
    if (!getIgHandle(club)) {
      yield { club, noInstagram: true }
    } else {
      igClubs.push(club)
    }
  }
  if (!igClubs.length) return

  if (personalOnly) {
    console.log(`Running personal-account Instaloader scraper on ${igClubs.length} club(s)...`)
    yield* runPersonalBatch(igClubs, { stories, clubsById })
    return
  }

  let { IG_USER_ID, IG_ACCESS_TOKEN, GRAPH_API_VERSION, POSTS_PER_CLUB } = process.env
  if (!IG_USER_ID || !IG_ACCESS_TOKEN) {
    if (fallbackPersonal) {
      console.warn('! Missing IG_USER_ID or IG_ACCESS_TOKEN; using Instaloader scraper directly...')
      yield* runPersonalBatch(igClubs, { stories, clubsById })
      return
    }
    throw new Error('Missing IG_USER_ID or IG_ACCESS_TOKEN in .env (see README). Try `npm run demo` meanwhile.')
  }
  if (!/^\d+$/.test(IG_USER_ID.trim())) {
    throw new Error(`IG_USER_ID should be a long number like 17841400000000000, not "${IG_USER_ID}". See README step 5.`)
  }
  if (/\s/.test(IG_ACCESS_TOKEN.trim())) {
    throw new Error('IG_ACCESS_TOKEN contains spaces or line breaks. Re-copy it as one line.')
  }

  const nowMs = Date.now()
  const freshTtlMin = explicitOnly ? 0 : Math.max(0, Number(process.env.IG_FRESH_TTL_MIN ?? 45))
  const maxGraphClubs = explicitOnly ? 0 : Math.max(0, Number(process.env.IG_GRAPH_MAX_CLUBS) || 0)
  const baseDelayMs = Math.max(250, Number(process.env.IG_GRAPH_DELAY_MS) || 650)
  const fullPostLimit = Number(POSTS_PER_CLUB) || 15
  const incrementalPostLimit = Number(process.env.INCREMENTAL_POSTS_PER_CLUB) || Math.min(fullPostLimit, 8)

  const personalFallbackQueue = []
  const graphCandidates = []

  for (const club of igClubs) {
    const cid = getIgHandle(club)
    const prev = clubsById.get(cid)
    const lastSyncMs = prev?.lastSyncedAt ? Date.parse(prev.lastSyncedAt) : NaN

    // 1. Skip clubs already synced within the freshness TTL window
    if (freshTtlMin > 0 && prev?.syncStatus === 'synced' && !Number.isNaN(lastSyncMs)) {
      if (nowMs - lastSyncMs < freshTtlMin * 60_000) {
        yield { club, deferred: true, reason: 'fresh' }
        continue
      }
    }

    // 2. Route known personal accounts straight to personalFallbackQueue (re-probe Graph API at most once per 24h)
    if (
      !explicitOnly &&
      fallbackPersonal &&
      personalClubIds.has(cid) &&
      (Number.isNaN(lastSyncMs) || nowMs - lastSyncMs < 24 * 3600_000)
    ) {
      personalFallbackQueue.push(club)
      continue
    }

    graphCandidates.push(club)
  }

  // Rotate oldest-synced / unsynced clubs first so no club starves across 2-hour scheduled runs
  const orderedGraphClubs = explicitOnly ? graphCandidates : sortClubsByStaleness(graphCandidates, clubsById)
  const activeGraphBatch =
    maxGraphClubs > 0 ? orderedGraphClubs.slice(0, maxGraphClubs) : orderedGraphClubs
  const rotatedOutGraphClubs =
    maxGraphClubs > 0 ? orderedGraphClubs.slice(maxGraphClubs) : []

  for (const club of rotatedOutGraphClubs) {
    yield { club, deferred: true, reason: 'rotation' }
  }

  let consecutiveNetworkErrors = 0

  for (let idx = 0; idx < activeGraphBatch.length; idx++) {
    const club = activeGraphBatch[idx]
    const handle = getIgHandle(club)
    const prev = clubsById.get(handle)
    const postLimit = prev?.syncStatus === 'synced' ? incrementalPostLimit : fullPostLimit
    let nextDelayMs = baseDelayMs

    try {
      const data = await fetchClub(handle, {
        igUserId: IG_USER_ID.trim(),
        accessToken: IG_ACCESS_TOKEN.trim(),
        version: GRAPH_API_VERSION || 'v26.0',
        limit: postLimit,
      })
      consecutiveNetworkErrors = 0
      yield { club, ...data }

      // Proactive Meta X-App-Usage / Business-Use-Case quota guard
      const usagePct = data.rateLimit?.maxUsagePct || 0
      const waitMin = data.rateLimit?.estimatedWaitMin || 0
      if (usagePct >= 85 || waitMin > 0) {
        const remaining = activeGraphBatch.slice(idx + 1)
        if (remaining.length > 0) {
          console.log(
            `\nℹ️ Meta Graph API usage at ${usagePct}% — pausing Business Discovery batch cleanly and preserving cached data for ${remaining.length} club(s).`
          )
          for (const rem of remaining) {
            yield { club: rem, deferred: true, reason: 'quota_guard' }
          }
        }
        break
      }
      if (usagePct >= 70) nextDelayMs = Math.max(baseDelayMs, 2500)
      else if (usagePct >= 50) nextDelayMs = Math.max(baseDelayMs, 1400)
    } catch (err) {
      if (err.code === 'NETWORK') {
        consecutiveNetworkErrors++
        if (consecutiveNetworkErrors >= 2) {
          throw new Error(err.message)
        }
      } else {
        consecutiveNetworkErrors = 0
      }

      // Codes 190 (expired token), 200 ("API access blocked"), or 10 (permission denied):
      // stop hammering Graph API and immediately switch the entire remaining batch to Instaloader!
      if (fallbackPersonal && isGraphTokenOrPermissionBlock(err)) {
        console.warn(`\n! ${err.message}`)
        console.warn('! Switching remaining batch to Instaloader scraper since Meta Graph API token/access is blocked...')
        personalFallbackQueue.push(...activeGraphBatch.slice(idx))
        break
      }

      // Rate limit (#4, #17, #32, #613, HTTP 429): trip circuit breaker immediately instead of firing 80+ doomed calls!
      if (isRateLimitError(err)) {
        const remaining = activeGraphBatch.slice(idx)
        console.warn(
          `\nℹ️ Meta Graph API rate limit reached (${err.message}) — pausing Business Discovery batch and preserving cached data for ${remaining.length} club(s).`
        )
        for (const rem of remaining) {
          yield { club: rem, deferred: true, reason: 'rate_limit' }
        }
        break
      }

      // Codes 100 / 110 indicate a personal (non-Business/Creator) or private account
      if (fallbackPersonal && (err.code === 100 || err.code === 110)) {
        personalFallbackQueue.push(club)
      } else {
        yield { club, error: err.message }
      }
    }

    if (idx + 1 < activeGraphBatch.length) {
      await sleep(nextDelayMs)
    }
  }

  if (personalFallbackQueue.length > 0) {
    console.log(
      `\n↻ Running Instaloader fallback on ${personalFallbackQueue.length} personal-account club(s)...`
    )
    yield* runPersonalBatch(personalFallbackQueue, { stories, clubsById })
  }
}

async function* demoSource() {
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures/demo-posts.json'), 'utf8'))
  const now = Date.now()
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  for (const c of fixture.clubs) {
    if (c.unavailable) {
      yield { club: c, error: `@${c.instagram}: Invalid user id (account not found, private, or not a Business/Creator account)` }
      continue
    }
    yield {
      club: { name: c.name, instagram: c.instagram, category: c.category, email: c.email },
      profile: c.profile,
      posts: c.posts.map(p => {
        const postedAt = new Date(now - p.hoursAgo * 3600e3)
        // {{date+N}} in a caption becomes the date N days after the post, e.g. "Nov 21"
        const caption = p.caption.replace(/\{\{date\+(\d+)\}\}/g, (_, n) => fmt(new Date(postedAt.getTime() + n * 864e5)))
        return { ...p, caption, postedAt: postedAt.toISOString() }
      }),
    }
  }
}

// ── Pipeline ───────────────────────────────────────────────────────────────

// Instagram page + email + directory Discord/website links, so every club can be reached even when IG posts can't be read.
function contactLinks(club, handle) {
  const links = []
  const cleanHandle = String(handle || '').trim().replace(/^@+/, '')
  if (cleanHandle && !cleanHandle.startsWith('noig_')) {
    links.push({
      url: `https://www.instagram.com/${cleanHandle}/`,
      label: 'Instagram page',
      kind: 'instagram',
      postId: null,
    })
  }
  for (const email of [club.email, ...(club.extraEmails || [])].filter(Boolean)) {
    links.push({ url: `mailto:${email}`, label: `Email ${email}`, kind: 'email', postId: null })
  }
  if (club.discord) {
    links.push({ url: club.discord, label: 'Discord', kind: 'discord', postId: null })
  }
  if (club.website) {
    links.push({ url: club.website, label: 'Club website', kind: 'website', postId: null })
  }
  return links
}

// Plain-language reason shown on the club page when a club couldn't be synced.
function syncNote(message) {
  if (/Business\/Creator|not found|private/i.test(message)) return "This club's Instagram is personal or private, so posts can't be pulled automatically. Visit their page or email them."
  if (/rate[- ]?limit|deferred/i.test(message)) return 'Instagram was busy; this club will sync on the next run.'
  return "Couldn't sync this club's Instagram right now. Visit their page or email them."
}

// Posts already read by Claude are cached, so re-runs only pay for new posts.
const CACHE_FILE = path.join(ROOT, 'output', 'claude-cache.json')
let cache = null
function loadCache() {
  if (cache) return cache
  try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) } catch { cache = {} }
  return cache
}

async function analyze(post, profile, prevSnapshot = null) {
  const prevPost = prevSnapshot?.postsById?.get(post.id)
  if (
    prevPost &&
    (prevPost.caption || '').length === (post.caption || '').length &&
    prevPost.title &&
    prevPost.type &&
    prevPost.extractedBy === 'claude'
  ) {
    const rawCachedEvents = (prevSnapshot.eventsByPostId?.get(post.id) || []).map(
      ({ title, kind, start, end, allDay, recurring, location }) => ({
        title,
        kind,
        start,
        end,
        allDay,
        recurring,
        location,
      })
    )
    const cachedEvents = filterActualEvents(rawCachedEvents, {
      defaultCaption: post.caption || '',
      defaultPostedAt: post.postedAt || null,
    })
    const resolvedType =
      cachedEvents.length === 0 && (prevPost.type === 'event' || prevPost.type === 'meeting')
        ? classify(post.caption || '', [])
        : prevPost.type
    return {
      type: resolvedType,
      important: Boolean(prevPost.important),
      title: prevPost.title,
      summary: prevPost.summary || '',
      events: cachedEvents,
      links: extractLinks(post.caption || '', profile.website),
      extractedBy: 'claude',
    }
  }

  if (llmEnabled()) {
    const c = loadCache()
    const key = `${post.id}:${(post.caption || '').length}` // re-read if the caption was edited
    if (c[key]) {
      const cachedInfo = c[key]
      const cleanedCachedEvents = filterActualEvents(cachedInfo.events || [], {
        defaultCaption: post.caption || '',
        defaultPostedAt: post.postedAt || null,
      })
      const cleanedType =
        cleanedCachedEvents.length === 0 && (cachedInfo.type === 'event' || cachedInfo.type === 'meeting')
          ? classify(post.caption || '', [])
          : cachedInfo.type
      return { ...cachedInfo, type: cleanedType, events: cleanedCachedEvents }
    }
    try {
      const info = await extractWithClaude(post, profile)
      c[key] = info
      return info
    } catch (err) {
      console.warn(`  ! Claude extraction failed for ${post.id}, using rules: ${err.message}`)
    }
  }
  return extractPost(post, profile)
}

export async function collect({
  demo = false,
  only,
  fallbackPersonal = process.env.IG_PERSONAL_FALLBACK === 'true',
  personalOnly = false,
  stories = process.env.IG_SCRAPER_STORIES === 'true',
  clubsOverride = null,
} = {}) {
  let clubs = Array.isArray(clubsOverride)
    ? clubsOverride
    : JSON.parse(fs.readFileSync(path.join(ROOT, 'clubs.json'), 'utf8'))
  const explicitOnly = Boolean(only && (!Array.isArray(only) || only.length > 0))
  if (Array.isArray(only)) {
    const set = new Set(only.map(h => String(h || '').toLowerCase().replace(/^@+/, '')))
    clubs = clubs.filter(c => set.has(getIgHandle(c)) || set.has(getClubId(c)))
  } else if (only) {
    const target = String(only).toLowerCase().replace(/^@+/, '')
    clubs = clubs.filter(c => getIgHandle(c) === target || getClubId(c) === target)
    if (!clubs.length) clubs = [{ name: only, instagram: target.startsWith('noig_') ? '' : target, id: target, category: null }]
  }

  const prevSnapshot = demo ? null : loadPreviousSnapshot()
  const out = {
    collectedAt: new Date().toISOString(),
    clubs: [],
    posts: [],
    events: [],
    announcements: [],
    links: [],
    roster: [],
    errors: [],
  }
  const seenPostIds = new Set()
  const seenEventIds = new Set()
  const seenAnnouncementIds = new Set()
  const seenLinkIds = new Set()
  const seenRosterIds = new Set()
  let liveSyncedCount = 0
  let preservedCacheCount = 0

  const preserveClubRoster = clubId => {
    const lc = String(clubId || '').toLowerCase()
    for (const r of prevSnapshot?.rosterByClubId?.get(lc) || []) {
      if (r?.id && !seenRosterIds.has(r.id)) {
        seenRosterIds.add(r.id)
        out.roster.push(r)
      }
    }
  }

  const carryPreviousClubCollections = clubId => {
    const lc = String(clubId || '').toLowerCase()
    if (!prevSnapshot) return
    for (const p of prevSnapshot.postsByClubId.get(lc) || []) {
      if (!seenPostIds.has(p.id)) {
        seenPostIds.add(p.id)
        out.posts.push(p)
      }
    }
    for (const e of prevSnapshot.eventsByClubId.get(lc) || []) {
      if (!seenEventIds.has(e.id)) {
        seenEventIds.add(e.id)
        out.events.push(e)
      }
    }
    for (const a of prevSnapshot.announcementsByClubId.get(lc) || []) {
      if (!seenAnnouncementIds.has(a.id)) {
        seenAnnouncementIds.add(a.id)
        out.announcements.push(a)
      }
    }
    for (const l of prevSnapshot.linksByClubId.get(lc) || []) {
      if (!seenLinkIds.has(l.id)) {
        seenLinkIds.add(l.id)
        out.links.push(l)
      }
    }
    preserveClubRoster(lc)
  }

  const enrichLinksAndDiscord = async (clubId, clubName, websiteUrl, linksMap, clubRecord) => {
    if (!demo && websiteUrl) {
      try {
        const unpacked = await unpackBioWebsite(websiteUrl)
        for (const l of unpacked) {
          if (!linksMap.has(l.url.toLowerCase())) {
            linksMap.set(l.url.toLowerCase(), { ...l, postId: null })
          }
          const gcalId = extractGoogleCalendarId(l.url)
          if (gcalId) {
            const gcalEvents = await fetchPublicGoogleCalendarEvents(gcalId, {
              clubId,
              clubName,
              calendarUrl: l.url,
            })
            for (const ge of gcalEvents) {
              if (!seenEventIds.has(ge.id)) {
                seenEventIds.add(ge.id)
                out.events.push(ge)
              }
            }
          }
        }
      } catch {
        // non-fatal website enrichment failure
      }
    }
    if (!demo) {
      for (const l of linksMap.values()) {
        if (l.kind === 'discord') {
          try {
            const inviteMeta = await fetchDiscordInviteMetadata(l.url)
            if (inviteMeta?.serverName) {
              const stats =
                inviteMeta.memberCount != null
                  ? ` (${inviteMeta.memberCount.toLocaleString()} members${
                      inviteMeta.onlineCount != null ? ` · ${inviteMeta.onlineCount} online` : ''
                    })`
                  : ''
              l.label = `Discord — ${inviteMeta.serverName}${stats}`
              if (clubRecord && inviteMeta.memberCount != null) {
                clubRecord.discordMemberCount = Math.max(
                  clubRecord.discordMemberCount || 0,
                  inviteMeta.memberCount
                )
                if (inviteMeta.onlineCount != null) clubRecord.discordOnlineCount = inviteMeta.onlineCount
                clubRecord.memberCount = Math.max(
                  clubRecord.memberCount || 0,
                  clubRecord.discordMemberCount
                )
              }
            }
          } catch {
            // non-fatal discord invite lookup failure
          }
        }
      }
    }
    for (const l of linksMap.values()) {
      const linkId = `${clubId}:${l.url}`
      if (!seenLinkIds.has(linkId)) {
        seenLinkIds.add(linkId)
        out.links.push({ id: linkId, clubId, clubName, ...l })
      }
    }
  }

  const carryClubRosterFields = (catalogClub, prevClub, followersOverride = null) => {
    const followers = followersOverride ?? prevClub?.followers ?? 0
    const discordMemberCount = catalogClub?.discordMemberCount ?? prevClub?.discordMemberCount ?? null
    const discordOnlineCount = catalogClub?.discordOnlineCount ?? prevClub?.discordOnlineCount ?? null
    const rosterCount = prevClub?.rosterCount ?? 0
    const memberCount = Math.max(
      prevClub?.memberCount || 0,
      discordMemberCount || 0,
      Number(followers) || 0,
      rosterCount || 0
    )
    return {
      memberCount: memberCount || null,
      discordMemberCount,
      discordOnlineCount,
      rosterCount: rosterCount || null,
      rosterUpdatedAt: prevClub?.rosterUpdatedAt || null,
      orgStatus: catalogClub?.orgStatus || prevClub?.orgStatus || 'active',
      orgStatusNote: catalogClub?.orgStatusNote || prevClub?.orgStatusNote || null,
      directoryDescription: catalogClub?.description || prevClub?.directoryDescription || null,
    }
  }

  const source = demo
    ? demoSource()
    : liveSource(clubs, { fallbackPersonal, personalOnly, stories, prevSnapshot, explicitOnly })

  for await (const item of source) {
    const { club } = item

    // Official directory organizations without an Instagram handle (e.g. SOMeCA / Baskin / Sport Clubs):
    // store with empty `instagram: ''`, `instagramUrl: null`, website/Discord/email contact links, and web/GCal enrichment.
    if (item.noInstagram) {
      const clubId = getClubId(club)
      if (!clubId) continue
      const clubName = club.name || clubId
      const prevClub = prevSnapshot?.clubsById?.get(clubId)
      const hasWebOrContact = Boolean(club.website || club.discord || club.email || prevClub?.syncStatus === 'synced')

      const clubRecord = {
        ...(prevClub || {}),
        id: clubId,
        name: clubName,
        alsoKnownAs: club.alsoKnownAs || prevClub?.alsoKnownAs || [],
        instagram: '',
        instagramUrl: null,
        noInstagram: true,
        category: categorizeClub({
          ...prevClub,
          ...club,
          id: clubId,
          name: clubName,
          instagram: '',
          bio: prevClub?.bio || club.description || null,
        }),
        email: club.email || prevClub?.email || null,
        bio: prevClub?.bio || club.description || null,
        website: club.website || prevClub?.website || null,
        profilePictureUrl: prevClub?.profilePictureUrl || club.iconUrl || null,
        followers: prevClub?.followers ?? null,
        lastPostAt: prevClub?.lastPostAt || null,
        lastSyncedAt: hasWebOrContact ? out.collectedAt : prevClub?.lastSyncedAt || null,
        syncStatus: hasWebOrContact ? 'synced' : 'unavailable',
        syncNote: null,
        ...carryClubRosterFields(club, prevClub),
      }
      out.clubs.push(clubRecord)
      carryPreviousClubCollections(clubId)

      const noIgLinks = new Map()
      for (const l of contactLinks(club, '')) noIgLinks.set(l.url.toLowerCase(), l)
      await enrichLinksAndDiscord(
        clubId,
        clubName,
        prevClub ? null : clubRecord.website,
        noIgLinks,
        clubRecord
      )
      continue
    }

    // Deferred clubs (rotation batch cap, freshness TTL, or rate-limit circuit breaker):
    // preserve cached club/posts/events/links/roster cleanly with zero noisy error logs.
    if (item.deferred) {
      preservedCacheCount++
      const clubId = getClubId(club)
      const igHandle = getIgHandle(club)
      const clubName = club.name || clubId
      const prevClub = prevSnapshot?.clubsById?.get(clubId)

      if (prevClub) {
        out.clubs.push({
          ...prevClub,
          id: prevClub.id || clubId,
          name: clubName || prevClub.name,
          alsoKnownAs: club.alsoKnownAs || prevClub.alsoKnownAs || [],
          category: categorizeClub({
            ...prevClub,
            ...club,
            id: prevClub.id || clubId,
            name: clubName || prevClub.name,
            instagram: prevClub.instagram || igHandle,
            bio: prevClub.bio || club.description || null,
          }),
          email: club.email || prevClub.email || null,
          website: prevClub.website || club.website || null,
          profilePictureUrl: prevClub.profilePictureUrl || club.iconUrl || null,
          ...carryClubRosterFields(club, prevClub),
        })
        carryPreviousClubCollections(clubId)
      } else {
        const newDeferredRecord = {
          id: clubId,
          name: clubName,
          alsoKnownAs: club.alsoKnownAs || [],
          instagram: igHandle,
          instagramUrl: igHandle ? `https://www.instagram.com/${igHandle}/` : null,
          category: categorizeClub({
            ...club,
            id: clubId,
            name: clubName,
            instagram: igHandle,
            bio: club.description || null,
          }),
          email: club.email || null,
          bio: club.description || null,
          website: club.website || null,
          profilePictureUrl: club.iconUrl || null,
          followers: null,
          lastPostAt: null,
          lastSyncedAt: null,
          syncStatus: 'unavailable',
          syncNote: 'Instagram was busy; this club will sync on the next run.',
          ...carryClubRosterFields(club, null),
        }
        out.clubs.push(newDeferredRecord)
        const defLinks = new Map()
        for (const l of contactLinks(club, igHandle)) defLinks.set(l.url.toLowerCase(), l)
        await enrichLinksAndDiscord(clubId, clubName, club.website, defLinks, newDeferredRecord)
      }
      continue
    }

    if (item.error) {
      console.warn(`✗ ${item.error}`)
      out.errors.push({ club: club.instagram || club.id, message: item.error })
      // Keep the club anyway, with its Instagram page and email so people can reach it manually.
      const clubId = getClubId(club)
      const igHandle = getIgHandle(club)
      const clubName = club.name || clubId
      const prevClub = prevSnapshot?.clubsById?.get(clubId)
      const errClubRecord = {
        id: clubId,
        name: clubName,
        alsoKnownAs: club.alsoKnownAs || [],
        instagram: igHandle,
        instagramUrl: igHandle ? `https://www.instagram.com/${igHandle}/` : null,
        category: categorizeClub({
          ...club,
          id: clubId,
          name: clubName,
          instagram: igHandle,
          bio: prevClub?.bio || club.description || null,
        }),
        email: club.email || null,
        bio: prevClub?.bio || club.description || null,
        website: club.website || prevClub?.website || null,
        profilePictureUrl: prevClub?.profilePictureUrl || club.iconUrl || null,
        followers: prevClub?.followers ?? null,
        lastPostAt: prevClub?.lastPostAt || null,
        lastSyncedAt: prevClub?.lastSyncedAt || null,
        syncStatus: 'unavailable',
        syncNote: syncNote(item.error),
        ...carryClubRosterFields(club, prevClub),
      }
      out.clubs.push(errClubRecord)
      preserveClubRoster(clubId)

      const fallbackLinks = new Map()
      for (const l of contactLinks(club, igHandle)) fallbackLinks.set(l.url.toLowerCase(), l)
      await enrichLinksAndDiscord(clubId, clubName, club.website, fallbackLinks, errClubRecord)
      continue
    }
    const { profile, posts } = item
    const clubId = profile.username
    const clubName = club.name || profile.name || profile.username
    const prevClub = prevSnapshot?.clubsById?.get(clubId.toLowerCase())
    liveSyncedCount++
    console.log(`✓ @${clubId}: ${posts.length} posts`)
    if (club.alsoKnownAs) console.log(`    (shared account, also: ${club.alsoKnownAs.join(', ')})`)

    const clubRecord = {
      id: clubId,
      name: clubName,
      instagram: clubId,
      instagramUrl: `https://www.instagram.com/${clubId}/`,
      category: categorizeClub({
        ...club,
        id: clubId,
        name: clubName,
        instagram: clubId,
        bio: profile.biography || prevClub?.bio || club.description || null,
      }),
      alsoKnownAs: club.alsoKnownAs || [],
      bio: profile.biography || prevClub?.bio || club.description || null,
      website: profile.website || club.website || null,
      profilePictureUrl: profile.profilePictureUrl || prevClub?.profilePictureUrl || club.iconUrl || null,
      followers: profile.followers,
      lastPostAt: posts[0]?.postedAt || null,
      lastSyncedAt: out.collectedAt,
      email: club.email || null,
      syncStatus: 'synced',
      syncNote: null,
      ...carryClubRosterFields(club, prevClub, profile.followers),
    }
    out.clubs.push(clubRecord)
    preserveClubRoster(clubId)

    const clubLinks = new Map()
    for (const l of contactLinks(club, clubId)) clubLinks.set(l.url.toLowerCase(), l)
    const bioUrls = [
      ...(profile.website ? [profile.website] : []),
      ...(Array.isArray(profile.extraBioLinks) ? profile.extraBioLinks : []),
    ]
    for (const bioUrl of [...new Set(bioUrls)]) {
      clubLinks.set(bioUrl.toLowerCase(), {
        url: bioUrl,
        label: bioUrl === profile.website ? 'Link in bio' : 'Bio link',
        kind: /discord\.(?:gg|com\/invite)/i.test(bioUrl) ? 'discord' : 'website',
        postId: null,
      })

      // Crawl Linktree / bio website to discover Discord invites, Forms, and Public Google Calendars
      if (!demo) {
        const unpacked = await unpackBioWebsite(bioUrl)
        for (const l of unpacked) {
          if (!clubLinks.has(l.url.toLowerCase())) {
            clubLinks.set(l.url.toLowerCase(), { ...l, postId: null })
          }
          const gcalId = extractGoogleCalendarId(l.url)
          if (gcalId) {
            const gcalEvents = await fetchPublicGoogleCalendarEvents(gcalId, {
              clubId,
              clubName,
              calendarUrl: l.url,
            })
            for (const ge of gcalEvents) {
              if (!seenEventIds.has(ge.id)) {
                seenEventIds.add(ge.id)
                out.events.push(ge)
              }
            }
          }
        }
      }
    }

    for (const post of posts) {
      const info = await analyze(post, profile, prevSnapshot)
      const postSource = post.isStory ? 'instagram_story' : 'instagram'

      if (!seenPostIds.has(post.id)) {
        seenPostIds.add(post.id)
        out.posts.push({
          id: post.id, clubId, postedAt: post.postedAt, permalink: post.permalink, imageUrl: post.imageUrl,
          caption: post.caption, type: info.type, important: info.important, title: info.title,
          summary: info.summary, extractedBy: info.extractedBy, source: postSource,
        })
      }

      info.events.forEach((e, i) => {
        const evId = `${post.id}-${i}`
        if (!seenEventIds.has(evId)) {
          seenEventIds.add(evId)
          out.events.push({ id: evId, clubId, clubName, postId: post.id, permalink: post.permalink, source: postSource, ...e })
        }
      })

      if (info.type === 'announcement' || info.important || post.isStory) {
        if (!seenAnnouncementIds.has(post.id)) {
          seenAnnouncementIds.add(post.id)
          out.announcements.push({
            id: post.id, clubId, clubName, title: info.title, summary: info.summary,
            important: info.important, postedAt: post.postedAt, permalink: post.permalink, source: postSource,
          })
        }
      }

      for (const l of info.links) {
        if (!clubLinks.has(l.url.toLowerCase())) clubLinks.set(l.url.toLowerCase(), { ...l, postId: post.id })
      }
    }

    // Enrich any discovered Discord invite links with live server name & member/online counts
    if (!demo) {
      for (const l of clubLinks.values()) {
        if (l.kind === 'discord') {
          const inviteMeta = await fetchDiscordInviteMetadata(l.url)
          if (inviteMeta?.serverName) {
            const stats =
              inviteMeta.memberCount != null
                ? ` (${inviteMeta.memberCount.toLocaleString()} members${
                    inviteMeta.onlineCount != null ? ` · ${inviteMeta.onlineCount} online` : ''
                  })`
                : ''
            l.label = `Discord — ${inviteMeta.serverName}${stats}`
            if (inviteMeta.memberCount != null) {
              clubRecord.discordMemberCount = Math.max(clubRecord.discordMemberCount || 0, inviteMeta.memberCount)
              if (inviteMeta.onlineCount != null) clubRecord.discordOnlineCount = inviteMeta.onlineCount
              clubRecord.memberCount = Math.max(clubRecord.memberCount || 0, clubRecord.discordMemberCount)
            }
          }
        }
      }
    }

    for (const l of clubLinks.values()) {
      const linkId = `${clubId}:${l.url}`
      if (!seenLinkIds.has(linkId)) {
        seenLinkIds.add(linkId)
        out.links.push({ id: linkId, clubId, clubName, ...l })
      }
    }
  }

  if (preservedCacheCount > 0) {
    console.log(
      `↻ Sync batch summary: ${liveSyncedCount} club(s) synced live, ${preservedCacheCount} club(s) preserved from snapshot cache.`
    )
  }

  const allPostsById = new Map(prevSnapshot?.postsById || [])
  for (const p of out.posts) {
    if (p?.id) allPostsById.set(p.id, p)
  }
  out.events = filterActualEvents(out.events, { postsById: allPostsById })

  out.events.sort((a, b) => a.start.localeCompare(b.start))
  out.announcements.sort((a, b) => b.postedAt.localeCompare(a.postedAt))
  return out
}

async function save(data) {
  const dir = path.join(ROOT, 'output')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'clubhub-data.json')
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
  if (cache) fs.writeFileSync(CACHE_FILE, JSON.stringify(cache))
  if (data.errors.length) console.log(`\n${data.errors.length} clubs couldn't be synced (usually personal or private accounts). They're still included with their Instagram link and email (syncStatus: "unavailable").`)
  const synced = data.clubs.filter(c => c.syncStatus === 'synced').length
  console.log(`\nSaved ${data.clubs.length} clubs (${synced} synced, ${data.clubs.length - synced} contact-only), ${data.events.length} events, ${data.announcements.length} announcements, ${data.links.length} links -> ${path.relative(process.cwd(), file)}`)

  const hook = process.env.DB_WEBHOOK_URL
  if (hook) {
    const res = await fetch(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
    console.log(res.ok ? `Sent to database (${hook})` : `! Database endpoint returned ${res.status}`)
  }
}

async function main() {
  const run = async () =>
    save(
      await collect({
        demo: flag('demo'),
        only: option('club'),
        fallbackPersonal: flag('fallback-personal') || process.env.IG_PERSONAL_FALLBACK === 'true',
        personalOnly: flag('personal-only'),
        stories: flag('stories') || process.env.IG_SCRAPER_STORIES === 'true',
      })
    )
  await run()
  const every = Number(option('watch'))
  if (every > 0) {
    console.log(`Watching: next run in ${every} min (Ctrl+C to stop)`)
    setInterval(() => run().catch(e => console.error(e.message)), every * 60e3)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  })
}
