// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { execFileSync } from 'child_process';
import { STATUS } from '../core/constants.ts';
import {
  completionStreamKey, gateLogDir,
  gateInstructionsPathRef,
  gateOutputPathRef,
  gateWorkDirPathRef,
  moduleBusterMdPathRef, moduleLogDir,
  moduleBusterOutputPathRef,
  modulePathRef,
} from '../core/paths.ts';
import { log } from '../core/logger.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import {
  buildModuleBusterWorkerControlResult,
  buildModuleForgeWorkerControlResult,
  coerceModuleBusterWorkerControlResult,
  coerceModuleForgeWorkerControlResult,
  isModuleBusterWorkerControlResult,
  isModuleForgeWorkerControlResult,
} from './module-worker-control-results.ts';
import { verifyAgentAlive, verifyAgentHealth } from './orchestration-healthcheck.ts';
import {
  telemetryModuleId,
} from './orchestration-lifecycle-events.ts';
import { sendGatewaySessionMessage } from '../integrations/gateway.ts';
import { discord } from '../integrations/discord.ts';
import { resolveRegisteredRedisAdapter } from '../services/adapter-registry.ts';
import { getRateLimitConfig } from '../services/rate-limit.ts';
import { getBusterRuntimeConfig, getPipelineDefaultsConfig } from '../services/runtime-defaults.ts';
import { getAcpMonitorConfig } from './acp-monitor.ts';
import { reaperAfterKill } from './shutdown.ts';
import { canonicalizeModelId, modelToHarness, resolveRuntime } from './runtime.ts';
import { getTrackedAgent, spawnSession, trackAgent, untrackAgent } from './lifecycle.ts';
import { terminateSession } from './session-termination.ts';
import { runModuleBusterWorker, runModuleForgeWorker } from './module-workers.ts';
import { killReviewerAgent, spawnReviewerAgent } from './reviewer-lifecycle.ts';
import { buildSubprocessEnv } from '../security.ts';
import { getPipelineArtifactBundle } from '../services/artifact-bundle.ts';
import { gatewayInvokePolicy, sessionLifecyclePolicies } from '../core/session-policy.ts';
import {
  assertRequiredAgentStartupEvidence,
  createAgentLifecycleTelemetryReader,
  waitForRequiredAgentStartupEvidence,
} from '../services/agent-observability-required.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
declare const process: any;
type AnyRecord = Record<string, any>;

export {
  buildModuleBusterWorkerControlResult,
  buildModuleForgeWorkerControlResult,
  coerceModuleBusterWorkerControlResult,
  coerceModuleForgeWorkerControlResult,
  isModuleBusterWorkerControlResult,
  isModuleForgeWorkerControlResult,
} from './module-worker-control-results.ts';
export { verifyAgentAlive, verifyAgentHealth } from './orchestration-healthcheck.ts';
export { runModuleBusterWorker, runModuleForgeWorker } from './module-workers.ts';
export { killReviewerAgent, spawnReviewerAgent } from './reviewer-lifecycle.ts';

const _redisDispatchModules = new Map<string, any>();
const DISPLAY_AGENT_ROLE_FALLBACK = 'Agent';
const REASONING_LEVEL_NOT_CONFIGURED = 'default';
const MODULE_TEST_TASK_TYPE = 'module_test';

function textValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function objectRecord(value: unknown): AnyRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function reasoningLevelValue(value: unknown): string {
  return selectDefinedValue(() => (textValue(value)), () => (REASONING_LEVEL_NOT_CONFIGURED));
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as AnyRecord).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return String(error);
}

function requiredCanonicalModelId(model: unknown, label: string): string {
  const resolved = canonicalizeModelId(model);
  if (!resolved) throw new Error(`${label}: required non-empty model id`);
  return resolved;
}

function requiredAcpAgentId(agentConfig: AnyRecord, agentType: string): string {
  const agentId = textValue(agentConfig?.acp_agent_id);
  if (!agentId) throw new Error(`ACP dispatch for '${agentType}' requires explicit acp_agent_id`);
  return agentId;
}

function requiredAgentCwd(agentConfig: AnyRecord, config: AnyRecord, agentType: string, opts: AnyRecord = {}): string {
  const cwd = selectDefinedValue(() => (selectDefinedValue(() => (textValue(opts?.cwd)), () => (textValue(agentConfig?.cwd)))), () => (textValue(config?.repo_root)));
  if (!cwd) throw new Error(`Agent '${agentType}' requires explicit cwd or config.repo_root`);
  return cwd;
}

