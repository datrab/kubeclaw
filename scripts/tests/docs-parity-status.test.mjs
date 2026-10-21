import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { buildStatusInventory, runCli } from '../docs-parity-status.mjs';

const REVISION = '1'.repeat(40);
const GIT_OBJECT = '2'.repeat(40);
const DIGEST = '3'.repeat(64);
const ZERO_SHA = '0'.repeat(64);

function write(root, relative, value) {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, value);
}

function writeJson(root, relative, value) { write(root, relative, `${JSON.stringify(value, null, 2)}\n`); }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function decisionPath(source) { return `docs/config/documentation-parity/${source.originalPath.slice(5)}.json`; }
function reviewPath(source) { return `docs/config/documentation-parity-reviews/${source.originalPath.slice(5)}.json`; }

function sourceRecord(name, revision = REVISION) {
  return { originalPath: `docs/${name}.md`, legacyPath: `docs/_legacy-source/${name}.md`,
    baselineRevision: revision, gitObject: revision.length === 64 ? '2'.repeat(64) : GIT_OBJECT,
    extractionDigest: DIGEST, units: 1 };
}

function inspectionSource(source, state, findings = []) {
  return { originalPath: source.originalPath, legacyPath: source.legacyPath, baselineRevision: source.baselineRevision,
    gitObject: source.gitObject, extractionDigest: source.extractionDigest, unitCount: source.units,
    decisionPath: decisionPath(source), reviewPath: reviewPath(source), state, findings };
}

function inspectorFor(root, sources, states = {}) {
  return () => {
    const records = sources.map((source) => {
      let state = states[source.originalPath];
      if (!state) {
        const decision = path.join(root, decisionPath(source));
        if (!fs.existsSync(decision)) state = 'missing-decision';
        else {
          const value = JSON.parse(fs.readFileSync(decision, 'utf8'));
          state = value.schemaVersion === 'kubeclaw-documentation-parity-untriaged.v1'
            ? 'untriaged-decision' : 'invalid-decision';
        }
      }
      return inspectionSource(source, state, state === 'missing-decision' ? ['decision is missing'] : []);
    });
    const validatedRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    return { schemaVersion: 'kubeclaw-documentation-parity-inspection.v1', validatedRevision,
      globalFindings: [], sources: records, valid: records.every((record) => record.state === 'source-valid') };
  };
}

function fixture(names = ['guide'], revision = REVISION) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-parity-status-'));
  const sources = names.map((name) => sourceRecord(name, revision));
  writeJson(root, 'docs/config/documentation-parity-batches.json', {
    schemaVersion: 'kubeclaw-documentation-parity-batches.v1', purpose: 'fixture',
    sourceSetAuthorityRevision: revision,
    sourceSetAuthoritySha256: 'a'.repeat(64),
    batches: [{ id: 'fixture-batch', owner: 'fixture-owner', patterns: ['^docs/'] }],
  });
  writeJson(root, 'docs/generated/inventory/documentation-parity-batches.json', {
    schemaVersion: 'kubeclaw-documentation-parity-batch-inventory.v1', sourceCount: sources.length, batchCount: 1,
    counts: { 'fixture-batch': sources.length }, assignments: sources.map((source) => ({
      originalPath: source.originalPath, legacyPath: source.legacyPath,
      batchId: 'fixture-batch', owner: 'fixture-owner',
    })),
  });
  writeJson(root, 'docs/config/documentation-tree-classification.json', {
    schemaVersion: 'kubeclaw-documentation-tree-classification.v1', baselineRevision: revision,
    files: sources.map((source) => ({ path: source.legacyPath, class: 'legacy-extraction-source', purpose: 'fixture',
      originalPath: source.originalPath, expectedPath: source.legacyPath, introducedAfterBaseline: false })),
  });
  for (const source of sources) write(root, source.legacyPath, '# fixture\n');
  const units = sources.map((source, index) => ({ schemaVersion: 'kubeclaw-documentation-parity-unit.v1',
    unitId: `unit-${index + 1}`, originalPath: source.originalPath, legacyPath: source.legacyPath,
    baselineRevision: source.baselineRevision, baselineGitObject: source.gitObject }));
  const unitsBytes = `${units.map(JSON.stringify).join('\n')}\n`;
  write(root, 'docs/generated/inventory/documentation-parity-units.jsonl', unitsBytes);
  const summarySources = sources.map((source) => ({ ...source, kind: 'markdown', bytes: 10, sha256: ZERO_SHA,
    unitIdsSha256: ZERO_SHA }));
  const sourceSetSha256 = hash(canonical({ schemaVersion: 'kubeclaw-documentation-parity-source-set.v1',
    baselineRevision: revision, sources: summarySources.map((source) => ({ originalPath: source.originalPath,
      legacyPath: source.legacyPath, gitObject: source.gitObject, kind: source.kind })) }));
  writeJson(root, 'docs/generated/inventory/documentation-parity-summary.json', {
    schemaVersion: 'kubeclaw-documentation-parity-summary.v1',
    extractorVersion: 'kubeclaw-documentation-parity-extractor.v4', authority: 'fixture',
    baselineAuthority: 'fixture', classificationAuthority: 'fixture',
    batchAuthority: 'docs/generated/inventory/documentation-parity-batches.json', baselineRevision: revision,
    sourceSetSha256,
    contentReadPolicy: 'fixture', sourceCount: sources.length, markdownSourceCount: sources.length, svgSourceCount: 0,
    unitCount: units.length, countsByKind: { heading: units.length },
    unitsJsonl: 'docs/generated/inventory/documentation-parity-units.jsonl', unitsJsonlSha256: hash(unitsBytes),
    sources: summarySources,
  });
  execFileSync('git', ['init', '-q', ...(revision.length === 64 ? ['--object-format=sha256'] : [])], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Status Test'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'status@example.invalid'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: root });
  return { root, sources, inspector: inspectorFor(root, sources) };
}

