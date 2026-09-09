import { createHash } from 'node:crypto';
import type { AgentObservabilityIngressEventV1 } from './generated/agent-observability/index.ts';
import type { AgentEventUnsubscribe } from './plugin-api.ts';

type AgentEventObserver = {
  handleAgentEvent(event: unknown): void;
  logRuntimeSubscriptionFailure(error: unknown): void;
};

type AgentEventGlobalState = {
  observer?: AgentEventObserver;
  unsubscribe?: AgentEventUnsubscribe;
};

const AGENT_EVENT_GLOBAL_STATE_KEY = Symbol.for('kubeclaw.agent-observer.agent-events');

export function isConfigRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function mergeConfigInputs(...configs: unknown[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const config of configs) {
    if (!isConfigRecord(config)) continue;
    for (const [key, value] of Object.entries(config)) {
      if (value !== undefined) merged[key] = value;
    }
  }
  return merged;
}

export function agentEventDedupeKey(event: unknown): string | null {
  if (!isConfigRecord(event)) return null;
  const runId = typeof event.runId === 'string' ? event.runId : '';
  const stream = typeof event.stream === 'string' ? event.stream : '';
  const seq = typeof event.seq === 'number' || typeof event.seq === 'string' ? String(event.seq) : '';
  return runId && stream && seq ? createHash('sha256').update(JSON.stringify([runId, stream, seq])).digest('hex') : null;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isConfigRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

export function ingressEventDedupeKey(event: AgentObservabilityIngressEventV1): string | null {
  // A run/type is not an event identity. Without a source call identity retain
  // the event; runtime sequence dedupe is handled separately at its own boundary.
  if (event.type !== 'openclaw.llm.output' || !event.identity.model_call_id) return null;
  return createHash('sha256').update(JSON.stringify(canonical({
    type: event.type, identity: event.identity, payload: event.payload,
  }))).digest('hex');
}

interface IngressSeen { seenAt: number; hook: boolean; runtime: boolean; paired: boolean }
export class IngressDedupe {
  readonly #recent = new Map<string, IngressSeen>();

  duplicate(key: string | null, runtime: boolean): boolean {
    const now = Date.now();
    for (const [candidate, entry] of this.#recent) if (now - entry.seenAt > 10_000) this.#recent.delete(candidate);
    if (!key) return false;
    const entry = this.#recent.get(key);
    if (!entry) return false;
    if (!runtime && entry.hook) return true;
    const pair = runtime ? entry.hook && !entry.paired : entry.runtime;
    if (!pair) return false;
    entry.hook ||= !runtime;
    entry.paired = true;
    return true;
  }

  accepted(key: string | null, runtime: boolean): void {
    if (!key) return;
    const entry = this.#recent.get(key);
    if (entry) { entry.runtime ||= runtime; entry.hook ||= !runtime; return; }
    if (this.#recent.size >= 10_000) this.#recent.delete(this.#recent.keys().next().value!);
    this.#recent.set(key, { seenAt: Date.now(), hook: !runtime, runtime, paired: false });
  }
}

function globalAgentEventState(): AgentEventGlobalState {
  const globalObject = globalThis as typeof globalThis & { [AGENT_EVENT_GLOBAL_STATE_KEY]?: AgentEventGlobalState };
  globalObject[AGENT_EVENT_GLOBAL_STATE_KEY] ??= {};
  return globalObject[AGENT_EVENT_GLOBAL_STATE_KEY];
}

export function subscribeGlobalAgentEvents(
  observer: AgentEventObserver,
  subscribe: (handler: (event: unknown) => void) => AgentEventUnsubscribe | undefined,
): void {
  const state = globalAgentEventState();
  state.observer = observer;
  if (state.unsubscribe) return;
  try {
    state.unsubscribe = subscribe((event) => {
      globalAgentEventState().observer?.handleAgentEvent(event);
    });
  } catch (error) {
    observer.logRuntimeSubscriptionFailure(error);
  }
}

export function releaseGlobalAgentEventObserver(observer: AgentEventObserver): void {
  const state = globalAgentEventState();
  if (state.observer !== observer) return;
  state.observer = undefined;
}
