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
});
