import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Inventory} from '../../../../scripts/observability-retirement/files.mjs';

test('independent final verification reads no more than original bytes when real file grows after descriptor check', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-bound-review-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'data'); fs.writeFileSync(file, 'original');
  const inventory = new Inventory({ maximumFiles: 1, maximumTotalBytes: 8, maximumSnapshotBytes: 8 });
  inventory.root(root, 'review');
  const old = fs.statSync(file), realStat = fs.fstatSync, realRead = fs.readSync;
  let injected = false, bytesRead = 0, largestRequest = 0;
  const selected = stat => stat.dev === old.dev && stat.ino === old.ino;
  t.mock.method(fs, 'fstatSync', (...args) => {
    const stat = realStat(...args);
    if (selected(stat) && !injected) { injected = true; fs.appendFileSync(file, 'x'.repeat(65536)); }
    return stat;
  });
  t.mock.method(fs, 'readSync', (...args) => {
    const chosen = selected(realStat(args[0]));
    if (chosen) largestRequest = Math.max(largestRequest, args[3]);
    const count = realRead(...args); if (chosen) bytesRead += count; return count;
  });
  inventory.verifyUnchanged();
  assert.equal(injected, true);
  assert.equal(fs.statSync(file).size, 65544, 'growth changed actual file bytes');
  assert.ok(inventory.blockers.some(item => item.code === 'SNAPSHOT_CHANGED'));
  assert.equal(bytesRead, 8);
  assert.ok(largestRequest <= 8);
  assert.equal(inventory.bytesHashed, 8, 'scan metric unchanged');
  t.diagnostic(JSON.stringify({ originalBytes: 8, actualBytesAfterGrowth: 65544, bytesRead, largestRequest }));
});

test('independent empty inventoried file remains valid with exact-size reader', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-empty-review-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'empty'), '');
  const inventory = new Inventory({ maximumFiles: 1, maximumTotalBytes: 1, maximumSnapshotBytes: 1 });
  inventory.root(root, 'review'); inventory.verifyUnchanged();
  assert.deepEqual(inventory.blockers, []);
  assert.equal(inventory.bytesHashed, 0);
});
