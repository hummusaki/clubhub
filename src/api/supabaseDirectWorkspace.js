// ── ClubHub Direct Browser-to-Supabase Serverless Workspace Engine ──
// Powers GitHub Pages & static deployments directly against Supabase PostgreSQL + RLS
// whenever no Node/Express backend server is running.

import {
  getActiveSupabaseClient,
  supabase,
  isSupabaseConfigured,
  markClerkSupabaseJwtRejected,
  isClerkSupabaseJwtRejected,
  isJwtSignatureError,
  bridgeClerkToSupabaseAuth,
} from '../lib/supabaseClient.js'
import { resolveDeduplicatedTargets } from '../utils/leadershipShortcuts.js'

const normalizeClub = id => String(id || '').trim().replace(/^@+/, '').toLowerCase()
const toInitials = name =>
  String(name || 'MB')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'MB'

let cachedProfile = null
let inflightProfilePromise = null
let usersHasExternalAuthId = true

export function isMissingExternalAuthIdError(err) {
  if (!err) return false
  const code = String(err.code || '')
  if (code === '23505') return false
  const combined = `${err.message || ''} ${err.details || ''} ${err.hint || ''}`
  return (
    /external_auth_id/i.test(combined) &&
    (/schema cache|does not exist|could not find|unknown|undefined_column/i.test(combined) ||
      code === 'PGRST204' ||
      code === '42703')
  )
}

export function clearDirectUserProfileCache() {
  cachedProfile = null
  inflightProfilePromise = null
}

export async function ensureClubRow(sb, clubId, clubName = '') {
  const cid = normalizeClub(clubId)
  if (!cid || !sb) return
  await sb.from('clubs').upsert(
    { id: cid, name: clubName || cid },
    { onConflict: 'id', ignoreDuplicates: true }
  )
}

