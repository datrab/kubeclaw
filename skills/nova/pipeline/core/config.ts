import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// core/config.ts — Config loading, validation, and model resolution

// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';
import { log } from './logger.ts';
import { discoverPlatformSwarmConfigCandidates, discoverSwarmConfigPath, loadPlatformSwarmConfig, normalizeSwarmConfigInPlace } from './platform-config.ts';
import { assertSafePathSegment, validateSafePath } from './paths.ts';
import { getRepoRoot, setGitRuntimePolicy, setRepoRoot } from './git-context.ts';
import { resolvePolicy, validateThinkingLevel, logEffectivePolicy, VALID_THINKING_LEVELS, THINKING_SUPPORTED_PATHS, THINKING_UNSUPPORTED_PATHS } from './policy.ts';
import { buildPluginRegistry } from './registry.ts';

export { resolvePolicy, validateThinkingLevel, logEffectivePolicy, VALID_THINKING_LEVELS, THINKING_SUPPORTED_PATHS, THINKING_UNSUPPORTED_PATHS };
export { discoverPlatformSwarmConfigCandidates, discoverSwarmConfigPath, loadPlatformSwarmConfig, normalizeSwarmConfigInPlace };

// ─── Exported functions ───────────────────────────────────────────────────────

type AnyRecord = Record<string, any>;
declare const process: any;
const REMOVED_REVIEW_FAIL_FIELD = `on_${'n' + 'ogo'}`;

function resolveConfiguredRepoRoot(opts: AnyRecord): string | null {
  if (opts.repoRoot !== undefined && opts.repoRoot !== null && String(opts.repoRoot).trim()) {
    return String(opts.repoRoot);
  }
  const envRepoRoot = process.env.REPO_ROOT;
  if (envRepoRoot !== undefined && envRepoRoot !== null && String(envRepoRoot).trim()) {
    return String(envRepoRoot);
  }
  return null;
}

function agentConfigEntries(config: AnyRecord): Array<[string, any]> {
  if (selectTruthyValue(() => (selectTruthyValue(() => (!config.agents), () => (typeof config.agents !== 'object'))), () => (Array.isArray(config.agents)))) {
    return [];
  }
  return Object.entries(config.agents);
}

export function loadConfig(projectName: any, opts: AnyRecord = {}) {
  if (!projectName) {
    throw new Error(
      'Project name required. Use --project <n> or set CURRENT_PROJECT env.'
    );
  }
  projectName = assertSafePathSegment(projectName, 'project name');

  let repoRoot = resolveConfiguredRepoRoot(opts);
  if (repoRoot) {
    repoRoot = path.resolve(repoRoot);
    if (!fs.existsSync(path.join(repoRoot, '.git'))) {
      throw new Error(`Repo root '${repoRoot}' is not a git repository (no .git directory)`);
    }
    log('INFO', `Repo root from ${opts.repoRoot ? '--repo flag' : 'REPO_ROOT env'}: ${repoRoot}`);
  } else {
    try {
      repoRoot = getRepoRoot();
    } catch (_error) {
      throw new Error(
        'Cannot determine repo root. Either:\n' +
        '  --repo <path>        Pass the repo path explicitly\n' +
        '  REPO_ROOT=<path>     Set as environment variable\n' +
        '  cd <repo>            Run from within the git repo'
      );
    }
  }

  const { config: swarmConfig } = loadPlatformSwarmConfig(opts.swarmConfigPath);

  const projectSrcDir = path.join(repoRoot, 'Projects', projectName, 'src');
  const swarmDir = path.join(projectSrcDir, '.swarm');
  const progressFile = path.join(swarmDir, 'progress.json');
  const modulesDir = path.join(swarmDir, 'modules');

  if (!fs.existsSync(progressFile)) {
    throw new Error(
      `Progress file not found: ${progressFile}\n` +
      `  Expected at: <repo>/Projects/${projectName}/src/.swarm/progress.json`
    );
  }
  const progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));

  const config = {
    ...swarmConfig,
    project: projectName,
    repo_root: repoRoot,
    paths: {
      project_src_dir: projectSrcDir,
      swarm_dir: swarmDir,
      modules_dir: modulesDir,
      progress_file: progressFile,
    },
  };

  const pluginRegistry = validateConfig(config, progress);
  Object.defineProperty(config, 'pluginRegistry', {
    value: pluginRegistry,
    enumerable: false,
    configurable: true,
    writable: true,
  });

  log('INFO', `[plugins] startup registry ready: ${pluginRegistry.summary.enabledModules}/${pluginRegistry.summary.discoveredModules} modules enabled, ${pluginRegistry.summary.stageOwnerCount} stage owner(s)`);

  setRepoRoot(config.repo_root);
  setGitRuntimePolicy(config);

  return { config, progress, pluginRegistry };
}

