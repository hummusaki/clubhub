import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clubPageHref, readClubPage, readWorkspaceDestination, startOAuthEntry, readOAuthEntry, clearOAuthEntry,
} from '../src/utils/workspaceEntry.js'
import { mergeClubRoster } from '../src/utils/publicRoster.js'
import { buildDashboardPageTitle } from '../src/utils/pageTitle.js'
import { readDirectClubPeople } from '../src/api/supabaseDirectWorkspace.js'
import { sanitizePublicSnapshot } from '../server/services/publicSnapshotSanitizer.js'
import { apiRequest, registerUser, startTestServer } from './helpers/testServer.js'
import { upsertCollectorData } from '../server/database.js'

test('club and poll deep links are base-relative and OAuth handoffs require the matching nonce', () => {
  const address = clubPageHref('a club', 'members', 'seat+one')
  assert.deepEqual(readClubPage(address), { clubId: 'a club', section: 'members', personId: 'seat+one' })
  assert.equal(readWorkspaceDestination(new URL('https://school.github.io/clubhub/' + address)), address)
  assert.equal(readWorkspaceDestination(new URL('https://school.github.io/clubhub/?poll=a%2Fb')), '?poll=a%2Fb')
  for (const hash of ['#/clubs/%FF', '#/clubs/%2Fexample', '#/clubs/a/unknown', '#//example.com']) {
    assert.equal(readClubPage(hash), null)
  }
  const values = new Map()
  const storage = {
    setItem: (key, value) => values.set(key, value),
    getItem: key => values.get(key),
    removeItem: key => values.delete(key),
  }
  const nonce = startOAuthEntry(address, 'previous-session', storage)
  assert.equal(readOAuthEntry('different-nonce', storage), null)
  assert.equal(readOAuthEntry(nonce, storage).destination, address)
  assert.equal(readOAuthEntry(nonce, storage).sessionId, 'previous-session')
  clearOAuthEntry(storage)
  assert.equal(readOAuthEntry(nonce, storage), null)
  assert.equal(buildDashboardPageTitle({ clubTitle: 'Astronomy Club', clubSection: 'members' }), 'Members · Astronomy Club · ClubHub')
})

test('roster merge uses stable identifiers and keeps unclaimed published entries distinct', () => {
  const published = [{ id: 'officer-1', name: 'Sam' }, { id: 'officer-2', name: 'Sam' }]
  const member = { userId: 'u1', rosterId: 'OFFICER-1', name: 'Sam' }
  const unlistedMember = { userId: 'u2', name: 'Alex' }
  assert.deepEqual(mergeClubRoster(published, {
    board: [member],
    members: [member, unlistedMember, { name: 'Published Officer', rosterId: 'officer-2' }],
  }), {
    confirmed: [member, unlistedMember], published: [published[1]],
  })
})

test('Supabase checks the viewer’s membership before loading a club roster or groups', async () => {
  function directFixture({ role, membershipError } = {}) {
    const calls = []
    const viewer = { user_id: 'viewer', role, claim_status: 'approved' }
    const sb = {
      from(table) {
        const call = { table, filters: {} }
        calls.push(call)
        const query = {
          select(fields) { call.fields = fields; return query },
          eq(column, value) { call.filters[column] = value; return query },
          order() { return query },
          maybeSingle() { return { data: role ? viewer : null, error: membershipError } },
          then(resolve) { return resolve({ data: table === 'club_members' ? [viewer] : [] }) },
        }
        return query
      },
    }
    return { sb, calls }
  }

  const guest = directFixture()
  assert.deepEqual((await readDirectClubPeople(guest.sb, 'astro', null)).memRows, [])
  assert.deepEqual(guest.calls, [])
  assert.deepEqual((await readDirectClubPeople(guest.sb, 'astro', 'viewer')).memRows, [])
  assert.deepEqual(guest.calls.map(call => call.filters), [{ club_id: 'astro', user_id: 'viewer' }])

  for (const role of ['member', 'board']) {
    const { sb, calls } = directFixture({ role })
    const result = await readDirectClubPeople(sb, 'astro', 'viewer')
    assert.equal(result.isBoard, role === 'board')
    assert.equal(result.memRows.length, 1)
    assert.ok(calls.every(call => call.filters.club_id === 'astro'))
    assert.equal(calls[1].fields.includes('full_name,email'), role === 'board')
  }

  const error = { message: 'Access denied' }
  const denied = directFixture({ membershipError: error })
  assert.deepEqual(await readDirectClubPeople(denied.sb, 'astro', 'viewer'), { error })
  assert.equal(denied.calls.length, 1)
})

