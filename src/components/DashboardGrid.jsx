import { useLayoutEffect, useRef } from 'react'
import { dashboardColumnCounts, packDashboardWidgets } from '../utils/dashboardLayout'

export default function DashboardGrid({ sections, widgets }) {
  const gridRef = useRef(null)
  const medium = dashboardColumnCounts(sections, 2)
  const wide = dashboardColumnCounts(sections, 3)
  const order = sections.join(' ')

  useLayoutEffect(() => {
    const grid = gridRef.current
    const nodes = [...grid.children]
    if (nodes.length < 2 || typeof ResizeObserver === 'undefined') return
    const sectionIds = nodes.map(node => node.dataset.widget)

    function update() {
      const style = getComputedStyle(grid)
      const maximum = Number(style.getPropertyValue('--dashboard-columns'))
      const packed = maximum > 1 && grid.clientWidth > 0
      grid.toggleAttribute('data-packed', packed)
      if (!packed) return

      const gap = parseFloat(style.rowGap)
      const columns = dashboardColumnCounts(sectionIds, maximum)
      const heights = Object.fromEntries(nodes.map(node => [node.dataset.widget, node.getBoundingClientRect().height]))
      const layout = packDashboardWidgets(sectionIds, heights, columns, gap)

      for (const node of nodes) {
        const id = node.dataset.widget
        const { column, top } = layout.positions[id]
        node.style.setProperty('--widget-top', `${top}px`)
        node.style.setProperty('--widget-column', column)
      }
      grid.style.setProperty('--dashboard-height', `${layout.height}px`)
    }

    update()
    const observer = new ResizeObserver(update)
    for (const node of nodes) observer.observe(node)
    return () => {
      observer.disconnect()
      grid.removeAttribute('data-packed')
    }
  }, [order])

  return (
    <div className="dashboard-layout">
      <div ref={gridRef} className="dashboard-widgets">
        {sections.map(id => (
          <div key={id} className="dashboard-widget" data-widget={id}
            style={{ '--widget-medium-columns': medium[id], '--widget-wide-columns': wide[id] }}>
            {widgets[id]}
          </div>
        ))}
      </div>
    </div>
  )
}
