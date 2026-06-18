import {
  knownAgentObservabilityHooks,
} from './agent-observability/index.ts';
import type { AgentObservabilityHook } from './agent-observability/index.ts';
import type { AgentObservabilityIngressEventV1 } from './agent-observability/index.ts';
import { resolveAgentObserverConfig } from './config.ts';
import type { AgentObserverConfig } from './config.ts';
import { subscribeModelUsageDiagnostics } from './diagnostics.ts';
import { extractPluginConfig, normalizeAgentEvent, normalizeHookEvent, normalizeModelUsageDiagnosticEvent } from './hook-normalizers.ts';
import { AgentObserverRedisWriter } from './redis-writer.ts';
import type { AgentObserverRedisWriterOptions } from './redis-writer.ts';

declare const process: { env: Record<string, unknown> };

type Logger = Pick<Console, 'info' | 'warn' | 'error' | 'debug'>;

type ServiceStartContext = {
  config?: unknown;
};

type AgentEventUnsubscribe = () => void;
type AgentEventGlobalState = {
  observer?: OpenClawAgentObserver;
  unsubscribe?: AgentEventUnsubscribe;
};

const AGENT_EVENT_GLOBAL_STATE_KEY = Symbol.for('kubeclaw.agent-observer.agent-events');

type OpenClawPluginApi = {
  pluginConfig?: unknown;
  logger?: Logger;
  runtime?: {
    events?: {
      onAgentEvent?: (handler: (event: unknown) => unknown) => AgentEventUnsubscribe;
    };
  };
  on: (name: string, handler: (event: unknown, context?: unknown) => unknown, opts?: { priority?: number; timeoutMs?: number }) => void;
  registerGatewayMethod?: (
    method: string,
    handler: (request: { params?: unknown; respond: (ok: boolean, payload?: unknown, error?: unknown) => unknown }) => unknown,
    opts?: { scope?: string },
  ) => void;
  registerAgentEventSubscription?: (subscription: {
    id: string;
    streams?: string[];
    handle: (event: unknown, context?: unknown) => unknown;
  }) => void;
  registerService?: (service: { id: string; start?: (ctx?: ServiceStartContext) => unknown; stop?: () => unknown; status?: () => unknown }) => void;
};

type PluginEntry = {
  id: string;
  name: string;
  description: string;
  register: (api: OpenClawPluginApi) => void;
};

type DiagnosticSubscriberFactory = (handler: (event: unknown) => void) => () => void;

export interface AgentObserverOptions {
  initialConfig?: unknown;
  env?: Record<string, unknown>;
  logger?: Logger;
  redisClientFactory?: AgentObserverRedisWriterOptions['redisClientFactory'];
  diagnosticSubscriberFactory?: DiagnosticSubscriberFactory;
}

