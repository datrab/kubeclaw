#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const SAMPLE_INTERVAL_MS = 15_000;

function argumentsMap(values) {
  const output = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index], value = values[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error('REVIEW_SUPERVISOR_ARGUMENTS_INVALID');
    output.set(key.slice(2), value);
  }
  return output;
}

function required(args, name) {
  const value = args.get(name);
  if (!value) throw new Error(`REVIEW_SUPERVISOR_${name.toUpperCase().replaceAll('-', '_')}_REQUIRED`);
  return value;
}

function integer(value, label, maximum, minimum = 0) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`REVIEW_SUPERVISOR_${label}_INVALID`);
  }
  return parsed;
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function optionalJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_error) { return undefined; }
}

function appendJsonLine(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}

function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch (_error) { return false; }
}

function processCommand(pid) {
  try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' '); }
  catch (_error) { return ''; }
}

function isOwnedPipeline(pid, runId) {
  const command = processCommand(pid);
  return processAlive(pid) && command.includes('pipeline') && command.includes(runId);
}

function acquireLease(file, runId) {
  const existing = optionalJson(file);
  if (existing && processAlive(existing.supervisorPid)) {
    throw new Error(`REVIEW_SUPERVISOR_ALREADY_ACTIVE:${existing.supervisorPid}`);
  }
  if (fs.existsSync(file)) fs.unlinkSync(file);
  const instanceId = crypto.randomUUID();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const descriptor = fs.openSync(file, 'wx', 0o600);
  fs.writeFileSync(descriptor, `${JSON.stringify({ schemaVersion: 'repository-review-supervisor-lease.v1',
    instanceId, runId, supervisorPid: process.pid, acquiredAt: new Date().toISOString() })}\n`);
  fs.closeSync(descriptor);
  return { file, instanceId };
}

function releaseLease(lease) {
  const current = optionalJson(lease.file);
  if (current?.instanceId === lease.instanceId) fs.unlinkSync(lease.file);
}

function reviewStatus(script, cwd, platform, runId, heartbeat, resourceLog) {
  const result = spawnSync(process.execPath, [script, '--platform', platform, '--run-id', runId,
    '--heartbeat', heartbeat, '--resource-log', resourceLog, '--stale-after-seconds', '120'],
  { cwd, encoding: 'utf8' });
  if (result.status !== 0) return undefined;
  try { return JSON.parse(result.stdout); } catch (_error) { return undefined; }
}

function pipelineArguments(mode, platform, graph, runId) {
  return mode === 'recover'
    ? ['run', 'pipeline', '--', '--platform', platform, '--pipeline', graph, '--recover', runId]
    : ['run', 'pipeline', '--', '--platform', platform, '--pipeline', graph, '--run-id', runId];
}

function readNumber(file) {
  try {
    const value = fs.readFileSync(file, 'utf8').trim();
    return value === 'max' ? value : Number(value);
  } catch (_error) { return undefined; }
}

function readKeyValues(file) {
  try {
    return Object.fromEntries(fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)
      .map((line) => line.trim().split(/\s+/u)).map(([key, value]) => [key, Number(value)]));
  } catch (_error) { return undefined; }
}

function processRssBytes(pid) {
  try {
    const match = fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/^VmRSS:\s+(\d+)\s+kB$/mu);
    return match ? Number(match[1]) * 1024 : undefined;
  } catch (_error) { return undefined; }
}

async function gatewayHealth(gatewayUrl) {
  try {
    const response = await fetch(new URL('/healthz', gatewayUrl), { signal: AbortSignal.timeout(2_000) });
    return { healthy: response.ok, status: response.status };
  } catch (error) {
    return { healthy: false, error: error instanceof Error ? error.name : 'unknown' };
  }
}

async function resourceSample(pipelinePid, gatewayUrl) {
  return {
    schemaVersion: 'repository-review-resource-sample.v1',
    observedAt: new Date().toISOString(), pipelinePid,
    pipelineAlive: processAlive(pipelinePid), pipelineRssBytes: processRssBytes(pipelinePid),
    memoryCurrentBytes: readNumber('/sys/fs/cgroup/memory.current'),
    memoryPeakBytes: readNumber('/sys/fs/cgroup/memory.peak'),
    memoryEvents: readKeyValues('/sys/fs/cgroup/memory.events'),
    cpu: readKeyValues('/sys/fs/cgroup/cpu.stat'),
    gateway: await gatewayHealth(gatewayUrl),
  };
}

async function writeHeartbeat(params) {
  const sample = await resourceSample(params.pipelinePid, params.gatewayUrl);
  appendJsonLine(params.resourceLog, sample);
  atomicJson(params.heartbeat, { schemaVersion: 'repository-review-supervisor-heartbeat.v1',
    updatedAt: sample.observedAt, supervisorPid: process.pid, pipelinePid: params.pipelinePid,
    processAlive: sample.pipelineAlive && !params.stopping, attempt: params.attempt,
    mode: params.mode, gateway: sample.gateway });
  return sample;
}

