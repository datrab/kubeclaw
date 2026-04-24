import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { resolveModel } from '../core/config.js';
import { STATUS } from '../core/constants.js';
import { completionStreamKey, modulePath, relPath, statusPath, swarmRoot, validateSafePath } from '../core/paths.js';
import { log, getActiveContext } from '../core/logger.js';
import { onAgentKilled, onAgentSpawned, emitObservabilityDegraded, emitObservabilityRestored } from '../services/telemetry.js';
import { observeAcpMonitorSurfaces } from '../services/acp-observability.js';
import { archiveModuleCompletions, pollDualWithRateLimitRecovery, pollWithRateLimitRecovery } from '../services/polling.js';
import {
  buildTypedWorkerControlResult,
  cloneSerializable,
  coerceTypedWorkerControlResult,
  extractTypedWorkerLegacyResult,
  isTypedWorkerControlResult,
} from '../services/worker-control-result.js';
import { loadStatus, saveStreamLog } from '../services/status-store.js';
import { gatewayInvoke } from '../../../common/pipeline/integrations/gateway.js';
import { discord } from '../integrations/discord.js';
import redisDispatchTool from '../tools/redis.js';
import { buildDiscordIdentityFields, DISCORD_FIELD_SPECS } from '../services/discord-fields.js';
import { classifyPreTestFailure } from '../services/failures.js';
import { reaperAfterKill } from './shutdown.js';
import { parseSessionState, readAcpTranscriptState, transcriptShowsProgress, waitForSessionIdle } from '../../../common/pipeline/agents/acp-monitor.js';
import { modelToHarness, resolveRuntime } from '../../../common/pipeline/agents/runtime.js';
import { getTrackedAgent, spawnSession, killSession, trackAgent, untrackAgent } from '../../../common/pipeline/agents/lifecycle.js';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

const _redisDispatchModules = new Map();
const CANONICAL_REDIS_DISPATCH_PATHS = new Set([
  path.resolve('/app/skills/pipeline/tools/redis.js'),
  path.resolve('/app/skills/redis.js'),
  path.resolve(fileURLToPath(new URL('../tools/redis.js', import.meta.url))),
]);

function isCanonicalRedisDispatchPath(filePath) {
  return CANONICAL_REDIS_DISPATCH_PATHS.has(path.resolve(filePath));
}

async function getRedisDispatchModule(config, agentType) {
  const agentConfig = config?.agents?.[agentType];
  if (!agentConfig) throw new Error(`Unknown agent type: ${agentType}`);

  const redisJsPath = validateSafePath(
    agentConfig.redis_js_path || '/app/skills/pipeline/tools/redis.js',
    `agents.${agentType}.redis_js_path`
  );

  if (_redisDispatchModules.has(redisJsPath)) {
    return _redisDispatchModules.get(redisJsPath);
  }

  let redisDispatch = null;
  if (isCanonicalRedisDispatchPath(redisJsPath)) {
    redisDispatch = redisDispatchTool;
  } else {
    // Justified override-only dynamic import: tests and explicit deployments can inject
    // a validated alternate Redis adapter, but the normal/common dispatch path stays static.
    const mod = await import(pathToFileURL(redisJsPath).href);
    redisDispatch = mod?.default ?? mod;
  }
  if (!redisDispatch || typeof redisDispatch.sendTask !== 'function') {
    throw new Error(`Redis dispatch module '${redisJsPath}' must export sendTask(...)`);
  }

  _redisDispatchModules.set(redisJsPath, redisDispatch);
  log('INFO', `Redis dispatch module loaded via ${isCanonicalRedisDispatchPath(redisJsPath) ? 'static canonical import' : 'validated override import'}: ${redisJsPath}`);
  return redisDispatch;
}

function isGitWorktree(cwd) {
  if (!cwd) return false;
  try {
    const output = execFileSync('git', ['-C', cwd, 'rev-parse', '--is-inside-work-tree'], {
      encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'],
    });
    return output.trim() === 'true';
  } catch {
    return false;
  }
}

