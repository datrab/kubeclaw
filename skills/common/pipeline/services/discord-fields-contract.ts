type UnknownRecord = Record<string, any>;

interface DiscordFieldSpec {
  name?: string;
  keys?: string[];
  inline?: boolean;
  format?: (value: unknown, identity: UnknownRecord) => string;
}

interface NormalizedDiscordFieldSpec {
  name: string;
  keys: string[];
  inline: boolean;
  format: (value: unknown, identity: UnknownRecord) => string;
}

function readIdentityValue(identity: UnknownRecord = {}, keys: string[] = []): unknown {
  for (const key of keys) {
    const value = identity?.[key];
    if (value != null && value !== '') return value;
  }
  return null;
}

function normalizeFieldSpec(spec: DiscordFieldSpec = {}): NormalizedDiscordFieldSpec {
  return {
    name: spec.name || 'Field',
    keys: Array.isArray(spec.keys) ? spec.keys : [],
    inline: spec.inline !== false,
    format: typeof spec.format === 'function' ? spec.format : ((value: unknown) => String(value)),
  };
}

export const DISCORD_FIELD_SPECS: Record<string, any> = Object.freeze({
  RUN_ID: Object.freeze({ name: 'Run ID', keys: ['runId', 'run_id'], inline: true }),
  MODULE_ID: Object.freeze({ name: 'Module', keys: ['moduleId', 'module_id'], inline: true }),
  GATE_ID: Object.freeze({ name: 'Gate', keys: ['gateId', 'gate_id'], inline: true }),
  GATE_TYPE: Object.freeze({ name: 'Gate Type', keys: ['gateType', 'gate_type'], inline: true }),
  STEP_TYPE: Object.freeze({ name: 'Step Type', keys: ['stepType', 'step_type'], inline: true }),
  STEP_ID: Object.freeze({ name: 'Step ID', keys: ['stepId', 'step_id'], inline: true }),
  PHASE: Object.freeze({ name: 'Phase', keys: ['phase'], inline: true }),
  PHASE_OR_AGENT_TYPE: Object.freeze({ name: 'Phase', keys: ['phase', 'agent_type'], inline: true }),
  ATTEMPT: Object.freeze({ name: 'Attempt', keys: ['attempt'], inline: true, format: (value: unknown) => `${value}` }),
  MODEL: Object.freeze({ name: 'Model', keys: ['model'], inline: true }),
  MODEL_SOURCE: Object.freeze({ name: 'Model Source', keys: ['modelSource', 'model_source'], inline: true }),
  REASONING_LEVEL: Object.freeze({
    name: 'Reasoning',
    keys: ['reasoningLevel', 'reasoning_level', 'thinking', 'thinking_level'],
    inline: true,
    format: (value: unknown, identity: UnknownRecord) => {
      const level = value == null || value === '' ? 'default' : String(value);
      const source = readIdentityValue(identity, ['reasoningSource', 'reasoning_source', 'thinkingSource', 'thinking_source']);
      return source ? `${level} (${source})` : level;
    },
  }),
  RUNTIME_KIND: Object.freeze({ name: 'Runtime', keys: ['runtime', 'runtimeKind', 'runtime_kind'], inline: true }),
  DISPATCH_ID: Object.freeze({ name: 'Dispatch', keys: ['dispatchId', 'dispatch_id'], inline: false }),
  GATEWAY_LABEL: Object.freeze({ name: 'Gateway Label', keys: ['gatewayLabel', 'gateway_label'], inline: false }),
  SESSION_KEY: Object.freeze({ name: 'Session', keys: ['sessionKey', 'session_key'], inline: false }),
});

export const DISCORD_IDENTITY_SURFACES: Record<string, any> = Object.freeze({
  LIFECYCLE: 'lifecycle',
  GATE_DISPATCH: 'gate_dispatch',
  GATE_SESSION: 'gate_session',
  APPROVAL_GATE: 'approval_gate',
  MODULE_SESSION: 'module_session',
  PIPELINE: 'pipeline',
  RATE_LIMIT_SESSION: 'rate_limit_session',
});