function outputExists(root) {
  return fs.existsSync(path.join(root, 'docs/generated/inventory/documentation-parity-status.json'));
}

function transactionArtifacts(root) {
  const results = [];
  const visit = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.name.includes('.scaffold-') || entry.name.startsWith('.documentation-parity-scaffold-')) {
        results.push(absolute);
      }
    }
  };
  visit(path.join(root, 'docs/config'));
  return results.sort();
}

function crashScaffold(root, phase) {
  const worker = path.join(root, 'crash-scaffold.mjs');
  const scriptUrl = pathToFileURL(path.resolve(import.meta.dirname, '../docs-parity-status.mjs')).href;
  write(root, 'crash-scaffold.mjs', `
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runCli } from ${JSON.stringify(scriptUrl)};
const root = process.argv[2];
const phase = process.argv[3];
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const sources = ['alpha', 'beta'].map((name) => ({ originalPath: \`docs/\${name}.md\`,
  legacyPath: \`docs/_legacy-source/\${name}.md\`, baselineRevision: '${REVISION}',
  gitObject: '${GIT_OBJECT}', extractionDigest: '${DIGEST}', unitCount: 1 }));
const inspector = () => ({ schemaVersion: 'kubeclaw-documentation-parity-inspection.v1', validatedRevision: revision,
  globalFindings: [], valid: false, sources: sources.map((source) => {
    const decisionPath = \`docs/config/documentation-parity/\${source.originalPath.slice(5)}.json\`;
    const reviewPath = \`docs/config/documentation-parity-reviews/\${source.originalPath.slice(5)}.json\`;
    const absolute = path.join(root, decisionPath);
    const state = fs.existsSync(absolute) ? 'untriaged-decision' : 'missing-decision';
    return { ...source, decisionPath, reviewPath, state, findings: [] };
  }) });
runCli({ root, args: ['--scaffold', '--batch=fixture-batch'], inspector,
  scaffoldFailureInjector(current) { if (current === phase) process.exit(86); } });
`);
  try {
    execFileSync(process.execPath, [worker, root, phase], { stdio: 'pipe' });
    assert.fail(`expected crash at ${phase}`);
  } catch (error) { assert.equal(error.status, 86, `unexpected worker outcome at ${phase}`); }
}

test('reports expected missing decisions instead of treating them as a global failure', () => {
  const { root, inspector } = fixture(['alpha', 'beta']);
  const status = buildStatusInventory(root, { inspector });
  assert.equal(status.counts['missing-decision'], 2);
  assert.equal(status.globalDeletionReady, false);
  assert.deepEqual(status.batches[0].sources.map(({ originalPath, state }) => [originalPath, state]), [
    ['docs/alpha.md', 'missing-decision'], ['docs/beta.md', 'missing-decision'],
  ]);
});