function captureBaselineFiles(trackingKey, cwd) {
  if (!isGitWorktree(cwd)) return;
  try {
    const baselineOutput = execFileSync('git', ['-C', cwd, 'diff', '--name-only', 'HEAD'], {
      encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const entry = getTrackedAgent(trackingKey);
    if (entry) entry._baselineFiles = new Set(baselineOutput.trim().split('\n').filter(Boolean));
  } catch {}
}

function computeFilesChanged(entry, config) {
  let filesChanged = null;
  let baselineTracked = false;
  if (entry?._baselineFiles) {
    baselineTracked = true;
    try {
      const repoRoot = config?.repo_root || process.cwd();
      if (!isGitWorktree(repoRoot)) return { filesChanged, baselineTracked: false };
      const currentOutput = execFileSync('git', ['-C', repoRoot, 'diff', '--name-only', 'HEAD'], {
        encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'],
      });
      const currentFiles = new Set(currentOutput.trim().split('\n').filter(Boolean));
      const newFiles = [...currentFiles].filter(f => !entry._baselineFiles.has(f));
      if (newFiles.length > 0) filesChanged = newFiles;
    } catch {}
  }
  return { filesChanged, baselineTracked };
}

function buildLifecycleDiscordFields(identity = {}, extra = []) {
  return buildDiscordIdentityFields(identity, [
    DISCORD_FIELD_SPECS.RUN_ID,
    DISCORD_FIELD_SPECS.MODULE_ID,
    DISCORD_FIELD_SPECS.GATE_ID,
    DISCORD_FIELD_SPECS.GATE_TYPE,
    DISCORD_FIELD_SPECS.ATTEMPT,
    DISCORD_FIELD_SPECS.DISPATCH_ID,
    DISCORD_FIELD_SPECS.GATEWAY_LABEL,
    DISCORD_FIELD_SPECS.SESSION_KEY,
  ], extra);
}

export function acpLabel(agentType, moduleId) {
  return `${agentType}-${moduleId}`;
}

export async function spawnAcpAgent(config, agentType, moduleId, model, taskPrompt, opts = {}) {
  const agentConfig = config.agents[agentType];
  const trackingKey = acpLabel(agentType, moduleId);
  const gatewayLabel = `${trackingKey}-${Date.now()}`;
  const agentId = modelToHarness(model) || agentConfig.acp_agent_id || agentType;
  const cwd = agentConfig.cwd || config.repo_root;
  const runtime = resolveRuntime({ model });
  const useSubagent = runtime === 'subagent';
  const thinkingLevel = opts.thinking || (useSubagent ? null : config.agents?.[agentType]?.thinking_level) || null;

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
    });

    log('OK', `${useSubagent ? 'Subagent' : 'ACP'} session spawned: ${gatewayLabel} → ${sessionData.childSessionKey}${sessionData.streamLogPath ? ` (stream: ${sessionData.streamLogPath})` : ''}`, { agent: agentId, model, sessionKey: sessionData.childSessionKey, runId: sessionData.runId, stream: sessionData.streamLogPath });
    trackAgent(config, trackingKey, sessionData.childSessionKey, agentId, gatewayLabel, sessionData.streamLogPath, {
      model,
      runtime: useSubagent ? 'subagent' : 'acp',
      moduleId,
      telemetry_module_id: Object.prototype.hasOwnProperty.call(opts, 'module_id') ? opts.module_id : moduleId,
      telemetry_gate_id: opts.gate_id || null,
      telemetry_gate_type: opts.gate_type || null,
      telemetry_attempt: opts.attempt ?? null,
      telemetry_dispatch_id: opts.dispatch_id || null,
      telemetry_substep: opts.substep || null,
    });
    captureBaselineFiles(trackingKey, cwd);

    try {
      const _ctx = getActiveContext() || { config };
      onAgentSpawned(_ctx, agentType, {
        label: gatewayLabel,
        model,
        dispatch: useSubagent ? 'subagent' : 'acp',
        module_id: Object.prototype.hasOwnProperty.call(opts, 'module_id') ? opts.module_id : moduleId,
        gate_id: opts.gate_id || null,
        gate_type: opts.gate_type || null,
        substep: opts.substep || null,
        attempt: opts.attempt ?? null,
        dispatch_id: opts.dispatch_id || null,
        timeout_minutes: agentConfig?.timeout_seconds ? Math.round(agentConfig.timeout_seconds / 60) : null,
        session_key: sessionData.childSessionKey,
        thinking_level: thinkingLevel,
      });
    } catch {}

    discord(config, 'INFO', `🔬 ${useSubagent ? 'Subagent' : 'ACP'} Session Spawned: ${agentType}/${moduleId}`, 'Agent is now working.', [
      ...buildLifecycleDiscordFields({
        run_id: sessionData.runId || config._runId || config.run_id || 'unknown',
        module_id: Object.prototype.hasOwnProperty.call(opts, 'module_id') ? opts.module_id : moduleId,
        gate_id: opts.gate_id || null,
        gate_type: opts.gate_type || null,
        attempt: opts.attempt ?? null,
        dispatch_id: opts.dispatch_id || null,
        gateway_label: gatewayLabel,
        session_key: sessionData.childSessionKey,
      }),
      { name: 'Agent', value: agentId, inline: true },
      { name: 'Model', value: model, inline: true },
    ]).catch(() => {});
    return { label: trackingKey, childSessionKey: sessionData.childSessionKey, runId: sessionData.runId, streamLogPath: sessionData.streamLogPath };
  } catch (e) {
    discord(config, 'CRITICAL', `❌ Spawn Failed: ${agentType}/${moduleId}`, e.message?.split('\n')[0] || 'unknown',
      buildLifecycleDiscordFields({
        run_id: config._runId || config.run_id || 'unknown',
        module_id: Object.prototype.hasOwnProperty.call(opts, 'module_id') ? opts.module_id : moduleId,
        gate_id: opts.gate_id || null,
        gate_type: opts.gate_type || null,
        attempt: opts.attempt ?? null,
        dispatch_id: opts.dispatch_id || null,
        gateway_label: gatewayLabel,
      })
    ).catch(() => {});
    const err = new Error(`Failed to spawn session '${gatewayLabel}': ${e.message}`);
    err.gateway_label = gatewayLabel;
    throw err;
  }
}

export async function killAcpAgent(config, agentType, moduleId, graceful = false) {
  const label = acpLabel(agentType, moduleId);
  const entry = getTrackedAgent(label);
  const sessionKey = entry?.sessionKey;
  if (!sessionKey) {
    log('WARN', `No sessionKey tracked for '${label}' — skipping kill`);
    untrackAgent(label);
    return false;
  }
  if (graceful) {
    log('INFO', `Waiting for session to become idle: ${label}`);
    await waitForSessionIdle(sessionKey, { streamLogPath: entry?.streamLogPath || null });
  }
  const runtime = entry?.runtime;
  const entryModel = entry?.model || '';
  const isSubagent = resolveRuntime({ runtime, model: entryModel }) === 'subagent';

  log('STEP', `Destroying ${isSubagent ? 'subagent' : 'ACP'} session: ${label} (${sessionKey})`);
  let terminated = false;
  try {
    await killSession(sessionKey, {
      runtime,
      model: entryModel,
      agentId: entry.agentId,
      label: entry.gatewayLabel,
    });
    await reaperAfterKill(entry.agentId || agentType, sessionKey, entry.gatewayLabel);
    try {
      const { monitor: mon } = await observeAcpMonitorSurfaces(config, sessionKey, healthCheckIdentity(entry, agentType, sessionKey), {
        streamLogPath: entry?.streamLogPath || null,
      });
      terminated = Boolean(mon?.failed || mon?.terminal || mon?.sessionTerminal || mon?.stopped);
      if (!terminated) log('WARN', `Session '${label}' stop requested but monitor still shows it as active (${mon?.lastDetail || 'unknown'})`);
    } catch (e) {
      log('DEBUG', `Session monitor check failed after stop for '${label}': ${e.message}`);
    }

    const { filesChanged, baselineTracked } = computeFilesChanged(entry, config);
    if (terminated) {
      untrackAgent(label);
      log('OK', `Session destroyed: ${label}`);
    }

    try {
      const _ctx = getActiveContext() || { config };
      onAgentKilled(_ctx, agentType, {
        label: entry?.gatewayLabel || label,
        module_id: entry?.telemetry_module_id ?? moduleId,
        gate_id: entry?.telemetry_gate_id || null,
        gate_type: entry?.telemetry_gate_type || null,
        session_key: sessionKey,
        attempt: entry?.telemetry_attempt ?? null,
        dispatch_id: entry?.telemetry_dispatch_id || null,
        has_changes: baselineTracked ? (filesChanged !== null) : null,
        files_changed: filesChanged,
      });
    } catch {}
  } finally {
    if (!terminated) log('WARN', `Session not fully reconciled after stop: ${label}`);
  }
  return terminated;
}

