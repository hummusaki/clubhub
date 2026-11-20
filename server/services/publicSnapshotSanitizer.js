import { isPublicRecord } from '../../src/utils/publicRoster.js';

// ── Public Static Snapshot Privacy & PII Sanitizer Guard ──
// Ensures that `public/clubhub-data.json` (committed to GitHub Pages) contains ONLY public
// UCSC organization catalog, public posts, public events, public links, and public club rosters —
// NEVER private user accounts, session tokens, claims, polls, groups, or internal club tasks.

const FORBIDDEN_TOP_LEVEL_KEYS = [
  'users',
  'user_sessions',
  'sessions',
  'club_memberships',
  'memberships',
  'roster_claims',
  'claims',
  'club_groups',
  'groups',
  'club_tasks',
  'tasks',
  'club_polls',
  'club_subscriptions',
  'subscriptions',
  'club_events_private',
  'polls',
  'scheduler_polls',
  'scheduler_responses',
  'dict',
  'dictionary_store',
  'hub',
];

export function sanitizePublicSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const clean = { ...snapshot };

  for (const key of FORBIDDEN_TOP_LEVEL_KEYS) {
    delete clean[key];
  }

  // Strip any personal_poll or custom user-only records that might have touched public tables
  if (Array.isArray(clean.events)) {
    clean.events = clean.events.filter(
      e =>
        isPublicRecord(e) &&
        e.clubId !== 'personal_poll' &&
        !String(e.id || '').startsWith('personal_') &&
        !String(e.id || '').startsWith('collab_evt_') &&
        !String(e.id || '').startsWith('custom_evt_') && !e.isCustom
    );
  }

  const officialClubEmails = new Map(
    (Array.isArray(clean.clubs) ? clean.clubs : []).map(c => [
      c.id,
      String(c.email || '').trim().toLowerCase(),
    ])
  );

  for (const collection of ['posts', 'announcements', 'links']) {
    if (Array.isArray(clean[collection])) clean[collection] = clean[collection].filter(isPublicRecord);
  }

  if (Array.isArray(clean.roster)) {
    const fields = ['id', 'clubId', 'clubName', 'name', 'initials', 'role', 'personType',
      'major', 'year', 'office', 'instagram', 'color', 'source', 'sourceUrl'];
    clean.roster = clean.roster
      .filter(r => isPublicRecord(r) && !String(r.id || '').startsWith('custom_'))
      .map(r => {
        const copy = Object.fromEntries(fields.filter(field => r[field] !== undefined).map(field => [field, r[field]]));
        const officialEmail = officialClubEmails.get(r.clubId) || '';
        if (r.email && String(r.email).trim().toLowerCase() === officialEmail) copy.email = r.email;
        return copy;
      });
  }

  return clean;
}
