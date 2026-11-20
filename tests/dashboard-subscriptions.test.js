import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyEventCancellations, extractPost, filterActualEvents } from '../collector/src/extract.js'
import { upsertCollectorData } from '../server/database.js'
import { privBatch, privExecute } from '../server/privateDb.js'
import { mergeWorkspaceFeed } from '../src/api/client.js'
import { readDirectPersonalFeed } from '../src/api/supabaseDirectWorkspace.js'
import { calendarEventDate, calendarEventRange } from '../src/utils/calendarDates.js'
import { filterEventsForCalendarSync } from '../src/utils/calendarSync.js'
import { pushEventsToGoogleCalendar } from '../src/utils/googleCalendarSync.js'
import { DEFAULT_DASHBOARD_LAYOUT, dashboardColumnCounts, normalizeDashboardLayout, packDashboardWidgets } from '../src/utils/dashboardLayout.js'
import { moveFavoriteClub, readTaskBoardPrefs, writeTaskBoardPrefs } from '../src/utils/taskReminders.js'
import { apiRequest, registerUser, startTestServer } from './helpers/testServer.js'

test('dashboard layout migrates old settings and preserves a deliberately empty layout', () => {
  assert.deepEqual(normalizeDashboardLayout(), DEFAULT_DASHBOARD_LAYOUT)
  assert.deepEqual(normalizeDashboardLayout({ sections: ['resources'] }), DEFAULT_DASHBOARD_LAYOUT)
  assert.deepEqual(normalizeDashboardLayout({ version: 1, sections: [] }).sections, [])
  assert.deepEqual(normalizeDashboardLayout({
    version: 1, sections: ['miniCalendar', 'deleted', 'announcements', 'miniCalendar'],
  }).sections, ['miniCalendar', 'announcements'])
})

test('dashboard fills the space below My clubs even when Announcements is taller', () => {
  const sections = ['announcements', 'clubs', 'miniCalendar', 'schedule', 'resources', 'summary']
  const heights = { announcements: 460, clubs: 238, miniCalendar: 495, schedule: 281, resources: 258, summary: 70 }
  const wide = packDashboardWidgets(sections, heights, dashboardColumnCounts(sections, 3), 16)
  assert.deepEqual(wide.positions, {
    announcements: { column: 0, top: 0 }, clubs: { column: 1, top: 0 }, miniCalendar: { column: 2, top: 0 },
    schedule: { column: 0, top: 476 }, resources: { column: 1, top: 254 }, summary: { column: 0, top: 773 },
  })
  assert.equal(wide.height, 843)
  const medium = dashboardColumnCounts(sections, 2)
  assert.equal(medium.miniCalendar, 2)
  assert.equal(medium.schedule, 2)
  assert.equal(medium.resources, 2)
  const narrow = packDashboardWidgets(sections, heights, dashboardColumnCounts(sections, 1), 16)
  assert.deepEqual(Object.values(narrow.positions).map(({ column, top }) => [column, top]),
    [[0, 0], [0, 476], [0, 730], [0, 1241], [0, 1538], [0, 1812]])
  assert.deepEqual(packDashboardWidgets([], {}, {}, 16), { positions: {}, height: 0 })
})

test('dashboard layouts keep the schedule and resources in neighboring columns without overlaps', () => {
  const heights = { announcements: 90, clubs: 205, miniCalendar: 360, schedule: 90, resources: 220, summary: 70 }

  function verifyLayout(sections, remaining) {
    for (const maximum of [2, 3]) {
      const columns = dashboardColumnCounts(sections, maximum)
      const { positions, height } = packDashboardWidgets(sections, heights, columns, 16)
      const boxes = sections.map(id => {
        const { column, top } = positions[id]
        return { id, left: column / columns[id], right: (column + 1) / columns[id], top, bottom: top + heights[id] }
      })

      for (const [index, box] of boxes.entries()) {
        assert.ok(box.bottom <= height)
        for (const [offset, other] of boxes.slice(index + 1).entries()) {
          const pair = offset === 0 && ['schedule:resources', 'resources:schedule'].includes(`${box.id}:${other.id}`)
          if (pair) {
            assert.equal(box.right, other.left)
          } else {
            assert.ok(box.top < other.top || (box.top === other.top && box.left < other.left))
          }
          assert.ok(box.bottom <= other.top || box.right <= other.left || other.right <= box.left)
        }
      }
    }

    for (const id of remaining) verifyLayout([...sections, id], remaining.filter(key => key !== id))
  }

  verifyLayout([], Object.keys(heights))
})

