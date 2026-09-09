import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { invokeIsolated } from '../../../skills/common/plugin-runtime/foundation/isolation/runner.ts';
import { runIsolationSession } from '../../../skills/common/plugin-runtime/foundation/isolation/session.ts';
import { IsolationCgroup } from '../../../skills/common/plugin-runtime/foundation/isolation/cgroup.ts';

const launcher = path.resolve('skills/common/plugin-runtime/foundation/isolation/plugin-sandbox');
const cgroupRoot = process.argv[2];
const dropUid = Number(process.argv[3]), dropGid = Number(process.argv[4]);
const blockers = [];
if (!fs.existsSync(`/proc/${process.pid}/task/${process.pid}/children`)) blockers.push('proc task children unavailable');
if (!cgroupRoot) blockers.push('explicit delegated cgroupRoot argument required');
if (![dropUid, dropGid].every((value) => Number.isSafeInteger(value) && value > 0 && value <= 0x7fffffff) || process.getuid() !== 0) blockers.push('credential-drop proof requires root and explicit nonzero uid/gid arguments');
if (blockers.length) {
  console.error(JSON.stringify({ status: 'blocked', gate: 'isolation-kernel', blockers }));
  process.exit(2);
}
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'isolation-kernel-'));
const context = { contract: { artifacts: [], lease: { limits: { wallTimeMs: 5000, memoryBytes: 128 * 1024 * 1024, cpuMillis: 5000 } } }, async invoke() { throw new Error('unused'); }, async emit() {}, artifact() {} };
function alive(pid) { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } }
async function waitUntil(check, label) {
  for (let attempt = 0; attempt < 300; attempt++) { if (check()) return; await delay(10); }
  throw new Error(label);
}
try {
  const modulePath = path.resolve('tests/fixtures/isolation-memory.mjs');
  for (const memoryBytes of [128, 256].map((value) => value * 1024 * 1024)) {
    const bounded = { ...context, contract: { ...context.contract, lease: { limits: { ...context.contract.lease.limits, memoryBytes } } } };
    for (const mode of ['buffer', 'heap']) {
      await assert.rejects(invokeIsolated({ packageRoot: path.dirname(modulePath), modulePath, exportName: 'execute', surface: 'stage', argument: { mode }, context: bounded, cgroupRoot }),
        mode === 'buffer' ? /ISOLATED_PLUGIN_MEMORY_LIMIT:memory.peak=[1-9]/ : /ISOLATED_PLUGIN_MEMORY_LIMIT|ISOLATED_PLUGIN_EXITED/);
    }
  }
  fs.chmodSync(root, 0o711);
  const script = path.join(root, 'tree.sh');
  fs.writeFileSync(script, '#!/bin/sh\ntrap "" TERM\n/usr/bin/setsid /bin/sh -c \'trap "" TERM; echo $$ > "$1"; while :; do /bin/sleep 1; done\' child "$1" &\nwait\n', { mode: 0o755 });
  for (const mode of ['cancel', 'timeout']) {
    const group = IsolationCgroup.create(cgroupRoot, 128 * 1024 * 1024);
    const marker = path.join(root, `${mode}.pid`);
    const child = spawn(launcher, ['134217728', '5', '64', '--child-cgroup', group.path, script, marker], { stdio: ['pipe', 'pipe', 'pipe'] });
    const controller = new AbortController();
    const result = runIsolationSession({ child, context, wallTimeMs: mode === 'timeout' ? 500 : 5000, signal: controller.signal, terminateTree: () => group.kill(), invocationMessage: {} });
    const asserted = assert.rejects(result, mode === 'cancel' ? /ISOLATED_PLUGIN_CANCELLED/ : /ISOLATED_PLUGIN_TIMEOUT/);
    try {
      await waitUntil(() => fs.existsSync(marker), 'real setsid descendant did not start');
      if (mode === 'cancel') controller.abort();
      await asserted;
      const pid = Number(fs.readFileSync(marker, 'utf8').trim());
      assert.equal(alive(pid), false, 'escaped descendant survived cleanup');
      assert.equal(child.exitCode !== null || child.signalCode !== null, true);
    } finally { controller.abort(); await group.close(); }
  }
  for (const dropCredentials of [false, true]) {
    const group = IsolationCgroup.create(cgroupRoot, 128 * 1024 * 1024);
    const markerRoot = fs.mkdtempSync(path.join(root, 'identity-'));
    if (dropCredentials) fs.chownSync(markerRoot, dropUid, dropGid);
    const marker = path.join(markerRoot, 'host-death.pid'), supervisorMarker = path.join(root, `supervisor-${dropCredentials}.pid`);
    const identity = dropCredentials ? [String(dropUid), String(dropGid)] : [];
    const host = spawn(process.execPath, ['tests/fixtures/isolation-parent.mjs', launcher, group.path, script, marker, supervisorMarker, ...identity], { stdio: 'ignore' });
    const hostClosed = new Promise((resolve) => host.once('close', resolve));
    try {
      await waitUntil(() => fs.existsSync(marker) && fs.existsSync(supervisorMarker), 'parent-death workload did not start');
      host.kill('SIGKILL'); await hostClosed;
      const pid = Number(fs.readFileSync(marker, 'utf8').trim());
      const supervisor = Number(fs.readFileSync(supervisorMarker, 'utf8').trim());
      await waitUntil(() => !alive(pid) && !alive(supervisor), 'host SIGKILL left a workload or supervisor process');
    } finally { host.kill('SIGKILL'); await hostClosed; await group.close(); }
  }
  console.log(JSON.stringify({ status: 'passed', gate: 'isolation-kernel', memory: 'buffer/heap128/256MiB', tree: 'cancel/timeout/hostSIGKILL (also credential drop) with TERM-ignoring setsid descendant' }));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
