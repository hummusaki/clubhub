// Rule-based extraction of attendable club events, meetings, locations and links from a post caption,
// plus shared validation (`isActualClubEvent` / `filterActualEvents`) used across every 2-hour sync source.

import * as chrono from 'chrono-node'

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

// UCSC places that show up in club posts (case-insensitive substring match; room codes handled separately).
const UCSC_PLACES = [
  'Baskin Engineering', 'Jack Baskin', 'Engineering 2', 'Science Hill', 'Thimann',
  'Physical Sciences', 'Earth & Marine Sciences', 'Earth and Marine Sciences',
  'Natural Sciences', 'N. Sci Annex', 'Redwood Lounge', 'Hitchcock Lounge',
  'Silverman Conference Room', 'Cowell Conference Room', 'Seabright Beach',
  'Kresge', 'Porter', 'Merrill', 'Cowell', 'Stevenson',
  'Crown', 'Oakes', 'Rachel Carson', 'RCC Red Room', 'College Nine', 'College Ten', 'C9/JRL', 'C9 ',
  'John R. Lewis', 'Quarry Plaza', 'Quarry Amphitheater', 'Bay Tree', 'Baytree',
  'McHenry Library', 'McHenry', 'Science & Engineering Library', 'Science and Engineering Library',
  'S&E Library', 'Humanities', 'Social Sciences', 'Media Theater', 'Classroom Unit', 'Kerr Hall',
  'Stevenson Event Center', 'Merrill Cultural Center', 'Cowell Ranch Hall', 'Multipurpose Room',
  'OPERS', 'East Field', 'East Gym', 'West Field', 'Martial Arts Studio',
  'Coastal Science Campus', 'Silicon Valley Campus', 'Student Union', "Women's Center",
  'Ethnic Resource Centers', 'Village', 'Family Student Housing', 'Music Center',
  'Theater Arts', 'DARC', 'Digital Arts Research Center', 'Amah Mutsun', 'Zoom',
]

