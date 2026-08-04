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
  const data = isConfigRecord(event.data) ? event.data : {};
  const runId = typeof event.runId === 'string' ? event.runId : '';
  const stream = typeof event.stream === 'string' ? event.stream : '';
  const seq = typeof event.seq === 'number' || typeof event.seq === 'string' ? String(event.seq) : '';
  const phase = typeof data.phase === 'string' ? data.phase : '';
  if (runId && stream && seq) return `${runId}:${stream}:${seq}`;
  if (!runId || !stream) return null;
  const text = typeof data.text === 'string' ? data.text.slice(0, 128) : '';
  return `${runId}:${stream}:${phase}:${text}`;
}

export function ingressEventDedupeKey(event: AgentObservabilityIngressEventV1): string | null {
  if (![
    'openclaw.agent.ended',
    'openclaw.llm.output',
    'openclaw.session.started',
    'openclaw.session.ended',
  ].includes(event.type)) return null;
  const runId = event.identity.run_id ?? '';
  const sessionKey = event.identity.session_key ?? '';
  const hook = isConfigRecord(event.payload) && typeof event.payload.hook === 'string' ? event.payload.hook : '';
  if (!runId || !hook) return null;
  return `${event.type}:${runId}:${sessionKey}:${hook}`;
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
