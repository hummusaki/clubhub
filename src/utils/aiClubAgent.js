// ── ClubHub Hybrid AI Search, Intent Parser & Grounded RAG Engine ──────────
// Combines natural-language intent & negation/constraint parsing, BM25 lexical
// scoring, 20-domain UCSC semantic concept matching, upcoming-event grounding,
// multi-turn conversational refinement, and grounded AI Overview synthesis.

export const SAMPLE_INTEREST_PROMPTS = [
<<<<<<< Updated upstream
  {
    label: '💻 CS + Creative Balance',
    query: "I'm into coding and hackathons, plus something creative like design or film",
  },
  {
    label: '🌱 Beginner-Friendly Social',
    query: 'Beginner friendly clubs open to all levels where I can meet people, no Greek life',
  },
  {
    label: '🤖 Robotics, Physics & Space',
    query: 'Hands-on robotics, engineering, physics, or quantum computing projects',
  },
  {
    label: '🩺 Pre-Med & Neuroscience',
    query: 'Pre-med clinical experience, emergency medicine, or neuroscience research',
  },
  {
    label: '🗣️ Law, Mock Trial & Policy',
    query: 'Public speaking, mock trial, Model UN, or pre-law debate tournaments',
  },
  {
    label: '🎵 Music, A Cappella & Dance',
    query: 'Singing harmonies, a cappella, hip hop, or ballroom dance performances',
  },
  {
    label: '📈 Finance & Consulting',
    query: 'Investing, stock portfolio management, economics, or business case competitions',
  },
  {
    label: '🌲 Outdoors, Chess & Games',
    query: 'Hiking redwoods, chess tournaments, tabletop RPGs, or casual esports',
  },
=======
  { label: 'Game Dev & Coding', query: 'game development coding hackathons' },
  { label: 'Hiking & Outdoors', query: 'hiking camping redwoods outdoor adventure nature environment' },
  { label: 'Art, Drawing & Zines', query: 'drawing painting zines visual art literary magazine' },
  { label: 'Debate & Public Speaking', query: 'debate public speaking rhetoric pre-law model un' },
  { label: 'Robotics & Hardware', query: 'robotics hardware arduino CAD 3D printing engineering' },
  { label: 'Singing & Vocal Music', query: 'singing vocal harmonies a cappella music performance' },
  { label: 'Investing & Economics', query: 'investing stocks finance economics business consulting' },
  { label: 'Film & Photography', query: 'photography 35mm analog camera film cinema media' },
>>>>>>> Stashed changes
]

const STOP_WORDS = new Set([
  'a', 'about', 'actually', 'after', 'all', 'also', 'am', 'an', 'and', 'any',
  'are', 'around', 'as', 'at', 'be', 'because', 'been', 'before', 'being',
  'between', 'both', 'but', 'by', 'can', 'club', 'clubs', 'could', 'did', 'do',
  'does', 'doing', 'down', 'during', 'each', 'either', 'else', 'even', 'find',
  'for', 'from', 'further', 'get', 'give', 'go', 'going', 'good', 'best', 'great',
  'group', 'groups', 'had', 'has', 'have', 'having', 'he', 'help', 'her', 'here',
  'hers', 'herself', 'him', 'himself', 'his', 'how', 'i', 'id', 'im', 'if', 'in',
  'into', 'is', 'it', 'its', 'itself', 'join', 'joining', 'just', 'kind', 'know',
  'like', 'likes', 'look', 'looking', 'love', 'loves', 'make', 'maybe', 'me',
  'meet', 'more', 'most', 'much', 'my', 'myself', 'need', 'of', 'off', 'on',
  'once', 'one', 'ones', 'only', 'or', 'org', 'orgs', 'organization', 'organizations',
  'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'people',
  'place', 'please', 'plus', 'pretty', 'really', 'recommend', 'recommendations',
  'right', 'same', 'santa', 'cruz', 'see', 'she', 'should', 'show', 'slug', 'slugs',
  'so', 'some', 'something', 'anything', 'still', 'student', 'students', 'stuff',
  'such', 'suggest', 'super', 'tell', 'than', 'that', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'these', 'they', 'thing', 'things',
  'think', 'this', 'those', 'through', 'to', 'too', 'try', 'trying', 'ucsc',
  'under', 'until', 'up', 'us', 'very', 'want', 'wanted', 'wants', 'was', 'way',
  'we', 'well', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom',
  'why', 'with', 'would', 'year', 'you', 'your', 'yours', 'yourself', 'interested',
  'interesting', 'interests', 'interest', 'campus', 'society', 'association',
])

