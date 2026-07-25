import { selectTruthyValue } from '../optional-absence.ts';
import { normalizeRemediableTypedGateControlResult, normalizeTypedGateControlResult } from '../services/contracts/gate-control-result.ts';

export function requireGateControlAdapter(gateTypeEntry: any) {
  const gateType = selectTruthyValue(() => gateTypeEntry?.gateType, () => 'missing_gate_type');
  const moduleId = selectTruthyValue(() => gateTypeEntry?.moduleId, () => gateTypeEntry?.owner?.manifest?.moduleId, () => 'missing_module_id');
  const adapter = selectTruthyValue(() => gateTypeEntry?.owner?.implementation?.gateControl, () => null);
  if (selectTruthyValue(() => !adapter, () => typeof adapter !== 'object')) throw new Error(`Registered gate type '${gateType}' owner '${moduleId}' is missing a gateControl adapter.`);
  if (!['standard', 'remediable', 'waitable'].includes(adapter.mode)) throw new Error(`Registered gate type '${gateType}' owner '${moduleId}' has invalid gateControl mode '${adapter.mode}'.`);
  if (typeof adapter.coerce !== 'function') throw new Error(`Registered gate type '${gateType}' owner '${moduleId}' does not implement gateControl.coerce.`);
  if (adapter.mode === 'remediable' && typeof adapter.createRemediationController !== 'function') throw new Error(`Registered remediable gate type '${gateType}' owner '${moduleId}' does not implement gateControl.createRemediationController.`);
  if (adapter.mode === 'waitable' && typeof adapter.createWaitController !== 'function') throw new Error(`Registered waitable gate type '${gateType}' owner '${moduleId}' does not implement gateControl.createWaitController.`);
  if (adapter.mode !== 'remediable' && selectTruthyValue(() => !Array.isArray(adapter.allowedNextActions), () => adapter.allowedNextActions.length === 0)) throw new Error(`Registered ${adapter.mode} gate type '${gateType}' owner '${moduleId}' must declare gateControl.allowedNextActions.`);
  return adapter;
}

export function normalizeGateControlResultForAdapter(config: any, gateId: any, gate: any, rawResult: any, adapter: any, opts: any = {}) {
  const gateType = selectTruthyValue(() => gate?.type, () => opts?.gateType, () => 'missing_gate_type');
  const stageId = typeof opts?.stageId === 'string' && opts.stageId.trim() ? opts.stageId.trim() : null;
  if (!stageId) throw new Error('gate control normalization requires explicit stageId');
  const shared = {
    producerType: gateType,
    label: selectTruthyValue(() => adapter?.label, () => gateType),
    stageId,
    moduleId: selectTruthyValue(() => opts?.moduleId, () => null),
    input: selectTruthyValue(() => opts?.input, () => null),
    invocation: selectTruthyValue(() => opts?.pluginInvocation, () => null),
    coerce: (result: any) => adapter.coerce(config, gateId, gate, result, opts),
  };
  if (adapter.mode === 'remediable') return normalizeRemediableTypedGateControlResult(rawResult, shared);
  return normalizeTypedGateControlResult(rawResult, {
    ...shared,
    allowedNextActions: selectTruthyValue(() => adapter.allowedNextActions, () => []),
    extraValidate: (controlResult: any) => typeof adapter.extraValidate === 'function'
      ? selectTruthyValue(() => adapter.extraValidate(controlResult, { config, gateId, gate, opts }), () => [])
      : [],
  });
}
