import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { canonicalJson, producerRecordDigest } from '../../../contracts/pipeline-observability/v1/src/index.ts';
import { workerAttemptResultDigest } from '../../../contracts/pipeline-worker-core/v1/src/index.ts';

const sourceRoot = process.env.OBSERVABILITY_REPLAY_SOURCE_ROOT ?? process.cwd();
const { FileObservabilityAdmissionStore } = await import(pathToFileURL(path.join(sourceRoot, 'skills/common/plugin-runtime/foundation/observability/durable-delivery.ts')).href);
const { FileDurableAttemptStore, createProducerClosure, scopedEvidenceId } = await import(pathToFileURL(path.join(sourceRoot, 'skills/common/plugin-runtime/foundation/observability/durable-attempts.ts')).href);
const admissionLimits = { maximumIngressBytes: 10000, maximumRecords: 20, maximumBytes: 200000, maximumQuarantineRecords: 5, maximumQuarantineBytes: 10000 };
const attemptLimits = { maximumEvidenceObjects: 20, maximumEvidenceBytes: 100000, maximumEvidenceObjectBytes: 10000, maximumResults: 20, maximumClosures: 20, maximumMetadataBytes: 500000, maximumPendingEvidenceAgeMs: 60000 };
const corruptionError = /OBSERVABILITY_(?:REPLAY_INVALID|CONTRACT_INVALID|COMPLETION_INTENT_IDENTITY_MISMATCH)|Invalid pipeline worker-core/;
const producer = { producerId: 'worker:1', bootId: 'boot:1', producerType: 'buster' };
async function temporary(t) { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'observability-replay-')); t.after(() => fs.rm(root, { recursive: true, force: true })); return root; }
function record(payload) {
  const unsigned = { schemaVersion: 'producer-record.v1', recordId: 'record:1', producer, sequence: 1, recordType: 'attempt.completed', occurredAt: '2026-08-09T12:00:01Z',
    correlation: { pipelineRunId: 'run:1', moduleId: null, gateId: null, attemptId: 'attempt:1', claimId: 'claim:1', claimGeneration: 1, traceId: null, parentEventId: null }, payload };
  return { ...unsigned, recordDigest: producerRecordDigest(unsigned) };
}
function result(evidence) {
  const unsigned = { schemaVersion: 'worker-attempt-result.v1', protocolVersion: 'worker-protocol.v1', attemptId: 'attempt:1', claimId: 'claim:1', claimGeneration: 1, workerId: 'worker:1',
    state: 'completed', startedAt: '2026-08-09T12:00:00Z', completedAt: '2026-08-09T12:00:01Z', durationMs: 1000, summary: 'Completed.',
    specialistResult: { schemaId: 'test-result.v1', schemaDigest: `sha256:${'0'.repeat(64)}`, values: { outcome: 'passed' } }, error: null, evidence,
    resources: { logBytes: 4, resultBytes: 100, evidenceBytes: 4 }, cleanup: { state: 'not_required', summary: null }, exitCode: 0, signal: null,
    receipt: { receiptId: 'receipt:1', receiptDigest: `sha256:${'0'.repeat(64)}` } };
  return { ...unsigned, resultDigest: workerAttemptResultDigest(unsigned) };
}

