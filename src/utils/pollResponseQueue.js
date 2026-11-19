// One queue per workspace account. Writes to the same poll are serialized,
// while edits to different polls can save independently.
export function createPollResponseQueue({ save, onStatus, delay = 350 }) {
  const pending = new Map()
  const controller = new AbortController()

  function getEntry(id) {
    if (!pending.has(id)) pending.set(id, { timer: null, request: null, slots: null, status: '' })
    return pending.get(id)
  }

  function report(id, entry, status, result) {
    entry.status = status
    if (!controller.signal.aborted) onStatus(id, status, result)
  }

  async function flush(id) {
    const entry = pending.get(id)
    if (controller.signal.aborted || !entry) return !controller.signal.aborted
    clearTimeout(entry.timer)
    entry.timer = null
    if (entry.request) await entry.request
    if (controller.signal.aborted || pending.get(id) !== entry) return false
    if (entry.timer) return false
    if (entry.request) return flush(id)
    if (entry.slots === null) return entry.status !== 'error'

    const slots = entry.slots
    entry.slots = null
    report(id, entry, 'saving')
    entry.request = Promise.resolve().then(() => {
      if (!controller.signal.aborted) return save(id, slots, controller.signal)
    }).catch(() => null).then(result => {
      entry.request = null
      if (controller.signal.aborted || pending.get(id) !== entry) return false
      if (entry.slots !== null) return false
      if (!result?.ok) entry.slots = slots
      report(id, entry, result?.ok ? 'saved' : 'error', result)
      return Boolean(result?.ok)
    })
    return entry.request
  }

  return {
    schedule(id, slots) {
      if (controller.signal.aborted) return
      const entry = getEntry(id)
      entry.slots = slots
      clearTimeout(entry.timer)
      report(id, entry, 'saving')
      entry.timer = setTimeout(() => { void flush(id) }, delay)
    },
    flush,
    forget(id) {
      const entry = pending.get(id)
      if (entry) clearTimeout(entry.timer)
      pending.delete(id)
    },
    dispose() {
      controller.abort()
      for (const entry of pending.values()) clearTimeout(entry.timer)
      pending.clear()
    },
  }
}
