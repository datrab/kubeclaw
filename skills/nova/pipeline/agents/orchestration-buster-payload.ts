import {
  completionStreamKey,
  gateInstructionsPathRef,
  gateLogDir,
  gateOutputPathRef,
  gateWorkDirPathRef,
  moduleBusterMdPathRef,
  moduleBusterOutputPathRef,
  moduleLogDir,
  modulePathRef,
} from '../core/paths.ts';
import { getAcpMonitorConfig } from './acp-monitor.ts';
import { canonicalizeModelId, modelToHarness, resolveRuntime } from './runtime.ts';
import { getRateLimitConfig } from '../services/rate-limit.ts';
import { getBusterRuntimeConfig } from '../services/runtime-defaults.ts';
import { getPipelineArtifactBundle } from '../services/artifact-bundle.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { arrayValue, objectRecord, textValue } from './orchestration-values.ts';
import type { AnyRecord } from './orchestration-values.ts';

function resolveConfiguredBusterCapabilities(owner: AnyRecord = {}) {
  return [...new Set(arrayValue(owner.capabilities).map((entry) => textValue(entry)).filter(Boolean))];
}

function stablePortOffset(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash % 20000;
}

function deriveIsolatedServePort(input: AnyRecord = {}) {
  const runId = selectTruthyValue(
    () => (input.config?._runId),
    () => (selectTruthyValue(() => (input.config?.run_id), () => (''))),
  );
  if (!runId || !input.targetId || !Number.isInteger(input.attempt) || input.attempt < 1) return null;
  const dispatchId = selectDefinedValue(() => (textValue(input.dispatchId)), () => (''));
  return 20000 + stablePortOffset(`${runId}:${input.targetId}:${input.attempt}:${dispatchId}`);
}

function isolateServePortForBuster(testConfig: AnyRecord, opts: AnyRecord = {}) {
  const serve = testConfig?.serve && typeof testConfig.serve === 'object' ? testConfig.serve : null;
  if (!serve || !Number.isInteger(serve.port) || serve.port <= 0) return testConfig;
  if (typeof serve.start_cmd !== 'string' || !serve.start_cmd.trim()) return testConfig;
  const port = deriveIsolatedServePort(opts);
  if (!port || port === serve.port) return testConfig;
  const escapedPort = String(serve.port).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startCmd = serve.start_cmd.replace(new RegExp(`(^|\\s)PORT=${escapedPort}(?=\\s|$)`), `$1PORT=${port}`);
  if (startCmd === serve.start_cmd) return testConfig;
  return {
    ...testConfig,
    serve: { ...serve, port, start_cmd: startCmd, configured_port: serve.port, port_source: 'pipeline_isolated_per_dispatch' },
  };
}

export function buildBusterTestConfig(owner: AnyRecord = {}, config: AnyRecord = {}, opts: AnyRecord = {}) {
  const testConfig = owner?.test_config && typeof owner.test_config === 'object' ? owner.test_config : {};
  const configuredTimeout = selectDefinedValue(
    () => (testConfig.suite_timeout_ms),
    () => (getBusterRuntimeConfig(config).suite_timeout_ms),
  );
  if (!Number.isInteger(configuredTimeout) || configuredTimeout <= 0) {
    throw new Error('Buster payload requires positive test_config.suite_timeout_ms or config.buster.runtime.suite_timeout_ms');
  }
  return isolateServePortForBuster({ ...testConfig, suite_timeout_ms: configuredTimeout }, opts);
}

export function buildBusterAgentJudgmentPolicy(owner: AnyRecord = {}) {
  const policy = owner?.agent_judgment;
  if (policy === undefined || policy === null) {
    return { required: false, reason: 'deterministic_suites_authoritative' };
  }
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new Error('Buster agent_judgment must be an object');
  }
  if (typeof policy.required !== 'boolean') throw new Error('Buster agent_judgment.required must be a boolean');
  return {
    required: policy.required,
    reason: typeof policy.reason === 'string' && policy.reason.trim()
      ? policy.reason.trim()
      : (policy.required ? 'agent_judgment_required' : 'deterministic_suites_authoritative'),
  };
}

