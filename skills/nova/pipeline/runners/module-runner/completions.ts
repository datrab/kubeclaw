import { selectDefinedValue } from '../../optional-absence.ts';

type AnyRecord = Record<string, any>;

function observedSession({
  dispatchId = null,
  gatewayLabel = null,
  sessionKey = null,
}: AnyRecord = {}) {
  return {
    dispatch_id: selectDefinedValue(() => (dispatchId), () => (null)),
    gateway_label: selectDefinedValue(() => (gatewayLabel), () => (null)),
    session_key: selectDefinedValue(() => (sessionKey), () => (null)),
  };
}

export function applyModuleRunnerCompletion({
  deps,
  config,
  dir,
  status,
  moduleId,
  phase,
  attempt,
  completionStatus,
  authority,
  reasonCode = null,
  summary = null,
  occurredAt = null,
  dispatchId = null,
  gatewayLabel = null,
  sessionKey = null,
  metadata = null,
}: AnyRecord = {}) {
  if (!authority || typeof authority !== 'object') {
    throw new Error('applyModuleRunnerCompletion requires completion authority');
  }
  return deps.applyModuleCompletion(config, dir, status, {
    target_kind: 'module',
    target_id: moduleId,
    phase,
    attempt,
    status: completionStatus,
    authority,
    reason_code: reasonCode,
    summary,
    occurred_at: occurredAt,
    observed: observedSession({ dispatchId, gatewayLabel, sessionKey }),
    metadata,
  });
}

