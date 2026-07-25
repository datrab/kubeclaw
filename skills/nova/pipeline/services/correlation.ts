import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// services/correlation.js — canonical correlation authority + provenance helpers

function canonicalRef(prefix: any, value: any) {
  if (selectTruthyValue(() => (value == null), () => (value === ''))) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.startsWith(`${prefix}:`) ? normalized : `${prefix}:${normalized}`;
}

function coalesce(...values: any) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function normalizeResolvedValue(value: any) {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return null;
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized === '' ? null : normalized;
  }
  return value;
}

function resolveFieldWithProvenance(input: any, resolvers: any) {
  for (const resolver of resolvers) {
    const value = normalizeResolvedValue(resolver.get(input));
    if (value !== null) {
      return {
        value,
        source: {
          family: resolver.family,
          path: resolver.path,
          via: resolver.via,
        },
      };
    }
  }

  return { value: null, source: null };
}

function finalizeCorrelationBundle(fieldRecords: any) {
  const bundle: any = {};
  const provenance: any = {};
  const families: any[] = [];

  for (const [field, record] of Object.entries<any>(fieldRecords)) {
    bundle[field] = record.value;
    provenance[field] = record.source;
    if (record.source?.family) families.push(record.source.family);
  }

  const sourceFamilies = [...new Set(families)];
  return {
    ...bundle,
    provenance,
    source_family: sourceFamilies.length === 0 ? null : (sourceFamilies.length === 1 ? sourceFamilies[0] : 'mixed'),
    source_families: sourceFamilies,
  };
}

const STATUS_SESSION_KEY_RESOLVERS = [
  { family: 'status', path: 'status.session_key', via: 'session_key', get: (status: any) => status?.session_key },
];

const STATUS_DISPATCH_ID_RESOLVERS = [
  { family: 'status', path: 'status.dispatch_id', via: 'dispatch_id', get: (status: any) => status?.dispatch_id },
];

const STATUS_GATEWAY_LABEL_RESOLVERS = [
  { family: 'status', path: 'status.gateway_label', via: 'gateway_label', get: (status: any) => status?.gateway_label },
];

const STATUS_PROVENANCE_SESSION_KEY_RESOLVERS = [
  ...STATUS_SESSION_KEY_RESOLVERS,
  { family: 'status.active_agent', path: 'status.active_agent.session_key', via: 'session_key', get: (status: any) => status?.active_agent?.session_key },
];

const STATUS_PROVENANCE_DISPATCH_ID_RESOLVERS = [
  ...STATUS_DISPATCH_ID_RESOLVERS,
  { family: 'status.active_agent', path: 'status.active_agent.dispatch_id', via: 'dispatch_id', get: (status: any) => status?.active_agent?.dispatch_id },
];

const STATUS_PROVENANCE_GATEWAY_LABEL_RESOLVERS = [
  ...STATUS_GATEWAY_LABEL_RESOLVERS,
  { family: 'status.active_agent', path: 'status.active_agent.gateway_label', via: 'gateway_label', get: (status: any) => status?.active_agent?.gateway_label },
];

const RESULT_SESSION_KEY_RESOLVERS = [
  { family: 'result', path: 'result.session_key', via: 'session_key', get: (result: any) => result?.session_key },
  { family: 'rate_limit_status', path: 'result.rate_limit_status.session_key', via: 'session_key', get: (result: any) => result?.rate_limit_status?.session_key },
];

const RESULT_READ_MODEL_SESSION_KEY_RESOLVERS = [
  { family: 'status', path: 'result.status.session_key', via: 'session_key', get: (result: any) => result?.status?.session_key },
  { family: 'status.active_agent', path: 'result.status.active_agent.session_key', via: 'session_key', get: (result: any) => result?.status?.active_agent?.session_key },
  { family: 'module_status', path: 'result.module_status.session_key', via: 'session_key', get: (result: any) => result?.module_status?.session_key },
  { family: 'module_status.active_agent', path: 'result.module_status.active_agent.session_key', via: 'session_key', get: (result: any) => result?.module_status?.active_agent?.session_key },
];

const RESULT_DISPATCH_ID_RESOLVERS = [
  { family: 'result', path: 'result.dispatch_id', via: 'dispatch_id', get: (result: any) => result?.dispatch_id },
  { family: 'rate_limit_status', path: 'result.rate_limit_status.dispatch_id', via: 'dispatch_id', get: (result: any) => result?.rate_limit_status?.dispatch_id },
];