export function buildBusterPayload(config, progress, moduleId, taskType, taskPrompt, status, opts = {}) {
  const base = { task_type: taskType, module: moduleId, project: config.project, commit_hash: status?.forge_commit_hash || null, timestamp: new Date().toISOString(), completion_stream: completionStreamKey(config) };
  const sessionRuntime = resolveRuntime({ model: opts.model || null });
  const runId = opts.run_id || config.run_id || config._runId || null;
  const attempt = opts.attempt || 1;
  const dispatchId = opts.dispatch_id || `buster-${taskType}-${moduleId}-${Date.now()}`;
  if (taskType === 'module_test') {
    const mod = progress.modules[moduleId];
    return { ...base, stage_id: 'worker:module_buster', worker_type: 'module_buster', module_id: moduleId, prompt: taskPrompt, instructions: taskPrompt, session: { model: opts.model || null, runtime: sessionRuntime, agentId: modelToHarness(opts.model) || null, cwd: config.repo_root, timeout_seconds: (mod?.timeout_minutes ?? config.default_timeout_minutes) * 60, label: dispatchId }, module_path: mod ? relPath(config, modulePath(config, mod.dir)) : null, buster_md_path: mod ? relPath(config, path.join(modulePath(config, mod.dir), 'BUSTER.md')) : null, status_json_path: mod ? relPath(config, statusPath(config, mod.dir)) : null, suites: mod?.test_suites || null, test_suites: mod?.test_suites || null, test_config: mod?.test_config || null, run_id: runId, attempt, dispatch_id: dispatchId, log_dir: (mod && config._logDir) ? path.join(config._logDir, 'modules', mod.dir) : null, pipeline_log_path: config._logDir ? path.join(config._logDir, 'pipeline', 'pipeline.jsonl') : null, pipeline_run_log_path: config._runLogDir ? path.join(config._runLogDir, 'pipeline.jsonl') : null };
  }
  if (taskType === 'gate_test') {
    const gate = opts.gate || progress.gates?.[moduleId] || {};
    const gateTimeout = gate.timeout_minutes ?? config.default_timeout_minutes;
    return { ...base, stage_id: 'gate:buster', gate_type: 'buster', module_id: moduleId, prompt: taskPrompt, instructions: taskPrompt, session: { model: opts.model || null, runtime: sessionRuntime, agentId: modelToHarness(opts.model) || null, cwd: config.repo_root, timeout_seconds: gateTimeout * 60, label: dispatchId }, gate_id: moduleId, gate_title: gate.title || moduleId, work_dir: relPath(config, swarmRoot(config)), output_file: gate.output_file ? relPath(config, path.join(swarmRoot(config), gate.output_file)) : null, instructions_file: gate.instructions_file ? relPath(config, path.join(swarmRoot(config), gate.instructions_file)) : null, suites: gate.test_suites || null, test_suites: gate.test_suites || null, test_config: gate.test_config || null, run_id: runId, attempt, dispatch_id: dispatchId, log_dir: config._logDir ? path.join(config._logDir, 'gates', moduleId) : null, pipeline_log_path: config._logDir ? path.join(config._logDir, 'pipeline', 'pipeline.jsonl') : null, pipeline_run_log_path: config._runLogDir ? path.join(config._runLogDir, 'pipeline.jsonl') : null };
  }
  return { ...base, message: taskPrompt };
}

export async function dispatchRedisTask(config, progress, agentType, moduleId, taskType, payload, status = null, opts = {}) {
  const agentConfig = config.agents[agentType];
  log('STEP', `Dispatching to Redis: ${agentType} (module: ${moduleId}, type: ${taskType})`);
  const taskPayload = (taskType === 'module_test' || taskType === 'gate_test') ? buildBusterPayload(config, progress, moduleId, taskType, payload, status, opts) : { module: moduleId, project: config.project, message: payload, timestamp: new Date().toISOString() };

  try {
    if (agentConfig?.dispatch !== 'redis') {
      throw new Error(`Agent '${agentType}' is not configured for Redis dispatch`);
    }

    const redisDispatch = await getRedisDispatchModule(config, agentType);
    const result = await redisDispatch.sendTask(agentType, taskType, taskPayload, 1);
    log('OK', `Redis task dispatched to ${agentType}: ${JSON.stringify(result)}`);
    return { ...result, dispatch_id: taskPayload.dispatch_id || null, run_id: taskPayload.run_id || null, attempt: taskPayload.attempt || null };
  } catch (e) {
    throw new Error(`Failed to dispatch Redis task to ${agentType}: ${e.message}`);
  }
}

export async function spawnAgent(config, progress, agentType, moduleId, model, taskPrompt, opts = {}) {
  const agentConfig = config.agents[agentType];
  if (!agentConfig) throw new Error(`Unknown agent type: ${agentType}`);
  if (agentConfig.dispatch === 'redis') {
    const taskType = opts.taskType || 'module_test';
    opts.model = model;
    return await dispatchRedisTask(config, progress, agentType, moduleId, taskType, taskPrompt, opts.status, opts);
  }
  return spawnAcpAgent(config, agentType, moduleId, model, taskPrompt, opts);
}

export async function killAgent(config, agentType, moduleId, graceful = false) {
  const agentConfig = config.agents[agentType];
  if (!agentConfig) return;
  if (agentConfig.dispatch === 'redis') log('INFO', `${agentType} is a Redis agent — no session to destroy (persistent instance)`);
  else await killAcpAgent(config, agentType, moduleId, graceful);
}

