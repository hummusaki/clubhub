// Daily Club Roster & Membership Collector for ClubHub
// Aggregates per-club leadership, officers, spotlighted members, community member counts,
// and official UCSC SOMeCA contacts from 4 sources:
//   1. Official Club Websites & Linktree Team/Board/Officers pages
//   2. Instagram "Meet the Board" / Officer & Member Spotlight posts and bios
//   3. Discord public Invite metadata (member/online counts) & Bot guild channels/roles
//   4. Official UCSC Student Organization Directory (getinvolved.ucsc.edu) contacts & standing

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchDiscordInviteMetadata } from './enrichWeb.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROSTER_CACHE_FILE = path.join(ROOT, 'output', 'roster-cache.json')
const VERIFIED_ROSTERS_FILE = path.join(ROOT, 'verified-rosters.json')

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const ROLE_COLORS = ['blue', 'purple', 'teal', 'green', 'red', 'yellow']

const SKIP_WEBSITE_HOST_RE =
  /(?:^|\.)(?:instagram\.com|facebook\.com|tiktok\.com|youtube\.com|youtu\.be|spotify\.com|twitter\.com|x\.com|threads\.net|discord\.gg|discord\.com|forms\.gle|qualtrics\.com|cognitoforms\.com|typeform\.com|lu\.ma|eventbrite\.com|gofundme\.com|gofund\.me|give\.ucsc\.edu|givecampus\.com|venmo\.com|paypal\.com|redbubble\.com|bonfire\.com|flickr\.com|zoom\.us|calendar\.google\.com|accounts\.google\.com|play\.google\.com|apps\.apple\.com|linkedin\.com|github\.com|canva\.com|linktr\.ee|beacons\.ai|bento\.me|tr\.ee|tinyurl\.com|bit\.ly|lnk\.joinpopp\.in|list-manage\.com|eo\.page|rosterfy\.com|ucsc\.edu)$/i

function unwrapRosterUrl(rawUrl = '') {
  if (!rawUrl || typeof rawUrl !== 'string') return ''
  let s = rawUrl.trim()
  if (!s || s === '#') return ''
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`
  try {
    let u = new URL(s)
    if (/^(?:l|lm)\.instagram\.com$/i.test(u.hostname)) {
      let target = u.searchParams.get('u') || ''
      for (let i = 0; i < 2; i++) {
        if (/^https?%3A/i.test(target)) target = decodeURIComponent(target)
      }
      if (target) u = new URL(target)
    }
    if (u.hostname === 'accounts.google.com' && u.searchParams.get('continue')) {
      u = new URL(u.searchParams.get('continue'))
    }
    return u.toString()
  } catch {
    return rawUrl
  }
}

// Allow student-org subdomains under *.ucsc.edu, Google Sites, and Carrd sites while skipping social/payment hosts
function isCrawlableClubWebsite(rawUrl = '') {
  try {
    const unwrapped = unwrapRosterUrl(rawUrl)
    if (!unwrapped) return false
    const u = new URL(unwrapped)
    if (!/^https?:$/i.test(u.protocol)) return false
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    if (host === 'ucsc.edu' || host === 'getinvolved.ucsc.edu' || host === 'give.ucsc.edu' || host.endsWith('.zoom.us')) {
      return false
    }
    if (host.endsWith('.ucsc.edu')) return true
    if (host === 'sites.google.com' || host.endsWith('.carrd.co')) return true
    if (host.startsWith('docs.google.com') || host.startsWith('drive.google.com')) return false
    return !SKIP_WEBSITE_HOST_RE.test(host)
  } catch {
    return false
  }
}

const EXTERNAL_SPEAKER_RE =
  /\b(?:guest speaker|featured speakers?|keynote|speaker event|fireside chat|panelists? from|industry leaders at|thrilled to welcome|excited to welcome .* from|private client advisor|wealth management|recruiter at)\b/i

const BOARD_CONTEXT_RE =
  /\b(?:executive board|e-?board|a-?board|meet (?:the|our) (?:board|exec|team|officers?|council|cabinet|leadership|staff|directiva)|(?:board|officer|exec|member|sister|brother) (?:member )?spotlight|introducing our [\w\s–-]{0,25}?(?:board|president|vice president|treasurer|secretary|chair|director|coordinator|lead|captain|officers?|exec)|leadership team|new board|our president is)\b/i

const ROLE_NOUN_PATTERN =
  '(?:Co-?Presidents?|Presidents?|(?:Senior |Executive |Financial |External |Internal |Administrative )?Vice Presidents?(?: of [A-Za-z][A-Za-z &/-]{1,36})?|VPs?(?: (?:of )?[A-Za-z][A-Za-z &/-]{1,30})?|(?:External|Internal|Financial|Executive|Administrative|Membership|Programming|Marketing|Outreach|Events?|Social(?: Media)?|Publicity|PR|Communications?|Tech(?:nical)?|Design|Web|Media|Cultural|Community|Academic|Philanthropy|Recruitment|Fundraising|Finance|Operations|Creative|Music|Art|Dance|Editorial|Layout|Promotion|Blog|Sports?|Tournament|Safety|Advocacy|Retention|Education|Workshop|Project|Graphics?|Merch(?:andise)?|Rush|Bid Day|New Member|Sisterhood|Brotherhood|Chapter Operations)\\s+(?:Vice Presidents?|VPs?|Presidents?|Directors?|Co-?Directors?|Coordinators?|Co-?Coordinators?|Chairs?|Co-?Chairs?|Leads?|Co-?Leads?|Managers?|Officers?|Executives?|Editors?|Representatives?|Advisors?|Captains?)|Assistant (?:Music |Art |Stage |Technical |Event )?Directors?|Music Directors?|Creative Directors?|Art Directors?|Treasurers?|Secretar(?:y|ies)(?:\\s*\\/\\s*[A-Za-z ]+Chair)?|Historians?|Webmasters?|Chancellors?|Captains?|Team Captains?|Editors?-in-Chief|Managing Editors?|Studio Curators?|Parliamentarians?|Sergeant[- ]at[- ]Arms|ICC Representatives?|Faculty Advisors?|Club Advisors?|Board Members?|Executive Officers?)'

const ROLE_EXACT_RE = new RegExp(`^(?:the\\s+|our\\s+)?(${ROLE_NOUN_PATTERN})$`, 'i')

const NON_NAME_WORDS = new Set([
  'a', 'an', 'the', 'our', 'your', 'their', 'this', 'that', 'these', 'those', 'my', 'his', 'her',
  'we', 'us', 'you', 'they', 'who', 'what', 'when', 'where', 'why', 'how', 'all', 'any', 'both',
  'each', 'every', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'can', 'just', 'should', 'now', 'here', 'there', 'also', 'more', 'most',
  'and', 'but', 'or', 'for', 'with', 'from', 'into', 'about', 'join', 'meet', 'welcome', 'welcoming',
  'introducing', 'introduce', 'get', 'know', 'happy', 'hello', 'hey', 'hi', 'dear', 'thank', 'thanks',
  'excited', 'thrilled', 'expand', 'looking', 'proud', 'honored', 'serving', 'incoming', 'transfer',
  'majoring', 'studying', 'based', 'currently', 'passionate', 'dedicated', 'grateful', 'love', 'enjoy',
  'congrats', 'congratulations', 'apply', 'applications', 'open', 'closed', 'deadline', 'sign', 'rsvp',
  'swipe', 'link', 'bio', 'check', 'out', 'read', 'stay', 'tuned', 'come', 'see', 'new', 'next', 'last',
  'first', 'second', 'third', 'fourth', 'fall', 'spring', 'quarter', 'semester',
  'year', 'annual', 'weekly', 'monthly', 'daily', 'monday', 'tuesday', 'wednesday', 'thursday',
  'friday', 'saturday', 'sunday', 'january', 'february', 'march', 'july',
  'september', 'october', 'november', 'december', 'today', 'tomorrow', 'tonight',
  // Org / Campus / Role words that must never be parsed as human names (avoid blocking real names like Will, May, April, June, August, Christian, Page, Hall, Black)
  'ucsc', 'santa', 'cruz', 'university', 'california', 'banana', 'slug', 'slugs', 'campus', 'college',
  'baskin', 'engineering', 'kresge', 'cowell', 'stevenson', 'crown', 'oakes',
  'quarry', 'mchenry', 'library', 'classroom', 'unit', 'science', 'sciences', 'humanities', 'theater',
  'center', 'plaza', 'room', 'studio', 'gym', 'opers', 'zoom', 'online', 'discord',
  'instagram', 'google', 'linktree', 'email', 'contact', 'website', 'form', 'slides',
  'club', 'society', 'association', 'organization', 'union', 'council', 'alliance', 'coalition',
  'collective', 'committee', 'chapter', 'fraternity', 'sorority', 'brotherhood', 'sisterhood',
  'academy', 'institute', 'foundation', 'program', 'project', 'group', 'team', 'crew', 'squad', 'board',
  'eboard', 'executive', 'officer', 'officers', 'president', 'vice', 'treasurer', 'secretary',
  'director', 'coordinator', 'chair', 'lead', 'leader', 'leaders', 'leadership', 'captain', 'advisor',
  'member', 'members', 'membership', 'spotlight', 'series', 'edition', 'reveal', 'night', 'day',
  'event', 'events', 'meeting', 'meetings', 'gbm', 'general', 'body', 'workshop', 'social', 'mixer',
  'retreat', 'showcase', 'tournament', 'competition', 'hackathon', 'fundraiser', 'recruitment', 'rush',
  'speaker', 'panel', 'guest', 'alumni', 'student', 'students', 'undergraduate', 'graduate', 'faculty',
  'department', 'major', 'majors', 'minor', 'class', 'senior', 'junior', 'sophomore', 'freshman',
  'biology', 'physics', 'chemistry', 'mathematics', 'computer', 'economics', 'business', 'politics',
  'psychology', 'neuroscience', 'sociology', 'education', 'literature', 'history', 'philosophy',
  'panhellenic', 'interfraternity', 'national', 'american', 'asian', 'pacific', 'latine',
  'jewish', 'muslim', 'indian', 'filipino', 'chinese', 'japanese', 'korean', 'vietnamese',
  'women', 'womens', 'mens', 'medical', 'dental', 'health', 'legal', 'finance', 'financial', 'external',
  'internal', 'affairs', 'public', 'relations', 'outreach', 'marketing', 'communications', 'media',
])

const NON_NAME_PHRASE_RE =
  /\b(?:porter|merrill|cowell|kresge|crown|oakes|stevenson|rachel carson|john r lewis)\s+(?:college|hall|dining|plaza|field)\b|\b(?:east|west)\s+field\b|\b(?:thimann|sinsheimer|physical sciences|earth & marine|social sciences)\s+hall\b|\bblack\s+(?:student|union|coalition|alliance|lives|men|women)\b/i

export function normalizePlainText(raw = '') {
  if (!raw) return ''
  // Normalize mathematical bold/script/fraktur Unicode glyphs (e.g. 𝕾𝖎𝖘𝖙𝖊𝖗 𝕾𝖕𝖔𝖙𝖑𝖎𝖌𝖍𝖙) to plain ASCII
  return String(raw)
    .replace(/[\u2028\u2029]/g, '\n')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, ' ')
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’`]/g, "'")
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
}

