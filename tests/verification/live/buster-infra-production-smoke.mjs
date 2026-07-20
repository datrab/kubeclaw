#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RESULT_MARKER = 'KUBECLAW_BUSTER_INFRA_SMOKE_RESULT=';
const DEFAULT_NAMESPACE = 'kubeclaw';
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;
const BUSTER_GROUP = 'buster-group';
const SMOKE_PROJECT = 'buster-infra-smoke';
const REMOTE_REPO_ROOT = '/home/node/.openclaw/workspace/git-repo';
const FIXTURE_RELATIVE_ROOT = 'Projects/buster-infra-smoke/src';
const COMMITTED_SMOKE_PATHS = [
  '.gitignore',
  'tests/verification/live/buster-infra-production-smoke.mjs',
  `${FIXTURE_RELATIVE_ROOT}/Dockerfile`,
  `${FIXTURE_RELATIVE_ROOT}/deployment.yaml`,
  `${FIXTURE_RELATIVE_ROOT}/index.html`,
];
const LOCAL_SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

function parsePositiveInteger(value, fallback, field) {
  const resolved = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(resolved) || resolved <= 0) throw new Error(`${field} must be a positive integer`);
  return resolved;
}

export function buildSmokeIdentity(suffix = `${Date.now()}-${process.pid}`) {
  const token = requiredString(suffix, 'suffix').replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!token) throw new Error('suffix must contain an alphanumeric character');
  const project = SMOKE_PROJECT;
  const runId = `run-${token}`;
  const moduleId = `buster-infra-${token}`;
  const dispatchId = `dispatch-${token}`;
  const artifactDir = `Projects/${project}/src/.swarm/live-buster-infra/${token}`;
  return {
    token,
    project,
    runId,
    moduleId,
    dispatchId,
    attempt: 1,
    artifactDir,
    completionStream: `swarm:pipeline:${project}:completions`,
    telemetryStream: `pipeline:telemetry:${project}:${runId}`,
    telemetrySequenceKey: `pipeline:telemetry:${project}:${runId}:seq`,
  };
}

export function buildBusterInfraTask({ identity, commitHash, repoRoot = REMOTE_REPO_ROOT }) {
  const fixtureRoot = `${repoRoot}/${FIXTURE_RELATIVE_ROOT}`;
  return {
    task_type: 'module_test',
    project: identity.project,
    module_id: identity.moduleId,
    attempt: identity.attempt,
    run_id: identity.runId,
    dispatch_id: identity.dispatchId,
    stage_id: 'worker:module_buster',
    worker_type: 'module_buster',
    capabilities: ['image_build', 'kubernetes'],
    suites: ['k8s'],
    commit_hash: requiredString(commitHash, 'commitHash'),
    completion_stream: identity.completionStream,
    output_file: `${identity.artifactDir}/buster-output.json`,
    log_dir: `${repoRoot}/${identity.artifactDir}/logs`,
    timeout_seconds: 900,
    agent_judgment: {
      required: false,
      reason: 'deterministic live infrastructure smoke',
    },
    session: {
      cwd: repoRoot,
      label: identity.dispatchId,
      timeout_seconds: 900,
      runtime: 'subagent',
      agentId: 'codex',
      model: 'gpt-5.3-codex-spark',
    },
    test_config: {
      suite_timeout_ms: 15 * 60 * 1000,
      k8s: {
        image_name: 'buster-infra-smoke',
        service_name: 'buster-infra-smoke',
        dockerfile: `${fixtureRoot}/Dockerfile`,
        build_context: fixtureRoot,
        manifests: [`${fixtureRoot}/deployment.yaml`],
        port: 80,
        health_path: '/',
        namespace_prefix: 'test',
        cleanup_policy: 'delete',
        purpose: 'pretest',
        ready_timeout_seconds: 180,
        namespace_lease_timeout_seconds: 120,
        namespace_ttl_seconds: 900,
        build_timeout_seconds: 600,
        push_timeout_seconds: 300,
        deploy_timeout_seconds: 60,
        health_retries: 10,
        health_base_delay_ms: 1000,
      },
    },
  };
}

function parseJsonField(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is missing`);
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${field} is invalid JSON: ${error.message}`);
  }
}

export function verifyCompletionEvidence(completion, identity) {
  assert(completion, 'deployed Buster did not publish a completion');
  assert.equal(completion.source, 'buster-pipeline');
  assert.equal(completion.run_id, identity.runId);
  assert.equal(String(completion.attempt), String(identity.attempt));
  assert.equal(completion.dispatch_id, identity.dispatchId);
  assert.equal(completion.status, 'PASS');
  assert.equal(completion.outcome, 'PASS');

  const verdict = parseJsonField(completion.verdict, 'completion.verdict');
  const k8s = verdict?.suites?.k8s;
  assert.equal(k8s?.status, 'PASS', JSON.stringify(k8s?.findings || []));
  assert.match(k8s?.metadata?.deployed_image || '', /@sha256:[a-f0-9]{64}$/);
  assert.match(k8s?.metadata?.registry_image_digest || '', /^sha256:[a-f0-9]{64}$/);
  assert.equal(k8s?.metadata?.cleanup_policy, 'delete');

  const checks = Array.isArray(k8s?.metadata?.checks) ? k8s.metadata.checks : [];
  for (const name of ['k8s-capability-preflight', 'buildkit-build-push', 'namespace-lease', 'manifest-apply', 'pods-ready', 'health-check']) {
    const check = checks.find((entry) => entry?.name === name);
    assert.equal(check?.passed, true, `${name} did not pass: ${check?.detail || 'missing check'}`);
  }

  return {
    verdict,
    namespace: requiredString(k8s.metadata.test_namespace, 'k8s test namespace'),
    deployedImage: k8s.metadata.deployed_image,
    registryDigest: k8s.metadata.registry_image_digest,
  };
}

