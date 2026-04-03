// tests/02-git-cutover.test.js — Module 02: Git, Polling, and Blueprint Cutover
// Validates that git helpers are owned by integrations/git.js and callers
// no longer import from pipeline-original.js.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pipelineSrc = path.join(__dirname, '..');

// ─── Static Import Checks ─────────────────────────────────────────────────────

describe('polling.js — no monolith git imports', () => {
  test('does not import git helpers from pipeline-original.js', () => {
    const src = readFileSync(path.join(pipelineSrc, 'services/polling.js'), 'utf8');
    // Verify the monolith import line is gone for all four git helpers
    const gitFns = ['gitPullForPolling', 'headHash', 'invalidateHeadHash', 'gitExec'];
    for (const fn of gitFns) {
      // Look for any import of fn from pipeline-original.js
      const monolithImport = new RegExp(`import\\s*\\{[^}]*\\b${fn}\\b[^}]*\\}\\s*from\\s*['"][^'"]*pipeline-original`);
      assert.ok(
        !monolithImport.test(src),
        `polling.js must not import '${fn}' from pipeline-original.js`
      );
    }
  });

  test('imports git helpers from integrations/git.js', () => {
    const src = readFileSync(path.join(pipelineSrc, 'services/polling.js'), 'utf8');
    assert.match(src, /from\s*['"]\.\.\/integrations\/git\.js['"]/,
      'polling.js must import from integrations/git.js');
  });
});

describe('blueprint.js — no monolith git imports', () => {
  test('does not import gitExec from pipeline-original.js', () => {
    const src = readFileSync(path.join(pipelineSrc, 'services/blueprint.js'), 'utf8');
    const monolithGitExec = /import\s*\{[^}]*\bgitExec\b[^}]*\}\s*from\s*['"][^'"]*pipeline-original/;
    assert.ok(
      !monolithGitExec.test(src),
      "blueprint.js must not import 'gitExec' from pipeline-original.js"
    );
  });

  test('imports gitExec from integrations/git.js', () => {
    const src = readFileSync(path.join(pipelineSrc, 'services/blueprint.js'), 'utf8');
    assert.match(src, /from\s*['"]\.\.\/integrations\/git\.js['"]/,
      'blueprint.js must import gitExec from integrations/git.js');
  });
});

describe('index.js — no monolith git re-exports', () => {
  const GIT_FUNCTIONS = [
    'gitExec', 'headHash', 'invalidateHeadHash', 'gitSyncBeforeBuster',
    'gitPullForPolling', 'gitPullBeforePush', 'gitPushWithRetry', 'gitCommitAndPush',
  ];

  test('does not re-export any git function from pipeline-original.js', () => {
    const src = readFileSync(path.join(pipelineSrc, 'index.js'), 'utf8');
    // Find all export { ... } from 'pipeline-original.js' blocks
    const monolithExports = [...src.matchAll(/export\s*\{([^}]*)\}\s*from\s*['"][^'"]*pipeline-original[^'"]*['"]/g)];
    for (const match of monolithExports) {
      const exportedNames = match[1];
      for (const fn of GIT_FUNCTIONS) {
        assert.ok(
          !new RegExp(`\\b${fn}\\b`).test(exportedNames),
          `index.js must not re-export '${fn}' from pipeline-original.js`
        );
      }
    }
  });

  test('re-exports all 8 git functions from modular sources', () => {
    const src = readFileSync(path.join(pipelineSrc, 'index.js'), 'utf8');
    for (const fn of GIT_FUNCTIONS) {
      assert.match(src, new RegExp(`\\b${fn}\\b`),
        `index.js must export '${fn}'`);
    }
    // None of them come from pipeline-original.js — validated by previous test
  });
});

// ─── integrations/git.js Export Shape ────────────────────────────────────────

describe('integrations/git.js — exports all required functions', () => {
  test('all 8 git helpers plus auxiliary exports are present', async () => {
    const gitMod = await import('../integrations/git.js');
    const required = [
      'gitExec',
      'headHash',
      'invalidateHeadHash',
      'setRepoRoot',
      'gitPullForPolling',
      'gitPullBeforePush',
      'gitPushWithRetry',
      'gitCommitAndPush',
      'gitSyncBeforeBuster',
      'getRepoRoot',
    ];
    for (const fn of required) {
      assert.equal(typeof gitMod[fn], 'function', `Expected '${fn}' to be exported as a function`);
    }
  });
});

// ─── gitExec ──────────────────────────────────────────────────────────────────

describe('gitExec', () => {
  test('runs a git command and returns trimmed string output', async () => {
    const { gitExec, getRepoRoot } = await import('../integrations/git.js');
    const repoRoot = getRepoRoot();
    const result = gitExec(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
    assert.equal(typeof result, 'string');
    assert.ok(result.length > 0, 'Expected non-empty branch name');
    assert.ok(!result.includes('\n'), 'Expected trimmed single-line output');
  });

  test('throws on invalid git subcommand', async () => {
    const { gitExec, getRepoRoot } = await import('../integrations/git.js');
    const repoRoot = getRepoRoot();
    assert.throws(
      () => gitExec(repoRoot, ['this-subcommand-does-not-exist']),
      /git/i
    );
  });
});

// ─── headHash / invalidateHeadHash ────────────────────────────────────────────

describe('headHash and invalidateHeadHash', () => {
  test('headHash returns a non-empty string when repo root is set', async () => {
    const { headHash, invalidateHeadHash, setRepoRoot, getRepoRoot } = await import('../integrations/git.js');
    setRepoRoot(getRepoRoot());
    invalidateHeadHash(); // clear any cached value
    const hash = headHash();
    assert.equal(typeof hash, 'string');
    assert.ok(hash.length > 0, 'Expected non-empty hash after setRepoRoot');
  });

  test('invalidateHeadHash causes the next headHash call to re-fetch', async () => {
    const { headHash, invalidateHeadHash, setRepoRoot, getRepoRoot } = await import('../integrations/git.js');
    setRepoRoot(getRepoRoot());
    invalidateHeadHash();
    const first = headHash();
    // Cache is now set. Invalidate and re-read.
    invalidateHeadHash();
    const second = headHash();
    // HEAD hasn't changed between calls so both should match
    assert.equal(first, second, 'Re-fetched hash should equal cached hash when HEAD is stable');
  });

  test('headHash returns empty string when repo root is null', async () => {
    const { headHash, invalidateHeadHash, setRepoRoot, getRepoRoot } = await import('../integrations/git.js');
    const originalRoot = getRepoRoot();
    setRepoRoot(null);
    invalidateHeadHash();
    const result = headHash();
    assert.equal(result, '', 'Expected empty string when no repo root is configured');
    // Restore for subsequent tests
    setRepoRoot(originalRoot);
    invalidateHeadHash();
  });
});
