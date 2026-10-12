import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const helper = '/opt/ha-proof/restricted';
const calls = [];
function invoke(name, executable, args, extra = {}) {
  const result = spawnSync(executable, args, { encoding: 'utf8', timeout: 15000, maxBuffer: 131072, ...extra });
  const row = { name, status: result.status, signal: result.signal, error: result.error?.code ?? null, stdout: result.stdout, stderr: result.stderr };
  calls.push(row); console.log('ACL_DIAGNOSTIC_CALL', JSON.stringify(row)); return row;
}
const args = ['--reuid=1003', '--regid=1003', '--clear-groups', helper, '--page-size'];
let diagnosisStatus = 1;
try {
  const stat = fs.statSync(helper);
  assert.equal(stat.uid, 0); assert.equal(stat.gid, 1000); assert.equal(stat.mode & 0o777, 0o750);
  const direct = invoke('original-setpriv', '/bin/setpriv', args);
  const observed = invoke('same-setpriv-with-readonly-execvp-observer', '/bin/setpriv', args,
    { env: { ...process.env, LD_PRELOAD: '/opt/ha-proof/execvp-observer.so' } });
  assert.equal(observed.status, direct.status); assert.equal(observed.stdout, direct.stdout);
  const match = /PREEXEC_OBSERVER_STATUS_BEGIN\n([\s\S]*?)PREEXEC_OBSERVER_STATUS_END\n/u.exec(observed.stderr);
  assert.ok(match, 'observer must capture the real setpriv process before exec');
  assert.equal(observed.stderr.replace(match[0], ''), direct.stderr);
  const status = match[1];
  assert.match(status, /^Uid:\s+1003\s+1003\s+1003\s+1003$/mu);
  assert.match(status, /^Gid:\s+1003\s+1003\s+1003\s+1003$/mu);
  assert.match(status, /^Groups:[ \t]*$/mu);
  const effective = BigInt(`0x${/^CapEff:\s+([a-f0-9]+)$/mu.exec(status)?.[1]}`);
  console.log('PREEXEC_DAC_OVERRIDE', (effective & 2n) !== 0n);
  // These are diagnosis hypotheses: a failed assertion stays visible, never
  // changes the original suite's expected permission failure.
  assert.ok((effective & 2n) !== 0n, 'measured effective DAC override must explain execution permission bypass');
  assert.equal(direct.status, 77); assert.match(direct.stderr, /BUSTER_SANDBOX_CALLER_DENIED/u);
  const nodeDirect = invoke('direct-node-uid1003-gid1003', helper, ['--page-size'], { uid: 1003, gid: 1003 });
  assert.equal(nodeDirect.error, 'EACCES');
  const bridged = invoke('ordinary-node-credential-bridge', process.execPath, ['/diagnostics/credential-bridge.mjs'], { uid: 1003, gid: 1003 });
  assert.equal(bridged.status, 0); const bridge = JSON.parse(bridged.stdout);
  assert.match(bridge.status, /^Uid:\s+1003\s+1003\s+1003\s+1003$/mu);
  assert.match(bridge.status, /^Gid:\s+1003\s+1003\s+1003\s+1003$/mu);
  assert.match(bridge.status, /^CapEff:\s+0+$/mu); assert.equal(bridge.child.error, 'EACCES');
  diagnosisStatus = 0;
} catch (error) { console.error('ACL_DIAGNOSTIC_FAILURE', error); }
try {
  const allowed = invoke('independent-allowed-browser-positive', helper,
    ['67108864', '2', '64', '--run-as-gid', '1000', '--run-as-uid', '1001', '/bin/cat', '/proc/self/status'], { uid: 1000, gid: 1000 });
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.match(allowed.stdout, /^Uid:\s+1001\s+1001\s+1001\s+1001$/mu);
  assert.match(allowed.stdout, /^Gid:\s+1000\s+1000\s+1000\s+1000$/mu);
  assert.match(allowed.stdout, /^Groups:[ \t]*$/mu);
  for (const key of ['CapInh', 'CapPrm', 'CapEff', 'CapAmb']) assert.match(allowed.stdout, new RegExp(`^${key}:\\s+0+$`, 'mu'));
  assert.match(allowed.stdout, /^NoNewPrivs:\s+1$/mu);
} catch (error) { diagnosisStatus = 1; console.error('ACL_INDEPENDENT_POSITIVE_FAILURE', error); }
console.log('ACL_DIAGNOSTIC_STATUS', diagnosisStatus);
const original = spawnSync(process.execPath, ['/repo/ha-proof/guest-tests.mjs'], { cwd: '/repo', stdio: 'inherit', timeout: 180000 });
console.log('UNCHANGED_SEVEN_CASE_STATUS', original.status, original.signal);
fs.writeFileSync('/results/acl-diagnosis.json', JSON.stringify({ diagnosisStatus, calls, originalStatus: original.status, originalSignal: original.signal }, null, 2));
process.exitCode = diagnosisStatus !== 0 || original.status !== 0 ? 1 : 0;
