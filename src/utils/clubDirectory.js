import { cleanText } from '../components/ui'
import { isPublishedRosterPerson } from './publicRoster'

// The campus directory and search share the published catalog.
export function getPublicDirectoryPeople(hubDict = {}) {
  const people = []
  const seen = new Set()
  for (const [clubId, club] of Object.entries(hubDict || {})) {
    for (const entry of club?.roster || []) {
      if (!isPublishedRosterPerson(entry)) continue
      const id = `${clubId}:${entry.id}`
      if (seen.has(id)) continue
      seen.add(id)
      const isOfficer = entry.personType !== 'member'
      people.push({
        id,
        rosterId: entry.id,
        clubId,
        club: cleanText(club.name),
        name: cleanText(entry.name),
        role: cleanText(entry.role || (isOfficer ? 'Officer' : 'Member')),
        isOfficer,
      })
    }
  }
  return people
}
