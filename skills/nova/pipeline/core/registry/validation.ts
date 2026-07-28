import {
  PLUGIN_CONTRACT_VERSION,
  PLUGIN_KINDS,
  PLUGIN_ALLOWED_HOOK_FAMILIES,
  PLUGIN_HOOK_FAMILIES,
  PLUGIN_STAGE_IDS,
  PLUGIN_REQUIRED_CAPABILITIES,
  PLUGIN_OPTIONAL_CAPABILITIES,
  PLUGIN_FORBIDDEN_CAPABILITIES,
  PLUGIN_REJECTION_CODES,
  PLUGIN_CAPABILITY_REJECTION_CODES,
  PLUGIN_TRUST_TIERS,
  PLUGIN_SOURCE_TYPES,
} from '../constants.ts';
import { isPlainObject } from '../../services/validation.ts';
import { allKnownCapabilities } from './config-normalization.ts';
import { isReservedRegistryKey } from './dictionary.ts';
import {
  resolveModuleConfig,
  validateManifestConfigSchema,
} from './schema-validation.ts';
export { resolveModuleConfig } from './schema-validation.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
type AnyRecord = Record<string, any>;
type RegistryError = { code: string; message: string; [key: string]: any };

export const PLUGIN_METHOD_BY_KIND = Object.freeze({
  worker: 'execute',
  gate: 'execute',
  validator: 'run',
  generator: 'run',
  notification: 'observe',
  telemetry: 'observe',
});

function pushError(errors: RegistryError[], code: string, message: string, details: AnyRecord = {}) {
  errors.push({ code, message, ...details });
}

function moduleLabel(manifest: AnyRecord): string {
  return typeof manifest?.moduleId === 'string' && manifest.moduleId.trim()
    ? manifest.moduleId
    : 'module_id_missing';
}

function arrayForPolicyKind(policy: AnyRecord, kind: string, label: string, manifest: AnyRecord, errors: RegistryError[]): any[] | null {
  if (!PLUGIN_KINDS.has(kind)) {
    pushError(
      errors,
      PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID,
      `Module '${moduleLabel(manifest)}' cannot validate ${label} because kind '${kind}' is unsupported`,
    );
    return null;
  }
  const value = policy[kind];
  if (!Array.isArray(value)) {
    pushError(
      errors,
      PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID,
      `Module '${moduleLabel(manifest)}' cannot validate ${label} because registry policy for kind '${kind}' is missing`,
    );
    return null;
  }
  return value;
}

function allowlistForModule(capabilityAllowlist: AnyRecord, manifest: AnyRecord, errors: RegistryError[]): Set<string> {
  const moduleId = manifest.moduleId;
  const configured = capabilityAllowlist[moduleId];
  if (configured === undefined) return new Set();
  if (!Array.isArray(configured)) {
    pushError(
      errors,
      PLUGIN_CAPABILITY_REJECTION_CODES.CAPABILITY_RESTRICTED_NOT_ALLOWLISTED,
      `Restricted module '${moduleLabel(manifest)}' has invalid capability allowlist config; expected array`,
    );
    return new Set();
  }
  return new Set(configured);
}