function decodeHtmlEntities(raw = '') {
  return String(raw)
    .replace(/&amp;/gi, '&')
    .replace(/&#0?39;|&rsquo;|&lsquo;|&#8217;|&#8216;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;|&#8220;|&#8221;/gi, '"')
    .replace(/&ndash;|&mdash;|&#8211;|&#8212;/gi, ' - ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

function toTitleCaseWord(word = '') {
  if (!word) return ''
  if (/^[A-Z]{2,4}$/.test(word)) return word
  return word
    .split(/([-/''])/)
    .map(part =>
      part === '-' || part === '/' || part === "'"
        ? part
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join('')
}

export function cleanPersonName(raw = '', { allowLowercase = false } = {}) {
  if (!raw) return null
  let text = normalizePlainText(raw)
    .replace(/\([^)]*\)/g, ' ') // strip (he/him), (she/they), ('27)
    .replace(/@[A-Za-z0-9._]+/g, ' ')
    .replace(/\b(?:he|she|they|him|her|them)\s*\/\s*(?:he|she|they|him|her|them)\b/gi, ' ')
    .replace(/^[\s,.:;|•·\-–—!~*]+|[\s,.:;|•·\-–—!~*?]+$/g, '')
    .trim()

  // Extract optional nickname in quotes: Davion "Paro" Flood
  let nickname = null
  const nickMatch = text.match(/^([A-Za-z][A-Za-z'-]+)\s+"([^"]{1,22})"\s+([A-Za-z][A-Za-z'-]+(?:\s+[A-Za-z][A-Za-z'-]+)?)$/)
  if (nickMatch) {
    nickname = nickMatch[2].trim()
    text = `${nickMatch[1]} ${nickMatch[3]}`
  } else {
    text = text.replace(/"[^"]*"/g, ' ').replace(/\s+/g, ' ').trim()
  }

  // Stop at sentence/clause boundaries if trailing text leaked in
  text = text
    .split(/\s+(?:is|was|has|will|who|from|and|as|for|in|at|on|with|majoring|studying|joined)\b|[!?;|•·]/i)[0]
    .replace(/^[\s,.:;\-–—]+|[\s,.:;\-–—]+$/g, '')
    .trim()

  if (NON_NAME_PHRASE_RE.test(text)) return null

  const tokens = text.split(/\s+/).filter(Boolean)
  if (tokens.length < 2 || tokens.length > 4) return null

  const formattedTokens = []
  for (const tok of tokens) {
    const cleanTok = tok.replace(/\.$/, '')
    if (cleanTok.length < 1 || cleanTok.length > 22) return null
    if (!/^[A-Za-z][A-Za-z'-]*$/.test(cleanTok)) return null
    if (!allowLowercase && !/^[A-Z]/.test(cleanTok) && !/^(?:de|del|la|van|von|al|el|bin|st)$/i.test(cleanTok)) {
      return null
    }
    if (NON_NAME_WORDS.has(cleanTok.toLowerCase())) return null
    formattedTokens.push(toTitleCaseWord(cleanTok))
  }

  // Require at least first and last token to be >= 2 chars
  if (formattedTokens[0].length < 2 || formattedTokens[formattedTokens.length - 1].length < 2) {
    return null
  }

  if (nickname && /^[A-Za-z0-9_. -]{1,20}$/.test(nickname)) {
    return `${formattedTokens[0]} "${nickname}" ${formattedTokens.slice(1).join(' ')}`
  }
  return formattedTokens.join(' ')
}

export function cleanRoleTitle(raw = '') {
  if (!raw) return null
  const norm = normalizePlainText(raw)
    .replace(/^(?:the|our|new|lovely|wonderful|amazing|current|incoming|20\d\d\s*[-–/]\s*(?:20)?\d\d|fall|winter|spring)\s+/gi, '')
    .replace(/\s+for\s+(?:the\s+)?(?:20\d\d|this|next)[\w\s–-]*$/i, '')
    .replace(/^[\s,.:;|•·\-–—]+|[\s,.:;|•·\-–—!]+$/g, '')
    .trim()

  if (!norm || norm.length < 2 || norm.length > 56) return null
  const m = norm.match(ROLE_EXACT_RE)
  const base = m ? m[1] : norm

  // Reject strings that contain obvious sentence verbs or digits
  if (/\b(?:is|are|was|were|have|has|join|apply|welcome|http|www|\d{3,})\b/i.test(base)) {
    return null
  }

  const smallWords = new Set(['of', 'and', 'for', 'in', 'to', 'the', '&', 'at'])
  return base
    .split(/\s+/)
    .map((w, idx) => {
      if (/^(?:VP|PR|EVP|IVP|SVP|CFO|ICC|CEO|CTO|DEI)$/i.test(w)) return w.toUpperCase()
      if (idx > 0 && smallWords.has(w.toLowerCase())) return w.toLowerCase()
      return toTitleCaseWord(w)
    })
    .join(' ')
}

export function classifyPersonType(role = '') {
  const r = String(role || '').toLowerCase()
  if (
    /\b(?:president|vp|treasurer|secretary|chair|director|coordinator|lead|captain|officer|executive|editor|curator|historian|webmaster|parliamentarian|chancellor|sergeant|advisor|representative|manager|board|contact|inbox)\b/.test(
      r
    )
  ) {
    return 'officer'
  }
  return 'member'
}

export function makeInitials(name = '') {
  const words = String(name || '')
    .replace(/"[^"]*"/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return 'CL'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
}

function normalizeClassYear(raw = '') {
  if (!raw) return null
  const s = normalizePlainText(raw).toLowerCase()
  if (/\b(?:1st[- ]?year|first[- ]?year|freshman|frosh)\b/.test(s)) return '1st Year'
  if (/\b(?:2nd[- ]?year|second[- ]?year|sophomore)\b/.test(s)) return '2nd Year'
  if (/\b(?:3rd[- ]?year|third[- ]?year|junior)\b/.test(s)) return '3rd Year'
  if (/\b(?:4th[- ]?year|fourth[- ]?year|senior)\b/.test(s)) return '4th Year'
  if (/\b(?:5th[- ]?year|fifth[- ]?year)\b/.test(s)) return '5th Year'
  if (/\b(?:grad(?:uate)?|ph\.?d|master'?s)\b/.test(s)) return 'Graduate'
  const yr = s.match(/\b(?:class of\s*)?20(2[5-9]|30)\b/) || s.match(/'(2[5-9]|30)\b/)
  if (yr) return `'${yr[1]}`
  return null
}

function extractMajorAndYearFromText(rawText = '') {
  const text = normalizePlainText(rawText)
  let year = normalizeClassYear(text)
  let major = null

  const kvMajor = text.match(/(?:^|\n)\s*major(?:\s*\/\s*minor)?s?\s*[:\-]\s*([^\n.|!]{3,55})/i)
  if (kvMajor) {
    major = kvMajor[1].trim()
  }
  const kvYear = text.match(/(?:^|\n)\s*(?:year|class|grade)\s*[:\-]\s*([^\n.|!]{2,30})/i)
  if (kvYear && !year) {
    year = normalizeClassYear(kvYear[1]) || kvYear[1].trim().slice(0, 24)
  }

  if (!major) {
    const proseMajor =
      text.match(
        /\bmajoring in\s+([A-Za-z][A-Za-z &,/-]{2,46}?)(?=\s*(?:[.,!;\n]|and\s+(?:i\b|my\b|our\b|secretary|president|vice|vp|treasurer|chair|officer|director|coordinator|lead|captain|member|board|minor)|with\s+a|from\b|$))/i
      ) ||
      text.match(
        /\b(?:first|second|third|fourth|1st|2nd|3rd|4th|freshman|sophomore|junior|senior)[- ]?(?:year\s+)?([A-Za-z][A-Za-z &/-]{2,40}?)\s+major\b/i
      )
    if (proseMajor) {
      major = proseMajor[1]
        .trim()
        .split(/\s+/)
        .map((w, idx) => (idx > 0 && /^(?:and|&|in|of)$/.test(w.toLowerCase()) ? w.toLowerCase() : toTitleCaseWord(w)))
        .join(' ')
    }
  }

  if (major && year && !major.includes(year)) {
    return { major: `${major} · ${year}`, year }
  }
  return { major: major || year || null, year }
}

function makeRosterId(clubId, name) {
  const slug = String(name || '')
    .replace(/"[^"]*"/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `roster_${String(clubId).toLowerCase()}_${slug || 'contact'}`
}

function matchOfficerToClubEmail(personName, candidateEmails = []) {
  const clean = String(personName || '')
    .replace(/"[^"]*"/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .trim()
  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length < 2) return null
  const first = parts[0]
  const last = parts[parts.length - 1]

  for (const rawEmail of candidateEmails) {
    if (!rawEmail) continue
    const email = rawEmail.toLowerCase().trim()
    const local = email.split('@')[0].replace(/[^a-z]/g, '')
    if (!local) continue
    // Match UCSC CruzID patterns like dbenisra@ucsc.edu (Danielle Ben-Israel) or jchen@ucsc.edu
    if (
      (last.length >= 4 && local.includes(last.slice(0, 5)) && local.startsWith(first[0])) ||
      (first.length >= 3 && last.length >= 3 && local.includes(first) && local.includes(last.slice(0, 3)))
    ) {
      return email
    }
  }
  return null
}

/**
 * Extract officer & spotlighted member records from an Instagram post caption.
 */
export function extractRosterFromPost(post, club) {
  const rawCaption = post?.caption || ''
  if (!rawCaption || rawCaption.length < 15) return []

  const text = normalizePlainText(rawCaption)
  const hasBoardSignal = BOARD_CONTEXT_RE.test(text)

  // Guard against external guest speakers (unless explicitly an executive board / officer spotlight post)
  if (EXTERNAL_SPEAKER_RE.test(text) && !hasBoardSignal) {
    return []
  }

  const found = []
  const pushCandidate = ({ name, role, major = null, year = null, email = null, office = null, allowLower = false }) => {
    const cleanName = cleanPersonName(name, { allowLowercase: allowLower })
    if (!cleanName) return
    const cleanRole = cleanRoleTitle(role) || (/spotlight/i.test(text) ? 'Active Member' : null)
    if (!cleanRole) return
    found.push({
      name: cleanName,
      role: cleanRole,
      personType: classifyPersonType(cleanRole),
      major,
      year,
      email,
      office,
      source: 'instagram',
      sourceUrl: post.permalink || (club?.instagram ? `https://www.instagram.com/${club.instagram}/` : null),
    })
  }

  // 1. Structured Key-Value Spotlight Card ("Name: Zoe Villaroman" ... "Position: Secretary")
  const kvNameMatch = text.match(/(?:^|\n)\s*(?:full\s+)?name\s*[:\-]\s*([^\n]{3,50})/i)
  if (kvNameMatch) {
    const kvRoleMatch = text.match(/(?:^|\n)\s*(?:position|role|title|office|chair)\s*[:\-]\s*([^\n]{2,55})/i)
    const kvOfficeMatch = text.match(/(?:^|\n)\s*office\s*hours?\s*[:\-]\s*([^\n]{3,60})/i)
    const { major, year } = extractMajorAndYearFromText(text)
    const fallbackRole = /\b(?:officer|exec|board)\s+spotlight\b/i.test(text)
      ? 'Board Member'
      : /\b(?:sister|brother|member)\s+(?:spotlight|of the month)\b/i.test(text)
        ? 'Active Member'
        : null
    if (kvRoleMatch || fallbackRole) {
      pushCandidate({
        name: kvNameMatch[1],
        role: kvRoleMatch ? kvRoleMatch[1] : fallbackRole,
        major,
        year,
        office: kvOfficeMatch ? kvOfficeMatch[1].trim() : null,
      })
    }
  }

  // 2. Structured Line-by-Line Board Roster ("President: Davion 'Paro' Flood" or "✧ VP Sisterhood: Kalyann Yeng")
  const roleLineRe = new RegExp(`^\\s*[^A-Za-z0-9\\n]{0,6}\\s*(?:our\\s+)?(${ROLE_NOUN_PATTERN})\\s*[:–—-]\\s*([^\\n]{3,60})$`, 'gim')
  for (const m of text.matchAll(roleLineRe)) {
    const rawRole = m[1]
    const rawName = m[2].trim()
    // Ensure right side isn't "Open!" / "Apply in bio" / single handle
    if (/\b(?:open|apply|tbd|tba|link|form|dm)\b/i.test(rawName)) continue
    pushCandidate({ name: rawName, role: rawRole })
  }

  // 2b. Line-by-Line "Name (Role)" or "Name (pronouns) - Role" (e.g. "Lucia Lim (VP Chapter Operations)", "Kristy Morales (she/her) - Vice President of Finance")
  const nameParenRoleRe = new RegExp(
    `^\\s*[^A-Za-z0-9\\n]{0,4}\\s*([A-Z][A-Za-z'-]+(?:\\s+[A-Z][A-Za-z'-]+){1,2})\\s*\\(\\s*(${ROLE_NOUN_PATTERN})\\s*\\)\\s*$`,
    'gm'
  )
  for (const m of text.matchAll(nameParenRoleRe)) {
    pushCandidate({ name: m[1], role: m[2] })
  }

  const nameDashRoleRe = new RegExp(
    `^\\s*[^A-Za-z0-9\\n]{0,4}\\s*([A-Z][A-Za-z'-]+(?:\\s+[A-Z][A-Za-z'-]+){1,2})(?:\\s*\\([^)]{2,18}\\))?\\s*[–—|-]\\s*(${ROLE_NOUN_PATTERN})\\s*$`,
    'gm'
  )
  for (const m of text.matchAll(nameDashRoleRe)) {
    const { major, year } = extractMajorAndYearFromText(text)
    pushCandidate({ name: m[1], role: m[2], major, year })
  }

  // 3. Prose Board / Officer Introductions:
  //    3a. "Our President is Danielle Ben-Israel!"
  const ourRoleIsRe = new RegExp(
    `\\b[Oo]ur\\s+(?:new\\s+|20\\d\\d[-–/](?:20)?\\d\\d\\s+)?(${ROLE_NOUN_PATTERN})\\s+is\\s+([A-Z][A-Za-z'-]+(?:\\s+"[^"]{1,20}")?(?:\\s+[A-Z][A-Za-z'-]+){1,3})`,
    'g'
  )
  for (const m of text.matchAll(ourRoleIsRe)) {
    const { major, year } = extractMajorAndYearFromText(text)
    pushCandidate({ name: m[2], role: m[1], major: found.length === 0 ? major : null, year })
  }

  //    3b. "Get to know our President, Alexandra Weber!" / "words from our wonderful Secretary Layla Cortes!"
  const introRoleNameRe = new RegExp(
    `(?:get to know|meet|introducing|welcoming|welcome|words from)\\s+(?:our\\s+)?(?:lovely\\s+|wonderful\\s+|amazing\\s+|new\\s+|20\\d\\d[-–/](?:20)?\\d\\d\\s+)?(?:[A-Z]{2,6}\\s+)?(${ROLE_NOUN_PATTERN})(?:\\s+for\\s+(?:the\\s+)?[\\d–/-]+(?:\\s+school\\s+year)?)?(?:\\s*,\\s*|\\s+)(?=[A-Z])([A-Z][A-Za-z'-]+(?:\\s+[A-Z][A-Za-z'-]+){1,2})`,
    'g'
  )
  for (const m of text.matchAll(introRoleNameRe)) {
    const { major, year } = extractMajorAndYearFromText(text)
    pushCandidate({ name: m[2], role: m[1], major, year })
  }
  // Case-insensitive header variant when "Introducing" / "INTRODUCING" or "get to know" has mixed case
  const introRoleCommaNameInsensitiveRe = new RegExp(
    `(?:get to know|meet|introducing|welcoming|welcome)\\s+(?:our\\s+)?(?:lovely\\s+|wonderful\\s+|amazing\\s+|new\\s+|20\\d\\d[-–/](?:20)?\\d\\d\\s+)?(?:[A-Z]{2,6}\\s+)?(${ROLE_NOUN_PATTERN})(?:\\s+for\\s+(?:the\\s+)?[\\d–/-]+(?:\\s+school\\s+year)?)?\\s*,\\s*([A-Z][A-Za-z'-]+(?:\\s+[A-Z][A-Za-z'-]+){1,2})`,
    'gi'
  )
  for (const m of text.matchAll(introRoleCommaNameInsensitiveRe)) {
    const { major, year } = extractMajorAndYearFromText(text)
    pushCandidate({ name: m[2], role: m[1], major, year })
  }

  //    3c. Spotlight Header Role + First-Person Quote ("Meet our Vice President of Membership ... 'my name is saniya vaidya'" / "Introducing our 2025-26 IGC Executive Vice President!! ... My name is Mads Bobele")
  if (found.length === 0 && (hasBoardSignal || /\bmy name(?:'s| is)\b/i.test(text))) {
    const headerRoleMatch = text.match(
      new RegExp(
        `(?:meet|introducing|spotlight[^\\n]{0,25}|hear from|excited to be)\\s+(?:our\\s+)?(?:new\\s+|lovely\\s+|wonderful\\s+|20\\d\\d[-–/](?:20)?\\d\\d\\s+)?(?:[A-Za-z']{2,14}\\s+)?(${ROLE_NOUN_PATTERN})`,
        'i'
      )
    )
    const explicitMyNameMatch = text.match(/\bmy name(?:'s| is)\s+([A-Za-z][A-Za-z'-]+(?:\s+[A-Za-z][A-Za-z'-]+){1,2})\b/i)
    const capitalizedImMatch = !explicitMyNameMatch
      ? text.match(/\b(?:i'm|i am)\s+([A-Z][a-z'-]+(?:\s+[A-Z][a-z'-]+){1,2})\b/)
      : null
    const selfNameMatch = explicitMyNameMatch || capitalizedImMatch
    if (headerRoleMatch && selfNameMatch) {
      const { major, year } = extractMajorAndYearFromText(text)
      pushCandidate({
        name: selfNameMatch[1],
        role: headerRoleMatch[1],
        major,
        year,
        allowLower: Boolean(explicitMyNameMatch),
      })
    }
  }

  return found
}

/**
 * Extract explicit officer mentions from an Instagram biography if listed (e.g. "Pres: Jane Doe").
 */
export function extractRosterFromBio(bio = '', club = {}) {
  if (!bio) return []
  const text = normalizePlainText(bio)
  const out = []
  const bioRoleRe = new RegExp(
    `(?:^|\\n|[|•·])\\s*(Pres(?:ident)?|Co-?Pres(?:ident)?|VP|Vice President|Treasurer|Secretary|Captain|Founder)\\s*[:\\-]\\s*([A-Z][A-Za-z'-]+(?:\\s+[A-Z][A-Za-z'-]+){1,2})`,
    'gm'
  )
  for (const m of text.matchAll(bioRoleRe)) {
    const roleRaw = /^pres$/i.test(m[1]) ? 'President' : /^co-?pres$/i.test(m[1]) ? 'Co-President' : m[1]
    const cleanName = cleanPersonName(m[2])
    const cleanRole = cleanRoleTitle(roleRaw)
    if (cleanName && cleanRole) {
      out.push({
        name: cleanName,
        role: cleanRole,
        personType: 'officer',
        major: null,
        year: null,
        email: null,
        office: null,
        source: 'instagram',
        sourceUrl: club.instagram ? `https://www.instagram.com/${club.instagram}/` : null,
      })
    }
  }
  return out
}

/**
 * Parse officer / team cards and listings from a club webpage's HTML.
 */
export function extractRosterFromWebHtml(html = '', pageUrl = '') {
  if (!html || html.length < 50) return []
  const withoutScripts = html
    .replace(/<(?:script|style|svg|noscript|nav|footer)\b[^>]*>[\s\S]*?<\/(?:script|style|svg|noscript|nav|footer)>/gi, ' ')

  const found = []
  const seenKey = new Set()

  const recordPerson = ({ name, role, email = null, major = null }) => {
    const cleanName = cleanPersonName(name)
    if (!cleanName) return
    const cleanRole = cleanRoleTitle(role)
    if (!cleanRole) return
    const key = cleanName.toLowerCase()
    if (seenKey.has(key)) return
    seenKey.add(key)
    found.push({
      name: cleanName,
      role: cleanRole,
      personType: classifyPersonType(cleanRole),
      major,
      year: null,
      email: email ? email.toLowerCase().trim() : null,
      office: null,
      source: 'website',
      sourceUrl: pageUrl,
    })
  }

  // 1. Scan heading + adjacent role element pairs: <h3>Name</h3> <p/h4/span/div>Role</...> (and vice versa)
  const pairRe =
    /<(h[2-5]|strong|b|div|span)\b[^>]*>([^<]{3,55})<\/\1>\s*(?:<[^>]+>\s*){0,3}<(p|span|div|h[3-6]|em|small)\b[^>]*>([^<]{3,65})<\/\3>/gi
  for (const m of withoutScripts.matchAll(pairRe)) {
    const first = decodeHtmlEntities(m[2]).replace(/\s+/g, ' ').trim()
    const second = decodeHtmlEntities(m[4]).replace(/\s+/g, ' ').trim()

    // Look ahead ~350 chars for a mailto: link inside the same member card
    const cardWindow = withoutScripts.slice(m.index, m.index + m[0].length + 350)
    const mailMatch = cardWindow.match(/mailto:([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i)
    const cardEmail = mailMatch ? mailMatch[1] : null

    if (ROLE_EXACT_RE.test(normalizePlainText(second))) {
      recordPerson({ name: first, role: second, email: cardEmail })
    } else if (ROLE_EXACT_RE.test(normalizePlainText(first))) {
      recordPerson({ name: second, role: first, email: cardEmail })
    }
  }

  // 2. Scan plain-text lines for "Role: Name" or "Name - Role" on team/board pages
  const textLines = decodeHtmlEntities(
    withoutScripts
      .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .split(/\r?\n/)
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(l => l.length >= 6 && l.length <= 110)

  const roleFirstRe = new RegExp(`^(${ROLE_NOUN_PATTERN})\\s*[:–—|-]\\s*(.+)$`, 'i')
  const nameFirstRe = new RegExp(`^([A-Z][A-Za-z'-]+(?:\\s+[A-Z][A-Za-z'-]+){1,2})\\s*[–—|-]\\s*(${ROLE_NOUN_PATTERN})$`, 'i')

  for (const line of textLines) {
    const normLine = normalizePlainText(line)
    const m1 = normLine.match(roleFirstRe)
    if (m1) {
      recordPerson({ name: m1[2], role: m1[1] })
      continue
    }
    const m2 = normLine.match(nameFirstRe)
    if (m2) {
      recordPerson({ name: m2[1], role: m2[2] })
    }
  }

  return found.slice(0, 25)
}

async function fetchHtmlPage(url, timeoutMs = 7000) {
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('text/html') && !ct.includes('text/plain')) return null
    return await res.text()
  } catch {
    return null
  }
}

function discoverTeamSubpages(html = '', baseUrl = '') {
  const candidates = []
  const seen = new Set()
  let baseOrigin = ''
  try {
    baseOrigin = new URL(baseUrl).origin
  } catch {
    return []
  }

  const anchorRe = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi
  for (const m of html.matchAll(anchorRe)) {
    const rawHref = m[1].trim()
    const anchorText = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
    if (!rawHref || /^(?:mailto:|tel:|javascript:)/i.test(rawHref)) continue

    let resolved
    try {
      resolved = new URL(rawHref, baseUrl)
    } catch {
      continue
    }
    if (resolved.origin !== baseOrigin) continue
    const full = resolved.toString()
    if (full === baseUrl || seen.has(full.toLowerCase())) continue

    const signal = `${resolved.pathname} ${anchorText}`
    if (/\b(?:team|officers?|board|e-?board|leadership|people|staff|masthead|editorial|roster|cabinet|exec|about|members|actives?|sisters?|brothers?|contributors?|writers?|artists?|players?|directory)\b/i.test(signal)) {
      if (/\b(?:apply|application|join-form|donate|merch|shop)\b/i.test(resolved.pathname)) continue
      seen.add(full.toLowerCase())
      candidates.push(full)
    }
  }

  return candidates.slice(0, 4)
}

function extractLinktreeTargets(html = '') {
  const out = []
  const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)
  if (nextMatch) {
    try {
      const data = JSON.parse(nextMatch[1])
      const acct = data?.props?.pageProps?.account || data?.props?.pageProps || {}
      for (const l of acct.links || data?.props?.pageProps?.links || []) {
        if (l?.url) out.push({ label: l.title || '', url: l.url })
      }
      return out
    } catch {
      // fall through
    }
  }
  for (const m of html.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (!/linktr\.ee/i.test(m[1])) {
      out.push({ label: m[2].replace(/<[^>]+>/g, ' ').trim(), url: m[1] })
    }
  }
  return out
}

async function crawlClubWebsiteRoster(club, clubLinks = []) {
  const candidateSites = new Set()
  const allCandidateLinks = [
    ...(club.website ? [{ label: 'Club Website', url: club.website }] : []),
    ...(clubLinks || []),
  ]

  // Unwrap Linktree / Beacons linkhubs to discover inner websites, Google Docs, and Slides
  for (const item of allCandidateLinks.slice(0, 6)) {
    const unwrapped = unwrapRosterUrl(item?.url)
    if (!unwrapped) continue
    if (/^(?:https?:\/\/)?(?:www\.)?linktr\.ee\//i.test(unwrapped)) {
      const lhHtml = await fetchHtmlPage(unwrapped)
      if (lhHtml) {
        allCandidateLinks.push(...extractLinktreeTargets(lhHtml))
      }
      break
    }
  }

  for (const l of allCandidateLinks) {
    const unwrapped = unwrapRosterUrl(l?.url)
    if (!unwrapped) continue
    const labelSignal = `${l.label || ''} ${unwrapped}`
    if (isCrawlableClubWebsite(unwrapped)) {
      if (
        /\b(?:website|official|home|board|officers?|team|leadership|exec|staff|masthead|roster|about|actives?|sisters?|brothers?)\b/i.test(labelSignal) ||
        candidateSites.size === 0
      ) {
        candidateSites.add(unwrapped)
      }
    } else if (/docs\.google\.com\/document\/d\/([A-Za-z0-9_-]+)/i.test(unwrapped)) {
      const docId = unwrapped.match(/docs\.google\.com\/document\/d\/([A-Za-z0-9_-]+)/i)[1]
      if (/\b(?:board|officers?|roster|directory|leadership|constitution|about|staff)\b/i.test(labelSignal)) {
        candidateSites.add(`https://docs.google.com/document/d/${docId}/export?format=txt`)
      }
    } else if (/docs\.google\.com\/presentation\/d\/([A-Za-z0-9_-]+)/i.test(unwrapped)) {
      const presId = unwrapped.match(/docs\.google\.com\/presentation\/d\/([A-Za-z0-9_-]+)/i)[1]
      if (/\b(?:board|officers?|roster|leadership|team|intro|welcome)\b/i.test(labelSignal)) {
        candidateSites.add(`https://docs.google.com/presentation/d/${presId}/export/txt`)
      }
    }
  }

  const results = []
  for (const siteUrl of [...candidateSites].slice(0, 3)) {
    const html = await fetchHtmlPage(siteUrl)
    if (!html) continue

    results.push(...extractRosterFromWebHtml(html, siteUrl))

    if (!siteUrl.includes('docs.google.com')) {
      const subpages = discoverTeamSubpages(html, siteUrl)
      for (const subUrl of subpages) {
        const subHtml = await fetchHtmlPage(subUrl)
        if (subHtml) {
          results.push(...extractRosterFromWebHtml(subHtml, subUrl))
        }
      }
    }
  }

  return results
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++
      results[idx] = await worker(items[idx], idx)
    }
  })
  await Promise.all(runners)
  return results
}

function mergeClubRosterEntries(club, rawEntries = [], { colorOffset = 0 } = {}) {
  const clubId = String(club.id || club.instagram || '').toLowerCase()
  const clubName = club.name || clubId
  const clubEmails = [club.email, ...(club.extraEmails || [])].filter(Boolean)

  // Sort full names ahead of single-word first names so single-word duplicates merge cleanly into full names
  const sortedRaw = [...rawEntries].sort((a, b) => {
    const aw = String(a?.name || '').trim().split(/\s+/).length
    const bw = String(b?.name || '').trim().split(/\s+/).length
    return bw - aw
  })

  const byName = new Map()
  for (const entry of sortedRaw) {
    if (!entry?.name || !entry?.role) continue
    let key = entry.name.replace(/["“][^"”]*["”]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
    if (!key.includes(' ')) {
      for (const existingKey of byName.keys()) {
        if (existingKey.startsWith(`${key} `)) {
          key = existingKey
          break
        }
      }
    }
    const prev = byName.get(key)
    if (!prev) {
      byName.set(key, { ...entry })
    } else {
      // Keep more specific officer title if duplicate appears across website + Instagram
      const prevIsOfficer = prev.personType === 'officer'
      const nextIsOfficer = entry.personType === 'officer'
      const betterRole =
        nextIsOfficer && !prevIsOfficer
          ? entry.role
          : nextIsOfficer === prevIsOfficer && entry.role.length > prev.role.length
            ? entry.role
            : prev.role
      byName.set(key, {
        ...prev,
        role: betterRole,
        personType: prevIsOfficer || nextIsOfficer ? 'officer' : 'member',
        major: prev.major || entry.major || null,
        year: prev.year || entry.year || null,
        email: prev.email || entry.email || null,
        office: prev.office || entry.office || null,
        source: prev.source === 'website' ? 'website' : entry.source || prev.source,
        sourceUrl: prev.sourceUrl || entry.sourceUrl || null,
      })
    }
  }

  const finalized = []
  let idx = 0
  for (const person of byName.values()) {
    const matchedPersonalEmail = matchOfficerToClubEmail(person.name, clubEmails)
    const resolvedEmail = person.email || matchedPersonalEmail || club.email || null
    finalized.push({
      id: makeRosterId(clubId, person.name),
      clubId,
      clubName,
      name: person.name,
      initials: makeInitials(person.name),
      role: person.role,
      personType: person.personType || classifyPersonType(person.role),
      major: person.major || null,
      year: person.year || null,
      email: resolvedEmail,
      office: person.office || null,
      instagram: person.instagram || club.instagram || null,
      color: ROLE_COLORS[(colorOffset + idx) % ROLE_COLORS.length],
      source: person.source || 'directory',
      sourceUrl: person.sourceUrl || null,
    })
    idx++
  }

  // Ensure every club with an official UCSC directory email has at least a verified Organization Contact entry
  // so opening any club's Roster tab always gives students a real point of contact.
  if (finalized.length === 0 && club.email) {
    const isPresInbox = /pres(?:ident)?/i.test(club.email)
    const contactName = `${clubName} ${isPresInbox ? 'President' : 'Board'}`
    finalized.push({
      id: `roster_${clubId}_official_contact`,
      clubId,
      clubName,
      name: contactName,
      initials: makeInitials(clubName),
      role: isPresInbox ? 'President Contact' : 'Official Club Contact',
      personType: 'officer',
      major: 'Registered UCSC Student Organization',
      year: null,
      email: club.email,
      office: null,
      instagram: club.instagram || null,
      color: ROLE_COLORS[colorOffset % ROLE_COLORS.length],
      source: 'directory',
      sourceUrl: `https://getinvolved.ucsc.edu/student-organizations/join/`,
    })
  }

  return finalized
}

async function fetchDiscordBotGuildCounts(clubs = []) {
  const token = (process.env.DISCORD_BOT_TOKEN || '').trim()
  if (!token || !clubs.length) return new Map()

  const norm = s =>
    String(s || '')
      .toLowerCase()
      .replace(/^@+/, '')
      .replace(/\b(ucsc|uc santa cruz|santa cruz|at ucsc|club|official|server)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, '')

  try {
    const res = await fetch('https://discord.com/api/v10/users/@me/guilds?with_counts=true', {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(7000),
    })
    if (!res.ok) return new Map()
    const guilds = await res.json()
    if (!Array.isArray(guilds)) return new Map()

    const byClubId = new Map()
    for (const g of guilds) {
      const gKey = norm(g.name)
      if (!gKey || gKey.length < 3) continue
      for (const c of clubs) {
        const cid = String(c.id || c.instagram || '').toLowerCase()
        const cKey = norm(c.name)
        const hKey = norm(cid)
        if (
          gKey === cKey ||
          gKey === hKey ||
          (cKey.length >= 4 && gKey.includes(cKey)) ||
          (gKey.length >= 4 && cKey.includes(gKey))
        ) {
          if (g.approximate_member_count != null) {
            byClubId.set(cid, {
              memberCount: g.approximate_member_count,
              onlineCount: g.approximate_presence_count ?? null,
            })
          }
          break
        }
      }
    }
    return byClubId
  } catch {
    return new Map()
  }
}

/**
 * Collect daily roster & membership stats across all clubs.
 */
export async function collectRosters({
  clubs = [],
  posts = [],
  links = [],
  crawlWebsites = true,
  refreshDiscordCounts = true,
  websiteConcurrency = 6,
} = {}) {
  const checkedAt = new Date().toISOString()

  let prevCache = {}
  try {
    if (fs.existsSync(ROSTER_CACHE_FILE)) {
      prevCache = JSON.parse(fs.readFileSync(ROSTER_CACHE_FILE, 'utf8'))
    }
  } catch {
    prevCache = {}
  }

  let verifiedByClub = {}
  try {
    if (fs.existsSync(VERIFIED_ROSTERS_FILE)) {
      verifiedByClub = JSON.parse(fs.readFileSync(VERIFIED_ROSTERS_FILE, 'utf8'))
    }
  } catch {
    verifiedByClub = {}
  }

  const botGuildCounts = refreshDiscordCounts ? await fetchDiscordBotGuildCounts(clubs) : new Map()

  const postsByClub = new Map()
  for (const p of posts || []) {
    const cid = String(p?.clubId || '').toLowerCase()
    if (!cid) continue
    if (!postsByClub.has(cid)) postsByClub.set(cid, [])
    postsByClub.get(cid).push(p)
  }

  const linksByClub = new Map()
  for (const l of links || []) {
    const cid = String(l?.clubId || '').toLowerCase()
    if (!cid) continue
    if (!linksByClub.has(cid)) linksByClub.set(cid, [])
    linksByClub.get(cid).push(l)
  }

  const allRosterEntries = []
  const updatedClubs = []
  let clubsWithNamedPeople = 0
  let websiteCrawledCount = 0

  const perClubResults = await runWithConcurrency(clubs, websiteConcurrency, async (club, clubIdx) => {
    const cid = String(club.id || club.instagram || '').toLowerCase()
    const clubPosts = postsByClub.get(cid) || []
    const clubLinks = linksByClub.get(cid) || []

    const rawCandidates = []

    // 0. Seed verified deep-scanned officers & members (Canva graphics, Campus Directory, verified web rosters)
    const verifiedList = verifiedByClub[cid] || verifiedByClub[club.id] || []
    for (const vp of verifiedList) {
      if (vp?.name && vp?.role) {
        rawCandidates.push({
          name: vp.name,
          role: vp.role,
          personType: vp.personType || classifyPersonType(vp.role),
          major: vp.major || null,
          year: vp.year || null,
          email: vp.email || null,
          office: vp.office || null,
          source: vp.source || 'directory',
          sourceUrl: vp.sourceUrl || null,
        })
      }
    }

    // 1. Instagram Bio + Posts ("Meet the Board", Officer/Member Spotlights)
    rawCandidates.push(...extractRosterFromBio(club.bio || '', club))
    // Process oldest -> newest so newer board elections overwrite older titles for the same person
    const chronologicalPosts = [...clubPosts].sort((a, b) =>
      String(a.postedAt || '').localeCompare(String(b.postedAt || ''))
    )
    for (const post of chronologicalPosts) {
      rawCandidates.push(...extractRosterFromPost(post, club))
    }

    // 2. Official Club Website & Linktree Board/Officers Subpages
    if (crawlWebsites) {
      const webPeople = await crawlClubWebsiteRoster(club, clubLinks)
      if (webPeople.length > 0) {
        websiteCrawledCount++
        rawCandidates.push(...webPeople)
      }
    }

    // 3. Discord Server Roster Counts (public Invite API + optional ClubHub Bot guild counts)
    let discordMemberCount = club.discordMemberCount ?? null
    let discordOnlineCount = club.discordOnlineCount ?? null

    const botCount = botGuildCounts.get(cid)
    if (botCount?.memberCount != null) {
      discordMemberCount = Math.max(discordMemberCount || 0, botCount.memberCount)
      if (botCount.onlineCount != null) discordOnlineCount = botCount.onlineCount
    }

    // Also parse cached count from enriched Discord link label if already present ("Discord — Slug Gaming (1,420 members · 210 online)")
    for (const l of clubLinks) {
      if (l.kind === 'discord' && l.label) {
        const mCount = l.label.match(/\(([\d,]+)\s+members?(?:\s*·\s*([\d,]+)\s+online)?\)/i)
        if (mCount && discordMemberCount == null) {
          discordMemberCount = Number(mCount[1].replace(/,/g, '')) || null
          if (mCount[2]) discordOnlineCount = Number(mCount[2].replace(/,/g, '')) || null
        }
      }
    }

    if (refreshDiscordCounts) {
      const discordUrls = [
        club.discord,
        ...clubLinks.filter(l => l.kind === 'discord').map(l => l.url),
      ].filter(Boolean)

      for (const invUrl of [...new Set(discordUrls)].slice(0, 2)) {
        const meta = await fetchDiscordInviteMetadata(invUrl)
        if (meta?.memberCount != null) {
          if (discordMemberCount == null || meta.memberCount > discordMemberCount) {
            discordMemberCount = meta.memberCount
            discordOnlineCount = meta.onlineCount ?? discordOnlineCount
          }
        }
      }
    }

    const mergedRoster = mergeClubRosterEntries(club, rawCandidates, { colorOffset: clubIdx })
    const namedCount = mergedRoster.filter(r => !String(r.id).endsWith('_official_contact')).length

    const followers = Number(club.followers) || 0
    const memberCount = Math.max(discordMemberCount || 0, followers, mergedRoster.length)

    prevCache[cid] = {
      checkedAt,
      rosterCount: mergedRoster.length,
      namedCount,
      discordMemberCount,
      discordOnlineCount,
    }

    return {
      club: {
        ...club,
        id: club.id || cid,
        memberCount,
        discordMemberCount,
        discordOnlineCount,
        rosterCount: mergedRoster.length,
        rosterUpdatedAt: checkedAt,
      },
      roster: mergedRoster,
      namedCount,
    }
  })

  for (const res of perClubResults) {
    if (!res) continue
    updatedClubs.push(res.club)
    allRosterEntries.push(...res.roster)
    if (res.namedCount > 0) clubsWithNamedPeople++
  }

  try {
    fs.mkdirSync(path.dirname(ROSTER_CACHE_FILE), { recursive: true })
    fs.writeFileSync(ROSTER_CACHE_FILE, JSON.stringify(prevCache, null, 2))
  } catch {
    // ignore cache write issues in read-only environments
  }

  return {
    rosterUpdatedAt: checkedAt,
    clubs: updatedClubs,
    roster: allRosterEntries,
    summary: {
      clubsChecked: updatedClubs.length,
      totalRosterEntries: allRosterEntries.length,
      officersCount: allRosterEntries.filter(r => r.personType === 'officer').length,
      membersCount: allRosterEntries.filter(r => r.personType === 'member').length,
      clubsWithNamedPeople,
      websitesYieldingRosters: websiteCrawledCount,
      clubsWithDiscordCounts: updatedClubs.filter(c => c.discordMemberCount != null).length,
    },
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  const offline = process.argv.includes('--offline')
  const snapCandidates = [
    path.resolve(ROOT, '../public/clubhub-data.json'),
    path.join(ROOT, 'output/clubhub-data.json'),
  ]
  const snapPath = snapCandidates.find(p => fs.existsSync(p))
  const snap = snapPath ? JSON.parse(fs.readFileSync(snapPath, 'utf8')) : {}
  const catalogPath = path.join(ROOT, 'clubs.json')
  const catalogClubs = fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath, 'utf8')) : []
  const snapById = new Map((snap.clubs || []).map(c => [String(c.id || c.instagram || '').toLowerCase(), c]))
  const mergedClubs = (catalogClubs.length ? catalogClubs : snap.clubs || []).map(c => {
    const cid = String(c.id || c.instagram || '').toLowerCase()
    const prev = snapById.get(cid) || {}
    return {
      ...prev,
      ...c,
      id: prev.id || cid,
      bio: prev.bio || null,
      website: prev.website || c.website || null,
      followers: prev.followers ?? null,
      directoryDescription: c.description || prev.directoryDescription || null,
    }
  })

  collectRosters({
    clubs: mergedClubs,
    posts: snap.posts || [],
    links: snap.links || [],
    crawlWebsites: !offline,
    refreshDiscordCounts: !offline,
  })
    .then(result => {
      console.log('Roster summary:', result.summary)
    })
    .catch(err => {
      console.error('Roster collection failed:', err)
      process.exit(1)
    })
}
