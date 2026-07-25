import { ConfigValidation } from './config-validation-values.ts';
import type { AnyRecord } from './config-validation-values.ts';

function validateGateway(config: AnyRecord, validation: ConfigValidation) {
  const gateway = validation.object(config, 'gateway', 'config.gateway');
  if (!gateway.invoke || typeof gateway.invoke !== 'object' || Array.isArray(gateway.invoke)) {
    validation.errors.push('config.gateway.invoke: required platform config object');
    gateway.invoke = {};
  }
  const invoke = gateway.invoke;
  if (!invoke.retry || typeof invoke.retry !== 'object' || Array.isArray(invoke.retry)) {
    validation.errors.push('config.gateway.invoke.retry: required platform config object');
    invoke.retry = {};
  }
  validation.number(invoke.retry, 'max_attempts', 'config.gateway.invoke.retry.max_attempts', { allowZero: false });
  validation.number(invoke.retry, 'retry_delay_ms', 'config.gateway.invoke.retry.retry_delay_ms');
  for (const field of ['session_status', 'session_spawn', 'session_send', 'subagent_kill', 'subagent_list', 'health']) {
    if (!invoke[field] || typeof invoke[field] !== 'object' || Array.isArray(invoke[field])) {
      validation.errors.push(`config.gateway.invoke.${field}: required platform config object`);
      invoke[field] = {};
    }
    validation.number(invoke[field], 'timeout_ms', `config.gateway.invoke.${field}.timeout_ms`);
  }
  const health = gateway.health && typeof gateway.health === 'object' ? gateway.health : {};
  if (health !== gateway.health) {
    validation.errors.push('config.gateway.health: required platform config object');
    gateway.health = health;
  }
  for (const field of ['timeout_ms', 'interval_ms', 'monitor_interval_ms', 'max_failures']) {
    validation.number(health, field, `config.gateway.health.${field}`, { allowZero: false });
  }
}

function validateSession(config: AnyRecord, validation: ConfigValidation) {
  const session = validation.object(config, 'session', 'config.session');
  validation.number(session, 'health_check_timeout_ms', 'config.session.health_check_timeout_ms');
  const spawn = validation.object(session, 'spawn', 'config.session.spawn');
  validation.boolean(spawn.thread, 'config.session.spawn.thread');
  for (const field of ['mode', 'cleanup', 'stream_to']) validation.string(spawn[field], `config.session.spawn.${field}`);
  const kill = validation.object(session, 'kill', 'config.session.kill');
  validation.number(kill, 'acp_confirm_timeout_ms', 'config.session.kill.acp_confirm_timeout_ms');
  validation.number(kill, 'subagent_confirm_timeout_ms', 'config.session.kill.subagent_confirm_timeout_ms');
  validation.number(kill, 'confirm_poll_ms', 'config.session.kill.confirm_poll_ms', { allowZero: false });
  if (kill.cleanup_confirm_timeout_ms !== 'match_confirm_timeout') {
    validation.number(kill, 'cleanup_confirm_timeout_ms', 'config.session.kill.cleanup_confirm_timeout_ms');
  }
  validation.number(kill, 'acpx_timeout_ms', 'config.session.kill.acpx_timeout_ms');
  validation.string(kill.stop_message, 'config.session.kill.stop_message');
  const termination = validation.object(session, 'termination', 'config.session.termination');
  for (const field of ['grace_ms', 'max_grace_ms', 'cleanup_confirm_timeout_ms']) {
    validation.number(termination, field, `config.session.termination.${field}`);
  }
  for (const field of ['poll_ms', 'gateway_request_max_ms', 'gateway_operation_timeout_ms', 'acpx_timeout_ms']) {
    validation.number(termination, field, `config.session.termination.${field}`, { allowZero: false });
  }
}

function validateBuster(config: AnyRecord, validation: ConfigValidation) {
  const buster = validation.object(config, 'buster', 'config.buster');
  const runtime = validation.object(buster, 'runtime', 'config.buster.runtime');
  validation.string(runtime.task_stream, 'config.buster.runtime.task_stream');
  validation.string(runtime.heartbeat_path, 'config.buster.runtime.heartbeat_path');
  for (const field of [
    'heartbeat_interval_ms',
    'task_poll_interval_ms',
    'task_pending_reclaim_idle_ms',
    'completion_recovery_scan_interval_ms',
    'task_stream_max_len',
    'suite_timeout_ms',
  ]) {
    validation.number(runtime, field, `config.buster.runtime.${field}`, { allowZero: false });
  }
  validation.number(runtime, 'completion_event_block_ms', 'config.buster.runtime.completion_event_block_ms');
  validation.number(runtime, 'max_crash_retries', 'config.buster.runtime.max_crash_retries');
}