function validateGateTypes(manifest: AnyRecord, errors: RegistryError[]) {
  if (manifest.kind !== 'gate') {
    if (manifest.gateTypes !== undefined) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_GATE_TYPE_INVALID, `Module '${moduleLabel(manifest)}' is kind '${manifest.kind}' and cannot declare gateTypes`);
    }
    return;
  }

  if (selectTruthyValue(() => (!Array.isArray(manifest.gateTypes)), () => (manifest.gateTypes.length === 0))) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_GATE_TYPE_INVALID, `Gate module '${moduleLabel(manifest)}' must declare at least one gateTypes entry`);
    return;
  }

  const seenGateTypes = new Set();
  for (const gateType of manifest.gateTypes) {
    if (selectTruthyValue(() => (typeof gateType !== 'string'), () => (!gateType.trim()))) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_GATE_TYPE_INVALID, `Gate module '${moduleLabel(manifest)}' declared an empty gate type`);
      continue;
    }
    if (gateType.includes(':')) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_GATE_TYPE_INVALID, `Gate module '${moduleLabel(manifest)}' gate type '${gateType}' must be an unqualified type name, not a stage id`);
      continue;
    }
    if (isReservedRegistryKey(gateType)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_GATE_TYPE_INVALID, `Gate module '${moduleLabel(manifest)}' gate type '${gateType}' is reserved and cannot be used as a registry key`);
      continue;
    }
    if (seenGateTypes.has(gateType)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_GATE_TYPE_INVALID, `Gate module '${moduleLabel(manifest)}' declared duplicate gate type '${gateType}'`);
      continue;
    }
    seenGateTypes.add(gateType);

    const expectedStageId = `gate:${gateType}`;
    if (Array.isArray(manifest.stageIds) && !manifest.stageIds.includes(expectedStageId)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_GATE_TYPE_INVALID, `Gate module '${moduleLabel(manifest)}' gate type '${gateType}' must claim matching stageId '${expectedStageId}'`);
    }
  }
}

export function validateCapabilities(manifest: AnyRecord, resolvedTrustTier: string, capabilityAllowlist: AnyRecord, errors: RegistryError[]) {
  if (selectTruthyValue(() => (!Array.isArray(manifest.capabilities)), () => (manifest.capabilities.length === 0))) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_CAPABILITY_DECLARATION_INVALID, `Module '${manifest.moduleId}' must declare at least one capability`);
    return;
  }

  const seen = new Set<string>();
  const knownCapabilities = allKnownCapabilities() as Set<string>;
  const forbiddenCapabilities = arrayForPolicyKind(PLUGIN_FORBIDDEN_CAPABILITIES as AnyRecord, manifest.kind, 'forbidden capabilities', manifest, errors);
  const requiredCapabilities = arrayForPolicyKind(PLUGIN_REQUIRED_CAPABILITIES as AnyRecord, manifest.kind, 'required capabilities', manifest, errors);
  const optionalCapabilities = arrayForPolicyKind(PLUGIN_OPTIONAL_CAPABILITIES as AnyRecord, manifest.kind, 'optional capabilities', manifest, errors);
  if (!forbiddenCapabilities || !requiredCapabilities || !optionalCapabilities) return;
  validateDeclaredCapabilities(manifest, {
    seen,
    knownCapabilities,
    forbiddenCapabilities,
  }, errors);
  validateRequiredCapabilities(manifest, requiredCapabilities, seen, errors);
  if (resolvedTrustTier === 'restricted') {
    validateRestrictedCapabilities(manifest, optionalCapabilities, seen, capabilityAllowlist, errors);
  }
}

function validateDeclaredCapabilities(
  manifest: AnyRecord,
  policy: {
    seen: Set<string>;
    knownCapabilities: Set<string>;
    forbiddenCapabilities: string[];
  },
  errors: RegistryError[],
): void {
  for (const capability of manifest.capabilities) {
    if (selectTruthyValue(() => (typeof capability !== 'string'), () => (!capability.trim()))) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_CAPABILITY_DECLARATION_INVALID, `Module '${manifest.moduleId}' declared an empty capability`);
      continue;
    }
    if (policy.seen.has(capability)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_CAPABILITY_DECLARATION_INVALID, `Module '${manifest.moduleId}' declared duplicate capability '${capability}'`);
      continue;
    }
    policy.seen.add(capability);
    if (!policy.knownCapabilities.has(capability)) {
      pushError(errors, PLUGIN_CAPABILITY_REJECTION_CODES.CAPABILITY_UNSUPPORTED, `Module '${manifest.moduleId}' declared unsupported capability '${capability}'`);
      continue;
    }
    if (policy.forbiddenCapabilities.includes(capability)) {
      pushError(errors, PLUGIN_CAPABILITY_REJECTION_CODES.CAPABILITY_FORBIDDEN_FOR_KIND, `Module '${manifest.moduleId}' kind '${manifest.kind}' cannot declare '${capability}'`);
      continue;
    }
  }
}

