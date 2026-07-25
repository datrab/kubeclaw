import { agentConfigEntries, ConfigValidation, isPlainObject } from './config-validation-values.ts';
import type { AnyRecord } from './config-validation-values.ts';

function validateRequiredFields(config: AnyRecord, validation: ConfigValidation) {
  for (const field of [
    'project',
    'repo_root',
    'paths',
    'paths.project_src_dir',
    'paths.swarm_dir',
    'paths.progress_file',
    'paths.modules_dir',
    'agents',
    'agents.forge',
    'agents.buster',
    'agents.echo',
    'fallback_model',
    'pipeline_defaults',
    'rate_limit',
    'discord_alerts',
    'pre_check',
    'review_defaults',
    'plugins',
  ]) {
    validation.field(config, field);
  }
}

function validateAgent(name: string, agentConf: AnyRecord, validation: ConfigValidation) {
  if (!agentConf.dispatch) {
    validation.errors.push(`config.agents.${name}.dispatch: required ('acp', 'subagent', or 'redis') in swarm.config.json`);
  } else if (!['acp', 'subagent', 'redis'].includes(agentConf.dispatch)) {
    validation.errors.push(`config.agents.${name}.dispatch: invalid dispatch '${agentConf.dispatch}'`);
  }
  if (['acp', 'subagent'].includes(agentConf.dispatch) && !agentConf.acp_agent_id) {
    validation.errors.push(`config.agents.${name}.acp_agent_id: required for ACP/subagent dispatch agents in swarm.config.json`);
  }
  if (agentConf.dispatch === 'redis' && !agentConf.redis_js_path) {
    validation.errors.push(`config.agents.${name}.redis_js_path: required for redis dispatch agents in swarm.config.json`);
  }
}

function validateAgents(config: AnyRecord, validation: ConfigValidation) {
  if (config.agents?.buster?.dispatch !== 'redis') {
    validation.errors.push("config.agents.buster.dispatch: required platform value 'redis' in swarm.config.json");
  }
  if (!config.agents?.buster?.redis_js_path) {
    validation.errors.push('config.agents.buster.redis_js_path: required for redis dispatch agents in swarm.config.json');
  }
  for (const [name, agentConf] of agentConfigEntries(config)) {
    if (!isPlainObject(agentConf) || name.startsWith('_')) continue;
    validateAgent(name, agentConf, validation);
  }
}

function validatePipelineAndRate(config: AnyRecord, validation: ConfigValidation) {
  validation.string(config.fallback_model, 'config.fallback_model');
  if (config.models !== undefined) {
    validation.errors.push('config.models: role-specific model defaults belong in progress.json defaults.models; swarm.config.json must only set fallback_model');
  }
  const pipeline = validation.object(config, 'pipeline_defaults', 'config.pipeline_defaults');
  validation.number(pipeline, 'timeout_minutes', 'config.pipeline_defaults.timeout_minutes', { allowZero: false });
  validation.number(pipeline, 'max_fails', 'config.pipeline_defaults.max_fails');
  validation.number(pipeline, 'auto_retry_threshold', 'config.pipeline_defaults.auto_retry_threshold');
  validation.number(pipeline, 'agent_startup_retry_budget', 'config.pipeline_defaults.agent_startup_retry_budget');
  validation.number(pipeline, 'session_nudge_threshold', 'config.pipeline_defaults.session_nudge_threshold', { max: 1 });
  const rate = validation.object(config, 'rate_limit', 'config.rate_limit');
  validation.number(rate, 'cooldown_hours', 'config.rate_limit.cooldown_hours');
  validation.number(rate, 'max_pauses_per_module', 'config.rate_limit.max_pauses_per_module');
  validation.number(rate, 'cooldown_buffer_ms', 'config.rate_limit.cooldown_buffer_ms');
}

function validatePollingLocks(config: AnyRecord, validation: ConfigValidation) {
  const polling = validation.object(config, 'polling', 'config.polling');
  validation.number(polling, 'interval_seconds', 'config.polling.interval_seconds', { allowZero: false });
  validation.number(polling, 'progress_interval_ms', 'config.polling.progress_interval_ms');
  validation.number(polling, 'session_end_grace_ms', 'config.polling.session_end_grace_ms');
  const locks = validation.object(config, 'locks', 'config.locks');
  for (const [section, field, allowZero] of [
    ['lifecycle_append', 'stale_ms', true],
    ['lifecycle_append', 'timeout_ms', true],
    ['gate_active_session', 'stale_ms', true],
    ['gate_active_session', 'timeout_ms', true],
    ['pipeline_run', 'lease_ms', false],
    ['pipeline_run', 'heartbeat_ms', false],
    ['pipeline_run', 'mutation_stale_ms', false],
    ['pipeline_run', 'abort_settle_ms', true],
  ] as Array<[string, string, boolean]>) {
    validation.number(locks[section], field, `config.locks.${section}.${field}`, { allowZero });
  }
}

function validateGitAndStorage(config: AnyRecord, validation: ConfigValidation) {
  const git = validation.object(config, 'git', 'config.git');
  validation.number(git.command, 'timeout_ms', 'config.git.command.timeout_ms', { allowZero: false });
  validation.number(git.command, 'max_buffer_bytes', 'config.git.command.max_buffer_bytes', { allowZero: false });
  validation.number(git.push, 'timeout_ms', 'config.git.push.timeout_ms', { allowZero: false });
  validation.number(git.push, 'max_attempts', 'config.git.push.max_attempts', { allowZero: false });
  validation.number(git.push, 'retry_delay_ms', 'config.git.push.retry_delay_ms');
  const completion = validation.object(config, 'redis_completion', 'config.redis_completion');
  for (const field of ['archive_max_len', 'tail_scan_batch_size', 'tail_scan_limit']) {
    validation.number(completion, field, `config.redis_completion.${field}`, { allowZero: false });
  }
  const adapters = validation.object(config, 'event_adapters', 'config.event_adapters');
  validation.number(adapters, 'local_evidence_debounce_ms', 'config.event_adapters.local_evidence_debounce_ms');
  validation.number(adapters, 'approval_signal_debounce_ms', 'config.event_adapters.approval_signal_debounce_ms');
  const discord = validation.object(config, 'discord', 'config.discord');
  validation.number(discord, 'webhook_timeout_ms', 'config.discord.webhook_timeout_ms', { allowZero: false });
}

export function validateRuntimeConfig(config: AnyRecord, validation: ConfigValidation) {
  validateRequiredFields(config, validation);
  validateAgents(config, validation);
  validatePipelineAndRate(config, validation);
  validatePollingLocks(config, validation);
  validateGitAndStorage(config, validation);
}
