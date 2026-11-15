import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from '@babel/core';
import { resolveDeduplicatedTargets } from '../src/utils/leadershipShortcuts.js';
import { recommendClubsForInterests } from '../src/utils/aiClubAgent.js';
import { filterAndRankBySearch, matchesSearchQuery } from '../src/utils/search.js';

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
});
