// Search collected data by club name.  npm run search -- "cs club"
// searchClubs() is plain JS with no Node-only APIs, so the website can reuse it on the same JSON.

const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

const STOP = new Set(['ucsc', 'club', 'clubs', 'the', 'of', 'at', 'uc', 'santa', 'cruz', 'society', 'demo'])

function score(club, q) {
  const name = norm(club.name)
  const handle = norm(club.instagram).replace(/\b(demo|ucsc)\b/g, ' ').trim()
  if (!q) return 0
  if (name === q || norm(club.instagram) === q) return 100
  if (name.startsWith(q)) return 80
  if (name.includes(q)) return 70

  const nameWords = name.split(' ')
  const initials = nameWords.filter(w => !STOP.has(w)).map(w => w[0]).join('')
  let words = q.split(' ')
  if (words.some(w => !STOP.has(w))) words = words.filter(w => !STOP.has(w))

  const hits = words.filter(w =>
    nameWords.some(n => n.startsWith(w)) ||
    (w.length >= 2 && initials.startsWith(w)) ||
    (w.length >= 3 && handle.includes(w))
  ).length
  return (hits / words.length) * 60
}

export function searchClubs(data, query, { now = new Date() } = {}) {
  const q = norm(query)
  return data.clubs
    .map(club => ({ club, score: score(club, q) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ club }) => ({
      club,
      upcomingEvents: data.events.filter(e => e.clubId === club.id && new Date(e.end || e.start) >= now),
      announcements: data.announcements.filter(a => a.clubId === club.id).slice(0, 5),
      links: data.links.filter(l => l.clubId === club.id),
    }))
}

// CLI
import { fileURLToPath } from 'node:url'
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.env.TZ = process.env.TZ || 'America/Los_Angeles'
  const fs = await import('node:fs')
  const path = await import('node:path')
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../output/clubhub-data.json')
  const query = process.argv.slice(2).join(' ')
  if (!query) {
    console.log('Usage: npm run search -- "club name"')
    process.exit(1)
  }
  if (!fs.existsSync(file)) {
    console.log('No data yet. Run `npm run demo` or `npm run collect` first.')
    process.exit(1)
  }
  const results = searchClubs(JSON.parse(fs.readFileSync(file, 'utf8')), query)
  if (!results.length) console.log(`No clubs match "${query}"`)
  const when = e =>
    new Date(e.start).toLocaleString('en-US', e.allDay ? { weekday: 'short', month: 'short', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  for (const r of results) {
    console.log(`\n${r.club.name}  (@${r.club.instagram})\n${r.club.bio || ''}`)
    console.log('  Upcoming:')
    for (const e of r.upcomingEvents) console.log(`   - [${e.kind}] ${when(e)}  ${e.title}${e.location ? '  @ ' + e.location : ''}${e.recurring ? '  (every ' + e.recurring + ')' : ''}`)
    if (!r.upcomingEvents.length) console.log('   (none found)')
    console.log('  Announcements:')
    for (const a of r.announcements) console.log(`   - ${a.important ? '[!] ' : ''}${a.title}`)
    console.log('  Links:')
    for (const l of r.links) console.log(`   - ${l.label}: ${l.url}`)
  }
}