export async function resolveUserProfileWithClient({
  sb,
  extId = '',
  email = '',
  fullName = 'Member',
  authUserId = '',
}) {
  const cleanEmail = String(email || '').trim().toLowerCase()
  const cleanName = String(fullName || '').trim() || cleanEmail.split('@')[0] || 'Member'

  // Path A: Native Supabase Auth session (`auth.users` UUID) — never requires `external_auth_id`
  if (authUserId) {
    const { data: existingById } = await sb
      .from('users')
      .select('*')
      .eq('id', authUserId)
      .maybeSingle()

    if (existingById?.id) {
      if (
        extId &&
        usersHasExternalAuthId &&
        Object.prototype.hasOwnProperty.call(existingById, 'external_auth_id') &&
        !existingById.external_auth_id
      ) {
        const { error: linkErr } = await sb
          .from('users')
          .update({ external_auth_id: extId })
          .eq('id', existingById.id)
        if (linkErr && isMissingExternalAuthIdError(linkErr)) {
          usersHasExternalAuthId = false
        }
      }
      return existingById
    }

    if (cleanEmail) {
      const { data: existingByEmail } = await sb
        .from('users')
        .select('*')
        .eq('email', cleanEmail)
        .maybeSingle()
      if (existingByEmail?.id) return existingByEmail
    }

    const { data: inserted } = await sb
      .from('users')
      .upsert(
        {
          id: authUserId,
          email: cleanEmail,
          full_name: cleanName,
          verified_edu: cleanEmail.endsWith('.edu'),
        },
        { onConflict: 'id' }
      )
      .select('*')
      .single()

    if (inserted?.id) return inserted
  }

  // Path B: External Auth (Clerk JWT or legacy schema without `external_auth_id` column)
  if (!extId && !cleanEmail) return null

  let existing = null
  let selErr = null

  if (extId && usersHasExternalAuthId) {
    const byExt = await sb
      .from('users')
      .select('*')
      .eq('external_auth_id', extId)
      .maybeSingle()
    if (byExt.error && isMissingExternalAuthIdError(byExt.error)) {
      usersHasExternalAuthId = false
    } else {
      existing = byExt.data
      selErr = byExt.error
    }
  }

  if (!existing && !selErr && cleanEmail) {
    const byEmail = await sb
      .from('users')
      .select('*')
      .eq('email', cleanEmail)
      .maybeSingle()
    existing = byEmail.data
    selErr = byEmail.error
  }

  if (selErr && (isJwtSignatureError(selErr) || /JWT|401|403|invalid/i.test(selErr.message || ''))) {
    if (isJwtSignatureError(selErr)) {
      markClerkSupabaseJwtRejected()
    }
    const authErr = new Error(
      'In Supabase Dashboard -> Authentication -> Providers -> Email, turn OFF "Confirm email" (or enable Clerk under Authentication -> Third-Party Auth) so Supabase can verify your identity.'
    )
    authErr.status = 401
    authErr.code = 'SUPABASE_AUTH_SETUP_REQUIRED'
    throw authErr
  }

  if (existing?.id) {
    if (
      extId &&
      usersHasExternalAuthId &&
      Object.prototype.hasOwnProperty.call(existing, 'external_auth_id') &&
      !existing.external_auth_id
    ) {
      const { error: updErr } = await sb
        .from('users')
        .update({ external_auth_id: extId })
        .eq('id', existing.id)
      if (updErr && isMissingExternalAuthIdError(updErr)) {
        usersHasExternalAuthId = false
      }
    }
    return existing
  }

  const baseUserRow = {
    email: cleanEmail,
    full_name: cleanName,
    verified_edu: cleanEmail.endsWith('.edu'),
  }

  let inserted = null
  let insErr = null

  if (extId && usersHasExternalAuthId) {
    const res = await sb
      .from('users')
      .insert({
        ...baseUserRow,
        external_auth_id: extId,
      })
      .select('*')
      .single()
    if (res.error && isMissingExternalAuthIdError(res.error)) {
      usersHasExternalAuthId = false
    } else {
      inserted = res.data
      insErr = res.error
    }
  }

  if (!inserted && !insErr) {
    const retry = await sb
      .from('users')
      .insert(baseUserRow)
      .select('*')
      .single()
    inserted = retry.data
    insErr = retry.error
  }

  // Fallback if `public.users.id` has no `default gen_random_uuid()`
  if (!inserted && insErr && /null value in column "id"|23502/i.test(insErr.message || '')) {
    const generatedId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : null
    if (generatedId) {
      const retryWithId = await sb
        .from('users')
        .insert({ id: generatedId, ...baseUserRow })
        .select('*')
        .single()
      inserted = retryWithId.data
      insErr = retryWithId.error
    }
  }

  // Concurrent insert race fallback: re-select by email
  if (!inserted && insErr && cleanEmail && /duplicate key|23505/i.test(insErr.message || '')) {
    const existingAfterRace = await sb
      .from('users')
      .select('*')
      .eq('email', cleanEmail)
      .maybeSingle()
    if (existingAfterRace.data?.id) {
      return existingAfterRace.data
    }
  }

  if (insErr) {
    if (
      /row-level security|42501|users_id_fkey|23503|invalid input syntax for type uuid|22P02/i.test(
        insErr.message || ''
      )
    ) {
      const rlsErr = new Error(
        isClerkSupabaseJwtRejected()
          ? 'Supabase rejected your Clerk token (PGRST301). Connect Clerk in Supabase Dashboard -> Authentication -> Third-Party Auth (and enable the Supabase integration in Clerk Dashboard) so Clerk accounts work without disabling email confirmation.'
          : 'In Supabase Dashboard -> Authentication -> Providers -> Email, turn OFF "Confirm email" (or enable Clerk under Authentication -> Third-Party Auth) so Clerk accounts can create polls.'
      )
      rlsErr.status = 403
      rlsErr.code = 'SUPABASE_AUTH_SETUP_REQUIRED'
      throw rlsErr
    }
    throw new Error(insErr.message)
  }

  return inserted
}

