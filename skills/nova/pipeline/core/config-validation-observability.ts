import { ConfigValidation, isPlainObject } from './config-validation-values.ts';
import type { AnyRecord } from './config-validation-values.ts';

function requiredObject(owner: AnyRecord, field: string, label: string, validation: ConfigValidation) {
  if (isPlainObject(owner[field])) return owner[field];
  validation.errors.push(`${label}: required object`);
  return {};
}

function validatePlugin(observability: AnyRecord, validation: ConfigValidation) {
  const plugin = requiredObject(observability, 'plugin', 'config.agent_observability.plugin', validation);
  validation.boolean(plugin.enabled, 'config.agent_observability.plugin.enabled');
  validation.number(plugin, 'max_queue_per_stream', 'config.agent_observability.plugin.max_queue_per_stream', { allowZero: false });
  const streams = requiredObject(observability, 'streams', 'config.agent_observability.streams', validation);
  validation.number(streams, 'stream_max_len', 'config.agent_observability plugin streams stream_max_len', { allowZero: false });
  validation.number(streams, 'dead_letter_max_len', 'config.agent_observability plugin streams dead_letter_max_len', { allowZero: false });
  const write = requiredObject(plugin, 'control_write', 'config.agent_observability.plugin.control_write', validation);
  validation.number(write, 'max_attempts', 'config.agent_observability.plugin.control_write.max_attempts', { allowZero: false });
  validation.number(write, 'retry_base_ms', 'config.agent_observability.plugin.control_write.retry_base_ms', { allowZero: false });
  validation.number(write, 'retry_max_ms', 'config.agent_observability.plugin.control_write.retry_max_ms', { allowZero: false });
  const hook = requiredObject(plugin, 'hook', 'config.agent_observability.plugin.hook', validation);
  validation.number(hook, 'priority', 'config.agent_observability plugin hook priority', { min: -Infinity });
  validation.number(hook, 'timeout_ms', 'config.agent_observability.plugin.hook.timeout_ms', { allowZero: false });
}

function validatePluginControl(observability: AnyRecord, validation: ConfigValidation) {
  const control = requiredObject(observability, 'plugin_control', 'config.agent_observability.plugin_control', validation);
  validation.boolean(control.enabled, 'config.agent_observability.plugin_control.enabled');
  validation.string(control.pluginId, 'config.agent_observability.plugin_control.pluginId');
  validation.string(control.command, 'config.agent_observability.plugin_control.command');
  validation.number(control, 'timeout_ms', 'config.agent_observability.plugin_control.timeout_ms', { allowZero: false });
}

function validateIngester(observability: AnyRecord, validation: ConfigValidation) {
  const ingester = requiredObject(observability, 'ingester', 'config.agent_observability.ingester', validation);
  validation.boolean(ingester.enabled, 'config.agent_observability.ingester.enabled');
  validation.string(ingester.groupName, 'config.agent_observability.ingester.groupName');
  validation.string(ingester.consumerName, 'config.agent_observability.ingester.consumerName');
  for (const field of ['read_block_ms', 'reclaim_idle_ms', 'redis_command_timeout_ms']) {
    validation.number(ingester, field, `config.agent_observability.ingester.${field}`, { allowZero: false });
  }
  const loop = requiredObject(ingester, 'loop', 'config.agent_observability.ingester.loop', validation);
  validation.number(loop, 'delay_ms', 'config.agent_observability.ingester.loop.delay_ms', { allowZero: false });
  validation.number(loop, 'health_check_every', 'config.agent_observability.ingester.loop.health_check_every');
  validation.number(loop, 'stop_timeout_ms', 'config.agent_observability.ingester.loop.stop_timeout_ms');
  const trim = requiredObject(ingester, 'trim', 'config.agent_observability.ingester.trim', validation);
  validation.number(trim, 'interval_ms', 'config.agent_observability.ingester.trim.interval_ms', { allowZero: false });
  validation.number(trim, 'payload_stream_max_len', 'config.agent_observability ingester trim payload_stream_max_len', { allowZero: false });
  const pressure = requiredObject(ingester, 'pressure', 'config.agent_observability.ingester.pressure', validation);
  validation.number(pressure, 'control_lag_degraded_threshold', 'config.agent_observability ingester pressure control_lag_degraded_threshold');
  validation.number(pressure, 'payload_pressure_degraded_threshold', 'config.agent_observability ingester pressure payload_pressure_degraded_threshold');
}

function validateBase(observability: AnyRecord, validation: ConfigValidation) {
  validation.boolean(observability.required, 'config.agent_observability.required');
  const payload = requiredObject(observability, 'payload', 'config.agent_observability.payload', validation);
  validation.number(payload, 'max_event_bytes', 'config.agent_observability.payload.max_event_bytes', { allowZero: false });
  const startup = requiredObject(observability, 'startup_evidence', 'config.agent_observability.startup_evidence', validation);
  validation.number(startup, 'timeout_ms', 'config.agent_observability.startup_evidence.timeout_ms');
  validation.number(startup, 'block_ms', 'config.agent_observability.startup_evidence.block_ms');
  const completion = requiredObject(observability, 'forge_completion', 'config.agent_observability.forge_completion', validation);
  validation.number(completion, 'xread_block_ms', 'config.agent_observability.forge_completion.xread_block_ms');
  validation.number(completion, 'settle_ms', 'config.agent_observability.forge_completion.settle_ms');
}

export function validateAgentObservability(config: AnyRecord, validation: ConfigValidation) {
  if (config.agent_observability === undefined) return;
  if (!isPlainObject(config.agent_observability)) {
    validation.errors.push('config.agent_observability: must be an object when provided');
    config.agent_observability = {};
    return;
  }
  const observability = config.agent_observability;
  validateBase(observability, validation);
  validatePlugin(observability, validation);
  validatePluginControl(observability, validation);
  validateIngester(observability, validation);
  if (observability.required === true && config.telemetry?.enabled !== true) {
    validation.errors.push('config.telemetry.enabled: must be true when config.agent_observability.required is true');
  }
}
