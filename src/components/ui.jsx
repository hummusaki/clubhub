import { useId } from 'react'
import { X } from 'lucide-react'
import { ClubEmblemSvg } from './icons'

/** Reusable UI primitives used across the ClubHub dashboard. */

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

// ── Custom ClubHub Brand Logo (SVG) ──
export function ClubHubLogo({ size = 38, className = '' }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const bgId = `clubhub-bg-${uid}`
  const shineId = `clubhub-shine-${uid}`
  const warmId = `clubhub-warm-${uid}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
    >
      <defs>
        <linearGradient id={bgId} x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4A8AF4" />
          <stop offset="52%" stopColor="#7C65E0" />
          <stop offset="100%" stopColor="#46B8AE" />
        </linearGradient>
        <linearGradient id={shineId} x1="12" y1="6" x2="44" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={warmId} x1="36" y1="16" x2="50" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFE79E" />
          <stop offset="100%" stopColor="#FF9E9E" />
        </linearGradient>
      </defs>

      <rect x="4" y="4" width="56" height="56" rx="16" fill={`url(#${bgId})`} />
      <rect
        x="4.75"
        y="4.75"
        width="54.5"
        height="54.5"
        rx="15.25"
        stroke={`url(#${shineId})`}
        strokeWidth="1.5"
      />

      <path
        d="M42.5 22.5A14.5 14.5 0 1 0 42.5 41.5"
        stroke="#FFFFFF"
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeOpacity="0.94"
      />

      <circle cx="24" cy="22" r="5.2" fill="#FFFFFF" />
      <circle cx="24" cy="42" r="5.2" fill="#BFF7D8" />
      <circle cx="43.5" cy="22.5" r="5.2" fill={`url(#${warmId})`} />
      <circle cx="43.5" cy="41.5" r="5.2" fill="#DCEAFF" />

      <path
        d="M32 25C32.6 28.7 35.3 31.4 39 32C35.3 32.6 32.6 35.3 32 39C31.4 35.3 28.7 32.6 25 32C28.7 31.4 31.4 28.7 32 25Z"
        fill="#FFFFFF"
      />
    </svg>
  )
}

// ── Sculpted Icon Badge Container ──
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
        background: `linear-gradient(145deg, var(--${color}-light), color-mix(in srgb, var(--${color}-light) 74%, var(--bg-tile)))`,
        color: `var(--${color}-ink, var(--${color}))`,
        border: `1px solid color-mix(in srgb, var(--${color}) 28%, transparent)`,
        boxShadow: `inset 0 1px 0 var(--badge-highlight), 0 2px 6px -1px color-mix(in srgb, var(--${color}) 18%, transparent)`,
      }}
    >
      {children}
    </div>
  )
}

// ── Bespoke Club Emblem Avatar (Vector Illustration inside Sculpted Squircle) ──
export function ClubAvatar({ club, size = 42, className = '' }) {
  const bg = club?.avatarBg || 'linear-gradient(135deg, var(--blue), #4B7BE5)'
  const iconSize = Math.round(size * 0.54)

  return (
    <div
      className={`rounded-[13px] flex items-center justify-center text-white shrink-0 select-none ${className}`}
      style={{
        width: size,
        height: size,
        background: bg,
        boxShadow:
          'inset 0 1px 1px rgba(255, 255, 255, 0.36), 0 3px 9px -2px rgba(15, 23, 42, 0.24)',
      }}
    >
      <ClubEmblemSvg
        clubName={club?.name}
        clubId={club?.id}
        abbr={club?.abbr}
        category={club?.category}
        size={iconSize}
      />
    </div>
  )
}