async function loadDirectUserProfileInternal() {
  const clerkUser = typeof window !== 'undefined' ? window.Clerk?.user : null
  const extId = clerkUser?.id ? String(clerkUser.id) : ''
  const clerkEmail = (
    clerkUser?.primaryEmailAddress?.emailAddress ||
    clerkUser?.emailAddresses?.[0]?.emailAddress ||
    ''
  )
    .trim()
    .toLowerCase()
  const clerkFullName =
    clerkUser?.fullName ||
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ') ||
    clerkEmail.split('@')[0] ||
    'Member'

  // 1. Prefer native Supabase Auth session (and auto-bridge Clerk users into native Supabase Auth
  //    so legacy `auth.users` FK / `auth.uid()` RLS schemas work without `external_auth_id`!)
  if (supabase) {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      let authUser = sessionData?.session?.user || null

      if (
        authUser?.id &&
        clerkEmail &&
        authUser.email &&
        authUser.email.toLowerCase() !== clerkEmail
      ) {
        await supabase.auth.signOut().catch(() => {})
        authUser = null
      }

      if (!authUser?.id && extId && typeof window !== 'undefined' && window.Clerk?.session && !isClerkSupabaseJwtRejected()) {
        try {
          const clerkSb = getActiveSupabaseClient()
          if (clerkSb && clerkSb !== supabase) {
            const resolved = await resolveUserProfileWithClient({
              sb: clerkSb,
              extId,
              email: clerkEmail,
              fullName: clerkFullName,
            })
            if (resolved?.id) {
              cachedProfile = resolved
              return resolved
            }
          }
        } catch {
          // Clerk Third-Party Auth not accepted by Supabase; fall back to Auth bridge
        }
      }

      if (!authUser?.id && extId && clerkEmail) {
        const bridged = await bridgeClerkToSupabaseAuth({
          clerkUserId: extId,
          email: clerkEmail,
          fullName: clerkFullName,
        })
        if (bridged?.session?.user?.id) {
          authUser = bridged.session.user
        }
      }

      if (authUser?.id) {
        const email = String(authUser.email || clerkEmail || '').trim().toLowerCase()
        const fullName =
          clerkUser?.fullName ||
          authUser.user_metadata?.full_name ||
          email.split('@')[0] ||
          'Member'
        const resolved = await resolveUserProfileWithClient({
          sb: supabase,
          extId,
          email,
          fullName,
          authUserId: authUser.id,
        })
        if (resolved?.id) {
          cachedProfile = resolved
          return resolved
        }
      }
    } catch {
      // Fall through to Clerk Third-Party Auth client
    }
  }

  const sb = getActiveSupabaseClient()
  if (!sb) return null

  if (extId) {
    const resolved = await resolveUserProfileWithClient({
      sb,
      extId,
      email: clerkEmail,
      fullName: clerkFullName,
    })
    if (resolved?.id) {
      cachedProfile = resolved
      return resolved
    }
  }

  return cachedProfile
}

export async function getDirectUserProfile() {
  if (!isSupabaseConfigured()) return null
  if (inflightProfilePromise) return inflightProfilePromise
  inflightProfilePromise = loadDirectUserProfileInternal().finally(() => {
    inflightProfilePromise = null
  })
  return inflightProfilePromise
}

async function buildDirectOverview(sb, profile) {
  if (!profile?.id) {
    return { ok: false, status: 401, error: 'Sign in required.' }
  }
  const [{ data: mems }, { data: grps }] = await Promise.all([
    sb.from('club_members').select('*').eq('user_id', profile.id),
    sb.from('group_members').select('club_id, group_id').eq('user_id', profile.id),
  ])

  const groupMap = {}
  for (const g of grps || []) {
    if (!groupMap[g.club_id]) groupMap[g.club_id] = []
    groupMap[g.club_id].push(g.group_id)
  }

  const permissionsByClub = {}
  for (const m of mems || []) {
    const isBoard = (m.role === 'board' || m.role === 'president') && m.claim_status === 'approved'
    permissionsByClub[m.club_id] = {
      isMember: true,
      isBoard,
      isPresident: m.role === 'president' && m.claim_status === 'approved',
      tier: isBoard ? m.role : 'member',
      roleTitle: m.role_title || 'Member',
      groupIds: groupMap[m.club_id] || [],
    }
  }

  return {
    ok: true,
    user: {
      id: profile.id,
      email: profile.email,
      displayName: profile.full_name,
      fullName: profile.full_name,
      avatarBg: profile.avatar_bg,
      themeMode: profile.theme_mode || 'system',
    },
    memberships: mems || [],
    permissionsByClub,
  }
}