test('favorite club moves survive reload with the same selected board and unavailable favorites', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const account = 'email:rearrange@ucsc.edu'
  const favoriteClubIds = ['design', 'acm-w', 'robotics', 'former-club']
  const moved = moveFavoriteClub(favoriteClubIds, 'robotics', 'design')
  assert.deepEqual(moved, ['robotics', 'design', 'acm-w', 'former-club'])
  assert.deepEqual(moveFavoriteClub(moved, 'robotics', null), ['design', 'acm-w', 'former-club', 'robotics'])
  assert.equal(moveFavoriteClub(moved, 'other', 'design'), moved)
  assert.equal(moveFavoriteClub(moved, 'robotics', 'design'), moved)
  writeTaskBoardPrefs(account, { selectedClubId: 'acm-w', favoriteClubIds: moved }, storage)
  assert.equal(readTaskBoardPrefs(account, storage).selectedClubId, 'acm-w')
  assert.deepEqual(readTaskBoardPrefs(account, storage).favoriteClubIds, moved)
  assert.deepEqual(readTaskBoardPrefs('email:other@ucsc.edu', storage).favoriteClubIds, [])
})

test('calendar date labels retain date-only events and distinguish overnight times', () => {
  assert.equal(calendarEventDate({ allDay: true, start: '2027-05-02' }), '2027-05-02')
  assert.equal(calendarEventDate({ allDay: true, start: '2027-05-02T00:00:00.000Z' }), '2027-05-02')
  assert.equal(calendarEventRange({ allDay: true }, false), 'All day')
  const overnight = { start: '2027-05-02T23:00:00', end: '2027-05-03T01:30:00' }
  assert.equal(calendarEventRange(overnight, true), '23:00–01:30 Mon')
})

test('collector importance uses event-specific evidence and cancellation corrects the original record', () => {
  const workshop = { id: 'workshop', clubId: 'acm', title: 'Design workshop', start: '2027-05-18T23:00:00Z', location: 'Porter' }
  const study = { ...workshop, id: 'study', title: 'Study night', start: '2027-05-19T23:00:00Z' }
  const caption = 'Room change for the May 18 design workshop.\nStudy night on May 19 in Porter.'
  assert.deepEqual(filterActualEvents([workshop, study], { defaultCaption: caption }).map(ev => ev.important), [true, false])
  const cancellation = { id: 'cancel', clubId: 'acm', postedAt: '2027-05-12T12:00:00Z', caption: 'Design workshop on May 18 has been canceled.' }
  const notice = extractPost(cancellation)
  assert.equal(notice.important, true)
  assert.deepEqual(notice.events, [])
  const corrected = applyEventCancellations([workshop, study], [cancellation])
  assert.deepEqual(corrected.map(event => Boolean(event.cancelled)), [true, false])
})

