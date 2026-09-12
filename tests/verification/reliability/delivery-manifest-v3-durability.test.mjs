import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { sha256Text } from '@kubeclaw/plugin-sdk';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const child = fileURLToPath(new URL('./delivery-manifest-v3-stage-boundary-child.mjs', import.meta.url));

function run(root, phase) {
  const env = { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, [child, root, phase], { cwd: repository, env, encoding: 'utf8', timeout: 30_000 });
}

test('v2/v3 Summary write and downstream read retain exact real disk prefixes across actual SIGKILL and replay', () => {
  const retained = process.env.KUBECLAW_DELIVERY_DURABILITY_PROOF_OUTPUT
    ? path.resolve(process.env.KUBECLAW_DELIVERY_DURABILITY_PROOF_OUTPUT) : undefined;
  const transcript = [];
  for (const target of ['write', 'read']) for (const mode of ['v2', 'v3']) {
    for (const boundary of ['requested', 'accepted', 'completed']) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), `delivery-durability-${target}-${mode}-${boundary}-`));
      try {
        if (target === 'read') {
          const produced = run(root, mode === 'v2' ? 'produce-v2' : 'produce');
          assert.equal(produced.status, 0, produced.stderr);
          assert.equal(produced.signal, null);
        }
        const killPhase = `kill-${target}-${mode}-${boundary}`;
        const killed = run(root, killPhase);
        assert.equal(killed.status, null, killed.stderr);
        assert.equal(killed.signal, 'SIGKILL', killed.stderr);
        assert.match(killed.stdout, new RegExp(`DURABLE_PREFIX:${target}:${mode}:${boundary}`));
        const effectsFile = path.join(root, `durability-${target}-${mode}-${boundary}-effects.jsonl`);
        const prefix = fs.readFileSync(effectsFile);
        assert(prefix.length > 0);
        const killProof = JSON.parse(fs.readFileSync(path.join(root, `durability-${target}-${mode}-${boundary}-kill.json`), 'utf8'));
        assert.equal(killProof.signal, 'SIGKILL');
        assert.equal(killProof.request.payload.value?.schemaVersion,
          target === 'write' ? `delivery-manifest.${mode === 'v2' ? 'v2' : 'v3'}` : undefined);
        if (target === 'write') assert.equal(killProof.request.payload.encoding, mode === 'v3' ? 'kubeclaw-json.utf16.v1' : undefined);

        const replayPhase = `replay-${target}-${mode}-${boundary}`;
        const replayed = run(root, replayPhase);
        assert.equal(replayed.status, 0, replayed.stderr);
        assert.equal(replayed.signal, null);
        const after = fs.readFileSync(effectsFile);
        assert.deepEqual(after.subarray(0, prefix.length), prefix, 'replay must preserve exact durable prefix bytes');
        const proofName = `durability-${target}-${mode}-${boundary}-replay.json`;
        const proof = JSON.parse(fs.readFileSync(path.join(root, proofName), 'utf8'));
        assert.equal(proof.exactRequestRetained, true);
        assert.equal(proof.killedSignal, 'SIGKILL');
        assert.equal(proof.requestSchemaVersion, `delivery-manifest.${mode === 'v2' ? 'v2' : 'v3'}`);
        if (boundary === 'accepted') {
          assert.equal(proof.outcome, 'rejected');
          assert.match(proof.error, /EFFECT_RECOVERY_RECEIPT_UNAVAILABLE/);
          assert.equal(proof.adapterAcceptedCount, 0);
          assert.deepEqual(after, prefix, 'uncertain accepted prefix must issue no replacement effect');
        } else {
          assert.equal(proof.outcome, 'completed');
          assert.equal(proof.adapterAcceptedCount, boundary === 'requested' ? 1 : 0);
          if (boundary === 'completed') assert.deepEqual(after, prefix, 'completed replay must append no effect record');
        }
        transcript.push({ target, mode, boundary, killed: { status: killed.status, signal: killed.signal, stdout: killed.stdout, stderr: killed.stderr }, replay: proof,
          prefixBytes: prefix.length, afterBytes: after.length });
        if (retained) {
          fs.mkdirSync(retained, { recursive: true });
          fs.copyFileSync(path.join(root, `durability-${target}-${mode}-${boundary}-kill.json`), path.join(retained, `durability-${target}-${mode}-${boundary}-kill.json`));
          fs.copyFileSync(path.join(root, proofName), path.join(retained, proofName));
        }
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }
  }
  if (retained) fs.writeFileSync(path.join(retained, 'phase-transcript.json'), JSON.stringify({
    command: 'node --test tests/verification/reliability/delivery-manifest-v3-durability.test.mjs',
    durabilityTestDigest: sha256Text(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')),
    durabilityChildDigest: sha256Text(fs.readFileSync(child, 'utf8')),
    expectedOverallExit: 0, providerExecution: false, deploymentExecution: false, phases: transcript,
  }, null, 2) + '\n');
});
