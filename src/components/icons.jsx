/**
 * Bespoke multi-tone & duotone SVG icon library for ClubHub.
 * Replaces generic single-weight outlines and text initials with
 * layered vector illustrations, platform marks, and club emblems.
 */

// ── 1. Navigation & Section Duotone Icons ────────────────────────────

export function NavIcon({ name, active = false, size = 19 }) {
  const fillOpacity = active ? 0.24 : 0.12
  const strokeWidth = active ? 2.1 : 1.75

  switch (name) {
    case 'LayoutGrid':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
          <rect x="3" y="3" width="7.5" height="7.5" rx="2.4" fill="currentColor" fillOpacity={fillOpacity * 1.4} stroke="currentColor" strokeWidth={strokeWidth} />
          <rect x="13.5" y="3" width="7.5" height="7.5" rx="2.4" stroke="currentColor" strokeWidth={strokeWidth} />
          <rect x="3" y="13.5" width="7.5" height="7.5" rx="2.4" stroke="currentColor" strokeWidth={strokeWidth} />
          <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2.4" fill="currentColor" fillOpacity={fillOpacity} stroke="currentColor" strokeWidth={strokeWidth} />
        </svg>
      )
    case 'Heart':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
          <path
            d="M12 20.25C12 20.25 3.75 15 3.75 8.85C3.75 6.12 5.88 4 8.5 4C10.08 4 11.45 4.78 12 6.02C12.55 4.78 13.92 4 15.5 4C18.12 4 20.25 6.12 20.25 8.85C20.25 15 12 20.25 12 20.25Z"
            fill="currentColor"
            fillOpacity={fillOpacity * 1.3}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M7.5 8.2C7.5 7.2 8.2 6.5 9.2 6.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeOpacity="0.65"
          />
        </svg>
      )
    case 'Search':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
          <circle cx="11.5" cy="11.5" r="7.5" fill="currentColor" fillOpacity={fillOpacity} stroke="currentColor" strokeWidth={strokeWidth} />
          <path
            d="M14.3 8.7L12.7 12.7L8.7 14.3L10.3 10.3L14.3 8.7Z"
            fill="currentColor"
            fillOpacity={fillOpacity * 1.5}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M17.2 17.2L20.5 20.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
        </svg>
      )
    case 'Calendar':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
          <rect x="3.5" y="4.5" width="17" height="16" rx="3.2" stroke="currentColor" strokeWidth={strokeWidth} />
          <path d="M3.5 9.2H20.5V7.7C20.5 5.93 19.07 4.5 17.3 4.5H6.7C4.93 4.5 3.5 5.93 3.5 7.7V9.2Z" fill="currentColor" fillOpacity={fillOpacity * 1.4} />
          <path d="M3.5 9.5H20.5" stroke="currentColor" strokeWidth={strokeWidth} />
          <path d="M8 3V6M16 3V6" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
          <circle cx="8.5" cy="13.5" r="1.2" fill="currentColor" />
          <circle cx="12" cy="13.5" r="1.2" fill="currentColor" />
          <circle cx="15.5" cy="13.5" r="1.2" fill="currentColor" fillOpacity="0.45" />
          <circle cx="8.5" cy="17" r="1.2" fill="currentColor" fillOpacity="0.45" />
          <circle cx="12" cy="17" r="1.2" fill="currentColor" />
        </svg>
      )
    case 'Clock':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
          <circle
            cx="12"
            cy="12"
            r="8.5"
            fill="currentColor"
            fillOpacity={fillOpacity * 1.25}
            stroke="currentColor"
            strokeWidth={strokeWidth}
          />
          <path
            d="M12 7.5V12L15.2 13.8"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'Users':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
          <circle cx="9.2" cy="8.2" r="3.4" fill="currentColor" fillOpacity={fillOpacity * 1.3} stroke="currentColor" strokeWidth={strokeWidth} />
          <path
            d="M3.2 19.2C3.2 15.9 5.88 13.8 9.2 13.8C12.52 13.8 15.2 15.9 15.2 19.2"
            fill="currentColor"
            fillOpacity={fillOpacity}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          <circle cx="16.3" cy="9.2" r="2.5" stroke="currentColor" strokeWidth="1.65" />
          <path d="M17.2 14.3C19.3 14.8 20.8 16.4 20.8 18.8" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
        </svg>
      )
    case 'Settings':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
          <path
            d="M10.35 3.65H13.65L14.2 5.95C14.78 6.18 15.32 6.5 15.8 6.88L18.08 6.2L19.73 9.05L18.08 10.75C18.16 11.16 18.2 11.58 18.2 12C18.2 12.42 18.16 12.84 18.08 13.25L19.73 14.95L18.08 17.8L15.8 17.12C15.32 17.5 14.78 17.82 14.2 18.05L13.65 20.35H10.35L9.8 18.05C9.22 17.82 8.68 17.5 8.2 17.12L5.92 17.8L4.27 14.95L5.92 13.25C5.84 12.84 5.8 12.42 5.8 12C5.8 11.58 5.84 11.16 5.92 10.75L4.27 9.05L5.92 6.2L8.2 6.88C8.68 6.5 9.22 6.18 9.8 5.95L10.35 3.65Z"
            fill="currentColor"
            fillOpacity={fillOpacity}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
          <circle
            cx="12"
            cy="12"
            r="3"
            fill="currentColor"
            fillOpacity={fillOpacity * 1.5}
            stroke="currentColor"
            strokeWidth={strokeWidth}
          />
        </svg>
      )
    case 'Tasks':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
          <rect x="3.5" y="4" width="17" height="16" rx="3" fill="currentColor" fillOpacity={fillOpacity} stroke="currentColor" strokeWidth={strokeWidth} />
          <path d="M7.5 9.5L9.2 11.2L12.2 8.2" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14.2 9.8H17.2M7.5 15H16.8" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
        </svg>
      )
    case 'Link':
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
          <rect x="4" y="4" width="12" height="14" rx="2.6" fill="currentColor" fillOpacity={fillOpacity} stroke="currentColor" strokeWidth="1.65" />
          <path d="M7.5 8.5H12.5M7.5 11.8H10.8" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
          <path
            d="M13.5 16.5L16.2 13.8C17.4 12.6 19.3 12.6 20.5 13.8C21.7 15 21.7 16.9 20.5 18.1L18.3 20.3C17.1 21.5 15.2 21.5 14 20.3"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        </svg>
      )
  }
}