export function validateConfig(config: AnyRecord, progress: AnyRecord) {
  normalizeSwarmConfigInPlace(config);
  const errors: string[] = [];

  if (Object.prototype.hasOwnProperty.call(config, '_testOverrides')) {
    errors.push('config._testOverrides: forbidden in runtime config; inject verification fakes through explicit harness options');
  }

  const requireField = (obj: any, fieldPath: string, parentPath = 'config') => {
    const keys = fieldPath.split('.');
    let current = obj;
    let currentPath = parentPath;
    for (const key of keys) {
      currentPath = `${currentPath}.${key}`;
      if (selectTruthyValue(() => (selectTruthyValue(() => (current === null), () => (current === undefined))), () => (typeof current !== 'object'))) {
        errors.push(`${currentPath}: parent is ${current === null ? 'null' : typeof current}`);
        return;
      }
      current = current[key];
    }
    if (selectTruthyValue(() => (current === undefined), () => (current === null))) {
      errors.push(`${currentPath}: required field is missing`);
    }
  };

  requireField(config, 'project');
  requireField(config, 'repo_root');
  requireField(config, 'paths');
  requireField(config, 'paths.project_src_dir');
  requireField(config, 'paths.swarm_dir');
  requireField(config, 'paths.progress_file');
  requireField(config, 'paths.modules_dir');
  requireField(config, 'agents');
  requireField(config, 'agents.forge');
  requireField(config, 'agents.buster');
  requireField(config, 'agents.echo');
  requireField(config, 'fallback_model');
  requireField(config, 'pipeline_defaults');
  requireField(config, 'rate_limit');
  requireField(config, 'discord_alerts');
  requireField(config, 'pre_check');
  requireField(config, 'review_defaults');
  requireField(config, 'plugins');

  const isPlainObject = (value: any) => value && typeof value === 'object' && !Array.isArray(value);
  const requireNonEmptyString = (value: any, label: string) => {
    if (selectTruthyValue(() => (typeof value !== 'string'), () => (!value.trim()))) errors.push(`${label}: required non-empty string in swarm.config.json`);
  };
  const requireBoolean = (value: any, label: string) => {
    if (typeof value !== 'boolean') errors.push(`${label}: required boolean in swarm.config.json`);
  };
  const requireSafeIdentifier = (value: any, label: string) => {
    try { assertSafePathSegment(value, label); }
    catch (e: any) { errors.push(e.message); }
  };
  const requireNumber = (obj: any, field: string, label: string, { min = 0, allowZero = true, max = null }: { min?: number; allowZero?: boolean; max?: number | null } = {}) => {
    const raw = obj?.[field];
    if (selectTruthyValue(() => (selectTruthyValue(() => (raw === undefined), () => (raw === null))), () => (raw === ''))) {
      errors.push(`${label}: required in swarm.config.json`);
      return null;
    }
    const tooSmall = typeof raw === 'number' ? (allowZero ? raw < min : raw <= min) : false;
    if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (typeof raw !== 'number'), () => (!Number.isFinite(raw)))), () => (tooSmall))), () => ((max !== null && raw > max)))) {
      const lower = allowZero ? `>= ${min}` : `> ${min}`;
      const upper = max === null ? '' : ` and <= ${max}`;
      errors.push(`${label}: must be a number ${lower}${upper}`);
      return null;
    }
    return raw;
  };
  if (config.agents?.buster?.dispatch !== 'redis') {
    errors.push('config.agents.buster.dispatch: required platform value \'redis\' in swarm.config.json');
  }
  if (!config.agents?.buster?.redis_js_path) {
    errors.push('config.agents.buster.redis_js_path: required for redis dispatch agents in swarm.config.json');
  }

  for (const [name, agentConfRaw] of agentConfigEntries(config)) {
    const agentConf = agentConfRaw as AnyRecord;
    if (selectTruthyValue(() => (typeof agentConf !== 'object'), () => (agentConf === null))) continue;
    if (name.startsWith('_')) continue;
    if (!agentConf.dispatch) {
      errors.push(`config.agents.${name}.dispatch: required ('acp', 'subagent', or 'redis') in swarm.config.json`);
    }
    if (!['acp', 'subagent', 'redis'].includes(agentConf.dispatch)) {
      errors.push(`config.agents.${name}.dispatch: invalid dispatch '${agentConf.dispatch}'`);
    }
    if ((selectTruthyValue(() => (agentConf.dispatch === 'acp'), () => (agentConf.dispatch === 'subagent'))) && !agentConf.acp_agent_id) {
      errors.push(`config.agents.${name}.acp_agent_id: required for ACP/subagent dispatch agents in swarm.config.json`);
    }
    if (agentConf.dispatch === 'redis' && !agentConf.redis_js_path) {
      errors.push(`config.agents.${name}.redis_js_path: required for redis dispatch agents in swarm.config.json`);
    }
  }

  requireNonEmptyString(config.fallback_model, 'config.fallback_model');
  if (config.models !== undefined) {
    errors.push('config.models: role-specific model defaults belong in progress.json defaults.models; swarm.config.json must only set fallback_model');
  }

  if (!isPlainObject(config.pipeline_defaults)) {
    errors.push('config.pipeline_defaults: required platform config object');
    config.pipeline_defaults = {};
  }
  requireNumber(config.pipeline_defaults, 'timeout_minutes', 'config.pipeline_defaults.timeout_minutes', { min: 0, allowZero: false });
  requireNumber(config.pipeline_defaults, 'max_fails', 'config.pipeline_defaults.max_fails', { min: 0 });
  requireNumber(config.pipeline_defaults, 'auto_retry_threshold', 'config.pipeline_defaults.auto_retry_threshold', { min: 0 });
  requireNumber(config.pipeline_defaults, 'agent_startup_retry_budget', 'config.pipeline_defaults.agent_startup_retry_budget', { min: 0 });
  requireNumber(config.pipeline_defaults, 'session_nudge_threshold', 'config.pipeline_defaults.session_nudge_threshold', { min: 0, max: 1 });

  if (!isPlainObject(config.rate_limit)) {
    errors.push('config.rate_limit: required platform config object');
    config.rate_limit = {};
  }

  requireNumber(config.rate_limit, 'cooldown_hours', 'config.rate_limit.cooldown_hours', { min: 0 });
  requireNumber(config.rate_limit, 'max_pauses_per_module', 'config.rate_limit.max_pauses_per_module', { min: 0 });
  requireNumber(config.rate_limit, 'cooldown_buffer_ms', 'config.rate_limit.cooldown_buffer_ms', { min: 0 });

  if (!isPlainObject(config.polling)) { errors.push('config.polling: required platform config object'); config.polling = {}; }
  requireNumber(config.polling, 'interval_seconds', 'config.polling.interval_seconds', { min: 0, allowZero: false });
  requireNumber(config.polling, 'progress_interval_ms', 'config.polling.progress_interval_ms', { min: 0 });
  requireNumber(config.polling, 'session_end_grace_ms', 'config.polling.session_end_grace_ms', { min: 0 });

  if (!isPlainObject(config.locks)) { errors.push('config.locks: required platform config object'); config.locks = {}; }
  requireNumber(config.locks.lifecycle_append, 'stale_ms', 'config.locks.lifecycle_append.stale_ms', { min: 0 });
  requireNumber(config.locks.lifecycle_append, 'timeout_ms', 'config.locks.lifecycle_append.timeout_ms', { min: 0 });
  requireNumber(config.locks.gate_active_session, 'stale_ms', 'config.locks.gate_active_session.stale_ms', { min: 0 });
  requireNumber(config.locks.gate_active_session, 'timeout_ms', 'config.locks.gate_active_session.timeout_ms', { min: 0 });
  requireNumber(config.locks.pipeline_run, 'lease_ms', 'config.locks.pipeline_run.lease_ms', { min: 0, allowZero: false });
  requireNumber(config.locks.pipeline_run, 'heartbeat_ms', 'config.locks.pipeline_run.heartbeat_ms', { min: 0, allowZero: false });
  requireNumber(config.locks.pipeline_run, 'mutation_stale_ms', 'config.locks.pipeline_run.mutation_stale_ms', { min: 0, allowZero: false });
  requireNumber(config.locks.pipeline_run, 'abort_settle_ms', 'config.locks.pipeline_run.abort_settle_ms', { min: 0 });

  if (!isPlainObject(config.git)) { errors.push('config.git: required platform config object'); config.git = {}; }
  requireNumber(config.git.command, 'timeout_ms', 'config.git.command.timeout_ms', { min: 0, allowZero: false });
  requireNumber(config.git.command, 'max_buffer_bytes', 'config.git.command.max_buffer_bytes', { min: 0, allowZero: false });
  requireNumber(config.git.push, 'timeout_ms', 'config.git.push.timeout_ms', { min: 0, allowZero: false });
  requireNumber(config.git.push, 'max_attempts', 'config.git.push.max_attempts', { min: 0, allowZero: false });
  requireNumber(config.git.push, 'retry_delay_ms', 'config.git.push.retry_delay_ms', { min: 0 });

  if (!isPlainObject(config.redis_completion)) { errors.push('config.redis_completion: required platform config object'); config.redis_completion = {}; }
  requireNumber(config.redis_completion, 'archive_max_len', 'config.redis_completion.archive_max_len', { min: 0, allowZero: false });
  requireNumber(config.redis_completion, 'tail_scan_batch_size', 'config.redis_completion.tail_scan_batch_size', { min: 0, allowZero: false });
  requireNumber(config.redis_completion, 'tail_scan_limit', 'config.redis_completion.tail_scan_limit', { min: 0, allowZero: false });

  if (!isPlainObject(config.event_adapters)) { errors.push('config.event_adapters: required platform config object'); config.event_adapters = {}; }
  requireNumber(config.event_adapters, 'local_evidence_debounce_ms', 'config.event_adapters.local_evidence_debounce_ms', { min: 0 });
  requireNumber(config.event_adapters, 'approval_signal_debounce_ms', 'config.event_adapters.approval_signal_debounce_ms', { min: 0 });

  if (!isPlainObject(config.discord)) { errors.push('config.discord: required platform config object'); config.discord = {}; }
  requireNumber(config.discord, 'webhook_timeout_ms', 'config.discord.webhook_timeout_ms', { min: 0, allowZero: false });

  const requireGatewayInvokePolicy = (field: string) => {
    const label = `config.gateway.invoke.${field}`;
    if (!isPlainObject(config.gateway.invoke?.[field])) {
      errors.push(`${label}: required platform config object`);
      config.gateway.invoke[field] = {};
    }
    requireNumber(config.gateway.invoke[field], 'timeout_ms', `${label}.timeout_ms`, { min: 0 });
  };
  if (!isPlainObject(config.gateway)) { errors.push('config.gateway: required platform config object'); config.gateway = {}; }
  if (!isPlainObject(config.gateway.invoke)) { errors.push('config.gateway.invoke: required platform config object'); config.gateway.invoke = {}; }
  if (!isPlainObject(config.gateway.invoke.retry)) { errors.push('config.gateway.invoke.retry: required platform config object'); config.gateway.invoke.retry = {}; }
  requireNumber(config.gateway.invoke.retry, 'max_attempts', 'config.gateway.invoke.retry.max_attempts', { min: 0, allowZero: false });
  requireNumber(config.gateway.invoke.retry, 'retry_delay_ms', 'config.gateway.invoke.retry.retry_delay_ms', { min: 0 });
  for (const field of ['session_status', 'session_spawn', 'session_send', 'subagent_kill', 'subagent_list', 'health']) {
    requireGatewayInvokePolicy(field);
  }
  if (!isPlainObject(config.gateway.health)) { errors.push('config.gateway.health: required platform config object'); config.gateway.health = {}; }
  requireNumber(config.gateway.health, 'timeout_ms', 'config.gateway.health.timeout_ms', { min: 0, allowZero: false });
  requireNumber(config.gateway.health, 'interval_ms', 'config.gateway.health.interval_ms', { min: 0, allowZero: false });
  requireNumber(config.gateway.health, 'monitor_interval_ms', 'config.gateway.health.monitor_interval_ms', { min: 0, allowZero: false });
  requireNumber(config.gateway.health, 'max_failures', 'config.gateway.health.max_failures', { min: 0, allowZero: false });

  if (!isPlainObject(config.session)) { errors.push('config.session: required platform config object'); config.session = {}; }
  requireNumber(config.session, 'health_check_timeout_ms', 'config.session.health_check_timeout_ms', { min: 0 });
  if (!isPlainObject(config.session.spawn)) { errors.push('config.session.spawn: required platform config object'); config.session.spawn = {}; }
  requireBoolean(config.session.spawn.thread, 'config.session.spawn.thread');
  requireNonEmptyString(config.session.spawn.mode, 'config.session.spawn.mode');
  requireNonEmptyString(config.session.spawn.cleanup, 'config.session.spawn.cleanup');
  requireNonEmptyString(config.session.spawn.stream_to, 'config.session.spawn.stream_to');
  if (!isPlainObject(config.session.kill)) { errors.push('config.session.kill: required platform config object'); config.session.kill = {}; }
  requireNumber(config.session.kill, 'acp_confirm_timeout_ms', 'config.session.kill.acp_confirm_timeout_ms', { min: 0 });
  requireNumber(config.session.kill, 'subagent_confirm_timeout_ms', 'config.session.kill.subagent_confirm_timeout_ms', { min: 0 });
  requireNumber(config.session.kill, 'confirm_poll_ms', 'config.session.kill.confirm_poll_ms', { min: 0, allowZero: false });
  if (config.session.kill.cleanup_confirm_timeout_ms !== 'match_confirm_timeout') {
    requireNumber(config.session.kill, 'cleanup_confirm_timeout_ms', 'config.session.kill.cleanup_confirm_timeout_ms', { min: 0 });
  }
  requireNumber(config.session.kill, 'acpx_timeout_ms', 'config.session.kill.acpx_timeout_ms', { min: 0 });
  requireNonEmptyString(config.session.kill.stop_message, 'config.session.kill.stop_message');
  if (!isPlainObject(config.session.termination)) { errors.push('config.session.termination: required platform config object'); config.session.termination = {}; }
  for (const field of ['grace_ms', 'max_grace_ms', 'cleanup_confirm_timeout_ms']) {
    requireNumber(config.session.termination, field, `config.session.termination.${field}`, { min: 0 });
  }
  for (const field of ['poll_ms', 'gateway_request_max_ms', 'gateway_operation_timeout_ms', 'acpx_timeout_ms']) {
    requireNumber(config.session.termination, field, `config.session.termination.${field}`, { min: 0, allowZero: false });
  }

  if (!isPlainObject(config.buster)) { errors.push('config.buster: required platform config object'); config.buster = {}; }
  if (!isPlainObject(config.buster.runtime)) {
    errors.push('config.buster.runtime: required platform config object');
    config.buster.runtime = {};
  }
  requireNonEmptyString(config.buster.runtime.task_stream, 'config.buster.runtime.task_stream');
  requireNonEmptyString(config.buster.runtime.heartbeat_path, 'config.buster.runtime.heartbeat_path');
  requireNumber(config.buster.runtime, 'heartbeat_interval_ms', 'config.buster.runtime.heartbeat_interval_ms', { min: 0, allowZero: false });
  requireNumber(config.buster.runtime, 'task_poll_interval_ms', 'config.buster.runtime.task_poll_interval_ms', { min: 0, allowZero: false });
  requireNumber(config.buster.runtime, 'task_pending_reclaim_idle_ms', 'config.buster.runtime.task_pending_reclaim_idle_ms', { min: 0, allowZero: false });
  requireNumber(config.buster.runtime, 'completion_event_block_ms', 'config.buster.runtime.completion_event_block_ms', { min: 0 });
  requireNumber(config.buster.runtime, 'completion_recovery_scan_interval_ms', 'config.buster.runtime.completion_recovery_scan_interval_ms', { min: 0, allowZero: false });
  requireNumber(config.buster.runtime, 'task_stream_max_len', 'config.buster.runtime.task_stream_max_len', { min: 0, allowZero: false });
  requireNumber(config.buster.runtime, 'suite_timeout_ms', 'config.buster.runtime.suite_timeout_ms', { min: 0, allowZero: false });
  requireNumber(config.buster.runtime, 'max_crash_retries', 'config.buster.runtime.max_crash_retries', { min: 0 });

  if (!isPlainObject(config.discord_alerts)) {
    errors.push('config.discord_alerts: required platform config object');
    config.discord_alerts = {};
  }
  for (const level of ['info', 'warn', 'critical', 'ok']) {
    requireBoolean(config.discord_alerts[level], `config.discord_alerts.${level}`);
  }

  if (!isPlainObject(config.pre_check)) {
    errors.push('config.pre_check: required platform config object');
    config.pre_check = {};
  }
  requireBoolean(config.pre_check.enabled, 'config.pre_check.enabled');
  requireNonEmptyString(config.pre_check.lint_report_path, 'config.pre_check.lint_report_path');
  requireNonEmptyString(config.pre_check.lint_policy_path, 'config.pre_check.lint_policy_path');
  requireNonEmptyString(config.pre_check.lint_policy_project, 'config.pre_check.lint_policy_project');
  requireNumber(config.pre_check, 'timeout_seconds', 'config.pre_check.timeout_seconds', { min: 0, allowZero: false });

  if (!isPlainObject(config.review_defaults)) {
    errors.push('config.review_defaults: required platform config object');
    config.review_defaults = {};
  }
  if (config.review_defaults.reviewers !== undefined) {
    errors.push('config.review_defaults.reviewers: reviewer/model defaults belong in progress.json gates/defaults, not swarm.config.json');
  }
  requireNumber(config.review_defaults, 'timeout_minutes', 'config.review_defaults.timeout_minutes', { min: 0, allowZero: false });
  requireNumber(config.review_defaults, 'max_fix_cycles', 'config.review_defaults.max_fix_cycles', { min: 0 });
  requireNonEmptyString(config.review_defaults.lint_tier, 'config.review_defaults.lint_tier');
  requireBoolean(config.review_defaults.lint_required, 'config.review_defaults.lint_required');

  if (!isPlainObject(config.case_study)) {
    errors.push('config.case_study: required platform config object');
    config.case_study = {};
  }
  requireNumber(config.case_study, 'timeout_minutes', 'config.case_study.timeout_minutes', { min: 0, allowZero: false });

  if (!isPlainObject(config.arch_validation)) {
    errors.push('config.arch_validation: required platform config object');
    config.arch_validation = {};
  }
  requireBoolean(config.arch_validation.enabled, 'config.arch_validation.enabled');
  requireBoolean(config.arch_validation.agent_enabled, 'config.arch_validation.agent_enabled');
  requireNumber(config.arch_validation, 'timeout_minutes', 'config.arch_validation.timeout_minutes', { min: 0, allowZero: false });

  if (!isPlainObject(config.plugins)) {
    errors.push('config.plugins: required platform config object');
    config.plugins = {};
  }
  requireBoolean(config.plugins.enabled, 'config.plugins.enabled');
  requireBoolean(config.plugins.allowCustomModules, 'config.plugins.allowCustomModules');
  if (!Array.isArray(config.plugins.extraModulePaths)) {
    errors.push('config.plugins.extraModulePaths: required array in swarm.config.json');
  }
  for (const field of ['modules', 'stageOwners', 'restrictedCapabilityAllowlist']) {
    if (!isPlainObject(config.plugins[field])) {
      errors.push(`config.plugins.${field}: required object in swarm.config.json`);
      config.plugins[field] = {};
    }
  }

  // ── Platform-owned field validation ──────────────────────────────────────
  // ACP monitor timing belongs to swarm.config.json. Do not synthesize hidden
  // runtime defaults here; missing values are operator config errors.
  if (selectTruthyValue(() => (selectTruthyValue(() => (!config.acp_monitor), () => (typeof config.acp_monitor !== 'object'))), () => (Array.isArray(config.acp_monitor)))) {
    errors.push('config.acp_monitor: required platform config object');
    config.acp_monitor = {};
  }
  requireNumber(config.acp_monitor, 'poll_limit', 'config.acp_monitor.poll_limit', { min: 0 });
  requireNumber(config.acp_monitor, 'max_transcript_extensions', 'config.acp_monitor.max_transcript_extensions', { min: 0 });
  requireNumber(config.acp_monitor, 'transcript_grace_ms', 'config.acp_monitor.transcript_grace_ms', { min: 0 });
  requireNumber(config.acp_monitor, 'monitor_poll_ms', 'config.acp_monitor.monitor_poll_ms', { min: 0 });

  // telemetry.enabled — boolean
  if (!isPlainObject(config.telemetry)) { errors.push('config.telemetry: required platform config object'); config.telemetry = {}; }
  requireBoolean(config.telemetry.enabled, 'config.telemetry.enabled');
  requireNumber(config.telemetry, 'stream_max_len', 'config.telemetry.stream_max_len', { min: 0, allowZero: false });
  requireNumber(config.telemetry, 'sink_timeout_ms', 'config.telemetry.sink_timeout_ms', { min: 0, allowZero: false });

  if (config.telemetry?.stream_key !== undefined) {
    errors.push('config.telemetry stream_key: removed; use config.telemetry.enabled and canonical run-scoped stream names');
  }

  if (config.agent_observability !== undefined) {
    const agentObservability = config.agent_observability;
    if (!isPlainObject(agentObservability)) {
      errors.push('config.agent_observability: must be an object when provided');
      config.agent_observability = {};
    } else {
      requireBoolean(agentObservability.required, 'config.agent_observability.required');
      if (!isPlainObject(agentObservability.payload)) {
        errors.push('config.agent_observability.payload: required object');
      } else {
        requireNumber(agentObservability.payload, 'max_event_bytes', 'config.agent_observability.payload.max_event_bytes', { min: 0, allowZero: false });
      }
      if (!isPlainObject(agentObservability.startup_evidence)) {
        errors.push('config.agent_observability.startup_evidence: required object');
      } else {
        requireNumber(agentObservability.startup_evidence, 'timeout_ms', 'config.agent_observability.startup_evidence.timeout_ms', { min: 0 });
        requireNumber(agentObservability.startup_evidence, 'block_ms', 'config.agent_observability.startup_evidence.block_ms', { min: 0 });
      }
      if (!isPlainObject(agentObservability.forge_completion)) {
        errors.push('config.agent_observability.forge_completion: required object');
      } else {
        requireNumber(agentObservability.forge_completion, 'xread_block_ms', 'config.agent_observability.forge_completion.xread_block_ms', { min: 0 });
        requireNumber(agentObservability.forge_completion, 'settle_ms', 'config.agent_observability.forge_completion.settle_ms', { min: 0 });
      }
      if (!isPlainObject(agentObservability.plugin)) {
        errors.push('config.agent_observability.plugin: required object');
      } else {
        requireBoolean(agentObservability.plugin.enabled, 'config.agent_observability.plugin.enabled');
        const streams = isPlainObject(agentObservability.streams) ? agentObservability.streams : {};
        const hook = isPlainObject(agentObservability.plugin.hook) ? agentObservability.plugin.hook : {};
        const controlWrite = isPlainObject(agentObservability.plugin.control_write) ? agentObservability.plugin.control_write : {};
        if (!isPlainObject(agentObservability.streams)) errors.push('config.agent_observability.streams: required object');
        requireNumber(agentObservability.plugin, 'max_queue_per_stream', 'config.agent_observability.plugin.max_queue_per_stream', { min: 0, allowZero: false });
        requireNumber(streams, 'stream_max_len', 'config.agent_observability plugin streams stream_max_len', { min: 0, allowZero: false });
        requireNumber(streams, 'dead_letter_max_len', 'config.agent_observability plugin streams dead_letter_max_len', { min: 0, allowZero: false });
        if (!isPlainObject(agentObservability.plugin.control_write)) errors.push('config.agent_observability.plugin.control_write: required object');
        requireNumber(controlWrite, 'max_attempts', 'config.agent_observability.plugin.control_write.max_attempts', { min: 0, allowZero: false });
        requireNumber(controlWrite, 'retry_base_ms', 'config.agent_observability.plugin.control_write.retry_base_ms', { min: 0, allowZero: false });
        requireNumber(controlWrite, 'retry_max_ms', 'config.agent_observability.plugin.control_write.retry_max_ms', { min: 0, allowZero: false });
        if (!isPlainObject(agentObservability.plugin.hook)) errors.push('config.agent_observability.plugin.hook: required object');
        requireNumber(hook, 'priority', 'config.agent_observability plugin hook priority', { min: -Infinity });
        requireNumber(hook, 'timeout_ms', 'config.agent_observability.plugin.hook.timeout_ms', { min: 0, allowZero: false });
      }
      if (!isPlainObject(agentObservability.plugin_control)) {
        errors.push('config.agent_observability.plugin_control: required object');
      } else {
        requireBoolean(agentObservability.plugin_control.enabled, 'config.agent_observability.plugin_control.enabled');
        requireNonEmptyString(agentObservability.plugin_control.pluginId, 'config.agent_observability.plugin_control.pluginId');
        requireNonEmptyString(agentObservability.plugin_control.command, 'config.agent_observability.plugin_control.command');
        requireNumber(agentObservability.plugin_control, 'timeout_ms', 'config.agent_observability.plugin_control.timeout_ms', { min: 0, allowZero: false });
      }
      if (!isPlainObject(agentObservability.ingester)) {
        errors.push('config.agent_observability.ingester: required object');
      } else {
        requireBoolean(agentObservability.ingester.enabled, 'config.agent_observability.ingester.enabled');
        requireNonEmptyString(agentObservability.ingester.groupName, 'config.agent_observability.ingester.groupName');
        requireNonEmptyString(agentObservability.ingester.consumerName, 'config.agent_observability.ingester.consumerName');
        const streams = isPlainObject(agentObservability.streams) ? agentObservability.streams : {};
        const trim = isPlainObject(agentObservability.ingester.trim) ? agentObservability.ingester.trim : {};
        const loop = isPlainObject(agentObservability.ingester.loop) ? agentObservability.ingester.loop : {};
        const pressure = isPlainObject(agentObservability.ingester.pressure) ? agentObservability.ingester.pressure : {};
        requireNumber(agentObservability.ingester, 'read_block_ms', 'config.agent_observability.ingester.read_block_ms', { min: 0, allowZero: false });
        requireNumber(agentObservability.ingester, 'reclaim_idle_ms', 'config.agent_observability.ingester.reclaim_idle_ms', { min: 0, allowZero: false });
        requireNumber(agentObservability.ingester, 'redis_command_timeout_ms', 'config.agent_observability.ingester.redis_command_timeout_ms', { min: 0, allowZero: false });
        if (!isPlainObject(agentObservability.ingester.loop)) errors.push('config.agent_observability.ingester.loop: required object');
        requireNumber(loop, 'delay_ms', 'config.agent_observability.ingester.loop.delay_ms', { min: 0, allowZero: false });
        requireNumber(loop, 'health_check_every', 'config.agent_observability.ingester.loop.health_check_every');
        requireNumber(loop, 'stop_timeout_ms', 'config.agent_observability.ingester.loop.stop_timeout_ms');
        if (!isPlainObject(agentObservability.ingester.trim)) errors.push('config.agent_observability.ingester.trim: required object');
        requireNumber(trim, 'interval_ms', 'config.agent_observability.ingester.trim.interval_ms', { min: 0, allowZero: false });
        requireNumber(streams, 'dead_letter_max_len', 'config.agent_observability ingester streams dead_letter_max_len', { min: 0, allowZero: false });
        requireNumber(streams, 'stream_max_len', 'config.agent_observability ingester streams stream_max_len', { min: 0, allowZero: false });
        requireNumber(trim, 'payload_stream_max_len', 'config.agent_observability ingester trim payload_stream_max_len', { min: 0, allowZero: false });
        if (!isPlainObject(agentObservability.ingester.pressure)) errors.push('config.agent_observability.ingester.pressure: required object');
        requireNumber(pressure, 'control_lag_degraded_threshold', 'config.agent_observability ingester pressure control_lag_degraded_threshold');
        requireNumber(pressure, 'payload_pressure_degraded_threshold', 'config.agent_observability ingester pressure payload_pressure_degraded_threshold');
      }
      if (agentObservability.required === true && config.telemetry?.enabled !== true) {
        errors.push('config.telemetry.enabled: must be true when config.agent_observability.required is true');
      }
    }
  }

  // case_study.enabled — boolean
  if (config.case_study?.enabled !== undefined && typeof config.case_study.enabled !== 'boolean') {
    errors.push('config.case_study.enabled: must be a boolean');
  }

  // case_study.model — string (optional)
  if (config.case_study?.model !== undefined && typeof config.case_study.model !== 'string') {
    errors.push('config.case_study.model: must be a string');
  }

  // case_study.output_file — string (optional)
  if (config.case_study?.output_file !== undefined && typeof config.case_study.output_file !== 'string') {
    errors.push('config.case_study.output_file: must be a string');
  }

  requireNonEmptyString(config.projects_root, 'config.projects_root');

  // Reject unknown top-level config fields. Silent drift at the runtime config
  // boundary was a legacy fallback and is intentionally deleted in Phase 3.
  const KNOWN_TOP_LEVEL_FIELDS = new Set([
    '_doc',
    'project', 'repo_root', 'projects_root', 'paths', 'agents', 'fallback_model', 'gates', 'run_id',
    'pipeline_defaults',
    'acp_monitor', 'telemetry', 'case_study', 'pipeline_review', 'arch_validation',
    'agent_observability',
    'plugins', 'discord_alerts', 'pre_check', 'review_defaults', 'buster',
    'gateway', 'session', 'polling', 'locks', 'git', 'redis_completion', 'event_adapters', 'discord',
    'discord_webhook_url', 'rate_limit', 'budget',
    'models', '_testOverrides',
    '_runId', '_validationErrors',
    '_runStats',
    'pluginRegistry',
  ]);
  for (const key of Object.keys(config)) {
    if (!KNOWN_TOP_LEVEL_FIELDS.has(key)) {
      errors.push(`config.${key}: unknown top-level config field`);
    }
  }

  requireField(progress, 'project', 'progress');
  requireField(progress, 'execution_order', 'progress');
  requireField(progress, 'modules', 'progress');
  if (progress?.case_study !== undefined) {
    errors.push('progress.case_study: case study generator config belongs in swarm.config.json config.case_study');
  }

  const registryBuild = buildPluginRegistry(config.plugins, { throwOnError: false });
  config.plugins = registryBuild.normalizedConfig;
  if (registryBuild.errors.length > 0) {
    errors.push(...registryBuild.errors.map((error) => `[${error.code}] ${error.message}`));
  }

  const registryGateTypes = registryBuild.registry?.gateTypes;
  if (!isPlainObject(registryGateTypes)) {
    errors.push('plugin registry gateTypes: required registry object');
  }
  const validGateTypes = isPlainObject(registryGateTypes) ? Object.keys(registryGateTypes).sort() : [];
  const validGateTypesLabel = validGateTypes.length > 0 ? validGateTypes.join(' | ') : 'none registered';
  const validOnReviewFail = ['stop'];
  const validOnFail       = ['fix_and_retest'];
  const validOnTimeout = ['block', 'continue'];

  const gateDefinitions = isPlainObject(progress?.gates) ? progress.gates : {};
  if (progress?.gates !== undefined && !isPlainObject(progress.gates)) {
    errors.push('progress.gates: must be an object when provided');
  }

  for (const [gateId, gateRaw] of Object.entries(gateDefinitions)) {
    requireSafeIdentifier(gateId, `progress.gates.${gateId}`);
    const gate = gateRaw as AnyRecord;
    if (gate[REMOVED_REVIEW_FAIL_FIELD] !== undefined) {
      errors.push(`progress.gates.${gateId}.${REMOVED_REVIEW_FAIL_FIELD}: removed field; use on_fail`);
    }
    if (!gate.type) {
      errors.push(`progress.gates.${gateId}.type: required (${validGateTypesLabel})`);
    } else if (!validGateTypes.includes(gate.type)) {
      errors.push(`progress.gates.${gateId}.type: '${gate.type}' not registered in the startup plugin registry (${validGateTypesLabel})`);
    }

    if (gate.type === 'review') {
      if (!gate.review_name) errors.push(`progress.gates.${gateId}.review_name: required for review gates`);
      if (!gate.instructions_file) errors.push(`progress.gates.${gateId}.instructions_file: required`);
      if (gate.on_fail && !validOnReviewFail.includes(gate.on_fail)) {
        errors.push(`progress.gates.${gateId}.on_fail: '${gate.on_fail}' not valid (${validOnReviewFail.join(' | ')})`);
      }
    }

    if (gate.type === 'buster') {
      if (gate.on_fail && !validOnFail.includes(gate.on_fail)) {
        errors.push(`progress.gates.${gateId}.on_fail: '${gate.on_fail}' not valid (${validOnFail.join(' | ')})`);
      }
    }

    if (gate.type === 'approval') {
      if (!gate.title) {
        errors.push(`progress.gates.${gateId}.title: required for approval gates`);
      }
      if (!gate.on_timeout) {
        errors.push(`progress.gates.${gateId}.on_timeout: required for approval gates (${validOnTimeout.join(' | ')})`);
      } else if (!validOnTimeout.includes(gate.on_timeout)) {
        errors.push(`progress.gates.${gateId}.on_timeout: '${gate.on_timeout}' not valid (${validOnTimeout.join(' | ')})`);
      }
      if (gate.timeout_minutes !== undefined && gate.timeout_minutes !== null) {
        const tm = Number(gate.timeout_minutes);
        if (selectTruthyValue(() => (!Number.isFinite(tm)), () => (tm <= 0))) {
          errors.push(`progress.gates.${gateId}.timeout_minutes: must be a positive number`);
        }
      }
    }
  }

  if (isPlainObject(progress?.modules)) {
    for (const [moduleId, modRaw] of Object.entries(progress.modules)) {
      const mod = modRaw as AnyRecord;
      if (!Array.isArray(mod?.depends_on)) continue;
      for (const dep of mod.depends_on) {
        if (selectTruthyValue(() => (typeof dep !== 'string'), () => (!dep.startsWith('gate:')))) continue;
        const gateId = dep.slice('gate:'.length);
        try { assertSafePathSegment(gateId, `progress.modules.${moduleId}.depends_on gate reference`); }
        catch (e: any) { errors.push(e.message); continue; }
        if (!Object.prototype.hasOwnProperty.call(gateDefinitions, gateId)) {
          errors.push(`progress.modules.${moduleId}.depends_on: gate '${gateId}' is not defined in progress.gates`);
        }
      }
    }
  }

  for (const [name, agentConfRaw] of agentConfigEntries(config)) {
    const agentConf = agentConfRaw as AnyRecord;
    if (agentConf?.redis_js_path) {
      try { validateSafePath(agentConf.redis_js_path, `config.agents.${name}.redis_js_path`); }
    catch (e: any) { errors.push(e.message); }
    }
  }

  if (errors.length > 0) {
    config._validationErrors = errors;
    throw new Error(
      `Config validation failed with ${errors.length} error(s):\n` +
      errors.map((e) => `  - ${e}`).join('\n')
    );
  }

  return registryBuild.registry;
}

export function validateBusterConfig(config: AnyRecord) {
  const buster = config.agents?.buster;
  if (!buster) throw new Error('config.agents.buster missing');
  if (buster.dispatch !== 'redis') throw new Error('Buster must use redis dispatch');
  if (!buster.redis_js_path) throw new Error('Buster redis_js_path missing');
  validateSafePath(buster.redis_js_path, 'config.agents.buster.redis_js_path');
  return true;
}
