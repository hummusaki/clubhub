// ── ClubHub Direct Browser-to-Supabase Serverless Tasks & Polls Engine ──
// Powers the Two-Tier Monday.com Task Board & Real-User Availability Polls on GitHub Pages.

import {
  getActiveSupabaseClient,
  supabase,
  isSupabaseConfigured,
  markClerkSupabaseJwtRejected,
  isJwtSignatureError,
} from '../lib/supabaseClient'
import { resolveDeduplicatedTargets } from '../utils/leadershipShortcuts'
import {
  getDirectUserProfile,
  buildDirectClubPeople,
  ensureClubRow,
} from './supabaseDirectWorkspace'

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

async function buildDirectTasksBoard(sb, clubId) {
  const cid = normalizeClub(clubId)
  const [cp, profile] = await Promise.all([
    buildDirectClubPeople(cid),
    getDirectUserProfile().catch(() => null),
  ])
  if (!cp.permission.isMember && !cp.permission.isBoard) {
    return {
      ok: false,
      status: 403,
      code: 'NOT_CLUB_MEMBER',
      error: 'Join this club to access its member task board.',
    }
  }

  const viewerId = profile?.id || null
  const defaultPersonalSecId = `sec_personal_${cid}_${viewerId || 'self'}`
  const personalSectionsMap = new Map([
    [
      defaultPersonalSecId,
      {
        id: defaultPersonalSecId,
        clubId: cid,
        title: 'My To-Do List',
        color: 'green',
        visibility: 'personal',
        position: -1,
        createdByUserId: viewerId,
        isPersonal: true,
        isDefaultPersonal: true,
      },
    ],
  ])

  const { data: rows, error } = await sb
    .from('tasks')
    .select('*')
    .eq('club_id', cid)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return { ok: false, status: 403, error: error.message }

  const userMap = new Map(cp.everyone.map(p => [p.userId, p]))
  const sectionsMap = new Map([
    [`sec_${cid}_general`, { id: `sec_${cid}_general`, title: 'General Club Checklist', color: 'teal', visibility: 'members' }],
    [`sec_${cid}_sprint`, { id: `sec_${cid}_sprint`, title: 'Team & Group Assignments', color: 'blue', visibility: 'members' }],
  ])
  if (cp.permission.isBoard) {
    sectionsMap.set(`sec_${cid}_board`, {
      id: `sec_${cid}_board`,
      title: 'Executive Board Internal',
      color: 'purple',
      visibility: 'board',
    })
  }

  const tasks = []
  const personalTasks = []

  for (const r of rows || []) {
    if (r.visibility === 'personal') {
      if (!viewerId || r.created_by !== viewerId) continue
      const rawPersonalTitle = String(r.section_title || '').trim()
      const isDefaultPersonal =
        !rawPersonalTitle || rawPersonalTitle.toLowerCase() === 'my to-do list'
      const pSecKey = isDefaultPersonal
        ? defaultPersonalSecId
        : `sec_personal_custom_${cid}_${rawPersonalTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`

      if (!personalSectionsMap.has(pSecKey)) {
        personalSectionsMap.set(pSecKey, {
          id: pSecKey,
          clubId: cid,
          title: rawPersonalTitle,
          color: r.section_color || 'green',
          visibility: 'personal',
          position: personalSectionsMap.size,
          createdByUserId: viewerId,
          isPersonal: true,
          isDefaultPersonal: false,
        })
      }

      personalTasks.push({
        id: r.id,
        clubId: cid,
        sectionId: pSecKey,
        title: r.title,
        notes: r.notes || '',
        visibility: 'personal',
        audience: 'personal',
        isPersonal: true,
        status: r.status || 'not_started',
        priority: r.priority || 'medium',
        dueDate: r.due_date || '',
        assignees: [],
        groupIds: [],
        completedBy: (r.completed_by_user_ids || []).map(uid => ({ userId: uid })),
        createdByUserId: r.created_by,
      })
      continue
    }

    const secKey = `sec_${cid}_${String(r.section_title || 'general').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`
    if (!sectionsMap.has(secKey) && (cp.permission.isBoard || r.visibility !== 'board')) {
      sectionsMap.set(secKey, {
        id: secKey,
        title: r.section_title || 'General Club Tasks',
        color: r.section_color || 'blue',
        visibility: r.visibility || 'members',
      })
    }
    const assignees = (r.assigned_user_ids || []).map(uid => {
      const p = userMap.get(uid)
      return {
        userId: uid,
        name: p?.name || 'Member',
        initials: p?.initials || toInitials(p?.name),
        email: p?.email || '',
      }
    })
    tasks.push({
      id: r.id,
      clubId: cid,
      sectionId: secKey,
      title: r.title,
      notes: r.notes || '',
      visibility: r.visibility || 'members',
      audience: r.audience || 'general',
      status: r.status || 'not_started',
      priority: r.priority || 'medium',
      dueDate: r.due_date || '',
      assignees,
      groupIds: r.assigned_group_ids || [],
      completedBy: (r.completed_by_user_ids || []).map(uid => ({ userId: uid })),
    })
  }

  return {
    ok: true,
    clubId: cid,
    permission: cp.permission,
    sections: Array.from(sectionsMap.values()),
    tasks,
    personalSections: Array.from(personalSectionsMap.values()),
    personalTasks,
    groups: cp.groups,
    shortcuts: cp.shortcuts,
  }
}

