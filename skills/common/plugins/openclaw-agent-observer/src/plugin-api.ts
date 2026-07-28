import type { AgentObserverRedisWriterOptions } from './redis-writer.ts';

export type Logger = Pick<Console, 'info' | 'warn' | 'error' | 'debug'>;

export type ServiceStartContext = {
  config?: unknown;
};

export type AgentEventUnsubscribe = () => void;

export type OpenClawPluginApi = {
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

export type PluginEntry = {
  id: string;
  name: string;
  description: string;
  register: (api: OpenClawPluginApi) => void;
};

export type DiagnosticSubscriberFactory = (handler: (event: unknown) => void) => () => void;

export interface AgentObserverOptions {
  initialConfig?: unknown;
  env?: Record<string, unknown>;
  logger?: Logger;
  redisClientFactory?: AgentObserverRedisWriterOptions['redisClientFactory'];
  diagnosticSubscriberFactory?: DiagnosticSubscriberFactory;
}
