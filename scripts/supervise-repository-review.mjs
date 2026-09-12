#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { repositoryReviewRunRoot } from './lib/repository-review-run-root.mjs';
import { atomicJson, optionalJson, processAlive, acquireLease, releaseLease } from './lib/repository-review-supervisor-state.mjs';

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

function appendJsonLine(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}

function processCommand(pid) {
  try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' '); }
  catch (_error) { return ''; }
}

function isOwnedPipeline(pid, runId) {
  const command = processCommand(pid);
  return processAlive(pid) && command.includes('pipeline') && command.includes(runId);
}

function reviewStatus(script, cwd, platform, runId, heartbeat, resourceLog) {
  const result = spawnSync(process.execPath, [script, '--platform', platform, '--run-id', runId,
    '--heartbeat', heartbeat, '--resource-log', resourceLog, '--stale-after-seconds', '120'],
  { cwd, encoding: 'utf8', timeout: 30_000 });
  if (result.error || result.status !== 0) {
    throw new Error(`REVIEW_SUPERVISOR_STATUS_FAILED: run=${runId}; exit=${result.status}; signal=${result.signal}; ${result.error?.message ?? ''}\n${result.stderr ?? ''}`, { cause: result.error });
  }
  let status;
  try { status = JSON.parse(result.stdout); }
  catch (cause) { throw new Error(`REVIEW_SUPERVISOR_STATUS_INVALID_JSON: run=${runId}`, { cause }); }
  if (status?.schemaVersion !== 'repository-review-status.v1' || status.runId !== runId
    || !['running', 'succeeded', 'failed', 'blocked', 'cancelled'].includes(status.status)) {
    throw new Error(`REVIEW_SUPERVISOR_STATUS_INVALID: run=${runId}`);
  }
  return status;
}

function terminalExit(status) {
  process.stdout.write(`${JSON.stringify(status)}\n`);
  return status.status === 'succeeded' ? 0 : 1;
}

function pipelineArguments(mode, platform, graph, runId) {
  return mode === 'recover'
    ? ['run', 'pipeline', '--', '--platform', platform, '--pipeline', graph, '--recover', runId]
    : ['run', 'pipeline', '--', '--platform', platform, '--pipeline', graph, '--run-id', runId];
}

function optionalResource(file, parse, observationErrors) {
  try {
    return parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    observationErrors.push({ file, error: error.code ?? error.name });
    return undefined;
  }
}

function readNumber(file, observationErrors) {
  return optionalResource(file, text => {
    const value = text.trim();
    return value === 'max' ? value : Number(value);
  }, observationErrors);
}

function readKeyValues(file, observationErrors) {
  return optionalResource(file, text => Object.fromEntries(text.trim().split('\n').filter(Boolean)
    .map((line) => line.trim().split(/\s+/u)).map(([key, value]) => [key, Number(value)])), observationErrors);
}

function processRssBytes(pid, observationErrors) {
  return optionalResource(`/proc/${pid}/status`, text => {
    const match = text.match(/^VmRSS:\s+(\d+)\s+kB$/mu);
    return match ? Number(match[1]) * 1024 : undefined;
  }, observationErrors);
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
  const observationErrors = [];
  return {
    schemaVersion: 'repository-review-resource-sample.v1',
    observedAt: new Date().toISOString(), pipelinePid,
    pipelineAlive: processAlive(pipelinePid), pipelineRssBytes: processRssBytes(pipelinePid, observationErrors),
    memoryCurrentBytes: readNumber('/sys/fs/cgroup/memory.current', observationErrors),
    memoryPeakBytes: readNumber('/sys/fs/cgroup/memory.peak', observationErrors),
    memoryEvents: readKeyValues('/sys/fs/cgroup/memory.events', observationErrors),
    cpu: readKeyValues('/sys/fs/cgroup/cpu.stat', observationErrors),
    observationErrors,
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
    '--spawn-interval-ms', args.get('preflight-spawn-interval-ms') ?? '1500',
    '--timeout-ms', args.get('preflight-timeout-ms') ?? '180000'];
  const result = spawnSync(process.execPath, command, { cwd, encoding: 'utf8', timeout: 240_000,
    maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error(`REVIEW_SUPERVISOR_PREFLIGHT_FAILED:${result.stderr.trim()}`);
  return JSON.parse(result.stdout);
}

async function runAttempt(params, stopSignal) {
  if (stopSignal.aborted) return { exit: { code: null, signal: null }, stopping: true };
  const descriptor = fs.openSync(params.log, 'a');
  const child = spawn('npm', pipelineArguments(params.mode, params.platform, params.graph, params.runId), {
    cwd: params.cwd, detached: true, stdio: ['ignore', descriptor, descriptor],
  });
  let childError;
  const childExit = new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
    child.once('error', error => {
      childError = error;
      // A post-launch signal error is not evidence that the child exited.
      if (child.pid === undefined) resolve({ code: null, signal: null });
    });
  });
  let stopping = false;
  const stop = () => {
    stopping = true;
    if (child.exitCode === null) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch (_error) { child.kill('SIGTERM'); }
    }
  };
  stopSignal.addEventListener('abort', stop, { once: true });
  if (stopSignal.aborted) stop();
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
    ...(childError ? { [child.pid === undefined ? 'launchError' : 'processError']:
      { code: childError.code, name: childError.name } } : {}),
  });
  if (childError) throw new Error(child.pid === undefined
    ? 'REVIEW_SUPERVISOR_LAUNCH_FAILED' : 'REVIEW_SUPERVISOR_PROCESS_FAILED', { cause: childError });
  return { exit, stopping };
}

