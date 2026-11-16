// ── ClubHub Directory Builder ──
// Combines custom user-added entries, verified UCSC club officers from collector posts,
// dynamic structured board post extraction, signed-in user membership, and official club contacts.

import { cleanText } from '../components/ui'
import { categorizeClub, getClubCategoryMeta } from './clubCategories'

// Roster positions are hydrated strictly from official organization records and authenticated claims — zero hardcoded personal PII.
const VERIFIED_CAMPUS_OFFICERS = []

const DYNAMIC_ROLE_LINE_REGEX =
  /^\s*[✧⭐•\-–]*\s*(Co-Presidents?|President|Executive Vice President|Vice President|VP [A-Za-z &/]{2,26}|Treasurer|Secretary|Co-Chairs?|Editor-in-Chief|Social Chair|Rush Chair|Communications Chair|PR Executive)\s*:\s*([A-Z][A-Za-z'’-]+(?:\s+(?:["“][^"”]+["”]\s+)?[A-Z][A-Za-z'’-]+){0,3})\s*$/gm

export function toInitials(name) {
  return (
    String(name || 'MB')
      .replace(/["“][^"”]*["”]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .map(w => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'MB'
  )
}

function normalizeUnicodeFancyText(str) {
  if (!str || typeof str !== 'string') return ''
  return str.normalize('NFKD')
}

function findBoardAnnouncementUrl(hubClub) {
  if (!hubClub || !Array.isArray(hubClub.posts)) return null
  const match = hubClub.posts.find(p => {
    const txt = `${p.title || ''} ${p.caption || p.summary || ''}`
    return (
      p.permalink &&
      /(?:executive board|e-board|meet the board|meet our|introducing|cabinet|president|co-chair)/i.test(
        txt
      )
    )
  })
  return match?.permalink || null
}

/**
 * Builds unified, deduplicated Officers & Members lists enriched with club category metadata.
 */
export function buildClubDirectoryData({
  allClubs = [],
  hubDict = {},
  customRoster = { officers: [], members: [] },
  initialOfficers = [],
  initialMembers = [],
  user = null,
  userSettings = {},
  isDemo = false,
}) {
  const clubById = new Map()
  const clubByNameLower = new Map()

  for (const c of allClubs) {
    if (!c?.id) continue
    const idStr = String(c.id)
    clubById.set(idStr, c)
    if (c.name) {
      clubByNameLower.set(cleanText(c.name).toLowerCase(), c)
    }
  }

  const seenOfficerKeys = new Set()
  const officers = []

  function pushOfficer(raw, extra = {}) {
    const resolvedClub =
      (raw.clubId && clubById.get(String(raw.clubId))) ||
      (raw.club && clubByNameLower.get(cleanText(raw.club).toLowerCase())) ||
      null

    const clubId = resolvedClub ? String(resolvedClub.id) : raw.clubId ? String(raw.clubId) : ''
    const clubName = cleanText(resolvedClub?.name || raw.club || 'Campus Club')
    const cleanPersonName = cleanText(raw.name || '')
    if (!cleanPersonName) return

    const normalizedPersonKey = cleanPersonName
      .replace(/["“][^"”]*["”]\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
    const clubPrefix = clubId || clubName.toLowerCase()
    const dedupeKey = `${clubPrefix}::${normalizedPersonKey}`
    if (seenOfficerKeys.has(dedupeKey)) return

    // If single first name (e.g. "Analia") and we already have a full name starting with "Analia " in the same club, skip duplicate
    if (!normalizedPersonKey.includes(' ')) {
      let matchedFullName = false
      for (const existingKey of seenOfficerKeys) {
        if (existingKey.startsWith(`${clubPrefix}::${normalizedPersonKey} `)) {
          matchedFullName = true
          break
        }
      }
      if (matchedFullName) return
    }
    seenOfficerKeys.add(dedupeKey)

    const catId = resolvedClub?.category || categorizeClub(resolvedClub || { name: clubName })
    const catMeta = getClubCategoryMeta(catId)
    const email = (raw.email || resolvedClub?.email || '').trim()

    officers.push({
      id: raw.id || `off_${clubId}_${officers.length}`,
      name: cleanPersonName,
      initials: raw.initials || toInitials(cleanPersonName),
      role: cleanText(raw.role || 'Officer'),
      club: clubName,
      clubId,
      category: catId,
      categoryLabel: catMeta.shortLabel || catMeta.label,
      color: raw.color || catMeta.color || 'blue',
      major: raw.major ? cleanText(raw.major) : '',
      email,
      isBoardEmail:
        raw.isBoardEmail !== undefined
          ? Boolean(raw.isBoardEmail)
          : Boolean(!raw.email && resolvedClub?.email),
      office: raw.office ? cleanText(raw.office) : '',
      permalink: raw.permalink || extra.permalink || null,
      instagram: resolvedClub?.instagram || null,
      isCustom: Boolean(extra.isCustom || String(raw.id || '').startsWith('custom_')),
    })
  }

  // 1. User-created custom officers first
  for (const item of customRoster?.officers || []) {
    pushOfficer(item, { isCustom: true })
  }

  // 1b. Daily synced roster officers from `hubDict[cid].roster` (websites, Linktrees, Instagram board/spotlight posts)
  for (const [cid, hubClub] of Object.entries(hubDict || {})) {
    if (!Array.isArray(hubClub?.roster) || hubClub.roster.length === 0) continue
    const clubObj = clubById.get(String(cid))
    for (const r of hubClub.roster) {
      if (!r || r.personType === 'member') continue
      // Skip synthetic fallback contact rows here since Official Club Contacts are surfaced in their dedicated section
      if (String(r.id || '').endsWith('_official_contact')) continue
      const clubEmail = clubObj?.email || hubClub.email || ''
      pushOfficer(
        {
          id: r.id,
          clubId: String(cid),
          club: clubObj?.name || r.clubName || hubClub.name || cid,
          name: r.name,
          initials: r.initials,
          role: r.role,
          major: r.major || '',
          office: r.office || '',
          color: r.color,
          email: r.email || clubEmail,
          isBoardEmail: Boolean(!r.email || (clubEmail && r.email.toLowerCase() === clubEmail.toLowerCase())),
        },
        {
          permalink: r.sourceUrl || null,
          isCustom: String(r.id || '').startsWith('custom_'),
        }
      )
    }
  }

  // 2. Verified real UCSC campus club officers (when live/snapshot clubs are present)
  for (const item of VERIFIED_CAMPUS_OFFICERS) {
    const clubObj = clubById.get(item.clubId)
    if (!clubObj) continue
    const hubClub = hubDict?.[item.clubId]
    const permalink = findBoardAnnouncementUrl(hubClub)
    pushOfficer(
      {
        ...item,
        id: `verified_${item.clubId}_${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        club: clubObj.name,
        email: item.email || clubObj.email || '',
      },
      { permalink }
    )
  }

  // 3. Dynamic structured role lines from any new club posts (e.g., "President: Jane Doe")
  for (const [cid, hubClub] of Object.entries(hubDict || {})) {
    const clubObj = clubById.get(String(cid))
    if (!clubObj || !Array.isArray(hubClub?.posts)) continue
    for (const post of hubClub.posts.slice(0, 8)) {
      const text = normalizeUnicodeFancyText(post.caption || post.summary || '')
      if (!text || !text.includes(':')) continue
      DYNAMIC_ROLE_LINE_REGEX.lastIndex = 0
      let match
      while ((match = DYNAMIC_ROLE_LINE_REGEX.exec(text)) !== null) {
        const role = match[1]?.trim()
        const rawName = match[2]?.replace(/["“][^"”]+["”]\s*/g, '').trim()
        if (role && rawName && rawName.length >= 3 && rawName.length <= 36) {
          pushOfficer(
            {
              id: `post_off_${cid}_${rawName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
              clubId: String(cid),
              club: clubObj.name,
              name: rawName,
              role,
              email: clubObj.email || '',
              isBoardEmail: true,
            },
            { permalink: post.permalink || null }
          )
        }
      }
    }
  }

  // 4. Sample / discover officers (for clubs present in allClubs)
  for (const item of initialOfficers || []) {
    if (item.clubId && clubById.size > 0 && !clubById.has(String(item.clubId))) continue
    pushOfficer(item)
  }

  // ── Build Active Members List ──
  const members = []
  const seenMemberKeys = new Set()

  function enrichMemberClubTags(rawClubs = []) {
    return rawClubs
      .map(tag => {
        const resolved =
          (tag.clubId && clubById.get(String(tag.clubId))) ||
          (tag.label && clubByNameLower.get(cleanText(tag.label).toLowerCase())) ||
          null
        const cid = resolved ? String(resolved.id) : tag.clubId ? String(tag.clubId) : ''
        const catId = resolved?.category || categorizeClub(resolved || { name: tag.label })
        const catMeta = getClubCategoryMeta(catId)
        return {
          label: cleanText(resolved?.name || tag.label || 'Campus Club'),
          clubId: cid,
          category: catId,
          color: tag.color || catMeta.color || 'blue',
        }
      })
      .filter(t => Boolean(t.label))
  }

  // 1. Current user ("You") appears in Active Members whenever they have joined at least 1 club
  const joinedClubs = allClubs.filter(c => Boolean(c.joined))
  if (joinedClubs.length > 0) {
    const effectiveUser = isDemo ? null : user
    const youName =
      userSettings?.displayName?.trim() ||
      effectiveUser?.fullName ||
      effectiveUser?.primaryEmailAddress?.emailAddress?.split('@')[0] ||
      effectiveUser?.email?.split('@')[0] ||
      (isDemo ? 'Demo Guest' : 'Campus Student')
    const youEmail =
      effectiveUser?.primaryEmailAddress?.emailAddress ||
      effectiveUser?.email ||
      ''
    const youMajor = userSettings?.major?.trim() || (isDemo ? 'Exploring UCSC Clubs' : 'UCSC Member')
    const youAvatarBg =
      userSettings?.avatarBg ||
      effectiveUser?.avatarBg ||
      '#1A73E8'

    seenMemberKeys.add(youEmail.toLowerCase())
    members.push({
      id: 'member_self_you',
      name: youName,
      initials: toInitials(youName),
      email: youEmail,
      role: joinedClubs.length > 1 ? `Member · ${joinedClubs.length} Clubs` : 'Active Member',
      major: youMajor,
      avatarBg: youAvatarBg,
      clubs: enrichMemberClubTags(
        joinedClubs.map(c => ({
          label: c.name,
          clubId: String(c.id),
        }))
      ),
      joined: 'Current',
      isYou: true,
      isCustom: false,
    })
  }

  // 2. User-created custom members
  for (const m of customRoster?.members || []) {
    const key = (m.email || m.name || '').toLowerCase()
    if (key && seenMemberKeys.has(key)) continue
    if (key) seenMemberKeys.add(key)
    members.push({
      ...m,
      name: cleanText(m.name),
      initials: m.initials || toInitials(m.name),
      role: cleanText(m.role || 'Active Member'),
      major: m.major ? cleanText(m.major) : '',
      clubs: enrichMemberClubTags(m.clubs || []),
      isCustom: true,
      isYou: false,
    })
  }

  // 2b. Daily synced spotlighted/active members from `hubDict[cid].roster`
  const syncedMembersByFullName = new Map()
  for (const [cid, hubClub] of Object.entries(hubDict || {})) {
    if (!Array.isArray(hubClub?.roster) || hubClub.roster.length === 0) continue
    const clubObj = clubById.get(String(cid))
    for (const r of hubClub.roster) {
      if (!r || r.personType !== 'member' || !r.name) continue
      const cleanName = cleanText(r.name)
      const dedupeKey = `${cid}:${cleanName.toLowerCase()}`
      if (seenMemberKeys.has(dedupeKey)) continue
      seenMemberKeys.add(dedupeKey)

      const newTag = enrichMemberClubTags([
        {
          label: clubObj?.name || r.clubName || hubClub.name || cid,
          clubId: String(cid),
        },
      ])
      const isFullName = cleanName.trim().split(/\s+/).length >= 2
      const existing = isFullName ? syncedMembersByFullName.get(cleanName.toLowerCase()) : null

      if (existing) {
        if (!existing.clubs.some(c => c.clubId === String(cid))) {
          existing.clubs.push(...newTag)
        }
        if (!existing.major && r.major) existing.major = cleanText(r.major)
      } else {
        const entry = {
          id: r.id || `roster_mem_${cid}_${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
          name: cleanName,
          initials: r.initials || toInitials(cleanName),
          email: r.email || clubObj?.email || hubClub.email || '',
          role: cleanText(r.role || 'Club Member'),
          major: r.major ? cleanText(r.major) : '',
          avatarBg: clubObj?.avatarBg || '#00796B',
          clubs: newTag,
          joined: 'Active',
          isCustom: false,
          isYou: false,
        }
        members.push(entry)
        if (isFullName) {
          syncedMembersByFullName.set(cleanName.toLowerCase(), entry)
        }
      }
    }
  }

  // 3. Sample active members (filtered to clubs present in allClubs)
  for (const m of initialMembers || []) {
    const validClubs = enrichMemberClubTags(
      (m.clubs || []).filter(
        c => !c.clubId || clubById.size === 0 || clubById.has(String(c.clubId))
      )
    )
    if (validClubs.length === 0) continue
    const key = (m.email || m.name || '').toLowerCase()
    if (key && seenMemberKeys.has(key)) continue
    if (key) seenMemberKeys.add(key)
    members.push({
      ...m,
      name: cleanText(m.name),
      initials: m.initials || toInitials(m.name),
      role: cleanText(m.role || 'Active Member'),
      major: m.major ? cleanText(m.major) : '',
      clubs: validClubs,
      isCustom: false,
      isYou: false,
    })
  }

  // ── Per-club roster counts (officers + members) for Club Picker & Quick Filters ──
  const clubPeopleCounts = new Map()
  const clubOfficerCounts = new Map()
  const clubMemberCounts = new Map()

  for (const o of officers) {
    if (!o.clubId) continue
    clubOfficerCounts.set(o.clubId, (clubOfficerCounts.get(o.clubId) || 0) + 1)
    clubPeopleCounts.set(o.clubId, (clubPeopleCounts.get(o.clubId) || 0) + 1)
  }

  for (const m of members) {
    const countedForMember = new Set()
    for (const c of m.clubs || []) {
      if (!c.clubId || countedForMember.has(c.clubId)) continue
      countedForMember.add(c.clubId)
      clubMemberCounts.set(c.clubId, (clubMemberCounts.get(c.clubId) || 0) + 1)
      clubPeopleCounts.set(c.clubId, (clubPeopleCounts.get(c.clubId) || 0) + 1)
    }
  }

  return {
    officers,
    members,
    clubPeopleCounts,
    clubOfficerCounts,
    clubMemberCounts,
  }
}

// Global search uses the public roster subset. Keep workspace people,
// custom entries and contact information out of this cross-page index.
export function getPublicDirectoryOfficers(hubDict = {}) {
  const officers = []
  const seen = new Set()
  for (const [cid, club] of Object.entries(hubDict || {})) {
    for (const entry of club?.roster || []) {
      if (!entry?.id || !entry.name || entry.personType === 'member' ||
          entry.isPrivate || (entry.visibility && entry.visibility !== 'public') ||
          entry.isSyntheticContact || String(entry.id).endsWith('_official_contact')) continue
      const id = `${cid}:${entry.id}`
      if (seen.has(id)) continue
      seen.add(id)
      officers.push({ id, clubId: cid, club: cleanText(club.name),
        name: cleanText(entry.name), role: cleanText(entry.role || 'Officer') })
    }
  }
  return officers
}