function validateRequiredCapabilities(
  manifest: AnyRecord,
  requiredCapabilities: string[],
  seen: Set<string>,
  errors: RegistryError[],
): void {
  for (const required of requiredCapabilities) {
    if (!seen.has(required)) {
      pushError(errors, PLUGIN_CAPABILITY_REJECTION_CODES.CAPABILITY_REQUIRED_MISSING, `Module '${manifest.moduleId}' must declare required capability '${required}'`);
    }
  }
}

function validateRestrictedCapabilities(
  manifest: AnyRecord,
  optionalCapabilities: string[],
  seen: Set<string>,
  capabilityAllowlist: AnyRecord,
  errors: RegistryError[],
): void {
  const allowlisted = allowlistForModule(capabilityAllowlist, manifest, errors);
  for (const gated of optionalCapabilities) {
    if (seen.has(gated) && !allowlisted.has(gated)) {
      pushError(errors, PLUGIN_CAPABILITY_REJECTION_CODES.CAPABILITY_RESTRICTED_NOT_ALLOWLISTED, `Restricted module '${manifest.moduleId}' requested gated capability '${gated}' without allowlist approval`);
    }
  }
  if (seen.has('dispatch.worker_runtime')) {
    pushError(errors, PLUGIN_CAPABILITY_REJECTION_CODES.CAPABILITY_FORBIDDEN_FOR_TRUST_TIER, `Restricted module '${manifest.moduleId}' cannot declare 'dispatch.worker_runtime'`);
  }
}

export function validateTrustPolicy(manifest: AnyRecord, override: AnyRecord, resolvedTrustTier: string, errors: RegistryError[]) {
  if (manifest.sourceType !== 'builtin' && manifest.trustTier === 'trusted') {
    pushError(
      errors,
      PLUGIN_REJECTION_CODES.REGISTRY_TRUST_OVERRIDE_INVALID,
      `Module '${manifest.moduleId}' sourceType '${manifest.sourceType}' must declare trustTier 'restricted'; trusted elevation requires explicit config.plugins.modules.${manifest.moduleId}.trustOverride`,
    );
  }
  if (manifest.sourceType === 'external' && resolvedTrustTier === 'trusted') {
    pushError(
      errors,
      PLUGIN_REJECTION_CODES.REGISTRY_TRUST_OVERRIDE_INVALID,
      `External module '${manifest.moduleId}' cannot be elevated to trustTier 'trusted' in v1`,
    );
  }
}

export function validateManifest(definition: AnyRecord, errors: RegistryError[]) {
  const manifest = definition?.manifest;
  if (!isPlainObject(manifest)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, 'Discovered plugin definition is missing a manifest object');
    return false;
  }

  validateManifestIdentity(manifest, errors);
  validateManifestStageIds(manifest, errors);
  validateManifestMetadata(manifest, errors);
  validateGateTypes(manifest, errors);
  validateManifestConfigSchema(manifest, errors);
  return true;
}

