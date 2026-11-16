// One queue per mounted account/club. Confirmed board reads are accepted only
// when there have been no writes since the read started.
export function createTaskBoardWrites(onChange) {
  const entries = new Map()
  let revision = 0
  let idleAction

  function changed() {
    revision += 1
    onChange()
  }

  async function drain(key, entry) {
    while (entry.current) {
      const job = entry.current
      let result
      try {
        result = await job.write(job.patch, () => {
          entry.acceptQueued = false
        })
      } catch (error) {
        entry.acceptQueued = false
        result = { ok: false, outcomeUnknown: true, error: error?.message || 'Task write interrupted.' }
      }
      job.resolve.forEach(resolve => resolve(result))
      if (!entry.acceptQueued || result?.skipped || result?.status === 401 || result?.status === 403) {
        entry.queued?.resolve.forEach(resolve => resolve(result))
        entry.queued = null
      }
      entry.current = entry.queued
      entry.queued = null
      if (entry.current) changed()
    }
    entries.delete(key)
    changed()
    if (entries.size === 0 && idleAction) {
      const action = idleAction
      idleAction = undefined
      action()
    }
  }

  return {
    get revision() { return revision },
    get busy() { return entries.size > 0 },
    canApplyRead(version) { return entries.size === 0 && revision === version },
    whenIdle(action) {
      if (entries.size === 0) action()
      else idleAction = action
    },
    get(key) { return entries.get(key) },
    run(key, write, { patch = {}, overlay, coalesce = false, anchor, kind } = {}) {
      const existing = entries.get(key)
      if (existing && (!existing.acceptQueued || !coalesce)) return Promise.resolve({ skipped: true })
      return new Promise(resolve => {
        if (existing) {
          const queued = existing.queued
          existing.queued = {
            write,
            patch: { ...queued?.patch, ...patch },
            overlay: { ...queued?.overlay, ...overlay },
            resolve: [...(queued?.resolve || []), resolve],
          }
          changed()
          return
        }
        const entry = { current: { write, patch, overlay, resolve: [resolve] }, anchor, kind, acceptQueued: coalesce }
        entries.set(key, entry)
        changed()
        void drain(key, entry)
      })
    },
  }
}

export function applyTaskPatch(task, patch, userId) {
  const { toggleCompletedForSelf, ...fields } = patch
  if (!toggleCompletedForSelf) return { ...task, ...fields }
  if (task.isPersonal || task.visibility === 'personal') {
    return { ...task, ...fields, status: task.status === 'done' ? 'not_started' : 'done' }
  }
  const completedBy = task.completedBy || []
  const wasDone = completedBy.some(completion => completion.userId === userId)
  return {
    ...task,
    ...fields,
    completedBy: wasDone
      ? completedBy.filter(completion => completion.userId !== userId)
      : [...completedBy, { userId }],
  }
}

export function reconcileTask(board, result, taskId, remove = false) {
  if (!board || !taskId) return board
  const updated = result.task?.id === taskId ? result.task :
    result.tasks?.find(task => task.id === taskId) || result.personalTasks?.find(task => task.id === taskId)
  if (!updated && !remove) return board
  const task = remove ? null : updated
  const isPersonal = task?.isPersonal || task?.visibility === 'personal'
  function updateCollection(collection, next) {
    const exists = collection?.some(entry => entry.id === taskId)
    if (next) return exists
      ? collection.map(entry => entry.id === taskId ? { ...entry, ...next } : entry)
      : [...(collection || []), next]
    return exists ? collection.filter(entry => entry.id !== taskId) : collection
  }
  return {
    ...board,
    tasks: updateCollection(board.tasks, task && !isPersonal ? task : null),
    personalTasks: updateCollection(board.personalTasks, task && isPersonal ? task : null),
  }
}