test('accepts SHA-256 baseline revisions throughout the status contract', () => {
  const { root, inspector } = fixture(['sha256-baseline'], 'a'.repeat(64));
  const status = buildStatusInventory(root, { inspector });
  assert.equal(status.sourceCount, 1);
  assert.equal(status.counts['missing-decision'], 1);
});

test('requires scaffold plus one exact batch and never overwrites existing author work', () => {
  const { root, sources, inspector } = fixture(['alpha', 'beta']);
  assert.throws(() => runCli({ root, args: ['--scaffold'], inspector }), /--batch=<exact-id>/u);
  assert.throws(() => runCli({ root, args: ['--scaffold', '--batch=unknown'], inspector }), /unknown parity batch/u);
  const authored = decisionPath(sources[0]);
  write(root, authored, '{"authorWork":true}\n');
  const before = fs.readFileSync(path.join(root, authored), 'utf8');
  const status = runCli({ root, args: ['--scaffold', '--batch=fixture-batch'], inspector });
  assert.equal(fs.readFileSync(path.join(root, authored), 'utf8'), before);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, decisionPath(sources[1])), 'utf8')).status, 'untriaged');
  assert.equal(status.counts['invalid-decision'], 1);
  assert.equal(status.counts['untriaged-decision'], 1);
});

test('consumes checker categories and allows source-valid batches without claiming deletion readiness', () => {
  const { root, sources } = fixture(['complete']);
  const status = buildStatusInventory(root, { inspector: inspectorFor(root, sources,
    { 'docs/complete.md': 'source-valid' }) });
  assert.equal(status.sourceValidationComplete, true);
  assert.equal(status.batches[0].sourceValid, true);
  assert.equal(status.counts['source-valid'], 1);
  assert.equal(status.globalDeletionReady, false);
});

test('rejects source-valid inspection without an exact repository revision binding', () => {
  const { root, sources } = fixture(['complete']);
  const record = inspectionSource(sources[0], 'source-valid');
  const missingInspector = () => ({ schemaVersion: 'kubeclaw-documentation-parity-inspection.v1',
    validatedRevision: null, globalFindings: [], sources: [record], valid: true });
  assert.throws(() => buildStatusInventory(root, { inspector: missingInspector }),
    /validatedRevision must be a Git commit/u);
  const staleInspector = () => ({ schemaVersion: 'kubeclaw-documentation-parity-inspection.v1',
    validatedRevision: 'f'.repeat(40), globalFindings: [], sources: [record], valid: true });
  assert.throws(() => buildStatusInventory(root, { inspector: staleInspector }),
    /validatedRevision differs from repository HEAD/u);
});

test('fails closed on global authority or tool findings without writing status', () => {
  const { root } = fixture();
  const inspector = () => ({ schemaVersion: 'kubeclaw-documentation-parity-inspection.v1',
    validatedRevision: null, globalFindings: [{ kind: 'authority-or-tool-error', detail: 'broken authority' }],
    sources: [], valid: false });
  assert.throws(() => runCli({ root, args: [], inspector }), /broken authority/u);
  assert.equal(outputExists(root), false);
});

test('validates unit inputs before scaffold writes', () => {
  const { root, sources, inspector } = fixture();
  fs.appendFileSync(path.join(root, 'docs/generated/inventory/documentation-parity-units.jsonl'), '{}\n');
  assert.throws(() => runCli({ root, args: ['--scaffold', '--batch=fixture-batch'], inspector }),
    /unitsJsonlSha256 is stale/u);
  assert.equal(fs.existsSync(path.join(root, decisionPath(sources[0]))), false);
  assert.equal(outputExists(root), false);
});

test('rejects stale v4 source-set binding before writing status', () => {
  const { root, inspector } = fixture();
  const summaryPath = path.join(root, 'docs/generated/inventory/documentation-parity-summary.json');
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  summary.sourceSetSha256 = 'f'.repeat(64);
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  assert.throws(() => runCli({ root, args: [], inspector }), /sourceSetSha256 is stale/u);
  assert.equal(outputExists(root), false);
});

