// ── AI Club Recommendation Agent ───────────────────────────────────────────
// Intelligent client-side NLP matchmaker that understands natural language
// student interests, goals, and hobbies to recommend campus clubs with match
// scores and personalized rationale.

export const SAMPLE_INTEREST_PROMPTS = [
  { label: '🎮 Game Dev & Coding', query: 'game development coding hackathons' },
  { label: '🌲 Hiking & Outdoors', query: 'hiking camping redwoods outdoor adventure' },
  { label: '🎨 Art, Drawing & Zines', query: 'drawing painting zines visual art' },
  { label: '🗣️ Debate & Public Speaking', query: 'debate public speaking rhetoric pre-law' },
  { label: '🤖 Robotics & Hardware', query: 'robotics hardware arduino CAD 3D printing' },
  { label: '🎵 Singing & Vocal Music', query: 'singing vocal harmonies a cappella music' },
  { label: '📈 Investing & Economics', query: 'investing stocks finance economics' },
  { label: '📸 Film & Photography', query: 'photography 35mm analog camera film cinema' },
]

const STOP_WORDS = new Set([
  'a', 'about', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at', 'be',
  'because', 'been', 'before', 'being', 'between', 'both', 'but', 'by',
  'can', 'club', 'clubs', 'could', 'did', 'do', 'does', 'doing', 'down',
  'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have',
  'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his',
  'how', 'i', 'im', 'i\'m', 'if', 'in', 'into', 'is', 'it', 'its', 'itself',
  'join', 'just', 'like', 'likes', 'look', 'looking', 'love', 'me', 'more',
  'most', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once',
  'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over',
  'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that',
  'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these',
  'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up',
  'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while',
  'who', 'whom', 'why', 'with', 'would', 'you', 'your', 'yours', 'yourself',
  'yourselves', 'want', 'wants', 'wanted', 'really', 'recommend', 'interested',
  'interesting', 'interests', 'interest', 'something', 'anything', 'good', 'best'
])

