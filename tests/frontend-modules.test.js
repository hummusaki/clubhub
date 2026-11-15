import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from '@babel/core';
import { resolveDeduplicatedTargets } from '../src/utils/leadershipShortcuts.js';
import {
  recommendClubsForInterests,
  parseQueryIntent,
  buildConversationalQuery,
} from '../src/utils/aiClubAgent.js';
import { mergeGenerativeWithRag } from '../src/api/aiClient.js';
import { filterAndRankBySearch, matchesSearchQuery } from '../src/utils/search.js';
import {
  filterEventsForCalendarSync,
  normalizeExternalPostUrl,
  resolveSchedulePostLink,
} from '../src/utils/calendarSync.js';
import {
  extractEvents,
  extractLocation,
  extractPost,
  filterActualEvents,
  isActualClubEvent,
} from '../collector/src/extract.js';
import {
  readTaskBoardPrefs,
  writeTaskBoardPrefs,
  clearTaskBoardPrefsForAccount,
  formatSmartDueDate,
  isTaskOverdue,
  buildClientReminderPayload,
  hasLocalReminderFired,
  markLocalReminderFired,
} from '../src/utils/taskReminders.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, '../src');

function collectSourceFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(fullPath, acc);
    } else if (/\.(js|jsx)$/.test(entry.name)) {
      acc.push(fullPath);
    }
  }
  return acc;
}

