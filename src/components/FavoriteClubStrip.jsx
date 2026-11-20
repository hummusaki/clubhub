import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GripVertical } from 'lucide-react'
import { normalizeClubKey } from '../utils/calendarSync'
import HorizontalSwitcher from './HorizontalSwitcher'
import { ClubAvatar, cleanText } from './ui'

export default function FavoriteClubStrip({ clubs, selectedId, onSelect, onReorder }) {
  const instructionsId = useId()
  const drag = useRef(null)
  const suppressClick = useRef(false)
  const focusAfterMove = useRef(null)
  const strip = useRef(null)
  const lift = useRef(null)
  const landing = useRef(null)
  const [preview, setPreview] = useState(null)
  const [announcement, setAnnouncement] = useState('')
  const ids = clubs.map(club => normalizeClubKey(club.id))
  const canReorder = ids.length > 1

  useEffect(() => () => cancelAnimationFrame(drag.current?.frame), [])

  useLayoutEffect(() => {
    const node = focusAfterMove.current
    if (!node) return
    focusAfterMove.current = null
    node.focus({ preventScroll: true })
  }, [clubs])

  useLayoutEffect(() => {
    if (preview || !landing.current) return
    const { node, x, y } = landing.current
    landing.current = null
    if (!node.isConnected || document.documentElement.classList.contains('reduce-motion') ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const bounds = node.getBoundingClientRect()
    node.animate?.([
      { transform: `translate(${x - bounds.left}px, ${y - bounds.top}px)` },
      { transform: 'translate(0, 0)' },
    ], { duration: 150, easing: 'ease-out' })
  }, [preview, clubs])

  function start(event, id) {
    if (!canReorder || !event.isPrimary || event.button !== 0 || drag.current) return
    suppressClick.current = false
    const node = event.currentTarget
    if (event.pointerType !== 'mouse' && !event.target.closest('.favorite-drag-grip')) return
    const bounds = node.getBoundingClientRect()
    const gap = parseFloat(getComputedStyle(node.parentElement).columnGap) || 0
    drag.current = {
      id, node, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      width: bounds.width, height: bounds.height, gap,
      grabX: event.clientX - bounds.left, grabY: event.clientY - bounds.top,
      viewport: strip.current.querySelector('.horizontal-switcher-viewport'),
    }
    node.setPointerCapture(event.pointerId)
  }

  function getPlacement(session, x) {
    const siblings = [...session.node.parentElement.children].filter(node => node !== session.node)
    const trackLeft = session.node.parentElement.getBoundingClientRect().left
    const liftedCenter = x - session.grabX + session.width / 2
    const next = siblings.find(node => liftedCenter < trackLeft + node.offsetLeft + node.offsetWidth / 2)
    return next?.dataset.favoriteId ?? null
  }

  function updatePreview(session) {
    session.frame = null
    if (drag.current !== session) return
    positionLift(session)
    const { left, right, top, bottom } = session.viewport.getBoundingClientRect()
    const inside = session.x >= left - 12 && session.x <= right + 12 && session.y >= top - 12 && session.y <= bottom + 12
    const beforeId = inside ? getPlacement(session, session.x) : undefined
    if (beforeId !== session.beforeId || !session.activePreview) {
      session.beforeId = beforeId
      session.activePreview = true
      setPreview({ movingId: session.id, beforeId, width: session.width, height: session.height, gap: session.gap })
    }
    const direction = session.x < left + 22 ? -1 : session.x > right - 22 ? 1 : 0
    if (inside && direction) {
      const previousScroll = session.viewport.scrollLeft
      session.viewport.scrollLeft += direction * 12
      if (session.viewport.scrollLeft !== previousScroll) {
        session.frame = requestAnimationFrame(() => updatePreview(session))
      }
    }
  }

  function positionLift(session) {
    if (lift.current && session?.active) {
      lift.current.style.transform = `translate3d(${session.x - session.grabX}px, ${session.y - session.grabY}px, 0)`
    }
  }

  function move(event) {
    const session = drag.current
    if (session?.pointerId !== event.pointerId) return
    if (!session.active && Math.abs(event.clientX - session.startX) < 5 && Math.abs(event.clientY - session.startY) < 5) return
    session.active = true
    session.x = event.clientX
    session.y = event.clientY
    if (session.frame == null) updatePreview(session)
  }

  function reorder(id, beforeId, node) {
    const current = ids.indexOf(id)
    if (current < 0 || (ids[current + 1] ?? null) === beforeId) return
    if (node) focusAfterMove.current = node
    onReorder(id, beforeId)
    const before = ids.indexOf(beforeId)
    const position = before < 0 ? ids.length : before + Number(current > before)
    setAnnouncement(`${cleanText(clubs[current].name)} moved to position ${position} of ${ids.length}.`)
  }

  function finish(event, drop = false) {
    const session = drag.current
    if (!session || (event.pointerId != null && event.pointerId !== session.pointerId)) return
    drag.current = null
    cancelAnimationFrame(session.frame)
    if (!session.active) return
    suppressClick.current = true
    landing.current = {
      node: session.node,
      x: (drop ? event.clientX : session.x) - session.grabX,
      y: (drop ? event.clientY : session.y) - session.grabY,
    }
    setPreview(null)
    const { left, right, top, bottom } = session.viewport.getBoundingClientRect()
    if (drop && event.clientX >= left - 12 && event.clientX <= right + 12 && event.clientY >= top - 12 && event.clientY <= bottom + 12) {
      reorder(session.id, getPlacement(session, event.clientX))
    }
  }

  function handleKeys(event, id, index) {
    if (event.key === 'Escape' && drag.current?.active) {
      finish(event)
      return
    }
    if (!canReorder || !event.shiftKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    const offset = event.key === 'ArrowLeft' ? -1 : 1
    if (ids[index + offset]) reorder(id, ids[index + (offset < 0 ? -1 : 2)] ?? null, event.currentTarget)
  }

  const liftIndex = preview ? ids.indexOf(preview.movingId) : -1
  const dropIndex = preview?.beforeId === null ? ids.length : ids.indexOf(preview?.beforeId)
  const liftedClub = clubs[liftIndex]

  function chipContent(club) {
    const fullName = cleanText(club.name)
    const shortName = cleanText(club.shortName || fullName.match(/\bACM[-– ]W\b/i)?.[0] || fullName)
    return <>
      {canReorder && <span className="favorite-drag-grip" aria-hidden="true"><GripVertical size={14} /></span>}
      <ClubAvatar club={club} size={26} />
      <span className="truncate">{shortName}</span>
    </>
  }

  return (
    <div ref={strip} className="task-favorite-strip" onPointerDownCapture={() => { suppressClick.current = false }}>
      {canReorder && <span className="sr-only" id={instructionsId}>Drag to reorder, or use Shift and the Left or Right arrow key.</span>}
      <HorizontalSwitcher label="Starred clubs" selectedId={selectedId}>
        {clubs.map((club, index) => {
          const id = ids[index]
          const fullName = cleanText(club.name)
          let shift = 0
          if (dropIndex >= 0 && liftIndex >= 0) {
            if (index > liftIndex && index < dropIndex) shift = -1
            if (index < liftIndex && index >= dropIndex) shift = 1
          }
          return (
            <button key={id} type="button" className="switcher-chip task-favorite-chip" title={fullName}
              data-favorite-id={id} data-dragging={preview?.movingId === id || undefined}
              style={preview ? { '--favorite-shift': `${shift * (preview.width + preview.gap)}px` } : undefined}
              aria-label={fullName} aria-pressed={id === selectedId} aria-describedby={canReorder ? instructionsId : undefined}
              onDragStart={event => event.preventDefault()}
              onPointerDown={event => start(event, id)} onPointerMove={move} onPointerUp={event => finish(event, true)}
              onPointerCancel={finish} onLostPointerCapture={finish} onKeyDown={event => handleKeys(event, id, index)}
              onClick={event => {
                if (event.detail > 0 && suppressClick.current) return
                onSelect(club.id)
              }}>
              {chipContent(club)}
            </button>
          )
        })}
      </HorizontalSwitcher>
      {liftedClub && createPortal(
        <div ref={node => { lift.current = node; positionLift(drag.current) }} aria-hidden="true"
          data-selected={preview.movingId === selectedId || undefined}
          className="switcher-chip task-favorite-lift"
          style={{ width: preview.width, height: preview.height }}>
          {chipContent(liftedClub)}
        </div>,
        document.body
      )}
      <span className="sr-only" role="status">{announcement}</span>
    </div>
  )
}
