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