async function getRedisDispatchModule(config: AnyRecord, agentType: string, opts: AnyRecord = {}) {
  if (!config?.agents?.[agentType]) throw new Error(`Unknown agent type: ${agentType}`);

  const { adapter: redisDispatch, key, cacheable = true } = resolveRegisteredRedisAdapter(config, {
    agentType,
    source: `agents.${agentType}`,
    requiredMethods: ['publishTask'],
  });

  if (cacheable === false) {
    log('INFO', `Redis dispatch adapter resolved without process cache: ${key}`);
    return redisDispatch;
  }

  if (_redisDispatchModules.has(key)) {
    return _redisDispatchModules.get(key);
  }

  _redisDispatchModules.set(key, redisDispatch);
  log('INFO', `Redis dispatch adapter loaded from registry: ${key}`);
  return redisDispatch;
}

function isGitWorktree(cwd: string | null) {
  if (!cwd) return false;
  try {
    const output = execFileSync('git', ['-C', cwd, 'rev-parse', '--is-inside-work-tree'], {
      encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'], env: buildSubprocessEnv(),
    });
    return output.trim() === 'true';
  } catch (_error) {
    return false;
  }
}

function captureBaselineFiles(trackingKey: string, cwd: string | null) {
  if (!isGitWorktree(cwd)) return;
  try {
    const baselineOutput = execFileSync('git', ['-C', cwd, 'diff', '--name-only', 'HEAD'], {
      encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'], env: buildSubprocessEnv(),
    });
    const entry = getTrackedAgent(trackingKey);
    if (entry) {
      entry._baselineCwd = cwd;
      entry._baselineFiles = new Set(baselineOutput.trim().split('\n').filter(Boolean));
    }
  } catch (e: any) {
    log('DEBUG', `Could not capture baseline files for ${trackingKey}: ${errorMessage(e)}`);
  }
}

export function computeFilesChanged(entry: AnyRecord | null, config: AnyRecord) {
  let filesChanged = null;
  let baselineTracked = false;
  if (entry?._baselineFiles) {
    baselineTracked = true;
    try {
      const baselineCwd = selectTruthyValue(() => (entry._baselineCwd), () => (null));
      if (selectTruthyValue(() => (!baselineCwd), () => (!isGitWorktree(baselineCwd)))) return { filesChanged, baselineTracked: false };
      const currentOutput = execFileSync('git', ['-C', baselineCwd, 'diff', '--name-only', 'HEAD'], {
        encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'], env: buildSubprocessEnv(),
      });
      const currentFiles = new Set(currentOutput.trim().split('\n').filter(Boolean));
      const newFiles = [...currentFiles].filter(f => !entry._baselineFiles.has(f));
      if (newFiles.length > 0) filesChanged = newFiles;
    } catch (e: any) {
      log('DEBUG', `Could not compute files changed for ${selectDefinedValue(() => (textValue(entry?.gatewayLabel)), () => ('agent'))}: ${selectTruthyValue(() => (e?.message), () => (e))}`);
    }
  }
  return { filesChanged, baselineTracked };
}

export function acpLabel(agentType: string, moduleId: string) {
  return `${agentType}-${moduleId}`;
}

function displayAgentRole(agentType: string) {
  const normalized = selectDefinedValue(() => (textValue(agentType)), () => (DISPLAY_AGENT_ROLE_FALLBACK));
  return normalized.replace(/^\w/, (char) => char.toUpperCase());
}

