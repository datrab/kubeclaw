import { validateSafePath } from './paths.ts';
import { agentConfigEntries, ConfigValidation, isPlainObject } from './config-validation-values.ts';
import type { AnyRecord } from './config-validation-values.ts';

const KNOWN_TOP_LEVEL_FIELDS = new Set([
  '_doc',
  'project', 'repo_root', 'projects_root', 'paths', 'agents', 'fallback_model', 'gates', 'run_id',
  'pipeline_defaults', 'acp_monitor', 'telemetry', 'case_study', 'pipeline_review', 'arch_validation',
  'agent_observability', 'plugins', 'discord_alerts', 'pre_check', 'review_defaults', 'buster',
  'gateway', 'session', 'polling', 'locks', 'git', 'redis_completion', 'event_adapters', 'discord',
  'discord_webhook_url', 'rate_limit', 'budget', 'models', 'control', '_testOverrides',
  '_runId', '_validationErrors', '_runStats', 'pluginRegistry',
]);

function validateCaseStudy(config: AnyRecord, validation: ConfigValidation) {
  const caseStudy = config.case_study;
  if (caseStudy?.enabled !== undefined && typeof caseStudy.enabled !== 'boolean') {
    validation.errors.push('config.case_study.enabled: must be a boolean');
  }
  if (caseStudy?.model !== undefined && typeof caseStudy.model !== 'string') {
    validation.errors.push('config.case_study.model: must be a string');
  }
  if (caseStudy?.output_file !== undefined && typeof caseStudy.output_file !== 'string') {
    validation.errors.push('config.case_study.output_file: must be a string');
  }
}

function validateControl(config: AnyRecord, validation: ConfigValidation) {
  if (!isPlainObject(config.control)) {
    validation.errors.push('config.control: required object');
    return;
  }
  validation.boolean(config.control.enabled, 'config.control.enabled');
  if (!Array.isArray(config.control.capabilities) || config.control.capabilities.length === 0) {
    validation.errors.push('config.control.capabilities: required non-empty array');
    return;
  }
  config.control.capabilities.forEach((capability: any, index: number) => {
    validation.string(capability, `config.control.capabilities.${index}`);
  });
}

function validateAgentPaths(config: AnyRecord, validation: ConfigValidation) {
  for (const [name, agentConf] of agentConfigEntries(config)) {
    if (!agentConf?.redis_js_path) continue;
    try {
      validateSafePath(agentConf.redis_js_path, `config.agents.${name}.redis_js_path`);
    } catch (error: any) {
      validation.errors.push(error.message);
    }
  }
}

export function validateConfigBoundary(config: AnyRecord, validation: ConfigValidation) {
  if (Object.prototype.hasOwnProperty.call(config, '_testOverrides')) {
    validation.errors.push('config._testOverrides: forbidden in runtime config; inject verification fakes through explicit harness options');
  }
  validateCaseStudy(config, validation);
  validateControl(config, validation);
  validation.string(config.projects_root, 'config.projects_root');
  for (const key of Object.keys(config)) {
    if (!KNOWN_TOP_LEVEL_FIELDS.has(key)) validation.errors.push(`config.${key}: unknown top-level config field`);
  }
  validateAgentPaths(config, validation);
}
