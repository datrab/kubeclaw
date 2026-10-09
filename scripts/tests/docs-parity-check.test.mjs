import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { crc32, deflateSync } from 'node:zlib';

import {
  buildActiveDependencyReview,
  computeContentRoot,
  deletionManifestPath,
  extractionDigest,
  gitObject,
  inspectParitySources,
  inspectRenderedImage,
  normalizeExcerpt,
  readinessGateCommands,
  sha256,
  validGitObject,
  validateParity,
  writeDeterministic,
} from '../docs-parity-check.mjs';
import { buildParityInventory, sourceSetAuthorityDigest } from '../docs-parity-extract.mjs';
import { markdownAnchorEntries, stripFencedCodeAndComments } from '../lib/docs-markdown-anchors.mjs';

function write(root, relative, value) {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, value);
}

function json(root, relative, value) {
  write(root, relative, `${JSON.stringify(value, null, 2)}\n`);
}

function load(root, relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
}

function failFileSystem(method, failAt = 1) {
  const injected = Object.create(fs);
  let calls = 0;
  injected[method] = (...args) => {
    calls += 1;
    if (calls === failAt) throw Object.assign(new Error(`injected ${method} failure`), { code: 'EIO' });
    return fs[method](...args);
  };
  return injected;
}

function lineRange(buffer, byteStart, byteEnd) {
  const before = buffer.subarray(0, byteStart).toString('utf8');
  const selected = buffer.subarray(byteStart, byteEnd).toString('utf8');
  const lineStart = before.split('\n').length;
  return {
    lineStart,
    lineEnd: lineStart + Math.max(0, selected.split('\n').length - 1 - (selected.endsWith('\n') ? 1 : 0)),
  };
}

function span(buffer, byteStart = 0, byteEnd = buffer.length) {
  const selected = buffer.subarray(byteStart, byteEnd);
  return {
    byteStart,
    byteEnd,
    ...lineRange(buffer, byteStart, byteEnd),
    exactSha256: sha256(selected),
    normalizedSha256: sha256(normalizeExcerpt(selected.toString('utf8'))),
  };
}

const decisionPath = 'docs/config/documentation-parity/legacy.md.json';
const reviewPath = 'docs/config/documentation-parity-reviews/legacy.md.json';
const sitePath = 'docs/site/guide.md';
const VALID_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function pngFixture({ width = 1, height = 1, bitDepth = 8, colorType = 4, interlace = 0,
  pixels = Buffer.from([0, 0xff, 0xff]), beforeIdat = [], betweenIdat = [], afterIdat = [] } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = bitDepth;
  header[9] = colorType;
  header[10] = 0;
  header[11] = 0;
  header[12] = interlace;
  const compressed = deflateSync(pixels);
  const split = Math.max(1, Math.floor(compressed.length / 2));
  const imageData = betweenIdat.length
    ? [pngChunk('IDAT', compressed.subarray(0, split)), ...betweenIdat,
      pngChunk('IDAT', compressed.subarray(split))]
    : [pngChunk('IDAT', compressed)];
  return Buffer.concat([PNG_SIGNATURE, pngChunk('IHDR', header), ...beforeIdat,
    ...imageData, ...afterIdat, pngChunk('IEND')]);
}