export async function buildDirectClubPeople(clubId) {
  const sb = getActiveSupabaseClient()
  const cid = normalizeClub(clubId)
  const profile = await getDirectUserProfile().catch(() => null)

  const [{ data: memRows }, { data: grpRows }, { data: gmRows }] = await Promise.all([
    sb.from('club_members').select('*, users(*)').eq('club_id', cid),
    sb.from('club_groups').select('*').eq('club_id', cid).order('created_at', { ascending: true }),
    sb.from('group_members').select('*, users(*)').eq('club_id', cid),
  ])

  const meRow = (memRows || []).find(m => m.user_id === profile?.id)
  const isBoard =
    Boolean(meRow) &&
    (meRow.role === 'board' || meRow.role === 'president') &&
    meRow.claim_status === 'approved'
  const myGroupIds = (gmRows || [])
    .filter(gm => gm.user_id === profile?.id)
    .map(gm => gm.group_id)

  const board = []
  const members = []
  const pendingClaims = []
  const myClaims = []

  for (const m of memRows || []) {
    const u = m.users || {}
    const entry = {
      id: m.claimed_position || m.id,
      memberKey: `uid:${m.user_id}`,
      userId: m.user_id,
      name: u.full_name || 'Club Member',
      initials: toInitials(u.full_name),
      email: isBoard ? u.email || '' : '',
      role: m.role_title || 'Member',
      roleTitle: m.role_title || 'Member',
      tier: m.role,
      claimedByUserId: m.claim_status === 'approved' ? m.user_id : null,
      claimedByMe: m.user_id === profile?.id && m.claim_status === 'approved',
      claimId: m.id,
      verified: m.claim_status === 'approved',
    }
    if ((m.role === 'board' || m.role === 'president') && m.claim_status === 'approved') {
      board.push(entry)
    } else {
      members.push(entry)
    }
    if (m.claim_status === 'pending') {
      const claimObj = {
        id: m.id,
        clubId: cid,
        rosterId: m.claimed_position || 'officer',
        userId: m.user_id,
        applicantName: u.full_name || 'Applicant',
        applicantEmail: isBoard ? u.email || '' : '',
        requestedRole: m.role_title || 'Officer',
        status: 'pending',
        createdAt: m.updated_at,
      }
      pendingClaims.push(claimObj)
      if (m.user_id === profile?.id) myClaims.push(claimObj)
    } else if (m.user_id === profile?.id && m.claimed_position) {
      myClaims.push({
        id: m.id,
        clubId: cid,
        rosterId: m.claimed_position,
        userId: m.user_id,
        requestedRole: m.role_title,
        status: m.claim_status,
      })
    }
  }

  const groups = (grpRows || []).map(g => ({
    id: g.id,
    clubId: cid,
    name: g.name,
    color: g.color || 'blue',
    description: g.description || '',
    members: (gmRows || [])
      .filter(gm => gm.group_id === g.id)
      .map(gm => ({
        id: gm.id,
        memberKey: `uid:${gm.user_id}`,
        userId: gm.user_id,
        name: gm.users?.full_name || 'Member',
        initials: toInitials(gm.users?.full_name),
        email: isBoard ? gm.users?.email || '' : '',
        roleTitle: 'Member',
      })),
  }))

  return {
    ok: true,
    clubId: cid,
    clubName: cid,
    permission: {
      isMember: Boolean(meRow),
      isBoard,
      isPresident: Boolean(meRow && meRow.role === 'president' && meRow.claim_status === 'approved'),
      tier: isBoard ? meRow.role : meRow ? 'member' : 'none',
      roleTitle: meRow?.role_title || '',
      groupIds: myGroupIds,
    },
    board,
    members,
    everyone: [...board, ...members],
    unclaimedPositions: [],
    pendingClaims: isBoard ? pendingClaims : [],
    myActiveClaim: myClaims.find(c => c.status === 'approved') || null,
    myClaims,
    groups,
    shortcuts: {
      allBoardCount: board.length,
      allMembersCount: board.length + members.length,
      groups: groups.map(g => ({ id: g.id, name: g.name, count: g.members.length })),
    },
  }
}

