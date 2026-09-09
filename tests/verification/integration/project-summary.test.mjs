import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';
import { activate } from '../../../skills/common/plugins/artifact-store/src/adapter.ts';
import { buildSummary } from '../../../skills/nova/plugins/project-summary/src/summary.ts';

// Artifact-contract verification: these stored report fixtures do not execute providers or agents.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-evidence-'));
const adapter = activate({ config: { artifactRoot: root } });
const runId = 'delivery:run';
const revision = 'a'.repeat(40);
let sequence = 0;
const artifacts = [];
const invoke = (capability, request, stageId = 'summary') => adapter.invoke({ confidential: true,
  signal: new AbortController().signal, request: { ...request, capability, idempotencyKey: `artifact:${++sequence}`,
    attempt: { runId, stageId, attemptId: `${stageId}:1`, attemptNumber: 1 } } });
async function put(stageId, namespace, artifactId, value) {
  const response = await invoke('artifacts.write', { operation: 'put_json', resource: { type: 'artifact.object', canonicalId: artifactId },
    payload: { namespace, mediaType: 'application/json', value } }, stageId);
  artifacts.push(response.artifact);
  return response.artifact;
}
const context = refs => ({ contract: { artifacts: refs, lease: { attempt: { runId } } }, invoke });
const input = { projectId: 'app', modules: [{ moduleId: 'app', sourceStageId: 'forge', testStageId: 'test' }],
  final: { sourceStageId: 'forge', testStageId: 'test', lintStageId: 'lint', reviewStageId: 'review' } };
try {
  await adapter.ready();
  await put('forge', 'kubeclaw.implementation-agent', 'implementation:app', { status: 'ready_for_testing', sourceRevision: revision });
  await put('lint', 'kubeclaw.lint', 'lint:full:app', { sourceRevision: revision, summary: { tools_failed: 0, total_blocking: 0 } });
  await put('review', 'kubeclaw.review', 'review-report:app', { revision: { head: revision }, outcome: 'passed' });
  const unsigned = { schemaVersion: 'test-gate-decision.v1', runId, state: 'passed', jobId: 'job:contract', planId: 'plan:contract', resultDigest: sha256Text('stored-result'), reviews: [], nodes: [{ nodeId: 'unit', kind: 'test', mode: 'blocking', effect: 'passed', reason: 'Artifact contract fixture.' }] };
  const decisionDigest = sha256Text(canonicalJson(unsigned));
  await put('test', 'kubeclaw.buster-quality-gate', 'buster-quality:app:decision:1', { ...unsigned, decisionDigest });
  const quality = await put('test', 'kubeclaw.buster-quality-gate', 'buster-quality:app:1', { sourceRevision: revision, verdict: { outcome: 'passed' }, decisionDigest });
  const manifest = await buildSummary(input, context(artifacts));
  assert.equal(manifest.sourceRevision, revision);
  assert.equal(manifest.runId, runId);
  assert.equal(manifest.schemaVersion, 'delivery-manifest.v1');
  assert.equal(manifest.metrics, undefined);
  await assert.rejects(() => buildSummary(input, context([])), /MISSING_OR_AMBIGUOUS/);
  await assert.rejects(() => buildSummary(input, context(artifacts.map(ref => ref === quality ? { ...ref, sizeBytes: ref.sizeBytes + 1 } : ref))), /CORRUPT/);
  await assert.rejects(() => buildSummary(input, context(artifacts.map(ref => ({ ...ref, producer: { ...ref.producer, runId: 'other:run' } })))), /MISSING_OR_AMBIGUOUS/);
  artifacts.splice(artifacts.indexOf(quality), 1);
  await put('test', 'kubeclaw.buster-quality-gate', 'buster-quality:app:1', { sourceRevision: 'b'.repeat(40), verdict: { outcome: 'passed' }, decisionDigest });
  await assert.rejects(() => buildSummary(input, context(artifacts)), /CANDIDATE_MISMATCH/);
} finally { await adapter.shutdown(); fs.rmSync(root, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, suite: 'delivery-artifact-contract', providerExecution: false, agentExecution: false }));
