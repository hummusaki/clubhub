// ── ClubHub Multi-User Workspace, RBAC, Roster Claims, Sub-Groups & Task Board Client ──
// Wraps `/api/workspace/*` and `/api/scheduler/*` with automatic session token & Supabase Auth sync,
// plus mid-session permission revocation detection (`onPermissionRevoked` callback).

import {
  fetchActionJSON,
  setApiSessionToken,
  getApiSessionToken,
} from './client.js'
import {
  isSupabaseConfigured,
  getSupabaseAccessToken,
  signInOrSignUpWithSupabase,
  signOutSupabase,
} from '../lib/supabaseClient.js'
import {
  handleDirectWorkspaceAction,
  clearDirectUserProfileCache,
} from './supabaseDirectWorkspace.js'
import {
  handleDirectTasksAction,
  handleDirectPollAction,
} from './supabaseDirectTasksAndPolls.js'

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

export async function ensureWorkspaceAuthReady(
  fallbackUser = null,
  { forceRefresh = false } = {}
) {
  const previousToken = getApiSessionToken()
  if (forceRefresh && previousToken) {
    setApiSessionToken('')
  }

  if (isSupabaseConfigured()) {
    const sbToken = await getSupabaseAccessToken()
    if (sbToken && (!forceRefresh || sbToken !== previousToken)) {
      setApiSessionToken(sbToken)
      return sbToken
    }
  }

  if (!forceRefresh && previousToken) {
    return previousToken
  }

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

const AUTH_SKIP_PATHS = new Set(['/auth/sync-external', '/auth/session', '/auth/logout'])

async function workspaceRequest(path, options = {}) {
  const skipAuthBootstrap = AUTH_SKIP_PATHS.has(path)
  if (!skipAuthBootstrap) {
    await ensureWorkspaceAuthReady()
  }

  let res = await fetchActionJSON(`/workspace${path}`, options)

  // Transparently refresh stale in-memory Express sessions (`ch_sess_...`) after server restarts
  if (!res.ok && res.status === 401 && !skipAuthBootstrap) {
    const refreshed = await ensureWorkspaceAuthReady(null, { forceRefresh: true })
    if (refreshed) {
      res = await fetchActionJSON(`/workspace${path}`, options)
    } else {
      setApiSessionToken('')
      res = { ...res, sessionExpired: true }
    }
  }

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

  if (!res.ok && !skipAuthBootstrap) {
    const reqMethod = String(options?.method || 'GET').toUpperCase()
    if (res.status === 403 && res.code !== 'NOT_CLUB_MEMBER') {
      notifyPermissionChange({
        status: 403,
        code: res.code || 'PERMISSION_DENIED',
        error: res.error,
        path,
        method: reqMethod,
      })
    } else if (res.status === 401) {
      notifyPermissionChange({
        status: 401,
        sessionExpired: true,
        code: res.code || 'UNAUTHENTICATED',
        error: res.error,
        path,
        method: reqMethod,
      })
    }
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
  let sbRequiresConfirmation = false
  let sbErrorMsg = ''
  if (isSupabaseConfigured()) {
    try {
      const sbAuth = await signInOrSignUpWithSupabase({ email, password, fullName })
      if (sbAuth?.requiresEmailConfirmation) {
        sbRequiresConfirmation = true
      } else if (sbAuth?.session?.access_token) {
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
    } catch (err) {
      sbErrorMsg = err?.message || ''
    }
  }

  const res = await workspaceRequest('/auth/session', {
    method: 'POST',
    body: JSON.stringify({ email, password, fullName, major, gradYear, avatarBg, mode }),
  })
  if (res.ok && res.token) {
    setApiSessionToken(res.token)
    return res
  }
  if (isMissingBackendEndpoint(res) && sbRequiresConfirmation) {
    return {
      ok: false,
      requiresEmailConfirmation: true,
      error: 'Check your email inbox to confirm your Supabase account, then sign in.',
    }
  }
  if (isMissingBackendEndpoint(res) && sbErrorMsg) {
    return { ok: false, error: sbErrorMsg }
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

export async function getWorkspaceMe(fallbackUser = null) {
  await ensureWorkspaceAuthReady(fallbackUser)
  const hasClerkUser = typeof window !== 'undefined' && Boolean(window.Clerk?.user?.id)
  if (!getApiSessionToken() && !hasClerkUser) {
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
  clearDirectUserProfileCache()
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

export const sendClubTaskReminder = (clubId, taskId, payload = {}) =>
  workspaceRequest(
    `/clubs/${encodeURIComponent(clubId)}/tasks/${encodeURIComponent(taskId)}/remind`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )

export const checkDueTaskReminders = (payload = {}) =>
  workspaceRequest('/tasks/reminders/check', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

// ── 6. Poll Action Helpers (Returning Structured Errors / RBAC Status) ──

async function schedulerActionRequest(path, options = {}, fallbackUser = null) {
  await ensureWorkspaceAuthReady(fallbackUser)
  let res = await fetchActionJSON(path, options)

  // Transparently refresh stale in-memory Express sessions (`ch_sess_...`) after server restarts
  if (!res.ok && res.status === 401) {
    const refreshed = await ensureWorkspaceAuthReady(fallbackUser, { forceRefresh: true })
    if (refreshed) {
      res = await fetchActionJSON(path, options)
    } else {
      setApiSessionToken('')
      res = { ...res, sessionExpired: true }
    }
  }

  // Serverless GitHub Pages / standalone fallback: talk directly to Supabase Cloud!
  if (isMissingBackendEndpoint(res) && isSupabaseConfigured()) {
    const directRes = await handleDirectPollAction(path, options)
    if (directRes) res = directRes
  } else if (res.offline && !isSupabaseConfigured()) {
    res = {
      ...res,
      error:
        'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to GitHub Repository Secrets (or run `npm run dev:full` locally) to create and share availability polls.',
    }
  }

  if (!res.ok) {
    if (res.status === 403) {
      notifyPermissionChange({
        status: 403,
        code: res.code || 'PERMISSION_DENIED',
        error: res.error,
        path,
      })
    } else if (res.status === 401) {
      notifyPermissionChange({
        status: 401,
        sessionExpired: true,
        code: res.code || 'UNAUTHENTICATED',
        error: res.error,
        path,
      })
    }
  }

  // Normalize top-level Express poll JSON (`res.id`) and wrapped responses (`res.data.id` / `res.poll.id`)
  if (res?.ok) {
    const pollObj = res.data?.id ? res.data : res.poll?.id ? res.poll : res.id ? res : null
    if (pollObj) {
      return {
        ...pollObj,
        ...res,
        data: pollObj,
        poll: pollObj,
      }
    }
  }

  return res
}

export const createVerifiedPoll = (payload, fallbackUser = null) =>
  schedulerActionRequest(
    '/scheduler/polls',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    fallbackUser
  )

export const inviteShortcutsToPoll = (pollId, payload, fallbackUser = null) =>
  schedulerActionRequest(
    `/scheduler/polls/${encodeURIComponent(pollId)}/invite`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    fallbackUser
  )

export const submitVerifiedPollResponse = (pollId, payload, fallbackUser = null) =>
  schedulerActionRequest(
    `/scheduler/polls/${encodeURIComponent(pollId)}/respond`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    fallbackUser
  )

export const archiveVerifiedPoll = (pollId, archived = true, fallbackUser = null) =>
  schedulerActionRequest(
    `/scheduler/polls/${encodeURIComponent(pollId)}/archive`,
    {
      method: 'PATCH',
      body: JSON.stringify({ archived: Boolean(archived) }),
    },
    fallbackUser
  )

export const deleteVerifiedPoll = (pollId, fallbackUser = null) =>
  schedulerActionRequest(
    `/scheduler/polls/${encodeURIComponent(pollId)}`,
    {
      method: 'DELETE',
    },
    fallbackUser
  )
