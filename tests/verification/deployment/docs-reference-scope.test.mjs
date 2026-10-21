import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';

test('historical review prose is scoped while broken links and current source claims still fail', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-reference-scope-'));
  try {
    fs.mkdirSync(path.join(root, 'scripts/lib'), { recursive: true });
    fs.mkdirSync(path.join(root, 'docs/review'), { recursive: true });
    fs.mkdirSync(path.join(root, 'docs/site'), { recursive: true });
    const checker = path.join(root, 'scripts/docs-check-refs.mjs');
    fs.copyFileSync(new URL('../../../scripts/docs-check-refs.mjs', import.meta.url), checker);
    fs.copyFileSync(new URL('../../../scripts/lib/docs-markdown-anchors.mjs', import.meta.url),
      path.join(root, 'scripts/lib/docs-markdown-anchors.mjs'));
    fs.symlinkSync(path.resolve(import.meta.dirname, '../../../node_modules'), path.join(root, 'node_modules'), 'dir');
    fs.writeFileSync(path.join(root, 'package.json'), '{}\n');
    const review = path.join(root, 'docs/review/snapshot.md');
    const current = path.join(root, 'docs/site/current.md');
    const run = () => spawnSync(process.execPath, [checker], { encoding: 'utf8' });
    fs.writeFileSync(review, 'Historical location: `skills/retired/source.ts`.');
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'Docs Test'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'docs-test@example.invalid'], { cwd: root });
    execFileSync('git', ['add', 'scripts', 'docs', 'package.json'], { cwd: root });
    execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: root });
    assert.equal(run().status, 0);
    fs.appendFileSync(review, '\n[Missing evidence](missing.txt)');
    let result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /links to missing local path: \[Missing evidence\]\(missing\.txt\)/u);
    fs.writeFileSync(path.join(root, 'docs/review/missing.txt'), 'retained evidence');
    assert.equal(run().status, 0);
    fs.writeFileSync(current, 'Current source: `skills/retired/source.ts`.');
    result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cites missing repository path: skills\/retired\/source.ts/u);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
