import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { FileDurableRecordStore } from '@kubeclaw/plugin-foundation/observability/durable-records';
import { sha256Text } from '@kubeclaw/plugin-sdk';

const child = fileURLToPath(new URL('./delivery-manifest-v3-stage-boundary-child.mjs', import.meta.url));
const limits = { maximumRecords: 100, maximumBytes: 8 * 1024 ** 2, maximumRecordBytes: 2 * 1024 ** 2 };

function run(root, phase) {
  const env = { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [child, root, phase], { env, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, `${phase}: ${result.stderr}\n${result.stdout}`);
  return JSON.parse(fs.readFileSync(path.join(root, phase.startsWith('produce') ? 'producer-proof.json' : `${phase}-proof.json`), 'utf8'));
}

test('original v2/v3 consumer rejects media and durably stored import mismatches after reopening', async () => {
  const proofs = [];
  for (const mode of ['v2', 'v3']) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `delivery-import-${mode}-`));
    try {
      const producer = run(root, mode === 'v2' ? 'produce-v2' : 'produce');
      const store = new FileDurableRecordStore(path.join(root, 'imports'), limits);
      const [original] = await store.read('remote-gate-imports');
      assert(original);
      assert.equal(original.payload.state, 'complete');
      assert.equal(original.payload.schemaVersion, 'nova-test-gate-import.v2');
      const positive = run(root, 'consume-en');
      assert.equal(positive.outcome, 'succeeded');
      for (const media of ['media', 'missing-media']) {
        const proof = run(root, `consume-wrong-${media}`);
        assert.equal(proof.boundary.manifestIntegrityRejected, true);
        assert.equal(proof.error.message, 'DEMO_EVIDENCE_ARTIFACT_OWNER_INVALID');
        proofs.push({ mode, scenario: media, proof });
      }
      const mutations = {
        pending: value => { value.state = 'pending_evidence'; },
        'missing-result': value => { value.remoteResult = null; },
        schema: value => { value.schemaVersion = 'nova-test-gate-import.v1'; },
        job: value => { value.source.jobId = 'foreign-job'; },
        run: value => { value.source.plan.runId = 'foreign-run'; },
        stage: value => { value.source.pipelineStageId = 'foreign-stage'; },
        source: value => { value.source.sourceRevision = 'b'.repeat(40); },
        plan: value => { value.source.plan.planDigest = sha256Text('foreign-plan'); },
        result: value => { value.remoteResult.resultDigest = sha256Text('foreign-result'); },
        receipt: value => { value.remoteResult.receipt = { ...value.remoteResult.receipt, jobId: 'foreign-job' }; },
        'stored-digest': value => { value.remoteResultDigest = sha256Text('foreign-stored-result'); },
        'result-job': value => { value.remoteResult.jobId = 'foreign-job'; },
      };
      for (const [scenario, mutate] of Object.entries(mutations)) {
        const changed = structuredClone(original.payload);
        mutate(changed);
        assert.notDeepEqual(changed, original.payload);
        // Corrupt a genuine completed import using the real durable CAS API.
        // The original file store, importer, consumer, adapters and journals remain in use.
        const altered = await store.transition('remote-gate-imports', original.idempotencyKey, original.payloadDigest, changed);
        const reopened = new FileDurableRecordStore(path.join(root, 'imports'), limits);
        assert.deepEqual((await reopened.read('remote-gate-imports'))[0].payload, changed);
        const proof = run(root, `consume-import-${scenario}`);
        assert.equal(proof.boundary.importBindingRejected, true);
        assert.equal(proof.boundary.importedResultSuccess, false);
        proofs.push({ mode, scenario, storedPayloadDigest: altered.payloadDigest, proof });
        const restored = await store.transition('remote-gate-imports', original.idempotencyKey, altered.payloadDigest, original.payload);
        assert.equal(restored.payloadDigest, original.payloadDigest);
      }
      const restoredProof = run(root, 'consume-cs');
      assert.equal(restoredProof.outcome, 'succeeded', 'restored original import must still be consumable');
      proofs.push({ mode, scenario: 'restored', proof: restoredProof, producerSourceDigest: producer.productionSourceDigest });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  if (process.env.KUBECLAW_DELIVERY_IMPORT_PROOF_OUTPUT) {
    const output = path.resolve(process.env.KUBECLAW_DELIVERY_IMPORT_PROOF_OUTPUT);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify({ proofs, providerExecution: false, deploymentExecution: false }, null, 2) + '\n');
  }
});
