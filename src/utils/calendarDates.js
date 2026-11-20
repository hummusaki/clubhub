export function toLocalYmd(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(+date)) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function parseYmdLocal(value) {
  const [year, month, day] = String(value).split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1, 12)
}

export function calendarEventDate(event) {
  const start = event.startIso || event.start
  if (!start) return ''
  if (event.allDay && /^\d{4}-\d{2}-\d{2}(?:$|T00:00:00(?:\.0+)?Z$)/.test(start)) return start.slice(0, 10)
  return toLocalYmd(start)
}

export function allDayEventDates(event) {
  const start = calendarEventDate(event)
  if (!start) return null
  const explicitEnd = calendarEventDate({ allDay: true, start: event.endIso || event.end })
  const nextDay = new Date(start)
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)
  return { start, end: explicitEnd > start ? explicitEnd : nextDay.toISOString().slice(0, 10) }
}

export function calendarEventRange(event, use24h) {
  if (event.allDay) return 'All day'
  const start = new Date(event.startIso || event.start)
  const endValue = event.endIso || event.end
  const end = endValue ? new Date(endValue) : null
  if (!Number.isFinite(+start)) return event.time || 'Time pending'
  const clock = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', hourCycle: use24h ? 'h23' : 'h12',
  })
  if (!end || !Number.isFinite(+end) || end <= start) return clock.format(start)
  if (toLocalYmd(start) !== toLocalYmd(end)) {
    const day = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(end)
    return `${clock.format(start)}–${clock.format(end)} ${day}`
  }
  return clock.formatRange(start, end)
}