test('the public snapshot filters private roster records and drops claim and personal contact fields', () => {
  const roster = [{
    id: 'seat', clubId: 'astro', name: 'Public Officer', email: 'person@ucsc.edu', claimedByName: 'Account Name',
  }, { id: 'private-seat', clubId: 'astro', name: 'Private Member', isPrivate: true }]
  const result = sanitizePublicSnapshot({ roster, hub: { astro: { roster } }, memberships: [{ userId: 'secret' }] })
  assert.deepEqual(result, { roster: [{ id: 'seat', clubId: 'astro', name: 'Public Officer' }] })
})

test('the people endpoint keeps private memberships and groups within the requested club', async t => {
  const { baseUrl, close } = await startTestServer()
  t.after(close)
  upsertCollectorData({ clubs: [{ id: 'astro', name: 'Astronomy', email: 'board@ucsc.edu' }],
    roster: [
      { id: 'chair', clubId: 'astro', name: 'Published Chair', role: 'President', personType: 'officer' },
      { id: 'astro_official_contact', clubId: 'astro', name: 'Synthetic Contact', personType: 'officer' },
    ] })
  const officer = await registerUser(baseUrl, { email: 'board@ucsc.edu', fullName: 'Private Officer' })
  const member = await registerUser(baseUrl, { email: 'member@ucsc.edu', fullName: 'Confirmed Member' })
  const outsider = await registerUser(baseUrl, { email: 'outside@ucsc.edu', fullName: 'Another Club Member' })
  assert.ok((await apiRequest(baseUrl, '/api/workspace/clubs/astro/claims', {
    method: 'POST', token: officer.token, body: { rosterId: 'chair', requestedRole: 'President' },
  })).ok)
  assert.ok((await apiRequest(baseUrl, '/api/workspace/clubs/astro/join', { method: 'POST', token: member.token })).ok)
  assert.ok((await apiRequest(baseUrl, '/api/workspace/clubs/another-club/join', { method: 'POST', token: outsider.token })).ok)
  assert.ok((await apiRequest(baseUrl, '/api/workspace/clubs/astro/groups', {
    method: 'POST', token: officer.token, body: { name: 'Members-only group' },
  })).ok)

  for (const token of ['', outsider.token]) {
    const { data } = await apiRequest(baseUrl, '/api/workspace/clubs/astro/people', { token })
    assert.equal(data.permission.isMember, false)
    assert.deepEqual(data.publicRoster.map(entry => entry.name), ['Published Chair'])
    assert.deepEqual(data.groups, [])
    assert.doesNotMatch(JSON.stringify(data), /Private Officer|Confirmed Member|Synthetic Contact|Members-only group/)
  }

  const { data: memberData } = await apiRequest(baseUrl, '/api/workspace/clubs/astro/people', { token: member.token })
  assert.equal(memberData.permission.isMember, true)
  assert.ok(memberData.everyone.some(entry => entry.name === 'Confirmed Member' && entry.userId))
  assert.deepEqual(memberData.groups.map(group => group.name), ['Members-only group'])
  assert.equal(memberData.board[0].email, '')

  const { data: boardData } = await apiRequest(baseUrl, '/api/workspace/clubs/astro/people', { token: officer.token })
  assert.equal(boardData.permission.isBoard, true)
  assert.equal(boardData.members.find(entry => entry.name === 'Confirmed Member').email, 'member@ucsc.edu')
})
