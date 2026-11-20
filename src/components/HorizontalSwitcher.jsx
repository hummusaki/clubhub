import { Children, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from './ui'

export default function HorizontalSwitcher({ label, selectedId, children }) {
  const viewport = useRef(null)
  const track = useRef(null)
  const [edges, setEdges] = useState({ back: false, forward: false })
  const itemKeys = JSON.stringify(Children.toArray(children).map(item => item.key).sort())

  function measure() {
    const node = viewport.current
    if (!node) return
    const back = node.scrollLeft > 1
    const forward = node.scrollLeft + node.clientWidth < node.scrollWidth - 1
    setEdges(previous => previous.back === back && previous.forward === forward ? previous : { back, forward })
  }

  function reveal(button) {
    const node = viewport.current
    if (!node || !button) return
    const bounds = node.getBoundingClientRect()
    const item = button.getBoundingClientRect()
    if (item.left < bounds.left + 4) node.scrollLeft += item.left - bounds.left - 4
    else if (item.right > bounds.right - 4) node.scrollLeft += item.right - bounds.right + 4
  }

  useLayoutEffect(() => {
    const observer = new ResizeObserver(measure)
    observer.observe(viewport.current)
    observer.observe(track.current)
    measure()
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    reveal(viewport.current?.querySelector('[aria-pressed="true"]'))
    measure()
  }, [selectedId, itemKeys])

  function step(direction) {
    const node = viewport.current
    if (node) node.scrollBy({ left: direction * node.clientWidth * .75 })
  }

  return (
    <div className="horizontal-switcher" role="group" aria-label={label}>
      <div ref={viewport} className="horizontal-switcher-viewport" onScroll={measure}
        onFocus={event => reveal(event.target)}>
        <div ref={track} className="horizontal-switcher-track">{children}</div>
      </div>
      {(edges.back || edges.forward) && (
        <div className="horizontal-switcher-arrows">
          <IconButton size="sm" ariaLabel={`Scroll ${label} left`} aria-disabled={!edges.back} onClick={() => step(-1)}>
            <ChevronLeft size={16} />
          </IconButton>
          <IconButton size="sm" ariaLabel={`Scroll ${label} right`} aria-disabled={!edges.forward} onClick={() => step(1)}>
            <ChevronRight size={16} />
          </IconButton>
        </div>
      )}
    </div>
  )
}