export async function steerAgent(config, progress, agentType, moduleId, message) {
  const agentConfig = config.agents[agentType];
  if (!agentConfig) return;
  if (agentConfig.dispatch === 'redis') {
    log('STEP', `Steering ${agentType} via Redis follow-up message`);
    try { await dispatchRedisTask(config, progress, agentType, moduleId, 'steer', message); }
    catch (e) { log('WARN', `Redis steer failed for ${agentType}: ${e.message}`); }
    return;
  }
  const label = acpLabel(agentType, moduleId);
  const sessionKey = getTrackedAgent(label)?.sessionKey;
  if (!sessionKey) {
    log('WARN', `No sessionKey tracked for '${label}' — cannot steer`);
    return;
  }
  try { await gatewayInvoke('sessions_send', { sessionKey, message }, 15000); }
  catch (e) { log('WARN', `ACP steer failed for '${label}': ${e.message}`); }
}

function readTrackedTranscriptState(entry) {
  const transcript = readAcpTranscriptState(entry?.streamLogPath, entry?.transcriptState || {});
  if (entry) entry.transcriptState = transcript;
  return transcript;
}

function setHealthCheckMode(entry, mode = null) {
  if (!entry) return;
  if (mode) entry.healthCheckMode = mode;
  else delete entry.healthCheckMode;
}

function logTranscriptFallbackOnce(entry, label, sessionKey, detail) {
  const mode = `transcript_fallback:${detail}`;
  if (entry?.healthCheckMode === mode) return;
  setHealthCheckMode(entry, mode);
  log('WARN', `Agent health check using transcript fallback${detail ? ` (${detail})` : ''}: ${label} (${sessionKey})`);
}

function healthCheckIdentity(entry, agentType, sessionKey) {
  return {
    module_id: entry?.telemetry_module_id ?? entry?.moduleId ?? null,
    gate_id: entry?.telemetry_gate_id ?? null,
    gate_type: entry?.telemetry_gate_type ?? null,
    gateway_label: entry?.gatewayLabel || null,
    session_key: sessionKey || null,
    attempt: entry?.telemetry_attempt ?? null,
    dispatch_id: entry?.telemetry_dispatch_id || null,
    agent_type: agentType || null,
  };
}

function updateHealthCheckObservability(config, entry, agentType, sessionKey, issue = null) {
  if (!entry) return;
  const state = entry.healthCheckObservability || { active: false, degradedAt: null, reason: null };
  const ctx = getActiveContext() || { config, runId: config?._runId || config?.run_id || null };
  const identity = healthCheckIdentity(entry, agentType, sessionKey);

  if (issue) {
    if (state.active) {
      entry.healthCheckObservability = state;
      return;
    }
    state.active = true;
    state.degradedAt = new Date().toISOString();
    state.reason = issue.reason || 'session_status_failed';
    entry.healthCheckObservability = state;
    emitObservabilityDegraded(ctx, {
      component: 'acp_monitor',
      surface: 'gateway',
      reason: state.reason,
      detail: issue.detail || 'session status unavailable',
      degraded_at: state.degradedAt,
      ...identity,
    });
    return;
  }

  if (!state.active) return;
  const restoredAt = new Date().toISOString();
  emitObservabilityRestored(ctx, {
    component: 'acp_monitor',
    surface: 'gateway',
    reason: state.reason || 'session_status_failed',
    detail: 'session status reachable again',
    degraded_at: state.degradedAt || null,
    restored_at: restoredAt,
    restored_after_ms: state.degradedAt ? Math.max(0, Date.now() - new Date(state.degradedAt).getTime()) : null,
    ...identity,
  });
  delete entry.healthCheckObservability;
}

export async function verifyAgentAlive(config, agentType, moduleId, waitMs = 8000) {
  const agentConfig = config.agents[agentType];
  if (!agentConfig) return false;
  if (agentConfig.dispatch === 'redis') return true;
  await sleep(waitMs);
  const label = acpLabel(agentType, moduleId);
  const entry = getTrackedAgent(label);
  const sessionKey = entry?.sessionKey;
  if (!sessionKey) {
    log('ERROR', `Agent health check failed: no sessionKey for '${label}'`);
    return false;
  }
  try {
    const raw = await gatewayInvoke('session_status', { sessionKey }, 10000);
    const result = raw?.result?.details || raw;
    const { state } = parseSessionState(result);
    if (/^(closed|error)$/i.test(state)) {
      updateHealthCheckObservability(config, entry, agentType, sessionKey, null);
      setHealthCheckMode(entry, null);
      log('ERROR', `Agent health check: session in terminal state '${state}': ${label}`);
      return false;
    }
    if (/^(unknown|unreachable)$/i.test(state)) {
      updateHealthCheckObservability(config, entry, agentType, sessionKey, {
        reason: /^unreachable$/i.test(state) ? 'gateway_unreachable' : 'session_status_unknown',
        detail: `session_status ${state}`,
      });
      const transcript = readTrackedTranscriptState(entry);
      if (transcriptShowsProgress(transcript)) {
        logTranscriptFallbackOnce(entry, label, sessionKey, `session_status ${state}`);
        return true;
      }
      setHealthCheckMode(entry, null);
      log('WARN', `Agent health check failed: session state '${state}' without transcript progress: ${label} (${sessionKey})`);
      return false;
    }
    updateHealthCheckObservability(config, entry, agentType, sessionKey, null);
    setHealthCheckMode(entry, null);
    log('OK', `Agent health check passed: ${label} (${sessionKey}, state: ${state})`);
    return true;
  } catch (e) {
    updateHealthCheckObservability(config, entry, agentType, sessionKey, {
      reason: 'session_status_failed',
      detail: e.message || 'session status unavailable',
    });
    const transcript = readTrackedTranscriptState(entry);
    if (transcriptShowsProgress(transcript)) {
      logTranscriptFallbackOnce(entry, label, sessionKey, 'after session_status failure');
      return true;
    }
    setHealthCheckMode(entry, null);
    log('ERROR', `Agent health check failed for '${label}': ${e.message}`);
    return false;
  }
}

