// ── Automatic Club Categorization for Collector & Backend ──
// Classifies fetched clubs automatically using name, handle, aliases, email, bio, and posts.

const NAME_RULES = [
  [
    'greek',
    /\b(alpha|beta|gamma|delta|epsilon|zeta|theta|kappa|lambda|sigma|omicron|omega|phi|psi|chi|tau|panhellenic|inter-greek|sorority|fraternity)\b/i,
  ],
  [
    'performing arts',
    /\b(a\s*cappella|acapella|dance|dancing|troupe|mariachi|folklorico|ballroom|comedy|choir|band|orchestra|raas|hip\s*hop|improv|on the spot|theater|theatre|k-pop|kpop|popreka|line danc|boots|tazatal|taza tal|slugspeak|spoken word)\b/i,
  ],
  [
    'media & arts',
    /\b(magazine|journal|press|film|cinema|literary|television|sctv|photo|photography|shutter|art collective|studio art|visual art|printmaking|zine|anime|manga|book club|satire|fishrap|leviathan|alay|creative)\b/i,
  ],
  [
    'tech & science',
    /\b(computing|computer|cs\s*club|csclub|developer|gdgc|acm|engineer|engineering|nsbe|sase|science|scientists|physics|astronomy|counter space|quantum|neuro|neuroscience|cognitive|cogsci|robot|robotics|data|ai\b|machine learning|game design|gdacollab|coding|cyber|software|hardware)\b/i,
  ],
  [
    'pre-professional',
    /\b(pre-|medic|medical|amsa|cmda|dental|physician|optometry|veterinary|ems\b|emergency medical|bioethics|law|legal|mock trial|debate|rhetoric|business|investment|banking|economics|econ\b|finance|financial|world system builder|fund\b|sfig|accounting|consulting|historical society|history|academic)\b/i,
  ],
  [
    'faith',
    /\b(christian|christians|catholic|newman|jewish student union|jsu\b|muslim|bhakti|yoga|fellowship|aacf|faith|church|hillel|ministry|spiritual)\b/i,
  ],
  [
    'cultural',
    /\b(student association|students association|students and scholars|cultural|latin|latine|latinx|chican|chale|hermanas|hermanes|somos|oaxaque|black student|bsu\b|umoja|african|nigerian|asian|apisa|cusn|pacific islander|indigenous|native american|sanai|filipin|bayanihan|kamp\b|kuya ate|isang himig|himing|pagkakaisa|vietnamese|korean|kasa\b|japanese|jsa\b|chinese|taiwanese|indian|south asian|kahaani|bangladeshi|khmer|sikh|slavic|south american|central american|cafe\b|mecha)\b/i,
  ],
  [
    'gaming',
    /\b(gaming|esports|games|chess|8th rank|tabletop|fighting game|quiz bowl|yu-gi-oh|rhythm game|outdoor|adventure|hiking|climbing|bouldering|recreation|run club|surf|skate|sports)\b/i,
  ],
  [
    'service & advocacy',
    /\b(red cross|circle k|cki\b|smile|medlife|overdose|planned parenthood|outreach|sio\b|sustainab|eslp|environment|enviroslug|volunteer|democrats|republicans|politics|jstreet\w*|mun\b|slugmun|advocacy|essential medicines|pupcycled|wellness|transgender|tsu\b|leadership|sol council|student union|retention)\b/i,
  ],
]

const SPECIFIC_KNOWN_IDS = new Set([
  'tech & science',
  'pre-professional',
  'cultural',
  'performing arts',
  'media & arts',
  'service & advocacy',
  'greek',
  'gaming',
  'faith',
])

const LEGACY_CATEGORY_MAP = {
  academic: 'pre-professional',
  arts: 'media & arts',
  social: 'gaming',
  sports: 'gaming',
  outdoors: 'gaming',
}

/**
 * Automatically determines the canonical category ID for any fetched club.
 */
export function categorizeClub(club = {}) {
  if (typeof club === 'string') {
    return categorizeClub({ name: club })
  }
  if (!club || typeof club !== 'object') return 'community'

  const rawCat = String(club.category || '').trim().toLowerCase()
  if (SPECIFIC_KNOWN_IDS.has(rawCat)) {
    return rawCat
  }

  const primarySignals = [
    club.name,
    ...(Array.isArray(club.alsoKnownAs) ? club.alsoKnownAs : []),
    club.instagram,
    club.id,
    club.email,
  ]
    .filter(Boolean)
    .join(' ')

  const secondarySignals = [
    club.bio,
    club.description,
    ...(Array.isArray(club.posts)
      ? club.posts.slice(0, 3).map(p => `${p?.title || ''} ${p?.summary || ''}`)
      : []),
  ]
    .filter(Boolean)
    .join(' ')

  for (const [catId, regex] of NAME_RULES) {
    if (regex.test(primarySignals)) {
      return catId
    }
  }

  if (secondarySignals) {
    for (const [catId, regex] of NAME_RULES) {
      if (regex.test(secondarySignals)) {
        return catId
      }
    }
  }

  if (LEGACY_CATEGORY_MAP[rawCat]) {
    return LEGACY_CATEGORY_MAP[rawCat]
  }

  return 'community'
}
