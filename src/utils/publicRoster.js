export function isPublicRecord(entry) {
  return Boolean(entry && !entry.isPrivate && (!entry.visibility || entry.visibility === 'public'))
}

export function isPublishedRosterPerson(entry) {
  return Boolean(isPublicRecord(entry) && entry.id && entry.name &&
    !entry.isSyntheticContact && !String(entry.id).endsWith('_official_contact') &&
    !String(entry.id).startsWith('custom_'))
}

export function mergeClubRoster(published, membership) {
  const representedSeats = new Set()
  const representedUsers = new Set()
  const confirmed = [...(membership?.board || []), ...(membership?.members || [])].filter(entry => {
    if (!entry.userId || !entry.name || representedUsers.has(entry.userId)) return false
    representedUsers.add(entry.userId)
    if (entry.rosterId) representedSeats.add(String(entry.rosterId).toLowerCase())
    return true
  })
  return {
    confirmed,
    published: published.filter(entry => !representedSeats.has(String(entry.id).toLowerCase())),
  }
}