test('live feeds isolate channels and viewers, check audience before limits and refresh existing ICS tokens', async () => {
  const server = await startTestServer()
  try {
    const board = await registerUser(server.baseUrl, { email: 'subscriptions-board@ucsc.edu' })
    const member = await registerUser(server.baseUrl, { email: 'subscriptions-member@ucsc.edu' })
    const other = await registerUser(server.baseUrl, { email: 'subscriptions-other@ucsc.edu' })
    const clubId = 'solar_car'
    const clubPath = '/api/workspace/clubs/' + clubId
    const call = (path, token, method = 'GET', body) => apiRequest(server.baseUrl, path, { token, method, body })
    assert.equal((await call(clubPath + '/claims', board.token, 'POST', {
      rosterId: 'seat_pres', requestedRole: 'President',
    })).status, 201)
    for (const account of [member, other]) {
      assert.equal((await call(clubPath + '/join', account.token, 'POST')).status, 200)
    }
    const future = '2029-04-05T18:00:00.000Z'
    upsertCollectorData({
      events: [{ id: 'ordinary', clubId, source: 'manual', title: 'Ordinary event', start: future }],
      announcements: [{ id: 'public-urgent', clubId, title: 'Public change', postedAt: '2027-10-01', important: true }],
    })
    const authored = await call(clubPath + '/events', board.token, 'POST', {
      title: 'Important club event', start: future, important: true,
    })
    assert.equal(authored.status, 201)
    assert.equal((await call(clubPath + '/events', member.token, 'POST', {
      title: 'Unauthorized event', start: future, important: true,
    })).status, 403)
    for (const [title, visibility] of [['Old eligible', 'members'], ['Board confidential', 'board']]) {
      assert.equal((await call(clubPath + '/announcements', board.token, 'POST', {
        title, visibility, important: true,
      })).status, 201)
    }
    await privBatch(Array.from({ length: 112 }, (_, index) => ({
      sql: 'INSERT INTO club_announcements_private (id, clubId, clubName, title, authorUserId, authorName, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      params: [`ordinary-late-${index}`, clubId, 'Solar Car', 'Later unmarked notice', board.user.id, 'Board', '2029-01-01'],
    })))
    const set = (channel, mode, token = member.token) => call(clubPath + '/subscriptions/' + channel, token, 'PUT', { mode })
    const read = token => call('/api/workspace/feed', token)
    assert.equal((await read('')).status, 401)
    assert.equal((await set('events', 'bogus')).status, 400)
    const simultaneous = await Promise.all([set('events', 'important'), set('announcements', 'important')])
    assert.ok(simultaneous.every(response => response.status === 200))
    const personal = (await read(member.token)).data
    assert.deepEqual(personal.subscriptions[clubId], { events: 'important', announcements: 'important' })
    assert.deepEqual(personal.events.map(event => event.title), ['Important club event'])
    assert.deepEqual(personal.announcements.map(item => item.title).sort(), ['Old eligible', 'Public change'])
    assert.equal(personal.workspaceAnnouncements.some(item => item.title === 'Board confidential'), false)
    assert.equal((await read(other.token)).data.events.length, 2)
    assert.equal((await read(other.token)).data.announcements.length, 114)

    const profileUrl = '/api/calendar/profile/cal_subscriptions_fixture'
    const sync = await call(profileUrl, member.token, 'PUT', {
      joinedClubIds: ['irrelevant'], rsvpIds: [authored.data.event.id], settings: { rsvpOnly: true, includePastEvents: true },
    })
    assert.equal(sync.status, 200)
    assert.equal(sync.data.syncedCount, 1)
    const ics = () => fetch(server.baseUrl + sync.data.feedPath).then(response => response.text())
    assert.match(await ics(), /Important club event/)
    assert.equal((await set('events', 'off')).status, 200)
    assert.doesNotMatch(await ics(), /Important club event/)
    assert.equal((await read(member.token)).data.announcements.length, 2)
    assert.equal((await set('announcements', 'off')).status, 200)
    assert.deepEqual((await read(member.token)).data.announcements, [])

    assert.equal((await call(clubPath + '/leave', member.token, 'POST')).status, 200)
    assert.equal((await set('events', 'all')).status, 403)
    assert.equal((await call(clubPath + '/join', member.token, 'POST')).status, 200)
    assert.deepEqual((await read(member.token)).data.subscriptions[clubId], { events: 'off', announcements: 'off' })
    assert.equal((await set('events', 'all')).status, 200)
    assert.equal((await set('announcements', 'all')).status, 200)
    assert.equal((await read(member.token)).data.events.length, 2)
    assert.equal((await read(member.token)).data.announcements.length, 114)
    await privExecute('DELETE FROM club_memberships WHERE userId = ? AND clubId = ?', [member.user.id, clubId])
    assert.doesNotMatch(await ics(), /BEGIN:VEVENT/)
  } finally {
    await server.close()
  }
})