function definePluginEntry(entry: PluginEntry): PluginEntry {
  return entry;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class OpenClawAgentObserver {
  private readonly env: Record<string, unknown>;
  private readonly logger: Logger;
  private readonly writer: AgentObserverRedisWriter;
  private readonly diagnosticSubscriberFactory: DiagnosticSubscriberFactory;
  private readonly registrationConfig: unknown;
  private serviceConfig: unknown;
  private config: AgentObserverConfig;
  private diagnosticsUnsubscribe: (() => void) | null = null;
  private readonly loggedFailures = new Set<string>();
  private readonly recentAgentEvents = new Map<string, number>();
  private readonly recentIngressEvents = new Map<string, number>();

  constructor(options: AgentObserverOptions = {}) {
    this.env = options.env ?? process.env;
    this.logger = options.logger ?? console;
    this.registrationConfig = options.initialConfig;
    this.diagnosticSubscriberFactory = options.diagnosticSubscriberFactory ?? subscribeModelUsageDiagnostics;
    this.config = this.resolveConfig();
    this.writer = new AgentObserverRedisWriter({
      config: this.config,
      logger: this.logger,
      redisClientFactory: options.redisClientFactory,
    });
  }

  start(ctx?: ServiceStartContext): void {
    this.serviceConfig = ctx?.config;
    const config = this.resolveConfig();
    this.config = config;
    this.writer.updateConfig(config);
    this.writer.start();
    if (config.enabled) this.startDiagnostics();
  }

  handleHook(hook: AgentObservabilityHook, event: unknown, hookContext?: unknown): void {
    let config: AgentObserverConfig;
    try {
      config = this.resolveConfig(extractPluginConfig(event, hookContext));
    } catch (error) {
      this.logOnce('config', `invalid agent observability config; dropping event: ${errorMessage(error)}`);
      return;
    }

    this.config = config;
    this.writer.updateConfig(config);
    if (!config.enabled) return;
    this.startDiagnostics();

    try {
      this.enqueueNormalizedEvent(normalizeHookEvent(hook, event, new Date(), hookContext));
    } catch (error) {
      this.logOnce(`normalize-${hook}`, `failed to normalize ${hook} event: ${errorMessage(error)}`);
    }
  }

  handleDiagnostic(event: unknown): void {
    let config: AgentObserverConfig;
    try {
      config = this.resolveConfig();
    } catch (error) {
      this.logOnce('diagnostic-config', `invalid agent observability config; dropping diagnostic event: ${errorMessage(error)}`);
      return;
    }

    this.config = config;
    this.writer.updateConfig(config);
    if (!config.enabled) return;

    try {
      this.enqueueNormalizedEvent(normalizeModelUsageDiagnosticEvent(event));
    } catch (error) {
      this.logOnce('normalize-model-usage', `failed to normalize model.usage diagnostic event: ${errorMessage(error)}`);
    }
  }

  handleAgentEvent(event: unknown): void {
    let config: AgentObserverConfig;
    try {
      config = this.resolveConfig();
    } catch (error) {
      this.logOnce('agent-event-config', `invalid agent observability config; dropping agent event: ${errorMessage(error)}`);
      return;
    }

    this.config = config;
    this.writer.updateConfig(config);
    if (!config.enabled) return;
    this.startDiagnostics();
    if (this.shouldDropDuplicateAgentEvent(event)) return;

    try {
      const normalized = normalizeAgentEvent(event, new Date());
      if (normalized) this.enqueueNormalizedEvent(normalized);
    } catch (error) {
      this.logOnce('normalize-agent-event', `failed to normalize agent event: ${errorMessage(error)}`);
    }
  }

  async flush(): Promise<void> {
    await this.writer.flush();
  }

  async stop(): Promise<void> {
    releaseGlobalAgentEventObserver(this);
    this.stopDiagnostics();
    await this.writer.stop();
  }

  getStats(): ReturnType<AgentObserverRedisWriter['getStats']> {
    return this.writer.getStats();
  }

  getStatus(): Record<string, unknown> {
    return {
      enabled: this.config.enabled,
      registered_hooks: [...knownAgentObservabilityHooks()],
      agent_event_subscription: true,
      diagnostics_subscribed: Boolean(this.diagnosticsUnsubscribe),
      redis: {
        configured: Boolean(this.config.redisHost || this.config.redisPort || this.config.redisNetworkIsolation),
        connected: this.writer.isConnected(),
      },
      writer: this.writer.getStats(),
    };
  }

  private enqueueNormalizedEvent(event: AgentObservabilityIngressEventV1): void {
    if (this.shouldDropDuplicateIngressEvent(event)) return;
    this.writer.enqueue(event);
  }

  private shouldDropDuplicateIngressEvent(event: AgentObservabilityIngressEventV1): boolean {
    const key = ingressEventDedupeKey(event);
    if (!key) return false;
    const now = Date.now();
    for (const [candidate, seenAt] of this.recentIngressEvents) {
      if (now - seenAt > 10_000) this.recentIngressEvents.delete(candidate);
    }
    if (this.recentIngressEvents.has(key)) return true;
    this.recentIngressEvents.set(key, now);
    return false;
  }

  private resolveConfig(hookConfig?: unknown): AgentObserverConfig {
    return resolveAgentObserverConfig(
      mergeConfigInputs(this.registrationConfig, this.serviceConfig, hookConfig),
      this.env,
    );
  }

  private startDiagnostics(): void {
    if (this.diagnosticsUnsubscribe) return;
    try {
      this.diagnosticsUnsubscribe = this.diagnosticSubscriberFactory((event) => this.handleDiagnostic(event));
    } catch (error) {
      this.logOnce('diagnostics-subscribe', `model.usage diagnostics unavailable: ${errorMessage(error)}`);
    }
  }

  subscribeAgentEvents(subscribe: (handler: (event: unknown) => void) => AgentEventUnsubscribe | undefined): void {
    subscribeGlobalAgentEvents(this, subscribe);
  }

  logRuntimeSubscriptionFailure(error: unknown): void {
    this.logOnce('agent-events-subscribe', `agent event runtime subscription unavailable: ${errorMessage(error)}`);
  }

  private shouldDropDuplicateAgentEvent(event: unknown): boolean {
    const key = agentEventDedupeKey(event);
    if (!key) return false;
    const now = Date.now();
    for (const [candidate, seenAt] of this.recentAgentEvents) {
      if (now - seenAt > 60_000) this.recentAgentEvents.delete(candidate);
    }
    if (this.recentAgentEvents.has(key)) return true;
    this.recentAgentEvents.set(key, now);
    return false;
  }

  private stopDiagnostics(): void {
    const unsubscribe = this.diagnosticsUnsubscribe;
    this.diagnosticsUnsubscribe = null;
    if (!unsubscribe) return;
    try {
      unsubscribe();
    } catch (error) {
      this.logOnce('diagnostics-unsubscribe', `model.usage diagnostics unsubscribe failed: ${errorMessage(error)}`);
    }
  }

  private logOnce(key: string, message: string): void {
    if (this.loggedFailures.has(key)) return;
    this.loggedFailures.add(key);
    this.logger.warn(`[kubeclaw-agent-observer] ${message}`);
  }
}

export function createOpenClawAgentObserver(options: AgentObserverOptions = {}): OpenClawAgentObserver {
  return new OpenClawAgentObserver(options);
}

function isConfigRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeConfigInputs(...configs: unknown[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const config of configs) {
    if (!isConfigRecord(config)) continue;
    for (const [key, value] of Object.entries(config)) {
      if (value !== undefined) merged[key] = value;
    }
  }
  return merged;
}

function agentEventDedupeKey(event: unknown): string | null {
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

function ingressEventDedupeKey(event: AgentObservabilityIngressEventV1): string | null {
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

function getGlobalAgentEventSubscriptionState(): AgentEventGlobalState {
  const globalObject = globalThis as typeof globalThis & { [AGENT_EVENT_GLOBAL_STATE_KEY]?: AgentEventGlobalState };
  globalObject[AGENT_EVENT_GLOBAL_STATE_KEY] ??= {};
  return globalObject[AGENT_EVENT_GLOBAL_STATE_KEY];
}

function subscribeGlobalAgentEvents(
  observer: OpenClawAgentObserver,
  subscribe: (handler: (event: unknown) => void) => AgentEventUnsubscribe | undefined,
): void {
  const state = getGlobalAgentEventSubscriptionState();
  state.observer = observer;
  if (state.unsubscribe) return;
  try {
    state.unsubscribe = subscribe((event) => {
      getGlobalAgentEventSubscriptionState().observer?.handleAgentEvent(event);
    });
  } catch (error) {
    observer.logRuntimeSubscriptionFailure(error);
  }
}

function releaseGlobalAgentEventObserver(observer: OpenClawAgentObserver): void {
  const state = getGlobalAgentEventSubscriptionState();
  if (state.observer !== observer) return;
  state.observer = undefined;
}

export function registerOpenClawAgentObserver(api: OpenClawPluginApi, observer?: OpenClawAgentObserver): OpenClawAgentObserver {
  const activeObserver = observer ?? createOpenClawAgentObserver({
    initialConfig: api.pluginConfig,
    logger: api.logger,
  });
  for (const hook of knownAgentObservabilityHooks() as readonly AgentObservabilityHook[]) {
    api.on(
      hook,
      (event: unknown, context?: unknown) => {
        activeObserver.handleHook(hook, event, context);
      },
      { priority: -100, timeoutMs: 1000 },
    );
  }

  if (api.runtime?.events?.onAgentEvent) {
    activeObserver.subscribeAgentEvents((handler) => api.runtime?.events?.onAgentEvent?.(handler));
  } else {
    api.registerAgentEventSubscription?.({
      id: 'kubeclaw-agent-observer.agent-events',
      streams: ['lifecycle', 'assistant', 'item', 'command_output', 'patch', 'approval'],
      handle(event: unknown) {
        activeObserver.handleAgentEvent(event);
      },
    });
  }

  api.registerGatewayMethod?.('kubeclaw.agentObserver.status', async ({ respond }) => {
    respond(true, activeObserver.getStatus());
  }, { scope: 'operator.read' });

  api.registerGatewayMethod?.('kubeclaw.agentObserver.selfTest', async ({ params, respond }) => {
    const request = isConfigRecord(params) ? params : {};
    const runId = typeof request.runId === 'string' ? request.runId : `observer-self-test-${Date.now()}`;
    const sessionKey = typeof request.sessionKey === 'string' ? request.sessionKey : 'agent:observer:self-test';
    activeObserver.handleAgentEvent({
      runId,
      sessionKey,
      stream: 'lifecycle',
      data: {
        phase: 'end',
        stopReason: 'self-test',
        endedAt: Date.now(),
      },
    });
    await activeObserver.flush();
    respond(true, activeObserver.getStatus());
  }, { scope: 'operator.admin' });

  api.registerService?.({
    id: 'kubeclaw-agent-observer',
    start(ctx?: ServiceStartContext) {
      activeObserver.start(ctx);
    },
    stop() {
      return activeObserver.stop();
    },
    status() {
      return activeObserver.getStatus();
    },
  });

  return activeObserver;
}

export default definePluginEntry({
  id: 'kubeclaw-agent-observer',
  name: 'KubeClaw Agent Observer',
  description: 'Observes OpenClaw runtime hooks and writes kubeclaw agent-observability Redis streams.',
  register(api: OpenClawPluginApi) {
    registerOpenClawAgentObserver(api);
  },
});
