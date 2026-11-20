// Optional: uses Claude to read the caption AND the post image (flyers often have the date/time/room
// only in the picture). Falls back to the rule-based extractor if no key is set or a call fails.

import { classify, extractLinks, filterActualEvents, isCancellationNotice, makeTitle } from './extract.js'

const SYSTEM = `You extract structured club info from a UCSC student club's Instagram post.
Return ONLY a JSON object, no prose, with this shape:
{
  "type": "meeting" | "event" | "announcement" | "other",
  "important": boolean,            // cancellations, room changes, deadlines, elections
  "title": string,                 // short human title, max 80 chars
  "summary": string,               // 1-2 plain sentences
  "events": [{
    "title": string,
    "kind": "meeting" | "event",
    "start": string,               // ISO 8601 with offset, America/Los_Angeles time
    "end": string | null,
    "allDay": boolean,             // true if no time of day was given
    "recurring": "monday"|"tuesday"|"wednesday"|"thursday"|"friday"|"saturday"|"sunday"|null,
    "location": string | null
  }],
  "links": [{ "url": string, "label": string }]
}
Rules:
- Resolve relative dates ("this Friday", "tomorrow") against the post date. Use info from the image too.
- ONLY include actual attendable club meetings or events in "events" (in-person gatherings, workshops, GBMs, socials, performances, tournaments, campus tabling/boba fundraisers, or live online sessions with a scheduled start time).
- NEVER include non-events in "events": application/submission/preorder/form deadlines, online UCSC Giving Day / crowdfunding / Venmo donation asks without a live meetup, merch drops, surveys, prize reveals, officer/member spotlights, meeting cancellations ("No GBM this week"), historical anniversaries/holidays, recaps/thank-you posts without a newly scheduled timed future event, or vague "see you next week" sign-offs. Put deadlines and cancellations under "type": "announcement", "important": true, with "events": [].
- If nothing attendable is scheduled, return an empty "events" array.`

let claudeCooldownUntil = 0

export function llmEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY) && Date.now() >= claudeCooldownUntil
}

export async function extractWithClaude(post, profile) {
  const content = []
  if (post.imageUrl) content.push({ type: 'image', source: { type: 'url', url: post.imageUrl } })
  content.push({
    type: 'text',
    text: `Club: ${profile.name || profile.username} (@${profile.username})
Posted: ${post.postedAt}
Club bio link: ${profile.website || 'none'}

Caption:
${post.caption || '(no caption)'}`,
  })

  let res
  for (let attempt = 1; attempt <= 2; attempt++) {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
        max_tokens: 1500,
        system: SYSTEM,
        messages: [{ role: 'user', content }],
      }),
      signal: AbortSignal.timeout(25000),
    })
    if ((res.status === 429 || res.status === 529) && attempt === 1) {
      const retrySec = Math.min(Number(res.headers.get('retry-after')) || 3, 8)
      await new Promise(r => setTimeout(r, retrySec * 1000))
      continue
    }
    break
  }
  if (res.status === 429 || res.status === 529) {
    claudeCooldownUntil = Date.now() + 120_000
  }
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  const text = data.content?.find(c => c.type === 'text')?.text || ''
  const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))

  // Normalize, and merge in any links the model missed.
  const links = new Map(extractLinks(post.caption || '', profile.website).map(l => [l.url.toLowerCase(), l]))
  for (const l of json.links || []) {
    if (l?.url && !links.has(l.url.toLowerCase())) links.set(l.url.toLowerCase(), { url: l.url, kind: 'website', label: l.label || 'Link' })
  }
  const rawEvents = (json.events || [])
    .filter(e => e?.start && e.kind !== 'deadline' && !Number.isNaN(Date.parse(e.start)))
    .map(e => ({
      title: e.title || json.title,
      kind: e.kind === 'meeting' ? 'meeting' : 'event',
      start: new Date(e.start).toISOString(),
      end: e.end && !Number.isNaN(Date.parse(e.end)) ? new Date(e.end).toISOString() : null,
      allDay: Boolean(e.allDay),
      recurring: e.recurring || null,
      location: e.location || null,
    }))

  const filteredEvents = filterActualEvents(rawEvents, {
    defaultCaption: post.caption || '',
    defaultPostedAt: post.postedAt || null,
  })

  const resolvedType =
    filteredEvents.length === 0 && (json.type === 'event' || json.type === 'meeting')
      ? classify(post.caption || '', [])
      : json.type || classify(post.caption || '', filteredEvents)

  return {
    type: resolvedType,
    important: Boolean(json.important) || isCancellationNotice(post.caption),
    title: json.title || makeTitle(post.caption || ''),
    summary: json.summary || '',
    events: filteredEvents,
    links: [...links.values()],
    extractedBy: 'claude',
  }
}
