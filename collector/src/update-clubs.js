// Rebuilds clubs.json from UCSC's official student organization directory.
//   npm run update-clubs
// Keeps any clubs you added by hand ("manual": true) and any category you edited.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { categorizeClub } from './categorize.js'

const DIRECTORY_URL = 'https://getinvolved.ucsc.edu/student-organizations/join/'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CLUBS_FILE = path.join(ROOT, 'clubs.json')

const decode = s =>
  s
    .replace(/<(?:style|script)\b[^>]*>[\s\S]*?<\/(?:style|script)>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&rsquo;|&#8217;/g, "'")
    .replace(/&quot;|&#8220;|&#8221;/g, '"')
    .replace(/&ndash;|&#8211;/g, '–')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/\s+/g, ' ')
    .trim()

const RESERVED = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'tv', 'media', 'import', 'keyframes', 'font-face', 'ucsc'])

function instagramHandle(html) {
  // Prefer the link target (the page's display text is sometimes out of date).
  for (const m of html.matchAll(/href=["']https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)\/?[^"']*["']/gi)) {
    if (!RESERVED.has(m[1].toLowerCase())) return m[1].toLowerCase()
  }
  // Fallback: an "@handle" in the visible text, ignoring email addresses.
  const text = decode(html.replace(/<a[^>]+mailto:[\s\S]*?<\/a>/gi, ''))
  const m = text.match(/(?<![\w.])@([A-Za-z0-9._]{2,30})(?![\w@])/)
  if (!m || /\.(edu|com|org|net)$/i.test(m[1])) return null
  return m[1].replace(/\.$/, '').toLowerCase()
}

export function guessCategory(nameOrClub) {
  return categorizeClub(
    typeof nameOrClub === 'string' ? { name: nameOrClub } : nameOrClub
  )
}

function extractSectionMeta(html) {
  let discord = null
  let website = null
  const emails = []
  for (const m of html.matchAll(/href=["']mailto:([^"'?\s>]+)/gi)) {
    const addr = m[1].trim().toLowerCase()
    if (addr && !emails.includes(addr)) emails.push(addr)
  }
  for (const m of html.matchAll(/href=["'](https?:\/\/[^"'\s>]+)["']/gi)) {
    const url = m[1].replace(/&amp;/g, '&').trim()
    if (!discord && /discord\.(?:gg|com\/invite)\/[A-Za-z0-9-]+/i.test(url)) {
      discord = url
      continue
    }
    if (
      !website &&
      !/(?:instagram\.com|getinvolved\.ucsc\.edu|facebook\.com\/ucsc|twitter\.com\/ucsc)/i.test(url)
    ) {
      website = url
    }
  }

  let description = null
  let orgStatus = 'active'
  let orgStatusNote = null

  for (const pm of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = decode(pm[1])
    if (!text) continue
    if (/^(?:instagram|email|emai|website|discord|contact)\s*:?/i.test(text)) continue
    if (/\b(?:on probation|interim suspension)\b/i.test(text)) {
      orgStatus = /interim suspension/i.test(text) ? 'interim_suspension' : 'probation'
      orgStatusNote = text
      continue
    }
    if (!description && text.length >= 15) {
      description = text
    }
  }

  return { discord, website, emails, description, orgStatus, orgStatusNote }
}

export function parseDirectory(html) {
  // Everything from the "Suspended" / "Dismissed" headings on is not an active club.
  const cut = html.search(/<h[1-6][^>]*>[^<]*(suspended|dismissed)/i)
  const active = cut === -1 ? html : html.slice(0, cut)
  // Names in the suspended/dismissed tables, matched exactly (ignoring "(ABC)" abbreviations).
  const short = n => n.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  const inactive = new Set(
    cut === -1 ? [] : [...html.slice(cut).matchAll(/<(td|li|th)[^>]*>([\s\S]*?)<\/\1>/gi)].map(m => short(decode(m[2]))).filter(Boolean)
  )

  const clubs = []
  const sections = active.split(/(?=<h2[\s>])/i).slice(1)
  for (const section of sections) {
    const nameMatch = section.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)
    if (!nameMatch) continue
    const name = decode(nameMatch[1])
    if (!name || /browse by|search|categor/i.test(name)) continue
    const handle = instagramHandle(section)
    const meta = extractSectionMeta(section)
    const fallbackEmail = decode(section).match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/)?.[0]?.toLowerCase() || null
    const email = meta.emails[0] || fallbackEmail
    const extraEmails = meta.emails.slice(1).filter(e => e !== email)
    const suspended = inactive.has(short(name))
    clubs.push({
      name,
      instagram: handle,
      email,
      ...(extraEmails.length ? { extraEmails } : {}),
      discord: meta.discord,
      website: meta.website,
      description: meta.description,
      orgStatus: suspended ? 'suspended' : meta.orgStatus,
      orgStatusNote: meta.orgStatusNote,
      suspended,
    })
  }
  return clubs
}

export async function updateClubsCatalog({ htmlOverride = null } = {}) {
  let rawHtml = htmlOverride
  if (!rawHtml) {
    console.log(`Downloading ${DIRECTORY_URL}`)
    const res = await fetch(DIRECTORY_URL, {
      headers: { 'user-agent': 'ClubHub student project (UCSC DevFest)' },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) throw new Error(`Directory returned ${res.status}`)
    rawHtml = await res.text()
  }

  const parsed = parseDirectory(rawHtml)
  if (parsed.length < 20) throw new Error(`Only found ${parsed.length} clubs; the page layout may have changed. clubs.json was not touched.`)

  const existing = fs.existsSync(CLUBS_FILE) ? JSON.parse(fs.readFileSync(CLUBS_FILE, 'utf8')) : []
  const byHandle = new Map(existing.map(c => [c.instagram?.toLowerCase(), c]))

  const out = []
  const seen = new Map()
  let skippedNoIg = 0
  let skippedSuspended = 0
  for (const c of parsed) {
    if (c.suspended) { skippedSuspended++; continue }
    if (!c.instagram) { skippedNoIg++; continue }
    if (seen.has(c.instagram)) {
      // Two orgs sharing one account (e.g. ESLP + Student Environmental Center).
      const first = seen.get(c.instagram)
      first.alsoKnownAs = [...(first.alsoKnownAs || []), c.name]
      for (const em of [c.email, ...(c.extraEmails || [])].filter(Boolean)) {
        if (em !== first.email && !(first.extraEmails || []).includes(em)) {
          first.extraEmails = [...(first.extraEmails || []), em]
        }
      }
      continue
    }
    const prev = byHandle.get(c.instagram)
    const mergedExtraEmails = [
      ...new Set([...(c.extraEmails || []), ...(prev?.extraEmails || [])].filter(e => e && e !== (c.email || prev?.email))),
    ]
    const club = {
      name: c.name,
      instagram: c.instagram,
      category: categorizeClub({
        name: c.name,
        instagram: c.instagram,
        email: c.email || prev?.email,
        category: prev?.category,
      }),
      email: c.email || prev?.email || null,
      ...(mergedExtraEmails.length ? { extraEmails: mergedExtraEmails } : {}),
      ...(c.description || prev?.description ? { description: c.description || prev?.description } : {}),
      ...(c.orgStatus && c.orgStatus !== 'active' ? { orgStatus: c.orgStatus } : prev?.orgStatus && prev.orgStatus !== 'active' ? { orgStatus: prev.orgStatus } : {}),
      ...(c.orgStatusNote || prev?.orgStatusNote ? { orgStatusNote: c.orgStatusNote || prev?.orgStatusNote } : {}),
      ...(c.discord || prev?.discord ? { discord: c.discord || prev?.discord } : {}),
      ...(c.website || prev?.website ? { website: c.website || prev?.website } : {}),
      ...(prev?.discordChannelId ? { discordChannelId: prev.discordChannelId } : {}),
    }
    seen.set(c.instagram, club)
    out.push(club)
  }
  const manual = existing.filter(c => c.manual && !seen.has(c.instagram?.toLowerCase()))
  out.push(...manual)

  const added = out.filter(c => !byHandle.has(c.instagram)).length
  const removed = existing.filter(c => !c.manual && !seen.has(c.instagram?.toLowerCase())).length
  fs.writeFileSync(CLUBS_FILE, JSON.stringify(out, null, 2) + '\n')
  console.log(`Saved ${out.length} clubs to clubs.json (${added} new, ${removed} removed, ${manual.length} kept from manual entries)`)
  console.log(`Skipped: ${skippedSuspended} suspended/dismissed, ${skippedNoIg} with no Instagram listed`)
  return { total: out.length, added, removed, manual: manual.length, skippedSuspended, skippedNoIg, clubs: out }
}

async function main() {
  await updateClubsCatalog()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  })
}
