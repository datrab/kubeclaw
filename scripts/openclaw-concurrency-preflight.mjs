#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const TERMINAL = new Set(['cancelled', 'canceled', 'completed', 'done', 'failed', 'succeeded']);

function argumentsMap(values) {
  const output = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index], value = values[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error('OPENCLAW_PREFLIGHT_ARGUMENTS_INVALID');
    output.set(key.slice(2), value);
  }
  return output;
}

function positiveInteger(value, label, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`OPENCLAW_PREFLIGHT_${label.toUpperCase()}_INVALID`);
  }
  return parsed;
}

async function invoke(name, args, sessionKey, timeoutMs, idempotencyKey) {
  const params = JSON.stringify({ name, args, sessionKey, ...(idempotencyKey ? { idempotencyKey } : {}) });
  let envelope;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const { stdout } = await execute('openclaw', [
        'gateway', 'call', 'tools.invoke', '--json', '--params', params, '--timeout', String(timeoutMs),
      ], { maxBuffer: 1024 * 1024 });
      envelope = JSON.parse(stdout);
    } catch (error) {
      const stdout = typeof error?.stdout === 'string' ? error.stdout : '';
      try { envelope = JSON.parse(stdout); } catch (_parseError) { envelope = undefined; }
      if (attempt < 3 && envelope?.error?.type === 'cli_error') {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
        continue;
      }
      if (!envelope) throw new Error(`OPENCLAW_PREFLIGHT_${name.toUpperCase()}_TRANSPORT_FAILED`);
    }
    if (attempt < 3 && envelope?.error?.type === 'cli_error') {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      continue;
    }
    break;
  }
  const details = envelope?.output?.details;
  if (envelope?.ok !== true || envelope?.isError === true || !details || typeof details !== 'object') {
    const status = typeof details?.status === 'string' ? details.status
      : (typeof envelope?.error?.type === 'string' ? envelope.error.type : 'error');
    const cap = typeof details?.governingCap === 'string' ? `:${details.governingCap}` : '';
    throw new Error(`OPENCLAW_PREFLIGHT_${name.toUpperCase()}_REJECTED:${status}${cap}`);
  }
  return details;
}

function acceptedIdentity(value, label) {
  if (value.status !== 'accepted') {
    const status = typeof value.status === 'string' ? value.status : 'rejected';
    const cap = typeof value.governingCap === 'string' ? `:${value.governingCap}` : '';
    throw new Error(`OPENCLAW_PREFLIGHT_SESSIONS_SPAWN_REJECTED:${status}${cap}`);
  }
  if (typeof value.runId !== 'string' || typeof value.childSessionKey !== 'string') {
    throw new Error('OPENCLAW_PREFLIGHT_SESSIONS_SPAWN_ACCEPTED_IDENTITY_INCOMPLETE');
  }
  return { runId: value.runId, childSessionKey: value.childSessionKey, label,
    ...(typeof value.taskId === 'string' ? { taskId: value.taskId } : {}) };
}

function matchingTask(details, identity) {
  for (const collection of [details.tasks, details.active, details.recent]) {
    if (!Array.isArray(collection)) continue;
    const match = collection.find((entry) => entry && typeof entry === 'object'
      && (entry.taskId === identity.taskId || entry.runId === identity.runId || entry.label === identity.label));
    if (match) return match;
  }
  return undefined;
}

async function cancelAll(identities, sessionKey, timeoutMs) {
  const details = identities.some(({ taskId }) => !taskId)
    ? await invoke('subagents', { action: 'list', recentMinutes: 10 }, sessionKey, timeoutMs)
    : undefined;
  await Promise.allSettled(identities.map((identity) => {
    const taskId = identity.taskId ?? matchingTask(details, identity)?.taskId;
    if (typeof taskId !== 'string') return Promise.resolve();
    return invoke('subagents', { action: 'cancel', taskId }, sessionKey, timeoutMs, `preflight-cancel:${taskId}`);
  }));
}

async function main(values) {
  const args = argumentsMap(values);
  const concurrency = positiveInteger(args.get('concurrency') ?? '1', 'concurrency', 100);
  const timeoutMs = positiveInteger(args.get('timeout-ms') ?? '120000', 'timeout_ms', 3_600_000);
  const sessionKey = args.get('session-key') ?? 'agent:main:nova-review-controller';
  const agentId = args.get('agent-id') ?? 'main';
  const model = args.get('model');
  const thinking = args.get('thinking') ?? 'high';
  if (!model) throw new Error('OPENCLAW_PREFLIGHT_MODEL_REQUIRED');
  const prefix = `nova-capacity-${Date.now()}`;
  const accepted = [];
  try {
    const results = await Promise.allSettled(Array.from({ length: concurrency }, async (_, index) => {
      const label = `${prefix}-${index + 1}`;
      const details = await invoke('sessions_spawn', {
        runtime: 'subagent', mode: 'run', cleanup: 'delete', thread: false,
        agentId, model, thinking,
        label,
        task: `Capacity preflight ${index + 1}/${concurrency}. Do not call tools. Return exactly ANNOUNCE_SKIP.`,
      }, sessionKey, timeoutMs, `preflight-spawn:${prefix}:${index + 1}`);
      const identity = acceptedIdentity(details, label);
      accepted.push(identity);
      return identity;
    }));
    const refused = results.filter(({ status }) => status === 'rejected');
    if (refused.length > 0) {
      const reasons = refused.map((result) => result.status === 'rejected'
        ? (result.reason instanceof Error ? result.reason.message : String(result.reason)) : 'unknown');
      throw new Error(`OPENCLAW_PREFLIGHT_CAPACITY_REJECTED:${accepted.length}:${concurrency}:${reasons.join(',')}`);
    }
    const deadline = Date.now() + timeoutMs;
    const completed = new Set();
    while (completed.size < concurrency && Date.now() < deadline) {
      const details = await invoke('subagents', { action: 'list', recentMinutes: 10 }, sessionKey, timeoutMs);
      for (const identity of accepted) {
        const task = matchingTask(details, identity);
        const state = typeof task?.status === 'string' ? task.status.toLowerCase() : '';
        if (TERMINAL.has(state)) completed.add(identity.runId);
      }
      if (completed.size < concurrency) await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (completed.size !== concurrency) throw new Error(`OPENCLAW_PREFLIGHT_COMPLETION_TIMEOUT:${completed.size}:${concurrency}`);
    return { schemaVersion: 'openclaw-concurrency-preflight.v1', requested: concurrency,
      accepted: accepted.length, completed: completed.size, model, thinking, controllerSessionKey: sessionKey,
      completionAnnouncementsSuppressed: true, status: 'passed' };
  } catch (error) {
    await cancelAll(accepted, sessionKey, timeoutMs);
    throw error;
  }
}

process.stdout.write(`${JSON.stringify(await main(process.argv.slice(2)))}\n`);
