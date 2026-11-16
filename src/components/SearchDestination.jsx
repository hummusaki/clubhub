import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Card, IconButton } from './ui'

// Surface the exact selected record even if the page's previously selected
// filters would hide it. The ordinary list and its filters stay untouched.
export default function SearchDestination({ heading, children, onDismiss, dismissLabel = 'Dismiss selected result' }) {
  const target = useRef(null)
  useEffect(() => { target.current?.focus() }, [])
  return (
    <Card animate={false} className="section-pad space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 ref={target} tabIndex={-1} className="search-destination text-base font-medium break-words">{heading}</h2>
        <IconButton title={dismissLabel} size="sm" onClick={event => {
          const page = event.currentTarget.closest('.view-enter')
          onDismiss?.()
          page?.querySelector('h1')?.focus({ preventScroll: true })
        }}><X size={16} /></IconButton>
      </div>
      {children}
    </Card>
  )
}