// Explicit uppercase building/room shorthand (kept separate so "be " in English prose never matches Baskin Engineering!)
const UCSC_ROOM_CODE_RE = /\b((?:BE|E2|E-2|JBE|EMS|MCH)\s*[-#]?\s*\d{2,4}[A-Za-z]?)\b/

const MEETING_WORDS = /\b(meeting|gbm|general body|weekly|meetings|club meeting|workshop series|office hours|practice|rehearsal|study jam|study crawl|reading section|cohort|discussion|halaqah)\b/i
const EVENT_WORDS = /\b(event|social|party|workshop|talk|panel|tabling|fundraiser|boba|bake sale|hackathon|game jam|competition|tournament|showcase|concert|performance|potluck|mixer|info session|info night|welcome night|kickoff|movie night|game night|screening|auditions?|rush|reveal|installs?|banquet|retreat|trip|hike|beach|bonfire|volunteer|clothing swap|craft|open mic|open studio)\b/i
const ANNOUNCE_WORDS = /\b(applications?|apply|submissions?|submit|deadline|elections?|recruiting|hiring|board|officer|room change|cancel+ed|postponed|reminder|announcement|update|sign[- ]?ups?|registration|welcome|congrat|merch|dues|giving day|donate|survey)\b/i
const IMPORTANT_WORDS = /\b(cancel+ed|cancel+ation|room change|moved to|postponed|rescheduled|deadline|urgent|important|last day|due|closes?|elections?)\b/i

const DEADLINE_CLAUSE_WORDS = /\b(deadline|due|closes?|closing|ends?|ending|until|through|thru|preorder|pre-order|early\s+bird|apply|applications?\s+due|submissions?\s+(?:due|close|open)|submit|campaign\s+ends|active\s+until|open\s+until|live\s+now)\b|截止|到期/i
const DEADLINE_TRAILING_PREP_RE = /(?<!\b(?:stop|swing|come|drop|pass|stand|hosted|presented|led|sponsored|taught)\s)\b(?:by|before)\s*(?:the\s+end\s+of\s*)?$/i

// Non-event post categories (announcements, campaigns, recaps, spotlights, holidays, cancellations)
const ONLINE_CAMPAIGN_RE = /\b(giving\s*day|pre-giving|early\s+giving|early\s+donations?|give\.ucsc\.edu|give2ucsc|giveucsc|ucscgivingday|donation\s+link|donate\s+(?:now|today|early|here|via|through)|dm\s+proof\s+of\s+payment|merch\s+(?:drop|order|orders|preorder|pre-order|sale|is\s+here)|prize\s+reveals?|survey\s+link\s*:|qualtrics\.com)\b/i

const SUBMISSION_OR_APP_ONLY_RE = /\b(accepting\s+[\w\s/&-]{0,35}submissions?|submissions?\s+are\s+(?:now\s+)?(?:open|live|due|extended|closed)|submissions?\s+(?:open|close)\b|(?:staff|officer|board|intern|editor|committee|volunteer)\s+applications?\s+are\s+(?:now\s+)?(?:open|live|due|extended|closed)|applications?\s+are\s+(?:now\s+)?(?:open|live|due|closed)|sign\s+up\s+to\s+be\s+an?\s+[\w\s]{1,25}intern|new\s+due\s+date\s+for|extending\s+the\s+deadline|deadline\s+(?:to\s+[\w\s]+\s+)?has\s+been\s+extended)\b/i

const SPOTLIGHT_OR_PROMO_RE = /\b(meet\s+(?:the|our)\s+(?:team|board|officers?|staff|execs?|cabinet|interns?)\s+behind|happy\s+meet\s+exec|officer\s+spotlight|member\s+spotlight|board\s+spotlight|introducing\s+our\s+(?:\d{4}[-\/]\d{2,4}\s+)?(?:board|officers?|team|staff)|recruitment\s+video)\b|^[\W_]*meet\s+[a-z]{2,20}\s*!/i

const COMMEMORATION_RE = /\b(\d+(?:st|nd|rd|th)\s+(?:year\s+)?anniversary\s+of|celebrated\s+\d+\s+[\w\s]{0,20}years|declaration\s+of\s+state\s+sovereignty|celebrate\s+[\w\s]{1,30}independence\s+day|act\s+of\s+independence\s+was\s+signed|solar\s+new\s+year\s+is\s+celebrated|merry\s+christmas\s+and\s+happy\s+holidays|happy\s+new\s+year\s+from)\b/i

const RECAP_POST_RE = /\b(thanks?\s+(?:so\s+much\s+)?(?:for\s+coming|to\s+everyone\s+who\s+(?:came|joined|showed\s+up|performed|attended)|to\s+all\s+who\s+came|to\s+every\s+single\s+person\s+who\s+came|to\s+those\s+who\s+were\s+able)|thank\s+you\s+(?:to\s+)?(?:everyone|all|so\s+much)?\s*(?:for\s+coming|who\s+(?:came|showed\s+up|joined|attended))|weekly\s+recap|another\s+weekly\s+recap|what\s+a\s+(?:way\s+to\s+kick\s+things\s+off|first\s+meeting|great\s+turnout)|it\s+was\s+amazing\s+meeting\s+everyone|we\s+loved\s+(?:seeing|sharing)\s+[\w\s]+(?:yesterday|last\s+night)|last\s+night[’']?s\s+meeting\s+was)\b/i

const CANCELLATION_CLAUSE_RE = /\b(no\s+(?:gbm|meeting|general\s+meeting|practice|rehearsal|office\s+hours|session|workshop)\b|won[’']?t\s+be\s+meeting|will\s+not\s+be\s+meeting|meetings?\s+(?:is|are|will\s+be)\s+cancel+ed|next\s+two\s+meetings\s+will\s+be\s+cancel+ed|(?:event|gbm|workshop|practice|session)\s+(?:is|has\s+been|will\s+be)\s+cancel+ed|\[cancel+ed\]|^cancel+ed\s*:)\b/i

function isCancellationClause(text) {
  return CANCELLATION_CLAUSE_RE.test(text) ||
    /(?:^\s*\[?cancel+ed(?:\]|:)|\b(?:is|has been|will be) cancel+ed\b)/i.test(text)
}

export function isCancellationNotice(caption) {
  return String(caption || '').split(/\n|[.!?]\s+/).some(isCancellationClause)
}

const PAST_CLAUSE_RE = /\b(was\s+(?:founded|signed|adopted|held)|celebrated\s+\d+|came\s+out\s+to|showed\s+up\s+to|joined\s+us\s+(?:at|for|last|yesterday)|made\s+today\s+so\s+special|yesterday|last\s+(?:night|week|month|year|quarter))\b/i

const GREETING_ONLY_LINE_RE = /^(?:hey+|hi+|hello+|hola+|yo+|greetings|dear|good\s+(?:morning|afternoon|evening)|happy\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week\s*\d+))\b[^.!?]{0,32}[!,.:~♡⭐️✨]*$/i

const INVALID_LOCATION_PREFIX_RE = /^(?:be|is|are|was|were|have|having|to|and|or|our|we|we[’']?ll|you|join|for|with|that|this)\b/i

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>()]+|(?:linktr\.ee|discord\.gg|discord\.com\/invite|forms\.gle|bit\.ly|tinyurl\.com|docs\.google\.com|calendar\.app\.google|lu\.ma|eventbrite\.com|instagram\.com|tiktok\.com|youtube\.com|youtu\.be|campuslabs\.com|ucsc\.edu)\/?[^\s<>()]*)/gi

const EMOJI_RE = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu

export function cleanText(s) {
  return String(s || '').replace(EMOJI_RE, '').replace(/\s+/g, ' ').trim()
}

export function makeTitle(caption) {
  const cleanedLines = String(caption || '')
    .split('\n')
    .map(l => cleanText(l.replace(/#[\w]+/g, '')))
    .filter(l => l.length > 2)

  if (!cleanedLines.length) return 'Untitled post'

  let substantive =
    cleanedLines.find(
      l =>
        !GREETING_ONLY_LINE_RE.test(l) ||
        MEETING_WORDS.test(l) ||
        EVENT_WORDS.test(l)
    ) || cleanedLines[0]

  const parts = substantive.split(/(?<=[.!?])\s+/)
  if (parts.length > 1 && GREETING_ONLY_LINE_RE.test(parts[0])) {
    substantive = parts.slice(1).join(' ').trim() || substantive
  }

  const sentence = substantive.split(/(?<=[.!?])\s/)[0]
  if (sentence.length >= 12) {
    return sentence.length > 90 ? sentence.slice(0, 87).trimEnd() + '...' : sentence
  }
  return substantive.length > 90 ? substantive.slice(0, 87).trimEnd() + '...' : substantive
}

export function extractLinks(text, profileWebsite = null) {
  const found = new Map()
  for (const m of String(text || '').matchAll(URL_RE)) {
    let url = m[0].replace(/[.,!?;:'")\]]+$/, '')
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    found.set(url.toLowerCase(), url)
  }
  if (/link in (our )?bio/i.test(text) && profileWebsite) {
    found.set(profileWebsite.toLowerCase(), profileWebsite)
  }
  return [...found.values()].map(url => ({ url, kind: linkKind(url), label: linkLabel(url) }))
}

function linkKind(url) {
  if (/discord/i.test(url)) return 'discord'
  if (/forms\.gle|docs\.google\.com\/forms/i.test(url)) return 'form'
  if (/linktr\.ee/i.test(url)) return 'linktree'
  if (/docs\.google|drive\.google/i.test(url)) return 'document'
  if (/lu\.ma|eventbrite|calendar/i.test(url)) return 'event'
  if (/youtube|youtu\.be|tiktok|instagram/i.test(url)) return 'social'
  return 'website'
}

function linkLabel(url) {
  const kind = linkKind(url)
  const labels = {
    discord: 'Discord',
    form: 'Sign-up form',
    linktree: 'Linktree',
    document: 'Google Doc',
    event: 'Event page',
    social: 'Social',
  }
  try {
    return labels[kind] || new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return labels[kind] || 'Link'
  }
}

export function extractLocation(caption) {
  const lines = String(caption || '').split('\n')
  // 1. Explicit markers first: "📍 Kresge 321", "Location: ...", "Where: ..."
  for (const line of lines) {
    const m = line.match(/(?:📍|location\s*[:\-]|where\s*[:\-]|place\s*[:\-]|room\s*[:\-])\s*(.+)/i)
    if (m) {
      const tidied = tidyLocation(m[1])
      if (
        tidied &&
        !/\b(?:link in (?:our )?bio|email\b|dm\s+us|tbd|tba)\b|通知|待定/i.test(tidied)
      ) {
        return tidied
      }
    }
  }
  // 2. Explicit uppercase room codes like "E2-506", "E2 192", "BE 152"
  for (const line of lines) {
    const codeMatch = line.match(UCSC_ROOM_CODE_RE)
    if (codeMatch) {
      const tidied = tidyLocation(codeMatch[1])
      if (tidied) return tidied
    }
  }
  // 3. Known UCSC campus buildings & venues
  for (const line of lines) {
    for (const place of UCSC_PLACES) {
      const idx = line.toLowerCase().indexOf(place.toLowerCase())
      if (idx === -1) continue
      // Ensure word boundary before short place names
      if (idx > 0 && /[a-z0-9]/i.test(line[idx - 1])) continue
      const rest = line
        .slice(idx)
        .split(
          /[,.!|•·(]| for | from | on | at \d| \d{1,2}(:\d\d)?\s*(am|pm)| (?:mon|tues|wednes|thurs|fri|satur|sun)day| (?:this|next|tomorrow|tonight|today)\b| (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d/i
        )[0]
      const tidied = tidyLocation(rest)
      if (tidied) return tidied
    }
  }
  return null
}

function tidyLocation(s) {
  const out = cleanText(String(s || '').split('(')[0])
    .replace(/^[:\-–—\s]+/, '')
    .replace(/#[\w]+/g, '')
    .replace(/[,.;\s]+$/, '')
    .trim()
  if (!out || out.length < 3) return null
  if (!UCSC_ROOM_CODE_RE.test(out) && INVALID_LOCATION_PREFIX_RE.test(out)) return null
  if (/^[a-z0-9._]+ucsc$/i.test(out)) return null
  return out.length > 80 ? out.slice(0, 80).trimEnd() : out
}

function detectRecurring(caption) {
  const m =
    caption.match(/\b(?:every|each)\s+(sun|mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?)\w*day\b/i) ||
    caption.match(/\b(sun|mon|tues|wednes|thurs|fri|satur)days\b/i)
  if (!m) return null
  const prefix = m[1].toLowerCase().slice(0, 3)
  return WEEKDAYS.find(d => d.startsWith(prefix)) || null
}

function nextWeekday(from, weekday) {
  const d = new Date(from)
  const target = WEEKDAYS.indexOf(weekday)
  const diff = (target - d.getDay() + 7) % 7 || 7
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function lineAround(text, index) {
  const start = text.lastIndexOf('\n', index) + 1
  const end = text.indexOf('\n', index)
  return text.slice(start, end === -1 ? undefined : end)
}

function toPacificDateKey(isoOrDate) {
  const dt = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate)
  if (Number.isNaN(dt.getTime())) return ''
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(dt)
  } catch {
    return dt.toISOString().slice(0, 10)
  }
}

function isBogusChronoDateResult(r, caption, ref) {
  const raw = r.text.trim()
  if (!raw) return true

  // 1. Bare "now" / "right now" / "currently" -> never a scheduled event date
  if (/^(?:right\s+)?now$/i.test(raw) || /^currently$/i.test(raw)) return true

  // 2. Past-looking expressions ("yesterday", "last night", "last Thursday", "2 days ago", "night before")
  if (
    /\b(?:ago|yesterday|last\s+(?:night|week|weekend|month|year|quarter|mon|tues?|wed|thu|fri|sat|sun))\b/i.test(
      raw
    )
  ) {
    return true
  }
  const beforeSlice = caption.slice(Math.max(0, r.index - 18), r.index)
  if (/\b(?:last|past|previous|before)\s*$/i.test(beforeSlice)) return true

  // 3. Vague week/weekend or relative duration offsets ("next week", "this week", "30 minutes", "5 more days", "1 day")
  if (/^(?:this|next|coming|following)\s+(?:week|weekend|month|year)s?$/i.test(raw)) return true
  if (/\b\d+\s+(?:more\s+)?(?:seconds?|mins?|minutes?|hrs?|hours?|days?|weeks?|months?|years?)\b/i.test(raw)) {
    return true
  }
  if (/^(?:a|an|one|two|three)\s+(?:day|week|month|hour)s?\b/i.test(raw)) return true

  // 4. Bare time-of-day words ("night", "morning", "evening") without an explicit day or "tonight"
  if (/^(?:morning|afternoon|evening|night)$/i.test(raw)) return true

  // 5. Bare "today" in non-scheduling prose ("Today, we celebrate...", "today's connections", "made today so special")
  if (/^today$/i.test(raw)) {
    const line = lineAround(caption, r.index)
    const afterChar = caption[r.index + r.text.length] || ''
    if (/^[’']s\b/i.test(caption.slice(r.index + r.text.length))) return true
    if (afterChar === ',') return true
    const hasSchedulingCue =
      r.start.isCertain('hour') ||
      /\b(?:join\s+us|come\s+(?:out|join|by)|stop\s+by|see\s+you|meeting\s+today|happening\s+today|today\s+(?:at|from|in)\b)/i.test(
        line
      )
    if (!hasSchedulingCue) return true
  }

  // 6. Numeric slash ratios/fractions/divisions ("DIV 1/2", "QUEST 1/4", "Slide 2/5", "24/7", "2024/25")
  if (/^\d{1,2}\/\d{1,2}$/.test(raw)) {
    const aroundBefore = caption.slice(Math.max(0, r.index - 20), r.index)
    const aroundAfter = caption.slice(r.index + r.text.length, r.index + r.text.length + 12)
    if (
      /\b(?:div(?:ision)?|quest|part|pt|slide|page|vol(?:ume)?|issue|step|phase|track|round|tier|rank|top|room|rm|24)\s*$/i.test(
        aroundBefore
      ) ||
      /[0-9/]$/.test(aroundBefore) ||
      /^\/\d/.test(aroundAfter)
    ) {
      return true
    }
    // A bare M/D > 45 days from postedAt without a weekday/date marker is almost always a fraction (e.g. 1/2, 1/4)
    if (!Number.isNaN(ref.getTime())) {
      const diffDays = Math.abs(r.start.date().getTime() - ref.getTime()) / 86_400_000
      const line = lineAround(caption, r.index)
      const hasExplicitDateContext =
        /(?:📅|🗓|📆|date\s*:|\b(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?\b|\b(?:on|from)\s+\d{1,2}\/\d{1,2})/i.test(
          line
        )
      if (diffDays > 45 && !hasExplicitDateContext) return true
    }
  }

  return false
}

function isRealClockTimeResult(r) {
  const raw = r.text.trim()
  if (!r.start.isCertain('hour')) return false
  if (/^(?:right\s+)?now$/i.test(raw)) return false
  // Must contain a digit ("6pm", "4:30", "12-4:30pm") or explicit "noon" / "midnight" — never "Pajama Night"!
  return /\d/.test(raw) || /\b(?:noon|midnight)\b/i.test(raw)
}

function hasConcreteAttendableInvitation(caption, { hasTime = false, hasLocation = false } = {}) {
  const hasAttendCue =
    /\b(join\s+us|come\s+(?:join|hang|out|stop\s+by|celebrate|dance)|stop\s+by|see\s+you\s+(?:at|in|there)|we\s+will\s+be\s+(?:hosting|having|holding)|holding\s+our|hosting\s+our)\b/i.test(
      caption
    )
  const hasGatheringNoun = MEETING_WORDS.test(caption) || EVENT_WORDS.test(caption)
  return hasTime && (hasLocation || hasAttendCue) && hasGatheringNoun
}

export function extractEvents(caption, postedAt, { title, location } = {}) {
  const text = String(caption || '')
  if (!text.trim()) return []

  const ref = new Date(postedAt)
  const resolvedTitle = title || makeTitle(text)
  const resolvedLocation = location !== undefined ? location : extractLocation(text)

  // Multi-day "Save this post for NEXT WEEK! Monday-Webinar / Tuesday-Newsletter / Thursday-Post" overview graphics
  if (
    /save\s+this\s+post\s+for\s+next\s+week/i.test(text) &&
    /\b(?:tuesday|wednesday|thursday|friday)\s*[-–:]\s*(?:newsletter|post)\b/i.test(text)
  ) {
    return []
  }

  // Explicit dates go to the year closest to the post; bare weekdays shift forward to upcoming.
  const rawResults = chrono.parse(text, ref).map(r => {
    if (
      !r.start.isCertain('day') &&
      r.start.isCertain('weekday') &&
      r.start.date() < new Date(ref).setHours(0, 0, 0, 0)
    ) {
      const shifted = chrono.parse(r.text, ref, { forwardDate: true })[0]
      if (shifted) {
        shifted.index = r.index
        return shifted
      }
    }
    return r
  })

  // "at 5" with no am/pm: clubs don't meet at 5 AM, so treat 1-7 as PM.
  for (const r of rawResults) {
    for (const c of [r.start, r.end].filter(Boolean)) {
      const h = c.get('hour')
      if (c.isCertain('hour') && !c.isCertain('meridiem') && h >= 1 && h <= 7) {
        c.assign('hour', h + 12)
      }
    }
  }

  const dated = rawResults.filter(r => {
    if (isBogusChronoDateResult(r, text, ref)) return false
    if (r.start.isCertain('day')) return true
    if (r.start.isCertain('weekday')) {
      const line = lineAround(text, r.index)
      if (/\b[-–:]\s*(?:newsletter|post|blog|article)\b/i.test(line)) return false
      return (
        (r.start.isCertain('hour') && /\d/.test(r.text)) ||
        EVENT_WORDS.test(line) ||
        MEETING_WORDS.test(line) ||
        /\b(this|next|see you|join us)\b/i.test(line)
      )
    }
    return false
  })

  const timeOnly = rawResults.filter(r => !dated.includes(r) && isRealClockTimeResult(r))
  const recurring = detectRecurring(text)
  const isMeeting = MEETING_WORDS.test(text) || Boolean(recurring)
  const isRecapPost = RECAP_POST_RE.test(text)

  const candidates = []

  for (const r of dated) {
    const line = lineAround(text, r.index)
    const idxInLine = Math.max(0, line.indexOf(r.text))
    const clauseBefore = line.slice(0, idxInLine).split(/[,;.!]|\band\b|\bbut\b/i).pop() || ''
    const clauseAround = line

    // 1. Filter out deadlines, form cutoffs, preorder cutoffs, and campaign end dates
    if (
      DEADLINE_CLAUSE_WORDS.test(clauseBefore) ||
      DEADLINE_TRAILING_PREP_RE.test(clauseBefore) ||
      /\b(?:deadline|submissions?\s+close|applications?\s+(?:due|close)|campaign\s+ends|preorder\s+until)\b|截止|預售|到期/i.test(
        clauseAround
      )
    ) {
      continue
    }

    // 2. Filter out canceled meetings/events ("won't be meeting this week", "next two meetings will be canceled")
    if (isCancellationClause(clauseAround) || /\bnext\s+two\s+meetings\s+will\s+be\s+cancel+ed\b/i.test(text)) {
      continue
    }

    // 3. Filter out past-tense / historical clauses ("celebrated 23 years", "was signed", "came out to our GBM")
    if (PAST_CLAUSE_RE.test(clauseAround) && !/\b(?:next|upcoming|see\s+you|join\s+us)\b/i.test(clauseAround)) {
      continue
    }

    const start = r.start.date()
    let end = r.end ? r.end.date() : null
    let hasTime = r.start.isCertain('hour') && /\d/.test(r.text)

    // Merge date & clock time when written separately ("📅 Nov 18" / "⏰ 6-8pm" or "Sat, Nov 21 · 9 PM–12AM")
    if (!hasTime && timeOnly.length) {
      const sameLineTime = timeOnly.find(t => lineAround(text, t.index) === line)
      const t = sameLineTime || timeOnly[0]
      if (t) {
        start.setHours(t.start.get('hour'), t.start.get('minute') || 0, 0, 0)
        if (t.end) {
          end = new Date(start)
          end.setHours(t.end.get('hour'), t.end.get('minute') || 0, 0, 0)
        }
        hasTime = true
      }
    }

    if (!hasTime) start.setHours(0, 0, 0, 0)

    // Ignore historical mentions or implausible dates > 400 days from post
    if (
      Number.isNaN(start.getTime()) ||
      start.getFullYear() < 2024 ||
      (!Number.isNaN(ref.getTime()) && Math.abs(start.getTime() - ref.getTime()) > 400 * 86_400_000)
    ) {
      continue
    }

    // Recap posts may only emit a newly announced FUTURE event that includes an explicit time or campus venue
    if (isRecapPost) {
      const startDay = toPacificDateKey(start)
      const refDay = toPacificDateKey(ref)
      if (!Number.isNaN(ref.getTime()) && startDay <= refDay) continue
      if (!hasTime && !resolvedLocation) continue
    }

    const candidate = {
      title: resolvedTitle,
      kind: isMeeting ? 'meeting' : 'event',
      start: start.toISOString(),
      end: end ? end.toISOString() : null,
      allDay: !hasTime,
      recurring,
      location: resolvedLocation,
    }

    if (isActualClubEvent(candidate, { caption: text, postedAt })) {
      candidates.push(candidate)
    }
  }

  // "Meetings every Tuesday at 6pm" with no specific date: use the next occurrence (unless post is a non-event).
  if (!candidates.length && recurring && !isRecapPost && !isCancellationClause(text)) {
    const start = nextWeekday(ref, recurring)
    let end = null
    const t = timeOnly[0]
    if (t) {
      start.setHours(t.start.get('hour'), t.start.get('minute') || 0, 0, 0)
      if (t.end) {
        end = new Date(start)
        end.setHours(t.end.get('hour'), t.end.get('minute') || 0, 0, 0)
      }
    }
    const recurringCandidate = {
      title: resolvedTitle,
      kind: 'meeting',
      start: start.toISOString(),
      end: end ? end.toISOString() : null,
      allDay: !t,
      recurring,
      location: resolvedLocation,
    }
    if (isActualClubEvent(recurringCandidate, { caption: text, postedAt })) {
      candidates.push(recurringCandidate)
    }
  }

  // Deduplicate within the same post:
  // 1) If a post has a timed event (!allDay), drop redundant allDay shadow matches from the same post.
  // 2) Drop duplicate events landing on the same local Pacific calendar day & kind (e.g. bilingual captions).
  const hasTimedCandidate = candidates.some(e => !e.allDay)
  const filteredByPrecision = hasTimedCandidate
    ? candidates.filter(e => !e.allDay)
    : candidates

  const seenKeys = new Set()
  const deduped = []
  for (const e of filteredByPrecision) {
    const dayKey = toPacificDateKey(e.start)
    const exactKey = `${e.kind}|${e.start}`
    const bilingualDupKey = `${e.kind}|${dayKey}|${e.title}`
    if (seenKeys.has(exactKey) || seenKeys.has(bilingualDupKey)) continue
    seenKeys.add(exactKey)
    seenKeys.add(bilingualDupKey)
    deduped.push(e)
  }

  return deduped
}

/**
 * Shared validator for any scraped/extracted event across Instagram (rules + Claude LLM),
 * Discord, Email, Website, Google Calendar, and cached snapshots.
 * Returns `true` ONLY when `event` represents an actual attendable club event or meeting.
 */
export function isActualClubEvent(event, context = {}) {
  if (!event || !event.start) return false

  // Always preserve user-created custom events, manual API events, and Collaborative Availability Poll booked meetings
  const idStr = String(event.id || '')
  const rawSource = String(event.source || context.source || 'instagram').toLowerCase()
  if (
    event.isCustom ||
    event.isBookedCollab ||
    idStr.startsWith('custom_evt_') ||
    idStr.startsWith('collab_evt_') ||
    rawSource === 'scheduler' ||
    rawSource === 'manual' ||
    rawSource === 'workspace'
  ) {
    return true
  }

  // 1. Deadlines, application cutoffs, and submission windows are announcements, not attendable events
  const kind = String(event.kind || 'event').toLowerCase()
  if (kind === 'deadline') return false

  const title = cleanText(event.title || '')
  if (!title) return false
  if (/^(?:deadline\s*:|due\s*:|applications?\s+(?:due|open|close)|submissions?\s+(?:due|open|close))\b/i.test(title)) {
    return false
  }

  // 2. Validate start timestamp bounds
  const startDt = new Date(event.start)
  if (Number.isNaN(startDt.getTime())) return false
  const year = startDt.getUTCFullYear()
  if (year < 2024 || year > 2030) return false

  const source = rawSource

  // 3. Google Calendar & Discord Guild Scheduled Event entries: keep real meetings/events, drop explicit cancellations or deadlines
  if (
    source === 'google_calendar' ||
    source === 'discord_scheduled' ||
    idStr.startsWith('discord_sched_') ||
    idStr.startsWith('discord_evt_')
  ) {
    if (/^(?:\[?\s*cancel+ed\s*\]?[:\-\s]|no\s+(?:gbm|meeting|practice)\b|deadline\s*:)/i.test(title)) {
      return false
    }
    return true
  }

  // 4. Reject non-zero-second timestamps from text scrapers (caused by chrono parsing "now" / "30 minutes" relative to postedAt)
  if (startDt.getUTCSeconds() !== 0) {
    return false
  }

  const caption = String(context.caption || context.post?.caption || '')
  const combinedText = `${title}\n${caption}`.trim()
  const hasTime = !event.allDay
  const cleanedLoc = tidyLocation(event.location || '')
  const hasLocation = Boolean(cleanedLoc)

  // 5. Online Giving Day / crowdfunding / Venmo / merch / survey / prize-reveal campaigns
  if (ONLINE_CAMPAIGN_RE.test(combinedText)) {
    if (!hasConcreteAttendableInvitation(combinedText, { hasTime, hasLocation })) {
      return false
    }
  }

  // 6. Application / zine submission / internship form announcements without an attendable session
  if (SUBMISSION_OR_APP_ONLY_RE.test(combinedText)) {
    const hasLiveSession =
      hasTime &&
      /\b(info\s+(?:session|night)|workshop|gbm|general\s+(?:body\s+)?meeting|panel|mixer|auditions?)\b/i.test(
        combinedText
      )
    if (!hasLiveSession) return false
  }

  // 7. Officer / board / member spotlights & recruitment promo videos without a scheduled meetup
  if (SPOTLIGHT_OR_PROMO_RE.test(combinedText)) {
    if (!hasConcreteAttendableInvitation(combinedText, { hasTime, hasLocation })) {
      return false
    }
  }

  // 8. Historical commemorations, anniversaries, and holiday greeting posts
  if (COMMEMORATION_RE.test(combinedText)) {
    if (!hasConcreteAttendableInvitation(combinedText, { hasTime, hasLocation })) {
      return false
    }
  }

  // 9. Pure cancellation notices ("No GBM this week...", "The next two meetings will be canceled")
  if (
    /\b(?:no\s+(?:gbm|meeting|general\s+meeting|practice|office\s+hours)\s+this\s+week|next\s+two\s+meetings\s+will\s+be\s+cancel+ed)\b/i.test(
      combinedText
    )
  ) {
    return false
  }

  if (isCancellationClause(title) || (
    caption && caption.split(/\n|[.!?]\s+/).some(clause => isCancellationClause(clause) &&
      chrono.parse(clause, new Date(context.postedAt || context.post?.postedAt || event.start)).some(date =>
        (date.start.isCertain('day') || date.start.isCertain('weekday')) &&
        chronoDateKey(date.start) === (event.allDay ? String(event.start).slice(0, 10) : toPacificDateKey(event.start)))
    )
  )) return false

  // 10. Recap / thank-you posts: drop all-day stubs ("see you next week!") or dates on/before postedAt
  if (caption && RECAP_POST_RE.test(caption)) {
    if (!hasTime && !hasLocation) return false
    const postedAtRaw = context.postedAt || context.post?.postedAt
    if (postedAtRaw) {
      const postedDt = new Date(postedAtRaw)
      if (!Number.isNaN(postedDt.getTime()) && toPacificDateKey(startDt) <= toPacificDateKey(postedDt)) {
        return false
      }
    }
  }

  // 11. Multi-day overview graphics ("Save this post for NEXT WEEK! ... Tuesday-Newsletter / Thursday-Post")
  if (
    /save\s+this\s+post\s+for\s+next\s+week/i.test(combinedText) &&
    !hasTime &&
    !hasLocation
  ) {
    return false
  }

  // 12. Bare sign-offs / apologies with zero event/meeting nouns, zero time, and zero location
  //     (e.g. "See yall next week MEChistas", "I'm sorry my future grandmasters :( See you all on 11/18!")
  if (!hasTime && !hasLocation) {
    const textToCheck = caption || title
    if (!MEETING_WORDS.test(textToCheck) && !EVENT_WORDS.test(textToCheck)) {
      return false
    }
    if (/^[\W_]*(?:i[’']?m\s+sorry|sorry\s+everyone|apologies)\b/i.test(textToCheck) && textToCheck.length < 120) {
      return false
    }
  }

  return true
}

const EVENT_CHANGE_RE = /\b(?:rescheduled|reschedule confirmed|room change|venue change|new (?:room|venue|location)|moved to)\b/i

export function hasEventImportanceEvidence(event, caption = '') {
  if (event.important === true || event.important === 1) return true
  if (/^(?:manual|workspace)$/.test(event.source || '')) return false
  if (!caption) return EVENT_CHANGE_RE.test(event.title || '')
  const eventDay = event.allDay ? String(event.start).slice(0, 10) : toPacificDateKey(event.start)
  const title = cleanText(event.title || '').toLowerCase()
  return String(caption).split(/\n|;|[.!?]\s+|\b(?:and|but|while)\b/i).some(clause => {
    if (!EVENT_CHANGE_RE.test(clause) || isCancellationClause(clause)) return false
    const ref = new Date(event.start)
    if (!Number.isFinite(+ref)) return false
    const dated = chrono.parse(clause, ref).filter(date => date.start.isCertain('day'))
    if (dated.length) return dated.some(date => chronoDateKey(date.start) === eventDay)
    return title.length >= 6 && !EVENT_CHANGE_RE.test(title) && clause.toLowerCase().includes(title)
  })
}

function chronoDateKey(component) {
  return [component.get('year'), component.get('month'), component.get('day')]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0')).join('-')
}

export function applyEventCancellations(events, posts) {
  const cancelled = new Set()
  for (const post of posts) {
    if (!post.caption || !post.postedAt || !post.clubId) continue
    const reference = new Date(post.postedAt)
    if (!Number.isFinite(+reference)) continue
    for (const clause of post.caption.split(/\n|[.!?]\s+/)) {
      if (!isCancellationClause(clause)) continue
      for (const date of chrono.parse(clause, reference, { forwardDate: true })) {
        if (!date.start.isCertain('day') && !date.start.isCertain('weekday')) continue
        const day = chronoDateKey(date.start)
        const matches = events.filter(event => event.clubId === post.clubId && event.postId !== post.id &&
          !event.isCustom && !event.isBookedCollab && !/^(?:manual|workspace|scheduler)$/.test(event.source || '') &&
          (event.allDay ? String(event.start).slice(0, 10) : toPacificDateKey(event.start)) === day &&
          (!MEETING_WORDS.test(clause) || event.kind === 'meeting'))
        const named = matches.filter(event => {
          const title = cleanText(event.title || '').toLowerCase()
          return title.length >= 6 && clause.toLowerCase().includes(title)
        })
        const target = named.length === 1 ? named[0] : matches.length === 1 ? matches[0] : null
        if (target) cancelled.add(target.id)
      }
    }
  }
  return events.map(event => cancelled.has(event.id) ? { ...event, cancelled: true } : event)
}

/** Keep attendable events and consolidate equivalent collector records. */
export function filterActualEvents(events = [], { postsById = null, defaultCaption = '', defaultPostedAt = null } = {}) {
  const valid = []
  const indexByClubStart = new Map()

  for (const ev of events || []) {
    if (!ev) continue
    const post = ev.postId && postsById ? postsById.get(ev.postId) : null
    const caption = post?.caption ?? defaultCaption
    const postedAt = post?.postedAt ?? defaultPostedAt

    if (!isActualClubEvent(ev, { post, caption, postedAt, source: ev.source })) {
      continue
    }

    // Clean any legacy bogus location string on kept events
    const cleanedLoc =
      ev.source === 'google_calendar' || ev.isCustom || ev.isBookedCollab
        ? ev.location || null
        : tidyLocation(ev.location || '') || (post?.caption ? extractLocation(post.caption) : null)

    const normalizedEvent = {
      ...ev,
      location: cleanedLoc,
      important: hasEventImportanceEvidence(ev, caption),
    }

    // Deduplicate identical (clubId + exact start timestamp) across carousel tiles or GCal + IG cross-posts,
    // preferring direct social post permalinks while keeping richer titles/locations when available.
    const clubStartKey =
      ev.clubId && !ev.allDay
        ? `${String(ev.clubId).toLowerCase()}|${ev.start}`
        : ev.clubId
          ? `${String(ev.clubId).toLowerCase()}|${ev.start}|${cleanText(ev.title || '').toLowerCase()}`
          : null

    if (clubStartKey && indexByClubStart.has(clubStartKey)) {
      const existingIdx = indexByClubStart.get(clubStartKey)
      const prev = valid[existingIdx]
      const prevIsDirectPost = prev.source !== 'google_calendar' && Boolean(prev.postId || /instagram\.com|discord\.com/i.test(prev.permalink || ''))
      const currIsDirectPost = normalizedEvent.source !== 'google_calendar' && Boolean(normalizedEvent.postId || /instagram\.com|discord\.com/i.test(normalizedEvent.permalink || ''))

      if (!prevIsDirectPost && currIsDirectPost) {
        valid[existingIdx] = {
          ...normalizedEvent,
          title: prev.source === 'google_calendar' && prev.title ? prev.title : normalizedEvent.title,
          location: normalizedEvent.location || prev.location,
          important: normalizedEvent.important || prev.important,
          cancelled: normalizedEvent.cancelled || prev.cancelled,
        }
      } else if (prevIsDirectPost && !currIsDirectPost && normalizedEvent.source === 'google_calendar') {
        valid[existingIdx] = {
          ...prev,
          title: normalizedEvent.title || prev.title,
          location: prev.location || normalizedEvent.location,
          important: normalizedEvent.important || prev.important,
          cancelled: normalizedEvent.cancelled || prev.cancelled,
        }
      } else {
        valid[existingIdx] = {
          ...prev,
          important: normalizedEvent.important || prev.important,
          cancelled: normalizedEvent.cancelled || prev.cancelled,
        }
      }
      continue
    }

    if (clubStartKey) indexByClubStart.set(clubStartKey, valid.length)
    valid.push(normalizedEvent)
  }

  // Drop untimed/unlocated teaser shadows when the same club already has a timed event on that Pacific date
  const timedClubDays = new Set()
  for (const ev of valid) {
    if (ev.clubId && !ev.allDay) {
      const dayKey = toPacificDateKey(ev.start)
      if (dayKey) timedClubDays.add(`${String(ev.clubId).toLowerCase()}|${dayKey}`)
    }
  }

  return valid.filter(ev => {
    if (!ev.clubId || !ev.allDay || ev.location) return true
    const dayKey = toPacificDateKey(ev.start)
    return !dayKey || !timedClubDays.has(`${String(ev.clubId).toLowerCase()}|${dayKey}`)
  })
}

export function classify(caption, events) {
  if (events.some(e => e.kind === 'meeting')) return 'meeting'
  if (events.some(e => e.kind === 'event')) return 'event'
  if (ANNOUNCE_WORDS.test(caption) || IMPORTANT_WORDS.test(caption)) return 'announcement'
  return 'other' // recaps, memes, thank-you posts: no date, nothing to act on
}

export function extractPost(post, profile) {
  const caption = post.caption || ''
  const title = makeTitle(caption)
  const location = extractLocation(caption)
  const events = extractEvents(caption, post.postedAt, { title, location })
  const summary = cleanText(caption.replace(/#[\w]+/g, ''))
  return {
    type: classify(caption, events),
    important: IMPORTANT_WORDS.test(caption) || isCancellationNotice(caption),
    title,
    summary: summary.length > 300 ? summary.slice(0, 297).trimEnd() + '...' : summary,
    events,
    links: extractLinks(caption, profile?.website),
    extractedBy: 'rules',
  }
}
