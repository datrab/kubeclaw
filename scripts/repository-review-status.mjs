#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function argumentsMap(values) {
  const output = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index], value = values[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error('usage: repository-review-status --platform <file> --run-id <id>');
    output.set(key.slice(2), value);
  }
  return output;
}

function jsonFile(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function optionalJsonFile(file) {
  try { return jsonFile(file); } catch (_error) { return undefined; }
}
function blobFile(root, digest) {
  const value = String(digest).replace(/^sha256:/u, '');
  return path.join(root, 'blobs', 'sha256', value.slice(0, 2), value.slice(2));
}
function artifactValue(root, artifact) { return jsonFile(blobFile(root, artifact.digest)); }
function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch (_error) { return false; }
}
function activeRuntimeLocks(storageRoot, attemptIds) {
  const root = path.join(storageRoot, 'resource-locks');
  if (!fs.existsSync(root)) return 0;
  let total = 0;
  for (const name of fs.readdirSync(root)) {
    if (!name.endsWith('.active')) continue;
    const owner = optionalJsonFile(path.join(root, name, 'owner.json'));
    const contract = owner?.contract;
    if (contract?.status === 'active' && contract.resource?.type === 'runtime.invocation'
      && attemptIds.has(contract.ownerLeaseId)
      && typeof contract.expiresAt === 'string' && Date.parse(contract.expiresAt) > Date.now()
      && processAlive(owner?.pid)) total += 1;
  }
  return total;
}
function lastLines(file, maximumBytes = 1024 * 1024) {
  const size = fs.statSync(file).size, start = Math.max(0, size - maximumBytes);
  const descriptor = fs.openSync(file, 'r');
  try {
    const bytes = Buffer.alloc(size - start);
    fs.readSync(descriptor, bytes, 0, bytes.length, start);
    const text = bytes.toString('utf8');
    return text.slice(start === 0 ? 0 : Math.max(0, text.indexOf('\n') + 1)).trim().split('\n').filter(Boolean);
  } finally { fs.closeSync(descriptor); }
}

function latestResourceState(file) {
  if (!file || !fs.existsSync(file)) return undefined;
  const values = lastLines(file, 8 * 1024 * 1024).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch (_error) { return []; }
  });
  const current = values.at(-1), previous = values.at(-2);
  if (!current) return undefined;
  const elapsedMs = previous ? Date.parse(current.observedAt) - Date.parse(previous.observedAt) : undefined;
  const usageDelta = previous && Number.isFinite(current.cpu?.usage_usec) && Number.isFinite(previous.cpu?.usage_usec)
    ? current.cpu.usage_usec - previous.cpu.usage_usec : undefined;
  const cpuPercent = elapsedMs > 0 && usageDelta >= 0 ? usageDelta / (elapsedMs * 10) : undefined;
  let peakCpuPercent = cpuPercent, peakRamBytes = current.memoryCurrentBytes;
  for (let index = 1; index < values.length; index += 1) {
    const before = values[index - 1], after = values[index];
    const interval = Date.parse(after.observedAt) - Date.parse(before.observedAt);
    const delta = after.cpu?.usage_usec - before.cpu?.usage_usec;
    if (interval > 0 && Number.isFinite(delta) && delta >= 0) {
      peakCpuPercent = Math.max(peakCpuPercent ?? 0, delta / (interval * 10));
    }
    if (Number.isFinite(after.memoryCurrentBytes)) peakRamBytes = Math.max(peakRamBytes ?? 0, after.memoryCurrentBytes);
  }
  const ageSeconds = Math.max(0, (Date.now() - Date.parse(current.observedAt)) / 1000);
  return { observedAt: current.observedAt, ageSeconds,
    currentCpuPercent: cpuPercent, peakCpuPercent, currentRamBytes: current.memoryCurrentBytes,
    peakRamBytes, cgroupLifetimePeakRamBytes: current.memoryPeakBytes, pipelineRssBytes: current.pipelineRssBytes,
    gateway: current.gateway, oomEvents: current.memoryEvents?.oom, oomKillEvents: current.memoryEvents?.oom_kill };
}

