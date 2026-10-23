import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { after } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { TestPlanRunner } from '../../../skills/buster/engine/test-gates/runner.ts';
import { FileDurableAttemptStore } from '../../../skills/common/plugin-runtime/foundation/observability/durable-attempts.ts';
import { FileObservabilityAdmissionStore } from '../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts';
import { validateBusterExecutionSettings } from '../../../skills/common/plugin-runtime/foundation/config/buster-execution.ts';
import { runnerExecutionPolicy } from '../../fixtures/test-gate/execution-policy.mts';
import { temporary, registry, plan } from '../../fixtures/test-gate/runner-contract-fixture.mts';

// Run this module in its own serial test process. The suite hook runs after
// all Runner promises settle; sampling also aborts and awaits its run in finally.
after(async () => {
  await fs.promises.rm(temporary, { recursive: true, force: true });
});

async function configuredStores(t, name, group, values, nodes = { real: { uses: 'example.generic@1', retries: 0 } }, expectedState = 'completed') {
  let attempts;
  let admission;
  const originalResult = FileDurableAttemptStore.prototype.storeResult;
  const originalAdmission = FileObservabilityAdmissionStore.prototype.admitAndRead;
  t.mock.method(FileDurableAttemptStore.prototype, 'storeResult', function (...args) {
    attempts = this;
    return Reflect.apply(originalResult, this, args);
  });
  t.mock.method(FileObservabilityAdmissionStore.prototype, 'admitAndRead', function (...args) {
    admission = this;
    return Reflect.apply(originalAdmission, this, args);
  });
  const root = path.join(temporary, name);
  const workspaceRoot = path.join(root, 'workspace');
  const repositoryRoot = path.join(workspaceRoot, 'repository');
  fs.mkdirSync(repositoryRoot, { recursive: true });
  const executionPolicy = validateBusterExecutionSettings({ ...runnerExecutionPolicy,
    stores: { ...runnerExecutionPolicy.stores, [group]: { ...runnerExecutionPolicy.stores[group], ...values } } });
  const result = await new TestPlanRunner({ plan: plan(nodes),
    registry, workspaceRoot, repositoryRoot, artifactRoot: path.join(root, 'artifacts'),
    observabilityRoot: path.join(root, 'observability'), maximumConcurrency: 1,
    workerLocalRuntime: { drainTimeoutMs: 300000, cancellationTimeoutMs: 30000, replayLimit: 65536 },
    executionPolicy,
  }).run();
  assert.equal(result.attempts[0]?.executionState, expectedState);
  assert(attempts);
  if (expectedState === 'completed') {
    assert.equal(result.attempts[0]?.outcome, 'passed');
    assert(admission);
  }
  return { attempts, admission, result };
}

function evidenceInput(index) {
  return { pipelineRunId: 'run:policy-orphan', attemptId: 'attempt:policy-orphan', claimGeneration: 1,
    producer: { producerId: 'worker:policy', bootId: 'boot:policy', producerType: 'buster' },
    evidenceId: `evidence:${index}`, type: 'log', mediaType: 'text/plain' };
}

// Receiver hooks capture the real default Runner-owned stores and delegate every
// original call unchanged. The subsequent writes/reclamation are real public-store
// operations, not a claim that valid Runner completions generate corrupt input.
for (const field of ['maximumEvidenceObjects', 'maximumEvidenceBytes', 'maximumEvidenceObjectBytes']) {
  for (const limit of [1, 2]) {
    test(`default Runner-owned store enforces ${field}=${limit}`, { timeout: 30000 }, async (t) => {
      const values = { [field]: limit };
      if (field === 'maximumEvidenceBytes') values.maximumEvidenceObjectBytes = 1;
      const { attempts } = await configuredStores(t, `${field}-${limit}`, 'attempts', values);
      assert.equal((await attempts.snapshot()).evidence.length, 0, 'generic provider must not prefill evidence quota');
      if (field === 'maximumEvidenceObjectBytes') {
        const write = () => attempts.storeEvidence(evidenceInput(1), Buffer.from('ab'));
        if (limit === 1) await assert.rejects(write, /OBSERVABILITY_EVIDENCE_OBJECT_TOO_LARGE/);
        else assert.equal((await write()).artifact.sizeBytes, 2);
      } else {
        await attempts.storeEvidence(evidenceInput(1), Buffer.from('a'));
        const write = () => attempts.storeEvidence(evidenceInput(2), Buffer.from('b'));
        if (limit === 1) await assert.rejects(write, /OBSERVABILITY_EVIDENCE_STORE_FULL/);
        else await write();
        assert.equal((await attempts.snapshot()).evidence.length, limit);
      }
    });
  }
}

for (const maximumPendingEvidenceAgeMs of [10, 60000]) {
  test(`default Runner-owned store reclaims selected orphan age ${maximumPendingEvidenceAgeMs}`, { timeout: 30000 }, async (t) => {
    const { attempts } = await configuredStores(t, `age-${maximumPendingEvidenceAgeMs}`, 'attempts', { maximumPendingEvidenceAgeMs });
    const ref = await attempts.storeEvidence(evidenceInput(1), Buffer.from('orphan'));
    await delay(30);
    const evidence = (await attempts.snapshot()).evidence;
    assert.equal(evidence.length, maximumPendingEvidenceAgeMs === 10 ? 0 : 1);
    assert.equal(fs.existsSync(new URL(ref.artifact.storageUrl)), maximumPendingEvidenceAgeMs !== 10);
    assert.equal((await attempts.snapshot()).results.length, 1, 'committed provider result remains retained');
  });
}

