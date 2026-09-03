import type { AdapterActivationContext } from '@kubeclaw/plugin-sdk';
import type { OpenClawTarget } from './openclaw.ts';
import { openClawToolDetails, record } from './openclaw-response.ts';

type JsonRecord = Record<string, unknown>;
function first(...values: readonly unknown[]): unknown { return values.find((value) => value !== undefined && value !== null); }
export interface OpenClawSessionState { readonly terminal: boolean; readonly state: string; readonly model?: string }
export interface OpenClawSessionIdentity {
  readonly sessionKey: string;
  readonly runId: string;
  readonly taskId: string;
  readonly model?: string;
}

// eslint-disable-next-line complexity -- Current and legacy session lists expose several equivalent identity/state fields.
function terminal(value: unknown, identity: OpenClawSessionIdentity, subagent: boolean): OpenClawSessionState {
  const source = openClawToolDetails(value);
  if (!record(source)) return { terminal: false, state: 'unknown' };
  if (subagent) {
    for (const collection of [source.tasks, source.active, source.recent]) {
      if (!Array.isArray(collection)) continue;
      const match = collection.find((entry) => record(entry) && [
        entry.taskId, entry.task_id, entry.runId, entry.run_id, entry.sessionKey, entry.session_key,
      ].some((candidate) => candidate === identity.taskId || candidate === identity.runId
        || candidate === identity.sessionKey));
      if (record(match)) {
        const state = String(first(match.status, match.state) ?? 'unknown').toLowerCase();
        const model = typeof match.model === 'string' ? match.model : identity.model;
        return { terminal: ['completed', 'complete', 'done', 'succeeded', 'ended', 'failed', 'cancelled', 'canceled', 'error'].includes(state), state,
          ...(model ? { model } : {}) };
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

// eslint-disable-next-line max-params -- Capability context, authenticated target, tool, args, and idempotency are separate trust inputs.
export async function gateway(context: AdapterActivationContext, target: OpenClawTarget, token: string, tool: string,
  args: JsonRecord, idempotencyKey?: string): Promise<unknown> {
  const resource = new URL(target.endpoint);
  if (idempotencyKey) resource.hash = `kubeclaw=${encodeURIComponent(idempotencyKey)}`;
  const response = await context.invokeConfidential('network.http', { operation: 'request', resource: { type: 'network.url', canonicalId: resource.toString() }, payload: { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: { tool, args, ...(idempotencyKey ? { idempotencyKey } : {}) } } });
  if (!record(response) || response.status !== 200) throw new Error(`OPENCLAW_GATEWAY_${tool.toUpperCase()}_FAILED`);
  return response.body;
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
      ? await gateway(context, target, token, 'subagents', { action: 'list', recentMinutes: Math.max(10, Math.ceil(target.sessionTimeoutMs / 60_000) + 5) })
      : await gateway(context, target, token, 'session_status', { sessionKey: identity.sessionKey });
    const result = terminal(status, identity, target.runtime === 'subagent');
    if (result.terminal) return result;
    if (poll + 1 === target.maxPolls) throw new Error('OPENCLAW_SESSION_TIMEOUT');
    const delay = Math.min(target.maxPollMs, target.pollMs * (2 ** Math.min(poll, 8)));
    await wait(Math.min(delay, Math.max(1, deadline - Date.now())), signal);
  }
  throw new Error('OPENCLAW_SESSION_TIMEOUT');
}

export async function cancelSession(context: AdapterActivationContext, target: OpenClawTarget, token: string, identity: OpenClawSessionIdentity): Promise<void> {
  try {
    if (target.runtime === 'subagent') await gateway(context, target, token, 'subagents', { action: 'cancel', taskId: identity.taskId }, `cancel:${identity.runId}`);
    else await gateway(context, target, token, 'sessions_send', { sessionKey: identity.sessionKey, message: 'Stop immediately. The owning pipeline invocation was cancelled.' }, `cancel:${identity.runId}`);
  } catch (_error) {
    /* INTENTIONAL_NONCRITICAL(session_cancel_failed): Cancellation cleanup is best effort. */
    void _error;
  }
}
