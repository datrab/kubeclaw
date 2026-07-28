import { FINDING_CODES, makeFinding, SCOPE, SEVERITY } from './arch-validator-values.ts';

type AnyRecord = Record<string, any>;

function malformedModelFinding(code: string, explanation: string, remediation: string) {
  return makeFinding(code, SEVERITY.WARN, SCOPE.CONFIG, [], explanation, remediation);
}

function checkArchModel(progress: any) {
  const configured = progress?.arch_validation?.model;
  if (configured === undefined || configured === null) return [];
  const model = typeof configured === 'string'
    ? configured
    : (typeof configured === 'object' ? configured?.model : null);
  if (model) return [];
  return [malformedModelFinding(
    FINDING_CODES.ARCH_VALIDATOR_MODEL_MALFORMED,
    'progress.arch_validation.model is configured but missing a model string',
    'Set progress.arch_validation.model to a model string or rely on progress.defaults.models.arch_validator / swarm.config.json fallback_model.',
  )];
}

function checkModuleModels(progress: any) {
  const findings: any[] = [];
  for (const [moduleId, module] of Object.entries(progress?.modules || {}) as [string, AnyRecord][]) {
    if (module.forge_model === undefined) continue;
    if (module.forge_model === null) continue;
    if (typeof module.forge_model === 'string' && module.forge_model.trim()) continue;
    findings.push(malformedModelFinding(
      FINDING_CODES.MODULE_FORGE_MODEL_MALFORMED,
      `Module '${moduleId}' has forge_model set but it is not a non-empty string`,
      `Set modules.${moduleId}.forge_model to a valid model string or remove it.`,
    ));
  }
  return findings;
}

function checkGateModels(progress: any) {
  const findings: any[] = [];
  for (const [gateId, gate] of Object.entries(progress?.gates || {}) as [string, AnyRecord][]) {
    if (gate.model === undefined) continue;
    if (gate.model === null) continue;
    if (typeof gate.model === 'string' && gate.model.trim()) continue;
    findings.push(malformedModelFinding(
      FINDING_CODES.GATE_MODEL_MALFORMED,
      `Gate '${gateId}' has model set but it is not a non-empty string`,
      `Set gates.${gateId}.model to a valid model string or remove it.`,
    ));
  }
  return findings;
}

export function checkModelConfig(config: any, progress: any = null) {
  const findings = checkArchModel(progress);
  if (config.models !== undefined) {
    findings.push(malformedModelFinding(
      FINDING_CODES.ARCH_VALIDATOR_MODEL_MALFORMED,
      'swarm.config.json contains deprecated role-specific models',
      'Move role-specific model defaults to progress.defaults.models and keep only fallback_model in swarm.config.json.',
    ));
  }
  if (!progress) return findings;
  return [...findings, ...checkModuleModels(progress), ...checkGateModels(progress)];
}
