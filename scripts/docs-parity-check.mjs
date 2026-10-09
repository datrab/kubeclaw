#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

import { buildParityInventory, extractionBindingDigest } from './docs-parity-extract.mjs';
import { readinessGateCommands as REQUIRED_GATES } from './lib/docs-parity-gates.mjs';
import { markdownAnchorEntries } from './lib/docs-markdown-anchors.mjs';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const classificationPath = 'docs/config/documentation-tree-classification.json';
const baselinePath = 'docs/config/documentation-tree-baseline.json';
const unitsPath = 'docs/generated/inventory/documentation-parity-units.jsonl';
const extractionSummaryPath = 'docs/generated/inventory/documentation-parity-summary.json';
const decisionsRoot = 'docs/config/documentation-parity';
const reviewsRoot = 'docs/config/documentation-parity-reviews';
const assignmentsPath = 'docs/config/documentation-parity-review-assignments.json';
const deletionManifestPath = 'docs/generated/inventory/documentation-deletion-manifest.json';
const routeRegistryPath = 'docs/site/reference/documentation-route-registry.json';
const ACTIVE_DEPENDENCY_SCANNER_VERSION = 'kubeclaw-documentation-active-dependency-scanner.v2';
const ACTIVE_DEPENDENCY_LIMITATION = 'Static literal, link, and simple path-composition scanning is not complete program analysis; independent reviewer attestation remains required.';

const SHA256 = /^[0-9a-f]{64}$/u;
const CLAIM_TYPES = new Set([
  'fact', 'decision', 'reason', 'constraint', 'procedure', 'configuration', 'failure', 'recovery',
  'security-boundary', 'example', 'status-or-limit', 'source-evidence', 'visual-relationship',
  'navigation-only', 'project-administration',
]);
const TRUTH_STATES = new Set([
  'current', 'historical-decision', 'obsolete-or-incorrect', 'non-reader-content', 'unknown', 'unreviewed',
]);
const DISPOSITIONS = new Set(['mapped', 'omitted', 'open']);
const OMISSION_REASONS = new Set([
  'obsolete-or-incorrect', 'transient-project-administration', 'navigation-only',
  'template-placeholder', 'non-semantic-decoration',
]);
const EVIDENCE_BASES = new Set([
  'current-implementation', 'current-contract', 'current-schema', 'current-configuration',
  'current-test', 'documentation-governance',
]);
const REVIEW_DIMENSIONS = ['semanticParity', 'currentAccuracy', 'targetSpecificity', 'dispositionJustification'];
const TARGET_RELATIONS = new Set(['equivalent', 'expanded', 'split', 'combined']);
const CODE_CLASSIFICATIONS = new Set([
  'runnable-example', 'configuration-example', 'expected-output', 'illustrative-pseudocode',
  'identifier-list', 'obsolete-example',
]);
const GENERATED_OR_REVIEW_PATH = /(?:^|\/)(?:\.tmp|artifacts|generated|review|reviews|node_modules|dist|build|coverage|vendor)(?:\/|$)|(?:^|\/)[^/]*(?:\.generated\.|-generated\.)/u;
const IMPLEMENTATION_EXTENSION = /\.(?:c|cc|cpp|cs|go|java|js|jsx|kt|mjs|mts|php|py|rb|rs|sh|ts|tsx)$/u;
const TEST_PATH = /(?:^|\/)(?:__tests__|test|tests)(?:\/|$)|(?:^|\/)[^/]+\.(?:spec|test)\.[^/]+$/u;
const BEHAVIORAL_CLAIM_TYPES = new Set([
  'fact', 'decision', 'reason', 'constraint', 'procedure', 'configuration', 'failure', 'recovery',
  'security-boundary', 'example', 'status-or-limit', 'source-evidence', 'visual-relationship',
]);
export const readinessGateCommands = REQUIRED_GATES;
const PARITY_SOURCE_STATES = Object.freeze([
  'missing-decision', 'untriaged-decision', 'invalid-decision', 'missing-review', 'invalid-review', 'source-valid',
]);

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const gitObjectFormats = new Map();

function repositoryObjectFormat(root) {
  const resolved = path.resolve(root);
  if (!gitObjectFormats.has(resolved)) {
    const format = git(resolved, ['rev-parse', '--show-object-format']).trim();
    assert(['sha1', 'sha256'].includes(format), `${resolved}: unsupported Git object format ${format}`);
    gitObjectFormats.set(resolved, format);
  }
  return gitObjectFormats.get(resolved);
}

export function validGitObject(value, root) {
  const length = repositoryObjectFormat(root) === 'sha256' ? 64 : 40;
  return typeof value === 'string' && new RegExp(`^[0-9a-f]{${length}}$`, 'u').test(value);
}

function gitObject(buffer, root = defaultRoot) {
  const algorithm = repositoryObjectFormat(root);
  return crypto.createHash(algorithm).update(`blob ${buffer.length}\0`).update(buffer).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function normalizeExcerpt(value) {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n').replace(/\s+/gu, ' ').trim();
}

function readJson(root, relative) {
  return JSON.parse(fs.readFileSync(safeRepositoryPath(root, relative, relative), 'utf8'));
}

function relativeFiles(root, start) {
  const absolute = path.join(root, start);
  if (!fs.existsSync(absolute)) return [];
  const result = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const item = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`${path.relative(root, item)}: symlinks are not parity evidence`);
      if (entry.isDirectory()) visit(item);
      else if (entry.isFile()) result.push(path.relative(root, item).replaceAll('\\', '/'));
    }
  };
  visit(absolute);
  return result.sort();
}

function repositoryFiles(root) {
  try {
    return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0').filter(Boolean).sort();
  } catch {
    const result = [];
    const visit = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (['.git', 'node_modules'].includes(entry.name)) continue;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(absolute);
        else if (entry.isFile()) result.push(path.relative(root, absolute).replaceAll('\\', '/'));
      }
    };
    visit(root);
    return result.sort();
  }
}

function git(root, args, options = {}) {
  return execFileSync('git', args, {
    cwd: root,
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' },
    encoding: options.encoding ?? 'utf8',
    maxBuffer: options.maxBuffer ?? 128 * 1024 * 1024,
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  });
}

function documentationKind(repositoryPath) {
  const extension = path.extname(repositoryPath).toLowerCase();
  if (extension === '.md') return 'markdown';
  if (extension === '.json' || extension === '.jsonl') return 'structured-json';
  if (extension === '.yaml' || extension === '.yml') return 'structured-yaml';
  if (extension === '.svg') return 'diagram';
  return extension ? extension.slice(1) : 'extensionless';
}

function immutableDocumentationTree(root, revision) {
  return git(root, ['ls-tree', '-r', '-z', '--full-tree', revision, '--', 'docs'])
    .split('\0').filter(Boolean).map((line) => {
      const match = /^(\d+)\s+(\S+)\s+([0-9a-f]+)\t(.+)$/u.exec(line);
      assert(match, `cannot parse immutable documentation tree entry: ${line}`);
      assert.equal(match[2], 'blob', `${match[4]}: immutable documentation entry is not a blob`);
      assert(['100644', '100755'].includes(match[1]), `${match[4]}: immutable documentation entry is not a regular file`);
      return { originalPath: match[4], gitObject: match[3], mode: match[1], kind: documentationKind(match[4]) };
    }).sort((left, right) => compareText(left.originalPath, right.originalPath));
}

function gitContext(root) {
  try {
    const head = git(root, ['rev-parse', 'HEAD']).trim();
    return { available: true, head };
  } catch {
    return { available: false, head: null };
  }
}

function assertReadinessTree(root, revision, allowDeletionManifestOutput = false, phase = 'full deletion readiness') {
  assert.equal(git(root, ['rev-parse', 'HEAD']).trim(), revision, `${phase}: repository revision changed`);
  const entries = git(root, ['status', '--porcelain', '--untracked-files=all']).split('\n').filter(Boolean);
  const unexpected = entries.filter((entry) => !(allowDeletionManifestOutput && entry.slice(3) === deletionManifestPath));
  assert.deepEqual(unexpected, [], `${phase}: working tree has changes outside the fixed generated deletion manifest`);
}