function mapModuleForgeLegacyResultToControl(result = {}) {
  if (result?.ok === true || result?.poll_result?.ok === true) {
    return { nextAction: 'pass', issueType: undefined, outcomeClass: 'passed' };
  }

  const reason = String(result?.reason || result?.poll_result?.reason || '').trim().toLowerCase();
  switch (reason) {
    case 'healthcheck_failed':
    case 'timeout':
      return { nextAction: 'retry', issueType: 'environment', outcomeClass: reason };
    case 'session_ended_no_changes':
      return { nextAction: 'request_fix', issueType: 'code', outcomeClass: reason };
    case 'spawn_failed':
    case 'rate_limit_exhausted':
      return { nextAction: 'block', issueType: 'environment', outcomeClass: reason };
    case 'parse_corrupted':
    case 'git_error':
      return { nextAction: 'block', issueType: 'unknown', outcomeClass: reason || 'error' };
    default:
      return reason
        ? { nextAction: 'request_fix', issueType: 'code', outcomeClass: reason }
        : { nextAction: 'block', issueType: 'unknown', outcomeClass: 'error' };
  }
}

function buildModuleForgeWorkerSummary(workerInput = {}, result = {}) {
  const moduleId = workerInput?.ids?.moduleId || workerInput?.moduleId || 'unknown';
  if (result?.ok === true || result?.poll_result?.ok === true) {
    return `Module Forge worker '${moduleId}' reached READY_FOR_TESTING`;
  }
  return result?.error || result?.reason || result?.poll_result?.reason || `Module Forge worker '${moduleId}' failed`;
}

export function buildModuleForgeWorkerControlResult(config, workerInput = {}, result = {}, opts = {}) {
  const mapped = mapModuleForgeLegacyResultToControl(result);
  const ids = workerInput?.ids || {};
  const refs = workerInput?.refs || {};
  const metadata = {
    module_id: ids.moduleId || workerInput?.moduleId || null,
    run_id: ids.runId || config?._runId || config?.run_id || null,
    attempt: ids.attempt ?? workerInput?.attempt ?? result?.attempt ?? null,
    stage_id: ids.stageId || opts?.stageId || 'worker:module_forge',
    worker_type: workerInput?.worker?.workerType || 'module_forge',
    module_dir: workerInput?.executionContext?.moduleDir || workerInput?.moduleDir || null,
    reason: result?.reason || result?.poll_result?.reason || null,
    gateway_label: result?.gateway_label || null,
    session_key: result?.session_key || null,
    stream_log_path: result?.stream_log_path || null,
    module_attempt_ref: refs.moduleAttemptRef || null,
    final_status: cloneSerializable(result?.status || null),
    poll_result: cloneSerializable(result?.poll_result || null),
    legacy_result: cloneSerializable(result),
  };

  return buildTypedWorkerControlResult({
    producerType: 'module_forge',
    nextAction: mapped.nextAction,
    issueType: mapped.issueType,
    summary: buildModuleForgeWorkerSummary(workerInput, result),
    metadata,
    backendKind: 'session',
    dispatchRef: refs.moduleAttemptRef || null,
    typedMetadata: {
      outcomeClass: mapped.outcomeClass,
      attempt: metadata.attempt,
    },
  });
}

export function isModuleForgeWorkerControlResult(result) {
  return isTypedWorkerControlResult(result, 'module_forge');
}

export function coerceModuleForgeWorkerControlResult(config, workerInput = {}, result, opts = {}) {
  return coerceTypedWorkerControlResult(result, {
    producerType: 'module_forge',
    build: () => buildModuleForgeWorkerControlResult(config, workerInput, result, opts),
  });
}

export function extractModuleForgeWorkerLegacyResult(result) {
  return extractTypedWorkerLegacyResult(result, {
    producerType: 'module_forge',
    buildFallbackLegacyResult: ({ metadata, result: controlResult }) => {
      const fallbackReason = metadata?.reason || controlResult?.diagnostics?.summary || null;
      return {
        ok: controlResult?.nextAction === 'pass',
        reason: fallbackReason,
        poll_result: metadata?.poll_result || (controlResult?.nextAction === 'pass'
          ? { ok: true }
          : { ok: false, reason: fallbackReason || 'worker_control_blocked' }),
        status: metadata?.final_status || null,
        stream_log_path: metadata?.stream_log_path || null,
        gateway_label: metadata?.gateway_label || null,
        session_key: metadata?.session_key || null,
        attempt: metadata?.attempt ?? null,
      };
    },
  });
}

function inferModuleBusterFailureClass(result = {}) {
  if (result?.failure_class) return result.failure_class;

  if (result?.ok === true || result?.poll_result?.ok === true) return 'pass';

  const reason = String(result?.reason || result?.poll_result?.reason || '').trim().toLowerCase();
  if (reason === 'spawn_failed') return 'spawn_failed';
  if (reason === 'rate_limit_exhausted') return 'rate_limit_exhausted';
  if (reason === 'timeout') return 'timeout';
  if (reason === 'parse_corrupted') return 'parse_corrupted';
  if (reason === 'git_error') return 'git_error';

  const redisEntry = result?.poll_result?.status?._redis_entry || null;
  const finalStatus = String(result?.status?.status || result?.poll_result?.status?.status || '').trim().toUpperCase();

  if (redisEntry) {
    const source = String(redisEntry.source || '').trim();
    const isFromBusterPipeline = /(?:^|-)(?:orchestrator|buster-pipeline)/i.test(source);
    const hasPreTestVerdict = isFromBusterPipeline && !!redisEntry?.verdict;

    if (hasPreTestVerdict) {
      const preTestClass = classifyPreTestFailure(redisEntry);
      if (preTestClass?.kind === 'infra') return 'pretest_infra';
      if (preTestClass?.kind === 'config') return 'pretest_config';
      return 'pretest_code';
    }

    if (isFromBusterPipeline && finalStatus === STATUS.FAIL) return 'infra_crash';
    if (finalStatus === STATUS.BLOCKED) return 'blocked';
    if (finalStatus === STATUS.FAIL) return 'verdict_fail';
  }

  if (finalStatus === STATUS.BLOCKED) return 'blocked';
  if (finalStatus === STATUS.FAIL) return 'verdict_fail';
  return reason || 'unknown';
}