test('rolls back a batch if post-write inspection fails', () => {
  const { root, sources } = fixture();
  let calls = 0;
  const validInspector = inspectorFor(root, sources);
  const inspector = () => {
    calls += 1;
    if (calls === 1) return validInspector();
    const validatedRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    return { schemaVersion: 'kubeclaw-documentation-parity-inspection.v1', validatedRevision,
      globalFindings: [{ kind: 'authority-or-tool-error', detail: 'late failure' }], sources: [], valid: false };
  };
  assert.throws(() => runCli({ root, args: ['--scaffold', '--batch=fixture-batch'], inspector }), /late failure/u);
  assert.equal(fs.existsSync(path.join(root, decisionPath(sources[0]))), false);
  assert.equal(outputExists(root), false);
});

test('rolls back the whole batch for injected failures in every transaction phase', () => {
  const phases = [
    'pending-before-open', 'pending-after-fsync', 'directory-before-create', 'directory-after-fsync',
    'stage-before-open', 'stage-after-open', 'stage-after-write', 'stage-after-fsync',
    'stage-after-directory-fsync', 'transaction-before-open', 'transaction-after-fsync',
    'pending-after-unlink', 'commit-before-link', 'commit-after-link', 'commit-after-directory-fsync',
    'commit-after-temporary-unlink', 'finalize-before-marker-unlink',
  ];
  for (const phase of phases) {
    const { root, sources, inspector } = fixture(['alpha', 'beta']);
    assert.throws(() => runCli({ root, args: ['--scaffold', '--batch=fixture-batch'], inspector,
      scaffoldFailureInjector(current) { if (current === phase) throw new Error(`injected ${phase}`); } }),
    new RegExp(`injected ${phase}`, 'u'), phase);
    assert.deepEqual(sources.map((source) => fs.existsSync(path.join(root, decisionPath(source)))), [false, false], phase);
    assert.deepEqual(transactionArtifacts(root), [], phase);
    assert.equal(outputExists(root), false, phase);
  }
});

test('a failure after the durable completion marker leaves a complete batch, never a partial one', () => {
  const { root, sources, inspector } = fixture(['alpha', 'beta']);
  assert.throws(() => runCli({ root, args: ['--scaffold', '--batch=fixture-batch'], inspector,
    scaffoldFailureInjector(phase) {
      if (phase === 'finalize-after-marker-unlink') throw new Error('after durable completion');
    } }), /after durable completion/u);
  assert.deepEqual(sources.map((source) => fs.existsSync(path.join(root, decisionPath(source)))), [true, true]);
  assert.deepEqual(transactionArtifacts(root), []);
});

test('recovers deterministically after real process exits during staging and commit', () => {
  for (const phase of ['commit-after-link']) {
    const { root, sources, inspector } = fixture(['alpha', 'beta']);
    crashScaffold(root, phase);
    assert(transactionArtifacts(root).length > 0, `${phase}: crash evidence must remain`);
    const status = runCli({ root, args: ['--scaffold', '--batch=fixture-batch'], inspector });
    assert.equal(status.counts['untriaged-decision'], 2, phase);
    assert.deepEqual(sources.map((source) => fs.existsSync(path.join(root, decisionPath(source)))), [true, true], phase);
    assert.deepEqual(transactionArtifacts(root), [], phase);
  }
});

test('pending crash recovery preserves an unbound staged file and remains fail-closed', () => {
  const { root, inspector } = fixture(['alpha', 'beta']);
  crashScaffold(root, 'stage-after-write');
  const temporary = transactionArtifacts(root).find((absolute) => absolute.endsWith('.tmp'));
  assert(temporary, 'pending staged temporary must exist');
  fs.writeFileSync(temporary, '{"authorWork":true}\n');
  assert.throws(() => runCli({ root, args: ['--scaffold', '--batch=fixture-batch'], inspector }),
    /no durable file identity|refused to remove author work/u);
  assert.equal(fs.readFileSync(temporary, 'utf8'), '{"authorWork":true}\n');
  assert(transactionArtifacts(root).length > 0, 'pending journal must remain fail-closed');
});

