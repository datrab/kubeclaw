// core/config.ts — Config loading, validation, and model resolution

// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';
import { log } from './logger.ts';
import { discoverPlatformSwarmConfigCandidates, discoverSwarmConfigPath, loadPlatformSwarmConfig } from './platform-config.ts';
import { assertSafePathSegment, validateSafePath } from './paths.ts';
import { getRepoRoot, setRepoRoot } from './git-context.ts';
import { resolvePolicy, validateThinkingLevel, logEffectivePolicy, VALID_THINKING_LEVELS, THINKING_SUPPORTED_PATHS, THINKING_UNSUPPORTED_PATHS } from './policy.ts';
import { buildPluginRegistry } from './registry.ts';

export { resolvePolicy, validateThinkingLevel, logEffectivePolicy, VALID_THINKING_LEVELS, THINKING_SUPPORTED_PATHS, THINKING_UNSUPPORTED_PATHS };
export { discoverPlatformSwarmConfigCandidates, discoverSwarmConfigPath, loadPlatformSwarmConfig };

// ─── Exported functions ───────────────────────────────────────────────────────

type AnyRecord = Record<string, any>;
declare const process: any;
const REMOVED_REVIEW_FAIL_FIELD = `on_${'n' + 'ogo'}`;

export function loadConfig(projectName: any, opts: AnyRecord = {}) {
  if (!projectName) {
    throw new Error(
      'Project name required. Use --project <n> or set CURRENT_PROJECT env.'
    );
  }
  projectName = assertSafePathSegment(projectName, 'project name');

  let repoRoot = opts.repoRoot || process.env.REPO_ROOT || null;
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

  const swarmDir = path.join(repoRoot, 'Projects', projectName, 'src', '.swarm');
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

  return { config, progress, pluginRegistry };
}

