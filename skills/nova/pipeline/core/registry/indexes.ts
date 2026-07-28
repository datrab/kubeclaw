import {
  PLUGIN_REJECTION_CODES,
  PLUGIN_STAGE_IDS,
} from '../constants.ts';
import { createRegistryDictionary, pushRegistryError as pushError } from './dictionary.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
type AnyRecord = Record<string, any>;
type RegistryError = { code: string; message: string; [key: string]: any };

function ensureRegistryMap(parent: AnyRecord, key: string): AnyRecord {
  const existing = parent[key];
  if (existing !== undefined) return existing;
  const next = createRegistryDictionary();
  parent[key] = next;
  return next;
}

function ensureRegistryList(parent: AnyRecord, key: string): AnyRecord[] {
  const existing = parent[key];
  if (existing !== undefined) return existing;
  const next: AnyRecord[] = [];
  parent[key] = next;
  return next;
}

export function buildStageOwnerIndex(normalizedConfig: AnyRecord, resolvedRecords: AnyRecord, errors: RegistryError[]) {
  if (normalizedConfig.enabled === false) return createRegistryDictionary();

  const { candidatesByStage, decisionStages } = collectStageCandidates(resolvedRecords);
  const stageOwners: AnyRecord = createRegistryDictionary();
  applyExplicitStageOwners(normalizedConfig.stageOwners, resolvedRecords, stageOwners, errors);
  applyImplicitStageOwners(candidatesByStage, stageOwners, errors);
  validateDecisionStageOwners(decisionStages, stageOwners, errors);
  return stageOwners;
}

function collectStageCandidates(resolvedRecords: AnyRecord) {
  const candidatesByStage: AnyRecord = createRegistryDictionary();
  const decisionStages: AnyRecord[] = [];
  for (const record of Object.values(resolvedRecords)) {
    if (!record.enabled) continue;
    for (const stageId of record.resolvedStageIds) {
      const hookFamily = record.manifest.hookFamily;
      const familyCandidates = ensureRegistryMap(candidatesByStage, hookFamily);
      ensureRegistryList(familyCandidates, stageId).push(record);
      if (!['notification', 'telemetry'].includes(record.manifest.kind)) decisionStages.push({ hookFamily, stageId });
    }
  }
  return { candidatesByStage, decisionStages };
}

function applyExplicitStageOwners(
  explicitSelections: AnyRecord,
  resolvedRecords: AnyRecord,
  stageOwners: AnyRecord,
  errors: RegistryError[],
): void {
  for (const [stageId, moduleIdValue] of Object.entries(explicitSelections)) {
    const moduleId = String(moduleIdValue);
    const ownerRecord = resolvedRecords[moduleId];
    if (!ownerRecord) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_STAGE_OWNER_UNRECOGNIZED, `config.plugins.stageOwners.${stageId} references unrecognized module '${moduleId}'`);
      continue;
    }
    if (!ownerRecord.enabled) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_STAGE_OWNER_DISABLED, `config.plugins.stageOwners.${stageId} references disabled module '${moduleId}'`);
      continue;
    }
    if (!ownerRecord.resolvedStageIds.includes(stageId)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_STAGE_OWNER_UNRECOGNIZED, `config.plugins.stageOwners.${stageId} cannot select module '${moduleId}' because it does not claim that stage`);
      continue;
    }
    const hookFamily = ownerRecord.manifest.hookFamily;
    if (!(PLUGIN_STAGE_IDS as AnyRecord)[ownerRecord.manifest.kind]?.has(stageId)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_STAGE_ID_INVALID, `config.plugins.stageOwners.${stageId} is not a valid stage id for kind '${ownerRecord.manifest.kind}'`);
      continue;
    }
    ensureRegistryMap(stageOwners, hookFamily)[stageId] = ownerRecord;
  }
}