const RESULT_READ_MODEL_DISPATCH_ID_RESOLVERS = [
  { family: 'status', path: 'result.status.dispatch_id', via: 'dispatch_id', get: (result: any) => result?.status?.dispatch_id },
  { family: 'status.active_agent', path: 'result.status.active_agent.dispatch_id', via: 'dispatch_id', get: (result: any) => result?.status?.active_agent?.dispatch_id },
  { family: 'module_status', path: 'result.module_status.dispatch_id', via: 'dispatch_id', get: (result: any) => result?.module_status?.dispatch_id },
  { family: 'module_status.active_agent', path: 'result.module_status.active_agent.dispatch_id', via: 'dispatch_id', get: (result: any) => result?.module_status?.active_agent?.dispatch_id },
];

const RESULT_ATTEMPT_RESOLVERS = [
  { family: 'result', path: 'result.attempt', via: 'attempt', get: (result: any) => result?.attempt },
  { family: 'rate_limit_status', path: 'result.rate_limit_status.attempt', via: 'attempt', get: (result: any) => result?.rate_limit_status?.attempt },
];

const RESULT_READ_MODEL_ATTEMPT_RESOLVERS = [
  { family: 'status', path: 'result.status.attempt', via: 'attempt', get: (result: any) => result?.status?.attempt },
  { family: 'status.active_agent', path: 'result.status.active_agent.attempt', via: 'attempt', get: (result: any) => result?.status?.active_agent?.attempt },
  { family: 'module_status', path: 'result.module_status.attempt', via: 'attempt', get: (result: any) => result?.module_status?.attempt },
  { family: 'module_status.active_agent', path: 'result.module_status.active_agent.attempt', via: 'attempt', get: (result: any) => result?.module_status?.active_agent?.attempt },
];

const RESULT_READ_MODEL_ATTEMPT_PROVENANCE_RESOLVERS = [
  ...RESULT_READ_MODEL_ATTEMPT_RESOLVERS,
  { family: 'result', path: 'result.blockedFailCount', via: 'blockedFailCount', get: (result: any) => result?.blockedFailCount },
  { family: 'module_status', path: 'result.module_status.blockedFailCount', via: 'blockedFailCount', get: (result: any) => result?.module_status?.blockedFailCount },
  { family: 'result', path: 'result.fail_count', via: 'fail_count', get: (result: any) => result?.fail_count },
  { family: 'status', path: 'result.status.fail_count', via: 'fail_count', get: (result: any) => result?.status?.fail_count },
  { family: 'module_status', path: 'result.module_status.fail_count', via: 'fail_count', get: (result: any) => result?.module_status?.fail_count },
];

const RESULT_GATEWAY_LABEL_RESOLVERS = [
  { family: 'result', path: 'result.gateway_label', via: 'gateway_label', get: (result: any) => result?.gateway_label },
  { family: 'rate_limit_status', path: 'result.rate_limit_status.gateway_label', via: 'gateway_label', get: (result: any) => result?.rate_limit_status?.gateway_label },
];

const RESULT_READ_MODEL_GATEWAY_LABEL_RESOLVERS = [
  { family: 'status', path: 'result.status.gateway_label', via: 'gateway_label', get: (result: any) => result?.status?.gateway_label },
  { family: 'status.active_agent', path: 'result.status.active_agent.gateway_label', via: 'gateway_label', get: (result: any) => result?.status?.active_agent?.gateway_label },
  { family: 'module_status', path: 'result.module_status.gateway_label', via: 'gateway_label', get: (result: any) => result?.module_status?.gateway_label },
  { family: 'module_status.active_agent', path: 'result.module_status.active_agent.gateway_label', via: 'gateway_label', get: (result: any) => result?.module_status?.active_agent?.gateway_label },
];

const RESULT_GATE_TYPE_RESOLVERS = [
  { family: 'result', path: 'result.gate_type', via: 'gate_type', get: (result: any) => result?.gate_type },
  { family: 'rate_limit_status', path: 'result.rate_limit_status.gate_type', via: 'gate_type', get: (result: any) => result?.rate_limit_status?.gate_type },
];

