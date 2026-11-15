// Rule-based extraction of events, meetings, deadlines, locations and links from a post caption.
// Works offline with no API key. src/llm.js can replace it with Claude for better accuracy.

import * as chrono from 'chrono-node'

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

// UCSC places that show up in club posts. Add more as you see them.
const UCSC_PLACES = [
  'Baskin Engineering', 'Jack Baskin', 'Engineering 2', 'E2', 'BE ', 'Science Hill', 'Thimann',
  'Physical Sciences', 'Earth & Marine Sciences', 'Kresge', 'Porter', 'Merrill', 'Cowell', 'Stevenson',
  'Crown', 'Oakes', 'Rachel Carson', 'College Nine', 'College Ten', 'John R. Lewis', 'Quarry Plaza',
  'Quarry Amphitheater', 'Bay Tree', 'Baytree', 'McHenry Library', 'Science & Engineering Library',
  'S&E Library', 'Humanities', 'Social Sciences', 'Media Theater', 'Classroom Unit', 'Kerr Hall',
  'Stevenson Event Center', 'Merrill Cultural Center', 'Cowell Ranch Hall', 'OPERS', 'East Field',
  'East Gym', 'West Field', 'Martial Arts Studio', 'Coastal Science Campus', 'Silicon Valley Campus',
  'Student Union', 'Women\'s Center', 'Ethnic Resource Centers', 'Village', 'Family Student Housing',
  'Music Center', 'Theater Arts', 'DARC', 'Digital Arts Research Center', 'Zoom',
]

const MEETING_WORDS = /\b(meeting|gbm|general body|weekly|meetings|club meeting|workshop series|office hours|practice|rehearsal)\b/i
const EVENT_WORDS = /\b(event|social|party|workshop|talk|panel|tabling|fundraiser|hackathon|competition|tournament|showcase|concert|performance|potluck|mixer|info session|kickoff|night|trip|hike|volunteer)\b/i
const ANNOUNCE_WORDS = /\b(applications?|apply|deadline|elections?|recruiting|hiring|board|officer|room change|cancel+ed|postponed|reminder|announcement|update|sign[- ]?ups?|registration|welcome|congrat|merch|dues)\b/i
const IMPORTANT_WORDS = /\b(cancel+ed|cancel+ation|room change|moved to|postponed|rescheduled|deadline|urgent|important|last day|due|closes?|elections?)\b/i
const DEADLINE_WORDS = /\b(by|deadline|due|closes?|closing|ends?|before|until|apply|register|rsvp|sign up|last day)\b/i

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>()]+|(?:linktr\.ee|discord\.gg|discord\.com\/invite|forms\.gle|bit\.ly|tinyurl\.com|docs\.google\.com|calendar\.app\.google|lu\.ma|eventbrite\.com|instagram\.com|tiktok\.com|youtube\.com|youtu\.be|campuslabs\.com|ucsc\.edu)\/?[^\s<>()]*)/gi

const EMOJI_RE = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu

export function cleanText(s) {
  return s.replace(EMOJI_RE, '').replace(/\s+/g, ' ').trim()
}

