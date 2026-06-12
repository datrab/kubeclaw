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
import { log, getActiveContext } from '../core/logger.ts';
import { onAgentKilled, onAgentSpawned } from '../services/telemetry.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import {
  buildModuleBusterWorkerControlResult,
  buildModuleForgeWorkerControlResult,
  coerceModuleBusterWorkerControlResult,
  coerceModuleForgeWorkerControlResult,
  isModuleBusterWorkerControlResult,
  isModuleForgeWorkerControlResult,
} from './module-worker-control-results.ts';
import { verifyAgentAlive } from './orchestration-healthcheck.ts';
import {
  buildKillTelemetryPayload,
  buildSpawnTelemetryPayload,
  telemetryModuleId,
} from './orchestration-lifecycle-events.ts';
import { sendGatewaySessionMessage } from '../integrations/gateway.ts';
import { discord } from '../integrations/discord.ts';
import { resolveRegisteredRedisAdapter } from '../services/adapter-registry.ts';
import { reaperAfterKill } from './shutdown.ts';
import { waitForSessionIdle } from './acp-monitor.ts';
import { modelToHarness, resolveRuntime } from './runtime.ts';
import { getTrackedAgent, spawnSession, trackAgent, untrackAgent } from './lifecycle.ts';
import { terminateSession } from './session-termination.ts';
import { runModuleBusterWorker, runModuleForgeWorker } from './module-workers.ts';
import { killReviewerAgent, spawnReviewerAgent } from './reviewer-lifecycle.ts';
import { buildSubprocessEnv } from '../security.ts';
import { getPipelineArtifactBundle } from '../services/artifact-bundle.ts';

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
export { verifyAgentAlive } from './orchestration-healthcheck.ts';
export { runModuleBusterWorker, runModuleForgeWorker } from './module-workers.ts';
export { killReviewerAgent, spawnReviewerAgent } from './reviewer-lifecycle.ts';

const _redisDispatchModules = new Map<string, any>();