// ── 2. KPI Stat Card Duotone Icons ───────────────────────────────────

export function StatIcon({ name, size = 22 }) {
  switch (name) {
    case 'Users':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <circle cx="9.5" cy="7.8" r="3.5" fill="currentColor" fillOpacity="0.22" stroke="currentColor" strokeWidth="1.9" />
          <path
            d="M3.2 19.5C3.2 16 5.95 13.8 9.5 13.8C13.05 13.8 15.8 16 15.8 19.5"
            fill="currentColor"
            fillOpacity="0.16"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
          <circle cx="16.8" cy="8.5" r="2.6" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.75" />
          <path
            d="M17.5 14C19.6 14.5 21 16.2 21 18.8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'Heart':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path
            d="M12 20.4C12 20.4 3.5 15.1 3.5 8.8C3.5 6.05 5.65 3.9 8.35 3.9C10 3.9 11.4 4.72 12 6C12.6 4.72 14 3.9 15.65 3.9C18.35 3.9 20.5 6.05 20.5 8.8C20.5 15.1 12 20.4 12 20.4Z"
            fill="currentColor"
            fillOpacity="0.22"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M12 8.8L12.75 10.65L14.75 10.85L13.2 12.15L13.68 14.1L12 13.05L10.32 14.1L10.8 12.15L9.25 10.85L11.25 10.65L12 8.8Z"
            fill="currentColor"
          />
        </svg>
      )
    case 'Calendar':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <rect x="3.2" y="4.5" width="17.6" height="16.3" rx="3.5" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1.9" />
          <path d="M3.2 9.4H20.8V7.8C20.8 6 19.35 4.5 17.5 4.5H6.5C4.65 4.5 3.2 6 3.2 7.8V9.4Z" fill="currentColor" fillOpacity="0.24" />
          <path d="M3.2 9.4H20.8" stroke="currentColor" strokeWidth="1.85" />
          <path d="M8 2.8V6M16 2.8V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <rect x="7.2" y="12.4" width="4.2" height="4.2" rx="1.2" fill="currentColor" />
          <circle cx="15.2" cy="13.5" r="1.1" fill="currentColor" fillOpacity="0.55" />
          <circle cx="15.2" cy="17" r="1.1" fill="currentColor" fillOpacity="0.55" />
        </svg>
      )
    case 'Clock':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8.6" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.9" />
          <path d="M12 7.4V12.2L15.4 14.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'Tasks':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <rect x="3.5" y="4" width="17" height="16" rx="3" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.9" />
          <path d="M7.5 9.5L9.2 11.2L12.2 8.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14.2 9.8H17.2M7.5 15H16.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      )
    case 'Link':
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <rect x="3.5" y="3.5" width="12.5" height="15" rx="2.8" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.85" />
          <path d="M7.2 8.2H12.2M7.2 11.5H10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path
            d="M13.2 16.8L15.8 14.2C17.05 12.95 19.1 12.95 20.35 14.2C21.6 15.45 21.6 17.5 20.35 18.75L18.2 20.9C16.95 22.15 14.9 22.15 13.65 20.9"
            stroke="currentColor"
            strokeWidth="1.95"
            strokeLinecap="round"
          />
          <path d="M14.8 18.4L18.5 14.7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      )
  }
}

