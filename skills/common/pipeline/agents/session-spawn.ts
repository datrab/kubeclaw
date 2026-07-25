import { spawnGatewaySession, resolveGatewayBaseUrl, resolveGatewayToken } from '../integrations/gateway.ts';
import { canonicalizeModelId } from './runtime.ts';
import { sleep } from '../timing.ts';
import type { TimeBudget } from '../timing.ts';
import { assertValidSessionLifecycleRecord } from '../services/acp-gateway-contract.ts';
import {
  type AnyRecord,
  isCallerAbort,
  isNonRetryableGatewayContractError,
  requestGateway,
  requireGatewayDetails,
  requireGatewayPolicy,
  requiredNonEmptyString,
  sessionErrorMessage,
  sessionLifecycleLog,
} from './session-gateway-support.ts';
import {
  resolveActiveSessionStatePath,
  resolveSpawnTranscriptPath,
  setActiveSession,
} from './session-state.ts';

type SpawnPolicy = {
  gateway: AnyRecord;
  thread: boolean;
  mode: string;
  cleanup: string;
  streamTo: string;
};

type SpawnContext = {
  label: string;
  agentId: string;
  model: string;
  runtime: 'acp' | 'subagent';
  cwd: string;
  thinking: unknown;
  activeStatePath: string | null;
  gatewayUrl: string;
  gatewayToken: string;
  policy: SpawnPolicy;
  budget: TimeBudget | null;
  signal: AbortSignal | null;
  trackActive: boolean;
};

function resolveExplicitRuntime(value: unknown): 'acp' | 'subagent' {
  const normalized = requiredNonEmptyString(value, 'session.runtime').toLowerCase();
  if (normalized !== 'acp' && normalized !== 'subagent') {
    throw new Error('spawnSession requires session.runtime to be acp or subagent');
  }
  return normalized;
}

function resolveSpawnPolicy(opts: AnyRecord): SpawnPolicy {
  const policy = opts.spawnPolicy;
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new Error('spawnSession requires explicit opts.spawnPolicy from swarm.config.json');
  }
  if (typeof policy.thread !== 'boolean') throw new Error('spawnPolicy.thread must be explicit boolean');
  return {
    gateway: requireGatewayPolicy(policy.gateway, 'spawnPolicy.gateway'),
    thread: policy.thread,
    mode: requiredNonEmptyString(policy.mode, 'spawnPolicy.mode'),
    cleanup: requiredNonEmptyString(policy.cleanup, 'spawnPolicy.cleanup'),
    streamTo: requiredNonEmptyString(policy.streamTo, 'spawnPolicy.streamTo'),
  };
}

function buildSpawnContext(payload: AnyRecord, opts: AnyRecord): SpawnContext {
  const session = payload.session ?? {};
  const cwd = requiredNonEmptyString(session.cwd, 'session.cwd');
  return {
    label: requiredNonEmptyString(session.label, 'session.label'),
    agentId: requiredNonEmptyString(session.agentId, 'session.agentId'),
    model: requiredNonEmptyString(canonicalizeModelId(session.model), 'session.model'),
    runtime: resolveExplicitRuntime(session.runtime),
    cwd,
    thinking: session.thinking ?? null,
    activeStatePath: resolveActiveSessionStatePath({ activeStatePath: opts.activeStatePath ?? null, cwd }),
    gatewayUrl: resolveGatewayBaseUrl(opts.gatewayUrl),
    gatewayToken: resolveGatewayToken(opts.gatewayToken),
    policy: resolveSpawnPolicy(opts),
    budget: opts.budget ?? null,
    signal: opts.signal ?? null,
    trackActive: opts.trackActive !== false,
  };
}

function applyObservabilityIdentity(args: AnyRecord, identity: AnyRecord | null): void {
  if (!identity) return;
  const runId = identity.run_id !== undefined ? identity.run_id : identity.runId;
  const dispatchId = identity.dispatch_id !== undefined ? identity.dispatch_id : identity.dispatchId;
  args.runId = runId ?? null;
  args.project = identity.project ?? null;
  args.dispatchId = dispatchId ?? null;
  args.gatewayLabel = requiredNonEmptyString(identity.gateway_label, 'observabilityIdentity.gateway_label');
  args.agentType = identity.agent_type ?? null;
  args.moduleId = identity.module_id ?? null;
  args.gateId = identity.gate_id ?? null;
  args.metadata = {
    run_id: args.runId,
    project: args.project,
    dispatch_id: args.dispatchId,
    gateway_label: args.gatewayLabel,
    agent_type: args.agentType,
    module_id: args.moduleId,
    gate_id: args.gateId,
    gate_type: identity.gate_type ?? null,
    attempt: identity.attempt ?? null,
  };
}

