export const DASHBOARD_SECTIONS = {
  summary: 'Summary counts',
  schedule: 'Upcoming schedule',
  announcements: 'Announcements',
  clubs: 'My clubs',
  resources: 'Resources',
  miniCalendar: 'Mini calendar',
}

export const DEFAULT_DASHBOARD_LAYOUT = {
  version: 1, sections: ['summary', 'schedule', 'announcements', 'clubs', 'resources'],
}

export function normalizeDashboardLayout(saved) {
  const sections = saved?.version === 1 && Array.isArray(saved.sections)
    ? saved.sections
    : DEFAULT_DASHBOARD_LAYOUT.sections
  return { version: 1, sections: [...new Set(sections.filter(id => Object.hasOwn(DASHBOARD_SECTIONS, id)))] }
}

export function dashboardColumnCounts(sections, maximum) {
  const counts = {}
  let run = []
  function finishRun() {
    const columns = Math.min(maximum, run.length === 4 ? 2 : run.length)
    for (const id of run) counts[id] = columns
    run = []
  }

  for (const id of sections) {
    if (id === 'summary') {
      finishRun()
      counts[id] = 1
    } else {
      run.push(id)
    }
  }
  finishRun()
  return counts
}

function isScheduleResourcesPair(id, next) {
  return (id === 'schedule' && next === 'resources') || (id === 'resources' && next === 'schedule')
}

export function packDashboardWidgets(sections, heights, columnCounts, gap) {
  let bottoms = [0]
  let previousTop = -1
  let previousColumn = -1
  const positions = {}

  for (let index = 0; index < sections.length; index += 1) {
    const id = sections[index]
    const columns = columnCounts[id]
    if (bottoms.length !== columns || id === 'summary') {
      bottoms = Array(columns).fill(Math.max(...bottoms))
    }

    const next = sections[index + 1]
    const pair = columns > 1 && isScheduleResourcesPair(id, next)
    const available = bottoms.map((bottom, column) => ({
      column,
      top: Math.max(bottom, previousTop + Number(column <= previousColumn)),
    }))
    const candidates = pair
      ? available.slice(0, -1).map(({ column, top }) => ({ column, top: Math.max(top, available[column + 1].top) }))
      : available
    const { column: firstColumn } = candidates.reduce((best, slot) => slot.top < best.top ? slot : best)
    const count = pair ? 2 : 1

    for (let offset = 0; offset < count; offset += 1) {
      const column = firstColumn + offset
      const key = sections[index + offset]
      // The neighboring cards each start where there is room in their own column.
      const { top } = available[column]
      positions[key] = { column, top }
      bottoms[column] = top + heights[key] + gap
      if (top >= previousTop) {
        previousColumn = column
        previousTop = top
      }
    }
    if (pair) index += 1
  }

  return { positions, height: Math.max(0, Math.max(...bottoms) - gap) }
}
