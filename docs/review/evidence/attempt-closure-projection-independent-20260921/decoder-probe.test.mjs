// Disposable on-disk decoder corruption probes, not an authorized positive retirement.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {projectionFixture} from '../../../../tests/verification/reliability/admission-retirement.test.mjs';
import {retireAttemptResult} from '../../../../scripts/retire-attempt-result.mjs';
import {FileDurableAttemptStore} from '../../../../skills/common/plugin-runtime/foundation/observability/durable-attempts.ts';
import {canonicalJson} from '../../../../contracts/pipeline-observability/v1/src/index.ts';
import {attemptProjectionKey} from '../../../../skills/common/plugin-runtime/foundation/observability/attempt-projection.ts';
import {closureIntentDigest} from '../../../../skills/common/plugin-runtime/foundation/observability/closure-projection.ts';

test('independent closure decoder refuses malformed direct references without repair or writes', async t => {
  const f = await projectionFixture(t);
  await retireAttemptResult(f.projectionScope);
  const file = path.join(f.scope.attemptRoot, 'attempt-store.json');
  const raw = JSON.parse(fs.readFileSync(file));
  const original = await f.attempts.snapshot();
  const closure = raw.results[0].completionIntent.closure;
  const intent = { ...f.projectionScope.intent, closureDigest: closure.closureDigest, operationId: 'review:decoder', actor: 'reviewer' };
  const valid = { ...raw, schemaVersion: 'durable-attempt-store.v3', closures: [{
    schemaVersion: 'attempt-closure-reference.v1', resultKey: attemptProjectionKey(raw.results[0]),
    closureDigest: closure.closureDigest, operationId: 'review:decoder', actor: 'reviewer',
    intentDigest: closureIntentDigest(intent),
  }] };
  fs.writeFileSync(file, canonicalJson(valid));
  const reopen = () => new FileDurableAttemptStore(f.scope.attemptRoot, f.limits);
  assert.deepEqual(await reopen().snapshot(), original);
  const cases = [
    ['unknown-version', x => { x.closures[0].schemaVersion = 'attempt-closure-reference.v99'; }],
    ['extra-field', x => { x.closures[0].extra = true; }],
    ['mixed-full-reference', x => { x.closures[0] = { ...closure, ...x.closures[0] }; }],
    ['foreign-result-key', x => { x.closures[0].resultKey = canonicalJson(['run:foreign', f.result.attemptId, 1]); }],
    ['wrong-closure-digest', x => { x.closures[0].closureDigest = `sha256:${'0'.repeat(64)}`; }],
    ['missing-source-completion', x => { x.results[0].completionIntent = null; }],
    ['source-is-full-result', x => { x.results[0] = original.results[0]; }],
    ['recursive-reference', x => { x.results[0].completionIntent.closure = x.closures[0]; }],
    ['duplicate-reference', x => { x.closures.push(structuredClone(x.closures[0])); }],
    ['mixed-duplicate-closure', x => { x.closures.push(closure); }],
    ['missing-reference-receipt', x => { delete x.closures[0].intentDigest; }],
    ['invalid-reference-receipt', x => { x.closures[0].intentDigest = 'sha256:wrong'; }],
    ['empty-reference-set', x => { x.closures = [closure]; }],
  ];
  for (const [name, change] of cases) {
    const corrupted = structuredClone(valid); change(corrupted);
    fs.writeFileSync(file, canonicalJson(corrupted)); const before = fs.readFileSync(file);
    await assert.rejects(reopen().snapshot(), undefined, name);
    assert.deepEqual(fs.readFileSync(file), before, `${name}: no repair/write`);
  }
  fs.writeFileSync(file, canonicalJson(valid));
  assert.deepEqual(await reopen().snapshot(), original);
  t.diagnostic(JSON.stringify({ malformedCases: cases.map(([name]) => name), fullLogicalStateRecovered: true,
    fixture: 'actual validated result projection; closure reference constructed only for decoder-boundary probes' }));
});

import {retireAttemptClosure} from '../../../../scripts/retire-attempt-closure.mjs';
import {attemptStoreDigest} from '../../../../skills/common/plugin-runtime/foundation/observability/attempt-projection.ts';
import {createProducerClosure} from '../../../../skills/common/plugin-runtime/foundation/observability/durable-attempts.ts';
import {workerAttemptResultDigest} from '../../../../contracts/pipeline-worker-core/v1/src/index.ts';

test('independent operator preserves quota after no-saving rejection and rejects later generation after projection', async t => {
  const f = await projectionFixture(t);
  const limits = { ...f.limits, maximumClosures: 1 };
  await retireAttemptResult({ ...f.projectionScope, attemptLimits: limits });
  const file = path.join(f.scope.attemptRoot, 'attempt-store.json');
  const scope = { ...f.projectionScope, attemptLimits: limits,
    schemaVersion: 'attempt-closure-retirement-scope.v1', action: 'compact-imported-closure',
    intent: { ...f.projectionScope.intent, operationId: 'review:closure', closureDigest: f.closure.closureDigest,
      expectedStoreDigest: attemptStoreDigest(fs.readFileSync(file)) } };
  const before = fs.readFileSync(file), journal = fs.readFileSync(f.imported.journalFile);
  const store = new FileDurableAttemptStore(f.scope.attemptRoot, limits), logical = await store.snapshot();
  const noSaving = structuredClone(scope);
  noSaving.intent.operationId = 'o'.repeat(512); noSaving.intent.actor = 'a'.repeat(512);
  await assert.rejects(retireAttemptClosure(noSaving), /RETIREMENT_NOT_SMALLER/u);
  assert.deepEqual(fs.readFileSync(file), before);
  assert.deepEqual(await store.snapshot(), logical);
  const next = createProducerClosure({ ...f.closure, closureId: 'closure:waiting', pipelineRunId: 'run:waiting',
    producer: f.other.producer, requiredEvidenceIds: [] });
  await assert.rejects(store.storeClosure(next, f.admission), /CLOSURE_STORE_FULL/u);
  assert.deepEqual(fs.readFileSync(file), before);
  const receipt = await retireAttemptClosure(scope);
  assert.ok(receipt.releasedBytes > 0);
  assert.equal(receipt.releasedBytes, before.length - fs.statSync(file).size);
  const compact = fs.readFileSync(file);
  const later = { ...f.result, claimGeneration: 2, claimId: 'claim:later' };
  later.resultDigest = workerAttemptResultDigest(later);
  await assert.rejects(store.storeResult(f.runId, later), /OBSERVABILITY_ATTEMPT_ALREADY_COMPLETED/u);
  assert.deepEqual(fs.readFileSync(file), compact);
  assert.deepEqual(fs.readFileSync(f.imported.journalFile), journal);
  await store.storeClosure(next, f.admission);
  await assert.rejects(store.storeClosure(createProducerClosure({ ...next, closureId: 'closure:overfull' }), f.admission), /CLOSURE_STORE_FULL/u);
  assert.equal((await store.snapshot()).closures.length, 2);
  t.diagnostic(JSON.stringify({ noSavingOperationAndActor: 'valid maximum-length identities, rejection fixture only',
    positiveClosureUnpadded: true, actualReleasedBytes: receipt.releasedBytes, finalizedGenerationPreserved: true }));
});