test('direct and static-backed retrieval page past muted notices and merge eligible records in time order', async () => {
  const rows = {
    club_members: [{ club_id: 'club', user_id: 'u' }, { club_id: 'muted', user_id: 'u' }],
    club_subscriptions: [{ club_id: 'muted', user_id: 'u', events: 'off', announcements: 'off' }],
    club_events: [],
    polls: [],
    announcements: [
      ...Array.from({ length: 120 }, (_, id) => ({ id, club_id: 'muted', created_at: '2029-05-01' })),
      { id: 'older', club_id: 'club', important: false, title: 'Older', created_at: '2027-05-01' },
    ],
  }
  const pages = []
  const sb = { from(table) {
    let selected = rows[table]
    return {
      select() { return this },
      eq(key, value) { selected = selected.filter(record => record[key] === value); return this },
      in(key, values) { selected = selected.filter(record => values.includes(record[key])); return this },
      order() { return this },
      range(start, end) {
        pages.push([table, start])
        return Promise.resolve({ data: selected.slice(start, end + 1) })
      },
    }
  } }
  const direct = await readDirectPersonalFeed(sb, 'u')
  assert.ok(pages.some(([table, start]) => table === 'announcements' && start === 100))
  assert.deepEqual(direct.announcements.map(item => item.id), ['older'])
  const staticFeed = mergeWorkspaceFeed(direct, { announcements: [
    ...rows.announcements.slice(0, 120).map(row => ({ ...row, clubId: 'muted', source: 'instagram' })),
    { id: 'newer', clubId: 'club', source: 'discord', postedAt: '2028-01-01', important: true },
    { id: 'newer', clubId: 'club', source: 'discord', postedAt: '2028-01-01', important: true },
  ] }, new Set(['club', 'muted']), direct.subscriptions)
  assert.deepEqual(staticFeed.announcements.map(item => item.id), ['newer', 'older'])
  assert.deepEqual(filterEventsForCalendarSync([
    { id: 'muted', clubId: 'muted', start: '2029-05-01', important: true },
    { id: 'custom_evt_a', clubId: 'club', start: '2029-05-02' },
  ], {
    joinedClubIds: ['club', 'muted'], subscriptions: direct.subscriptions, now: new Date('2027-05-01'),
  }).map(item => item.id), ['custom_evt_a'])
})

test('Google reconciliation removes muted managed entries on later pages and preserves manual entries', async t => {
  const deletions = []
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input)
    if (options.method === 'DELETE') {
      deletions.push(url.pathname.split('/').at(-1))
      return new Response(null, { status: 204 })
    }
    if (!url.pathname.endsWith('/events')) return Response.json({ summary: 'ClubHub Campus Calendar' })
    if (!url.searchParams.has('pageToken')) return Response.json({ items: [{ id: 'manual' }], nextPageToken: 'older' })
    return Response.json({ items: [
      { id: 'managed-muted', extendedProperties: { private: { clubhubEventId: 'muted-event' } } },
      { id: 'manual-older' },
    ] })
  })
  const result = await pushEventsToGoogleCalendar({ accessToken: 'fixture', storedCalendarId: 'calendar', events: [] })
  assert.equal(result.removed, 1)
  assert.deepEqual(deletions, ['managed-muted'])
})

test('legacy Supabase serves the feed with account-local preferences when new relations are missing', async t => {
  const browserData = new Map([
    ['clubhub_direct_subscriptions_v1:member', JSON.stringify({ club: { announcements: 'important' } })],
    ['clubhub_direct_subscriptions_v1:other', JSON.stringify({ club: { announcements: 'off' } })],
  ])
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => browserData.get(key) } })
  t.after(() => {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage)
    else delete globalThis.localStorage
  })
  const rows = {
    club_members: [{ club_id: 'club', user_id: 'member' }],
    announcements: [
      { id: 'urgent', club_id: 'club', type: 'Urgent', created_at: '2027-01-02' },
      { id: 'ordinary', club_id: 'club', type: 'Update', created_at: '2027-01-01' },
    ],
    polls: [],
  }
  const sb = { from(table) {
    return {
      select() { return this },
      eq() { return this },
      in() { return this },
      order() { return this },
      async range() {
        return table in rows
          ? { data: rows[table] }
          : { error: { code: 'PGRST205', status: 404, message: 'Missing relation' } }
      },
    }
  } }
  const feed = await readDirectPersonalFeed(sb, 'member')
  assert.equal(feed.ok, true)
  assert.equal(feed.subscriptionsBrowserOnly, true)
  assert.deepEqual(feed.announcements.map(item => item.id), ['urgent'])
  assert.deepEqual(feed.workspaceAnnouncements.map(item => item.id), ['urgent', 'ordinary'])
  assert.deepEqual(feed.workspaceEvents, [])
})