function fixture({ sourceText = 'Alpha current behavior.\n', sourceKind = 'markdown',
  siteText = '# Guide\n\nAlpha current behavior.\n', unregisteredBaselineText = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-doc-parity-'));
  const sourceBuffer = Buffer.from(sourceText);
  const sourceName = sourceKind === 'diagram' ? 'legacy.svg' : 'legacy.md';
  const originalPath = `docs/${sourceName}`;
  const legacyPath = `docs/_legacy-source/${sourceName}`;
  const fixtureDecisionPath = `docs/config/documentation-parity/${sourceName}.json`;
  const fixtureReviewPath = `docs/config/documentation-parity-reviews/${sourceName}.json`;
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'fixture@example.test'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  for (const gate of ['docs-parity-extract.mjs', 'docs-tree-boundary.mjs', 'docs-check.mjs',
    'docs-publication.mjs', 'docs-check-refs.mjs', 'check-site-reader-boundary.mjs']) {
    write(root, `scripts/${gate}`, `process.stdout.write(${JSON.stringify(`fixture ${gate} passed\\n`)});\n`);
  }
  write(root, 'scripts/tests/docs-tree-boundary.test.mjs',
    "import test from 'node:test'; test('fixture tree mutation gate', () => {});\n");
  write(root, 'scripts/tests/docs-markdown-anchors.test.mjs',
    "import test from 'node:test'; test('fixture anchor mutation gate', () => {});\n");
  write(root, 'scripts/tests/docs-check-refs.test.mjs',
    "import test from 'node:test'; test('fixture reference mutation gate', () => {});\n");
  write(root, originalPath, sourceText);
  if (unregisteredBaselineText !== null) write(root, 'docs/forgotten.md', unregisteredBaselineText);
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'immutable baseline'], { cwd: root });
  const baselineRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const object = execFileSync('git', ['rev-parse', `${baselineRevision}:${originalPath}`], { cwd: root, encoding: 'utf8' }).trim();
  fs.unlinkSync(path.join(root, originalPath));
  write(root, legacyPath, sourceText);
  write(root, sitePath, siteText);
  write(root, 'docs/review/rendered.png', VALID_PNG);
  json(root, 'docs/site/reference/documentation-route-registry.json', {
    schemaVersion: 'kubeclaw-documentation-routes.v1', authority: 'fixture route authority', redirects: [],
    deprecatedTerms: [], historicalRouteBoundary: 'No earlier public routes are authoritative.',
  });
  write(root, 'src/behavior.js', 'export const behavior = "Alpha";\n');
  json(root, 'docs/config/documentation-tree-classification.json', {
    schemaVersion: 'kubeclaw-documentation-tree-classification.v1',
    baselineRevision,
    files: [{
      path: legacyPath,
      class: 'legacy-extraction-source',
      purpose: 'Extraction source.',
      originalPath,
      expectedPath: legacyPath,
      introducedAfterBaseline: false,
    }, {
      path: sitePath,
      class: 'canonical-reader-documentation',
      purpose: 'Published reader page.',
      originalPath: sitePath,
      expectedPath: sitePath,
      introducedAfterBaseline: true,
    }],
  });
  json(root, 'docs/config/documentation-tree-baseline.json', {
    schemaVersion: 'kubeclaw-documentation-tree-baseline.v1',
    baselineRevision,
    files: [{ originalPath, gitObject: object, mode: '100644', kind: sourceKind }],
  });
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'fix source-set authority'], { cwd: root });
  const sourceSetAuthorityRevision = execFileSync('git', ['rev-parse', 'HEAD'],
    { cwd: root, encoding: 'utf8' }).trim();
  const authoritySources = [{ originalPath, legacyPath, gitObject: object, kind: sourceKind }];
  json(root, 'docs/config/documentation-parity-batches.json', {
    schemaVersion: 'kubeclaw-documentation-parity-batches.v1',
    purpose: 'fixture source-set authority',
    sourceSetAuthorityRevision,
    sourceSetAuthoritySha256: sourceSetAuthorityDigest(sourceSetAuthorityRevision, baselineRevision, authoritySources),
    batches: [{ id: 'fixture-batch', owner: 'fixture-owner', patterns: [`^docs/${sourceName.replace('.', '\\.')}\$`] }],
  });
  json(root, 'docs/generated/inventory/documentation-parity-batches.json', {
    schemaVersion: 'kubeclaw-documentation-parity-batch-inventory.v1',
    sourceCount: 1,
    batchCount: 1,
    counts: { 'fixture-batch': 1 },
    assignments: [{ originalPath, legacyPath,
      batchId: 'fixture-batch', owner: 'fixture-owner' }],
  });
  const built = buildParityInventory(root);
  write(root, 'docs/generated/inventory/documentation-parity-units.jsonl', built.jsonl);
  write(root, 'docs/generated/inventory/documentation-parity-summary.json', built.renderedSummary);
  const unit = built.units[0];
  const source = {
    originalPath,
    legacyPath,
    classification: 'legacy-extraction-source',
    baselineRevision,
    gitObject: object,
  };
  source.extractionDigest = extractionDigest(source, built.units);
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'reviewed content'], { cwd: root });
  const reviewedRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  json(root, 'docs/config/documentation-parity-review-assignments.json', {
    schemaVersion: 'kubeclaw-documentation-parity-review-assignments.v1',
    assignments: [{ assignmentId: 'assignment-alpha', originalPath: source.originalPath,
      authorId: 'author-a', reviewerId: 'reviewer-b', issuedBy: 'test-review-coordinator' }],
  });
  execFileSync('git', ['add', 'docs/config/documentation-parity-review-assignments.json'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'assign independent review'], { cwd: root });
  const assignmentRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const evidenceBuffer = fs.readFileSync(path.join(root, 'src/behavior.js'));
  const claim = {
    claimId: 'claim-alpha',
    unitId: unit.unitId,
    summary: 'The current behavior is Alpha.',
    claimType: 'fact',
    truthState: 'current',
    disposition: 'mapped',
    source: span(sourceBuffer),
    evidence: [{
      revision: reviewedRevision,
      path: 'src/behavior.js',
      basis: 'current-implementation',
      assertion: 'The implementation selects Alpha behavior.',
      gitObject: gitObject(evidenceBuffer, root),
      ...span(evidenceBuffer),
    }],
    targets: [{
      path: sitePath,
      anchor: 'guide',
      excerpt: 'Alpha current behavior.',
      excerptSha256: sha256('Alpha current behavior.'),
      occurrence: 1,
      relation: 'equivalent',
    }],
    omission: null,
  };
  const contentRoot = computeContentRoot(root, source, [claim], []);
  const decision = {
    schemaVersion: 'kubeclaw-documentation-parity-decision.v1',
    source,
    reviewedRevision,
    author: { id: 'author-a', assignmentId: 'assignment-alpha' },
    redirect: { status: 'not-required', from: sourceKind === 'diagram' ? '/legacy.svg' : '/legacy', to: null,
      basis: 'no-authoritative-public-route',
      reason: 'No authoritative historic public route exists.' },
    visualEvidence: [],
    contentRoot,
    unitCoverage: [{
      unitId: unit.unitId,
      codeBlockClassification: null,
      fragments: [{ kind: 'claim', claimId: claim.claimId, reasonCode: null, byteStart: 0, byteEnd: sourceBuffer.length }],
    }],
    claims: [claim],
  };
  json(root, fixtureDecisionPath, decision);
  const decisionSha256 = sha256(fs.readFileSync(path.join(root, fixtureDecisionPath)));
  const review = {
    schemaVersion: 'kubeclaw-documentation-parity-review.v1',
    source,
    reviewedRevision,
    reviewer: { id: 'reviewer-b', assignmentId: 'assignment-alpha', freshContext: true, readOnly: true,
      provenance: { kind: 'repository-review-assignment', revision: assignmentRevision, actorId: 'reviewer-b' } },
    decisionSha256,
    contentRoot,
    claimIds: ['claim-alpha'],
    classificationVerdict: 'PASS',
    claimVerdicts: [{
      claimId: 'claim-alpha', semanticParity: 'PASS', currentAccuracy: 'PASS',
      targetSpecificity: 'PASS', dispositionJustification: 'PASS',
    }],
    visualVerdicts: [],
    activeDependencyReview: buildActiveDependencyReview(root, source, reviewedRevision, contentRoot),
    verdict: 'PASS',
    findings: [],
  };
  json(root, fixtureReviewPath, review);
  return root;
}

function resignDecision(root) {
  const decision = load(root, decisionPath);
  json(root, decisionPath, decision);
  return decision;
}

function resignReview(root, bindDecision = false) {
  const review = load(root, reviewPath);
  if (bindDecision) review.decisionSha256 = sha256(fs.readFileSync(path.join(root, decisionPath)));
  json(root, reviewPath, review);
}

function refreshContentBindings(root) {
  const decision = load(root, decisionPath);
  const contentRoot = computeContentRoot(root, decision.source, decision.claims);
  decision.contentRoot = contentRoot;
  json(root, decisionPath, decision);
  const review = load(root, reviewPath);
  review.contentRoot = contentRoot;
  review.activeDependencyReview = buildActiveDependencyReview(root, decision.source, decision.reviewedRevision, contentRoot);
  review.decisionSha256 = sha256(fs.readFileSync(path.join(root, decisionPath)));
  json(root, reviewPath, review);
}

