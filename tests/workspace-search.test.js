import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { recommendClubsForInterests } from '../src/utils/aiClubAgent.js'
import { getClubSearchDocument, rankClubSearch } from '../src/utils/search.js'
import { buildCandidateCatalog, mergeGenerativeWithRag } from '../src/api/aiClient.js'
import { getWorkspaceSearchGroups, workspaceSearchDestination } from '../src/utils/workspaceSearch.js'

const auto = {
  id: 'slugsonwheelsclub',
  name: 'Slugs On Wheels UCSC',
  category: 'gaming',
  bio: 'The unofficial Slugs Automotive Club. See our friends who work on motorcycles.',
}
const mechanics = {
  id: 'slugsontwowheels', name: 'Slugs on Two Wheels (SlugWerks)',
  aliases: ['SlugWerks', 'Slugs on Two Wheels'], bio: 'The Motorsport Mechanics Club of UC Santa Cruz.',
}
const motorcycle = {
  id: 'motorcycle', name: 'Two Wheel Workshop', bio: 'Motorcycle club and motorsport group.',
}
const cards = { id: 'cards', name: 'Tabletop Society', bio: 'Card games and tabletop RPGs' }
const career = { id: 'career', name: 'Career Mentors', bio: 'Career advice for public service' }
const caribbean = { id: 'caribbean', name: 'Caribbean Students', bio: 'Caribbean culture and music' }
const coding = { id: 'coding', name: 'Campus Coding Lab', tags: ['software'], bio: 'Programming practice for new coders' }
const music = { id: 'music', name: 'Campus Choir', tags: [{ label: 'a cappella' }], bio: 'A singing group' }
const outdoors = { id: 'hiking', name: 'Campus Hiking Group', description: 'Guided hikes in the redwoods' }
const clubs = [mechanics, motorcycle, cards, career, auto, caribbean, coding, music, outdoors]

const ids = matches => matches.map(club => club.id)
const discover = (catalog, query) => recommendClubsForInterests(catalog, query).matches.map(entry => entry.club)
const globalClubs = (catalog, query) => getWorkspaceSearchGroups(query, { clubs: catalog })
  .find(group => group.type === 'club')?.items || []

test('standard club search, global search and discovery share automotive relevance', () => {
  for (const query of ['car', 'cars', 'automotive', 'automobile', 'automobiles']) {
    for (const retrieve of [rankClubSearch, globalClubs, discover]) {
      assert.equal(retrieve(clubs, query)[0]?.id, auto.id, query)
    }
  }
  for (const retrieve of [rankClubSearch, globalClubs, discover]) {
    for (const [name, expected] of [
      ['Slugs On Wheels', auto.id], ['Slugs On Whells', auto.id], ['@slugsonwheelsclub', auto.id], ['SlugWerks', mechanics.id],
    ]) assert.equal(retrieve(clubs, name)[0]?.id, expected, name)

    for (const [query, relevant] of [['card games', cards.id], ['career', career.id], ['Caribbean', caribbean.id]]) {
      const results = ids(retrieve(clubs, query))
      assert.ok(results.includes(relevant), query)
      assert.ok(!results.includes(auto.id), query)
    }
    const results = ids(retrieve(clubs, 'cars but not motorcycles'))
    assert.ok(results.includes(auto.id))
    assert.ok(!results.includes(motorcycle.id))
    assert.ok(!results.includes(cards.id))
  }
  assert.deepEqual(ids(rankClubSearch([cards, career, caribbean, { id: 'cartoon', name: 'Cartoon Club' }], 'car')), [])
  assert.deepEqual(ids(discover([cards, career, caribbean, { id: 'cartoon', name: 'Cartoon Club' }], 'car')), [])
})

test('raw and UI records retain every description, exact identities and normalized tags', () => {
  const ui = { ...auto, officialName: 'Slugs Automotive Club', bio: auto.bio, description: 'Learn about vehicles',
    directoryDescription: 'Open workshop on gearboxes', tags: ['Engine tuning', { label: 'Road safety' }] }
  for (const retrieve of [rankClubSearch, discover]) {
    assert.equal(retrieve(clubs, 'car')[0]?.id, retrieve([ui, ...clubs.filter(c => c.id !== ui.id)], 'car')[0]?.id)
    for (const query of ['Slugs Automotive Club', 'gearboxes', 'vehicles', 'engine tuning', 'road safety']) {
      assert.equal(retrieve([ui], query)[0]?.id, ui.id, query)
    }
    for (const [query, expected] of [['Campus Coding Lab', coding.id], ['programming', coding.id],
      ['Campus Choir', music.id], ['singing', music.id], ['Campus Hiking Group', outdoors.id], ['hiking', outdoors.id]]) {
      assert.ok(ids(retrieve(clubs, query)).slice(0, 3).includes(expected), query)
    }
  }
  assert.equal(getClubSearchDocument(ui), getClubSearchDocument(ui))
  assert.deepEqual(getClubSearchDocument({ ...ui, description: ui.bio }).descriptions, [ui.bio, ui.directoryDescription])
})

