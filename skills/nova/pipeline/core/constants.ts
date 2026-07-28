// skills/common/plugin-runtime/core/constants.ts — Shared status and exit code constants

export const STATUS = {
  PENDING:           'PENDING',
  IN_PROGRESS:       'IN_PROGRESS',
  READY_FOR_TESTING: 'READY_FOR_TESTING',
  TESTING:           'TESTING',
  PASS:              'PASS',
  FAIL:              'FAIL',
  BLOCKED:           'BLOCKED',
  RATE_LIMITED:      'RATE_LIMITED',
};

export const EXIT_OK           = 0;
export const EXIT_ERROR        = 1;
export const EXIT_NEEDS_NOVA   = 10;
export const EXIT_BLOCKED      = 20;
export const EXIT_TIMEOUT      = 30;
export const EXIT_RATE_LIMITED = 40;

export const PLUGIN_CONTRACT_VERSION = 'pipeline-plugin-v1';
export const PLUGIN_CONFIG_SCHEMA_TYPE = 'json_schema';
export const PLUGIN_CONFIG_SCHEMA_VERSION = 'draft-07';
export const PLUGIN_CONFIG_SCHEMA_ANY_OBJECT = Object.freeze({
  schemaType: PLUGIN_CONFIG_SCHEMA_TYPE,
  schemaVersion: PLUGIN_CONFIG_SCHEMA_VERSION,
  schema: Object.freeze({
    type: 'object',
    additionalProperties: true,
  }),
  defaults: Object.freeze({}),
});

export const PLUGIN_KINDS = new Set([
  'worker',
  'gate',
  'validator',
  'generator',
  'notification',
  'telemetry',
]);

export const PLUGIN_ALLOWED_HOOK_FAMILIES = Object.freeze({
  worker: new Set(['worker.execute']),
  gate: new Set(['gate.execute']),
  validator: new Set(['validator.run']),
  generator: new Set(['generator.run']),
  notification: new Set([
    'pipeline.started',
    'pipeline.completed',
    'module.started',
    'module.completed',
    'gate.started',
    'gate.completed',
  ]),
  telemetry: new Set(['telemetry.sink']),
});

export const PLUGIN_HOOK_FAMILIES = new Set(Object.values(PLUGIN_ALLOWED_HOOK_FAMILIES).flatMap((families: any) => [...families]));

export const PLUGIN_SOURCE_TYPES = new Set(['builtin', 'local', 'external']);
export const PLUGIN_TRUST_TIERS = new Set(['trusted', 'restricted']);

export const PLUGIN_STAGE_IDS = Object.freeze({
  worker: new Set(['worker:module_forge', 'worker:module_buster']),
  gate: new Set(['gate:review', 'gate:approval', 'gate:buster']),
  validator: new Set(['validator:architecture', 'validator:delivery_lint', 'validator:pre_check', 'validator:full_lint']),
  generator: new Set(['generator:project_summary', 'generator:pipeline_review', 'generator:case_study']),
  notification: new Set([
    'pipeline.started',
    'pipeline.completed',
    'module.started',
    'module.completed',
    'gate.started',
    'gate.completed',
  ]),
  telemetry: new Set(['telemetry.sink']),
});

export const PLUGIN_REQUIRED_CAPABILITIES = Object.freeze({
  worker: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts', 'dispatch.worker_runtime'],
  gate: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts'],
  validator: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts'],
  generator: ['read.state', 'read.artifacts', 'emit.stream', 'write.artifacts'],
  notification: ['read.state', 'emit.stream'],
  telemetry: ['read.state', 'emit.stream'],
});

export const PLUGIN_OPTIONAL_CAPABILITIES = Object.freeze({
  worker: ['notify.operator', 'request.wait', 'request.signal'],
  gate: ['notify.operator', 'request.wait', 'request.signal'],
  validator: ['notify.operator'],
  generator: ['emit.telemetry', 'notify.operator'],
  notification: ['emit.telemetry', 'read.artifacts', 'write.artifacts', 'notify.operator'],
  telemetry: ['emit.telemetry', 'read.artifacts', 'write.artifacts', 'notify.operator'],
});