// eslint-disable-next-line max-lines-per-function, complexity -- One bounded read produces a complete machine-readable snapshot.
function status(values) {
const args = argumentsMap(values);
const platformFile = path.resolve(args.get('platform') ?? '');
const runId = args.get('run-id');
if (!runId) throw new Error('run id is required');
const platform = jsonFile(platformFile);
const artifactRoot = path.resolve(platform.adapters['kubeclaw.artifact-store:artifact-store'].artifactRoot);
const recordFile = path.join(artifactRoot, 'records', 'store.json');
const records = (fs.existsSync(recordFile) ? jsonFile(recordFile).records : [])
  .map(({ payload }) => payload).filter((artifact) => artifact.producer.runId === runId);
const unique = new Map(records.map((artifact) => [`${artifact.artifactId}:${artifact.digest}`, artifact]));
let plannedPrimary = 0, estimatedInputTokens = 0, finalReport = false, planReport = false;
const initialDigests = new Set(), review = new Set(), expansion = new Set(), verification = new Set();
for (const artifact of unique.values()) if (artifact.artifactId.startsWith('repository-review-prepared:')) {
  const prepared = artifactValue(artifactRoot, artifact);
  plannedPrimary = prepared.compilation?.jobs?.length ?? plannedPrimary;
  estimatedInputTokens = prepared.compilation?.accounting?.estimatedInputTokens ?? estimatedInputTokens;
  for (const job of prepared.compilation?.jobs ?? []) initialDigests.add(job.digest);
}
for (const artifact of unique.values()) {
  if (artifact.artifactId.startsWith('repository-review-cache:')) {
    const cached = artifactValue(artifactRoot, artifact);
    const protocol = cached.identity?.reviewerProtocol;
    if (protocol === 'kubeclaw.echo-review-scale-verification.v1') verification.add(cached.unitId);
    else if (protocol === 'kubeclaw.echo-review-scale.v1') {
      (initialDigests.has(cached.unitDigest) ? review : expansion).add(cached.unitId);
    }
  } else if (artifact.artifactId.startsWith('repository-review:')) {
    const report = artifactValue(artifactRoot, artifact);
    if (report.schemaVersion === 'repository-review-report.v1') finalReport = true;
    if (report.schemaVersion === 'repository-review-plan.v1') planReport = true;
  }
}
const eventFile = path.join(path.resolve(platform.storageRoot), 'runs', runId, 'events.jsonl');
const stages = {}, terminal = { status: 'running', occurredAt: undefined };
let lastEventAt;
const dispatches = new Map(), recentFailures = [], attemptIds = new Set();
if (fs.existsSync(eventFile)) for (const line of lastLines(eventFile)) {
  const event = JSON.parse(line).entry;
  if (typeof event.identity?.attemptId === 'string') attemptIds.add(event.identity.attemptId);
  if (typeof event.occurredAt === 'string') lastEventAt = event.occurredAt;
  const effectId = event.identity?.effectId;
  if (event.type === 'effect.requested' && event.payload?.capability === 'runtime.dispatch' && effectId) {
    dispatches.set(effectId, 'requested');
  } else if (event.type === 'effect.accepted' && dispatches.has(effectId)) {
    dispatches.set(effectId, 'accepted');
  } else if (['effect.completed', 'effect.failed'].includes(event.type) && effectId) {
    dispatches.delete(effectId);
  }
  if (event.type === 'effect.failed') recentFailures.push({ occurredAt: event.occurredAt,
    code: event.payload?.error?.code, message: event.payload?.error?.message });
  if (['stage.succeeded', 'stage.blocked', 'stage.cancelled', 'stage.failed'].includes(event.type)) {
    stages[event.identity.stageId] = event.type.slice('stage.'.length);
  }
  if (['run.succeeded', 'run.blocked', 'run.cancelled', 'run.failed'].includes(event.type)) {
    terminal.status = event.type.slice('run.'.length); terminal.occurredAt = event.occurredAt;
  } else if (event.type === 'run.resumed') {
    terminal.status = 'running'; terminal.occurredAt = undefined;
  }
}
const heartbeatFile = args.get('heartbeat');
const heartbeat = heartbeatFile ? optionalJsonFile(path.resolve(heartbeatFile)) : undefined;
const resources = latestResourceState(args.get('resource-log') ? path.resolve(args.get('resource-log')) : undefined);
const staleAfterSeconds = Number(args.get('stale-after-seconds') ?? '120');
if (!Number.isFinite(staleAfterSeconds) || staleAfterSeconds < 1) throw new Error('stale-after-seconds is invalid');
const heartbeatAt = typeof heartbeat?.updatedAt === 'string' ? heartbeat.updatedAt : undefined;
const heartbeatAgeSeconds = heartbeatAt ? Math.max(0, (Date.now() - Date.parse(heartbeatAt)) / 1000) : undefined;
const terminalRun = terminal.status !== 'running';
const liveness = terminalRun ? 'terminal' : heartbeatAgeSeconds !== undefined
  && heartbeatAgeSeconds <= staleAfterSeconds && heartbeat?.processAlive === true ? 'active' : 'stale';
const activeDispatches = activeRuntimeLocks(path.resolve(platform.storageRoot), attemptIds);
const requestedDispatches = [...dispatches.values()].filter((value) => value === 'requested').length;
const recentResourceLockExpired = recentFailures.filter(({ occurredAt, message }) =>
  typeof occurredAt === 'string' && Date.now() - Date.parse(occurredAt) <= 15 * 60_000
  && String(message).startsWith('RESOURCE_LOCK_EXPIRED:')).length;
return { schemaVersion: 'repository-review-status.v1', runId,
  status: terminal.status, terminalAt: terminal.occurredAt, stages,
  liveness, lastEventAt, heartbeatAt, heartbeatAgeSeconds,
  pipelinePid: Number.isSafeInteger(heartbeat?.pipelinePid) ? heartbeat.pipelinePid : undefined,
  supervisorPid: Number.isSafeInteger(heartbeat?.supervisorPid) ? heartbeat.supervisorPid : undefined,
  attempt: Number.isSafeInteger(heartbeat?.attempt) ? heartbeat.attempt : undefined,
  recoveryMode: typeof heartbeat?.mode === 'string' ? heartbeat.mode : undefined,
  health: terminalRun ? 'terminal' : recentResourceLockExpired > 0 ? 'degraded' : liveness,
  activeDispatches, requestedDispatches, recentResourceLockExpired,
  lastEffectFailure: recentFailures.at(-1),
  resources,
  plannedPrimary, completedReviewCheckpoints: review.size,
  remainingPrimary: Math.max(0, plannedPrimary - review.size),
  completedContextExpansionCheckpoints: expansion.size,
  completedVerificationCheckpoints: verification.size,
  estimatedInputTokens, actualTokenUsage: 'unavailable_until_imported_results_expose_usage',
  planReport, finalReport, artifactRecords: records.length };
}

process.stdout.write(`${JSON.stringify(status(process.argv.slice(2)))}\n`);