export function makeTitle(caption) {
  const line = caption
    .split('\n')
    .map(l => cleanText(l.replace(/#[\w]+/g, '')))
    .find(l => l.length > 2)
  if (!line) return 'Untitled post'
  const sentence = line.split(/(?<=[.!?])\s/)[0]
  if (sentence.length >= 12) return sentence.length > 90 ? sentence.slice(0, 87).trimEnd() + '...' : sentence
  return line.length > 90 ? line.slice(0, 87).trimEnd() + '...' : line
}

export function extractLinks(text, profileWebsite = null) {
  const found = new Map()
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0].replace(/[.,!?;:'")\]]+$/, '')
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    found.set(url.toLowerCase(), url)
  }
  if (/link in (our )?bio/i.test(text) && profileWebsite) found.set(profileWebsite.toLowerCase(), profileWebsite)
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
  const labels = { discord: 'Discord', form: 'Sign-up form', linktree: 'Linktree', document: 'Google Doc', event: 'Event page', social: 'Social' }
  return labels[kind] || new URL(url).hostname.replace(/^www\./, '')
}

export function extractLocation(caption) {
  const lines = caption.split('\n')
  // Explicit markers first: "📍 Kresge 321", "Location: ...", "Where: ..."
  for (const line of lines) {
    const m = line.match(/(?:📍|location\s*[:\-]|where\s*[:\-]|place\s*[:\-]|room\s*[:\-])\s*(.+)/i)
    if (m) return tidyLocation(m[1])
  }
  // Then "at/in/@ <known UCSC place> ..."
  for (const line of lines) {
    for (const place of UCSC_PLACES) {
      const idx = line.toLowerCase().indexOf(place.toLowerCase())
      if (idx === -1) continue
      const rest = line.slice(idx).split(/[,.!|•·(]| from | on | at \d| \d{1,2}(:\d\d)?\s*(am|pm)| (?:mon|tues|wednes|thurs|fri|satur|sun)day| (?:this|next|tomorrow|tonight|today)\b| (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d/i)[0]
      return tidyLocation(rest)
    }
  }
  return null
}

function tidyLocation(s) {
  const out = cleanText(s.split('(')[0]).replace(/#[\w]+/g, '').replace(/[,.;\s]+$/, '').trim()
  return out.length > 80 ? out.slice(0, 80).trimEnd() : out || null
}

function detectRecurring(caption) {
  const m = caption.match(/\b(?:every|each)\s+(sun|mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?)\w*day\b/i) ||
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

export function extractEvents(caption, postedAt, { title, location }) {
  const ref = new Date(postedAt)
  // Explicit dates go to the year closest to the post ("Jan 10" posted in Dec = next Jan, "Nov 1" posted
  // Nov 10 = past). Bare weekdays ("Tuesday") always mean the upcoming one.
  const results = chrono.parse(caption, ref).map(r => {
    if (!r.start.isCertain('day') && r.start.isCertain('weekday') && r.start.date() < new Date(ref).setHours(0, 0, 0, 0)) {
      const shifted = chrono.parse(r.text, ref, { forwardDate: true })[0]
      if (shifted) {
        shifted.index = r.index
        return shifted
      }
    }
    return r
  })

  // "at 5" with no am/pm: clubs don't meet at 5 AM, so treat 1-7 as PM.
  for (const r of results) {
    for (const c of [r.start, r.end].filter(Boolean)) {
      const h = c.get('hour')
      if (c.isCertain('hour') && !c.isCertain('meridiem') && h >= 1 && h <= 7) c.assign('hour', h + 12)
    }
  }

  const dated = results.filter(r => {
    if (r.start.isCertain('day')) return true
    // A bare weekday ("Meme Monday") only counts with a time or an event/meeting word nearby.
    if (r.start.isCertain('weekday')) {
      const line = lineAround(caption, r.index)
      return r.start.isCertain('hour') || EVENT_WORDS.test(line) || MEETING_WORDS.test(line) || /(this|next|see you|join us)/i.test(line)
    }
    return false
  })
  const timeOnly = results.filter(r => !dated.includes(r) && r.start.isCertain('hour'))
  const recurring = detectRecurring(caption)
  const isMeeting = MEETING_WORDS.test(caption) || Boolean(recurring)

  const events = []

  for (const r of dated) {
    const line = lineAround(caption, r.index)
    // Look only at the words right before the date, in the same clause: "voting closes 11/21", "apply by Nov 23".
    const clause = line.slice(0, Math.max(0, line.indexOf(r.text))).split(/[,;.!]|\band\b/i).pop()
    const isDeadline = DEADLINE_WORDS.test(clause)

    const start = r.start.date()
    let end = r.end ? r.end.date() : null
    let hasTime = r.start.isCertain('hour')

    // Date and time are often on separate lines ("📅 Nov 18" / "⏰ 6-8pm"): merge them.
    if (!hasTime && !isDeadline && timeOnly.length) {
      const t = timeOnly[0]
      start.setHours(t.start.get('hour'), t.start.get('minute') || 0, 0, 0)
      if (t.end) {
        end = new Date(start)
        end.setHours(t.end.get('hour'), t.end.get('minute') || 0, 0, 0)
      }
      hasTime = true
    }

    if (!hasTime) start.setHours(0, 0, 0, 0)

    // Ignore historical anniversary mentions ("celebrated 23 years" -> 2003) or implausible dates > 400 days from post
    if (
      Number.isNaN(start.getTime()) ||
      start.getFullYear() < 2024 ||
      (!Number.isNaN(ref.getTime()) && Math.abs(start.getTime() - ref.getTime()) > 400 * 86_400_000)
    ) {
      continue
    }

    events.push({
      title: isDeadline ? `Deadline: ${title}` : title,
      kind: isDeadline ? 'deadline' : isMeeting ? 'meeting' : 'event',
      start: start.toISOString(),
      end: end ? end.toISOString() : null,
      allDay: !hasTime,
      recurring: isDeadline ? null : recurring,
      location: isDeadline ? null : location,
    })
  }

  // "Meetings every Tuesday at 6pm" with no specific date: use the next occurrence.
  if (!events.some(e => e.kind !== 'deadline') && recurring) {
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
    events.push({
      title,
      kind: 'meeting',
      start: start.toISOString(),
      end: end ? end.toISOString() : null,
      allDay: !t,
      recurring,
      location,
    })
  }

  // Drop duplicates (same kind + same start).
  const seen = new Set()
  return events.filter(e => {
    const key = `${e.kind}|${e.start}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function classify(caption, events) {
  if (events.some(e => e.kind === 'meeting')) return 'meeting'
  if (events.some(e => e.kind === 'event')) return 'event'
  if (ANNOUNCE_WORDS.test(caption) || events.length) return 'announcement'
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
    important: IMPORTANT_WORDS.test(caption),
    title,
    summary: summary.length > 300 ? summary.slice(0, 297).trimEnd() + '...' : summary,
    events,
    links: extractLinks(caption, profile?.website),
    extractedBy: 'rules',
  }
}
