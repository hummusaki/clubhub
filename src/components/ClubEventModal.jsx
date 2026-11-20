import { useState } from 'react'
import { createClubEvent } from '../api/workspaceClient'
import { Button, ModalDialog } from './ui'

const inputClass = 'w-full rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2'

export default function ClubEventModal({ clubId, onClose, onPublished }) {
  const [allDay, setAllDay] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function publish(event) {
    event.preventDefault()
    if (pending) return
    const fields = new FormData(event.currentTarget)
    const date = key => {
      const value = fields.get(key)
      return value && !allDay ? new Date(value).toISOString() : value || null
    }
    setPending(true)
    setError('')
    const result = await createClubEvent(clubId, {
      title: fields.get('title'), start: date('start'), end: date('end'), allDay,
      location: fields.get('location'), important: fields.has('important'),
    }).catch(() => null)
    setPending(false)
    if (!result?.ok) {
      setError(result?.error || 'Could not publish the club event.')
      return
    }
    onPublished()
    onClose()
  }

  return (
    <ModalDialog title="Publish club event" onClose={() => { if (!pending) onClose() }}>
      <form className="space-y-3 text-sm" onSubmit={publish}>
        <label className="block">Title<input className={inputClass} name="title" maxLength={140} required /></label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={allDay} onChange={event => setAllDay(event.target.checked)} /> All day
        </label>
        <div key={String(allDay)} className="grid gap-2 sm:grid-cols-2">
          <label className="block">Starts<input className={inputClass} type={allDay ? 'date' : 'datetime-local'} name="start" required /></label>
          <label className="block">{allDay ? 'End date (exclusive, optional)' : 'Ends (optional)'}<input className={inputClass}
            type={allDay ? 'date' : 'datetime-local'} name="end" /></label>
        </div>
        <label className="block">Location<input className={inputClass} name="location" maxLength={200} /></label>
        <label className="flex items-center gap-2"><input type="checkbox" name="important" /> Mark as important</label>
        {error && <p role="alert" className="text-[var(--red-ink)]">{error}</p>}
        <div className="flex justify-end">
          <Button type="submit" pending={pending} pendingLabel="Publishing…">Publish event</Button>
        </div>
      </form>
    </ModalDialog>
  )
}
