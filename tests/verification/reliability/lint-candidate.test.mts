import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { withLintCandidate } from '../../../skills/nova/plugins/lint/src/candidate.ts';

test('lint candidate reads the committed defect despite newer HEAD and cleans up after tool failure', async () => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-source-'));
  const git = (args: string[]) => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim();
  let snapshot = '';
  try {
    git(['init', '-q']);
    fs.writeFileSync(path.join(repository, 'main.sh'), '#!/bin/sh\necho "$missing"\n');
    git(['add', '.']);
    git(['-c', 'user.name=Lint', '-c', 'user.email=lint@example.invalid', 'commit', '-qm', 'defect']);
    const broken = git(['rev-parse', 'HEAD']);
    fs.writeFileSync(path.join(repository, 'main.sh'), '#!/bin/sh\nprintf "fixed\\n"\n');
    git(['add', '.']);
    git(['-c', 'user.name=Lint', '-c', 'user.email=lint@example.invalid', 'commit', '-qm', 'repair']);
    const current = git(['rev-parse', 'HEAD']);
    await withLintCandidate(repository, broken, async root => {
      snapshot = root;
      assert.match(fs.readFileSync(path.join(root, 'main.sh'), 'utf8'), /missing/);
      // Execute the actual selected shell program with unset-variable checks.
      assert.throws(() => execFileSync('sh', ['-u', 'main.sh'], { cwd: root, stdio: 'pipe' }), /Command failed/);
    });
    assert.equal(fs.existsSync(snapshot), false);
    await assert.rejects(() => withLintCandidate(repository, broken, async root => {
      snapshot = root;
      execFileSync('sh', ['-u', 'main.sh'], { cwd: root, stdio: 'pipe' });
    }), /Command failed/);
    assert.equal(fs.existsSync(snapshot), false);
    await withLintCandidate(repository, current, async root => {
      assert.equal(execFileSync('sh', ['-u', 'main.sh'], { cwd: root, encoding: 'utf8' }), 'fixed\n');
    });
    assert.equal(git(['rev-parse', 'HEAD']), current);
    assert.equal(git(['status', '--porcelain']), '');
    await assert.rejects(() => withLintCandidate(repository, 'HEAD', async () => {}), /SOURCE_REVISION_INVALID/);
  } finally { fs.rmSync(repository, { recursive: true, force: true }); }
});