export async function spawnAcpAgent(
  config: AnyRecord,
  agentType: string,
  moduleId: string,
  model: string,
  taskPrompt: string,
  opts: AnyRecord = {},
) {
  const agentConfig = config.agents[agentType];
  const resolvedModel = requiredCanonicalModelId(model, `Agent '${agentType}' model`);
  const trackingKey = opts.trackingLabel ? opts.trackingLabel : acpLabel(agentType, moduleId);
  const dispatchTs = Date.now();
  const gatewayLabel = `${trackingKey}-${dispatchTs}`;
  const runId = opts.run_id ? opts.run_id : config?._runId ? config._runId : config?.run_id ? config.run_id : null;
  const dispatchId = opts.dispatch_id ? opts.dispatch_id : `${trackingKey}-dispatch-${dispatchTs}`;
  const agentId = requiredAcpAgentId(agentConfig, agentType);
  const cwd = requiredAgentCwd(agentConfig, config, agentType, opts);
  const runtime = agentConfig.dispatch === 'acp'
    ? 'acp'
    : resolveRuntime({ model: resolvedModel });
  const useSubagent = runtime === 'subagent';
  const thinkingLevel = selectTruthyValue(() => (opts.thinking), () => (null));
  const thinkingSource = opts.thinking_source ? opts.thinking_source : opts.thinkingSource ? opts.thinkingSource : null;
  const telemetryIdentity = {
    run_id: runId,
    project: selectTruthyValue(() => (config?.project), () => (null)),
    agent_type: agentType,
    module_id: telemetryModuleId(opts, moduleId),
    gate_id: selectTruthyValue(() => (opts.gate_id), () => (null)),
    gate_type: selectTruthyValue(() => (opts.gate_type), () => (null)),
    attempt: selectDefinedValue(() => (opts.attempt), () => (null)),
    dispatch_id: dispatchId,
    gateway_label: gatewayLabel,
  };
  const startupEvidenceReader = createAgentLifecycleTelemetryReader(config, {
    runId,
    startId: '0-0',
    ...(opts.agentLifecycleReader ? { reader: opts.agentLifecycleReader } : {}),
  });

  try {
    const sessionData = await spawnSession({
      session: { model: resolvedModel, runtime, agentId, cwd, label: gatewayLabel },
    }, taskPrompt, selectTruthyValue(() => (agentConfig?.timeout_seconds), () => (null)), {
      ...sessionLifecyclePolicies(config),
      runtime,
      model: resolvedModel,
      agentId,
      cwd,
      label: gatewayLabel,
      thinking: thinkingLevel,
      trackActive: false,
      budget: selectTruthyValue(() => (opts.budget), () => (null)),
      signal: selectTruthyValue(() => (opts.signal), () => (null)),
      observabilityIdentity: telemetryIdentity,
    });

    log('OK', `${useSubagent ? 'Subagent' : 'ACP'} session spawned: ${gatewayLabel} → ${sessionData.childSessionKey}${sessionData.streamLogPath ? ` (stream: ${sessionData.streamLogPath})` : ''}`, { agent: agentId, model: resolvedModel, sessionKey: sessionData.childSessionKey, runId: sessionData.runId, dispatchId, stream: sessionData.streamLogPath });
    trackAgent(config, trackingKey, sessionData.childSessionKey, agentId, gatewayLabel, sessionData.streamLogPath, {
      model: resolvedModel,
      runtime: useSubagent ? 'subagent' : 'acp',
      moduleId,
      run_id: runId,
      attempt: selectDefinedValue(() => (opts.attempt), () => (null)),
      dispatch_id: dispatchId,
      telemetry_module_id: telemetryModuleId(opts, moduleId),
      telemetry_gate_id: selectTruthyValue(() => (opts.gate_id), () => (null)),
      telemetry_gate_type: selectTruthyValue(() => (opts.gate_type), () => (null)),
      telemetry_attempt: selectDefinedValue(() => (opts.attempt), () => (null)),
      telemetry_dispatch_id: dispatchId,
      telemetry_substep: selectTruthyValue(() => (opts.substep), () => (null)),
      telemetry_thinking: thinkingLevel,
      telemetry_thinking_source: thinkingSource,
    });
    captureBaselineFiles(trackingKey, cwd);
    assertRequiredAgentStartupEvidence(await waitForRequiredAgentStartupEvidence(config, {
      ...telemetryIdentity,
      session_key: sessionData.childSessionKey,
    }, {
      reader: startupEvidenceReader,
      timeoutMs: opts.agentObservabilityStartupTimeoutMs,
    }), {
      ...telemetryIdentity,
      session_key: sessionData.childSessionKey,
    });

    const spawnDiscordCorrelation = {
      run_id: runId,
      module_id: telemetryModuleId(opts, moduleId),
      gate_id: selectTruthyValue(() => (opts.gate_id), () => (null)),
      gate_type: selectTruthyValue(() => (opts.gate_type), () => (null)),
      attempt: selectDefinedValue(() => (opts.attempt), () => (null)),
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
      session_key: sessionData.childSessionKey,
    };
    discord(config, 'INFO', `🔬 ${displayAgentRole(agentType)} ${useSubagent ? 'Subagent' : 'ACP'} Session Spawned: ${agentType}/${moduleId}`, 'Agent is now working.', buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.LIFECYCLE, {
      runId,
      moduleId: telemetryModuleId(opts, moduleId),
      gateId: selectTruthyValue(() => (opts.gate_id), () => (null)),
      gateType: selectTruthyValue(() => (opts.gate_type), () => (null)),
      attempt: selectDefinedValue(() => (opts.attempt), () => (null)),
      dispatchId,
      gatewayLabel,
      sessionKey: sessionData.childSessionKey,
      model: resolvedModel,
      reasoningLevel: reasoningLevelValue(thinkingLevel),
      thinkingSource,
      runtime: useSubagent ? 'subagent' : 'acp',
    }, [
      { name: 'Agent', value: agentId, inline: true },
    ]), { correlation: spawnDiscordCorrelation }).catch((e) => {
      log('DEBUG', `Agent spawn Discord notice failed for ${gatewayLabel}: ${errorMessage(e)}`);
    });
    return {
      label: trackingKey,
      childSessionKey: sessionData.childSessionKey,
      runId,
      dispatchId,
      streamLogPath: sessionData.streamLogPath,
      session_key: sessionData.childSessionKey,
      stream_log_path: selectTruthyValue(() => (sessionData.streamLogPath), () => (null)),
      gateway_label: gatewayLabel,
      dispatch_id: dispatchId,
      run_id: runId,
      runtime: useSubagent ? 'subagent' : 'acp',
      model: resolvedModel,
      model_source: selectDefinedValue(() => (opts.model_source), () => (null)),
      reasoning_level: selectTruthyValue(() => (thinkingLevel), () => (null)),
      thinking_source: thinkingSource,
      agent_id: agentId,
    };
  } catch (e: any) {
    startupEvidenceReader.close?.();
    const spawnFailureDiscordCorrelation = {
      run_id: runId,
      module_id: telemetryModuleId(opts, moduleId),
      gate_id: selectTruthyValue(() => (opts.gate_id), () => (null)),
      gate_type: selectTruthyValue(() => (opts.gate_type), () => (null)),
      attempt: selectDefinedValue(() => (opts.attempt), () => (null)),
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
    };
    discord(config, 'CRITICAL', `❌ Spawn Failed: ${agentType}/${moduleId}`, selectTruthyValue(() => (e.message?.split('\n')[0]), () => ('missing_error_message')),
      buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.LIFECYCLE, {
        runId,
        moduleId: telemetryModuleId(opts, moduleId),
        gateId: selectTruthyValue(() => (opts.gate_id), () => (null)),
        gateType: selectTruthyValue(() => (opts.gate_type), () => (null)),
        attempt: selectDefinedValue(() => (opts.attempt), () => (null)),
        dispatchId,
        gatewayLabel,
      }),
      { correlation: spawnFailureDiscordCorrelation },
    ).catch((discordError) => {
      log('DEBUG', `Agent spawn failure Discord notice failed for ${gatewayLabel}: ${errorMessage(discordError)}`);
    });
    const err: AnyRecord = new Error(`Failed to spawn session '${gatewayLabel}': ${e.message}`);
    if (e?.code) err.code = e.code;
    if (e?.gatewayStatus) err.gatewayStatus = e.gatewayStatus;
    err.gateway_label = gatewayLabel;
    throw err;
  }
}