function completeSvgDecision(root) {
  const svgDecisionPath = 'docs/config/documentation-parity/legacy.svg.json';
  const svgReviewPath = 'docs/config/documentation-parity-reviews/legacy.svg.json';
  const decision = load(root, svgDecisionPath);
  const review = load(root, svgReviewPath);
  const units = fs.readFileSync(path.join(root, 'docs/generated/inventory/documentation-parity-units.jsonl'), 'utf8')
    .trim().split('\n').map((line) => JSON.parse(line));
  const sourceBuffer = fs.readFileSync(path.join(root, decision.source.legacyPath));
  const evidence = decision.claims[0].evidence;
  decision.claims = units.map((unit, index) => ({
    claimId: `svg-claim-${index}`,
    unitId: unit.unitId,
    summary: `Rendered SVG unit ${index} is preserved.`,
    claimType: unit.kind === 'svg-edge' ? 'visual-relationship' : 'fact',
    truthState: 'current',
    disposition: 'mapped',
    source: span(sourceBuffer, unit.byteStart, unit.byteEnd),
    evidence,
    targets: [{ path: sitePath, anchor: 'guide', excerpt: 'Alpha current behavior.',
      excerptSha256: sha256('Alpha current behavior.'), occurrence: 1, relation: 'equivalent' }],
    omission: null,
  }));
  decision.unitCoverage = units.map((unit, index) => ({
    unitId: unit.unitId,
    codeBlockClassification: null,
    fragments: [{ kind: 'claim', claimId: `svg-claim-${index}`, reasonCode: null,
      byteStart: unit.byteStart, byteEnd: unit.byteEnd }],
  }));
  const relationUnitIds = units.filter((unit) => unit.kind === 'svg-edge' || unit.kind === 'svg-use'
    || (unit.markerReferences?.length ?? 0) > 0).map((unit) => unit.unitId);
  const renderer = { name: 'fixture-svg-renderer', version: '1.0.0', invocation: 'fixture-render legacy.svg',
    provenance: 'deterministic test renderer', revision: decision.reviewedRevision };
  decision.visualEvidence = [{ unitIds: units.map((unit) => unit.unitId), relationUnitIds,
    renderedPath: 'docs/review/rendered.png', renderedSha256: sha256(VALID_PNG), mediaType: 'image/png',
    width: 1, height: 1, renderer }];
  decision.contentRoot = computeContentRoot(root, decision.source, decision.claims, decision.visualEvidence);
  json(root, svgDecisionPath, decision);
  review.contentRoot = decision.contentRoot;
  review.claimIds = decision.claims.map((claim) => claim.claimId);
  review.claimVerdicts = decision.claims.map((claim) => ({ claimId: claim.claimId,
    semanticParity: 'PASS', currentAccuracy: 'PASS', targetSpecificity: 'PASS', dispositionJustification: 'PASS' }));
  review.visualVerdicts = decision.visualEvidence.map((item) => ({ unitIds: item.unitIds,
    relationUnitIds: item.relationUnitIds, renderedSha256: item.renderedSha256, mediaType: item.mediaType,
    width: item.width, height: item.height, renderer: item.renderer, verdict: 'PASS' }));
  review.activeDependencyReview = buildActiveDependencyReview(root, decision.source, decision.reviewedRevision,
    decision.contentRoot);
  review.decisionSha256 = sha256(fs.readFileSync(path.join(root, svgDecisionPath)));
  json(root, svgReviewPath, review);
  return { decision, review, units, svgDecisionPath, svgReviewPath };
}

function commitFixture(root, message = 'decision and review') {
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['commit', '-qm', message], { cwd: root });
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
}

function classifyCanonical(root, repositoryPath) {
  const classification = load(root, 'docs/config/documentation-tree-classification.json');
  classification.files.push({ path: repositoryPath, class: 'canonical-reader-documentation', purpose: 'Published reader page.',
    originalPath: repositoryPath, expectedPath: repositoryPath, introducedAfterBaseline: true });
  json(root, 'docs/config/documentation-tree-classification.json', classification);
}

test('accepts a complete source-bound decision and independent review', () => {
  const root = fixture();
  const ordinary = validateParity({ root });
  assert.equal(ordinary.deletionReady, false);
  commitFixture(root);
  const manifest = validateParity({ root, readiness: true });
  assert.equal(manifest.deletionReady, true);
  assert.equal(manifest.sources.length, 1);
  assert.equal(manifest.sources[0].claimCount, 1);
  assert.deepEqual(manifest.readinessGates.map((item) => item.id), [
    'extraction', 'documentation-tree', 'documentation-tree-mutations', 'site', 'publication',
    'references', 'reader-boundary',
  ]);
  assert.deepEqual(validateParity({ root, readiness: true }).readinessGates, manifest.readinessGates,
    'readiness evidence must not depend on variable test durations');
});

test('readiness runs the exact canonical tree, anchor, and reference mutation suite', () => {
  const gate = readinessGateCommands.find((item) => item.id === 'documentation-tree-mutations');
  assert.deepEqual(gate, {
    id: 'documentation-tree-mutations',
    file: 'scripts/tests/docs-tree-boundary.test.mjs',
    nodeArgs: ['--test'],
    args: ['scripts/tests/docs-markdown-anchors.test.mjs', 'scripts/tests/docs-check-refs.test.mjs'],
  });
});

test('readiness cannot bypass the documentation-tree classification gate', () => {
  const root = fixture();
  write(root, 'docs/rogue-unclassified.md', '# Rogue\n');
  write(root, 'scripts/docs-tree-boundary.mjs',
    "throw new Error('unclassified documentation file');\n");
  refreshContentBindings(root);
  commitFixture(root, 'add unclassified documentation');
  assert.throws(() => validateParity({ root, readiness: true }), /Command failed/u);
});

test('rejects anchor-only mapping without a concrete excerpt', () => {
  const root = fixture();
  const decision = load(root, decisionPath);
  decision.claims[0].targets[0].excerpt = '';
  decision.claims[0].targets[0].excerptSha256 = sha256('');
  json(root, decisionPath, decision);
  resignDecision(root);
  resignReview(root, true);
  assert.throws(() => validateParity({ root }), /excerpt.*must not be empty|anchor alone/u);
});

test('rejects a changed mapped excerpt even with refreshed content bindings', () => {
  const root = fixture();
  write(root, sitePath, '# Guide\n\nAlpha behavior changed.\n');
  refreshContentBindings(root);
  assert.throws(() => validateParity({ root }), /normalized excerpt must occur exactly once/u);
});

