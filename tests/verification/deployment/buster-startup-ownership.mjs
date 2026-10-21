// Run in the existing Buster image as its restricted root supervisor. Uses only
// temporary fixtures, never the real job store, result archive, or cgroups.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

assert.equal(process.getuid(), 0);
const launcher = fs.readFileSync(process.argv[2], 'utf8');
const original = fs.readFileSync('/usr/local/bin/buster-runtime-entrypoint', 'utf8');
const ownership = original.split('\n').find(line => line === 'chown -R builder:builder "$plan_state_dir" "$plan_run_dir"');
assert.ok(ownership, 'exercise the affected pinned image');
const root = fs.mkdtempSync('/tmp/buster-startup-ownership-');
fs.chmodSync(root, 0o755);
const state = path.join(root, 'state'), runs = path.join(root, 'runs');
const privateDir = path.join(runs, 'existing', 'observability', 'report-adapters');
fs.mkdirSync(state); fs.mkdirSync(privateDir, {recursive: true});
fs.chmodSync(privateDir, 0o700); fs.chownSync(privateDir, 1000, 1000);
const artifact = path.join(privateDir, 'result.json');
spawnSync('setpriv', ['--reuid=1000', '--regid=1000', '--init-groups', 'node', '-e',
  'require("fs").writeFileSync(process.argv[1],"immutable result",{mode:0o600})', artifact], {stdio: 'inherit'});
const source = path.join(root, 'entrypoint');
const patchedLauncher = path.join(root, 'launcher.sh');
fs.writeFileSync(patchedLauncher, launcher.replace("'/usr/local/bin/buster-runtime-entrypoint'", JSON.stringify(source)));
const script = line => `#!/bin/sh\nset -eu\nplan_state_dir='${state}'\nplan_run_dir='${runs}'\n${line}\nprintf launch-ok\n`;
const run = file => spawnSync('sh', [file], {encoding: 'utf8'});
try {
  fs.writeFileSync(source, script(ownership));
  assert.notEqual(run(source).status, 0, 'the original startup fails under real supervisor capabilities');
  const repaired = run(patchedLauncher);
  assert.equal(repaired.status, 0, repaired.stderr);
  assert.equal(repaired.stdout, 'launch-ok');
  fs.writeFileSync(source, script(ownership.replace('chown -R ', 'chown ')));
  assert.equal(run(patchedLauncher).status, 0, 'already-fixed images remain compatible');
  fs.writeFileSync(source, '#!/bin/sh\nprintf unknown-entrypoint\n');
  assert.notEqual(run(patchedLauncher).status, 0, 'unknown ownership contracts fail closed');
  const check = spawnSync('setpriv', ['--reuid=1000', '--regid=1000', '--init-groups', 'node', '-e',
    'const f=require("fs"),a=require("assert/strict");a.equal(f.readFileSync(process.argv[1],"utf8"),"immutable result");a.equal(f.statSync(process.argv[1]).mode&0o777,0o600)', artifact]);
  assert.equal(check.status, 0, check.stderr?.toString());
  assert.equal(fs.statSync(privateDir).mode & 0o777, 0o700);
  assert.equal(fs.statSync(privateDir).uid, 1000);
  console.log(JSON.stringify({ok: true, oldStartupFails: true, repairedStartupPasses: true, archivePreserved: true, unknownStartupRejected: true}));
} finally {
  // Reclaim only this disposable test directory for removal.
  for (const directory of [state, runs, path.join(runs, 'existing'), path.join(runs, 'existing', 'observability'), privateDir]) {
    fs.chownSync(directory, 0, 1000);
  }
  fs.rmSync(root, {recursive: true, force: true});
}
