/**
 * Dynamically resolves shortcut tokens (`'all_board'`, `'all_members'`, `'everyone'`, `'group:<id>'`)
 * plus explicit selections against the live club roster & group memberships without duplicates.
 */
export function resolveDeduplicatedTargets(clubPeople, shortcutTokens = [], explicitPeople = []) {
  const seen = new Map()

  const addEntry = (person, sourceLabel = '') => {
    if (!person || !person.name) return
    const key = person.userId
      ? `uid:${person.userId}`
      : person.email
        ? `email:${String(person.email).trim().toLowerCase()}`
        : person.memberKey || `name:${String(person.name).trim().toLowerCase()}`
    if (seen.has(key)) return
    seen.set(key, {
      memberKey: key,
      userId: person.userId || null,
      name: person.name,
      initials:
        person.initials ||
        String(person.name)
          .split(/\s+/)
          .filter(Boolean)
          .map(w => w[0])
          .join('')
          .slice(0, 2)
          .toUpperCase(),
      email: person.email || '',
      roleTitle: person.roleTitle || person.role || 'Member',
      tier: person.tier || (person.personType === 'officer' ? 'board' : 'member'),
      sourceShortcut: sourceLabel,
    })
  }

  const board = clubPeople?.board || []
  const members = clubPeople?.members || []
  const everyone = clubPeople?.everyone || [...board, ...members]
  const groups = clubPeople?.groups || []

  for (const raw of shortcutTokens || []) {
    const token = String(raw || '').trim()
    if (token === 'all_board') {
      for (const b of board) addEntry(b, 'All Board Members')
    } else if (token === 'all_members' || token === 'everyone') {
      for (const e of everyone) addEntry(e, 'All Club Members')
    } else if (token.startsWith('group:')) {
      const groupId = token.slice(6)
      const grp = groups.find(g => String(g.id) === String(groupId))
      if (grp) {
        for (const gm of grp.members || []) addEntry(gm, grp.name)
      }
    }
  }

  for (const exp of explicitPeople || []) {
    addEntry(exp, 'Selected')
  }

  return Array.from(seen.values())
}
