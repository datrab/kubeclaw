import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FileJournal } from '../../../skills/nova/core/state/journal.ts';
import { recoverStageStates } from '../../../skills/nova/core/lifecycle/recovery.ts';
import { initialStageStates } from '../../../skills/nova/core/lifecycle/recovery-state.ts';
import { applyStageResult } from '../../../skills/nova/core/lifecycle/reducer.ts';
import { DecisionRecorder } from '../../../skills/nova/core/execution/run-decisions.ts';
import { ExecutionGraph } from '../../../skills/nova/core/execution/graph.ts';
import { ArtifactCheckpointRecorder } from '../../../skills/nova/core/execution/artifact-checkpoints.ts';
import { validateSignal } from '../../../skills/nova/core/execution/engine-snapshots.ts';
import type { LifecycleEvent, PipelineDefinition, StageResult } from '@kubeclaw/plugin-sdk';

const definition: PipelineDefinition = { schemaVersion: 'pipeline-definition.v2', id: 'reliability', maxConcurrency: 1,
  stages: ['forge', 'lint', 'echo', 'buster'].map((id, index, ids) => ({ id, type: `test.${id}`, dependsOn: index ? [ids[index - 1]] : [],
    config: {}, input: {}, execution: { maxAttempts: 8, maxRemediationCycles: 3, timeoutMs: 1000 },
    ...(index ? { on: { request_fix: 'forge' } } : {}) })) };
function journalAt(root: string) { return new FileJournal<LifecycleEvent>(path.join(root, 'events.jsonl')); }
function appendTo(journal: FileJournal<LifecycleEvent>) {
  return (type: LifecycleEvent['type'], identity: LifecycleEvent['identity'], payload = {}) => {
    let event!: LifecycleEvent;
    journal.appendSequenced((sequence) => event = { schemaVersion: 'lifecycle-event.v2', eventId: `event:${sequence}`, sequence,
      type, identity, payload, occurredAt: new Date().toISOString(), causationId: null });
    return event;
  };
}

test('repair through the real recorder and journal reruns lint before Echo and Buster', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-journal-'));
  try {
    const journal = journalAt(root), append = appendTo(journal), graph = ExecutionGraph.fromDefinition(definition);
    const states = initialStageStates(definition);
    for (const id of ['forge', 'lint']) {
      states.set(id, { ...states.get(id)!, status: 'succeeded', attemptNumber: 1, attemptsUsed: 1, facts: { source: 'old' } });
      append('stage.succeeded', { runId: 'run:repair', stageId: id }, { attemptsUsed: 1, remediationCyclesUsed: 0, facts: { source: 'old' } });
    }
    const result: StageResult = { schemaVersion: 'stage-result.v2', outcome: 'request_fix', artifacts: [],
      reason: { code: 'echo.defect', message: 'Boundary error', details: { findings: [{ file: 'service.ts', fix: 'Reject invalid input' }] } } };
    const decision = applyStageResult(definition.stages[2], { ...states.get('echo')!, status: 'running' }, result);
    const forced: string[] = [];
    const recorder = new DecisionRecorder(states, append, 'nova', id => forced.push(id), new ArtifactCheckpointRecorder(journal, append), graph);
    recorder.record('run:repair', { definition: definition.stages[2], decision: { ...decision, result }, administrativeOverride: false });
    assert.deepEqual(forced, ['forge']);
    assert.equal(states.get('lint')!.status, 'pending');
    assert.equal(states.get('lint')!.facts, undefined);
    const recovered = new Map(recoverStageStates(definition, journalAt(root).records(), 'run:repair', 'nova'));
    assert.deepEqual(recovered.get('forge')!.continuationGuidance, states.get('forge')!.continuationGuidance);
    assert.match(JSON.stringify(recovered.get('forge')!.continuationGuidance), /Reject invalid input/);
    const passed: StageResult = { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [] };
    const repaired = applyStageResult(definition.stages[0], { ...states.get('forge')!, status: 'running' }, passed);
    recorder.record('run:repair', { definition: definition.stages[0], decision: { ...repaired, result: passed }, administrativeOverride: false });
    const completed = new Set([...states].filter(([, state]) => state.status === 'succeeded').map(([id]) => id));
    assert.deepEqual(graph.ready(completed, new Set()).map((stage) => stage.id), ['lint']);
    assert.equal(states.get('echo')!.status, 'pending');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('SIGKILL after durable wait resolution preserves the exact approved continuation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'approval-kill-'));
  try {
    const wait = { schemaVersion: 'wait-request.v2' as const, waitId: 'wait:design', kind: 'signal' as const, signalType: 'prism.approval.resolved', authorizedIssuer: { type: 'operator' as const, id: 'operator:owner' }, expiresAt: null };
    const createdAt = new Date().toISOString();
    const signal = { schemaVersion: 'resume-signal.v2' as const, signalId: 'signal:approval', idempotencyKey: 'approval:chosen', waitId: wait.waitId, signalType: wait.signalType, issuer: wait.authorizedIssuer, issuedAt: createdAt, payload: { decision: 'approved', approvalId: 'approval:chosen', bundleDigest: 'sha256:' + 'a'.repeat(64) } };
    validateSignal(wait, signal, createdAt);
    appendTo(journalAt(root))('stage.waiting', { runId: 'run:approval', stageId: 'forge', waitId: wait.waitId }, { wait });
    const module = new URL('../../../skills/nova/core/state/journal.ts', import.meta.url).href;
    const code = `import { FileJournal } from ${JSON.stringify(module)};
      const journal = new FileJournal(${JSON.stringify(path.join(root, 'events.jsonl'))});
      const signal = ${JSON.stringify(signal)};
      journal.appendSequenced(sequence => ({schemaVersion:'lifecycle-event.v2',eventId:'event:resolved',sequence,type:'wait.resolved',identity:{runId:'run:approval',stageId:'forge',waitId:signal.waitId},payload:{signal},occurredAt:new Date().toISOString(),causationId:null}));
      process.kill(process.pid, 'SIGKILL');`;
    const killed = spawnSync(process.execPath, ['--input-type=module', '-e', code]);
    assert.equal(killed.signal, 'SIGKILL');
    const recovered = recoverStageStates(definition, journalAt(root).records(), 'run:approval', 'nova');
    assert.deepEqual(recovered.get('forge')!.continuationGuidance, signal.payload);
    assert.equal(recovered.get('forge')!.status, 'pending');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
