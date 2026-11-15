import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  startTestServer,
  resetTestDb,
  apiRequest,
  registerUser,
} from './helpers/testServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

describe('Phase 1, 4 & 5: Two-Tier Task Board, Announcements, Deletions & Cloud Schema Security', () => {
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

  it('enforces two-tier Monday.com Task Board visibility (Member View vs. Board View) & field-level RBAC', async () => {
    const leader = await registerUser(ctx.baseUrl, {
      email: 'leader@example.edu',
      fullName: 'Board Leader',
    });
    const mktMember = await registerUser(ctx.baseUrl, {
      email: 'mkt_mem@example.edu',
      fullName: 'Marketing Member',
    });
    const otherMember = await registerUser(ctx.baseUrl, {
      email: 'other_mem@example.edu',
      fullName: 'Other Member',
    });
    const nonMember = await registerUser(ctx.baseUrl, {
      email: 'non_mem@example.edu',
      fullName: 'Outside Student',
    });

    // Leader claims President; mktMember & otherMember join club
    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/claims', {
      method: 'POST',
      token: leader.token,
      body: { rosterId: 'seat_pres', requestedRole: 'President' },
    });
    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/join', {
      method: 'POST',
      token: mktMember.token,
    });
    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/join', {
      method: 'POST',
      token: otherMember.token,
    });

    // Non-member cannot access club task board (403 NOT_CLUB_MEMBER)
    const nonMemRes = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/tasks', {
      token: nonMember.token,
    });
    assert.equal(nonMemRes.status, 403);
    assert.equal(nonMemRes.data.code, 'NOT_CLUB_MEMBER');

    // Leader creates "Marketing" sub-group with `mktMember`
    const grpRes = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/groups', {
      method: 'POST',
      token: leader.token,
      body: {
        name: 'Marketing',
        color: 'purple',
        members: [{ userId: mktMember.user.id, email: mktMember.user.email, name: mktMember.user.fullName }],
      },
    });
    const mktGroupId = grpRes.data.group.id;

    // Leader creates 4 tasks across tiers:
    // (1) General club task
    const tGeneral = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/tasks', {
      method: 'POST',
      token: leader.token,
      body: {
        title: 'RSVP for General Kickoff',
        visibility: 'members',
        audience: 'general',
        priority: 'medium',
      },
    });
    assert.equal(tGeneral.status, 201);

    // (2) Targeted task assigned to "Marketing" sub-group
    const tMkt = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/tasks', {
      method: 'POST',
      token: leader.token,
      body: {
        title: 'Design Race Day Poster',
        visibility: 'members',
        audience: 'targeted',
        shortcutTargets: [`group:${mktGroupId}`],
        priority: 'high',
      },
    });
    assert.equal(tMkt.status, 201);

    // (3) Targeted task assigned individually to `otherMember`
    const tOther = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/tasks', {
      method: 'POST',
      token: leader.token,
      body: {
        title: 'Calibrate Telemetry Sensor',
        visibility: 'members',
        audience: 'targeted',
        assignees: [{ userId: otherMember.user.id, email: otherMember.user.email, name: otherMember.user.fullName }],
        priority: 'critical',
      },
    });
    assert.equal(tOther.status, 201);

    // (4) Elevated Board-only internal task
    const tBoard = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/tasks', {
      method: 'POST',
      token: leader.token,
      body: {
        title: 'Approve Annual Sponsorship Budget',
        visibility: 'board',
        audience: 'board',
        priority: 'critical',
      },
    });
    assert.equal(tBoard.status, 201);

    // Verify Tier 1 (Member View): `mktMember` sees ONLY General (1) + Marketing (2) — NEVER (3) or (4)!
    const mktBoardView = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/tasks', {
      token: mktMember.token,
    });
    assert.equal(mktBoardView.status, 200);
    const mktTitles = mktBoardView.data.tasks.map(t => t.title).sort();
    assert.deepEqual(mktTitles, ['Design Race Day Poster', 'RSVP for General Kickoff']);
    assert.equal(
      mktBoardView.data.sections.some(s => s.visibility === 'board'),
      false,
      'Board-only sections must be hidden from regular members'
    );

    // Verify Tier 2 (Board View): `leader` sees ALL 4 tasks + board sections!
    const leaderBoardView = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/tasks', {
      token: leader.token,
    });
    assert.equal(leaderBoardView.status, 200);
    assert.equal(leaderBoardView.data.tasks.length, 4);
    assert.equal(leaderBoardView.data.sections.some(s => s.visibility === 'board'), true);

    // `mktMember` CAN update status on their assigned group task (`Design Race Day Poster`)
    const statusUpdateOk = await apiRequest(
      ctx.baseUrl,
      `/api/workspace/clubs/solar_car/tasks/${tMkt.data.task.id}`,
      {
        method: 'PATCH',
        token: mktMember.token,
        body: { status: 'working_on_it' },
      }
    );
    assert.equal(statusUpdateOk.status, 200);
    assert.equal(statusUpdateOk.data.task.status, 'working_on_it');

    // `mktMember` CAN toggle personal completion on General task
    const selfCheckOk = await apiRequest(
      ctx.baseUrl,
      `/api/workspace/clubs/solar_car/tasks/${tGeneral.data.task.id}`,
      {
        method: 'PATCH',
        token: mktMember.token,
        body: { toggleCompletedForSelf: true },
      }
    );
    assert.equal(selfCheckOk.status, 200);
    assert.equal(
      selfCheckOk.data.task.completedBy.some(c => c.userId === mktMember.user.id),
      true
    );

    // `mktMember` CANNOT edit task title/priority/assignees (403), delete tasks (403), or update `otherMember`'s or `board` tasks (403)
    const editTitleBlocked = await apiRequest(
      ctx.baseUrl,
      `/api/workspace/clubs/solar_car/tasks/${tMkt.data.task.id}`,
      {
        method: 'PATCH',
        token: mktMember.token,
        body: { title: 'Hacked Title' },
      }
    );
    assert.equal(editTitleBlocked.status, 403);

    const updateOtherBlocked = await apiRequest(
      ctx.baseUrl,
      `/api/workspace/clubs/solar_car/tasks/${tOther.data.task.id}`,
      {
        method: 'PATCH',
        token: mktMember.token,
        body: { status: 'done' },
      }
    );
    assert.equal(updateOtherBlocked.status, 403);

    const updateBoardBlocked = await apiRequest(
      ctx.baseUrl,
      `/api/workspace/clubs/solar_car/tasks/${tBoard.data.task.id}`,
      {
        method: 'PATCH',
        token: mktMember.token,
        body: { status: 'done' },
      }
    );
    assert.equal(updateBoardBlocked.status, 403);

    const deleteBlocked = await apiRequest(
      ctx.baseUrl,
      `/api/workspace/clubs/solar_car/tasks/${tMkt.data.task.id}`,
      { method: 'DELETE', token: mktMember.token }
    );
    assert.equal(deleteBlocked.status, 403);

    // Board Leader CAN delete a task cleanly
    const leaderDelete = await apiRequest(
      ctx.baseUrl,
      `/api/workspace/clubs/solar_car/tasks/${tBoard.data.task.id}`,
      { method: 'DELETE', token: leader.token }
    );
    assert.equal(leaderDelete.status, 200);
    assert.equal(leaderDelete.data.tasks.length, 3);
  });

  it('provides per-server Personal To-Do sections & tasks isolated per user and per joined club server', async () => {
    const pres = await registerUser(ctx.baseUrl, {
      email: 'pres_todo@example.edu',
      fullName: 'Solar President',
    });
    const alice = await registerUser(ctx.baseUrl, {
      email: 'alice_todo@example.edu',
      fullName: 'Alice Member',
    });
    const bob = await registerUser(ctx.baseUrl, {
      email: 'bob_todo@example.edu',
      fullName: 'Bob Member',
    });
    const outsider = await registerUser(ctx.baseUrl, {
      email: 'outsider_todo@example.edu',
      fullName: 'Non Member',
    });

    // President claims seat in solar_car; Alice joins solar_car + robotics_club; Bob joins solar_car
    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/claims', {
      method: 'POST',
      token: pres.token,
      body: { rosterId: 'seat_pres', requestedRole: 'President' },
    });
    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/join', {
      method: 'POST',
      token: alice.token,
    });
    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/robotics_club/join', {
      method: 'POST',
      token: alice.token,
    });
    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/join', {
      method: 'POST',
      token: bob.token,
    });

    // Non-members cannot view tasks OR create personal tasks/sections in unjoined servers
    const outsiderGet = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/tasks', {
      token: outsider.token,
    });
    assert.equal(outsiderGet.status, 403);
    assert.equal(outsiderGet.data.code, 'NOT_CLUB_MEMBER');

    const outsiderCreateTodo = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/tasks', {
      method: 'POST',
      token: outsider.token,
      body: { title: 'Sneaky Todo', visibility: 'personal', isPersonal: true },
    });
    assert.equal(outsiderCreateTodo.status, 403);
    assert.equal(outsiderCreateTodo.data.code, 'NOT_CLUB_MEMBER');

    const outsiderCreateSec = await apiRequest(
      ctx.baseUrl,
      '/api/workspace/clubs/solar_car/task-sections',
      {
        method: 'POST',
        token: outsider.token,
        body: { title: 'My Secret List', visibility: 'personal' },
      }
    );
    assert.equal(outsiderCreateSec.status, 403);
    assert.equal(outsiderCreateSec.data.code, 'NOT_CLUB_MEMBER');

    // Alice (regular member) gets a built-in "My To-Do List" personal section on solar_car
    const aliceInitialBoard = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/tasks', {
      token: alice.token,
    });
    assert.equal(aliceInitialBoard.status, 200);
    assert.equal(aliceInitialBoard.data.personalSections.length, 1);
    assert.equal(aliceInitialBoard.data.personalSections[0].title, 'My To-Do List');
    assert.equal(aliceInitialBoard.data.personalSections[0].visibility, 'personal');

    // Alice creates a personal to-do on solar_car AND a separate personal to-do on robotics_club
    const solarTodoRes = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/tasks', {
      method: 'POST',
      token: alice.token,
      body: {
        title: 'Finish CAD wheel fairing notes',
        notes: 'Bring to Thursday sub-team sync',
        priority: 'high',
        dueDate: '2026-12-01',
        visibility: 'personal',
        isPersonal: true,
      },
    });
    assert.equal(solarTodoRes.status, 201);
    const solarTodoId = solarTodoRes.data.task.id;
    assert.equal(solarTodoRes.data.task.visibility, 'personal');
    assert.equal(solarTodoRes.data.personalTasks.length, 1);
    assert.equal(
      solarTodoRes.data.tasks.some(t => t.id === solarTodoId),
      false,
      'Personal tasks must not leak into shared club tasks array'
    );

    const roboticsTodoRes = await apiRequest(
      ctx.baseUrl,
      '/api/workspace/clubs/robotics_club/tasks',
      {
        method: 'POST',
        token: alice.token,
        body: {
          title: 'Order servo brackets',
          visibility: 'personal',
          isPersonal: true,
        },
      }
    );
    assert.equal(roboticsTodoRes.status, 201);

    // Server isolation: solar_car personal list only has solar_car todo; robotics_club only has robotics_club todo
    const aliceRoboticsBoard = await apiRequest(
      ctx.baseUrl,
      '/api/workspace/clubs/robotics_club/tasks',
      { token: alice.token }
    );
    assert.deepEqual(
      aliceRoboticsBoard.data.personalTasks.map(t => t.title),
      ['Order servo brackets']
    );

    // User privacy isolation: neither Bob (another member) nor President (Board) can see, edit, or delete Alice's personal todo!
    const bobBoard = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/tasks', {
      token: bob.token,
    });
    assert.equal(bobBoard.data.personalTasks.length, 0);

    const presBoard = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/tasks', {
      token: pres.token,
    });
    assert.equal(
      presBoard.data.personalTasks.length,
      0,
      'Even Board President must not see another member’s private personal to-dos'
    );

    const presPatchAliceTodo = await apiRequest(
      ctx.baseUrl,
      `/api/workspace/clubs/solar_car/tasks/${solarTodoId}`,
      {
        method: 'PATCH',
        token: pres.token,
        body: { title: 'Snooped by President' },
      }
    );
    assert.equal(presPatchAliceTodo.status, 403);

    const bobDeleteAliceTodo = await apiRequest(
      ctx.baseUrl,
      `/api/workspace/clubs/solar_car/tasks/${solarTodoId}`,
      { method: 'DELETE', token: bob.token }
    );
    assert.equal(bobDeleteAliceTodo.status, 403);

    // Alice CAN create a custom personal section, move/edit her personal todo, check it off, and delete it
    const customSecRes = await apiRequest(
      ctx.baseUrl,
      '/api/workspace/clubs/solar_car/task-sections',
      {
        method: 'POST',
        token: alice.token,
        body: { title: 'Race Week Prep', color: 'purple', visibility: 'personal' },
      }
    );
    assert.equal(customSecRes.status, 201);
    const customSec = customSecRes.data.personalSections.find(s => s.title === 'Race Week Prep');
    assert.ok(customSec, 'Custom personal section should appear in personalSections');

    const aliceEditTodo = await apiRequest(
      ctx.baseUrl,
      `/api/workspace/clubs/solar_car/tasks/${solarTodoId}`,
      {
        method: 'PATCH',
        token: alice.token,
        body: {
          title: 'Finish CAD wheel fairing v2',
          priority: 'critical',
          sectionId: customSec.id,
          toggleCompletedForSelf: true,
        },
      }
    );
    assert.equal(aliceEditTodo.status, 200);
    assert.equal(aliceEditTodo.data.task.title, 'Finish CAD wheel fairing v2');
    assert.equal(aliceEditTodo.data.task.priority, 'critical');
    assert.equal(aliceEditTodo.data.task.status, 'done');
    assert.equal(aliceEditTodo.data.task.sectionId, customSec.id);

    const aliceDeleteTodo = await apiRequest(
      ctx.baseUrl,
      `/api/workspace/clubs/solar_car/tasks/${solarTodoId}`,
      { method: 'DELETE', token: alice.token }
    );
    assert.equal(aliceDeleteTodo.status, 200);
    assert.equal(aliceDeleteTodo.data.personalTasks.length, 0);

    // Leaving a club server immediately revokes access to that club's task board
    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/robotics_club/leave', {
      method: 'POST',
      token: alice.token,
    });
    const afterLeaveBoard = await apiRequest(
      ctx.baseUrl,
      '/api/workspace/clubs/robotics_club/tasks',
      { token: alice.token }
    );
    assert.equal(afterLeaveBoard.status, 403);
    assert.equal(afterLeaveBoard.data.code, 'NOT_CLUB_MEMBER');
  });

  it('filters targeted announcements by role/sub-group and cleanly scrubs deleted groups & departed members', async () => {
    const pres = await registerUser(ctx.baseUrl, {
      email: 'pres_edge@example.edu',
      fullName: 'Edge President',
    });
    const mktUser = await registerUser(ctx.baseUrl, {
      email: 'mkt_edge@example.edu',
      fullName: 'Marketing Member',
    });
    const genUser = await registerUser(ctx.baseUrl, {
      email: 'gen_edge@example.edu',
      fullName: 'General Member',
    });

    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/debate_club/claims', {
      method: 'POST',
      token: pres.token,
      body: { rosterId: 'seat_pres', requestedRole: 'President' },
    });
    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/debate_club/join', {
      method: 'POST',
      token: mktUser.token,
    });
    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/debate_club/join', {
      method: 'POST',
      token: genUser.token,
    });

    const grpRes = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/debate_club/groups', {
      method: 'POST',
      token: pres.token,
      body: {
        name: 'Marketing',
        members: [{ userId: mktUser.user.id, email: mktUser.user.email, name: mktUser.user.fullName }],
      },
    });
    const mktGroupId = grpRes.data.group.id;

    // Publish 3 announcements: Board-only, Marketing-group-only, and All-Members
    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/debate_club/announcements', {
      method: 'POST',
      token: pres.token,
      body: { title: 'Board Confidential', visibility: 'board', shortcutTargets: ['all_board'] },
    });
    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/debate_club/announcements', {
      method: 'POST',
      token: pres.token,
      body: { title: 'Marketing Brief', visibility: 'group', targetGroupIds: [mktGroupId] },
    });
    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/debate_club/announcements', {
      method: 'POST',
      token: pres.token,
      body: { title: 'General Tournament Info', visibility: 'members', shortcutTargets: ['all_members'] },
    });

    const mktAnns = await apiRequest(ctx.baseUrl, '/api/workspace/announcements', {
      token: mktUser.token,
    });
    assert.deepEqual(
      mktAnns.data.announcements.map(a => a.title).sort(),
      ['General Tournament Info', 'Marketing Brief']
    );

    const genAnns = await apiRequest(ctx.baseUrl, '/api/workspace/announcements', {
      token: genUser.token,
    });
    assert.deepEqual(genAnns.data.announcements.map(a => a.title), ['General Tournament Info']);

    // Create task referencing BOTH `mktGroupId` and `genUser`
    const taskRes = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/debate_club/tasks', {
      method: 'POST',
      token: pres.token,
      body: {
        title: 'Prepare Tournament Packets',
        audience: 'targeted',
        groupIds: [mktGroupId],
        assignees: [{ userId: genUser.user.id, email: genUser.user.email, name: genUser.user.fullName }],
      },
    });
    const taskId = taskRes.data.task.id;

    // Edge case 1: Delete "Marketing" sub-group -> scrubs `mktGroupId` from active tasks cleanly
    const delGrp = await apiRequest(
      ctx.baseUrl,
      `/api/workspace/clubs/debate_club/groups/${mktGroupId}`,
      { method: 'DELETE', token: pres.token }
    );
    assert.equal(delGrp.status, 200);

    const afterGrpDel = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/debate_club/tasks', {
      token: pres.token,
    });
    const updatedTask1 = afterGrpDel.data.tasks.find(t => t.id === taskId);
    assert.deepEqual(updatedTask1.groupIds, []);

    // Edge case 2: `genUser` leaves club -> scrubbed from task `assignees` & loses board access
    const leaveRes = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/debate_club/leave', {
      method: 'POST',
      token: genUser.token,
    });
    assert.equal(leaveRes.status, 200);

    const afterLeave = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/debate_club/tasks', {
      token: pres.token,
    });
    const updatedTask2 = afterLeave.data.tasks.find(t => t.id === taskId);
    assert.equal(
      updatedTask2.assignees.some(a => a.userId === genUser.user.id),
      false,
      'Departed club member must be scrubbed from active task assignees'
    );
  });

  it('verifies supabase/schema.sql defines strict RLS on all 9 required tables and .gitignore protects .env files', () => {
    const schemaSql = fs.readFileSync(path.join(ROOT_DIR, 'supabase/schema.sql'), 'utf8');
    const requiredTables = [
      'users',
      'clubs',
      'club_members',
      'club_groups',
      'group_members',
      'polls',
      'poll_responses',
      'announcements',
      'tasks',
    ];

    for (const tbl of requiredTables) {
      assert.match(
        schemaSql,
        new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${tbl}\\b`, 'i'),
        `Missing table public.${tbl} in supabase/schema.sql`
      );
      assert.match(
        schemaSql,
        new RegExp(`ALTER TABLE public\\.${tbl} ENABLE ROW LEVEL SECURITY`, 'i'),
        `Missing ENABLE ROW LEVEL SECURITY on public.${tbl}`
      );
    }

    assert.match(schemaSql, /CREATE POLICY/i);

    const gitignore = fs.readFileSync(path.join(ROOT_DIR, '.gitignore'), 'utf8');
    assert.match(gitignore, /^\.env$/m);
    assert.match(gitignore, /^\.env\.local$/m);

    // Ensure public/clubhub-data.json is valid JSON with zero Git conflict markers
    const snapshotPath = path.join(ROOT_DIR, 'public/clubhub-data.json');
    if (fs.existsSync(snapshotPath)) {
      const rawSnap = fs.readFileSync(snapshotPath, 'utf8');
      assert.equal(rawSnap.includes('<<<<<<<'), false, 'Git conflict marker found in public/clubhub-data.json');
      const parsedSnap = JSON.parse(rawSnap);
      assert.ok(Array.isArray(parsedSnap.clubs), 'public/clubhub-data.json must contain a clubs array');
    }
  });

  it('supports clean officer seat release via myActiveClaim and immediate re-claim by incoming officer', async () => {
    const outgoingPres = await registerUser(ctx.baseUrl, {
      email: 'outgoing_pres@ucsc.edu',
      fullName: 'Outgoing President',
    });
    const incomingPres = await registerUser(ctx.baseUrl, {
      email: 'incoming_pres@ucsc.edu',
      fullName: 'Incoming President',
    });

    const firstClaim = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/astro_club/claims', {
      method: 'POST',
      token: outgoingPres.token,
      body: { rosterId: 'astro_seat_pres', requestedRole: 'President' },
    });
    assert.equal(firstClaim.data.ok, true);
    assert.equal(firstClaim.data.claimStatus, 'approved');

    // Outgoing president sees their `myActiveClaim.id`, while incoming member sees `myActiveClaim: null`
    const outgoingPeople = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/astro_club/people', {
      token: outgoingPres.token,
    });
    assert.ok(outgoingPeople.data.myActiveClaim?.id, 'Approved officer should receive myActiveClaim.id');

    const incomingPeople = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/astro_club/people', {
      token: incomingPres.token,
    });
    assert.equal(incomingPeople.data.myActiveClaim, null);

    // While claimed, incoming officer is blocked from hijacking `astro_seat_pres` (409)
    const hijackAttempt = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/astro_club/claims', {
      method: 'POST',
      token: incomingPres.token,
      body: { rosterId: 'astro_seat_pres', requestedRole: 'President' },
    });
    assert.equal(hijackAttempt.status, 409);

    // Outgoing president steps down via `revoke` using `myActiveClaim.id`
    const revokeRes = await apiRequest(
      ctx.baseUrl,
      `/api/workspace/clubs/astro_club/claims/${outgoingPeople.data.myActiveClaim.id}/revoke`,
      { method: 'POST', token: outgoingPres.token }
    );
    assert.equal(revokeRes.status, 200);
    assert.equal(revokeRes.data.clubPeople.permission.tier, 'member');
    assert.equal(revokeRes.data.clubPeople.myActiveClaim, null);

    // Incoming president can now immediately claim the freed `astro_seat_pres` seat!
    const reclaimRes = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/astro_club/claims', {
      method: 'POST',
      token: incomingPres.token,
      body: { rosterId: 'astro_seat_pres', requestedRole: 'President' },
    });
    assert.equal(reclaimRes.data.ok, true);
    assert.equal(reclaimRes.data.claimStatus, 'approved');
    assert.equal(reclaimRes.data.clubPeople.permission.isPresident, true);
  });

  it('enforces creator-only poll archive, unarchive, and delete lifecycle with 409 response/booking lock', async () => {
    const creator = await registerUser(ctx.baseUrl, {
      email: 'poll_host@ucsc.edu',
      fullName: 'Poll Host',
    });
    const responder = await registerUser(ctx.baseUrl, {
      email: 'poll_guest@ucsc.edu',
      fullName: 'Poll Guest',
    });

    const createRes = await apiRequest(ctx.baseUrl, '/api/scheduler/polls', {
      method: 'POST',
      token: creator.token,
      body: {
        title: 'Fall Kickoff Sync',
        dates: ['2026-11-20'],
        dayStartHour: 9,
        dayEndHour: 12,
      },
    });
    assert.equal(createRes.status, 201);
    const pollId = createRes.data.id;

    // Non-creator cannot archive or delete the poll (403)
    const nonCreatorArchive = await apiRequest(
      ctx.baseUrl,
      `/api/scheduler/polls/${pollId}/archive`,
      {
        method: 'PATCH',
        token: responder.token,
        body: { archived: true },
      }
    );
    assert.equal(nonCreatorArchive.status, 403);

    const nonCreatorDelete = await apiRequest(ctx.baseUrl, `/api/scheduler/polls/${pollId}`, {
      method: 'DELETE',
      token: responder.token,
    });
    assert.equal(nonCreatorDelete.status, 403);

    // Creator archives the poll -> hidden from default list, visible to creator with includeArchived=1
    const archiveRes = await apiRequest(ctx.baseUrl, `/api/scheduler/polls/${pollId}/archive`, {
      method: 'PATCH',
      token: creator.token,
      body: { archived: true },
    });
    assert.equal(archiveRes.status, 200);
    assert.equal(archiveRes.data.poll.archived, true);

    const defaultList = await apiRequest(ctx.baseUrl, '/api/scheduler/polls', {
      token: creator.token,
    });
    assert.equal(defaultList.data.some(p => p.id === pollId), false);

    const creatorIncArchived = await apiRequest(
      ctx.baseUrl,
      '/api/scheduler/polls?includeArchived=1',
      { token: creator.token }
    );
    assert.equal(creatorIncArchived.data.some(p => p.id === pollId), true);

    const guestIncArchived = await apiRequest(
      ctx.baseUrl,
      '/api/scheduler/polls?includeArchived=1',
      { token: responder.token }
    );
    assert.equal(
      guestIncArchived.data.some(p => p.id === pollId),
      false,
      'Archived polls must only appear in includeArchived=1 for their creator'
    );

    // Archived poll rejects new responses and bookings with 409
    const blockedRespond = await apiRequest(
      ctx.baseUrl,
      `/api/scheduler/polls/${pollId}/respond`,
      {
        method: 'POST',
        token: responder.token,
        body: { availableSlots: ['2026-11-20T17:00:00.000Z'] },
      }
    );
    assert.equal(blockedRespond.status, 409);

    const blockedBook = await apiRequest(ctx.baseUrl, `/api/scheduler/polls/${pollId}/book`, {
      method: 'POST',
      token: creator.token,
      body: { start: '2026-11-20T17:00:00.000Z' },
    });
    assert.equal(blockedBook.status, 409);

    // Creator unarchives -> responses succeed again -> creator deletes poll
    const unarchiveRes = await apiRequest(ctx.baseUrl, `/api/scheduler/polls/${pollId}/archive`, {
      method: 'PATCH',
      token: creator.token,
      body: { archived: false },
    });
    assert.equal(unarchiveRes.status, 200);
    assert.equal(unarchiveRes.data.poll.archived, false);

    const allowedRespond = await apiRequest(
      ctx.baseUrl,
      `/api/scheduler/polls/${pollId}/respond`,
      {
        method: 'POST',
        token: responder.token,
        body: { availableSlots: ['2026-11-20T17:00:00.000Z'] },
      }
    );
    assert.equal(allowedRespond.status, 200);
    assert.equal(allowedRespond.data.responses.length, 1);

    const deleteRes = await apiRequest(ctx.baseUrl, `/api/scheduler/polls/${pollId}`, {
      method: 'DELETE',
      token: creator.token,
    });
    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.data.deleted, true);

    const afterDeleteGet = await apiRequest(ctx.baseUrl, `/api/scheduler/polls/${pollId}`, {
      token: creator.token,
    });
    assert.equal(afterDeleteGet.status, 404);
  });

  it('blocks user PII in public /api/dict and isolates themeMode & calendar sync profiles in private DB', async () => {
    const student = await registerUser(ctx.baseUrl, {
      email: 'privacy_student@ucsc.edu',
      fullName: 'Privacy Student',
    });

    // Public /api/dict rejects any user_* or email-containing keys with 403
    const putUserTheme = await apiRequest(
      ctx.baseUrl,
      '/api/dict/user_theme:privacy_student@ucsc.edu',
      {
        method: 'PUT',
        body: { value: { themeMode: 'dark' }, namespace: 'user_prefs' },
      }
    );
    assert.equal(putUserTheme.status, 403);
    assert.equal(putUserTheme.data.code, 'USER_PII_FORBIDDEN_IN_PUBLIC_DICT');

    const postUserClubs = await apiRequest(ctx.baseUrl, '/api/dict', {
      method: 'POST',
      body: {
        key: 'user_clubs:privacy_student@ucsc.edu',
        value: { clubIds: ['solar_car'] },
      },
    });
    assert.equal(postUserClubs.status, 403);

    // Private profile endpoint persists themeMode cleanly inside privateDb
    const patchProfile = await apiRequest(ctx.baseUrl, '/api/workspace/auth/profile', {
      method: 'PATCH',
      token: student.token,
      body: { themeMode: 'dark' },
    });
    assert.equal(patchProfile.status, 200);
    assert.equal(patchProfile.data.user.themeMode, 'dark');

    const meRes = await apiRequest(ctx.baseUrl, '/api/workspace/auth/me', {
      token: student.token,
    });
    assert.equal(meRes.data.user.themeMode, 'dark');

    // Calendar sync profile writes to privateDb (hashing accountKey, stripping email from displayName)
    const putCal = await apiRequest(ctx.baseUrl, '/api/calendar/profile/cal_tok_priv_1', {
      method: 'PUT',
      body: {
        accountKey: 'email:privacy_student@ucsc.edu',
        displayName: 'privacy_student@ucsc.edu',
        joinedClubIds: ['solar_car'],
      },
    });
    assert.equal(putCal.status, 200);
    assert.equal(putCal.data.ok, true);

    const getCal = await apiRequest(ctx.baseUrl, '/api/calendar/profile/cal_tok_priv_1');
    assert.equal(getCal.status, 200);
    assert.equal(getCal.data.exists, true);
    assert.equal(
      JSON.stringify(getCal.data).includes('privacy_student@ucsc.edu'),
      false,
      'Raw email address must never be stored in or returned from calendar sync profile'
    );
  });

  it('delivers zero incoming announcements or synced calendar events until a user joins a club', async () => {
    const pres = await registerUser(ctx.baseUrl, {
      email: 'pres_gate@ucsc.edu',
      fullName: 'Club President',
    });
    const newcomer = await registerUser(ctx.baseUrl, {
      email: 'newcomer_gate@ucsc.edu',
      fullName: 'New Student',
    });

    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/robotics_club/join', {
      method: 'POST',
      token: pres.token,
      body: { clubName: 'Robotics Club' },
    });
    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/robotics_club/claims', {
      method: 'POST',
      token: pres.token,
      body: { rosterId: 'seat_pres', requestedRole: 'President' },
    });

    // President publishes both a 'public' and a 'members' announcement
    const pubAnnRes = await apiRequest(
      ctx.baseUrl,
      '/api/workspace/clubs/robotics_club/announcements',
      {
        method: 'POST',
        token: pres.token,
        body: {
          title: 'Robotics Kickoff Night',
          body: 'Build bots in Baskin 152!',
          visibility: 'public',
        },
      }
    );
    assert.equal(pubAnnRes.status, 201);

    // 1. Unauthenticated caller gets 0 announcements
    const unauthAnns = await apiRequest(ctx.baseUrl, '/api/workspace/announcements');
    assert.equal(unauthAnns.status, 200);
    assert.deepEqual(unauthAnns.data.announcements, []);

    // 2. Signed-in student with 0 joined clubs gets 0 announcements
    const beforeJoinAnns = await apiRequest(ctx.baseUrl, '/api/workspace/announcements', {
      token: newcomer.token,
    });
    assert.equal(beforeJoinAnns.status, 200);
    assert.deepEqual(beforeJoinAnns.data.announcements, []);

    // 3. Calendar sync profile with 0 joined clubs syncs 0 events and serves an empty .ics feed
    const calZero = await apiRequest(ctx.baseUrl, '/api/calendar/profile/cal_zero_clubs', {
      method: 'PUT',
      body: {
        joinedClubIds: [],
        fallbackEvents: [
          {
            id: 'evt_rob_1',
            clubId: 'robotics_club',
            clubName: 'Robotics Club',
            title: 'Robotics Lab Session',
            start: '2027-09-15T18:00:00.000Z',
            end: '2027-09-15T19:00:00.000Z',
          },
        ],
        settings: { clubScope: 'all' },
      },
    });
    assert.equal(calZero.status, 200);
    assert.equal(calZero.data.syncedCount, 0);

    // 4. Once the student joins Robotics Club, both announcements and calendar events unlock!
    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/robotics_club/join', {
      method: 'POST',
      token: newcomer.token,
      body: { clubName: 'Robotics Club' },
    });

    const afterJoinAnns = await apiRequest(ctx.baseUrl, '/api/workspace/announcements', {
      token: newcomer.token,
    });
    assert.equal(afterJoinAnns.status, 200);
    assert.equal(afterJoinAnns.data.announcements.length, 1);
    assert.equal(afterJoinAnns.data.announcements[0].title, 'Robotics Kickoff Night');

    const calAfterJoin = await apiRequest(ctx.baseUrl, '/api/calendar/profile/cal_zero_clubs', {
      method: 'PUT',
      body: {
        joinedClubIds: ['robotics_club'],
        fallbackEvents: [
          {
            id: 'evt_rob_1',
            clubId: 'robotics_club',
            clubName: 'Robotics Club',
            title: 'Robotics Lab Session',
            start: '2027-09-15T18:00:00.000Z',
            end: '2027-09-15T19:00:00.000Z',
          },
        ],
      },
    });
    assert.equal(calAfterJoin.status, 200);
    assert.equal(calAfterJoin.data.syncedCount, 1);
  });

  it('persists dueTime + Discord/Email task reminders, isolates per-member overrides & private emails, and resets sentAt on reschedule', async () => {
    const leader = await registerUser(ctx.baseUrl, {
      email: 'remind_leader@example.edu',
      fullName: 'Reminder Leader',
    });
    const member = await registerUser(ctx.baseUrl, {
      email: 'remind_member@example.edu',
      fullName: 'Reminder Member',
    });

    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/claims', {
      method: 'POST',
      token: leader.token,
      body: { requestedRole: 'President', clubName: 'Solar Car Team' },
    });
    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/join', {
      method: 'POST',
      token: member.token,
      body: { clubName: 'Solar Car Team' },
    });

    // 1. Member creates a personal task with dueDate + dueTime + opt-in Discord/Email reminder
    const personalTaskRes = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/tasks', {
      method: 'POST',
      token: member.token,
      body: {
        title: 'Submit composites lab quiz',
        visibility: 'personal',
        isPersonal: true,
        dueDate: '2027-08-20',
        dueTime: '17:00',
        reminder: {
          enabled: true,
          offsetMinutes: 60,
          channels: ['discord', 'email'],
          dueAtIso: '2027-08-20T17:00:00.000Z',
          remindAtIso: '2027-08-20T16:00:00.000Z',
          recipientEmail: 'member_private_alert@example.edu',
        },
      },
    });
    assert.equal(personalTaskRes.status, 201);
    const personalTask = personalTaskRes.data.task;
    assert.equal(personalTask.dueDate, '2027-08-20');
    assert.equal(personalTask.dueTime, '17:00');
    assert.equal(personalTask.reminder.enabled, true);
    assert.equal(personalTask.reminder.offsetMinutes, 60);
    assert.deepEqual(personalTask.reminder.channels, ['discord', 'email']);
    assert.equal(personalTask.reminder.recipientEmail, 'member_private_alert@example.edu');
    assert.equal(personalTask.reminder.sentAt, null);

    // 2. Leader creates a shared club task with dueTime + board reminder, and Member sets their own personal reminder override
    const sharedTaskRes = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/tasks', {
      method: 'POST',
      token: leader.token,
      body: {
        title: 'Telemetry dry-run check-in',
        audience: 'general',
        visibility: 'members',
        dueDate: '2027-08-21',
        dueTime: '14:30',
        reminder: {
          enabled: true,
          offsetMinutes: 180,
          channels: ['discord'],
          dueAtIso: '2027-08-21T14:30:00.000Z',
          remindAtIso: '2027-08-21T11:30:00.000Z',
          recipientEmail: 'leader_secret@example.edu',
        },
      },
    });
    assert.equal(sharedTaskRes.status, 201);
    const sharedId = sharedTaskRes.data.task.id;

    // Member fetches shared task -> must NOT see leader's private `recipientEmail`
    const memberInitialGet = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/tasks', {
      token: member.token,
    });
    const sharedSeenByMember = memberInitialGet.data.tasks.find(t => t.id === sharedId);
    assert.ok(sharedSeenByMember);
    assert.equal(
      sharedSeenByMember.reminder.recipientEmail,
      '',
      'Non-owners must never see creator private reminder recipientEmail'
    );

    // Member sets their own personal 15-min Email reminder override on the shared task without 403
    const memberOverrideRes = await apiRequest(
      ctx.baseUrl,
      `/api/workspace/clubs/solar_car/tasks/${sharedId}`,
      {
        method: 'PATCH',
        token: member.token,
        body: {
          reminder: {
            enabled: true,
            offsetMinutes: 15,
            channels: ['email'],
            dueAtIso: '2027-08-21T14:30:00.000Z',
            remindAtIso: '2027-08-21T14:15:00.000Z',
            recipientEmail: 'member_override@example.edu',
          },
        },
      }
    );
    assert.equal(memberOverrideRes.status, 200);
    assert.equal(memberOverrideRes.data.task.reminder.isPersonalOverride, true);
    assert.equal(memberOverrideRes.data.task.reminder.offsetMinutes, 15);
    assert.equal(memberOverrideRes.data.task.reminder.recipientEmail, 'member_override@example.edu');

    // Leader still sees their own 180-min primary reminder (not overwritten by member)
    const leaderGetAfter = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/solar_car/tasks', {
      token: leader.token,
    });
    const sharedSeenByLeader = leaderGetAfter.data.tasks.find(t => t.id === sharedId);
    assert.equal(sharedSeenByLeader.reminder.offsetMinutes, 180);
    assert.equal(sharedSeenByLeader.reminder.recipientEmail, 'leader_secret@example.edu');

    // 3. Due reminder check before remindAtIso fires 0 reminders; after remindAtIso fires once & stamps sentAt
    const earlyCheck = await apiRequest(ctx.baseUrl, '/api/workspace/tasks/reminders/check', {
      method: 'POST',
      token: member.token,
      body: {
        clubId: 'solar_car',
        markSentOnAttempt: true,
        nowIso: '2027-08-20T15:30:00.000Z',
      },
    });
    assert.equal(earlyCheck.status, 200);
    assert.equal(earlyCheck.data.dueCount, 0);

    const dueCheck1 = await apiRequest(ctx.baseUrl, '/api/workspace/tasks/reminders/check', {
      method: 'POST',
      token: member.token,
      body: {
        clubId: 'solar_car',
        markSentOnAttempt: true,
        nowIso: '2027-08-20T16:05:00.000Z',
      },
    });
    assert.equal(dueCheck1.status, 200);
    assert.equal(dueCheck1.data.dueCount, 1);
    assert.equal(dueCheck1.data.dueReminders[0].taskId, personalTask.id);
    assert.equal(dueCheck1.data.dueReminders[0].sentAt, '2027-08-20T16:05:00.000Z');

    // Second check at 16:10 does NOT duplicate-fire
    const dueCheck2 = await apiRequest(ctx.baseUrl, '/api/workspace/tasks/reminders/check', {
      method: 'POST',
      token: member.token,
      body: {
        clubId: 'solar_car',
        markSentOnAttempt: true,
        nowIso: '2027-08-20T16:10:00.000Z',
      },
    });
    assert.equal(dueCheck2.status, 200);
    assert.equal(dueCheck2.data.dueCount, 0);

    // 4. Rescheduling dueTime resets reminder.sentAt to null so it will remind again at the new time
    const rescheduleRes = await apiRequest(
      ctx.baseUrl,
      `/api/workspace/clubs/solar_car/tasks/${personalTask.id}`,
      {
        method: 'PATCH',
        token: member.token,
        body: {
          dueDate: '2027-08-20',
          dueTime: '19:00',
          reminder: {
            enabled: true,
            offsetMinutes: 60,
            channels: ['discord', 'email'],
            dueAtIso: '2027-08-20T19:00:00.000Z',
            remindAtIso: '2027-08-20T18:00:00.000Z',
          },
        },
      }
    );
    assert.equal(rescheduleRes.status, 200);
    assert.equal(rescheduleRes.data.task.dueTime, '19:00');
    assert.equal(
      rescheduleRes.data.task.reminder.sentAt,
      null,
      'Rescheduling dueTime must clear sentAt so the updated reminder fires'
    );

    // 5. Manual `/remind` endpoint blocks non-owners on private personal tasks (403) and stamps lastManualSentAt for owner
    const leaderSnoopRemind = await apiRequest(
      ctx.baseUrl,
      `/api/workspace/clubs/solar_car/tasks/${personalTask.id}/remind`,
      {
        method: 'POST',
        token: leader.token,
        body: { channels: ['email'] },
      }
    );
    assert.equal(leaderSnoopRemind.status, 403);

    const ownerManualRemind = await apiRequest(
      ctx.baseUrl,
      `/api/workspace/clubs/solar_car/tasks/${personalTask.id}/remind`,
      {
        method: 'POST',
        token: member.token,
        body: { channels: ['discord', 'email'] },
      }
    );
    assert.equal(ownerManualRemind.status, 200);
    assert.ok(ownerManualRemind.data.task.reminder.lastManualSentAt);
  });
});