function validateReviewAndFeatures(config: AnyRecord, validation: ConfigValidation) {
  const alerts = validation.object(config, 'discord_alerts', 'config.discord_alerts');
  for (const level of ['info', 'warn', 'critical', 'ok']) validation.boolean(alerts[level], `config.discord_alerts.${level}`);
  const preCheck = validation.object(config, 'pre_check', 'config.pre_check');
  validation.boolean(preCheck.enabled, 'config.pre_check.enabled');
  for (const field of ['lint_report_path', 'lint_policy_path', 'lint_policy_project']) {
    validation.string(preCheck[field], `config.pre_check.${field}`);
  }
  validation.number(preCheck, 'timeout_seconds', 'config.pre_check.timeout_seconds', { allowZero: false });
  const review = validation.object(config, 'review_defaults', 'config.review_defaults');
  if (review.reviewers !== undefined) {
    validation.errors.push('config.review_defaults.reviewers: reviewer/model defaults belong in progress.json gates/defaults, not swarm.config.json');
  }
  validation.number(review, 'timeout_minutes', 'config.review_defaults.timeout_minutes', { allowZero: false });
  validation.number(review, 'max_fix_cycles', 'config.review_defaults.max_fix_cycles');
  validation.string(review.lint_tier, 'config.review_defaults.lint_tier');
  validation.boolean(review.lint_required, 'config.review_defaults.lint_required');
  const caseStudy = validation.object(config, 'case_study', 'config.case_study');
  validation.number(caseStudy, 'timeout_minutes', 'config.case_study.timeout_minutes', { allowZero: false });
  const arch = validation.object(config, 'arch_validation', 'config.arch_validation');
  validation.boolean(arch.enabled, 'config.arch_validation.enabled');
  validation.boolean(arch.agent_enabled, 'config.arch_validation.agent_enabled');
  validation.number(arch, 'timeout_minutes', 'config.arch_validation.timeout_minutes', { allowZero: false });
}

function validatePluginsAndMonitor(config: AnyRecord, validation: ConfigValidation) {
  const plugins = validation.object(config, 'plugins', 'config.plugins');
  validation.boolean(plugins.enabled, 'config.plugins.enabled');
  validation.boolean(plugins.allowCustomModules, 'config.plugins.allowCustomModules');
  if (!Array.isArray(plugins.extraModulePaths)) validation.errors.push('config.plugins.extraModulePaths: required array in swarm.config.json');
  for (const field of ['modules', 'stageOwners', 'restrictedCapabilityAllowlist']) {
    if (!plugins[field] || typeof plugins[field] !== 'object' || Array.isArray(plugins[field])) {
      validation.errors.push(`config.plugins.${field}: required object in swarm.config.json`);
      plugins[field] = {};
    }
  }
  const monitor = validation.object(config, 'acp_monitor', 'config.acp_monitor');
  for (const field of ['poll_limit', 'max_transcript_extensions', 'transcript_grace_ms', 'monitor_poll_ms']) {
    validation.number(monitor, field, `config.acp_monitor.${field}`);
  }
  const telemetry = validation.object(config, 'telemetry', 'config.telemetry');
  validation.boolean(telemetry.enabled, 'config.telemetry.enabled');
  validation.number(telemetry, 'stream_max_len', 'config.telemetry.stream_max_len', { allowZero: false });
  validation.number(telemetry, 'sink_timeout_ms', 'config.telemetry.sink_timeout_ms', { allowZero: false });
  if (telemetry.stream_key !== undefined) {
    validation.errors.push('config.telemetry stream_key: removed; use config.telemetry.enabled and canonical run-scoped stream names');
  }
}

export function validateServiceConfig(config: AnyRecord, validation: ConfigValidation) {
  validateGateway(config, validation);
  validateSession(config, validation);
  validateBuster(config, validation);
  validateReviewAndFeatures(config, validation);
  validatePluginsAndMonitor(config, validation);
}
