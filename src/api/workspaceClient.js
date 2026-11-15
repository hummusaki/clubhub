// ── ClubHub Multi-User Workspace, RBAC, Roster Claims, Sub-Groups & Task Board Client ──
// Wraps `/api/workspace/*` and `/api/scheduler/*` with automatic session token & Supabase Auth sync,
// plus mid-session permission revocation detection (`onPermissionRevoked` callback).

import {
  fetchActionJSON,
  setApiSessionToken,
  getApiSessionToken,
} from './client'
import {
  isSupabaseConfigured,
  getSupabaseAccessToken,
  signInOrSignUpWithSupabase,
  signOutSupabase,
} from '../lib/supabaseClient'

const permissionRevokedListeners = new Set()

export function onWorkspacePermissionChange(listener) {
  permissionRevokedListeners.add(listener)
  return () => permissionRevokedListeners.delete(listener)
}

function notifyPermissionChange(detail) {
  for (const fn of permissionRevokedListeners) {
    try {
      fn(detail)
    } catch {
      // Ignore listener errors
    }
  }
}

async function workspaceRequest(path, options = {}) {
  // Prefer fresh Supabase JWT if Supabase Auth session is active
  if (isSupabaseConfigured()) {
    const sbToken = await getSupabaseAccessToken()
    if (sbToken) setApiSessionToken(sbToken)
  }

  const res = await fetchActionJSON(`/workspace${path}`, options)
  if (!res.ok && (res.status === 401 || res.status === 403)) {
    notifyPermissionChange({
      status: res.status,
      code: res.code || (res.status === 403 ? 'PERMISSION_DENIED' : 'UNAUTHENTICATED'),
      error: res.error,
      path,
    })
  }
  return res
}

// ── 1. Multi-User Auth & Session Lifecycle ──

export async function authenticateWorkspaceEmail({
  email,
  password,
  fullName = '',
  major = '',
  gradYear = '',
  avatarBg = '',
  mode = 'auto',
}) {
  // When Supabase Cloud keys are configured, authenticate with Supabase Auth first
  if (isSupabaseConfigured()) {
    const sbAuth = await signInOrSignUpWithSupabase({ email, password, fullName })
    if (sbAuth?.requiresEmailConfirmation) {
      return {
        ok: false,
        requiresEmailConfirmation: true,
        error: 'Check your email inbox to confirm your Supabase account, then sign in.',
      }
    }
    if (sbAuth?.session?.access_token) {
      setApiSessionToken(sbAuth.session.access_token)
      const synced = await workspaceRequest('/auth/sync-external', {
        method: 'POST',
        body: JSON.stringify({
          provider: 'supabase',
          googleAccessToken: sbAuth.session.access_token,
          email: sbAuth.user?.email || email,
          fullName: sbAuth.user?.user_metadata?.full_name || fullName,
          avatarBg,
        }),
      })
      if (synced.ok) return synced
      return {
        ok: true,
        user: {
          id: sbAuth.user.id,
          email: sbAuth.user.email,
          fullName: sbAuth.user.user_metadata?.full_name || fullName || email.split('@')[0],
          avatarBg: avatarBg || 'linear-gradient(135deg, var(--blue), var(--purple))',
        },
        token: sbAuth.session.access_token,
        memberships: [],
        claims: [],
        permissionsByClub: {},
      }
    }
  }

  const res = await workspaceRequest('/auth/session', {
    method: 'POST',
    body: JSON.stringify({ email, password, fullName, major, gradYear, avatarBg, mode }),
  })
  if (res.ok && res.token) {
    setApiSessionToken(res.token)
  }
  return res
}

