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
  'polls',
  'scheduler_polls',
  'scheduler_responses',
  'dict',
  'dictionary_store',
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
        e &&
        e.clubId !== 'personal_poll' &&
        !String(e.id || '').startsWith('personal_') &&
        !String(e.id || '').startsWith('collab_evt_')
    );
  }

  if (Array.isArray(clean.roster)) {
    clean.roster = clean.roster
      .filter(r => r && !String(r.id || '').startsWith('custom_'))
      .map(r => {
        const copy = { ...r };
        delete copy.claimedByUserId;
        delete copy.claimedByEmail;
        delete copy.passwordHash;
        delete copy.tokenHash;
        return copy;
      });
  }

  return clean;
}
