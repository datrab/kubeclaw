import type { AdapterActivationContext } from '@kubeclaw/plugin-sdk';
import type { OpenClawTarget } from './openclaw.ts';

type JsonRecord = Record<string, unknown>;
function record(value: unknown): value is JsonRecord { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function details(value: unknown): unknown {
  if (!record(value)) return value;
  if ('output' in value && Object.keys(value).every((key) => ['ok', 'toolName', 'output', 'source'].includes(key))) return details(value.output);
  if ('details' in value) return details(value.details);
  if ('result' in value && Object.keys(value).every((key) => ['ok', 'result', 'error'].includes(key))) return details(value.result);
  return value;
}
function first(...values: readonly unknown[]): unknown { return values.find((value) => value !== undefined && value !== null); }
function terminal(value: unknown, key: string, subagent: boolean): Readonly<{ terminal: boolean; state: string }> {
  const source = details(value);
  if (!record(source)) return { terminal: false, state: 'unknown' };
  if (subagent) {
    for (const collection of [source.active, source.recent]) {
      if (!Array.isArray(collection)) continue;
      const match = collection.find((entry) => record(entry) && (entry.sessionKey === key || entry.session_key === key));
      if (record(match)) {
        const state = String(first(match.status, match.state) ?? 'unknown').toLowerCase();
        return { terminal: ['completed', 'complete', 'done', 'succeeded', 'ended', 'failed', 'cancelled', 'canceled', 'error'].includes(state), state };
      }
    }
    return { terminal: false, state: 'unknown' };
  }
  const nested = record(source.session) ? first(source.session.state, source.session.status) : undefined;
  let state = String(first(source.state, source.status, nested) ?? 'unknown').toLowerCase();
  if (state === 'unknown' && typeof source.statusText === 'string') state = source.statusText.match(/Tasks:\s+latest\s+([a-z_]+)/i)?.[1]?.toLowerCase() ?? state;
  return { terminal: ['completed', 'complete', 'done', 'succeeded', 'idle', 'ended', 'closed', 'failed', 'cancelled', 'canceled', 'error'].includes(state), state };
}

export async function gateway(context: AdapterActivationContext, target: OpenClawTarget, token: string, tool: string, args: JsonRecord, identity = tool): Promise<unknown> {
  const resource = new URL(target.endpoint); resource.hash = `kubeclaw=${encodeURIComponent(identity)}`;
  const response = await context.invokeConfidential('network.http', { operation: 'request', resource: { type: 'network.url', canonicalId: resource.toString() }, payload: { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: { tool, args } } });
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

export async function pollSession(context: AdapterActivationContext, target: OpenClawTarget, token: string, key: string, signal: AbortSignal): Promise<string> {
  const deadline = Date.now() + target.sessionTimeoutMs;
  for (let poll = 0; poll < target.maxPolls; poll += 1) {
    if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
    if (Date.now() >= deadline) throw new Error('OPENCLAW_SESSION_TIMEOUT');
    const status = target.runtime === 'subagent'
      ? await gateway(context, target, token, 'subagents', { action: 'list', recentMinutes: Math.max(10, Math.ceil(target.sessionTimeoutMs / 60_000) + 5) }, `status:${key}:${poll}`)
      : await gateway(context, target, token, 'session_status', { sessionKey: key }, `status:${key}:${poll}`);
    const result = terminal(status, key, target.runtime === 'subagent');
    if (result.terminal) return result.state;
    if (poll + 1 === target.maxPolls) throw new Error('OPENCLAW_SESSION_TIMEOUT');
    const delay = Math.min(target.maxPollMs, target.pollMs * (2 ** Math.min(poll, 8)));
    await wait(Math.min(delay, Math.max(1, deadline - Date.now())), signal);
  }
  throw new Error('OPENCLAW_SESSION_TIMEOUT');
}

export async function cancelSession(context: AdapterActivationContext, target: OpenClawTarget, token: string, key: string): Promise<void> {
  try {
    if (target.runtime === 'subagent') await gateway(context, target, token, 'subagents', { action: 'kill', target: key });
    else await gateway(context, target, token, 'sessions_send', { sessionKey: key, message: 'Stop immediately. The owning pipeline invocation was cancelled.' });
  } catch {
    // INTENTIONAL_NONCRITICAL(session_cancel_failed): Cancellation cleanup is best effort.
  }
}
