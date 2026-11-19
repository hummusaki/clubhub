// ── Dynamic Browser Tab Title Builder ──
// Keeps document.title synchronized with the exact live state of ClubHub.

import { sanitizeCalText } from './calendarSync.js'

function truncateLabel(str, maxLen = 34) {
  const clean = sanitizeCalText(str)
  if (!clean) return ''
  return clean.length > maxLen ? `${clean.slice(0, maxLen - 1).trimEnd()}…` : clean
}

export function buildDashboardPageTitle({
  activeNav = 'overview',
  subContext = null,
  searchQuery = '',
  upcomingCount = 0,
  joinedCount = 0,
  inAppRsvpOnly = false,
  clubTitle,
  clubSection,
} = {}) {
  if (clubTitle) {
    const section = { members: 'Members', roles: 'Roles & groups' }[clubSection]
    return [section, truncateLabel(clubTitle, 54), 'ClubHub'].filter(Boolean).join(' · ')
  }
  const q = truncateLabel(searchQuery, 24)
  const ctx = subContext && subContext.nav === activeNav ? subContext : null

  switch (activeNav) {
    case 'overview': {
      if (ctx?.modal === 'sync') return 'Calendar Sync Settings · ClubHub'
      if (q) return `"${q}" — Overview · ClubHub`
      if (inAppRsvpOnly) {
        return `Overview (RSVP'd · ${upcomingCount}) · ClubHub`
      }
      return upcomingCount > 0
        ? `Overview (${upcomingCount} Upcoming) · ClubHub`
        : 'Overview · ClubHub'
    }

    case 'calendar': {
      if (ctx?.modal === 'sync') return 'Calendar Sync Settings · ClubHub'
      if (ctx?.modal === 'add') return 'Add Event — Calendar · ClubHub'
      if (q) return `"${q}" — Calendar · ClubHub`
      if (ctx?.label) {
        const suffix = inAppRsvpOnly && !ctx.label.includes('Going') && !ctx.label.includes('RSVP')
          ? " (RSVP'd)"
          : ''
        return `${truncateLabel(ctx.label, 32)}${suffix} — Calendar · ClubHub`
      }
      return inAppRsvpOnly ? "Calendar (RSVP'd) · ClubHub" : 'Calendar · ClubHub'
    }

    case 'availability': {
      if (ctx?.modal === 'new_poll') return 'New Poll — Availability · ClubHub'
      if (ctx?.label) return `${truncateLabel(ctx.label, 30)} — Availability · ClubHub`
      return 'Group Availability · ClubHub'
    }

    case 'clubs': {
      if (ctx?.modal === 'post') return 'Post Update — Clubs · ClubHub'
      if (ctx?.modal === 'person') return 'Add Member — Directory · ClubHub'
      if (q) return `"${q}" — Clubs · ClubHub`
      if (ctx?.label) return `${truncateLabel(ctx.label, 36)} · ClubHub`
      return joinedCount > 0 ? `My Clubs (${joinedCount}) · ClubHub` : 'Clubs & Community · ClubHub'
    }

    case 'tasks': {
      if (ctx?.label) return `${truncateLabel(ctx.label, 32)} — Task Board · ClubHub`
      return 'Task Board · ClubHub'
    }

    case 'links': {
      if (ctx?.modal === 'add') return 'Share Resource · ClubHub'
      if (q) return `"${q}" — Resources · ClubHub`
      if (ctx?.label) return `${truncateLabel(ctx.label, 30)} — Resources · ClubHub`
      return 'Shared Resources · ClubHub'
    }

    case 'settings':
      return 'Settings · ClubHub'

    default:
      return 'ClubHub — Campus Workspace'
  }
}