async function getRedisDispatchModule(config: AnyRecord, agentType: string, opts: AnyRecord = {}) {
  if (!config?.agents?.[agentType]) throw new Error(`Unknown agent type: ${agentType}`);

  const { adapter: redisDispatch, key, cacheable = true } = resolveRegisteredRedisAdapter(config, {
    agentType,
    source: `agents.${agentType}`,
    requiredMethods: ['publishTask'],
    deps: opts.deps,
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
    log('DEBUG', `Could not capture baseline files for ${trackingKey}: ${e?.message || e}`);
  }
}

export function computeFilesChanged(entry: AnyRecord | null, config: AnyRecord) {
  let filesChanged = null;
  let baselineTracked = false;
  if (entry?._baselineFiles) {
    baselineTracked = true;
    try {
      const baselineCwd = entry._baselineCwd || null;
      if (!baselineCwd || !isGitWorktree(baselineCwd)) return { filesChanged, baselineTracked: false };
      const currentOutput = execFileSync('git', ['-C', baselineCwd, 'diff', '--name-only', 'HEAD'], {
        encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'], env: buildSubprocessEnv(),
      });
      const currentFiles = new Set(currentOutput.trim().split('\n').filter(Boolean));
      const newFiles = [...currentFiles].filter(f => !entry._baselineFiles.has(f));
      if (newFiles.length > 0) filesChanged = newFiles;
    } catch (e: any) {
      log('DEBUG', `Could not compute files changed for ${entry?.gatewayLabel || 'agent'}: ${e?.message || e}`);
    }
  }
  return { filesChanged, baselineTracked };
}

export function acpLabel(agentType: string, moduleId: string) {
  return `${agentType}-${moduleId}`;
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
  const trackingKey = opts.trackingLabel || acpLabel(agentType, moduleId);
  const dispatchTs = Date.now();
  const gatewayLabel = `${trackingKey}-${dispatchTs}`;
  const runId = opts.run_id || config?._runId || config?.run_id || null;
  const dispatchId = opts.dispatch_id || `${trackingKey}-dispatch-${dispatchTs}`;
  const agentId = modelToHarness(model) || agentConfig.acp_agent_id;
  if (!agentId) throw new Error(`ACP dispatch for '${agentType}' requires explicit acp_agent_id or model harness mapping`);
  const cwd = agentConfig.cwd || config.repo_root;
  const runtime = resolveRuntime({ model });
  const useSubagent = runtime === 'subagent';
  const thinkingLevel = opts.thinking || null;

  try {
    const sessionData = await spawnSession({
      session: { model, runtime, agentId, cwd, label: gatewayLabel },
    }, taskPrompt, agentConfig?.timeout_seconds || null, {
      runtime,
      model,
      agentId,
      cwd,
      label: gatewayLabel,
      thinking: thinkingLevel,
      trackActive: false,
      budget: opts.budget || null,
      signal: opts.signal || null,
    });

    log('OK', `${useSubagent ? 'Subagent' : 'ACP'} session spawned: ${gatewayLabel} → ${sessionData.childSessionKey}${sessionData.streamLogPath ? ` (stream: ${sessionData.streamLogPath})` : ''}`, { agent: agentId, model, sessionKey: sessionData.childSessionKey, runId: sessionData.runId, dispatchId, stream: sessionData.streamLogPath });
    trackAgent(config, trackingKey, sessionData.childSessionKey, agentId, gatewayLabel, sessionData.streamLogPath, {
      model,
      runtime: useSubagent ? 'subagent' : 'acp',
      moduleId,
      run_id: runId,
      attempt: opts.attempt ?? null,
      dispatch_id: dispatchId,
      telemetry_module_id: telemetryModuleId(opts, moduleId),
      telemetry_gate_id: opts.gate_id || null,
      telemetry_gate_type: opts.gate_type || null,
      telemetry_attempt: opts.attempt ?? null,
      telemetry_dispatch_id: dispatchId,
      telemetry_substep: opts.substep || null,
    });
    captureBaselineFiles(trackingKey, cwd);

    try {
      const _ctx = getActiveContext() || { config };
      onAgentSpawned(_ctx, agentType, buildSpawnTelemetryPayload({
        label: gatewayLabel,
        model,
        dispatch: useSubagent ? 'subagent' : 'acp',
        moduleId: telemetryModuleId(opts, moduleId),
        gateId: opts.gate_id || null,
        gateType: opts.gate_type || null,
        substep: opts.substep || null,
        attempt: opts.attempt ?? null,
        dispatchId,
        timeoutSeconds: agentConfig?.timeout_seconds || null,
        sessionKey: sessionData.childSessionKey,
        thinkingLevel,
      }));
    } catch (e: any) {
      log('DEBUG', `Spawn telemetry failed for ${gatewayLabel}: ${e?.message || e}`);
    }

    const spawnDiscordCorrelation = {
      run_id: runId,
      module_id: telemetryModuleId(opts, moduleId),
      gate_id: opts.gate_id || null,
      gate_type: opts.gate_type || null,
      attempt: opts.attempt ?? null,
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
      session_key: sessionData.childSessionKey,
    };
    discord(config, 'INFO', `🔬 ${useSubagent ? 'Subagent' : 'ACP'} Session Spawned: ${agentType}/${moduleId}`, 'Agent is now working.', buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.LIFECYCLE, {
      runId,
      moduleId: telemetryModuleId(opts, moduleId),
      gateId: opts.gate_id || null,
      gateType: opts.gate_type || null,
      attempt: opts.attempt ?? null,
      dispatchId,
      gatewayLabel,
      sessionKey: sessionData.childSessionKey,
    }, [
      { name: 'Agent', value: agentId, inline: true },
      { name: 'Model', value: model, inline: true },
    ]), { correlation: spawnDiscordCorrelation }).catch((e) => {
      log('DEBUG', `Agent spawn Discord notice failed for ${gatewayLabel}: ${e?.message || e}`);
    });
    return { label: trackingKey, childSessionKey: sessionData.childSessionKey, runId, dispatchId, streamLogPath: sessionData.streamLogPath };
  } catch (e: any) {
    const spawnFailureDiscordCorrelation = {
      run_id: runId,
      module_id: telemetryModuleId(opts, moduleId),
      gate_id: opts.gate_id || null,
      gate_type: opts.gate_type || null,
      attempt: opts.attempt ?? null,
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
    };
    discord(config, 'CRITICAL', `❌ Spawn Failed: ${agentType}/${moduleId}`, e.message?.split('\n')[0] || 'unknown',
      buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.LIFECYCLE, {
        runId,
        moduleId: telemetryModuleId(opts, moduleId),
        gateId: opts.gate_id || null,
        gateType: opts.gate_type || null,
        attempt: opts.attempt ?? null,
        dispatchId,
        gatewayLabel,
      }),
      { correlation: spawnFailureDiscordCorrelation },
    ).catch((discordError) => {
      log('DEBUG', `Agent spawn failure Discord notice failed for ${gatewayLabel}: ${discordError?.message || discordError}`);
    });
    const err: AnyRecord = new Error(`Failed to spawn session '${gatewayLabel}': ${e.message}`);
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
  const label = opts.trackingLabel || acpLabel(agentType, moduleId);
  const entry = getTrackedAgent(label);
  const sessionKey = entry?.sessionKey;
  if (!sessionKey) {
    log('WARN', `No sessionKey tracked for '${label}' — skipping kill`);
    untrackAgent(label);
    return false;
  }
  if (graceful) {
    log('INFO', `Waiting for session to become idle: ${label}`);
    await waitForSessionIdle(sessionKey, { ...config.acp_monitor, streamLogPath: entry?.streamLogPath || null });
  }
  const runtime = entry?.runtime;
  const entryModel = entry?.model || '';
  const isSubagent = resolveRuntime({ runtime, model: entryModel }) === 'subagent';

  log('STEP', `Destroying ${isSubagent ? 'subagent' : 'ACP'} session: ${label} (${sessionKey})`);
  const termination = await terminateSession(sessionKey, {
    runtime,
    model: entryModel,
    agentId: entry.agentId,
    label: entry.gatewayLabel,
    cleanup: async () => reaperAfterKill(entry.agentId, sessionKey, entry.gatewayLabel),
  });

  const { filesChanged, baselineTracked } = computeFilesChanged(entry, config);
  if (termination.confirmed) {
    untrackAgent(label);
    log('OK', `Session destroyed: ${label}`);
  } else {
    log('WARN', `Session not fully reconciled after stop: ${label} (${termination.state})`);
  }

  try {
    const _ctx = getActiveContext() || { config };
    onAgentKilled(_ctx, agentType, buildKillTelemetryPayload({
      entry,
      fallbackLabel: label,
      fallbackModuleId: moduleId,
      fallbackGateId: null,
      filesChanged,
      baselineTracked,
    }));
  } catch (e: any) {
    log('DEBUG', `Kill telemetry failed for ${label}: ${e?.message || e}`);
  }
  return termination.confirmed;
}

