import type { AdapterActivationContext, AdapterInstance, EffectRequest } from '@kubeclaw/plugin-sdk';
import { dispatchOpenClaw, type OpenClawTarget } from './openclaw.js';

const ID = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, allowed: ReadonlySet<string>, code: string): void {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${code}:${key}`);
}

function targetsFrom(raw: Readonly<Record<string, unknown>>): ReadonlyMap<string, OpenClawTarget> {
  exact(raw as Record<string, unknown>, new Set(['targets']), 'RUNTIME_CONFIG_UNKNOWN_FIELD');
  if (!record(raw.targets) || Object.keys(raw.targets).length === 0) {
    throw new Error('RUNTIME_CONFIG_INVALID:targets');
  }
  const targets = new Map<string, OpenClawTarget>();
  for (const [id, value] of Object.entries(raw.targets)) {
    if (!ID.test(id) || !record(value)) throw new Error(`RUNTIME_CONFIG_INVALID:target:${id}`);
    exact(value, new Set([
      'endpoint', 'tokenSecret', 'runtime', 'agentId', 'agentRole', 'model', 'thinking',
      'cwd', 'repositoryRoot', 'pollMs', 'maxPollMs', 'maxPolls', 'sessionTimeoutMs',
      'resultPathPrefix',
      'resultEndpoint', 'resultTokenSecret',
    ]), 'RUNTIME_CONFIG_UNKNOWN_TARGET_FIELD');
    const endpoint = typeof value.endpoint === 'string' ? new URL(value.endpoint) : null;
    const runtime = value.runtime;
    const resultPathPrefix = typeof value.resultPathPrefix === 'string'
      && value.resultPathPrefix.length > 0
      && !value.resultPathPrefix.startsWith('/')
      && !value.resultPathPrefix.split('/').includes('..')
      ? value.resultPathPrefix.replace(/\/+$/u, '')
      : '';
    const target = {
      endpoint: endpoint?.href ?? '',
      tokenSecret: typeof value.tokenSecret === 'string' ? value.tokenSecret : '',
      runtime,
      agentId: typeof value.agentId === 'string' && ID.test(value.agentId) ? value.agentId : 'codex',
      agentRole: typeof value.agentRole === 'string' && ID.test(value.agentRole) ? value.agentRole : id,
      model: typeof value.model === 'string' ? value.model.trim() : '',
      thinking: typeof value.thinking === 'string' && value.thinking.trim() ? value.thinking.trim() : 'high',
      cwd: typeof value.cwd === 'string' && value.cwd.startsWith('/') ? value.cwd : '',
      repositoryRoot: typeof value.repositoryRoot === 'string' && value.repositoryRoot.startsWith('/')
        ? value.repositoryRoot
        : '',
      pollMs: Number(value.pollMs ?? 1_000),
      maxPollMs: Number(value.maxPollMs ?? 15_000),
      maxPolls: Number(value.maxPolls ?? 1_800),
      sessionTimeoutMs: Number(value.sessionTimeoutMs ?? 1_800_000),
      resultPathPrefix,
      resultEndpoint: typeof value.resultEndpoint === 'string'
        ? new URL(value.resultEndpoint).href.replace(/\/+$/u, '')
        : undefined,
      resultTokenSecret: typeof value.resultTokenSecret === 'string'
        ? value.resultTokenSecret
        : undefined,
    };
    if (
      !endpoint || !['http:', 'https:'].includes(endpoint.protocol)
      || endpoint.username || endpoint.password || endpoint.hash
      || !ID.test(target.tokenSecret)
      || (runtime !== 'acp' && runtime !== 'subagent')
      || !target.model || !target.cwd || !target.repositoryRoot || !target.resultPathPrefix
      || ((target.resultEndpoint === undefined) !== (target.resultTokenSecret === undefined))
      || (target.resultTokenSecret !== undefined && !ID.test(target.resultTokenSecret))
      || !Number.isSafeInteger(target.pollMs) || target.pollMs < 10
      || !Number.isSafeInteger(target.maxPollMs) || target.maxPollMs < target.pollMs
      || !Number.isSafeInteger(target.maxPolls) || target.maxPolls < 1
      || !Number.isSafeInteger(target.sessionTimeoutMs)
      || target.sessionTimeoutMs < target.pollMs
      || target.sessionTimeoutMs > 86_400_000
    ) {
      throw new Error(`RUNTIME_CONFIG_INVALID:openclaw:${id}`);
    }
    targets.set(id, target as OpenClawTarget);
  }
  return targets;
}

function assertRequest(request: EffectRequest): void {
  if (
    request.capability !== 'runtime.dispatch'
    || request.operation !== 'dispatch'
    || request.resource.type !== 'runtime.agent'
    || !ID.test(request.resource.canonicalId)
  ) {
    throw new Error('RUNTIME_OPERATION_UNSUPPORTED');
  }
}

export function activate(context: AdapterActivationContext): AdapterInstance {
  const targets = targetsFrom(context.config);
  let shuttingDown = false;
  return {
    async ready() {
      if (shuttingDown) throw new Error('ADAPTER_SHUTTING_DOWN');
    },
    async invoke({ request, signal, confidential, fence }) {
      if (!confidential) fence.assertCurrent();
      if (shuttingDown) throw new Error('ADAPTER_SHUTTING_DOWN');
      if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
      assertRequest(request);
      const target = targets.get(request.resource.canonicalId);
      if (!target) throw new Error(`RUNTIME_TARGET_DENIED:${request.resource.canonicalId}`);
      return dispatchOpenClaw(context, target, request.payload as Record<string, unknown>, signal);
    },
    async shutdown() {
      shuttingDown = true;
    },
  };
}