// Comprehensive UCSC Semantic Concept Domains
export const TOPIC_CLUSTERS = [
  {
    id: 'tech_coding',
<<<<<<< Updated upstream
    label: 'Coding, AI & Software',
    categories: ['tech & science'],
    targetClubIds: [
      'demo_ucsc_csclub',
      'gdgc_ucsc',
      'acmw.ucsc',
      'gdacollab',
      'cssa.ucsc',
      'ucscquantum',
      'ucscsase',
      'nsbe.ucsc',
=======
    label: 'Coding & Tech',
    targetClubIds: [
      'acm_ucsc',
      'gdgc_ucsc',
      'gdacollab',
      'sluggamingucsc',
      'slugsecurity',
      'slugdataatucsc',
      'sluglug_ucsc',
      'demo_ucsc_csclub',
>>>>>>> Stashed changes
    ],
    keywords: [
      'code', 'coding', 'programmer', 'programming', 'software', 'developer',
      'developers', 'dev', 'computer science', 'computing', 'cs', 'python',
      'javascript', 'typescript', 'react', 'java', 'c++', 'algorithms',
      'systems', 'hackathon', 'hackathons', 'github', 'web dev', 'web development',
      'app development', 'open-source', 'open source', 'linux', 'ai',
      'artificial intelligence', 'machine learning', 'ml', 'cyber', 'cybersecurity',
      'frontend', 'backend', 'full stack', 'data science', 'tech',
    ],
    rationaleTemplate: terms =>
      `Strong technical fit for ${terms} with hands-on coding workshops, hackathons, and project teams.`,
  },
  {
<<<<<<< Updated upstream
    id: 'game_dev',
    label: 'Game Design & Dev',
    categories: ['tech & science', 'gaming'],
    targetClubIds: ['gdacollab', 'demo_ucsc_csclub', 'sluggamingucsc'],
    keywords: [
      'game dev', 'game development', 'game design', 'gamedev', 'unity', 'unreal',
      'indie games', 'indie game', 'level design', 'pixel art', '3d modeling',
      'game jam', 'game jams', 'making games', 'build games',
    ],
    rationaleTemplate: terms =>
      `Ideal for ${terms} — pairs programmers, artists, writers, and sound designers to ship original student games.`,
  },
  {
    id: 'robotics_physics',
    label: 'Robotics, Engineering & Physics',
    categories: ['tech & science'],
    targetClubIds: [
      'ucsc_robotics',
      'nsbe.ucsc',
      'ucscsase',
      'ucscsps',
      'acs_ucsc',
      'ucscquantum',
=======
    id: 'robotics_hardware',
    label: 'Robotics & Hardware',
    targetClubIds: [
      'ucscslugbotics',
      'slugworks_ucsc',
      'ieee.ucsc',
      'formulaslug',
      'rocketry.ucsc',
      'ucsc_robotics',
>>>>>>> Stashed changes
    ],
    keywords: [
      'robot', 'robots', 'robotics', 'hardware', 'maker', 'makers', 'cad',
      'arduino', 'raspberry pi', 'circuits', 'circuit', 'electrical', 'mechanical',
      '3d print', '3d printing', 'rover', 'combat robotics', 'embedded', 'firmware',
      'sensors', 'mechatronics', 'engineering', 'engineer', 'engineers', 'soldering',
      'physics', 'astronomy', 'astrophysics', 'space', 'quantum', 'quantum computing',
      'stem',
    ],
    rationaleTemplate: terms =>
      `Tailored for ${terms} through hands-on hardware builds, research discussions, and STEM community mentorship.`,
  },
  {
<<<<<<< Updated upstream
    id: 'premed_neuro',
    label: 'Pre-Med, Healthcare & Neuroscience',
    categories: ['pre-professional', 'tech & science'],
    targetClubIds: [
      'amsaucsc',
      'pap_ucsc',
      'emslugs_ucsc',
      'medlifeucsc',
      'ucsc_fom',
      'cmda_ucsc',
      'ucsc_slm',
      'uaem_ucsc',
      'ucsc.neuroclub',
      'cssa.ucsc',
    ],
    keywords: [
      'pre-med', 'premed', 'pre med', 'medical', 'medicine', 'doctor', 'physician',
      'healthcare', 'clinical', 'dental', 'dentistry', 'ems', 'emt', 'emergency medical',
      'first aid', 'biology', 'biotech', 'neuroscience', 'neuro', 'brain', 'psychology',
      'cognitive science', 'cogsci', 'nursing', 'pharmacy', 'public health', 'anatomy',
    ],
    rationaleTemplate: terms =>
      `Supports your path in ${terms} with clinical shadowing leads, MCAT/advising panels, and healthcare outreach.`,
  },
  {
    id: 'economics_finance',
    label: 'Economics, Finance & Business',
    categories: ['pre-professional'],
    targetClubIds: ['ucsc_econ_society', 'ucscbea', 'ucsc.sfig', 'ucsciba'],
=======
    id: 'outdoors_adventure',
    label: 'Outdoors & Adventure',
    targetClubIds: [
      'enviroslug',
      'ucsc_runningclub',
      'ucscfigure',
      'ucscsurf',
      'ucsc_sailing',
      'ucsc_outdoor',
    ],
    keywords: [
      'outdoor', 'outdoors', 'nature', 'hike', 'hiking', 'backpacking', 'backpack',
      'camp', 'camping', 'trail', 'trails', 'redwoods', 'forest', 'bouldering',
      'rock climbing', 'climbing', 'climb', 'kayak', 'kayaking', 'surf', 'surfing',
      'ocean', 'beach', 'adventure', 'travel', 'trip', 'trips', 'wilderness', 'gear',
      'environment', 'environmental', 'sustainability'
    ],
    rationaleTemplate: (terms) =>
      `Perfect match for ${terms} — offers outdoor excursions, redwood trail hikes, environmental stewardship, and active campus trips.`
  },
  {
    id: 'visual_arts',
    label: 'Visual Arts & Design',
    targetClubIds: [
      'chinquapinucsc',
      'matchboxucsc',
      'twacanasianucsc',
      'eyecandyfilmjournal',
      'demo_ucsc_artcollective',
    ],
    keywords: [
      'art', 'arts', 'visual art', 'draw', 'drawing', 'paint', 'painting',
      'sketch', 'sketching', 'zine', 'zines', 'printmaking', 'print', 'gallery',
      'design', 'graphic design', 'illustration', 'studio', 'craft', 'crafts',
      'creative', 'ceramics', 'digital art', 'exhibition', 'sculpture', 'literary', 'magazine'
    ],
    rationaleTemplate: (terms) =>
      `Matches your passion for ${terms} with open studio sessions, zine & print publications, and seasonal campus showcases.`
  },
  {
    id: 'debate_speaking',
    label: 'Debate & Public Speaking',
    targetClubIds: [
      'slugmun',
      'mocktrialucsc',
      'ucsc_pla',
      'demo_ucsc_debate',
    ],
    keywords: [
      'debate', 'debating', 'speech', 'speaking', 'public speaking', 'rhetoric',
      'parliamentary', 'law', 'pre-law', 'politics', 'policy', 'argument',
      'argumentation', 'discussion', 'discourse', 'rhetorical', 'moot court',
      'government', 'model un', 'communication', 'mun'
    ],
    rationaleTemplate: (terms) =>
      `Great fit for ${terms} — offers parliamentary debate & Model UN conferences, public rhetoric training, and policy analysis rounds.`
  },
  {
    id: 'music_vocal',
    label: 'Music & Vocal Performance',
    targetClubIds: [
      'acquireacappella',
      'cloud9acappella',
      'isanghimig',
      'thegoldentones_ucsc',
      'ucsc_acappella',
    ],
    keywords: [
      'music', 'sing', 'singing', 'singer', 'vocal', 'vocals', 'vocalist',
      'harmony', 'harmonies', 'a cappella', 'acappella', 'choir', 'band',
      'song', 'songs', 'concert', 'performance', 'quarry', 'rehearsal',
      'instrument', 'instruments', 'voice', 'musical', 'audio'
    ],
    rationaleTemplate: (terms) =>
      `Aligns with your passion for ${terms} — features student-arranged vocal harmonies, quarry amphitheater concerts, and regional gigs.`
  },
  {
    id: 'economics_finance',
    label: 'Economics & Finance',
    targetClubIds: [
      'ucsc.sfig',
      'ucscconsulting',
      'ucsc_bfa',
      'akpsi.ucsc',
      'ucsc_econ_society',
    ],
>>>>>>> Stashed changes
    keywords: [
      'econ', 'economics', 'finance', 'invest', 'investing', 'investment',
      'stock', 'stocks', 'markets', 'business', 'banking', 'investment banking',
      'wall street', 'consulting', 'consultant', 'case competition', 'macroeconomic',
      'microeconomic', 'startup', 'entrepreneurship', 'entrepreneur', 'portfolio',
      'financial', 'accounting', 'wealth', 'quant',
    ],
<<<<<<< Updated upstream
    rationaleTemplate: terms =>
      `Matches your interest in ${terms} via student-managed market analysis, career prep, and case competitions.`,
  },
  {
    id: 'debate_law',
    label: 'Debate, Law & Public Policy',
    categories: ['pre-professional', 'service & advocacy'],
    targetClubIds: ['demo_ucsc_debate', 'mocktrialatucsc', 'ucscslugmun'],
    keywords: [
      'debate', 'debating', 'speech', 'public speaking', 'rhetoric',
      'parliamentary', 'law', 'pre-law', 'prelaw', 'legal', 'attorney', 'mock trial',
      'courtroom', 'politics', 'political', 'policy', 'argumentation', 'discourse',
      'moot court', 'government', 'model un', 'mun', 'diplomacy', 'international relations',
    ],
    rationaleTemplate: terms =>
      `Sharpens your skills in ${terms} with tournament travel, courtroom/UN simulations, and persuasive speaking.`,
  },
  {
    id: 'visual_arts_lit',
    label: 'Visual Arts, Design & Zines',
    categories: ['media & arts'],
    targetClubIds: [
      'demo_ucsc_artcollective',
      'alay.ucsc',
      'chinquapinucsc',
      'gdacollab',
    ],
    keywords: [
      'art', 'arts', 'visual art', 'visual arts', 'draw', 'drawing', 'paint',
      'painting', 'sketch', 'sketching', 'zine', 'zines', 'printmaking',
      'gallery', 'graphic design', 'design', 'UI', 'UX', 'illustration', 'studio art',
      'crafts', 'crafting', 'creative', 'creative writing', 'literary', 'magazine',
      'journalism', 'poetry', 'ceramics', 'digital art', 'sculpture', 'animation',
      'anime', 'manga', 'book', 'reading',
    ],
    rationaleTemplate: terms =>
      `Great creative outlet for ${terms} — open studio nights, student publications, zine fairs, and showcases.`,
  },
  {
    id: 'film_photo',
    label: 'Film, TV & Photography',
    categories: ['media & arts'],
    targetClubIds: [
      'ucsc_film_photo',
      'filmproductioncoalition',
      'eyecandyfilmjournal',
      'shutterslugofficial',
      'sctv_media',
    ],
    keywords: [
      'film', 'filmmaking', 'filmmaker', 'photo', 'photography', 'photographer',
      'camera', '35mm', 'darkroom', 'analog', 'cinema', 'movie', 'movies',
      'screenplay', 'screenwriting', 'video production', 'video editing',
      'cinematography', 'director', 'directing', 'screening', 'shutter',
      'broadcast', 'television', 'tv',
    ],
    rationaleTemplate: terms =>
      `Hands-on match for ${terms} — crew student short films, join photo walks, or publish cinema criticism.`,
  },
  {
    id: 'music_vocal',
    label: 'Singing, A Cappella & Music',
    categories: ['performing arts'],
    targetClubIds: ['ucsc_acappella', 'acquireacappella', 'cloud9acappella'],
    keywords: [
      'music', 'musical', 'sing', 'singing', 'singer', 'vocal', 'vocals', 'vocalist',
      'harmony', 'harmonies', 'a cappella', 'acappella', 'acapella', 'choir',
      'band', 'orchestra', 'mariachi', 'song', 'songs', 'concert', 'rehearsal',
      'instrument', 'instruments', 'guitar', 'piano',
    ],
    rationaleTemplate: terms =>
      `Brings ${terms} to life through tight-knit rehearsals, student arrangements, and campus concerts.`,
  },
  {
    id: 'dance_theater',
    label: 'Dance, Comedy & Performing Arts',
    categories: ['performing arts'],
    targetClubIds: [
      'ucscdanceclub',
      'haluanhiphop',
      'kasama.ucsc',
      'pdt.ucsc',
      'comedyjoust',
    ],
    keywords: [
      'dance', 'dancing', 'dancer', 'choreography', 'hip hop', 'hip-hop',
      'ballroom', 'k-pop', 'kpop', 'folklorico', 'raas', 'line dancing',
      'improv', 'comedy', 'standup', 'theater', 'theatre', 'acting', 'stage',
      'spoken word', 'performance', 'performing',
    ],
    rationaleTemplate: terms =>
      `High-energy community for ${terms} featuring workshops, choreography sets, and campus stage shows.`,
  },
  {
    id: 'gaming_tabletop',
    label: 'Gaming, Chess & Tabletop',
    categories: ['gaming'],
    targetClubIds: [
      'sluggamingucsc',
      'ucscchessclub',
      '8thrankchess.ucsc',
      'ucsc.tga',
      'santacruzfc',
      'ucscsrge',
      'ucsc.quizbowl',
    ],
    keywords: [
      'gaming', 'esports', 'video games', 'gamer', 'chess', 'tabletop',
      'board games', 'board game', 'dnd', 'dungeons and dragons', 'rpg',
      'fighting game', 'fighting games', 'smash', 'street fighter', 'tekken',
      'rhythm game', 'rhythm games', 'valorant', 'league of legends', 'overwatch',
      'tcg', 'card games', 'yu-gi-oh', 'magic the gathering', 'quiz bowl', 'trivia',
    ],
    rationaleTemplate: terms =>
      `Welcoming hub for ${terms} with weekly casual play, LAN/tabletop nights, and tournament brackets.`,
  },
  {
    id: 'outdoors_sports',
    label: 'Outdoors, Hiking & Fitness',
    categories: ['gaming', 'community'],
    targetClubIds: ['ucsc_outdoor'],
    keywords: [
      'outdoor', 'outdoors', 'nature', 'hike', 'hiking', 'backpacking', 'backpack',
      'camping', 'trail', 'trails', 'redwoods', 'forest', 'bouldering',
      'rock climbing', 'climbing', 'climb', 'kayak', 'kayaking', 'surf', 'surfing',
      'ocean', 'beach', 'adventure', 'wilderness', 'running', 'run', 'skate',
      'skateboarding', 'fitness', 'sports', 'recreation',
    ],
    rationaleTemplate: terms =>
      `Gets you outside in Santa Cruz for ${terms} — redwood trails, coastal trips, and group adventures.`,
  },
  {
    id: 'sustainability_service',
    label: 'Sustainability, Volunteering & Advocacy',
    categories: ['service & advocacy'],
    targetClubIds: ['medlifeucsc', 'uaem_ucsc'],
    keywords: [
      'volunteer', 'volunteering', 'community service', 'service', 'philanthropy',
      'charity', 'nonprofit', 'outreach', 'sustainability', 'sustainable',
      'environment', 'environmental', 'climate', 'ecology', 'conservation',
      'garden', 'gardening', 'red cross', 'activism', 'advocacy', 'social justice',
      'human rights', 'harm reduction', 'wellness', 'mental health', 'leadership',
    ],
    rationaleTemplate: terms =>
      `Makes tangible campus and local impact around ${terms} through hands-on service projects and advocacy.`,
  },
  {
    id: 'cultural_identity',
    label: 'Cultural & Heritage Community',
    categories: ['cultural'],
    targetClubIds: ['cusn.ucsc'],
    keywords: [
      'cultural', 'culture', 'heritage', 'identity', 'international',
      'filipino', 'filipinx', 'pilipinx', 'bayanihan', 'latine', 'latinx',
      'latino', 'hispanic', 'chicanx', 'mexican', 'black', 'african', 'nigerian',
      'asian', 'apisa', 'pacific islander', 'indigenous', 'native american',
      'korean', 'japanese', 'chinese', 'taiwanese', 'vietnamese', 'indian',
      'south asian', 'desi', 'bangladeshi', 'khmer', 'cambodian', 'sikh',
      'slavic', 'arab', 'middle eastern', 'queer', 'lgbt', 'lgbtq', 'trans',
      'transgender', 'women', 'womens',
    ],
    rationaleTemplate: terms =>
      `Builds close cultural community, mentorship, and campus traditions celebrating ${terms}.`,
  },
  {
    id: 'faith_spiritual',
    label: 'Faith, Spiritual & Mindfulness',
    categories: ['faith'],
    targetClubIds: [],
    keywords: [
      'faith', 'spiritual', 'spirituality', 'religion', 'religious', 'christian',
      'catholic', 'jewish', 'hillel', 'muslim', 'islam', 'hindu', 'bhakti',
      'yoga', 'meditation', 'mindfulness', 'bible', 'fellowship', 'ministry', 'church',
    ],
    rationaleTemplate: terms =>
      `Welcoming fellowship and reflection space centered on ${terms}.`,
  },
  {
    id: 'greek_life',
    label: 'Greek Life & Fraternities/Sororities',
    categories: ['greek'],
    targetClubIds: [],
    keywords: [
      'greek', 'greek life', 'fraternity', 'fraternities', 'sorority', 'sororities',
      'panhellenic', 'rush', 'brotherhood', 'sisterhood', 'professional fraternity',
    ],
    rationaleTemplate: terms =>
      `Chapter community offering Greek life leadership, social events, and philanthropy.`,
=======
    rationaleTemplate: (terms) =>
      `Ideal for your interest in ${terms} — features investment workshops, finance roundtables, and real-world consulting case competitions.`
  },
  {
    id: 'film_photo',
    label: 'Film & Photography',
    targetClubIds: [
      'eyecandyfilmjournal',
      'fsc.ucsc',
      'chinquapinucsc',
      'ucsc_film_photo',
    ],
    keywords: [
      'film', 'filmmaking', 'photo', 'photography', 'camera', '35mm',
      'darkroom', 'analog', 'cinema', 'movie', 'movies', 'screenplay',
      'screenwriting', 'video', 'video editing', 'cinematography', 'screening',
      'visual storytelling', 'lens', 'shutter', 'media'
    ],
    rationaleTemplate: (terms) =>
      `Superb fit for ${terms} — gives you film screenings, cinema journalism, photography shoots, and creative media production.`
>>>>>>> Stashed changes
  },
]

const CATEGORY_NEGATION_TRIGGERS = [
  { category: 'greek', label: 'Greek Life', patterns: [/\bgreek(\s+life)?\b/i, /\bfraternit(y|ies)\b/i, /\bsororit(y|ies)\b/i, /\brush\b/i] },
  { category: 'faith', label: 'Faith Orgs', patterns: [/\breligio(us|n)\b/i, /\bfaith\b/i, /\bchurch\b/i] },
  { category: 'performing arts', label: 'Performing Arts', patterns: [/\bperforming\s+arts?\b/i, /\ba\s*cappella\b/i, /\bdanc(e|ing)\b/i] },
  { category: 'gaming', label: 'Gaming', patterns: [/\bgaming\b/i, /\besports\b/i, /\bvideo\s+games?\b/i] },
  { category: 'tech & science', label: 'Tech & Coding', patterns: [/\bcoding\b/i, /\bprogramming\b/i, /\bcomputer\s+science\b/i, /\btech\b/i] },
  { category: 'pre-professional', label: 'Pre-Professional', patterns: [/\bpre-?prof(essional)?\b/i, /\bfinance\b/i] },
]

const REGEX_CACHE = new Map()

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function containsWholeTerm(text, term) {
  if (!text || !term) return false
  let re = REGEX_CACHE.get(term)
  if (!re) {
    re = new RegExp(`(?:^|[^a-z0-9])${escapeRegex(term)}(?=[^a-z0-9]|$)`, 'i')
    REGEX_CACHE.set(term, re)
  }
  return re.test(text)
}

function containsWordStem(text, token) {
  if (!text || !token || token.length < 5) return false
  const stem = token.endsWith('ing') && token.length >= 8
    ? token.slice(0, -3)
    : token.endsWith('es') && token.length >= 7
      ? token.slice(0, -2)
      : token.endsWith('s') && token.length >= 6
        ? token.slice(0, -1)
        : token
  if (stem.length < 5) return false
  const cacheKey = `stem:${stem}`
  let re = REGEX_CACHE.get(cacheKey)
  if (!re) {
    re = new RegExp(`(?:^|[^a-z0-9])${escapeRegex(stem)}[a-z]{0,5}(?=[^a-z0-9]|$)`, 'i')
    REGEX_CACHE.set(cacheKey, re)
  }
  return re.test(text)
}

/**
 * Extract negated clauses (e.g. "no greek life", "not fraternities", "without coding",
 * "exclude clubs I already joined") and return positive text + exclusion rules.
 */
export function parseQueryIntent(rawQuery = '', options = {}) {
  const fullText = String(rawQuery || '').trim()
  const lower = fullText.toLowerCase()

  const excludedCategories = new Set()
  const excludedTerms = []
  const excludedLabels = []

  // Detect "not joined" / "unjoined" / "haven't joined" / "new clubs"
  const excludeJoined =
    /\b(not\s+joined|unjoined|haven'?t\s+joined|have\s+not\s+joined|exclude\s+joined|new\s+clubs\s+to\s+join|clubs\s+i'?m\s+not\s+in)\b/i.test(
      lower
    )

  // Extract negation clauses bounded by punctuation or conjunctions
  const negationClauseRe =
    /\b(?:no|not|without|except|avoid|avoiding|exclude|excluding|other\s+than|besides)\s+([^,.;!?]+?)(?=$|[,.;!?]|\b(?:and\s+i|but\s+i|also|plus|with)\b)/gi

  let positiveText = lower
  let match
  while ((match = negationClauseRe.exec(lower)) !== null) {
    const clause = match[1].trim()
    if (!clause) continue

    // Remove negated span from positive matching text so "no greek life" never boosts Greek life!
    positiveText = positiveText.replace(match[0], ' ')

    let matchedCategoryRule = false
    for (const rule of CATEGORY_NEGATION_TRIGGERS) {
      if (rule.patterns.some(p => p.test(clause))) {
        excludedCategories.add(rule.category)
        if (!excludedLabels.includes(rule.label)) {
          excludedLabels.push(rule.label)
        }
        matchedCategoryRule = true
      }
    }

    if (!matchedCategoryRule && !/joined/i.test(clause)) {
      const negWords = clause
        .replace(/[^a-z0-9+#\s-]/g, ' ')
        .split(/\s+/)
        .map(w => w.trim())
        .filter(w => w.length > 2 && !STOP_WORDS.has(w))
      for (const nw of negWords.slice(0, 3)) {
        excludedTerms.push(nw)
        excludedLabels.push(nw)
      }
    }
  }

  // Detect vibe, experience, size & schedule modifiers
  const prefersBeginner =
    /\b(beginner|beginners|beginner-friendly|no\s+experience|all\s+levels|open\s+to\s+all|casual|welcoming|friendly|freshman|first[\s-]year|make\s+friends|social|meet\s+people)\b/i.test(
      positiveText
    )
  const prefersCompetitive =
    /\b(competitive|tournament|tournaments|compete|competing|audition|varsity|travel\s+team|ranked)\b/i.test(
      positiveText
    )
  const prefersSmall =
    /\b(small|smaller|intimate|tight[\s-]knit|close[\s-]knit|cozy)\b/i.test(positiveText)
  const prefersLarge =
    /\b(big|large|biggest|popular|huge|most\s+active)\b/i.test(positiveText)
  const prefersUpcomingEvents =
    /\b(event|events|meeting|meetings|workshop|workshops|this\s+week|soon|upcoming|tonight|today|tomorrow|schedule|active\s+events)\b/i.test(
      positiveText
    )

  // Tokenize positive query
  const tokens = positiveText
    .replace(/['’‘`]/g, '')
    .replace(/[^a-z0-9+#\s-]/g, ' ')
    .split(/\s+/)
    .map(w => w.replace(/^-+|-+$/g, '').trim())
    .filter(w => w.length > 1 && !STOP_WORDS.has(w))

  // Optional soft major boost when user's profile has a major and query is broad/open
  const userMajor = String(options.userMajor || '').trim().toLowerCase()

  return {
    rawQuery: fullText,
    positiveText: positiveText.trim(),
    tokens,
    excludedCategories: Array.from(excludedCategories),
    excludedTerms: Array.from(new Set(excludedTerms)),
    excludedLabels: Array.from(new Set(excludedLabels)),
    excludeJoined,
    prefersBeginner,
    prefersCompetitive,
    prefersSmall,
    prefersLarge,
    prefersUpcomingEvents,
    userMajor,
  }
}

/**
 * Combine multi-turn conversation queries (e.g. Turn 1: "coding and creative clubs"
 * + Turn 2: "no greek life, only ones with upcoming events") into a unified intent.
 */
export function buildConversationalQuery(turns = []) {
  const cleanTurns = turns.map(t => String(t || '').trim()).filter(Boolean)
  if (cleanTurns.length === 0) return ''
  return cleanTurns.join('. ')
}

function truncateSnippet(text, maxLen = 148) {
  if (!text) return ''
  const singleLine = String(text).replace(/\s+/g, ' ').trim()
  if (singleLine.length <= maxLen) return singleLine
  return `${singleLine.slice(0, maxLen - 1).replace(/[,;:\s]+$/, '')}…`
}

/**
 * Index upcoming events by clubId & lowercase club name for O(1) lookup during ranking.
 */
function buildUpcomingEventsByClub(events = []) {
  const byId = new Map()
  const byName = new Map()
  for (const ev of events) {
    if (!ev) continue
    if (ev.clubId) {
      const k = String(ev.clubId)
      if (!byId.has(k)) byId.set(k, [])
      byId.get(k).push(ev)
    }
    if (ev.club) {
      const nk = String(ev.club).toLowerCase().trim()
      if (!byName.has(nk)) byName.set(nk, [])
      byName.get(nk).push(ev)
    }
  }
  return { byId, byName }
}

/**
 * Generate smart contextual follow-up chips based on current results & intent.
 */
function buildFollowUpSuggestions(intent, matches, matchedClusters, hasAnyUpcoming) {
  const chips = []

  if (!intent.prefersUpcomingEvents && hasAnyUpcoming) {
    chips.push({
      label: '📅 Only clubs with upcoming events',
      appendQuery: 'with upcoming events soon',
    })
  }
  if (!intent.prefersBeginner) {
    chips.push({
      label: '🌱 Beginner-friendly / open to all',
      appendQuery: 'beginner friendly open to all levels',
    })
  }
  if (!intent.excludeJoined && matches.some(m => m.club?.joined)) {
    chips.push({
      label: '✨ Exclude clubs I already joined',
      appendQuery: 'exclude joined clubs',
    })
  }
  if (!intent.prefersSmall && !intent.prefersLarge) {
    chips.push({
      label: '🤝 Tight-knit smaller clubs',
      appendQuery: 'smaller tight-knit clubs',
    })
  }
  if (
    matchedClusters.some(c => c.cluster.id === 'tech_coding' || c.cluster.id === 'robotics_physics') &&
    !matchedClusters.some(c => c.cluster.id === 'visual_arts_lit' || c.cluster.id === 'music_vocal')
  ) {
    chips.push({
      label: '🎨 Add a creative / arts balance',
      appendQuery: 'plus visual arts design or music',
    })
  }
  if (!intent.excludedCategories.includes('greek') && matches.some(m => m.club?.category === 'greek')) {
    chips.push({
      label: '🚫 Exclude Greek life',
      appendQuery: 'no Greek life',
    })
  }

  return chips.slice(0, 4)
}

/**
 * Synthesize a natural, grounded "AI Overview" advisor response explaining the
 * top matches, multi-faceted combinations, upcoming events, and active filters.
 */
function synthesizeGroundedOverview({
  intent,
  matches,
  matchedClusters,
  relatedEvents,
}) {
  if (matches.length === 0) {
    const filterNote =
      intent.excludedLabels.length > 0
        ? ` (while excluding ${intent.excludedLabels.join(', ')})`
        : ''
    return `I couldn't find exact UCSC clubs matching "${intent.rawQuery}"${filterNote}. Try broadening your interests — for example, ask about coding, robotics, pre-med, mock trial, visual arts, film, a cappella, or outdoor adventures.`
  }

  const topClubs = matches.slice(0, 3).map(m => m.club.name)
  const clusterLabels = matchedClusters.slice(0, 3).map(c => c.cluster.label)

  const lead =
    clusterLabels.length >= 2
      ? `Blending your interests across ${clusterLabels.slice(0, -1).join(', ')} and ${clusterLabels[clusterLabels.length - 1]}, your strongest UCSC matches are ${topClubs.join(', ')}.`
      : clusterLabels.length === 1
        ? `For ${clusterLabels[0]}, top UCSC communities include ${topClubs.join(', ')}.`
        : `Based on what you're looking for, top campus matches include ${topClubs.join(', ')}.`

  const details = []
  const top1 = matches[0]
  if (top1?.nextEvent) {
    details.push(
      `${top1.club.name} has "${top1.nextEvent.event || top1.nextEvent.title}" coming up on ${top1.nextEvent.day || ''} ${top1.nextEvent.date || ''}${top1.nextEvent.time ? ` at ${top1.nextEvent.time}` : ''}.`.replace(
        /\s+/g,
        ' '
      )
    )
  } else if (relatedEvents.length > 0) {
    const ev = relatedEvents[0]
    details.push(
      `Upcoming related event: ${ev.club} is hosting "${ev.event || ev.title}" (${ev.day || ''} ${ev.date || ''}).`.replace(
        /\s+/g,
        ' '
      )
    )
  }

  const appliedConstraints = []
  if (intent.prefersBeginner) appliedConstraints.push('prioritized welcoming/all-level orgs')
  if (intent.prefersUpcomingEvents) appliedConstraints.push('boosted clubs with upcoming events')
  if (intent.prefersSmall) appliedConstraints.push('favored smaller tight-knit groups')
  if (intent.prefersLarge) appliedConstraints.push('favored large active communities')
  if (intent.excludeJoined) appliedConstraints.push('hidden clubs you already joined')
  if (intent.excludedLabels.length > 0) {
    appliedConstraints.push(`excluded ${intent.excludedLabels.join(', ')}`)
  }

  if (appliedConstraints.length > 0) {
    details.push(`I also ${appliedConstraints.join(' and ')}.`)
  }

  return [lead, ...details].join(' ')
}

/**
 * Primary Hybrid AI Search & Club Recommendation Engine.
 * Works instantaneously in-browser and also serves as the RAG retrieval stage
 * for Gemini 4 structured synthesis.
 */
export function recommendClubsForInterests(
  clubs = [],
  query = '',
  optionsOrMaxResults = {}
) {
  const opts =
    typeof optionsOrMaxResults === 'number'
      ? { maxResults: optionsOrMaxResults }
      : optionsOrMaxResults || {}
  const maxResults = opts.maxResults ?? 8
  const upcomingEvents = Array.isArray(opts.events) ? opts.events : []
  const userMajor = opts.userMajor || ''

  const cleanQ = String(query || '').trim()
  if (!cleanQ) {
    return {
      query: '',
      hasQuery: false,
      hasMatches: false,
      matches: [],
      relatedEvents: [],
      matchedClusters: [],
      interpretedIntents: [],
      followUpSuggestions: [],
      aiOverview: '',
      summary: 'Ask anything about campus clubs, hobbies, majors, or upcoming meetings',
      mode: 'hybrid-rag',
    }
  }

  const intent = parseQueryIntent(cleanQ, { userMajor })
  const { byId: eventsById, byName: eventsByName } = buildUpcomingEventsByClub(upcomingEvents)

  // Check if user only entered constraints/modifiers (e.g., "beginner friendly clubs with events soon")
  const hasModifierOnlyQuery =
    intent.tokens.length === 0 &&
    (intent.prefersBeginner ||
      intent.prefersUpcomingEvents ||
      intent.prefersSmall ||
      intent.prefersLarge ||
      intent.excludedCategories.length > 0)

  if (intent.tokens.length === 0 && !hasModifierOnlyQuery) {
    return {
      query: cleanQ,
      hasQuery: true,
      hasMatches: false,
      matches: [],
      relatedEvents: [],
      matchedClusters: [],
      interpretedIntents: [],
      followUpSuggestions: [],
      aiOverview:
        'Tell me a bit more about your interests, major, or the kind of people you want to meet — for example, "beginner coding and design clubs" or "hiking, photography, or music".',
      summary: 'Please enter a few keywords describing your interests or goals',
      mode: 'hybrid-rag',
    }
  }

  // 1. Identify matched semantic clusters on positive text (never on negated clauses!)
  const matchedClusters = []
  for (const cluster of TOPIC_CLUSTERS) {
    if (cluster.categories.every(cat => intent.excludedCategories.includes(cat))) {
      continue
    }
    const hits = []
    for (const kw of cluster.keywords) {
      if (containsWholeTerm(intent.positiveText, kw)) {
        hits.push(kw)
      } else {
        for (const token of intent.tokens) {
          if (token.length >= 5 && containsWordStem(kw, token)) {
            hits.push(token)
            break
          }
        }
      }
    }
    if (hits.length > 0) {
      matchedClusters.push({
        cluster,
        hits: Array.from(new Set(hits)),
        weight: hits.length,
      })
    }
  }

  // Compute IDF-like document frequencies for BM25 lexical weighting across club corpus
  const docCount = Math.max(1, clubs.length)
  const tokenDocFreq = new Map()
  for (const token of intent.tokens) {
    let df = 0
    for (const c of clubs) {
      const blob = `${c.name || ''} ${c.description || ''} ${c.directoryDescription || ''} ${c.categoryLabel || ''}`.toLowerCase()
      if (containsWholeTerm(blob, token) || containsWordStem(blob, token)) df++
    }
    tokenDocFreq.set(token, df)
  }

  // 2. Score every club with BM25 lexical + Concept Cluster + Constraint/Vibe satisfaction
  const scoredClubs = []

  for (const club of clubs) {
    if (!club) continue

    // Hard exclusions from natural-language negation
    if (intent.excludeJoined && club.joined) continue
    const catLower = String(club.category || '').toLowerCase()
    if (intent.excludedCategories.includes(catLower)) continue

    const clubName = String(club.name || '').toLowerCase()
    const clubAliases = Array.isArray(club.alsoKnownAs)
      ? club.alsoKnownAs.join(' ').toLowerCase()
      : ''
    const rawClubSummary = club.directoryDescription || club.description || club.bio || ''
    const clubDesc = `${club.description || ''} ${club.directoryDescription || ''} ${club.bio || ''}`.toLowerCase()
    const clubCat = `${club.category || ''} ${club.categoryLabel || ''}`.toLowerCase()

    // Check explicit negated keywords
    if (
      intent.excludedTerms.some(
        neg => containsWholeTerm(clubName, neg) || containsWholeTerm(clubCat, neg)
      )
    ) {
      continue
    }

    const clubEvents =
      eventsById.get(String(club.id)) || eventsByName.get(clubName.trim()) || []
    const nextEvent = clubEvents[0] || null
    const eventsText = clubEvents
      .slice(0, 3)
      .map(e => `${e.event || e.title || ''} ${e.location || ''}`)
      .join(' ')
      .toLowerCase()

    const semanticTags = (club.tags || [])
      .map(t => (t?.label || '').toLowerCase())
      .filter(lbl => lbl && !lbl.startsWith('@'))

    let score = 0
    const matchedReasons = []
    const matchedTermsSet = new Set()

    // A. Lexical BM25-weighted token scoring across Name, Aliases, Tags, Bio/Directory & Upcoming Events
    for (const token of intent.tokens) {
      const df = tokenDocFreq.get(token) || 0
      const idfBoost = df > 0 ? Math.min(1.45, Math.max(0.85, Math.log((docCount + 1) / (df + 0.5)) / 2.2)) : 1

      if (containsWholeTerm(clubName, token) || containsWordStem(clubName, token)) {
        score += Math.round(38 * idfBoost)
        matchedTermsSet.add(token)
      } else if (clubAliases && containsWholeTerm(clubAliases, token)) {
        score += Math.round(32 * idfBoost)
        matchedTermsSet.add(token)
      }

      for (const tag of semanticTags) {
        if (containsWholeTerm(tag, token) || containsWordStem(tag, token)) {
          score += 20
          matchedTermsSet.add(tag)
        }
      }

      if (containsWholeTerm(clubDesc, token) || containsWordStem(clubDesc, token)) {
        score += Math.round(20 * idfBoost)
        matchedTermsSet.add(token)
      }

      if (eventsText && (containsWholeTerm(eventsText, token) || containsWordStem(eventsText, token))) {
        score += 18
        matchedTermsSet.add(token)
      }

      if (containsWholeTerm(clubCat, token)) {
        score += 14
        matchedTermsSet.add(token)
      }
    }

    // B. Concept Cluster Overlap
    for (const { cluster, hits } of matchedClusters) {
      const isTarget = cluster.targetClubIds.includes(club.id)
      if (isTarget) {
        score += 38 + Math.min(24, hits.length * 8)
        hits.forEach(h => matchedTermsSet.add(h))
        matchedReasons.push({ cluster, hits })
      } else {
        let nameClusterHits = 0
        let descClusterHits = 0
        for (const kw of cluster.keywords) {
          if (containsWholeTerm(clubName, kw)) {
            nameClusterHits++
            matchedTermsSet.add(kw)
          } else if (containsWholeTerm(clubDesc, kw)) {
            descClusterHits++
            matchedTermsSet.add(kw)
          }
        }
        const sameCategoryBonus =
          cluster.categories.includes(catLower) && (nameClusterHits > 0 || descClusterHits > 0)
            ? 8
            : 0
        if (nameClusterHits > 0 || descClusterHits > 0) {
          const clusterBonus = Math.min(
            34,
            nameClusterHits * 18 + descClusterHits * 8 + sameCategoryBonus
          )
          score += clusterBonus
          if (clusterBonus >= 16) {
            matchedReasons.push({ cluster, hits })
          }
        }
      }
    }

    // C. Vibe, Experience, Size & Schedule Modifier Scoring
    const isWelcomingText =
      /\b(all\s+levels|open\s+to\s+all|everyone|inclusive|beginners?|no\s+experience|anyone\s+interested|welcoming)\b/i.test(
        clubDesc
      )

    if (hasModifierOnlyQuery) {
      score += 26
    }

    if (intent.prefersBeginner) {
      if (isWelcomingText) {
        score += 16
        matchedTermsSet.add('open to all')
      } else if (score > 0 || hasModifierOnlyQuery) {
        score += 5
      }
    }

    if (intent.prefersCompetitive) {
      if (/\b(tournament|competitive|competition|team|trial|championship|audition)\b/i.test(clubDesc)) {
        score += 15
        matchedTermsSet.add('competitive')
      }
    }

    if (intent.prefersUpcomingEvents) {
      if (nextEvent) {
        score += 22
        matchedTermsSet.add('upcoming event')
      } else if (!hasModifierOnlyQuery) {
        score = Math.max(0, score - 8)
      } else {
        continue
      }
    } else if (score >= 24 && nextEvent) {
      // Subtle freshness tie-breaker when a matched club has live events scheduled
      score += 4
    }

    const memberCount = Number(club.members || 0)
    if (intent.prefersSmall && (score > 0 || hasModifierOnlyQuery)) {
      if (memberCount > 0 && memberCount <= 180) {
        score += 12
        matchedTermsSet.add('tight-knit')
      }
    } else if (intent.prefersLarge && (score > 0 || hasModifierOnlyQuery)) {
      if (memberCount >= 300) {
        score += 12
        matchedTermsSet.add('large community')
      }
    }

    // Mild penalty if negated term appears in club description
    if (intent.excludedTerms.some(neg => containsWholeTerm(clubDesc, neg))) {
      score -= 22
    }

    const finalScore = Math.min(99, Math.max(0, Math.round(score)))
    if (finalScore < 24) continue

    const matchedTerms = Array.from(matchedTermsSet).slice(0, 4)

    // Personalized grounded rationale
    const cleanSummary = truncateSnippet(rawClubSummary, 140)
    let aiRationale = ''
    if (matchedReasons.length > 0) {
      const bestReason = matchedReasons[0]
      const termsStr = bestReason.hits.slice(0, 3).join(', ')
      aiRationale = cleanSummary
        ? `Strong fit for ${termsStr} — ${cleanSummary}`
        : bestReason.cluster.rationaleTemplate(termsStr)
    } else if (matchedTerms.length > 0) {
      aiRationale = cleanSummary
        ? `Matches ${matchedTerms.slice(0, 3).join(', ')} — ${cleanSummary}`
        : `Recommended for your interest in ${matchedTerms.join(', ')}.`
    } else {
      aiRationale = cleanSummary || 'Active UCSC student organization matching your criteria.'
    }

    scoredClubs.push({
      club,
      matchScore: finalScore,
      matchLabel: finalScore >= 86 ? 'Best Fit' : finalScore >= 68 ? 'Strong Match' : 'Good Match',
      matchedTerms,
      aiRationale,
      nextEvent,
      matchTier: finalScore >= 80 ? 'top' : finalScore >= 55 ? 'strong' : 'good',
    })
  }

  // 3. Sort descending by matchScore, then upcoming event presence, then members
  const matches = scoredClubs
    .sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore
      const aEv = a.nextEvent ? 1 : 0
      const bEv = b.nextEvent ? 1 : 0
      if (bEv !== aEv) return bEv - aEv
      return (b.club.members || 0) - (a.club.members || 0)
    })
    .slice(0, maxResults)

  // 4. Collect top related upcoming events from matched clubs (or query-matched events)
  const matchedClubIds = new Set(matches.map(m => String(m.club.id)))
  const relatedEvents = upcomingEvents
    .filter(ev => {
      if (ev.clubId && matchedClubIds.has(String(ev.clubId))) return true
      const evBlob = `${ev.event || ev.title || ''} ${ev.club || ''} ${ev.location || ''}`.toLowerCase()
      return intent.tokens.some(t => t.length >= 3 && containsWholeTerm(evBlob, t))
    })
    .slice(0, 4)

  // 5. Build structured interpreted intent badges for UI transparency
  const interpretedIntents = []
  for (const mc of matchedClusters.slice(0, 3)) {
    interpretedIntents.push({ label: mc.cluster.label, kind: 'topic' })
  }
  if (intent.prefersBeginner) {
    interpretedIntents.push({ label: 'Beginner-Friendly', kind: 'modifier' })
  }
  if (intent.prefersCompetitive) {
    interpretedIntents.push({ label: 'Competitive', kind: 'modifier' })
  }
  if (intent.prefersUpcomingEvents) {
    interpretedIntents.push({ label: 'Has Upcoming Events', kind: 'modifier' })
  }
  if (intent.prefersSmall) {
    interpretedIntents.push({ label: 'Smaller / Tight-Knit', kind: 'modifier' })
  }
  if (intent.prefersLarge) {
    interpretedIntents.push({ label: 'Large Community', kind: 'modifier' })
  }
  if (intent.excludeJoined) {
    interpretedIntents.push({ label: 'Not Joined Yet', kind: 'exclusion' })
  }
  for (const ex of intent.excludedLabels) {
    interpretedIntents.push({ label: `No ${ex}`, kind: 'exclusion' })
  }

  const hasAnyUpcoming = upcomingEvents.length > 0
  const followUpSuggestions = buildFollowUpSuggestions(
    intent,
    matches,
    matchedClusters,
    hasAnyUpcoming
  )

  const aiOverview = synthesizeGroundedOverview({
    intent,
    matches,
    matchedClusters,
    relatedEvents,
  })

  const summary =
    matches.length > 0
      ? `Found ${matches.length} personalized ${matches.length === 1 ? 'match' : 'matches'}`
      : `No exact matches for "${cleanQ}"`

  return {
    query: cleanQ,
    hasQuery: true,
    hasMatches: matches.length > 0,
    matches,
    relatedEvents,
    matchedClusters,
    interpretedIntents,
    followUpSuggestions,
    aiOverview,
    summary,
    intent,
    mode: 'hybrid-rag',
  }
}
