import { spawnSession } from './lifecycle.ts';
import { sessionLifecyclePolicies } from '../core/session-policy.ts';
import { createAgentLifecycleTelemetryReader } from '../services/agent-observability-required.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';

export function prepareObservedAgentSpawn(config: any, identity: any, reader: any = null) {
  const telemetryIdentity = {
    run_id: identity.runId,
    project: selectTruthyValue(() => (config?.project), () => (null)),
    agent_type: identity.agentType,
    module_id: selectDefinedValue(() => (identity.moduleId), () => (null)),
    gate_id: selectDefinedValue(() => (identity.gateId), () => (null)),
    gate_type: selectDefinedValue(() => (identity.gateType), () => (null)),
    attempt: selectDefinedValue(() => (identity.attempt), () => (null)),
    dispatch_id: identity.dispatchId,
    gateway_label: identity.gatewayLabel,
  };
  return {
    telemetryIdentity,
    startupEvidenceReader: createAgentLifecycleTelemetryReader(config, {
      runId: identity.runId,
      startId: '0-0',
      ...(reader ? { reader } : {}),
    }),
  };
}

export function spawnObservedAgentSession(config: any, session: any, prompt: any, timeoutSeconds: any, telemetryIdentity: any, opts: any = {}) {
  return spawnSession({ session }, prompt, selectTruthyValue(() => (timeoutSeconds), () => (null)), {
    ...sessionLifecyclePolicies(config),
    runtime: session.runtime,
    model: session.model,
    agentId: session.agentId,
    cwd: session.cwd,
    label: session.label,
    thinking: selectTruthyValue(() => (opts.thinking), () => (null)),
    trackActive: false,
    budget: selectTruthyValue(() => (opts.budget), () => (null)),
    signal: selectTruthyValue(() => (opts.signal), () => (null)),
    observabilityIdentity: telemetryIdentity,
  });
}