test('rejects a duplicate normalized target excerpt', () => {
  const root = fixture();
  write(root, 'docs/site/duplicate.md', '# Duplicate\n\nAlpha   current behavior.\n');
  classifyCanonical(root, 'docs/site/duplicate.md');
  refreshContentBindings(root);
  assert.throws(() => validateParity({ root }), /normalized excerpt must occur exactly once/u);
});

test('rejects a mapped target outside docs/site', () => {
  const root = fixture();
  write(root, 'README.md', '# Guide\n\nAlpha current behavior.\n');
  const decision = load(root, decisionPath);
  decision.claims[0].targets[0].path = 'README.md';
  json(root, decisionPath, decision);
  resignDecision(root);
  resignReview(root, true);
  assert.throws(() => validateParity({ root }), /target must be Markdown below docs\/site/u);
});

test('rejects an omission without current evidence', () => {
  const root = fixture();
  const decision = load(root, decisionPath);
  Object.assign(decision.claims[0], {
    claimType: 'project-administration',
    truthState: 'non-reader-content',
    disposition: 'omitted',
    targets: [],
    evidence: [],
    omission: {
      reasonCode: 'transient-project-administration',
      explanation: 'This was an internal work record.',
      evidence: [],
    },
  });
  json(root, decisionPath, decision);
  resignDecision(root);
  resignReview(root, true);
  assert.throws(() => validateParity({ root }), /omission requires current evidence/u);
});

test('requires governance evidence for navigation and project-administration omissions', () => {
  for (const [claimType, reasonCode] of [
    ['navigation-only', 'navigation-only'],
    ['project-administration', 'transient-project-administration'],
  ]) {
    const root = fixture();
    const decision = load(root, decisionPath);
    const implementationEvidence = decision.claims[0].evidence[0];
    Object.assign(decision.claims[0], {
      claimType,
      truthState: 'non-reader-content',
      disposition: 'omitted',
      targets: [],
      evidence: [],
      omission: {
        reasonCode,
        explanation: 'This unit contains reader navigation or internal project administration only.',
        evidence: [implementationEvidence],
      },
    });
    json(root, decisionPath, decision);
    resignDecision(root);
    resignReview(root, true);
    assert.throws(() => validateParity({ root }), /require documentation-governance evidence/u);
  }
});

test('rejects the decision author as reviewer', () => {
  const root = fixture();
  const review = load(root, reviewPath);
  review.reviewer.id = 'author-a';
  json(root, reviewPath, review);
  resignReview(root);
  assert.throws(() => validateParity({ root }), /author and reviewer must be distinct/u);
});

test('rejects a missing or negative independent review', () => {
  const missing = fixture();
  fs.unlinkSync(path.join(missing, reviewPath));
  assert.throws(() => validateParity({ root: missing }), /one independent review file is required/u);

  const negative = fixture();
  const review = load(negative, reviewPath);
  review.claimVerdicts[0].semanticParity = 'FAIL';
  review.verdict = 'FAIL';
  json(negative, reviewPath, review);
  resignReview(negative);
  assert.throws(() => validateParity({ root: negative }), /semanticParity must be PASS/u);
});

test('rejects a stale decision hash and a stale content root', () => {
  const staleDecision = fixture();
  const decision = load(staleDecision, decisionPath);
  decision.author.id = 'changed-author';
  json(staleDecision, decisionPath, decision);
  assert.throws(() => validateParity({ root: staleDecision }), /review is not bound to the exact current decision|author identity differs/u);

  const staleContent = fixture();
  fs.appendFileSync(path.join(staleContent, sitePath), '\nNew reader content.\n');
  assert.throws(() => validateParity({ root: staleContent }), /contentRoot is stale|changed after reviewedRevision/u);
});

test('does not generate deletionReady when a claim remains open', () => {
  const root = fixture();
  const decision = load(root, decisionPath);
  decision.claims[0].disposition = 'open';
  decision.claims[0].targets = [];
  decision.claims[0].omission = null;
  json(root, decisionPath, decision);
  resignDecision(root);
  resignReview(root, true);
  assert.throws(() => validateParity({ root }), /open claim cannot pass deletion review/u);

  const forged = fixture();
  const forgedDecision = load(forged, decisionPath);
  forgedDecision.deletionReady = true;
  json(forged, decisionPath, forgedDecision);
  resignReview(forged, true);
  assert.throws(() => validateParity({ root: forged }), /fields must be exactly/u);
});

test('rejects unknown and unreviewed truth states', () => {
  for (const truthState of ['unknown', 'unreviewed']) {
    const root = fixture();
    const decision = load(root, decisionPath);
    decision.claims[0].truthState = truthState;
    json(root, decisionPath, decision);
    resignDecision(root);
    resignReview(root, true);
    assert.throws(() => validateParity({ root }), new RegExp(`${truthState} truth cannot pass`));
  }
});

test('rejects a forged normalized unit value', () => {
  const root = fixture();
  const units = path.join(root, 'docs/generated/inventory/documentation-parity-units.jsonl');
  const unit = JSON.parse(fs.readFileSync(units, 'utf8'));
  unit.normalized = 'Different visible content';
  unit.normalizedSha256 = sha256(unit.normalized);
  write(root, 'docs/generated/inventory/documentation-parity-units.jsonl', `${JSON.stringify(unit)}\n`);
  const summary = load(root, 'docs/generated/inventory/documentation-parity-summary.json');
  summary.unitsJsonlSha256 = sha256(fs.readFileSync(units));
  json(root, 'docs/generated/inventory/documentation-parity-summary.json', summary);
  assert.throws(() => validateParity({ root }), /checked-in extraction differs from an independent rebuild/u);
});

test('rejects visible words hidden as structural coverage', () => {
  const root = fixture();
  const decision = load(root, decisionPath);
  decision.unitCoverage[0].fragments = [
    { kind: 'claim', claimId: 'claim-alpha', reasonCode: null, byteStart: 0, byteEnd: 5 },
    { kind: 'structural', claimId: null, reasonCode: 'structure-only', byteStart: 5, byteEnd: 24 },
  ];
  decision.claims[0].source = span(Buffer.from('Alpha current behavior.\n'), 0, 5);
  json(root, decisionPath, decision);
  resignReview(root, true);
  assert.throws(() => validateParity({ root }), /structural coverage cannot hide visible words/u);
});

