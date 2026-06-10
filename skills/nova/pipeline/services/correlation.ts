// services/correlation.js — canonical correlation authority + provenance helpers

function canonicalRef(prefix, value) {
  if (value == null || value === '') return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.startsWith(`${prefix}:`) ? normalized : `${prefix}:${normalized}`;
}

function coalesce(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function normalizeResolvedValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized === '' ? null : normalized;
  }
  return value;
}

function resolveFieldWithProvenance(input, resolvers) {
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

function finalizeCorrelationBundle(fieldRecords) {
  const bundle = {};
  const provenance = {};
  const families = [];

  for (const [field, record] of Object.entries(fieldRecords)) {
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
  { family: 'status', path: 'status.session_key', via: 'session_key', get: (status) => status?.session_key },
];

const STATUS_DISPATCH_ID_RESOLVERS = [
  { family: 'status', path: 'status.dispatch_id', via: 'dispatch_id', get: (status) => status?.dispatch_id },
];

const STATUS_GATEWAY_LABEL_RESOLVERS = [
  { family: 'status', path: 'status.gateway_label', via: 'gateway_label', get: (status) => status?.gateway_label },
];

const STATUS_PROVENANCE_SESSION_KEY_RESOLVERS = [
  ...STATUS_SESSION_KEY_RESOLVERS,
  { family: 'status.active_agent', path: 'status.active_agent.session_key', via: 'session_key', get: (status) => status?.active_agent?.session_key },
];

const STATUS_PROVENANCE_DISPATCH_ID_RESOLVERS = [
  ...STATUS_DISPATCH_ID_RESOLVERS,
  { family: 'status.active_agent', path: 'status.active_agent.dispatch_id', via: 'dispatch_id', get: (status) => status?.active_agent?.dispatch_id },
];

const STATUS_PROVENANCE_GATEWAY_LABEL_RESOLVERS = [
  ...STATUS_GATEWAY_LABEL_RESOLVERS,
  { family: 'status.active_agent', path: 'status.active_agent.gateway_label', via: 'gateway_label', get: (status) => status?.active_agent?.gateway_label },
];

const RESULT_SESSION_KEY_RESOLVERS = [
  { family: 'result', path: 'result.session_key', via: 'session_key', get: (result) => result?.session_key },
  { family: 'rate_limit_status', path: 'result.rate_limit_status.session_key', via: 'session_key', get: (result) => result?.rate_limit_status?.session_key },
];

const RESULT_READ_MODEL_SESSION_KEY_RESOLVERS = [
  { family: 'status', path: 'result.status.session_key', via: 'session_key', get: (result) => result?.status?.session_key },
  { family: 'status.active_agent', path: 'result.status.active_agent.session_key', via: 'session_key', get: (result) => result?.status?.active_agent?.session_key },
  { family: 'module_status', path: 'result.module_status.session_key', via: 'session_key', get: (result) => result?.module_status?.session_key },
  { family: 'module_status.active_agent', path: 'result.module_status.active_agent.session_key', via: 'session_key', get: (result) => result?.module_status?.active_agent?.session_key },
];

const RESULT_DISPATCH_ID_RESOLVERS = [
  { family: 'result', path: 'result.dispatch_id', via: 'dispatch_id', get: (result) => result?.dispatch_id },
  { family: 'rate_limit_status', path: 'result.rate_limit_status.dispatch_id', via: 'dispatch_id', get: (result) => result?.rate_limit_status?.dispatch_id },
];

const RESULT_READ_MODEL_DISPATCH_ID_RESOLVERS = [
  { family: 'status', path: 'result.status.dispatch_id', via: 'dispatch_id', get: (result) => result?.status?.dispatch_id },
  { family: 'status.active_agent', path: 'result.status.active_agent.dispatch_id', via: 'dispatch_id', get: (result) => result?.status?.active_agent?.dispatch_id },
  { family: 'module_status', path: 'result.module_status.dispatch_id', via: 'dispatch_id', get: (result) => result?.module_status?.dispatch_id },
  { family: 'module_status.active_agent', path: 'result.module_status.active_agent.dispatch_id', via: 'dispatch_id', get: (result) => result?.module_status?.active_agent?.dispatch_id },
];

const RESULT_ATTEMPT_RESOLVERS = [
  { family: 'result', path: 'result.attempt', via: 'attempt', get: (result) => result?.attempt },
  { family: 'rate_limit_status', path: 'result.rate_limit_status.attempt', via: 'attempt', get: (result) => result?.rate_limit_status?.attempt },
];

const RESULT_READ_MODEL_ATTEMPT_RESOLVERS = [
  { family: 'status', path: 'result.status.attempt', via: 'attempt', get: (result) => result?.status?.attempt },
  { family: 'status.active_agent', path: 'result.status.active_agent.attempt', via: 'attempt', get: (result) => result?.status?.active_agent?.attempt },
  { family: 'module_status', path: 'result.module_status.attempt', via: 'attempt', get: (result) => result?.module_status?.attempt },
  { family: 'module_status.active_agent', path: 'result.module_status.active_agent.attempt', via: 'attempt', get: (result) => result?.module_status?.active_agent?.attempt },
];

const RESULT_READ_MODEL_ATTEMPT_PROVENANCE_RESOLVERS = [
  ...RESULT_READ_MODEL_ATTEMPT_RESOLVERS,
  { family: 'result', path: 'result.blockedFailCount', via: 'blockedFailCount', get: (result) => result?.blockedFailCount },
  { family: 'module_status', path: 'result.module_status.blockedFailCount', via: 'blockedFailCount', get: (result) => result?.module_status?.blockedFailCount },
  { family: 'result', path: 'result.fail_count', via: 'fail_count', get: (result) => result?.fail_count },
  { family: 'status', path: 'result.status.fail_count', via: 'fail_count', get: (result) => result?.status?.fail_count },
  { family: 'module_status', path: 'result.module_status.fail_count', via: 'fail_count', get: (result) => result?.module_status?.fail_count },
];

const RESULT_GATEWAY_LABEL_RESOLVERS = [
  { family: 'result', path: 'result.gateway_label', via: 'gateway_label', get: (result) => result?.gateway_label },
  { family: 'rate_limit_status', path: 'result.rate_limit_status.gateway_label', via: 'gateway_label', get: (result) => result?.rate_limit_status?.gateway_label },
];

const RESULT_READ_MODEL_GATEWAY_LABEL_RESOLVERS = [
  { family: 'status', path: 'result.status.gateway_label', via: 'gateway_label', get: (result) => result?.status?.gateway_label },
  { family: 'status.active_agent', path: 'result.status.active_agent.gateway_label', via: 'gateway_label', get: (result) => result?.status?.active_agent?.gateway_label },
  { family: 'module_status', path: 'result.module_status.gateway_label', via: 'gateway_label', get: (result) => result?.module_status?.gateway_label },
  { family: 'module_status.active_agent', path: 'result.module_status.active_agent.gateway_label', via: 'gateway_label', get: (result) => result?.module_status?.active_agent?.gateway_label },
];

const RESULT_GATE_TYPE_RESOLVERS = [
  { family: 'result', path: 'result.gate_type', via: 'gate_type', get: (result) => result?.gate_type },
  { family: 'rate_limit_status', path: 'result.rate_limit_status.gate_type', via: 'gate_type', get: (result) => result?.rate_limit_status?.gate_type },
];

const RESULT_READ_MODEL_GATE_TYPE_RESOLVERS = [
  { family: 'status', path: 'result.status.gate_type', via: 'gate_type', get: (result) => result?.status?.gate_type },
  { family: 'module_status', path: 'result.module_status.gate_type', via: 'gate_type', get: (result) => result?.module_status?.gate_type },
];

export function resolveStatusCorrelation(status) {
  return finalizeCorrelationBundle({
    dispatch_id: resolveFieldWithProvenance(status, STATUS_DISPATCH_ID_RESOLVERS),
    gateway_label: resolveFieldWithProvenance(status, STATUS_GATEWAY_LABEL_RESOLVERS),
    session_key: resolveFieldWithProvenance(status, STATUS_SESSION_KEY_RESOLVERS),
  });
}

export function resolveStatusCorrelationProvenance(status) {
  return finalizeCorrelationBundle({
    dispatch_id: resolveFieldWithProvenance(status, STATUS_PROVENANCE_DISPATCH_ID_RESOLVERS),
    gateway_label: resolveFieldWithProvenance(status, STATUS_PROVENANCE_GATEWAY_LABEL_RESOLVERS),
    session_key: resolveFieldWithProvenance(status, STATUS_PROVENANCE_SESSION_KEY_RESOLVERS),
  });
}

export function resolveResultCorrelation(result) {
  return finalizeCorrelationBundle({
    attempt: resolveFieldWithProvenance(result, RESULT_ATTEMPT_RESOLVERS),
    dispatch_id: resolveFieldWithProvenance(result, RESULT_DISPATCH_ID_RESOLVERS),
    gateway_label: resolveFieldWithProvenance(result, RESULT_GATEWAY_LABEL_RESOLVERS),
    session_key: resolveFieldWithProvenance(result, RESULT_SESSION_KEY_RESOLVERS),
    gate_type: resolveFieldWithProvenance(result, RESULT_GATE_TYPE_RESOLVERS),
  });
}

export function resolveResultReadModelCorrelation(result) {
  return finalizeCorrelationBundle({
    attempt: resolveFieldWithProvenance(result, RESULT_READ_MODEL_ATTEMPT_RESOLVERS),
    dispatch_id: resolveFieldWithProvenance(result, RESULT_READ_MODEL_DISPATCH_ID_RESOLVERS),
    gateway_label: resolveFieldWithProvenance(result, RESULT_READ_MODEL_GATEWAY_LABEL_RESOLVERS),
    session_key: resolveFieldWithProvenance(result, RESULT_READ_MODEL_SESSION_KEY_RESOLVERS),
    gate_type: resolveFieldWithProvenance(result, RESULT_READ_MODEL_GATE_TYPE_RESOLVERS),
  });
}

export function resolveResultReadModelCorrelationProvenance(result) {
  return finalizeCorrelationBundle({
    attempt: resolveFieldWithProvenance(result, RESULT_READ_MODEL_ATTEMPT_PROVENANCE_RESOLVERS),
    dispatch_id: resolveFieldWithProvenance(result, RESULT_READ_MODEL_DISPATCH_ID_RESOLVERS),
    gateway_label: resolveFieldWithProvenance(result, RESULT_READ_MODEL_GATEWAY_LABEL_RESOLVERS),
    session_key: resolveFieldWithProvenance(result, RESULT_READ_MODEL_SESSION_KEY_RESOLVERS),
    gate_type: resolveFieldWithProvenance(result, RESULT_READ_MODEL_GATE_TYPE_RESOLVERS),
  });
}

export function resolveStatusSessionKey(status) {
  return resolveStatusCorrelation(status).session_key;
}

export function resolveStatusDispatchId(status) {
  return resolveStatusCorrelation(status).dispatch_id;
}

export function resolveStatusGatewayLabel(status) {
  return resolveStatusCorrelation(status).gateway_label;
}

export function resolveResultSessionKey(result) {
  return resolveResultCorrelation(result).session_key;
}

export function resolveResultDispatchId(result) {
  return resolveResultCorrelation(result).dispatch_id;
}

export function resolveResultAttempt(result) {
  return resolveResultCorrelation(result).attempt;
}

export function resolveResultGatewayLabel(result) {
  return resolveResultCorrelation(result).gateway_label;
}

export function resolveResultGateType(result) {
  return resolveResultCorrelation(result).gate_type;
}

export function buildInvocationRefs({ config = {}, hookFamily = null, stageId = null, invocation = {} } = {}) {
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

  let primaryRef = canonicalRef('ref', invocation.primaryRef);
  if (!primaryRef) {
    if (hookFamily === 'gate.execute' && gateRef) primaryRef = gateRef;
    else if (hookFamily === 'worker.execute' && dispatchRef) primaryRef = dispatchRef;
    else if (moduleRef) primaryRef = moduleRef;
    else if (gateRef) primaryRef = gateRef;
    else if (dispatchRef) primaryRef = dispatchRef;
    else if (waitRef) primaryRef = waitRef;
    else primaryRef = canonicalRef('stage', stageId || `${hookFamily || 'unknown'}:${runId || 'unknown'}`);
  }

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

export function buildInvocationIds({ config = {}, hookFamily = null, stageId = null, invocation = {} } = {}) {
  return {
    run_id: coalesce(invocation.runId, config?._runId, config?.run_id),
    module_id: coalesce(invocation.moduleId, invocation.module_id),
    gate_id: coalesce(invocation.gateId, invocation.gate_id),
    stage_id: stageId || null,
    hook_family: hookFamily || null,
    attempt: invocation.attempt ?? null,
    dispatch_id: coalesce(invocation.dispatchId, invocation.dispatch_id),
    session_key: coalesce(invocation.sessionKey, invocation.session_key),
    gateway_label: coalesce(invocation.gatewayLabel, invocation.gateway_label),
  };
}

export function buildInvocationCorrelation({ config = {}, hookFamily = null, stageId = null, invocation = {} } = {}) {
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

export function buildInvocationSnapshot({ config = {}, hookFamily = null, stageId = null, invocation = {} } = {}) {
  return {
    refs: buildInvocationRefs({ config, hookFamily, stageId, invocation }),
    ids: buildInvocationIds({ config, hookFamily, stageId, invocation }),
    correlation: buildInvocationCorrelation({ config, hookFamily, stageId, invocation }),
  };
}
