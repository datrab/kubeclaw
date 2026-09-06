import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseGateDecision, gateDecisionStageResult, remotePlanDigest, type GateDecisionV1 } from '@kubeclaw/pipeline-test-gate-contract';
import { validateContractValue } from '@kubeclaw/plugin-foundation/registry/schema';
import { graphSnapshot, readRunSnapshot, writeRunSnapshots } from '../../../skills/nova/core/execution/engine-snapshots.ts';

const digest = 'sha256:' + 'a'.repeat(64);
test('native terminal decisions retain their distinct dispositions and reject altered evidence', () => {
  for (const [state, outcome] of [['passed', 'passed'], ['failed', 'request_fix'], ['execution_error', 'blocked'], ['review_required', 'blocked'], ['cancelled', 'cancelled']] as const) {
    const unsigned = { schemaVersion: 'test-gate-decision.v1' as const, jobId: 'job:one', planId: 'plan:one', runId: 'run:one', state,
      nodes: [{ nodeId: 'check', kind: 'test' as const, mode: 'blocking' as const, effect: state === 'cancelled' ? 'execution_error' as const : state, reason: 'recorded outcome' }],
      reviews: state === 'review_required' ? [{ schemaVersion: 'agent-evidence-review-request.v1' as const, agent: 'buster', planId: 'plan:one', runId: 'run:one', nodeId: 'check', attemptId: 'attempt:one', evidenceDigests: [digest] }] : [], resultDigest: state === 'cancelled' ? null : digest };
    const decision: GateDecisionV1 = { ...unsigned, decisionDigest: remotePlanDigest(unsigned) };
    const stageResult = gateDecisionStageResult(parseGateDecision(decision));
    validateContractValue('stageResult', stageResult);
    assert.equal(stageResult.outcome, outcome);
    assert.throws(() => parseGateDecision({ ...decision, jobId: 'job:other' }), /DIGEST_MISMATCH/);
    if (state === 'failed') {
      const contradiction = { ...unsigned, state: 'passed' as const };
      assert.throws(() => parseGateDecision({ ...contradiction, decisionDigest: remotePlanDigest(contradiction) }), /CONTRADICTION/);
    }
  }
});

test('snapshot publication survives process death as a complete set and rejects overwrite or corruption', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-kill-'));
  try {
    const graph = graphSnapshot({ schemaVersion: 'pipeline-definition.v2', id: 'snapshot', maxConcurrency: 1, stages: [{ id: 'one', type: 'test.one', dependsOn: [], config: {}, input: {}, execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 1000 } }] });
    const registry = { packages: [], configuration: { providers: { 'runtime.dispatch': 'provider:original' } } };
    const module = new URL('../../../skills/nova/core/execution/engine-snapshots.ts', import.meta.url).href;
    const code = `import { writeRunSnapshots } from ${JSON.stringify(module)};
      writeRunSnapshots(${JSON.stringify(root)}, ${JSON.stringify(graph)}, ${JSON.stringify(registry)});
      process.kill(process.pid, 'SIGKILL');`;
    const killed = spawnSync(process.execPath, ['--input-type=module', '-e', code]);
    assert.equal(killed.signal, 'SIGKILL', killed.stderr.toString());
    const saved = readRunSnapshot(root);
    assert.deepEqual(saved.graph, graph); assert.deepEqual(saved.registry, registry);
    assert.throws(() => writeRunSnapshots(root, graph, registry), /RUN_ALREADY_EXISTS/);
    fs.writeFileSync(path.join(root, 'run-snapshot.json'), JSON.stringify({ ...saved, registry: { ...registry, configuration: {} } }));
    assert.throws(() => readRunSnapshot(root), /INTEGRITY_INVALID/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