test('rejects a relative Markdown link to the old reader path', () => {
  const root = fixture();
  write(root, 'docs/site/other.md', '# Other\n\n[Old page](../legacy.md)\n');
  classifyCanonical(root, 'docs/site/other.md');
  assert.throws(() => validateParity({ root }), /active files still depend on the old or legacy path/u);
});

test('rejects a truncated extraction even when the summary and decisions are resigned', () => {
  const root = fixture();
  const unitsFile = path.join(root, 'docs/generated/inventory/documentation-parity-units.jsonl');
  const unit = JSON.parse(fs.readFileSync(unitsFile, 'utf8'));
  const sourceBuffer = fs.readFileSync(path.join(root, unit.legacyPath));
  Object.assign(unit, span(sourceBuffer, 0, 5), { exact: 'Alpha', normalized: 'Alpha', text: 'Alpha', textSha256: sha256('Alpha') });
  write(root, 'docs/generated/inventory/documentation-parity-units.jsonl', `${JSON.stringify(unit)}\n`);
  const summary = load(root, 'docs/generated/inventory/documentation-parity-summary.json');
  summary.unitsJsonlSha256 = sha256(fs.readFileSync(unitsFile));
  json(root, 'docs/generated/inventory/documentation-parity-summary.json', summary);
  assert.throws(() => validateParity({ root }), /independent rebuild/u);
});

test('rejects forged semantic unit fields that older digests omitted', () => {
  const root = fixture();
  const unitsFile = path.join(root, 'docs/generated/inventory/documentation-parity-units.jsonl');
  const unit = JSON.parse(fs.readFileSync(unitsFile, 'utf8'));
  unit.exact = 'forged exact display';
  unit.text = 'forged semantic text';
  unit.textSha256 = sha256(unit.text);
  unit.references = [{ label: 'forged', destination: 'https://example.invalid' }];
  write(root, 'docs/generated/inventory/documentation-parity-units.jsonl', `${JSON.stringify(unit)}\n`);
  const summary = load(root, 'docs/generated/inventory/documentation-parity-summary.json');
  summary.unitsJsonlSha256 = sha256(fs.readFileSync(unitsFile));
  json(root, 'docs/generated/inventory/documentation-parity-summary.json', summary);
  assert.throws(() => validateParity({ root }), /independent rebuild/u);
});

test('rejects claim and structural spans that split a UTF-8 code point', () => {
  const root = fixture({ sourceText: 'éclair behavior.\n' });
  const decision = load(root, decisionPath);
  const sourceBuffer = fs.readFileSync(path.join(root, decision.source.legacyPath));
  decision.claims[0].source = span(sourceBuffer, 0, 1);
  decision.unitCoverage[0].fragments = [
    { kind: 'claim', claimId: decision.claims[0].claimId, reasonCode: null, byteStart: 0, byteEnd: 1 },
    { kind: 'structural', claimId: null, reasonCode: 'structure-only', byteStart: 1, byteEnd: sourceBuffer.length },
  ];
  json(root, decisionPath, decision);
  resignReview(root, true);
  assert.throws(() => validateParity({ root }), /splits a UTF-8 code point/u);
});

test('rejects a baseline revision that does not resolve the original path', () => {
  const root = fixture();
  const baseline = load(root, 'docs/config/documentation-tree-baseline.json');
  const classification = load(root, 'docs/config/documentation-tree-classification.json');
  baseline.baselineRevision = 'a'.repeat(40);
  classification.baselineRevision = baseline.baselineRevision;
  json(root, 'docs/config/documentation-tree-baseline.json', baseline);
  json(root, 'docs/config/documentation-tree-classification.json', classification);
  assert.throws(() => validateParity({ root }), /baselineRevision|unknown revision|bad object|does not exist/u);
});

test('rejects a baseline registry that omits a documentation-tree blob', () => {
  assert.throws(() => fixture({ unregisteredBaselineText: '# Forgotten baseline document\n' }),
    /exactly enumerate every regular file under docs/u);
});

test('rejects duplicate classification and summary source records', () => {
  const duplicateClassification = fixture();
  const classification = load(duplicateClassification, 'docs/config/documentation-tree-classification.json');
  classification.files.push({ ...classification.files[0] });
  json(duplicateClassification, 'docs/config/documentation-tree-classification.json', classification);
  assert.throws(() => validateParity({ root: duplicateClassification }), /duplicate path|duplicate originalPath/u);

  const duplicateSummary = fixture();
  const summary = load(duplicateSummary, 'docs/generated/inventory/documentation-parity-summary.json');
  summary.sources.push({ ...summary.sources[0] });
  json(duplicateSummary, 'docs/generated/inventory/documentation-parity-summary.json', summary);
  assert.throws(() => validateParity({ root: duplicateSummary }), /independent rebuild|duplicate originalPath/u);
});

test('rejects incompatible truth, disposition, and omission reasons', () => {
  const root = fixture();
  const decision = load(root, decisionPath);
  Object.assign(decision.claims[0], {
    truthState: 'current', disposition: 'omitted', evidence: [], targets: [],
    omission: { reasonCode: 'navigation-only', explanation: 'Forge a current fact as navigation.', evidence: [decision.claims[0].evidence[0]] },
  });
  json(root, decisionPath, decision);
  resignReview(root, true);
  assert.throws(() => validateParity({ root }), /only obsolete or non-reader content can be omitted/u);

  const inverse = fixture();
  const inverseDecision = load(inverse, decisionPath);
  Object.assign(inverseDecision.claims[0], {
    claimType: 'navigation-only', truthState: 'non-reader-content', disposition: 'omitted', evidence: [], targets: [],
    omission: { reasonCode: 'non-semantic-decoration', explanation: 'Wrongly classify navigation as decoration.',
      evidence: [inverseDecision.claims[0].evidence[0]] },
  });
  json(inverse, decisionPath, inverseDecision);
  resignReview(inverse, true);
  assert.throws(() => validateParity({ root: inverse }), /navigation-only claim requires navigation-only omission/u);
});

test('rejects mapped behavioral claims without current evidence', () => {
  const root = fixture();
  const decision = load(root, decisionPath);
  decision.claims[0].evidence = [];
  json(root, decisionPath, decision);
  resignReview(root, true);
  assert.throws(() => validateParity({ root }), /requires current source evidence/u);
});

