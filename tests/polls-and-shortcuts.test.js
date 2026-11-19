import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPollResponseQueue } from '../src/utils/pollResponseQueue.js';
import { privExecute } from '../server/privateDb.js';
import { expandShortcutTargets } from '../server/routes/workspace.js';
import {
  startTestServer,
  resetTestDb,
  apiRequest,
  registerUser,
} from './helpers/testServer.js';

it('debounces poll responses independently, serializes updates and retries failed saves', async () => {
  const writes = [];
  const statuses = [];
  let releaseFirst;
  const queue = createPollResponseQueue({
    delay: 10_000,
    save: (id, slots) => {
      writes.push([id, slots]);
      if (id === 'alpha' && writes.length === 1) return new Promise(resolve => { releaseFirst = resolve; });
      if (id === 'beta') return { ok: writes.filter(([poll]) => poll === id).length > 1 };
      return { ok: true };
    },
    onStatus: (id, status) => statuses.push([id, status]),
  });
  try {
    queue.schedule('alpha', ['9:00']);
    queue.schedule('alpha', ['9:30']);
    const first = queue.flush('alpha');
    await Promise.resolve();
    queue.schedule('alpha', ['10:00']);
    const latest = queue.flush('alpha');
    queue.schedule('beta', ['14:00']);

    assert.equal(await queue.flush('beta'), false);
    assert.deepEqual(statuses.at(-1), ['beta', 'error']);
    assert.equal(await queue.flush('beta'), true);
    assert.deepEqual(statuses.at(-1), ['beta', 'saved']);
    assert.deepEqual(writes, [['alpha', ['9:30']], ['beta', ['14:00']], ['beta', ['14:00']]]);

    releaseFirst({ ok: true });
    await first;
    assert.equal(await latest, true);
    assert.deepEqual(writes.at(-1), ['alpha', ['10:00']]);
    assert.deepEqual(statuses.filter(([id, status]) => id === 'alpha' && status === 'saved'), [['alpha', 'saved']]);
  } finally {
    queue.dispose();
  }
});

it('drops pending poll writes when their workspace account is closed', async () => {
  const writes = [];
  const queue = createPollResponseQueue({
    delay: 0,
    save: id => { writes.push(id); return { ok: true }; },
    onStatus: () => {},
  });
  queue.schedule('alpha', ['9:30']);
  queue.dispose();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(writes, []);
});

