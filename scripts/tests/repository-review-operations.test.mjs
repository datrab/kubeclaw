import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`);
}

function appendEvent(file, entry) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify({ entry })}\n`);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-operations-'));
  const artifacts = path.join(root, 'artifacts');
  const storage = path.join(root, 'state');
  const runId = 'review-operations-test';
  const platform = path.join(root, 'platform.json');
  const heartbeat = path.join(root, 'heartbeat.json');
  const resources = path.join(root, 'resources.jsonl');
  const events = path.join(storage, 'runs', runId, 'events.jsonl');
  writeJson(platform, { storageRoot: storage, adapters: {
    'kubeclaw.artifact-store:artifact-store': { artifactRoot: artifacts },
  } });
  const prepared = { compilation: { jobs: [
    { digest: 'job:1' }, { digest: 'job:2' }, { digest: 'job:3' },
  ], accounting: { estimatedInputTokens: 123_456 } } };
  const bytes = Buffer.from(JSON.stringify(prepared));
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  const blob = path.join(artifacts, 'blobs', 'sha256', digest.slice(0, 2), digest.slice(2));
  fs.mkdirSync(path.dirname(blob), { recursive: true });
  fs.writeFileSync(blob, bytes);
  writeJson(path.join(artifacts, 'records', 'store.json'), { records: [{ payload: {
    artifactId: 'repository-review-prepared:test', digest: `sha256:${digest}`,
    producer: { runId, stageId: 'plan', attemptId: 'attempt:1', attemptNumber: 1 },
  } }] });
  appendEvent(events, { type: 'run.started', occurredAt: new Date().toISOString(),
    identity: { runId, attemptId: 'attempt:fixture' } });
  return { root, artifacts, storage, runId, platform, heartbeat, resources, events };
}

test('compact status and formatter report live state without scanning source journals', () => {
  const value = fixture();
  const now = Date.now();
  writeJson(value.heartbeat, { updatedAt: new Date(now).toISOString(), supervisorPid: 12,
    pipelinePid: 34, processAlive: true, attempt: 2, mode: 'recover' });
  writeJson(path.join(value.storage, 'resource-locks', 'dispatch.active', 'owner.json'), {
    pid: process.pid,
    contract: { status: 'active', ownerLeaseId: 'attempt:fixture', resource: { type: 'runtime.invocation' },
      expiresAt: new Date(now + 60_000).toISOString() },
  });
  fs.writeFileSync(value.resources, [
    { observedAt: new Date(now - 15_000).toISOString(), memoryCurrentBytes: 1024 ** 3,
      memoryPeakBytes: 3 * 1024 ** 3, memoryEvents: { oom: 0, oom_kill: 0 },
      cpu: { usage_usec: 1_000_000 }, gateway: { healthy: true } },
    { observedAt: new Date(now).toISOString(), memoryCurrentBytes: 2 * 1024 ** 3,
      memoryPeakBytes: 3 * 1024 ** 3, memoryEvents: { oom: 0, oom_kill: 0 },
      cpu: { usage_usec: 2_500_000 }, gateway: { healthy: true } },
  ].map(JSON.stringify).join('\n') + '\n');
  const status = spawnSync(process.execPath, [path.join(repositoryRoot, 'scripts', 'repository-review-status.mjs'),
    '--platform', value.platform, '--run-id', value.runId, '--heartbeat', value.heartbeat,
    '--resource-log', value.resources], { encoding: 'utf8' });
  assert.equal(status.status, 0, status.stderr);
  const parsed = JSON.parse(status.stdout);
  assert.equal(parsed.liveness, 'active');
  assert.equal(parsed.plannedPrimary, 3);
  assert.equal(parsed.resources.currentCpuPercent, 10);
  assert.equal(parsed.resources.currentRamBytes, 2 * 1024 ** 3);
  assert.equal(parsed.activeDispatches, 1);

  const fakeOpenClaw = path.join(value.root, 'openclaw');
  fs.writeFileSync(fakeOpenClaw, '#!/bin/sh\nprintf \'%s\\n\' \'{"output":{"details":{"active":[{"status":"running"},{"status":"running"}]}}}\'\n', { mode: 0o755 });
  const formatted = spawnSync(process.execPath, [path.join(repositoryRoot, 'scripts', 'format-repository-review-status.mjs'),
    '--workdir', repositoryRoot, '--platform', value.platform, '--run-id', value.runId,
    '--heartbeat', value.heartbeat, '--resource-log', value.resources, '--openclaw-bin', fakeOpenClaw,
    '--configured-concurrency', '10', '--interval-minutes', '10'], { encoding: 'utf8' });
  assert.equal(formatted.status, 0, formatted.stderr);
  assert.match(formatted.stdout, /^Active as of \d{2}:\d{2}:\d{2} UTC/mu);
  assert.match(formatted.stdout, /Primary batches: 3 planned; 0 completed; 2 running; 3 remaining\./u);
  assert.match(formatted.stdout, /Actual concurrency: 2 reviewer agents active; 0 dispatches await acceptance\. Configured concurrency is 10\./u);
  assert.match(formatted.stdout, /current CPU 10\.0%, peak 10\.0%; current RAM 2\.00 GiB/u);
});

test('supervisor preserves a single lease and records a terminal child attempt', () => {
  const value = fixture();
  const bin = path.join(value.root, 'bin');
  const capture = path.join(value.root, 'npm-arguments.json');
  fs.mkdirSync(bin);
  const fakeNpm = path.join(bin, 'npm');
  fs.writeFileSync(fakeNpm, `#!/usr/bin/env node
const fs=require('node:fs');
fs.writeFileSync(process.env.REVIEW_TEST_CAPTURE, JSON.stringify(process.argv.slice(2)));
fs.appendFileSync(process.env.REVIEW_TEST_EVENTS, JSON.stringify({entry:{type:'run.failed',occurredAt:new Date().toISOString(),identity:{runId:'${value.runId}'}}})+'\\n');
`, { mode: 0o755 });
  const lease = path.join(value.root, 'supervisor.lease.json');
  const result = spawnSync(process.execPath, [path.join(repositoryRoot, 'scripts', 'supervise-repository-review.mjs'),
    '--workdir', repositoryRoot, '--platform', value.platform, '--graph', path.join(value.root, 'graph.json'),
    '--run-id', value.runId, '--heartbeat', value.heartbeat, '--resource-log', value.resources,
    '--diagnostic-dir', path.join(value.root, 'diagnostics'), '--log', path.join(value.root, 'pipeline.log'),
    '--lease', lease, '--initial-mode', 'auto', '--max-recoveries', '0'], {
    encoding: 'utf8', timeout: 20_000, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`,
      REVIEW_TEST_CAPTURE: capture, REVIEW_TEST_EVENTS: value.events },
  });
  assert.equal(result.status, 1, result.stderr);
  const invoked = JSON.parse(fs.readFileSync(capture, 'utf8'));
  assert.deepEqual(invoked.slice(0, 2), ['run', 'pipeline']);
  assert.ok(invoked.includes('--recover'));
  assert.ok(invoked.includes('--pipeline'));
  assert.equal(fs.existsSync(lease), false);
  assert.equal(fs.existsSync(path.join(value.root, 'diagnostics', 'attempt-1-exit.json')), true);
});

test('supervisor start mode uses the current pipeline CLI flag', () => {
  const source = fs.readFileSync(path.join(repositoryRoot, 'scripts', 'supervise-repository-review.mjs'), 'utf8');
  assert.match(source, /'--pipeline', graph, '--run-id', runId/u);
  assert.doesNotMatch(source, /'--graph', graph/u);
});
