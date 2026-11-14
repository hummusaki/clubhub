/** Reusable tiny components used across the dashboard. */

// ── Bubble Tag ──
export function BubbleTag({ label, color, size = 'md', dot = false, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-full transition-colors
        ${size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'}
        ${className}`}
      style={{
        background: `var(--${color}-light)`,
        color: `var(--${color})`,
      }}
    >
      {dot && '● '}{label}
    </span>
  )
}

// ── Avatar ──
export function Avatar({ initials, bg, size = 36 }) {
  return (
    <div
      className="rounded-full flex items-center justify-center font-semibold text-white shrink-0"
      style={{
        width: size,
        height: size,
        background: bg,
        fontSize: size * 0.38,
      }}
    >
      {initials}
    </div>
  )
}

// ── Card wrapper ──
export function Card({ children, className = '', style = {}, delay = 0 }) {
  return (
    <div
      className={`bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)]
        shadow-[var(--shadow)] hover:shadow-[var(--shadow-md)] transition-all duration-300
        fade-in ${className}`}
      style={{ animationDelay: `${delay * 0.05}s`, ...style }}
    >
      {children}
    </div>
  )
}

// ── Progress Bar ──
export function ProgressBar({ value, color }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-600"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
      <span className="text-xs text-[var(--text-muted)]">{value}%</span>
    </div>
  )
}

// ── Search Box ──
export function SearchBox({ placeholder = 'Search…', width = '100%' }) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[var(--bg-surface)]
        border border-[var(--border)] transition-colors focus-within:border-[var(--blue)]"
      style={{ width }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-light)"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        type="text"
        placeholder={placeholder}
        className="border-none outline-none bg-transparent text-[var(--text)] text-sm w-full
          placeholder:text-[var(--text-light)]"
      />
    </div>
  )
}