async function observeExistingPipeline(params, pipelinePid, stopSignal) {
  while (!stopSignal.aborted && isOwnedPipeline(pipelinePid, params.runId)) {
    await writeHeartbeat({ ...params, pipelinePid, stopping: false });
    const status = reviewStatus(params.statusScript, params.cwd, params.platform, params.runId,
      params.heartbeat, params.resourceLog);
    if (status.status !== 'running') return { terminal: status };
    await new Promise((resolve) => setTimeout(resolve, SAMPLE_INTERVAL_MS));
  }
  return { terminal: false };
}

function waitForRecovery(stopSignal) {
  return new Promise((resolve) => {
    const finish = (resume) => {
      clearTimeout(timer); stopSignal.removeEventListener('abort', stop); resolve(resume);
    };
    const stop = () => finish(false);
    const timer = setTimeout(() => finish(true), 5_000);
    stopSignal.addEventListener('abort', stop, { once: true });
    if (stopSignal.aborted) stop();
  });
}

async function superviseAttempts(params, maximumRecoveries, stopSignal) {
  let mode = params.mode;
  for (let attempt = 1; attempt <= maximumRecoveries + 1; attempt += 1) {
    if (stopSignal.aborted) return 130;
    const result = await runAttempt({ ...params, mode, attempt }, stopSignal);
    if (result.stopping || stopSignal.aborted) return 130;
    const status = reviewStatus(params.statusScript, params.cwd, params.platform, params.runId,
      params.heartbeat, params.resourceLog);
    if (status.status !== 'running') return terminalExit(status);
    if (attempt > maximumRecoveries) return 75;
    mode = 'recover';
    if (!await waitForRecovery(stopSignal)) return 130;
  }
  return 75;
}

function initialMode(args, platform, runId) {
  const mode = args.get('initial-mode') ?? 'auto';
  if (!['auto', 'start', 'recover'].includes(mode)) throw new Error('REVIEW_SUPERVISOR_INITIAL_MODE_INVALID');
  if (mode !== 'auto') return mode;
  const platformConfig = optionalJson(platform);
  const eventFile = path.join(repositoryReviewRunRoot(platformConfig?.storageRoot ?? '', runId), 'events.jsonl');
  return fs.existsSync(eventFile) ? 'recover' : 'start';
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
      if (observed.terminal) return terminalExit(observed.terminal);
    }
    if (stopController.signal.aborted) return 130;
    const initialStatus = reviewStatus(statusScript, cwd, platform, runId, heartbeat, resourceLog);
    if (initialStatus.status !== 'running') return terminalExit(initialStatus);
    const mode = initialMode(args, platform, runId);
    if (mode === 'start') runPreflight(args, cwd);
    return await superviseAttempts({ cwd, platform, graph, runId, heartbeat, resourceLog,
      diagnosticDir, log, gatewayUrl, mode, statusScript }, maximumRecoveries, stopController.signal);
  } finally {
    process.off('SIGINT', stop); process.off('SIGTERM', stop); releaseLease(lease);
  }
}

process.exitCode = await main(process.argv.slice(2));