export async function killAcpAgent(
  config: AnyRecord,
  agentType: string,
  moduleId: string,
  graceful: boolean = false,
  opts: AnyRecord = {},
) {
  const label = opts.trackingLabel ? opts.trackingLabel : acpLabel(agentType, moduleId);
  const entry = getTrackedAgent(label);
  const sessionKey = entry?.sessionKey;
  if (!sessionKey) {
    log('WARN', `No sessionKey tracked for '${label}' — skipping kill`);
    untrackAgent(label);
    return false;
  }
  const runtime = entry?.runtime;
  const entryModel = selectDefinedValue(() => (textValue(entry?.model)), () => (''));
  const isSubagent = resolveRuntime({ runtime, model: entryModel }) === 'subagent';

  log('STEP', `Destroying ${isSubagent ? 'subagent' : 'ACP'} session: ${label} (${sessionKey})`);
  const termination = await terminateSession(sessionKey, {
    ...sessionLifecyclePolicies(config),
    ...(graceful && opts.graceMs ? { graceMs: opts.graceMs } : {}),
    graceBounded: graceful,
    runtime,
    model: entryModel,
    agentId: entry.agentId,
    label: entry.gatewayLabel,
    cleanup: async () => reaperAfterKill(entry.agentId, sessionKey, entry.gatewayLabel),
  });

  if (termination.confirmed) {
    untrackAgent(label);
    log('OK', `Session destroyed: ${label}`);
  } else {
    log(graceful ? 'DEBUG' : 'WARN', `Session not fully reconciled after stop: ${label} (${termination.state})`);
  }
  return termination.confirmed;
}

