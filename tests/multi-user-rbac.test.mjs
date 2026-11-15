// ── Comprehensive Multi-User RBAC, Roster Claiming, Club Groups, Polls & Privacy Test Suite ──
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolate both public & private SQLite DBs in temp files so tests never touch workspace state
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clubhub-rbac-test-'));
process.env.CLUBHUB_DB_PATH = path.join(tmpDir, 'public-clubhub-test.db');
process.env.PRIVATE_DB_PATH = path.join(tmpDir, 'private-users-test.db');
process.env.CLUBHUB_SKIP_LISTEN = '1';
process.env.CLUBHUB_SKIP_SEED = '1';
process.env.NODE_ENV = 'test';

const { getDb, upsertCollectorData, getAllCollectorData, closeDb } = await import(
  '../server/database.js'
);
const { closePrivateDb } = await import('../server/privateDb.js');
const { sanitizePublicSnapshot } = await import('../server/services/publicSnapshotSanitizer.js');
const { default: app } = await import('../server/index.js');

let server;
let baseUrl = '';

async function api(method, urlPath, { token = '', body = undefined } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

describe('ClubHub Multi-User RBAC, Roster Claims, Polls, Groups & Monday.com Tasks', () => {
  const users = {};
  let eventsGroupId = '';
  let generalTaskId = '';
  let groupTaskId = '';
  let treasurerOnlyTaskId = '';
  let confidentialBoardTaskId = '';
  let betzyClaimId = '';
  let pollId = '';

  before(async () => {
    getDb();
    // Seed 2 real-shaped public UCSC clubs + scraped public roster entries into public DB
    upsertCollectorData(
      {
        clubs: [
          {
            id: 'ucsctheta',
            name: 'Kappa Alpha Theta',
            instagram: 'ucsctheta',
            email: 'ucsctheta@ucsc.edu',
            category: 'greek',
          },
          {
            id: 'medlifeucsc',
            name: 'MEDLIFE at UCSC',
            instagram: 'medlifeucsc',
            email: 'medlife@ucsc.edu',
            category: 'service',
          },
        ],
        roster: [
          {
            id: 'roster_ucsctheta_alondra',
            clubId: 'ucsctheta',
            clubName: 'Kappa Alpha Theta',
            name: 'Alondra Trujillo',
            role: 'President',
            personType: 'officer',
            email: 'ucsctheta@ucsc.edu',
            source: 'website',
          },
          {
            id: 'roster_ucsctheta_adriana',
            clubId: 'ucsctheta',
            clubName: 'Kappa Alpha Theta',
            name: 'Adriana Gonzalez',
            role: 'Event Director',
            personType: 'officer',
            email: 'ucsctheta@ucsc.edu',
            source: 'website',
          },
          {
            id: 'roster_medlife_tillie',
            clubId: 'medlifeucsc',
            clubName: 'MEDLIFE at UCSC',
            name: 'Tillie Stadler',
            role: 'President',
            personType: 'officer',
            email: 'medlife@ucsc.edu',
            source: 'website',
          },
        ],
      },
      { replaceRosterForClubs: ['ucsctheta', 'medlifeucsc'] }
    );

    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}/api`;
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    closePrivateDb();
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('1. registers real accounts securely with scrypt, rejects bad passwords & blocks unauthenticated writes', async () => {
    const r1 = await api('POST', '/workspace/auth/session', {
      body: {
        email: 'alondra.private@ucsc.edu',
        password: 'StrongPassword123!',
        fullName: 'Alondra Trujillo',
        major: "Psychology '26",
      },
    });
    assert.equal(r1.status, 201);
    assert.ok(r1.data.token.startsWith('ch_sess_'));
    assert.equal(r1.data.user.passwordHash, undefined);
    assert.equal(r1.data.user.passwordSalt, undefined);
    assert.equal(r1.data.user.verifiedEdu, true);
    users.alondra = r1.data;

    // Wrong password rejected with 401
    const badPw = await api('POST', '/workspace/auth/session', {
      body: {
        email: 'alondra.private@ucsc.edu',
        password: 'WrongPassword!',
      },
    });
    assert.equal(badPw.status, 401);

    // Register 3 additional users
    const r2 = await api('POST', '/workspace/auth/session', {
      body: {
        email: 'adriana.events@ucsc.edu',
        password: 'StrongPassword123!',
        fullName: 'Adriana Gonzalez',
      },
    });
    assert.equal(r2.status, 201);
    users.adriana = r2.data;

    const r3 = await api('POST', '/workspace/auth/session', {
      body: {
        email: 'sam.member@ucsc.edu',
        password: 'StrongPassword123!',
        fullName: 'Sam Rivera',
      },
    });
    assert.equal(r3.status, 201);
    users.sam = r3.data;

    const r4 = await api('POST', '/workspace/auth/session', {
      body: {
        email: 'eve.outsider@example.com',
        password: 'StrongPassword123!',
        fullName: 'Eve Outsider',
      },
    });
    assert.equal(r4.status, 201);
    users.eve = r4.data;

    // Unauthenticated claim attempt returns 401
    const unauthClaim = await api('POST', '/workspace/clubs/ucsctheta/claims', {
      body: { rosterId: 'roster_ucsctheta_alondra', requestedRole: 'President' },
    });
    assert.equal(unauthClaim.status, 401);
  });

  it('2. allows first board claim on unclaimed club, blocks slot hijacking & seat hoarding', async () => {
    // Alondra claims President in ucsctheta
    const claimRes = await api('POST', '/workspace/clubs/ucsctheta/claims', {
      token: users.alondra.token,
      body: {
        rosterId: 'roster_ucsctheta_alondra',
        requestedRole: 'President',
        rosterName: 'Alondra Trujillo',
        officeHours: 'Tue 2-4 PM',
      },
    });
    assert.equal(claimRes.status, 201);
    assert.equal(claimRes.data.claimStatus, 'approved');
    assert.equal(claimRes.data.permissionsByClub.ucsctheta.tier, 'president');
    assert.equal(claimRes.data.permissionsByClub.ucsctheta.isBoard, true);
    assert.equal(claimRes.data.permissionsByClub.ucsctheta.isPresident, true);

    // Eve tries to hijack Alondra's already-claimed President slot -> 409 Conflict
    const hijackRes = await api('POST', '/workspace/clubs/ucsctheta/claims', {
      token: users.eve.token,
      body: {
        rosterId: 'roster_ucsctheta_alondra',
        requestedRole: 'President',
      },
    });
    assert.equal(hijackRes.status, 409);
    assert.equal(hijackRes.data.code, 'SLOT_ALREADY_CLAIMED');

    // Alondra tries to ALSO claim Event Director while holding President -> 409 Conflict
    const hoardRes = await api('POST', '/workspace/clubs/ucsctheta/claims', {
      token: users.alondra.token,
      body: {
        rosterId: 'roster_ucsctheta_adriana',
        requestedRole: 'Event Director',
      },
    });
    assert.equal(hoardRes.status, 409);
    assert.equal(hoardRes.data.code, 'USER_ALREADY_ON_BOARD');
  });

  it('3. routes subsequent claims on active clubs to pending review & blocks self/member approval', async () => {
    // Adriana claims Event Director in ucsctheta (which already has an approved President)
    const pendingRes = await api('POST', '/workspace/clubs/ucsctheta/claims', {
      token: users.adriana.token,
      body: {
        rosterId: 'roster_ucsctheta_adriana',
        requestedRole: 'Event Director',
        notes: 'Elected Fall 2026',
      },
    });
    assert.equal(pendingRes.status, 201);
    assert.equal(pendingRes.data.claimStatus, 'pending');
    // Must NOT have board permissions while pending!
    assert.equal(pendingRes.data.permissionsByClub.ucsctheta.tier, 'member');
    assert.equal(pendingRes.data.permissionsByClub.ucsctheta.isBoard, false);
    betzyClaimId = pendingRes.data.claim.id;

    // Adriana tries to self-approve her own pending claim -> 403 Forbidden
    const selfApprove = await api(
      'POST',
      `/workspace/clubs/ucsctheta/claims/${betzyClaimId}/review`,
      {
        token: users.adriana.token,
        body: { decision: 'approve' },
      }
    );
    assert.equal(selfApprove.status, 403);

    // Regular member Sam joins ucsctheta and tries to approve Adriana's claim -> 403 Forbidden
    await api('POST', '/workspace/clubs/ucsctheta/join', { token: users.sam.token });
    const memberApprove = await api(
      'POST',
      `/workspace/clubs/ucsctheta/claims/${betzyClaimId}/review`,
      {
        token: users.sam.token,
        body: { decision: 'approve' },
      }
    );
    assert.equal(memberApprove.status, 403);

    // President Alondra approves Adriana's claim -> 200 OK, Adriana promoted to board!
    const boardApprove = await api(
      'POST',
      `/workspace/clubs/ucsctheta/claims/${betzyClaimId}/review`,
      {
        token: users.alondra.token,
        body: { decision: 'approve' },
      }
    );
    assert.equal(boardApprove.status, 200);

    const adrianaMe = await api('GET', '/workspace/auth/me', { token: users.adriana.token });
    assert.equal(adrianaMe.data.permissionsByClub.ucsctheta.tier, 'board');
    assert.equal(adrianaMe.data.permissionsByClub.ucsctheta.isBoard, true);
    assert.equal(adrianaMe.data.permissionsByClub.ucsctheta.roleTitle, 'Event Director');
  });

  it('4. auto-grants board role when a pre-invited officer email registers later', async () => {
    // Alondra pre-invites `treasurer.new@ucsc.edu` as Treasurer before they register
    const inviteRes = await api('POST', '/workspace/clubs/ucsctheta/roles/assign', {
      token: users.alondra.token,
      body: {
        email: 'treasurer.new@ucsc.edu',
        fullName: 'Jordan Chen',
        roleTitle: 'Treasurer',
        tier: 'board',
      },
    });
    assert.equal(inviteRes.status, 201);

    // Jordan now creates their account -> automatically granted verified board access!
    const regJordan = await api('POST', '/workspace/auth/session', {
      body: {
        email: 'treasurer.new@ucsc.edu',
        password: 'StrongPassword123!',
        fullName: 'Jordan Chen',
      },
    });
    assert.equal(regJordan.status, 201);
    assert.equal(regJordan.data.permissionsByClub.ucsctheta.tier, 'board');
    assert.equal(regJordan.data.permissionsByClub.ucsctheta.roleTitle, 'Treasurer');
    users.jordan = regJordan.data;
  });

  it('5. enforces strict cross-club isolation (President of Club A has zero board perms in Club B)', async () => {
    // Alondra joins medlifeucsc as a regular member
    await api('POST', '/workspace/clubs/medlifeucsc/join', { token: users.alondra.token });

    // Alondra tries to create a group in medlifeucsc -> 403 Forbidden
    const crossGroup = await api('POST', '/workspace/clubs/medlifeucsc/groups', {
      token: users.alondra.token,
      body: { name: 'Unauthorized Group' },
    });
    assert.equal(crossGroup.status, 403);

    // Alondra tries to create a task in medlifeucsc -> 403 Forbidden
    const crossTask = await api('POST', '/workspace/clubs/medlifeucsc/tasks', {
      token: users.alondra.token,
      body: { title: 'Unauthorized Task' },
    });
    assert.equal(crossTask.status, 403);
  });

  it('6. supports Club Groups & enforces email privacy for non-board members', async () => {
    // Regular member Sam cannot create groups
    const samGroupAttempt = await api('POST', '/workspace/clubs/ucsctheta/groups', {
      token: users.sam.token,
      body: { name: 'Sam Group' },
    });
    assert.equal(samGroupAttempt.status, 403);

    // Board member Adriana creates "Events & Logistics" group containing Sam
    const createGrp = await api('POST', '/workspace/clubs/ucsctheta/groups', {
      token: users.adriana.token,
      body: {
        name: 'Events & Logistics',
        color: 'purple',
        description: 'Coordinates venue bookings and socials',
        members: [
          {
            userId: users.sam.user.id,
            email: users.sam.user.email,
            name: users.sam.user.fullName,
            roleTitle: 'Member',
          },
        ],
      },
    });
    assert.equal(createGrp.status, 201);
    assert.equal(createGrp.data.group.memberCount, 1);
    eventsGroupId = createGrp.data.group.id;

    // Board member Alondra creates "Executive Council" seeded via `all_board` shortcut
    const execGrp = await api('POST', '/workspace/clubs/ucsctheta/groups', {
      token: users.alondra.token,
      body: {
        name: 'Executive Council',
        color: 'blue',
        shortcutTargets: ['all_board'],
      },
    });
    assert.equal(execGrp.status, 201);
    assert.ok(execGrp.data.group.memberCount >= 3); // Alondra, Adriana, Jordan

    // Email privacy check: Sam fetches `/people` -> sees own email, NOT other users' personal emails
    const samPeopleView = await api('GET', '/workspace/clubs/ucsctheta/people', {
      token: users.sam.token,
    });
    assert.equal(samPeopleView.status, 200);
    const alondraRowForSam = samPeopleView.data.board.find(
      b => b.userId === users.alondra.user.id
    );
    assert.equal(alondraRowForSam.email, '');
    const samRowForSam = samPeopleView.data.members.find(m => m.userId === users.sam.user.id);
    assert.equal(samRowForSam.email, 'sam.member@ucsc.edu');
  });

  it('7. enforces Monday.com Two-Tier Tasks & isolates Higher-Perm Board View from regular members', async () => {
    // Non-member Eve cannot view ucsctheta tasks -> 403
    const eveTasks = await api('GET', '/workspace/clubs/ucsctheta/tasks', {
      token: users.eve.token,
    });
    assert.equal(eveTasks.status, 403);

    // President Alondra creates 4 tasks across General, Group, Person, and Confidential Board tiers
    const t1 = await api('POST', '/workspace/clubs/ucsctheta/tasks', {
      token: users.alondra.token,
      body: {
        title: 'Submit Fall Liability Waiver',
        audience: 'general',
        visibility: 'members',
        priority: 'high',
        dueDate: '2026-11-20',
      },
    });
    assert.equal(t1.status, 201);
    generalTaskId = t1.data.task.id;

    const t2 = await api('POST', '/workspace/clubs/ucsctheta/tasks', {
      token: users.alondra.token,
      body: {
        title: 'Reserve Quarry Plaza Tables',
        visibility: 'members',
        shortcutTargets: [`group:${eventsGroupId}`],
        priority: 'medium',
      },
    });
    assert.equal(t2.status, 201);
    assert.equal(t2.data.task.audience, 'targeted');
    assert.deepEqual(t2.data.task.groupIds, [eventsGroupId]);
    groupTaskId = t2.data.task.id;

    const t3 = await api('POST', '/workspace/clubs/ucsctheta/tasks', {
      token: users.alondra.token,
      body: {
        title: 'Reconcile Bank Account Statement',
        visibility: 'members',
        audience: 'targeted',
        assignees: [
          {
            userId: users.jordan.user.id,
            name: users.jordan.user.fullName,
            roleTitle: 'Treasurer',
          },
        ],
      },
    });
    assert.equal(t3.status, 201);
    treasurerOnlyTaskId = t3.data.task.id;

    const t4 = await api('POST', '/workspace/clubs/ucsctheta/tasks', {
      token: users.alondra.token,
      body: {
        title: 'Confidential Officer Slate Deliberation',
        visibility: 'board',
        priority: 'critical',
      },
    });
    assert.equal(t4.status, 201);
    assert.equal(t4.data.task.visibility, 'board');
    confidentialBoardTaskId = t4.data.task.id;

    // Regular member Sam fetches `/tasks` -> sees ONLY his 2 general + group tasks, NEVER sees unassigned individual tasks or confidential board tasks!
    const samBoard = await api('GET', '/workspace/clubs/ucsctheta/tasks', {
      token: users.sam.token,
    });
    assert.equal(samBoard.status, 200);
    assert.equal(samBoard.data.tasks.length, 2);
    assert.equal(
      samBoard.data.tasks.some(t => t.id === treasurerOnlyTaskId),
      false
    );
    assert.equal(
      samBoard.data.tasks.some(t => t.id === confidentialBoardTaskId),
      false
    );
    assert.equal(
      samBoard.data.sections.some(s => s.visibility === 'board'),
      false
    );

    // Sam checks off General Club task -> records Sam in `completedBy`, leaves global status intact for others
    const samCompleteGeneral = await api(
      'PATCH',
      `/workspace/clubs/ucsctheta/tasks/${generalTaskId}`,
      {
        token: users.sam.token,
        body: { toggleCompletedForSelf: true },
      }
    );
    assert.equal(samCompleteGeneral.status, 200);
    const updatedGen = samCompleteGeneral.data.tasks.find(t => t.id === generalTaskId);
    assert.equal(updatedGen.completedBy.length, 1);
    assert.equal(updatedGen.completedBy[0].userId, users.sam.user.id);

    // Sam updates status on Group Task (assigned to Sam's "Events & Logistics" group) -> 200 OK!
    const samUpdateGroupTask = await api(
      'PATCH',
      `/workspace/clubs/ucsctheta/tasks/${groupTaskId}`,
      {
        token: users.sam.token,
        body: { status: 'working_on_it' },
      }
    );
    assert.equal(samUpdateGroupTask.status, 200);
    assert.equal(
      samUpdateGroupTask.data.tasks.find(t => t.id === groupTaskId).status,
      'working_on_it'
    );

    // Sam tries to update status on Treasurer-only task -> 403 Forbidden!
    const samForbiddenTarget = await api(
      'PATCH',
      `/workspace/clubs/ucsctheta/tasks/${treasurerOnlyTaskId}`,
      {
        token: users.sam.token,
        body: { status: 'done' },
      }
    );
    assert.equal(samForbiddenTarget.status, 403);

    // Sam tries to edit priority on his group task -> 403 Forbidden!
    const samEditPriority = await api(
      'PATCH',
      `/workspace/clubs/ucsctheta/tasks/${groupTaskId}`,
      {
        token: users.sam.token,
        body: { priority: 'critical' },
      }
    );
    assert.equal(samEditPriority.status, 403);

    // Sam tries to PATCH confidential board task directly by ID -> 403 Forbidden!
    const samPatchConfidential = await api(
      'PATCH',
      `/workspace/clubs/ucsctheta/tasks/${confidentialBoardTaskId}`,
      {
        token: users.sam.token,
        body: { status: 'done' },
      }
    );
    assert.equal(samPatchConfidential.status, 403);
  });

  it('8. enforces real-person availability poll responders & leadership invite shortcuts', async () => {
    // Regular member Sam tries to use leadership bulk-invite shortcuts -> 403 Forbidden
    const samShortcutPoll = await api('POST', '/scheduler/polls', {
      token: users.sam.token,
      body: {
        title: 'Unauthorized Bulk Poll',
        hostClubId: 'ucsctheta',
        shortcutTargets: ['all_board', 'all_members'],
      },
    });
    assert.equal(samShortcutPoll.status, 403);

    // President Alondra creates a club poll using `all_board` + `all_members` shortcuts
    const createPoll = await api('POST', '/scheduler/polls', {
      token: users.alondra.token,
      body: {
        title: 'Theta All-Hands Planning Sync',
        hostClubId: 'ucsctheta',
        location: 'Cowell Fireside Lounge',
        shortcutTargets: ['all_board', 'all_members'],
      },
    });
    assert.equal(createPoll.status, 201);
    pollId = createPoll.data.id;

    // ZERO fake demo responders!
    assert.equal(createPoll.data.responses.length, 0);
    // All real board + member people are in invitedParticipants with hasResponded = false
    assert.ok(createPoll.data.invitedParticipants.length >= 4);
    assert.equal(
      createPoll.data.invitedParticipants.every(p => p.hasResponded === false),
      true
    );

    // Sam responds, attempting to spoof `userId` & `userName` in payload -> server enforces real authenticated identity!
    const slot1 = '2026-11-16T22:00:00.000Z';
    const slot2 = '2026-11-16T22:30:00.000Z';
    const samResp1 = await api('POST', `/scheduler/polls/${pollId}/respond`, {
      token: users.sam.token,
      body: {
        userId: 'fake_demo_alex',
        userName: 'Fake Demo Alex',
        freeSlots: [slot1],
      },
    });
    assert.equal(samResp1.status, 200);
    assert.equal(samResp1.data.responses.length, 1);
    assert.equal(samResp1.data.responses[0].userId, users.sam.user.id);
    assert.equal(samResp1.data.responses[0].userName, 'Sam Rivera');

    // Sam updates availability -> idempotent upsert, still 1 responder!
    const samResp2 = await api('POST', `/scheduler/polls/${pollId}/respond`, {
      token: users.sam.token,
      body: { freeSlots: [slot1, slot2] },
    });
    assert.equal(samResp2.status, 200);
    assert.equal(samResp2.data.responses.length, 1);
    assert.equal(samResp2.data.responses[0].freeSlots.length, 2);

    // Invited status for Sam flips to hasResponded = true!
    const samInviteEntry = samResp2.data.invitedParticipants.find(
      p => p.userId === users.sam.user.id
    );
    assert.equal(samInviteEntry.hasResponded, true);
  });

  it('9. enforces board announcement visibility & revokes board access immediately upon stepping down', async () => {
    // Alondra posts a confidential Board-Only announcement
    const boardAnn = await api('POST', '/workspace/clubs/ucsctheta/announcements', {
      token: users.alondra.token,
      body: {
        title: 'Internal Budget Review Tonight',
        body: 'Officers meet 30 mins early.',
        visibility: 'board',
        shortcutTargets: ['all_board'],
      },
    });
    assert.equal(boardAnn.status, 201);

    // Adriana (currently board) CAN see the board-only announcement
    const adrianaAnnsBefore = await api('GET', '/workspace/announcements', {
      token: users.adriana.token,
    });
    assert.equal(adrianaAnnsBefore.data.announcements.length, 1);

    // Regular member Sam CANNOT see the board-only announcement
    const samAnns = await api('GET', '/workspace/announcements', {
      token: users.sam.token,
    });
    assert.equal(samAnns.data.announcements.length, 0);

    // Adriana steps down / releases her Event Director claim
    const stepDown = await api(
      'POST',
      `/workspace/clubs/ucsctheta/claims/${betzyClaimId}/revoke`,
      { token: users.adriana.token }
    );
    assert.equal(stepDown.status, 200);
    assert.equal(stepDown.data.permissionsByClub.ucsctheta.tier, 'member');
    assert.equal(stepDown.data.permissionsByClub.ucsctheta.isBoard, false);

    // Immediately after stepping down, Adriana can NO LONGER see board-only announcements or confidential board tasks!
    const adrianaAnnsAfter = await api('GET', '/workspace/announcements', {
      token: users.adriana.token,
    });
    assert.equal(adrianaAnnsAfter.data.announcements.length, 0);

    const adrianaTasksAfter = await api('GET', '/workspace/clubs/ucsctheta/tasks', {
      token: users.adriana.token,
    });
    assert.equal(
      adrianaTasksAfter.data.tasks.some(t => t.id === confidentialBoardTaskId),
      false
    );
  });

  it('10. guarantees ZERO private user emails, tokens, claims, polls, groups, or tasks leak into public snapshot', async () => {
    const publicSnapshot = sanitizePublicSnapshot({
      exportedAt: new Date().toISOString(),
      ...getAllCollectorData(),
    });
    const serialized = JSON.stringify(publicSnapshot);

    const privateCanaries = [
      'alondra.private@ucsc.edu',
      'adriana.events@ucsc.edu',
      'sam.member@ucsc.edu',
      'eve.outsider@example.com',
      'treasurer.new@ucsc.edu',
      users.alondra.token,
      'Confidential Officer Slate Deliberation',
      'Internal Budget Review Tonight',
      'Theta All-Hands Planning Sync',
      'Events & Logistics',
      'passwordHash',
      'tokenHash',
    ];

    for (const canary of privateCanaries) {
      assert.equal(
        serialized.includes(canary),
        false,
        `Private canary "${canary}" must NEVER appear in public snapshot!`
      );
    }
  });
});
