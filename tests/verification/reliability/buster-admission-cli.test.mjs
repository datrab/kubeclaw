import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import test from 'node:test';
import { nativeCli } from '../../fixtures/test-gate/buster-cli-native.mjs';

// Preserve the original hosted failure as a real negative control. Only the
// private fixture mount changes; the production ancestry verifier stays intact.
test('actual native parent rejects writable libexec ancestry before runtime publication', { timeout: 120000 }, async t => {
  assert.equal(process.getuid(), 0, 'the production parent requires real root');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-cli-untrusted-ancestor-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fixture = await nativeCli(root,
    { maximumActiveJobs: 1, maximumQueuedJobs: 1, maximumConcurrentAttempts: 3 },
    { untrustedLocalMount: true });
  const { child, jail } = fixture;
  let stderr = '', stdout = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdout.on('data', chunk => { stdout += chunk; });
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  try {
    assert.deepEqual(await exited, { code: 1, signal: null }, stderr);
    assert.match(stderr, /BUSTER_NATIVE_BOOT_FACT_ANCESTOR_NOT_TRUSTED/);
    assert.equal(stdout, '', 'untrusted native ancestry cannot emit readiness');
    assert.equal(fs.existsSync(path.join(jail, 'run/kubeclaw-buster/config/pipeline-startup.json')), false,
      'no original boot handoff is published from an untrusted installed ancestor');
    assert.match(fs.readFileSync(path.join(fixture.pool, 'cgroup.events'), 'utf8'), /^populated 0$/m);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited; fixture.dispose();
  }
});

for (const admission of [
  { maximumActiveJobs: 1, maximumQueuedJobs: 1, maximumConcurrentAttempts: 3 },
  { maximumActiveJobs: 3, maximumQueuedJobs: 2, maximumConcurrentAttempts: 5 },
]) {
  test(`actual unprivileged CLI starts and stops with authored policy ${JSON.stringify(admission)}`, { timeout: 120000 }, async t => {
    assert.equal(process.getuid(), 0, 'the production parent requires real root');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-cli-admission-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const fixture = await nativeCli(root, admission);
    const { child, jail } = fixture;
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    const exited = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    const lines = createInterface({ input: child.stdout });
    try {
      const ready = await Promise.race([
        new Promise(resolve => lines.once('line', line => resolve(JSON.parse(line)))),
        exited.then(() => { throw new Error(`CLI exited before readiness: ${stderr}`); }),
      ]);
      assert.equal(ready.schemaVersion, 'buster-remote-runtime-ready.v1');
      const response = await fetch(`http://127.0.0.1:${ready.port}/healthz`);
      assert.equal(response.status, 200); assert.equal((await response.json()).live, true);
      // Read the real parent -> guardian -> service process tree. The CLI also
      // refuses any UID/GID other than 1000 before it can emit readiness.
      // Observe the actual parent's mount namespace, not the unmounted jail
      // directory: native boot facts require every libexec ancestor trusted.
      const localMount = fs.statSync(`/proc/${child.pid}/root/usr/local`);
      assert.equal(localMount.uid, 0);
      assert.equal(localMount.mode & 0o7777, 0o755);
      const children = pid => fs.readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean);
      const installedGuardian = fs.statSync(path.join(jail, 'native/libexec/kubeclaw-buster-lifetime-guardian'));
      // The parent also retains a real flock helper for journal ownership.
      // Identify the guardian by the installed executable inode, not order.
      const guardians = children(child.pid).filter(pid => {
        const executable = fs.statSync(`/proc/${pid}/exe`);
        return executable.dev === installedGuardian.dev && executable.ino === installedGuardian.ino;
      });
      assert.equal(guardians.length, 1, 'exactly one real installed guardian remains alive');
      const services = children(guardians[0]);
      assert.equal(services.length, 1, 'the guardian retains exactly one real service');
      const [service] = services;
      const identity = fs.readFileSync(`/proc/${service}/status`, 'utf8');
      assert.match(identity, /^Uid:\s+1000\s+1000\s+1000\s+1000$/m);
      assert.match(identity, /^Gid:\s+1000\s+1000\s+1000\s+1000$/m);
      const startup = JSON.parse(fs.readFileSync(path.join(jail, 'run/kubeclaw-buster/config/pipeline-startup.json')));
      assert.ok(startup.parentBootId, 'production parent published the verified generation handoff');
      // Readiness follows the production fd3 ACK; the test never writes an ACK.
      child.kill('SIGTERM'); assert.deepEqual(await exited, { code: 0, signal: null }, stderr);
      assert.equal(fs.readFileSync(path.join(fixture.pool, 'cgroup.events'), 'utf8').includes('populated 0'), true);
      const sources = path.join(jail, 'var/lib/buster-v2/native-sources');
      assert.deepEqual(fs.readdirSync(sources), ['source-ledger'], 'no preparation source group was created');
      assert.deepEqual(fs.readdirSync(path.join(sources, 'source-ledger')), ['.write-lock'],
        'recovery reads only the empty ledger; no reservation or preparation request was persisted');
    } finally {
      lines.close(); if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await exited; fixture.dispose();
    }
  });
}
