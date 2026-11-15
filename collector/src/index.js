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
import { fetchClub } from './instagram.js'
import { scrapePersonalClubs } from './instagramFallback.js'
import { extractPost } from './extract.js'
import { extractWithClaude, llmEnabled } from './llm.js'
import {
  unpackBioWebsite,
  extractGoogleCalendarId,
  fetchPublicGoogleCalendarEvents,
  fetchDiscordInviteMetadata,
} from './enrichWeb.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (fs.existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'))

const args = process.argv.slice(2)
const flag = name => args.includes(`--${name}`)
const option = name => {
  const i = args.indexOf(`--${name}`)
  return i !== -1 ? args[i + 1] : undefined
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Sources ────────────────────────────────────────────────────────────────

async function* liveSource(clubs, { fallbackPersonal = false, personalOnly = false, stories = false } = {}) {
  if (personalOnly) {
    console.log(`Running personal-account Instaloader scraper on ${clubs.length} club(s)...`)
    const fb = await scrapePersonalClubs(clubs, { stories })
    for (const item of fb.items) yield item
    for (const err of fb.errors) yield { club: { instagram: err.club }, error: err.message }
    return
  }

  let { IG_USER_ID, IG_ACCESS_TOKEN, GRAPH_API_VERSION, POSTS_PER_CLUB } = process.env
  if (!IG_USER_ID || !IG_ACCESS_TOKEN) {
    if (fallbackPersonal) {
      console.warn('! Missing IG_USER_ID or IG_ACCESS_TOKEN; using Instaloader scraper directly...')
      const fb = await scrapePersonalClubs(clubs, { stories })
      for (const item of fb.items) yield item
      for (const err of fb.errors) yield { club: { instagram: err.club }, error: err.message }
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

  const personalFallbackQueue = []

  for (let idx = 0; idx < clubs.length; idx++) {
    const club = clubs[idx]
    try {
      const data = await fetchClub(club.instagram, {
        igUserId: IG_USER_ID.trim(),
        accessToken: IG_ACCESS_TOKEN.trim(),
        version: GRAPH_API_VERSION || 'v26.0',
        limit: Number(POSTS_PER_CLUB) || 20,
      })
      yield { club, ...data }
    } catch (err) {
      // Code 190 = IG_ACCESS_TOKEN expired; stop calling Graph API and fall back to Instaloader!
      if (fallbackPersonal && err.code === 190) {
        console.warn(`\n! ${err.message}`)
        console.warn('! Switching to Instaloader scraper since IG_ACCESS_TOKEN is expired...')
        personalFallbackQueue.push(...clubs.slice(idx))
        break
      }
      // Codes 100 / 110 indicate a personal (non-Business/Creator) or private account
      if (fallbackPersonal && (err.code === 100 || err.code === 110)) {
        personalFallbackQueue.push(club)
      } else {
        yield { club, error: err.message }
      }
    }
    await sleep(500) // stay well under the API rate limit
  }

  if (personalFallbackQueue.length > 0) {
    // Prioritize personal clubs that haven't been synced yet (or oldest sync) so 2-hour runs rotate cleanly
    const prevClubStatus = new Map()
    for (const candidateFile of [
      path.resolve(ROOT, '../public/clubhub-data.json'),
      path.join(ROOT, 'output/clubhub-data.json'),
    ]) {
      try {
        if (fs.existsSync(candidateFile)) {
          const prev = JSON.parse(fs.readFileSync(candidateFile, 'utf8'))
          for (const c of prev.clubs || []) {
            if (c?.id && !prevClubStatus.has(c.id.toLowerCase())) {
              prevClubStatus.set(c.id.toLowerCase(), c)
            }
          }
        }
      } catch {
        // ignore
      }
    }

    personalFallbackQueue.sort((a, b) => {
      const ca = prevClubStatus.get(a.instagram.toLowerCase())
      const cb = prevClubStatus.get(b.instagram.toLowerCase())
      const aHasPosts = Boolean(ca?.lastPostAt)
      const bHasPosts = Boolean(cb?.lastPostAt)
      if (aHasPosts !== bHasPosts) return aHasPosts ? 1 : -1
      return String(ca?.lastPostAt || '').localeCompare(String(cb?.lastPostAt || ''))
    })

    console.log(
      `\n↻ Running Instaloader fallback on ${personalFallbackQueue.length} personal-account club(s)...`
    )
    const queueByHandle = new Map(
      personalFallbackQueue.map(c => [c.instagram.toLowerCase().replace(/^@/, ''), c])
    )
    const fb = await scrapePersonalClubs(personalFallbackQueue, { stories })
    const resolvedSet = new Set([
      ...fb.items.map(i => i.club?.instagram?.toLowerCase()),
      ...fb.errors.map(e => e.club?.toLowerCase()),
    ])
    for (const item of fb.items) yield item
    for (const err of fb.errors) {
      const origClub = queueByHandle.get((err.club || '').toLowerCase()) || { instagram: err.club }
      yield { club: origClub, error: err.message }
    }
    // Any remaining clubs skipped if rate-limit circuit breaker tripped early
    for (const club of personalFallbackQueue) {
      if (!resolvedSet.has(club.instagram.toLowerCase())) {
        yield { club, error: `@${club.instagram}: deferred to next 2h batch (rate limit protection)` }
      }
    }
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

// Instagram page + email links, so every club can be reached even when its posts can't be read.
function contactLinks(club, handle) {
  const links = [{ url: `https://www.instagram.com/${handle}/`, label: 'Instagram page', kind: 'instagram', postId: null }]
  for (const email of [club.email, ...(club.extraEmails || [])].filter(Boolean)) {
    links.push({ url: `mailto:${email}`, label: `Email ${email}`, kind: 'email', postId: null })
  }
  return links
}

// Plain-language reason shown on the club page when a club couldn't be synced.
function syncNote(message) {
  if (/Business\/Creator|not found|private/i.test(message)) return "This club's Instagram is personal or private, so posts can't be pulled automatically. Visit their page or email them."
  if (/rate limited/i.test(message)) return 'Instagram was busy; this club will sync on the next run.'
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

async function analyze(post, profile) {
  if (llmEnabled()) {
    const c = loadCache()
    const key = `${post.id}:${(post.caption || '').length}` // re-read if the caption was edited
    if (c[key]) return c[key]
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
} = {}) {
  let clubs = JSON.parse(fs.readFileSync(path.join(ROOT, 'clubs.json'), 'utf8'))
  if (only) clubs = clubs.filter(c => c.instagram.toLowerCase() === only.toLowerCase().replace(/^@/, ''))
  if (only && !clubs.length) clubs = [{ name: only, instagram: only.replace(/^@/, ''), category: null }]

  const out = { collectedAt: new Date().toISOString(), clubs: [], posts: [], events: [], announcements: [], links: [], errors: [] }
  const source = demo
    ? demoSource()
    : liveSource(clubs, { fallbackPersonal, personalOnly, stories })

  for await (const item of source) {
    const { club } = item
    if (item.error) {
      console.warn(`✗ ${item.error}`)
      out.errors.push({ club: club.instagram, message: item.error })
      // Keep the club anyway, with its Instagram page and email so people can reach it manually.
      const clubId = club.instagram.toLowerCase()
      out.clubs.push({
        id: clubId,
        name: club.name || clubId,
        alsoKnownAs: club.alsoKnownAs || [],
        instagram: clubId,
        instagramUrl: `https://www.instagram.com/${clubId}/`,
        category: club.category || null,
        email: club.email || null,
        bio: null,
        website: null,
        profilePictureUrl: null,
        followers: null,
        lastPostAt: null,
        syncStatus: 'unavailable',
        syncNote: syncNote(item.error),
      })
      for (const l of contactLinks(club, clubId)) out.links.push({ id: `${clubId}:${l.url}`, clubId, clubName: club.name || clubId, ...l })
      continue
    }
    const { profile, posts } = item
    const clubId = profile.username
    const clubName = club.name || profile.name || profile.username
    console.log(`✓ @${clubId}: ${posts.length} posts`)
    if (club.alsoKnownAs) console.log(`    (shared account, also: ${club.alsoKnownAs.join(', ')})`)

    out.clubs.push({
      id: clubId,
      name: clubName,
      instagram: clubId,
      instagramUrl: `https://www.instagram.com/${clubId}/`,
      category: club.category || null,
      alsoKnownAs: club.alsoKnownAs || [],
      bio: profile.biography,
      website: profile.website,
      profilePictureUrl: profile.profilePictureUrl,
      followers: profile.followers,
      lastPostAt: posts[0]?.postedAt || null,
      email: club.email || null,
      syncStatus: 'synced',
      syncNote: null,
    })

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
            for (const ge of gcalEvents) out.events.push(ge)
          }
        }
      }
    }

    for (const post of posts) {
      const info = await analyze(post, profile)
      const postSource = post.isStory ? 'instagram_story' : 'instagram'

      out.posts.push({
        id: post.id, clubId, postedAt: post.postedAt, permalink: post.permalink, imageUrl: post.imageUrl,
        caption: post.caption, type: info.type, important: info.important, title: info.title,
        summary: info.summary, extractedBy: info.extractedBy, source: postSource,
      })

      info.events.forEach((e, i) => out.events.push({ id: `${post.id}-${i}`, clubId, clubName, postId: post.id, permalink: post.permalink, source: postSource, ...e }))

      if (info.type === 'announcement' || info.important || post.isStory) {
        out.announcements.push({
          id: post.id, clubId, clubName, title: info.title, summary: info.summary,
          important: info.important, postedAt: post.postedAt, permalink: post.permalink, source: postSource,
        })
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
          }
        }
      }
    }

    for (const l of clubLinks.values()) out.links.push({ id: `${clubId}:${l.url}`, clubId, clubName, ...l })
  }

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