function mapModuleBusterLegacyResultToControl(result = {}) {
  if (result?.ok === true || result?.poll_result?.ok === true) {
    return { nextAction: 'pass', issueType: undefined, outcomeClass: 'pass' };
  }

  const failureClass = inferModuleBusterFailureClass(result);
  if (['timeout', 'parse_corrupted', 'infra_crash', 'pretest_infra', 'pretest_config'].includes(failureClass)) {
    return { nextAction: 'retry', issueType: 'environment', outcomeClass: failureClass };
  }
  if (['verdict_fail', 'pretest_code'].includes(failureClass)) {
    return { nextAction: 'request_fix', issueType: 'code', outcomeClass: failureClass };
  }
  if (['spawn_failed', 'rate_limit_exhausted'].includes(failureClass)) {
    return { nextAction: 'block', issueType: 'environment', outcomeClass: failureClass };
  }
  return { nextAction: 'block', issueType: 'unknown', outcomeClass: failureClass };
}

function buildModuleBusterWorkerSummary(workerInput = {}, result = {}) {
  const moduleId = workerInput?.ids?.moduleId || workerInput?.moduleId || 'unknown';
  const finalStatus = result?.status?.status || result?.poll_result?.status?.status || null;
  if (result?.ok === true || result?.poll_result?.ok === true) {
    return `Module Buster worker '${moduleId}' reached ${finalStatus || 'PASS'}`;
  }
  return result?.error
    || result?.reason
    || result?.poll_result?.reason
    || `Module Buster worker '${moduleId}' failed`;
}

export function buildModuleBusterWorkerControlResult(config, workerInput = {}, result = {}, opts = {}) {
  const mapped = mapModuleBusterLegacyResultToControl(result);
  const ids = workerInput?.ids || {};
  const refs = workerInput?.refs || {};
  const redisEntry = result?.poll_result?.status?._redis_entry || null;
  const metadata = {
    module_id: ids.moduleId || workerInput?.moduleId || null,
    run_id: ids.runId || result?.run_id || config?._runId || config?.run_id || null,
    attempt: ids.attempt ?? workerInput?.attempt ?? result?.attempt ?? null,
    stage_id: ids.stageId || opts?.stageId || 'worker:module_buster',
    worker_type: workerInput?.worker?.workerType || 'module_buster',
    module_dir: workerInput?.executionContext?.moduleDir || workerInput?.moduleDir || null,
    reason: result?.reason || result?.poll_result?.reason || null,
    failure_class: inferModuleBusterFailureClass(result),
    dispatch_id: result?.dispatch_id || ids.dispatchId || refs.workerDispatchRef || null,
    gateway_label: result?.gateway_label || null,
    session_key: result?.session_key || redisEntry?.session_key || null,
    stream_log_path: result?.stream_log_path || null,
    module_attempt_ref: refs.moduleAttemptRef || null,
    worker_dispatch_ref: refs.workerDispatchRef || null,
    redis_entry: cloneSerializable(redisEntry),
    final_status: cloneSerializable(result?.status || null),
    poll_result: cloneSerializable(result?.poll_result || null),
    legacy_result: cloneSerializable(result),
  };

  return buildTypedWorkerControlResult({
    producerType: 'module_buster',
    nextAction: mapped.nextAction,
    issueType: mapped.issueType,
    summary: buildModuleBusterWorkerSummary(workerInput, result),
    metadata,
    backendKind: 'redis_dispatch',
    dispatchRef: refs.workerDispatchRef || metadata.dispatch_id || null,
    typedMetadata: {
      outcomeClass: mapped.outcomeClass,
      attempt: metadata.attempt,
      dispatch_id: metadata.dispatch_id,
      redis_source: redisEntry?.source || null,
    },
  });
}

export function isModuleBusterWorkerControlResult(result) {
  return isTypedWorkerControlResult(result, 'module_buster');
}

export function coerceModuleBusterWorkerControlResult(config, workerInput = {}, result, opts = {}) {
  return coerceTypedWorkerControlResult(result, {
    producerType: 'module_buster',
    build: () => buildModuleBusterWorkerControlResult(config, workerInput, result, opts),
  });
}

export function extractModuleBusterWorkerLegacyResult(result) {
  return extractTypedWorkerLegacyResult(result, {
    producerType: 'module_buster',
    buildFallbackLegacyResult: ({ metadata, result: controlResult }) => {
      const fallbackReason = metadata?.reason || controlResult?.diagnostics?.summary || null;
      return {
        ok: controlResult?.nextAction === 'pass',
        reason: fallbackReason,
        poll_result: metadata?.poll_result || (controlResult?.nextAction === 'pass'
          ? { ok: true }
          : { ok: false, reason: fallbackReason || 'worker_control_blocked' }),
        status: metadata?.final_status || null,
        stream_log_path: metadata?.stream_log_path || null,
        dispatch_id: metadata?.dispatch_id || null,
        gateway_label: metadata?.gateway_label || null,
        session_key: metadata?.session_key || null,
        attempt: metadata?.attempt ?? null,
        run_id: metadata?.run_id || null,
      };
    },
  });
}

