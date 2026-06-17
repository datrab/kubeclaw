#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const sourceRoot = process.cwd();
const checks = [
  {
    name: 'deployment-truth',
    script: 'tests/verification/deployment/check-deployment-truth.mjs',
  },
  {
    name: 'nova-startup-smoke',
    script: 'tests/verification/runtime/check-nova-startup-smoke.mjs',
  },
  {
    name: 'buster-startup-smoke',
    script: 'tests/verification/runtime/check-buster-startup-smoke.mjs',
  },
];

const results = checks.map((check) => {
  const child = spawnSync(process.execPath, [path.join(sourceRoot, check.script), '--source-root', sourceRoot], {
    cwd: sourceRoot,
    env: {
      ...process.env,
      KUBECLAW_DISABLE_DISCORD_WEBHOOKS: '1',
    },
    encoding: 'utf8',
    timeout: 30000,
  });
  return {
    ...check,
    status: child.status,
    signal: child.signal,
    stdout: child.stdout,
    stderr: child.stderr,
  };
});

for (const result of results) {
  assert.equal(
    result.status,
    0,
    `${result.name} must pass as part of the deploy/runtime gate\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  assert.equal(result.signal, null, `${result.name} must not time out or be signaled`);
}

console.log(JSON.stringify({
  ok: true,
  contract: 'deploy-runtime-gate',
  checks: results.map((result) => ({ name: result.name, status: result.status })),
}, null, 2));
