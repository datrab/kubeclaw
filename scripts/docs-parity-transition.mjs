#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readinessGateCommands } from './lib/docs-parity-gates.mjs';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const deletionApprovalPath = 'docs/config/documentation-ap10-deletion-approval.json';
export const deletionManifestPath = 'docs/generated/inventory/documentation-deletion-manifest.json';
const classificationPath = 'docs/config/documentation-tree-classification.json';
const baselinePath = 'docs/config/documentation-tree-baseline.json';
const IDENTITY_LIMIT = 'repository-assertions-only; authenticated reviewer identity must be enforced by the acceptance workflow';
const SHA256 = /^[0-9a-f]{64}$/u;

function git(root, args, options = {}) {
  return execFileSync('git', args, {
    cwd: root,
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' },
    encoding: options.encoding ?? 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  });
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function exactKeys(value, expected, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label}: must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(),
    `${label}: fields must be exactly ${expected.join(', ')}`);
}

function nonempty(value, label) {
  assert.equal(typeof value, 'string', `${label}: must be a string`);
  assert(value.trim(), `${label}: must not be empty`);
}

function showBytes(root, revision, repositoryPath) {
  return git(root, ['show', `${revision}:${repositoryPath}`], { encoding: 'buffer' });
}

function showJson(root, revision, repositoryPath) {
  try { return JSON.parse(showBytes(root, revision, repositoryPath).toString('utf8')); }
  catch (error) { throw new Error(`${repositoryPath} at ${revision}: ${error.message}`); }
}

function objectAt(root, revision, repositoryPath) {
  try { return git(root, ['rev-parse', `${revision}:${repositoryPath}`]).trim(); }
  catch { return null; }
}

function firstParent(root, revision) {
  const parents = git(root, ['show', '-s', '--format=%P', revision]).trim().split(/\s+/u).filter(Boolean);
  assert(parents.length > 0, `${revision}: transition commits require a parent`);
  return parents[0];
}

function changedPaths(root, before, after) {
  return git(root, ['diff-tree', '--no-commit-id', '--name-only', '-r', before, after])
    .split('\n').filter(Boolean).sort();
}

function classificationAt(root, revision) {
  const value = showJson(root, revision, classificationPath);
  assert.equal(value.schemaVersion, 'kubeclaw-documentation-tree-classification.v1',
    `${classificationPath}: unsupported schemaVersion`);
  assert(Array.isArray(value.files), `${classificationPath}: files must be an array`);
  return value;
}

function baselineAt(root, revision) {
  const value = showJson(root, revision, baselinePath);
  assert.equal(value.schemaVersion, 'kubeclaw-documentation-tree-baseline.v1',
    `${baselinePath}: unsupported schemaVersion`);
  assert(Array.isArray(value.files), `${baselinePath}: files must be an array`);
  return value;
}

function expectedDeletions(root, reviewedRevision) {
  const classification = classificationAt(root, reviewedRevision);
  const baseline = baselineAt(root, reviewedRevision);
  const baselineByOriginal = new Map(baseline.files.map((item) => [item.originalPath, item]));
  return classification.files.filter((item) => ['legacy-extraction-source', 'deletable-remainder'].includes(item.class))
    .map((item) => {
      const gitObject = objectAt(root, reviewedRevision, item.path);
      assert(gitObject, `${item.path}: approved deletion path is absent from the reviewed tree`);
      if (item.class === 'legacy-extraction-source') {
        const immutable = baselineByOriginal.get(item.originalPath);
        assert(immutable, `${item.path}: legacy source lacks an immutable baseline record`);
        assert.equal(gitObject, immutable.gitObject, `${item.path}: reviewed legacy blob differs from baseline`);
      }
      return { path: item.path, originalPath: item.originalPath, classification: item.class, gitObject };
    }).sort((left, right) => left.path.localeCompare(right.path));
}

function validateFindings(findings, label) {
  assert(Array.isArray(findings), `${label}: must be an array`);
  findings.forEach((finding, index) => {
    exactKeys(finding, ['id', 'status', 'detail'], `${label}[${index}]`);
    nonempty(finding.id, `${label}[${index}].id`);
    nonempty(finding.detail, `${label}[${index}].detail`);
    assert.equal(finding.status, 'resolved', `${label}: unresolved finding ${finding.id}`);
  });
}

