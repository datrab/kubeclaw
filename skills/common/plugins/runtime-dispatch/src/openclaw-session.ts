import type { AdapterActivationContext } from '@kubeclaw/plugin-sdk';
import type { OpenClawTarget } from './openclaw.ts';
import { assertOpenClawToolAccepted, openClawToolDetails, record } from './openclaw-response.ts';

type JsonRecord = Record<string, unknown>;
function first(...values: readonly unknown[]): unknown { return values.find((value) => value !== undefined && value !== null); }
export interface OpenClawSessionState {
  readonly terminal: boolean;
  readonly state: string;
  readonly model?: string;
  readonly taskId?: string;
  readonly result?: string;
  readonly structured?: unknown;
  readonly error?: string;
  readonly schemaError?: string;
}
export interface OpenClawSessionIdentity {
  readonly sessionKey: string;
  readonly runId: string;
  readonly taskId?: string;
  readonly label: string;
  readonly model?: string;
}

interface SessionListCacheEntry {
  readonly expiresAt: number;
  readonly response: Promise<unknown>;
}

const SESSION_LIST_CACHE = new WeakMap<AdapterActivationContext, Map<string, SessionListCacheEntry>>();

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function sessionListEntries(value: unknown): readonly JsonRecord[] {
  const source = openClawToolDetails(value);
  if (!record(source)) return [];
  return [source.tasks, source.active, source.recent]
    .flatMap((collection) => Array.isArray(collection) ? collection : [])
    .filter(record);
}

function entryIdentifiers(entry: JsonRecord): readonly string[] {
  return [entry.taskId, entry.task_id, entry.runId, entry.run_id, entry.sessionKey, entry.session_key]
    .map(optionalText).filter((value): value is string => value !== undefined);
}

function includeIdentifiers(target: Set<string>, values: readonly string[]): boolean {
  const missing = values.filter((value) => !target.has(value));
  missing.forEach((value) => target.add(value));
  return missing.length > 0;
}

/** Resolve one previously accepted deterministic task, failing closed if its label is ambiguous or incomplete. */
// eslint-disable-next-line complexity -- Registry normalization joins current task, active, and recent projections.
export function registeredSessionIdentity(
  value: unknown, label: string, expectedModel: string,
): OpenClawSessionIdentity | undefined {
  const entries = sessionListEntries(value);
  const exact = entries.filter((entry) => optionalText(entry.label) === label);
  if (exact.length === 0) return undefined;
  const identifiers = new Set(exact.flatMap(entryIdentifiers));
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of entries) {
      const ids = entryIdentifiers(entry);
      if (optionalText(entry.label) !== label && !ids.some((id) => identifiers.has(id))) continue;
      changed = includeIdentifiers(identifiers, ids) || changed;
    }
  }
  const related = entries.filter((entry) => optionalText(entry.label) === label
    || entryIdentifiers(entry).some((id) => identifiers.has(id)));
  const runIds = new Set(related.map((entry) => optionalText(first(entry.runId, entry.run_id)))
    .filter((value): value is string => value !== undefined));
  if (runIds.size > 1) throw new Error(`OPENCLAW_SESSION_REATTACHMENT_AMBIGUOUS:${label}`);
  const runId = [...runIds][0];
  const sessionKey = related.map((entry) => optionalText(first(entry.sessionKey, entry.session_key)))
    .find((value): value is string => value !== undefined);
  if (!runId || !sessionKey) throw new Error(`OPENCLAW_SESSION_REATTACHMENT_INCOMPLETE:${label}`);
  const taskId = related.map((entry) => optionalText(first(entry.taskId, entry.task_id)))
    .find((value): value is string => value !== undefined);
  const models = new Set(related.map((entry) => optionalText(entry.model))
    .filter((value): value is string => value !== undefined));
  if ([...models].some((model) => model !== expectedModel)) throw new Error('OPENCLAW_SESSION_MODEL_MISMATCH');
  return Object.freeze({ sessionKey, runId, label, model: expectedModel, ...(taskId ? { taskId } : {}) });
}

