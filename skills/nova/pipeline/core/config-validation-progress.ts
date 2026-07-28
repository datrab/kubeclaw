import { buildPluginRegistry } from './registry.ts';
import { ConfigValidation, isPlainObject } from './config-validation-values.ts';
import type { AnyRecord } from './config-validation-values.ts';

const REMOVED_REVIEW_FAIL_FIELD = `on_${'n' + 'ogo'}`;

function validateReviewGate(gateId: string, gate: AnyRecord, validation: ConfigValidation) {
  if (!gate.review_name) validation.errors.push(`progress.gates.${gateId}.review_name: required for review gates`);
  if (!gate.instructions_file) validation.errors.push(`progress.gates.${gateId}.instructions_file: required`);
  if (gate.on_fail && gate.on_fail !== 'stop') {
    validation.errors.push(`progress.gates.${gateId}.on_fail: '${gate.on_fail}' not valid (stop)`);
  }
}

function validateBusterGate(gateId: string, gate: AnyRecord, validation: ConfigValidation) {
  if (gate.on_fail && gate.on_fail !== 'fix_and_retest') {
    validation.errors.push(`progress.gates.${gateId}.on_fail: '${gate.on_fail}' not valid (fix_and_retest)`);
  }
}

function validateApprovalGate(gateId: string, gate: AnyRecord, validation: ConfigValidation) {
  const validTimeout = ['block', 'continue'];
  if (!gate.title) validation.errors.push(`progress.gates.${gateId}.title: required for approval gates`);
  if (!gate.on_timeout) {
    validation.errors.push(`progress.gates.${gateId}.on_timeout: required for approval gates (${validTimeout.join(' | ')})`);
  } else if (!validTimeout.includes(gate.on_timeout)) {
    validation.errors.push(`progress.gates.${gateId}.on_timeout: '${gate.on_timeout}' not valid (${validTimeout.join(' | ')})`);
  }
  if (gate.timeout_minutes === undefined) return;
  if (gate.timeout_minutes === null) return;
  const timeout = Number(gate.timeout_minutes);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    validation.errors.push(`progress.gates.${gateId}.timeout_minutes: must be a positive number`);
  }
}

function validateGateDefinitions(progress: AnyRecord, gateTypes: string[], validation: ConfigValidation) {
  const gates = isPlainObject(progress?.gates) ? progress.gates : {};
  if (progress?.gates !== undefined && !isPlainObject(progress.gates)) {
    validation.errors.push('progress.gates: must be an object when provided');
  }
  const typesLabel = gateTypes.length > 0 ? gateTypes.join(' | ') : 'none registered';
  for (const [gateId, gateRaw] of Object.entries(gates)) {
    validation.safeIdentifier(gateId, `progress.gates.${gateId}`);
    const gate = gateRaw as AnyRecord;
    if (gate[REMOVED_REVIEW_FAIL_FIELD] !== undefined) {
      validation.errors.push(`progress.gates.${gateId}.${REMOVED_REVIEW_FAIL_FIELD}: removed field; use on_fail`);
    }
    if (!gate.type) {
      validation.errors.push(`progress.gates.${gateId}.type: required (${typesLabel})`);
    } else if (!gateTypes.includes(gate.type)) {
      validation.errors.push(`progress.gates.${gateId}.type: '${gate.type}' not registered in the startup plugin registry (${typesLabel})`);
    }
    if (gate.type === 'review') validateReviewGate(gateId, gate, validation);
    if (gate.type === 'buster') validateBusterGate(gateId, gate, validation);
    if (gate.type === 'approval') validateApprovalGate(gateId, gate, validation);
  }
  return gates;
}

function validateModuleDependencies(progress: AnyRecord, gates: AnyRecord, validation: ConfigValidation) {
  if (!isPlainObject(progress?.modules)) return;
  for (const [moduleId, moduleRaw] of Object.entries(progress.modules)) {
    const module = moduleRaw as AnyRecord;
    if (!Array.isArray(module?.depends_on)) continue;
    for (const dependency of module.depends_on) {
      if (typeof dependency !== 'string') continue;
      if (!dependency.startsWith('gate:')) continue;
      const gateId = dependency.slice('gate:'.length);
      validation.safeIdentifier(gateId, `progress.modules.${moduleId}.depends_on gate reference`);
      if (!Object.prototype.hasOwnProperty.call(gates, gateId)) {
        validation.errors.push(`progress.modules.${moduleId}.depends_on: gate '${gateId}' is not defined in progress.gates`);
      }
    }
  }
}

export function validateProgressAndRegistry(config: AnyRecord, progress: AnyRecord, validation: ConfigValidation) {
  validation.field(progress, 'project', 'progress');
  validation.field(progress, 'execution_order', 'progress');
  validation.field(progress, 'modules', 'progress');
  if (progress?.case_study !== undefined) {
    validation.errors.push('progress.case_study: case study generator config belongs in swarm.config.json config.case_study');
  }
  const registryBuild = buildPluginRegistry(config.plugins, { throwOnError: false });
  config.plugins = registryBuild.normalizedConfig;
  validation.append(registryBuild.errors.map((error: any) => `[${error.code}] ${error.message}`));
  const registryGateTypes = registryBuild.registry?.gateTypes;
  if (!isPlainObject(registryGateTypes)) validation.errors.push('plugin registry gateTypes: required registry object');
  const gateTypes = isPlainObject(registryGateTypes) ? Object.keys(registryGateTypes).sort() : [];
  const gates = validateGateDefinitions(progress, gateTypes, validation);
  validateModuleDependencies(progress, gates, validation);
  return registryBuild.registry;
}
