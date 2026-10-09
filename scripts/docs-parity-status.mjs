#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { inspectParitySources } from './docs-parity-check.mjs';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const batchConfigPath = 'docs/config/documentation-parity-batches.json';
const batchInventoryPath = 'docs/generated/inventory/documentation-parity-batches.json';
const classificationPath = 'docs/config/documentation-tree-classification.json';
const extractionSummaryPath = 'docs/generated/inventory/documentation-parity-summary.json';
const unitsPath = 'docs/generated/inventory/documentation-parity-units.jsonl';
const decisionsRoot = 'docs/config/documentation-parity';
const reviewsRoot = 'docs/config/documentation-parity-reviews';
const outputPath = 'docs/generated/inventory/documentation-parity-status.json';
const scaffoldMarkerPattern = /^\.documentation-parity-scaffold-([a-z0-9]+(?:-[a-z0-9]+)*)\.(pending|transaction)\.json$/u;

const SOURCE_STATES = Object.freeze([
  'missing-decision', 'untriaged-decision', 'invalid-decision', 'missing-review', 'invalid-review', 'source-valid',
]);
const SOURCE_STATE_SET = new Set(SOURCE_STATES);
const SHA256 = /^[0-9a-f]{64}$/u;
const objectFormats = new Map();

function validGitObject(root, value) {
  const resolved = path.resolve(root);
  if (!objectFormats.has(resolved)) {
    const format = execFileSync('git', ['rev-parse', '--show-object-format'], {
      cwd: resolved, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    assert(['sha1', 'sha256'].includes(format), `${resolved}: unsupported Git object format ${format}`);
    objectFormats.set(resolved, format);
  }
  const length = objectFormats.get(resolved) === 'sha256' ? 64 : 40;
  return typeof value === 'string' && new RegExp(`^[0-9a-f]{${length}}$`, 'u').test(value);
}

function exactKeys(value, expected, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label}: must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label}: unexpected or missing fields`);
}

function nonempty(value, label) {
  assert.equal(typeof value, 'string', `${label}: must be a string`);
  assert(value.trim(), `${label}: must not be empty`);
}

function safeRepositoryPath(root, relative, label, { allowMissing = false } = {}) {
  assert.equal(typeof relative, 'string', `${label}: path must be a string`);
  assert(relative && !relative.includes('\\') && !path.posix.isAbsolute(relative), `${label}: unsafe repository path`);
  assert.equal(path.posix.normalize(relative), relative, `${label}: unsafe repository path`);
  assert(!relative.split('/').includes('..'), `${label}: unsafe repository path`);
  const resolvedRoot = path.resolve(root);
  const absolute = path.resolve(resolvedRoot, relative);
  assert(absolute.startsWith(`${resolvedRoot}${path.sep}`), `${label}: path escapes repository root`);
  let cursor = resolvedRoot;
  for (const component of relative.split('/')) {
    cursor = path.join(cursor, component);
    try {
      const entry = fs.lstatSync(cursor);
      assert(!entry.isSymbolicLink(), `${label}: symlinks are not allowed`);
    } catch (error) {
      if (error?.code === 'ENOENT' && allowMissing) break;
      throw error;
    }
  }
  return absolute;
}

function pathEntryExists(absolute) {
  try { fs.lstatSync(absolute); return true; } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function readJson(root, relative) {
  const absolute = safeRepositoryPath(root, relative, relative);
  assert(fs.lstatSync(absolute).isFile(), `${relative}: must be a regular file`);
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function repositoryRevision(root) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    assert.fail('documentation parity status requires a Git repository with HEAD');
  }
}

function decisionRelative(originalPath) {
  assert(originalPath.startsWith('docs/') && path.posix.normalize(originalPath) === originalPath,
    `${originalPath}: unsafe original path`);
  return `${decisionsRoot}/${originalPath.slice('docs/'.length)}.json`;
}

function reviewRelative(originalPath) {
  assert(originalPath.startsWith('docs/') && path.posix.normalize(originalPath) === originalPath,
    `${originalPath}: unsafe original path`);
  return `${reviewsRoot}/${originalPath.slice('docs/'.length)}.json`;
}

function relativeFiles(root, relative) {
  const start = safeRepositoryPath(root, relative, relative, { allowMissing: true });
  if (!pathEntryExists(start)) return [];
  assert(fs.lstatSync(start).isDirectory(), `${relative}: must be a directory`);
  const result = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const repositoryPath = path.relative(root, absolute).replaceAll('\\', '/');
      assert(!entry.isSymbolicLink(), `${repositoryPath}: symlinks are not parity inputs`);
      if (entry.isDirectory()) visit(absolute);
      else {
        assert(entry.isFile(), `${repositoryPath}: must be a regular file`);
        assert(entry.name.endsWith('.json'), `${repositoryPath}: parity inputs must be JSON files`);
        result.push(repositoryPath);
      }
    }
  };
  visit(start);
  return result.sort();
}

function validateClassification(root, value) {
  exactKeys(value, ['schemaVersion', 'baselineRevision', 'files'], classificationPath);
  assert.equal(value.schemaVersion, 'kubeclaw-documentation-tree-classification.v1',
    `${classificationPath}: unsupported schemaVersion`);
  assert(validGitObject(root, value.baselineRevision), `${classificationPath}: invalid baselineRevision`);
  assert(Array.isArray(value.files), `${classificationPath}.files: must be an array`);
  const seenPaths = new Set();
  const seenOriginals = new Set();
  const sources = [];
  for (const [index, file] of value.files.entries()) {
    const label = `${classificationPath}.files[${index}]`;
    exactKeys(file, ['path', 'class', 'purpose', 'originalPath', 'expectedPath', 'introducedAfterBaseline'], label);
    for (const field of ['path', 'class', 'purpose', 'originalPath', 'expectedPath']) nonempty(file[field], `${label}.${field}`);
    assert.equal(typeof file.introducedAfterBaseline, 'boolean', `${label}.introducedAfterBaseline: must be Boolean`);
    assert(!seenPaths.has(file.path), `${classificationPath}: duplicate path ${file.path}`);
    seenPaths.add(file.path);
    if (file.class !== 'legacy-extraction-source') continue;
    assert(!seenOriginals.has(file.originalPath), `${classificationPath}: duplicate originalPath ${file.originalPath}`);
    seenOriginals.add(file.originalPath);
    assert.equal(file.expectedPath, file.path, `${label}: legacy expectedPath must equal path`);
    assert(file.path.startsWith('docs/_legacy-source/'), `${label}: legacy source is outside its root`);
    safeRepositoryPath(root, file.path, `${label}.path`);
    sources.push(file);
  }
  assert(sources.length > 0, `${classificationPath}: no legacy extraction sources`);
  return sources.sort((left, right) => left.originalPath.localeCompare(right.originalPath));
}

function validateBatches(root, config, inventory, classified) {
  exactKeys(config, ['schemaVersion', 'purpose', 'sourceSetAuthorityRevision', 'sourceSetAuthoritySha256', 'batches'], batchConfigPath);
  assert.equal(config.schemaVersion, 'kubeclaw-documentation-parity-batches.v1', `${batchConfigPath}: unsupported schemaVersion`);
  nonempty(config.purpose, `${batchConfigPath}.purpose`);
  assert(validGitObject(root, config.sourceSetAuthorityRevision), `${batchConfigPath}: invalid sourceSetAuthorityRevision`);
  assert(SHA256.test(config.sourceSetAuthoritySha256), `${batchConfigPath}: invalid sourceSetAuthoritySha256`);
  assert(Array.isArray(config.batches) && config.batches.length > 0, `${batchConfigPath}.batches: must be non-empty`);
  const batchById = new Map();
  for (const [index, batch] of config.batches.entries()) {
    const label = `${batchConfigPath}.batches[${index}]`;
    exactKeys(batch, ['id', 'owner', 'patterns'], label);
    assert(typeof batch.id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(batch.id), `${label}.id: invalid batch id`);
    assert(!batchById.has(batch.id), `${batchConfigPath}: duplicate batch id ${batch.id}`);
    nonempty(batch.owner, `${label}.owner`);
    assert(Array.isArray(batch.patterns) && batch.patterns.length > 0, `${label}.patterns: must be non-empty`);
    const expressions = batch.patterns.map((pattern, patternIndex) => {
      nonempty(pattern, `${label}.patterns[${patternIndex}]`);
      return new RegExp(pattern, 'u');
    });
    batchById.set(batch.id, { id: batch.id, owner: batch.owner, expressions });
  }
  exactKeys(inventory, ['schemaVersion', 'sourceCount', 'batchCount', 'counts', 'assignments'], batchInventoryPath);
  assert.equal(inventory.schemaVersion, 'kubeclaw-documentation-parity-batch-inventory.v1',
    `${batchInventoryPath}: unsupported schemaVersion`);
  assert.equal(inventory.sourceCount, classified.length, `${batchInventoryPath}: sourceCount is stale`);
  assert.equal(inventory.batchCount, batchById.size, `${batchInventoryPath}: batchCount is stale`);
  exactKeys(inventory.counts, [...batchById.keys()], `${batchInventoryPath}.counts`);
  assert(Array.isArray(inventory.assignments), `${batchInventoryPath}.assignments: must be an array`);
  assert.equal(inventory.assignments.length, classified.length, `${batchInventoryPath}: assignment count is stale`);
  const classifiedByOriginal = new Map(classified.map((source) => [source.originalPath, source]));
  const assignmentByOriginal = new Map();
  for (const [index, assignment] of inventory.assignments.entries()) {
    const label = `${batchInventoryPath}.assignments[${index}]`;
    exactKeys(assignment, ['originalPath', 'legacyPath', 'batchId', 'owner'], label);
    assert(!assignmentByOriginal.has(assignment.originalPath), `${batchInventoryPath}: duplicate ${assignment.originalPath}`);
    const source = classifiedByOriginal.get(assignment.originalPath);
    assert(source, `${label}: unknown source ${assignment.originalPath}`);
    assert.equal(assignment.legacyPath, source.path, `${label}: stale legacyPath`);
    const batch = batchById.get(assignment.batchId);
    assert(batch, `${label}: unknown batch ${assignment.batchId}`);
    assert.equal(assignment.owner, batch.owner, `${label}: stale owner`);
    const matches = [...batchById.values()].filter((candidate) => candidate.expressions
      .some((expression) => expression.test(assignment.originalPath)));
    assert.deepEqual(matches.map((candidate) => candidate.id), [assignment.batchId],
      `${label}: configured pattern assignment is stale or ambiguous`);
    assignmentByOriginal.set(assignment.originalPath, assignment);
  }
  for (const batch of batchById.values()) {
    const count = [...assignmentByOriginal.values()].filter((assignment) => assignment.batchId === batch.id).length;
    assert.equal(inventory.counts[batch.id], count, `${batchInventoryPath}.counts.${batch.id}: stale count`);
    assert(count > 0, `${batch.id}: batch has no extraction sources`);
  }
  return { batches: [...batchById.values()].map(({ expressions: _expressions, ...batch }) => batch), assignmentByOriginal };
}

function validateExtraction(root, summary, classified) {
  exactKeys(summary, ['schemaVersion', 'extractorVersion', 'authority', 'baselineAuthority', 'classificationAuthority',
    'batchAuthority', 'baselineRevision', 'sourceSetSha256', 'contentReadPolicy', 'sourceCount', 'markdownSourceCount',
    'svgSourceCount', 'unitCount', 'countsByKind', 'unitsJsonl', 'unitsJsonlSha256', 'sources'], extractionSummaryPath);
  assert.equal(summary.schemaVersion, 'kubeclaw-documentation-parity-summary.v1',
    `${extractionSummaryPath}: unsupported schemaVersion`);
  assert.equal(summary.unitsJsonl, unitsPath, `${extractionSummaryPath}: unexpected unitsJsonl`);
  assert.equal(summary.batchAuthority, batchInventoryPath, `${extractionSummaryPath}: unexpected batchAuthority`);
  assert(/^kubeclaw-documentation-parity-extractor\.v\d+$/u.test(summary.extractorVersion),
    `${extractionSummaryPath}: invalid extractorVersion`);
  assert(validGitObject(root, summary.baselineRevision), `${extractionSummaryPath}: invalid baselineRevision`);
  assert(SHA256.test(summary.sourceSetSha256), `${extractionSummaryPath}: invalid sourceSetSha256`);
  assert(SHA256.test(summary.unitsJsonlSha256), `${extractionSummaryPath}: invalid unitsJsonlSha256`);
  assert.equal(summary.sourceCount, classified.length, `${extractionSummaryPath}: sourceCount is stale`);
  assert(Array.isArray(summary.sources), `${extractionSummaryPath}.sources: must be an array`);
  assert.equal(summary.sources.length, classified.length, `${extractionSummaryPath}: source list is stale`);
  const classifiedByOriginal = new Map(classified.map((source) => [source.originalPath, source]));
  const summaryByOriginal = new Map();
  for (const [index, source] of summary.sources.entries()) {
    const label = `${extractionSummaryPath}.sources[${index}]`;
    exactKeys(source, ['originalPath', 'legacyPath', 'baselineRevision', 'gitObject', 'kind', 'bytes', 'sha256',
      'units', 'unitIdsSha256', 'extractionDigest'], label);
    const classifiedSource = classifiedByOriginal.get(source.originalPath);
    assert(classifiedSource, `${label}: unknown source ${source.originalPath}`);
    assert(!summaryByOriginal.has(source.originalPath), `${extractionSummaryPath}: duplicate ${source.originalPath}`);
    assert.equal(source.legacyPath, classifiedSource.path, `${label}: stale legacyPath`);
    assert.equal(source.baselineRevision, summary.baselineRevision, `${label}: stale baselineRevision`);
    assert(validGitObject(root, source.gitObject), `${label}: invalid gitObject`);
    assert(SHA256.test(source.extractionDigest), `${label}: invalid extractionDigest`);
    assert(Number.isInteger(source.units) && source.units > 0, `${label}: invalid unit count`);
    summaryByOriginal.set(source.originalPath, source);
  }
  const expectedSourceSetSha256 = sha256(canonical({
    schemaVersion: 'kubeclaw-documentation-parity-source-set.v1',
    baselineRevision: summary.baselineRevision,
    sources: [...summary.sources].sort((left, right) => compareText(left.originalPath, right.originalPath))
      .map((source) => ({ originalPath: source.originalPath, legacyPath: source.legacyPath,
        gitObject: source.gitObject, kind: source.kind })),
  }));
  assert.equal(summary.sourceSetSha256, expectedSourceSetSha256,
    `${extractionSummaryPath}: sourceSetSha256 is stale`);
  const unitsAbsolute = safeRepositoryPath(root, unitsPath, unitsPath);
  const unitsBytes = fs.readFileSync(unitsAbsolute);
  assert.equal(sha256(unitsBytes), summary.unitsJsonlSha256, `${extractionSummaryPath}: unitsJsonlSha256 is stale`);
  const unitsByOriginal = new Map(classified.map((source) => [source.originalPath, []]));
  const unitIds = new Set();
  const lines = unitsBytes.toString('utf8').split(/\r?\n/u);
  assert.equal(lines.at(-1), '', `${unitsPath}: must end with a newline`);
  for (const [index, line] of lines.slice(0, -1).entries()) {
    assert(line, `${unitsPath}:${index + 1}: empty records are not allowed`);
    const unit = JSON.parse(line);
    const label = `${unitsPath}:${index + 1}`;
    assert(unit && typeof unit === 'object' && !Array.isArray(unit), `${label}: must be an object`);
    assert.equal(unit.schemaVersion, 'kubeclaw-documentation-parity-unit.v1', `${label}: unsupported schemaVersion`);
    nonempty(unit.unitId, `${label}.unitId`);
    assert(!unitIds.has(unit.unitId), `${label}: duplicate unitId ${unit.unitId}`);
    unitIds.add(unit.unitId);
    const source = summaryByOriginal.get(unit.originalPath);
    assert(source, `${label}: unknown source ${unit.originalPath}`);
    assert.equal(unit.legacyPath, source.legacyPath, `${label}: stale legacyPath`);
    assert.equal(unit.baselineRevision, source.baselineRevision, `${label}: stale baselineRevision`);
    assert.equal(unit.baselineGitObject, source.gitObject, `${label}: stale baselineGitObject`);
    unitsByOriginal.get(unit.originalPath).push(unit.unitId);
  }
  assert.equal(unitIds.size, summary.unitCount, `${extractionSummaryPath}: unitCount is stale`);
  for (const source of summary.sources) assert.equal(unitsByOriginal.get(source.originalPath).length, source.units,
    `${source.originalPath}: extraction unit count is stale`);
  return summaryByOriginal;
}

function validateInspection(root, inspection, sources, summaryByOriginal) {
  exactKeys(inspection, ['schemaVersion', 'validatedRevision', 'globalFindings', 'sources', 'valid'], 'parity inspection');
  assert.equal(inspection.schemaVersion, 'kubeclaw-documentation-parity-inspection.v1',
    'parity inspection: unsupported schemaVersion');
  assert(Array.isArray(inspection.globalFindings), 'parity inspection.globalFindings: must be an array');
  for (const [index, finding] of inspection.globalFindings.entries()) {
    exactKeys(finding, ['kind', 'detail'], `parity inspection.globalFindings[${index}]`);
    assert.equal(finding.kind, 'authority-or-tool-error', `parity inspection.globalFindings[${index}]: invalid kind`);
    nonempty(finding.detail, `parity inspection.globalFindings[${index}].detail`);
  }
  assert.equal(inspection.globalFindings.length, 0,
    `parity inspection failed: ${inspection.globalFindings.map((finding) => finding.detail).join('; ')}`);
  assert(validGitObject(root, inspection.validatedRevision), 'parity inspection: validatedRevision must be a Git commit');
  assert.equal(inspection.validatedRevision, repositoryRevision(root),
    'parity inspection: validatedRevision differs from repository HEAD');
  assert(Array.isArray(inspection.sources), 'parity inspection.sources: must be an array');
  assert.equal(inspection.sources.length, sources.length, 'parity inspection: source set is incomplete');
  const sourceByOriginal = new Map(sources.map((source) => [source.originalPath, source]));
  const records = new Map();
  for (const [index, record] of inspection.sources.entries()) {
    const label = `parity inspection.sources[${index}]`;
    exactKeys(record, ['originalPath', 'legacyPath', 'baselineRevision', 'gitObject', 'extractionDigest', 'unitCount',
      'decisionPath', 'reviewPath', 'state', 'findings'], label);
    assert(!records.has(record.originalPath), `parity inspection: duplicate ${record.originalPath}`);
    const source = sourceByOriginal.get(record.originalPath);
    const summary = summaryByOriginal.get(record.originalPath);
    assert(source && summary, `${label}: unknown source ${record.originalPath}`);
    assert.equal(record.legacyPath, source.path, `${label}: stale legacyPath`);
    assert.equal(record.baselineRevision, summary.baselineRevision, `${label}: stale baselineRevision`);
    assert.equal(record.gitObject, summary.gitObject, `${label}: stale gitObject`);
    assert.equal(record.extractionDigest, summary.extractionDigest, `${label}: stale extractionDigest`);
    assert.equal(record.unitCount, summary.units, `${label}: stale unitCount`);
    assert.equal(record.decisionPath, decisionRelative(record.originalPath), `${label}: invalid decisionPath`);
    assert.equal(record.reviewPath, reviewRelative(record.originalPath), `${label}: invalid reviewPath`);
    assert(SOURCE_STATE_SET.has(record.state), `${label}: invalid categorical state ${String(record.state)}`);
    assert(Array.isArray(record.findings) && record.findings.every((finding) => typeof finding === 'string'),
      `${label}.findings: must be an array of strings`);
    records.set(record.originalPath, record);
  }
  assert.equal(inspection.valid, inspection.sources.every((record) => record.state === 'source-valid'),
    'parity inspection.valid is inconsistent with categorical source states');
  return records;
}

function validateParityDirectories(root, sources) {
  const expectedDecisions = new Set(sources.map((source) => decisionRelative(source.originalPath)));
  const expectedReviews = new Set(sources.map((source) => reviewRelative(source.originalPath)));
  for (const relative of relativeFiles(root, decisionsRoot)) assert(expectedDecisions.has(relative),
    `${relative}: decision does not belong to a classified legacy source`);
  for (const relative of relativeFiles(root, reviewsRoot)) assert(expectedReviews.has(relative),
    `${relative}: review does not belong to a classified legacy source`);
}

function loadInputs(root, inspector) {
  const sources = validateClassification(root, readJson(root, classificationPath));
  const { batches, assignmentByOriginal } = validateBatches(
    root, readJson(root, batchConfigPath), readJson(root, batchInventoryPath), sources);
  const summaryByOriginal = validateExtraction(root, readJson(root, extractionSummaryPath), sources);
  validateParityDirectories(root, sources);
  const inspectionByOriginal = validateInspection(root, inspector({ root }), sources, summaryByOriginal);
  return { batches, sources, assignmentByOriginal, inspectionByOriginal };
}

function emptyCounts() { return Object.fromEntries(SOURCE_STATES.map((state) => [state, 0])); }

export function buildStatusInventory(root = defaultRoot, { inspector = inspectParitySources } = {}) {
  const inputs = loadInputs(root, inspector);
  const records = inputs.sources.map((source) => {
    const assignment = inputs.assignmentByOriginal.get(source.originalPath);
    const inspection = inputs.inspectionByOriginal.get(source.originalPath);
    return { originalPath: inspection.originalPath, legacyPath: inspection.legacyPath,
      decisionPath: inspection.decisionPath, reviewPath: inspection.reviewPath, state: inspection.state,
      findings: inspection.findings, batchId: assignment.batchId, owner: assignment.owner };
  });
  const counts = emptyCounts();
  for (const record of records) counts[record.state] += 1;
  return {
    schemaVersion: 'kubeclaw-documentation-parity-status.v1',
    sourceCount: records.length,
    batchCount: inputs.batches.length,
    sourceValidationComplete: counts['source-valid'] === records.length,
    globalDeletionReady: false,
    counts,
    batches: inputs.batches.map((batch) => {
      const batchSources = records.filter((record) => record.batchId === batch.id)
        .map(({ batchId: _batchId, owner: _owner, ...record }) => record);
      const batchCounts = emptyCounts();
      for (const record of batchSources) batchCounts[record.state] += 1;
      return { id: batch.id, owner: batch.owner, sourceCount: batchSources.length,
        sourceValid: batchCounts['source-valid'] === batchSources.length, counts: batchCounts, sources: batchSources };
    }),
  };
}

function scaffoldValue(inspection) {
  return { schemaVersion: 'kubeclaw-documentation-parity-untriaged.v1', status: 'untriaged', source: {
    originalPath: inspection.originalPath, legacyPath: inspection.legacyPath, classification: 'legacy-extraction-source',
    baselineRevision: inspection.baselineRevision, gitObject: inspection.gitObject,
    extractionDigest: inspection.extractionDigest,
  } };
}

function fsyncDirectory(directory) {
  const flags = fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0);
  const descriptor = fs.openSync(directory, flags);
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

function writeDurableExclusive(absolute, rendered) {
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW;
  const descriptor = fs.openSync(absolute, flags, 0o600);
  try {
    fs.writeFileSync(descriptor, rendered, 'utf8');
    fs.fsyncSync(descriptor);
  } finally { fs.closeSync(descriptor); }
  fsyncDirectory(path.dirname(absolute));
}

function durableUnlink(absolute) {
  try {
    fs.unlinkSync(absolute);
    fsyncDirectory(path.dirname(absolute));
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function fileIdentity(absolute) {
  const entry = fs.lstatSync(absolute, { bigint: true });
  assert(entry.isFile() && !entry.isSymbolicLink(), `${absolute}: transaction member must be a regular file`);
  return { dev: entry.dev.toString(), ino: entry.ino.toString() };
}

function matchesIdentity(absolute, identity) {
  try {
    const entry = fs.lstatSync(absolute, { bigint: true });
    return entry.isFile() && !entry.isSymbolicLink()
      && entry.dev.toString() === identity.dev && entry.ino.toString() === identity.ino
      && sha256(fs.readFileSync(absolute)) === identity.sha256;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function scaffoldMarkerRelative(batchId, phase) {
  return `docs/config/.documentation-parity-scaffold-${batchId}.${phase}.json`;
}

function processStartIdentity(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(') ') + 2).trim().split(/\s+/u);
    return fields[19] ?? null;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function transactionOwnerIsAlive(record) {
  if (record.processStart !== null) return processStartIdentity(record.pid) === record.processStart;
  try { process.kill(record.pid, 0); return true; } catch (error) {
    if (error?.code === 'ESRCH') return false;
    if (error?.code === 'EPERM') return true;
    throw error;
  }
}

function scaffoldMarkers(root) {
  const config = safeRepositoryPath(root, 'docs/config', 'docs/config', { allowMissing: true });
  if (!pathEntryExists(config)) return [];
  assert(fs.lstatSync(config).isDirectory(), 'docs/config: must be a directory');
  return fs.readdirSync(config, { withFileTypes: true }).flatMap((entry) => {
    const match = scaffoldMarkerPattern.exec(entry.name);
    if (!match) return [];
    assert(entry.isFile() && !entry.isSymbolicLink(), `docs/config/${entry.name}: unsafe scaffold transaction marker`);
    return [{ batchId: match[1], phase: match[2], relative: `docs/config/${entry.name}`,
      absolute: path.join(config, entry.name) }];
  });
}

function validateScaffoldRecord(root, marker, value, expectedEntries) {
  exactKeys(value, ['schemaVersion', 'batchId', 'transactionId', 'pid', 'processStart', 'entries'], marker.relative);
  assert.equal(value.schemaVersion, `kubeclaw-documentation-parity-scaffold-${marker.phase}.v1`,
    `${marker.relative}: unsupported schemaVersion`);
  assert.equal(value.batchId, marker.batchId, `${marker.relative}: batchId does not match marker name`);
  assert(typeof value.transactionId === 'string' && /^[0-9a-f-]{36}$/u.test(value.transactionId),
    `${marker.relative}: invalid transactionId`);
  assert(Number.isSafeInteger(value.pid) && value.pid > 0, `${marker.relative}: invalid pid`);
  assert(value.processStart === null || (typeof value.processStart === 'string' && /^\d+$/u.test(value.processStart)),
    `${marker.relative}: invalid processStart`);
  assert(Array.isArray(value.entries) && value.entries.length > 0, `${marker.relative}: entries must be non-empty`);
  const targets = new Set();
  const temporaries = new Set();
  for (const [index, entry] of value.entries.entries()) {
    const label = `${marker.relative}.entries[${index}]`;
    exactKeys(entry, marker.phase === 'pending' ? ['target', 'temporary', 'sha256']
      : ['target', 'temporary', 'sha256', 'dev', 'ino'], label);
    assert(entry.target.startsWith(`${decisionsRoot}/`), `${label}.target: outside decisions root`);
    const target = safeRepositoryPath(root, entry.target, `${label}.target`, { allowMissing: true });
    const temporary = safeRepositoryPath(root, entry.temporary, `${label}.temporary`, { allowMissing: true });
    assert.equal(path.dirname(temporary), path.dirname(target), `${label}: temporary must share the target directory`);
    assert.equal(path.basename(temporary), `.${path.basename(target)}.scaffold-${value.transactionId}.tmp`,
      `${label}.temporary: unexpected transaction temporary`);
    assert(SHA256.test(entry.sha256), `${label}.sha256: invalid digest`);
    const expected = expectedEntries.get(entry.target);
    assert(expected, `${label}.target: not an exact target in batch ${marker.batchId}`);
    assert.equal(entry.sha256, expected.sha256, `${label}.sha256: does not match the exact scaffold content`);
    if (marker.phase === 'transaction') {
      assert(typeof entry.dev === 'string' && /^\d+$/u.test(entry.dev), `${label}.dev: invalid identity`);
      assert(typeof entry.ino === 'string' && /^\d+$/u.test(entry.ino), `${label}.ino: invalid identity`);
    }
    assert(!targets.has(entry.target), `${marker.relative}: duplicate target ${entry.target}`);
    assert(!temporaries.has(entry.temporary), `${marker.relative}: duplicate temporary ${entry.temporary}`);
    targets.add(entry.target);
    temporaries.add(entry.temporary);
  }
  return value;
}

function readScaffoldRecord(root, marker, expectedEntries) {
  return validateScaffoldRecord(root, marker, JSON.parse(fs.readFileSync(marker.absolute, 'utf8')), expectedEntries);
}

function rollbackScaffoldRecord(root, record, phase, markerPaths, trustedPendingOwner = false) {
  const conflicts = [];
  for (const entry of [...record.entries].reverse()) {
    const target = safeRepositoryPath(root, entry.target, entry.target, { allowMissing: true });
    const temporary = safeRepositoryPath(root, entry.temporary, entry.temporary, { allowMissing: true });
    if (phase === 'transaction') {
      for (const [kind, absolute] of [['target', target], ['temporary', temporary]]) {
        if (!pathEntryExists(absolute)) continue;
        if (!matchesIdentity(absolute, entry)) conflicts.push(`${entry[kind]} changed outside the scaffold transaction`);
        else durableUnlink(absolute);
      }
    } else {
      if (pathEntryExists(target)) conflicts.push(`${entry.target} appeared before a durable transaction marker`);
      if (pathEntryExists(temporary)) {
        const temporaryEntry = fs.lstatSync(temporary);
        assert(temporaryEntry.isFile() && !temporaryEntry.isSymbolicLink(),
          `${entry.temporary}: unsafe pending transaction member`);
        if (trustedPendingOwner) durableUnlink(temporary);
        else conflicts.push(`${entry.temporary} has no durable file identity`);
      }
    }
  }
  assert.deepEqual(conflicts, [], `scaffold recovery refused to remove author work:\n${conflicts.join('\n')}`);
  for (const markerPath of markerPaths) durableUnlink(markerPath);
}

function recoverScaffoldTransactions(root, requestedBatchId) {
  const markers = scaffoldMarkers(root);
  assert(markers.every((marker) => marker.batchId === requestedBatchId),
    `unfinished scaffold belongs to ${markers.find((marker) => marker.batchId !== requestedBatchId)?.batchId}; `
    + 'rerun --scaffold with that exact batch id');
  const sources = validateClassification(root, readJson(root, classificationPath));
  const { assignmentByOriginal } = validateBatches(
    root, readJson(root, batchConfigPath), readJson(root, batchInventoryPath), sources);
  const summaryByOriginal = validateExtraction(root, readJson(root, extractionSummaryPath), sources);
  const expectedEntries = new Map(sources
    .filter((source) => assignmentByOriginal.get(source.originalPath).batchId === requestedBatchId)
    .map((source) => {
      const summary = summaryByOriginal.get(source.originalPath);
      const inspection = { originalPath: source.originalPath, legacyPath: source.path,
        baselineRevision: summary.baselineRevision, gitObject: summary.gitObject,
        extractionDigest: summary.extractionDigest, decisionPath: decisionRelative(source.originalPath) };
      const rendered = `${JSON.stringify(scaffoldValue(inspection), null, 2)}\n`;
      return [inspection.decisionPath, { sha256: sha256(rendered) }];
    }));
  const batches = [...new Set(markers.map((marker) => marker.batchId))];
  for (const batchId of batches) {
    const batchMarkers = markers.filter((marker) => marker.batchId === batchId);
    const transactionMarker = batchMarkers.find((marker) => marker.phase === 'transaction');
    const pendingMarker = batchMarkers.find((marker) => marker.phase === 'pending');
    const marker = transactionMarker ?? pendingMarker;
    const pendingRecord = pendingMarker ? readScaffoldRecord(root, pendingMarker, expectedEntries) : null;
    const transactionRecord = transactionMarker ? readScaffoldRecord(root, transactionMarker, expectedEntries) : null;
    if (pendingRecord && transactionRecord) {
      assert.equal(transactionRecord.transactionId, pendingRecord.transactionId,
        `${transactionMarker.relative}: transactionId differs from pending marker`);
      assert.deepEqual(transactionRecord.entries.map(({ dev: _dev, ino: _ino, ...entry }) => entry),
        pendingRecord.entries, `${transactionMarker.relative}: entries differ from pending marker`);
    }
    const record = transactionRecord ?? pendingRecord;
    assert(!transactionOwnerIsAlive(record),
      `${marker.relative}: scaffold transaction is still owned by live process ${record.pid}`);
    rollbackScaffoldRecord(root, record, marker.phase, batchMarkers.map((item) => item.absolute));
  }
}

function checkpoint(injector, phase, detail = {}) { injector?.(phase, detail); }

function ensureScaffoldDirectories(root, planned, injector) {
  const resolvedRoot = path.resolve(root);
  const directories = new Set();
  for (const item of planned) {
    let cursor = path.dirname(item.absolute);
    while (cursor !== resolvedRoot && !pathEntryExists(cursor)) {
      directories.add(cursor);
      cursor = path.dirname(cursor);
    }
    assert(fs.lstatSync(cursor).isDirectory(), `${item.relative}: parent is not a directory`);
  }
  for (const directory of [...directories].sort((left, right) => left.length - right.length)) {
    checkpoint(injector, 'directory-before-create', { directory });
    try { fs.mkdirSync(directory); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
    const entry = fs.lstatSync(directory);
    assert(entry.isDirectory() && !entry.isSymbolicLink(), `${directory}: scaffold parent must be a real directory`);
    fsyncDirectory(path.dirname(directory));
    checkpoint(injector, 'directory-after-fsync', { directory });
  }
}

function scaffoldBatch(root, batchId, inspector, injector) {
  const inputs = loadInputs(root, inspector);
  assert(inputs.batches.some((batch) => batch.id === batchId), `unknown parity batch ${batchId}`);
  const candidates = inputs.sources.map((source) => inputs.inspectionByOriginal.get(source.originalPath))
    .filter((inspection) => inputs.assignmentByOriginal.get(inspection.originalPath).batchId === batchId
      && inspection.state === 'missing-decision');
  const transactionId = crypto.randomUUID();
  const planned = candidates.map((inspection) => {
    const relative = inspection.decisionPath;
    const absolute = safeRepositoryPath(root, relative, relative, { allowMissing: true });
    assert(!pathEntryExists(absolute), `${relative}: refusing to overwrite an existing path`);
    const rendered = `${JSON.stringify(scaffoldValue(inspection), null, 2)}\n`;
    const temporary = path.join(path.dirname(absolute), `.${path.basename(absolute)}.scaffold-${transactionId}.tmp`);
    return { inspection, relative, absolute, rendered, temporary,
      temporaryRelative: path.relative(root, temporary).replaceAll('\\', '/') };
  });
  if (planned.length === 0) return { count: 0, rollback: () => {}, finalize: () => {} };
  const pendingRelative = scaffoldMarkerRelative(batchId, 'pending');
  const transactionRelative = scaffoldMarkerRelative(batchId, 'transaction');
  const pendingAbsolute = safeRepositoryPath(root, pendingRelative, pendingRelative, { allowMissing: true });
  const transactionAbsolute = safeRepositoryPath(root, transactionRelative, transactionRelative, { allowMissing: true });
  const pending = { schemaVersion: 'kubeclaw-documentation-parity-scaffold-pending.v1', batchId, transactionId,
    pid: process.pid, processStart: processStartIdentity(process.pid),
    entries: planned.map((item) => ({ target: item.relative, temporary: item.temporaryRelative,
      sha256: sha256(item.rendered) })) };
  let transaction;
  let active = true;
  try {
    checkpoint(injector, 'pending-before-open', { batchId });
    writeDurableExclusive(pendingAbsolute, `${JSON.stringify(pending, null, 2)}\n`);
    checkpoint(injector, 'pending-after-fsync', { batchId });
    ensureScaffoldDirectories(root, planned, injector);
    for (const item of planned) {
      safeRepositoryPath(root, item.temporaryRelative, item.temporaryRelative, { allowMissing: true });
      checkpoint(injector, 'stage-before-open', { target: item.relative });
      const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW;
      const descriptor = fs.openSync(item.temporary, flags, 0o600);
      try {
        checkpoint(injector, 'stage-after-open', { target: item.relative });
        fs.writeFileSync(descriptor, item.rendered, 'utf8');
        checkpoint(injector, 'stage-after-write', { target: item.relative });
        fs.fsyncSync(descriptor);
        checkpoint(injector, 'stage-after-fsync', { target: item.relative });
      } finally { fs.closeSync(descriptor); }
      fsyncDirectory(path.dirname(item.temporary));
      checkpoint(injector, 'stage-after-directory-fsync', { target: item.relative });
    }
    transaction = { schemaVersion: 'kubeclaw-documentation-parity-scaffold-transaction.v1', batchId, transactionId,
      pid: process.pid, processStart: pending.processStart,
      entries: planned.map((item, index) => ({ ...pending.entries[index], ...fileIdentity(item.temporary) })) };
    checkpoint(injector, 'transaction-before-open', { batchId });
    writeDurableExclusive(transactionAbsolute, `${JSON.stringify(transaction, null, 2)}\n`);
    checkpoint(injector, 'transaction-after-fsync', { batchId });
    durableUnlink(pendingAbsolute);
    checkpoint(injector, 'pending-after-unlink', { batchId });
    for (const [index, item] of planned.entries()) {
      assert(!pathEntryExists(item.absolute), `${item.relative}: refusing to overwrite an existing path`);
      checkpoint(injector, 'commit-before-link', { target: item.relative });
      fs.linkSync(item.temporary, item.absolute);
      checkpoint(injector, 'commit-after-link', { target: item.relative });
      fsyncDirectory(path.dirname(item.absolute));
      checkpoint(injector, 'commit-after-directory-fsync', { target: item.relative });
      durableUnlink(item.temporary);
      checkpoint(injector, 'commit-after-temporary-unlink', { target: item.relative });
      assert(matchesIdentity(item.absolute, transaction.entries[index]), `${item.relative}: committed identity changed`);
    }
    const rollback = () => {
      if (!active) return;
      rollbackScaffoldRecord(root, transaction, 'transaction', [transactionAbsolute, pendingAbsolute]);
      active = false;
    };
    const finalize = () => {
      if (!active) return;
      checkpoint(injector, 'finalize-before-marker-unlink', { batchId });
      durableUnlink(transactionAbsolute);
      active = false;
      checkpoint(injector, 'finalize-after-marker-unlink', { batchId });
    };
    return { count: planned.length, rollback, finalize };
  } catch (error) {
    rollbackScaffoldRecord(root, transaction ?? pending, transaction ? 'transaction' : 'pending',
      [transactionAbsolute, pendingAbsolute], !transaction);
    active = false;
    throw error;
  }
}

function writeAtomic(root, relative, rendered) {
  const absolute = safeRepositoryPath(root, relative, relative, { allowMissing: true });
  const directory = path.dirname(absolute);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${absolute}.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`;
  try {
    fs.writeFileSync(temporary, rendered, { flag: 'wx' });
    fs.renameSync(temporary, absolute);
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
}

export function runCli({ root = defaultRoot, args = process.argv.slice(2), inspector = inspectParitySources,
  scaffoldFailureInjector } = {}) {
  const checkArguments = args.filter((argument) => argument === '--check');
  const scaffoldArguments = args.filter((argument) => argument === '--scaffold');
  const batchArguments = args.filter((argument) => argument.startsWith('--batch='));
  for (const argument of args) assert(argument === '--check' || argument === '--scaffold' || argument.startsWith('--batch='),
    `unknown argument ${argument}`);
  assert(checkArguments.length <= 1 && scaffoldArguments.length <= 1 && batchArguments.length <= 1,
    'duplicate arguments are not allowed');
  const checkOnly = checkArguments.length === 1;
  const scaffold = scaffoldArguments.length === 1;
  assert(!(checkOnly && scaffold), '--check and --scaffold cannot be combined');
  assert.equal(batchArguments.length, scaffold ? 1 : 0, '--batch=<exact-id> is required only with --scaffold');
  const batchId = batchArguments[0]?.slice('--batch='.length);
  if (scaffold) assert(batchId, '--batch=<exact-id> requires a non-empty exact id');
  let created = 0;
  let rollback = () => {};
  let finalize = () => {};
  try {
    if (scaffold) {
      recoverScaffoldTransactions(root, batchId);
      ({ count: created, rollback, finalize } = scaffoldBatch(root, batchId, inspector, scaffoldFailureInjector));
    } else {
      const markers = scaffoldMarkers(root);
      assert.equal(markers.length, 0,
        `unfinished scaffold transaction ${markers[0]?.relative}; rerun --scaffold with its exact batch id to recover`);
    }
    const inventory = buildStatusInventory(root, { inspector });
    const rendered = `${JSON.stringify(inventory, null, 2)}\n`;
    const absoluteOutput = safeRepositoryPath(root, outputPath, outputPath, { allowMissing: true });
    if (checkOnly) {
      assert(pathEntryExists(absoluteOutput), `${outputPath} is missing; run npm run docs:parity:status`);
      assert.equal(fs.readFileSync(absoluteOutput, 'utf8'), rendered,
        `${outputPath} is stale; run npm run docs:parity:status`);
    } else {
      if (scaffold) finalize();
      writeAtomic(root, outputPath, rendered);
    }
    const prefix = checkOnly ? 'checked' : 'generated';
    process.stdout.write(`${prefix} documentation parity status (${inventory.sourceCount} sources in ${inventory.batchCount} batches` +
      `${scaffold ? `; ${created} scaffolds created for ${batchId}` : ''})\n`);
    return inventory;
  } catch (error) {
    if (scaffold) rollback();
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { runCli(); } catch (error) {
    process.stderr.write(`documentation parity status: FAIL\n${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}