test('malformed and wrong-batch scaffold markers remain fail-closed', () => {
  const malformed = fixture(['alpha', 'beta']);
  write(malformed.root, 'docs/config/.documentation-parity-scaffold-fixture-batch.pending.json', '{broken\n');
  assert.throws(() => runCli({ root: malformed.root,
    args: ['--scaffold', '--batch=fixture-batch'], inspector: malformed.inspector }));
  assert.equal(fs.existsSync(path.join(malformed.root,
    'docs/config/.documentation-parity-scaffold-fixture-batch.pending.json')), true);

  const wrong = fixture(['alpha', 'beta']);
  writeJson(wrong.root, 'docs/config/.documentation-parity-scaffold-other-batch.pending.json', {
    schemaVersion: 'kubeclaw-documentation-parity-scaffold-pending.v1',
    batchId: 'other-batch', transactionId: crypto.randomUUID(), pid: 99999999, processStart: null,
    entries: [{ target: decisionPath(wrong.sources[0]),
      temporary: 'docs/config/documentation-parity/.alpha.md.json.scaffold-placeholder.tmp', sha256: DIGEST }],
  });
  assert.throws(() => runCli({ root: wrong.root,
    args: ['--scaffold', '--batch=fixture-batch'], inspector: wrong.inspector }), /belongs to other-batch/u);
  assert.equal(fs.existsSync(path.join(wrong.root,
    'docs/config/.documentation-parity-scaffold-other-batch.pending.json')), true);
});

test('crash recovery preserves in-place author edits to a committed target and remains fail-closed', () => {
  const { root, sources, inspector } = fixture(['alpha', 'beta']);
  crashScaffold(root, 'commit-after-link');
  const authored = path.join(root, decisionPath(sources[0]));
  fs.writeFileSync(authored, '{"authorWork":true}\n');
  assert.throws(() => runCli({ root, args: ['--scaffold', '--batch=fixture-batch'], inspector }),
    /refused to remove author work/u);
  assert.equal(fs.readFileSync(authored, 'utf8'), '{"authorWork":true}\n');
  assert(transactionArtifacts(root).length > 0, 'conflicted journal must remain fail-closed');
});

test('crash recovery preserves in-place edits to a staged temporary and remains fail-closed', () => {
  const { root, inspector } = fixture(['alpha', 'beta']);
  crashScaffold(root, 'transaction-after-fsync');
  const temporary = transactionArtifacts(root).find((absolute) => absolute.endsWith('.tmp'));
  assert(temporary, 'staged transaction temporary must exist');
  fs.writeFileSync(temporary, '{"authorWork":true}\n');
  assert.throws(() => runCli({ root, args: ['--scaffold', '--batch=fixture-batch'], inspector }),
    /refused to remove author work/u);
  assert.equal(fs.readFileSync(temporary, 'utf8'), '{"authorWork":true}\n');
  assert(transactionArtifacts(root).length > 0, 'conflicted journal must remain fail-closed');
});

test('rejects symlinks, unknown JSON, and non-JSON files in parity input trees', () => {
  const symlinkFixture = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-parity-outside-'));
  fs.symlinkSync(outside, path.join(symlinkFixture.root, 'docs/config/documentation-parity'));
  assert.throws(() => buildStatusInventory(symlinkFixture.root, { inspector: symlinkFixture.inspector }), /symlinks/u);

  const unknownFixture = fixture();
  writeJson(unknownFixture.root, 'docs/config/documentation-parity/unknown.md.json', {});
  assert.throws(() => buildStatusInventory(unknownFixture.root, { inspector: unknownFixture.inspector }), /does not belong/u);

  const nonJsonFixture = fixture();
  write(nonJsonFixture.root, 'docs/config/documentation-parity/readme.txt', 'not input\n');
  assert.throws(() => buildStatusInventory(nonJsonFixture.root, { inspector: nonJsonFixture.inspector }),
    /must be JSON files/u);
});

test('--check is read-only and rejects stale generated status', () => {
  const { root, inspector } = fixture();
  runCli({ root, args: [], inspector });
  const output = path.join(root, 'docs/generated/inventory/documentation-parity-status.json');
  fs.appendFileSync(output, 'stale\n');
  assert.throws(() => runCli({ root, args: ['--check'], inspector }), /is stale/u);
  assert.match(fs.readFileSync(output, 'utf8'), /stale\n$/u);
});
