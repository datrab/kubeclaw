import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { busterSubordinateIds } from '../buster-subordinate-ids.mjs';

test('subordinate identities normalize inherited builder aliases and reject unsafe authority', () => {
  const canonical = 'builder:100000:65536\n';
  assert.equal(busterSubordinateIds(''), canonical);
  assert.equal(busterSubordinateIds('node:100000:65536\n01000:100000:65536\n'), canonical);
  assert.equal(busterSubordinateIds('suite:200000:65536\n'), `suite:200000:65536\n${canonical}`);
  for (const input of [
    'builder:200000:65536', 'other:0:1', 'other:1003:1', 'other:1004:1', 'other:999:10',
    'other:1004:0', 'other:4294967294:2', 'other:9007199254740992:1',
    'other:120000:1', 'other:200000:100\nsecond:200099:20',
    '4294967295:200000:1', 'other:not-a-number:1',
  ]) assert.throws(() => busterSubordinateIds(input), /BUSTER_SUBORDINATE/u, input);
});

test('subordinate file validation rejects both before altering either original', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-subids-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const uid = path.join(root, 'subuid');
  const gid = path.join(root, 'subgid');
  fs.writeFileSync(uid, 'node:100000:65536\n');
  fs.writeFileSync(gid, 'builder:0:65536\n');
  const result = spawnSync(process.execPath, ['scripts/buster-subordinate-ids.mjs', uid, gid]);
  assert.equal(result.status, 1);
  assert.equal(fs.readFileSync(uid, 'utf8'), 'node:100000:65536\n');
  assert.equal(fs.readFileSync(gid, 'utf8'), 'builder:0:65536\n');
});

test('actual restricted helper rejects identity requests before touching cgroup sentinels', t => {
  assert.equal(process.getuid(), 1000, 'this caller-boundary test runs as the actual service UID');
  assert.equal(process.getgid(), 1000);
  const executable = path.resolve(process.env.BUSTER_RESTRICTED_HELPER ?? 'node_modules/.cache/buster-helper-authority/restricted');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-helper-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const procs = path.join(root, 'cgroup.procs');
  const kill = path.join(root, 'cgroup.kill');
  fs.writeFileSync(procs, 'unchanged-procs');
  fs.writeFileSync(kill, 'unchanged-kill');
  const page = spawnSync(executable, ['--page-size'], { encoding: 'utf8' });
  assert.equal(page.status, 0, page.stderr);
  assert.match(page.stdout, /^[1-9][0-9]*\n$/u);
  const rejected = [
    [], ['--run-as-uid', '1001'], ['--run-as-gid', '1000'],
    ['--run-as-uid', '0', '--run-as-gid', '0'],
    ['--run-as-gid', '1003', '--run-as-uid', '1003'],
    ['--run-as-gid', '1004', '--run-as-uid', '1004'],
    ['--run-as-uid', '1002', '--run-as-gid', '1000'],
    ['--run-as-uid', '1001', '--run-as-gid', '1001'],
    ['--run-as-uid', '1001', '--run-as-uid', '1001', '--run-as-gid', '1000'],
    ['--run-as-gid', '1000', '--run-as-gid', '1000', '--run-as-uid', '1001'],
  ];
  for (const flags of rejected) {
    const result = spawnSync(executable, ['67108864', '2', '64', ...flags,
      '--cgroup', root, '--child-cgroup', root, '/bin/true'], { encoding: 'utf8' });
    assert.equal(result.status, 77, `${flags.join(' ')}: ${result.stderr}`);
    assert.match(result.stderr, /BUSTER_SANDBOX_IDENTITY_DENIED/u);
    assert.equal(fs.readFileSync(procs, 'utf8'), 'unchanged-procs');
    assert.equal(fs.readFileSync(kill, 'utf8'), 'unchanged-kill');
  }
});