function resolveConfiguredBusterCapabilities(owner: AnyRecord = {}) {
  const value = owner.capabilities;
  return Array.isArray(value) ? [...new Set(value.map((entry) => String(entry || '').trim()).filter(Boolean))] : [];
}

function buildBusterTestConfig(owner: AnyRecord = {}, config: AnyRecord = {}) {
  const testConfig = owner?.test_config && typeof owner.test_config === 'object' ? owner.test_config : {};
  const configuredTimeout = testConfig.suite_timeout_ms ?? config.buster.suite_timeout_ms;
  if (!Number.isInteger(configuredTimeout) || configuredTimeout <= 0) {
    throw new Error('Buster payload requires positive test_config.suite_timeout_ms or config.buster.suite_timeout_ms');
  }
  return {
    ...testConfig,
    suite_timeout_ms: configuredTimeout,
  };
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
  const cooldownSeconds = Math.round(config.rate_limit.cooldown_hours * 60 * 60);
  const base = {
    task_type: taskType,
    module: moduleId,
    project: config.project,
    commit_hash: status?.forge_commit_hash || null,
    timestamp: new Date().toISOString(),
    completion_stream: completionStreamKey(config),
    acp_monitor: config.acp_monitor,
    rate_limit: {
      max_pauses: config.rate_limit.max_pauses_per_module,
      initial_cooldown_s: cooldownSeconds,
      max_cooldown_s: cooldownSeconds,
    },
  };
  const sessionRuntime = resolveRuntime({ model: opts.model || null });
  const runId = opts.run_id || config.run_id || config._runId || null;
  const { attempt, dispatch_id: dispatchId } = opts;
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error(`Buster ${taskType} payload requires explicit positive integer attempt`);
  if (typeof dispatchId !== 'string' || !dispatchId.trim()) throw new Error(`Buster ${taskType} payload requires explicit dispatch_id`);
  const artifacts = getPipelineArtifactBundle(config);
  if (taskType === 'module_test') {
    const mod = progress.modules[moduleId];
    return { ...base, stage_id: 'worker:module_buster', worker_type: 'module_buster', module_id: moduleId, prompt: taskPrompt, session: { model: opts.model || null, runtime: sessionRuntime, agentId: modelToHarness(opts.model) || null, cwd: config.repo_root, timeout_seconds: (mod?.timeout_minutes ?? config.default_timeout_minutes) * 60, label: dispatchId }, module_path: mod ? modulePathRef(config, mod.dir) : null, buster_md_path: mod ? moduleBusterMdPathRef(config, mod.dir) : null, output_file: mod ? moduleBusterOutputPathRef(config, mod.dir) : null, suites: mod?.test_suites || null, test_config: buildBusterTestConfig(mod, config), capabilities: resolveConfiguredBusterCapabilities(mod), run_id: runId, attempt, dispatch_id: dispatchId, log_dir: mod ? moduleLogDir(config, mod.dir) : null, pipeline_log_path: artifacts.global_pipeline_jsonl_path, pipeline_run_log_path: artifacts.run_pipeline_jsonl_path };
  }
  if (taskType !== 'gate_test') throw new Error(`Buster payload builder does not support task_type '${taskType}'`);
  const gate = opts.gate || progress.gates?.[moduleId] || {};
  const gateTimeout = gate.timeout_minutes ?? config.default_timeout_minutes;
  return { ...base, stage_id: 'gate:buster', gate_type: 'buster', module_id: moduleId, prompt: taskPrompt, session: { model: opts.model || null, runtime: sessionRuntime, agentId: modelToHarness(opts.model) || null, cwd: config.repo_root, timeout_seconds: gateTimeout * 60, label: dispatchId }, gate_id: moduleId, gate_title: gate.title || moduleId, work_dir: gateWorkDirPathRef(config), output_file: gateOutputPathRef(config, gate), instructions_file: gateInstructionsPathRef(config, gate), suites: gate.test_suites || null, test_config: buildBusterTestConfig(gate, config), capabilities: resolveConfiguredBusterCapabilities(gate), run_id: runId, attempt, dispatch_id: dispatchId, log_dir: gateLogDir(config, moduleId), pipeline_log_path: artifacts.global_pipeline_jsonl_path, pipeline_run_log_path: artifacts.run_pipeline_jsonl_path };
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
  const taskPayload = (taskType === 'module_test' || taskType === 'gate_test') ? buildBusterPayload(config, progress, moduleId, taskType, payload, status, opts) : { module: moduleId, project: config.project, message: payload, timestamp: new Date().toISOString() };

  try {
    if (agentConfig?.dispatch !== 'redis') {
      throw new Error(`Agent '${agentType}' is not configured for Redis dispatch`);
    }

    const redisDispatch = await getRedisDispatchModule(config, agentType, opts);
    const result = await redisDispatch.publishTask(agentType, taskType, taskPayload, 1);
    log('OK', `Redis task dispatched to ${agentType}: ${JSON.stringify(result)}`);
    return { ...result, dispatch_id: taskPayload.dispatch_id || null, gateway_label: taskPayload.session?.label || null, run_id: taskPayload.run_id || null, attempt: taskPayload.attempt || null };
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
  if (agentConfig.dispatch === 'redis') {
    const taskType = opts.taskType || 'module_test';
    opts.model = model;
    return await dispatchRedisTask(config, progress, agentType, moduleId, taskType, taskPrompt, opts.status, opts);
  }
  return spawnAcpAgent(config, agentType, moduleId, model, taskPrompt, opts);
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
  try { await sendGatewaySessionMessage(sessionKey, message, 15000); }
  catch (e: any) { log('WARN', `ACP steer failed for '${label}': ${e.message}`); }
}
