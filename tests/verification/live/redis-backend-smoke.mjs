#!/usr/bin/env node
import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'live/redis-backend-smoke' });
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const enabled = process.env.LIVE_REDIS_SMOKE === '1' || process.env.KUBECLAW_LIVE_REDIS_SMOKE === '1';
if (!enabled) {
  quietConsole.restore();
console.log(JSON.stringify({ ok: true, skipped: true, reason: 'set LIVE_REDIS_SMOKE=1 to run live Redis backend smoke' }, null, 2));
  process.exit(0);
}

if (!process.env.REDIS_HOST) {
  quietConsole.restore();
console.log(JSON.stringify({ ok: true, skipped: true, reason: 'REDIS_HOST is required for live Redis backend smoke' }, null, 2));
  process.exit(0);
}

if (process.env.LIVE_REDIS_SMOKE_DISCORD !== '1') {
  process.env.DISCORD_WEBHOOK = '';
}

const suffix = `${Date.now()}-${process.pid}`;
const project = `live-redis-smoke-${suffix}`;
const runId = `run-${suffix}`;
const moduleId = `smoke-${suffix}`;
const attempt = 1;
const dispatchId = `dispatch-${suffix}`;
const taskStream = process.env.BUSTER_TASK_STREAM || `swarm:buster:tasks:live-smoke:${suffix}`;
const completionStream = `swarm:pipeline:${project}:completions`;
const groupName = 'buster-group';

process.env.AGENT_NAME = 'buster';
process.env.BUSTER_TASK_STREAM = taskStream;
process.env.BUSTER_PROJECT = project;

function git(args, cwd, opts = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: opts.stdio || 'pipe' }).trim();
}

function createSmokeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-live-redis-smoke-'));
  const repo = path.join(root, 'repo');
  const origin = path.join(root, 'origin.git');
  fs.mkdirSync(repo, { recursive: true });
  git(['init', '--bare', origin], root, { stdio: 'ignore' });
  git(['init', repo], root, { stdio: 'ignore' });
  git(['config', 'user.email', 'nova-live-smoke@example.test'], repo, { stdio: 'ignore' });
  git(['config', 'user.name', 'Nova Live Smoke'], repo, { stdio: 'ignore' });

  const manifestDir = path.join(repo, '.swarm', 'modules', moduleId, 'k8s');
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(path.join(manifestDir, 'deployment.yaml'), 'kind: [this is intentionally invalid\n');
  fs.writeFileSync(path.join(repo, 'README.md'), `# ${project}\n`);
  git(['add', '-A'], repo, { stdio: 'ignore' });
  git(['commit', '-m', 'live redis smoke fixture'], repo, { stdio: 'ignore' });
  git(['branch', '-M', 'main'], repo, { stdio: 'ignore' });
  git(['remote', 'add', 'origin', origin], repo, { stdio: 'ignore' });
  git(['push', '-u', 'origin', 'main'], repo, { stdio: 'ignore' });
  const commit = git(['rev-parse', 'HEAD'], repo);
  return { root, repo, commit };
}

let redisTool;
let busterTaskQueue;
let busterTaskLifecycle;
let redis;
let fixture;
let taskId;

try {
  redisTool = (await import('../../../skills/nova/pipeline/tools/redis.ts')).default;
  busterTaskQueue = await import('../../../skills/buster/pipeline/services/task-queue.ts');
  busterTaskLifecycle = await import('../../../skills/buster/pipeline/services/task-lifecycle.ts');
  redis = redisTool.client;
  if (redis.status !== 'ready') await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Redis ready timeout')), 10000);
    redis.once('ready', () => { clearTimeout(timeout); resolve(); });
    redis.once('error', reject);
  });
  await redis.ping();

  try {
    await redis.xgroup('CREATE', taskStream, groupName, '0', 'MKSTREAM');
  } catch (error) {
    if (!String(error?.message || error).includes('BUSYGROUP')) throw error;
  }

  fixture = createSmokeRepo();
  const payload = {
    task_type: 'module_test',
    project,
    module_id: moduleId,
    attempt,
    run_id: runId,
    dispatch_id: dispatchId,
    stage_id: 'worker:module_buster',
    worker_type: 'module_buster',
    suites: ['manifest'],
    commit_hash: fixture.commit,
    completion_stream: completionStream,
    log_dir: path.join(fixture.repo, '.swarm', 'logs', 'buster', moduleId, `attempt-${attempt}`),
    timeout_seconds: 30,
    session: {
      cwd: fixture.repo,
      label: dispatchId,
      timeout_seconds: 30,
      runtime: 'subagent',
      agentId: 'codex',
      model: 'gpt-5-codex',
    },
    test_config: {
      suite_timeout_ms: 300000,
      manifest: {
        deployment_yaml: `.swarm/modules/${moduleId}/k8s/deployment.yaml`,
      },
    },
  };

  const dispatch = await redisTool.publishTask('buster', 'module_test', payload, attempt);
  taskId = dispatch.id;
  assert.equal(dispatch.stream, taskStream);

  await busterTaskQueue.processOneQueuedTask((taskPayload) => {
    assert.equal(taskPayload.run_id, runId);
    assert.equal(taskPayload.dispatch_id, dispatchId);
    return busterTaskLifecycle.processTask(taskPayload, { telemetryEnabled: false });
  });

  const pending = await redis.xpending(taskStream, groupName);
  assert.equal(Number(pending?.[0] || 0), 0, 'Buster task queue must ACK after terminal completion/dead-letter guarantee');

  const completion = await redisTool.readCompletion(completionStream, moduleId, {
    run_id: runId,
    attempt,
    dispatch_id: dispatchId,
  });
  assert(completion, 'Nova Redis reader did not find Buster completion');
  assert.equal(completion.source, 'buster-pipeline');
  assert.equal(completion.run_id, runId);
  assert.equal(completion.attempt, String(attempt));
  assert.equal(completion.dispatch_id, dispatchId);
  assert.equal(completion.status, 'FAIL');
  assert.equal(completion.outcome, 'FAIL');

  quietConsole.restore();
console.log(JSON.stringify({
    ok: true,
    skipped: false,
    project,
    run_id: runId,
    module_id: moduleId,
    task_stream: taskStream,
    task_id: taskId,
    completion_stream: completionStream,
    completion_id: completion._id,
    completion_source: completion.source,
    completion_outcome: completion.outcome,
    repo: fixture.repo,
  }, null, 2));
} finally {
  try { if (redis && taskId) await redis.xdel(taskStream, taskId); } catch (e) { console.warn(`cleanup xdel failed: ${e?.message || e}`); }
  try { if (redis) await redis.del(taskStream, completionStream, `${completionStream}:log`); } catch (e) { console.warn(`cleanup redis del failed: ${e?.message || e}`); }
  try { await redisTool?.disconnect?.(); } catch (e) { console.warn(`cleanup redis tool disconnect failed: ${e?.message || e}`); }
  try { await busterTaskQueue?.disconnectRedisClient?.(); } catch (e) { console.warn(`cleanup buster redis disconnect failed: ${e?.message || e}`); }
  if (fixture?.root && process.env.LIVE_REDIS_SMOKE_KEEP_ARTIFACTS !== '1') {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}