// Thematic Semantic Topic Clusters
const TOPIC_CLUSTERS = [
  {
    id: 'tech_coding',
    label: 'Coding & Tech',
    targetClubIds: ['demo_ucsc_csclub', 'ucsc_robotics'],
    keywords: [
      'code', 'coding', 'programmer', 'programming', 'software', 'developer',
      'dev', 'computer', 'cs', 'python', 'javascript', 'react', 'java', 'c++',
      'algorithms', 'systems', 'hackathon', 'hackathons', 'github', 'git',
      'web', 'app', 'apps', 'open-source', 'linux', 'ai', 'artificial intelligence',
      'machine learning', 'ml', 'cyber', 'cybersecurity', 'frontend', 'backend',
      'game', 'games', 'gaming', 'game dev', 'unity', 'unreal', 'data'
    ],
    rationaleTemplate: (terms) =>
      `Directly aligns with your interest in ${terms} through weekly hackathons, systems talks, and collaborative open-source sprints.`
  },
  {
    id: 'robotics_hardware',
    label: 'Robotics & Hardware',
    targetClubIds: ['ucsc_robotics', 'demo_ucsc_csclub'],
    keywords: [
      'robot', 'robots', 'robotics', 'hardware', 'maker', 'makers', 'cad',
      'arduino', 'raspberry pi', 'circuits', 'circuit', 'electrical', 'mechanical',
      '3d print', '3d printing', 'rover', 'combat robotics', 'embedded', 'firmware',
      'sensors', 'mechatronics', 'engineering', 'build', 'soldering'
    ],
    rationaleTemplate: (terms) =>
      `Tailored for your interest in ${terms} — build autonomous rovers, design in CAD workshops, and work hands-on with embedded firmware.`
  },
  {
    id: 'outdoors_adventure',
    label: 'Outdoors & Adventure',
    targetClubIds: ['ucsc_outdoor'],
    keywords: [
      'outdoor', 'outdoors', 'nature', 'hike', 'hiking', 'backpacking', 'backpack',
      'camp', 'camping', 'trail', 'trails', 'redwoods', 'forest', 'bouldering',
      'rock climbing', 'climbing', 'climb', 'kayak', 'kayaking', 'surf', 'surfing',
      'ocean', 'beach', 'adventure', 'travel', 'trip', 'trips', 'wilderness', 'gear'
    ],
    rationaleTemplate: (terms) =>
      `Perfect match for ${terms} — offers weekend backpacking trips, redwood trail hikes, kayak excursions, and community gear shares.`
  },
  {
    id: 'visual_arts',
    label: 'Visual Arts & Design',
    targetClubIds: ['demo_ucsc_artcollective', 'ucsc_film_photo'],
    keywords: [
      'art', 'arts', 'visual art', 'draw', 'drawing', 'paint', 'painting',
      'sketch', 'sketching', 'zine', 'zines', 'printmaking', 'print', 'gallery',
      'design', 'graphic design', 'illustration', 'studio', 'craft', 'crafts',
      'creative', 'ceramics', 'digital art', 'exhibition', 'sculpture'
    ],
    rationaleTemplate: (terms) =>
      `Matches your passion for ${terms} with open studio sessions, printmaking workshops, zine fairs, and seasonal campus gallery shows.`
  },
  {
    id: 'debate_speaking',
    label: 'Debate & Public Speaking',
    targetClubIds: ['demo_ucsc_debate'],
    keywords: [
      'debate', 'debating', 'speech', 'speaking', 'public speaking', 'rhetoric',
      'parliamentary', 'law', 'pre-law', 'politics', 'policy', 'argument',
      'argumentation', 'discussion', 'discourse', 'rhetorical', 'moot court',
      'government', 'model un', 'communication', 'rhetoric'
    ],
    rationaleTemplate: (terms) =>
      `Great fit for ${terms} — offers parliamentary debate tournaments, public rhetoric training, and policy analysis rounds.`
  },
  {
    id: 'music_vocal',
    label: 'Music & Vocal Performance',
    targetClubIds: ['ucsc_acappella'],
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
    targetClubIds: ['ucsc_econ_society'],
    keywords: [
      'econ', 'economics', 'finance', 'invest', 'investing', 'investment',
      'stock', 'stocks', 'market', 'markets', 'business', 'money', 'banking',
      'wall street', 'consulting', 'consultant', 'case competition',
      'macroeconomic', 'microeconomic', 'startup', 'portfolio', 'financial'
    ],
    rationaleTemplate: (terms) =>
      `Ideal for your interest in ${terms} — features macroeconomic roundtables, student research symposiums, and real-world case competitions.`
  },
  {
    id: 'film_photo',
    label: 'Film & Photography',
    targetClubIds: ['ucsc_film_photo', 'demo_ucsc_artcollective'],
    keywords: [
      'film', 'filmmaking', 'photo', 'photography', 'camera', '35mm',
      'darkroom', 'analog', 'cinema', 'movie', 'movies', 'screenplay',
      'screenwriting', 'video', 'video editing', 'cinematography', 'screening',
      'visual storytelling', 'lens', 'shutter'
    ],
    rationaleTemplate: (terms) =>
      `Superb fit for ${terms} — gives you analog darkroom access, 35mm film shoots, short-film screenings, and camera gear lending.`
  },
]

/**
 * Tokenize a user interest query into clean search tokens.
 */
