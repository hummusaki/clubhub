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
import { handleDirectWorkspaceAction } from './supabaseDirectWorkspace'
import { handleDirectTasksAction, handleDirectPollAction } from './supabaseDirectTasksAndPolls'

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

let clerkAutoSyncPromise = null

export async function ensureWorkspaceAuthReady(fallbackUser = null) {
  if (isSupabaseConfigured()) {
    const sbToken = await getSupabaseAccessToken()
    if (sbToken) {
      setApiSessionToken(sbToken)
      return sbToken
    }
  }
  const existingToken = getApiSessionToken()
  if (existingToken) return existingToken

  const extUser =
    (typeof window !== 'undefined' ? window.Clerk?.user : null) || fallbackUser || null
  const extEmail = (
    extUser?.primaryEmailAddress?.emailAddress ||
    extUser?.emailAddresses?.[0]?.emailAddress ||
    extUser?.email ||
    ''
  )
    .trim()
    .toLowerCase()

  if (extUser?.id && extEmail) {
    if (!clerkAutoSyncPromise) {
      clerkAutoSyncPromise = fetchActionJSON('/workspace/auth/sync-external', {
        method: 'POST',
        body: JSON.stringify({
          provider: 'clerk',
          clerkUserId: String(extUser.id).startsWith('user_') ? extUser.id : undefined,
          email: extEmail,
          fullName:
            extUser.fullName ||
            [extUser.firstName, extUser.lastName].filter(Boolean).join(' ') ||
            extEmail.split('@')[0],
        }),
      })
        .then(res => {
          if (res?.ok && res.token) {
            setApiSessionToken(res.token)
            return res.token
          }
          return ''
        })
        .catch(() => '')
        .finally(() => {
          clerkAutoSyncPromise = null
        })
    }
    return clerkAutoSyncPromise
  }

  return ''
}

function isMissingBackendEndpoint(res) {
  return Boolean(res?.offline || (res?.status === 404 && !res?.data?.error))
}

async function workspaceRequest(path, options = {}) {
  if (path !== '/auth/sync-external' && path !== '/auth/session') {
    await ensureWorkspaceAuthReady()
  }

  let res = await fetchActionJSON(`/workspace${path}`, options)

  // Serverless GitHub Pages / standalone fallback: talk directly to Supabase Cloud!
  if (isMissingBackendEndpoint(res) && isSupabaseConfigured()) {
    const directRes =
      (await handleDirectTasksAction(path, options)) ||
      (await handleDirectWorkspaceAction(path, options))
    if (directRes) res = directRes
  } else if (res.offline && !isSupabaseConfigured()) {
    res = {
      ...res,
      error:
        'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to GitHub Repository Secrets (or run `npm run dev:full` locally) to enable live multi-user club actions.',
    }
  }

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
  await ensureWorkspaceAuthReady()
  if (!getApiSessionToken() && !isSupabaseConfigured()) {
    return { ok: false, unauthenticated: true }
  }
  return workspaceRequest('/auth/me')
}

export const updateWorkspaceProfile = payload =>
  workspaceRequest('/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })

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

export const createVerifiedPoll = async (payload, fallbackUser = null) => {
  await ensureWorkspaceAuthReady(fallbackUser)
  const res = await fetchActionJSON('/scheduler/polls', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (isMissingBackendEndpoint(res) && isSupabaseConfigured()) {
    return (await handleDirectPollAction('/scheduler/polls', {
      method: 'POST',
      body: JSON.stringify(payload),
    })) || res
  }
  return res
}

export const inviteShortcutsToPoll = async (pollId, payload, fallbackUser = null) => {
  await ensureWorkspaceAuthReady(fallbackUser)
  const path = `/scheduler/polls/${encodeURIComponent(pollId)}/invite`
  const bodyStr = JSON.stringify(payload)
  const res = await fetchActionJSON(path, {
    method: 'POST',
    body: bodyStr,
  })
  if (isMissingBackendEndpoint(res) && isSupabaseConfigured()) {
    return (
      (await handleDirectPollAction(path, {
        method: 'POST',
        body: bodyStr,
      })) || res
    )
  }
  return res
}

export const submitVerifiedPollResponse = async (pollId, payload, fallbackUser = null) => {
  await ensureWorkspaceAuthReady(fallbackUser)
  const path = `/scheduler/polls/${encodeURIComponent(pollId)}/respond`
  const res = await fetchActionJSON(path, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (isMissingBackendEndpoint(res) && isSupabaseConfigured()) {
    return (await handleDirectPollAction(path, {
      method: 'POST',
      body: JSON.stringify(payload),
    })) || res
  }
  return res
}

export const archiveVerifiedPoll = async (pollId, archived = true, fallbackUser = null) => {
  await ensureWorkspaceAuthReady(fallbackUser)
  const path = `/scheduler/polls/${encodeURIComponent(pollId)}/archive`
  const bodyStr = JSON.stringify({ archived: Boolean(archived) })
  const res = await fetchActionJSON(path, {
    method: 'PATCH',
    body: bodyStr,
  })
  if (isMissingBackendEndpoint(res) && isSupabaseConfigured()) {
    return (
      (await handleDirectPollAction(path, {
        method: 'PATCH',
        body: bodyStr,
      })) || res
    )
  }
  return res
}

export const deleteVerifiedPoll = async (pollId, fallbackUser = null) => {
  await ensureWorkspaceAuthReady(fallbackUser)
  const path = `/scheduler/polls/${encodeURIComponent(pollId)}`
  const res = await fetchActionJSON(path, {
    method: 'DELETE',
  })
  if (isMissingBackendEndpoint(res) && isSupabaseConfigured()) {
    return (
      (await handleDirectPollAction(path, {
        method: 'DELETE',
      })) || res
    )
  }
  return res
}