// ── 3. Platform & Resource Brand SVGs ────────────────────────────────

export function PlatformIcon({ type, size = 18 }) {
  const key = (type || '').toLowerCase()

  // Discord controller / Clyde mark
  if (key === 'discord' || key === 'messagecircle' || key === 'messagesquare') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
        <path
          d="M18.9 5.4A15.8 15.8 0 0 0 14.95 4.15L14.45 5.15A14.2 14.2 0 0 0 9.55 5.15L9.05 4.15A15.8 15.8 0 0 0 5.1 5.4C2.65 9.1 2 12.7 2.3 16.25A16 16 0 0 0 7.15 18.75L8.15 17.35C7.35 17.05 6.6 16.65 5.95 16.15C6.15 16.3 6.35 16.4 6.55 16.5C9.95 18.05 14.05 18.05 17.45 16.5C17.65 16.4 17.85 16.3 18.05 16.15C17.4 16.65 16.65 17.05 15.85 17.35L16.85 18.75A16 16 0 0 0 21.7 16.25C22.05 12.15 21.05 8.55 18.9 5.4Z"
          fill="currentColor"
          fillOpacity="0.2"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="9.1" cy="11.8" r="1.45" fill="currentColor" />
        <circle cx="14.9" cy="11.8" r="1.45" fill="currentColor" />
      </svg>
    )
  }

  // Instagram camera mark
  if (key === 'instagram' || key === 'camera') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
        <rect
          x="3.25"
          y="3.25"
          width="17.5"
          height="17.5"
          rx="5"
          fill="currentColor"
          fillOpacity="0.16"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <circle
          cx="12"
          cy="12"
          r="4"
          fill="currentColor"
          fillOpacity="0.22"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <circle cx="17.2" cy="6.8" r="1.25" fill="currentColor" />
      </svg>
    )
  }

  // Google Sheets / Spreadsheet table
  if (key === 'table' || key === 'sheet' || key === 'sheets' || key === 'finance') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
        <rect
          x="3.5"
          y="3.5"
          width="17"
          height="17"
          rx="3"
          fill="currentColor"
          fillOpacity="0.14"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path d="M3.5 8.8H20.5" stroke="currentColor" strokeWidth="1.75" />
        <path d="M3.5 14.2H20.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.7" />
        <path d="M10.2 8.8V20.5" stroke="currentColor" strokeWidth="1.75" />
        <rect x="4.5" y="4.5" width="15" height="3.5" rx="1.4" fill="currentColor" fillOpacity="0.28" />
      </svg>
    )
  }

  // YouTube / Video / Workshop recordings
  if (key === 'playcircle' || key === 'video' || key === 'youtube') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
        <rect
          x="2.75"
          y="4.5"
          width="18.5"
          height="13.5"
          rx="3.8"
          fill="currentColor"
          fillOpacity="0.18"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M10.2 8.6L15.4 11.25L10.2 13.9V8.6Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path d="M6.5 21H17.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeOpacity="0.65" />
      </svg>
    )
  }

  // Google Forms / Sign-up / Checklist
  if (key === 'checkcircle' || key === 'form' || key === 'forms') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
        <rect
          x="4"
          y="3.5"
          width="16"
          height="17.5"
          rx="3"
          fill="currentColor"
          fillOpacity="0.15"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M7.8 9.4L9.4 11L12.4 7.8"
          stroke="currentColor"
          strokeWidth="1.95"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M14.5 9.5H16.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M8 14.2H16.2M8 17.2H13.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    )
  }

  // Google Docs / Constitution / Document
  if (key === 'filetext' || key === 'document' || key === 'docs') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
        <path
          d="M6.5 3.25H14.2L19 8.05V18.75C19 20.13 17.88 21.25 16.5 21.25H6.5C5.12 21.25 4 20.13 4 18.75V5.75C4 4.37 5.12 3.25 6.5 3.25Z"
          fill="currentColor"
          fillOpacity="0.16"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M14 3.4V7.5C14 8.05 14.45 8.5 15 8.5H18.8"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M7.8 12H15.2M7.8 15.2H15.2M7.8 18.2H12.2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    )
  }

  // Email / Mailing list newsletter
  if (key === 'email' || key === 'mail') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
        <rect
          x="3"
          y="5"
          width="18"
          height="14"
          rx="3"
          fill="currentColor"
          fillOpacity="0.16"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M3.8 6.5L11.1 11.7C11.64 12.08 12.36 12.08 12.9 11.7L20.2 6.5"
          stroke="currentColor"
          strokeWidth="1.85"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  // Google Calendar
  if (key === 'google_calendar' || key === 'calendar') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
        <rect
          x="3.5"
          y="4.5"
          width="17"
          height="16"
          rx="3"
          fill="currentColor"
          fillOpacity="0.15"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path d="M3.5 9.2H20.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 3V6M16 3V6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        <rect x="7.5" y="12" width="3.8" height="3.8" rx="1" fill="currentColor" />
        <circle cx="15" cy="13.9" r="1.15" fill="currentColor" fillOpacity="0.6" />
      </svg>
    )
  }

  // Website / All Sources / Globe
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
      <circle
        cx="12"
        cy="12"
        r="8.5"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <ellipse cx="12" cy="12" rx="3.8" ry="8.5" stroke="currentColor" strokeWidth="1.65" />
      <path d="M4 9.5H20M4 14.5H20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

