import assert from 'node:assert/strict'
import test from 'node:test'
import { applyTaskPatch, createTaskBoardWrites, reconcileTask } from '../src/utils/taskBoardWrites.js'

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

test('absolute writes serialize one task and coalesce the latest queued field values', async () => {
  const writes = createTaskBoardWrites(() => {})
  const firstResponse = deferred()
  const sent = []
  const original = { id: 'a', status: 'not_started', priority: 'medium' }

  function patch(fields) {
    return writes.run('a', async patch => {
      sent.push(patch)
      if (sent.length === 1) await firstResponse.promise
      return { ok: true }
    }, { patch: fields, overlay: fields, coalesce: true, anchor: original })
  }

  const first = patch({ status: 'working_on_it' })
  const second = patch({ status: 'in_review', priority: 'high' })
  const third = patch({ status: 'done' })
  assert.deepEqual(sent, [{ status: 'working_on_it' }])
  assert.deepEqual(writes.get('a').queued.overlay, { status: 'done', priority: 'high' })
  assert.equal(writes.get('a').anchor, original)

  firstResponse.resolve()
  await Promise.all([first, second, third])
  assert.deepEqual(sent, [{ status: 'working_on_it' }, { status: 'done', priority: 'high' }])
  assert.equal(writes.busy, false)
})

test('reversed whole-board responses reconcile only their task and invalidate a stale read', async () => {
  const a = { id: 'a', status: 'not_started' }
  const b = { id: 'b', priority: 'medium' }
  const newerA = { ...a, status: 'done' }
  const newerB = { ...b, priority: 'high' }
  const writes = createTaskBoardWrites(() => {})
  const originalRead = writes.revision
  let board = { tasks: [a, b], personalTasks: [] }
  const earlier = deferred()
  const later = deferred()

  const changeA = writes.run('a', async () => {
    const result = await earlier.promise
    board = reconcileTask(board, result, 'a')
  })
  const changeB = writes.run('b', async () => {
    const result = await later.promise
    board = reconcileTask(board, result, 'b')
  })
  assert.equal(writes.canApplyRead(originalRead), false)
  const idle = deferred()
  writes.whenIdle(idle.resolve)

  later.resolve({ tasks: [a, newerB] })
  await changeB
  earlier.resolve({ tasks: [newerA, b] })
  await changeA
  await idle.promise
  assert.deepEqual(board.tasks, [newerA, newerB])
  assert.equal(writes.canApplyRead(originalRead), false)
  assert.equal(writes.canApplyRead(writes.revision), true)
})

test('a second toggle cannot dispatch before reconciliation', async () => {
  const writes = createTaskBoardWrites(() => {})
  const response = deferred()
  const original = { id: 'a', completedBy: [{ userId: 'other', completedAt: 'yesterday' }] }
  const overlay = applyTaskPatch(original, { toggleCompletedForSelf: true }, 'self')
  assert.deepEqual(overlay.completedBy, [...original.completedBy, { userId: 'self' }])
  assert.deepEqual(
    applyTaskPatch(overlay, { toggleCompletedForSelf: true }, 'self').completedBy,
    original.completedBy
  )
  assert.equal(
    applyTaskPatch({ isPersonal: true, status: 'done' }, { toggleCompletedForSelf: true }, 'self').status,
    'not_started'
  )

  const operation = writes.run('a', () => response.promise, { overlay })
  assert.deepEqual(await writes.run('a', () => assert.fail('duplicate toggle')), { skipped: true })
  assert.equal(writes.get('a').current.overlay, overlay)
  response.resolve({ ok: true })
  await operation
  assert.equal(writes.get('a'), undefined)
})

test('permission rejection or a thrown write drops queued edits and releases only that task', async () => {
  for (const shouldThrow of [false, true]) {
    const writes = createTaskBoardWrites(() => {})
    const rejected = deferred()
    const next = deferred()
    const a = writes.run('a', async () => {
      await rejected.promise
      if (shouldThrow) throw new Error('connection lost')
      return { ok: false, status: 403 }
    }, { coalesce: true })
    const queued = writes.run('a', () => assert.fail('unsafe queued retry'), { coalesce: true })
    const b = writes.run('b', () => next.promise)
    rejected.resolve()

    const [result, queuedResult] = await Promise.all([a, queued])
    assert.equal(result.ok, false)
    assert.deepEqual(result, queuedResult)
    assert.equal(writes.get('a'), undefined)
    assert.ok(writes.get('b'))

    next.resolve({ ok: true })
    assert.equal((await b).ok, true)
    assert.equal(writes.busy, false)
  }
})

test('confirmed deletion leaves unrelated tasks alone even if the response contains an old snapshot', () => {
  const survivor = { id: 'b', status: 'done' }
  const board = { tasks: [], personalTasks: [{ id: 'a', isPersonal: true }, survivor] }
  const updated = reconcileTask(board, { personalTasks: [{ ...survivor, status: 'not_started' }] }, 'a', true)
  assert.deepEqual(updated.personalTasks, [survivor])
  assert.equal(updated.personalTasks[0], survivor)
})