function validateClassificationApproval(root, revision, deletion, value, label) {
  if (deletion.classification === 'legacy-extraction-source') {
    exactKeys(value, ['kind', 'reviewPath', 'reviewerId', 'verdict'], label);
    assert.equal(value.kind, 'parity-source-review', `${label}: invalid review kind`);
    nonempty(value.reviewPath, `${label}.reviewPath`);
    nonempty(value.reviewerId, `${label}.reviewerId`);
    assert.equal(value.verdict, 'PASS', `${label}: source classification review must PASS`);
    const review = showJson(root, revision, value.reviewPath);
    assert.equal(review.classificationVerdict, 'PASS', `${label}: cited parity review did not approve classification`);
    assert.equal(review.reviewer?.id, value.reviewerId, `${label}: cited parity reviewer differs`);
    assert.equal(review.source?.originalPath, deletion.originalPath, `${label}: cited review belongs to another source`);
    return;
  }

  exactKeys(value, ['kind', 'reviewerId', 'reviewedRevision', 'scope', 'methods', 'evidence', 'findings',
    'verdict'], label);
  assert.equal(value.kind, 'independent-remainder-review', `${label}: invalid review kind`);
  nonempty(value.reviewerId, `${label}.reviewerId`);
  assert.equal(value.reviewedRevision, revision, `${label}: remainder review is stale`);
  assert.deepEqual(value.scope, { path: deletion.path, originalPath: deletion.originalPath,
    classification: 'deletable-remainder' }, `${label}: review scope differs from the deletion`);
  assert(Array.isArray(value.methods) && value.methods.length > 0, `${label}: manual methods are required`);
  value.methods.forEach((method, index) => nonempty(method, `${label}.methods[${index}]`));
  assert(Array.isArray(value.evidence) && value.evidence.length > 0, `${label}: evidence is required`);
  value.evidence.forEach((evidence, index) => {
    exactKeys(evidence, ['path', 'gitObject', 'detail'], `${label}.evidence[${index}]`);
    nonempty(evidence.path, `${label}.evidence[${index}].path`);
    nonempty(evidence.detail, `${label}.evidence[${index}].detail`);
    assert.equal(objectAt(root, revision, evidence.path), evidence.gitObject,
      `${label}.evidence[${index}]: evidence blob is stale`);
  });
  assert(value.evidence.some((item) => item.path === deletion.path && item.gitObject === deletion.gitObject),
    `${label}: evidence does not bind the classified blob`);
  validateFindings(value.findings, `${label}.findings`);
  assert.equal(value.verdict, 'PASS', `${label}: remainder classification review must PASS`);
}

function validateManifest(root, approvalCommit, reviewedRevision, expected, approval) {
  const bytes = showBytes(root, approvalCommit, deletionManifestPath);
  assert.equal(sha256(bytes), approval.readinessManifest.sha256,
    `${deletionManifestPath}: approval digest is stale`);
  const manifest = JSON.parse(bytes.toString('utf8'));
  exactKeys(manifest, ['schemaVersion', 'baselineRevision', 'validatedRevision', 'contentRoot',
    'readinessGates', 'sources', 'deletionReady'], deletionManifestPath);
  assert.equal(manifest.schemaVersion, 'kubeclaw-documentation-deletion-manifest.v1',
    `${deletionManifestPath}: unsupported schemaVersion`);
  assert.equal(manifest.validatedRevision, reviewedRevision,
    `${deletionManifestPath}: readiness was not run at the approved revision`);
  assert.equal(manifest.deletionReady, true, `${deletionManifestPath}: deletionReady must be true`);
  assert(SHA256.test(manifest.contentRoot), `${deletionManifestPath}: invalid contentRoot`);
  const expectedGates = readinessGateCommands.map((gate) => ({ id: gate.id, revision: reviewedRevision,
    status: 'PASS', commandSha256: sha256(canonical({ executable: 'node', nodeArgs: gate.nodeArgs ?? [],
      file: gate.file, args: gate.args })) }));
  assert.deepEqual(manifest.readinessGates, expectedGates,
    `${deletionManifestPath}: readiness gate evidence is incomplete or stale`);
  const legacy = expected.filter((item) => item.classification === 'legacy-extraction-source');
  assert.deepEqual(manifest.sources.map((item) => item.originalPath).sort(),
    legacy.map((item) => item.originalPath).sort(), `${deletionManifestPath}: legacy source set is incomplete`);
  for (const source of manifest.sources) {
    const deletion = legacy.find((item) => item.originalPath === source.originalPath);
    assert.equal(source.legacyPath, deletion.path, `${source.originalPath}: manifest legacyPath is stale`);
    assert.equal(source.gitObject, deletion.gitObject, `${source.originalPath}: manifest blob is stale`);
    assert.equal(source.deletionReady, true, `${source.originalPath}: source is not deletion-ready`);
    assert.equal(source.reviewState, 'PASS', `${source.originalPath}: source review did not pass`);
  }
}

