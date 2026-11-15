// ── Automatic Club Categorization for Collector & Backend ──
// Classifies fetched clubs automatically using name, handle, aliases, email, bio, and posts.

const NAME_RULES = [
  [
    'greek',
    /\b(alpha|beta|gamma|delta|epsilon|zeta|theta|kappa|lambda|sigma|omicron|omega|phi|psi|chi|tau|panhellenic|inter-greek|sorority|fraternity)\b/i,
  ],
  [
    'performing arts',
    /\b(a\s*cappella|acapella|dance|dancing|troupe|tangroupe|tango|mariachi|folklorico|ballroom|comedy|choir|band|orchestra|raas|hip\s*hop|improv|on the spot|theater|theatre|cabaret|k-pop|kpop|popreka|line danc|boots|tazatal|taza tal|slugspeak|spoken word|breakers|kazoku|musicians|music club|love through music|spirit squad|dance\s*\+\s*spirit)\b/i,
  ],
  [
    'media & arts',
    /\b(magazine|journal|press|city on a hill|kzsc|radio|student media|film|cinema|3d animated|animation|literary|television|sctv|photo|photography|shutter|art collective|studio art|visual art|printmaking|zine|anime|manga|book club|poets|satire|fishrap|leviathan|alay|creative|crochet|fiber arts|yarnit|fashion|slugstyle|cosplay)\b/i,
  ],
  [
    'tech & science',
    /\b(computing|computer|cs\s*club|csclub|developer|gdgc|gdg\b|acm\b|acm-w|acmw|engineer|engineering|sweslugs|swe\b|shpe\b|nsbe\b|sacnas\b|sase\b|wise\b|science|scientists|physics|astronomy|astroucsc|counter space|quantum|neuro|neuroscience|neurotech\w*|cognitive|cogsci|robot|robotics|slugbotics|autoslug|bananabots|banana bots|formula\s*slug|formulaslug|rocketry|rocket team|slugsat|slug\s*security|slugsec|blueprint|cruzhacks|hackathon|bioinformatics|igem\b|bioslugs|chemistry|chemclub|mathematics|applied math|linux|amateur radio|networking|cnsa\b|it society|itsociety|drone|gis\b|herpclub|herpetology|plant sciences|ecology|marine sciences|archaeology|anthro|anthropology|data|ai\b|artificial intelligence|santacruzai|machine learning|game design|game dev|gdacollab|coding|girls who code|cyber|software|hardware)\b/i,
  ],
  [
    'pre-professional',
    /\b(pre-|prevet|prelaw|ppsa|ansa\b|nursing|pharmacy|medic|medical|camedicine|neglected disease|diabetes|amsa|cmda|dental|physician|optometry|veterinary|ems\b|emergency medical|bioethics|law|legal|mock trial|debate|rhetoric|business|startup|investing|investment|banking|economics|econ\b|finance|financial|world system builder|fund\b|sfig|accounting|consulting|communication club|slugcommunication|regents scholars|national society of leadership|nsls\b|smith society|praxis|historical society|history|academic)\b/i,
  ],
  [
    'faith',
    /\b(christian|christians|catholic|newman|jewish student union|jsu\b|muslim|islamic|madrasa|dawah|da'wah|hindu yuva|bhakti|fellowship|aacf|faith|interfaith|church|hillel|ministry|spiritual|freethinkers)\b/i,
  ],
  [
    'cultural',
    /\b(student association|students association|students and scholars|cultural|latin|latine|latinx|chican|chale|hermanas|hermanes|somos|oaxaque|black student|bsu\b|umoja|african|caribbean|acpc\b|nigerian|asian|apisa|cusn|pacific islander|indigenous|native american|sanai|filipin|bayanihan|kamp\b|kuya ate|isang himig|himing|pagkakaisa|vietnamese|korean|kasa\b|japanese|jsa\b|chinese|taiwanese|thai|lao|tlsa\b|hmong|indian|south indian|sisa\b|south asian|sas\b|aisaa|hindu student|pakistani|psa\b|swana\b|turkish|ukrainian|uasc\b|greek club|greek_slugs|kahaani|bangladeshi|khmer|sikh|slavic|south american|central american|cafe\b|mecha)\b/i,
  ],
  [
    'gaming',
    /\b(gaming|esports|games|chess|8th rank|tabletop|mahjong|pok[eé]mon|pokemon|roblox|robloxians|fighting game|quiz bowl|yu-?gi-?oh|yugioh|rhythm game|outdoor|outdoors|camping|backpacking|bikepacking|adventure|hiking|climbing|bouldering|yoga|recreation|run club|running|cross country|slugxc|surf|surfing|skimboard|skate|skateboard|skatboarding|ski|skiing|snow|snowboard|wheels|two wheels|slugwerks|automotive|car club|motorcycle|cycling|bcycle|triathlon|sailing|rugby|lacrosse|wlax|soccer|volleyball|wcvb|basketball|baseball|softball|tennis|table tennis|pickleball|badminton|water polo|mwp\b|wwp\b|ice hockey|slugshockey|hockey|fencing|judo|taekwondo|tkd\b|muay thai|wrestling|grappling|kendo|boxing|equestrian|disc golf|ultimate|quidditch|balloon|costco club|sports)\b/i,
  ],
  [
    'service & advocacy',
    /\b(red cross|rotaract|circle k|cki\b|kesem|teddy bear hospital|project rishi|smile|medlife|overdose|planned parenthood|outreach|sio\b|sustainab|eslp|environment|enviroslug|wildlife|conservation|sankofa|feast\b|food equity|agroecological|divest|volunteer|democrats|republicans|politics|jstreet\w*|mun\b|slugmun|advocacy|essential medicines|pupcycled|wellness|sky at uc|skyatucsc|transgender|tsu\b|rotc\b|senate|parliament|student government|graduate student association|gsa\b|governance board|sugb\b|leadership|sol council|student union|sua\b|retention)\b/i,
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
