-- ── ClubHub Private Multi-User Cloud Database Schema (Cloudflare D1 / Turso SQLite) ──
-- Stores ONLY private user accounts, sessions, club memberships, roster claims,
-- club groups, Monday.com two-tier club tasks, and real-responder availability polls.
-- Never exported to `public/clubhub-data.json`.

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT UNIQUE NOT NULL,
  fullName       TEXT NOT NULL,
  major          TEXT NOT NULL DEFAULT '',
  gradYear       TEXT NOT NULL DEFAULT '',
  avatarBg       TEXT NOT NULL DEFAULT '',
  passwordHash   TEXT,
  passwordSalt   TEXT,
  authProvider   TEXT NOT NULL DEFAULT 'email',
  externalAuthId TEXT,
  verifiedEdu    INTEGER NOT NULL DEFAULT 0,
  createdAt      TEXT NOT NULL,
  updatedAt      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_priv_users_email ON users(email);

CREATE TABLE IF NOT EXISTS user_sessions (
  tokenHash  TEXT PRIMARY KEY,
  userId     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expiresAt  TEXT NOT NULL,
  createdAt  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_priv_sessions_user ON user_sessions(userId);

CREATE TABLE IF NOT EXISTS club_memberships (
  id              TEXT PRIMARY KEY,
  clubId          TEXT NOT NULL,
  userId          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier            TEXT NOT NULL DEFAULT 'member',
  roleTitle       TEXT NOT NULL DEFAULT 'Member',
  claimedRosterId TEXT,
  officeHours     TEXT NOT NULL DEFAULT '',
  joinedAt        TEXT NOT NULL,
  updatedAt       TEXT NOT NULL,
  UNIQUE(clubId, userId)
);
CREATE INDEX IF NOT EXISTS idx_priv_memberships_club ON club_memberships(clubId);
CREATE INDEX IF NOT EXISTS idx_priv_memberships_user ON club_memberships(userId);

CREATE TABLE IF NOT EXISTS roster_claims (
  id                 TEXT PRIMARY KEY,
  clubId             TEXT NOT NULL,
  rosterId           TEXT NOT NULL,
  userId             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requestedRole      TEXT NOT NULL,
  rosterName         TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending',
  verificationMethod TEXT NOT NULL DEFAULT 'self_claim',
  notes              TEXT NOT NULL DEFAULT '',
  reviewedByUserId   TEXT,
  reviewedAt         TEXT,
  createdAt          TEXT NOT NULL,
  updatedAt          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_priv_claims_club ON roster_claims(clubId, status);
CREATE INDEX IF NOT EXISTS idx_priv_claims_user ON roster_claims(userId);
CREATE INDEX IF NOT EXISTS idx_priv_claims_roster ON roster_claims(clubId, rosterId, status);

CREATE TABLE IF NOT EXISTS club_role_invites (
  id               TEXT PRIMARY KEY,
  clubId           TEXT NOT NULL,
  email            TEXT NOT NULL,
  fullName         TEXT NOT NULL DEFAULT '',
  tier             TEXT NOT NULL DEFAULT 'board',
  roleTitle        TEXT NOT NULL DEFAULT 'Officer',
  rosterId         TEXT,
  invitedByUserId  TEXT NOT NULL,
  acceptedByUserId TEXT,
  createdAt        TEXT NOT NULL,
  UNIQUE(clubId, email)
);
CREATE INDEX IF NOT EXISTS idx_priv_invites_email ON club_role_invites(email);

CREATE TABLE IF NOT EXISTS club_groups (
  id              TEXT PRIMARY KEY,
  clubId          TEXT NOT NULL,
  name            TEXT NOT NULL,
  color           TEXT NOT NULL DEFAULT 'blue',
  description     TEXT NOT NULL DEFAULT '',
  createdByUserId TEXT NOT NULL,
  createdAt       TEXT NOT NULL,
  updatedAt       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_priv_groups_club ON club_groups(clubId);

CREATE TABLE IF NOT EXISTS club_group_members (
  id         TEXT PRIMARY KEY,
  groupId    TEXT NOT NULL REFERENCES club_groups(id) ON DELETE CASCADE,
  clubId     TEXT NOT NULL,
  memberKey  TEXT NOT NULL,
  userId     TEXT,
  email      TEXT NOT NULL DEFAULT '',
  name       TEXT NOT NULL,
  roleTitle  TEXT NOT NULL DEFAULT 'Member',
  personType TEXT NOT NULL DEFAULT 'member',
  addedAt    TEXT NOT NULL,
  UNIQUE(groupId, memberKey)
);
CREATE INDEX IF NOT EXISTS idx_priv_group_members_group ON club_group_members(groupId);
CREATE INDEX IF NOT EXISTS idx_priv_group_members_club ON club_group_members(clubId);

CREATE TABLE IF NOT EXISTS club_task_sections (
  id              TEXT PRIMARY KEY,
  clubId          TEXT NOT NULL,
  title           TEXT NOT NULL,
  color           TEXT NOT NULL DEFAULT 'blue',
  visibility      TEXT NOT NULL DEFAULT 'members',
  position        INTEGER NOT NULL DEFAULT 0,
  createdByUserId TEXT NOT NULL,
  createdAt       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_priv_task_sections_club ON club_task_sections(clubId);

CREATE TABLE IF NOT EXISTS club_tasks (
  id               TEXT PRIMARY KEY,
  clubId           TEXT NOT NULL,
  sectionId        TEXT NOT NULL,
  title            TEXT NOT NULL,
  notes            TEXT NOT NULL DEFAULT '',
  visibility       TEXT NOT NULL DEFAULT 'members',
  audience         TEXT NOT NULL DEFAULT 'general',
  status           TEXT NOT NULL DEFAULT 'not_started',
  priority         TEXT NOT NULL DEFAULT 'medium',
  dueDate          TEXT NOT NULL DEFAULT '',
  assigneesJson    TEXT NOT NULL DEFAULT '[]',
  groupIdsJson     TEXT NOT NULL DEFAULT '[]',
  completedByJson  TEXT NOT NULL DEFAULT '[]',
  position         INTEGER NOT NULL DEFAULT 0,
  createdByUserId  TEXT NOT NULL,
  createdByName    TEXT NOT NULL DEFAULT '',
  createdAt        TEXT NOT NULL,
  updatedAt        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_priv_tasks_club ON club_tasks(clubId, visibility);

CREATE TABLE IF NOT EXISTS club_polls (
  id                      TEXT PRIMARY KEY,
  title                   TEXT NOT NULL,
  description             TEXT NOT NULL DEFAULT '',
  hostClubId              TEXT NOT NULL DEFAULT '',
  hostClubName            TEXT NOT NULL DEFAULT '',
  collaboratingClubsJson  TEXT NOT NULL DEFAULT '[]',
  datesJson               TEXT NOT NULL DEFAULT '[]',
  startHour               INTEGER NOT NULL DEFAULT 9,
  endHour                 INTEGER NOT NULL DEFAULT 20,
  slotMinutes             INTEGER NOT NULL DEFAULT 30,
  baseTimezone            TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  location                TEXT NOT NULL DEFAULT 'TBD',
  visibility              TEXT NOT NULL DEFAULT 'public_link',
  invitedParticipantsJson TEXT NOT NULL DEFAULT '[]',
  bookedEventsJson        TEXT NOT NULL DEFAULT '[]',
  archived                INTEGER NOT NULL DEFAULT 0,
  archivedAt              TEXT,
  createdByUserId         TEXT,
  createdByName           TEXT NOT NULL DEFAULT '',
  createdAt               TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_priv_polls_club ON club_polls(hostClubId);

CREATE TABLE IF NOT EXISTS club_poll_responses (
  id            TEXT PRIMARY KEY,
  pollId        TEXT NOT NULL REFERENCES club_polls(id) ON DELETE CASCADE,
  userId        TEXT NOT NULL,
  userName      TEXT NOT NULL,
  userEmail     TEXT NOT NULL DEFAULT '',
  roleTitle     TEXT NOT NULL DEFAULT '',
  clubId        TEXT NOT NULL DEFAULT '',
  clubName      TEXT NOT NULL DEFAULT '',
  timezone      TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  freeSlotsJson TEXT NOT NULL DEFAULT '[]',
  busySlotsJson TEXT NOT NULL DEFAULT '[]',
  rawTextInput  TEXT NOT NULL DEFAULT '',
  updatedAt     TEXT NOT NULL,
  UNIQUE(pollId, userId)
);
CREATE INDEX IF NOT EXISTS idx_priv_poll_resp_poll ON club_poll_responses(pollId);

CREATE TABLE IF NOT EXISTS club_announcements_private (
  id                 TEXT PRIMARY KEY,
  clubId             TEXT NOT NULL,
  clubName           TEXT NOT NULL,
  title              TEXT NOT NULL,
  body               TEXT NOT NULL DEFAULT '',
  type               TEXT NOT NULL DEFAULT 'Update',
  visibility         TEXT NOT NULL DEFAULT 'members',
  targetGroupIdsJson TEXT NOT NULL DEFAULT '[]',
  recipientsSummary  TEXT NOT NULL DEFAULT '',
  permalink          TEXT NOT NULL DEFAULT '',
  authorUserId       TEXT NOT NULL,
  authorName         TEXT NOT NULL,
  authorRole         TEXT NOT NULL DEFAULT 'Officer',
  createdAt          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_priv_ann_club ON club_announcements_private(clubId, visibility);
