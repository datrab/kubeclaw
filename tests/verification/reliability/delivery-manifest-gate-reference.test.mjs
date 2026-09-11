import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const child = fileURLToPath(new URL('./delivery-manifest-v3-stage-boundary-child.mjs', import.meta.url));
function run(root, phase) {
  const env = { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [child, root, phase], { env, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, `${phase}: ${result.stderr}\n${result.stdout}`);
}

test('original consumer refuses ambiguous, absent and non-JSON gate references with a valid import present', () => {
  const proofs = [];
  for (const mode of ['v2', 'v3']) for (const mutation of ['ambiguous-gate', 'missing-gate', 'gate-media']) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `delivery-gate-${mode}-${mutation}-`));
    try {
      run(root, mode === 'v2' ? 'produce-v2' : 'produce');
      run(root, 'consume-en');
      const originalImport = fs.readFileSync(path.join(root, 'imports/records/store.json'));
      const phase = `consume-body-${mutation}`;
      run(root, phase);
      const proof = JSON.parse(fs.readFileSync(path.join(root, `${phase}-proof.json`), 'utf8'));
      assert.equal(proof.outcome, 'blocked');
      assert.equal(proof.evidenceReceipt.status, 'failed');
      assert.equal(proof.evidenceReceipt.result, undefined);
      assert.equal(proof.error.message, mode === 'v3' ? 'DELIVERY_MANIFEST_INVALID'
        : mutation === 'gate-media' ? 'DEMO_EVIDENCE_ARTIFACT_OWNER_INVALID' : 'DEMO_EVIDENCE_GATE_REFERENCE_INVALID');
      const reads = proof.allConsumerEffects.filter(item => item.request.capability === 'artifacts.read');
      assert.equal(reads.length, 1, 'rejection must precede the gate read and import projection');
      assert.equal(reads[0].receipt.status, 'completed', 'real mutated manifest must be read successfully');
      assert.deepEqual(fs.readFileSync(path.join(root, 'imports/records/store.json')), originalImport,
        'the genuine completed import must remain unchanged');
      proofs.push({ mode, mutation, proof });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  if (process.env.KUBECLAW_DELIVERY_GATE_PROOF_OUTPUT) {
    const output = path.resolve(process.env.KUBECLAW_DELIVERY_GATE_PROOF_OUTPUT);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify({ proofs, providerExecution: false, deploymentExecution: false }, null, 2) + '\n');
  }
});
