import { filterAndRankBySearch, rankClubSearch } from './search.js'

export const GLOBAL_SEARCH_LABEL = 'Search ClubHub…'

const GROUPS = {
  club: ['Clubs', 'clubs'],
  event: ['Events', 'calendar'],
  resource: ['Resources', 'links'],
  person: ['People', 'clubs'],
}

// The caller supplies the Calendar's membership-scoped events and the
// public resource and directory catalogs. Private workspace collections
// (tasks, polls, membership records) are deliberately not inputs.
export function getWorkspaceSearchGroups(query, {
  clubs = [], memberEvents = [], publicResources = [], localResources = [], publicPeople = [],
} = {}) {
  if (!query.trim()) return []
  const isPublic = item => !item.isPrivate && (!item.visibility || item.visibility === 'public')
  const resourceIds = new Set()
  const resources = [...localResources, ...publicResources.filter(isPublic)].filter(item => {
    if (!item?.id || resourceIds.has(String(item.id))) return false
    resourceIds.add(String(item.id))
    return true
  })
  const data = {
    club: rankClubSearch(clubs, query, { limit: 8 }),
    event: filterAndRankBySearch(memberEvents, query, item => ({
      primary: [item.event, item.title], secondary: [item.club, item.location, item.day, item.date],
      tertiary: [item.description, item.notes],
    })).slice(0, 6),
    resource: filterAndRankBySearch(resources, query, item => ({
      primary: [item.title, item.rawLabel], secondary: [item.clubName, item.category, item.kind],
      tertiary: [item.url, item.subtitle],
    })).slice(0, 6),
    person: filterAndRankBySearch(publicPeople.filter(isPublic), query, item => ({
      primary: item.name, secondary: [item.role, item.club],
    })).slice(0, 6),
  }
  return Object.entries(data).filter(([, items]) => items.length)
    .map(([type, items]) => ({ type, label: GROUPS[type][0], items }))
}

export function workspaceSearchDestination(type, item) {
  const group = GROUPS[type]
  if (!group || !item?.id) return null
  if (type === 'club') return { nav: 'clubs', options: { clubId: String(item.id) } }
  if (type === 'person') {
    if (!item.clubId) return null
    return { nav: 'clubs', options: {
      clubId: String(item.clubId), clubSection: 'members', personId: String(item.rosterId || item.id),
    } }
  }
  return { nav: group[1], options: { searchTarget: { type, id: String(item.id) } } }
}
