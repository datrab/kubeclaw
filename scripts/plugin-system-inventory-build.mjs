import fs from 'node:fs';
import path from 'node:path';

import {
  aggregateCounts,
  analyzeInventoryFile,
  dependencyGraph,
  ownerKey,
} from './plugin-system-inventory-analysis.mjs';
import {
  referenceAssessment,
  referenceCandidateRanking,
  registrationAssessment,
  targetOwnerCounts,
} from './plugin-system-inventory-assessment.mjs';

const allowedTargetKinds = new Set(['core', 'plugin-sdk', 'plugin', 'adapter', 'shared-library', 'delete']);

function validateClassificationRules(rules) {
  const ids = new Set();
  for (const rule of rules.classificationRules) {
    if (!rule.id || ids.has(rule.id)) throw new Error(`Duplicate or missing classification rule id: ${rule.id}`);
    ids.add(rule.id);
    if (!allowedTargetKinds.has(rule.target?.kind)) {
      throw new Error(`Invalid target kind in rule ${rule.id}: ${rule.target?.kind}`);
    }
    if (!rule.target?.id) throw new Error(`Missing target id in rule ${rule.id}`);
  }
}

function validateEffectAdapters(rules) {
  const adapterIds = new Set(rules.targetAdapters.map((adapter) => adapter.id));
  for (const matcher of rules.effectMatchers) {
    if (!adapterIds.has(matcher.adapter)) {
      throw new Error(`Effect ${matcher.id} references undeclared adapter ${matcher.adapter}`);
    }
  }
}

function validateRegistrations(root, registrations) {
  const targetIds = new Set();
  const currentIds = new Set();
  for (const registration of registrations) {
    if (currentIds.has(registration.currentId)) {
      throw new Error(`Duplicate current registration id: ${registration.currentId}`);
    }
    currentIds.add(registration.currentId);
    if (targetIds.has(registration.targetRegistrationId)) {
      throw new Error(`Duplicate target registration id: ${registration.targetRegistrationId}`);
    }
    targetIds.add(registration.targetRegistrationId);
    if (!fs.existsSync(path.join(root, registration.entrypoint))) {
      throw new Error(`Registration entrypoint does not exist: ${registration.entrypoint}`);
    }
  }
}

function validateRules(root, rules) {
  if (rules.classificationMode !== 'ordered-first-match') {
    throw new Error(`Unsupported classification mode: ${rules.classificationMode}`);
  }
  validateClassificationRules(rules);
  validateEffectAdapters(rules);
  validateRegistrations(root, rules.registrations);
}

function buildFiles(root, paths, rules, classify) {
  const unclassified = [];
  const files = paths.map((relPath) => {
    const target = classify(relPath, rules.classificationRules);
    if (!target) unclassified.push(relPath);
    return analyzeInventoryFile(root, relPath, rules, target);
  });
  if (unclassified.length) {
    throw new Error(`Unclassified plugin-system files:\n${unclassified.map((item) => `- ${item}`).join('\n')}`);
  }
  return files;
}

function validateRegistrationTargets(files, registrations) {
  const targetIds = new Set(files.map((file) => file.target.id));
  for (const registration of registrations) {
    if (!targetIds.has(registration.targetPackage)) {
      throw new Error(`Registration ${registration.targetRegistrationId} targets package with no classified files: ${registration.targetPackage}`);
    }
  }
}

function scopedHits(files, property, runtimeOnly = false) {
  return files
    .filter((file) => !runtimeOnly || file.scope === 'runtime')
    .flatMap((file) => file[property]);
}

function inventorySummary(files, registrations) {
  return {
    files: files.length,
    runtimeFiles: files.filter((file) => file.scope === 'runtime').length,
    supportFiles: files.filter((file) => file.scope !== 'runtime').length,
    exportedSurfaces: files.reduce((total, file) => total + file.exports.length, 0),
    localImports: files.reduce((total, file) => total + file.imports.filter((item) => item.resolved).length, 0),
    privilegedEffects: scopedHits(files, 'effects', true).length,
    privilegedEffectReferences: scopedHits(files, 'effects').length,
    runtimeLegacyContractHits: scopedHits(files, 'legacyContracts', true).length,
    legacyContractHits: scopedHits(files, 'legacyContracts').length,
    runtimeHardcodingHits: scopedHits(files, 'hardcodings', true).length,
    hardcodingHits: scopedHits(files, 'hardcodings').length,
    registrations: registrations.length,
    unclassified: 0,
  };
}

function countLedgers(files) {
  return {
    effectCounts: aggregateCounts(scopedHits(files, 'effects', true), (effect) => effect.id),
    effectReferenceCounts: aggregateCounts(scopedHits(files, 'effects'), (effect) => effect.id),
    runtimeLegacyContractCounts: aggregateCounts(scopedHits(files, 'legacyContracts', true), (hit) => hit.id),
    legacyContractCounts: aggregateCounts(scopedHits(files, 'legacyContracts'), (hit) => hit.id),
    runtimeHardcodingCounts: aggregateCounts(scopedHits(files, 'hardcodings', true), (hit) => hit.id),
    hardcodingCounts: aggregateCounts(scopedHits(files, 'hardcodings'), (hit) => hit.id),
  };
}

export function buildInventory({
  root,
  rulesPath,
  readJson,
  inventoryPaths,
  verifyCoverage,
  classify,
  relative,
}) {
  const rules = readJson(rulesPath);
  validateRules(root, rules);
  const paths = inventoryPaths(rules.scan);
  verifyCoverage(paths);
  const files = buildFiles(root, paths, rules, classify);
  validateRegistrationTargets(files, rules.registrations);
  const graph = dependencyGraph(files, new Map(files.map((file) => [file.path, file])));
  const packageAssessment = registrationAssessment(rules.registrations, files, graph);
  const candidateRanking = referenceCandidateRanking(rules.registrations, packageAssessment);
  return {
    schemaVersion: 'plugin-system-inventory-v1',
    generatedBy: 'scripts/plugin-system-inventory.mjs',
    rulesSource: relative(rulesPath),
    summary: inventorySummary(files, rules.registrations),
    ownerCounts: targetOwnerCounts(files),
    ...countLedgers(files),
    effectAdapters: Object.fromEntries(rules.effectMatchers.map((matcher) => [matcher.id, matcher.adapter])),
    targetAdapters: rules.targetAdapters,
    registrations: rules.registrations,
    packageAssessment,
    referenceCandidateRanking: candidateRanking,
    referenceAssessment: referenceAssessment(rules.registrations, packageAssessment, candidateRanking),
    dependencyGraph: graph,
    files,
  };
}

export { ownerKey };