const RESULT_READ_MODEL_GATE_TYPE_RESOLVERS = [
  { family: 'status', path: 'result.status.gate_type', via: 'gate_type', get: (result: any) => result?.status?.gate_type },
  { family: 'module_status', path: 'result.module_status.gate_type', via: 'gate_type', get: (result: any) => result?.module_status?.gate_type },
];

function resolveStatusCorrelation(status: any) {
  return finalizeCorrelationBundle({
    dispatch_id: resolveFieldWithProvenance(status, STATUS_DISPATCH_ID_RESOLVERS),
    gateway_label: resolveFieldWithProvenance(status, STATUS_GATEWAY_LABEL_RESOLVERS),
    session_key: resolveFieldWithProvenance(status, STATUS_SESSION_KEY_RESOLVERS),
  });
}

export function resolveStatusCorrelationProvenance(status: any) {
  return finalizeCorrelationBundle({
    dispatch_id: resolveFieldWithProvenance(status, STATUS_PROVENANCE_DISPATCH_ID_RESOLVERS),
    gateway_label: resolveFieldWithProvenance(status, STATUS_PROVENANCE_GATEWAY_LABEL_RESOLVERS),
    session_key: resolveFieldWithProvenance(status, STATUS_PROVENANCE_SESSION_KEY_RESOLVERS),
  });
}

export function resolveResultCorrelation(result: any) {
  return finalizeCorrelationBundle({
    attempt: resolveFieldWithProvenance(result, RESULT_ATTEMPT_RESOLVERS),
    dispatch_id: resolveFieldWithProvenance(result, RESULT_DISPATCH_ID_RESOLVERS),
    gateway_label: resolveFieldWithProvenance(result, RESULT_GATEWAY_LABEL_RESOLVERS),
    session_key: resolveFieldWithProvenance(result, RESULT_SESSION_KEY_RESOLVERS),
    gate_type: resolveFieldWithProvenance(result, RESULT_GATE_TYPE_RESOLVERS),
  });
}

function resolveResultReadModelCorrelation(result: any) {
  return finalizeCorrelationBundle({
    attempt: resolveFieldWithProvenance(result, RESULT_READ_MODEL_ATTEMPT_RESOLVERS),
    dispatch_id: resolveFieldWithProvenance(result, RESULT_READ_MODEL_DISPATCH_ID_RESOLVERS),
    gateway_label: resolveFieldWithProvenance(result, RESULT_READ_MODEL_GATEWAY_LABEL_RESOLVERS),
    session_key: resolveFieldWithProvenance(result, RESULT_READ_MODEL_SESSION_KEY_RESOLVERS),
    gate_type: resolveFieldWithProvenance(result, RESULT_READ_MODEL_GATE_TYPE_RESOLVERS),
  });
}

export function resolveResultReadModelCorrelationProvenance(result: any) {
  return finalizeCorrelationBundle({
    attempt: resolveFieldWithProvenance(result, RESULT_READ_MODEL_ATTEMPT_PROVENANCE_RESOLVERS),
    dispatch_id: resolveFieldWithProvenance(result, RESULT_READ_MODEL_DISPATCH_ID_RESOLVERS),
    gateway_label: resolveFieldWithProvenance(result, RESULT_READ_MODEL_GATEWAY_LABEL_RESOLVERS),
    session_key: resolveFieldWithProvenance(result, RESULT_READ_MODEL_SESSION_KEY_RESOLVERS),
    gate_type: resolveFieldWithProvenance(result, RESULT_READ_MODEL_GATE_TYPE_RESOLVERS),
  });
}

export function resolveStatusSessionKey(status: any) {
  return resolveStatusCorrelation(status).session_key;
}

export function resolveStatusDispatchId(status: any) {
  return resolveStatusCorrelation(status).dispatch_id;
}

export function resolveStatusGatewayLabel(status: any) {
  return resolveStatusCorrelation(status).gateway_label;
}

export function resolveResultSessionKey(result: any) {
  return resolveResultCorrelation(result).session_key;
}

export function resolveResultDispatchId(result: any) {
  return resolveResultCorrelation(result).dispatch_id;
}

export function resolveResultAttempt(result: any) {
  return resolveResultCorrelation(result).attempt;
}

export function resolveResultGatewayLabel(result: any) {
  return resolveResultCorrelation(result).gateway_label;
}

