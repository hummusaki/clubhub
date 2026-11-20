import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createClient } from '../src/lib/supabaseJsShim.js'
import {
  canResumeWorkspace, readWorkspaceAdmission, storeWorkspaceAdmission,
  WORKSPACE_ADMISSION_MS, workspaceAdmission,
} from '../src/utils/workspaceEntry.js'

function storageFixture() {
  const entries = new Map()
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: key => entries.delete(key),
  }
}

test('workspace resume is bound to the matching account, provider session, and fixed expiry', () => {
  const storage = storageFixture()
  const now = 100
  const receipt = workspaceAdmission('clerk:user_1', 'session-a', { fullName: 'Test member', email: 'member@example.test' }, now)
  storeWorkspaceAdmission(receipt, storage)
  const restored = readWorkspaceAdmission(storage)
  assert.equal(restored.name, 'Test member')
  assert.ok(canResumeWorkspace(restored, 'clerk:user_1', 'session-a', now + WORKSPACE_ADMISSION_MS - 1))
  assert.equal(canResumeWorkspace(restored, 'clerk:user_1', 'session-a', now + WORKSPACE_ADMISSION_MS), false)
  assert.equal(canResumeWorkspace(restored, 'clerk:user_1', 'session-b', now), false)
  assert.equal(canResumeWorkspace(restored, 'clerk:user_2', 'session-a', now), false)
  assert.equal(canResumeWorkspace(restored, null, null, now), false)
  const local = workspaceAdmission('local:member', null, { fullName: 'Test member' }, now)
  assert.ok(canResumeWorkspace(local, 'local:member', null, now))
  storeWorkspaceAdmission(null, storage)
  assert.equal(readWorkspaceAdmission(storage), null)
})

test('native Supabase refreshes a saved session once without reviving it after sign-out', async t => {
  const storage = storageFixture()
  const key = 'clubhub.supabase.auth.token'
  storage.setItem(key, JSON.stringify({ access_token: 'expired', refresh_token: 'old', expires_at: 1 }))
  let release
  const pending = new Promise(resolve => { release = resolve })
  const fetchMock = t.mock.method(globalThis, 'fetch', () => pending)
  const client = createClient('https://example.test', 'test-key', { auth: { storage, autoRefreshToken: true } })
  const first = client.auth.getSession()
  const second = client.auth.getSession()
  assert.equal(fetchMock.mock.callCount(), 1)
  await client.auth.signOut()
  release(Response.json({ access_token: 'new', refresh_token: 'rotated', expires_in: 3600 }))
  assert.equal((await first).data.session, null)
  assert.equal((await second).data.session, null)
  assert.equal(storage.getItem(key), null)

  storage.setItem(key, JSON.stringify({ access_token: 'expired', refresh_token: 'old', expires_at: 1 }))
  fetchMock.mock.mockImplementation(() => Promise.resolve(Response.json({
    access_token: 'again', refresh_token: 'rotated', expires_in: 3600,
  })))
  assert.equal((await client.auth.getSession()).data.session.access_token, 'again')
  assert.equal((await client.auth.getSession()).data.session.refresh_token, 'rotated')
  assert.equal(fetchMock.mock.callCount(), 2)
})