export async function runModuleForgeWorker({ config, progress, workerInput = {}, deps = {} } = {}) {
  if (!config) throw new Error('runModuleForgeWorker requires config');

  const {
    moduleId,
    moduleDir,
    timeoutMinutes,
    model,
    prompt,
    thinking = null,
    attempt = 1,
    headBefore = null,
    onDispatched = null,
    onFinalized = null,
  } = workerInput;

  const spawn = deps.spawnAgent || spawnAgent;
  const verifyAlive = deps.verifyAgentAlive || verifyAgentAlive;
  const kill = deps.killAgent || killAgent;
  const getTracked = deps.getTrackedAgent || getTrackedAgent;
  const labelFor = deps.acpLabel || acpLabel;
  const poll = deps.pollWithRateLimitRecovery || pollWithRateLimitRecovery;
  const loadStatusFn = deps.loadStatus || loadStatus;
  const saveStreamLogFn = deps.saveStreamLog || saveStreamLog;
  const clearShutdownContextFn = deps.clearShutdownContext || (() => {});

  const forgeSessionLabel = labelFor('forge', moduleId);
  let pollResult = null;
  let trackedForgeAgent = null;
  let finalStatus = null;
  let forgeStreamPath = null;

  try {
    await spawn(config, progress, 'forge', moduleId, model, prompt, {
      thinking,
      module_id: moduleId,
      attempt,
    });
  } catch (e) {
    clearShutdownContextFn();
    return {
      ok: false,
      reason: 'spawn_failed',
      error: e.message,
      gateway_label: e?.gateway_label || null,
      session_key: e?.session_key || null,
      attempt,
    };
  }

  if (!(await verifyAlive(config, 'forge', moduleId))) {
    await kill(config, 'forge', moduleId);
    clearShutdownContextFn();
    return {
      ok: false,
      reason: 'healthcheck_failed',
      error: 'Forge agent failed health check — session not running after spawn',
      attempt,
    };
  }

  trackedForgeAgent = getTracked(forgeSessionLabel) || null;
  forgeStreamPath = trackedForgeAgent?.streamLogPath || null;

  const dispatch = {
    label: forgeSessionLabel,
    session_key: trackedForgeAgent?.sessionKey || null,
    stream_log_path: trackedForgeAgent?.streamLogPath || null,
    gateway_label: trackedForgeAgent?.gatewayLabel || null,
    runtime: trackedForgeAgent?.runtime || null,
    model,
    agent_id: trackedForgeAgent?.agentId || null,
    attempt,
    phase: 'forge',
  };

  if (typeof onDispatched === 'function') {
    await onDispatched(dispatch);
  }

  try {
    pollResult = await poll(config, moduleDir,
      [STATUS.READY_FOR_TESTING, STATUS.FAIL, STATUS.BLOCKED], timeoutMinutes,
      { sessionLabel: forgeSessionLabel, headBefore });
  } finally {
    forgeStreamPath = getTracked(forgeSessionLabel)?.streamLogPath || forgeStreamPath;
    await kill(config, 'forge', moduleId, pollResult?.ok || false);
    finalStatus = loadStatusFn(config, moduleDir) || null;
    if (typeof onFinalized === 'function') {
      await onFinalized({
        status: finalStatus,
        stream_log_path: forgeStreamPath,
        poll_result: pollResult,
        dispatch,
      });
      finalStatus = loadStatusFn(config, moduleDir) || finalStatus;
    }
    saveStreamLogFn(config, moduleDir, 'forge', attempt, forgeStreamPath);
    clearShutdownContextFn();
  }

  return {
    ok: pollResult?.ok === true,
    reason: pollResult?.reason || null,
    poll_result: pollResult,
    status: finalStatus,
    stream_log_path: forgeStreamPath,
    gateway_label: dispatch.gateway_label,
    session_key: dispatch.session_key,
    attempt,
  };
}

export async function runModuleBusterWorker({ config, progress, workerInput = {}, deps = {} } = {}) {
  if (!config) throw new Error('runModuleBusterWorker requires config');

  const {
    moduleId,
    moduleDir,
    timeoutMinutes,
    model,
    prompt,
    status = null,
    runId = null,
    attempt = 1,
    dispatchId = null,
    onDispatched = null,
    onFinalized = null,
  } = workerInput;

  const archive = deps.archiveModuleCompletions || archiveModuleCompletions;
  const spawn = deps.spawnAgent || spawnAgent;
  const kill = deps.killAgent || killAgent;
  const poll = deps.pollDualWithRateLimitRecovery || pollDualWithRateLimitRecovery;
  const loadStatusFn = deps.loadStatus || loadStatus;
  const saveStreamLogFn = deps.saveStreamLog || saveStreamLog;
  const clearShutdownContextFn = deps.clearShutdownContext || (() => {});

  let workerDispatch = null;
  let pollResult = null;
  let finalStatus = null;
  let finalStreamPath = null;
  let finalSessionKey = null;

  await archive(config, moduleId);

  try {
    workerDispatch = await spawn(config, progress, 'buster', moduleId, model, prompt, {
      status,
      taskType: 'module_test',
      run_id: runId,
      attempt,
      dispatch_id: dispatchId,
    });
  } catch (e) {
    clearShutdownContextFn();
    return {
      ok: false,
      reason: 'spawn_failed',
      error: e.message,
      dispatch_id: dispatchId || null,
      gateway_label: dispatchId || e?.gateway_label || null,
      session_key: e?.session_key || null,
      attempt,
      run_id: runId,
    };
  }

  const dispatch = {
    label: workerDispatch?.dispatch_id || dispatchId || null,
    session_key: workerDispatch?.session_key || null,
    stream_log_path: workerDispatch?.stream_log_path || null,
    gateway_label: workerDispatch?.dispatch_id || dispatchId || null,
    dispatch_id: workerDispatch?.dispatch_id || dispatchId || null,
    run_id: workerDispatch?.run_id || runId || null,
    attempt,
    runtime: null,
    model,
    agent_id: null,
    phase: 'buster',
  };

  if (typeof onDispatched === 'function') {
    await onDispatched(dispatch);
  }

  try {
    pollResult = await poll(config, moduleDir, moduleId,
      [STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED], timeoutMinutes, {
        run_id: dispatch.run_id,
        attempt,
        dispatch_id: dispatch.dispatch_id,
      });
  } finally {
    await kill(config, 'buster', moduleId, pollResult?.ok || false);
    finalStatus = loadStatusFn(config, moduleDir) || null;
    finalStreamPath = finalStatus?.active_agent?.stream_log_path || dispatch.stream_log_path || null;
    finalSessionKey = finalStatus?.active_agent?.session_key || pollResult?.status?._redis_entry?.session_key || dispatch.session_key || null;
    if (typeof onFinalized === 'function') {
      await onFinalized({
        status: finalStatus,
        stream_log_path: finalStreamPath,
        session_key: finalSessionKey,
        poll_result: pollResult,
        dispatch,
      });
      finalStatus = loadStatusFn(config, moduleDir) || finalStatus;
    }
    saveStreamLogFn(config, moduleDir, 'buster', attempt, finalStreamPath);
    clearShutdownContextFn();
  }

  return {
    ok: pollResult?.ok === true,
    reason: pollResult?.reason || null,
    poll_result: pollResult,
    status: finalStatus,
    stream_log_path: finalStreamPath,
    dispatch_id: dispatch.dispatch_id,
    gateway_label: dispatch.gateway_label,
    session_key: finalSessionKey,
    attempt,
    run_id: dispatch.run_id,
  };
}