test('fresh admission reads and duplicate ACK fail closed for persisted corruption', async (t) => {
  const root = await temporary(t); const file = path.join(root, 'admission.json'); const original = record({ state: 'failed' });
  const open = () => new FileObservabilityAdmissionStore(root, admissionLimits);
  const admitted = await open().admit(canonicalJson(original));
  const baseline = JSON.parse(await fs.readFile(file, 'utf8'));
  const mutations = {
    payload: (state) => { state.entries[0].record.payload.state = 'passed'; },
    digest: (state) => { state.entries[0].record.recordDigest = `sha256:${'0'.repeat(64)}`; },
    wire: (state) => { state.entries[0].bytes = canonicalJson(record({ state: 'changed' })); },
    key: (state) => { state.entries[0].key = 'other'; },
    cursor: (state) => { state.entries[0].canonicalCursor = 2; },
    nextCursor: (state) => { state.nextCursor = 99; },
    duplicate: (state) => { state.entries.push({ ...state.entries[0], canonicalCursor: 2 }); state.nextCursor = 3; },
    missingField: (state) => { delete state.gaps; },
    invalidTimestamp: (state) => { state.entries[0].admittedAt = 'bad'; },
    version: (state) => { state.schemaVersion = 'other'; },
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const corrupt = structuredClone(baseline); mutate(corrupt); const bytes = canonicalJson(corrupt); await fs.writeFile(file, bytes);
    await assert.rejects(open().admittedRecords(), corruptionError, `${name}: read`);
    await assert.rejects(open().admittedTailSnapshot('run:1', 1), corruptionError, `${name}: tail`);
    await assert.rejects(open().admit(canonicalJson(original)), corruptionError, `${name}: duplicate ACK`);
    assert.equal(await fs.readFile(file, 'utf8'), bytes, `${name}: corruption remains available for diagnosis`);
  }
  await fs.writeFile(file, canonicalJson(baseline));
  assert.equal((await open().admit(canonicalJson(original))).acknowledgement.canonicalCursor, admitted.acknowledgement.canonicalCursor);
  assert.equal((await open().admittedRecords())[0].record.payload.state, 'failed');
  const oversized = ' '.repeat(admissionLimits.maximumBytes + 1); await fs.writeFile(file, oversized);
  await assert.rejects(open().snapshot(), /snapshot-size/);
  assert.equal(await fs.readFile(file, 'utf8'), oversized);
});

test('fresh attempt replay validates result, generation, evidence, intent and closure before recovery', async (t) => {
  const root = await temporary(t); const attemptRoot = path.join(root, 'attempts'); const file = path.join(attemptRoot, 'attempt-store.json');
  const open = () => new FileDurableAttemptStore(attemptRoot, attemptLimits);
  const admission = new FileObservabilityAdmissionStore(path.join(root, 'admission'), admissionLimits);
  const evidence = await open().storeEvidence({ pipelineRunId: 'run:1', attemptId: 'attempt:1', claimGeneration: 1, producer, evidenceId: 'log:1', type: 'log', mediaType: 'text/plain' }, Buffer.from('pass'));
  const original = result([evidence]);
  const completion = { record: record({ resultDigest: original.resultDigest, workerId: original.workerId }), closure: createProducerClosure({ schemaVersion: 'producer-closure.v1', closureId: 'closure:1', producer, pipelineRunId: 'run:1', firstSequence: 1, finalSequence: 1, recordCount: 1, requiredEvidenceIds: [scopedEvidenceId('attempt:1', 1, 'log:1')], closedAt: '2026-08-09T12:00:02Z' }) };
  await open().storeResult('run:1', original, completion, { planId: 'plan:1', nodeId: 'node:1' });
  await open().resumeCompletion('run:1', 'attempt:1', 1, admission);
  const baseline = JSON.parse(await fs.readFile(file, 'utf8'));
  const mutations = {
    payload: (state) => { state.results[0].result.specialistResult.values.outcome = 'failed'; },
    digest: (state) => { state.results[0].result.resultDigest = `sha256:${'0'.repeat(64)}`; },
    generation: (state) => { state.results[0].claimGeneration = 2; },
    worker: (state) => { state.results[0].workerId = 'other'; },
    intent: (state) => { state.results[0].completionIntent.record.payload.workerId = 'other'; },
    closure: (state) => { state.closures[0].requiredEvidenceIds = []; },
    evidence: (state) => { state.evidence[0].artifact.contentDigest = `sha256:${'0'.repeat(64)}`; },
    evidenceProducer: (state) => { state.evidence[0].producer.bootId = 'other'; },
    pendingEvidenceProducer: (state) => { state.closures = []; state.evidence[0].producer.bootId = 'other'; },
    falseIntent: (state) => { state.results[0].completionIntent = false; },
    zeroIntent: (state) => { state.results[0].completionIntent = 0; },
    emptyIntent: (state) => { state.results[0].completionIntent = ''; },
    missingEvidence: (state) => { state.evidence = []; },
    duplicateResult: (state) => { state.results.push(state.results[0]); },
    duplicateClosure: (state) => { state.closures.push(state.closures[0]); },
    invalidTimestamp: (state) => { state.results[0].storedAt = 'bad'; },
    missingField: (state) => { delete state.results[0].completionIntent; },
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const corrupt = structuredClone(baseline); mutate(corrupt); const bytes = canonicalJson(corrupt); await fs.writeFile(file, bytes);
    await assert.rejects(open().snapshot(), corruptionError, `${name}: snapshot`);
    await assert.rejects(open().storeResult('run:1', original, completion, { planId: 'plan:1', nodeId: 'node:1' }), corruptionError, `${name}: duplicate result`);
    await assert.rejects(open().resumeCompletion('run:1', 'attempt:1', 1, admission), corruptionError, `${name}: recovery`);
    assert.equal(await fs.readFile(file, 'utf8'), bytes, `${name}: corrupted history is preserved`);
  }
  await fs.writeFile(file, canonicalJson(baseline));
  assert.deepEqual(await open().snapshot(), baseline);
  assert.equal((await open().resumeCompletion('run:1', 'attempt:1', 1, admission)).closureDigest, completion.closure.closureDigest);
  baseline.results[0].storedAt = null; await fs.writeFile(file, canonicalJson(baseline));
  await assert.rejects(open().resumeCompletion('run:1', 'attempt:1', 1, admission), /COMMIT_PENDING/);
  assert.equal(typeof (await open().storeResult('run:1', original, completion, { planId: 'plan:1', nodeId: 'node:1' })).storedAt, 'string');
});