function tokenizeQuery(rawQuery) {
  if (!rawQuery || typeof rawQuery !== 'string') return []
  return rawQuery
    .toLowerCase()
    .replace(/[^a-z0-9+#\s-]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 1 && !STOP_WORDS.has(w))
}

/**
 * AI Club Recommendation Engine
 * Analyzes natural language input against all available campus clubs.
 */
export function recommendClubsForInterests(clubs = [], query = '') {
  const cleanQ = (query || '').trim().toLowerCase()
  if (!cleanQ) {
    return {
      query: '',
      hasQuery: false,
      hasMatches: false,
      matches: [],
      matchedClusters: [],
      summary: 'Type what you enjoy to get personalized club matches',
    }
  }

  const tokens = tokenizeQuery(cleanQ)
  if (tokens.length === 0) {
    return {
      query: cleanQ,
      hasQuery: true,
      hasMatches: false,
      matches: [],
      matchedClusters: [],
      summary: 'Please enter a few keywords describing your interests or hobbies',
    }
  }

  // 1. Identify matched semantic clusters
  const matchedClusters = []
  for (const cluster of TOPIC_CLUSTERS) {
    const hits = []
    for (const kw of cluster.keywords) {
      if (cleanQ.includes(kw)) {
        hits.push(kw)
      } else {
        for (const token of tokens) {
          if (kw.includes(token) || token.includes(kw)) {
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

  // 2. Score every club in the pool
  const scoredClubs = clubs.map(club => {
    let score = 0
    const matchedReasons = []
    const matchedTermsSet = new Set()

    const clubName = (club.name || '').toLowerCase()
    const clubDesc = (club.description || '').toLowerCase()
    const clubCat = (club.category || club.categoryLabel || '').toLowerCase()
    const clubTags = (club.tags || []).map(t => (t.label || '').toLowerCase())

    // Score direct query tokens against club properties
    for (const token of tokens) {
      if (clubName.includes(token)) {
        score += 34
        matchedTermsSet.add(token)
      }
      for (const tag of clubTags) {
        if (tag.includes(token) || token.includes(tag)) {
          score += 26
          matchedTermsSet.add(tag)
        }
      }
      if (clubDesc.includes(token)) {
        score += 18
        matchedTermsSet.add(token)
      }
      if (clubCat.includes(token)) {
        score += 14
        matchedTermsSet.add(clubCat)
      }
    }

    // Score cluster overlaps
    for (const { cluster, hits } of matchedClusters) {
      const isTarget = cluster.targetClubIds.includes(club.id)
      if (isTarget) {
        score += 35 + hits.length * 8
        hits.forEach(h => matchedTermsSet.add(h))
        matchedReasons.push({ cluster, hits })
      } else {
        // Partial category or description match with the cluster
        let clusterHitsInClub = 0
        for (const kw of cluster.keywords) {
          if (clubName.includes(kw) || clubDesc.includes(kw) || clubTags.some(t => t.includes(kw))) {
            clusterHitsInClub++
            matchedTermsSet.add(kw)
          }
        }
        if (clusterHitsInClub > 0) {
          score += Math.min(30, clusterHitsInClub * 10)
        }
      }
    }

    // Cap score at 99
    const finalScore = Math.min(99, Math.max(0, Math.round(score)))
    const matchedTerms = Array.from(matchedTermsSet).slice(0, 4)

    // Build intelligent AI rationale
    let aiRationale = ''
    if (matchedReasons.length > 0) {
      const bestReason = matchedReasons[0]
      const termsStr = bestReason.hits.slice(0, 3).join(', ')
      aiRationale = bestReason.cluster.rationaleTemplate(termsStr)
    } else if (matchedTerms.length > 0) {
      aiRationale = `Recommended based on your interest in ${matchedTerms.join(', ')} — matching ${club.name}'s campus activities and schedule.`
    } else {
      aiRationale = `Discovered for you based on related campus community activities.`
    }

    return {
      club,
      matchScore: finalScore,
      matchedTerms,
      aiRationale,
      matchTier: finalScore >= 80 ? 'top' : finalScore >= 55 ? 'strong' : 'good',
    }
  })

  // 3. Filter to clubs with significant match score and sort descending
  const matches = scoredClubs
    .filter(item => item.matchScore >= 20)
    .sort((a, b) => b.matchScore - a.matchScore)

  const summary = matches.length > 0
    ? `AI Agent found ${matches.length} matching ${matches.length === 1 ? 'club' : 'clubs'} for "${cleanQ}"`
    : `No close club matches found for "${cleanQ}". Try searching for coding, outdoors, arts, debate, or music!`

  return {
    query: cleanQ,
    hasQuery: true,
    hasMatches: matches.length > 0,
    matches,
    matchedClusters,
    summary,
  }
}