// ── Bubble Tag ──
export function BubbleTag({ label, color = 'blue', size = 'md', dot = false, icon = null, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full transition-colors select-none
        ${size === 'sm' ? 'px-2.5 py-0.5 text-[11px] leading-4' : 'px-3 py-1 text-xs leading-4'}
        ${className}`}
      style={{
        background: `var(--${color}-light)`,
        color: `var(--${color}-ink, var(--${color}))`,
        border: `1px solid color-mix(in srgb, var(--${color}) 24%, transparent)`,
      }}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: `var(--${color})` }}
        />
      )}
      {icon}
      {cleanText(label)}
    </span>
  )
}

// ── Member Avatar ──
export function Avatar({ initials, bg, size = 36, className = '' }) {
  return (
    <div
      className={`rounded-full flex items-center justify-center font-semibold text-white shrink-0 select-none ${className}`}
      style={{
        width: size,
        height: size,
        background: bg,
        fontSize: Math.round(size * 0.36),
        boxShadow:
          'inset 0 1px 1px rgba(255, 255, 255, 0.38), 0 2px 5px -1px rgba(38, 33, 27, 0.14)',
      }}
    >
      {initials}
    </div>
  )
}

// ── Card wrapper ──
export function Card({ children, className = '', style = {}, delay = 0, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)]
        shadow-[var(--shadow)] hover:shadow-[var(--shadow-md)] transition-all duration-300
        fade-in ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{ animationDelay: `${delay * 0.04}s`, ...style }}
    >
      {children}
    </div>
  )
}

// ── Progress Bar ──
export function ProgressBar({ value, color }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-20 h-1.5 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-600"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
      <span className="text-xs font-mono-num text-[var(--text-muted)]">{value}%</span>
    </div>
  )
}

// ── Search Box ──
export function SearchBox({
  placeholder = 'Search…',
  width = '100%',
  value,
  onChange,
  inputRef,
}) {
  const isControlled = value !== undefined
  return (
    <div
      className="flex items-center gap-2.5 px-3.5 min-h-[42px] rounded-xl bg-[var(--bg-card)]
        border border-[var(--border)] transition-all duration-200 max-w-full min-w-0
        focus-within:border-[var(--blue)]"
      style={{ width }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        className="shrink-0 text-[var(--text-light)]"
      >
        <circle
          cx="11"
          cy="11"
          r="7.5"
          fill="currentColor"
          fillOpacity="0.14"
          stroke="currentColor"
          strokeWidth="2"
        />
        <line
          x1="20.5"
          y1="20.5"
          x2="16.4"
          y2="16.4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={isControlled ? value : undefined}
        onChange={onChange ? e => onChange(e.target.value) : undefined}
        className="border-none outline-none bg-transparent text-[var(--text)] text-base sm:text-sm w-full min-w-0
          placeholder:text-[var(--text-light)]"
      />
      {isControlled && value && (
        <button
          type="button"
          onClick={() => onChange && onChange('')}
          className="text-[var(--text-light)] hover:text-[var(--text)] p-1 cursor-pointer bg-transparent border-none flex items-center shrink-0"
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

// ── Floating Non-Layout-Shifting Toast Viewport ──
export function ToastViewport({ toast, onDismiss }) {
  if (!toast) return null
  const tone = toast.type === 'error' ? 'red' : toast.type === 'info' ? 'blue' : 'green'

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 right-4 left-4 sm:left-auto sm:right-6 sm:max-w-sm z-[120] pointer-events-none flex justify-end"
    >
      <div
        className="pointer-events-auto w-full sm:w-auto rounded-2xl bg-[var(--bg-card)] border px-4 py-3
          shadow-[var(--shadow-lg)] flex items-center justify-between gap-3 fade-in"
        style={{
          borderColor: `var(--${tone})`,
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: `var(--${tone})` }}
          />
          <div className="min-w-0">
            <div className="text-xs sm:text-[13px] font-semibold text-[var(--text)] leading-snug">
              {toast.text}
            </div>
            {toast.actionLabel && toast.onAction && (
              <button
                type="button"
                onClick={() => {
                  toast.onAction()
                  if (onDismiss) onDismiss()
                }}
                className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer p-0"
              >
                <span>{toast.actionLabel} &rarr;</span>
              </button>
            )}
          </div>
        </div>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss notification"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-light)] hover:text-[var(--text)] hover:bg-[var(--bg-surface)] bg-transparent border-none cursor-pointer shrink-0 transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
