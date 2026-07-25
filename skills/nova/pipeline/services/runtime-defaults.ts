function requireNumber(section: any, field: any, label: any, { positive = false, integer = false }: any = {}) {
  const value = Number(section?.[field]);
  if (!Number.isFinite(value)) {
    throw new Error(`${label}.${field}: required number in swarm.config.json`);
  }
  if (integer && !Number.isInteger(value)) {
    throw new Error(`${label}.${field}: must be an integer`);
  }
  if (positive ? value <= 0 : value < 0) {
    throw new Error(`${label}.${field}: must be ${positive ? 'positive' : 'non-negative'}`);
  }
  return value;
}

function requireString(section: any, field: any, label: any) {
  const value = section?.[field];
  if (typeof value === 'string' && value.trim()) return value;
  throw new Error(`${label}.${field}: required non-empty string in swarm.config.json`);
}

function requireBoolean(section: any, field: any, label: any) {
  const value = section?.[field];
  if (typeof value === 'boolean') return value;
  throw new Error(`${label}.${field}: required boolean in swarm.config.json`);
}

function requireObjectSection(section: any, label: any) {
  if (section && typeof section === 'object' && !Array.isArray(section)) return section;
  throw new Error(`${label}: required object in swarm.config.json`);
}

export function getReviewDefaultsConfig(config: any = {}) {
  const section = requireObjectSection(config?.review_defaults, 'config.review_defaults');
  return {
    timeout_minutes: requireNumber(section, 'timeout_minutes', 'config.review_defaults', { positive: true }),
    max_fix_cycles: requireNumber(section, 'max_fix_cycles', 'config.review_defaults'),
    lint_tier: requireString(section, 'lint_tier', 'config.review_defaults'),
    lint_required: requireBoolean(section, 'lint_required', 'config.review_defaults'),
  };
}

export function getCaseStudyConfig(config: any = {}) {
  const section = requireObjectSection(config?.case_study, 'config.case_study');
  return {
    ...section,
    timeout_minutes: requireNumber(section, 'timeout_minutes', 'config.case_study', { positive: true }),
  };
}

export function getArchValidationConfig(config: any = {}) {
  const section = requireObjectSection(config?.arch_validation, 'config.arch_validation');
  return {
    ...section,
    enabled: requireBoolean(section, 'enabled', 'config.arch_validation'),
    agent_enabled: requireBoolean(section, 'agent_enabled', 'config.arch_validation'),
    timeout_minutes: requireNumber(section, 'timeout_minutes', 'config.arch_validation', { positive: true }),
  };
}

export function getBusterRuntimeConfig(config: any = {}) {
  const runtime = requireObjectSection(config?.buster?.runtime, 'config.buster.runtime');
  return {
    ...runtime,
    suite_timeout_ms: requireNumber(runtime, 'suite_timeout_ms', 'config.buster.runtime', { positive: true, integer: true }),
    max_crash_retries: requireNumber(runtime, 'max_crash_retries', 'config.buster.runtime', { integer: true }),
  };
}

export function getPipelineDefaultsConfig(config: any = {}) {
  const section = requireObjectSection(config?.pipeline_defaults, 'config.pipeline_defaults');
  return {
    timeout_minutes: requireNumber(section, 'timeout_minutes', 'config.pipeline_defaults', { positive: true }),
    max_fails: requireNumber(section, 'max_fails', 'config.pipeline_defaults', { integer: true }),
    auto_retry_threshold: requireNumber(section, 'auto_retry_threshold', 'config.pipeline_defaults', { integer: true }),
    agent_startup_retry_budget: requireNumber(section, 'agent_startup_retry_budget', 'config.pipeline_defaults', { integer: true }),
    session_nudge_threshold: requireNumber(section, 'session_nudge_threshold', 'config.pipeline_defaults'),
  };
}