function validateManifestIdentity(manifest: AnyRecord, errors: RegistryError[]): void {
  if (selectTruthyValue(() => (typeof manifest.moduleId !== 'string'), () => (!manifest.moduleId.trim()))) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, 'Discovered plugin definition is missing a non-empty moduleId');
  } else if (isReservedRegistryKey(manifest.moduleId)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${manifest.moduleId}' moduleId is reserved and cannot be used as a registry key`);
  }
  if (manifest.contractVersion !== PLUGIN_CONTRACT_VERSION) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_CONTRACT_VERSION_UNSUPPORTED, `Module '${moduleLabel(manifest)}' must declare contractVersion '${PLUGIN_CONTRACT_VERSION}'`);
  }
  if (!PLUGIN_KINDS.has(manifest.kind)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${moduleLabel(manifest)}' declared unsupported kind '${manifest.kind}'`);
  }
  if (!PLUGIN_HOOK_FAMILIES.has(manifest.hookFamily)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${moduleLabel(manifest)}' declared unsupported hookFamily '${manifest.hookFamily}'`);
  }
  if (PLUGIN_KINDS.has(manifest.kind) && !(PLUGIN_ALLOWED_HOOK_FAMILIES as AnyRecord)[manifest.kind]?.has(manifest.hookFamily)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_KIND_HOOK_MISMATCH, `Module '${moduleLabel(manifest)}' kind '${manifest.kind}' cannot use hookFamily '${manifest.hookFamily}'`);
  }
}

function validateManifestStageIds(manifest: AnyRecord, errors: RegistryError[]): void {
  if (selectTruthyValue(() => (!Array.isArray(manifest.stageIds)), () => (manifest.stageIds.length === 0))) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_STAGE_ID_INVALID, `Module '${moduleLabel(manifest)}' must declare at least one stageId`);
  } else {
    const seenStageIds = new Set();
    for (const stageId of manifest.stageIds) {
      if (selectTruthyValue(() => (typeof stageId !== 'string'), () => (!stageId.trim()))) {
        pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_STAGE_ID_INVALID, `Module '${moduleLabel(manifest)}' declared an empty stageId`);
        continue;
      }
      if (seenStageIds.has(stageId)) {
        pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_STAGE_ID_INVALID, `Module '${moduleLabel(manifest)}' declared duplicate stageId '${stageId}'`);
        continue;
      }
      seenStageIds.add(stageId);
      if (!(PLUGIN_STAGE_IDS as AnyRecord)[manifest.kind]?.has(stageId)) {
        pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_STAGE_ID_INVALID, `Module '${moduleLabel(manifest)}' kind '${manifest.kind}' cannot claim stageId '${stageId}'`);
      }
    }
  }
}

function validateManifestMetadata(manifest: AnyRecord, errors: RegistryError[]): void {
  if (!PLUGIN_SOURCE_TYPES.has(manifest.sourceType)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${moduleLabel(manifest)}' declared unsupported sourceType '${manifest.sourceType}'`);
  }
  if (!PLUGIN_TRUST_TIERS.has(manifest.trustTier)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${moduleLabel(manifest)}' declared unsupported trustTier '${manifest.trustTier}'`);
  }
  if (manifest.displayName !== undefined && typeof manifest.displayName !== 'string') {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${moduleLabel(manifest)}' displayName must be a string`);
  }
  if (manifest.description !== undefined && typeof manifest.description !== 'string') {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${moduleLabel(manifest)}' description must be a string`);
  }
  if (typeof manifest.defaultEnabled !== 'boolean') {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${moduleLabel(manifest)}' defaultEnabled must be a boolean`);
  }
  if (manifest.priority !== undefined && typeof manifest.priority !== 'number') {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${moduleLabel(manifest)}' priority must be a number`);
  }
}

export function validateImplementation(definition: AnyRecord, errors: RegistryError[]) {
  const manifest = definition.manifest;
  const requiredMethod = (PLUGIN_METHOD_BY_KIND as AnyRecord)[manifest.kind];
  if (!requiredMethod) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_IMPLEMENTATION_MISSING, `Module '${manifest.moduleId}' kind '${manifest.kind}' has no registered implementation method mapping`);
    return;
  }
  if (selectTruthyValue(() => (!isPlainObject(definition.implementation)), () => (typeof definition.implementation[requiredMethod] !== 'function'))) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_IMPLEMENTATION_MISSING, `Module '${manifest.moduleId}' must implement '${requiredMethod}(input, ctx)'`);
  }
}
