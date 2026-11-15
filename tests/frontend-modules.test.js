import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from '@babel/core';
import { resolveDeduplicatedTargets } from '../src/utils/leadershipShortcuts.js';

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
});