for (const maximumQuarantineRecords of [1, 2]) {
  test(`default Runner-owned admission retains bounded quarantine ${maximumQuarantineRecords}`, { timeout: 30000 }, async (t) => {
    const { admission } = await configuredStores(t, `quarantine-${maximumQuarantineRecords}`, 'admission', { maximumQuarantineRecords });
    await assert.rejects(() => admission.admit('invalid-one'));
    await assert.rejects(() => admission.admit('invalid-two'));
    const snapshot = await admission.snapshot();
    assert.equal(snapshot.entries.length, 1, 'valid original completion remains admitted');
    assert.equal(snapshot.quarantine.length, maximumQuarantineRecords);
    assert.equal(snapshot.quarantineOverflow?.count ?? 0, maximumQuarantineRecords === 1 ? 1 : 0);
  });
}

for (const maximumQuarantineBytes of [2, 10000]) {
  test(`default Runner-owned admission enforces quarantine bytes ${maximumQuarantineBytes}`, { timeout: 30000 }, async (t) => {
    const { admission } = await configuredStores(t, `quarantine-bytes-${maximumQuarantineBytes}`, 'admission', { maximumQuarantineBytes });
    await assert.rejects(() => admission.admit('invalid-quarantine-byte-probe'));
    const snapshot = await admission.snapshot();
    assert.equal(snapshot.entries.length, 1);
    assert.equal(snapshot.quarantine.length, maximumQuarantineBytes === 2 ? 0 : 1);
    assert.equal(snapshot.quarantineOverflow?.count ?? 0, maximumQuarantineBytes === 2 ? 1 : 0);
  });
}

for (const maximumIngressBytes of [2048, 8192]) {
  test(`default Runner-owned admission enforces ingress bytes ${maximumIngressBytes}`, { timeout: 30000 }, async (t) => {
    const { admission } = await configuredStores(t, `ingress-${maximumIngressBytes}`, 'admission', { maximumIngressBytes });
    const snapshotBefore = await admission.snapshot();
    assert.equal(snapshotBefore.entries.length, 1, 'original valid completion must fit the lower profile');
    // Canonical JSON with the wrong producerRecord type: a specific decoder
    // failure after ingress admission, not an arbitrary infrastructure error.
    const raw = JSON.stringify('x'.repeat(4094));
    assert.equal(Buffer.byteLength(raw), 4096);
    const write = () => admission.admit(raw);
    if (maximumIngressBytes === 2048) await assert.rejects(write, /OBSERVABILITY_INGRESS_TOO_LARGE/);
    else await assert.rejects(write, /^Error: OBSERVABILITY_CONTRACT_INVALID:producerRecord:\/ must be object$/);
    const snapshot = await admission.snapshot();
    assert.equal(snapshot.quarantine.length, maximumIngressBytes === 2048 ? 0 : 1);
    if (maximumIngressBytes === 8192) {
      assert.equal(snapshot.quarantine[0].reason, 'OBSERVABILITY_CONTRACT_INVALID:producerRecord:/ must be object');
    }
    assert.equal(snapshot.quarantineOverflow?.count ?? 0, maximumIngressBytes === 2048 ? 1 : 0);
  });
}

for (const maximumClosures of [1, 2]) {
  test(`default Runner completion consumes closure quota ${maximumClosures}`, { timeout: 30000 }, async (t) => {
    const { attempts, admission, result } = await configuredStores(t, `closures-${maximumClosures}`, 'attempts', { maximumClosures },
      { first: { uses: 'example.generic@1', retries: 0 }, second: { uses: 'example.generic@1', retries: 0 } });
    assert.equal(result.attempts.length, 2);
    assert(result.attempts.every(attempt => attempt.outcome === 'passed'));
    const snapshot = await attempts.snapshot();
    assert.equal(snapshot.results.length, 2);
    assert(snapshot.results.every(row => row.completionIntent !== null));
    assert.equal(snapshot.closures.length, maximumClosures);
    assert.equal((await admission.snapshot()).entries.length, 2);
  });
}

for (const maximumBytes of [1025, 1048576]) {
  test(`default Runner completion consumes admission byte capacity ${maximumBytes}`, { timeout: 30000 }, async (t) => {
    const { attempts, admission } = await configuredStores(t, `admission-bytes-${maximumBytes}`, 'admission', { maximumBytes });
    const snapshot = await attempts.snapshot();
    assert.equal(snapshot.results.length, 1);
    assert(snapshot.results[0].completionIntent !== null);
    assert.equal(snapshot.closures.length, maximumBytes === 1025 ? 0 : 1);
    assert.equal((await admission.snapshot()).entries.length, maximumBytes === 1025 ? 0 : 1);
  });
}

for (const maximumMetadataBytes of [1024, 1048576]) {
  test(`default Runner completion enforces metadata bytes ${maximumMetadataBytes}`, { timeout: 30000 }, async (t) => {
    const { attempts, result } = await configuredStores(t, `metadata-${maximumMetadataBytes}`, 'attempts', { maximumMetadataBytes },
      { real: { uses: 'example.generic@1', retries: 0 } }, maximumMetadataBytes === 1024 ? 'errored' : 'completed');
    const snapshot = await attempts.snapshot();
    assert.equal(snapshot.results.length, maximumMetadataBytes === 1024 ? 0 : 1);
    if (maximumMetadataBytes === 1024) assert.match(result.attempts[0].summary, /OBSERVABILITY_ATTEMPT_METADATA_FULL/);
    else assert.equal(snapshot.closures.length, 1);
  });
}
