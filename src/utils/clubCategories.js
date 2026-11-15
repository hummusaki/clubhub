// ── Automatic Club Categorization & Category Metadata ──
// Classifies fetched clubs automatically using name, handle, bio, email, aliases, and posts.

export const CLUB_CATEGORIES = [
  {
    id: 'tech & science',
    label: 'Tech & Science',
    shortLabel: 'Tech & Science',
    color: 'blue',
    gradient: 'linear-gradient(135deg, var(--blue), #4B7BE5)',
    order: 1,
  },
  {
    id: 'pre-professional',
    label: 'Academic & Pre-Prof',
    shortLabel: 'Academic',
    color: 'teal',
    gradient: 'linear-gradient(135deg, var(--teal), #3E9B92)',
    order: 2,
  },
  {
    id: 'cultural',
    label: 'Cultural & Identity',
    shortLabel: 'Cultural',
    color: 'purple',
    gradient: 'linear-gradient(135deg, var(--purple), #8565C4)',
    order: 3,
  },
  {
    id: 'performing arts',
    label: 'Performing Arts',
    shortLabel: 'Performing Arts',
    color: 'red',
    gradient: 'linear-gradient(135deg, var(--red), #D46B6B)',
    order: 4,
  },
  {
    id: 'media & arts',
    label: 'Media & Visual Arts',
    shortLabel: 'Media & Arts',
    color: 'yellow',
    gradient: 'linear-gradient(135deg, var(--yellow), #E09F2D)',
    order: 5,
  },
  {
    id: 'service & advocacy',
    label: 'Service & Advocacy',
    shortLabel: 'Service',
    color: 'green',
    gradient: 'linear-gradient(135deg, var(--green), #4CA868)',
    order: 6,
  },
  {
    id: 'greek',
    label: 'Greek Life',
    shortLabel: 'Greek Life',
    color: 'purple',
    gradient: 'linear-gradient(135deg, #7C65E0, var(--blue))',
    order: 7,
  },
  {
    id: 'gaming',
    label: 'Gaming & Recreation',
    shortLabel: 'Gaming & Rec',
    color: 'blue',
    gradient: 'linear-gradient(135deg, var(--green), var(--teal))',
    order: 8,
  },
  {
    id: 'faith',
    label: 'Faith & Spiritual',
    shortLabel: 'Faith',
    color: 'yellow',
    gradient: 'linear-gradient(135deg, #E09F2D, var(--purple))',
    order: 9,
  },
  {
    id: 'community',
    label: 'Campus Community',
    shortLabel: 'Community',
    color: 'teal',
    gradient: 'linear-gradient(135deg, var(--blue), var(--teal))',
    order: 10,
  },
]

export const CLUB_CATEGORY_MAP = Object.fromEntries(
  CLUB_CATEGORIES.map(cat => [cat.id, cat])
)

// Ordered multi-signal classification rules evaluated against name/handle/email first, then bio/posts
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
 * Automatically determines the canonical category ID for any fetched or local club.
 */
export function categorizeClub(club = {}) {
  if (!club || typeof club !== 'object') return 'community'

  const rawCat = String(club.category || '').trim().toLowerCase()

  // Primary identity signals (name, handle, aliases, email)
  const primarySignals = [
    club.name,
    ...(Array.isArray(club.alsoKnownAs) ? club.alsoKnownAs : []),
    club.instagram,
    club.id,
    club.email,
    ...(Array.isArray(club.tags) ? club.tags.map(t => t?.label || t) : []),
  ]
    .filter(Boolean)
    .join(' ')

  // Secondary content signals (Instagram bio, description, recent post titles/summaries)
  const secondarySignals = [
    club.bio,
    club.description,
    ...(Array.isArray(club.posts)
      ? club.posts.slice(0, 3).map(p => `${p?.title || ''} ${p?.summary || ''}`)
      : []),
  ]
    .filter(Boolean)
    .join(' ')

  // If the club already has a specific non-"other" collector category (and isn't a broad legacy bucket),
  // keep it unless primary name rules strongly refine a legacy bucket like 'academic' -> 'tech & science'.
  if (SPECIFIC_KNOWN_IDS.has(rawCat)) {
    return rawCat
  }

  // Run primary name/handle/email rules first (high precision)
  for (const [catId, regex] of NAME_RULES) {
    if (regex.test(primarySignals)) {
      return catId
    }
  }

  // Run secondary bio/description/post rules next (resolves clubs with abstract names like POPreka, Alay, Fishrap, Counter Space)
  if (secondarySignals) {
    for (const [catId, regex] of NAME_RULES) {
      if (regex.test(secondarySignals)) {
        return catId
      }
    }
  }

  // Map legacy sample categories ('academic', 'arts', 'social') if still unmatched
  if (LEGACY_CATEGORY_MAP[rawCat]) {
    return LEGACY_CATEGORY_MAP[rawCat]
  }

  return 'community'
}

export function getClubCategoryMeta(categoryOrClub) {
  const catId =
    typeof categoryOrClub === 'string'
      ? SPECIFIC_KNOWN_IDS.has(categoryOrClub.toLowerCase())
        ? categoryOrClub.toLowerCase()
        : LEGACY_CATEGORY_MAP[categoryOrClub.toLowerCase()] ||
          (CLUB_CATEGORY_MAP[categoryOrClub.toLowerCase()]
            ? categoryOrClub.toLowerCase()
            : categorizeClub({ category: categoryOrClub }))
      : categorizeClub(categoryOrClub)

  return CLUB_CATEGORY_MAP[catId] || CLUB_CATEGORY_MAP.community
}