// ── 4. Custom Club Emblem Vector Illustrations ──────────────────────

export function ClubEmblemSvg({ clubName = '', clubId = '', abbr = '', category = '', size = 22 }) {
  const key = `${clubName} ${clubId} ${abbr}`.toLowerCase()
  const cat = (category || '').toLowerCase()

  // Computer Science Club — Terminal window + code brackets
  if (key.includes('computer') || key.includes('csclub') || abbr === 'CS') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="2.5" y="3.5" width="19" height="17" rx="3.5" fill="white" fillOpacity="0.16" stroke="white" strokeWidth="1.75" />
        <path d="M2.5 8H21.5" stroke="white" strokeWidth="1.5" strokeOpacity="0.55" />
        <circle cx="5.5" cy="5.75" r="0.85" fill="white" />
        <circle cx="8" cy="5.75" r="0.85" fill="white" fillOpacity="0.65" />
        <path d="M8.5 11.8L6 14.1L8.5 16.4" stroke="white" strokeWidth="1.95" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15.5 11.8L18 14.1L15.5 16.4" stroke="white" strokeWidth="1.95" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13 11L11 17.2" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.88" />
      </svg>
    )
  }

  // Debate Society — Broadcast microphone + soundwave arcs
  if (key.includes('debate') || abbr === 'DS') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="9" y="3.2" width="6" height="10.2" rx="3" fill="white" fillOpacity="0.25" stroke="white" strokeWidth="1.85" />
        <path d="M6 10.2C6 13.5 8.68 16.2 12 16.2C15.32 16.2 18 13.5 18 10.2" stroke="white" strokeWidth="1.85" strokeLinecap="round" />
        <path d="M12 16.2V20.2M8.8 20.2H15.2" stroke="white" strokeWidth="1.9" strokeLinecap="round" />
        <path d="M4.2 6.8C3.2 8.2 3.2 10.2 4.2 11.6M19.8 6.8C20.8 8.2 20.8 10.2 19.8 11.6" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeOpacity="0.72" />
      </svg>
    )
  }

  // Art Collective — Artist palette & paint wells
  if (key.includes('art') || abbr === 'AC') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 3.2C7.03 3.2 3 7.05 3 11.8C3 16.55 6.85 20.5 11.6 20.5C13.1 20.5 14.2 19.35 14.2 17.95C14.2 17.3 13.95 16.75 13.55 16.3C13.2 15.9 13 15.45 13 14.95C13 13.85 13.9 13 15 13H16.8C19.1 13 21 11.15 21 8.85C21 5.6 16.97 3.2 12 3.2Z"
          fill="white"
          fillOpacity="0.22"
          stroke="white"
          strokeWidth="1.85"
          strokeLinejoin="round"
        />
        <circle cx="7.8" cy="10.2" r="1.35" fill="white" />
        <circle cx="10.8" cy="7.3" r="1.35" fill="white" />
        <circle cx="15" cy="8.2" r="1.25" fill="white" fillOpacity="0.85" />
        <circle cx="7.8" cy="14.4" r="1.2" fill="white" fillOpacity="0.8" />
      </svg>
    )
  }

  // Econ Society — Rising market bars + trend curve
  if (key.includes('econ') || key.includes('finance') || abbr === 'EC') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="13.5" width="3.5" height="6.5" rx="1.2" fill="white" fillOpacity="0.3" stroke="white" strokeWidth="1.65" />
        <rect x="10.25" y="10" width="3.5" height="10" rx="1.2" fill="white" fillOpacity="0.3" stroke="white" strokeWidth="1.65" />
        <rect x="16.5" y="6.5" width="3.5" height="13.5" rx="1.2" fill="white" fillOpacity="0.45" stroke="white" strokeWidth="1.65" />
        <path d="M4.5 9.5L10.2 5.5L14 7.5L19.5 3.5" stroke="white" strokeWidth="1.95" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16.2 3.5H19.5V6.8" stroke="white" strokeWidth="1.95" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  // A Cappella / Music — Beamed harmonic notes
  if (key.includes('cappella') || key.includes('music') || abbr === 'AG') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path
          d="M9.5 17.5V6.2L19.5 4.2V15.5"
          stroke="white"
          strokeWidth="1.95"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M9.5 9.4L19.5 7.4" stroke="white" strokeWidth="1.75" strokeOpacity="0.7" />
        <circle cx="6.8" cy="17.5" r="2.7" fill="white" fillOpacity="0.3" stroke="white" strokeWidth="1.85" />
        <circle cx="16.8" cy="15.5" r="2.7" fill="white" fillOpacity="0.3" stroke="white" strokeWidth="1.85" />
      </svg>
    )
  }

  // Robotics League — Bot head visor & antenna
  if (key.includes('robot') || abbr === 'RL') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M12 3V6.5" stroke="white" strokeWidth="1.9" strokeLinecap="round" />
        <circle cx="12" cy="2.6" r="1.3" fill="white" />
        <rect x="4.5" y="6.5" width="15" height="12.5" rx="4" fill="white" fillOpacity="0.22" stroke="white" strokeWidth="1.85" />
        <circle cx="9.2" cy="12" r="1.5" fill="white" />
        <circle cx="14.8" cy="12" r="1.5" fill="white" />
        <path d="M9.2 15.8H14.8" stroke="white" strokeWidth="1.85" strokeLinecap="round" />
        <path d="M2.5 11V14.5M21.5 11V14.5" stroke="white" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    )
  }

  // Campus Film & Photo — Camera aperture & viewfinder
  if (key.includes('film') || key.includes('photo') || abbr === 'FP') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path
          d="M3.5 8.2C3.5 6.98 4.48 6 5.7 6H7.4L9 4H15L16.6 6H18.3C19.52 6 20.5 6.98 20.5 8.2V17.3C20.5 18.52 19.52 19.5 18.3 19.5H5.7C4.48 19.5 3.5 18.52 3.5 17.3V8.2Z"
          fill="white"
          fillOpacity="0.2"
          stroke="white"
          strokeWidth="1.85"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12.8" r="3.6" fill="white" fillOpacity="0.28" stroke="white" strokeWidth="1.85" />
        <circle cx="17.2" cy="9.2" r="1" fill="white" />
      </svg>
    )
  }

  // Outdoor Adventure — Twin mountain peaks & sun
  if (key.includes('outdoor') || key.includes('adventure') || abbr === 'OA') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="16.8" cy="6.5" r="2.2" fill="white" fillOpacity="0.4" stroke="white" strokeWidth="1.6" />
        <path
          d="M2.8 19L9.6 7.5L14.8 16L17.2 12.2L21.2 19H2.8Z"
          fill="white"
          fillOpacity="0.24"
          stroke="white"
          strokeWidth="1.85"
          strokeLinejoin="round"
        />
        <path d="M7.2 11.6L9.6 13L12 11.6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  // Category fallbacks for any dynamic club
  if (cat === 'tech & science') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="4.5" width="17" height="15" rx="3.2" fill="white" fillOpacity="0.22" stroke="white" strokeWidth="1.8" />
        <path d="M8.8 9.5L6.2 12L8.8 14.5M15.2 9.5L17.8 12L15.2 14.5M13 8.8L11 15.2" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (cat === 'performing arts') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M9.5 17.5V6.2L19.5 4.2V15.5" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="6.8" cy="17.5" r="2.6" fill="white" fillOpacity="0.3" stroke="white" strokeWidth="1.8" />
        <circle cx="16.8" cy="15.5" r="2.6" fill="white" fillOpacity="0.3" stroke="white" strokeWidth="1.8" />
      </svg>
    )
  }

  if (cat === 'arts' || cat === 'media & arts') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 3L14.4 9.6L21 12L14.4 14.4L12 21L9.6 14.4L3 12L9.6 9.6L12 3Z"
          fill="white"
          fillOpacity="0.26"
          stroke="white"
          strokeWidth="1.85"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  if (cat === 'cultural') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="8.5" fill="white" fillOpacity="0.2" stroke="white" strokeWidth="1.8" />
        <ellipse cx="12" cy="12" rx="4" ry="8.5" stroke="white" strokeWidth="1.65" />
        <path d="M3.8 12H20.2" stroke="white" strokeWidth="1.65" />
      </svg>
    )
  }

  if (cat === 'service & advocacy') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 20.2C12 20.2 4 15.2 4 9.1C4 6.5 6.05 4.5 8.6 4.5C10.15 4.5 11.45 5.28 12 6.45C12.55 5.28 13.85 4.5 15.4 4.5C17.95 4.5 20 6.5 20 9.1C20 15.2 12 20.2 12 20.2Z"
          fill="white"
          fillOpacity="0.24"
          stroke="white"
          strokeWidth="1.85"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  if (cat === 'greek') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M3.5 9L12 4L20.5 9H3.5Z" fill="white" fillOpacity="0.26" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M6.5 9V17.5M12 9V17.5M17.5 9V17.5M4 18H20" stroke="white" strokeWidth="1.85" strokeLinecap="round" />
      </svg>
    )
  }

  if (cat === 'gaming') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="7" width="18" height="10.5" rx="5" fill="white" fillOpacity="0.22" stroke="white" strokeWidth="1.85" />
        <path d="M8.2 10.4V14M6.4 12.2H10" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="15.2" cy="11.2" r="1.1" fill="white" />
        <circle cx="17.4" cy="13.2" r="1.1" fill="white" />
      </svg>
    )
  }

  if (cat === 'faith') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="4.2" fill="white" fillOpacity="0.28" stroke="white" strokeWidth="1.8" />
        <path d="M12 3.2V5.4M12 18.6V20.8M3.2 12H5.4M18.6 12H20.8M5.8 5.8L7.4 7.4M16.6 16.6L18.2 18.2M18.2 5.8L16.6 7.4M7.4 16.6L5.8 18.2" stroke="white" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    )
  }

  if (cat === 'social' || cat === 'community') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path
          d="M5 6.5C5 5.12 6.12 4 7.5 4H16.5C17.88 4 19 5.12 19 6.5V13.5C19 14.88 17.88 16 16.5 16H11L6.8 19.4C6.15 19.92 5 19.46 5 18.62V6.5Z"
          fill="white"
          fillOpacity="0.24"
          stroke="white"
          strokeWidth="1.85"
          strokeLinejoin="round"
        />
        <circle cx="9.2" cy="10" r="1.1" fill="white" />
        <circle cx="12" cy="10" r="1.1" fill="white" />
        <circle cx="14.8" cy="10" r="1.1" fill="white" />
      </svg>
    )
  }

  // Default academic / campus crest
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 4L21 8.5L12 13L3 8.5L12 4Z"
        fill="white"
        fillOpacity="0.26"
        stroke="white"
        strokeWidth="1.85"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 10.5V15.8C6.5 17.5 9 19.2 12 19.2C15 19.2 17.5 17.5 17.5 15.8V10.5"
        stroke="white"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
    </svg>
  )
}

