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
import { extractPost } from './extract.js'
import { extractWithClaude, llmEnabled } from './llm.js'

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

async function* liveSource(clubs) {
  const { IG_USER_ID, IG_ACCESS_TOKEN, GRAPH_API_VERSION, POSTS_PER_CLUB } = process.env
  if (!IG_USER_ID || !IG_ACCESS_TOKEN) {
    throw new Error('Missing IG_USER_ID or IG_ACCESS_TOKEN in .env (see README). Try `npm run demo` meanwhile.')
  }
  for (const club of clubs) {
    try {
      const data = await fetchClub(club.instagram, {
        igUserId: IG_USER_ID,
        accessToken: IG_ACCESS_TOKEN,
        version: GRAPH_API_VERSION || 'v26.0',
        limit: Number(POSTS_PER_CLUB) || 20,
      })
      yield { club, ...data }
    } catch (err) {
      yield { club, error: err.message }
    }
    await sleep(500) // stay well under the API rate limit
  }
}

async function* demoSource() {
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures/demo-posts.json'), 'utf8'))
  const now = Date.now()
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  for (const c of fixture.clubs) {
    yield {
      club: { name: c.name, instagram: c.instagram, category: c.category },
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

async function analyze(post, profile) {
  if (llmEnabled()) {
    try {
      return await extractWithClaude(post, profile)
    } catch (err) {
      console.warn(`  ! Claude extraction failed for ${post.id}, using rules: ${err.message}`)
    }
  }
  return extractPost(post, profile)
}

export async function collect({ demo = false, only } = {}) {
  let clubs = JSON.parse(fs.readFileSync(path.join(ROOT, 'clubs.json'), 'utf8'))
  if (only) clubs = clubs.filter(c => c.instagram.toLowerCase() === only.toLowerCase().replace(/^@/, ''))
  if (only && !clubs.length) clubs = [{ name: only, instagram: only.replace(/^@/, ''), category: null }]

  const out = { collectedAt: new Date().toISOString(), clubs: [], posts: [], events: [], announcements: [], links: [], errors: [] }
  const source = demo ? demoSource() : liveSource(clubs)

  for await (const item of source) {
    const { club } = item
    if (item.error) {
      console.warn(`✗ ${item.error}`)
      out.errors.push({ club: club.instagram, message: item.error })
      continue
    }
    const { profile, posts } = item
    const clubId = profile.username
    const clubName = club.name || profile.name || profile.username
    console.log(`✓ @${clubId}: ${posts.length} posts`)

    out.clubs.push({
      id: clubId,
      name: clubName,
      instagram: clubId,
      instagramUrl: `https://www.instagram.com/${clubId}/`,
      category: club.category || null,
      bio: profile.biography,
      website: profile.website,
      profilePictureUrl: profile.profilePictureUrl,
      followers: profile.followers,
      lastPostAt: posts[0]?.postedAt || null,
    })

    const clubLinks = new Map()
    if (profile.website) clubLinks.set(profile.website.toLowerCase(), { url: profile.website, label: 'Link in bio', kind: 'website', postId: null })

    for (const post of posts) {
      const info = await analyze(post, profile)

      out.posts.push({
        id: post.id, clubId, postedAt: post.postedAt, permalink: post.permalink, imageUrl: post.imageUrl,
        caption: post.caption, type: info.type, important: info.important, title: info.title,
        summary: info.summary, extractedBy: info.extractedBy,
      })

      info.events.forEach((e, i) => out.events.push({ id: `${post.id}-${i}`, clubId, clubName, postId: post.id, permalink: post.permalink, ...e }))

      if (info.type === 'announcement' || info.important) {
        out.announcements.push({
          id: post.id, clubId, clubName, title: info.title, summary: info.summary,
          important: info.important, postedAt: post.postedAt, permalink: post.permalink,
        })
      }

      for (const l of info.links) {
        if (!clubLinks.has(l.url.toLowerCase())) clubLinks.set(l.url.toLowerCase(), { ...l, postId: post.id })
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
  console.log(`\nSaved ${data.clubs.length} clubs, ${data.events.length} events, ${data.announcements.length} announcements, ${data.links.length} links -> ${path.relative(process.cwd(), file)}`)

  const hook = process.env.DB_WEBHOOK_URL
  if (hook) {
    const res = await fetch(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
    console.log(res.ok ? `Sent to database (${hook})` : `! Database endpoint returned ${res.status}`)
  }
}

async function main() {
  const run = async () => save(await collect({ demo: flag('demo'), only: option('club') }))
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