export async function handleDirectWorkspaceAction(path, options = {}) {
  try {
    const sb = getActiveSupabaseClient()
    if (!sb) return null
    const method = (options.method || 'GET').toUpperCase()
    const body = options.body ? JSON.parse(options.body) : {}

    if (path === '/status') {
      return { ok: true, storageMode: 'supabase_direct_serverless' }
    }
    if (path === '/auth/sync-external' || path === '/auth/me') {
      const profile = await getDirectUserProfile()
      return buildDirectOverview(sb, profile)
    }
    if (path === '/auth/profile' && method === 'PATCH') {
      const profile = await getDirectUserProfile()
      if (!profile) return { ok: false, status: 401, error: 'Sign in required.' }
      const patch = {}
      if (typeof body.fullName === 'string' && body.fullName.trim()) patch.full_name = body.fullName.trim()
      if (typeof body.major === 'string') patch.major = body.major.trim()
      if (typeof body.gradYear === 'string') patch.grad_year = body.gradYear.trim()
      if (typeof body.avatarBg === 'string' && body.avatarBg.trim()) patch.avatar_bg = body.avatarBg.trim()
      if (typeof body.themeMode === 'string' && ['system', 'light', 'dark'].includes(body.themeMode.trim())) {
        patch.theme_mode = body.themeMode.trim()
      }
      let updatedProfile = { ...profile, ...patch }
      if (Object.keys(patch).length > 0) {
        const { data, error } = await sb.from('users').update(patch).eq('id', profile.id).select('*').maybeSingle()
        if (!error && data) {
          updatedProfile = data
        } else if (error && patch.theme_mode) {
          const fallbackPatch = { ...patch }
          delete fallbackPatch.theme_mode
          if (Object.keys(fallbackPatch).length > 0) {
            const retry = await sb.from('users').update(fallbackPatch).eq('id', profile.id).select('*').maybeSingle()
            if (retry.data) updatedProfile = { ...retry.data, theme_mode: patch.theme_mode }
          }
        }
        cachedProfile = updatedProfile
      }
      return buildDirectOverview(sb, updatedProfile)
    }
    if (path === '/memberships/sync') {
      const profile = await getDirectUserProfile()
      if (!profile) return { ok: false, status: 401, error: 'Sign in required.' }
      for (const rawId of body.clubIds || []) {
        const cid = normalizeClub(rawId)
        if (!cid) continue
        await ensureClubRow(sb, cid)
        await sb.from('club_members').upsert(
          { club_id: cid, user_id: profile.id, role: 'member', role_title: 'Member', claim_status: 'none' },
          { onConflict: 'club_id,user_id', ignoreDuplicates: true }
        )
      }
      return buildDirectOverview(sb, profile)
    }

    const joinMatch = path.match(/^\/clubs\/([^/]+)\/(join|leave)$/)
    if (joinMatch && method === 'POST') {
      const profile = await getDirectUserProfile()
      if (!profile) return { ok: false, status: 401, error: 'Sign in required.' }
      const cid = normalizeClub(decodeURIComponent(joinMatch[1]))
      if (joinMatch[2] === 'join') {
        await ensureClubRow(sb, cid, body.clubName || cid)
        const { error } = await sb.from('club_members').upsert(
          { club_id: cid, user_id: profile.id, role: 'member', role_title: 'Member', claim_status: 'none' },
          { onConflict: 'club_id,user_id', ignoreDuplicates: true }
        )
        if (error) return { ok: false, status: 400, error: error.message }
      } else {
        await sb.from('group_members').delete().eq('club_id', cid).eq('user_id', profile.id)
        await sb.from('club_members').delete().eq('club_id', cid).eq('user_id', profile.id)
      }
      return buildDirectOverview(sb, profile)
    }

    const peopleMatch = path.match(/^\/clubs\/([^/]+)\/people$/)
    if (peopleMatch && method === 'GET') {
      return buildDirectClubPeople(decodeURIComponent(peopleMatch[1]))
    }

    const claimMatch = path.match(/^\/clubs\/([^/]+)\/claims$/)
    if (claimMatch && method === 'POST') {
      const profile = await getDirectUserProfile()
      if (!profile) return { ok: false, status: 401, error: 'Sign in required.' }
      const cid = normalizeClub(decodeURIComponent(claimMatch[1]))
      await ensureClubRow(sb, cid)
      const pos = body.rosterId || body.requestedRole || 'Officer'
      const { data, error } = await sb.rpc('claim_roster_position', {
        p_club_id: cid,
        p_position: pos,
        p_role_title: body.requestedRole || 'Officer',
      })
      if (error) {
        const isDup = /already claimed|23505/i.test(error.message || '')
        return { ok: false, status: isDup ? 409 : 400, error: error.message }
      }
      const clubPeople = await buildDirectClubPeople(cid)
      const overview = await buildDirectOverview(sb, profile)
      return { ok: true, claimStatus: data?.claim_status || 'approved', clubPeople, ...overview }
    }

    const revMatch = path.match(/^\/clubs\/([^/]+)\/claims\/([^/]+)\/(review|revoke)$/)
    if (revMatch && method === 'POST') {
      const cid = normalizeClub(decodeURIComponent(revMatch[1]))
      const claimId = decodeURIComponent(revMatch[2])
      if (revMatch[3] === 'revoke') {
        await sb
          .from('club_members')
          .update({ role: 'member', role_title: 'Member', claimed_position: null, claim_status: 'revoked' })
          .eq('id', claimId)
      } else {
        const approve = body.decision === 'approve'
        const { data: row } = await sb.from('club_members').select('*').eq('id', claimId).single()
        const role = approve
          ? /president|captain|founder|director/i.test(row?.role_title || '')
            ? 'president'
            : 'board'
          : 'member'
        const { error } = await sb
          .from('club_members')
          .update({ role, claim_status: approve ? 'approved' : 'rejected' })
          .eq('id', claimId)
        if (error) return { ok: false, status: 409, error: error.message }
      }
      return { ok: true, clubPeople: await buildDirectClubPeople(cid) }
    }

    const grpMatch = path.match(/^\/clubs\/([^/]+)\/groups(?:\/([^/]+))?$/)
    if (grpMatch) {
      const profile = await getDirectUserProfile()
      const cid = normalizeClub(decodeURIComponent(grpMatch[1]))
      const gid = grpMatch[2] ? decodeURIComponent(grpMatch[2]) : null
      if (method === 'GET') {
        const cp = await buildDirectClubPeople(cid)
        return { ok: true, clubId: cid, groups: cp.groups, permission: cp.permission }
      }
      if (method === 'POST') {
        const cp = await buildDirectClubPeople(cid)
        const people = resolveDeduplicatedTargets(cp, body.shortcutTargets, body.members)
        const { data: g, error } = await sb
          .from('club_groups')
          .insert({ club_id: cid, name: body.name, color: body.color || 'blue', description: body.description || '', created_by: profile?.id })
          .select('*')
          .single()
        if (error) return { ok: false, status: 409, error: error.message }
        const validUsers = people.filter(p => p.userId).map(p => ({ group_id: g.id, club_id: cid, user_id: p.userId, added_by: profile?.id }))
        if (validUsers.length > 0) await sb.from('group_members').upsert(validUsers, { onConflict: 'group_id,user_id' })
        return { ok: true, clubPeople: await buildDirectClubPeople(cid) }
      }
      if (method === 'PATCH' && gid) {
        if (Array.isArray(body.addMembers) && body.addMembers.length > 0) {
          const rows = body.addMembers.filter(m => m.userId).map(m => ({ group_id: gid, club_id: cid, user_id: m.userId, added_by: profile?.id }))
          if (rows.length > 0) await sb.from('group_members').upsert(rows, { onConflict: 'group_id,user_id' })
        }
        for (const mk of body.removeMemberKeys || []) {
          if (String(mk).startsWith('uid:')) {
            await sb.from('group_members').delete().eq('group_id', gid).eq('user_id', String(mk).slice(4))
          }
        }
        return { ok: true, clubPeople: await buildDirectClubPeople(cid) }
      }
      if (method === 'DELETE' && gid) {
        await sb.from('club_groups').delete().eq('id', gid)
        return { ok: true, clubPeople: await buildDirectClubPeople(cid) }
      }
    }

    if (path === '/announcements' && method === 'GET') {
      const profile = await getDirectUserProfile()
      if (!profile) {
        return { ok: true, announcements: [] }
      }
      const { data: memberships } = await sb
        .from('club_members')
        .select('club_id')
        .eq('user_id', profile.id)
      const joinedIds = Array.from(
        new Set((memberships || []).map(m => normalizeClub(m.club_id)).filter(Boolean))
      )
      if (joinedIds.length === 0) {
        return { ok: true, announcements: [] }
      }
      const { data } = await sb
        .from('announcements')
        .select('*')
        .in('club_id', joinedIds)
        .order('created_at', { ascending: false })
        .limit(50)
      return {
        ok: true,
        announcements: (data || []).map(a => ({
          id: a.id,
          clubId: a.club_id,
          clubName: a.club_id,
          title: a.title,
          body: a.body,
          type: a.type,
          visibility: a.visibility,
          createdAt: a.created_at,
        })),
      }
    }

    const annPostMatch = path.match(/^\/clubs\/([^/]+)\/announcements$/)
    if (annPostMatch && method === 'POST') {
      const profile = await getDirectUserProfile()
      const cid = normalizeClub(decodeURIComponent(annPostMatch[1]))
      const grpIds = (body.targetGroupIds || []).concat(
        (body.shortcutTargets || []).filter(s => String(s).startsWith('group:')).map(s => String(s).slice(6))
      )
      const { data, error } = await sb
        .from('announcements')
        .insert({
          club_id: cid,
          title: body.title,
          body: body.body || '',
          type: body.type || 'Update',
          visibility: body.visibility || 'members',
          target_group_ids: grpIds,
          author_id: profile?.id,
        })
        .select('*')
        .single()
      if (error) return { ok: false, status: 403, error: error.message }
      return { ok: true, announcement: data }
    }

    return null
  } catch (err) {
    return {
      ok: false,
      status: err.status || 400,
      ...(err.code ? { code: err.code } : {}),
      error: err.message || 'Supabase request failed.',
    }
  }
}
