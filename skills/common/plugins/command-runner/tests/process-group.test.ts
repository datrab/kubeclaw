import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CommandRunner } from '../src/runner.ts';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'command-exited-leader-'));
// Signal PIDs belong to the process namespace; /proc/self supplies the IDs
// visible on this environment's proc mount for live/dead verification.
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
function running(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0] !== 'Z';
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
async function waitFor(predicate, label) {
  const deadline = Date.now() + 2_000;
  while (!predicate() && Date.now() < deadline) await pause(10);
  assert(predicate(), label);
}
try {
  for (const mode of ['timeout', 'abort', 'shutdown']) {
    const identityFile = path.join(temporary, `${mode}.json`);
    const childReady = path.join(temporary, `${mode}.ready`);
    const childSource = `process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(${JSON.stringify(childReady)}, require('node:fs').readFileSync('/proc/self/stat', 'utf8').split(' ')[0]); setTimeout(() => {}, 5_000);`;
    const leaderSource = `const fs = require('node:fs'); const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(childSource)}], { stdio: ['ignore', 'inherit', 'inherit'] }); fs.writeFileSync(${JSON.stringify(identityFile)}, JSON.stringify({ leader: process.pid, leaderHost: Number(fs.readFileSync('/proc/self/stat', 'utf8').split(' ')[0]), child: child.pid })); child.unref();`;
    const runner = new CommandRunner({ maxOutputBytes: 1024, maxExecutionMs: mode === 'timeout' ? 600 : 5_000, terminationGraceMs: 40 });
    const controller = new AbortController();
    const started = Date.now();
    const pending = runner.run({ executable: process.execPath, args: ['-e', leaderSource], cwd: temporary }, controller.signal)
      .then((result) => ({ result }), (error) => ({ error }));
    let identity;
    try {
      await waitFor(() => fs.existsSync(identityFile) && fs.existsSync(childReady), 'child starts and installs SIGTERM resistance');
      identity = JSON.parse(fs.readFileSync(identityFile, 'utf8'));
      identity.childHost = Number(fs.readFileSync(childReady, 'utf8'));
      await waitFor(() => !running(identity.leaderHost), 'leader exits before termination trigger');
      assert(running(identity.childHost), 'descendant still runs with inherited output pipes');
      const triggered = Date.now();
      if (mode === 'abort') controller.abort(new Error('test operator cancellation'));
      if (mode === 'shutdown') await runner.shutdown();
      const outcome = await pending;
      if (mode === 'timeout') assert.equal(outcome.error?.message, 'COMMAND_TIMEOUT');
      if (mode === 'abort') assert.equal(outcome.error?.message, 'ADAPTER_CANCELLED');
      if (mode === 'shutdown') assert.equal(outcome.result?.exitCode, 0);
      assert(Date.now() - (mode === 'timeout' ? started : triggered) < (mode === 'timeout' ? 1_600 : 1_000),
        `${mode} must finish on termination grace, before descendant's 5-second self-exit`);
      assert.equal(running(identity.childHost), false, 'descendant is already dead when the operation settles');
      console.log(JSON.stringify({ mode, elapsedMs: Date.now() - started, descendantStopped: true }));
    } finally {
      if (identity) {
        try { process.kill(-identity.leader, 'SIGKILL'); } catch { /* Already gone. */ }
        try { process.kill(identity.child, 'SIGKILL'); } catch { /* Already gone. */ }
      }
      await pending;
      await runner.shutdown();
    }
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