function approvalIntroduction(root) {
  const commits = git(root, ['log', '--format=%H', '--diff-filter=A', '--', deletionApprovalPath])
    .split('\n').filter(Boolean);
  assert.equal(commits.length, 1, `${deletionApprovalPath}: approval must be introduced exactly once`);
  return commits[0];
}

function validateApproval(root, approvalCommit) {
  const reviewedRevision = firstParent(root, approvalCommit);
  assert.deepEqual(changedPaths(root, reviewedRevision, approvalCommit),
    [deletionApprovalPath, deletionManifestPath].sort(),
    `${approvalCommit}: readiness approval commit may change only the approval and generated manifest`);
  const approval = showJson(root, approvalCommit, deletionApprovalPath);
  exactKeys(approval, ['schemaVersion', 'reviewedRevision', 'reviewedTree', 'readinessManifest',
    'identityAssurance', 'deletions', 'verdict'], deletionApprovalPath);
  assert.equal(approval.schemaVersion, 'kubeclaw-documentation-ap10-deletion-approval.v1',
    `${deletionApprovalPath}: unsupported schemaVersion`);
  assert.equal(approval.reviewedRevision, reviewedRevision,
    `${deletionApprovalPath}: approval must review its exact parent`);
  assert.equal(approval.reviewedTree, git(root, ['rev-parse', `${reviewedRevision}^{tree}`]).trim(),
    `${deletionApprovalPath}: reviewed tree is stale`);
  assert.deepEqual(approval.readinessManifest, { path: deletionManifestPath,
    sha256: sha256(showBytes(root, approvalCommit, deletionManifestPath)) },
  `${deletionApprovalPath}: readiness manifest binding is stale`);
  assert.equal(approval.identityAssurance, IDENTITY_LIMIT,
    `${deletionApprovalPath}: identity assurance must state the unauthenticated repository limit`);
  assert.equal(approval.verdict, 'APPROVE_AP10_DELETION', `${deletionApprovalPath}: deletion is not approved`);
  assert(Array.isArray(approval.deletions), `${deletionApprovalPath}.deletions: must be an array`);
  const expected = expectedDeletions(root, reviewedRevision);
  assert.deepEqual(approval.deletions.map((item) => item.path).sort(), expected.map((item) => item.path),
    `${deletionApprovalPath}: approval must enumerate the complete legacy and deletable-remainder set`);
  const byPath = new Map(expected.map((item) => [item.path, item]));
  for (const [index, item] of approval.deletions.entries()) {
    const label = `${deletionApprovalPath}.deletions[${index}]`;
    exactKeys(item, ['path', 'originalPath', 'classification', 'gitObject', 'classificationApproval'], label);
    const deletion = byPath.get(item.path);
    assert(deletion, `${label}: path is not in the reviewed deletion set`);
    assert.deepEqual({ path: item.path, originalPath: item.originalPath, classification: item.classification,
      gitObject: item.gitObject }, deletion, `${label}: deletion identity is stale`);
    validateClassificationApproval(root, reviewedRevision, deletion, item.classificationApproval,
      `${label}.classificationApproval`);
  }
  validateManifest(root, approvalCommit, reviewedRevision, expected, approval);
  return { approval, reviewedRevision, expected };
}