function resolveConfiguredBusterCapabilities(owner: AnyRecord = {}) {
  const value = owner.capabilities;
  return [...new Set(arrayValue(value).map((entry) => textValue(entry)).filter(Boolean))];
}

function stablePortOffset(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash % 20000;
}

function deriveIsolatedServePort({
  config = {},
  targetId = '',
  attempt = null,
  dispatchId = '',
}: AnyRecord = {}) {
  const runId = config?._runId ? config._runId : config?.run_id ? config.run_id : '';
  if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (!runId), () => (!targetId))), () => (!Number.isInteger(attempt)))), () => (attempt < 1))) return null;
  return 20000 + stablePortOffset(`${runId}:${targetId}:${attempt}:${selectDefinedValue(() => (textValue(dispatchId)), () => (''))}`);
}

function isolateServePortForBuster(testConfig: AnyRecord, opts: AnyRecord = {}) {
  const serve = testConfig?.serve && typeof testConfig.serve === 'object' ? testConfig.serve : null;
  if (selectTruthyValue(() => (selectTruthyValue(() => (!serve), () => (!Number.isInteger(serve.port)))), () => (serve.port <= 0))) return testConfig;
  if (selectTruthyValue(() => (typeof serve.start_cmd !== 'string'), () => (!serve.start_cmd.trim()))) return testConfig;

  const port = deriveIsolatedServePort(opts);
  if (selectTruthyValue(() => (!port), () => (port === serve.port))) return testConfig;

  const escapedPort = String(serve.port).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startCmd = serve.start_cmd.replace(new RegExp(`(^|\\s)PORT=${escapedPort}(?=\\s|$)`), `$1PORT=${port}`);
  if (startCmd === serve.start_cmd) return testConfig;

  return {
    ...testConfig,
    serve: {
      ...serve,
      port,
      start_cmd: startCmd,
      configured_port: serve.port,
      port_source: 'pipeline_isolated_per_dispatch',
    },
  };
}

export function buildBusterTestConfig(owner: AnyRecord = {}, config: AnyRecord = {}, opts: AnyRecord = {}) {
  const testConfig = owner?.test_config && typeof owner.test_config === 'object' ? owner.test_config : {};
  const busterRuntime = getBusterRuntimeConfig(config);
  const configuredTimeout = selectDefinedValue(() => (testConfig.suite_timeout_ms), () => (busterRuntime.suite_timeout_ms));
  if (selectTruthyValue(() => (!Number.isInteger(configuredTimeout)), () => (configuredTimeout <= 0))) {
    throw new Error('Buster payload requires positive test_config.suite_timeout_ms or config.buster.runtime.suite_timeout_ms');
  }
  const normalized = {
    ...testConfig,
    suite_timeout_ms: configuredTimeout,
  };
  return isolateServePortForBuster(normalized, opts);
}

export function buildBusterAgentJudgmentPolicy(owner: AnyRecord = {}) {
  const policy = owner?.agent_judgment;
  if (selectTruthyValue(() => (policy === undefined), () => (policy === null))) {
    return {
      required: false,
      reason: 'deterministic_suites_authoritative',
    };
  }
  if (selectTruthyValue(() => (selectTruthyValue(() => (!policy), () => (typeof policy !== 'object'))), () => (Array.isArray(policy)))) {
    throw new Error('Buster agent_judgment must be an object');
  }
  if (typeof policy.required !== 'boolean') {
    throw new Error('Buster agent_judgment.required must be a boolean');
  }
  return {
    required: policy.required,
    reason: typeof policy.reason === 'string' && policy.reason.trim()
      ? policy.reason.trim()
      : (policy.required ? 'agent_judgment_required' : 'deterministic_suites_authoritative'),
  };
}

