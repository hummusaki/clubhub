// Multi-source UCSC Club Discovery & Catalog Builder (`collector/src/update-clubs.js`).
//   npm --prefix collector run update-clubs
//
// Aggregates active UCSC student clubs & organizations across 5 sources:
//   1. Official SOMeCA Student Organization Directory (getinvolved.ucsc.edu/student-organizations/join/)
//   2. Official UCSC Sport Clubs — OPERS DSE Rec API + GoSlugs Sport Club pages (ucsc.dserec.com + goslugs.com)
//   3. Official Baskin Engineering Student Organizations (undergrad.engineering.ucsc.edu/student-organizations/)
//   4. Official UCSC College Student Governments & Campus Councils (colleges.ucsc.edu + getinvolved.ucsc.edu)
//   5. Social & Grassroots Club Discovery — Post/Bio @mention scanner + Instagram UCSC club search
//      (captures independent campus clubs like Slugs on Wheels, Slugs on Two Wheels, Santa Cruz Ski & Board, etc.)
//
// Preserves manual entries, custom categories, Discord metadata, and clubs from any source that is offline.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { categorizeClub } from './categorize.js'
import {
  discoverClubWebsiteSocials,
  extractInstagramHandleFromHtml,
  parseInstagramProfileHandle,
} from './enrichWeb.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(ROOT, '..')
const CLUBS_FILE = path.join(ROOT, 'clubs.json')
const DISCOVER_IG_SCRIPT = path.join(ROOT, 'scripts', 'discover_ig_clubs.py')
const VENV_PYTHON = path.join(REPO_ROOT, '.venv', 'bin', 'python3')

for (const envCandidate of [path.join(ROOT, '.env'), path.join(REPO_ROOT, '.env')]) {
  if (fs.existsSync(envCandidate)) {
    try {
      process.loadEnvFile(envCandidate)
    } catch {
      // ignore unreadable env file
    }
  }
}

