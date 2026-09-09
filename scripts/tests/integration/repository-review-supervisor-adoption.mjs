import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
import { fixture } from '../fixtures/review-supervisor.mjs';

test('adopted live process remains alive when its original status reader fails', async t => {
  const f = fixture(t);
  // A real process supplies only the ownership/liveness boundary; no pipeline
  // implementation or status response is substituted.
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', '--',
    'pipeline', 'supervisor-status-regression'], { stdio: 'ignore' });
  await once(child, 'spawn');
  t.after(async () => {
    const exit = once(child, 'exit'); child.kill('SIGTERM'); await exit;
  });
  assert.ok(fs.existsSync(`/proc/${child.pid}/cmdline`),
    `REAL_PROC_PROCESS_CMDLINE_REQUIRED: live child ${child.pid} is not visible through procfs`);
  const heartbeat = path.join(f.root, 'heartbeat.json');
  fs.writeFileSync(heartbeat, JSON.stringify({ pipelinePid: child.pid, attempt: 3 }));
  const result = f.invoke();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /REVIEW_SUPERVISOR_STATUS_FAILED/u);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(fs.readFileSync(heartbeat, 'utf8')).mode, 'adopted');
  assert.equal(child.exitCode, null);
  assert.doesNotThrow(() => process.kill(child.pid, 0));
  assert.equal(fs.existsSync(f.lease), false);
});
