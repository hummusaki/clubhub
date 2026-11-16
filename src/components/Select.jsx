import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Check, ChevronDown, LoaderCircle, Search, X } from 'lucide-react'

const normalize = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const optionKey = option => option.id ?? `${typeof option.value}:${option.value}`
const noOptions = []

// Keep the popup in its owner's DOM so clicks, Escape, and modal focus stay in the
// correct layer. The manual popover puts it above scroll containers and stacking contexts.
export function useAnchoredPopup(open, anchor, popup, { minWidth = 180, maxWidth = 384 } = {}) {
  useLayoutEffect(() => {
    if (!open || !anchor.current || !popup.current) return
    const trigger = anchor.current
    const panel = popup.current
    const viewport = window.visualViewport
    if (typeof panel.showPopover === 'function') panel.showPopover()
    else panel.removeAttribute('popover')

    function position() {
      const rect = trigger.getBoundingClientRect()
      const visibleTop = viewport?.offsetTop ?? 0
      const visibleLeft = viewport?.offsetLeft ?? 0
      const visibleBottom = visibleTop + (viewport?.height ?? window.innerHeight)
      const visibleRight = visibleLeft + (viewport?.width ?? window.innerWidth)
      const edge = 8
      const gap = 5
      const width = Math.min(Math.max(rect.width, minWidth), maxWidth, visibleRight - visibleLeft - 2 * edge)
      const left = Math.max(visibleLeft + edge, Math.min(rect.left, visibleRight - edge - width))
      const below = Math.max(0, visibleBottom - rect.bottom - edge - gap)
      const above = Math.max(0, rect.top - visibleTop - edge - gap)
      const preferAbove = below < Math.min(panel.scrollHeight, 240) && above > below
      const availableHeight = Math.min(320, preferAbove ? above : below)
      const anchorVisible = rect.bottom > visibleTop && rect.top < visibleBottom
      Object.assign(panel.style, {
        width: `${width}px`,
        left: `${left}px`,
        top: preferAbove ? 'auto' : `${rect.bottom + gap}px`,
        bottom: preferAbove ? `${window.innerHeight - rect.top + gap}px` : 'auto',
        maxHeight: `${availableHeight}px`,
        visibility: anchorVisible && availableHeight > 0 ? 'visible' : 'hidden',
      })
    }

    position()
    const observer = new ResizeObserver(position)
    observer.observe(trigger)
    observer.observe(panel)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    viewport?.addEventListener('resize', position)
    viewport?.addEventListener('scroll', position)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      viewport?.removeEventListener('resize', position)
      viewport?.removeEventListener('scroll', position)
      panel.hidePopover?.()
    }
  }, [open, anchor, popup, minWidth, maxWidth])
}