test('standalone closure producer binding preserves staged-evidence expiry and partial completeness', async (t) => {
  const root = await temporary(t); const attemptRoot = path.join(root, 'attempts'); const file = path.join(attemptRoot, 'attempt-store.json');
  const open = () => new FileDurableAttemptStore(attemptRoot, attemptLimits);
  const admission = new FileObservabilityAdmissionStore(path.join(root, 'admission'), admissionLimits);
  await admission.admit(canonicalJson(record({ state: 'completed' })));
  await open().storeEvidence({ pipelineRunId: 'run:1', attemptId: 'attempt:1', claimGeneration: 1, producer, evidenceId: 'log:1', type: 'log', mediaType: 'text/plain' }, Buffer.from('pass'));
  const closure = createProducerClosure({ schemaVersion: 'producer-closure.v1', closureId: 'closure:standalone', producer, pipelineRunId: 'run:1', firstSequence: 1, finalSequence: 1, recordCount: 1, requiredEvidenceIds: [scopedEvidenceId('attempt:1', 1, 'log:1')], closedAt: '2026-08-09T12:00:02Z' });
  await open().storeClosure(closure, admission);
  const baseline = JSON.parse(await fs.readFile(file, 'utf8'));
  const corrupt = structuredClone(baseline); corrupt.evidence[0].producer.bootId = 'other';
  await fs.writeFile(file, canonicalJson(corrupt));
  await assert.rejects(open().snapshot(), /attempt-closure-evidence-producer/);
  await assert.rejects(open().storeClosure(closure, admission), /attempt-closure-evidence-producer/);
  assert.equal(await fs.readFile(file, 'utf8'), canonicalJson(corrupt));
  baseline.evidence[0].stagedAt = '2000-01-01T00:00:00Z';
  await fs.writeFile(file, canonicalJson(baseline));
  const expired = await open().snapshot();
  assert.equal(expired.evidence.length, 0);
  assert.equal(expired.closures.length, 1);
  assert.equal((await open().evaluateCompleteness('run:1', [{ closureId: closure.closureId, producer }], admission)).state, 'partial');
});