test('rejects a canonical documentation page forged as current behavioral evidence', () => {
  const root = fixture();
  const decision = load(root, decisionPath);
  const canonicalBuffer = fs.readFileSync(path.join(root, sitePath));
  decision.claims[0].evidence = [{ revision: decision.reviewedRevision, path: sitePath,
    basis: 'current-contract', assertion: 'The canonical page claims its own behavior.',
    gitObject: gitObject(canonicalBuffer, root), ...span(canonicalBuffer) }];
  json(root, decisionPath, decision);
  resignReview(root, true);
  assert.throws(() => validateParity({ root }), /canonical parity documentation cannot prove current behavior/u);
});

test('rejects an unclassified publication target and a fake fenced heading anchor', () => {
  const unpublished = fixture();
  const classification = load(unpublished, 'docs/config/documentation-tree-classification.json');
  classification.files = classification.files.filter((item) => item.path !== sitePath);
  json(unpublished, 'docs/config/documentation-tree-classification.json', classification);
  assert.throws(() => validateParity({ root: unpublished }), /publication allowlist/u);

  const fakeAnchor = fixture({ siteText: '# Guide\n\n```md\n# Forged\nAlpha current behavior.\n```\n' });
  const decision = load(fakeAnchor, decisionPath);
  decision.claims[0].targets[0].anchor = 'forged';
  json(fakeAnchor, decisionPath, decision);
  resignReview(fakeAnchor, true);
  assert.throws(() => validateParity({ root: fakeAnchor }), /anchor must identify exactly one real heading/u);
});

test('round-trips the fixed generated manifest without self-reference or a false dirty-tree failure', () => {
  const root = fixture();
  commitFixture(root);
  const first = validateParity({ root, readiness: true });
  json(root, deletionManifestPath, first);
  const second = validateParity({ root, readiness: true, allowDeletionManifestOutput: true });
  assert.deepEqual(second, first);
});

test('deletion-manifest replacement is atomic on write and rename failures', () => {
  for (const method of ['writeFileSync', 'renameSync']) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-deletion-manifest-'));
    write(root, deletionManifestPath, '{"existing":"valid"}\n');
    const absolute = path.join(root, deletionManifestPath);
    const before = fs.readFileSync(absolute);
    const status = fs.statSync(absolute, { bigint: true });
    assert.throws(() => writeDeterministic(deletionManifestPath, { replacement: true }, root,
      failFileSystem(method)), new RegExp(`injected ${method} failure`, 'u'));
    assert.deepEqual(fs.readFileSync(absolute), before);
    assert.equal(fs.statSync(absolute, { bigint: true }).ino, status.ino);
    assert.deepEqual(fs.readdirSync(path.dirname(absolute)).filter((name) => /\.tmp-/u.test(name)), []);
  }
});

test('deletion-manifest output rejects symlinked ancestors and final paths', () => {
  const ancestorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-deletion-symlink-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-deletion-outside-'));
  fs.mkdirSync(path.join(ancestorRoot, 'docs/generated'), { recursive: true });
  fs.symlinkSync(outside, path.join(ancestorRoot, 'docs/generated/inventory'), 'dir');
  assert.throws(() => writeDeterministic(deletionManifestPath, {}, ancestorRoot),
    /symbolic-link path component is forbidden/u);

  const finalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-deletion-final-'));
  const outsideFile = path.join(outside, 'manifest.json');
  fs.writeFileSync(outsideFile, '{"outside":true}\n');
  fs.mkdirSync(path.dirname(path.join(finalRoot, deletionManifestPath)), { recursive: true });
  fs.symlinkSync(outsideFile, path.join(finalRoot, deletionManifestPath));
  assert.throws(() => writeDeterministic(deletionManifestPath, {}, finalRoot),
    /symbolic-link path component is forbidden/u);
  assert.equal(fs.readFileSync(outsideFile, 'utf8'), '{"outside":true}\n');

  const danglingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-deletion-dangling-'));
  fs.mkdirSync(path.dirname(path.join(danglingRoot, deletionManifestPath)), { recursive: true });
  fs.symlinkSync('missing-manifest.json', path.join(danglingRoot, deletionManifestPath));
  assert.throws(() => writeDeterministic(deletionManifestPath, {}, danglingRoot),
    /symbolic-link path component is forbidden/u);
});

test('never grants readiness without every same-revision gate and a clean tree', () => {
  const root = fixture();
  assert.equal(validateParity({ root }).deletionReady, false);
  commitFixture(root);
  write(root, 'scripts/docs-check.mjs', 'throw new Error("site gate failed");\n');
  commitFixture(root, 'make site gate fail');
  const forgedRunner = () => [{ id: 'site', status: 'PASS' }];
  assert.throws(() => validateParity({ root, readiness: true, gateRunner: forgedRunner }), /Command failed/u);
});

test('requires trusted review provenance and rendered SVG review evidence', () => {
  const provenance = fixture();
  const review = load(provenance, reviewPath);
  review.reviewer.provenance.actorId = 'author-a';
  json(provenance, reviewPath, review);
  assert.throws(() => validateParity({ root: provenance }), /provenance actor differs/u);

  const svg = fixture({ sourceText: '<svg><title>Alpha diagram</title><text>Alpha</text></svg>\n', sourceKind: 'diagram' });
  assert.throws(() => validateParity({ root: svg }), /SVG units require exactly one rendered visual evidence binding/u);
});

test('requires a real rendered image and binds every SVG relationship in review', () => {
  assert.deepEqual(inspectRenderedImage(VALID_PNG), { mediaType: 'image/png', width: 1, height: 1 });
  assert.throws(() => inspectRenderedImage(Buffer.from('export default "not an image";\n')), /must be a PNG image/u);

  const root = fixture({
    sourceKind: 'diagram',
    sourceText: '<svg><path d="M0 0 L1 1" marker-end="url(#arrow)"/><marker id="arrow"/></svg>\n',
  });
  const completed = completeSvgDecision(root);
  assert.equal(validateParity({ root }).deletionReady, false);

  const review = load(root, completed.svgReviewPath);
  review.visualVerdicts[0].relationUnitIds = [];
  json(root, completed.svgReviewPath, review);
  assert.throws(() => validateParity({ root }), /relationship review coverage differs/u);

  const arbitrary = fixture({ sourceKind: 'diagram', sourceText: '<svg><text>Alpha</text></svg>\n' });
  const arbitraryCompleted = completeSvgDecision(arbitrary);
  const decision = load(arbitrary, arbitraryCompleted.svgDecisionPath);
  const scriptBytes = fs.readFileSync(path.join(arbitrary, 'scripts/docs-check.mjs'));
  Object.assign(decision.visualEvidence[0], { renderedPath: 'scripts/docs-check.mjs',
    renderedSha256: sha256(scriptBytes), mediaType: 'image/png', width: 1, height: 1 });
  json(arbitrary, arbitraryCompleted.svgDecisionPath, decision);
  assert.throws(() => validateParity({ root: arbitrary }), /must be a PNG image/u);
});

