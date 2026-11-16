// ── Site-Wide Smart Search & Relevance Ranking Engine ──────────────────────
// Provides fast, zero-dependency multi-token AND matching, Unicode/punctuation
// normalization (apostrophes, hyphens, @handles, compounds like "ACM-W" / "acmw"
// and "A Cappella" / "acappella"), 1-typo tolerance on longer words, and tiered
// relevance scoring across Clubs, Events, Announcements, Directory, Links & Tasks.

const DIACRITICS_RE = /[\u0300-\u036f]/g
const APOSTROPHE_RE = /['’‘`]/g
const NON_ALNUM_RE = /[^a-z0-9+#]+/g

/**
 * Normalize text for search indexing: lowercase, strip accents & apostrophes,
 * split punctuation into spaces.
 */
export function normalizeSearchText(raw) {
  if (!raw) return ''
  return String(raw)
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .replace(APOSTROPHE_RE, '')
    .replace(NON_ALNUM_RE, ' ')
    .trim()
}

/**
 *Collapsed alphanumeric string (e.g. "ACM-W" -> "acmw", "A Cappella" -> "acappella").
 */
function collapseAlphaNum(normalized) {
  return normalized.replace(/[^a-z0-9]/g, '')
}

/**
 * Parse a user search query into clean tokens and normalized phrase.
 */
export function parseSearchQuery(rawQuery) {
  const normalized = normalizeSearchText(rawQuery)
  if (!normalized) {
    return { normalized: '', collapsed: '', tokens: [] }
  }
  const tokens = normalized.split(/\s+/).filter(Boolean)
  return {
    normalized,
    collapsed: collapseAlphaNum(normalized),
    tokens,
  }
}

/**
 * Bounded 1-edit Damerau-Levenshtein check (insertion, deletion, substitution,
 * or adjacent transposition) for typo tolerance on words >= 5 characters.
 */
function isWithinOneEdit(a, b) {
  const lenA = a.length
  const lenB = b.length
  if (Math.abs(lenA - lenB) > 1) return false
  if (a === b) return true

  let i = 0
  let j = 0
  let edits = 0

  while (i < lenA && j < lenB) {
    if (a[i] === b[j]) {
      i++
      j++
      continue
    }

    // Check adjacent transposition (e.g. "teh" <-> "the", "form" <-> "from")
    if (
      edits === 0 &&
      i + 1 < lenA &&
      j + 1 < lenB &&
      a[i] === b[j + 1] &&
      a[i + 1] === b[j]
    ) {
      edits++
      i += 2
      j += 2
      continue
    }

    edits++
    if (edits > 1) return false

    if (lenA > lenB) {
      i++
    } else if (lenB > lenA) {
      j++
    } else {
      i++
      j++
    }
  }

  if (i < lenA || j < lenB) edits++
  return edits <= 1
}

function buildTierIndex(values) {
  if (!values) return { text: '', collapsed: '', words: [] }
  const arr = Array.isArray(values) ? values : [values]
  const joined = normalizeSearchText(arr.filter(Boolean).join(' '))
  if (!joined) return { text: '', collapsed: '', words: [] }
  return {
    text: joined,
    collapsed: collapseAlphaNum(joined),
    words: joined.split(/\s+/).filter(Boolean),
  }
}

function scoreTokenInTier(token, tier, weights) {
  if (!tier.text) return 0

  // 1. Exact whole-word or word-prefix match
  for (let idx = 0; idx < tier.words.length; idx++) {
    const w = tier.words[idx]
    if (w === token) {
      return idx === 0 ? weights.exactFirst : weights.exactWord
    }
    if (w.startsWith(token)) {
      return idx === 0 ? weights.prefixFirst : weights.prefixWord
    }
  }

  // 2. Substring match inside text
  if (tier.text.includes(token)) {
    return weights.substring
  }

  // 3. Compound match across spaces/hyphens (e.g. "acmw" -> "ACM-W", "acappella" -> "A Cappella")
  if (token.length >= 3 && tier.collapsed.includes(token)) {
    return weights.compound
  }

  // 4. 1-edit typo match against words (or prefixes of longer words) for tokens >= 5 chars
  if (token.length >= 5) {
    for (const w of tier.words) {
      if (w.length >= 4 && isWithinOneEdit(token, w)) {
        return weights.fuzzy
      }
      if (w.length > token.length && isWithinOneEdit(token, w.slice(0, token.length))) {
        return weights.fuzzy
      }
    }
  }

  return 0
}

const PRIMARY_WEIGHTS = {
  exactFirst: 120,
  exactWord: 95,
  prefixFirst: 88,
  prefixWord: 72,
  substring: 52,
  compound: 60,
  fuzzy: 26,
}

const SECONDARY_WEIGHTS = {
  exactFirst: 58,
  exactWord: 50,
  prefixFirst: 44,
  prefixWord: 38,
  substring: 28,
  compound: 32,
  fuzzy: 16,
}

const TERTIARY_WEIGHTS = {
  exactFirst: 26,
  exactWord: 24,
  prefixFirst: 20,
  prefixWord: 18,
  substring: 14,
  compound: 16,
  fuzzy: 10,
}

/**
 * Score how well an item matches a user query across primary, secondary, and
 * tertiary text fields. Every token in the query must match at least one tier
 * (AND semantics); returns 0 when any token fails to match.
 */
export function scoreSearchMatch(rawQuery, fields = {}) {
  const parsed = typeof rawQuery === 'string' ? parseSearchQuery(rawQuery) : rawQuery
  if (!parsed || parsed.tokens.length === 0) return 1

  const primary = buildTierIndex(fields.primary)
  const secondary = buildTierIndex(fields.secondary)
  const tertiary = buildTierIndex(fields.tertiary)

  let totalScore = 0

  // Bonus when full multi-word phrase matches contiguously in primary or secondary
  if (parsed.tokens.length > 1) {
    if (primary.text.startsWith(parsed.normalized)) totalScore += 60
    else if (primary.text.includes(parsed.normalized)) totalScore += 40
    else if (secondary.text.includes(parsed.normalized)) totalScore += 20
  } else if (parsed.collapsed.length >= 3 && primary.collapsed === parsed.collapsed) {
    totalScore += 55
  }

  for (const token of parsed.tokens) {
    const pScore = scoreTokenInTier(token, primary, PRIMARY_WEIGHTS)
    const sScore = scoreTokenInTier(token, secondary, SECONDARY_WEIGHTS)
    const tScore = scoreTokenInTier(token, tertiary, TERTIARY_WEIGHTS)
    const best = Math.max(pScore, sScore, tScore)

    if (best === 0) {
      return 0
    }
    totalScore += best + (pScore > 0 && sScore > 0 ? 8 : 0)
  }

  return totalScore
}

/**
 * Boolean convenience check using multi-token + normalized + fuzzy matching.
 */
export function matchesSearchQuery(rawQuery, fields) {
  const parsed = typeof rawQuery === 'string' ? parseSearchQuery(rawQuery) : rawQuery
  if (!parsed || parsed.tokens.length === 0) return true
  if (Array.isArray(fields) || typeof fields === 'string') {
    return scoreSearchMatch(parsed, { primary: fields }) > 0
  }
  return scoreSearchMatch(parsed, fields) > 0
}

/**
 * Filter and rank an array of items by search relevance.
 * When query is blank, returns the original array reference untouched.
 */
export function filterAndRankBySearch(items, rawQuery, getFields) {
  if (!Array.isArray(items) || items.length === 0) return items || []
  const parsed = parseSearchQuery(rawQuery)
  if (parsed.tokens.length === 0) return items

  const scored = []
  for (let index = 0; index < items.length; index++) {
    const item = items[index]
    const score = scoreSearchMatch(parsed, getFields(item))
    if (score > 0) {
      scored.push({ item, score, index })
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.index - b.index
  })

  return scored.map(entry => entry.item)
}

// Related concepts are a bounded set of whole words. Motorsport is useful
// related evidence; a generic category or the word "motorcycle" is not a car match.
const AUTOMOTIVE = ['car', 'cars', 'automotive', 'automobile', 'automobiles', 'motorsport', 'motorsports']
const CLUB_CONCEPTS = [
  AUTOMOTIVE,
  ['coding', 'code', 'programming', 'software', 'computer science'],
  ['hiking', 'hike', 'hikes', 'backpacking', 'outdoors', 'outdoor'],
  ['music', 'musical', 'singing', 'choir', 'a cappella', 'acappella'],
]
const conceptsByWord = new Map(CLUB_CONCEPTS.flatMap(group =>
  group.filter(term => !term.includes(' ')).map(term => [term, group])
))
const documents = new WeakMap()
const list = value => Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
const hasPhrase = (text, phrase) => Boolean(phrase && (' ' + text + ' ').includes(' ' + phrase + ' '))

function uniqueTexts(values) {
  const seen = new Set()
  return values.filter(value => {
    if (typeof value !== 'string') return false
    const key = normalizeSearchText(value)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Club objects are immutable for a given catalog revision. Reuse their
// normalized fields across discovery, the directory and global search.
export function getClubSearchDocument(club) {
  if (documents.has(club)) return documents.get(club)
  const identities = uniqueTexts([
    club.name, club.displayName, club.officialName, ...list(club.alsoKnownAs), ...list(club.aliases),
    club.instagram, club.handle, club.abbr, String(club.id ?? ''),
  ]).map(normalizeSearchText)
  const descriptions = uniqueTexts([club.description, club.bio, club.directoryDescription])
  const tags = uniqueTexts(list(club.tags).map(tag => typeof tag === 'string' ? tag : tag?.label))
  const category = normalizeSearchText([club.category, club.categoryLabel].filter(Boolean).join(' '))
  const descriptiveText = normalizeSearchText(descriptions.join(' '))
  const tagText = normalizeSearchText(tags.join(' '))
  const doc = {
    id: String(club.id ?? ''), identities, descriptions, tags, descriptiveText, tagText, category,
    words: [...new Set(identities.join(' ').split(' '))],
    fullText: [...identities, descriptiveText, tagText].join(' '),
  }
  documents.set(club, doc)
  return doc
}

const NO_CLUB_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'for', 'with', 'near', 'club', 'clubs'])
function clubQuery(raw) {
  const input = String(raw || '').trim()
  const excludedTerms = []
  const positive = input.replace(/\b(?:not|without|exclude|no)\s+([^,.;!?]+?)(?=$|[,.;!?]|\b(?:but|with|plus)\b)/gi, (_, clause) => {
    excludedTerms.push(...parseSearchQuery(clause).tokens.filter(token => !NO_CLUB_WORDS.has(token)))
    return ' '
  })
  const parsed = parseSearchQuery(positive)
  return {
    ...parsed, excludedTerms,
    tokens: parsed.tokens.filter(token => !NO_CLUB_WORDS.has(token)),
  }
}

const pluralForms = word => word.endsWith('s') && !word.endsWith('ss') && word.length > 3 ? [word, word.slice(0, -1)] : [word, word + 's']

export function isClubExcluded(club, intent = {}, positiveTokens = []) {
  if (intent.excludeJoined && club.joined) return true
  if (intent.excludedCategories?.includes(String(club.category || '').toLowerCase())) return true
  if (intent.excludedClubIds?.some(id => String(id) === String(club.id))) return true

  const doc = getClubSearchDocument(club)
  const negatives = (intent.excludedTerms || []).flatMap(pluralForms)
  const identity = doc.identities.join(' ')
  if (negatives.some(term => hasPhrase(identity, term))) return true
  if (!negatives.some(term => hasPhrase(doc.descriptiveText + ' ' + doc.tagText, term))) return false
  // A cross-reference in a bio need not exclude a club with independent
  // positive evidence. Broad terms such as motorsport alone don't override it.
  return !positiveTokens.some(token => {
    const alternatives = conceptsByWord.get(token)
    const terms = alternatives === AUTOMOTIVE ? AUTOMOTIVE.slice(0, 5) : alternatives || pluralForms(token)
    return terms.some(term => !negatives.includes(term) && hasPhrase(doc.fullText, term))
  })
}

export function scoreClubSearchDocument(doc, parsed, { partial = false } = {}) {
  if (parsed.normalized && doc.identities.some(name =>
    name === parsed.normalized || collapseAlphaNum(name) === parsed.collapsed
  )) return { score: 1000, terms: parsed.tokens }

  const identity = doc.identities.join(' ')
  const scores = []
  const terms = []
  for (const token of [...new Set(parsed.tokens)].slice(0, 16)) {
    const concept = conceptsByWord.get(token)
    let score = 0
    let evidence = token
    if (hasPhrase(identity, token)) score = 100
    else if (hasPhrase(doc.descriptiveText, token)) score = 82
    else if (hasPhrase(doc.tagText, token)) score = 68

    if (concept && score < 82) {
      const candidates = concept.filter(term => term !== token)
      for (const term of candidates) {
        const relatedMotorsport = concept === AUTOMOTIVE && /motorsports?/.test(term)
        const weight = hasPhrase(identity, term) ? 78 : hasPhrase(doc.descriptiveText, term) ? 74
          : hasPhrase(doc.tagText, term) ? 64 : 0
        const relatedWeight = relatedMotorsport ? Math.min(weight, 42) : weight
        if (relatedWeight > score) { score = relatedWeight; evidence = term }
      }
    }
    if (!concept && !score) {
      if (token.length >= 2 && doc.words.some(word => word.startsWith(token))) score = 62
      else if (token.length >= 5 && doc.words.some(word => isWithinOneEdit(token, word))) score = 49
      else if (token.length >= 4 && pluralForms(token).some(form => hasPhrase(doc.descriptiveText, form))) score = 60
    }
    if (!score && hasPhrase(doc.category, token)) score = 22
    if (score) { scores.push(score); terms.push(evidence) }
    else if (!partial) return { score: 0, terms: [] }
  }
  if (!scores.length) return { score: 0, terms: [] }
  const phrase = parsed.normalized || ''
  const words = phrase.split(' ')
  const namePrefix = phrase && doc.identities.some(name => name.startsWith(phrase + ' ') ||
    (words.length > 1 && words.at(-1).length >= 2 && name.startsWith(phrase)))
  const typoPrefix = !namePrefix && words.length > 1 && words.at(-1).length >= 5 &&
    doc.identities.some(name => isWithinOneEdit(phrase, name.split(' ').slice(0, words.length).join(' ')))
  const alignment = namePrefix ? 220 : typoPrefix ? 140 : 0
  return { score: alignment + scores.reduce((a, b) => a + b, 0) / Math.max(parsed.tokens.length, 1), terms }
}

export function rankClubSearch(clubs, rawQuery, { limit = Infinity } = {}) {
  if (!String(rawQuery || '').trim()) return clubs.slice(0, limit)
  const parsed = clubQuery(rawQuery)
  const ranked = []
  const seen = new Set()
  for (const club of clubs) {
    if (!club?.id || isClubExcluded(club, parsed, parsed.tokens)) continue
    const doc = getClubSearchDocument(club)
    if (seen.has(doc.id)) continue
    const { score } = scoreClubSearchDocument(doc, parsed)
    if (score) { ranked.push({ club, score }); seen.add(doc.id) }
  }
  return ranked.sort((a, b) => b.score - a.score || String(a.club.id).localeCompare(String(b.club.id)))
    .slice(0, limit).map(entry => entry.club)
}