function redisFields(fields) {
  const record = {};
  for (let index = 0; index < fields.length; index += 2) record[fields[index]] = fields[index + 1];
  return record;
}

export function verifyTelemetryEvidence(entries, identity) {
  const events = entries
    .map(([, fields]) => redisFields(fields))
    .map((fields) => fields.data ? parseJsonField(fields.data, 'telemetry.data') : null)
    .filter((event) => event?.run_id === identity.runId && event?.dispatch_id === identity.dispatchId);
  const pluginEvents = new Set(
    events
      .filter((event) => event.type === 'plugin.event' && event.plugin_id === 'buster')
      .map((event) => event.plugin_event),
  );
  for (const expected of ['task_started', 'suite_started', 'suite_completed', 'task_completed']) {
    assert.equal(pluginEvents.has(expected), true, `missing deployed Buster telemetry event: ${expected}`);
  }
  return [...pluginEvents].sort();
}

export function parseResultMarker(output) {
  const markerLine = String(output)
    .split(/\r?\n/)
    .find((line) => line.startsWith(RESULT_MARKER));
  if (!markerLine) throw new Error('deployed Nova publisher did not emit a smoke result marker');
  return JSON.parse(Buffer.from(markerLine.slice(RESULT_MARKER.length), 'base64url').toString('utf8'));
}

async function waitForCompletion(redisTool, identity, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const completion = await redisTool.readCompletion(identity.completionStream, identity.moduleId, {
      run_id: identity.runId,
      attempt: identity.attempt,
      dispatch_id: identity.dispatchId,
    });
    if (completion) return completion;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`deployed Buster completion timed out after ${timeoutMs}ms`);
}

async function waitForTaskAck(redis, taskStream, taskId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pending = await redis.xpending(taskStream, BUSTER_GROUP, taskId, taskId, 1);
    if (Array.isArray(pending) && pending.length === 0) return;
    await sleep(500);
  }
  throw new Error(`deployed Buster did not ACK task ${taskId}`);
}

function sourceCommit() {
  execFileSync('git', ['fetch', 'origin', 'main'], { cwd: LOCAL_SOURCE_ROOT, stdio: 'inherit' });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: LOCAL_SOURCE_ROOT, encoding: 'utf8' }).trim();
  const main = execFileSync('git', ['rev-parse', 'origin/main'], { cwd: LOCAL_SOURCE_ROOT, encoding: 'utf8' }).trim();
  assert.equal(head, main, 'live Buster infrastructure smoke requires HEAD to equal origin/main');
  for (const committedPath of COMMITTED_SMOKE_PATHS) {
    execFileSync('git', ['cat-file', '-e', `${head}:${committedPath}`], { cwd: LOCAL_SOURCE_ROOT });
  }
  execFileSync('git', ['diff', '--quiet', 'HEAD', '--', ...COMMITTED_SMOKE_PATHS], { cwd: LOCAL_SOURCE_ROOT });
  return head;
}

