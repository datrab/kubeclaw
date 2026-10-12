import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

const restricted = '/opt/ha-proof/restricted';
const old = '/opt/ha-proof/old-filecap-helper';
const generic = '/opt/ha-proof/generic';
const args = ['67108864', '2', '64'];

test('actual preparation UID permission boundary rejects service access and old helper breaks it', t => {
  assert.equal(process.getuid(), 0);
  const base = fs.mkdtempSync('/run/ha-source-');
  fs.chmodSync(base, 0o755);
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const source = `${base}/source`;
  fs.mkdirSync(source, { mode: 0o700 });
  fs.chownSync(source, 1003, 1003);
  const sentinel = `${source}/sentinel`;
  fs.writeFileSync(sentinel, 'owned-source', { mode: 0o600 });
  fs.chownSync(sentinel, 1003, 1003);
  const actualOwner = spawnSync('/bin/cat', [sentinel], { uid: 1003, gid: 1003, encoding: 'utf8' });
  assert.equal(actualOwner.status, 0, actualOwner.stderr);
  assert.equal(actualOwner.stdout, 'owned-source');
  const denied = spawnSync('/bin/cat', [sentinel], { uid: 1000, gid: 1000, encoding: 'utf8' });
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /Permission denied/u);
  const command = [...args, '--run-as-uid', '1003', '--run-as-gid', '1003', '/bin/cat', sentinel];
  const guarded = spawnSync(restricted, command, { uid: 1000, gid: 1000, encoding: 'utf8' });
  assert.equal(guarded.status, 77, guarded.stderr);
  assert.match(guarded.stderr, /BUSTER_SANDBOX_IDENTITY_DENIED/u);
  const vulnerable = spawnSync(old, command, { uid: 1000, gid: 1000, encoding: 'utf8' });
  assert.equal(vulnerable.status, 0, vulnerable.stderr);
  assert.equal(vulnerable.stdout, 'owned-source', 'old file-cap helper defeats the same actual permission boundary');
});

test('generic helper remains unprivileged and executes the original same-identity command', () => {
  const capabilities = spawnSync('getcap', [generic], { encoding: 'utf8' });
  assert.equal(capabilities.status, 0, capabilities.stderr);
  assert.equal(capabilities.stdout, '');
  const result = spawnSync(generic, [...args, '/bin/cat', '/proc/self/status'], { uid: 1000, gid: 1000, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Uid:\s+1000\s+1000\s+1000\s+1000$/mu);
  assert.match(result.stdout, /^CapEff:\s+0+$/mu);
});