export async function handleDirectTasksAction(path, options = {}) {
  if (!isSupabaseConfigured()) return null
  const sb = getActiveSupabaseClient()
  const method = (options.method || 'GET').toUpperCase()
  const body = options.body ? JSON.parse(options.body) : {}

  const tasksMatch = path.match(/^\/clubs\/([^/]+)\/tasks(?:\/([^/]+))?$/)
  if (!tasksMatch) return null
  const cid = normalizeClub(decodeURIComponent(tasksMatch[1]))
  const tid = tasksMatch[2] ? decodeURIComponent(tasksMatch[2]) : null

  if (method === 'GET' && !tid) {
    return buildDirectTasksBoard(sb, cid)
  }

  const profile = await getDirectUserProfile()
  if (!profile) return { ok: false, status: 401, error: 'Sign in required.' }

  if (method === 'POST' && !tid) {
    const cp = await buildDirectClubPeople(cid)
    if (!cp.permission.isMember && !cp.permission.isBoard) {
      return {
        ok: false,
        status: 403,
        code: 'NOT_CLUB_MEMBER',
        error: 'Join this club to access its task board.',
      }
    }

    const wantsPersonal =
      Boolean(body.isPersonal) ||
      body.visibility === 'personal' ||
      body.audience === 'personal' ||
      String(body.sectionId || '').startsWith('sec_personal_')

    if (wantsPersonal) {
      const initStatus = body.status || 'not_started'
      const { error } = await sb.from('tasks').insert({
        club_id: cid,
        section_title: body.sectionTitle || 'My To-Do List',
        section_color: body.sectionColor || 'green',
        title: body.title,
        notes: body.notes || '',
        visibility: 'personal',
        audience: 'personal',
        status: initStatus,
        priority: body.priority || 'medium',
        due_date: body.dueDate || null,
        assigned_user_ids: [profile.id],
        assigned_group_ids: [],
        completed_by_user_ids: initStatus === 'done' ? [profile.id] : [],
        created_by: profile.id,
      })
      if (error) return { ok: false, status: 403, error: error.message }
      return buildDirectTasksBoard(sb, cid)
    }

    if (!cp.permission.isBoard) {
      return {
        ok: false,
        status: 403,
        error: 'Only claimed board members of this club can create and assign tasks.',
      }
    }

    const grpIds = new Set(body.groupIds || [])
    const personShortcuts = []
    for (const s of body.shortcutTargets || []) {
      if (String(s).startsWith('group:')) grpIds.add(String(s).slice(6))
      else personShortcuts.push(s)
    }
    const resolved = resolveDeduplicatedTargets(cp, personShortcuts, body.assignees)
    const userIds = resolved.map(p => p.userId).filter(Boolean)
    const finalGrps = Array.from(grpIds)
    const vis = body.visibility === 'board' ? 'board' : 'members'
    const aud = vis === 'board' ? 'board' : userIds.length > 0 || finalGrps.length > 0 ? 'targeted' : body.audience || 'general'

    const { error } = await sb.from('tasks').insert({
      club_id: cid,
      section_title: vis === 'board' ? 'Executive Board Internal' : aud === 'targeted' ? 'Team & Group Assignments' : 'General Club Checklist',
      section_color: vis === 'board' ? 'purple' : aud === 'targeted' ? 'blue' : 'teal',
      title: body.title,
      notes: body.notes || '',
      visibility: vis,
      audience: aud,
      status: body.status || 'not_started',
      priority: body.priority || 'medium',
      due_date: body.dueDate || null,
      assigned_user_ids: userIds,
      assigned_group_ids: finalGrps,
      created_by: profile.id,
    })
    if (error) return { ok: false, status: 403, error: error.message }
    return buildDirectTasksBoard(sb, cid)
  }

  if (method === 'PATCH' && tid) {
    const { data: existing } = await sb.from('tasks').select('*').eq('id', tid).single()
    if (!existing) return { ok: false, status: 404, error: 'Task not found.' }

    if (existing.visibility === 'personal' && existing.created_by !== profile.id) {
      return {
        ok: false,
        status: 403,
        error: 'Personal tasks are private and can only be modified by their creator.',
      }
    }

    const patch = {}
    if (body.status) patch.status = body.status
    if (body.priority) patch.priority = body.priority
    if (body.title) patch.title = body.title
    if (body.notes !== undefined) patch.notes = body.notes
    if (body.dueDate !== undefined) patch.due_date = body.dueDate || null
    if (existing.visibility === 'personal' && body.sectionTitle) {
      patch.section_title = body.sectionTitle
    }
    if (body.toggleCompletedForSelf) {
      if (existing.visibility === 'personal') {
        const willBeDone = existing.status !== 'done'
        patch.status = willBeDone ? 'done' : 'not_started'
        patch.completed_by_user_ids = willBeDone ? [profile.id] : []
      } else {
        const cur = new Set(existing.completed_by_user_ids || [])
        if (cur.has(profile.id)) cur.delete(profile.id)
        else cur.add(profile.id)
        patch.completed_by_user_ids = Array.from(cur)
      }
    }
    const { error } = await sb.from('tasks').update(patch).eq('id', tid)
    if (error) return { ok: false, status: 403, error: error.message }
    return buildDirectTasksBoard(sb, cid)
  }

  if (method === 'DELETE' && tid) {
    const { data: existing } = await sb.from('tasks').select('visibility, created_by').eq('id', tid).single()
    if (existing?.visibility === 'personal' && existing.created_by !== profile.id) {
      return {
        ok: false,
        status: 403,
        error: 'Personal tasks are private and can only be deleted by their creator.',
      }
    }
    const { error } = await sb.from('tasks').delete().eq('id', tid)
    if (error) return { ok: false, status: 403, error: error.message }
    return buildDirectTasksBoard(sb, cid)
  }

  return null
}