export default function Select({
  value = '',
  onValueChange,
  options = noOptions,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  id,
  name,
  required = false,
  disabled = false,
  readOnly = false,
  pending = false,
  loading = false,
  error,
  search = false,
  searchPlaceholder = 'Search options…',
  searchPredicate,
  freeText = false,
  placeholder = 'Select an option…',
  emptyLabel = 'No options available',
  clearValue,
  clearLabel = 'Clear selection',
  className = '',
  fullWidth = false,
  style,
  menuMinWidth,
  menuMaxWidth,
}) {
  const uid = useId()
  const fieldId = id || `${uid}-field`
  const listId = `${uid}-options`
  const errorId = `${uid}-error`
  const root = useRef(null)
  const control = useRef(null)
  const popup = useRef(null)
  const typeahead = useRef({ text: '', time: 0 })
  const [opened, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(null)
  const [invalid, setInvalid] = useState(false)
  const open = opened && !disabled && !readOnly
  const searchable = freeText || search === true || (search === 'auto' && options.length >= 9)
  const selected = options.find(option => Object.is(option.value, value))
  const label = selected?.label ?? (value === '' || value == null ? '' : String(value))
  const needle = normalize(String(freeText ? value ?? '' : query).trim())
  const matches = !searchable || !needle ? options : options.filter(option =>
    searchPredicate ? searchPredicate(option, needle) :
      normalize(`${option.label} ${option.description ?? ''} ${option.searchText ?? ''}`).includes(needle)
  )
  const enabled = matches.filter(option => !option.disabled)
  const active = enabled.find(option => optionKey(option) === highlight) ?? enabled[0]
  const activeId = active ? `${listId}-${encodeURIComponent(optionKey(active))}` : undefined
  const validationMessage = error || (invalid && (value === '' || value == null) && 'Select an option.')

  function openMenu(nextHighlight = selected && optionKey(selected), initialQuery = '') {
    if (disabled || readOnly) return
    setQuery(initialQuery)
    setHighlight(nextHighlight)
    setOpen(true)
  }

  function closeMenu(restoreFocus = false) {
    setOpen(false)
    setQuery('')
    typeahead.current = { text: '', time: 0 }
    if (restoreFocus) control.current?.focus({ preventScroll: true })
  }

  function choose(option) {
    if (!option || option.disabled) return
    setInvalid(false)
    closeMenu(true)
    if (!Object.is(option.value, value)) onValueChange?.(option.value)
  }

  useAnchoredPopup(open, root, popup, { minWidth: menuMinWidth, maxWidth: menuMaxWidth })

  useEffect(() => {
    if (!open) return
    const dismiss = event => {
      if (!root.current?.contains(event.target)) closeMenu()
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])

  useLayoutEffect(() => {
    if (!open || !activeId || !popup.current) return
    const option = document.getElementById(activeId)
    const list = popup.current
    if (!option) return
    const bounds = list.getBoundingClientRect()
    const item = option.getBoundingClientRect()
    if (item.bottom > bounds.bottom) list.scrollTop += item.bottom - bounds.bottom
    else if (item.top < bounds.top) list.scrollTop -= bounds.top - item.top
  }, [open, activeId])

  function handleKey(event) {
    if (event.nativeEvent.isComposing) return
    const { key } = event
    if (key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      closeMenu(true)
    } else if (key === 'Tab' && open) {
      closeMenu()
    } else if (key === 'ArrowDown' || key === 'ArrowUp' || (!searchable && ['Home', 'End'].includes(key))) {
      event.preventDefault()
      const index = enabled.indexOf(active)
      const next = key === 'Home' ? enabled[0] : key === 'End' ? enabled.at(-1) :
        !open ? (selected && !selected.disabled ? selected : enabled[key === 'ArrowDown' ? 0 : enabled.length - 1]) :
          enabled[Math.min(enabled.length - 1, Math.max(0, index + (key === 'ArrowDown' ? 1 : -1)))]
      if (open) setHighlight(next && optionKey(next))
      else openMenu(next && optionKey(next))
    } else if ((key === 'Enter' && (open || !freeText)) || (key === ' ' && !searchable)) {
      event.preventDefault()
      if (open) {
        if (active) choose(active)
        else closeMenu(true)
      } else openMenu()
    } else if (!searchable && key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      const now = performance.now()
      const letter = normalize(key)
      const previous = now - typeahead.current.time < 650 ? typeahead.current.text : ''
      const repeated = previous && [...previous].every(char => char === letter)
      const prefix = repeated ? letter : previous + letter
      typeahead.current = { time: now, text: prefix }
      const offset = active && (repeated || !previous) ? enabled.indexOf(active) + 1 : 0
      const match = [...enabled.slice(offset), ...enabled.slice(0, offset)].find(option =>
        normalize(option.label).startsWith(prefix)
      )
      if (open) {
        if (match) setHighlight(optionKey(match))
      } else openMenu(match && optionKey(match))
    }
  }

  const controlProps = {
    ref: control,
    id: fieldId,
    role: 'combobox',
    'aria-label': ariaLabel,
    'aria-labelledby': labelledBy,
    'aria-describedby': [describedBy, validationMessage ? errorId : null].filter(Boolean).join(' ') || undefined,
    'aria-controls': open ? listId : undefined,
    'aria-expanded': open,
    'aria-activedescendant': open ? activeId : undefined,
    'aria-required': required || undefined,
    'aria-readonly': readOnly || undefined,
    'aria-invalid': Boolean(validationMessage) || undefined,
    'aria-busy': pending || loading || undefined,
    className: 'app-select-control border-none',
    disabled,
    onKeyDown: handleKey,
  }

  function updateQuery(event) {
    const next = event.target.value
    if (freeText) onValueChange?.(next)
    if (!open) openMenu(null, next)
    else setQuery(next)
    setHighlight(null)
  }

  function renderOption(option) {
    const key = optionKey(option)
    return (
      <div
        key={key}
        id={`${listId}-${encodeURIComponent(key)}`}
        role="option"
        aria-selected={Object.is(option.value, value)}
        aria-disabled={option.disabled || undefined}
        data-active={active === option || undefined}
        className="app-select-option"
        onMouseDown={event => event.preventDefault()}
        onClick={() => choose(option)}
      >
        {option.icon && <span aria-hidden="true">{option.icon}</span>}
        <span className="min-w-0">
          <span className="block break-words">{option.label}</span>
          {option.description && <small className="block text-[var(--text-muted)]">{option.description}</small>}
        </span>
        <span className="app-select-option-check" aria-hidden="true">
          {Object.is(option.value, value) && <Check size={15} strokeWidth={2.5} />}
        </span>
      </div>
    )
  }

  const groups = new Map()
  for (const option of matches) {
    const group = option.group || ''
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push(option)
  }
  const canClear = clearValue !== undefined && !Object.is(clearValue, value)
  const showSearchClear = open && searchable && (freeText ? value : query)
  const icon = pending || loading ? <LoaderCircle size={15} className="motion-safe:animate-spin" /> :
    open && searchable ? <Search size={15} /> : <ChevronDown size={15} />

  return (
    <div
      ref={root}
      className={`app-select ${className}`}
      data-field-width={fullWidth ? 'full' : undefined}
      style={style}
      data-disabled={disabled || readOnly || undefined}
      data-invalid={Boolean(validationMessage) || undefined}
      data-expanded={open || undefined}
      onBlur={event => {
        if (open && event.relatedTarget && !root.current?.contains(event.relatedTarget)) closeMenu()
      }}
    >
      {searchable ? (
        <input
          {...controlProps}
          type="text"
          autoComplete="off"
          aria-autocomplete="list"
          readOnly={readOnly}
          value={freeText ? value || '' : open ? query : label}
          placeholder={open && !freeText ? searchPlaceholder : placeholder}
          title={!open ? label || undefined : undefined}
          onFocus={event => { if (!open && !freeText) event.currentTarget.select() }}
          onClick={() => { if (!open) openMenu() }}
          onChange={updateQuery}
        />
      ) : (
        <button
          {...controlProps}
          type="button"
          title={label || undefined}
          onClick={() => open ? closeMenu() : openMenu()}
        >
          <span>{label || placeholder}</span>
        </button>
      )}
      <span aria-hidden="true" className="app-select-icon">
        {icon}
      </span>
      {(searchable || clearValue !== undefined) && (
        <button
          type="button"
          aria-label={showSearchClear ? 'Clear search' : clearLabel}
          className="app-select-clear"
          tabIndex={-1}
          hidden={!showSearchClear && !canClear}
          disabled={disabled || readOnly}
          onMouseDown={event => event.preventDefault()}
          onClick={() => {
            if (showSearchClear) {
              if (freeText) onValueChange?.('')
              setQuery('')
              setHighlight(null)
            } else if (canClear) onValueChange?.(clearValue)
            control.current?.focus({ preventScroll: true })
          }}
        >
          <X size={14} />
        </button>
      )}
      {(required || name) && (
        <input
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          disabled={disabled}
          readOnly={!required}
          required={required}
          name={name}
          value={value ?? ''}
          onChange={() => {}}
          onInvalid={event => {
            event.preventDefault()
            setInvalid(true)
            control.current?.focus()
          }}
        />
      )}
      {validationMessage && <span id={errorId} className="sr-only" role="alert">{validationMessage}</span>}
      {open && (
        <div ref={popup} popover="manual" className="app-select-menu anchored-popup">
          <div
            id={listId}
            role="listbox"
            aria-label={ariaLabel || 'Options'}
            aria-labelledby={labelledBy}
            aria-busy={loading || undefined}
          >
            {Array.from(groups, ([group, items]) => group ? (
              <div key={group} role="group" aria-label={group}>
                <div aria-hidden="true" className="app-select-group">{group}</div>
                {items.map(renderOption)}
              </div>
            ) : <Fragment key="ungrouped">{items.map(renderOption)}</Fragment>)}
          </div>
          {!matches.length && (
            <div role="status" className="app-select-empty">
              {loading ? 'Loading options…' : needle ? 'No matches' : emptyLabel}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