describe('Phase 2 & 3: Real-User Availability Polls, Sub-Groups & Shortcut Deduplication', () => {
  let ctx;

  before(async () => {
    ctx = await startTestServer();
  });

  after(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  it('starts with zero fake/demo poll responders and binds poll availability strictly to authenticated users', async () => {
    // 1. Fresh poll list contains zero polls and zero fake responders
    const initialList = await apiRequest(ctx.baseUrl, '/api/scheduler/polls');
    assert.equal(initialList.status, 200);
    assert.deepEqual(initialList.data, []);

    const organizer = await registerUser(ctx.baseUrl, {
      email: 'organizer@example.edu',
      fullName: 'Poll Organizer',
    });
    const responder = await registerUser(ctx.baseUrl, {
      email: 'responder@example.edu',
      fullName: 'Real Responder',
    });

    // 2. Newly created poll has zero demo responders (`responses: []`)
    const createRes = await apiRequest(ctx.baseUrl, '/api/scheduler/polls', {
      method: 'POST',
      token: organizer.token,
      body: {
        title: 'Weekly Club Sync',
        dates: ['2026-11-16', '2026-11-17'],
        startHour: 10,
        endHour: 14,
        visibility: 'public_link',
      },
    });
    assert.equal(createRes.status, 201);
    assert.deepEqual(createRes.data.responses, []);
    const pollId = createRes.data.id;

    // 3. Responder submits availability, attempting to spoof `userId` and `userName` in body -> server binds strictly to `req.user`!
    const slot1 = '2026-11-16T18:00:00.000Z';
    const slot2 = '2026-11-16T18:30:00.000Z';
    const respondRes = await apiRequest(
      ctx.baseUrl,
      `/api/scheduler/polls/${pollId}/respond`,
      {
        method: 'POST',
        token: responder.token,
        body: {
          userId: organizer.user.id,
          userName: 'Spoofed Demo User',
          freeSlots: [slot1, slot2],
          timezone: 'America/Los_Angeles',
        },
      }
    );
    assert.equal(respondRes.status, 200);
    assert.equal(respondRes.data.responses.length, 1);
    assert.equal(respondRes.data.responses[0].userId, responder.user.id);
    assert.equal(respondRes.data.responses[0].userName, 'Real Responder');
    assert.notEqual(respondRes.data.responses[0].userName, 'Spoofed Demo User');
    assert.deepEqual(respondRes.data.responses[0].freeSlots, [slot1, slot2]);

    // 4. Re-submitting updates the existing responder row cleanly without creating duplicates
    const updateRes = await apiRequest(
      ctx.baseUrl,
      `/api/scheduler/polls/${pollId}/respond`,
      {
        method: 'POST',
        token: responder.token,
        body: { freeSlots: [slot1] },
      }
    );
    assert.equal(updateRes.data.responses.length, 1);
    assert.deepEqual(updateRes.data.responses[0].freeSlots, [slot1]);

    // 5. Edge case: if a user account is deleted from `users`, their response disappears cleanly (no phantom responder)
    await privExecute(`DELETE FROM users WHERE id = ?`, [responder.user.id]);
    const afterDelete = await apiRequest(ctx.baseUrl, `/api/scheduler/polls/${pollId}`, {
      token: organizer.token,
    });
    assert.equal(afterDelete.status, 200);
    assert.deepEqual(afterDelete.data.responses, []);
  });

  it('enforces club_members & board_only poll visibility tiers strictly', async () => {
    const boardLead = await registerUser(ctx.baseUrl, {
      email: 'lead@example.edu',
      fullName: 'Board Lead',
    });
    const clubMember = await registerUser(ctx.baseUrl, {
      email: 'member@example.edu',
      fullName: 'Club Member',
    });
    const outsider = await registerUser(ctx.baseUrl, {
      email: 'outsider@example.edu',
      fullName: 'Outsider User',
    });

    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/ai_society/claims', {
      method: 'POST',
      token: boardLead.token,
      body: { rosterId: 'seat_pres', requestedRole: 'President' },
    });
    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/ai_society/join', {
      method: 'POST',
      token: clubMember.token,
    });

    // Regular member cannot create a `board_only` poll
    const blockedBoardPoll = await apiRequest(ctx.baseUrl, '/api/scheduler/polls', {
      method: 'POST',
      token: clubMember.token,
      body: {
        title: 'Secret Board Poll',
        hostClubId: 'ai_society',
        visibility: 'board_only',
      },
    });
    assert.equal(blockedBoardPoll.status, 403);

    // Board Lead creates a `board_only` poll
    const boardPoll = await apiRequest(ctx.baseUrl, '/api/scheduler/polls', {
      method: 'POST',
      token: boardLead.token,
      body: {
        title: 'Officer Retreat Poll',
        hostClubId: 'ai_society',
        visibility: 'board_only',
      },
    });
    assert.equal(boardPoll.status, 201);

    // Regular member & outsider both get 403 viewing or responding to `board_only` poll
    const memView = await apiRequest(
      ctx.baseUrl,
      `/api/scheduler/polls/${boardPoll.data.id}`,
      { token: clubMember.token }
    );
    assert.equal(memView.status, 403);

    const outRespond = await apiRequest(
      ctx.baseUrl,
      `/api/scheduler/polls/${boardPoll.data.id}/respond`,
      {
        method: 'POST',
        token: outsider.token,
        body: { freeSlots: ['2026-11-16T18:00:00.000Z'] },
      }
    );
    assert.equal(outRespond.status, 403);
  });

  it('creates club sub-groups and deduplicates overlapping Leadership Targeting Shortcuts across polls & groups', async () => {
    const pres = await registerUser(ctx.baseUrl, {
      email: 'pres_sc@example.edu',
      fullName: 'President One',
    });
    const vp = await registerUser(ctx.baseUrl, {
      email: 'vp_sc@example.edu',
      fullName: 'VP Two',
    });
    const mem1 = await registerUser(ctx.baseUrl, {
      email: 'mem1_sc@example.edu',
      fullName: 'Member Three',
    });
    const mem2 = await registerUser(ctx.baseUrl, {
      email: 'mem2_sc@example.edu',
      fullName: 'Member Four',
    });

    // Setup club roles: pres + vp on Board; mem1 + mem2 as Regular Members
    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/film_club/claims', {
      method: 'POST',
      token: pres.token,
      body: { rosterId: 'seat_pres', requestedRole: 'President' },
    });
    const vpClaim = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/film_club/claims', {
      method: 'POST',
      token: vp.token,
      body: { rosterId: 'seat_vp', requestedRole: 'Vice President' },
    });
    await apiRequest(
      ctx.baseUrl,
      `/api/workspace/clubs/film_club/claims/${vpClaim.data.claim.id}/review`,
      { method: 'POST', token: pres.token, body: { decision: 'approve' } }
    );
    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/film_club/join', {
      method: 'POST',
      token: mem1.token,
    });
    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/film_club/join', {
      method: 'POST',
      token: mem2.token,
    });

    // Create "Marketing" (contains VP + Member Three) and "Events" (contains VP + Member Four)
    const mktRes = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/film_club/groups', {
      method: 'POST',
      token: pres.token,
      body: {
        name: 'Marketing',
        color: 'purple',
        members: [
          { userId: vp.user.id, email: vp.user.email, name: vp.user.fullName },
          { userId: mem1.user.id, email: mem1.user.email, name: mem1.user.fullName },
        ],
      },
    });
    assert.equal(mktRes.status, 201);
    const mktGroupId = mktRes.data.group.id;

    // Duplicate group name check -> 409 GROUP_NAME_EXISTS
    const dupGroup = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/film_club/groups', {
      method: 'POST',
      token: pres.token,
      body: { name: 'marketing' },
    });
    assert.equal(dupGroup.status, 409);
    assert.equal(dupGroup.data.code, 'GROUP_NAME_EXISTS');

    const evtRes = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/film_club/groups', {
      method: 'POST',
      token: pres.token,
      body: {
        name: 'Events',
        color: 'teal',
        members: [
          { userId: vp.user.id, email: vp.user.email, name: vp.user.fullName },
          { userId: mem2.user.id, email: mem2.user.email, name: mem2.user.fullName },
        ],
      },
    });
    assert.equal(evtRes.status, 201);
    const evtGroupId = evtRes.data.group.id;

    // Regular member blocked from using `shortcutTargets` on poll creation (403)
    const regShortcutAttempt = await apiRequest(ctx.baseUrl, '/api/scheduler/polls', {
      method: 'POST',
      token: mem1.token,
      body: {
        title: 'Unauthorized Bulk Invite Poll',
        hostClubId: 'film_club',
        shortcutTargets: ['all_members'],
      },
    });
    assert.equal(regShortcutAttempt.status, 403);

    // President creates poll combining overlapping shortcuts: `all_board` + `group:Marketing` + `group:Events` + `all_members`
    // VP belongs to Board, Marketing, Events, AND All Members — must appear ONCE (total 4 unique real users)!
    const pollRes = await apiRequest(ctx.baseUrl, '/api/scheduler/polls', {
      method: 'POST',
      token: pres.token,
      body: {
        title: 'Festival All-Hands Availability',
        hostClubId: 'film_club',
        shortcutTargets: ['all_board', `group:${mktGroupId}`, `group:${evtGroupId}`, 'all_members'],
      },
    });
    assert.equal(pollRes.status, 201);
    const invitedIds = pollRes.data.invitedParticipants.map(p => p.userId).filter(Boolean);
    assert.equal(invitedIds.length, 4, 'Expected exactly 4 deduplicated real club members');
    assert.equal(new Set(invitedIds).size, 4, 'Zero duplicate userIds allowed in invitedParticipants');

    // Direct unit check on `expandShortcutTargets` with overlapping explicit + shortcut entries
    const peopleRes = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/film_club/people', {
      token: pres.token,
    });
    const expanded = expandShortcutTargets(
      peopleRes.data,
      ['all_board', `group:${mktGroupId}`],
      [{ userId: vp.user.id, email: vp.user.email, name: vp.user.fullName }]
    );
    const vpOccurrences = expanded.filter(p => p.userId === vp.user.id);
    assert.equal(vpOccurrences.length, 1, 'VP must be deduplicated to a single entry');
  });

  it('allows only the poll creator to archive, unarchive, or delete a poll', async () => {
    const creator = await registerUser(ctx.baseUrl, {
      email: 'creator_arch@example.edu',
      fullName: 'Poll Creator',
    });
    const otherBoard = await registerUser(ctx.baseUrl, {
      email: 'co_officer@example.edu',
      fullName: 'Co Officer',
    });
    const responder = await registerUser(ctx.baseUrl, {
      email: 'resp_arch@example.edu',
      fullName: 'Poll Responder',
    });

    // Both creator and otherBoard are verified board members of `chess_club`
    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/chess_club/claims', {
      method: 'POST',
      token: creator.token,
      body: { rosterId: 'seat_pres', requestedRole: 'President' },
    });
    const coClaim = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/chess_club/claims', {
      method: 'POST',
      token: otherBoard.token,
      body: { rosterId: 'seat_vp', requestedRole: 'Vice President' },
    });
    await apiRequest(
      ctx.baseUrl,
      `/api/workspace/clubs/chess_club/claims/${coClaim.data.claim.id}/review`,
      { method: 'POST', token: creator.token, body: { decision: 'approve' } }
    );
    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/chess_club/join', {
      method: 'POST',
      token: responder.token,
    });

    const createRes = await apiRequest(ctx.baseUrl, '/api/scheduler/polls', {
      method: 'POST',
      token: creator.token,
      body: {
        title: 'Tournament Planning Poll',
        hostClubId: 'chess_club',
        dates: ['2026-11-16', '2026-11-17'],
        visibility: 'club_members',
      },
    });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.data.isCreator, true);
    assert.equal(createRes.data.archived, false);
    const pollId = createRes.data.id;

    // Responder submits availability
    const slotIso = '2026-11-16T19:00:00.000Z';
    const respondRes = await apiRequest(
      ctx.baseUrl,
      `/api/scheduler/polls/${pollId}/respond`,
      {
        method: 'POST',
        token: responder.token,
        body: { freeSlots: [slotIso] },
      }
    );
    assert.equal(respondRes.status, 200);
    assert.equal(respondRes.data.isCreator, false);

    // Non-creator responder & non-creator co-officer both get 403 trying to archive or delete
    for (const nonCreator of [responder, otherBoard]) {
      const badArchive = await apiRequest(
        ctx.baseUrl,
        `/api/scheduler/polls/${pollId}/archive`,
        {
          method: 'PATCH',
          token: nonCreator.token,
          body: { archived: true },
        }
      );
      assert.equal(badArchive.status, 403);

      const badDelete = await apiRequest(ctx.baseUrl, `/api/scheduler/polls/${pollId}`, {
        method: 'DELETE',
        token: nonCreator.token,
      });
      assert.equal(badDelete.status, 403);
    }

    // Creator archives the poll -> hidden from default active list & non-creators, preserved for creator with includeArchived=1
    const archiveRes = await apiRequest(
      ctx.baseUrl,
      `/api/scheduler/polls/${pollId}/archive`,
      {
        method: 'PATCH',
        token: creator.token,
        body: { archived: true },
      }
    );
    assert.equal(archiveRes.status, 200);
    assert.equal(archiveRes.data.ok, true);
    assert.equal(archiveRes.data.poll.archived, true);
    assert.ok(archiveRes.data.poll.archivedAt);
    assert.equal(archiveRes.data.poll.responses.length, 1, 'Archived poll preserves responses');

    const defaultList = await apiRequest(ctx.baseUrl, '/api/scheduler/polls', {
      token: creator.token,
    });
    assert.equal(defaultList.data.some(p => p.id === pollId), false);

    const nonCreatorArchivedList = await apiRequest(
      ctx.baseUrl,
      '/api/scheduler/polls?includeArchived=1',
      { token: responder.token }
    );
    assert.equal(nonCreatorArchivedList.data.some(p => p.id === pollId), false);

    const creatorArchivedList = await apiRequest(
      ctx.baseUrl,
      '/api/scheduler/polls?includeArchived=1',
      { token: creator.token }
    );
    assert.equal(creatorArchivedList.data.some(p => p.id === pollId && p.archived === true), true);

    // Archived poll rejects new responses (409) until unarchived
    const blockedRespond = await apiRequest(
      ctx.baseUrl,
      `/api/scheduler/polls/${pollId}/respond`,
      {
        method: 'POST',
        token: responder.token,
        body: { freeSlots: [slotIso] },
      }
    );
    assert.equal(blockedRespond.status, 409);

    // Creator unarchives the poll -> returns to active list & accepts updates again
    const unarchiveRes = await apiRequest(
      ctx.baseUrl,
      `/api/scheduler/polls/${pollId}/archive`,
      {
        method: 'PATCH',
        token: creator.token,
        body: { archived: false },
      }
    );
    assert.equal(unarchiveRes.status, 200);
    assert.equal(unarchiveRes.data.poll.archived, false);
    assert.equal(unarchiveRes.data.poll.archivedAt, null);

    const restoredList = await apiRequest(ctx.baseUrl, '/api/scheduler/polls', {
      token: responder.token,
    });
    assert.equal(restoredList.data.some(p => p.id === pollId), true);

    // Creator permanently deletes the poll -> poll & responses are deleted cleanly
    const deleteRes = await apiRequest(ctx.baseUrl, `/api/scheduler/polls/${pollId}`, {
      method: 'DELETE',
      token: creator.token,
    });
    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.data.deleted, true);

    const getDeleted = await apiRequest(ctx.baseUrl, `/api/scheduler/polls/${pollId}`, {
      token: creator.token,
    });
    assert.equal(getDeleted.status, 404);
  });
});
