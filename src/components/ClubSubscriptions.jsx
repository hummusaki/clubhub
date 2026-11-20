import { useId, useState } from 'react'
import { MenuSelect } from './Select'
import { Button, Card, ModalDialog, cleanText } from './ui'

const deliveryOptions = [
  { value: 'all', label: 'All' },
  { value: 'important', label: 'Important only' },
  { value: 'off', label: 'Off' },
]

export default function ClubSubscriptions({ value, ready, loadError, browserOnly, onReload, onSave, embedded = false }) {
  const id = useId()
  const [pending, setPending] = useState('')
  const [failure, setFailure] = useState(null)

  async function save(channel, mode) {
    setPending(channel)
    setFailure(null)
    const confirmed = await onSave(channel, mode).catch(() => false)
    setPending('')
    if (!confirmed) setFailure({ channel, mode })
  }

  const Container = embedded ? 'div' : Card

  return (
    <Container className={embedded ? 'space-y-3' : 'section-pad space-y-3'}>
      {!embedded && <h2 className="font-display text-lg" id={id}>Subscriptions</h2>}
      <div role="group" aria-labelledby={embedded ? undefined : id} aria-label={embedded ? 'Delivery preferences' : undefined} className="grid gap-3 sm:grid-cols-2">
        <MenuSelect label="Events" value={value.events} options={deliveryOptions}
          disabled={!ready || Boolean(pending)} onValueChange={mode => void save('events', mode)} />
        <MenuSelect label="Announcements" value={value.announcements} options={deliveryOptions}
          disabled={!ready || Boolean(pending)} onValueChange={mode => void save('announcements', mode)} />
      </div>
      {browserOnly && <p className="text-sm text-[var(--text-muted)]">Some subscription changes are saved in this browser only.</p>}
      {(pending || (!ready && !loadError)) && (
        <p role="status" className="text-sm text-[var(--text-muted)]">{pending ? 'Saving subscription…' : 'Loading subscriptions…'}</p>
      )}
      {failure && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-[var(--red-ink)]">
        Could not save your {failure.channel} subscription.
        <Button variant="outlined-neutral" size="sm" onClick={() => void save(failure.channel, failure.mode)}>Retry</Button>
      </div>}
      {loadError && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-[var(--red-ink)]">
        Could not refresh subscriptions.
        <Button variant="outlined-neutral" size="sm" onClick={onReload}>Retry refresh</Button>
      </div>}
    </Container>
  )
}

export function ClubSubscriptionManager({ clubs, subscriptions, ready, loadError, browserOnly, onReload, onSave, onClose }) {
  const [clubId, setClubId] = useState('')
  const club = clubs.find(item => String(item.id) === clubId) || clubs[0]

  return (
    <ModalDialog title="Club subscriptions" onClose={onClose}>
      {club ? <div className="space-y-4">
        <MenuSelect label="Club" value={String(club.id)} onValueChange={setClubId} search="auto"
          options={clubs.map(item => ({ value: String(item.id), label: cleanText(item.name) }))} />
        <ClubSubscriptions key={club.id} embedded value={subscriptions(club.id)} ready={ready}
          loadError={loadError} browserOnly={browserOnly} onReload={onReload} onSave={(channel, mode) => onSave(club.id, channel, mode)} />
      </div> : <p className="text-sm text-[var(--text-muted)]">Join a club to manage its event and announcement subscriptions.</p>}
    </ModalDialog>
  )
}
