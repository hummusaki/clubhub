// ── ClubHub Multi-User Authentication & Per-Club RBAC Service ──
// Handles scrypt password hashing, SHA-256 session tokens, pre-invited officer auto-linking,
// and strict per-club permission resolution (`none` | `member` | `board` | `president`).

import crypto from 'node:crypto';
import {
  privQueryAll,
  privQueryGet,
  privExecute,
  privBatch,
} from '../privateDb.js';
import {
  verifySupabaseAccessToken,
} from '../supabaseClient.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function normalizeEmail(email = '') {
  return String(email || '').trim().toLowerCase();
}

export function normalizeClubKey(clubId = '') {
  return String(clubId || '').trim().replace(/^@+/, '').toLowerCase();
}

export function deriveDisplayNameFromEmail(email = '') {
  const local = normalizeEmail(email).split('@')[0] || 'student';
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ') || 'Student'
  );
}

export function hashPasswordScrypt(password, existingSalt = null) {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPasswordScrypt(password, expectedHash, salt) {
  if (!password || !expectedHash || !salt) return false;
  try {
    const derived = crypto.scryptSync(String(password), salt, 64);
    const expected = Buffer.from(String(expectedHash), 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function hashSessionToken(rawToken = '') {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

export function sanitizeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    major: row.major || '',
    gradYear: row.gradYear || '',
    avatarBg: row.avatarBg || 'linear-gradient(135deg, var(--blue), var(--purple))',
    authProvider: row.authProvider || 'email',
    verifiedEdu: Boolean(row.verifiedEdu),
    createdAt: row.createdAt,
  };
}

export function classifyLeadershipTier(roleTitle = '') {
  const r = String(roleTitle || '').trim();
  if (
    /\b(co-?president|president|executive\s+vice\s+president|evp|chancellor|captain|founder|executive\s+director|official\s+club|primary\s+contact)\b/i.test(
      r
    )
  ) {
    return 'president';
  }
  return 'board';
}

export async function createUserSession(userId) {
  const rawToken = `ch_sess_${crypto.randomBytes(32).toString('base64url')}`;
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

  await privExecute(
    `INSERT INTO user_sessions (tokenHash, userId, expiresAt, createdAt)
     VALUES (?, ?, ?, ?)`,
    [tokenHash, userId, expiresAt, now.toISOString()]
  );

  return { token: rawToken, expiresAt };
}

export async function revokeSessionToken(rawToken) {
  if (!rawToken) return;
  const tokenHash = hashSessionToken(rawToken);
  await privExecute(`DELETE FROM user_sessions WHERE tokenHash = ?`, [tokenHash]);
}

/**
 * Automatically links pre-invited officer/member roles (`club_role_invites`) and group memberships
 * matching the user's verified email when they create an account or sign in.
 */
export async function reconcileEmailLinksForUser(user) {
  if (!user?.id || !user?.email) return;
  const emailLower = normalizeEmail(user.email);
  const nowIso = new Date().toISOString();

  // Backfill userId on any group membership rows added by email before the user registered
  await privExecute(
    `UPDATE club_group_members
        SET userId = ?
      WHERE LOWER(email) = ? AND (userId IS NULL OR userId = '')`,
    [user.id, emailLower]
  );

  const pendingInvites = await privQueryAll(
    `SELECT * FROM club_role_invites
      WHERE LOWER(email) = ? AND (acceptedByUserId IS NULL OR acceptedByUserId = '')`,
    [emailLower]
  );

  for (const inv of pendingInvites) {
    const tier = inv.tier === 'president' || inv.tier === 'board' ? inv.tier : 'member';
    const membershipId = `${inv.clubId}::${user.id}`;
    const rosterId =
      inv.rosterId || `invited_${inv.clubId}_${emailLower.replace(/[^a-z0-9]+/g, '_')}`;

    await privBatch([
      {
        sql: `INSERT INTO club_memberships (
                id, clubId, userId, tier, roleTitle, claimedRosterId, officeHours, joinedAt, updatedAt
              ) VALUES (?, ?, ?, ?, ?, ?, '', ?, ?)
              ON CONFLICT(clubId, userId) DO UPDATE SET
                tier = CASE
                  WHEN excluded.tier = 'president' THEN 'president'
                  WHEN club_memberships.tier = 'president' THEN 'president'
                  WHEN excluded.tier = 'board' THEN 'board'
                  ELSE club_memberships.tier
                END,
                roleTitle = excluded.roleTitle,
                claimedRosterId = COALESCE(excluded.claimedRosterId, club_memberships.claimedRosterId),
                updatedAt = excluded.updatedAt`,
        params: [
          membershipId,
          inv.clubId,
          user.id,
          tier,
          inv.roleTitle || 'Officer',
          tier !== 'member' ? rosterId : null,
          nowIso,
          nowIso,
        ],
      },
      ...(tier !== 'member'
        ? [
            {
              sql: `INSERT INTO roster_claims (
                      id, clubId, rosterId, userId, requestedRole, rosterName,
                      status, verificationMethod, notes, reviewedByUserId, reviewedAt, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, 'approved', 'board_invited', 'Pre-invited by club leadership', ?, ?, ?, ?)`,
              params: [
                `claim_inv_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
                inv.clubId,
                rosterId,
                user.id,
                inv.roleTitle || 'Officer',
                user.fullName,
                inv.invitedByUserId,
                nowIso,
                nowIso,
                nowIso,
              ],
            },
          ]
        : []),
      {
        sql: `UPDATE club_role_invites SET acceptedByUserId = ? WHERE id = ?`,
        params: [user.id, inv.id],
      },
    ]);
  }
}

export async function registerOrLoginEmailUser({
  email,
  password,
  fullName = '',
  major = '',
  gradYear = '',
  avatarBg = '',
  mode = 'auto', // 'auto' | 'register' | 'login'
}) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
    const err = new Error('A valid email address is required.');
    err.status = 400;
    throw err;
  }
  if (!password || String(password).length < 6) {
    const err = new Error('Password must be at least 6 characters.');
    err.status = 400;
    throw err;
  }

  const existing = await privQueryGet(`SELECT * FROM users WHERE email = ?`, [cleanEmail]);
  const nowIso = new Date().toISOString();

  if (existing) {
    if (mode === 'register') {
      const err = new Error('An account with this email already exists. Please sign in.');
      err.status = 409;
      throw err;
    }

    if (existing.passwordHash && existing.passwordSalt) {
      const ok = verifyPasswordScrypt(password, existing.passwordHash, existing.passwordSalt);
      if (!ok) {
        const err = new Error('Incorrect password for this account.');
        err.status = 401;
        throw err;
      }
    } else {
      // Account was previously created via OAuth without a password; set password ONLY if explicitly updating via OAuth, reject raw password takeover!
      const err = new Error(
        `This account signs in via ${existing.authProvider || 'SSO'}. Please continue with Google / SSO.`
      );
      err.status = 401;
      throw err;
    }

    const nextName = fullName.trim() || existing.fullName;
    const nextMajor = major.trim() || existing.major || '';
    const nextAvatar = avatarBg.trim() || existing.avatarBg || '';
    await privExecute(
      `UPDATE users SET fullName = ?, major = ?, avatarBg = ?, updatedAt = ? WHERE id = ?`,
      [nextName, nextMajor, nextAvatar, nowIso, existing.id]
    );

    const updated = await privQueryGet(`SELECT * FROM users WHERE id = ?`, [existing.id]);
    await reconcileEmailLinksForUser(updated);
    const session = await createUserSession(updated.id);
    return {
      user: sanitizeUser(updated),
      token: session.token,
      expiresAt: session.expiresAt,
      created: false,
    };
  }

  if (mode === 'login') {
    const err = new Error('No account found for this email address.');
    err.status = 404;
    throw err;
  }

  const userId = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const { hash, salt } = hashPasswordScrypt(password);
  const resolvedName = fullName.trim() || deriveDisplayNameFromEmail(cleanEmail);
  const verifiedEdu = cleanEmail.endsWith('.edu') ? 1 : 0;
  const resolvedAvatar =
    avatarBg.trim() || 'linear-gradient(135deg, var(--blue), var(--purple))';

  await privExecute(
    `INSERT INTO users (
      id, email, fullName, major, gradYear, avatarBg,
      passwordHash, passwordSalt, authProvider, externalAuthId, verifiedEdu, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'email', NULL, ?, ?, ?)`,
    [
      userId,
      cleanEmail,
      resolvedName,
      major.trim(),
      gradYear.trim(),
      resolvedAvatar,
      hash,
      salt,
      verifiedEdu,
      nowIso,
      nowIso,
    ]
  );

  const createdUser = await privQueryGet(`SELECT * FROM users WHERE id = ?`, [userId]);
  await reconcileEmailLinksForUser(createdUser);
  const session = await createUserSession(userId);
  return {
    user: sanitizeUser(createdUser),
    token: session.token,
    expiresAt: session.expiresAt,
    created: true,
  };
}

/**
 * Verifies Google OAuth access token or Clerk identity and issues a private session token.
 */
export async function syncExternalAuthUser({
  provider = 'clerk',
  googleAccessToken = '',
  clerkUserId = '',
  email = '',
  fullName = '',
  avatarBg = '',
}) {
  let verifiedEmail = normalizeEmail(email);
  let verifiedName = String(fullName || '').trim();
  let externalId = String(clerkUserId || '').trim();

  if (provider === 'supabase' && googleAccessToken) {
    const sbUser = await verifySupabaseAccessToken(googleAccessToken);
    if (!sbUser) {
      const err = new Error('Invalid Supabase session token.');
      err.status = 401;
      throw err;
    }
    verifiedEmail = normalizeEmail(sbUser.email);
    verifiedName = sbUser.user_metadata?.full_name || verifiedName;
    externalId = sbUser.id || externalId;
  } else if (provider === 'google' && googleAccessToken) {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
    });
    if (!res.ok) {
      const err = new Error('Invalid Google OAuth access token.');
      err.status = 401;
      throw err;
    }
    const info = await res.json();
    verifiedEmail = normalizeEmail(info.email);
    verifiedName = info.name || verifiedName;
    externalId = info.sub || externalId;
  } else if (provider === 'clerk' && process.env.CLERK_SECRET_KEY && externalId) {
    // When CLERK_SECRET_KEY is configured on server, verify Clerk user ID directly via Clerk Backend API
    const res = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(externalId)}`, {
      headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
    });
    if (!res.ok) {
      const err = new Error('Could not verify Clerk user identity.');
      err.status = 401;
      throw err;
    }
    const clerkUser = await res.json();
    const primaryEmailObj = (clerkUser.email_addresses || []).find(
      e => e.id === clerkUser.primary_email_address_id
    ) || (clerkUser.email_addresses || [])[0];
    verifiedEmail = normalizeEmail(primaryEmailObj?.email_address || verifiedEmail);
    verifiedName =
      [clerkUser.first_name, clerkUser.last_name].filter(Boolean).join(' ').trim() ||
      verifiedName;
  }

  if (!verifiedEmail || !verifiedEmail.includes('@')) {
    const err = new Error('Authenticated email is required.');
    err.status = 400;
    throw err;
  }

  const nowIso = new Date().toISOString();
  let existing = await privQueryGet(`SELECT * FROM users WHERE email = ?`, [verifiedEmail]);

  if (existing) {
    // Prevent unverified external sync from hijacking a password-protected account unless externalAuthId matches or CLERK_SECRET_KEY / Google verified it
    const wasVerifiedExternally =
      (provider === 'supabase' && Boolean(googleAccessToken)) ||
      (provider === 'google' && Boolean(googleAccessToken)) ||
      (provider === 'clerk' && Boolean(process.env.CLERK_SECRET_KEY && externalId));

    if (
      !wasVerifiedExternally &&
      existing.passwordHash &&
      existing.externalAuthId !== externalId
    ) {
      const err = new Error(
        'This email is protected by a password. Sign in with your password first.'
      );
      err.status = 403;
      throw err;
    }

    await privExecute(
      `UPDATE users
          SET fullName = ?,
              externalAuthId = COALESCE(?, externalAuthId),
              updatedAt = ?
        WHERE id = ?`,
      [
        verifiedName || existing.fullName,
        externalId || null,
        nowIso,
        existing.id,
      ]
    );
    existing = await privQueryGet(`SELECT * FROM users WHERE id = ?`, [existing.id]);
  } else {
    const userId = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const resolvedName = verifiedName || deriveDisplayNameFromEmail(verifiedEmail);
    const verifiedEdu = verifiedEmail.endsWith('.edu') ? 1 : 0;
    await privExecute(
      `INSERT INTO users (
        id, email, fullName, major, gradYear, avatarBg,
        passwordHash, passwordSalt, authProvider, externalAuthId, verifiedEdu, createdAt, updatedAt
      ) VALUES (?, ?, ?, '', '', ?, NULL, NULL, ?, ?, ?, ?, ?)`,
      [
        userId,
        verifiedEmail,
        resolvedName,
        avatarBg || 'linear-gradient(135deg, var(--blue), var(--purple))',
        provider,
        externalId || null,
        verifiedEdu,
        nowIso,
        nowIso,
      ]
    );
    existing = await privQueryGet(`SELECT * FROM users WHERE id = ?`, [userId]);
  }

  await reconcileEmailLinksForUser(existing);
  const session = await createUserSession(existing.id);
  return {
    user: sanitizeUser(existing),
    token: session.token,
    expiresAt: session.expiresAt,
  };
}

export function extractBearerToken(req) {
  const header = String(req?.headers?.authorization || '');
  if (header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  return '';
}

export async function getAuthenticatedUser(req) {
  const rawToken = extractBearerToken(req);
  if (!rawToken) return null;

  // 1. Verify Supabase Auth JWT when token is a Supabase access_token
  if (!rawToken.startsWith('ch_sess_')) {
    const sbUser = await verifySupabaseAccessToken(rawToken);
    if (sbUser?.email) {
      const cleanEmail = normalizeEmail(sbUser.email);
      const nowIso = new Date().toISOString();
      let existing = await privQueryGet(`SELECT * FROM users WHERE email = ?`, [cleanEmail]);
      if (!existing) {
        const uid = sbUser.id || `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
        const resolvedName =
          sbUser.user_metadata?.full_name || deriveDisplayNameFromEmail(cleanEmail);
        await privExecute(
          `INSERT INTO users (
            id, email, fullName, major, gradYear, avatarBg,
            passwordHash, passwordSalt, authProvider, externalAuthId, verifiedEdu, createdAt, updatedAt
          ) VALUES (?, ?, ?, '', '', 'linear-gradient(135deg, var(--blue), var(--purple))', NULL, NULL, 'supabase', ?, ?, ?, ?)`,
          [uid, cleanEmail, resolvedName, sbUser.id, cleanEmail.endsWith('.edu') ? 1 : 0, nowIso, nowIso]
        );
        existing = await privQueryGet(`SELECT * FROM users WHERE email = ?`, [cleanEmail]);
        await reconcileEmailLinksForUser(existing);
      }
      return sanitizeUser(existing);
    }
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);
  const nowIso = new Date().toISOString();

  const session = await privQueryGet(
    `SELECT s.tokenHash, s.expiresAt, u.*
       FROM user_sessions s
       JOIN users u ON u.id = s.userId
      WHERE s.tokenHash = ?`,
    [tokenHash]
  );

  if (!session) return null;
  if (session.expiresAt <= nowIso) {
    await privExecute(`DELETE FROM user_sessions WHERE tokenHash = ?`, [tokenHash]);
    return null;
  }

  return sanitizeUser(session);
}

/**
 * Resolves exact per-club RBAC permissions & group memberships for a user.
 */
export async function getClubPermission(user, rawClubId) {
  const clubId = normalizeClubKey(rawClubId);
  if (!user?.id || !clubId) {
    return {
      clubId,
      tier: 'none',
      isMember: false,
      isBoard: false,
      isPresident: false,
      roleTitle: '',
      claimedRosterId: null,
      groupIds: [],
    };
  }

  const membership = await privQueryGet(
    `SELECT * FROM club_memberships WHERE clubId = ? AND userId = ?`,
    [clubId, user.id]
  );

  const groupRows = await privQueryAll(
    `SELECT DISTINCT groupId
       FROM club_group_members
      WHERE clubId = ?
        AND (userId = ? OR (email != '' AND LOWER(email) = ?))`,
    [clubId, user.id, normalizeEmail(user.email)]
  );

  const tier = membership?.tier || 'none';
  const isBoard = tier === 'board' || tier === 'president';
  const isPresident = tier === 'president';
  const isMember = tier !== 'none';

  return {
    clubId,
    tier,
    isMember,
    isBoard,
    isPresident,
    roleTitle: membership?.roleTitle || '',
    claimedRosterId: membership?.claimedRosterId || null,
    officeHours: membership?.officeHours || '',
    groupIds: groupRows.map(g => g.groupId),
  };
}

/**
 * Returns a full map of all club permissions, memberships, and claims for the signed-in user.
 */
export async function getUserWorkspaceOverview(user) {
  if (!user?.id) {
    return {
      user: null,
      memberships: [],
      claims: [],
      permissionsByClub: {},
    };
  }

  const memberships = await privQueryAll(
    `SELECT * FROM club_memberships WHERE userId = ? ORDER BY updatedAt DESC`,
    [user.id]
  );

  const claims = await privQueryAll(
    `SELECT * FROM roster_claims WHERE userId = ? ORDER BY createdAt DESC`,
    [user.id]
  );

  const groupRows = await privQueryAll(
    `SELECT clubId, groupId
       FROM club_group_members
      WHERE userId = ? OR (email != '' AND LOWER(email) = ?)`,
    [user.id, normalizeEmail(user.email)]
  );

  const groupsByClub = new Map();
  for (const g of groupRows) {
    if (!groupsByClub.has(g.clubId)) groupsByClub.set(g.clubId, []);
    groupsByClub.get(g.clubId).push(g.groupId);
  }

  const permissionsByClub = {};
  for (const m of memberships) {
    const tier = m.tier || 'member';
    permissionsByClub[m.clubId] = {
      clubId: m.clubId,
      tier,
      isMember: true,
      isBoard: tier === 'board' || tier === 'president',
      isPresident: tier === 'president',
      roleTitle: m.roleTitle || 'Member',
      claimedRosterId: m.claimedRosterId || null,
      officeHours: m.officeHours || '',
      groupIds: groupsByClub.get(m.clubId) || [],
    };
  }

  return {
    user,
    memberships,
    claims,
    permissionsByClub,
  };
}