test('validates PNG structure, checksums, pixel geometry, and scanline filters', () => {
  assert.deepEqual(inspectRenderedImage(pngFixture()), { mediaType: 'image/png', width: 1, height: 1 });

  const corruptCrc = Buffer.from(VALID_PNG);
  corruptCrc[29] ^= 0xff;
  assert.throws(() => inspectRenderedImage(corruptCrc), /chunk CRC is invalid/u);

  assert.throws(() => inspectRenderedImage(pngFixture({ width: 2 })), /shorter than its geometry/u);
  assert.throws(() => inspectRenderedImage(pngFixture({ pixels: Buffer.from([5, 0xff, 0xff]) })),
    /invalid filter byte/u);
  assert.throws(() => inspectRenderedImage(pngFixture({ bitDepth: 4 })), /unsupported PNG color type or bit depth/u);
  assert.throws(() => inspectRenderedImage(pngFixture({ interlace: 2 })), /unsupported PNG interlace method/u);
  assert.throws(() => inspectRenderedImage(pngFixture({ colorType: 3 })), /indexed PNG requires PLTE/u);

  const header = VALID_PNG.subarray(16, 29);
  const notFirst = Buffer.concat([PNG_SIGNATURE, pngChunk('tEXt', Buffer.from('note')), pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.from([0, 0xff, 0xff]))), pngChunk('IEND')]);
  assert.throws(() => inspectRenderedImage(notFirst), /IHDR must be the first chunk/u);

  const duplicateHeader = Buffer.concat([PNG_SIGNATURE, pngChunk('IHDR', header), pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.from([0, 0xff, 0xff]))), pngChunk('IEND')]);
  assert.throws(() => inspectRenderedImage(duplicateHeader), /IHDR must be unique/u);
  assert.throws(() => inspectRenderedImage(pngFixture({ betweenIdat: [pngChunk('tEXt', Buffer.from('note'))] })),
    /IDAT chunks must be contiguous/u);
  assert.throws(() => inspectRenderedImage(Buffer.concat([pngFixture(), Buffer.from('trailing')])),
    /trailing or truncated data after IEND/u);
});

test('requires an assessed redirect to exist in the authoritative route registry', () => {
  const root = fixture();
  json(root, 'docs/site/reference/documentation-route-registry.json', {
    schemaVersion: 'kubeclaw-documentation-routes.v1', authority: 'test', redirects: [], deprecatedTerms: [], historicalRouteBoundary: 'test',
  });
  const decision = load(root, decisionPath);
  decision.redirect = { status: 'required', from: '/legacy', to: '/guide', basis: 'known-public-route', reason: 'The public route existed.' };
  json(root, decisionPath, decision);
  resignReview(root, true);
  assert.throws(() => validateParity({ root }), /required redirect must have exactly one registry mapping/u);

  const wrongFrom = fixture();
  const wrongFromDecision = load(wrongFrom, decisionPath);
  wrongFromDecision.redirect.from = '/forged-old-route';
  json(wrongFrom, decisionPath, wrongFromDecision);
  resignReview(wrongFrom, true);
  assert.throws(() => validateParity({ root: wrongFrom }), /must be the original public documentation route/u);

  const conflicting = fixture();
  const registry = load(conflicting, 'docs/site/reference/documentation-route-registry.json');
  registry.redirects = [{ from: '/legacy', to: '/guide' }];
  json(conflicting, 'docs/site/reference/documentation-route-registry.json', registry);
  assert.throws(() => validateParity({ root: conflicting }), /not-required conflicts with an existing registry mapping/u);
});

test('supports non-circular preassignments and historical decisions without current behavior evidence', () => {
  const root = fixture();
  const assignments = load(root, 'docs/config/documentation-parity-review-assignments.json');
  assert.equal(Object.hasOwn(assignments.assignments[0], 'reviewedRevision'), false);
  const decision = load(root, decisionPath);
  decision.claims[0].claimType = 'decision';
  decision.claims[0].truthState = 'historical-decision';
  decision.claims[0].evidence = [];
  json(root, decisionPath, decision);
  refreshContentBindings(root);
  assert.equal(validateParity({ root }).deletionReady, false);
});

test('uses the shared authoritative GitHub anchor algorithm', () => {
  const inlineReference = `${'docs'}/inline.md`;
  const indentedReference = `${'docs'}/indented.md`;
  assert.match(stripFencedCodeAndComments(`\`${inlineReference}\`\n    ${indentedReference}\n`),
    /docs\/inline\.md[\s\S]*docs\/indented\.md/u);
  const decoratedHeading = 'Under_score -- A!!  B';
  const decorated = fixture({ siteText: `# ${decoratedHeading}\n\nAlpha current behavior.\n` });
  const decoratedDecision = load(decorated, decisionPath);
  decoratedDecision.claims[0].targets[0].anchor = markdownAnchorEntries(`# ${decoratedHeading}\n`)[0].anchor;
  json(decorated, decisionPath, decoratedDecision);
  resignReview(decorated, true);
  assert.equal(validateParity({ root: decorated }).deletionReady, false);

  const duplicate = fixture({ siteText: '# Same__heading!!\n\nFirst section.\n\n# Same__heading!!\n\nAlpha current behavior.\n' });
  const duplicateDecision = load(duplicate, decisionPath);
  duplicateDecision.claims[0].targets[0].anchor = markdownAnchorEntries('# Same__heading!!\n\n# Same__heading!!\n')[1].anchor;
  json(duplicate, decisionPath, duplicateDecision);
  resignReview(duplicate, true);
  assert.equal(validateParity({ root: duplicate }).deletionReady, false);

  const explicit = fixture({ siteText: '# Guide\n\n<a id="Explicit-ID"></a>\n\nAlpha current behavior.\n' });
  const explicitDecision = load(explicit, decisionPath);
  explicitDecision.claims[0].targets[0].anchor = 'Explicit-ID';
  json(explicit, decisionPath, explicitDecision);
  resignReview(explicit, true);
  assert.equal(validateParity({ root: explicit }).deletionReady, false);

  assert.deepEqual(markdownAnchorEntries('```md\n# Hidden\n```\n# Visible\n').map((item) => item.anchor), ['visible']);
  assert.deepEqual(markdownAnchorEntries([
    '    # Indented fake',
    '`<a id="inline-fake"></a>`',
    '<!-- <a id="comment-fake"></a> -->',
    '```md',
    '# Fenced fake',
    '````',
    '# Under_score -- A!!  B',
    '# _Emphasis_ and `inline_code`',
    '',
  ].join('\n')).map((item) => item.anchor), ['under_score----a--b', 'emphasis-and-inline_code']);

  const rawBlocks = ['script', 'style', 'pre', 'textarea'].map((tag) => [
    `<${tag}>`,
    `# Hidden ${tag} heading`,
    `<a id="hidden-${tag}"></a>`,
    `</${tag}>`,
  ].join('\n')).join('\n');
  assert.deepEqual(markdownAnchorEntries([
    rawBlocks,
    '<a id="real-html-anchor"></a>',
    '# Visible heading',
    '',
  ].join('\n')).map((item) => item.anchor), ['real-html-anchor', 'visible-heading']);
  assert.deepEqual(markdownAnchorEntries([
    '<div id="real-container-anchor">',
    '# Forged heading in raw HTML',
    '</div>',
    '',
    '# Real heading after the raw block',
    '',
  ].join('\n')).map((item) => item.anchor), ['real-container-anchor', 'real-heading-after-the-raw-block']);
});