export async function syncExternalWorkspaceSession(payload) {
  const res = await workspaceRequest('/auth/sync-external', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (res.ok && res.token) {
    setApiSessionToken(res.token)
  }
  return res
}

export async function getWorkspaceStatus() {
  return workspaceRequest('/status')
}

export async function getWorkspaceMe() {
  if (!getApiSessionToken() && !isSupabaseConfigured()) {
    return { ok: false, unauthenticated: true }
  }
  return workspaceRequest('/auth/me')
}

export async function logoutWorkspaceSession() {
  await signOutSupabase()
  if (getApiSessionToken()) {
    await workspaceRequest('/auth/logout', { method: 'POST' }).catch(() => {})
  }
  setApiSessionToken('')
}

// ── 2. Club Membership, Roster Claiming & Board Claim Review ──

export const joinWorkspaceClub = clubId =>
  workspaceRequest(`/clubs/${encodeURIComponent(clubId)}/join`, { method: 'POST' })

export const leaveWorkspaceClub = clubId =>
  workspaceRequest(`/clubs/${encodeURIComponent(clubId)}/leave`, { method: 'POST' })

export const syncWorkspaceMemberships = clubIds =>
  workspaceRequest('/memberships/sync', {
    method: 'POST',
    body: JSON.stringify({ clubIds }),
  })

export const getClubPeopleAndGroups = clubId =>
  workspaceRequest(`/clubs/${encodeURIComponent(clubId)}/people`)

export const claimClubRosterPosition = (clubId, payload) =>
  workspaceRequest(`/clubs/${encodeURIComponent(clubId)}/claims`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })

export const reviewClubRosterClaim = (clubId, claimId, decision) =>
  workspaceRequest(
    `/clubs/${encodeURIComponent(clubId)}/claims/${encodeURIComponent(claimId)}/review`,
    {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }
  )

export const revokeClubRosterClaim = (clubId, claimId) =>
  workspaceRequest(
    `/clubs/${encodeURIComponent(clubId)}/claims/${encodeURIComponent(claimId)}/revoke`,
    { method: 'POST' }
  )

export const assignClubMemberRole = (clubId, payload) =>
  workspaceRequest(`/clubs/${encodeURIComponent(clubId)}/roles/assign`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })

// ── 3. Club Sub-Groups (Board CRUD + Member Assignment) ──

export const getClubGroups = clubId =>
  workspaceRequest(`/clubs/${encodeURIComponent(clubId)}/groups`)

export const createClubGroup = (clubId, payload) =>
  workspaceRequest(`/clubs/${encodeURIComponent(clubId)}/groups`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })

export const updateClubGroup = (clubId, groupId, payload) =>
  workspaceRequest(
    `/clubs/${encodeURIComponent(clubId)}/groups/${encodeURIComponent(groupId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  )

export const deleteClubGroup = (clubId, groupId) =>
  workspaceRequest(
    `/clubs/${encodeURIComponent(clubId)}/groups/${encodeURIComponent(groupId)}`,
    { method: 'DELETE' }
  )

// ── 4. Targeted Club Announcements ──

export const getWorkspaceAnnouncements = () => workspaceRequest('/announcements')

export const createClubAnnouncement = (clubId, payload) =>
  workspaceRequest(`/clubs/${encodeURIComponent(clubId)}/announcements`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })

// ── 5. Two-Tier Monday.com Club Task Board ──

export const getClubTasksBoard = clubId =>
  workspaceRequest(`/clubs/${encodeURIComponent(clubId)}/tasks`)

export const createClubTaskSection = (clubId, payload) =>
  workspaceRequest(`/clubs/${encodeURIComponent(clubId)}/task-sections`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })

export const deleteClubTaskSection = (clubId, sectionId) =>
  workspaceRequest(
    `/clubs/${encodeURIComponent(clubId)}/task-sections/${encodeURIComponent(sectionId)}`,
    { method: 'DELETE' }
  )

export const createClubTask = (clubId, payload) =>
  workspaceRequest(`/clubs/${encodeURIComponent(clubId)}/tasks`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })

export const updateClubTask = (clubId, taskId, payload) =>
  workspaceRequest(
    `/clubs/${encodeURIComponent(clubId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  )

export const deleteClubTask = (clubId, taskId) =>
  workspaceRequest(
    `/clubs/${encodeURIComponent(clubId)}/tasks/${encodeURIComponent(taskId)}`,
    { method: 'DELETE' }
  )

// ── 6. Poll Action Helpers (Returning Structured Errors / RBAC Status) ──

export const createVerifiedPoll = payload =>
  fetchActionJSON('/scheduler/polls', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

export const inviteShortcutsToPoll = (pollId, payload) =>
  fetchActionJSON(`/scheduler/polls/${encodeURIComponent(pollId)}/invite`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })

export const submitVerifiedPollResponse = (pollId, payload) =>
  fetchActionJSON(`/scheduler/polls/${encodeURIComponent(pollId)}/respond`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
