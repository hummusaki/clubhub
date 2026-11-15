import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  startTestServer,
  resetTestDb,
  apiRequest,
  registerUser,
} from './helpers/testServer.js';

describe('Phase 2 & 5: Roster Claiming, RBAC & Multi-User Race Conditions', () => {
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

  it('rejects unauthenticated requests (401) across protected workspace & poll endpoints', async () => {
    const endpoints = [
      { method: 'GET', path: '/api/workspace/auth/me' },
      { method: 'POST', path: '/api/workspace/clubs/acm_club/join', body: {} },
      { method: 'POST', path: '/api/workspace/clubs/acm_club/claims', body: { requestedRole: 'President' } },
      { method: 'POST', path: '/api/workspace/clubs/acm_club/groups', body: { name: 'Marketing' } },
      { method: 'GET', path: '/api/workspace/clubs/acm_club/tasks' },
      { method: 'POST', path: '/api/workspace/clubs/acm_club/tasks', body: { title: 'Test Task' } },
      { method: 'POST', path: '/api/workspace/clubs/acm_club/announcements', body: { title: 'Hello' } },
      { method: 'POST', path: '/api/scheduler/polls', body: { title: 'Poll' } },
      { method: 'POST', path: '/api/scheduler/polls/fake/respond', body: { freeSlots: [] } },
    ];

    for (const ep of endpoints) {
      const res = await apiRequest(ctx.baseUrl, ep.path, { method: ep.method, body: ep.body });
      assert.equal(res.status, 401, `Expected 401 on ${ep.method} ${ep.path}, got ${res.status}`);
    }
  });

  it('allows founding board claim, queues subsequent claims as pending, and blocks unauthorized or self-approvals', async () => {
    const founder = await registerUser(ctx.baseUrl, {
      email: 'founder@example.edu',
      fullName: 'Founder User',
    });
    const applicant = await registerUser(ctx.baseUrl, {
      email: 'applicant@example.edu',
      fullName: 'Applicant User',
    });
    const regular = await registerUser(ctx.baseUrl, {
      email: 'regular@example.edu',
      fullName: 'Regular Member',
    });

    // Regular member joins club
    const joinRes = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/robotics_club/join', {
      method: 'POST',
      token: regular.token,
    });
    assert.equal(joinRes.status, 200);
    assert.equal(joinRes.data.permissionsByClub.robotics_club.isMember, true);
    assert.equal(joinRes.data.permissionsByClub.robotics_club.isBoard, false);

    // Founding board claim -> auto-approved (`first_board_claim`)
    const founderClaim = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/robotics_club/claims', {
      method: 'POST',
      token: founder.token,
      body: {
        rosterId: 'seat_president',
        requestedRole: 'President',
      },
    });
    assert.equal(founderClaim.status, 201);
    assert.equal(founderClaim.data.claimStatus, 'approved');
    assert.equal(founderClaim.data.verificationMethod, 'first_board_claim');

    // Duplicate claim on occupied seat -> 409 SLOT_ALREADY_CLAIMED (including case-insensitive rosterId)
    const dupClaim = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/robotics_club/claims', {
      method: 'POST',
      token: applicant.token,
      body: {
        rosterId: 'SEAT_PRESIDENT',
        requestedRole: 'President',
      },
    });
    assert.equal(dupClaim.status, 409);
    assert.equal(dupClaim.data.code, 'SLOT_ALREADY_CLAIMED');

    // Hoarding check: Founder cannot claim a second board seat while holding President
    const hoardClaim = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/robotics_club/claims', {
      method: 'POST',
      token: founder.token,
      body: {
        rosterId: 'seat_treasurer',
        requestedRole: 'Treasurer',
      },
    });
    assert.equal(hoardClaim.status, 409);
    assert.equal(hoardClaim.data.code, 'USER_ALREADY_ON_BOARD');

    // Subsequent board claim on unclaimed Treasurer seat -> pending board review
    const pendingRes = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/robotics_club/claims', {
      method: 'POST',
      token: applicant.token,
      body: {
        rosterId: 'seat_treasurer',
        requestedRole: 'Treasurer',
      },
    });
    assert.equal(pendingRes.status, 201);
    assert.equal(pendingRes.data.claimStatus, 'pending');
    const claimId = pendingRes.data.claim.id;

    // Self-approval blocked (applicant doesn't have board, and even if checked, cannot self-approve)
    const selfReview = await apiRequest(
      ctx.baseUrl,
      `/api/workspace/clubs/robotics_club/claims/${claimId}/review`,
      {
        method: 'POST',
        token: applicant.token,
        body: { decision: 'approve' },
      }
    );
    assert.equal(selfReview.status, 403);

    // Regular member blocked from reviewing claims
    const regReview = await apiRequest(
      ctx.baseUrl,
      `/api/workspace/clubs/robotics_club/claims/${claimId}/review`,
      {
        method: 'POST',
        token: regular.token,
        body: { decision: 'approve' },
      }
    );
    assert.equal(regReview.status, 403);

    // Founder approves applicant's Treasurer claim -> applicant becomes Board!
    const approveRes = await apiRequest(
      ctx.baseUrl,
      `/api/workspace/clubs/robotics_club/claims/${claimId}/review`,
      {
        method: 'POST',
        token: founder.token,
        body: { decision: 'approve' },
      }
    );
    assert.equal(approveRes.status, 200);

    const applicantMe = await apiRequest(ctx.baseUrl, '/api/workspace/auth/me', {
      token: applicant.token,
    });
    assert.equal(applicantMe.data.permissionsByClub.robotics_club.isBoard, true);
    assert.equal(applicantMe.data.permissionsByClub.robotics_club.roleTitle, 'Treasurer');
  });

  it('handles simultaneous claim & approval race conditions without duplicate seat assignments', async () => {
    const userA = await registerUser(ctx.baseUrl, {
      email: 'race_a@example.edu',
      fullName: 'Racer A',
    });
    const userB = await registerUser(ctx.baseUrl, {
      email: 'race_b@example.edu',
      fullName: 'Racer B',
    });
    const userC = await registerUser(ctx.baseUrl, {
      email: 'race_c@example.edu',
      fullName: 'Racer C',
    });

    // 1. Two users simultaneously claim the founding seat (`seat_vp`) in an empty club
    const [claimA, claimB] = await Promise.all([
      apiRequest(ctx.baseUrl, '/api/workspace/clubs/chess_club/claims', {
        method: 'POST',
        token: userA.token,
        body: { rosterId: 'seat_president', requestedRole: 'President' },
      }),
      apiRequest(ctx.baseUrl, '/api/workspace/clubs/chess_club/claims', {
        method: 'POST',
        token: userB.token,
        body: { rosterId: 'seat_president', requestedRole: 'President' },
      }),
    ]);

    const approvedCount = [claimA, claimB].filter(
      r => r.status === 201 && r.data.claimStatus === 'approved'
    ).length;
    const conflictOrPendingCount = [claimA, claimB].filter(
      r => r.status === 409 || r.data.claimStatus === 'pending'
    ).length;
    assert.equal(approvedCount, 1, 'Exactly one founding claimant may be approved for the seat');
    assert.equal(conflictOrPendingCount, 1, 'Second concurrent claimant must get 409 or pending');

    // Determine who won President
    const presToken = claimA.data.claimStatus === 'approved' ? userA.token : userB.token;
    const loser = claimA.data.claimStatus === 'approved' ? userB : userA;

    // 2. Two applicants submit pending claims for the SAME unclaimed `seat_events` spot,
    //    and President fires two concurrent approvals at the exact same instant
    const pend1 = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/chess_club/claims', {
      method: 'POST',
      token: loser.token,
      body: { rosterId: 'seat_events', requestedRole: 'Events Lead' },
    });
    const pend2 = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/chess_club/claims', {
      method: 'POST',
      token: userC.token,
      body: { rosterId: 'seat_events', requestedRole: 'Events Lead' },
    });
    assert.equal(pend1.data.claimStatus, 'pending');
    assert.equal(pend2.data.claimStatus, 'pending');

    const [rev1, rev2] = await Promise.all([
      apiRequest(
        ctx.baseUrl,
        `/api/workspace/clubs/chess_club/claims/${pend1.data.claim.id}/review`,
        { method: 'POST', token: presToken, body: { decision: 'approve' } }
      ),
      apiRequest(
        ctx.baseUrl,
        `/api/workspace/clubs/chess_club/claims/${pend2.data.claim.id}/review`,
        { method: 'POST', token: presToken, body: { decision: 'approve' } }
      ),
    ]);

    const statuses = [rev1.status, rev2.status].sort((a, b) => a - b);
    assert.deepEqual(statuses, [200, 409], 'Concurrent approval of same slot must yield one 200 and one 409');
  });

  it('immediately enforces mid-session board permission revocation on active tokens', async () => {
    const pres = await registerUser(ctx.baseUrl, {
      email: 'pres@example.edu',
      fullName: 'Club President',
    });
    const officer = await registerUser(ctx.baseUrl, {
      email: 'officer@example.edu',
      fullName: 'Board Officer',
    });

    // President claims founding seat
    await apiRequest(ctx.baseUrl, '/api/workspace/clubs/design_club/claims', {
      method: 'POST',
      token: pres.token,
      body: { rosterId: 'seat_pres', requestedRole: 'President' },
    });

    // Officer claims Marketing Director and gets approved by President
    const offClaim = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/design_club/claims', {
      method: 'POST',
      token: officer.token,
      body: { rosterId: 'seat_mkt', requestedRole: 'Marketing Director' },
    });
    await apiRequest(
      ctx.baseUrl,
      `/api/workspace/clubs/design_club/claims/${offClaim.data.claim.id}/review`,
      { method: 'POST', token: pres.token, body: { decision: 'approve' } }
    );

    // Officer can create a sub-group while holding board permissions
    const grpOk = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/design_club/groups', {
      method: 'POST',
      token: officer.token,
      body: { name: 'Brand Team', color: 'purple' },
    });
    assert.equal(grpOk.status, 201);

    // President revokes Officer's board position mid-session while Officer's token is still active!
    const revokeRes = await apiRequest(
      ctx.baseUrl,
      `/api/workspace/clubs/design_club/claims/${offClaim.data.claim.id}/revoke`,
      { method: 'POST', token: pres.token }
    );
    assert.equal(revokeRes.status, 200);

    // Officer immediately attempts privileged actions with their still-active session token -> all 403!
    const grpBlocked = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/design_club/groups', {
      method: 'POST',
      token: officer.token,
      body: { name: 'Unauthorized Group' },
    });
    assert.equal(grpBlocked.status, 403);

    const taskBlocked = await apiRequest(ctx.baseUrl, '/api/workspace/clubs/design_club/tasks', {
      method: 'POST',
      token: officer.token,
      body: { title: 'Unauthorized Task' },
    });
    assert.equal(taskBlocked.status, 403);

    const annBlocked = await apiRequest(
      ctx.baseUrl,
      '/api/workspace/clubs/design_club/announcements',
      {
        method: 'POST',
        token: officer.token,
        body: { title: 'Unauthorized Announcement' },
      }
    );
    assert.equal(annBlocked.status, 403);
  });
});
