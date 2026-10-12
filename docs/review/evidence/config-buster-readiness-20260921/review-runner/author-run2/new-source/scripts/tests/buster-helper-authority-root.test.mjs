import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { prepareBusterRuntimeConfigRoot } from '../buster-runtime-config-root.mjs';

function serviceWrite(target) {
  return spawnSync(process.execPath, ['-e', 'require("node:fs").writeFileSync(process.argv[1], "attacker")', target],
    { uid: 1000, gid: 1000, encoding: 'utf8' });
}

test('real UID1000 cannot replace fixed root configuration, ancestors or a representative root-owned module', t => {
  assert.equal(process.getuid(), 0, 'run this mandatory privilege test in the disposable native guest');
  const base = fs.mkdtempSync('/run/buster-authority-');
  fs.chmodSync(base, 0o755);
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const config = prepareBusterRuntimeConfigRoot(base);
  for (const name of ['platform.json', 'runtime.json', 'kubeconfig', 'buildkit.toml', 'buildkit.log']) {
    const file = path.join(config, name);
    fs.writeFileSync(file, 'original', { mode: 0o640 });
    fs.chownSync(file, 0, 1000);
    assert.notEqual(serviceWrite(file).status, 0);
    assert.equal(fs.readFileSync(file, 'utf8'), 'original');
  }
  const renamed = spawnSync(process.execPath, ['-e',
    'require("node:fs").renameSync(process.argv[1], process.argv[1]+"-attacker")', config], { uid: 1000, gid: 1000 });
  assert.notEqual(renamed.status, 0);
  const code = path.join(base, 'parent.mjs');
  fs.writeFileSync(code, 'original', { mode: 0o644 });
  assert.notEqual(serviceWrite(code).status, 0);
  assert.notEqual(serviceWrite(path.join(base, 'replacement.mjs')).status, 0);
  assert.equal(prepareBusterRuntimeConfigRoot(base), config);
  fs.unlinkSync(path.join(config, 'buildkit.log'));
  fs.symlinkSync(code, path.join(config, 'buildkit.log'));
  assert.throws(() => prepareBusterRuntimeConfigRoot(base), /BUSTER_CONFIG_FILE_NOT_TRUSTED/u);
  assert.equal(fs.readFileSync(code, 'utf8'), 'original');
  fs.unlinkSync(path.join(config, 'buildkit.log'));
  fs.chownSync(base, 1000, 1000);
  assert.throws(() => prepareBusterRuntimeConfigRoot(base), /BUSTER_CONFIG_ANCESTOR_NOT_TRUSTED/u);
  fs.chownSync(base, 0, 0);
});

test('real file-cap helper has the fixed browser identity and no remaining capabilities', t => {
  assert.equal(process.getuid(), 0, 'requires a disposable native guest with file capabilities');
  const binary = process.env.BUSTER_RESTRICTED_HELPER;
  assert.ok(binary, 'provide the freshly built restricted helper copied into a root-owned guest directory');
  const stat = fs.statSync(binary);
  assert.equal(stat.uid, 0);
  assert.equal(stat.mode & 0o022, 0);
  assert.equal(stat.gid, 1000);
  assert.equal(stat.mode & 0o777, 0o750, 'use the actual image installation permissions');
  const capability = spawnSync('getcap', [binary], { encoding: 'utf8' });
  assert.equal(capability.status, 0, capability.stderr);
  assert.match(capability.stdout, /cap_setgid,cap_setuid=ep|cap_setuid,cap_setgid=ep/u);
  const root = fs.mkdtempSync('/run/buster-cgroup-sentinel-');
  fs.chmodSync(root, 0o777);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const name of ['cgroup.procs', 'cgroup.kill']) {
    const file = path.join(root, name);
    fs.writeFileSync(file, 'sentinel', { mode: 0o666 });
    fs.chmodSync(file, 0o666);
  }
  for (const uid of [0, 1001, 1003, 1004]) {
    const caller = spawnSync(binary, ['--page-size'], { uid, gid: 1000, encoding: 'utf8' });
    assert.equal(caller.status, 77, caller.stderr);
    assert.match(caller.stderr, /BUSTER_SANDBOX_CALLER_DENIED/u);
  }
  // A root-started setpriv may retain effective DAC override until exec. Use
  // an ordinary caller and prove its credentials before testing the file ACL.
  for (const uid of [1003, 1004]) {
    const inaccessible = spawnSync(process.execPath, ['scripts/tests/fixtures/buster-unprivileged-caller.mjs', binary],
      { uid, gid: uid, encoding: 'utf8', timeout: 15000, maxBuffer: 131072 });
    assert.equal(inaccessible.status, 0, inaccessible.stderr);
    const observed = JSON.parse(inaccessible.stdout);
    assert.match(observed.status, new RegExp(`^Uid:\\s+${uid}\\s+${uid}\\s+${uid}\\s+${uid}$`, 'mu'));
    assert.match(observed.status, new RegExp(`^Gid:\\s+${uid}\\s+${uid}\\s+${uid}\\s+${uid}$`, 'mu'));
    assert.match(observed.status, /^Groups:[ \t]*$/mu);
    for (const field of ['CapInh', 'CapPrm', 'CapEff', 'CapAmb']) assert.match(observed.status, new RegExp(`^${field}:\\s+0+$`, 'mu'));
    assert.equal(observed.child.error, 'EACCES');
    assert.equal(observed.child.status, null);
    assert.equal(observed.child.signal, null);
  }
  for (const target of [0, 1003, 1004]) {
    const rejected = spawnSync(binary, ['67108864', '2', '64', '--run-as-uid', String(target),
      '--run-as-gid', '1000', '--cgroup', root, '--child-cgroup', root, '/bin/true'],
    { uid: 1000, gid: 1000, encoding: 'utf8' });
    assert.equal(rejected.status, 77, rejected.stderr);
  }
  for (const name of ['cgroup.procs', 'cgroup.kill']) assert.equal(fs.readFileSync(path.join(root, name), 'utf8'), 'sentinel');
  const allowed = spawnSync(binary, ['67108864', '2', '64', '--run-as-gid', '1000',
    '--run-as-uid', '1001', '/bin/cat', '/proc/self/status'], { uid: 1000, gid: 1000, encoding: 'utf8' });
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.match(allowed.stdout, /^Uid:\s+1001\s+1001\s+1001\s+1001$/mu);
  assert.match(allowed.stdout, /^Gid:\s+1000\s+1000\s+1000\s+1000$/mu);
  assert.match(allowed.stdout, /^Groups:[ \t]*$/mu);
  for (const field of ['CapInh', 'CapPrm', 'CapEff', 'CapAmb']) assert.match(allowed.stdout, new RegExp(`^${field}:\\s+0+$`, 'mu'));
  assert.match(allowed.stdout, /^NoNewPrivs:\s+1$/mu);
});
