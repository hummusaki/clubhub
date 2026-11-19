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

let clerkAutoSync = null
let authGeneration = 0

export async function ensureWorkspaceAuthReady(
  fallbackUser = null,
  { forceRefresh = false } = {}
) {
  const generation = authGeneration
  const previousToken = getApiSessionToken()
  if (forceRefresh && previousToken) {
    setApiSessionToken('')
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

  if (isSupabaseConfigured()) {
    const sbToken = await getSupabaseAccessToken(extEmail)
    if (generation !== authGeneration) return ''
    if (sbToken && (!forceRefresh || sbToken !== previousToken)) {
      setApiSessionToken(sbToken)
      return sbToken
    }
  }

  if (!forceRefresh && previousToken) {
    return previousToken
  }

  if (extUser?.id && extEmail) {
    const attemptedUserId = extUser.id
    if (clerkAutoSync?.userId !== attemptedUserId) {
      const request = fetchActionJSON('/workspace/auth/sync-external', {
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
          const currentClerkUser = typeof window !== 'undefined' ? window.Clerk?.user : null
          if (generation !== authGeneration || (currentClerkUser && currentClerkUser.id !== attemptedUserId)) return ''
          if (res?.ok && res.token) {
            setApiSessionToken(res.token)
            return res.token
          }
          return ''
        })
        .catch(() => '')
        .finally(() => {
          if (clerkAutoSync?.request === request) clerkAutoSync = null
        })
      clerkAutoSync = { userId: attemptedUserId, request }
    }
    return clerkAutoSync.request
  }

  return ''
}

function isMissingBackendEndpoint(res) {
  return Boolean(res?.offline || (res?.status === 404 && !res?.data?.error))
}

const AUTH_SKIP_PATHS = new Set(['/auth/sync-external', '/auth/session', '/auth/logout'])

async function workspaceRequest(path, options = {}) {
  const skipAuthBootstrap = AUTH_SKIP_PATHS.has(path)
  const generation = authGeneration
  const cancelled = () => options.signal?.aborted || (!skipAuthBootstrap && generation !== authGeneration)
  const aborted = { ok: false, aborted: true }
  if (cancelled()) return aborted
  if (!skipAuthBootstrap) {
    await ensureWorkspaceAuthReady()
  }

  if (cancelled()) return aborted
  let res = await fetchActionJSON(`/workspace${path}`, options)
  if (cancelled()) return aborted

  // Transparently refresh stale in-memory Express sessions (`ch_sess_...`) after server restarts
  if (!res.ok && res.status === 401 && !skipAuthBootstrap) {
    const refreshed = await ensureWorkspaceAuthReady(null, { forceRefresh: true })
    if (cancelled()) return aborted
    if (refreshed) {
      res = await fetchActionJSON(`/workspace${path}`, options)
    } else {
      setApiSessionToken('')
      res = { ...res, sessionExpired: true }
    }
  }

  if (cancelled()) return aborted
  // A task write may have committed before a connection failure. Only use the
  // direct fallback when no backend request was sent or the endpoint was absent.
  const ambiguousTaskWrite = res.outcomeUnknown && /^\/clubs\/[^/]+\/task(?:s|-sections)(?:\/|$)/.test(path)
  if (ambiguousTaskWrite) return res
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

  if (cancelled()) return aborted
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
            avatarBg: avatarBg || '#1A73E8',
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
  const generation = authGeneration
  const res = await workspaceRequest('/auth/sync-external', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (generation === authGeneration && res.ok && res.token) {
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

export function clearWorkspaceSession() {
  authGeneration += 1
  clerkAutoSync = null
  const token = getApiSessionToken()
  setApiSessionToken('')
  clearDirectUserProfileCache()
  return token
}

export async function logoutWorkspaceSession() {
  const token = clearWorkspaceSession()
  await Promise.all([
    signOutSupabase(),
    token ? workspaceRequest('/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }) : null,
  ])
}

// ── 2. Club Membership, Roster Claiming & Board Claim Review ──

export const joinWorkspaceClub = (clubId, signal) =>
  workspaceRequest(`/clubs/${encodeURIComponent(clubId)}/join`, { method: 'POST', signal })

export const leaveWorkspaceClub = clubId =>
  workspaceRequest(`/clubs/${encodeURIComponent(clubId)}/leave`, { method: 'POST' })

export const syncWorkspaceMemberships = clubIds =>
  workspaceRequest('/memberships/sync', {
    method: 'POST',
    body: JSON.stringify({ clubIds }),
  })

export const getClubPeopleAndGroups = (clubId, signal) =>
  workspaceRequest(`/clubs/${encodeURIComponent(clubId)}/people`, { signal })

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

export const getClubTasksBoard = (clubId, signal) =>
  workspaceRequest(`/clubs/${encodeURIComponent(clubId)}/tasks`, { signal })

export const createClubTaskSection = (clubId, payload, signal) =>
  workspaceRequest(`/clubs/${encodeURIComponent(clubId)}/task-sections`, {
    method: 'POST',
    body: JSON.stringify(payload),
    signal,
  })

export const deleteClubTaskSection = (clubId, sectionId, signal) =>
  workspaceRequest(
    `/clubs/${encodeURIComponent(clubId)}/task-sections/${encodeURIComponent(sectionId)}`,
    { method: 'DELETE', signal }
  )

export const createClubTask = (clubId, payload, signal) =>
  workspaceRequest(`/clubs/${encodeURIComponent(clubId)}/tasks`, {
    method: 'POST',
    body: JSON.stringify(payload),
    signal,
  })

export const updateClubTask = (clubId, taskId, payload, signal) =>
  workspaceRequest(
    `/clubs/${encodeURIComponent(clubId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
      signal,
    }
  )

export const deleteClubTask = (clubId, taskId, signal) =>
  workspaceRequest(
    `/clubs/${encodeURIComponent(clubId)}/tasks/${encodeURIComponent(taskId)}`,
    { method: 'DELETE', signal }
  )

export const sendClubTaskReminder = (clubId, taskId, payload = {}, signal) =>
  workspaceRequest(
    `/clubs/${encodeURIComponent(clubId)}/tasks/${encodeURIComponent(taskId)}/remind`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      signal,
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