test('candidate selection is relevant, deduplicated and independent of catalog order', () => {
  const fillers = Array.from({ length: 24 }, (_, n) => ({ id: 'filler-' + n, name: 'Unrelated Society ' + n }))
  const catalog = [...fillers, ...clubs, auto]
  const shuffled = catalog.map((_, n) => catalog[n * 13 % catalog.length])
  const candidates = sorted => {
    const short = recommendClubsForInterests(sorted, 'cars but not motorcycles', { maxResults: 1 })
    return buildCandidateCatalog(sorted, short)
  }
  const a = candidates(catalog)
  const b = candidates(shuffled)
  assert.deepEqual(a, b)
  assert.equal(a[0].id, auto.id)
  assert.match(a[0].summary, /Automotive/)
  assert.equal(a.find(candidate => candidate.id === motorcycle.id), undefined)
  assert.equal(a.find(candidate => candidate.id.startsWith('filler')), undefined)
  assert.equal(new Set(a.map(x => x.id)).size, a.length)
  assert.deepEqual(buildCandidateCatalog(catalog, recommendClubsForInterests(catalog, 'zzzzzzzz')), [])
})

test('model picks cannot overwrite deterministic results, inject claims or circumvent exclusions', () => {
  const ragResult = recommendClubsForInterests(clubs, 'cars but not motorcycles')
  const merge = recommendations => mergeGenerativeWithRag({ clubs, ragResult, llmPayload: {
    result: { overview: 'made up meeting tomorrow', recommendations },
  } })
  assert.equal(merge([{ clubId: 'made-up' }, { clubId: motorcycle.id }, { clubId: career.id }]), null)
  const result = merge([
    { clubId: mechanics.id, rationale: 'made up meeting tomorrow' },
    { clubId: mechanics.id }, { clubId: 'made-up' },
  ])
  assert.equal(result.matches, ragResult.matches)
  assert.equal(result.matches[0].club.id, auto.id)
  assert.deepEqual(ids(result.assistantPicks), [mechanics.id])
  assert.doesNotMatch(JSON.stringify(result), /made up meeting/)
})

test('global groups and entity routing avoid unauthorized sources and local filter changes', () => {
  const sources = {
    clubs: [{...auto, name: 'Fixture Automotive Club'}],
    memberEvents: [{ id: 'event-1', event: 'Fixture Event' }],
    publicResources: [
      { id: 'resource-1', title: 'Fixture Resource' },
      { id: 'private-resource', title: 'Fixture Private Resource', visibility: 'members' },
    ],
    localResources: [{ id: 'own-resource', title: 'Fixture Local Resource' }],
    publicPeople: [{ id: 'public-1', clubId: auto.id, name: 'Fixture Public Officer' },
      { id: 'private-officer', name: 'Fixture Private Officer', isPrivate: true }],
    tasks: [{ id: 'private-task', title: 'Fixture Private Task' }],
    polls: [{ id: 'private-poll', title: 'Fixture Private Poll' }],
    events: [{ id: 'outside-event', event: 'Fixture Outside Event' }],
  }
  assert.deepEqual(getWorkspaceSearchGroups('', sources), [])
  assert.deepEqual(getWorkspaceSearchGroups('Private', sources), [])
  const groups = getWorkspaceSearchGroups('Fixture', sources)
  assert.deepEqual(groups.map(({ type, items }) => [type, ids(items)]), [
    ['club', [auto.id]], ['event', ['event-1']],
    ['resource', ['own-resource','resource-1']], ['person', ['public-1']],
  ])
  for (const [group, nav] of groups.map((group,index) => [group, ['clubs','calendar','links','clubs'][index]])) {
    const selected = group.items[0]
    const destination = workspaceSearchDestination(group.type, selected)
    assert.equal(destination.nav, nav)
    assert.deepEqual(destination.options.searchTarget, { id: selected.id, type: group.type })
    assert.equal('searchQuery' in destination.options, false)
  }
})

test('public snapshot smoke: the two similarly named clubs remain separate', () => {
  const { clubs: snapshot } = JSON.parse(readFileSync(new URL('../public/clubhub-data.json', import.meta.url), 'utf8'))
  for (const query of ['car', 'cars', 'automobile', 'automotive']) {
    const local = recommendClubsForInterests(snapshot, query)
    assert.ok(ids(rankClubSearch(snapshot, query, { limit: 3 })).includes(auto.id))
    assert.ok(local.matches.slice(0, 3).some(match => match.club.id === auto.id))
    assert.ok(buildCandidateCatalog(snapshot, local).some(match => match.id === auto.id))
  }
  assert.equal(rankClubSearch(snapshot, 'Slugs On Wheels')[0]?.id, auto.id)
  assert.equal(rankClubSearch(snapshot, 'SlugWerks')[0]?.id, mechanics.id)
})