// ── 5. Schedule & Announcement Duotone Event/Alert Icons ─────────────

export function ScheduleEventIcon({ club = '', event = '', size = 16 }) {
  const key = `${club} ${event}`.toLowerCase()

  if (key.includes('cs') || key.includes('computer') || key.includes('react') || key.includes('code') || key.includes('standup')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="16" rx="3" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.85" />
        <path d="M8.5 10L6 12.2L8.5 14.4M15.5 10L18 12.2L15.5 14.4M13 9.2L11 15.2" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (key.includes('debate') || key.includes('motion') || key.includes('practice') || key.includes('tournament')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="9" y="3.5" width="6" height="9.8" rx="3" fill="currentColor" fillOpacity="0.22" stroke="currentColor" strokeWidth="1.85" />
        <path d="M6.2 10.2C6.2 13.4 8.8 16 12 16C15.2 16 17.8 13.4 17.8 10.2M12 16V20M9 20H15" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" />
      </svg>
    )
  }

  if (key.includes('art') || key.includes('studio') || key.includes('print') || key.includes('zine')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 3.5C7.2 3.5 3.5 7.1 3.5 11.7C3.5 16.3 7.1 20 11.7 20C13.1 20 14.1 18.9 14.1 17.6C14.1 16.5 13.1 15.8 13.1 14.7C13.1 13.7 13.9 12.9 15 12.9H16.6C18.8 12.9 20.5 11.1 20.5 8.9C20.5 5.8 16.7 3.5 12 3.5Z"
          fill="currentColor"
          fillOpacity="0.2"
          stroke="currentColor"
          strokeWidth="1.85"
        />
        <circle cx="8.2" cy="10" r="1.2" fill="currentColor" />
        <circle cx="11.5" cy="7.5" r="1.2" fill="currentColor" />
      </svg>
    )
  }

  if (key.includes('robot') || key.includes('lab') || key.includes('maker')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="4.5" y="6.5" width="15" height="12.5" rx="3.5" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.85" />
        <path d="M12 3.2V6.5M9.2 15.8H14.8" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" />
        <circle cx="9.2" cy="11.8" r="1.4" fill="currentColor" />
        <circle cx="14.8" cy="11.8" r="1.4" fill="currentColor" />
      </svg>
    )
  }

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3.5" y="4.5" width="17" height="16" rx="3" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.85" />
      <path d="M3.5 9.2H20.5M8 3V6M16 3V6" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" />
      <circle cx="12" cy="14.5" r="2" fill="currentColor" />
    </svg>
  )
}

