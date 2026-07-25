import { resolveStatusDispatchId, resolveStatusGatewayLabel, resolveStatusSessionKey } from './correlation.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';

export function buildRateLimitDiscordCorrelation(status: Record<string, any> = {}): Record<string, any> {
  return {
    run_id: selectTruthyValue(() => (status.run_id), () => (null)),
    module_id: selectTruthyValue(() => (status.module_id), () => (null)),
    gate_id: selectTruthyValue(() => (status.gate_id), () => (null)),
    gate_type: selectTruthyValue(() => (status.gate_type), () => (null)),
    attempt: selectDefinedValue(() => (status.attempt), () => (null)),
    dispatch_id: selectDefinedValue(() => (resolveStatusDispatchId(status)), () => (null)),
    gateway_label: selectDefinedValue(() => (resolveStatusGatewayLabel(status)), () => (null)),
    session_key: selectDefinedValue(() => (resolveStatusSessionKey(status)), () => (null)),
  };
}