function requiredBusterCommitHash(taskType: string, status: AnyRecord | null, opts: AnyRecord) {
  const value = taskType === 'gate_test' ? opts.commit_hash : status?.forge_commit_hash;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Buster ${taskType} payload requires explicit commit_hash`);
  }
  return value.trim();
}

function timeoutSecondsForMinutes(minutes: unknown, label: string) {
  const numeric = Number(minutes);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error(`${label} must be a positive number`);
  return Math.max(1, Math.ceil(numeric * 60));
}

function payloadSession(config: AnyRecord, opts: AnyRecord, timeoutSeconds: number, dispatchId: string, model: any) {
  const thinkingSupported = selectDefinedValue(() => (opts.thinking_supported), () => (opts.thinkingSupported));
  const thinking = selectDefinedValue(() => (opts.thinking), () => (null));
  return {
    model,
    runtime: resolveRuntime({ model }),
    agentId: selectTruthyValue(() => (modelToHarness(model)), () => (null)),
    cwd: selectDefinedValue(() => (textValue(opts?.cwd)), () => (config.repo_root)),
    timeout_seconds: timeoutSeconds,
    label: dispatchId,
    thinking_level: thinking,
    thinking_source: selectDefinedValue(() => (opts.thinking_source), () => (opts.thinkingSource)),
    thinking_supported: thinkingSupported,
    reasoning_level: selectDefinedValue(
      () => (selectDefinedValue(() => (opts.reasoning_level), () => (opts.reasoningLevel))),
      () => (thinkingSupported === false ? 'not supported' : thinking),
    ),
  };
}

function basePayload(config: AnyRecord, taskType: string, moduleId: string, commitHash: string) {
  const cooldownSeconds = Math.round(getRateLimitConfig(config).cooldown_hours * 60 * 60);
  return {
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
}

function commonTargetPayload(config: AnyRecord, taskPrompt: string, opts: AnyRecord, target: AnyRecord, targetId: string) {
  const model = selectTruthyValue(
    () => (canonicalizeModelId(opts.model)),
    () => (selectTruthyValue(() => (opts.model), () => (null))),
  );
  const timeoutSeconds = timeoutSecondsForMinutes(target.timeout_minutes, `${opts.taskTypeLabel} ${targetId} timeout_minutes`);
  const dispatchId = opts.dispatch_id;
  const session = payloadSession(config, opts, timeoutSeconds, dispatchId, model);
  return {
    prompt: taskPrompt,
    timeout_seconds: timeoutSeconds,
    session_key: dispatchId,
    session,
    model,
    model_source: selectDefinedValue(() => (opts.model_source), () => (null)),
    thinking_level: session.thinking_level,
    thinking_source: session.thinking_source,
    thinking_supported: session.thinking_supported,
    reasoning_level: session.reasoning_level,
    runtime: session.runtime,
    suites: selectTruthyValue(() => (target.test_suites), () => (null)),
    test_config: buildBusterTestConfig(target, config, { config, targetId, attempt: opts.attempt, dispatchId }),
    agent_judgment: buildBusterAgentJudgmentPolicy(target),
    capabilities: resolveConfiguredBusterCapabilities(target),
    run_id: opts.runId,
    attempt: opts.attempt,
    dispatch_id: dispatchId,
  };
}

function validateDispatchIdentity(taskType: string, opts: AnyRecord, config: AnyRecord) {
  if (!Number.isInteger(opts.attempt) || opts.attempt < 1) {
    throw new Error(`Buster ${taskType} payload requires explicit positive integer attempt`);
  }
  if (typeof opts.dispatch_id !== 'string' || !opts.dispatch_id.trim()) {
    throw new Error(`Buster ${taskType} payload requires explicit dispatch_id`);
  }
  return selectTruthyValue(() => (opts.run_id), () => (selectTruthyValue(() => (config.run_id), () => (config._runId))));
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
  const commitHash = requiredBusterCommitHash(taskType, status, opts);
  const runId = validateDispatchIdentity(taskType, opts, config);
  const artifacts = getPipelineArtifactBundle(config);
  const base = basePayload(config, taskType, moduleId, commitHash);
  if (taskType === 'module_test') {
    const module = progress.modules[moduleId];
    const target = commonTargetPayload(config, taskPrompt, { ...opts, runId, taskTypeLabel: 'Module' }, module, moduleId);
    return {
      ...base,
      ...target,
      stage_id: 'worker:module_buster',
      worker_type: 'module_buster',
      module_id: moduleId,
      module_path: module ? modulePathRef(config, module.dir) : null,
      buster_md_path: module ? moduleBusterMdPathRef(config, module.dir) : null,
      output_file: module ? moduleBusterOutputPathRef(config, module.dir) : null,
      log_dir: module ? moduleLogDir(config, module.dir) : null,
      pipeline_log_path: artifacts.global_pipeline_jsonl_path,
      pipeline_run_log_path: artifacts.run_pipeline_jsonl_path,
    };
  }
  if (taskType !== 'gate_test') throw new Error(`Buster payload builder does not support task_type '${taskType}'`);
  const gate = objectRecord(selectDefinedValue(() => (opts.gate), () => (progress.gates?.[moduleId])));
  const target = commonTargetPayload(config, taskPrompt, { ...opts, runId, taskTypeLabel: 'Gate' }, gate, moduleId);
  target.session.cwd = config.repo_root;
  return {
    ...base,
    ...target,
    stage_id: 'gate:buster',
    gate_type: 'buster',
    module_id: moduleId,
    gate_id: moduleId,
    gate_title: selectTruthyValue(() => (gate.title), () => (moduleId)),
    work_dir: gateWorkDirPathRef(config),
    output_file: gateOutputPathRef(config, gate),
    instructions_file: gateInstructionsPathRef(config, gate),
    log_dir: gateLogDir(config, moduleId),
    pipeline_log_path: artifacts.global_pipeline_jsonl_path,
    pipeline_run_log_path: artifacts.run_pipeline_jsonl_path,
  };
}
