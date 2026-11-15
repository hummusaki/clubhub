import { useState, useEffect, useMemo, useRef, useId } from 'react'
import { Calendar, Clock, ChevronDown, Check, X } from 'lucide-react'
import { normalizeTime24h, formatClockTime } from '../utils/taskReminders'

const HALF_HOUR_SLOTS_24H = (() => {
  const slots = []
  for (let h = 0; h < 24; h += 1) {
    const hh = String(h).padStart(2, '0')
    slots.push(`${hh}:00`)
    slots.push(`${hh}:30`)
  }
  slots.push('23:59')
  return slots
})()

const COMMON_MINUTES = [
  '00',
  '05',
  '10',
  '15',
  '20',
  '25',
  '30',
  '35',
  '40',
  '45',
  '50',
  '55',
  '59',
]

function parseParts(hhmm, is24h) {
  const clean = normalizeTime24h(hhmm) || '17:00'
  const [hStr, mStr] = clean.split(':')
  const h24 = Number(hStr)
  if (is24h) {
    return { hour: String(h24).padStart(2, '0'), minute: mStr, period: 'AM' }
  }
  const period = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return { hour: String(h12), minute: mStr, period }
}

function build24hFromParts({ hour, minute, period }, is24h) {
  const mm = String(Math.max(0, Math.min(59, Number(minute) || 0))).padStart(2, '0')
  if (is24h) {
    const hh = String(Math.max(0, Math.min(23, Number(hour) || 0))).padStart(2, '0')
    return `${hh}:${mm}`
  }
  let h12 = Number(hour) || 12
  if (h12 < 1) h12 = 12
  if (h12 > 12) h12 = 12
  let h24 = h12 % 12
  if (period === 'PM') h24 += 12
  return `${String(h24).padStart(2, '0')}:${mm}`
}

/**
 * Reliable, 1-click Time Selector Popover that works identically across Safari, Chrome,
 * Firefox, and mobile without relying on inconsistent native `<input type="time">` popups.
 */