function buildSpawnArgs(prompt: unknown, context: SpawnContext, opts: AnyRecord): AnyRecord {
  const args: AnyRecord = {
    task: requiredNonEmptyString(prompt, 'prompt'),
    runtime: context.runtime,
    label: context.label,
    model: context.model,
    cwd: context.cwd,
    thread: context.policy.thread,
    mode: context.policy.mode,
    cleanup: context.policy.cleanup,
  };
  const identity = opts.observabilityIdentity && typeof opts.observabilityIdentity === 'object'
    ? opts.observabilityIdentity
    : null;
  applyObservabilityIdentity(args, identity);
  if (context.runtime === 'acp') {
    args.agentId = context.agentId;
    args.streamTo = context.policy.streamTo;
    if (context.thinking) args.thinking = context.thinking;
  }
  return args;
}

function sessionRecord(result: AnyRecord, context: SpawnContext): AnyRecord {
  const streamLogPath = resolveSpawnTranscriptPath(result, context.runtime);
  if (context.runtime === 'subagent' && !result.streamLogPath && streamLogPath) {
    sessionLifecycleLog('DEBUG', `Subagent transcript path (resolved): ${streamLogPath}`);
  }
  return assertValidSessionLifecycleRecord({
    childSessionKey: result.childSessionKey,
    runId: result.runId,
    label: context.label,
    agentId: context.agentId,
    model: context.model,
    streamLogPath,
    runtime: context.runtime,
    gatewayLabel: context.label,
    cwd: context.cwd,
    activeStatePath: context.activeStatePath,
  }, 'spawn session result') as AnyRecord;
}

async function executeSpawnAttempt(args: AnyRecord, context: SpawnContext): Promise<AnyRecord> {
  const gateway = context.policy.gateway;
  const raw = await requestGateway(spawnGatewaySession, 'session spawn', args, gateway.timeoutMs, {
    gatewayUrl: context.gatewayUrl,
    gatewayToken: context.gatewayToken,
    maxRetries: gateway.maxRetries,
    retryDelayMs: gateway.retryDelayMs,
    budget: context.budget,
    signal: context.signal,
  });
  const result = requireGatewayDetails(raw as AnyRecord, 'session spawn');
  if (result.status !== 'accepted') throw new Error(`Spawn not accepted: ${JSON.stringify(result)}`);
  return sessionRecord(result, context);
}

function throwSpawnContractError(error: unknown, label: string): never {
  const contractError = new Error(
    `Gateway session spawn contract invalid for '${label}': ${sessionErrorMessage(error)}`,
  ) as Error & { code?: string; gatewayStatus?: number };
  contractError.code = 'gateway_spawn_contract_invalid';
  contractError.gatewayStatus = 400;
  throw contractError;
}

export async function spawnSession(
  payload: AnyRecord,
  prompt: unknown,
  _timeoutSeconds: unknown,
  opts: AnyRecord = {},
): Promise<AnyRecord> {
  const context = buildSpawnContext(payload, opts);
  const args = buildSpawnArgs(prompt, context, opts);
  const kind = context.runtime === 'subagent' ? 'subagent' : 'ACP';
  sessionLifecycleLog('STEP', `Spawning ${kind} session: ${context.label} (model: ${context.model}, agentId: ${context.agentId})`);
  let lastError: unknown;
  for (let attempt = 1; attempt <= context.policy.gateway.maxRetries; attempt += 1) {
    try {
      const record = await executeSpawnAttempt(args, context);
      sessionLifecycleLog('OK', `Session spawned: ${context.label} -> ${record.childSessionKey}`);
      if (context.trackActive) setActiveSession(record);
      return record;
    } catch (error) {
      lastError = error;
      if (isCallerAbort(error, context.signal, context.budget)) throw error;
      if (isNonRetryableGatewayContractError(error)) throwSpawnContractError(error, context.label);
      if (attempt < context.policy.gateway.maxRetries) {
        sessionLifecycleLog('WARN', `Spawn attempt ${attempt}/${context.policy.gateway.maxRetries} failed: ${sessionErrorMessage(error)}`);
        await sleep(context.policy.gateway.retryDelayMs, { budget: context.budget, signal: context.signal });
      }
    }
  }
  throw new Error(`Failed to spawn session '${context.label}': ${sessionErrorMessage(lastError)}`);
}
