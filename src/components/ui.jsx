import { useState, useEffect, useId, useRef } from 'react'
import { X, Check, Search, ChevronDown, MoreHorizontal, LoaderCircle, Users } from 'lucide-react'

/**
 * Google Material Design 3 (M3) & Google Workspace UI Primitives for ClubHub.
 */

// ── Text sanitizer (strips emojis & redundant bracket prefixes from backend payloads) ──
const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu
const SOURCE_PREFIX_REGEX = /^\s*\[(?:Discord[^\]]*|Google Calendar|Club Website|Mailing List:[^\]]*)\]\s*/i

export function cleanText(str) {
  if (!str || typeof str !== 'string') return str || ''
  return str
    .replace(EMOJI_REGEX, '')
    .replace(SOURCE_PREFIX_REGEX, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function cleanMultilineText(str) {
  if (!str || typeof str !== 'string') return str || ''
  return str
    .replace(/\r\n?/g, '\n')
    .replace(EMOJI_REGEX, '')
    .replace(SOURCE_PREFIX_REGEX, '')
    .split('\n')
    .map(line => line.replace(/[ \t]{2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── Google Workspace 4-Color ClubHub Brand Mark ──
export function ClubHubLogo({ size = 36, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
    >
      <rect
        x="5"
        y="5"
        width="54"
        height="54"
        rx="15"
        className="fill-[var(--bg-card)] stroke-[var(--border)]"
        strokeWidth="1.5"
      />
      <path
        d="M41.5 22.5A13.5 13.5 0 0 0 18.5 32"
        stroke="#4285F4"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M18.5 32A13.5 13.5 0 0 0 41.5 41.5"
        stroke="#34A853"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="24" cy="22.5" r="5" fill="#4285F4" />
      <circle cx="24" cy="41.5" r="5" fill="#34A853" />
      <circle cx="42" cy="22.5" r="5" fill="#EA4335" />
      <circle cx="42" cy="41.5" r="5" fill="#FBBC04" />
      <path
        d="M32 25.5C32.55 28.9 35.1 31.45 38.5 32C35.1 32.55 32.55 35.1 32 38.5C31.45 35.1 28.9 32.55 25.5 32C28.9 31.45 31.45 28.9 32 25.5Z"
        fill="#4285F4"
      />
    </svg>
  )
}

// ── Material 3 Button Primitive ──
// Variants: 'filled' | 'tonal' | 'outlined' | 'text' | 'danger' | 'danger-tonal'
// Sizes: 'sm' (32px) | 'md' (40px) | 'lg' (44px)
// Keep pending labels in the same centered space as the idle label.
// pendingLabel and reserveLabels participate in sizing while hidden from assistive technology.
export function Button({
  children,
  variant = 'filled',
  size = 'md',
  icon = null,
  leadingIcon = null,
  trailingIcon = null,
  type = 'button',
  disabled = false,
  pending,
  pendingLabel,
  reserveLabels = [],
  className = '',
  onClick,
  title,
  ariaLabel,
  ...rest
}) {
  const leading = icon || leadingIcon
  const hasLeading = Boolean(leading)
  const hasTrailing = Boolean(trailingIcon)
  const hasLabel = children != null
  const labelSpinner = pending !== undefined && !hasLeading && !hasTrailing

  let sizeClasses = ''
  if (size === 'sm') {
    const pad =
      variant === 'text'
        ? 'px-3'
        : hasLabel && hasLeading && !hasTrailing
          ? 'pl-3 pr-4'
          : hasLabel && !hasLeading && hasTrailing
            ? 'pl-4 pr-3'
            : 'px-4'
    sizeClasses = `h-8 min-h-[32px] text-xs gap-1.5 ${pad}`
  } else if (size === 'lg') {
    const pad =
      variant === 'text'
        ? 'px-4'
        : hasLabel && hasLeading && !hasTrailing
          ? 'pl-5 pr-6'
          : hasLabel && !hasLeading && hasTrailing
            ? 'pl-6 pr-5'
            : 'px-6'
    sizeClasses = `h-11 min-h-[44px] text-sm gap-2 ${pad}`
  } else {
    const pad =
      variant === 'text'
        ? 'px-3.5'
        : hasLabel && hasLeading && !hasTrailing
          ? 'pl-4 pr-6'
          : hasLabel && !hasLeading && hasTrailing
            ? 'pl-6 pr-4'
            : 'px-6'
    sizeClasses = `min-h-9 py-1.5 text-sm gap-2 ${pad}`
  }

  const variantMap = {
    filled:
      'bg-[var(--blue)] text-[var(--on-blue)] border border-transparent hover:shadow-[var(--shadow-xs)]',
    tonal:
      'bg-[var(--secondary-container)] text-[var(--on-secondary-container)] border border-transparent',
    outlined:
      'bg-transparent text-[var(--blue)] border border-[var(--md-outline)] hover:border-[var(--blue)]',
    'outlined-neutral':
      'bg-transparent text-[var(--text)] border border-[var(--md-outline)] hover:border-[var(--text)]',
    text:
      'bg-transparent text-[var(--blue)] border border-transparent',
    'text-neutral':
      'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)] border border-transparent',
    danger:
      'bg-[var(--red)] text-[var(--on-red)] border border-transparent hover:shadow-[var(--shadow-xs)]',
    'danger-tonal':
      'bg-[var(--red-light)] text-[var(--red-ink)] border border-transparent',
  }

  const variantClasses = variantMap[variant] || variantMap.filled

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={event => {
        if (pending) {
          event.preventDefault()
          return
        }
        onClick?.(event)
      }}
      title={title}
      aria-label={ariaLabel}
      aria-busy={pending || undefined}
      data-button-padding={labelSpinner && size !== 'sm' && !variant.startsWith('text') ? 'wide' : undefined}
      aria-disabled={pending || undefined}
      className={`ui-touch md-state-layer inline-flex items-center justify-center rounded-full font-medium tracking-[0.01em] select-none shrink-0 transition-[box-shadow,border-color,background-color,color] duration-150 ${
        disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'cursor-pointer'
      } ${sizeClasses} ${variantClasses} ${className} ${labelSpinner ? 'async-label-button' : ''}`}
      {...rest}
    >
      {hasLeading && (
        <span className="relative inline-grid place-items-center shrink-0">
          <span className={`col-start-1 row-start-1 inline-flex ${pending ? 'invisible' : ''}`}>{leading}</span>
          {pending && <LoaderCircle aria-hidden="true" size={14} className="absolute motion-safe:animate-spin" />}
        </span>
      )}
      {children != null && (pendingLabel || reserveLabels.length ? (
        <span className="inline-grid min-w-0 place-items-center">
          {pendingLabel && <span aria-hidden="true" className="invisible col-start-1 row-start-1">{pendingLabel}</span>}
          {reserveLabels.map(label => (
            <span aria-hidden="true" key={label} className="invisible col-start-1 row-start-1">{label}</span>
          ))}
          <span className={`col-start-1 row-start-1 ${pending && pendingLabel ? 'invisible' : ''}`} aria-hidden={pending && pendingLabel ? true : undefined}>
            {children}
          </span>
          {pending && pendingLabel && <span className="col-start-1 row-start-1">{pendingLabel}</span>}
        </span>
      ) : <span>{children}</span>)}
      {trailingIcon && (
        <span className="relative inline-grid place-items-center shrink-0">
          <span className={`inline-flex ${pending && !hasLeading ? 'invisible' : ''}`}>{trailingIcon}</span>
          {pending && !hasLeading && <LoaderCircle aria-hidden="true" size={14} className="absolute motion-safe:animate-spin" />}
        </span>
      )}
      {pending && labelSpinner && (
        <LoaderCircle aria-hidden="true" size={12} className="async-label-spinner motion-safe:animate-spin" />
      )}
    </button>
  )
}

// ── Material 3 Circular Icon Button ──
// Sizes: 'sm' (36x36px) | 'md' (40x40px)
export function IconButton({
  children,
  variant = 'standard',
  size = 'md',
  selected = false,
  type = 'button',
  disabled = false,
  ariaLabel,
  title,
  onClick,
  className = '',
  ...rest
}) {
  const dim = size === 'sm' ? 'w-9 h-9 min-w-[36px] min-h-[36px]' : 'w-10 h-10 min-w-[40px] min-h-[40px]'

  let variantClasses = ''
  if (variant === 'filled') {
    variantClasses = 'bg-[var(--blue)] text-[var(--on-blue)] border border-transparent'
  } else if (variant === 'tonal' || selected) {
    variantClasses =
      'bg-[var(--secondary-container)] text-[var(--on-secondary-container)] border border-transparent'
  } else if (variant === 'outlined') {
    variantClasses =
      'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--md-outline-variant)] hover:border-[var(--md-outline)]'
  } else if (variant === 'danger') {
    variantClasses =
      'bg-transparent text-[var(--text-muted)] hover:text-[var(--red)] hover:bg-[var(--red-light)] border border-transparent'
  } else {
    variantClasses =
      'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)] border border-transparent'
  }

  return (
    <button
      type={type}
      disabled={disabled}
      aria-label={ariaLabel || title}
      title={title}
      onClick={onClick}
      className={`ui-touch md-state-layer inline-flex items-center justify-center rounded-full shrink-0 select-none transition-colors duration-150 ${
        disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'cursor-pointer'
      } ${dim} ${variantClasses} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

// ── Material 3 Outlined Segmented Button ──
export function SegmentedControl({
  options = [],
  value,
  onChange,
  size = 'md',
  showCheck = true,
  className = '',
  ariaLabel,
}) {
  const heightClass = size === 'sm' ? 'h-8 min-h-[32px] px-3 text-xs' : 'h-10 min-h-[40px] px-4 text-sm'

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`segmented-track select-none ${className}`}
    >
      {options.map(opt => {
        const isSelected = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange && onChange(opt.value)}
            className={`ui-touch md-state-layer flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 font-medium border-none cursor-pointer transition-colors duration-150 whitespace-nowrap ${heightClass} ${
              isSelected
                ? 'bg-[var(--secondary-container)] text-[var(--on-secondary-container)]'
                : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {showCheck && (isSelected || !opt.icon) ? (
              <Check aria-hidden="true" size={size === 'sm' ? 14 : 16} className={`shrink-0 ${isSelected ? '' : 'invisible'}`} />
            ) : opt.icon ? (
              <span className="inline-flex items-center shrink-0">{opt.icon}</span>
            ) : null}
            <span>{opt.label}</span>
            {opt.badge !== undefined && opt.badge !== null && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono-num ${
                  isSelected
                    ? 'bg-[var(--bg-card)]/70 text-[var(--on-secondary-container)]'
                    : 'bg-[var(--bg-surface)] text-[var(--text-muted)]'
                }`}
              >
                {opt.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Material 3 Primary Underline Tabs ──
export function Tabs({ tabs = [], activeId, onChange, ariaLabel, className = '' }) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-[var(--border)] select-none ${className}`}
    >
      {tabs.map(tab => {
        const isActive = activeId === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange && onChange(tab.id)}
            className={`md-state-layer relative inline-flex items-center gap-2 px-4 h-11 min-h-[44px] text-sm font-medium bg-transparent border-none cursor-pointer shrink-0 whitespace-nowrap transition-colors ${
              isActive
                ? 'text-[var(--blue)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {tab.icon && <span className="inline-flex items-center shrink-0">{tab.icon}</span>}
            {tab.shortLabel ? (
              <>
                <span className="sm:hidden">{tab.shortLabel}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </>
            ) : (
              <span>{tab.label}</span>
            )}
            {tab.count !== undefined && tab.count !== null && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[11px] font-mono-num leading-none ${
                  isActive
                    ? 'bg-[var(--secondary-container)] text-[var(--on-secondary-container)]'
                    : 'bg-[var(--bg-surface)] text-[var(--text-muted)]'
                }`}
              >
                {tab.count}
              </span>
            )}
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-3 right-3 h-[3px] rounded-t-full bg-[var(--blue)]"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Material 3 Filter Chip (8dp corner radius, 32dp height) ──
export function FilterChip({
  label,
  count,
  selected = false,
  icon = null,
  onClick,
  className = '',
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`ui-touch md-state-layer shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 h-8 min-h-[32px] rounded-lg text-xs font-medium cursor-pointer border transition-colors duration-150 ${
        selected
          ? 'pl-2.5 pr-3 bg-[var(--secondary-container)] text-[var(--on-secondary-container)] border-transparent'
          : 'px-3 bg-transparent text-[var(--text-muted)] hover:text-[var(--text)] border-[var(--md-outline-variant)] hover:border-[var(--md-outline)]'
      } ${className}`}
    >
      {selected ? (
        <Check size={14} className="shrink-0" />
      ) : icon ? (
        <span className="inline-flex items-center shrink-0">{icon}</span>
      ) : null}
      <span>{label}</span>
      {count !== undefined && count !== null && (
        <span
          className={`text-[11px] font-mono-num ${
            selected ? 'text-[var(--on-secondary-container)] opacity-85' : 'text-[var(--text-light)]'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )
}

export function PageToolbar({ title, context, actions }) {
  return (
    <div className="page-toolbar">
      <div className="min-w-0">
        <h1 tabIndex={-1} className="page-title">{title}</h1>
        {context}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 min-w-0">{actions}</div>}
    </div>
  )
}

export function ActionDisclosure({
  label, count, pending, pendingLabel, icon, iconOnly = false, children, className = '', panelClassName = '',
}) {
  const [open, setOpen] = useState(false)
  const root = useRef(null)
  const id = useId()

  function close({ restoreFocus = true } = {}) {
    setOpen(false)
    if (restoreFocus) root.current?.querySelector('button')?.focus()
  }

  useEffect(() => {
    if (!open) return
    function handleOutside(event) {
      if (!root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', handleOutside)
    return () => document.removeEventListener('pointerdown', handleOutside)
  }, [open])

  return (
    <div
      ref={root}
      className={`relative ${className}`}
      onKeyDown={event => {
        if (!open || event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        close()
      }}
    >
      {iconOnly ? (
        <IconButton variant="outlined" size="sm" selected={Boolean(count)} ariaLabel={label} title={label} aria-controls={id} aria-expanded={open} onClick={() => setOpen(value => !value)}>
          {icon || <MoreHorizontal size={18} />}
        </IconButton>
      ) : (
        <Button variant="outlined-neutral" size="sm"
          icon={pending ? <LoaderCircle size={14} className="motion-safe:animate-spin" /> : icon}
          trailingIcon={<ChevronDown size={14} />}
          reserveLabels={pendingLabel ? [label, pendingLabel] : undefined}
          aria-busy={pending || undefined}
          aria-controls={id} aria-expanded={open} onClick={() => setOpen(value => !value)}>
          {pending && pendingLabel ? pendingLabel : label}
          {count !== undefined && (
            <span className={`ml-1 inline-block min-w-[2ch] tabular-nums ${count ? '' : 'invisible'}`}>
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Button>
      )}
      <div id={id} hidden={!open} className={`action-disclosure absolute right-0 top-full z-30 mt-1 min-w-44 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-1 shadow-[var(--shadow-md)] ${panelClassName}`}>
        {open && children(close)}
      </div>
    </div>
  )
}

export function ActionItem({ children, icon, onClick, disabled, pending, pendingLabel, danger = false }) {
  return (
    <button
      type="button"
      className={`ui-touch flex min-h-9 w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-[var(--bg-subtle)] disabled:opacity-45 ${danger ? 'text-[var(--red-ink)]' : 'text-[var(--text)]'}`}
      onClick={event => {
        if (!pending) onClick?.(event)
      }}
      disabled={disabled && !pending}
      aria-disabled={pending || undefined}
      aria-busy={pending || undefined}
    >
      {pending ? <LoaderCircle size={14} aria-hidden="true" className="shrink-0 motion-safe:animate-spin" /> : icon}
      {pendingLabel ? (
        <span className="inline-grid">
          <span aria-hidden="true" className="invisible col-start-1 row-start-1">{pendingLabel}</span>
          <span className={`col-start-1 row-start-1 ${pending ? 'invisible' : ''}`}>{children}</span>
          {pending && <span className="col-start-1 row-start-1">{pendingLabel}</span>}
        </span>
      ) : children}
    </button>
  )
}

// ── Material 3 28dp Dialog Container ──
export function ModalDialog({
  open = true,
  onClose,
  title,
  subtitle,
  icon = null,
  iconColor = 'blue',
  maxWidth = 'max-w-lg',
  footer = null,
  children,
  ariaLabel,
}) {
  const backdrop = useRef(null)
  const panel = useRef(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    const dialog = panel.current
    if (!dialog.contains(document.activeElement)) {
      const initialFocus = dialog.querySelector('[data-initial-focus]') || dialog
      initialFocus.focus({ preventScroll: true })
    }
    return () => {
      if (previous?.isConnected && (dialog.contains(document.activeElement) || document.activeElement === document.body)) {
        previous.focus({ preventScroll: true })
      }
    }
  }, [open])

  useEffect(() => {
    const viewport = window.visualViewport
    const overlay = backdrop.current
    if (!open || !viewport || !overlay) return

    function updateViewport() {
      overlay.style.setProperty('--dialog-viewport-height', `${viewport.height}px`)
      overlay.style.setProperty('--dialog-viewport-top', `${viewport.offsetTop}px`)
    }

    updateViewport()
    viewport.addEventListener('resize', updateViewport)
    viewport.addEventListener('scroll', updateViewport)
    return () => {
      viewport.removeEventListener('resize', updateViewport)
      viewport.removeEventListener('scroll', updateViewport)
    }
  }, [open])

  function handleDialogKeys(event) {
    if (event.defaultPrevented) return
    if (event.key === 'Escape' && onClose) {
      event.stopPropagation()
      onClose()
    }
    if (event.key !== 'Tab') return
    const focusable = [...panel.current.querySelectorAll(
      'button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]'
    )].filter(element => element.getClientRects().length && element.tabIndex >= 0)
    const first = focusable[0]
    const last = focusable.at(-1)
    if (!first || document.activeElement === panel.current || document.activeElement === (event.shiftKey ? first : last)) {
      event.preventDefault()
      const target = event.shiftKey ? last : first
      target?.focus()
    }
  }

  if (!open) return null

  return (
    <div
      ref={backdrop}
      className="modal-viewport fixed inset-x-0 z-[110] modal-backdrop flex items-center justify-center p-3 sm:p-5 fade-in"
      onClick={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        tabIndex={-1}
        onKeyDown={handleDialogKeys}
        aria-modal="true"
        aria-label={ariaLabel || (typeof title === 'string' ? title : 'Dialog')}
        className={`modal-panel w-full ${maxWidth} flex flex-col max-h-full overflow-hidden`}
        onClick={e => e.stopPropagation()}
      >
        {(title || onClose) && (
          <div className="px-3 pt-3 pb-2 sm:px-6 sm:pt-5 sm:pb-3 flex items-start justify-between gap-3 shrink-0">
            <div className="flex items-start gap-3 min-w-0">
              {icon && (
                <IconBadge color={iconColor} size={40} radius={9999}>
                  {icon}
                </IconBadge>
              )}
              <div className="min-w-0">
                {title && (
                  <h2 className="font-display text-xl font-normal text-[var(--text)] leading-snug">
                    {title}
                  </h2>
                )}
                {subtitle && (
                  <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-0.5 leading-relaxed">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            {onClose && (
              <IconButton onClick={onClose} ariaLabel="Close dialog" size="sm">
                <X size={18} />
              </IconButton>
            )}
          </div>
        )}

        <div className="px-3 pb-3 sm:px-6 sm:pb-5 min-h-0 overflow-y-auto overscroll-contain flex-1 space-y-4">{children}</div>

        {footer && (
          <div className="px-3 py-2 sm:px-6 sm:py-3 border-t border-[var(--border)] flex flex-wrap items-center justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Clean Flat Material 3 Tonal Icon Container ──
export function IconBadge({
  children,
  color = 'blue',
  size = 40,
  radius = 12,
  className = '',
}) {
  return (
    <div
      className={`flex items-center justify-center shrink-0 select-none ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: `var(--${color}-light)`,
        color: `var(--${color}-ink, var(--${color}))`,
      }}
    >
      {children}
    </div>
  )
}

// ── Official Club Logo Avatar (Clean Flat Fallback — Zero Glossy Bevels) ──
export function ClubAvatar({ club, size = 40, className = '' }) {
  const bg = club?.avatarBg || '#1A73E8'
  const iconSize = Math.round(size * 0.54)
  const rawUrl =
    club?.discordIconUrl ||
    club?.logoUrl ||
    club?.profilePictureUrl ||
    ''
  const [imgStage, setImgStage] = useState(0)

  useEffect(() => {
    setImgStage(0)
  }, [rawUrl])

  const effectiveSrc =
    rawUrl && imgStage === 0
      ? rawUrl
      : rawUrl && imgStage === 1
        ? `https://images.weserv.nl/?url=${encodeURIComponent(rawUrl)}&w=128&h=128&fit=cover`
        : ''

  return (
    <div
      className={`rounded-xl overflow-hidden flex items-center justify-center text-white shrink-0 select-none border border-[var(--border)] ${className}`}
      style={{
        width: size,
        height: size,
        background: bg,
      }}
    >
      {effectiveSrc ? (
        <img
          src={effectiveSrc}
          alt={cleanText(club?.name || 'Club logo')}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setImgStage(prev => prev + 1)}
          className="w-full h-full object-cover rounded-[inherit]"
        />
      ) : (
        <Users size={iconSize} aria-hidden="true" />
      )}
    </div>
  )
}

// ── Clean Tonal Status / Category Chip ──
export function BubbleTag({
  label,
  color = 'blue',
  size = 'md',
  dot = false,
  icon = null,
  className = '',
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full transition-colors select-none
        ${size === 'sm' ? 'px-2.5 py-0.5 text-[11px] leading-4' : 'px-3 py-1 text-xs leading-4'}
        ${className}`}
      style={{
        backgroundColor: `var(--${color}-light)`,
        color: `var(--${color}-ink, var(--${color}))`,
      }}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: `var(--${color})` }}
        />
      )}
      {icon}
      {cleanText(label)}
    </span>
  )
}

// ── Google Contacts-Style Member Avatar ──
export function Avatar({ initials, bg = '#1A73E8', size = 36, className = '' }) {
  return (
    <div
      className={`rounded-full flex items-center justify-center font-medium text-white shrink-0 select-none ${className}`}
      style={{
        width: size,
        height: size,
        background: bg,
        fontSize: Math.round(size * 0.38),
      }}
    >
      {initials}
    </div>
  )
}

// ── Material 3 Outlined Surface Card ──
export function Card({
  children,
  className = '',
  style = {},
  animate = false,
  onClick,
  'data-task-section': taskSection,
}) {
  const interactiveClasses = onClick
    ? 'cursor-pointer hover:bg-[var(--bg-tile-hover)] hover:shadow-[var(--shadow-tile-hover)] transition-[box-shadow,border-color,background-color] duration-150'
    : ''
  return (
    <div
      onClick={onClick}
      className={`bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] ${
        animate ? 'fade-in' : ''
      } ${interactiveClasses} ${className}`}
      style={style}
      data-task-section={taskSection}
    >
      {children}
    </div>
  )
}

// ── M3 Linear Progress Indicator ──
export function ProgressBar({ value, color = 'var(--blue)' }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-20 h-1 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
      <span className="text-xs font-mono-num text-[var(--text-muted)]">{value}%</span>
    </div>
  )
}

// ── Google Workspace Pill Search Box ──
// variant="topbar" (48px tonal pill like Gmail/Drive) | variant="outlined" (40px toolbar pill)
export function SearchBox({
  placeholder = 'Search…',
  width = '100%',
  value,
  onChange,
  inputRef,
  shortcutHint = null,
  variant = 'outlined',
  trailingSlot = null,
  onFocus,
  onClick,
  onKeyDown,
  label = placeholder,
  initialFocus = false,
  className = '',
}) {
  const isControlled = value !== undefined
  const isTopbar = variant === 'topbar'

  return (
    <div
      className={`flex items-center gap-3 rounded-full transition-all duration-150 max-w-full min-w-0 ${
        isTopbar
          ? 'px-4 h-11 sm:h-12 bg-[var(--md-surface-container)] border border-transparent focus-within:bg-[var(--bg-card)] focus-within:border-[var(--border)] focus-within:shadow-[var(--shadow-md)]'
          : 'px-3.5 h-11 sm:h-10 bg-[var(--bg-card)] border border-[var(--md-outline-variant)] hover:border-[var(--md-outline)] focus-within:border-[var(--blue)] focus-within:shadow-[0_0_0_1px_var(--blue)]'
      } ${className}`}
      style={{ width }}
    >
      <Search size={18} className="shrink-0 text-[var(--text-muted)]" />
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        aria-label={label}
        data-initial-focus={initialFocus || undefined}
        onFocus={onFocus}
        onClick={onClick}
        value={isControlled ? value : undefined}
        onChange={onChange ? e => onChange(e.target.value) : undefined}
        onKeyDown={e => {
          if (e.nativeEvent.isComposing) return
          onKeyDown?.(e)
          if (!e.defaultPrevented && e.key === 'Escape') {
            if (isControlled && value && onChange) {
              onChange('')
            } else {
              e.currentTarget.blur()
            }
          }
        }}
        className="border-none outline-none focus-visible:shadow-none bg-transparent text-[var(--text)] text-base sm:text-sm h-full w-full min-w-0 placeholder:text-[var(--text-muted)]"
      />
      {isControlled && value ? (
        <button
          type="button"
          onClick={() => { onChange?.(''); inputRef?.current?.focus() }}
          className="ui-touch -mr-2 w-7 h-7 rounded-full text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-subtle)] cursor-pointer bg-transparent border-none flex items-center justify-center shrink-0 transition-colors"
          aria-label="Clear search"
        >
          <X size={16} />
        </button>
      ) : shortcutHint ? (
        <kbd className="hidden lg:inline-flex items-center px-2 py-0.5 rounded-md bg-[var(--bg-card)] border border-[var(--border)] text-[11px] font-medium font-mono-num text-[var(--text-muted)] select-none shrink-0 pointer-events-none">
          {shortcutHint}
        </kbd>
      ) : null}
      {trailingSlot}
    </div>
  )
}

// ── Material 3 Inverse Surface Snackbar (ToastViewport) ──
export function ToastViewport({ toast, onDismiss }) {
  if (!toast) return null

  return (
    <div
      role="status"
      aria-live="polite"
      data-toast-viewport="true"
      className="fixed left-4 right-4 bottom-[calc(var(--mobile-nav-clearance)+0.5rem)] sm:left-6 sm:right-auto lg:left-[280px] lg:bottom-6 sm:max-w-md z-[120] pointer-events-none flex"
    >
      <div
        className="pointer-events-auto w-full sm:w-auto min-h-[48px] rounded-xl bg-[var(--md-inverse-surface)] text-[var(--md-inverse-on-surface)]
          px-4 py-2.5 shadow-[var(--shadow-md)] flex items-center justify-between gap-4 fade-in"
      >
        <div className="text-sm font-normal leading-snug min-w-0">
          {toast.text}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {toast.actionLabel && toast.onAction && (
            <button
              type="button"
              onClick={() => {
                toast.onAction()
                if (onDismiss) onDismiss()
              }}
              className="px-2.5 h-8 rounded-full text-sm font-medium text-[var(--md-inverse-primary)] hover:opacity-90 bg-transparent border-none cursor-pointer"
            >
              {toast.actionLabel}
            </button>
          )}

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss notification"
              className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--md-inverse-on-surface)] opacity-80 hover:opacity-100 bg-transparent border-none cursor-pointer shrink-0"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Material 3 Switch ──
export function ToggleSwitch({
  checked = false,
  onChange,
  disabled = false,
  ariaLabel,
  size = 'md',
}) {
  const isSm = size === 'sm'
  const trackClasses = isSm ? 'w-10 h-6' : 'w-[52px] h-8'
  const thumbSize = checked ? (isSm ? 18 : 24) : (isSm ? 14 : 16)
  const thumbOffset = checked ? (isSm ? 19 : 24) : (isSm ? 4 : 6)

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={e => {
        if (disabled) return
        onChange?.(!checked, e)
      }}
      className={`relative ${trackClasses} rounded-full transition-colors duration-150 shrink-0 ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${
        checked
          ? 'bg-[var(--blue)] border-2 border-[var(--blue)]'
          : 'bg-[var(--md-surface-container-highest)] border-2 border-[var(--md-outline)]'
      }`}
    >
      <span
        className={`absolute top-1/2 -translate-y-1/2 rounded-full flex items-center justify-center transition-[left,width,height,background-color] duration-150 ${
          checked
            ? 'bg-[var(--on-blue)] text-[var(--blue)]'
            : 'bg-[var(--md-outline)] text-transparent'
        }`}
        style={{
          width: thumbSize,
          height: thumbSize,
          left: thumbOffset,
        }}
      >
        {checked && <Check size={isSm ? 11 : 14} strokeWidth={2.6} />}
      </span>
    </button>
  )
}

// ── Material 3 Section Header ──
export function SectionHeader({
  icon,
  color = 'blue',
  title,
  subtitle,
  badge,
  action,
  className = '',
}) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <IconBadge color={color} size={40} radius={9999}>
            {icon}
          </IconBadge>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base sm:text-[18px] font-normal text-[var(--text)] leading-snug">
              {title}
            </h2>
            {badge}
          </div>
          {subtitle && (
            <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-0.5 leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  )
}