function validateDeletionCommit(root, approvalCommit, expected, head) {
  const afterApproval = git(root, ['rev-list', '--reverse', '--first-parent', `${approvalCommit}..${head}`])
    .split('\n').filter(Boolean);
  if (afterApproval.length === 0) {
    for (const item of expected) assert.equal(objectAt(root, head, item.path), item.gitObject,
      `${item.path}: approved blob changed before the AP10 deletion commit`);
    return { phase: 'approval-committed', deletionCommit: null };
  }
  const deletionCommit = afterApproval[0];
  assert.equal(firstParent(root, deletionCommit), approvalCommit,
    'AP10 deletion commit must have the readiness approval commit as its exact first parent');
  const changes = git(root, ['diff-tree', '--no-commit-id', '--name-status', '-r', approvalCommit, deletionCommit])
    .split('\n').filter(Boolean).map((line) => {
      const [status, ...parts] = line.split('\t');
      return { status, path: parts.at(-1) };
    });
  const expectedByPath = new Map(expected.map((item) => [item.path, item]));
  for (const item of expected) {
    const change = changes.find((candidate) => candidate.path === item.path);
    assert(change, `${item.path}: approved deletion is missing from the AP10 deletion commit`);
    assert.equal(change.status, 'D', `${item.path}: AP10 must delete, not modify or rename, the approved blob`);
    assert.equal(objectAt(root, approvalCommit, item.path), item.gitObject,
      `${item.path}: deleted blob differs from the approval`);
    assert.equal(objectAt(root, deletionCommit, item.path), null, `${item.path}: deletion commit retained the approved path`);
  }
  for (const change of changes.filter((item) => item.status === 'D'
    && (item.path.startsWith('docs/_legacy-source/') || expectedByPath.has(item.path)))) {
    assert(expectedByPath.has(change.path), `${change.path}: deletion commit removed an unapproved legacy blob`);
  }
  for (const item of expected) assert.equal(objectAt(root, head, item.path), null,
    `${item.path}: an approved legacy blob was restored after AP10 deletion`);
  return { phase: 'deletion-verified', deletionCommit };
}

export function validateParityTransition(root = defaultRoot) {
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  if (!objectAt(root, head, deletionApprovalPath)) {
    const expected = expectedDeletions(root, head);
    for (const item of expected) assert.equal(objectAt(root, head, item.path), item.gitObject,
      `${item.path}: documentation deletion requires a committed AP10 approval`);
    return { phase: 'pre-approval', head, approvalCommit: null, deletionCommit: null,
      approvedDeletionCount: 0, approvedPaths: [], approvedOriginalPaths: [] };
  }
  const approvalCommit = approvalIntroduction(root);
  try { git(root, ['merge-base', '--is-ancestor', approvalCommit, head]); }
  catch { assert.fail(`${deletionApprovalPath}: approval commit is not an ancestor of HEAD`); }
  const { expected } = validateApproval(root, approvalCommit);
  const transition = validateDeletionCommit(root, approvalCommit, expected, head);
  return { ...transition, head, approvalCommit, approvedDeletionCount: expected.length,
    approvedPaths: expected.map((item) => item.path),
    approvedOriginalPaths: expected.map((item) => item.originalPath) };
}

export function approvedDocumentationDeletions(root = defaultRoot) {
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  if (!objectAt(root, head, deletionApprovalPath)) {
    return { paths: new Set(), originalPaths: new Set() };
  }
  const result = validateParityTransition(root);
  return result.phase === 'deletion-verified'
    ? { paths: new Set(result.approvedPaths), originalPaths: new Set(result.approvedOriginalPaths) }
    : { paths: new Set(), originalPaths: new Set() };
}

function main() {
  const result = validateParityTransition();
  process.stdout.write(`documentation parity transition: PASS (${result.phase}; ${result.approvedDeletionCount} approved deletions)\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    process.stderr.write(`documentation parity transition: FAIL\n${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}