export function AnnouncementTypeIcon({ type = '', size = 16 }) {
  const key = (type || '').toLowerCase()

  // Urgent / Alert
  if (key === 'urgent' || key === 'important') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 3.5L21 19.2C21.45 20 20.88 21 19.95 21H4.05C3.12 21 2.55 20 3 19.2L12 3.5Z"
          fill="currentColor"
          fillOpacity="0.2"
          stroke="currentColor"
          strokeWidth="1.85"
          strokeLinejoin="round"
        />
        <path d="M12 9.5V13.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="17.2" r="1.15" fill="currentColor" />
      </svg>
    )
  }

  // Event / Hackathon
  if (key === 'event') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 3L14.5 8.6L20.5 9.3L16 13.4L17.2 19.4L12 16.3L6.8 19.4L8 13.4L3.5 9.3L9.5 8.6L12 3Z"
          fill="currentColor"
          fillOpacity="0.22"
          stroke="currentColor"
          strokeWidth="1.85"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  // Update / Announcement megaphone
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M18.5 5.2L9.2 9H5.5C4.4 9 3.5 9.9 3.5 11V13C3.5 14.1 4.4 15 5.5 15H9.2L18.5 18.8V5.2Z"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinejoin="round"
      />
      <path d="M6.5 15L7.8 19.5" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" />
      <path d="M21 9.5C21.8 10.8 21.8 13.2 21 14.5" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" />
    </svg>
  )
}