function runPreflight(args, cwd) {
  const concurrency = args.get('preflight-concurrency');
  const model = args.get('preflight-model');
  if (!concurrency && !model) return;
  if (!concurrency || !model) throw new Error('REVIEW_SUPERVISOR_PREFLIGHT_CONFIG_INCOMPLETE');
  const command = [path.join(cwd, 'scripts', 'openclaw-concurrency-preflight.mjs'),
    '--concurrency', concurrency, '--model', model,
    '--thinking', args.get('preflight-thinking') ?? 'high',
    '--session-key', args.get('controller-session-key') ?? 'agent:main:nova-review-controller',
    '--collector-mode', args.get('preflight-collector-mode') ?? 'false',
    '--timeout-ms', args.get('preflight-timeout-ms') ?? '180000'];
  const result = spawnSync(process.execPath, command, { cwd, encoding: 'utf8', timeout: 240_000,
    maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error(`REVIEW_SUPERVISOR_PREFLIGHT_FAILED:${result.stderr.trim()}`);
  return JSON.parse(result.stdout);
}

async function runAttempt(params, stopSignal) {
  const descriptor = fs.openSync(params.log, 'a');
  const child = spawn('npm', pipelineArguments(params.mode, params.platform, params.graph, params.runId), {
    cwd: params.cwd, detached: true, stdio: ['ignore', descriptor, descriptor], env: process.env,
  });
  const childExit = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  let stopping = false;
  const stop = () => {
    stopping = true;
    if (child.exitCode === null) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch (_error) { child.kill('SIGTERM'); }
    }
  };
  stopSignal.addEventListener('abort', stop, { once: true });
  await writeHeartbeat({ ...params, pipelinePid: child.pid, stopping });
  const timer = setInterval(() => {
    void writeHeartbeat({ ...params, pipelinePid: child.pid, stopping });
  }, SAMPLE_INTERVAL_MS);
  const exit = await childExit;
  clearInterval(timer); stopSignal.removeEventListener('abort', stop); fs.closeSync(descriptor);
  const sample = await writeHeartbeat({ ...params, pipelinePid: child.pid, stopping: true });
  atomicJson(path.join(params.diagnosticDir, `attempt-${params.attempt}-exit.json`), {
    schemaVersion: 'repository-review-attempt-diagnostic.v1', capturedAt: new Date().toISOString(),
    runId: params.runId, attempt: params.attempt, mode: params.mode, exit, stopping, sample,
  });
  return { exit, stopping };
}

async function observeExistingPipeline(params, pipelinePid, stopSignal) {
  while (!stopSignal.aborted && isOwnedPipeline(pipelinePid, params.runId)) {
    await writeHeartbeat({ ...params, pipelinePid, stopping: false });
    const status = reviewStatus(params.statusScript, params.cwd, params.platform, params.runId,
      params.heartbeat, params.resourceLog);
    if (status?.status !== 'running') return { terminal: true };
    await new Promise((resolve) => setTimeout(resolve, SAMPLE_INTERVAL_MS));
  }
  return { terminal: false };
}

async function main(values) {
  const args = argumentsMap(values);
  const cwd = path.resolve(required(args, 'workdir'));
  const platform = path.resolve(required(args, 'platform'));
  const graph = path.resolve(required(args, 'graph'));
  const runId = required(args, 'run-id');
  const heartbeat = path.resolve(required(args, 'heartbeat'));
  const resourceLog = path.resolve(required(args, 'resource-log'));
  const diagnosticDir = path.resolve(required(args, 'diagnostic-dir'));
  const log = path.resolve(required(args, 'log'));
  const gatewayUrl = args.get('gateway-url') ?? 'http://127.0.0.1:18789';
  const maximumRecoveries = integer(args.get('max-recoveries') ?? '5', 'MAX_RECOVERIES', 100);
  const statusScript = path.join(cwd, 'scripts', 'repository-review-status.mjs');
  const lease = acquireLease(path.resolve(args.get('lease') ?? `${heartbeat}.lease`), runId);
  const stopController = new AbortController();
  const stop = () => stopController.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    const existingHeartbeat = optionalJson(heartbeat);
    if (isOwnedPipeline(existingHeartbeat?.pipelinePid, runId)) {
      const observed = await observeExistingPipeline({ cwd, platform, runId, heartbeat, resourceLog,
        statusScript, gatewayUrl, attempt: existingHeartbeat.attempt ?? 0, mode: 'adopted' },
      existingHeartbeat.pipelinePid, stopController.signal);
      if (observed.terminal) return 0;
    }
    const initialStatus = reviewStatus(statusScript, cwd, platform, runId, heartbeat, resourceLog);
    if (initialStatus?.status !== 'running') return 0;
    let mode = args.get('initial-mode') ?? 'auto';
    if (!['auto', 'start', 'recover'].includes(mode)) throw new Error('REVIEW_SUPERVISOR_INITIAL_MODE_INVALID');
    const platformConfig = optionalJson(platform);
    const eventFile = path.join(path.resolve(platformConfig?.storageRoot ?? ''), 'runs', runId, 'events.jsonl');
    if (mode === 'auto') mode = fs.existsSync(eventFile) ? 'recover' : 'start';
    if (mode === 'start') runPreflight(args, cwd);
    for (let attempt = 1; attempt <= maximumRecoveries + 1; attempt += 1) {
      const result = await runAttempt({ cwd, platform, graph, runId, heartbeat, resourceLog,
        diagnosticDir, log, gatewayUrl, mode, attempt }, stopController.signal);
      if (result.stopping) return 130;
      const status = reviewStatus(statusScript, cwd, platform, runId, heartbeat, resourceLog);
      if (status && status.status !== 'running') return status.status === 'succeeded' ? 0 : (result.exit.code || 1);
      if (attempt > maximumRecoveries) return 75;
      mode = 'recover';
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
    return 75;
  } finally {
    process.off('SIGINT', stop); process.off('SIGTERM', stop); releaseLease(lease);
  }
}

process.exitCode = await main(process.argv.slice(2));