test('hashes Git blobs with the repository object format', (context) => {
  const buffer = Buffer.from('repository-format-aware blob\n');
  for (const format of ['sha1', 'sha256']) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `kubeclaw-git-${format}-`));
    try {
      execFileSync('git', ['init', '-q', `--object-format=${format}`], { cwd: root });
    } catch (error) {
      if (format === 'sha256') {
        context.diagnostic('Git does not support SHA-256 repositories; SHA-256 fixture skipped');
        continue;
      }
      throw error;
    }
    const expected = execFileSync('git', ['hash-object', '--stdin'], { cwd: root, input: buffer, encoding: 'utf8' }).trim();
    assert.equal(gitObject(buffer, root), expected);
    assert.equal(gitObject(buffer, root).length, format === 'sha1' ? 40 : 64);
    assert.equal(validGitObject(expected, root), true);
    assert.equal(validGitObject(expected.slice(0, 40), root), format === 'sha1',
      `${format} must reject abbreviated object IDs`);
  }
});

test('ignores narrow immutable audit metadata but rejects executable and configuration dependencies', () => {
  const audit = fixture();
  write(audit, 'docs/review/audit.json', '{"historicalPath":"docs/legacy.md"}\n');
  assert.equal(validateParity({ root: audit }).deletionReady, false);

  const configuration = fixture();
  write(configuration, 'config/runtime.json', '{"documentationInput":"docs/legacy.md"}\n');
  assert.throws(() => validateParity({ root: configuration }), /active files still depend/u);

  const executable = fixture();
  write(executable, 'scripts/live-dependency.mjs', 'export const input = "docs/_legacy-source/legacy.md";\n');
  assert.throws(() => validateParity({ root: executable }), /active files still depend/u);

  const composed = fixture();
  write(composed, 'config/composed-path.mjs', 'export const input = ["docs", "legacy.md"].join("/");\n');
  assert.throws(() => validateParity({ root: composed }), /active files still depend/u);

  const pathComposed = fixture();
  write(pathComposed, 'config/path-composed.mjs',
    'import path from "node:path"; export const input = path.join("docs", "_legacy-source", "legacy.md");\n');
  assert.throws(() => validateParity({ root: pathComposed }), /active files still depend/u);

  const staleAttestation = fixture();
  const review = load(staleAttestation, reviewPath);
  review.activeDependencyReview.contentRoot = '0'.repeat(64);
  json(staleAttestation, reviewPath, review);
  assert.throws(() => validateParity({ root: staleAttestation }), /active dependency attestation is stale/u);
});

test('exports categorical strict per-source inspection and fail-closed global findings', () => {
  const valid = fixture();
  let inspection = inspectParitySources({ root: valid });
  assert.equal(inspection.valid, true);
  assert.equal(inspection.sources[0].state, 'source-valid');
  assert.equal(inspection.sources[0].unitCount, 1);

  const missingDecision = fixture();
  fs.unlinkSync(path.join(missingDecision, decisionPath));
  inspection = inspectParitySources({ root: missingDecision });
  assert.equal(inspection.sources[0].state, 'missing-decision');

  const untriaged = fixture();
  const source = load(untriaged, decisionPath).source;
  json(untriaged, decisionPath, { schemaVersion: 'kubeclaw-documentation-parity-untriaged.v1', status: 'untriaged', source });
  inspection = inspectParitySources({ root: untriaged });
  assert.equal(inspection.sources[0].state, 'untriaged-decision');

  const invalidDecision = fixture();
  const invalid = load(invalidDecision, decisionPath);
  invalid.forged = true;
  json(invalidDecision, decisionPath, invalid);
  inspection = inspectParitySources({ root: invalidDecision });
  assert.equal(inspection.sources[0].state, 'invalid-decision');

  const missingReview = fixture();
  fs.unlinkSync(path.join(missingReview, reviewPath));
  inspection = inspectParitySources({ root: missingReview });
  assert.equal(inspection.sources[0].state, 'missing-review');

  const invalidReview = fixture();
  const review = load(invalidReview, reviewPath);
  review.verdict = 'FAIL';
  json(invalidReview, reviewPath, review);
  inspection = inspectParitySources({ root: invalidReview });
  assert.equal(inspection.sources[0].state, 'invalid-review');

  const globalFailure = fixture();
  const baseline = load(globalFailure, 'docs/config/documentation-tree-baseline.json');
  baseline.files.push({ ...baseline.files[0] });
  json(globalFailure, 'docs/config/documentation-tree-baseline.json', baseline);
  inspection = inspectParitySources({ root: globalFailure });
  assert.equal(inspection.valid, false);
  assert.equal(inspection.sources.length, 0);
  assert.equal(inspection.globalFindings[0].kind, 'authority-or-tool-error');
});