function resolveResultGateType(result: any) {
  return resolveResultCorrelation(result).gate_type;
}

function selectInvocationPrimaryRef(refs: any, hookFamily: any, stageId: any, runId: any) {
  const candidates = hookFamily === 'gate.execute'
    ? [refs.gateRef]
    : hookFamily === 'worker.execute'
      ? [refs.dispatchRef]
      : [refs.moduleRef, refs.gateRef, refs.dispatchRef, refs.waitRef];
  const selected = candidates.find(Boolean);
  return selected ?? canonicalRef('stage', selectTruthyValue(() => (stageId), () => (`${selectTruthyValue(() => (hookFamily), () => ('missing_hook_family'))}:${selectTruthyValue(() => (runId), () => ('missing_run_id'))}`)));
}

function buildInvocationRefs({ config = {}, hookFamily = null, stageId = null, invocation = {} }: any = {}) {
  const runId = coalesce(invocation.runId, config?._runId, config?.run_id);
  const runRef = canonicalRef('run', coalesce(invocation.runRef, runId));
  const moduleRef = canonicalRef('module', coalesce(invocation.moduleRef, invocation.moduleId));
  const gateRef = canonicalRef('gate', coalesce(invocation.gateRef, invocation.gateId));
  const dispatchRef = canonicalRef('dispatch', coalesce(invocation.dispatchRef, invocation.dispatchId));
  const waitRef = canonicalRef('wait', invocation.waitRef);
  const signalRef = canonicalRef('signal', invocation.signalRef);
  const causationRef = canonicalRef('event', invocation.causationRef);
  const sessionRef = canonicalRef('session', coalesce(invocation.sessionRef, invocation.sessionKey));
  const stageRef = canonicalRef('stage', coalesce(invocation.stageRef, stageId));

  const primaryRef = canonicalRef('ref', invocation.primaryRef) ?? selectInvocationPrimaryRef(
    { moduleRef, gateRef, dispatchRef, waitRef }, hookFamily, stageId, runId,
  );

  return {
    primary_ref: primaryRef,
    run_ref: runRef,
    stage_ref: stageRef,
    module_ref: moduleRef,
    gate_ref: gateRef,
    dispatch_ref: dispatchRef,
    wait_ref: waitRef,
    signal_ref: signalRef,
    causation_ref: causationRef,
    session_ref: sessionRef,
  };
}

function buildInvocationIds({ config = {}, hookFamily = null, stageId = null, invocation = {} }: any = {}) {
  return {
    run_id: coalesce(invocation.runId, config?._runId, config?.run_id),
    module_id: coalesce(invocation.moduleId, invocation.module_id),
    gate_id: coalesce(invocation.gateId, invocation.gate_id),
    stage_id: selectTruthyValue(() => (stageId), () => (null)),
    hook_family: selectTruthyValue(() => (hookFamily), () => (null)),
    attempt: selectDefinedValue(() => (invocation.attempt), () => (null)),
    dispatch_id: coalesce(invocation.dispatchId, invocation.dispatch_id),
    session_key: coalesce(invocation.sessionKey, invocation.session_key),
    gateway_label: coalesce(invocation.gatewayLabel, invocation.gateway_label),
  };
}

function buildInvocationCorrelation({ config = {}, hookFamily = null, stageId = null, invocation = {} }: any = {}) {
  const refs = buildInvocationRefs({ config, hookFamily, stageId, invocation });
  const ids = buildInvocationIds({ config, hookFamily, stageId, invocation });
  return {
    runId: ids.run_id,
    primaryRef: refs.primary_ref,
    ...(refs.causation_ref ? { causationRef: refs.causation_ref } : {}),
    ...(ids.dispatch_id ? { dispatchId: ids.dispatch_id } : {}),
    ...(refs.wait_ref ? { waitRef: refs.wait_ref } : {}),
  };
}

export function buildInvocationSnapshot({ config = {}, hookFamily = null, stageId = null, invocation = {} }: any = {}) {
  return {
    refs: buildInvocationRefs({ config, hookFamily, stageId, invocation }),
    ids: buildInvocationIds({ config, hookFamily, stageId, invocation }),
    correlation: buildInvocationCorrelation({ config, hookFamily, stageId, invocation }),
  };
}