describe('Frontend JSX/ESM AST Validation, Import Resolution & Client Shortcut Deduplication', () => {
  it('parses all src/**/*.js(x) files cleanly with zero syntax errors or unresolved relative imports', () => {
    const files = collectSourceFiles(SRC_DIR);
    assert.ok(files.length >= 20, 'Expected frontend source files in src/');

    for (const file of files) {
      const code = fs.readFileSync(file, 'utf8');
      const ast = parseSync(code, {
        filename: file,
        sourceType: 'module',
        parserOpts: {
          sourceType: 'module',
          plugins: ['jsx'],
        },
      });
      assert.ok(ast?.program, `Failed to parse JSX/ESM in ${file}`);

      // Verify all relative imports resolve to an existing file in `src/`
      for (const node of ast.program.body) {
        if (
          (node.type === 'ImportDeclaration' ||
            node.type === 'ExportNamedDeclaration' ||
            node.type === 'ExportAllDeclaration') &&
          node.source?.value?.startsWith('.')
        ) {
          const rawSpec = node.source.value;
          const baseTarget = path.resolve(path.dirname(file), rawSpec);
          const candidates = [
            baseTarget,
            `${baseTarget}.js`,
            `${baseTarget}.jsx`,
            `${baseTarget}.json`,
            `${baseTarget}.css`,
            path.join(baseTarget, 'index.js'),
            path.join(baseTarget, 'index.jsx'),
          ];
          const exists = candidates.some(c => fs.existsSync(c));
          assert.equal(
            exists,
            true,
            `Unresolved import "${rawSpec}" in ${path.relative(SRC_DIR, file)}`
          );
        }
      }
    }
  });

  it('deduplicates overlapping Leadership Targeting Shortcuts across board, sub-groups, and explicit selections', () => {
    const clubPeople = {
      board: [
        { userId: 'u1', email: 'pres@club.org', name: 'Avery Chen', roleTitle: 'President', tier: 'president' },
        { userId: 'u2', email: 'mkt@club.org', name: 'Jordan Diaz', roleTitle: 'VP Marketing', tier: 'board' },
      ],
      members: [
        { userId: 'u3', email: 'mem@club.org', name: 'Riley Park', roleTitle: 'Member', tier: 'member' },
      ],
      groups: [
        {
          id: 'g_mkt',
          name: 'Marketing',
          members: [
            { userId: 'u2', email: 'mkt@club.org', name: 'Jordan Diaz', roleTitle: 'VP Marketing', personType: 'officer' },
            { userId: 'u3', email: 'mem@club.org', name: 'Riley Park', roleTitle: 'Member', personType: 'member' },
          ],
        },
      ],
    };

    const resolved = resolveDeduplicatedTargets(
      clubPeople,
      ['all_board', 'group:g_mkt', 'all_members'],
      [{ userId: 'u2', email: 'mkt@club.org', name: 'Jordan Diaz' }]
    );

    assert.equal(resolved.length, 3, 'Should resolve 3 unique users with zero duplicates');
    assert.deepEqual(
      resolved.map(r => r.userId),
      ['u1', 'u2', 'u3']
    );
  });

  it('matches natural-language club interests without substring false positives on UCSC club metadata', () => {
    const samplePool = [
      {
        id: 'gdgc_ucsc',
        name: 'Google Developer Group on Campus UCSC',
        category: 'tech & science',
        description: 'Workshops, hackathons, and software engineering sprints on campus.',
        tags: [{ label: '@gdgc_ucsc' }, { label: 'Tech & Science' }],
        members: 210,
      },
      {
        id: 'ucscbea',
        name: 'Business Economics Academia (BEA)',
        category: 'pre-professional',
        description: 'Economics, finance, and academic community at UCSC.',
        tags: [{ label: '@ucscbea' }, { label: 'Academic' }],
        members: 180,
      },
      {
        id: 'ucsc_outdoor',
        name: 'Outdoor Adventure Club',
        category: 'gaming',
        description: 'Weekend backpacking, hiking, camping, and redwood trail adventures.',
        tags: [{ label: 'Outdoors' }],
        members: 95,
      },
      {
        id: 'alay.ucsc',
        name: 'Alay',
        category: 'media & arts',
        description: 'Painting, drawing, and creative studio community.',
        tags: [{ label: '@alay.ucsc' }, { label: 'Media & Arts' }],
        members: 120,
      },
    ];

    const roboticsRes = recommendClubsForInterests(samplePool, 'cad robotics coding');
    assert.equal(roboticsRes.matches[0]?.club.id, 'gdgc_ucsc');
    assert.equal(
      roboticsRes.matches.some(m => m.club.id === 'ucscbea'),
      false,
      'Should not false-match "cad" inside "Academia" or "cs" inside "@ucscbea"'
    );

    const hikingRes = recommendClubsForInterests(samplePool, 'hiking camping redwoods');
    assert.equal(hikingRes.matches.length, 1);
    assert.equal(hikingRes.matches[0]?.club.id, 'ucsc_outdoor');

    const aiRes = recommendClubsForInterests(samplePool, 'ai software');
    assert.equal(aiRes.matches[0]?.club.id, 'gdgc_ucsc');
    assert.equal(
      aiRes.matches.some(m => m.club.id === 'alay.ucsc'),
      false,
      'Should not false-match "ai" inside "painting"'
    );
  });

  it('restricts ClubTaskBoard to joined memberClubs only and renders per-server Personal To-Do sections', () => {
    const boardCode = fs.readFileSync(
      path.join(SRC_DIR, 'components/ClubTaskBoard.jsx'),
      'utf8'
    );
    const modalCode = fs.readFileSync(
      path.join(SRC_DIR, 'components/TaskModal.jsx'),
      'utf8'
    );

    // Joined-clubs-only visibility & selector enforcement
    assert.match(boardCode, /const memberClubs = useMemo/);
    assert.match(boardCode, /memberClubs\.length === 0/);
    assert.match(boardCode, /memberClubs\.map\(c =>/);
    assert.equal(
      boardCode.includes('{clubs.map(c =>'),
      false,
      'ClubTaskBoard selector must never list unjoined clubs from raw clubs prop'
    );

    // Per-server personal section ("My To-Do List") + inline quick-add todo form
    assert.match(boardCode, /My To-Do List/);
    assert.match(boardCode, /handleQuickAddPersonalTask/);
    assert.match(boardCode, /personalSections\.map/);
    assert.match(modalCode, /visibility:\s*'personal'/);
  });

  it('keeps bottom scroll clearance on half-screen / tablet viewports (< lg) while fixed bottom nav is visible', () => {
    const appCode = fs.readFileSync(path.join(SRC_DIR, 'App.jsx'), 'utf8');
    const sidebarCode = fs.readFileSync(path.join(SRC_DIR, 'components/Sidebar.jsx'), 'utf8');

    assert.match(sidebarCode, /lg:hidden fixed bottom-0/);
    assert.match(appCode, /sm:pt-5 pb-\[calc\(6rem\+env\(safe-area-inset-bottom,0px\)\)\] lg:pb-16/);
    assert.match(appCode, /sm:pt-7 pb-\[calc\(7rem\+env\(safe-area-inset-bottom,0px\)\)\] lg:pb-20/);
    assert.equal(
      /pb-2[48]\s+sm:py-[57]/.test(appCode),
      false,
      'Main content wrapper must not use sm:py-* shorthand that clobbers bottom nav clearance on < lg widths'
    );
  });

  it('keeps Header SearchBox separate from standalone Overview AI Matchmaker and supports smart site-wide search', () => {
    const headerCode = fs.readFileSync(path.join(SRC_DIR, 'components/Header.jsx'), 'utf8');
    const appCode = fs.readFileSync(path.join(SRC_DIR, 'App.jsx'), 'utf8');

    assert.match(headerCode, /<SearchBox/);
    assert.equal(
      headerCode.includes('AiOverviewSearchBar'),
      false,
      'Header must keep the normal site-wide SearchBox instead of replacing it with AiOverviewSearchBar'
    );
    assert.match(appCode, /<AiOverviewSearchBar/);
    assert.match(appCode, /<OverviewSearchResults/);

    const items = [
      {
        id: 'bio_mention',
        name: 'Tabletop Games Association',
        handle: 'ucsc.tga',
        desc: 'Board games, RPGs, and occasional chess nights.',
      },
      {
        id: '8th_rank',
        name: '8th Rank Society',
        handle: '8thrankchess.ucsc',
        desc: 'Women’s Chess Club at UCSC.',
      },
      {
        id: 'chess_main',
        name: 'Chess Club',
        handle: 'ucscchessclub',
        desc: 'Weekly blitz and classical tournaments.',
      },
      {
        id: 'acmw',
        name: 'Association for Computing Machinery – Women (ACM-W)',
        handle: 'acmw.ucsc',
        desc: 'Annual hackathon and technical mentorship.',
      },
      {
        id: 'acquire',
        name: 'Acquire A Cappella',
        handle: 'acquireacappella',
        desc: 'Student vocal harmonies.',
      },
    ];

    const getFields = c => ({
      primary: [c.name],
      secondary: [c.handle],
      tertiary: [c.desc],
    });

    // Primary title match ("Chess Club") ranks above tertiary bio mention
    const chessRanked = filterAndRankBySearch(items, 'chess', getFields);
    assert.equal(chessRanked[0]?.id, 'chess_main');

    // Out-of-order multi-token + curly apostrophe normalization ("womens chess")
    const womensChess = filterAndRankBySearch(items, 'womens chess', getFields);
    assert.equal(womensChess.length, 1);
    assert.equal(womensChess[0]?.id, '8th_rank');

    // Compound matching across hyphens/spaces ("acmw", "acappella")
    assert.equal(filterAndRankBySearch(items, 'acmw', getFields)[0]?.id, 'acmw');
    assert.equal(filterAndRankBySearch(items, 'acappella', getFields)[0]?.id, 'acquire');

    // 1-edit typo tolerance on words >= 5 chars ("hackaton" -> "hackathon")
    assert.equal(
      matchesSearchQuery('hackaton', { primary: items[3].name, tertiary: items[3].desc }),
      true
    );
  });

  it('blocks incoming calendar events, announcements, and notifications when a user is in zero clubs', () => {
    const sampleEvents = [
      {
        id: 'evt_cs_1',
        clubId: 'cs_club',
        club: 'CS Club',
        event: 'Systems Workshop',
        start: '2027-05-10T18:00:00.000Z',
        end: '2027-05-10T19:00:00.000Z',
      },
      {
        id: 'evt_art_1',
        clubId: 'art_club',
        club: 'Art Club',
        event: 'Studio Night',
        start: '2027-05-11T18:00:00.000Z',
        end: '2027-05-11T19:00:00.000Z',
      },
    ];

    // 0 joined clubs -> 0 calendar events regardless of settings or RSVPs
    const zeroClubsSynced = filterEventsForCalendarSync(sampleEvents, {
      joinedClubIds: [],
      rsvpIds: ['evt_cs_1'],
      settings: { clubScope: 'all', rsvpOnly: false },
      now: new Date('2027-05-01T00:00:00.000Z'),
    });
    assert.deepEqual(zeroClubsSynced, []);

    // Joining cs_club -> receives only cs_club events, never art_club
    const joinedCsSynced = filterEventsForCalendarSync(sampleEvents, {
      joinedClubIds: ['cs_club'],
      settings: { clubScope: 'all' },
      now: new Date('2027-05-01T00:00:00.000Z'),
    });
    assert.equal(joinedCsSynced.length, 1);
    assert.equal(joinedCsSynced[0].id, 'evt_cs_1');

    // Static verification that UI components never fall back to sampleData when items are empty
    const headerCode = fs.readFileSync(path.join(SRC_DIR, 'components/Header.jsx'), 'utf8');
    const annCode = fs.readFileSync(path.join(SRC_DIR, 'components/Announcements.jsx'), 'utf8');
    const calCode = fs.readFileSync(path.join(SRC_DIR, 'components/CalendarView.jsx'), 'utf8');
    const appCode = fs.readFileSync(path.join(SRC_DIR, 'App.jsx'), 'utf8');

    assert.equal(
      headerCode.includes('initialAnnouncements'),
      false,
      'Header notifications must never fall back to sampleData initialAnnouncements'
    );
    assert.equal(
      annCode.includes('defaultAnnouncements'),
      false,
      'Announcements card must never fall back to sampleData defaultAnnouncements'
    );
    assert.equal(
      calCode.includes('defaultSchedule'),
      false,
      'CalendarView must never fall back to sampleData defaultSchedule'
    );
    assert.match(appCode, /if \(joinedClubKeySet\.size === 0\) return \[\]/);
  });

  it('persists Task Board filters & view settings per account and handles time-aware due dates + reminders', () => {
    const storeMap = new Map();
    const mockStorage = {
      getItem: k => (storeMap.has(k) ? storeMap.get(k) : null),
      setItem: (k, v) => storeMap.set(k, String(v)),
      removeItem: k => storeMap.delete(k),
    };

    // Demo mode never writes persistent Task Board prefs
    writeTaskBoardPrefs('demo', { focusTab: 'personal', hideDone: true }, mockStorage);
    assert.equal(storeMap.size, 0);
    assert.equal(readTaskBoardPrefs('demo', mockStorage).focusTab, 'all');

    // Account-scoped prefs save & restore across reloads without leaking across accounts
    writeTaskBoardPrefs(
      'email:alice@ucsc.edu',
      {
        selectedClubId: 'solar_car',
        focusTab: 'personal',
        viewTiersByClub: { solar_car: 'board' },
        searchQuery: 'fairing',
        onlyAssignedToMe: true,
        hideDone: true,
        kpiQuickFilter: 'overdue',
        showAdvancedFilters: true,
        statusFilter: 'working_on_it',
        priorityFilter: 'critical',
        groupFilter: 'grp_aero',
        collapsedSections: { sec_1: true },
        showCompletedPersonal: { solar_car: true },
        reminderDefaults: {
          autoRemindTimedTasks: true,
          defaultOffsetMinutes: 15,
          defaultChannels: ['discord', 'email', 'browser'],
          browserAlertsEnabled: true,
        },
      },
      mockStorage
    );

    const restoredAlice = readTaskBoardPrefs('email:alice@ucsc.edu', mockStorage);
    assert.equal(restoredAlice.selectedClubId, 'solar_car');
    assert.equal(restoredAlice.focusTab, 'personal');
    assert.equal(restoredAlice.viewTiersByClub.solar_car, 'board');
    assert.equal(restoredAlice.searchQuery, 'fairing');
    assert.equal(restoredAlice.onlyAssignedToMe, true);
    assert.equal(restoredAlice.hideDone, true);
    assert.equal(restoredAlice.kpiQuickFilter, 'overdue');
    assert.equal(restoredAlice.showAdvancedFilters, true);
    assert.equal(restoredAlice.statusFilter, 'working_on_it');
    assert.equal(restoredAlice.priorityFilter, 'critical');
    assert.equal(restoredAlice.groupFilter, 'grp_aero');
    assert.equal(restoredAlice.collapsedSections.sec_1, true);
    assert.equal(restoredAlice.showCompletedPersonal.solar_car, true);
    assert.equal(restoredAlice.reminderDefaults.autoRemindTimedTasks, true);
    assert.equal(restoredAlice.reminderDefaults.defaultOffsetMinutes, 15);

    const restoredBob = readTaskBoardPrefs('email:bob@ucsc.edu', mockStorage);
    assert.equal(restoredBob.focusTab, 'all');
    assert.equal(restoredBob.hideDone, false);

    clearTaskBoardPrefsForAccount('email:alice@ucsc.edu', mockStorage);
    assert.equal(readTaskBoardPrefs('email:alice@ucsc.edu', mockStorage).selectedClubId, '');

    // Time-aware smart due date formatting + exact minute overdue detection
    const refNow = new Date(2027, 4, 10, 15, 25, 0); // May 10, 2027 at 3:25 PM local
    const todaySoon = formatSmartDueDate('2027-05-10', '16:00', false, { now: refNow });
    assert.equal(todaySoon.label, 'Due in 35m · 4:00 PM');
    assert.equal(todaySoon.tone, 'soon');

    const todayEvening = formatSmartDueDate('2027-05-10', '19:30', false, { now: refNow });
    assert.equal(todayEvening.label, 'Today · 7:30 PM');
    assert.equal(todayEvening.tone, 'soon');

    const twoHoursOverdue = formatSmartDueDate('2027-05-10', '13:25', false, { now: refNow });
    assert.equal(twoHoursOverdue.label, '2h overdue · 1:25 PM');
    assert.equal(twoHoursOverdue.tone, 'overdue');

    // Backwards-compatible 2-argument call `formatSmartDueDate(ymd, isDone)`
    const compatDone = formatSmartDueDate('2027-05-10', true);
    assert.equal(compatDone.tone, 'done');

    assert.equal(
      isTaskOverdue({ dueDate: '2027-05-10', dueTime: '15:00', status: 'working_on_it' }, refNow),
      true
    );
    assert.equal(
      isTaskOverdue({ dueDate: '2027-05-10', dueTime: '16:00', status: 'working_on_it' }, refNow),
      false
    );
    assert.equal(
      isTaskOverdue({ dueDate: '2027-05-10', dueTime: '15:00', status: 'done' }, refNow),
      false
    );

    // Client reminder payload & local deduplication ledger reset on reschedule
    const reminderPayload = buildClientReminderPayload({
      enabled: true,
      dueDate: '2027-05-10',
      dueTime: '17:00',
      offsetMinutes: 60,
      channels: ['discord', 'email'],
    });
    assert.equal(reminderPayload.enabled, true);
    assert.equal(
      new Date(reminderPayload.dueAtIso).getTime() - new Date(reminderPayload.remindAtIso).getTime(),
      60 * 60_000
    );

    const sampleTask = {
      id: 'tsk_remind_1',
      dueDate: '2027-05-10',
      dueTime: '17:00',
      reminder: { offsetMinutes: 60, sentAt: null },
    };
    assert.equal(hasLocalReminderFired(sampleTask, mockStorage), false);
    markLocalReminderFired(sampleTask, mockStorage);
    assert.equal(hasLocalReminderFired(sampleTask, mockStorage), true);
    assert.equal(
      hasLocalReminderFired({ ...sampleTask, dueTime: '18:30' }, mockStorage),
      false,
      'Rescheduling dueTime must allow reminder to fire at the new time'
    );

    // Verify UI wiring in App.jsx, ClubTaskBoard.jsx, TaskModal.jsx, and TimePickerSelect.jsx
    const appCode = fs.readFileSync(path.join(SRC_DIR, 'App.jsx'), 'utf8');
    const boardCode = fs.readFileSync(path.join(SRC_DIR, 'components/ClubTaskBoard.jsx'), 'utf8');
    const modalCode = fs.readFileSync(path.join(SRC_DIR, 'components/TaskModal.jsx'), 'utf8');
    const timePickerCode = fs.readFileSync(
      path.join(SRC_DIR, 'components/TimePickerSelect.jsx'),
      'utf8'
    );

    assert.match(appCode, /ACTIVE_NAV_STORAGE_KEY/);
    assert.match(boardCode, /readTaskBoardPrefs/);
    assert.match(boardCode, /writeTaskBoardPrefs/);
    assert.match(boardCode, /sendClubTaskReminder/);
    assert.match(boardCode, /TimePickerSelect/);
    assert.match(modalCode, /dueTime/);
    assert.match(modalCode, /TimePickerSelect/);
    assert.match(modalCode, /Reminder Notification/);
    assert.match(timePickerCode, /All day \(no specific time\)/);
    assert.equal(
      boardCode.includes('type="time"') || modalCode.includes('type="time"'),
      false,
      'Must use dedicated TimePickerSelect instead of broken/disabled native type="time" inputs'
    );
  });

  it('filters out non-events across 2-hour sync extractors while preserving attendable club events and meetings', () => {
    const refIso = '2026-11-15T18:00:00.000Z';

    // 1. Deadlines (ASCII + CJK) -> classified as announcement, 0 events
    const appDeadline = extractPost(
      {
        id: 'p_deadline_1',
        caption: 'Application Deadline Extended! Submit officer applications by Friday, Nov 20 at 11:59pm.',
        postedAt: refIso,
      },
      { username: 'ucscblueprint' }
    );
    assert.equal(appDeadline.events.length, 0);
    assert.equal(appDeadline.type, 'announcement');

    const cjkDeadline = extractEvents('早鳥預售票 11/20 晚上 11:59 截止！', refIso);
    assert.equal(cjkDeadline.length, 0);

    assert.equal(
      isActualClubEvent({
        id: 'claude_dl_1',
        title: 'Officer Applications Due',
        kind: 'deadline',
        start: '2026-11-20T23:59:00.000Z',
        allDay: false,
      }),
      false
    );

    // 2. Online UCSC Giving Day / donation / survey / merch campaigns without a live meetup -> 0 events
    const givingDay = extractPost(
      {
        id: 'p_giving_1',
        caption:
          'UCSC Giving Day is Wednesday, November 18! Donate early at give.ucsc.edu to support our team!',
        postedAt: refIso,
      },
      { username: 'ucscmocktrial' }
    );
    assert.equal(givingDay.events.length, 0);

    // 3. Zine / form submissions open without a live session -> 0 events
    const zineSub = extractPost(
      {
        id: 'p_zine_1',
        caption: 'Accepting Fall Zine Submissions! Submissions are open until Sunday Nov 22.',
        postedAt: refIso,
      },
      { username: 'matchboxmagazine' }
    );
    assert.equal(zineSub.events.length, 0);
    assert.equal(zineSub.type, 'announcement');

    // 4. Spotlights, cancellations, recaps, and chrono-node false positives ("now", "DIV 1/2", "QUEST 1/4", "Pajama Night", "be provided")
    assert.equal(
      extractEvents(
        'Meet our 2026-2027 Board! Swipe to learn more about our officers right now!',
        refIso
      ).length,
      0
    );
    assert.equal(
      extractEvents(
        "Heads up everyone: No GBM this week! We won't be meeting on Thursday Nov 19.",
        refIso
      ).length,
      0
    );
    assert.equal(
      extractEvents(
        'Thank you so much to everyone who came out to our mixer last night! See yall next week!',
        refIso
      ).length,
      0
    );
    assert.equal(
      extractEvents('Congrats to our DIV 1/2 roster and QUEST 1/4 cohort!', refIso).length,
      0
    );
    assert.equal(
      extractLocation('Snacks and drinks will be provided for all attendees!'),
      null,
      '"be " in prose must never false-match Baskin Engineering'
    );
    assert.equal(extractLocation('Join us in BE 152 at 6pm!'), 'BE 152');

    // 5. Real attendable events & meetings ARE preserved
    const realWorkshop = extractPost(
      {
        id: 'p_real_1',
        caption:
          'Hey Slugs!\nJoin us for our Intro to Embedded Rust Workshop this Thursday, Nov 19 from 6:00-8:00pm in E2-180! Snacks will be provided.',
        postedAt: refIso,
      },
      { username: 'slugbotics' }
    );
    assert.equal(realWorkshop.events.length, 1);
    assert.equal(realWorkshop.type, 'event');
    assert.equal(realWorkshop.events[0].allDay, false);
    assert.equal(realWorkshop.events[0].location, 'E2-180');

    const bobaFundraiser = extractPost(
      {
        id: 'p_boba_1',
        caption:
          'Stop by our Pre-Dental Boba Fundraiser on Monday Nov 16 from 12pm-4pm at Quarry Plaza!',
        postedAt: refIso,
      },
      { username: 'ucscpredental' }
    );
    assert.equal(bobaFundraiser.events.length, 1);
    assert.equal(bobaFundraiser.events[0].location, 'Quarry Plaza');

    // Recap post that ALSO schedules a concrete timed + located future meeting keeps the future meeting
    const recapWithNextMeeting = extractPost(
      {
        id: 'p_recap_next',
        caption:
          "Last night's meeting was so fun! Join us for our next book club meeting on Tuesday, Nov 17 at 7:30pm in Cowell Conference Room 132.",
        postedAt: refIso,
      },
      { username: 'slugbookclub' }
    );
    assert.equal(recapWithNextMeeting.events.length, 1);
    assert.equal(recapWithNextMeeting.events[0].location, 'Cowell Conference Room 132');

    // 6. Cross-post deduplication + untimed teaser shadow removal
    const deduped = filterActualEvents([
      {
        id: 'teaser-0',
        clubId: 'cssa.ucsc',
        postId: 'teaser',
        permalink: 'https://www.instagram.com/p/teaser/',
        title: "JOIN CSSA's Career Panel next Wednesday!",
        kind: 'event',
        start: '2026-11-18T08:00:00.000Z',
        allDay: true,
        location: null,
        source: 'instagram',
      },
      {
        id: 'flyer-0',
        clubId: 'cssa.ucsc',
        postId: 'flyer',
        permalink: 'https://www.instagram.com/p/flyer/',
        title: 'CSSA Career Panel',
        kind: 'event',
        start: '2026-11-19T03:15:00.000Z', // Nov 18 7:15 PM PST
        allDay: false,
        location: 'Zoom',
        source: 'instagram',
      },
      {
        id: 'tile2-0',
        clubId: 'cssa.ucsc',
        postId: 'tile2',
        permalink: 'https://www.instagram.com/p/tile2/',
        title: 'CSSA Career Panel',
        kind: 'event',
        start: '2026-11-19T03:15:00.000Z',
        allDay: false,
        location: 'Zoom',
        source: 'instagram',
      },
    ]);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].id, 'flyer-0');
    assert.equal(deduped[0].permalink, 'https://www.instagram.com/p/flyer/');
  });

  it('exposes Original Post links on Upcoming Schedule (compact CalendarView) and validates exported snapshot events', () => {
    // URL normalization & platform-aware link metadata
    assert.equal(
      normalizeExternalPostUrl(
        'https://l.instagram.com/?u=https%3A%2F%2Fwww.instagram.com%2Fp%2FDfqieVWtTDG%2F'
      ),
      'https://www.instagram.com/p/DfqieVWtTDG/'
    );
    assert.equal(
      normalizeExternalPostUrl('instagram.com/p/DfqieVWtTDG/'),
      'https://instagram.com/p/DfqieVWtTDG/'
    );

    const igLink = resolveSchedulePostLink({
      id: 'ev_1',
      permalink: 'https://www.instagram.com/p/DfqieVWtTDG/',
      source: 'instagram',
    });
    assert.deepEqual(igLink, {
      url: 'https://www.instagram.com/p/DfqieVWtTDG/',
      label: 'Original Post',
      tooltip: 'View original Instagram post',
    });

    const discordLink = resolveSchedulePostLink({
      id: 'ev_2',
      permalink: 'https://discord.com/channels/111/222/333',
      source: 'discord',
    });
    assert.equal(discordLink?.label, 'Original Post');
    assert.match(discordLink?.tooltip || '', /Discord/);

    const fallbackClubLink = resolveSchedulePostLink({
      id: 'ev_3',
      permalink: null,
      clubPageUrl: 'https://www.instagram.com/slugbotics/',
      isCustom: false,
    });
    assert.equal(fallbackClubLink?.label, 'Club Page');

    // Verify CalendarView renders Original Post in BOTH compact (Upcoming Schedule) and full Calendar modes
    const calCode = fs.readFileSync(path.join(SRC_DIR, 'components/CalendarView.jsx'), 'utf8');
    const appCode = fs.readFileSync(path.join(SRC_DIR, 'App.jsx'), 'utf8');

    assert.match(calCode, /const postLink = resolveSchedulePostLink\(item\)/);
    assert.equal(
      calCode.includes('!compact && item.permalink'),
      false,
      'Upcoming Schedule (compact CalendarView) must not hide original post links behind !compact'
    );
    assert.match(appCode, /formatScheduleItem\(e,\s*i,\s*hub\)/);

    // Verify every exported event in public/clubhub-data.json is an actual event and has a permalink
    const snapshotPath = path.resolve(__dirname, '../public/clubhub-data.json');
    if (fs.existsSync(snapshotPath)) {
      const snap = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
      const postsById = new Map((snap.posts || []).map(p => [String(p.id), p]));
      assert.ok(snap.events.length > 0, 'Expected events in public/clubhub-data.json');
      for (const ev of snap.events) {
        const post = ev.postId ? postsById.get(String(ev.postId)) : null;
        assert.equal(
          isActualClubEvent(ev, { post, caption: post?.caption || '', postedAt: post?.postedAt }),
          true,
          `Non-event leaked into public/clubhub-data.json: ${ev.id} (${ev.title})`
        );
        assert.ok(ev.permalink, `Event ${ev.id} in public/clubhub-data.json is missing permalink`);
      }
    }
  });

  it('supports proper AI Overview search: negations, multi-turn overrides, upcoming events, and anti-hallucination grounding', () => {
    const sampleClubs = [
      {
        id: 'gdgc_ucsc',
        name: 'Google Developer Group on Campus UCSC',
        category: 'tech & science',
        categoryLabel: 'Tech & Science',
        description: 'Open to all levels! Workshops, AI sprints, and hackathons.',
        members: 210,
        joined: true,
      },
      {
        id: 'gdacollab',
        name: 'Game Design & Art Collaborations',
        category: 'media & arts',
        categoryLabel: 'Media & Arts',
        description: 'Beginner-friendly student game jams blending coding, art, and music.',
        members: 185,
        joined: false,
      },
      {
        id: 'ucscsps',
        name: 'Society of Physics Students',
        category: 'tech & science',
        categoryLabel: 'Tech & Science',
        description: 'Undergraduate physics, astrophysics, and hardware lab community.',
        members: 95,
        joined: false,
      },
      {
        id: 'theta_tau_demo',
        name: 'Alpha Beta Fraternity',
        category: 'greek',
        categoryLabel: 'Greek Life',
        description: 'Campus Greek life chapter with coding and social events.',
        members: 130,
        joined: false,
      },
    ];

    const sampleEvents = [
      {
        id: 'ev_gda_jam',
        clubId: 'gdacollab',
        club: 'Game Design & Art Collaborations',
        event: 'Fall Game Jam Kickoff',
        day: 'Thu',
        date: 'Nov 19',
        time: '6:00 PM',
      },
    ];

    // 1. Natural-language negation ("no Greek life") + modifier ("beginner friendly")
    const parsed = parseQueryIntent('beginner friendly coding and art clubs, no Greek life');
    assert.equal(parsed.prefersBeginner, true);
    assert.equal(parsed.excludedCategories.includes('greek'), true);

    const rag = recommendClubsForInterests(
      sampleClubs,
      'beginner friendly coding and art clubs, no Greek life',
      { maxResults: 5, events: sampleEvents }
    );
    assert.equal(
      rag.matches.some(m => m.club.id === 'theta_tau_demo'),
      false,
      'Negated Greek life category must be strictly excluded'
    );
    assert.ok(rag.aiOverview.includes('Game Design & Art Collaborations'));
    assert.ok(rag.interpretedIntents.some(i => i.kind === 'exclusion' && /No Greek Life/i.test(i.label)));
    assert.equal(rag.relatedEvents[0]?.id, 'ev_gda_jam');

    // 2. Multi-turn refinement override ("coding or physics" -> "no coding, exclude joined clubs")
    const multiTurnQuery = buildConversationalQuery([
      'coding or physics clubs',
      'no coding, exclude joined clubs',
    ]);
    const refined = recommendClubsForInterests(sampleClubs, multiTurnQuery, { maxResults: 5 });
    assert.equal(refined.matches[0]?.club.id, 'ucscsps');
    assert.equal(
      refined.matches.some(m => m.club.id === 'gdgc_ucsc'),
      false,
      'Multi-turn negation + excludeJoined must filter out earlier-turn coding & joined clubs'
    );

    // 3. Anti-hallucination validation on Gemini 4 structured output
    const merged = mergeGenerativeWithRag({
      clubs: sampleClubs,
      ragResult: rag,
      llmPayload: {
        interactionId: 'int_test_123',
        model: 'gemini-4-hydrogen',
        result: {
          overview: 'Game Design & Art Collaborations is your best creative coding match.',
          interpretedIntents: [{ label: 'Creative Tech', kind: 'topic' }],
          recommendations: [
            {
              clubId: 'hallucinated_fake_club_999',
              matchScore: 99,
              matchLabel: 'Best Fit',
              rationale: 'Should be stripped!',
              highlightTags: ['fake'],
            },
            {
              clubId: 'theta_tau_demo',
              matchScore: 95,
              matchLabel: 'Best Fit',
              rationale: 'Excluded Greek category must also be stripped!',
              highlightTags: ['greek'],
            },
            {
              clubId: 'gdacollab',
              matchScore: 96,
              matchLabel: 'Best Fit',
              rationale: 'Blends coding and visual art with Fall Game Jam Kickoff.',
              highlightTags: ['game dev', 'art'],
            },
          ],
          followUpSuggestions: [{ label: '📅 Upcoming events', appendQuery: 'with upcoming events' }],
        },
      },
    });

    assert.equal(merged.mode, 'gemini-4');
    assert.equal(merged.matches.length, 1, 'Hallucinated and excluded clubIds must be rejected');
    assert.equal(merged.matches[0].club.id, 'gdacollab');
    assert.equal(merged.matches[0].nextEvent?.id, 'ev_gda_jam');
  });

  it('prevents unauthenticated /auth/me 401s, refreshes stale sessions on 401, and normalizes poll creation responses', async () => {
    const prevWindow = globalThis.window;
    const prevFetch = globalThis.fetch;
    const calls = [];

    try {
      globalThis.window = {
        location: {
          hostname: 'localhost',
          port: '3001',
          origin: 'http://localhost:3001',
          protocol: 'http:',
        },
      };

      globalThis.fetch = async (url, init = {}) => {
        const u = String(url);
        calls.push({ url: u, method: init.method || 'GET', auth: init.headers?.Authorization || '' });
        const jsonRes = (status, obj) => ({
          ok: status >= 200 && status < 300,
          status,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => obj,
        });

        if (u.endsWith('/api/health')) {
          return jsonRes(200, { status: 'ok' });
        }
        if (u.endsWith('/api/workspace/auth/sync-external')) {
          return jsonRes(200, { ok: true, token: 'ch_sess_refreshed_token' });
        }
        if (u.endsWith('/api/scheduler/polls') && (init.method || 'GET') === 'POST') {
          if (init.headers?.Authorization !== 'Bearer ch_sess_refreshed_token') {
            return jsonRes(401, { error: 'Authentication required.' });
          }
          // Express returns top-level poll object without `.data` wrapper
          return jsonRes(201, { id: 'poll_live_1', title: 'Board Sync', dates: ['2027-05-10'] });
        }
        return jsonRes(404, { error: 'Not found' });
      };

      const { setApiSessionToken } = await import('../src/api/client.js');
      const { getWorkspaceMe, createVerifiedPoll } = await import('../src/api/workspaceClient.js');

      // 1. Unauthenticated guest -> zero network requests to /api/workspace/auth/me
      setApiSessionToken('');
      const unauthRes = await getWorkspaceMe();
      assert.equal(unauthRes.ok, false);
      assert.equal(unauthRes.unauthenticated, true);
      assert.equal(
        calls.some(c => c.url.includes('/workspace/auth/me')),
        false,
        'getWorkspaceMe() must not hit /api/workspace/auth/me when no session or Clerk user exists'
      );

      // 2. Stale ch_sess_ token -> auto-refreshes via Clerk fallbackUser on 401 and normalizes res.data.id
      setApiSessionToken('ch_sess_stale_after_restart');
      const created = await createVerifiedPoll(
        { title: 'Board Sync', dates: ['2027-05-10'] },
        { id: 'user_clerk_test_1', email: 'officer@ucsc.edu', fullName: 'Test Officer' }
      );
      assert.equal(created.ok, true);
      assert.equal(created.id, 'poll_live_1');
      assert.equal(created.data?.id, 'poll_live_1');
      assert.equal(created.poll?.id, 'poll_live_1');
      setApiSessionToken('');
    } finally {
      globalThis.window = prevWindow;
      globalThis.fetch = prevFetch;
    }
  });
});