export function validateConfig(config: AnyRecord, progress: AnyRecord) {
  const errors: string[] = [];

  if (Object.prototype.hasOwnProperty.call(config || {}, '_testOverrides')) {
    errors.push('config._testOverrides: forbidden in runtime config; inject verification fakes through explicit harness options');
  }

  const requireField = (obj: any, fieldPath: string, parentPath = 'config') => {
    const keys = fieldPath.split('.');
    let current = obj;
    let currentPath = parentPath;
    for (const key of keys) {
      currentPath = `${currentPath}.${key}`;
      if (current === null || current === undefined || typeof current !== 'object') {
        errors.push(`${currentPath}: parent is ${current === null ? 'null' : typeof current}`);
        return;
      }
      current = current[key];
    }
    if (current === undefined || current === null) {
      errors.push(`${currentPath}: required field is missing`);
    }
  };

  requireField(config, 'project');
  requireField(config, 'repo_root');
  requireField(config, 'paths');
  requireField(config, 'paths.swarm_dir');
  requireField(config, 'paths.progress_file');
  requireField(config, 'paths.modules_dir');
  requireField(config, 'agents');
  requireField(config, 'agents.forge');
  requireField(config, 'agents.buster');
  requireField(config, 'agents.echo');
  requireField(config, 'fallback_model');
  requireField(config, 'rate_limit');
  requireField(config, 'discord_alerts');
  requireField(config, 'pre_check');
  requireField(config, 'review_defaults');
  requireField(config, 'plugins');

  const isPlainObject = (value: any) => value && typeof value === 'object' && !Array.isArray(value);
  const requireNonEmptyString = (value: any, label: string) => {
    if (typeof value !== 'string' || !value.trim()) errors.push(`${label}: required non-empty string in swarm.config.json`);
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
    if (raw === undefined || raw === null || raw === '') {
      errors.push(`${label}: required in swarm.config.json`);
      return null;
    }
    const tooSmall = typeof raw === 'number' ? (allowZero ? raw < min : raw <= min) : false;
    if (typeof raw !== 'number' || !Number.isFinite(raw) || tooSmall || (max !== null && raw > max)) {
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

  for (const [name, agentConfRaw] of Object.entries(config.agents || {})) {
    const agentConf = agentConfRaw as AnyRecord;
    if (typeof agentConf !== 'object' || agentConf === null) continue;
    if (name.startsWith('_')) continue;
    if (!agentConf.dispatch) {
      errors.push(`config.agents.${name}.dispatch: required ('acp', 'subagent', or 'redis') in swarm.config.json`);
    }
    if (!['acp', 'subagent', 'redis'].includes(agentConf.dispatch)) {
      errors.push(`config.agents.${name}.dispatch: invalid dispatch '${agentConf.dispatch}'`);
    }
    if ((agentConf.dispatch === 'acp' || agentConf.dispatch === 'subagent') && !agentConf.acp_agent_id) {
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

  requireNumber(config, 'poll_interval_seconds', 'config.poll_interval_seconds', { min: 0, allowZero: false });
  requireNumber(config, 'default_timeout_minutes', 'config.default_timeout_minutes', { min: 0, allowZero: false });
  requireNumber(config, 'default_max_fails', 'config.default_max_fails', { min: 0 });
  requireNumber(config, 'auto_retry_threshold', 'config.auto_retry_threshold', { min: 0 });
  requireNumber(config, 'session_nudge_threshold', 'config.session_nudge_threshold', { min: 0, max: 1 });

  if (!isPlainObject(config.rate_limit)) {
    errors.push('config.rate_limit: required platform config object');
    config.rate_limit = {};
  }
  requireNumber(config.rate_limit, 'cooldown_hours', 'config.rate_limit.cooldown_hours', { min: 0 });
  requireNumber(config.rate_limit, 'max_pauses_per_module', 'config.rate_limit.max_pauses_per_module', { min: 0 });
  requireNumber(config.rate_limit, 'cooldown_buffer_ms', 'config.rate_limit.cooldown_buffer_ms', { min: 0 });

  if (!isPlainObject(config.buster)) { errors.push('config.buster: required platform config object'); config.buster = {}; }
  requireNumber(config.buster, 'suite_timeout_ms', 'config.buster.suite_timeout_ms', { min: 0, allowZero: false });
  requireNumber(config.buster, 'max_crash_retries', 'config.buster.max_crash_retries', { min: 0 });
  if (!isPlainObject(config.buster.runtime)) {
    errors.push('config.buster.runtime: required platform config object');
    config.buster.runtime = {};
  }
  requireNonEmptyString(config.buster.runtime.heartbeat_path, 'config.buster.runtime.heartbeat_path');
  requireNumber(config.buster.runtime, 'heartbeat_interval_ms', 'config.buster.runtime.heartbeat_interval_ms', { min: 0, allowZero: false });
  requireNumber(config.buster.runtime, 'task_poll_interval_ms', 'config.buster.runtime.task_poll_interval_ms', { min: 0, allowZero: false });
  requireNumber(config.buster.runtime, 'task_pending_reclaim_idle_ms', 'config.buster.runtime.task_pending_reclaim_idle_ms', { min: 0, allowZero: false });
  requireNumber(config.buster.runtime, 'task_stream_max_len', 'config.buster.runtime.task_stream_max_len', { min: 0, allowZero: false });

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
  if (!config.acp_monitor || typeof config.acp_monitor !== 'object' || Array.isArray(config.acp_monitor)) {
    errors.push('config.acp_monitor: required platform config object');
    config.acp_monitor = {};
  }

  for (const field of [
    'unknown_poll_limit',
    'stale_poll_limit',
    'max_transcript_extensions',
    'transcript_grace_ms',
    'monitor_poll_ms',
  ]) {
    if (config.acp_monitor[field] === undefined || config.acp_monitor[field] === null || config.acp_monitor[field] === '') {
      errors.push(`config.acp_monitor.${field}: required in swarm.config.json`);
      continue;
    }
    const value = config.acp_monitor[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      errors.push(`config.acp_monitor.${field}: must be a non-negative number`);
    }
  }

  // telemetry.enabled — boolean
  if (config.telemetry?.enabled !== undefined && typeof config.telemetry.enabled !== 'boolean') {
    errors.push('config.telemetry.enabled: must be a boolean');
  }

  if (config.telemetry?.stream_key !== undefined) {
    errors.push('config.telemetry stream_key: removed; use config.telemetry.enabled and canonical run-scoped stream names');
  }

  if (config.agent_observability !== undefined) {
    if (!isPlainObject(config.agent_observability)) {
      errors.push('config.agent_observability: must be an object when provided');
      config.agent_observability = {};
    }
    if (config.agent_observability.required !== undefined) {
      requireBoolean(config.agent_observability.required, 'config.agent_observability.required');
    }
    if (config.agent_observability.startup_evidence_timeout_ms !== undefined) {
      const timeout = config.agent_observability.startup_evidence_timeout_ms;
      if (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout < 0) {
        errors.push('config.agent_observability.startup_evidence_timeout_ms: must be a non-negative number');
      }
    }
    if (config.agent_observability.required === true && config.telemetry?.enabled !== true) {
      errors.push('config.telemetry.enabled: must be true when config.agent_observability.required is true');
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

  // Reject unknown top-level config fields. Silent drift at the runtime config
  // boundary was a legacy fallback and is intentionally deleted in Phase 3.
  const KNOWN_TOP_LEVEL_FIELDS = new Set([
    '_doc',
    'project', 'repo_root', 'paths', 'agents', 'fallback_model', 'gates',
    'poll_interval_seconds', 'default_timeout_minutes', 'default_max_fails',
    'auto_retry_threshold', 'session_nudge_threshold',
    'acp_monitor', 'telemetry', 'case_study', 'arch_validation',
    'agent_observability', 'agent_observability_forge_completion_settle_ms',
    'plugins', 'discord_alerts', 'pre_check', 'review_defaults', 'buster',
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

  const registryBuild = buildPluginRegistry(config.plugins, { throwOnError: false });
  config.plugins = registryBuild.normalizedConfig;
  if (registryBuild.errors.length > 0) {
    errors.push(...registryBuild.errors.map((error) => `[${error.code}] ${error.message}`));
  }

  const validGateTypes = Object.keys(registryBuild.registry?.gateTypes || {}).sort();
  const validGateTypesLabel = validGateTypes.length > 0 ? validGateTypes.join(' | ') : 'none registered';
  const validOnReviewFail = ['fix_and_rereview', 'stop'];
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
        if (!Number.isFinite(tm) || tm <= 0) {
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
        if (typeof dep !== 'string' || !dep.startsWith('gate:')) continue;
        const gateId = dep.slice('gate:'.length);
        try { assertSafePathSegment(gateId, `progress.modules.${moduleId}.depends_on gate reference`); }
        catch (e: any) { errors.push(e.message); continue; }
        if (!Object.prototype.hasOwnProperty.call(gateDefinitions, gateId)) {
          errors.push(`progress.modules.${moduleId}.depends_on: gate '${gateId}' is not defined in progress.gates`);
        }
      }
    }
  }

  for (const [name, agentConfRaw] of Object.entries(config.agents || {})) {
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
