#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = path.resolve(import.meta.dirname, '..');
const ledgerPath = path.join(root, 'docs/architecture/plugin-system-migration-units.json');
const inventoryPath = path.join(root, 'docs/generated/inventory/plugin-system.json');
const surfaceLedgerPath = path.join(root, 'docs/generated/inventory/plugin-system-migration-surfaces.json');
const evidenceSchemaPath = path.join(root, 'docs/architecture/plugin-system-parity-evidence.schema.json');
const evidenceRoot = path.join(root, 'docs/architecture/plugin-system-parity-evidence');
const write = process.argv.includes('--write');
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateEvidence = ajv.compile(readJson(evidenceSchemaPath));
const bundleCache = new Map();

function fail(message) {
  throw new Error(`plugin-system migration units: ${message}`);
}
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) fail(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}
function ownerId(file) {
  return `${file.target.kind}:${file.target.id}`;
}
function allFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  if (fs.statSync(directory).isFile()) return [directory];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? allFiles(target) : [target];
  });
}
function inside(relativePath, relativeRoot) {
  return relativePath === relativeRoot || relativePath.startsWith(`${relativeRoot}/`);
}
function packageInventory() {
  const packages = new Map();
  for (const packageRoot of ['skills/common/plugins', 'skills/nova/plugins', 'skills/buster/plugins']) {
    for (const manifestPath of allFiles(path.join(root, packageRoot)).filter((file) => path.basename(file) === 'plugin.json')) {
      const manifest = readJson(manifestPath);
      const relativeRoot = path.relative(root, path.dirname(manifestPath)).split(path.sep).join('/');
      const registrations = [
        ...(manifest.stages || []).map((entry) => ({ surface: 'stage', ...entry })),
        ...(manifest.observers || []).map((entry) => ({ surface: 'observer', ...entry })),
        ...(manifest.adapters || []).map((entry) => ({ surface: 'adapter', ...entry })),
      ];
      packages.set(manifest.id, { id: manifest.id, name: path.basename(relativeRoot), root: relativeRoot, registrations });
    }
  }
  return packages;
}
function packageByName(packages, packageName) {
  return [...packages.values()].find((entry) => entry.name === packageName);
}
function canonicalTargetRoots(targetOwnerId, packages) {
  const [kind, id] = targetOwnerId.split(/:(.*)/s);
  const roots = [];
  const exactPackage = packages.get(id);
  if (exactPackage) roots.push(exactPackage.root);
  if (kind === 'core' && id.startsWith('pipeline-core-')) roots.push('skills/common/plugin-runtime/core');
  if (kind === 'plugin-sdk') roots.push('skills/common/plugin-runtime/sdk');
  if (id === 'plugin-system-documentation') {
    roots.push('docs/architecture', 'docs/concepts', 'docs/developers/hooks-and-plugins.md');
  }
  return [...new Set(roots)];
}
function filesAtCommit(commit, paths) {
  return [...new Set(paths)].sort().map((relativePath) => {
    let content;
    try {
      content = execFileSync('git', ['show', `${commit}:${relativePath}`], {
        cwd: root,
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch {
      fail(`evidence commit ${commit} does not contain ${relativePath}`);
    }
    return { path: relativePath, digest: digest(content) };
  });
}
function contentAtCommit(commit, relativePath) {
  try {
    return execFileSync('git', ['show', `${commit}:${relativePath}`], {
      cwd: root,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    fail(`evidence commit ${commit} does not contain ${relativePath}`);
  }
}
function jsonAtCommit(commit, relativePath) {
  return JSON.parse(contentAtCommit(commit, relativePath).toString('utf8'));
}
function pathsAtCommit(commit, relativePath) {
  let output;
  try {
    output = execFileSync('git', ['ls-tree', '-r', '--name-only', commit, '--', relativePath], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    fail(`cannot enumerate ${relativePath} at evidence commit ${commit}`);
  }
  const paths = output.split('\n').filter(Boolean).sort();
  if (paths.length === 0) fail(`evidence commit ${commit} does not contain scenario path ${relativePath}`);
  return paths;
}
function digestFileEntries(entries) {
  return digest(JSON.stringify(entries));
}
function bundleDigestsAtCommit(commit) {
  if (bundleCache.has(commit)) return bundleCache.get(commit);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-parity-commit-'));
  try {
    const archive = execFileSync('git', ['archive', '--format=tar', commit], {
      cwd: root,
      maxBuffer: 512 * 1024 * 1024,
    });
    const extract = spawnSync('tar', ['-xf', '-', '-C', tempRoot], { input: archive, maxBuffer: 512 * 1024 * 1024 });
    if (extract.status !== 0) fail(`cannot extract evidence commit ${commit}`);
    const result = {};
    for (const role of ['nova', 'buster']) {
      const output = path.join(tempRoot, `${role}.tgz`);
      execFileSync('bash', [
        path.join(tempRoot, 'scripts/package-agent-skill-bundle.sh'),
        role,
        output,
        commit,
        'v1',
        '1970-01-01T00:00:00Z',
      ], { cwd: tempRoot, stdio: 'pipe' });
      result[role] = digest(fs.readFileSync(output));
    }
    bundleCache.set(commit, result);
    return result;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}
function evidenceHistory(unitId, excludingPath) {
  if (!fs.existsSync(evidenceRoot)) return [];
  return allFiles(evidenceRoot)
    .filter((file) => file.endsWith('.json') && file !== excludingPath)
    .map((file) => ({ file, record: readJson(file), rawDigest: digest(fs.readFileSync(file)) }))
    .filter((entry) => entry.record.unitId === unitId)
    .sort((a, b) => Date.parse(a.record.recordedAt) - Date.parse(b.record.recordedAt));
}
function validateEvidenceRecord(unit, recordPath) {
  if (!recordPath.startsWith('docs/architecture/plugin-system-parity-evidence/')) {
    fail(`${unit.id} evidence record must use the immutable evidence directory`);
  }
  const absolute = path.join(root, recordPath);
  if (!fs.existsSync(absolute)) fail(`${unit.id} evidence record is missing: ${recordPath}`);
  const record = readJson(absolute);
  if (!validateEvidence(record)) {
    fail(`${recordPath} violates the parity evidence schema: ${ajv.errorsText(validateEvidence.errors)}`);
  }
  if (record.unitId !== unit.id || record.status !== unit.status) fail(`${recordPath} does not match ${unit.id}/${unit.status}`);
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', record.commit, 'HEAD'], { cwd: root, stdio: 'ignore' });
  } catch {
    fail(`${recordPath} commit is not an ancestor of HEAD`);
  }
  if (!path.basename(recordPath).includes(record.commit)) fail(`${recordPath} filename must contain its pinned commit`);

  const pinnedLedger = jsonAtCommit(record.commit, path.relative(root, ledgerPath).split(path.sep).join('/'));
  const pinnedSurfaces = jsonAtCommit(record.commit, path.relative(root, surfaceLedgerPath).split(path.sep).join('/'));
  const pinnedUnit = pinnedLedger.units.find((candidate) => candidate.id === record.unitId);
  if (!pinnedUnit) fail(`${recordPath} unit does not exist at ${record.commit}`);
  const pinnedUnitSurfaces = pinnedSurfaces.surfaces.filter((surface) => surface.unitId === record.unitId);
  if (pinnedUnitSurfaces.length !== pinnedUnit.targetOwnerIds.length) {
    fail(`${recordPath} pinned surface ledger is incomplete at ${record.commit}`);
  }
  const expectedSourcePaths = [...new Set(pinnedUnitSurfaces.flatMap((surface) => surface.legacySourceFiles))].sort();
  const expectedTargetPaths = [...new Set(pinnedUnitSurfaces.flatMap((surface) => surface.targetFiles))].sort();
  if (JSON.stringify(record.sourceFiles.map((entry) => entry.path)) !== JSON.stringify(expectedSourcePaths)) {
    fail(`${recordPath} source file set does not match the inventory-backed unit surface`);
  }
  if (JSON.stringify(record.targetFiles.map((entry) => entry.path)) !== JSON.stringify(expectedTargetPaths)) {
    fail(`${recordPath} target file set does not match the inventory-backed unit surface`);
  }
  const expectedSourceFiles = filesAtCommit(record.commit, expectedSourcePaths);
  const expectedTargetFiles = filesAtCommit(record.commit, expectedTargetPaths);
  if (JSON.stringify(record.sourceFiles) !== JSON.stringify(expectedSourceFiles)
      || record.sourceDigest !== digestFileEntries(expectedSourceFiles)) {
    fail(`${recordPath} source evidence does not match ${record.commit}`);
  }
  if (JSON.stringify(record.targetFiles) !== JSON.stringify(expectedTargetFiles)
      || record.targetDigest !== digestFileEntries(expectedTargetFiles)) {
    fail(`${recordPath} target evidence does not match ${record.commit}`);
  }
  const expectedBundles = bundleDigestsAtCommit(record.commit);
  if (JSON.stringify(record.bundleDigests) !== JSON.stringify(expectedBundles)) {
    fail(`${recordPath} bundle digests do not reproduce from ${record.commit}`);
  }

  const requiredScenarios = pinnedUnit.scenarios
    .filter((scenario) => scenario.requiredBefore.includes(record.status))
    .sort((a, b) => a.id.localeCompare(b.id));
  const expectedScenarios = requiredScenarios.map((scenario) => ({
    id: scenario.id,
    path: scenario.path,
    targetPackage: scenario.targetPackage ?? null,
    disposition: scenario.disposition,
    implementationDecision: scenario.implementationDecision,
    pathDigest: digestFileEntries(filesAtCommit(record.commit, pathsAtCommit(record.commit, scenario.path))),
  }));
  if (JSON.stringify(record.scenarios) !== JSON.stringify(expectedScenarios)
      || record.scenarioDispositionDigest !== digest(JSON.stringify(expectedScenarios))) {
    fail(`${recordPath} scenarios do not reproduce from the declared unit scenarios`);
  }

  const requiredCommands = [
    ...pinnedLedger.parityGates.filter((gate) => gate.requiredBefore.includes(record.status))
      .map((gate) => ({ id: gate.id, command: gate.command })),
    ...requiredScenarios.map((scenario) => ({ id: `scenario:${scenario.id}`, command: scenario.command })),
  ].sort((a, b) => a.id.localeCompare(b.id));
  const recorded = record.results.map((result) => ({ id: result.gateId, command: result.command })).sort((a, b) => a.id.localeCompare(b.id));
  if (JSON.stringify(recorded) !== JSON.stringify(requiredCommands)) fail(`${recordPath} does not contain the exact global and unit gate set`);
  assertUnique(record.results.map((result) => result.gateId), `${recordPath} gate result`);
  for (const result of record.results) {
    const output = path.join(root, result.outputPath);
    if (!fs.existsSync(output) || digest(fs.readFileSync(output)) !== result.outputDigest) {
      fail(`${recordPath} output attestation is missing or changed for ${result.gateId}`);
    }
  }
  const history = evidenceHistory(unit.id, absolute)
    .filter((entry) => Date.parse(entry.record.recordedAt) < Date.parse(record.recordedAt));
  const previous = history.at(-1);
  if ((previous?.rawDigest ?? null) !== record.previousEvidenceDigest) {
    fail(`${recordPath} does not extend the append-only evidence hash chain`);
  }
}

const ledger = readJson(ledgerPath);
const inventory = readJson(inventoryPath);
if (ledger.schemaVersion !== 'plugin-system-migration-units-v2') fail('unsupported schemaVersion');
if (ledger.activationPolicy !== 'v1-remains-sole-active-runtime-until-all-required-units-pass-parity') fail('activationPolicy must preserve v1 authority');
assertUnique(ledger.units.map((unit) => unit.id), 'unit id');
assertUnique(ledger.parityGates.map((gate) => gate.id), 'parity gate id');
const packages = packageInventory();
const allowedStatuses = new Set(ledger.migrationStatuses);
const assignedOwners = [];
const surfaces = [];
const generatedUnits = [];

for (const unit of ledger.units) {
  if (!allowedStatuses.has(unit.status)) fail(`${unit.id} has unsupported status ${unit.status}`);
  if (!unit.roles?.length || !unit.targetOwnerIds?.length || !unit.discoveryHints?.length) fail(`${unit.id} is incomplete`);
  if (!Array.isArray(unit.scenarios) || unit.scenarios.length === 0) fail(`${unit.id} must declare executable scenarios`);
  assertUnique(unit.scenarios.map((scenario) => scenario.id), `${unit.id} scenario id`);
  assignedOwners.push(...unit.targetOwnerIds);
  for (const scenario of unit.scenarios) {
    if (!fs.existsSync(path.join(root, scenario.path))) fail(`${unit.id} scenario path is missing: ${scenario.path}`);
    if (!scenario.command?.trim() || !['offline', 'live'].includes(scenario.level)) fail(`${unit.id}/${scenario.id} is not executable`);
    if (!scenario.requiredBefore?.length) fail(`${unit.id}/${scenario.id} has no status boundary`);
    if (![
      'must-remain-equivalent',
      'intentionally-changed',
      'approved-obsolete',
      'new-v2-foundation',
    ].includes(scenario.disposition)) {
      fail(`${unit.id}/${scenario.id} has an unsupported behavior disposition`);
    }
    if (['parity-proven', 'cutover-complete'].includes(unit.status)
        && scenario.requiredBefore.includes(unit.status)) {
      const decision = scenario.implementationDecision;
      if (!decision
          || !['reuse', 'refactor', 'rewrite'].includes(decision.strategy)
          || !decision.legacyBehavior?.trim()
          || !decision.replacementBehavior?.trim()
          || !decision.rationale?.trim()
          || !decision.complexityImpact?.trim()
          || typeof decision.behaviorChanged !== 'boolean') {
        fail(`${unit.id}/${scenario.id} lacks a complete implementation decision`);
      }
      const changed = ['intentionally-changed', 'approved-obsolete'].includes(scenario.disposition);
      if (decision.behaviorChanged !== changed) {
        fail(`${unit.id}/${scenario.id} behaviorChanged conflicts with disposition ${scenario.disposition}`);
      }
      if (changed && !decision.approvalRef?.trim()) {
        fail(`${unit.id}/${scenario.id} changes behavior without an approval reference`);
      }
      if (!changed && decision.approvalRef !== null) {
        fail(`${unit.id}/${scenario.id} equivalent behavior must use a null approval reference`);
      }
    }
  }
  for (const discoveryHint of unit.discoveryHints) {
    if (!fs.existsSync(path.join(root, discoveryHint))) fail(`${unit.id} references missing discovery hint ${discoveryHint}`);
  }
  const declaredPackages = new Set(unit.targetPackages || []);
  for (const packageName of declaredPackages) {
    if (!packageByName(packages, packageName)) fail(`${unit.id} target package ${packageName} is missing`);
  }
  const declaredReplacementPackages = new Set([...(unit.targetPackages || []), ...(unit.targetExtensions || [])]);
  const replacementScenarioPackages = new Set();
  for (const scenario of unit.scenarios) {
    if (scenario.targetPackage === undefined) continue;
    if (scenario.evidenceType !== 'replacement') fail(`${unit.id}/${scenario.id} targetPackage requires replacement evidence`);
    if (!declaredReplacementPackages.has(scenario.targetPackage)) {
      fail(`${unit.id}/${scenario.id} covers undeclared target package ${scenario.targetPackage}`);
    }
    if (replacementScenarioPackages.has(scenario.targetPackage)) {
      fail(`${unit.id} has multiple replacement scenarios for ${scenario.targetPackage}; use one package-local authoritative scenario`);
    }
    const targetPackage = packageByName(packages, scenario.targetPackage);
    const targetRoot = targetPackage?.root
      ?? (scenario.targetPackage === 'openclaw-agent-observer'
        ? 'skills/common/plugins/openclaw-agent-observer'
        : null);
    if (!targetRoot || !inside(scenario.path, targetRoot)) {
      fail(`${unit.id}/${scenario.id} replacement scenario must live inside ${scenario.targetPackage}`);
    }
    replacementScenarioPackages.add(scenario.targetPackage);
  }
  const uncoveredReplacementPackages = [...declaredReplacementPackages]
    .filter((packageName) => !replacementScenarioPackages.has(packageName))
    .sort();
  if (['parity-proven', 'cutover-complete'].includes(unit.status) && uncoveredReplacementPackages.length) {
    fail(`${unit.id} lacks package-local replacement scenarios for: ${uncoveredReplacementPackages.join(', ')}`);
  }
  if (unit.status === 'baseline-retained' && unit.evidenceRecord !== null) fail(`${unit.id} cannot claim evidence while baseline-retained`);
  if (unit.status !== 'baseline-retained' && unit.status !== 'implementation-in-progress' && unit.parityBlockers?.length) {
    fail(`${unit.id} cannot advance to ${unit.status} with parity blockers`);
  }

  const unitSurfaces = [];
  for (const targetOwnerId of unit.targetOwnerIds) {
    const files = inventory.files.filter((file) => ownerId(file) === targetOwnerId);
    if (files.length === 0) fail(`${unit.id} owner ${targetOwnerId} has no inventory files`);
    const targetRoots = canonicalTargetRoots(targetOwnerId, packages);
    const targetFiles = files.map((file) => file.path).filter((file) => targetRoots.some((targetRoot) => inside(file, targetRoot))).sort();
    const legacySourceFiles = files.map((file) => file.path).filter((file) => !targetFiles.includes(file)).sort();
    const exactPackage = packages.get(targetOwnerId.slice(targetOwnerId.indexOf(':') + 1));
    const targetRegistrations = exactPackage ? exactPackage.registrations.map((registration) => ({
      packageId: exactPackage.id,
      packageRoot: exactPackage.root,
      surface: registration.surface,
      id: registration.id,
      type: registration.type ?? null,
      module: registration.module,
      export: registration.export,
      requiredCapabilities: registration.requiredCapabilities || [],
      providedCapabilities: registration.providesCapabilities || [],
      configSchema: registration.configSchema,
    })) : [];
    const incoming = inventory.dependencyGraph.filter((edge) => edge.to === targetOwnerId);
    const outgoing = inventory.dependencyGraph.filter((edge) => edge.from === targetOwnerId);
    const effects = [...new Set(files.flatMap((file) => file.effects.map((effect) => effect.id)))].sort();
    const ownedEvidence = files.map((file) => file.path)
      .filter((file) => /(?:^|\/)(?:tests?|verification|fixtures?)(?:\/|$)|\.(?:test|spec)\./.test(file))
      .map((evidencePath) => ({ path: evidencePath, disposition: 'must-remain-equivalent' }));
    const surface = {
      ownerId: targetOwnerId,
      unitId: unit.id,
      status: unit.status,
      runtimeRoles: unit.roles,
      legacySourceFiles,
      targetFiles,
      exports: [...new Set(files.flatMap((file) => file.exports))].sort(),
      currentConsumers: incoming.map((edge) => ({ ownerId: edge.from, count: edge.count, samples: edge.samples })),
      currentDependencies: outgoing.map((edge) => ({ ownerId: edge.to, count: edge.count, samples: edge.samples })),
      privilegedEffects: effects.map((effect) => ({ effect, targetAdapter: inventory.effectAdapters[effect] })),
      currentRegistrations: inventory.registrations.filter((registration) =>
        registration.targetPackage === targetOwnerId.slice(targetOwnerId.indexOf(':') + 1)),
      targetRegistrations,
      configurationPaths: files.map((file) => file.path)
        .filter((file) => /(?:config|schema|values|deployment|docker)/i.test(file)).sort(),
      scenarioEvidence: ownedEvidence,
      deletionCriteria: {
        exactPaths: legacySourceFiles,
        requiredStatus: 'cutover-complete',
        requireNoImports: true,
        requireNoConfiguration: true,
        requireNoRuntimeResolution: true,
      },
    };
    surfaces.push(surface);
    unitSurfaces.push(surface);
  }
  const unitSurfaceByOwner = new Map(unitSurfaces.map((surface) => [surface.ownerId, surface]));
  const outgoingPairings = new Map(unitSurfaces.map((surface) => [surface.ownerId, []]));
  const incomingPairings = new Map(unitSurfaces.map((surface) => [surface.ownerId, []]));
  const mappings = unit.replacementMappings || [];
  assertUnique(mappings.map((mapping) => mapping.id), `${unit.id} replacement mapping id`);
  for (const mapping of mappings) {
    if (!['paired', 'blocked', 'new'].includes(mapping.status) || !mapping.rationale?.trim()) {
      fail(`${unit.id}/${mapping.id} has an invalid replacement mapping status or rationale`);
    }
    if (mapping.status !== 'new' && !mapping.legacyOwnerIds?.length) {
      fail(`${unit.id}/${mapping.id} must name legacy owners`);
    }
    if (mapping.status === 'new' && mapping.legacyOwnerIds?.length) {
      fail(`${unit.id}/${mapping.id} new mapping cannot claim legacy owners`);
    }
    if (mapping.status === 'paired' && !mapping.replacementOwnerIds?.length) {
      fail(`${unit.id}/${mapping.id} paired mapping must name replacement owners`);
    }
    if (mapping.status === 'blocked' && mapping.replacementOwnerIds?.length) {
      fail(`${unit.id}/${mapping.id} blocked mapping cannot claim replacement owners`);
    }
    if (mapping.status === 'new' && !mapping.replacementOwnerIds?.length) {
      fail(`${unit.id}/${mapping.id} new mapping must name replacement owners`);
    }
    for (const legacyOwnerId of mapping.legacyOwnerIds || []) {
      const surface = unitSurfaceByOwner.get(legacyOwnerId);
      if (!surface) fail(`${unit.id}/${mapping.id} references an owner outside the unit: ${legacyOwnerId}`);
      if (surface.legacySourceFiles.length === 0) fail(`${unit.id}/${mapping.id} legacy owner has no legacy files: ${legacyOwnerId}`);
      outgoingPairings.get(legacyOwnerId).push(mapping);
    }
    for (const replacementOwnerId of mapping.replacementOwnerIds || []) {
      const surface = unitSurfaceByOwner.get(replacementOwnerId);
      if (!surface) fail(`${unit.id}/${mapping.id} references a replacement outside the unit: ${replacementOwnerId}`);
      if (surface.targetFiles.length === 0) fail(`${unit.id}/${mapping.id} replacement owner has no target files: ${replacementOwnerId}`);
      incomingPairings.get(replacementOwnerId).push(mapping);
    }
  }
  for (const surface of unitSurfaces) {
    const outgoing = outgoingPairings.get(surface.ownerId);
    const incoming = incomingPairings.get(surface.ownerId);
    if (surface.legacySourceFiles.length > 0 && outgoing.length === 0) {
      fail(`${unit.id}/${surface.ownerId} legacy surface has no exact replacement mapping`);
    }
    if (surface.targetFiles.length > 0 && incoming.length === 0) {
      fail(`${unit.id}/${surface.ownerId} replacement surface is not claimed by a legacy mapping`);
    }
    if (['parity-proven', 'cutover-complete'].includes(unit.status)
        && outgoing.some((mapping) => mapping.status === 'blocked')) {
      fail(`${unit.id}/${surface.ownerId} cannot advance while its replacement mapping is blocked`);
    }
    const replacementOwnerIds = [...new Set(outgoing.flatMap((mapping) => mapping.replacementOwnerIds || []))].sort();
    const legacyOwnerIds = [...new Set(incoming.flatMap((mapping) => mapping.legacyOwnerIds || []))].sort();
    surface.replacementPairings = outgoing.map((mapping) => ({
      id: mapping.id,
      status: mapping.status,
      rationale: mapping.rationale,
      replacementOwnerIds: mapping.replacementOwnerIds || [],
    }));
    surface.replacementOwnerIds = replacementOwnerIds;
    surface.replacementFiles = replacementOwnerIds
      .flatMap((owner) => unitSurfaceByOwner.get(owner).targetFiles)
      .filter((file, index, all) => all.indexOf(file) === index)
      .sort();
    surface.replacementRegistrations = replacementOwnerIds
      .flatMap((owner) => unitSurfaceByOwner.get(owner).targetRegistrations);
    surface.legacyPairings = incoming.map((mapping) => ({
      id: mapping.id,
      status: mapping.status,
      rationale: mapping.rationale,
      legacyOwnerIds: mapping.legacyOwnerIds || [],
    }));
    surface.legacyOwnerIds = legacyOwnerIds;
    surface.pairedLegacyFiles = legacyOwnerIds
      .flatMap((owner) => unitSurfaceByOwner.get(owner).legacySourceFiles)
      .filter((file, index, all) => all.indexOf(file) === index)
      .sort();
  }
  if (unit.status !== 'baseline-retained') validateEvidenceRecord(unit, unit.evidenceRecord);
  generatedUnits.push({
    id: unit.id,
    status: unit.status,
    runtimeRoles: unit.roles,
    parityBlockers: unit.parityBlockers || [],
    uncoveredReplacementPackages,
    scenarios: unit.scenarios,
    deploymentDependencies: [
      'scripts/package-agent-skill-bundle.sh',
      ...unit.roles.map((role) => role === 'nova' ? 'docker/Dockerfile.general' : 'docker/Dockerfile.buster-pipeline'),
    ],
  });
}

assertUnique(assignedOwners, 'assigned inventory owner');
assertUnique(surfaces.map((surface) => surface.ownerId), 'generated surface owner');
const inventoryOwners = inventory.ownerCounts.map((entry) => entry.id).sort();
const missingOwners = inventoryOwners.filter((owner) => !assignedOwners.includes(owner));
const unknownOwners = assignedOwners.filter((owner) => !inventoryOwners.includes(owner));
if (missingOwners.length) fail(`unassigned inventory owners: ${missingOwners.join(', ')}`);
if (unknownOwners.length) fail(`unknown inventory owners: ${unknownOwners.join(', ')}`);
for (const required of [
  'inventory', 'role-bundles', 'materialized-runtime', 'source-contracts', 'unit-integration',
  'e2e-contract-tests', 'documentation', 'deployment', 'helm', 'security-audit',
  'repository-hygiene', 'real-e2e-fast', 'real-e2e-full', 'failure-matrix', 'legacy-absence',
]) {
  if (!ledger.parityGates.some((gate) => gate.id === required)) fail(`missing required parity gate ${required}`);
}

const generated = {
  schemaVersion: 'plugin-system-migration-surfaces-v2',
  generatedFrom: {
    inventory: path.relative(root, inventoryPath).split(path.sep).join('/'),
    inventoryDigest: digest(fs.readFileSync(inventoryPath)),
    units: path.relative(root, ledgerPath).split(path.sep).join('/'),
    unitsDigest: digest(fs.readFileSync(ledgerPath)),
  },
  units: generatedUnits.sort((a, b) => a.id.localeCompare(b.id)),
  surfaces: surfaces.sort((a, b) => a.ownerId.localeCompare(b.ownerId)),
};
const expected = stableJson(generated);
if (write) {
  fs.mkdirSync(path.dirname(surfaceLedgerPath), { recursive: true });
  fs.writeFileSync(surfaceLedgerPath, expected);
} else if (!fs.existsSync(surfaceLedgerPath) || fs.readFileSync(surfaceLedgerPath, 'utf8') !== expected) {
  fail('generated surface ledger is stale; run npm run plugin-system:migration:generate');
}
console.log(JSON.stringify({
  ok: true,
  units: ledger.units.length,
  surfaces: surfaces.length,
  inventoryOwners: inventoryOwners.length,
  parityGates: ledger.parityGates.length,
  activeAuthority: ledger.runtimeAuthority,
}));
