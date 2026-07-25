import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type AnyRecord = Record<string, any>;

function normalizeModuleStepId(stepId: string): string | null {
  if (selectTruthyValue(() => (typeof stepId !== 'string'), () => (!stepId.trim()))) return null;
  if (selectTruthyValue(() => (stepId.startsWith('gate:')), () => (stepId.startsWith('validator:')))) return null;
  return stepId.startsWith('module:') ? stepId.slice('module:'.length) : stepId;
}

function explicitGateModuleId(progress: AnyRecord = {}, gateId: any = ''): string | null {
  const gate = progress?.gates?.[gateId] ? progress.gates[gateId] : {};
  const explicit = gate.module_id
    ? gate.module_id
    : gate.moduleId
      ? gate.moduleId
      : gate.target_module_id
        ? gate.target_module_id
        : gate.targetModuleId
          ? gate.targetModuleId
          : null;
  if (selectTruthyValue(() => (typeof explicit !== 'string'), () => (!explicit.trim()))) return null;
  return progress?.modules?.[explicit] ? explicit : null;
}

export function resolveGateTargetModule(progress: AnyRecord = {}, gateId: any = ''): { moduleId: string | null; moduleDir: string | null; source: string } {
  const explicit = explicitGateModuleId(progress, gateId);
  if (explicit) {
    return {
      moduleId: explicit,
      moduleDir: selectTruthyValue(() => (progress?.modules?.[explicit]?.dir), () => (null)),
      source: 'gate_config',
    };
  }

  const executionOrder = Array.isArray(progress?.execution_order) ? progress.execution_order : [];
  const gateStepId = `gate:${gateId}`;
  const gateIndex = executionOrder.findIndex((stepId: unknown) => stepId === gateStepId);
  if (gateIndex >= 0) {
    for (let index = gateIndex - 1; index >= 0; index -= 1) {
      const stepId = executionOrder[index] ? executionOrder[index] : '';
      const moduleId = normalizeModuleStepId(String(stepId));
      if (!moduleId) continue;
      if (!progress?.modules?.[moduleId]) continue;
      return {
        moduleId,
        moduleDir: selectTruthyValue(() => (progress.modules[moduleId]?.dir), () => (null)),
        source: 'execution_order',
      };
    }
  }

  return { moduleId: null, moduleDir: null, source: 'none' };
}