const SOMECA_JOIN_URL = 'https://getinvolved.ucsc.edu/student-organizations/join/'
const SOMECA_GOV_URL = 'https://getinvolved.ucsc.edu/student-government/'
const SOMECA_COUNCILS_URL = 'https://getinvolved.ucsc.edu/student-councils/'
const DSEREC_SPORT_CLUBS_API = 'https://ucsc.dserec.com/api/clubsports/online/clubs/get'
const GOSLUGS_SPORT_CLUBS_URL = 'https://goslugs.com/sports/2025/1/27/ucsc-club-sports'
const BASKIN_ORGS_URL = 'https://undergrad.engineering.ucsc.edu/student-organizations/'
const COLLEGES_GOV_URL = 'https://colleges.ucsc.edu/get-involved/student-government/'

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const decode = s =>
  String(s || '')
    .replace(/<(?:style|script)\b[^>]*>[\s\S]*?<\/(?:style|script)>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#0?39;|&rsquo;|&lsquo;|&#8217;|&#8216;|&#x27;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;|&#8220;|&#8221;/gi, '"')
    .replace(/&ndash;|&#8211;/gi, '–')
    .replace(/&mdash;|&#8212;/gi, '—')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()

const RESERVED = new Set([
  '_u',
  'p',
  'reel',
  'reels',
  'explore',
  'stories',
  'accounts',
  'tv',
  'media',
  'share',
  'ar',
  'about',
  'legal',
  'developer',
  'import',
  'keyframes',
  'font-face',
  'ucsc',
  'ucsc.dsas',
  'someca.ucsc',
  'baskinengineering',
  'ucsc_athletics',
  'ucsc_sportclubs',
  'ucsc_alumni',
  'ucscalumniassociation',
])

const SMALL_CAPS_MAP = {
  'ᴀ': 'a', 'ʙ': 'b', 'ᴄ': 'c', 'ᴅ': 'd', 'ᴇ': 'e', 'ꜰ': 'f', 'ɢ': 'g', 'ʜ': 'h', 'ɪ': 'i',
  'ᴊ': 'j', 'ᴋ': 'k', 'ʟ': 'l', 'ᴍ': 'm', 'ɴ': 'n', 'ᴏ': 'o', 'ᴘ': 'p', 'ꞯ': 'q', 'ʀ': 'r',
  'ꜱ': 's', 'ᴛ': 't', 'ᴜ': 'u', 'ᴠ': 'v', 'ᴡ': 'w', 'ʏ': 'y', 'ᴢ': 'z',
}

export function normalizeUnicodeText(str = '') {
  const nfkd = String(str || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  let out = ''
  for (const ch of nfkd) {
    out += SMALL_CAPS_MAP[ch] || ch
  }
  return out.replace(/\s+/g, ' ').trim()
}

export function slugifyClubId(name = '') {
  const base = normalizeUnicodeText(name)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 44)
  return base ? `noig_${base}` : null
}

/**
 * Canonical cross-directory club key for deduplicating & linking identical clubs across
 * SOMeCA, Baskin Engineering, OPERS Sport Clubs, College Governments, and Instagram discovery.
 */
export function canonicalClubNameKey(rawName = '') {
  if (!rawName) return ''
  let s = normalizeUnicodeText(rawName)
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // strip "(ACM)", "(SWESLUGS)", "(SHPE)"
    .replace(/^sc\s*[-–—:]\s*/i, '') // strip GoSlugs "SC - " prefix
    .replace(/\buniversity of california,?\s*santa cruz\b/gi, ' ')
    .replace(/\buc santa cruz\b/gi, ' ')
    .replace(/\bbanana slugs?\b/gi, ' ')
    .replace(/\bgoogle developer (?:group on campus|student club)\b/gi, 'google developer')
    .replace(/['’`]/g, '') // men's -> mens
    .replace(/[&+]/g, ' and ')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(?:ucsc|the|at|of|for|in|on|campus|club|clubs|team|student|students|organization|organizations)\b/g, ' ')
    .replace(/\bskatboarding\b/g, 'skate')
    .replace(/\bskateboarding\b/g, 'skate')
    .replace(/\bwomxns\b/g, 'womens')
    .replace(/\barts\b/g, 'art')
    .replace(/\bcollaborations\b/g, 'collaboration')
    .replace(/\s+/g, ' ')
    .trim()
  return s
}

function instagramHandle(html) {
  const fromHref = extractInstagramHandleFromHtml(html)
  if (fromHref && !RESERVED.has(fromHref)) return fromHref

  // Fallback: an "@handle" or "Instagram: handle" in visible text, ignoring email addresses.
  const text = decode(String(html || '').replace(/<a[^>]+mailto:[\s\S]*?<\/a>/gi, ''))
  const labeled = text.match(/\binstagram\s*:\s*@?([A-Za-z0-9._]{2,30})\b/i)
  if (labeled && !RESERVED.has(labeled[1].toLowerCase()) && !/\.(edu|com|org|net)$/i.test(labeled[1])) {
    return labeled[1].replace(/\.+$/, '').toLowerCase()
  }
  const m = text.match(/(?<![\w.])@([A-Za-z0-9._]{2,30})(?![\w@])/)
  if (!m || /\.(edu|com|org|net)$/i.test(m[1])) return null
  const clean = m[1].replace(/\.+$/, '').toLowerCase()
  return RESERVED.has(clean) ? null : clean
}

export function guessCategory(nameOrClub) {
  return categorizeClub(typeof nameOrClub === 'string' ? { name: nameOrClub } : nameOrClub)
}

function extractSectionMeta(html) {
  let discord = null
  let website = null
  const emails = []
  for (const m of String(html || '').matchAll(/href=["']mailto:([^"'?\s>]+)/gi)) {
    const addr = m[1].trim().toLowerCase()
    if (addr && !emails.includes(addr)) emails.push(addr)
  }
  for (const m of String(html || '').matchAll(/href=["'](https?:\/\/[^"'\s>]+)["']/gi)) {
    const url = m[1].replace(/&amp;/g, '&').trim()
    if (!discord && /discord\.(?:gg|com\/invite)\/[A-Za-z0-9-]+/i.test(url)) {
      discord = url
      continue
    }
    if (
      !website &&
      !/(?:instagram\.com|instagr\.am|getinvolved\.ucsc\.edu|facebook\.com\/ucsc|twitter\.com\/ucsc|ucop\.edu)/i.test(
        url
      )
    ) {
      website = url
    }
  }

  let description = null
  let orgStatus = 'active'
  let orgStatusNote = null

  for (const pm of String(html || '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
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

// ── Source 1: Official SOMeCA Student Organization Directory ─────────────

export function parseDirectory(html) {
  // Everything from the "Suspended Organizations" / "Dismissed Organizations" headings on is not active.
  // Allow nested inline tags like <h2><strong><strong>Suspended Organizations</strong></strong></h2>.
  const cut = String(html || '').search(/<h[1-6][^>]*>(?:<[^>]+>|\s)*[^<]*(?:suspended|dismissed)/i)
  const active = cut === -1 ? String(html || '') : String(html || '').slice(0, cut)
  const short = n => n.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  const inactive = new Set()
  if (cut !== -1) {
    const tail = String(html || '').slice(cut)
    // Inspect table rows first so chapters explicitly "on probation" (permitted to continue activities) aren't marked suspended
    const rows = [...tail.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    if (rows.length > 0) {
      for (const rm of rows) {
        const rowHtml = rm[1]
        const rowText = decode(rowHtml)
        if (/\bon probation\b|\bpermitted to continue\b/i.test(rowText)) continue
        const firstCell = rowHtml.match(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/i)
        if (firstCell) {
          const k = short(decode(firstCell[1]))
          if (k && !/organization|details/i.test(k)) inactive.add(k)
        }
      }
    } else {
      for (const m of tail.matchAll(/<(td|li|th)[^>]*>([\s\S]*?)<\/\1>/gi)) {
        const text = decode(m[2])
        if (/\bon probation\b|\bpermitted to continue\b/i.test(text)) continue
        const k = short(text)
        if (k) inactive.add(k)
      }
    }
  }

  const clubs = []
  const sections = active.split(/(?=<h2[\s>])/i).slice(1)
  for (const section of sections) {
    const nameMatch = section.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)
    if (!nameMatch) continue
    const name = decode(nameMatch[1])
    if (
      !name ||
      /^(?:browse by|search|categor|ready to start|you belong here|get involved at ucsc)/i.test(name)
    ) {
      continue
    }
    const handle = instagramHandle(section)
    const meta = extractSectionMeta(section)
    const fallbackEmail =
      decode(section).match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/)?.[0]?.toLowerCase() || null
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
      source: 'someca',
    })
  }
  return clubs
}

// ── Source 2: Official Baskin Engineering Student Organizations ──────────

export function parseBaskinDirectory(html = '') {
  const clubs = []
  const seenNames = new Set()

  // Join section uses `.wp-block-column` cards with cover `<img>` + `<a href="...">Org Name</a>`
  const joinIdx = html.search(/Join a BE club/i)
  const targetHtml = joinIdx !== -1 ? html.slice(joinIdx) : html

  const columns = targetHtml.split(/<div\b[^>]*class=["'][^"']*wp-block-column\b/i).slice(1)
  for (const col of columns) {
    if (!/wp-block-cover\b/i.test(col)) continue
    const linkMatch = col.match(/<a\b[^>]*href=["'](https?:\/\/[^"'\s>]+)["'][^>]*>([\s\S]*?)<\/a>/i)
    if (!linkMatch) continue
    const rawUrl = linkMatch[1].replace(/&amp;/g, '&').trim()
    const name = decode(linkMatch[2])
    if (!name || name.length < 2) continue
    // Skip annual campus event "Baskin Day" & affiliation form links
    if (/^baskin day$/i.test(name) || /affiliation-request|forms\.gle/i.test(rawUrl)) continue

    const key = name.toLowerCase()
    if (seenNames.has(key)) continue
    seenNames.add(key)

    const imgUrl = col.match(/<img\b[^>]*src=["'](https?:\/\/[^"'\s>]+)["']/i)?.[1] || null
    const directIg = parseInstagramProfileHandle(rawUrl)
    const isFacebookOnly = /facebook\.com/i.test(rawUrl)

    clubs.push({
      name,
      instagram: directIg || null,
      email: null,
      discord: /discord\.(?:gg|com\/invite)/i.test(rawUrl) ? rawUrl : null,
      website: directIg || isFacebookOnly ? null : rawUrl,
      iconUrl: imgUrl,
      description: `${name} — Baskin Engineering student organization at UC Santa Cruz.`,
      orgStatus: 'active',
      source: 'baskin_engineering',
    })
  }
  return clubs
}

// ── Source 3: Official UCSC Sport Clubs (OPERS DSE Rec + GoSlugs) ────────

export function parseGoslugsSportClubsIndex(html = '') {
  const urls = new Set()
  for (const m of html.matchAll(/href=["']((?:https?:\/\/goslugs\.com)?\/sports\/20\d{2}\/\d+\/\d+\/[^"'?#\s>]+\.aspx)["']/gi)) {
    const raw = m[1].startsWith('http') ? m[1] : `https://goslugs.com${m[1]}`
    if (!/ucsc-club-sports/i.test(raw)) urls.add(raw)
  }
  return [...urls]
}

export function formatSportClubName(rawName = '') {
  let clean = decode(rawName)
    .replace(/^SC\s*[-–—:]\s*/i, '')
    .replace(/\s*[-–—]\s*University of California,?\s*Santa Cruz.*$/i, '')
    .replace(/^@title.*$/i, '')
    .trim()
  if (!clean) return ''
  if (/^camp kesem$/i.test(clean)) return 'Camp Kesem at UCSC'
  if (/^ucsc\b|^uc santa cruz\b/i.test(clean)) return clean
  if (/\bclub\b|\bteam\b|\bsquad\b|\bdance\b|\btangroupe\b/i.test(clean)) {
    return `UCSC ${clean}`
  }
  return `UCSC ${clean} Club`
}

export function parseGoslugsSubpage(html = '', url = '') {
  const titleRaw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''
  const mainSlice =
    html.match(/<article\b[\s\S]*?<\/article>/i)?.[0] ||
    html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] ||
    html

  const instagrams = []
  for (const m of mainSlice.matchAll(/instagram\.com\/(?:_u\/)?([A-Za-z0-9._]{2,30})/gi)) {
    const h = m[1].replace(/\.+$/, '').toLowerCase()
    if (h && !RESERVED.has(h) && !instagrams.includes(h)) {
      instagrams.push(h)
    }
  }
  const emails = []
  for (const m of mainSlice.matchAll(/mailto:([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/gi)) {
    const e = m[1].trim().toLowerCase()
    if (e && !/^(?:opers|sportclubs|athletics|someca)@/i.test(e) && !emails.includes(e)) {
      emails.push(e)
    }
  }
  let discord = null
  const dm = mainSlice.match(/https?:\/\/(?:www\.)?discord\.(?:gg|com\/invite)\/[A-Za-z0-9-]{2,36}/i)
  if (dm) discord = dm[0]

  return {
    url,
    name: formatSportClubName(titleRaw),
    instagram: instagrams[0] || null,
    email: emails[0] || null,
    extraEmails: emails.slice(1),
    discord,
  }
}

export function parseDserecSportClubs(dserecList = [], goslugsSubpages = []) {
  const subByUrl = new Map()
  const subByKey = new Map()
  for (const sub of goslugsSubpages) {
    if (sub.url) subByUrl.set(sub.url.toLowerCase(), sub)
    const k = canonicalClubNameKey(sub.name)
    if (k && !subByKey.has(k)) subByKey.set(k, sub)
  }

  const clubs = []
  const usedSubUrls = new Set()

  for (const item of Array.isArray(dserecList) ? dserecList : []) {
    if (item?.is_active === false || item?.show_online === false) continue
    const rawSite = String(item?.team_website || '').trim()
    const formattedName = formatSportClubName(item?.name || '')
    if (!formattedName) continue

    const matchedSub =
      (rawSite && subByUrl.get(rawSite.toLowerCase())) ||
      subByKey.get(canonicalClubNameKey(formattedName)) ||
      null
    if (matchedSub?.url) usedSubUrls.add(matchedSub.url.toLowerCase())

    const finalName = matchedSub?.name || formattedName
    const website = rawSite || matchedSub?.url || 'https://goslugs.com/sports/2025/1/27/ucsc-club-sports'
    const iconUrl = item?.icon || item?.file?.url || null
    const rawDesc = decode(item?.description || '')

    clubs.push({
      name: finalName,
      instagram: matchedSub?.instagram || null,
      email: matchedSub?.email || null,
      ...(matchedSub?.extraEmails?.length ? { extraEmails: matchedSub.extraEmails } : {}),
      discord: matchedSub?.discord || null,
      website,
      iconUrl,
      description:
        rawDesc.length >= 15
          ? rawDesc
          : `${finalName} — official UC Santa Cruz Recreation & Athletics Sport Club.`,
      orgStatus: 'active',
      source: 'sport_clubs',
    })
  }

  // Include any GoSlugs subpage not yet in DSERec JSON
  for (const sub of goslugsSubpages) {
    if (!sub?.name || (sub.url && usedSubUrls.has(sub.url.toLowerCase()))) continue
    clubs.push({
      name: sub.name,
      instagram: sub.instagram || null,
      email: sub.email || null,
      ...(sub.extraEmails?.length ? { extraEmails: sub.extraEmails } : {}),
      discord: sub.discord || null,
      website: sub.url || null,
      description: `${sub.name} — official UC Santa Cruz Sport Club.`,
      orgStatus: 'active',
      source: 'sport_clubs',
    })
  }

  return clubs
}

// ── Source 4: College Student Governments & Campus Councils ──────────────

const COLLEGE_GOV_DISPLAY_NAMES = {
  'crown college': 'Crown College Student Senate',
  'john r. lewis college': 'John R. Lewis College Student Senate',
  'kresge college': 'Kresge Parliament',
  'merrill college': 'Merrill Student Government',
  'oakes college': 'Oakes College Senate',
  'porter college': 'Porter College Senate',
  'rachel carson college': 'Rachel Carson College Student Council',
  'stevenson college': 'Stevenson Student Council',
}

export function parseCollegeGovernments(html = '') {
  const clubs = []
  const blocks = String(html || '').split(/(?=<h[2-4]\b)/i)
  for (const block of blocks) {
    const hm = block.match(/^<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/i)
    if (!hm) continue
    const rawTitle = decode(hm[1])
    if (!rawTitle || /get involved|menu|navigation|quick links|you belong here/i.test(rawTitle)) continue
    if (!/\b(?:college|cowell|stevenson|crown|merrill|porter|kresge|oakes|carson|lewis|senate)\b/i.test(rawTitle)) {
      continue
    }
    const name = COLLEGE_GOV_DISPLAY_NAMES[rawTitle.toLowerCase()] || rawTitle
    const meta = extractSectionMeta(block)
    const handle = instagramHandle(block)
    clubs.push({
      name,
      instagram: handle,
      email: meta.emails[0] || null,
      ...(meta.emails.length > 1 ? { extraEmails: meta.emails.slice(1) } : {}),
      discord: meta.discord,
      website: meta.website,
      description:
        meta.description ||
        `${name} — official residential college student government representing UC Santa Cruz students.`,
      orgStatus: 'active',
      source: 'college_government',
    })
  }
  return clubs
}

export function parseSomecaGovernanceAndCouncils(html = '', sourceTag = 'campus_councils') {
  const clubs = []
  const blocks = String(html || '').split(/(?=<h[23]\b)/i)
  for (const block of blocks) {
    const hm = block.match(/^<h[23][^>]*>([\s\S]*?)<\/h[23]>/i)
    if (!hm) continue
    const title = decode(hm[1])
    if (
      !title ||
      /student-governed|you belong here|college’s student government|college's student government|browse|search/i.test(
        title
      )
    ) {
      continue
    }
    if (!/\b(?:assembly|association|council|board of directors|governance board)\b/i.test(title)) {
      continue
    }
    const meta = extractSectionMeta(block)
    // Ignore PDF charter links as club websites
    const cleanWebsite = meta.website && !/\.pdf$/i.test(meta.website) ? meta.website : null
    const handle = instagramHandle(block)
    clubs.push({
      name: title,
      instagram: handle,
      email: meta.emails[0] || null,
      ...(meta.emails.length > 1 ? { extraEmails: meta.emails.slice(1) } : {}),
      discord: meta.discord,
      website: cleanWebsite,
      description:
        meta.description || `${title} — official student-governed council/assembly at UC Santa Cruz.`,
      orgStatus: 'active',
      source: sourceTag,
    })
  }
  return clubs
}

// ── Source 5: Social / Grassroots UCSC Club Classifier & Discovery ───────

// Conduct-suspended / dismissed chapters from SOMeCA that must not be re-added via social search
const CONDUCT_BLOCKED_PATTERNS = [
  /\bstudents for justice in palestine\b|\bsjp\b/i,
  /\bsigma phi zeta\b/i,
  /\bdelta omega chi\b/i,
  /\blambda phi epsilon\b/i,
  /\bpi alpha phi\b/i,
  /\bpsi chi omega\b/i,
  /(?<!delta\s)\bsigma pi\b(?!\s+alpha)/i,
  /\btau kappa epsilon\b|\btke\b/i,
  /\btheta chi\b/i,
]

function hasCleanUcscAffiliation(username, normName) {
  const u = String(username || '').toLowerCase()
  const n = String(normName || '').toLowerCase()

  if (
    /^(?:slugsonwheelsclub|slugsontwowheels|santacruzskiandsnow|cruzhacks|formulaslug|slugbotics|slugsec|sweslugs|slugultimate|slugxc|slugsvolleyball|slugshockey|cruzlacrosse|sol_ultimate|tangroupe|kzsc|kzsc881|cityonahillpress|fishraplive|autoslug|neurotechsc|santacruzai|kresge_parliament)$/i.test(
      u
    )
  ) {
    return true
  }

  if (
    /\b(?:ucsc|uc santa cruz|banana slugs?)\b/i.test(n) ||
    /\b(?:cowell|stevenson|crown|merrill|porter|kresge|oakes|rachel carson|college nine|john r\.? lewis)\s+(?:college\s+)?(?:student\s+)?(?:senate|parliament|council|government)\b/i.test(
      n
    )
  ) {
    return true
  }

  const idx = u.indexOf('ucsc')
  if (idx !== -1) {
    const before = u.slice(0, idx)
    const after = u.slice(idx + 4)
    // Avoid substring collisions: washucsc (WashU CSC), nyucsc (NYU CSC), ucsclimbing (UCS Climbing), ucschool (UC School)
    if (/(?:wash|ny|bj|mvs|hp|jr|nw|os|ms|ls|as|cs|ws|fs|ps|ts)$/i.test(before)) return false
    if (/^(?:ollege|hool|limbing|lt\b|oop|aracas|omet|fms)/i.test(after)) return false
    return true
  }

  return false
}

export function isGenuineUcscClubCandidate(entry = {}) {
  const u = String(entry.username || entry.instagram || '').toLowerCase().replace(/^@+/, '').trim()
  const rawName = String(entry.full_name || entry.name || '').trim()
  const normName = normalizeUnicodeText(rawName)
  const combined = `${u} ${normName}`

  if (!u || RESERVED.has(u) || entry.is_private) return false

  for (const pat of CONDUCT_BLOCKED_PATTERNS) {
    if (pat.test(combined)) return false
  }

  // 1. Reject foreign "UCSC" universities (Chile, Italy, Sri Lanka) & non-CA "Santa Cruz"
  if (
    /\b(facultad|direccion|pastoral|ingenieria|ciencias|educacion|teologia|medicina|kinesiologia|periodismo|futbol|femenino|postgrados|inclusion|talcahuano|thno|avanzar|carcasas|carnavalera|san cayetano|cattolica|jecatt|lm-\d+|futebol|clube|esporte|atletico|deportivo|aereo|tenis|salon|estetica|bolivia|capibaribe|do sul|upi|uzbek|saline county|upper chesapeake|universal car|emma emeriti|ifmsa)\b/i.test(
      combined
    ) ||
    /(?:cee\.|dae_|_dae|ucsc\.cl|ucsc\.ua|ucsc\.uz|ucsc\.upi|cattolica)/i.test(u)
  ) {
    return false
  }

  // 2. Reject other universities & cities
  if (
    /\b(washu|nyu|bju|mvsu|hpu|jru|uog|u of t|osu|pitt|mtu|ncsu|nait|uwm|fordham|hinsdale|humboldt|union county|uppsala|rva|dubai|berlin|singapore|south bend|salt city|ucs\b)\b/i.test(
      normName
    )
  ) {
    return false
  }

  // 3. Reject UCSC administrative offices, academic departments, dining halls, research labs, NCAA varsity teams, meme/confession pages, local businesses
  if (
    /\b(department|division|dining hall|advising|career|careers|care\b|taps\b|police|library|registrar|admissions|alumni|extension|institute of|center for|norris center|el centro|shop\s*@?\s*ucsc|ucsc athletics|sport clubs|lab\b|laboratory|kap\/sar|raimondi|kroeker|mfa\b|phd\b|tim\d+|20\d{2} .*bios|class of 20\d{2}|class council|council of chairs|crisis communication|financial affairs|green team|ssa team|sustainability advisors|yik\s*yak|fizz|cupid|carspotting|cars of uc|naked\s*run|run me my money|robs\b|drinking team|art hoes|nshit|self\s*care|parkside|graffiti|short film by|skincare|esthetic|acne|barber|realty|property|(?<!cross\s)country club|athletic club|fitness club|kustom|hyundai|line dance lessons|(?<!water\s)polo club|school of)\b/i.test(
      combined
    ) ||
    /^(?:ucsc|ucsc_athletics|ucsc_sportclubs|ucsc_mbb|ucsc_wvb|ucscswimanddive|ucsc_msoc|ucsc_wsoc|ucsc_taps|ucsccowelldh|ucscrcodininghall|ucsccareers|ucsccareersuccess|ucsantacruz_care|ucsc_care|care\.ucsc|ucsc_oarcadv|ucsc_oakescara|rcc_ucsc|porter\.college|ucscmusic|ucsc_art_department|ucsc_arts_division|ucsctheaterarts|ucschumanities|fdm\.ucsc|ucsc\.cse|ucsc_bees|councilofchairs|ucscsurfteamsucks|ucsc_club_?|ucsc\.club|ucsc_creations|slugtunesnshit|ucscrobs|ucscgreenteamfa|ucsc_suacct|ucscsustainabilityadvisors)$/i.test(
      u
    )
  ) {
    return false
  }

  if (!hasCleanUcscAffiliation(u, normName)) return false
  if (!normName || normName.length < 3 || /^@/.test(normName)) return false

  const orgWordRe =
    /\b(club|clubs|team|society|association|organization|union|council|senate|parliament|government|assembly|coalition|collective|alliance|chapter|fraternity|sorority|brigade|sisters|project|robotics|rocket|rocketry|gaming|esports|radio|media|magazine|journal|press|choir|band|orchestra|troupe|cabaret|dance|a\s*cappella|rugby|lacrosse|soccer|volleyball|basketball|baseball|softball|tennis|table tennis|pickleball|badminton|water polo|polo|hockey|fencing|judo|taekwondo|muay thai|wrestling|grappling|kendo|boxing|cycling|bikepacking|triathlon|sailing|surf|skimboard|skate|skatboarding|skateboard|ski|snow|snowboard|disc golf|ultimate|quidditch|cross country|run|yoga|climbing|outdoors?|camping|backpacking|chess|mahjong|pokemon|roblox|cosplay|crochet|fiber|tango|ballroom|breakers|spirit|kesem|rotaract|red cross|divest|sky\b|sankofa|psa\b|tsa\b|hsa\b|gsa\b|sisa\b|tlsa\b|cnsa\b|ansa\b|ppsa\b|swana\b|yuva\b|rishi\b|acm\b|ieee\b|swe\b|shpe\b|nsbe\b|sacnas\b|igem\b|neurotech|blueprint|formulaslug|cruzhacks|kzsc|slugworks|slugwerks|wheels|bioslugs|praxis|herpetology|plant|pre-?vet|pre-?law|investing|startup|bioinformatics|astronomy|anthro|poets|freethinkers|regents|interfaith|inter-greek|rotc|hospital|music|musicians)\b/i

  return orgWordRe.test(combined)
}

export function formatDiscoveredClubEntry(entry = {}, sourceTag = 'instagram_discovery') {
  const handle = String(entry.username || entry.instagram || '').toLowerCase().replace(/^@+/, '').trim()
  let cleanName = normalizeUnicodeText(entry.full_name || entry.name || handle)
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/^s³\s*\|\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (sourceTag === 'mention_discovery' && cleanName === cleanName.toLowerCase()) {
    cleanName = cleanName
      .split(' ')
      .map(w => (/^ucsc$/i.test(w) ? 'UCSC' : /^(?:and|of|at|on|in|for)$/i.test(w) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(' ')
  }

  let alsoKnownAs = []
  if (handle === 'slugsontwowheels') {
    cleanName = 'Slugs on Two Wheels (SlugWerks)'
    alsoKnownAs = ['Slugs on Two Wheels', 'SlugWerks']
  } else if (handle === 'santacruzskiandsnow') {
    cleanName = cleanName || 'Santa Cruz Ski & Board Club'
    alsoKnownAs = ['Santa Cruz Ski and Snow', 'UCSC Ski and Snow Club']
  } else if (/^balloon club$/i.test(cleanName)) {
    cleanName = 'UCSC Balloon Brigade'
  } else if (/^ucsc costco club$/i.test(cleanName)) {
    cleanName = 'UCSC Costco Club'
  } else if (/^ucsc skatboarding$/i.test(cleanName)) {
    cleanName = 'UCSC Skateboarding Club'
  } else if (/^society of stem sisters$/i.test(cleanName)) {
    cleanName = 'Society of STEM Sisters at UCSC'
  }

  return {
    name: cleanName || handle,
    instagram: handle,
    ...(alsoKnownAs.length ? { alsoKnownAs } : {}),
    email: entry.email || null,
    discord: entry.discord || null,
    website: entry.website || null,
    iconUrl: entry.profile_pic_url || entry.iconUrl || null,
    description: entry.description || null,
    orgStatus: 'active',
    source: sourceTag,
  }
}

export function discoverMentionsFromSnapshot(snapshot, existingHandles = new Set()) {
  if (!snapshot || typeof snapshot !== 'object') return []
  const mentionNames = new Map()
  const scanText = txt => {
    for (const m of String(txt || '').matchAll(/(?<![\w.])@([A-Za-z0-9._]{3,30})(?![\w@])/g)) {
      const h = m[1].replace(/\.+$/, '').toLowerCase()
      if (!h || existingHandles.has(h) || RESERVED.has(h) || /\.(edu|com|org|net)$/i.test(h)) continue
      mentionNames.set(h, (mentionNames.get(h) || 0) + 1)
    }
  }
  for (const p of snapshot.posts || []) scanText(p?.caption)
  for (const c of snapshot.clubs || []) scanText(c?.bio)

  const candidates = []
  for (const [handle] of mentionNames) {
    // Convert handle into readable words to check if handle itself is clearly a UCSC club/parliament/ski org
    const humanized = handle
      .replace(/[._]+/g, ' ')
      .replace(/ucsc/gi, 'UCSC ')
      .replace(/santacruz/gi, 'Santa Cruz ')
      .replace(/skiandsnow/gi, 'Ski and Snow Club')
      .replace(/\s+/g, ' ')
      .trim()
    const synthetic = { username: handle, full_name: humanized }
    if (isGenuineUcscClubCandidate(synthetic)) {
      candidates.push(formatDiscoveredClubEntry(synthetic, 'mention_discovery'))
    }
  }
  return candidates
}

function runInstagramSearchDiscovery({
  pythonBin = process.env.PYTHON_BIN || (fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3'),
  timeoutMs = 240_000,
} = {}) {
  if (!fs.existsSync(DISCOVER_IG_SCRIPT)) {
    return Promise.resolve({ clubs: [], authenticated: false })
  }
  return new Promise(resolve => {
    const proc = spawn(pythonBin, [DISCOVER_IG_SCRIPT], {
      stdio: ['ignore', 'pipe', 'inherit'],
      env: process.env,
    })
    let stdout = ''
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        try { proc.kill('SIGTERM') } catch { /* ignore */ }
        resolve({ clubs: [], authenticated: false })
      }
    }, timeoutMs)

    proc.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8')
    })
    proc.on('error', () => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve({ clubs: [], authenticated: false })
      }
    })
    proc.on('close', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        const parsed = JSON.parse(stdout.trim() || '{}')
        const accepted = []
        for (const raw of parsed.clubs || []) {
          if (isGenuineUcscClubCandidate(raw)) {
            accepted.push(formatDiscoveredClubEntry(raw, 'instagram_discovery'))
          }
        }
        resolve({ clubs: accepted, authenticated: Boolean(parsed.authenticated) })
      } catch {
        resolve({ clubs: [], authenticated: false })
      }
    })
  })
}

async function mapConcurrent(items, concurrency, worker) {
  const out = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = cursor++
      if (idx >= items.length) break
      out[idx] = await worker(items[idx], idx)
    }
  })
  await Promise.all(runners)
  return out
}