// eslint-disable-next-line complexity -- Current and legacy session lists expose several equivalent identity/state fields.
function terminal(value: unknown, identity: OpenClawSessionIdentity, subagent: boolean): OpenClawSessionState {
  const source = openClawToolDetails(value);
  if (!record(source)) return { terminal: false, state: 'unknown' };
  if (subagent) {
    const expected = new Set([identity.taskId, identity.runId, identity.sessionKey, identity.label]
      .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0));
    for (const collection of [source.tasks, source.active, source.recent]) {
      if (!Array.isArray(collection)) continue;
      const match = collection.find((entry) => record(entry) && [
        entry.taskId, entry.task_id, entry.runId, entry.run_id, entry.sessionKey, entry.session_key,
        entry.label,
      ].some((candidate) => typeof candidate === 'string' && expected.has(candidate)));
      if (record(match)) {
        const state = String(first(match.status, match.state) ?? 'unknown').toLowerCase();
        const model = typeof match.model === 'string' ? match.model : identity.model;
        const taskId = typeof match.taskId === 'string' ? match.taskId : identity.taskId;
        return { terminal: ['completed', 'complete', 'done', 'succeeded', 'ended', 'failed', 'cancelled', 'canceled', 'error'].includes(state), state,
          ...(model ? { model } : {}), ...(taskId ? { taskId } : {}) };
      }
    }
    return { terminal: false, state: 'unknown' };
  }
  const nested = record(source.session) ? first(source.session.state, source.session.status) : undefined;
  let state = String(first(source.state, source.status, nested) ?? 'unknown').toLowerCase();
  const model = first(source.model, record(source.session) ? source.session.model : undefined);
  if (state === 'unknown' && typeof source.statusText === 'string') state = source.statusText.match(/Tasks:\s+latest\s+([a-z_]+)/i)?.[1]?.toLowerCase() ?? state;
  return { terminal: ['completed', 'complete', 'done', 'succeeded', 'idle', 'ended', 'closed', 'failed', 'cancelled', 'canceled', 'error'].includes(state), state,
    ...(typeof model === 'string' ? { model } : {}) };
}

function collectorTerminal(value: unknown, identity: OpenClawSessionIdentity): OpenClawSessionState {
  const source = openClawToolDetails(value);
  if (!record(source) || !Array.isArray(source.completed)) return { terminal: false, state: 'unknown' };
  const match = source.completed.find((entry) => record(entry) && entry.runId === identity.runId);
  if (!record(match)) return { terminal: false, state: 'unknown' };
  const state = String(match.status ?? 'unknown').toLowerCase();
  return {
    terminal: true,
    state,
    ...(identity.model ? { model: identity.model } : {}),
    ...(typeof match.result === 'string' ? { result: match.result } : {}),
    ...(match.structured !== undefined ? { structured: match.structured } : {}),
    ...(typeof match.error === 'string' ? { error: match.error } : {}),
    ...(typeof match.schemaError === 'string' ? { schemaError: match.schemaError } : {}),
  };
}

// eslint-disable-next-line max-params -- Capability context, authenticated target, tool, args, and idempotency are separate trust inputs.
export async function gateway(context: AdapterActivationContext, target: OpenClawTarget, token: string, tool: string,
  args: JsonRecord, idempotencyKey?: string): Promise<unknown> {
  const resource = new URL(target.endpoint);
  if (idempotencyKey) resource.hash = `kubeclaw=${encodeURIComponent(idempotencyKey)}`;
  const response = await context.invokeConfidential('network.http', { operation: 'request', resource: { type: 'network.url', canonicalId: resource.toString() }, payload: { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: { tool, args, ...(target.controllerSessionKey ? { sessionKey: target.controllerSessionKey } : {}), ...(idempotencyKey ? { idempotencyKey } : {}) } } });
  if (!record(response) || response.status !== 200) throw new Error(`OPENCLAW_GATEWAY_${tool.toUpperCase()}_FAILED`);
  assertOpenClawToolAccepted(response.body, tool);
  return response.body;
}