function requiredBusterCommitHash(taskType: string, status: AnyRecord | null, opts: AnyRecord = {}) {
  const value = taskType === 'gate_test'
    ? opts.commit_hash
    : status?.forge_commit_hash;
  if (selectTruthyValue(() => (typeof value !== 'string'), () => (!value.trim()))) {
    throw new Error(`Buster ${taskType} payload requires explicit commit_hash`);
  }
  return value.trim();
}

export function buildBusterPayload(
  config: AnyRecord,
  progress: AnyRecord,
  moduleId: string,
  taskType: string,
  taskPrompt: string,
  status: AnyRecord | null,
  opts: AnyRecord = {},
) {
  const cooldownSeconds = Math.round(getRateLimitConfig(config).cooldown_hours * 60 * 60);
  const commitHash = requiredBusterCommitHash(taskType, status, opts);
  const base = {
    task_type: taskType,
    module: moduleId,
    project: config.project,
    commit_hash: commitHash,
    timestamp: new Date().toISOString(),
    completion_stream: completionStreamKey(config),
    discord_webhook_url: selectTruthyValue(() => (config.discord_webhook_url), () => (null)),
    acp_monitor: getAcpMonitorConfig(config),
    rate_limit: {
      max_pauses: getRateLimitConfig(config).max_pauses_per_module,
      initial_cooldown_s: cooldownSeconds,
      max_cooldown_s: cooldownSeconds,
    },
  };
  const resolvedModel = selectTruthyValue(() => (selectTruthyValue(() => (canonicalizeModelId(opts.model)), () => (opts.model))), () => (null));
  const sessionRuntime = resolveRuntime({ model: resolvedModel });
  const thinkingSupported = selectDefinedValue(() => (selectDefinedValue(() => (opts.thinking_supported), () => (opts.thinkingSupported))), () => (null));
  const thinking = selectDefinedValue(() => (opts.thinking), () => (null));
  const thinkingSource = selectDefinedValue(() => (selectDefinedValue(() => (opts.thinking_source), () => (opts.thinkingSource))), () => (null));
  const reasoningLevel = selectDefinedValue(() => (selectDefinedValue(() => (opts.reasoning_level), () => (opts.reasoningLevel))), () => ((thinkingSupported === false ? 'not supported' : (selectTruthyValue(() => (thinking), () => (null))))));
  const runId = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (opts.run_id), () => (config.run_id))), () => (config._runId))), () => (null));
  const { attempt, dispatch_id: dispatchId } = opts;
  if (selectTruthyValue(() => (!Number.isInteger(attempt)), () => (attempt < 1))) throw new Error(`Buster ${taskType} payload requires explicit positive integer attempt`);
  if (selectTruthyValue(() => (typeof dispatchId !== 'string'), () => (!dispatchId.trim()))) throw new Error(`Buster ${taskType} payload requires explicit dispatch_id`);
  const sessionKey = dispatchId;
  const artifacts = getPipelineArtifactBundle(config);
  const timeoutSecondsForMinutes = (minutes: unknown, label: string) => {
    const numeric = Number(minutes);
    if (!Number.isFinite(numeric) || numeric <= 0) throw new Error(`${label} must be a positive number`);
    return Math.max(1, Math.ceil(numeric * 60));
  };
  if (taskType === 'module_test') {
    const mod = progress.modules[moduleId];
    const pipelineDefaults = getPipelineDefaultsConfig(config);
    const timeoutSeconds = timeoutSecondsForMinutes(mod?.timeout_minutes, `Module ${moduleId} timeout_minutes`);
    return { ...base, stage_id: 'worker:module_buster', worker_type: 'module_buster', module_id: moduleId, prompt: taskPrompt, timeout_seconds: timeoutSeconds, session_key: sessionKey, session: { model: resolvedModel, runtime: sessionRuntime, agentId: selectTruthyValue(() => (modelToHarness(resolvedModel)), () => (null)), cwd: selectDefinedValue(() => (textValue(opts?.cwd)), () => (config.repo_root)), timeout_seconds: timeoutSeconds, label: dispatchId, thinking_level: thinking, thinking_source: thinkingSource, thinking_supported: thinkingSupported, reasoning_level: reasoningLevel }, model: resolvedModel, model_source: selectDefinedValue(() => (opts.model_source), () => (null)), thinking_level: thinking, thinking_source: thinkingSource, thinking_supported: thinkingSupported, reasoning_level: reasoningLevel, runtime: sessionRuntime, module_path: mod ? modulePathRef(config, mod.dir) : null, buster_md_path: mod ? moduleBusterMdPathRef(config, mod.dir) : null, output_file: mod ? moduleBusterOutputPathRef(config, mod.dir) : null, suites: selectTruthyValue(() => (mod?.test_suites), () => (null)), test_config: buildBusterTestConfig(mod, config, { config, targetId: moduleId, attempt, dispatchId }), agent_judgment: buildBusterAgentJudgmentPolicy(mod), capabilities: resolveConfiguredBusterCapabilities(mod), run_id: runId, attempt, dispatch_id: dispatchId, log_dir: mod ? moduleLogDir(config, mod.dir) : null, pipeline_log_path: artifacts.global_pipeline_jsonl_path, pipeline_run_log_path: artifacts.run_pipeline_jsonl_path };
  }
  if (taskType !== 'gate_test') throw new Error(`Buster payload builder does not support task_type '${taskType}'`);
  const gate = objectRecord(selectDefinedValue(() => (opts.gate), () => (progress.gates?.[moduleId])));
  const pipelineDefaults = getPipelineDefaultsConfig(config);
  const gateTimeout = gate.timeout_minutes
  const timeoutSeconds = timeoutSecondsForMinutes(gateTimeout, `Gate ${moduleId} timeout_minutes`);
  return { ...base, stage_id: 'gate:buster', gate_type: 'buster', module_id: moduleId, prompt: taskPrompt, timeout_seconds: timeoutSeconds, session_key: sessionKey, session: { model: resolvedModel, runtime: sessionRuntime, agentId: selectTruthyValue(() => (modelToHarness(resolvedModel)), () => (null)), cwd: config.repo_root, timeout_seconds: timeoutSeconds, label: dispatchId, thinking_level: thinking, thinking_source: thinkingSource, thinking_supported: thinkingSupported, reasoning_level: reasoningLevel }, model: resolvedModel, model_source: selectDefinedValue(() => (opts.model_source), () => (null)), thinking_level: thinking, thinking_source: thinkingSource, thinking_supported: thinkingSupported, reasoning_level: reasoningLevel, runtime: sessionRuntime, gate_id: moduleId, gate_title: selectTruthyValue(() => (gate.title), () => (moduleId)), work_dir: gateWorkDirPathRef(config), output_file: gateOutputPathRef(config, gate), instructions_file: gateInstructionsPathRef(config, gate), suites: selectTruthyValue(() => (gate.test_suites), () => (null)), test_config: buildBusterTestConfig(gate, config, { config, targetId: moduleId, attempt, dispatchId }), agent_judgment: buildBusterAgentJudgmentPolicy(gate), capabilities: resolveConfiguredBusterCapabilities(gate), run_id: runId, attempt, dispatch_id: dispatchId, log_dir: gateLogDir(config, moduleId), pipeline_log_path: artifacts.global_pipeline_jsonl_path, pipeline_run_log_path: artifacts.run_pipeline_jsonl_path };
}