function buildReferenceIndex(root, sources) {
  const metadata = new Set([
    baselinePath, classificationPath, unitsPath, extractionSummaryPath, assignmentsPath, deletionManifestPath,
    'docs/config/documentation-parity-batches.json', 'docs/generated/inventory/documentation-parity-batches.json',
  ]);
  const paths = new Map(sources.flatMap((source) => [
    [source.originalPath, source.originalPath], [source.legacyPath, source.originalPath],
  ]));
  const references = new Map(sources.map((source) => [source.originalPath, new Set()]));
  const scannedFiles = [];
  for (const file of repositoryFiles(root)) {
    if (metadata.has(file) || file.startsWith('docs/generated/inventory/documentation-parity-')
      || sources.some((source) => file === source.legacyPath)) continue;
    if (file.startsWith(`${decisionsRoot}/`) || file.startsWith(`${reviewsRoot}/`)) continue;
    let buffer;
    try { buffer = fs.readFileSync(path.join(root, file)); } catch { continue; }
    if (buffer.includes(0)) continue;
    const text = buffer.toString('utf8');
    const provenanceMetadata = file.startsWith('docs/review/')
      || file.startsWith('docs/blueprint/ap01-baseline/')
      || file === 'docs/blueprint/review-ledger.jsonl'
      || file === 'docs/blueprint/generated/migration-ledger.csv';
    if (!provenanceMetadata) {
      scannedFiles.push(file);
      for (const [needle, originalPath] of paths) {
        if (text.includes(needle)) references.get(originalPath).add(file);
        const pieces = needle.split('/');
        if (pieces.length > 1) {
          const quotedPieces = pieces.map((piece) => `["']${piece.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}["']`).join('\\s*,\\s*');
          const joined = new RegExp(`\\[\\s*${quotedPieces}\\s*\\]\\s*\\.join\\(\\s*["']/["']\\s*\\)`, 'u');
          const pathJoined = new RegExp(`\\bpath(?:\\.posix)?\\.join\\(\\s*${quotedPieces}\\s*\\)`, 'u');
          if (joined.test(text) || pathJoined.test(text)) references.get(originalPath).add(file);
        }
      }
    }
    if (provenanceMetadata) continue;
    const targets = [
      ...[...text.matchAll(/!?\[[^\]]*\]\(\s*<?([^\s)>#]+)>?(?:#[^\s)]*)?\s*(?:["'][^"']*["'])?\)/gu)]
        .map((match) => match[1]),
      ...[...text.matchAll(/\b(?:href|src)\s*=\s*["']([^"'#]+)(?:#[^"']*)?["']/giu)]
        .map((match) => match[1]),
    ];
    for (const target of targets) {
      if (/^[a-z][a-z0-9+.-]*:/iu.test(target) || target.startsWith('//')) continue;
      const resolved = target.startsWith('/')
        ? target.slice(1)
        : path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
      const originalPath = paths.get(resolved);
      if (originalPath) references.get(originalPath).add(file);
    }
  }
  return {
    references: new Map([...references].map(([source, files]) => [source, [...files].sort(compareText)])),
    scannedFiles: [...new Set(scannedFiles)].sort(compareText),
  };
}

function scannerInputBinding(root, reviewedRevision, scannedFiles) {
  const entries = scannedFiles.map((repositoryPath) => {
    let reviewedObject;
    try { reviewedObject = git(root, ['rev-parse', `${reviewedRevision}:${repositoryPath}`]).trim(); }
    catch { assert.fail(`${repositoryPath}: active-dependency scanner input is absent at reviewedRevision`); }
    const currentObject = gitObject(fs.readFileSync(path.join(root, repositoryPath)), root);
    assert.equal(currentObject, reviewedObject,
      `${repositoryPath}: active-dependency scanner input changed after reviewedRevision`);
    return { path: repositoryPath, gitObject: currentObject };
  });
  return sha256(canonical(entries));
}

function buildActiveDependencyReview(root, source, reviewedRevision, contentRoot, referenceIndex = null) {
  const index = referenceIndex ?? buildReferenceIndex(root, [source]);
  const matches = index.references.get(source.originalPath) ?? [];
  return {
    reviewedRevision,
    reviewedTree: git(root, ['rev-parse', `${reviewedRevision}^{tree}`]).trim(),
    contentRoot,
    scope: {
      paths: [source.originalPath, source.legacyPath],
      risks: ['dynamic-configuration', 'generated-paths', 'runtime-lookup', 'external-consumers'],
    },
    methods: [],
    evidence: [],
    findings: [],
    scanner: {
      version: ACTIVE_DEPENDENCY_SCANNER_VERSION,
      searchedPaths: [source.originalPath, source.legacyPath],
      scannedFileCount: index.scannedFiles.length,
      scannedPathsSha256: sha256(canonical(index.scannedFiles)),
      scannerInputRoot: scannerInputBinding(root, reviewedRevision, index.scannedFiles),
      matches,
    },
    limitation: ACTIVE_DEPENDENCY_LIMITATION,
    verdict: 'PENDING',
  };
}

function exactKeys(value, expected, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label}: must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label}: fields must be exactly ${expected.join(', ')}`);
}

function nonempty(value, label) {
  assert.equal(typeof value, 'string', `${label}: must be a string`);
  assert(value.trim().length > 0, `${label}: must not be empty`);
}

function lstatIfPresent(pathname) {
  try { return fs.lstatSync(pathname); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}

function safeRepositoryPath(root, relative, label, { mustExist = true, finalType = 'file', createParents = false } = {}) {
  nonempty(relative, label);
  assert.equal(relative, relative.replaceAll('\\', '/'), `${label}: must use slash separators`);
  assert(!path.isAbsolute(relative) && path.posix.normalize(relative) === relative
    && !relative.split('/').includes('..'), `${label}: unsafe repository path`);
  const absoluteRoot = path.resolve(root);
  const rootStatus = fs.lstatSync(absoluteRoot);
  assert(rootStatus.isDirectory() && !rootStatus.isSymbolicLink(), `${label}: repository root must be a real directory`);
  const parts = relative.split('/');
  let current = absoluteRoot;
  for (const [index, component] of parts.entries()) {
    current = path.join(current, component);
    const final = index === parts.length - 1;
    const status = lstatIfPresent(current);
    if (!status) {
      if (!final && createParents) {
        fs.mkdirSync(current);
        continue;
      }
      assert(!mustExist || (!final && createParents), `${label}: path is missing`);
      break;
    }
    assert(!status.isSymbolicLink(),
      `${label}: symbolic-link path component is forbidden: ${parts.slice(0, index + 1).join('/')}`);
    if (!final) assert(status.isDirectory(),
      `${label}: non-directory path component: ${parts.slice(0, index + 1).join('/')}`);
    else if (finalType === 'file') assert(status.isFile(), `${label}: must be a regular file`);
    else if (finalType === 'directory') assert(status.isDirectory(), `${label}: must be a directory`);
  }
  return path.join(absoluteRoot, ...parts);
}

function repositoryRevision(root) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function sourceLineRange(buffer, byteStart, byteEnd) {
  const before = buffer.subarray(0, byteStart).toString('utf8');
  const selected = buffer.subarray(byteStart, byteEnd).toString('utf8');
  const lineStart = before.split('\n').length;
  const lineEnd = lineStart + Math.max(0, selected.split('\n').length - 1 - (selected.endsWith('\n') ? 1 : 0));
  return { lineStart, lineEnd };
}

function validateSpan(buffer, value, label) {
  for (const key of ['byteStart', 'byteEnd', 'lineStart', 'lineEnd']) {
    assert(Number.isSafeInteger(value[key]) && value[key] >= (key.startsWith('line') ? 1 : 0),
      `${label}.${key}: invalid coordinate`);
  }
  assert(value.byteStart < value.byteEnd && value.byteEnd <= buffer.length, `${label}: byte span is outside source`);
  assert(value.byteStart === 0 || (buffer[value.byteStart] & 0xc0) !== 0x80,
    `${label}: byteStart splits a UTF-8 code point`);
  assert(value.byteEnd === buffer.length || (buffer[value.byteEnd] & 0xc0) !== 0x80,
    `${label}: byteEnd splits a UTF-8 code point`);
  const selected = buffer.subarray(value.byteStart, value.byteEnd);
  assert.equal(value.exactSha256, sha256(selected), `${label}: exactSha256 does not match source bytes`);
  if (Object.hasOwn(value, 'exact')) {
    assert.equal(value.exact, selected.toString('utf8'), `${label}: exact content does not match source bytes`);
  }
  if (Object.hasOwn(value, 'normalized')) {
    assert.equal(value.normalized, normalizeExcerpt(selected.toString('utf8')),
      `${label}: normalized content does not match source bytes`);
    assert.equal(value.normalizedSha256, sha256(value.normalized), `${label}: normalizedSha256 does not match normalized content`);
  } else {
    assert.equal(value.normalizedSha256, sha256(normalizeExcerpt(selected.toString('utf8'))),
      `${label}: normalizedSha256 does not match source bytes`);
  }
  assert.deepEqual({ lineStart: value.lineStart, lineEnd: value.lineEnd },
    sourceLineRange(buffer, value.byteStart, value.byteEnd), `${label}: line span does not match byte span`);
}

function unitOriginalPath(unit) {
  return unit.originalPath;
}

function unitGitObject(unit) {
  return unit.baselineGitObject;
}

function loadUnits(root) {
  const absolute = path.join(root, unitsPath);
  assert(fs.existsSync(absolute), `${unitsPath}: extraction ledger is missing`);
  const records = fs.readFileSync(absolute, 'utf8').split(/\r?\n/u).filter((line) => line.trim())
    .map((line, index) => {
      try { return JSON.parse(line); } catch (error) { throw new Error(`${unitsPath}:${index + 1}: ${error.message}`); }
    });
  const ids = new Set();
  for (const [index, unit] of records.entries()) {
    const label = `${unitsPath}:${index + 1}`;
    for (const key of ['schemaVersion', 'extractorVersion', 'unitId', 'originalPath', 'legacyPath',
      'baselineRevision', 'baselineGitObject', 'sourceKind', 'kind', 'headingPath', 'byteStart',
      'byteEnd', 'lineStart', 'lineEnd', 'exact', 'exactSha256', 'normalized', 'normalizedSha256', 'text',
      'atomicSegments']) {
      assert(Object.hasOwn(unit, key), `${label}: missing ${key}`);
    }
    assert.equal(unit.schemaVersion, 'kubeclaw-documentation-parity-unit.v1', `${label}: unsupported schemaVersion`);
    nonempty(unit.extractorVersion, `${label}.extractorVersion`);
    nonempty(unit.unitId, `${label}.unitId`);
    assert(!ids.has(unit.unitId), `${label}: duplicate unitId ${unit.unitId}`);
    ids.add(unit.unitId);
    assert(Array.isArray(unit.headingPath) && unit.headingPath.every((part) => typeof part === 'string'),
      `${label}.headingPath: must be a string array`);
    assert(SHA256.test(unit.exactSha256) && SHA256.test(unit.normalizedSha256), `${label}: invalid unit hash`);
    assert.equal(typeof unit.exact, 'string', `${label}.exact: must be a string`);
    assert.equal(typeof unit.normalized, 'string', `${label}.normalized: must be a string`);
    assert.equal(typeof unit.text, 'string', `${label}.text: must be a string`);
    assert(Array.isArray(unit.atomicSegments), `${label}.atomicSegments: must be an array`);
    if (Object.hasOwn(unit, 'textSha256')) {
      assert.equal(unit.textSha256, sha256(unit.text), `${label}: textSha256 does not match text`);
    }
  }
  return records;
}

function extractionDigest(source, units) {
  return extractionBindingDigest(source, units);
}

function computeContentRoot(root, source, claims, visualEvidence = []) {
  const targetPaths = [...new Set(claims.flatMap((claim) => claim.targets ?? []).map((target) => target.path))].sort();
  const evidencePaths = [...new Set(claims.flatMap((claim) => claim.omission?.evidence ?? [])
    .concat(claims.flatMap((claim) => claim.evidence ?? []))
    .map((evidence) => evidence.path))].sort(compareText);
  const visualPaths = [...new Set(visualEvidence.map((item) => item.renderedPath))].sort(compareText);
  const bind = (file) => {
    const absolute = safeRepositoryPath(root, file, 'contentRoot path');
    assert(fs.existsSync(absolute) && fs.statSync(absolute).isFile(), `${file}: contentRoot input is missing`);
    return { path: file, gitObject: gitObject(fs.readFileSync(absolute), root), sha256: sha256(fs.readFileSync(absolute)) };
  };
  return sha256(canonical({
    schemaVersion: 'kubeclaw-documentation-parity-content-root.v1',
    source: {
      originalPath: source.originalPath,
      legacyPath: source.legacyPath,
      classification: source.classification,
      baselineRevision: source.baselineRevision,
      gitObject: source.gitObject,
      extractionDigest: source.extractionDigest,
    },
    canonicalTargets: targetPaths.map(bind),
    omissionEvidence: evidencePaths.map(bind),
    renderedVisualEvidence: visualPaths.map(bind),
    continuingAuthorities: fs.existsSync(path.join(root, routeRegistryPath)) ? [bind(routeRegistryPath)] : [],
  }));
}

function publicRoute(repositoryPath, prefix) {
  assert(repositoryPath.startsWith(prefix), `${repositoryPath}: cannot derive public documentation route`);
  let relative = repositoryPath.slice(prefix.length);
  if (relative === 'README.md' || relative === 'index.md') return '/';
  relative = relative.replace(/\/(?:README|index)\.md$/u, '');
  if (relative.endsWith('.md')) relative = relative.slice(0, -3);
  return `/${relative}`;
}

function markdownSections(text) {
  const starts = markdownAnchorEntries(text);
  return starts.map((entry, index) => {
    const next = starts.slice(index + 1).find((candidate) => candidate.level <= entry.level);
    return { ...entry, end: next?.start ?? Buffer.byteLength(text, 'utf8') };
  });
}

function inspectRenderedImage(buffer, label = 'rendered image') {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert(buffer.length >= 33 && buffer.subarray(0, 8).equals(pngSignature), `${label}: rendered evidence must be a PNG image`);
  let cursor = 8;
  let width = null;
  let height = null;
  let bitDepth = null;
  let colorType = null;
  let interlace = null;
  const compressed = [];
  let chunkIndex = 0;
  let sawHeader = false;
  let sawPalette = false;
  let sawImageData = false;
  let imageDataEnded = false;
  let ended = false;
  while (cursor + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(cursor);
    const end = cursor + 12 + length;
    assert(end <= buffer.length, `${label}: truncated PNG chunk`);
    const type = buffer.subarray(cursor + 4, cursor + 8).toString('ascii');
    assert(/^[A-Za-z]{4}$/u.test(type), `${label}: invalid PNG chunk type`);
    const data = buffer.subarray(cursor + 8, cursor + 8 + length);
    const expectedCrc = buffer.readUInt32BE(cursor + 8 + length);
    const crcInput = buffer.subarray(cursor + 4, cursor + 8 + length);
    let actualCrc = 0xffffffff;
    for (const byte of crcInput) {
      actualCrc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        actualCrc = (actualCrc >>> 1) ^ ((actualCrc & 1) ? 0xedb88320 : 0);
      }
    }
    actualCrc = (actualCrc ^ 0xffffffff) >>> 0;
    assert.equal(expectedCrc, actualCrc, `${label}: PNG ${type} chunk CRC is invalid`);
    assert(!ended, `${label}: PNG contains a chunk after IEND`);
    if (type === 'IHDR') {
      assert.equal(sawHeader, false, `${label}: PNG IHDR must be unique`);
      assert.equal(chunkIndex, 0, `${label}: PNG IHDR must be the first chunk`);
      assert.equal(length, 13, `${label}: invalid PNG IHDR`);
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      const compression = data[10];
      const filter = data[11];
      interlace = data[12];
      assert(width > 0 && height > 0, `${label}: PNG dimensions must be positive`);
      const allowedDepths = new Map([
        [0, new Set([1, 2, 4, 8, 16])],
        [2, new Set([8, 16])],
        [3, new Set([1, 2, 4, 8])],
        [4, new Set([8, 16])],
        [6, new Set([8, 16])],
      ]);
      assert(allowedDepths.get(colorType)?.has(bitDepth), `${label}: unsupported PNG color type or bit depth`);
      assert.equal(compression, 0, `${label}: unsupported PNG compression method`);
      assert.equal(filter, 0, `${label}: unsupported PNG filter method`);
      assert([0, 1].includes(interlace), `${label}: unsupported PNG interlace method`);
      sawHeader = true;
    } else if (type === 'PLTE') {
      assert(sawHeader && !sawImageData, `${label}: PNG PLTE must occur after IHDR and before IDAT`);
      assert.equal(sawPalette, false, `${label}: PNG PLTE must be unique`);
      assert(![0, 4].includes(colorType), `${label}: PNG PLTE is forbidden for grayscale color types`);
      assert(length > 0 && length % 3 === 0 && length <= 768, `${label}: invalid PNG PLTE length`);
      sawPalette = true;
    } else if (type === 'IDAT') {
      assert(sawHeader, `${label}: PNG IDAT occurs before IHDR`);
      assert(!imageDataEnded, `${label}: PNG IDAT chunks must be contiguous`);
      assert(colorType !== 3 || sawPalette, `${label}: indexed PNG requires PLTE before IDAT`);
      sawImageData = true;
      compressed.push(data);
    } else if (type === 'IEND') {
      assert(sawHeader && sawImageData, `${label}: PNG IEND occurs before image data`);
      assert.equal(length, 0, `${label}: PNG IEND must be empty`);
      ended = true;
    } else {
      if (sawImageData) imageDataEnded = true;
      assert(type[0] === type[0].toLowerCase(), `${label}: unsupported critical PNG chunk ${type}`);
    }
    cursor = end;
    chunkIndex += 1;
    if (ended) break;
  }
  assert(width && height && compressed.length && ended, `${label}: PNG lacks required image chunks`);
  assert.equal(cursor, buffer.length, `${label}: PNG has trailing or truncated data after IEND`);
  const pixels = inflateSync(Buffer.concat(compressed));
  const channels = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]).get(colorType);
  const passes = interlace === 0
    ? [{ x: 0, y: 0, dx: 1, dy: 1 }]
    : [
      { x: 0, y: 0, dx: 8, dy: 8 }, { x: 4, y: 0, dx: 8, dy: 8 },
      { x: 0, y: 4, dx: 4, dy: 8 }, { x: 2, y: 0, dx: 4, dy: 4 },
      { x: 0, y: 2, dx: 2, dy: 4 }, { x: 1, y: 0, dx: 2, dy: 2 },
      { x: 0, y: 1, dx: 1, dy: 2 },
    ];
  let pixelCursor = 0;
  for (const pass of passes) {
    const passWidth = width <= pass.x ? 0 : Math.ceil((width - pass.x) / pass.dx);
    const passHeight = height <= pass.y ? 0 : Math.ceil((height - pass.y) / pass.dy);
    if (!passWidth || !passHeight) continue;
    const rowBytes = Math.ceil((passWidth * channels * bitDepth) / 8);
    for (let row = 0; row < passHeight; row += 1) {
      assert(pixelCursor < pixels.length, `${label}: PNG pixel stream is shorter than its geometry`);
      assert(pixels[pixelCursor] <= 4, `${label}: PNG scanline has an invalid filter byte`);
      pixelCursor += 1 + rowBytes;
      assert(pixelCursor <= pixels.length, `${label}: PNG pixel stream is shorter than its geometry`);
    }
  }
  assert.equal(pixelCursor, pixels.length, `${label}: PNG pixel stream length does not match its geometry`);
  return { mediaType: 'image/png', width, height };
}

function excerptOccurrences(normalizedDocument, normalizedExcerpt) {
  if (!normalizedExcerpt) return 0;
  let count = 0;
  let cursor = 0;
  while ((cursor = normalizedDocument.indexOf(normalizedExcerpt, cursor)) >= 0) {
    count += 1;
    cursor += Math.max(1, normalizedExcerpt.length);
  }
  return count;
}

function siteIndex(root) {
  const pages = relativeFiles(root, 'docs/site').filter((file) => file.endsWith('.md')).map((file) => {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    return { file, text, normalized: normalizeExcerpt(text), sections: markdownSections(text) };
  });
  return { pages, byPath: new Map(pages.map((page) => [page.file, page])), occurrenceCache: new Map() };
}

function decisionRelative(originalPath) {
  assert(originalPath.startsWith('docs/'), `${originalPath}: original path must be below docs`);
  return `${decisionsRoot}/${originalPath.slice('docs/'.length)}.json`;
}

function reviewRelative(originalPath) {
  assert(originalPath.startsWith('docs/'), `${originalPath}: original path must be below docs`);
  return `${reviewsRoot}/${originalPath.slice('docs/'.length)}.json`;
}

function validateSourceBinding(value, source, label) {
  exactKeys(value, ['originalPath', 'legacyPath', 'classification', 'baselineRevision', 'gitObject', 'extractionDigest'], label);
  assert.deepEqual(value, source, `${label}: stale or mismatched source binding`);
}

function validateTarget(root, target, site, publishedPaths, label) {
  exactKeys(target, ['path', 'anchor', 'excerpt', 'excerptSha256', 'occurrence', 'relation'], label);
  assert(target.path.startsWith('docs/site/') && target.path.endsWith('.md'), `${label}: target must be Markdown below docs/site`);
  safeRepositoryPath(root, target.path, `${label}.path`);
  assert(publishedPaths.has(target.path), `${label}: target is not in the canonical publication allowlist`);
  const page = site.byPath.get(target.path);
  assert(page, `${label}: target page does not exist`);
  nonempty(target.anchor, `${label}.anchor`);
  const sections = page.sections.filter((section) => section.anchor === target.anchor);
  assert.equal(sections.length, 1, `${label}: anchor must identify exactly one real heading or explicit HTML id`);
  nonempty(target.excerpt, `${label}.excerpt`);
  const normalized = normalizeExcerpt(target.excerpt);
  assert(normalized.length >= 12, `${label}: excerpt is too short to prove statement parity`);
  assert.equal(target.excerptSha256, sha256(normalized), `${label}: excerptSha256 is stale`);
  assert.equal(target.occurrence, 1, `${label}: occurrence must be 1 for a globally unique normalized excerpt`);
  assert(TARGET_RELATIONS.has(target.relation), `${label}: unsupported target relation`);
  if (!site.occurrenceCache.has(normalized)) {
    site.occurrenceCache.set(normalized, site.pages.reduce((count, entry) => count + excerptOccurrences(entry.normalized, normalized), 0));
  }
  const globalOccurrences = site.occurrenceCache.get(normalized);
  assert.equal(globalOccurrences, 1, `${label}: normalized excerpt must occur exactly once under docs/site`);
  const section = sections[0];
  const sectionText = Buffer.from(page.text).subarray(section.start, section.end).toString('utf8');
  assert.equal(excerptOccurrences(normalizeExcerpt(sectionText), normalized), 1,
    `${label}: excerpt is not uniquely present in the named section`);
}

function validateEvidence(root, evidence, reviewedRevision, gitState, label, { behavioral = true } = {}) {
  exactKeys(evidence, ['revision', 'path', 'basis', 'assertion', 'gitObject', 'byteStart', 'byteEnd', 'lineStart',
    'lineEnd', 'exactSha256', 'normalizedSha256'], label);
  assert(validGitObject(evidence.revision, root), `${label}: evidence revision is invalid`);
  assert.equal(evidence.revision, reviewedRevision, `${label}: evidence is not pinned to the reviewed revision`);
  assert(EVIDENCE_BASES.has(evidence.basis), `${label}: unsupported evidence basis`);
  if (behavioral) assert.notEqual(evidence.basis, 'documentation-governance', `${label}: behavioral evidence cannot be documentation governance`);
  nonempty(evidence.assertion, `${label}.assertion`);
  assert(normalizeExcerpt(evidence.assertion).length >= 12 && /[\p{L}\p{N}].*[\p{L}\p{N}]/u.test(evidence.assertion),
    `${label}: evidence assertion is too trivial to explain the supported statement`);
  assert(!evidence.path.startsWith(`${decisionsRoot}/`)
    && !evidence.path.startsWith(`${reviewsRoot}/`)
    && !evidence.path.startsWith('docs/_legacy-source/')
    && !GENERATED_OR_REVIEW_PATH.test(evidence.path), `${label}: evidence is a generated, review, legacy, or decision artifact`);
  if (behavioral) {
    assert(!evidence.path.startsWith('docs/site/')
      && evidence.path !== 'docs/blueprint/documentation-parity-contract.md',
    `${label}: canonical parity documentation cannot prove current behavior`);
  }
  const basisPathMatches = {
    'current-implementation': !evidence.path.startsWith('docs/')
      && !TEST_PATH.test(evidence.path)
      && !evidence.path.startsWith('contracts/') && !evidence.path.startsWith('charts/')
      && !evidence.path.startsWith('config/') && IMPLEMENTATION_EXTENSION.test(evidence.path),
    'current-contract': evidence.path.startsWith('contracts/'),
    'current-schema': /(?:^|\/)schemas?\//u.test(evidence.path)
      || /\.schema\.(?:json|ya?ml)$/u.test(evidence.path)
      || /(?:^|\/)(?:openapi|swagger)(?:[-_.]|$)/u.test(evidence.path),
    'current-configuration': evidence.path.startsWith('charts/') || evidence.path.startsWith('config/')
      || evidence.path.startsWith('configs/') || evidence.path.startsWith('.github/workflows/')
      || /(?:^|\/)(?:[^/]+\.)?(?:config|values)\.(?:json|jsonc|toml|ya?ml)$/u.test(evidence.path)
      || /^(?:package(?:-lock)?\.json|go\.mod)$/u.test(evidence.path),
    'current-test': TEST_PATH.test(evidence.path),
    'documentation-governance': evidence.path.startsWith('docs/config/')
      || evidence.path === 'docs/blueprint/documentation-parity-contract.md'
      || evidence.path === routeRegistryPath
      || /^scripts\/docs-parity-(?:check|extract)\.mjs$/u.test(evidence.path),
  };
  assert.equal(basisPathMatches[evidence.basis], true,
    `${label}: ${evidence.basis} evidence path is outside that basis path class`);
  const absolute = safeRepositoryPath(root, evidence.path, `${label}.path`);
  assert(fs.existsSync(absolute) && fs.lstatSync(absolute).isFile(), `${label}: evidence must be a current regular file, not a symlink`);
  assert.equal(path.relative(root, fs.realpathSync(absolute)).replaceAll('\\', '/'), evidence.path,
    `${label}: evidence path resolves through a symlink`);
  const buffer = fs.readFileSync(absolute);
  assert.equal(evidence.gitObject, gitObject(buffer, root), `${label}: evidence gitObject is stale`);
  assert(gitState.available, `${label}: Git is required to validate revision evidence`);
  assert.equal(git(root, ['cat-file', '-t', evidence.revision]).trim(), 'commit', `${label}: evidence revision is not a commit`);
  let revisionObject;
  try { revisionObject = git(root, ['rev-parse', `${evidence.revision}:${evidence.path}`]).trim(); }
  catch { assert.fail(`${label}: evidence path is absent at the recorded revision`); }
  assert.equal(evidence.gitObject, revisionObject, `${label}: evidence file is not the recorded regular blob at revision`);
  const mode = git(root, ['ls-tree', evidence.revision, '--', evidence.path]).trim().split(/\s+/u)[0];
  assert(['100644', '100755'].includes(mode), `${label}: evidence path is not a recorded regular file`);
  validateSpan(buffer, evidence, label);
  const selected = normalizeExcerpt(buffer.subarray(evidence.byteStart, evidence.byteEnd).toString('utf8'));
  const tokens = selected.match(/[\p{L}\p{N}_-]+/gu) ?? [];
  assert(selected.length >= 8 && tokens.length >= 2 && tokens.some((token) => /[\p{L}\p{N}]/u.test(token)),
    `${label}: evidence span is punctuation-only or too trivial to support a claim`);
}

function validateCodeClassification(classification, claims, label) {
  const rules = {
    'runnable-example': { claimTypes: ['example', 'procedure'], truthStates: ['current'], disposition: 'mapped',
      evidenceBases: ['current-implementation', 'current-test'] },
    'configuration-example': { claimTypes: ['configuration', 'example'], truthStates: ['current'], disposition: 'mapped',
      evidenceBases: ['current-configuration', 'current-schema', 'current-implementation', 'current-test'] },
    'expected-output': { claimTypes: ['example', 'fact', 'failure', 'status-or-limit'], truthStates: ['current'], disposition: 'mapped',
      evidenceBases: ['current-test', 'current-implementation', 'current-contract'] },
    'illustrative-pseudocode': { claimTypes: ['example', 'procedure'], truthStates: ['current', 'historical-decision'],
      disposition: 'mapped', evidenceBases: ['current-implementation', 'current-contract', 'current-test'] },
    'identifier-list': { claimTypes: ['configuration', 'fact', 'source-evidence'], truthStates: ['current'], disposition: 'mapped',
      evidenceBases: ['current-contract', 'current-schema', 'current-configuration', 'current-implementation'] },
    'obsolete-example': { claimTypes: ['configuration', 'example', 'procedure', 'source-evidence'],
      truthStates: ['obsolete-or-incorrect'], disposition: 'omitted', evidenceBases: null },
  };
  const rule = rules[classification];
  assert(claims.length > 0, `${label}: classified code block has no semantic claims`);
  for (const claim of claims) {
    assert(rule.claimTypes.includes(claim.claimType),
      `${label}: ${classification} is incompatible with claimType ${claim.claimType}`);
    assert(rule.truthStates.includes(claim.truthState),
      `${label}: ${classification} is incompatible with truthState ${claim.truthState}`);
    assert.equal(claim.disposition, rule.disposition,
      `${label}: ${classification} is incompatible with disposition ${claim.disposition}`);
    if (rule.disposition === 'mapped') {
      assert(claim.targets.length > 0, `${label}: ${classification} requires a concrete canonical target`);
      if (claim.truthState === 'current') {
        assert(claim.evidence.length > 0 && claim.evidence.every((item) => rule.evidenceBases.includes(item.basis)),
          `${label}: ${classification} has incompatible or missing evidence basis`);
      }
    } else {
      assert.equal(claim.targets.length, 0, `${label}: obsolete-example cannot map a canonical target`);
      assert.equal(claim.omission?.reasonCode, 'obsolete-or-incorrect',
        `${label}: obsolete-example requires an obsolete-or-incorrect omission`);
    }
  }
}

function validateClaim(root, claim, unit, sourceBuffer, site, publishedPaths, reviewedRevision, gitState, label) {
  exactKeys(claim, ['claimId', 'unitId', 'summary', 'claimType', 'truthState', 'disposition', 'source', 'evidence', 'targets', 'omission'], label);
  nonempty(claim.claimId, `${label}.claimId`);
  nonempty(claim.summary, `${label}.summary`);
  assert.equal(claim.unitId, unit.unitId, `${label}: unitId does not bind the extracted unit`);
  assert(CLAIM_TYPES.has(claim.claimType), `${label}: unsupported claimType`);
  assert(TRUTH_STATES.has(claim.truthState), `${label}: unsupported truthState`);
  assert(!['unknown', 'unreviewed'].includes(claim.truthState), `${label}: ${claim.truthState} truth cannot pass deletion review`);
  assert(DISPOSITIONS.has(claim.disposition), `${label}: unsupported disposition`);
  assert.notEqual(claim.disposition, 'open', `${label}: an open claim cannot pass deletion review`);
  assert(Array.isArray(claim.evidence), `${label}.evidence: must be an array`);
  exactKeys(claim.source, ['byteStart', 'byteEnd', 'lineStart', 'lineEnd', 'exactSha256', 'normalizedSha256'], `${label}.source`);
  assert(claim.source.byteStart >= unit.byteStart && claim.source.byteEnd <= unit.byteEnd,
    `${label}: atomic claim span leaves its extracted unit`);
  validateSpan(sourceBuffer, claim.source, `${label}.source`);
  assert(Array.isArray(claim.targets), `${label}.targets: must be an array`);
  if (claim.disposition === 'mapped') {
    assert(claim.targets.length > 0, `${label}: mapped claim requires a target excerpt; an anchor alone is not parity`);
    assert.equal(claim.omission, null, `${label}: mapped claim cannot declare an omission`);
    assert(['current', 'historical-decision'].includes(claim.truthState),
      `${label}: only current or historical decisions can be mapped`);
    if (claim.truthState === 'current' && BEHAVIORAL_CLAIM_TYPES.has(claim.claimType)) {
      assert(claim.evidence.length > 0, `${label}: mapped behavioral claim requires current source evidence`);
    }
    claim.evidence.forEach((item, index) => validateEvidence(root, item, reviewedRevision, gitState,
      `${label}.evidence[${index}]`, { behavioral: claim.truthState === 'current' && BEHAVIORAL_CLAIM_TYPES.has(claim.claimType) }));
    claim.targets.forEach((target, index) => validateTarget(root, target, site, publishedPaths, `${label}.targets[${index}]`));
  } else {
    assert.equal(claim.targets.length, 0, `${label}: omitted claim cannot declare targets`);
    exactKeys(claim.omission, ['reasonCode', 'explanation', 'evidence'], `${label}.omission`);
    assert(OMISSION_REASONS.has(claim.omission.reasonCode), `${label}: unsupported omission reasonCode`);
    assert.equal(claim.evidence.length, 0, `${label}: omitted claim evidence belongs in omission.evidence`);
    if (claim.truthState === 'obsolete-or-incorrect') {
      assert.equal(claim.omission.reasonCode, 'obsolete-or-incorrect', `${label}: obsolete truth requires obsolete-or-incorrect omission`);
    } else {
      assert.equal(claim.truthState, 'non-reader-content', `${label}: only obsolete or non-reader content can be omitted`);
      if (claim.claimType === 'navigation-only') {
        assert.equal(claim.omission.reasonCode, 'navigation-only', `${label}: navigation-only claim requires navigation-only omission`);
      } else if (claim.claimType === 'project-administration') {
        assert.equal(claim.omission.reasonCode, 'transient-project-administration', `${label}: project-administration claim requires transient-project-administration omission`);
      } else {
        assert(['template-placeholder', 'non-semantic-decoration'].includes(claim.omission.reasonCode),
          `${label}: non-reader semantic claim requires a template or decoration omission`);
      }
    }
    if (claim.omission.reasonCode === 'navigation-only') assert.equal(claim.claimType, 'navigation-only', `${label}: navigation omission requires navigation-only claimType`);
    if (claim.omission.reasonCode === 'transient-project-administration') assert.equal(claim.claimType, 'project-administration', `${label}: project-administration omission requires matching claimType`);
    nonempty(claim.omission.explanation, `${label}.omission.explanation`);
    assert(Array.isArray(claim.omission.evidence) && claim.omission.evidence.length > 0,
      `${label}: omission requires current evidence`);
    if (['navigation-only', 'transient-project-administration'].includes(claim.omission.reasonCode)) {
      assert(claim.omission.evidence.every((item) => item.basis === 'documentation-governance'),
        `${label}: navigation and project-administration omissions require documentation-governance evidence`);
    }
    claim.omission.evidence.forEach((item, index) => validateEvidence(root, item, reviewedRevision, gitState,
      `${label}.omission.evidence[${index}]`, { behavioral: claim.omission.reasonCode === 'obsolete-or-incorrect' }));
  }
}

function validateDecision(root, value, source, units, site, publishedPaths, gitState, label) {
  exactKeys(value, ['schemaVersion', 'source', 'reviewedRevision', 'author', 'redirect', 'visualEvidence', 'contentRoot', 'unitCoverage', 'claims'], label);
  assert.equal(value.schemaVersion, 'kubeclaw-documentation-parity-decision.v1', `${label}: unsupported schemaVersion`);
  validateSourceBinding(value.source, source, `${label}.source`);
  assert(validGitObject(value.reviewedRevision, root), `${label}: reviewedRevision is invalid`);
  assert(gitState.available, `${label}: Git is required for a deletion decision`);
  assert.equal(git(root, ['cat-file', '-t', value.reviewedRevision]).trim(), 'commit', `${label}: reviewedRevision is not a commit`);
  try { git(root, ['merge-base', '--is-ancestor', value.reviewedRevision, gitState.head]); }
  catch { assert.fail(`${label}: reviewedRevision is not an ancestor of the validated revision`); }
  exactKeys(value.author, ['id', 'assignmentId'], `${label}.author`);
  nonempty(value.author.id, `${label}.author.id`);
  nonempty(value.author.assignmentId, `${label}.author.assignmentId`);
  exactKeys(value.redirect, ['status', 'from', 'to', 'basis', 'reason'], `${label}.redirect`);
  assert(['required', 'not-required'].includes(value.redirect.status), `${label}.redirect.status: unsupported status`);
  assert.equal(value.redirect.from, publicRoute(source.originalPath, 'docs/'),
    `${label}.redirect.from must be the original public documentation route`);
  nonempty(value.redirect.reason, `${label}.redirect.reason`);
  const registry = readJson(root, routeRegistryPath);
  exactKeys(registry, ['schemaVersion', 'authority', 'redirects', 'deprecatedTerms', 'historicalRouteBoundary'], routeRegistryPath);
  assert.equal(registry.schemaVersion, 'kubeclaw-documentation-routes.v1', `${routeRegistryPath}: unsupported schemaVersion`);
  assert(Array.isArray(registry.redirects), `${routeRegistryPath}.redirects must be an array`);
  const registered = registry.redirects.filter((item) => item.from === value.redirect.from);
  if (value.redirect.status === 'required') {
    assert.equal(value.redirect.basis, 'known-public-route', `${label}.redirect: required redirect must declare known-public-route basis`);
    nonempty(value.redirect.to, `${label}.redirect.to`);
    const canonicalRoutes = new Set(value.claims.flatMap((claim) => claim.targets)
      .map((target) => publicRoute(target.path, 'docs/site/')));
    assert(canonicalRoutes.has(value.redirect.to), `${label}.redirect.to must name a canonical mapped target route`);
    assert.equal(registered.length, 1, `${label}.redirect: required redirect must have exactly one registry mapping`);
    assert.equal(registered[0].to, value.redirect.to, `${label}.redirect: registry target differs from the decision`);
  } else {
    assert.equal(value.redirect.basis, 'no-authoritative-public-route',
      `${label}.redirect: not-required redirect must declare no-authoritative-public-route basis`);
    assert.equal(value.redirect.to, null, `${label}.redirect.to must be null when no redirect is required`);
    assert.equal(registered.length, 0, `${label}.redirect: not-required conflicts with an existing registry mapping`);
  }
  assert(Array.isArray(value.visualEvidence), `${label}.visualEvidence: must be an array`);
  const svgUnitIds = units.filter((unit) => unit.sourceKind === 'diagram' || unit.kind.startsWith('svg-')).map((unit) => unit.unitId);
  const svgRelationUnitIds = units.filter((unit) => unit.sourceKind === 'diagram'
    && (unit.kind === 'svg-edge' || unit.kind === 'svg-use' || (unit.markerReferences?.length ?? 0) > 0))
    .map((unit) => unit.unitId);
  const visualUnitIds = [];
  const visualRelationUnitIds = [];
  for (const [index, item] of value.visualEvidence.entries()) {
    const visualLabel = `${label}.visualEvidence[${index}]`;
    exactKeys(item, ['unitIds', 'relationUnitIds', 'renderedPath', 'renderedSha256', 'mediaType', 'width', 'height', 'renderer'], visualLabel);
    assert(Array.isArray(item.unitIds) && item.unitIds.length > 0, `${visualLabel}.unitIds: must be a non-empty array`);
    assert(Array.isArray(item.relationUnitIds), `${visualLabel}.relationUnitIds: must be an array`);
    visualUnitIds.push(...item.unitIds);
    visualRelationUnitIds.push(...item.relationUnitIds);
    const absolute = safeRepositoryPath(root, item.renderedPath, `${visualLabel}.renderedPath`);
    assert(fs.existsSync(absolute) && fs.lstatSync(absolute).isFile(), `${visualLabel}: rendered evidence must be a regular file`);
    const rendered = fs.readFileSync(absolute);
    assert.equal(item.renderedSha256, sha256(rendered), `${visualLabel}: rendered evidence hash is stale`);
    const inspected = inspectRenderedImage(rendered, visualLabel);
    assert.deepEqual({ mediaType: item.mediaType, width: item.width, height: item.height }, inspected,
      `${visualLabel}: declared image type or dimensions are stale`);
    exactKeys(item.renderer, ['name', 'version', 'invocation', 'provenance', 'revision'], `${visualLabel}.renderer`);
    for (const field of ['name', 'version', 'invocation', 'provenance']) nonempty(item.renderer[field], `${visualLabel}.renderer.${field}`);
    assert.equal(item.renderer.revision, value.reviewedRevision, `${visualLabel}: renderer provenance is not revision-bound`);
  }
  assert.deepEqual([...visualUnitIds].sort(compareText), [...svgUnitIds].sort(compareText),
    `${label}: SVG units require exactly one rendered visual evidence binding`);
  assert.deepEqual([...visualRelationUnitIds].sort(compareText), [...svgRelationUnitIds].sort(compareText),
    `${label}: every SVG relationship requires exactly one rendered visual evidence binding`);
  assert(SHA256.test(value.contentRoot), `${label}: invalid contentRoot`);
  assert(Array.isArray(value.claims), `${label}.claims: must be an array`);
  const unitsById = new Map(units.map((unit) => [unit.unitId, unit]));
  const claimIds = value.claims.map((claim) => claim.claimId);
  assert.equal(new Set(claimIds).size, claimIds.length, `${label}: claimIds must be unique`);
  assert(Array.isArray(value.unitCoverage), `${label}.unitCoverage: must be an array`);
  assert.equal(value.unitCoverage.length, units.length, `${label}: every extracted unit needs a coverage record`);
  const coverageUnitIds = value.unitCoverage.map((coverage) => coverage.unitId);
  assert.equal(new Set(coverageUnitIds).size, coverageUnitIds.length, `${label}: duplicate unit coverage`);
  assert.deepEqual([...coverageUnitIds].sort(), [...unitsById.keys()].sort(), `${label}: unit coverage is incomplete or contains extras`);
  const claimsById = new Map(value.claims.map((claim) => [claim.claimId, claim]));
  const coveredClaims = [];
  const sourceBuffer = fs.readFileSync(path.join(root, source.legacyPath));
  for (const [index, coverage] of value.unitCoverage.entries()) {
    const coverageLabel = `${label}.unitCoverage[${index}]`;
    exactKeys(coverage, ['unitId', 'codeBlockClassification', 'fragments'], coverageLabel);
    const unit = unitsById.get(coverage.unitId);
    if (unit.kind === 'code-block') {
      assert(CODE_CLASSIFICATIONS.has(coverage.codeBlockClassification), `${coverageLabel}: code block needs an allowed classification`);
    } else assert.equal(coverage.codeBlockClassification, null, `${coverageLabel}: only code blocks can have a code classification`);
    assert(Array.isArray(coverage.fragments) && coverage.fragments.length > 0, `${coverageLabel}: visible unit has no claim/structural coverage`);
    let cursor = unit.byteStart;
    let claimFragments = 0;
    const unitClaimIds = [];
    for (const [fragmentIndex, fragment] of coverage.fragments.entries()) {
      const fragmentLabel = `${coverageLabel}.fragments[${fragmentIndex}]`;
      exactKeys(fragment, ['kind', 'claimId', 'reasonCode', 'byteStart', 'byteEnd'], fragmentLabel);
      assert(['claim', 'structural'].includes(fragment.kind), `${fragmentLabel}: unsupported fragment kind`);
      assert.equal(fragment.byteStart, cursor, `${fragmentLabel}: coverage has a gap or overlap`);
      assert(Number.isSafeInteger(fragment.byteEnd) && fragment.byteEnd > fragment.byteStart && fragment.byteEnd <= unit.byteEnd,
        `${fragmentLabel}: invalid fragment end`);
      assert(fragment.byteStart === 0 || (sourceBuffer[fragment.byteStart] & 0xc0) !== 0x80,
        `${fragmentLabel}: byteStart splits a UTF-8 code point`);
      assert(fragment.byteEnd === sourceBuffer.length || (sourceBuffer[fragment.byteEnd] & 0xc0) !== 0x80,
        `${fragmentLabel}: byteEnd splits a UTF-8 code point`);
      cursor = fragment.byteEnd;
      if (fragment.kind === 'claim') {
        nonempty(fragment.claimId, `${fragmentLabel}.claimId`);
        assert.equal(fragment.reasonCode, null, `${fragmentLabel}: claim fragment cannot have a structural reason`);
        const claim = claimsById.get(fragment.claimId);
        assert(claim, `${fragmentLabel}: claimId does not exist`);
        assert.equal(claim.unitId, unit.unitId, `${fragmentLabel}: claim belongs to another unit`);
        assert.equal(claim.source.byteStart, fragment.byteStart, `${fragmentLabel}: claim start differs from coverage`);
        assert.equal(claim.source.byteEnd, fragment.byteEnd, `${fragmentLabel}: claim end differs from coverage`);
        coveredClaims.push(fragment.claimId);
        unitClaimIds.push(fragment.claimId);
        claimFragments += 1;
      } else {
        assert.equal(fragment.claimId, null, `${fragmentLabel}: structural fragment cannot name a claim`);
        assert(['formatting-only', 'structure-only'].includes(fragment.reasonCode), `${fragmentLabel}: invalid structural reasonCode`);
        const structural = sourceBuffer.subarray(fragment.byteStart, fragment.byteEnd).toString('utf8');
        assert(!/[\p{L}\p{N}]/u.test(structural),
          `${fragmentLabel}: structural coverage cannot hide visible words or identifiers`);
      }
    }
    assert.equal(cursor, unit.byteEnd, `${coverageLabel}: unit tail is uncovered`);
    if (!['table-delimiter'].includes(unit.kind)) assert(claimFragments > 0, `${coverageLabel}: visible content has no atomic claim`);
    if (unit.sourceKind === 'markdown') {
      if (unit.kind !== 'table-delimiter') {
        assert(unit.atomicSegments.length > 0, `${coverageLabel}: Markdown unit has no deterministic atomic segments`);
      }
      let priorEnd = unit.byteStart;
      const segmentCountByClaim = new Map(unitClaimIds.map((claimId) => [claimId, 0]));
      for (const [segmentIndex, segment] of unit.atomicSegments.entries()) {
        const segmentLabel = `${coverageLabel}.atomicSegments[${segmentIndex}]`;
        exactKeys(segment, ['index', 'kind', 'byteStart', 'byteEnd', 'exactSha256', 'normalizedSha256'], segmentLabel);
        assert.equal(segment.index, segmentIndex, `${segmentLabel}: segment index is not deterministic`);
        assert(['statement', 'table-cell', 'code-statement'].includes(segment.kind),
          `${segmentLabel}: unsupported atomic segment kind`);
        assert(segment.byteStart >= unit.byteStart && segment.byteEnd <= unit.byteEnd && segment.byteStart < segment.byteEnd,
          `${segmentLabel}: atomic segment leaves its extracted unit`);
        assert(segment.byteStart >= priorEnd, `${segmentLabel}: atomic segments overlap or are out of order`);
        priorEnd = segment.byteEnd;
        const selected = sourceBuffer.subarray(segment.byteStart, segment.byteEnd);
        assert.equal(segment.exactSha256, sha256(selected), `${segmentLabel}: exactSha256 is stale`);
        assert.equal(segment.normalizedSha256, sha256(normalizeExcerpt(selected.toString('utf8'))),
          `${segmentLabel}: normalizedSha256 is stale`);
        const owners = coverage.fragments.filter((fragment) => fragment.kind === 'claim'
          && fragment.byteStart <= segment.byteStart && fragment.byteEnd >= segment.byteEnd);
        assert.equal(owners.length, 1,
          `${segmentLabel}: every atomic statement must be wholly owned by exactly one claim`);
        segmentCountByClaim.set(owners[0].claimId, (segmentCountByClaim.get(owners[0].claimId) ?? 0) + 1);
      }
      for (const claimId of unitClaimIds) {
        assert.equal(segmentCountByClaim.get(claimId), 1,
          `${coverageLabel}: claim ${claimId} must cover exactly one atomic statement, table cell, or code statement`);
      }
    }
    if (unit.kind === 'code-block') {
      validateCodeClassification(coverage.codeBlockClassification,
        unitClaimIds.map((claimId) => claimsById.get(claimId)), coverageLabel);
    }
  }
  assert.equal(new Set(coveredClaims).size, coveredClaims.length, `${label}: a claim is used by multiple coverage fragments`);
  assert.deepEqual([...coveredClaims].sort(), [...claimIds].sort(), `${label}: claim coverage is incomplete or contains extras`);
  value.claims.forEach((claim, index) => {
    const unit = unitsById.get(claim.unitId);
    assert(unit, `${label}.claims[${index}]: unknown unitId`);
    validateClaim(root, claim, unit, sourceBuffer, site, publishedPaths, value.reviewedRevision, gitState,
      `${label}.claims[${index}]`);
  });
  const reviewedPaths = [...new Set([
    ...value.claims.flatMap((claim) => claim.targets.map((target) => target.path)),
    ...value.claims.flatMap((claim) => claim.evidence.map((evidence) => evidence.path)),
    ...value.claims.flatMap((claim) => claim.omission?.evidence?.map((evidence) => evidence.path) ?? []),
    ...value.visualEvidence.map((item) => item.renderedPath),
    routeRegistryPath,
  ])];
  for (const reviewedPath of reviewedPaths) {
    let reviewedObject;
    try { reviewedObject = git(root, ['rev-parse', `${value.reviewedRevision}:${reviewedPath}`]).trim(); }
    catch { assert.fail(`${label}: reviewed content ${reviewedPath} is absent at reviewedRevision`); }
    assert.equal(reviewedObject, gitObject(fs.readFileSync(path.join(root, reviewedPath)), root),
      `${label}: ${reviewedPath} changed after reviewedRevision`);
  }
  const contentRoot = computeContentRoot(root, source, value.claims, value.visualEvidence);
  assert.equal(value.contentRoot, contentRoot, `${label}: contentRoot is stale`);
  return { authorId: value.author.id, assignmentId: value.author.assignmentId, claimIds, reviewedRevision: value.reviewedRevision,
    svgUnitIds, svgRelationUnitIds, visualBindings: value.visualEvidence.map((item) => ({
      unitIds: [...item.unitIds].sort(compareText), relationUnitIds: [...item.relationUnitIds].sort(compareText),
      renderedSha256: item.renderedSha256, mediaType: item.mediaType, width: item.width, height: item.height,
      renderer: item.renderer })), redirect: value.redirect };
}

function validateReview(value, source, decisionSha256, decisionInfo, contentRoot, assignment, activeDependencyReview, label) {
  exactKeys(value, ['schemaVersion', 'source', 'reviewer', 'decisionSha256', 'contentRoot', 'claimIds',
    'reviewedRevision', 'classificationVerdict', 'claimVerdicts', 'visualVerdicts', 'activeDependencyReview',
    'verdict', 'findings'], label);
  assert.equal(value.schemaVersion, 'kubeclaw-documentation-parity-review.v1', `${label}: unsupported schemaVersion`);
  validateSourceBinding(value.source, source, `${label}.source`);
  assert.equal(value.reviewedRevision, decisionInfo.reviewedRevision, `${label}: reviewedRevision differs from decision`);
  exactKeys(value.reviewer, ['id', 'assignmentId', 'freshContext', 'readOnly', 'provenance'], `${label}.reviewer`);
  nonempty(value.reviewer.id, `${label}.reviewer.id`);
  assert.notEqual(value.reviewer.id, decisionInfo.authorId, `${label}: decision author and reviewer must be distinct identities`);
  assert.equal(value.reviewer.freshContext, true, `${label}: reviewer must attest fresh context`);
  assert.equal(value.reviewer.readOnly, true, `${label}: reviewer must attest initial read-only review`);
  assert.equal(value.reviewer.assignmentId, decisionInfo.assignmentId, `${label}: review uses a different assignment`);
  assert.equal(value.reviewer.assignmentId, assignment.assignmentId, `${label}: review assignment is not registered`);
  assert.equal(value.reviewer.id, assignment.reviewerId, `${label}: reviewer identity differs from trusted assignment`);
  assert.equal(decisionInfo.authorId, assignment.authorId, `${label}: author identity differs from trusted assignment`);
  exactKeys(value.reviewer.provenance, ['kind', 'revision', 'actorId'], `${label}.reviewer.provenance`);
  assert.equal(value.reviewer.provenance.kind, 'repository-review-assignment', `${label}: unsupported review provenance`);
  assert.equal(value.reviewer.provenance.revision, assignment.authorityRevision, `${label}: provenance revision differs from assignment authority`);
  assert.equal(value.reviewer.provenance.actorId, value.reviewer.id, `${label}: provenance actor differs from reviewer`);
  assert.equal(value.decisionSha256, decisionSha256, `${label}: review is not bound to the exact current decision file`);
  assert.equal(value.contentRoot, contentRoot, `${label}: review contentRoot is stale`);
  assert(Array.isArray(value.claimIds), `${label}.claimIds: must be an array`);
  assert.deepEqual([...value.claimIds].sort(), [...decisionInfo.claimIds].sort(), `${label}: review claim set differs from decision`);
  assert.equal(new Set(value.claimIds).size, value.claimIds.length, `${label}: review claimIds contain duplicates`);
  assert.equal(value.classificationVerdict, 'PASS', `${label}: source classification must be PASS`);
  exactKeys(value.activeDependencyReview, ['reviewedRevision', 'reviewedTree', 'contentRoot', 'scope', 'methods',
    'evidence', 'findings', 'scanner', 'limitation', 'verdict'], `${label}.activeDependencyReview`);
  for (const key of ['reviewedRevision', 'reviewedTree', 'contentRoot', 'scope', 'scanner', 'limitation']) {
    assert.deepEqual(value.activeDependencyReview[key], activeDependencyReview[key],
      `${label}: active dependency attestation is stale or not bound to the reviewed tree`);
  }
  assert(Array.isArray(value.activeDependencyReview.methods)
    && value.activeDependencyReview.methods.length > 0, `${label}: active dependency review requires manual methods`);
  value.activeDependencyReview.methods.forEach((method, index) => {
    exactKeys(method, ['kind', 'detail'], `${label}.activeDependencyReview.methods[${index}]`);
    assert.equal(method.kind, 'manual-inspection', `${label}: dependency-review methods must record manual inspection`);
    nonempty(method.detail, `${label}.activeDependencyReview.methods[${index}].detail`);
  });
  assert(Array.isArray(value.activeDependencyReview.evidence)
    && value.activeDependencyReview.evidence.length > 0, `${label}: active dependency review requires manual evidence`);
  value.activeDependencyReview.evidence.forEach((evidence, index) => {
    exactKeys(evidence, ['kind', 'detail'], `${label}.activeDependencyReview.evidence[${index}]`);
    assert(['scanner-result', 'manual-observation'].includes(evidence.kind),
      `${label}.activeDependencyReview.evidence[${index}]: unsupported evidence kind`);
    nonempty(evidence.detail, `${label}.activeDependencyReview.evidence[${index}].detail`);
  });
  assert(Array.isArray(value.activeDependencyReview.findings),
    `${label}.activeDependencyReview.findings: must be an array`);
  value.activeDependencyReview.findings.forEach((finding, index) => {
    exactKeys(finding, ['id', 'status', 'detail'], `${label}.activeDependencyReview.findings[${index}]`);
    nonempty(finding.id, `${label}.activeDependencyReview.findings[${index}].id`);
    nonempty(finding.detail, `${label}.activeDependencyReview.findings[${index}].detail`);
    assert.equal(finding.status, 'resolved', `${label}: unresolved active dependency finding ${finding.id}`);
  });
  assert.equal(value.activeDependencyReview.verdict, 'PASS', `${label}: active dependency review must PASS`);
  assert.deepEqual(value.activeDependencyReview.scanner.matches, [], `${label}: active dependency scanner found matches`);
  assert(Array.isArray(value.claimVerdicts), `${label}.claimVerdicts: must be an array`);
  assert.deepEqual(value.claimVerdicts.map((item) => item.claimId).sort(), [...decisionInfo.claimIds].sort(),
    `${label}: claim verdict set differs from decision`);
  for (const [index, item] of value.claimVerdicts.entries()) {
    exactKeys(item, ['claimId', ...REVIEW_DIMENSIONS], `${label}.claimVerdicts[${index}]`);
    for (const dimension of REVIEW_DIMENSIONS) assert.equal(item[dimension], 'PASS', `${label}: ${item.claimId} ${dimension} must be PASS`);
  }
  assert(Array.isArray(value.visualVerdicts), `${label}.visualVerdicts: must be an array`);
  const visualUnitIds = [];
  const visualRelationUnitIds = [];
  for (const [index, item] of value.visualVerdicts.entries()) {
    exactKeys(item, ['unitIds', 'relationUnitIds', 'renderedSha256', 'mediaType', 'width', 'height', 'renderer', 'verdict'], `${label}.visualVerdicts[${index}]`);
    assert(Array.isArray(item.unitIds) && item.unitIds.length > 0, `${label}.visualVerdicts[${index}].unitIds: must be non-empty`);
    assert(Array.isArray(item.relationUnitIds), `${label}.visualVerdicts[${index}].relationUnitIds: must be an array`);
    assert.equal(item.verdict, 'PASS', `${label}: rendered SVG review must PASS`);
    assert(SHA256.test(item.renderedSha256), `${label}.visualVerdicts[${index}]: invalid renderedSha256`);
    visualUnitIds.push(...item.unitIds);
    visualRelationUnitIds.push(...item.relationUnitIds);
  }
  assert.deepEqual([...visualUnitIds].sort(compareText), [...decisionInfo.svgUnitIds].sort(compareText),
    `${label}: rendered SVG review coverage differs from decision`);
  assert.deepEqual([...visualRelationUnitIds].sort(compareText), [...decisionInfo.svgRelationUnitIds].sort(compareText),
    `${label}: rendered SVG relationship review coverage differs from decision`);
  assert.deepEqual(value.visualVerdicts.map(({ verdict: _verdict, ...item }) => ({ ...item,
    unitIds: [...item.unitIds].sort(compareText), relationUnitIds: [...item.relationUnitIds].sort(compareText) }))
    .sort((left, right) => compareText(canonical(left), canonical(right))),
  [...decisionInfo.visualBindings].sort((left, right) => compareText(canonical(left), canonical(right))),
  `${label}: rendered SVG review hashes differ from decision evidence`);
  assert.equal(value.verdict, 'PASS', `${label}: reviewer verdict must be PASS`);
  assert(Array.isArray(value.findings), `${label}.findings: must be an array`);
  value.findings.forEach((finding, index) => {
    exactKeys(finding, ['id', 'status', 'detail'], `${label}.findings[${index}]`);
    nonempty(finding.id, `${label}.findings[${index}].id`);
    nonempty(finding.detail, `${label}.findings[${index}].detail`);
    assert.equal(finding.status, 'resolved', `${label}: unresolved finding ${finding.id}`);
  });
}

function loadAssignments(root, gitState) {
  const value = readJson(root, assignmentsPath);
  exactKeys(value, ['schemaVersion', 'assignments'], assignmentsPath);
  assert.equal(value.schemaVersion, 'kubeclaw-documentation-parity-review-assignments.v1',
    `${assignmentsPath}: unsupported schemaVersion`);
  assert(Array.isArray(value.assignments), `${assignmentsPath}.assignments: must be an array`);
  const ids = new Set();
  const sources = new Set();
  for (const [index, item] of value.assignments.entries()) {
    const label = `${assignmentsPath}.assignments[${index}]`;
    exactKeys(item, ['assignmentId', 'originalPath', 'authorId', 'reviewerId', 'issuedBy'], label);
    for (const key of ['assignmentId', 'originalPath', 'authorId', 'reviewerId', 'issuedBy']) nonempty(item[key], `${label}.${key}`);
    assert.notEqual(item.authorId, item.reviewerId, `${label}: author and reviewer must differ`);
    assert(gitState.available, `${label}: Git is required for trusted review assignments`);
    assert(!ids.has(item.assignmentId), `${label}: duplicate assignmentId`);
    assert(!sources.has(item.originalPath), `${label}: duplicate source assignment`);
    ids.add(item.assignmentId);
    sources.add(item.originalPath);
  }
  const authorityRevision = git(root, ['log', '-1', '--format=%H', '--', assignmentsPath]).trim();
  assert(validGitObject(authorityRevision, root), `${assignmentsPath}: assignments must be committed before review`);
  const committedAuthority = JSON.parse(git(root, ['show', `${authorityRevision}:${assignmentsPath}`]));
  assert.equal(canonical(value), canonical(committedAuthority), `${assignmentsPath}: uncommitted assignment changes are not trusted provenance`);
  return new Map(value.assignments.map((item) => [item.originalPath, { ...item, authorityRevision }]));
}

function uniqueField(records, field, label) {
  const values = records.map((item) => item[field]);
  assert.equal(new Set(values).size, values.length, `${label}: duplicate ${field}`);
}

function loadRegistry(root, gitState) {
  const classification = readJson(root, classificationPath);
  const baseline = readJson(root, baselinePath);
  exactKeys(classification, ['schemaVersion', 'baselineRevision', 'files'], classificationPath);
  exactKeys(baseline, ['schemaVersion', 'baselineRevision', 'files'], baselinePath);
  assert.equal(classification.schemaVersion, 'kubeclaw-documentation-tree-classification.v1');
  assert.equal(baseline.schemaVersion, 'kubeclaw-documentation-tree-baseline.v1');
  assert(validGitObject(baseline.baselineRevision, root), `${baselinePath}: invalid baselineRevision`);
  assert.equal(classification.baselineRevision, baseline.baselineRevision, 'classification and baseline revisions differ');
  assert(Array.isArray(classification.files) && Array.isArray(baseline.files), 'classification and baseline files must be arrays');
  uniqueField(classification.files, 'path', classificationPath);
  uniqueField(classification.files, 'originalPath', classificationPath);
  uniqueField(baseline.files, 'originalPath', baselinePath);
  assert(gitState.available, `${baselinePath}: Git is required to validate immutable baseline sources`);
  assert.equal(git(root, ['cat-file', '-t', baseline.baselineRevision]).trim(), 'commit', `${baselinePath}: baselineRevision is not a commit`);
  const immutableTree = immutableDocumentationTree(root, baseline.baselineRevision);
  const recordedTree = baseline.files.map((record, index) => {
    exactKeys(record, ['originalPath', 'gitObject', 'mode', 'kind'], `${baselinePath}.files[${index}]`);
    return record;
  }).sort((left, right) => compareText(left.originalPath, right.originalPath));
  assert.deepEqual(recordedTree, immutableTree,
    `${baselinePath}: files must exactly enumerate every regular file under docs/ at baselineRevision`);
  const baselineByOriginal = new Map(baseline.files.map((item) => [item.originalPath, item]));
  const baselinePaths = new Set(baseline.files.map((item) => item.originalPath));
  for (const [index, item] of classification.files.entries()) {
    const label = `${classificationPath}.files[${index}]`;
    exactKeys(item, ['path', 'class', 'purpose', 'originalPath', 'expectedPath', 'introducedAfterBaseline'], label);
    assert.equal(item.introducedAfterBaseline, !baselinePaths.has(item.originalPath),
      `${label}: introducedAfterBaseline disagrees with the immutable baseline universe`);
  }
  assert.deepEqual(classification.files.filter((item) => !item.introducedAfterBaseline)
    .map((item) => item.originalPath).sort(compareText), [...baselinePaths].sort(compareText),
  `${classificationPath}: every immutable baseline path must be classified exactly once`);
  const sources = classification.files.filter((item) => item.class === 'legacy-extraction-source')
    .sort((a, b) => compareText(a.originalPath, b.originalPath)).map((item) => {
      assert(item.path.startsWith('docs/_legacy-source/'), `${item.path}: legacy extraction source is outside its boundary`);
      assert.equal(item.path, item.expectedPath, `${item.path}: expectedPath differs from legacy path`);
      const record = baselineByOriginal.get(item.originalPath);
      assert(record, `${item.path}: no baseline record for ${item.originalPath}`);
      assert(validGitObject(record.gitObject, root), `${item.path}: invalid baseline gitObject`);
      const absolute = safeRepositoryPath(root, item.path, item.path);
      assert(fs.existsSync(absolute) && fs.lstatSync(absolute).isFile(), `${item.path}: legacy source must be a regular file`);
      assert.equal(gitObject(fs.readFileSync(absolute), root), record.gitObject, `${item.path}: bytes differ from baseline gitObject`);
      let entry;
      try { entry = git(root, ['ls-tree', baseline.baselineRevision, '--', item.originalPath]).trim(); }
      catch { assert.fail(`${item.originalPath}: cannot resolve recovery source at baseline revision`); }
      const match = /^(\d+)\s+(\w+)\s+([0-9a-f]+)\t/u.exec(entry);
      assert(match, `${item.originalPath}: recovery source is absent at baseline revision`);
      assert.equal(match[1], record.mode, `${item.originalPath}: baseline mode differs from registry`);
      assert.equal(match[2], 'blob', `${item.originalPath}: baseline source is not a blob`);
      assert.equal(match[3], record.gitObject, `${item.originalPath}: baseline revision/path resolves to the wrong blob`);
      return {
        originalPath: item.originalPath,
        legacyPath: item.path,
        classification: item.class,
        baselineRevision: baseline.baselineRevision,
        gitObject: record.gitObject,
      };
    });
  assert(sources.length > 0, `${classificationPath}: no legacy extraction sources`);
  const publishedPaths = new Set(classification.files
    .filter((item) => item.class === 'canonical-reader-documentation' && item.path.endsWith('.md'))
    .map((item) => item.path));
  return { sources, publishedPaths };
}

function runReadinessGates(root, revision, allowDeletionManifestOutput = false) {
  return REQUIRED_GATES.map((gate) => {
    assertReadinessTree(root, revision, allowDeletionManifestOutput, `${gate.id}: before gate execution`);
    execFileSync(process.execPath, [...(gate.nodeArgs ?? []), gate.file, ...gate.args], {
      cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
    assertReadinessTree(root, revision, allowDeletionManifestOutput, `${gate.id}: after gate execution`);
    const commandSha256 = sha256(canonical({ executable: 'node', nodeArgs: gate.nodeArgs ?? [],
      file: gate.file, args: gate.args }));
    return { id: gate.id, revision, status: 'PASS', commandSha256 };
  });
}

function validateGateResults(results, revision) {
  assert(Array.isArray(results), 'readiness gate runner must return an array');
  assert.deepEqual(results.map((item) => item.id).sort(compareText), REQUIRED_GATES.map((item) => item.id).sort(compareText),
    'readiness gate result set is incomplete');
  for (const [index, item] of results.entries()) {
    exactKeys(item, ['id', 'revision', 'status', 'commandSha256'], `readinessGates[${index}]`);
    assert.equal(item.revision, revision, `${item.id}: gate ran against another revision`);
    assert.equal(item.status, 'PASS', `${item.id}: readiness gate did not pass`);
    assert(SHA256.test(item.commandSha256), `${item.id}: invalid gate command hash`);
  }
}

function validateParity({ root = defaultRoot, readiness = false, collectFindings = false,
  allowDeletionManifestOutput = false } = {}) {
  const gitState = gitContext(root);
  assert(gitState.available, 'documentation parity validation requires a Git repository with HEAD');
  const built = buildParityInventory(root);
  assert.equal(fs.readFileSync(path.join(root, unitsPath), 'utf8'), built.jsonl,
    `${unitsPath}: checked-in extraction differs from an independent rebuild`);
  assert.equal(fs.readFileSync(path.join(root, extractionSummaryPath), 'utf8'), built.renderedSummary,
    `${extractionSummaryPath}: checked-in extraction summary differs from an independent rebuild`);
  const { sources, publishedPaths } = loadRegistry(root, gitState);
  const allUnits = loadUnits(root);
  const extractionSummary = readJson(root, extractionSummaryPath);
  assert.equal(extractionSummary.schemaVersion, 'kubeclaw-documentation-parity-summary.v1',
    `${extractionSummaryPath}: unsupported schemaVersion`);
  assert.equal(extractionSummary.baselineRevision, sources[0].baselineRevision,
    `${extractionSummaryPath}: baselineRevision is stale`);
  assert.equal(extractionSummary.unitsJsonlSha256, sha256(fs.readFileSync(path.join(root, unitsPath))),
    `${extractionSummaryPath}: unitsJsonlSha256 is stale`);
  assert(Array.isArray(extractionSummary.sources), `${extractionSummaryPath}.sources: must be an array`);
  uniqueField(extractionSummary.sources, 'originalPath', `${extractionSummaryPath}.sources`);
  assert.deepEqual(extractionSummary.sources.map((item) => item.originalPath).sort(compareText),
    sources.map((item) => item.originalPath).sort(compareText), `${extractionSummaryPath}: source set differs from classification`);
  const site = siteIndex(root);
  assert.deepEqual(site.pages.map((page) => page.file).sort(compareText), [...publishedPaths].sort(compareText),
    `${classificationPath}: canonical publication allowlist differs from docs/site Markdown files`);
  const sourceByOriginal = new Map(sources.map((source) => [source.originalPath, source]));
  const unitsBySource = new Map(sources.map((source) => [source.originalPath, []]));
  for (const unit of allUnits) {
    const originalPath = unitOriginalPath(unit);
    assert(unitsBySource.has(originalPath), `${unit.unitId}: extraction unit belongs to a non-legacy source ${originalPath}`);
    const source = sourceByOriginal.get(originalPath);
    assert.equal(unit.legacyPath, source.legacyPath, `${unit.unitId}: stale legacyPath`);
    assert.equal(unit.baselineRevision, source.baselineRevision, `${unit.unitId}: stale baselineRevision`);
    assert.equal(unitGitObject(unit), source.gitObject, `${unit.unitId}: stale baseline gitObject`);
    validateSpan(fs.readFileSync(path.join(root, source.legacyPath)), unit, unit.unitId);
    unitsBySource.get(originalPath).push(unit);
  }

  const assignments = loadAssignments(root, gitState);
  assert.deepEqual([...assignments.keys()].sort(compareText), sources.map((source) => source.originalPath).sort(compareText),
    `${assignmentsPath}: assignment source set differs from extraction sources`);
  const referenceIndex = buildReferenceIndex(root, sources);
  const records = [];
  const sourceInspections = [];
  for (const sourceBase of sources) {
    const units = unitsBySource.get(sourceBase.originalPath).sort((a, b) => a.byteStart - b.byteStart || compareText(a.unitId, b.unitId));
    assert(units.length > 0, `${sourceBase.legacyPath}: extractor produced no units`);
    const source = { ...sourceBase, extractionDigest: extractionDigest(sourceBase, units) };
    const decisionPath = decisionRelative(source.originalPath);
    const reviewPath = reviewRelative(source.originalPath);
    const inspectionBase = { originalPath: source.originalPath, legacyPath: source.legacyPath,
      baselineRevision: source.baselineRevision, gitObject: source.gitObject, extractionDigest: source.extractionDigest,
      unitCount: units.length, decisionPath, reviewPath };
    if (!fs.existsSync(path.join(root, decisionPath))) {
      if (!collectFindings) assert.fail(`${decisionPath}: one decision file is required for this legacy source`);
      sourceInspections.push({ ...inspectionBase, state: 'missing-decision', findings: [`${decisionPath}: decision is missing`] });
      continue;
    }
    const summarySource = extractionSummary.sources?.find((item) => item.originalPath === source.originalPath);
    assert(summarySource, `${extractionSummaryPath}: missing source ${source.originalPath}`);
    assert.equal(summarySource.extractionDigest, source.extractionDigest,
      `${extractionSummaryPath}: extractionDigest is stale for ${source.originalPath}`);
    let decisionBytes;
    let decision;
    try {
      decisionBytes = fs.readFileSync(path.join(root, decisionPath));
      decision = JSON.parse(decisionBytes.toString('utf8'));
      if (decision?.schemaVersion === 'kubeclaw-documentation-parity-untriaged.v1') {
        exactKeys(decision, ['schemaVersion', 'status', 'source'], decisionPath);
        assert.equal(decision.status, 'untriaged', `${decisionPath}: scaffold status must be untriaged`);
        validateSourceBinding(decision.source, source, `${decisionPath}.source`);
        if (!collectFindings) assert.fail(`${decisionPath}: untriaged decision cannot pass content validation`);
        sourceInspections.push({ ...inspectionBase, state: 'untriaged-decision', findings: [] });
        continue;
      }
    } catch (error) {
      if (!collectFindings) throw error;
      sourceInspections.push({ ...inspectionBase, state: 'invalid-decision', findings: [error.message ?? String(error)] });
      continue;
    }
    let info;
    try {
      info = validateDecision(root, decision, source, units, site, publishedPaths, gitState, decisionPath);
    } catch (error) {
      if (!collectFindings) throw error;
      sourceInspections.push({ ...inspectionBase, state: 'invalid-decision', findings: [error.message ?? String(error)] });
      continue;
    }
    if (!fs.existsSync(path.join(root, reviewPath))) {
      if (!collectFindings) assert.fail(`${reviewPath}: one independent review file is required for this legacy source`);
      sourceInspections.push({ ...inspectionBase, state: 'missing-review', findings: [`${reviewPath}: review is missing`] });
      continue;
    }
    const decisionSha256 = sha256(decisionBytes);
    const assignment = assignments.get(source.originalPath);
    const references = referenceIndex.references.get(source.originalPath);
    if (references.length) {
      const message = `${source.originalPath}: active files still depend on the old or legacy path: ${references.join(', ')}`;
      if (!collectFindings) assert.fail(message);
      sourceInspections.push({ ...inspectionBase, state: 'invalid-review', findings: [message] });
      continue;
    }
    const dependencyReview = buildActiveDependencyReview(root, source, decision.reviewedRevision,
      decision.contentRoot, referenceIndex);
    try {
      validateReview(readJson(root, reviewPath), source, decisionSha256, info, decision.contentRoot,
        assignment, dependencyReview, reviewPath);
    } catch (error) {
      if (!collectFindings) throw error;
      sourceInspections.push({ ...inspectionBase, state: 'invalid-review', findings: [error.message ?? String(error)] });
      continue;
    }
    records.push({
      originalPath: source.originalPath,
      legacyPath: source.legacyPath,
      baselineRevision: source.baselineRevision,
      gitObject: source.gitObject,
      extractionDigest: source.extractionDigest,
      decisionPath,
      decisionSha256,
      reviewPath,
      contentRoot: decision.contentRoot,
      claimCount: decision.claims.length,
      canonicalTargets: [...new Set(decision.claims.flatMap((claim) => claim.targets.map((target) => target.path)))].sort(),
      redirectNeed: decision.redirect,
      activeReferences: references,
      recoveryCommand: `git show ${source.baselineRevision}:${source.originalPath}`,
      reviewState: 'PASS',
      deletionReady: false,
    });
    sourceInspections.push({ ...inspectionBase, state: 'source-valid', findings: [] });
  }
  const expectedDecisions = new Set(sources.map((source) => decisionRelative(source.originalPath)));
  const expectedReviews = new Set(sources.map((source) => reviewRelative(source.originalPath)));
  for (const file of relativeFiles(root, decisionsRoot).filter((item) => item.endsWith('.json'))) {
    assert(expectedDecisions.has(file), `${file}: decision does not belong to a classified legacy source`);
  }
  for (const file of relativeFiles(root, reviewsRoot).filter((item) => item.endsWith('.json'))) {
    assert(expectedReviews.has(file), `${file}: review does not belong to a classified legacy source`);
  }
  if (collectFindings) {
    return {
      schemaVersion: 'kubeclaw-documentation-parity-inspection.v1',
      validatedRevision: gitState.head,
      globalFindings: [],
      sources: sourceInspections,
      valid: sourceInspections.every((item) => item.state === 'source-valid'),
    };
  }
  let readinessGates = [];
  if (readiness) {
    assertReadinessTree(root, gitState.head, allowDeletionManifestOutput);
    readinessGates = runReadinessGates(root, gitState.head, allowDeletionManifestOutput);
    validateGateResults(readinessGates, gitState.head);
  }
  const manifestContentRoot = sha256(canonical({ records: records.map((item) => ({
    originalPath: item.originalPath, contentRoot: item.contentRoot, decisionSha256: item.decisionSha256,
  })), readinessGates }));
  for (const record of records) record.deletionReady = readiness;
  return {
    schemaVersion: 'kubeclaw-documentation-deletion-manifest.v1',
    baselineRevision: sources[0].baselineRevision,
    validatedRevision: gitState.head,
    contentRoot: manifestContentRoot,
    readinessGates,
    sources: records,
    deletionReady: readiness && records.length === sources.length,
  };
}

function inspectParitySources(options = {}) {
  try {
    return validateParity({ ...options, readiness: false, collectFindings: true });
  } catch (error) {
    return {
      schemaVersion: 'kubeclaw-documentation-parity-inspection.v1',
      validatedRevision: gitContext(options.root ?? defaultRoot).head,
      globalFindings: [{ kind: 'authority-or-tool-error', detail: error.message ?? String(error) }],
      sources: [],
      valid: false,
    };
  }
}

function writeDeterministic(relative, value, root = defaultRoot, fileSystem = fs) {
  const absolute = safeRepositoryPath(root, relative, 'output', { mustExist: false, createParents: true });
  const temporary = path.join(path.dirname(absolute),
    `.${path.basename(absolute)}.tmp-${process.pid}-${crypto.randomBytes(12).toString('hex')}`);
  let descriptor;
  try {
    const flags = fileSystem.constants.O_WRONLY | fileSystem.constants.O_CREAT
      | fileSystem.constants.O_EXCL | fileSystem.constants.O_NOFOLLOW;
    descriptor = fileSystem.openSync(temporary, flags, 0o666);
    fileSystem.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
    fileSystem.fsyncSync(descriptor);
    fileSystem.closeSync(descriptor);
    descriptor = undefined;
    fileSystem.renameSync(temporary, absolute);
  } finally {
    if (descriptor !== undefined) fileSystem.closeSync(descriptor);
    try { if (fileSystem.existsSync(temporary)) fileSystem.unlinkSync(temporary); } catch { /* preserve primary error */ }
  }
}

function main() {
  const reportArg = process.argv.find((argument) => argument.startsWith('--deletion-manifest='));
  const checkReportArg = process.argv.find((argument) => argument.startsWith('--check-deletion-manifest='));
  assert(!(reportArg && checkReportArg), 'choose generation or check for the deletion manifest, not both');
  const readiness = process.argv.includes('--readiness') || Boolean(reportArg || checkReportArg);
  if (reportArg) assert.equal(reportArg.slice('--deletion-manifest='.length), deletionManifestPath,
    `deletion manifest path is fixed at ${deletionManifestPath}`);
  if (checkReportArg) assert.equal(checkReportArg.slice('--check-deletion-manifest='.length), deletionManifestPath,
    `deletion manifest path is fixed at ${deletionManifestPath}`);
  const manifest = validateParity({ readiness, allowDeletionManifestOutput: Boolean(checkReportArg) });
  if (reportArg) writeDeterministic(deletionManifestPath, manifest);
  if (checkReportArg) {
    const relative = deletionManifestPath;
    const absolute = safeRepositoryPath(defaultRoot, relative, 'deletion manifest');
    assert(fs.existsSync(absolute), `${relative}: deletion manifest is missing`);
    assert.equal(fs.readFileSync(absolute, 'utf8'), `${JSON.stringify(manifest, null, 2)}\n`,
      `${relative}: deletion manifest is stale`);
  }
  const label = manifest.deletionReady ? 'PASS' : 'VALID (readiness gates not requested)';
  process.stdout.write(`documentation parity: ${label} (${manifest.sources.length} sources, ${manifest.sources.reduce((n, item) => n + item.claimCount, 0)} claims)\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    process.stderr.write(`documentation parity: FAIL\n${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}

export {
  buildActiveDependencyReview,
  computeContentRoot,
  extractionDigest,
  gitObject,
  inspectRenderedImage,
  inspectParitySources,
  PARITY_SOURCE_STATES,
  normalizeExcerpt,
  sha256,
  validateParity,
  deletionManifestPath,
  writeDeterministic,
};
