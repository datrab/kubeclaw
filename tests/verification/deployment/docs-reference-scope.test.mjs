import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('historical review prose is scoped while broken links and current source claims still fail', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-reference-scope-'));
  try {
    fs.mkdirSync(path.join(root, 'scripts'));
    fs.mkdirSync(path.join(root, 'docs/review'), { recursive: true });
    fs.mkdirSync(path.join(root, 'docs/site'), { recursive: true });
    const checker = path.join(root, 'scripts/docs-check-refs.mjs');
    fs.copyFileSync(new URL('../../../scripts/docs-check-refs.mjs', import.meta.url), checker);
    fs.copyFileSync(new URL('../../../scripts/docs-review-snapshots.mjs', import.meta.url), path.join(root, 'scripts/docs-review-snapshots.mjs'));
    const review = path.join(root, 'docs/review/snapshot.md');
    const current = path.join(root, 'docs/site/current.md');
    const run = () => spawnSync(process.execPath, [checker], { encoding: 'utf8' });
    fs.writeFileSync(review, 'Historical location: `skills/retired/source.ts`.');
    assert.equal(run().status, 0);
    fs.appendFileSync(review, '\n[Missing evidence](missing.txt)');
    let result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /links to missing local path: missing.txt/u);
    fs.writeFileSync(path.join(root, 'docs/review/missing.txt'), 'retained evidence');
    assert.equal(run().status, 0);
    fs.writeFileSync(current, 'Current source: `skills/retired/source.ts`.');
    result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cites missing repository path: skills\/retired\/source.ts/u);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('partial captured source pages are hash-bound while links to them and active reports remain checked', async () => {
  const {createHash} = await import('node:crypto');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-snapshot-scope-'));
  try {
    fs.mkdirSync(path.join(root, 'scripts'));
    for (const file of ['docs-check-refs.mjs','docs-review-snapshots.mjs']) fs.copyFileSync(new URL(`../../../scripts/${file}`, import.meta.url), path.join(root,'scripts',file));
    const relative='docs/review/evidence/captured/source/docs/old.md';
    const snapshot=path.join(root,relative);fs.mkdirSync(path.dirname(snapshot),{recursive:true});fs.writeFileSync(snapshot,'[Uncaptured historical sibling](old-sibling.md)');
    const run=()=>spawnSync(process.execPath,[path.join(root,'scripts/docs-check-refs.mjs')],{encoding:'utf8'});
    assert.equal(run().status,1,'unregistered missing links must still fail');
    const index={schemaVersion:'documentation-source-snapshots.v1',files:[{path:relative,sha256:createHash('sha256').update(fs.readFileSync(snapshot)).digest('hex')}]};
    fs.writeFileSync(path.join(root,'docs/review/source-snapshots.json'),JSON.stringify(index));
    fs.writeFileSync(path.join(root,'docs/review/report.md'),'[Original captured source](evidence/captured/source/docs/old.md)');
    assert.equal(run().status,0);
    fs.writeFileSync(path.join(root,'docs/review/report.md'),'[Missing current evidence](missing.json)');
    assert.equal(run().status,1,'review links outside source snapshots must still fail');
    fs.writeFileSync(path.join(root,'docs/review/report.md'),'[Original captured source](evidence/captured/source/docs/old.md)');
    fs.appendFileSync(snapshot,'modified');const changed=run();assert.equal(changed.status,1);assert.match(changed.stderr,/DOC_SNAPSHOT_CHANGED/);
    fs.unlinkSync(snapshot);assert.equal(run().status,1,'missing captured source must fail');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