export async function handleDirectPollAction(path, options = {}) {
  if (!isSupabaseConfigured()) return null
  try {
    let sb = getActiveSupabaseClient()
    if (!sb) return null
    const method = (options.method || 'GET').toUpperCase()
    const body = options.body ? JSON.parse(options.body) : {}
    const [pathname, rawQuery = ''] = String(path || '').split('?')
    const searchParams = new URLSearchParams(rawQuery)

    const formatPoll = (p, resps = [], viewerId = null, clubNameOverride = '') => {
      const respondedIds = new Set((resps || []).map(r => r.user_id).filter(Boolean))
      const booked = Array.isArray(p.booked_events) ? p.booked_events : []
      const invitedIds = Array.isArray(p.invited_user_ids) ? p.invited_user_ids : []
      return {
        id: p.id,
        title: p.title,
        description: p.description || '',
        hostClubId: p.club_id || '',
        hostClubName: clubNameOverride || p.clubs?.name || p.club_id || '',
        dates: p.dates || [],
        startHour: p.start_hour ?? 9,
        endHour: p.end_hour ?? 20,
        slotMinutes: p.slot_minutes || 30,
        baseTimezone: p.timezone || 'America/Los_Angeles',
        location: p.location || 'TBD',
        visibility: p.visibility || 'public_link',
        archived: Boolean(p.archived),
        archivedAt: p.archived_at || null,
        createdByUserId: p.created_by || null,
        createdAt: p.created_at || null,
        isCreator: Boolean(viewerId && p.created_by && p.created_by === viewerId),
        invitedParticipants: invitedIds.map(uid => ({
          userId: uid,
          name: 'Invited Member',
          initials: 'IM',
          hasResponded: respondedIds.has(uid),
        })),
        bookedEvents: booked,
        calendarEvents: booked,
        responses: (resps || []).map(r => ({
          id: r.id,
          userId: r.user_id,
          userName: r.users?.full_name || 'Member',
          timezone: r.timezone || 'America/Los_Angeles',
          freeSlots: r.free_slots || [],
          busySlots: r.busy_slots || [],
        })),
      }
    }

    if (pathname === '/scheduler/polls' && method === 'GET') {
      const includeArchived =
        searchParams.get('includeArchived') === '1' ||
        searchParams.get('includeArchived') === 'true'
      const profile = await getDirectUserProfile().catch(() => null)
      const viewerId = profile?.id || null

      let { data: polls, error: pollsErr } = await sb
        .from('polls')
        .select('*, clubs(name)')
        .order('created_at', { ascending: false })
        .limit(50)

      if (pollsErr && isJwtSignatureError(pollsErr) && supabase) {
        markClerkSupabaseJwtRejected()
        sb = supabase
        const retry = await sb
          .from('polls')
          .select('*, clubs(name)')
          .order('created_at', { ascending: false })
          .limit(50)
        polls = retry.data
      }

      if (!polls?.length) return []
      const filteredPolls = polls.filter(p => {
        if (!p.archived) return true
        return Boolean(includeArchived && viewerId && p.created_by === viewerId)
      })
      if (!filteredPolls.length) return []
      const { data: resps } = await sb
        .from('poll_responses')
        .select('*, users(*)')
        .in(
          'poll_id',
          filteredPolls.map(p => p.id)
        )
      return filteredPolls.map(p =>
        formatPoll(
          p,
          (resps || []).filter(r => r.poll_id === p.id),
          viewerId
        )
      )
    }

    if (pathname === '/scheduler/polls' && method === 'POST') {
      const profile = await getDirectUserProfile()
      if (!profile) return { ok: false, status: 401, error: 'Sign in required.' }
      const cid = body.hostClubId ? normalizeClub(body.hostClubId) : null
      const clubDisplayName = String(body.hostClubName || cid || '').trim()

      if (cid) {
        await ensureClubRow(sb, cid, clubDisplayName)
      }

      const targetGroupIds = new Set()
      let invitedUserIds = []
      if (cid && Array.isArray(body.shortcutTargets) && body.shortcutTargets.length > 0) {
        const cp = await buildDirectClubPeople(cid)
        if (!cp.permission?.isBoard) {
          return {
            ok: false,
            status: 403,
            error: 'Only claimed club leadership can use bulk board/member invite shortcuts.',
          }
        }
        const personShortcuts = []
        for (const s of body.shortcutTargets) {
          if (String(s).startsWith('group:')) targetGroupIds.add(String(s).slice(6))
          else personShortcuts.push(s)
        }
        const resolved = resolveDeduplicatedTargets(cp, personShortcuts, body.invitedParticipants)
        invitedUserIds = resolved.map(p => p.userId).filter(Boolean)
      }

      const cleanVisibility = ['public_link', 'club_members', 'board_only'].includes(body.visibility)
        ? body.visibility
        : 'public_link'
      const slotMinutes = [15, 30, 60].includes(Number(body.slotMinutes))
        ? Number(body.slotMinutes)
        : 30

      const baseInsert = {
        club_id: cid,
        title: String(body.title || '').trim(),
        description: body.description || '',
        dates: body.dates || [],
        start_hour: body.startHour ?? 9,
        end_hour: body.endHour ?? 20,
        slot_minutes: slotMinutes,
        timezone: body.baseTimezone || 'America/Los_Angeles',
        location: body.location || 'TBD',
        visibility: cid ? cleanVisibility : 'public_link',
        invited_user_ids: invitedUserIds,
        target_group_ids: Array.from(targetGroupIds),
        created_by: profile.id,
      }

      let { data: saved, error } = await sb
        .from('polls')
        .insert(baseInsert)
        .select('*, clubs(name)')
        .single()

      // Backwards-compatible fallback if live DB still has an older board-only club_id RLS check
      if (
        error &&
        cid &&
        cleanVisibility !== 'board_only' &&
        /row-level security|42501/i.test(error.message || '')
      ) {
        const retry = await sb
          .from('polls')
          .insert({
            ...baseInsert,
            club_id: null,
            visibility: 'public_link',
          })
          .select('*')
          .single()
        saved = retry.data
        error = retry.error
      }

      if (error) return { ok: false, status: 403, error: error.message }
      const formatted = formatPoll(saved, [], profile.id, clubDisplayName)
      return { ok: true, poll: formatted, data: formatted, ...formatted }
    }

    const inviteMatch = pathname.match(/^\/scheduler\/polls\/([^/]+)\/invite$/)
    if (inviteMatch && method === 'POST') {
      const profile = await getDirectUserProfile()
      if (!profile) return { ok: false, status: 401, error: 'Sign in required.' }
      const pollId = decodeURIComponent(inviteMatch[1])
      const { data: existing } = await sb.from('polls').select('*').eq('id', pollId).single()
      if (!existing) return { ok: false, status: 404, error: 'Poll not found.' }
      const cid = normalizeClub(body.clubId || existing.club_id || '')
      if (!cid) return { ok: false, status: 400, error: 'Select a club to use invite shortcuts.' }
      const cp = await buildDirectClubPeople(cid)
      if (!cp.permission?.isBoard) {
        return {
          ok: false,
          status: 403,
          error: 'Only claimed board members of this club can bulk-invite board or member rosters.',
        }
      }
      const grpSet = new Set(existing.target_group_ids || [])
      const personShortcuts = []
      for (const s of body.shortcutTargets || []) {
        if (String(s).startsWith('group:')) grpSet.add(String(s).slice(6))
        else personShortcuts.push(s)
      }
      const resolved = resolveDeduplicatedTargets(cp, personShortcuts, body.participants)
      const invSet = new Set([
        ...(existing.invited_user_ids || []),
        ...resolved.map(p => p.userId).filter(Boolean),
      ])
      const { data: updated, error } = await sb
        .from('polls')
        .update({
          invited_user_ids: Array.from(invSet),
          target_group_ids: Array.from(grpSet),
        })
        .eq('id', pollId)
        .select('*, clubs(name)')
        .single()
      if (error) return { ok: false, status: 403, error: error.message }
      const { data: resps } = await sb
        .from('poll_responses')
        .select('*, users(*)')
        .eq('poll_id', pollId)
      const formatted = formatPoll(updated, resps || [], profile.id)
      return { ok: true, poll: formatted, data: formatted, ...formatted }
    }

    const bookMatch = pathname.match(/^\/scheduler\/polls\/([^/]+)\/(book|unbook)$/)
    if (bookMatch && method === 'POST') {
      const profile = await getDirectUserProfile()
      if (!profile) return { ok: false, status: 401, error: 'Sign in required.' }
      const pollId = decodeURIComponent(bookMatch[1])
      const action = bookMatch[2]
      const { data: existing } = await sb
        .from('polls')
        .select('*, clubs(name)')
        .eq('id', pollId)
        .single()
      if (!existing) return { ok: false, status: 404, error: 'Poll not found.' }
      const prevBooked = Array.isArray(existing.booked_events) ? existing.booked_events : []

      if (action === 'book') {
        if (existing.archived) {
          return {
            ok: false,
            status: 409,
            error: 'This poll is archived. Unarchive it before scheduling a meeting.',
          }
        }
        const start = body.start
        if (!start) return { ok: false, status: 400, error: 'start ISO string is required.' }
        const endIso =
          body.end || new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString()
        const eventId = `collab_evt_${pollId}_${new Date(start).getTime()}`
        const bookedEvent = {
          id: eventId,
          clubId: existing.club_id || 'personal_poll',
          clubName: existing.clubs?.name || body.clubName || 'Group Poll',
          title: body.title || existing.title,
          kind: 'meeting',
          start,
          end: endIso,
          allDay: false,
          location: body.location || existing.location || 'TBD',
          isBookedCollab: true,
          source: 'scheduler',
        }
        const nextBooked = [...prevBooked.filter(e => e.id !== eventId), bookedEvent]
        const { data: updated, error } = await sb
          .from('polls')
          .update({ booked_events: nextBooked })
          .eq('id', pollId)
          .select('*, clubs(name)')
          .single()
        if (error) return { ok: false, status: 403, error: error.message }
        const { data: resps } = await sb
          .from('poll_responses')
          .select('*, users(*)')
          .eq('poll_id', pollId)
        const formatted = formatPoll(updated, resps || [], profile.id)
        return { ok: true, booked: true, eventId, poll: formatted, data: formatted }
      } else {
        const slotMs = body.start ? new Date(body.start).getTime() : NaN
        const removedIds = []
        const nextBooked = prevBooked.filter(ev => {
          if (body.eventId && ev.id === body.eventId) {
            removedIds.push(ev.id)
            return false
          }
          if (!Number.isNaN(slotMs)) {
            const sMs = new Date(ev.start).getTime()
            const eMs = ev.end ? new Date(ev.end).getTime() : sMs + 60 * 60 * 1000
            if (slotMs >= sMs && slotMs < eMs) {
              removedIds.push(ev.id)
              return false
            }
          }
          return true
        })
        const { data: updated, error } = await sb
          .from('polls')
          .update({ booked_events: nextBooked })
          .eq('id', pollId)
          .select('*, clubs(name)')
          .single()
        if (error) return { ok: false, status: 403, error: error.message }
        const { data: resps } = await sb
          .from('poll_responses')
          .select('*, users(*)')
          .eq('poll_id', pollId)
        const formatted = formatPoll(updated, resps || [], profile.id)
        return { ok: true, unbooked: true, removedIds, poll: formatted, data: formatted }
      }
    }

    const archiveMatch = pathname.match(/^\/scheduler\/polls\/([^/]+)\/archive$/)
    if (archiveMatch && method === 'PATCH') {
      const profile = await getDirectUserProfile()
      if (!profile) return { ok: false, status: 401, error: 'Sign in required.' }
      const pollId = decodeURIComponent(archiveMatch[1])
      const { data: existing } = await sb.from('polls').select('*').eq('id', pollId).single()
      if (!existing) return { ok: false, status: 404, error: 'Poll not found.' }
      if (existing.created_by !== profile.id) {
        return {
          ok: false,
          status: 403,
          error: 'Only the creator of this poll can archive or unarchive it.',
        }
      }
      const nextArchived = body.archived === undefined ? true : Boolean(body.archived)
      const { data: updated, error } = await sb
        .from('polls')
        .update({
          archived: nextArchived,
          archived_at: nextArchived ? new Date().toISOString() : null,
        })
        .eq('id', pollId)
        .select('*, clubs(name)')
        .single()
      if (error) {
        if (/archived/i.test(error.message || '')) {
          return {
            ok: false,
            status: 400,
            error: 'Run the latest supabase/schema.sql migration in Supabase SQL Editor to enable poll archiving.',
          }
        }
        return { ok: false, status: 403, error: error.message }
      }
      const { data: resps } = await sb
        .from('poll_responses')
        .select('*, users(*)')
        .eq('poll_id', pollId)
      const formatted = formatPoll(updated, resps || [], profile.id)
      return { ok: true, archived: nextArchived, poll: formatted, data: formatted }
    }

    const itemMatch = pathname.match(/^\/scheduler\/polls\/([^/]+)$/)
    if (itemMatch && method === 'GET') {
      const pollId = decodeURIComponent(itemMatch[1])
      const profile = await getDirectUserProfile().catch(() => null)
      const viewerId = profile?.id || null
      let { data: existing, error: selErr } = await sb
        .from('polls')
        .select('*, clubs(name)')
        .eq('id', pollId)
        .maybeSingle()
      if (selErr && isJwtSignatureError(selErr) && supabase) {
        markClerkSupabaseJwtRejected()
        sb = supabase
        const retry = await sb.from('polls').select('*, clubs(name)').eq('id', pollId).maybeSingle()
        existing = retry.data
      }
      if (!existing) return null
      const { data: resps } = await sb
        .from('poll_responses')
        .select('*, users(*)')
        .eq('poll_id', pollId)
      return formatPoll(existing, resps || [], viewerId)
    }

    if (itemMatch && method === 'DELETE') {
      const profile = await getDirectUserProfile()
      if (!profile) return { ok: false, status: 401, error: 'Sign in required.' }
      const pollId = decodeURIComponent(itemMatch[1])
      const { data: existing } = await sb.from('polls').select('*').eq('id', pollId).single()
      if (!existing) return { ok: false, status: 404, error: 'Poll not found.' }
      if (existing.created_by !== profile.id) {
        return {
          ok: false,
          status: 403,
          error: 'Only the creator of this poll can delete it.',
        }
      }
      const removedEventIds = Array.isArray(existing.booked_events)
        ? existing.booked_events.map(e => e.id).filter(Boolean)
        : []
      const { error } = await sb.from('polls').delete().eq('id', pollId)
      if (error) return { ok: false, status: 403, error: error.message }
      return { ok: true, deleted: true, id: pollId, removedEventIds }
    }

    const respMatch = pathname.match(/^\/scheduler\/polls\/([^/]+)\/respond$/)
    if (respMatch && method === 'POST') {
      const profile = await getDirectUserProfile()
      if (!profile) return { ok: false, status: 401, error: 'Sign in required.' }
      const pollId = decodeURIComponent(respMatch[1])
      const { data: existing } = await sb.from('polls').select('*').eq('id', pollId).single()
      if (!existing) return { ok: false, status: 404, error: 'Poll not found.' }
      if (existing.archived) {
        return {
          ok: false,
          status: 409,
          error: 'This poll is archived and no longer accepting responses.',
        }
      }
      const freeSlots = Array.isArray(body.freeSlots) ? body.freeSlots : []
      const busySlots = Array.isArray(body.busySlots) ? body.busySlots : []
      if (freeSlots.length === 0 && busySlots.length === 0 && !body.rawTextInput) {
        await sb
          .from('poll_responses')
          .delete()
          .eq('poll_id', pollId)
          .eq('user_id', profile.id)
      } else {
        const { error } = await sb.from('poll_responses').upsert(
          {
            poll_id: pollId,
            user_id: profile.id,
            timezone: body.timezone || 'America/Los_Angeles',
            free_slots: freeSlots,
            busy_slots: busySlots,
          },
          { onConflict: 'poll_id,user_id' }
        )
        if (error) return { ok: false, status: 403, error: error.message }
      }
      const { data: p } = await sb
        .from('polls')
        .select('*, clubs(name)')
        .eq('id', pollId)
        .single()
      const { data: resps } = await sb
        .from('poll_responses')
        .select('*, users(*)')
        .eq('poll_id', pollId)
      const formatted = formatPoll(p, resps || [], profile.id)
      return { ok: true, poll: formatted, data: formatted, ...formatted }
    }

    return null
  } catch (err) {
    return {
      ok: false,
      status: err.status || 400,
      error: err.message || 'Supabase poll request failed.',
    }
  }
}
