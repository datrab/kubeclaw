#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function argumentsMap(values) {
  const output = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index], value = values[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error('REVIEW_STATUS_FORMAT_ARGUMENTS_INVALID');
    output.set(key.slice(2), value);
  }
  return output;
}

function required(args, name) {
  const value = args.get(name);
  if (!value) throw new Error(`REVIEW_STATUS_FORMAT_${name.toUpperCase().replaceAll('-', '_')}_REQUIRED`);
  return value;
}

function jsonCommand(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8', timeout: 10_000,
    maxBuffer: 2 * 1024 * 1024, ...options });
  if (result.status !== 0) return undefined;
  try { return JSON.parse(result.stdout); } catch (_error) { return undefined; }
}
function optionalJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_error) { return undefined; }
}

function taskDetails(sessionKey, openclawBin) {
  const params = JSON.stringify({ name: 'subagents', args: { action: 'list', recentMinutes: 10 }, sessionKey });
  const envelope = jsonCommand(openclawBin, ['gateway', 'call', 'tools.invoke', '--json', '--params', params,
    '--timeout', '5000']);
  return envelope?.output?.details;
}

function activeTasks(details) {
  if (!details || typeof details !== 'object') return undefined;
  const values = Array.isArray(details?.active) ? details.active
    : Array.isArray(details?.tasks) ? details.tasks.filter((task) => ['accepted', 'pending', 'queued', 'running']
      .includes(String(task?.status ?? '').toLowerCase())) : [];
  return values.length;
}

function gibibytes(value) {
  return Number.isFinite(value) ? `${(value / 1024 ** 3).toFixed(2)} GiB` : 'unavailable';
}

function percent(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : 'unavailable';
}

function utcTime(date = new Date()) {
  return date.toISOString().slice(11, 19);
}

function format(values) {
  const args = argumentsMap(values), workdir = path.resolve(args.get('workdir') ?? process.cwd());
  const reopen = args.get('reopen-status') ? optionalJson(path.resolve(args.get('reopen-status'))) : undefined;
  const reopenPending = ['waiting-for-preflight', 'preflight-succeeded', 'reopening'].includes(reopen?.state);
  const status = jsonCommand(process.execPath, [path.join(workdir, 'scripts', 'repository-review-status.mjs'),
    '--platform', required(args, 'platform'), '--run-id', required(args, 'run-id'),
    '--heartbeat', required(args, 'heartbeat'), '--resource-log', required(args, 'resource-log'),
    '--stale-after-seconds', args.get('stale-after-seconds') ?? '120'], { cwd: workdir });
  if (!status) throw new Error('REVIEW_STATUS_FORMAT_STATUS_UNAVAILABLE');
  const configuredConcurrency = Number(args.get('configured-concurrency') ?? '10');
  const staleAfterSeconds = Number(args.get('stale-after-seconds') ?? '120');
  const controllerSessionKey = args.get('controller-session-key') ?? 'agent:main:nova-review-controller';
  const details = taskDetails(controllerSessionKey, args.get('openclaw-bin') ?? 'openclaw');
  const active = activeTasks(details);
  const observedActive = Number.isFinite(active) ? Math.max(active, status.activeDispatches ?? 0)
    : status.activeDispatches;
  const running = Number.isFinite(observedActive) ? Math.min(observedActive, status.remainingPrimary) : 'unavailable';
  const remaining = status.remainingPrimary;
  const processText = status.liveness === 'active'
    ? status.health === 'degraded'
      ? `The supervised attempt is degraded; ${status.recentResourceLockExpired} resource-lock expiries occurred in the last 15 minutes.`
      : 'The supervised execute attempt is active.'
    : status.liveness === 'terminal' && reopenPending
      ? `The run is blocked; its detached reopen controller is ${reopen.state.replaceAll('-', ' ')} (preflight attempt ${reopen.attempt ?? 'unknown'}).`
      : status.liveness === 'terminal' ? `The run is terminal (${status.status}).`
      : 'The run is nonterminal but its supervisor heartbeat is stale.';
  const gateway = status.resources?.gateway?.healthy === true
    ? 'connectivity probe healthy' : 'connectivity probe unhealthy or unavailable';
  const resourcesFresh = Number.isFinite(status.resources?.ageSeconds)
    && status.resources.ageSeconds <= staleAfterSeconds;
  const nextMinutes = Number(args.get('interval-minutes') ?? '10');
  const next = new Date(Date.now() + nextMinutes * 60_000);
  return [
    `Active as of ${utcTime()} UTC`, '',
    `Primary batches: ${status.plannedPrimary} planned; ${status.completedReviewCheckpoints} completed; ${running} running; ${remaining} remaining. ${processText}`,
    `Actual concurrency: ${observedActive ?? 'unavailable'} reviewer agents active; ${status.requestedDispatches ?? 0} dispatches await acceptance. Configured concurrency is ${configuredConcurrency}.`,
    `Expansion / verification: ${status.completedContextExpansionCheckpoints} / ${status.completedVerificationCheckpoints} checkpointed.`,
    `Tokens: ${status.actualTokenUsage === 'unavailable_until_imported_results_expose_usage' ? 'actual reviewer usage unavailable' : status.actualTokenUsage}. Plan estimate: ${status.estimatedInputTokens.toLocaleString('en-US')} input tokens.`,
    `Recovery: attempt ${status.attempt ?? 'unknown'} in ${status.recoveryMode ?? 'unknown'} mode; liveness ${status.liveness}; last durable event ${status.lastEventAt ?? 'unavailable'}.`,
    `Resources: current CPU ${percent(resourcesFresh ? status.resources?.currentCpuPercent : undefined)}, peak ${percent(status.resources?.peakCpuPercent)}; current RAM ${gibibytes(resourcesFresh ? status.resources?.currentRamBytes : undefined)}, peak ${gibibytes(status.resources?.peakRamBytes)}; OOM kills ${status.resources?.oomKillEvents ?? 'unknown'}${resourcesFresh ? '' : `; latest sample stale (${status.resources?.observedAt ?? 'unavailable'})`}.`,
    `Gateway: ${resourcesFresh ? gateway : 'latest connectivity probe stale or unavailable'}. Supervised pipeline PID ${status.pipelinePid ?? 'not visible'}.`,
    status.liveness === 'terminal' && !reopenPending ? 'Monitoring can now be disabled.'
      : `Monitoring remains enabled on its ${nextMinutes}-minute cadence; next check is approximately ${utcTime(next)} UTC.`,
  ].join('\n');
}

process.stdout.write(`${format(process.argv.slice(2))}\n`);
