import { useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { DASHBOARD_SECTIONS, DEFAULT_DASHBOARD_LAYOUT, normalizeDashboardLayout } from '../utils/dashboardLayout'
import { Button, IconButton, ModalDialog } from './ui'

export default function DashboardEditor({ sections, onSave, onClose }) {
  const [draft, setDraft] = useState(sections)
  const focusTarget = useRef(null)

  useLayoutEffect(() => {
    focusTarget.current?.()
    focusTarget.current = null
  }, [draft])

  const controls = useRef(null)
  function edit(next, id, action) {
    focusTarget.current = () => {
      const target = controls.current.querySelector(`[data-section="${id}"] [data-action="${action}"]:not(:disabled)`)
      const fallback = controls.current.querySelector(`[data-section="${id}"] button:not(:disabled)`)
      const focus = target || fallback
      focus?.focus()
    }
    setDraft(next)
  }

  function move(index, offset) {
    const next = [...draft]
    const id = next[index]
    const target = index + offset
    next[index] = next[target]
    next[target] = id
    edit(next, id, offset < 0 ? 'up' : 'down')
  }

  return (
    <ModalDialog title="Customize dashboard" onClose={onClose} footer={<div className="flex w-full flex-wrap justify-between gap-2">
      <Button variant="text" onClick={() => setDraft(DEFAULT_DASHBOARD_LAYOUT.sections)}>Restore default</Button>
      <div className="ml-auto flex gap-2">
        <Button variant="text-neutral" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSave(normalizeDashboardLayout({ version: 1, sections: draft }))}>Save</Button>
      </div>
    </div>}>
      <div ref={controls} className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Visible sections</h3>
          {draft.length ? <ol className="divide-y divide-[var(--border)]">
            {draft.map((id, index) => <li key={id} data-section={id} className="flex flex-wrap items-center justify-between gap-1 py-1">
              <span className="text-sm">{DASHBOARD_SECTIONS[id]}</span>
              <div className="flex">
                <IconButton size="sm" data-action="up" ariaLabel={`Move ${DASHBOARD_SECTIONS[id]} up`}
                  disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} /></IconButton>
                <IconButton size="sm" data-action="down" ariaLabel={`Move ${DASHBOARD_SECTIONS[id]} down`}
                  disabled={index === draft.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} /></IconButton>
                <IconButton size="sm" data-action="remove" ariaLabel={`Remove ${DASHBOARD_SECTIONS[id]}`}
                  onClick={() => edit(draft.filter(section => section !== id), id, 'add')}><X size={16} /></IconButton>
              </div>
            </li>)}
          </ol> : <p className="mt-2 text-sm text-[var(--text-muted)]">No visible sections.</p>}
        </div>
        <div>
          <h3 className="text-sm font-semibold">Available sections</h3>
          <ul className="divide-y divide-[var(--border)]">
            {Object.entries(DASHBOARD_SECTIONS).filter(([id]) => !draft.includes(id)).map(([id, label]) => (
              <li key={id} data-section={id} className="flex items-center justify-between gap-2 py-1">
                <span className="text-sm">{label}</span>
                <Button size="sm" variant="outlined-neutral" icon={<Plus size={14} />} ariaLabel={`Add ${label}`}
                  data-action="add" onClick={() => edit([...draft, id], id, 'remove')}>Add</Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ModalDialog>
  )
}