export async function spawnReviewerAgent(config, progress, gateId, reviewer, instructions, opts = {}) {
  const trackingKey = `echo-${reviewer.label}-${gateId}`;
  const gatewayLabel = `${trackingKey}-${Date.now()}`;
  const model = resolveModel(config, progress, 'echo', reviewer.model);
  const agentId = modelToHarness(model) || reviewer.agent_id || 'claude';
  const cwd = config.agents.echo?.cwd || config.repo_root;
  const thinkingLevel = opts.thinking || config.agents?.echo?.thinking_level || null;
  const runtime = resolveRuntime({ runtime: reviewer.dispatch, model });
  const useSubagent = runtime === 'subagent';
  try {
    const sessionData = await spawnSession({
      session: { model, runtime, agentId, cwd, label: gatewayLabel },
    }, instructions, reviewer?.timeout_seconds || null, {
      runtime,
      model,
      agentId,
      cwd,
      label: gatewayLabel,
      thinking: thinkingLevel,
      trackActive: false,
    });
    log('OK', `Reviewer spawned: ${gatewayLabel} → ${sessionData.childSessionKey}${sessionData.streamLogPath ? ` (stream: ${sessionData.streamLogPath})` : ''}`, { agent: agentId, model, reviewer: reviewer.label, sessionKey: sessionData.childSessionKey, runId: sessionData.runId, stream: sessionData.streamLogPath });
    trackAgent(config, trackingKey, sessionData.childSessionKey, agentId, gatewayLabel, sessionData.streamLogPath, {
      model,
      runtime: useSubagent ? 'subagent' : 'acp',
      moduleId: gateId,
      telemetry_module_id: null,
      telemetry_gate_id: gateId,
      telemetry_gate_type: opts.gate_type || null,
      telemetry_attempt: opts.attempt ?? null,
      telemetry_dispatch_id: opts.dispatch_id || null,
      reviewer_label: reviewer.label || null,
    });
    try {
      const _ctx = getActiveContext() || { config };
      onAgentSpawned(_ctx, 'echo', {
        label: gatewayLabel,
        model,
        dispatch: useSubagent ? 'subagent' : 'acp',
        module_id: null,
        gate_id: gateId,
        gate_type: opts.gate_type || null,
        attempt: opts.attempt ?? null,
        dispatch_id: opts.dispatch_id || null,
        timeout_minutes: reviewer?.timeout_seconds ? Math.round(reviewer.timeout_seconds / 60) : null,
        session_key: sessionData.childSessionKey,
        thinking_level: thinkingLevel,
      });
    } catch {}
    discord(config, 'INFO', `🔬 Reviewer Spawned: ${reviewer.label}/${gateId}`, 'Echo reviewer is now working.', [
      ...buildLifecycleDiscordFields({
        run_id: sessionData.runId || config._runId || config.run_id || 'unknown',
        gate_id: gateId,
        gate_type: opts.gate_type || null,
        attempt: opts.attempt ?? null,
        dispatch_id: opts.dispatch_id || null,
        gateway_label: gatewayLabel,
        session_key: sessionData.childSessionKey,
      }),
      { name: 'Reviewer', value: reviewer.label, inline: true },
      { name: 'Model', value: model, inline: true },
      { name: 'Agent', value: agentId, inline: true },
    ]).catch(() => {});
    return { label: trackingKey, childSessionKey: sessionData.childSessionKey, runId: sessionData.runId, streamLogPath: sessionData.streamLogPath };
  } catch (e) {
    discord(config, 'CRITICAL', `❌ Reviewer Spawn Failed: ${gateId}`, `${reviewer.label}: ${e.message?.split('\n')[0] || 'unknown'}`,
      buildLifecycleDiscordFields({
        run_id: config._runId || config.run_id || 'unknown',
        gate_id: gateId,
        gate_type: opts.gate_type || null,
        attempt: opts.attempt ?? null,
        dispatch_id: opts.dispatch_id || null,
        gateway_label: gatewayLabel,
      })
    ).catch(() => {});
    const err = new Error(`Failed to spawn reviewer '${gatewayLabel}': ${e.message}`);
    err.gateway_label = gatewayLabel;
    throw err;
  }
}

export async function killReviewerAgent(config, gateId, reviewer, graceful = false) {
  const label = `echo-${reviewer.label}-${gateId}`;
  const entry = getTrackedAgent(label);
  const sessionKey = entry?.sessionKey;
  if (!sessionKey) {
    log('WARN', `No sessionKey for reviewer '${label}' — skipping kill`);
    untrackAgent(label);
    return false;
  }
  if (graceful) {
    log('INFO', `Waiting for reviewer session to become idle: ${label}`);
    await waitForSessionIdle(sessionKey, { streamLogPath: entry?.streamLogPath || null });
  }
  log('STEP', `Destroying reviewer session: ${label} (${sessionKey})`);
  let terminated = false;
  try {
    const runtime = entry?.runtime;
    await killSession(sessionKey, {
      runtime,
      model: entry?.model || null,
      agentId: entry.agentId,
      label: entry.gatewayLabel,
    });
    await reaperAfterKill(entry.agentId || 'reviewer', sessionKey, entry.gatewayLabel);
    try {
      const { monitor: mon } = await observeAcpMonitorSurfaces(config, sessionKey, healthCheckIdentity(entry, 'echo', sessionKey), {
        streamLogPath: entry?.streamLogPath || null,
      });
      terminated = Boolean(mon?.failed || mon?.terminal || mon?.sessionTerminal || mon?.stopped);
      if (!terminated) log('WARN', `Reviewer '${label}' stop requested but monitor still shows it as active (${mon?.lastDetail || 'unknown'})`);
    } catch (e) {
      log('DEBUG', `Reviewer session monitor check failed after stop for '${label}': ${e.message}`);
    }
    if (terminated) log('OK', `Reviewer session destroyed: ${label}`);
    try {
      const _ctx = getActiveContext() || { config };
      onAgentKilled(_ctx, 'echo', {
        label: entry?.gatewayLabel || label,
        module_id: entry?.telemetry_module_id ?? null,
        gate_id: entry?.telemetry_gate_id || gateId,
        gate_type: entry?.telemetry_gate_type || null,
        session_key: sessionKey,
        attempt: entry?.telemetry_attempt ?? null,
        dispatch_id: entry?.telemetry_dispatch_id || null,
      });
    } catch {}
  } finally {
    if (terminated) untrackAgent(label);
  }
  return terminated;
}
