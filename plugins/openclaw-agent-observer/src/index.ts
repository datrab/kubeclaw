import {
  knownAgentObservabilityHooks,
} from './agent-observability/index.ts';
import type { AgentObservabilityHook } from './agent-observability/index.ts';
import { resolveAgentObserverConfig } from './config.ts';
import type { AgentObserverConfig } from './config.ts';
import { subscribeModelUsageDiagnostics } from './diagnostics.ts';
import { extractPluginConfig, normalizeHookEvent, normalizeModelUsageDiagnosticEvent } from './hook-normalizers.ts';
import { AgentObserverRedisWriter } from './redis-writer.ts';
import type { AgentObserverRedisWriterOptions } from './redis-writer.ts';

declare const process: { env: Record<string, unknown> };

type Logger = Pick<Console, 'info' | 'warn' | 'error' | 'debug'>;

type ServiceStartContext = {
  config?: unknown;
};

type OpenClawPluginApi = {
  pluginConfig?: unknown;
  logger?: Logger;
  on: (name: string, handler: (event: unknown, context?: unknown) => unknown, opts?: { priority?: number; timeoutMs?: number }) => void;
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
      this.writer.enqueue(normalizeHookEvent(hook, event, new Date(), hookContext));
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
      this.writer.enqueue(normalizeModelUsageDiagnosticEvent(event));
    } catch (error) {
      this.logOnce('normalize-model-usage', `failed to normalize model.usage diagnostic event: ${errorMessage(error)}`);
    }
  }

  async flush(): Promise<void> {
    await this.writer.flush();
  }

  async stop(): Promise<void> {
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
      diagnostics_subscribed: Boolean(this.diagnosticsUnsubscribe),
      redis: {
        configured: Boolean(this.config.redisHost || this.config.redisPort || this.config.redisNetworkIsolation),
        connected: this.writer.isConnected(),
      },
      writer: this.writer.getStats(),
    };
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