async function cachedSessionList(
  context: AdapterActivationContext, target: OpenClawTarget, token: string,
): Promise<unknown> {
  let cache = SESSION_LIST_CACHE.get(context);
  if (!cache) { cache = new Map(); SESSION_LIST_CACHE.set(context, cache); }
  const recentMinutes = Math.max(10, Math.ceil(target.sessionTimeoutMs / 60_000) + 5);
  const key = `${target.endpoint}\u0000${target.controllerSessionKey ?? ''}\u0000${recentMinutes}`;
  const current = cache.get(key);
  if (current && current.expiresAt > Date.now()) return current.response;
  const response = gateway(context, target, token, 'subagents', { action: 'list', recentMinutes });
  cache.set(key, { expiresAt: Date.now() + 250, response });
  try { return await response; }
  catch (error) { if (cache.get(key)?.response === response) cache.delete(key); throw error; }
}

export async function findRegisteredSession(
  context: AdapterActivationContext, target: OpenClawTarget, token: string, label: string,
): Promise<OpenClawSessionIdentity | undefined> {
  if (target.runtime !== 'subagent') return undefined;
  return registeredSessionIdentity(await cachedSessionList(context, target, token), label, target.model);
}

async function wait(ms: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const finish = (): void => { signal.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(finish, ms);
    const abort = (): void => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new Error('ADAPTER_CANCELLED')); };
    signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
  });
}

export async function pollSession(context: AdapterActivationContext, target: OpenClawTarget, token: string, identity: OpenClawSessionIdentity, signal: AbortSignal): Promise<OpenClawSessionState> {
  const deadline = Date.now() + target.sessionTimeoutMs;
  for (let poll = 0; poll < target.maxPolls; poll += 1) {
    if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
    if (Date.now() >= deadline) throw new Error('OPENCLAW_SESSION_TIMEOUT');
    const status = target.runtime === 'subagent'
      ? target.collectorMode
        ? await gateway(context, target, token, 'agents_wait', { ids: [identity.runId], timeoutSeconds: 15 })
        : await gateway(context, target, token, 'subagents', { action: 'list', recentMinutes: Math.max(10, Math.ceil(target.sessionTimeoutMs / 60_000) + 5) })
      : await gateway(context, target, token, 'session_status', { sessionKey: identity.sessionKey });
    const result = target.collectorMode ? collectorTerminal(status, identity)
      : terminal(status, identity, target.runtime === 'subagent');
    if (result.terminal) return result;
    if (poll + 1 === target.maxPolls) throw new Error('OPENCLAW_SESSION_TIMEOUT');
    const delay = Math.min(target.maxPollMs, target.pollMs * (2 ** Math.min(poll, 8)));
    await wait(Math.min(delay, Math.max(1, deadline - Date.now())), signal);
  }
  throw new Error('OPENCLAW_SESSION_TIMEOUT');
}

export async function cancelSession(context: AdapterActivationContext, target: OpenClawTarget, token: string, identity: OpenClawSessionIdentity): Promise<void> {
  try {
    if (target.runtime === 'subagent') {
      const taskId = identity.taskId ?? (await pollSessionIdentity(context, target, token, identity));
      if (!taskId) throw new Error('OPENCLAW_TASK_ID_UNRESOLVED');
      await gateway(context, target, token, 'subagents', { action: 'cancel', taskId }, `cancel:${identity.runId}`);
    }
    else await gateway(context, target, token, 'sessions_send', { sessionKey: identity.sessionKey, message: 'Stop immediately. The owning pipeline invocation was cancelled.' }, `cancel:${identity.runId}`);
  } catch (_error) {
    /* INTENTIONAL_NONCRITICAL(session_cancel_failed): Cancellation cleanup is best effort. */
    void _error;
  }
}

async function pollSessionIdentity(context: AdapterActivationContext, target: OpenClawTarget, token: string,
  identity: OpenClawSessionIdentity): Promise<string | undefined> {
  const raw = await gateway(context, target, token, 'subagents', {
    action: 'list', recentMinutes: Math.max(10, Math.ceil(target.sessionTimeoutMs / 60_000) + 5),
  });
  return terminal(raw, identity, true).taskId;
}
