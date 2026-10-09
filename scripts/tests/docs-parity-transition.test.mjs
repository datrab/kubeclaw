import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  deletionApprovalPath,
  deletionManifestPath,
  validateParityTransition,
} from '../docs-parity-transition.mjs';

function write(root, relative, value) {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, value);
}

function json(root, relative, value) {
  write(root, relative, `${JSON.stringify(value, null, 2)}\n`);
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function commit(root, message) {
  git(root, ['add', '-A']);
  git(root, ['commit', '-qm', message]);
  return git(root, ['rev-parse', 'HEAD']);
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

const fixtureGateCommands = [{ id: 'fixture-readiness', file: 'scripts/fixture-gate.mjs', args: [] }];

function fixtureManifestRoot({ baselineRevision, reviewedRevision, legacyObject, reviewObject, gates }) {
  return sha256(canonical({ baselineRevision, reviewedRevision, legacyObject, reviewObject, gates }));
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-parity-transition-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  git(root, ['config', 'user.email', 'fixture@example.test']);
  git(root, ['config', 'user.name', 'Fixture']);
  write(root, 'docs/legacy.md', '# Legacy\n');
  write(root, 'docs/review/old.md', '# Old review\n');
  const baselineRevision = commit(root, 'immutable baseline');
  const legacyObject = git(root, ['rev-parse', `${baselineRevision}:docs/legacy.md`]);
  const remainderObject = git(root, ['rev-parse', `${baselineRevision}:docs/review/old.md`]);
  fs.unlinkSync(path.join(root, 'docs/legacy.md'));
  write(root, 'docs/_legacy-source/legacy.md', '# Legacy\n');
  write(root, 'docs/_legacy-source/internal.txt', 'temporary non-reader input\n');
  json(root, 'docs/config/documentation-tree-baseline.json', {
    schemaVersion: 'kubeclaw-documentation-tree-baseline.v1', baselineRevision,
    files: [
      { originalPath: 'docs/legacy.md', gitObject: legacyObject, mode: '100644', kind: 'markdown' },
      { originalPath: 'docs/review/old.md', gitObject: remainderObject, mode: '100644', kind: 'markdown' },
    ],
  });
  json(root, 'docs/config/documentation-tree-classification.json', {
    schemaVersion: 'kubeclaw-documentation-tree-classification.v1', baselineRevision,
    files: [
      { path: 'docs/_legacy-source/legacy.md', class: 'legacy-extraction-source', purpose: 'fixture',
        originalPath: 'docs/legacy.md', expectedPath: 'docs/_legacy-source/legacy.md', introducedAfterBaseline: false },
      { path: 'docs/review/old.md', class: 'deletable-remainder', purpose: 'fixture',
        originalPath: 'docs/review/old.md', expectedPath: 'docs/review/old.md', introducedAfterBaseline: false },
      { path: 'docs/_legacy-source/internal.txt', class: 'internal-documentation-input', purpose: 'fixture',
        originalPath: 'docs/_legacy-source/internal.txt', expectedPath: 'docs/_legacy-source/internal.txt',
        introducedAfterBaseline: true },
    ],
  });
  const reviewPath = 'docs/config/documentation-parity-reviews/legacy.md.json';
  json(root, reviewPath, { schemaVersion: 'fixture', source: { originalPath: 'docs/legacy.md' },
    reviewer: { id: 'source-reviewer' }, classificationVerdict: 'PASS' });
  write(root, 'scripts/lib/docs-parity-gates.mjs',
    `export const readinessGateCommands = Object.freeze(${JSON.stringify(fixtureGateCommands)});\n`);
  write(root, 'scripts/fixture-gate.mjs', "process.stdout.write('fixture readiness: PASS\\n');\n");
  write(root, 'scripts/docs-parity-check.mjs', `
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { readinessGateCommands } from './lib/docs-parity-gates.mjs';
const canonical = (value) => Array.isArray(value) ? \`[\${value.map(canonical).join(',')}]\`
  : value && typeof value === 'object' ? \`{\${Object.keys(value).sort().map((key) => \`\${JSON.stringify(key)}:\${canonical(value[key])}\`).join(',')}}\`
    : JSON.stringify(value);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const manifest = JSON.parse(fs.readFileSync('docs/generated/inventory/documentation-deletion-manifest.json', 'utf8'));
const reviewedRevision = git(['rev-parse', 'HEAD']);
const baselineRevision = JSON.parse(fs.readFileSync('docs/config/documentation-tree-baseline.json')).baselineRevision;
const reviewBytes = fs.readFileSync('docs/config/documentation-parity-reviews/legacy.md.json');
const review = JSON.parse(reviewBytes);
assert.equal(review.classificationVerdict, 'PASS');
for (const gate of readinessGateCommands) execFileSync(process.execPath, [gate.file, ...gate.args]);
const gates = readinessGateCommands.map((gate) => ({ id: gate.id, revision: reviewedRevision, status: 'PASS',
  commandSha256: sha256(canonical({ executable: 'node', nodeArgs: gate.nodeArgs ?? [], file: gate.file, args: gate.args })) }));
const legacyObject = git(['rev-parse', reviewedRevision + ':docs/_legacy-source/legacy.md']);
const contentRoot = sha256(canonical({ baselineRevision, reviewedRevision, legacyObject,
  reviewObject: sha256(reviewBytes), gates }));
assert.equal(manifest.baselineRevision, baselineRevision);
assert.equal(manifest.validatedRevision, reviewedRevision);
assert.equal(manifest.contentRoot, contentRoot);
assert.deepEqual(manifest.readinessGates, gates);
assert.equal(manifest.sources.length, 1);
assert.equal(manifest.sources[0].gitObject, legacyObject);
assert.equal(manifest.sources[0].reviewState, 'PASS');
assert.equal(manifest.deletionReady, true);
process.stdout.write('fixture parity: PASS\\n');
`);
  const reviewedRevision = commit(root, 'reviewed readiness tree');
  const reviewedTree = git(root, ['rev-parse', `${reviewedRevision}^{tree}`]);
  const gates = fixtureGateCommands.map((gate) => ({ id: gate.id, revision: reviewedRevision, status: 'PASS',
    commandSha256: sha256(canonical({ executable: 'node', nodeArgs: gate.nodeArgs ?? [],
      file: gate.file, args: gate.args })) }));
  const reviewObject = sha256(fs.readFileSync(path.join(root, reviewPath)));
  const manifest = {
    schemaVersion: 'kubeclaw-documentation-deletion-manifest.v1', baselineRevision,
    validatedRevision: reviewedRevision,
    contentRoot: fixtureManifestRoot({ baselineRevision, reviewedRevision, legacyObject, reviewObject, gates }),
    readinessGates: gates,
    sources: [{ originalPath: 'docs/legacy.md', legacyPath: 'docs/_legacy-source/legacy.md',
      gitObject: legacyObject, reviewPath, reviewState: 'PASS', deletionReady: true }],
    deletionReady: true,
  };
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  write(root, deletionManifestPath, manifestBytes);
  const approval = {
    schemaVersion: 'kubeclaw-documentation-ap10-deletion-approval.v1', reviewedRevision, reviewedTree,
    readinessManifest: { path: deletionManifestPath, sha256: sha256(manifestBytes) },
    identityAssurance: 'repository-assertions-only; authenticated reviewer identity must be enforced by the acceptance workflow',
    deletions: [
      { path: 'docs/_legacy-source/legacy.md', originalPath: 'docs/legacy.md',
        classification: 'legacy-extraction-source', gitObject: legacyObject,
        classificationApproval: { kind: 'parity-source-review', reviewPath,
          reviewerId: 'source-reviewer', verdict: 'PASS' } },
      { path: 'docs/review/old.md', originalPath: 'docs/review/old.md', classification: 'deletable-remainder',
        gitObject: remainderObject,
        classificationApproval: { kind: 'independent-remainder-review', reviewerId: 'remainder-reviewer',
          reviewedRevision, scope: { path: 'docs/review/old.md', originalPath: 'docs/review/old.md',
            classification: 'deletable-remainder' },
          methods: [
            { kind: 'complete-content-inspection',
              detail: 'Read every section of docs/review/old.md and classified its complete content as historical work output.' },
            { kind: 'consumer-reference-search',
              detail: 'Searched current source, configuration, and reader paths for consumers of docs/review/old.md; no active dependency remained.' },
          ],
          evidence: [{ path: 'docs/review/old.md', gitObject: remainderObject,
            detail: 'The blob at docs/review/old.md is historical work output with no current consumer.' }],
          findings: [], verdict: 'PASS' } },
    ],
    verdict: 'APPROVE_AP10_DELETION',
  };
  json(root, deletionApprovalPath, approval);
  const approvalCommit = commit(root, 'approve AP10 deletion');
  return { root, reviewedRevision, approvalCommit, approval, manifest, legacyObject, remainderObject };
}

function rewriteApproval(fixtureValue, mutate) {
  const value = structuredClone(fixtureValue.approval);
  mutate(value);
  json(fixtureValue.root, deletionApprovalPath, value);
  git(fixtureValue.root, ['commit', '--amend', '-qam', 'approve AP10 deletion']);
  fixtureValue.approval = value;
  fixtureValue.approvalCommit = git(fixtureValue.root, ['rev-parse', 'HEAD']);
}

function deleteApproved(fixtureValue, { modifyLegacy = false, deleteUnapproved = false } = {}) {
  const { root } = fixtureValue;
  if (modifyLegacy) write(root, 'docs/_legacy-source/legacy.md', '# Modified instead of deleted\n');
  else fs.unlinkSync(path.join(root, 'docs/_legacy-source/legacy.md'));
  fs.unlinkSync(path.join(root, 'docs/review/old.md'));
  if (deleteUnapproved) fs.unlinkSync(path.join(root, 'docs/_legacy-source/internal.txt'));
  return commit(root, 'AP10 delete approved documentation');
}

test('enforces the committed approval bridge and verifies every approved deletion blob', () => {
  const value = fixture();
  const approved = validateParityTransition(value.root);
  assert.equal(approved.phase, 'approval-committed');
  assert.equal(approved.approvalCommit, value.approvalCommit);
  const deletionCommit = deleteApproved(value);
  const deleted = validateParityTransition(value.root);
  assert.equal(deleted.phase, 'deletion-verified');
  assert.equal(deleted.deletionCommit, deletionCommit);
  assert.equal(deleted.approvedDeletionCount, 2);
  write(value.root, 'post-transition.txt', 'later commit\n');
  commit(value.root, 'later descendant');
  assert.equal(validateParityTransition(value.root).deletionCommit, deletionCommit,
    'the verified handoff remains checkable after later commits');
});

test('rejects stale readiness parent and forged blob approvals', () => {
  const stale = fixture();
  rewriteApproval(stale, (approval) => { approval.reviewedRevision = git(stale.root, ['rev-parse', 'HEAD~2']); });
  assert.throws(() => validateParityTransition(stale.root), /exact parent/u);

  const forged = fixture();
  rewriteApproval(forged, (approval) => { approval.deletions[0].gitObject = '0'.repeat(40); });
  assert.throws(() => validateParityTransition(forged.root), /deletion identity is stale/u);
});

test('replays readiness at the reviewed revision and rejects a forged manifest', () => {
  const forged = fixture();
  const manifest = structuredClone(forged.manifest);
  manifest.contentRoot = 'f'.repeat(64);
  const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
  write(forged.root, deletionManifestPath, bytes);
  rewriteApproval(forged, (approval) => { approval.readinessManifest.sha256 = sha256(bytes); });
  assert.throws(() => validateParityTransition(forged.root), /historical readiness replay failed/u);
});

test('requires explicit independent review for every deletable remainder', () => {
  const missing = fixture();
  rewriteApproval(missing, (approval) => { approval.deletions = approval.deletions.slice(0, 1); });
  assert.throws(() => validateParityTransition(missing.root), /complete legacy and deletable-remainder set/u);

  const pending = fixture();
  rewriteApproval(pending, (approval) => { approval.deletions[1].classificationApproval.verdict = 'PENDING'; });
  assert.throws(() => validateParityTransition(pending.root), /classification review must PASS/u);
});

test('rejects modified approved sources and unapproved legacy deletions in AP10', () => {
  const modified = fixture();
  deleteApproved(modified, { modifyLegacy: true });
  assert.throws(() => validateParityTransition(modified.root), /must delete, not modify or rename/u);

  const extra = fixture();
  deleteApproved(extra, { deleteUnapproved: true });
  assert.throws(() => validateParityTransition(extra.root), /removed an unapproved legacy blob/u);
});

test('rejects a restore followed by a second deletion on the first-parent chain', () => {
  const value = fixture();
  deleteApproved(value);
  write(value.root, 'docs/_legacy-source/legacy.md', '# Legacy\n');
  commit(value.root, 'restore approved legacy source');
  fs.unlinkSync(path.join(value.root, 'docs/_legacy-source/legacy.md'));
  commit(value.root, 'delete restored source again');
  assert.throws(() => validateParityTransition(value.root), /was restored after AP10 deletion/u);
});

test('rejects any approval or manifest rewrite after approval, including a later revert', () => {
  for (const target of [deletionApprovalPath, deletionManifestPath]) {
    const value = fixture();
    const original = fs.readFileSync(path.join(value.root, target));
    write(value.root, target, '{}\n');
    commit(value.root, `replace ${target}`);
    write(value.root, target, original);
    commit(value.root, `restore ${target}`);
    assert.throws(() => validateParityTransition(value.root), /bytes changed after the approval commit/u);
  }

  const removed = fixture();
  fs.unlinkSync(path.join(removed.root, deletionApprovalPath));
  commit(removed.root, 'remove approval bridge');
  assert.throws(() => validateParityTransition(removed.root), /committed approval was removed/u);
});

test('requires substantive manual review methods and evidence', () => {
  const weakMethod = fixture();
  rewriteApproval(weakMethod, (approval) => { approval.deletions[1].classificationApproval.methods = ['x']; });
  assert.throws(() => validateParityTransition(weakMethod.root), /structured manual methods/u);

  const weakEvidence = fixture();
  rewriteApproval(weakEvidence, (approval) => {
    approval.deletions[1].classificationApproval.evidence[0].detail = 'x';
  });
  assert.throws(() => validateParityTransition(weakEvidence.root), /substantive detail/u);

  const repeatedFiller = fixture();
  rewriteApproval(repeatedFiller, (approval) => {
    approval.deletions[1].classificationApproval.methods = [
      { kind: 'complete-content-inspection', detail: 'Reviewed file content source; checked path output record.' },
      { kind: 'consumer-reference-search', detail: 'Reviewed file content source; checked path output record.' },
    ];
  });
  assert.throws(() => validateParityTransition(repeatedFiller.root), /concrete reviewed path/u);

  const suffixedFiller = fixture();
  rewriteApproval(suffixedFiller, (approval) => {
    approval.deletions[1].classificationApproval.methods = ['review1 review2 review3 review4 review5 review6'];
  });
  assert.throws(() => validateParityTransition(suffixedFiller.root), /structured manual methods/u);

  const numberedSentence = fixture();
  rewriteApproval(numberedSentence, (approval) => {
    approval.deletions[1].classificationApproval.methods = [
      'Reviewed file item 1; reviewed file item 2; reviewed file item 3.',
    ];
  });
  assert.throws(() => validateParityTransition(numberedSentence.root), /structured manual methods/u);

  const weakFinding = fixture();
  rewriteApproval(weakFinding, (approval) => {
    approval.deletions[1].classificationApproval.findings = [{
      id: 'finding-1', status: 'resolved', detail: 'review review review review',
    }];
  });
  assert.throws(() => validateParityTransition(weakFinding.root), /substantive detail/u);
});

test('rejects moving an approved blob to a new path instead of deleting it', () => {
  const value = fixture();
  fs.mkdirSync(path.join(value.root, 'archive'), { recursive: true });
  git(value.root, ['mv', 'docs/_legacy-source/legacy.md', 'archive/legacy.md']);
  fs.unlinkSync(path.join(value.root, 'docs/review/old.md'));
  commit(value.root, 'rename approved legacy blob');
  assert.throws(() => validateParityTransition(value.root), /must delete approved blobs, not rename/u);
});

test('uses the gate list committed at the reviewed revision', () => {
  const value = fixture();
  deleteApproved(value);
  write(value.root, 'scripts/lib/docs-parity-gates.mjs',
    "export const readinessGateCommands = Object.freeze([{ id: 'future-gate', file: 'future.mjs', args: [] }]);\n");
  commit(value.root, 'add a future readiness gate');
  assert.equal(validateParityTransition(value.root).phase, 'deletion-verified');
});