async function runInside() {
  if (process.env.LIVE_BUSTER_INFRA_DISCORD !== '1') process.env.DISCORD_WEBHOOK = '';
  const timeoutMs = parsePositiveInteger(process.env.LIVE_BUSTER_INFRA_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 'LIVE_BUSTER_INFRA_TIMEOUT_MS');
  const identity = buildSmokeIdentity();
  const payload = buildBusterInfraTask({ identity, commitHash: requiredString(process.env.LIVE_BUSTER_INFRA_COMMIT, 'LIVE_BUSTER_INFRA_COMMIT') });
  const redisTool = (await import('file:///app/skills/pipeline/tools/redis.ts')).default;
  const redis = redisTool.client;
  let taskId = null;
  let taskStream = null;
  let completionId = null;
  let acked = false;
  let evidenceVerified = false;

  try {
    const dispatch = await redisTool.publishTask('buster', 'module_test', payload, identity.attempt);
    taskId = dispatch.id;
    taskStream = dispatch.stream;
    const completion = await waitForCompletion(redisTool, identity, timeoutMs);
    completionId = completion._id;
    const completionEvidence = verifyCompletionEvidence(completion, identity);
    await waitForTaskAck(redis, taskStream, taskId, 30000);
    acked = true;
    const telemetryEntries = await redis.xrange(identity.telemetryStream, '-', '+');
    const telemetryEvents = verifyTelemetryEvidence(telemetryEntries, identity);
    evidenceVerified = true;
    const result = {
      ok: true,
      project: identity.project,
      run_id: identity.runId,
      module_id: identity.moduleId,
      dispatch_id: identity.dispatchId,
      task_stream: taskStream,
      task_id: taskId,
      completion_stream: identity.completionStream,
      completion_id: completion._id,
      completion_source: completion.source,
      artifact_dir: identity.artifactDir,
      namespace: completionEvidence.namespace,
      deployed_image: completionEvidence.deployedImage,
      registry_digest: completionEvidence.registryDigest,
      telemetry_events: telemetryEvents,
      task_acked: true,
    };
    process.stdout.write(`${RESULT_MARKER}${Buffer.from(JSON.stringify(result)).toString('base64url')}\n`);
  } finally {
    try {
      if (evidenceVerified && acked && taskStream && taskId && completionId) {
        assert.equal(await redis.xdel(taskStream, taskId), 1, `failed to delete smoke task ${taskId}`);
        assert.equal(await redis.xdel(identity.completionStream, completionId), 1, `failed to delete smoke completion ${completionId}`);
        await redis.del(identity.telemetryStream, identity.telemetrySequenceKey);
      }
    } finally {
      await redisTool.disconnect();
    }
  }
}

function kubectl(args, options = {}) {
  return execFileSync('kubectl', ['-n', process.env.KUBECLAW_NAMESPACE || DEFAULT_NAMESPACE, ...args], {
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
  });
}

function deployedPod(instance) {
  kubectl(['rollout', 'status', `deployment/${instance}`, '--timeout=180s']);
  const podList = JSON.parse(kubectl(['get', 'pod', '-l', `app.kubernetes.io/instance=${instance}`, '-o', 'json']));
  const pod = podList.items?.find((candidate) => (
    !candidate.metadata?.deletionTimestamp
    && candidate.status?.phase === 'Running'
    && candidate.status?.conditions?.some((condition) => condition.type === 'Ready' && condition.status === 'True')
  ));
  return requiredString(pod?.metadata?.name, `${instance} ready pod`);
}

async function execStreaming(command, args, input) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.stdin.end(input);
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} exited with code ${code ?? 'null'} signal ${signal || 'none'}`));
    });
  });
}

async function waitForKubernetesResourceAbsent(args, label, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      execFileSync('kubectl', args, { stdio: 'ignore' });
    } catch {
      return;
    }
    await sleep(1000);
  }
  throw new Error(`${label} still exists after ${timeoutMs}ms`);
}

function validateArtifactDir(value) {
  const normalized = requiredString(value, 'artifact_dir');
  if (!/^Projects\/buster-infra-smoke\/src\/\.swarm\/live-buster-infra\/[a-zA-Z0-9-]+$/.test(normalized)) {
    throw new Error(`refusing unsafe Buster artifact cleanup path: ${normalized}`);
  }
  return normalized;
}

async function runOutside() {
  const namespace = process.env.KUBECLAW_NAMESPACE || DEFAULT_NAMESPACE;
  const commitHash = sourceCommit();
  const novaPod = deployedPod('agent-nova');
  const busterPod = deployedPod('agent-buster');
  let result = null;
  try {
    const output = await execStreaming('kubectl', [
      'exec', '-i', '-n', namespace, novaPod, '-c', 'kubeclaw', '--',
      'env', `LIVE_BUSTER_INFRA_COMMIT=${commitHash}`,
      'node', '--input-type=module', '-', '--inside',
    ], fs.readFileSync(fileURLToPath(import.meta.url), 'utf8'));
    result = parseResultMarker(output);
    assert.equal(result.ok, true);
    await waitForKubernetesResourceAbsent(['get', 'busternamespacelease', result.namespace, '-n', namespace], `BusterNamespaceLease/${result.namespace}`);
    await waitForKubernetesResourceAbsent(['get', 'namespace', result.namespace], `Namespace/${result.namespace}`);
    console.log(JSON.stringify({ ...result, lease_cleaned: true, namespace_cleaned: true }, null, 2));
  } finally {
    if (result?.artifact_dir) {
      const artifactDir = validateArtifactDir(result.artifact_dir);
      const absolute = `${REMOTE_REPO_ROOT}/${artifactDir}`;
      execFileSync('kubectl', [
        'exec', '-n', namespace, busterPod, '-c', 'buster-pipeline', '--',
        'rm', '-rf', '--', absolute,
      ], { stdio: 'inherit' });
    }
  }
}

async function main() {
  if (process.argv.includes('--inside')) await runInside();
  else await runOutside();
}

const runsFromStdin = process.argv.includes('--inside');
const currentPath = runsFromStdin ? null : fs.realpathSync(fileURLToPath(import.meta.url));
const entryPath = !runsFromStdin && process.argv[1] && fs.existsSync(process.argv[1]) ? fs.realpathSync(process.argv[1]) : process.argv[1];
if (runsFromStdin || currentPath === entryPath) {
  main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
}