export async function dispatchRedisTask(
  config: AnyRecord,
  progress: AnyRecord,
  agentType: string,
  moduleId: string,
  taskType: string,
  payload: string,
  status: AnyRecord | null = null,
  opts: AnyRecord = {},
) {
  const agentConfig = config.agents[agentType];
  log('STEP', `Dispatching to Redis: ${agentType} (module: ${moduleId}, type: ${taskType})`);
  const taskPayload = (selectTruthyValue(() => (taskType === 'module_test'), () => (taskType === 'gate_test')))
    ? buildBusterPayload(config, progress, moduleId, taskType, payload, status, opts)
    : { module: moduleId, project: config.project, message: payload, timestamp: new Date().toISOString() };

  try {
    if (agentConfig?.dispatch !== 'redis') {
      throw new Error(`Agent '${agentType}' is not configured for Redis dispatch`);
    }

    const redisDispatch = await getRedisDispatchModule(config, agentType, opts);
    const result = await redisDispatch.publishTask(agentType, taskType, taskPayload, 1);
    log('OK', `Redis task dispatched to ${agentType}: ${JSON.stringify(result)}`);
    return {
      ...result,
      dispatch_id: selectTruthyValue(() => (taskPayload.dispatch_id), () => (null)),
      gateway_label: selectTruthyValue(() => (taskPayload.session?.label), () => (null)),
      session_key: selectTruthyValue(() => (taskPayload.session_key), () => (null)),
      run_id: selectTruthyValue(() => (taskPayload.run_id), () => (null)),
      attempt: selectTruthyValue(() => (taskPayload.attempt), () => (null)),
      runtime: selectTruthyValue(() => (selectTruthyValue(() => (taskPayload.session?.runtime), () => (taskPayload.runtime))), () => (null)),
      model: selectTruthyValue(() => (selectTruthyValue(() => (taskPayload.session?.model), () => (taskPayload.model))), () => (null)),
      model_source: selectTruthyValue(() => (taskPayload.model_source), () => (null)),
      reasoning_level: selectTruthyValue(() => (selectTruthyValue(() => (taskPayload.reasoning_level), () => (taskPayload.session?.reasoning_level))), () => (null)),
      thinking_source: selectTruthyValue(() => (selectTruthyValue(() => (taskPayload.thinking_source), () => (taskPayload.session?.thinking_source))), () => (null)),
    };
  } catch (e: any) {
    throw new Error(`Failed to dispatch Redis task to ${agentType}: ${e.message}`);
  }
}