export const PLUGIN_FORBIDDEN_CAPABILITIES = Object.freeze({
  worker: [],
  gate: ['dispatch.worker_runtime'],
  validator: ['request.wait', 'request.signal', 'dispatch.worker_runtime'],
  generator: ['request.wait', 'request.signal', 'dispatch.worker_runtime'],
  notification: ['request.wait', 'request.signal', 'dispatch.worker_runtime'],
  telemetry: ['request.wait', 'request.signal', 'dispatch.worker_runtime'],
});

export const PLUGIN_REJECTION_CODES = Object.freeze({
  REGISTRY_MANIFEST_INVALID: 'REGISTRY_MANIFEST_INVALID',
  REGISTRY_CONTRACT_VERSION_UNSUPPORTED: 'REGISTRY_CONTRACT_VERSION_UNSUPPORTED',
  REGISTRY_KIND_HOOK_MISMATCH: 'REGISTRY_KIND_HOOK_MISMATCH',
  REGISTRY_STAGE_ID_INVALID: 'REGISTRY_STAGE_ID_INVALID',
  REGISTRY_CAPABILITY_DECLARATION_INVALID: 'REGISTRY_CAPABILITY_DECLARATION_INVALID',
  REGISTRY_CONFIG_SCHEMA_INVALID: 'REGISTRY_CONFIG_SCHEMA_INVALID',
  REGISTRY_IMPLEMENTATION_MISSING: 'REGISTRY_IMPLEMENTATION_MISSING',
  REGISTRY_DISCOVERY_PATH_FORBIDDEN: 'REGISTRY_DISCOVERY_PATH_FORBIDDEN',
  REGISTRY_MODULE_CONFIG_INVALID: 'REGISTRY_MODULE_CONFIG_INVALID',
  REGISTRY_TRUST_OVERRIDE_INVALID: 'REGISTRY_TRUST_OVERRIDE_INVALID',
  REGISTRY_STAGE_OWNER_UNRECOGNIZED: 'REGISTRY_STAGE_OWNER_UNRECOGNIZED',
  REGISTRY_STAGE_OWNER_DISABLED: 'REGISTRY_STAGE_OWNER_DISABLED',
  REGISTRY_STAGE_OWNER_MISSING: 'REGISTRY_STAGE_OWNER_MISSING',
  REGISTRY_STAGE_OWNER_CONFLICT: 'REGISTRY_STAGE_OWNER_CONFLICT',
  REGISTRY_GATE_TYPE_INVALID: 'REGISTRY_GATE_TYPE_INVALID',
  REGISTRY_GATE_TYPE_OWNER_MISSING: 'REGISTRY_GATE_TYPE_OWNER_MISSING',
  REGISTRY_GATE_TYPE_OWNER_CONFLICT: 'REGISTRY_GATE_TYPE_OWNER_CONFLICT',
});

export const PLUGIN_CAPABILITY_REJECTION_CODES = Object.freeze({
  CAPABILITY_UNSUPPORTED: 'CAPABILITY_UNSUPPORTED',
  CAPABILITY_REQUIRED_MISSING: 'CAPABILITY_REQUIRED_MISSING',
  CAPABILITY_FORBIDDEN_FOR_KIND: 'CAPABILITY_FORBIDDEN_FOR_KIND',
  CAPABILITY_FORBIDDEN_FOR_TRUST_TIER: 'CAPABILITY_FORBIDDEN_FOR_TRUST_TIER',
  CAPABILITY_RESTRICTED_NOT_ALLOWLISTED: 'CAPABILITY_RESTRICTED_NOT_ALLOWLISTED',
  CAPABILITY_CORE_ONLY: 'CAPABILITY_CORE_ONLY',
});