async function fetchTextSafe(url, timeoutMs = 15000) {
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/json,*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`${url} returned ${res.status}`)
  return res.text()
}

// ── Main Multi-Source Catalog Aggregator ─────────────────────────────────

export async function updateClubsCatalog({
  htmlOverride = null,
  baskinHtmlOverride = null,
  dserecJsonOverride = null,
  goslugsSubpagesOverride = null,
  collegesGovHtmlOverride = null,
  igCandidatesOverride = null,
  crawlDirectoryWebsites = null,
  clubsFilePath = CLUBS_FILE,
} = {}) {
  const isSingleFixtureMode =
    Boolean(htmlOverride) &&
    !baskinHtmlOverride &&
    !dserecJsonOverride &&
    !collegesGovHtmlOverride &&
    !igCandidatesOverride

  const shouldCrawlWebsites =
    crawlDirectoryWebsites !== null ? Boolean(crawlDirectoryWebsites) : !isSingleFixtureMode

  const activeSourcesFetched = new Set()
  const rawDiscovered = []

  // 1. Official SOMeCA Directory
  try {
    let somecaHtml = htmlOverride
    if (!somecaHtml) {
      console.log(`Downloading SOMeCA directory: ${SOMECA_JOIN_URL}`)
      somecaHtml = await fetchTextSafe(SOMECA_JOIN_URL, 20000)
    }
    const somecaClubs = parseDirectory(somecaHtml)
    if (somecaClubs.length < 20) {
      throw new Error(`Only found ${somecaClubs.length} clubs on SOMeCA; layout may have changed.`)
    }
    activeSourcesFetched.add('someca')
    rawDiscovered.push(...somecaClubs)
  } catch (err) {
    if (isSingleFixtureMode) throw err
    console.warn(`⚠️ SOMeCA directory fetch failed (${err.message}); preserving existing SOMeCA entries.`)
  }

  // 2. Official UCSC Sport Clubs (OPERS DSE Rec API + GoSlugs subpages)
  if (!isSingleFixtureMode || dserecJsonOverride || goslugsSubpagesOverride) {
    try {
      let dserecList = dserecJsonOverride
      let goslugsSubs = goslugsSubpagesOverride
      if (!dserecList && !isSingleFixtureMode) {
        console.log(`Downloading UCSC Sport Clubs API: ${DSEREC_SPORT_CLUBS_API}`)
        const rawJson = await fetchTextSafe(DSEREC_SPORT_CLUBS_API, 15000)
        dserecList = JSON.parse(rawJson)
      }
      if (!goslugsSubs && !isSingleFixtureMode) {
        try {
          const gsIndexHtml = await fetchTextSafe(GOSLUGS_SPORT_CLUBS_URL, 15000)
          const subUrls = parseGoslugsSportClubsIndex(gsIndexHtml)
          // Also include any goslugs.com URLs listed in DSERec team_website
          for (const d of dserecList || []) {
            if (d?.team_website && /goslugs\.com/i.test(d.team_website) && !subUrls.includes(d.team_website)) {
              subUrls.push(d.team_website)
            }
          }
          goslugsSubs = (
            await mapConcurrent(subUrls, 6, async u => {
              try {
                const subHtml = await fetchTextSafe(u, 10000)
                return parseGoslugsSubpage(subHtml, u)
              } catch {
                return null
              }
            })
          ).filter(Boolean)
        } catch (gsErr) {
          console.warn(`  ! GoSlugs subpages partial warning: ${gsErr.message}`)
          goslugsSubs = []
        }
      }
      const sportClubs = parseDserecSportClubs(dserecList || [], goslugsSubs || [])
      if (sportClubs.length > 0) {
        activeSourcesFetched.add('sport_clubs')
        rawDiscovered.push(...sportClubs)
        console.log(`  + Parsed ${sportClubs.length} active UCSC Sport Clubs`)
      }
    } catch (err) {
      console.warn(`⚠️ Sport Clubs directory fetch skipped: ${err.message}`)
    }
  }

  // 3. Official Baskin Engineering Student Organizations
  if (!isSingleFixtureMode || baskinHtmlOverride) {
    try {
      const baskinHtml =
        baskinHtmlOverride || (await fetchTextSafe(BASKIN_ORGS_URL, 15000))
      const baskinClubs = parseBaskinDirectory(baskinHtml)
      if (baskinClubs.length > 0) {
        activeSourcesFetched.add('baskin_engineering')
        rawDiscovered.push(...baskinClubs)
        console.log(`  + Parsed ${baskinClubs.length} Baskin Engineering student organizations`)
      }
    } catch (err) {
      console.warn(`⚠️ Baskin Engineering directory fetch skipped: ${err.message}`)
    }
  }

  // 4. Official UCSC College Student Governments & Campus Councils
  if (!isSingleFixtureMode || collegesGovHtmlOverride) {
    try {
      const collegesHtml =
        collegesGovHtmlOverride || (await fetchTextSafe(COLLEGES_GOV_URL, 15000))
      const govClubs = parseCollegeGovernments(collegesHtml)
      if (govClubs.length > 0) {
        activeSourcesFetched.add('college_government')
        rawDiscovered.push(...govClubs)
        console.log(`  + Parsed ${govClubs.length} Residential College Student Governments`)
      }
    } catch (err) {
      console.warn(`⚠️ College Governments directory fetch skipped: ${err.message}`)
    }

    if (!collegesGovHtmlOverride && !isSingleFixtureMode) {
      for (const [url, tag] of [
        [SOMECA_GOV_URL, 'campus_councils'],
        [SOMECA_COUNCILS_URL, 'campus_councils'],
      ]) {
        try {
          const html = await fetchTextSafe(url, 12000)
          const parsedCouncils = parseSomecaGovernanceAndCouncils(html, tag)
          if (parsedCouncils.length > 0) {
            activeSourcesFetched.add(tag)
            rawDiscovered.push(...parsedCouncils)
          }
        } catch {
          // non-fatal
        }
      }
    }
  }

  // 4b. Enrich official directory orgs by crawling their listed club websites for Instagram, Discord & Email
  if (shouldCrawlWebsites) {
    const needWebCrawl = rawDiscovered.filter(
      c => !c.suspended && c.website && (!c.instagram || !c.discord || !c.email)
    )
    if (needWebCrawl.length > 0) {
      console.log(`  ↻ Crawling ${needWebCrawl.length} club websites for social handles & Discord links...`)
      await mapConcurrent(needWebCrawl, 6, async c => {
        const socials = await discoverClubWebsiteSocials(c.website)
        if (!c.instagram && socials.instagram) c.instagram = socials.instagram
        if (!c.discord && socials.discord) c.discord = socials.discord
        if (!c.email && socials.emails.length > 0) {
          c.email = socials.emails[0]
          const rest = socials.emails.slice(1)
          if (rest.length) c.extraEmails = [...new Set([...(c.extraEmails || []), ...rest])]
        }
        if (
          socials.description &&
          (!c.description || /student organization at UC Santa Cruz|official UC Santa Cruz/i.test(c.description))
        ) {
          c.description = socials.description
        }
      })
    }
  }

  const existing = fs.existsSync(clubsFilePath)
    ? JSON.parse(fs.readFileSync(clubsFilePath, 'utf8'))
    : []

  // 5. Social & Grassroots Discovery: Post/Bio @mentions + Instagram UCSC Search
  if (!isSingleFixtureMode || igCandidatesOverride) {
    const knownHandles = new Set(
      [...existing, ...rawDiscovered]
        .map(c => String(c?.instagram || '').toLowerCase())
        .filter(Boolean)
    )

    // 5a. Scan cached snapshot captions & bios for @mentioned UCSC clubs
    for (const snapPath of [
      path.join(REPO_ROOT, 'public', 'clubhub-data.json'),
      path.join(ROOT, 'output', 'clubhub-data.json'),
    ]) {
      if (fs.existsSync(snapPath)) {
        try {
          const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'))
          const mentionClubs = discoverMentionsFromSnapshot(snap, knownHandles)
          if (mentionClubs.length > 0) {
            rawDiscovered.push(...mentionClubs)
            for (const mc of mentionClubs) knownHandles.add(mc.instagram)
          }
          break
        } catch {
          // ignore unreadable snapshot
        }
      }
    }

    // 5b. Run authenticated Instaloader UCSC search (or test override)
    if (Array.isArray(igCandidatesOverride)) {
      const filtered = igCandidatesOverride
        .filter(isGenuineUcscClubCandidate)
        .map(c => formatDiscoveredClubEntry(c, 'instagram_discovery'))
      activeSourcesFetched.add('instagram_discovery')
      rawDiscovered.push(...filtered)
    } else if (process.env.SKIP_IG_CLUB_DISCOVERY !== 'true') {
      const igDisc = await runInstagramSearchDiscovery()
      if (igDisc.authenticated && igDisc.clubs.length > 0) {
        activeSourcesFetched.add('instagram_discovery')
        rawDiscovered.push(...igDisc.clubs)
        console.log(`  + Discovered ${igDisc.clubs.length} UCSC clubs via Instagram search`)
      }
    }
  }

  if (rawDiscovered.length === 0) {
    throw new Error('No clubs discovered from any source; clubs.json was not touched.')
  }

  // Index existing catalog entries by handle, explicit id, and canonical name
  const prevByHandle = new Map()
  const prevById = new Map()
  const prevByNameKey = new Map()
  for (const prev of existing) {
    const h = String(prev.instagram || '').toLowerCase().trim()
    const cid = String(prev.id || h).toLowerCase().trim()
    const nk = canonicalClubNameKey(prev.name)
    if (h) prevByHandle.set(h, prev)
    if (cid) prevById.set(cid, prev)
    if (nk && !prevByNameKey.has(nk)) prevByNameKey.set(nk, prev)
  }

  const out = []
  const byHandle = new Map()
  const byId = new Map()
  const byCanonicalName = new Map()
  let skippedSuspended = 0
  let keptWithoutIg = 0

  const OFFICIAL_SOURCES = new Set([
    'someca',
    'sport_clubs',
    'baskin_engineering',
    'college_government',
    'campus_councils',
  ])

  const mergeIntoExistingRecord = (target, incoming) => {
    const prevSources = target.sources || []
    const wasOnlyMention = prevSources.length === 1 && prevSources[0] === 'mention_discovery'
    const incomingSource = incoming.source || 'someca'
    const mergedSources = [...new Set([...prevSources, incomingSource])]
    target.sources = mergedSources

    // If target was created from a humanized @mention handle and incoming has the real profile/directory name, upgrade name!
    if (wasOnlyMention && incoming.name && incomingSource !== 'mention_discovery') {
      const oldName = target.name
      target.name = incoming.name
      if (
        oldName &&
        oldName.toLowerCase() !== target.name.toLowerCase() &&
        !(target.alsoKnownAs || []).some(a => a.toLowerCase() === oldName.toLowerCase())
      ) {
        target.alsoKnownAs = [...(target.alsoKnownAs || []), oldName]
      }
    }

    // If target had no Instagram handle yet (e.g. SPA website in Baskin/DSERec) and incoming has one, upgrade it!
    if (!target.instagram && incoming.instagram && !byHandle.has(incoming.instagram)) {
      const oldId = target.id
      target.instagram = incoming.instagram
      delete target.id
      delete target.noInstagram
      if (oldId) byId.delete(oldId)
      byHandle.set(target.instagram, target)
    }

    // Add distinct alias if two SOMeCA orgs share an Instagram handle or have an alternate official name
    if (
      incoming.name &&
      incoming.name.toLowerCase() !== target.name.toLowerCase() &&
      !(target.alsoKnownAs || []).some(a => a.toLowerCase() === incoming.name.toLowerCase())
    ) {
      // Only add as alias when sharing exact IG handle from official sources (e.g. ESLP + Student Environmental Center)
      if (incoming.instagram && incoming.instagram === target.instagram && OFFICIAL_SOURCES.has(incomingSource)) {
        target.alsoKnownAs = [...(target.alsoKnownAs || []), incoming.name]
      }
    }
    for (const alias of incoming.alsoKnownAs || []) {
      if (
        alias.toLowerCase() !== target.name.toLowerCase() &&
        !(target.alsoKnownAs || []).some(a => a.toLowerCase() === alias.toLowerCase())
      ) {
        target.alsoKnownAs = [...(target.alsoKnownAs || []), alias]
      }
    }

    if (!target.email && incoming.email) target.email = incoming.email
    for (const em of [incoming.email, ...(incoming.extraEmails || [])].filter(Boolean)) {
      if (em !== target.email && !(target.extraEmails || []).includes(em)) {
        target.extraEmails = [...(target.extraEmails || []), em]
      }
    }
    if (!target.website && incoming.website) target.website = incoming.website
    if (!target.discord && incoming.discord) target.discord = incoming.discord
    if (!target.iconUrl && incoming.iconUrl) target.iconUrl = incoming.iconUrl
    if (!target.description && incoming.description) target.description = incoming.description

    target.category = categorizeClub({
      name: target.name,
      alsoKnownAs: target.alsoKnownAs,
      instagram: target.instagram,
      email: target.email,
      description: target.description,
      category: target.category !== 'community' ? target.category : null,
    })
  }

  for (const c of rawDiscovered) {
    if (c.suspended) {
      skippedSuspended++
      continue
    }

    const handle = String(c.instagram || '').toLowerCase().replace(/^@+/, '').trim() || null
    const nameKey = canonicalClubNameKey(c.name)
    const isOfficialSource = OFFICIAL_SOURCES.has(c.source)

    // 1. Exact Instagram handle match -> merge metadata & sources
    if (handle && byHandle.has(handle)) {
      mergeIntoExistingRecord(byHandle.get(handle), { ...c, instagram: handle })
      continue
    }

    // 2. Canonical club name match:
    //    - Links a no-IG Baskin/Sport Club record with its discovered Instagram handle, OR
    //    - Prevents Instagram search from creating a duplicate entry for an old handle of an already-listed club
    if (nameKey && byCanonicalName.has(nameKey)) {
      const existingMatch = byCanonicalName.get(nameKey)
      if (!existingMatch.instagram && handle) {
        mergeIntoExistingRecord(existingMatch, { ...c, instagram: handle })
        continue
      }
      if (!handle || !isOfficialSource) {
        mergeIntoExistingRecord(existingMatch, { ...c, instagram: handle })
        continue
      }
    }

    // 3. Handle clubs without Instagram: keep official directory orgs that have email/website/discord/description
    let fallbackId = null
    if (!handle) {
      if (!isOfficialSource) continue
      if (!c.email && !c.website && !c.discord && !c.description) continue
      // Check if previous catalog already linked an Instagram handle for this exact club name
      const prevMatchedByName = nameKey ? prevByNameKey.get(nameKey) : null
      if (prevMatchedByName?.instagram && !byHandle.has(prevMatchedByName.instagram.toLowerCase())) {
        c.instagram = prevMatchedByName.instagram.toLowerCase()
      } else {
        fallbackId = slugifyClubId(c.name)
        if (!fallbackId || byId.has(fallbackId)) continue
        keptWithoutIg++
      }
    }

    const finalHandle = String(c.instagram || '').toLowerCase().replace(/^@+/, '').trim()
    const prev =
      (finalHandle && prevByHandle.get(finalHandle)) ||
      (fallbackId && prevById.get(fallbackId)) ||
      (nameKey && !finalHandle ? prevByNameKey.get(nameKey) : null) ||
      null

    const primaryEmail = c.email || prev?.email || null
    const mergedExtraEmails = [
      ...new Set(
        [...(c.extraEmails || []), ...(prev?.extraEmails || [])].filter(
          e => e && e !== primaryEmail
        )
      ),
    ]
    const mergedSources = [
      ...new Set([...(prev?.sources || []), ...(c.source ? [c.source] : ['someca'])]),
    ]
    const mergedAliases = [
      ...new Set([...(c.alsoKnownAs || []), ...(prev?.alsoKnownAs || [])].filter(Boolean)),
    ]

    const club = {
      ...(fallbackId && !finalHandle ? { id: fallbackId, noInstagram: true } : {}),
      name: c.name || prev?.name || finalHandle || fallbackId,
      instagram: finalHandle || '',
      category: categorizeClub({
        name: c.name || prev?.name,
        alsoKnownAs: mergedAliases,
        instagram: finalHandle,
        email: primaryEmail,
        description: c.description || prev?.description,
        category: prev?.category !== 'community' ? prev?.category : null,
      }),
      email: primaryEmail,
      ...(mergedExtraEmails.length ? { extraEmails: mergedExtraEmails } : {}),
      ...(mergedAliases.length ? { alsoKnownAs: mergedAliases } : {}),
      ...(c.description || prev?.description
        ? { description: c.description || prev?.description }
        : {}),
      ...(c.orgStatus && c.orgStatus !== 'active'
        ? { orgStatus: c.orgStatus }
        : prev?.orgStatus && prev.orgStatus !== 'active'
          ? { orgStatus: prev.orgStatus }
          : {}),
      ...(c.orgStatusNote || prev?.orgStatusNote
        ? { orgStatusNote: c.orgStatusNote || prev?.orgStatusNote }
        : {}),
      ...(c.discord || prev?.discord ? { discord: c.discord || prev?.discord } : {}),
      ...(prev?.discordGuildId ? { discordGuildId: prev.discordGuildId } : {}),
      ...(prev?.discordServerName ? { discordServerName: prev.discordServerName } : {}),
      ...(prev?.discordFollowable !== undefined ? { discordFollowable: prev.discordFollowable } : {}),
      ...(prev?.discordMemberCount != null ? { discordMemberCount: prev.discordMemberCount } : {}),
      ...(prev?.discordOnlineCount != null ? { discordOnlineCount: prev.discordOnlineCount } : {}),
      ...(prev?.discordIconUrl ? { discordIconUrl: prev.discordIconUrl } : {}),
      ...(c.website || prev?.website ? { website: c.website || prev?.website } : {}),
      ...(c.iconUrl || prev?.iconUrl ? { iconUrl: c.iconUrl || prev?.iconUrl } : {}),
      ...(prev?.discordChannelId ? { discordChannelId: prev.discordChannelId } : {}),
      ...(prev?.manual ? { manual: true } : {}),
      sources: mergedSources,
    }

    if (finalHandle) byHandle.set(finalHandle, club)
    if (fallbackId && !finalHandle) byId.set(fallbackId, club)
    if (nameKey && !byCanonicalName.has(nameKey)) byCanonicalName.set(nameKey, club)
    out.push(club)
  }

  // Preserve manual clubs AND clubs from any source that wasn't re-fetched on this run
  // (e.g., preserve `instagram_discovery` clubs when running in CI without an IG search session,
  // or preserve `baskin_engineering` / `sport_clubs` if their upstream server timed out).
  let preservedPriorCount = 0
  for (const prev of existing) {
    const h = String(prev.instagram || '').toLowerCase().trim()
    const cid = String(prev.id || h).toLowerCase().trim()
    if ((h && byHandle.has(h)) || (cid && byId.has(cid))) continue

    const nk = canonicalClubNameKey(prev.name)
    if (nk && byCanonicalName.has(nk)) continue

    // Never preserve conduct-blocked orgs
    if (CONDUCT_BLOCKED_PATTERNS.some(pat => pat.test(`${h} ${prev.name || ''}`))) continue

    const prevSources = Array.isArray(prev.sources) && prev.sources.length > 0 ? prev.sources : ['someca']
    const shouldKeep =
      Boolean(prev.manual) ||
      prevSources.includes('mention_discovery') ||
      prevSources.some(src => !activeSourcesFetched.has(src))

    if (shouldKeep && !isSingleFixtureMode) {
      out.push(prev)
      if (h) byHandle.set(h, prev)
      if (cid) byId.set(cid, prev)
      if (nk) byCanonicalName.set(nk, prev)
      preservedPriorCount++
    } else if (prev.manual && isSingleFixtureMode) {
      out.push(prev)
      if (h) byHandle.set(h, prev)
      preservedPriorCount++
    }
  }

  out.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  keptWithoutIg = out.filter(c => !c.instagram).length

  const wasPreviouslyKnown = c => {
    const h = String(c.instagram || '').toLowerCase()
    const cid = String(c.id || h).toLowerCase()
    return (h && prevByHandle.has(h)) || (cid && prevById.has(cid))
  }
  const added = out.filter(c => !wasPreviouslyKnown(c)).length
  const outKeys = new Set(
    out.map(c => String(c.instagram || c.id || '').toLowerCase()).filter(Boolean)
  )
  const removed = existing.filter(
    c => !outKeys.has(String(c.instagram || c.id || '').toLowerCase())
  ).length

  fs.writeFileSync(clubsFilePath, JSON.stringify(out, null, 2) + '\n')
  console.log(
    `Saved ${out.length} clubs to ${path.basename(clubsFilePath)} (${added} new, ${removed} removed, ${keptWithoutIg} without Instagram, ${preservedPriorCount} preserved)`
  )
  return {
    total: out.length,
    added,
    removed,
    manual: existing.filter(c => c.manual).length,
    preserved: preservedPriorCount,
    skippedSuspended,
    skippedNoIg: 0,
    keptWithoutIg,
    sourcesFetched: [...activeSourcesFetched],
    clubs: out,
  }
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
