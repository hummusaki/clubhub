// Optional: uses Claude to read the caption AND the post image (flyers often have the date/time/room
// only in the picture). Falls back to the rule-based extractor if no key is set or a call fails.

import { extractLinks, makeTitle } from './extract.js'

const SYSTEM = `You extract structured club info from a UCSC student club's Instagram post.
Return ONLY a JSON object, no prose, with this shape:
{
  "type": "meeting" | "event" | "announcement" | "other",
  "important": boolean,            // cancellations, room changes, deadlines, elections
  "title": string,                 // short human title, max 80 chars
  "summary": string,               // 1-2 plain sentences
  "events": [{
    "title": string,
    "kind": "meeting" | "event" | "deadline",
    "start": string,               // ISO 8601 with offset, America/Los_Angeles time
    "end": string | null,
    "allDay": boolean,             // true if no time of day was given
    "recurring": "monday"|"tuesday"|"wednesday"|"thursday"|"friday"|"saturday"|"sunday"|null,
    "location": string | null
  }],
  "links": [{ "url": string, "label": string }]
}
Rules: resolve relative dates ("this Friday", "tomorrow") against the post date. Use info from the image too.
Only include events actually announced in the post. If nothing is scheduled, use an empty events array.`

export function llmEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY)
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

  const res = await fetch('https://api.anthropic.com/v1/messages', {
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
  })
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  const text = data.content?.find(c => c.type === 'text')?.text || ''
  const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))

  // Normalize, and merge in any links the model missed.
  const links = new Map(extractLinks(post.caption || '', profile.website).map(l => [l.url.toLowerCase(), l]))
  for (const l of json.links || []) {
    if (l?.url && !links.has(l.url.toLowerCase())) links.set(l.url.toLowerCase(), { url: l.url, kind: 'website', label: l.label || 'Link' })
  }
  return {
    type: json.type || 'other',
    important: Boolean(json.important),
    title: json.title || makeTitle(post.caption || ''),
    summary: json.summary || '',
    events: (json.events || [])
      .filter(e => e?.start && !Number.isNaN(Date.parse(e.start)))
      .map(e => ({
        title: e.title || json.title,
        kind: ['meeting', 'event', 'deadline'].includes(e.kind) ? e.kind : 'event',
        start: new Date(e.start).toISOString(),
        end: e.end && !Number.isNaN(Date.parse(e.end)) ? new Date(e.end).toISOString() : null,
        allDay: Boolean(e.allDay),
        recurring: e.recurring || null,
        location: e.location || null,
      })),
    links: [...links.values()],
    extractedBy: 'claude',
  }
}