export async function spawnAgent(
  config: AnyRecord,
  progress: AnyRecord,
  agentType: string,
  moduleId: string,
  model: string,
  taskPrompt: string,
  opts: AnyRecord = {},
) {
  const agentConfig = config.agents[agentType];
  if (!agentConfig) throw new Error(`Unknown agent type: ${agentType}`);
  const resolvedModel = requiredCanonicalModelId(model, `Agent '${agentType}' model`);
  if (agentConfig.dispatch === 'redis') {
  const taskType = selectDefinedValue(() => (textValue(opts.taskType)), () => (MODULE_TEST_TASK_TYPE));
    opts.model = resolvedModel;
    return await dispatchRedisTask(config, progress, agentType, moduleId, taskType, taskPrompt, opts.status, opts);
  }
  return spawnAcpAgent(config, agentType, moduleId, resolvedModel, taskPrompt, opts);
}

export async function killAgent(config: AnyRecord, agentType: string, moduleId: string, graceful: boolean = false, opts: AnyRecord = {}) {
  const agentConfig = config.agents[agentType];
  if (!agentConfig) throw new Error(`Unknown agent type: ${agentType}`);
  if (agentConfig.dispatch === 'redis') log('INFO', `${agentType} is a Redis agent — no session to destroy (persistent instance)`);
  else await killAcpAgent(config, agentType, moduleId, graceful, opts);
}

export async function steerAgent(
  config: AnyRecord,
  progress: AnyRecord,
  agentType: string,
  moduleId: string,
  message: string,
) {
  const agentConfig = config.agents[agentType];
  if (!agentConfig) throw new Error(`Unknown agent type: ${agentType}`);
  if (agentConfig.dispatch === 'redis') {
    log('STEP', `Steering ${agentType} via Redis follow-up message`);
    try { await dispatchRedisTask(config, progress, agentType, moduleId, 'steer', message); }
    catch (e: any) { log('WARN', `Redis steer failed for ${agentType}: ${e.message}`); }
    return;
  }
  const label = acpLabel(agentType, moduleId);
  const sessionKey = getTrackedAgent(label)?.sessionKey;
  if (!sessionKey) {
    log('WARN', `No sessionKey tracked for '${label}' — cannot steer`);
    return;
  }
  const sendPolicy = gatewayInvokePolicy(config, 'session_send');
  try { await sendGatewaySessionMessage(sessionKey, message, sendPolicy.timeoutMs, sendPolicy); }
  catch (e: any) { log('WARN', `ACP steer failed for '${label}': ${e.message}`); }
}