export function TimePickerSelect({
  value = '',
  onChange,
  timeFormat = '12h',
  placeholder = 'All day (no time)',
  compact = false,
  ariaLabel = 'Due time',
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const listRef = useRef(null)
  const activeOptionRef = useRef(null)
  const optionsId = useId()

  const is24h = timeFormat === '24h'
  const cleanVal = normalizeTime24h(value)
  const parts = useMemo(() => parseParts(cleanVal, is24h), [cleanVal, is24h])

  const minuteChoices = useMemo(() => {
    if (COMMON_MINUTES.includes(parts.minute)) return COMMON_MINUTES
    return [...COMMON_MINUTES, parts.minute].sort()
  }, [parts.minute])

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = e => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    const timer = requestAnimationFrame(() => {
      const selected = activeOptionRef.current
      const list = listRef.current
      if (selected && list) {
        list.scrollTop += selected.getBoundingClientRect().top - list.getBoundingClientRect().top - list.clientHeight / 2
      }
    })
    return () => cancelAnimationFrame(timer)
  }, [open])

  function handleSelectSlot(nextVal) {
    if (onChange) onChange(nextVal)
    setOpen(false)
    triggerRef.current?.focus({ preventScroll: true })
  }

  function handlePartChange(patch) {
    const next24 = build24hFromParts({ ...parts, ...patch }, is24h)
    if (onChange) onChange(next24)
  }

  const scrollTargetSlot = cleanVal || '09:00'

  return (
    <div ref={rootRef} className="relative w-full" onKeyDown={e => {
      if (e.key !== 'Escape' || !open) return
      e.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus({ preventScroll: true })
    }}>
      <div
        className={`w-full ${
          compact ? 'min-h-[38px]' : 'min-h-[40px]'
        } px-3 rounded-lg bg-[var(--bg-surface)] border ${
          open ? 'border-[var(--blue)] ring-2 ring-[var(--blue)]/15' : 'border-[var(--md-outline)]'
        } flex items-center justify-between gap-2 transition-colors`}
      >
        <button
          ref={triggerRef}
          type="button"
          aria-label={ariaLabel}
          aria-controls={optionsId}
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}
          className="ui-touch flex-1 min-w-0 flex items-center gap-2 py-1.5 bg-transparent border-none text-left cursor-pointer"
        >
          <Clock
            size={14}
            className={cleanVal ? 'text-[var(--blue)] shrink-0' : 'text-[var(--text-light)] shrink-0'}
          />
          <span
            className={`truncate ${compact ? 'text-xs' : 'text-sm'} ${
              cleanVal ? 'font-semibold text-[var(--text)] font-mono-num' : 'text-[var(--text-muted)]'
            }`}
          >
            {cleanVal ? formatClockTime(cleanVal, timeFormat) : placeholder}
          </span>
          <ChevronDown aria-hidden="true" size={14}
            className={`ml-auto shrink-0 transition-transform ${open ? 'rotate-180 text-[var(--blue)]' : 'text-[var(--text-light)]'}`} />
        </button>

        <div className="flex items-center gap-1 shrink-0">
          {cleanVal && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                if (onChange) onChange('')
              }}
              aria-label="Clear due time"
              title="Clear time (set to All day)"
              className="ui-touch w-5 h-5 rounded-md bg-transparent hover:bg-[var(--bg-subtle)] text-[var(--text-light)] hover:text-[var(--text)] border-none flex items-center justify-center cursor-pointer"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {open && (
        <div
          id={optionsId}
          className="dense-controls mt-1.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-strong)] overflow-hidden fade-in"
        >
          {/* 1. All-Day Option */}
          <div className="p-1.5 border-b border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => handleSelectSlot('')}
              className={`w-full px-2.5 py-2 rounded-lg text-xs font-semibold flex items-center justify-between cursor-pointer border-none transition-colors ${
                !cleanVal
                  ? 'bg-[var(--blue-light)] text-[var(--blue-ink)]'
                  : 'bg-transparent text-[var(--text)] hover:bg-[var(--bg-surface)]'
              }`}
            >
              <span>All day (no specific time)</span>
              {!cleanVal && <Check size={13} />}
            </button>
          </div>

          {/* 2. Quick Scrollable Time List */}
          <div ref={listRef} className="max-h-[208px] overflow-y-auto p-1.5 space-y-0.5">
            {HALF_HOUR_SLOTS_24H.map(slot => {
              const selected = cleanVal === slot
              const isScrollAnchor =
                selected || (!HALF_HOUR_SLOTS_24H.includes(cleanVal) && slot === scrollTargetSlot)
              const slotLabel =
                slot === '23:59'
                  ? `${formatClockTime(slot, timeFormat)} (End of day)`
                  : formatClockTime(slot, timeFormat)

              return (
                <button
                  key={slot}
                  ref={isScrollAnchor ? activeOptionRef : null}
                  type="button"
                  onClick={() => handleSelectSlot(slot)}
                  className={`w-full px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between cursor-pointer border-none transition-colors ${
                    selected
                      ? 'bg-[var(--blue-light)] text-[var(--blue-ink)] font-bold'
                      : 'bg-transparent text-[var(--text)] hover:bg-[var(--bg-surface)] font-medium'
                  }`}
                >
                  <span className="font-mono-num">{slotLabel}</span>
                  {selected && <Check size={13} />}
                </button>
              )
            })}
          </div>

          {/* 3. Exact Custom Hour : Minute Controls */}
          <div className="p-2 bg-[var(--bg-surface)] border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex flex-wrap items-center gap-1 min-w-0">
              <span className="text-[10.5px] font-semibold text-[var(--text-muted)] mr-0.5 shrink-0">
                Exact:
              </span>
              <select
                aria-label="Hour"
                value={parts.hour}
                onChange={e => handlePartChange({ hour: e.target.value })}
                className="min-h-[28px] px-1.5 rounded-lg bg-[var(--bg-card)] text-xs font-semibold font-mono-num text-[var(--text)] border border-[var(--border)] cursor-pointer"
              >
                {is24h
                  ? Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))
                  : [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(h => (
                      <option key={h} value={String(h)}>
                        {h}
                      </option>
                    ))}
              </select>
              <span className="text-xs font-bold text-[var(--text-muted)]">:</span>
              <select
                aria-label="Minute"
                value={parts.minute}
                onChange={e => handlePartChange({ minute: e.target.value })}
                className="min-h-[28px] px-1.5 rounded-lg bg-[var(--bg-card)] text-xs font-semibold font-mono-num text-[var(--text)] border border-[var(--border)] cursor-pointer"
              >
                {minuteChoices.map(m => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              {!is24h && (
                <select
                  aria-label="AM or PM"
                  value={parts.period}
                  onChange={e => handlePartChange({ period: e.target.value })}
                  className="min-h-[28px] px-1.5 rounded-lg bg-[var(--bg-card)] text-xs font-semibold text-[var(--text)] border border-[var(--border)] cursor-pointer"
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                if (!cleanVal && onChange) {
                  onChange(build24hFromParts(parts, is24h))
                }
                setOpen(false)
                triggerRef.current?.focus({ preventScroll: true })
              }}
              className="px-2.5 min-h-[28px] rounded-lg bg-[var(--blue)] text-[var(--on-blue)] text-[11px] font-medium border-none cursor-pointer shrink-0 hover:opacity-90"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Clean, full-box-clickable Date Picker Input with 1-click clear button.
 */
export function DateInputField({
  value = '',
  onChange,
  compact = false,
  ariaLabel = 'Due date',
}) {
  const inputRef = useRef(null)

  function handleOpenNativeCalendar() {
    const el = inputRef.current
    if (!el) return
    try {
      if (typeof el.showPicker === 'function') {
        el.showPicker()
      }
    } catch {
      // Ignore if browser disallows programmatic showPicker
    }
  }

  return (
    <div
      className={`relative w-full ${
        compact ? 'min-h-[38px]' : 'min-h-[40px]'
      } px-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--md-outline)] focus-within:border-[var(--blue)] focus-within:ring-2 focus-within:ring-[var(--blue)]/15 flex items-center gap-2 transition-colors`}
    >
      <Calendar
        size={14}
        onClick={handleOpenNativeCalendar}
        className={
          value
            ? 'text-[var(--blue)] shrink-0 cursor-pointer'
            : 'text-[var(--text-light)] shrink-0 cursor-pointer'
        }
      />
      <input
        ref={inputRef}
        type="date"
        value={value || ''}
        onClick={handleOpenNativeCalendar}
        onChange={e => onChange && onChange(e.target.value)}
        aria-label={ariaLabel}
        className={`flex-1 min-w-0 bg-transparent border-none outline-none cursor-pointer ${
          compact ? 'text-xs' : 'text-sm'
        } ${value ? 'font-semibold text-[var(--text)]' : 'text-[var(--text-muted)]'} py-1.5`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange && onChange('')}
          aria-label="Clear due date"
          title="Clear date"
          className="w-5 h-5 rounded-md bg-transparent hover:bg-[var(--bg-subtle)] text-[var(--text-light)] hover:text-[var(--text)] border-none flex items-center justify-center cursor-pointer shrink-0"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}
