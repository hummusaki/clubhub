/** Reusable UI primitives used across the ClubHub dashboard. */

// ── Custom ClubHub Brand Logo (SVG) ──
export function ClubHubLogo({ size = 40, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
      style={{
        filter: 'drop-shadow(0 4px 10px rgba(74, 138, 244, 0.25))',
      }}
    >
      <defs>
        <linearGradient id="clubhub-bg" x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4A8AF4" />
          <stop offset="52%" stopColor="#7C65E0" />
          <stop offset="100%" stopColor="#46B8AE" />
        </linearGradient>
        <linearGradient id="clubhub-shine" x1="12" y1="6" x2="44" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="clubhub-warm" x1="36" y1="16" x2="50" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFE79E" />
          <stop offset="100%" stopColor="#FF9E9E" />
        </linearGradient>
      </defs>

      {/* Sculpted Squircle Base */}
      <rect x="3" y="3" width="58" height="58" rx="16.5" fill="url(#clubhub-bg)" />
      <rect
        x="3.75"
        y="3.75"
        width="56.5"
        height="56.5"
        rx="15.75"
        stroke="url(#clubhub-shine)"
        strokeWidth="1.5"
      />

      {/* Orbital C-Hub Ring */}
      <path
        d="M43 22.5A14.5 14.5 0 1 0 43 41.5"
        stroke="#FFFFFF"
        strokeWidth="4.4"
        strokeLinecap="round"
        strokeOpacity="0.94"
      />

      {/* Four Interconnected Community Nodes */}
      <circle cx="23.5" cy="21.5" r="5.5" fill="#FFFFFF" />
      <circle cx="23.5" cy="42.5" r="5.5" fill="#BFF7D8" />
      <circle cx="43.5" cy="22.5" r="5.5" fill="url(#clubhub-warm)" />
      <circle cx="43.5" cy="41.5" r="5.5" fill="#DCEAFF" />

      {/* Central Hub Star Core */}
      <path
        d="M32 24.5C32.7 28.6 35.4 31.3 39.5 32C35.4 32.7 32.7 35.4 32 39.5C31.3 35.4 28.6 32.7 24.5 32C28.6 31.3 31.3 28.6 32 24.5Z"
        fill="#FFFFFF"
      />
    </svg>
  )
}

// ── Bubble Tag ──
export function BubbleTag({ label, color = 'blue', size = 'md', dot = false, pulse = false, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full transition-colors select-none
        ${size === 'sm' ? 'px-2.5 py-0.5 text-[11px] leading-4' : 'px-3 py-1 text-xs leading-4'}
        ${className}`}
      style={{
        background: `var(--${color}-light)`,
        color: `var(--${color}-ink, var(--${color}))`,
        border: `1px solid color-mix(in srgb, var(--${color}) 22%, transparent)`,
      }}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${pulse ? 'pulse-dot' : ''}`}
          style={{ background: `var(--${color})` }}
        />
      )}
      {label}
    </span>
  )
}

// ── Avatar ──
export function Avatar({ initials, bg, size = 36, className = '' }) {
  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold text-white shrink-0 select-none
        shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_2px_4px_rgba(38,33,27,0.08)] ${className}`}
      style={{
        width: size,
        height: size,
        background: bg,
        fontSize: Math.round(size * 0.36),
        letterSpacing: '-0.02em',
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
      <div className="w-24 h-2 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-subtle)] overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-600"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
      <span className="text-xs font-semibold font-mono-num text-[var(--text-muted)] w-9">
        {value}%
      </span>
    </div>
  )
}

// ── Search Box ──
export function SearchBox({
  placeholder = 'Search…',
  width = '100%',
  value,
  onChange,
  shortcut,
  inputRef,
}) {
  const isControlled = value !== undefined
  return (
    <div
      className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-[var(--bg-card)]
        border border-[var(--border)] shadow-[var(--shadow-xs)] transition-all duration-200
        focus-within:border-[var(--blue)]
        focus-within:shadow-[0_0_0_3px_var(--blue-light)]"
      style={{ width }}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--text-light)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={isControlled ? value : undefined}
        onChange={onChange ? e => onChange(e.target.value) : undefined}
        className="border-none outline-none bg-transparent text-[var(--text)] text-[13px] w-full
          placeholder:text-[var(--text-light)] font-medium"
      />
      {isControlled && value ? (
        <button
          type="button"
          onClick={() => onChange && onChange('')}
          className="text-[var(--text-light)] hover:text-[var(--text)] text-xs leading-none px-1 cursor-pointer"
          aria-label="Clear search"
        >
          ✕
        </button>
      ) : shortcut ? (
        <kbd
          className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono-num
            font-semibold text-[var(--text-light)] bg-[var(--bg-subtle)] rounded border border-[var(--border)]"
        >
          {shortcut}
        </kbd>
      ) : null}
    </div>
  )
}
