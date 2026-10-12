import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import test from 'node:test';
import { cliProfile } from '../../fixtures/test-gate/buster-cli-profile.mjs';

for (const admission of [
  { maximumActiveJobs: 1, maximumQueuedJobs: 1, maximumConcurrentAttempts: 3 },
  { maximumActiveJobs: 3, maximumQueuedJobs: 2, maximumConcurrentAttempts: 5 },
]) {
  test(`actual unprivileged CLI starts and stops with authored policy ${JSON.stringify(admission)}`, { timeout: 30000 }, async () => {
    assert.equal(process.getuid(), 1000); assert.equal(process.getgid(), 1000);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-cli-admission-'));
    const profile = cliProfile(root, admission); delete profile.environment.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, ['skills/buster/engine/remote-plan-cli.ts', '--config', profile.runtime],
      { env: profile.environment, stdio: ['ignore', 'pipe', 'pipe', 'pipe'] });
    let stderr = '', frames = 0;
    child.stderr.on('data', chunk => { stderr += chunk; });
    // Actual fd3 socket is retained, but no native parent/preparation is simulated.
    child.stdio[3].on('data', chunk => { frames += chunk.length; });
    const exited = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
    const lines = createInterface({ input: child.stdout });
    try {
      const ready = await Promise.race([
        new Promise(resolve => lines.once('line', line => resolve(JSON.parse(line)))),
        exited.then(() => { throw new Error(`CLI exited before readiness: ${stderr}`); }),
      ]);
      assert.equal(ready.schemaVersion, 'buster-remote-runtime-ready.v1');
      const response = await fetch(`http://127.0.0.1:${ready.port}/healthz`);
      assert.equal(response.status, 200); assert.equal((await response.json()).live, true);
      child.kill('SIGTERM'); assert.deepEqual(await exited, { code: 0, signal: null }, stderr);
      assert.equal(frames, 0, 'empty-store startup performs no preparation request');
    } finally {
      lines.close(); if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await exited; fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
