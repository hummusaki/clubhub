import assert from 'node:assert/strict'
import test from 'node:test'
import { announcementKey, announcementPermalink } from '../src/utils/announcementLinks.js'

test('a notification opens a specific post or message when the catalog has one', () => {
  for (const permalink of [
    'https://www.instagram.com/p/fixture/',
    'https://www.instagram.com/stories/fixture/123/',
    'https://discord.com/channels/123/456/789',
    'https://community.example.test/updates/fixture',
  ]) {
    assert.equal(announcementPermalink({ permalink }), permalink)
  }
})

test('profiles, invites, channel links and non-web URLs fall back to the announcement', () => {
  for (const permalink of [
    '',
    'https://www.instagram.com/fixture/',
    'https://discord.gg/fixture',
    'https://discord.com/invite/fixture',
    'https://discord.com/channels/123/456',
    'mailto:fixture@example.test',
    'javascript:void(0)',
  ]) {
    assert.equal(announcementPermalink({ permalink }), null)
  }
  const keyed = { id: '1', source: 'workspace', clubId: 'robotics' }
  assert.notEqual(announcementKey(keyed), announcementKey({ ...keyed, source: 'discord' }))
  assert.notEqual(announcementKey(keyed), announcementKey({ ...keyed, clubId: 'outdoors' }))
})
