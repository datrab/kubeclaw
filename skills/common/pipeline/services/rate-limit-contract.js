function readIdentityValue(identity = {}, keys = []) {
  for (const key of keys) {
    const value = identity?.[key];
    if (value != null && value !== '') return value;
  }
  return null;
}

function normalizeFieldSpec(spec = {}) {
  return {
    name: spec.name,
    keys: Array.isArray(spec.keys) ? spec.keys : [],
    inline: spec.inline !== false,
    format: typeof spec.format === 'function' ? spec.format : ((value) => value),
  };
}

function truncateForDiscord(text, maxLength = 1024) {
  const value = String(text || '');
  return value.length <= maxLength
    ? value
    : `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function assignIfPresent(target, key, value) {
  if (value == null || value === '') return;
  target[key] = value;
}

export const DISCORD_FIELD_SPECS = Object.freeze({
  RUN_ID: Object.freeze({ name: 'Run ID', keys: ['runId', 'run_id'], inline: true }),
  MODULE_ID: Object.freeze({ name: 'Module', keys: ['moduleId', 'module_id'], inline: true }),
  GATE_ID: Object.freeze({ name: 'Gate', keys: ['gateId', 'gate_id'], inline: true }),
  GATE_TYPE: Object.freeze({ name: 'Gate Type', keys: ['gateType', 'gate_type'], inline: true }),
  STEP_TYPE: Object.freeze({ name: 'Step Type', keys: ['stepType', 'step_type'], inline: true }),
  STEP_ID: Object.freeze({ name: 'Step ID', keys: ['stepId', 'step_id'], inline: true }),
  PHASE: Object.freeze({ name: 'Phase', keys: ['phase'], inline: true }),
  PHASE_OR_AGENT_TYPE: Object.freeze({ name: 'Phase', keys: ['phase', 'agent_type'], inline: true }),
  ATTEMPT: Object.freeze({ name: 'Attempt', keys: ['attempt'], inline: true, format: (value) => `${value}` }),
  DISPATCH_ID: Object.freeze({ name: 'Dispatch', keys: ['dispatchId', 'dispatch_id'], inline: false }),
  GATEWAY_LABEL: Object.freeze({ name: 'Label', keys: ['gatewayLabel', 'gateway_label', 'label'], inline: false }),
  SESSION_KEY: Object.freeze({ name: 'Session', keys: ['sessionKey', 'session_key'], inline: false }),
});

export function buildDiscordIdentityFields(identity = {}, fieldSpecs = [], extra = []) {
  const fields = fieldSpecs
    .map(normalizeFieldSpec)
    .map((spec) => {
      const value = readIdentityValue(identity, spec.keys);
      if (value == null) return null;
      return {
        name: spec.name,
        value: spec.format(value, identity),
        inline: spec.inline,
      };
    })
    .filter(Boolean);
  return [...fields, ...extra];
}

export function buildSessionRateLimitDiscordFields(identity = {}, extra = []) {
  return buildDiscordIdentityFields(identity, [
    DISCORD_FIELD_SPECS.RUN_ID,
    DISCORD_FIELD_SPECS.MODULE_ID,
    DISCORD_FIELD_SPECS.GATE_ID,
    DISCORD_FIELD_SPECS.GATE_TYPE,
    DISCORD_FIELD_SPECS.PHASE_OR_AGENT_TYPE,
    DISCORD_FIELD_SPECS.ATTEMPT,
    DISCORD_FIELD_SPECS.DISPATCH_ID,
    DISCORD_FIELD_SPECS.GATEWAY_LABEL,
    DISCORD_FIELD_SPECS.SESSION_KEY,
  ], extra);
}

export function buildRateLimitDetectedPayload(identity = {}, {
  provider = 'anthropic',
  pauseCount = null,
  maxPauses = null,
  cooldownMs = null,
  resumeAt = null,
  retryAfterSeconds = null,
  detail = null,
} = {}) {
  const payload = {};
  assignIfPresent(payload, 'run_id', readIdentityValue(identity, ['runId', 'run_id']));
  assignIfPresent(payload, 'module_id', readIdentityValue(identity, ['moduleId', 'module_id']));
  assignIfPresent(payload, 'gate_id', readIdentityValue(identity, ['gateId', 'gate_id']));
  assignIfPresent(payload, 'gate_type', readIdentityValue(identity, ['gateType', 'gate_type']));
  assignIfPresent(payload, 'agent_type', readIdentityValue(identity, ['agentType', 'agent_type', 'phase']));
  assignIfPresent(payload, 'attempt', readIdentityValue(identity, ['attempt']));
  assignIfPresent(payload, 'dispatch_id', readIdentityValue(identity, ['dispatchId', 'dispatch_id']));
  assignIfPresent(payload, 'gateway_label', readIdentityValue(identity, ['gatewayLabel', 'gateway_label', 'label']));
  assignIfPresent(payload, 'session_key', readIdentityValue(identity, ['sessionKey', 'session_key']));
  assignIfPresent(payload, 'provider', provider);

  const resolvedCooldownMs = Number.isFinite(cooldownMs) ? Number(cooldownMs) : null;
  const resolvedRetryAfterSeconds = retryAfterSeconds ?? (resolvedCooldownMs == null ? null : Math.round(resolvedCooldownMs / 1000));
  if (resolvedRetryAfterSeconds != null) payload.retry_after_seconds = resolvedRetryAfterSeconds;
  if (resolvedCooldownMs != null) payload.cooldown_ms = resolvedCooldownMs;
  if (resumeAt) payload.resume_at = resumeAt;
  if (pauseCount != null) payload.pause_count = pauseCount;
  if (maxPauses != null) payload.max_pauses = maxPauses;
  assignIfPresent(payload, 'detail', detail);

  return payload;
}

export function formatRateLimitEmbed(context = {}, pauseCount, maxPauses, cooldownMs) {
  const resumeAt = new Date(Date.now() + cooldownMs);
  const cooldownHours = cooldownMs / (60 * 60 * 1000);
  const cooldownDisplay = cooldownHours >= 1
    ? `${cooldownHours}h`
    : `${Math.round(cooldownMs / 60000)}min`;

  const detail = context?.detail || '';
  let cause = /quota exceeded|usage limit/i.test(detail) ? 'Provider quota exceeded' : 'Provider rate limit';
  if (detail) cause = truncateForDiscord(`${cause} — ${detail}`, 200);

  return {
    title: `⏳ Rate Limited — Pause ${pauseCount}/${maxPauses}`,
    description: 'Pipeline paused — this does NOT consume a retry attempt.',
    fields: [
      { name: 'Cause', value: cause, inline: false },
      { name: 'Pause', value: `${pauseCount}/${maxPauses}`, inline: true },
      { name: 'Cooldown', value: cooldownDisplay, inline: true },
      { name: 'Resume at', value: resumeAt.toISOString(), inline: false },
    ],
  };
}

export function resolveRateLimitRecoveryAction({ sessionAlive = false, gatewayUnreachable = false } = {}) {
  return gatewayUnreachable === true || sessionAlive === true
    ? 'resume'
    : 'kill';
}