export const DISCORD_IDENTITY_FIELD_SETS: Record<string, readonly any[]> = Object.freeze({
  lifecycle: Object.freeze([
    DISCORD_FIELD_SPECS.RUN_ID,
    DISCORD_FIELD_SPECS.MODULE_ID,
    DISCORD_FIELD_SPECS.GATE_ID,
    DISCORD_FIELD_SPECS.GATE_TYPE,
    DISCORD_FIELD_SPECS.ATTEMPT,
    DISCORD_FIELD_SPECS.DISPATCH_ID,
    DISCORD_FIELD_SPECS.GATEWAY_LABEL,
    DISCORD_FIELD_SPECS.SESSION_KEY,
    DISCORD_FIELD_SPECS.MODEL,
    DISCORD_FIELD_SPECS.REASONING_LEVEL,
    DISCORD_FIELD_SPECS.RUNTIME_KIND,
  ]),
  gate_dispatch: Object.freeze([
    DISCORD_FIELD_SPECS.RUN_ID,
    DISCORD_FIELD_SPECS.GATE_ID,
    DISCORD_FIELD_SPECS.GATE_TYPE,
  ]),
  gate_session: Object.freeze([
    DISCORD_FIELD_SPECS.RUN_ID,
    DISCORD_FIELD_SPECS.GATE_ID,
    DISCORD_FIELD_SPECS.GATE_TYPE,
    DISCORD_FIELD_SPECS.ATTEMPT,
    DISCORD_FIELD_SPECS.DISPATCH_ID,
    DISCORD_FIELD_SPECS.GATEWAY_LABEL,
    DISCORD_FIELD_SPECS.SESSION_KEY,
    DISCORD_FIELD_SPECS.MODEL,
    DISCORD_FIELD_SPECS.REASONING_LEVEL,
    DISCORD_FIELD_SPECS.RUNTIME_KIND,
  ]),
  approval_gate: Object.freeze([
    DISCORD_FIELD_SPECS.RUN_ID,
    DISCORD_FIELD_SPECS.GATE_ID,
    DISCORD_FIELD_SPECS.GATE_TYPE,
  ]),
  module_session: Object.freeze([
    DISCORD_FIELD_SPECS.RUN_ID,
    DISCORD_FIELD_SPECS.MODULE_ID,
    DISCORD_FIELD_SPECS.ATTEMPT,
    DISCORD_FIELD_SPECS.DISPATCH_ID,
    DISCORD_FIELD_SPECS.GATEWAY_LABEL,
    DISCORD_FIELD_SPECS.SESSION_KEY,
    DISCORD_FIELD_SPECS.MODEL,
    DISCORD_FIELD_SPECS.REASONING_LEVEL,
    DISCORD_FIELD_SPECS.RUNTIME_KIND,
  ]),
  pipeline: Object.freeze([
    DISCORD_FIELD_SPECS.RUN_ID,
    DISCORD_FIELD_SPECS.MODULE_ID,
    DISCORD_FIELD_SPECS.GATE_ID,
    DISCORD_FIELD_SPECS.GATE_TYPE,
    DISCORD_FIELD_SPECS.STEP_TYPE,
    DISCORD_FIELD_SPECS.ATTEMPT,
    DISCORD_FIELD_SPECS.DISPATCH_ID,
    DISCORD_FIELD_SPECS.GATEWAY_LABEL,
    DISCORD_FIELD_SPECS.SESSION_KEY,
    DISCORD_FIELD_SPECS.MODEL,
    DISCORD_FIELD_SPECS.REASONING_LEVEL,
    DISCORD_FIELD_SPECS.RUNTIME_KIND,
  ]),
  rate_limit_session: Object.freeze([
    DISCORD_FIELD_SPECS.RUN_ID,
    DISCORD_FIELD_SPECS.MODULE_ID,
    DISCORD_FIELD_SPECS.GATE_ID,
    DISCORD_FIELD_SPECS.GATE_TYPE,
    DISCORD_FIELD_SPECS.PHASE_OR_AGENT_TYPE,
    DISCORD_FIELD_SPECS.ATTEMPT,
    DISCORD_FIELD_SPECS.DISPATCH_ID,
    DISCORD_FIELD_SPECS.GATEWAY_LABEL,
    DISCORD_FIELD_SPECS.SESSION_KEY,
    DISCORD_FIELD_SPECS.MODEL,
    DISCORD_FIELD_SPECS.REASONING_LEVEL,
    DISCORD_FIELD_SPECS.RUNTIME_KIND,
  ]),
});

export function buildDiscordIdentityFields(identity: UnknownRecord = {}, fieldSpecs: readonly DiscordFieldSpec[] = [], extra: UnknownRecord[] = []): UnknownRecord[] {
  const fields = fieldSpecs
    .map(normalizeFieldSpec)
    .flatMap((spec) => {
      const value = readIdentityValue(identity, spec.keys);
      if (value == null) return [];
      const field = {
        name: spec.name,
        value: spec.format(value, identity),
        inline: spec.inline,
      };
      return [field];
    });
  return [...fields, ...extra];
}

export function buildDiscordIdentitySurfaceFields(surface: string, identity: UnknownRecord = {}, extra: UnknownRecord[] = []): UnknownRecord[] {
  const fieldSpecs = DISCORD_IDENTITY_FIELD_SETS[surface];
  if (!fieldSpecs) throw new Error(`Unknown Discord identity surface '${surface || 'unknown'}'`);
  return buildDiscordIdentityFields(identity, fieldSpecs, extra);
}

export function buildSessionRateLimitDiscordFields(identity: UnknownRecord = {}, extra: UnknownRecord[] = []): UnknownRecord[] {
  return buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.RATE_LIMIT_SESSION || 'rate_limit_session', identity, extra);
}