function applyImplicitStageOwners(
  candidatesByStage: AnyRecord,
  stageOwners: AnyRecord,
  errors: RegistryError[],
): void {
  for (const [hookFamily, stageMap] of Object.entries(candidatesByStage)) {
    const familyOwners = ensureRegistryMap(stageOwners, hookFamily);
    for (const [stageId, candidatesValue] of Object.entries(stageMap)) {
      const candidates = candidatesValue as AnyRecord[];
      if (candidates.every((candidate: AnyRecord) => ['notification', 'telemetry'].includes(candidate?.manifest?.kind))) {
        continue;
      }
      if (familyOwners[stageId]) continue;
      if (candidates.length === 1) {
        familyOwners[stageId] = candidates[0];
        continue;
      }
      if (candidates.length > 1) {
        pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_STAGE_OWNER_CONFLICT, `Stage '${stageId}' in hookFamily '${hookFamily}' has ${candidates.length} enabled owners but no explicit config.plugins.stageOwners selection`);
      }
    }
  }
}

function validateDecisionStageOwners(
  decisionStages: AnyRecord[],
  stageOwners: AnyRecord,
  errors: RegistryError[],
): void {
  for (const { hookFamily, stageId } of decisionStages) {
    if (!stageOwners[hookFamily]?.[stageId]) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_STAGE_OWNER_MISSING, `Stage '${stageId}' in hookFamily '${hookFamily}' ended startup with no enabled owner`);
    }
  }
}

export function buildHookIndex(resolvedRecords: AnyRecord) {
  const hookIndex: AnyRecord = createRegistryDictionary();
  for (const record of Object.values(resolvedRecords)) {
    const familyIndex = ensureRegistryMap(hookIndex, record.manifest.hookFamily);
    for (const stageId of record.resolvedStageIds) {
      ensureRegistryList(familyIndex, stageId).push(record);
    }
  }
  return hookIndex;
}

export function buildGateTypeIndex(normalizedConfig: AnyRecord, resolvedRecords: AnyRecord, stageOwners: AnyRecord, errors: RegistryError[]) {
  if (normalizedConfig.enabled === false) return createRegistryDictionary();

  const candidatesByGateType: AnyRecord = createRegistryDictionary();
  for (const record of Object.values(resolvedRecords)) {
    if (selectTruthyValue(() => (!record.enabled), () => (record.manifest.kind !== 'gate'))) continue;
    for (const gateType of selectDefinedValue(() => (record.manifest.gateTypes), () => ([]))) {
      ensureRegistryList(candidatesByGateType, gateType).push(record);
    }
  }

  const gateTypes: AnyRecord = createRegistryDictionary();
  for (const [gateType, candidates] of Object.entries(candidatesByGateType)) {
    const stageId = `gate:${gateType}`;
    if (candidates.length > 1) {
      pushError(
        errors,
        PLUGIN_REJECTION_CODES.REGISTRY_GATE_TYPE_OWNER_CONFLICT,
        `Gate type '${gateType}' has ${candidates.length} enabled owners but gate types must be uniquely owned by the startup registry`,
      );
      continue;
    }

    const record = candidates[0];
    const stageOwner = selectTruthyValue(() => (stageOwners?.['gate.execute']?.[stageId]), () => (null));
    if (!stageOwner) {
      pushError(
        errors,
        PLUGIN_REJECTION_CODES.REGISTRY_GATE_TYPE_OWNER_MISSING,
        `Gate type '${gateType}' declared by module '${record.manifest.moduleId}' has no matching 'gate.execute' stage owner for '${stageId}'`,
      );
      continue;
    }
    if (stageOwner.manifest.moduleId !== record.manifest.moduleId) {
      pushError(
        errors,
        PLUGIN_REJECTION_CODES.REGISTRY_GATE_TYPE_OWNER_CONFLICT,
        `Gate type '${gateType}' is declared by module '${record.manifest.moduleId}' but stage '${stageId}' is owned by '${stageOwner.manifest.moduleId}'`,
      );
      continue;
    }

    gateTypes[gateType] = {
      gateType,
      hookFamily: 'gate.execute',
      stageId,
      moduleId: record.manifest.moduleId,
      owner: record,
    };
  }

  return gateTypes;
}
