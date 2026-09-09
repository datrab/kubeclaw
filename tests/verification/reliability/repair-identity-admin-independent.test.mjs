import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runPipelineV2, reopenBlockedPipelineV2 } from '../../../skills/nova/core/execution/engine.ts';
import { runRoot } from '../../../skills/nova/core/execution/run-root.ts';
import { FileJournal } from '../../../skills/nova/core/state/journal.ts';
import { recoverStageStates } from '../../../skills/nova/core/lifecycle/recovery.ts';
import { budgetFixture } from './repair-budget-fixture.mjs';

test('independent administrative repair projection binds the original authorized decision', async context => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-admin-review-'));
  try {
    const f = budgetFixture(root); const runId = 'run:admin-independent';
    f.definition.stages.find(stage => stage.id === 'lint').input.blockedVersions = [1];
    assert.equal((await runPipelineV2(f.platform, f.definition, runId)).status, 'blocked');
    const decision = { schemaVersion: 'administrative-reopen.v2', decisionId: 'decision:review', idempotencyKey: 'key:review',
      runId, stageId: 'lint', actor: { type: 'administrator', id: 'admin:test' }, reason: { code: 'test.repair' },
      continuation: 'remediation', remediationStageId: 'source', decidedAt: new Date().toISOString() };
    const final = await reopenBlockedPipelineV2(f.platform, f.definition, decision, value => value.actor);
    assert.equal(final.status, 'succeeded');
    const file = path.join(runRoot(f.platform.storageRoot, runId), 'events.jsonl');
    const events = new FileJournal(file).records().map(record => record.entry);
    const resumedIndex = events.findIndex(event => event.type === 'run.resumed' && event.payload.administrativeDecision);
    const projectionIndex = events.findIndex(event => event.type === 'stage.waiting' && event.payload.administrativeDecision);
    assert(resumedIndex > 0); assert(projectionIndex > resumedIndex);
    await context.test('real original blocked run reopens and final disk replay equals live result', () => {
      const states = recoverStageStates(f.definition, new FileJournal(file).records(), runId, 'nova');
      for (const [id, state] of final.stages) assert.deepEqual(states.get(id), state);
    });
    const mutations = [
      ['wrong stage', copy => { copy[projectionIndex].identity.stageId = 'review'; }],
      ['wrong run in decision', copy => { copy[projectionIndex].payload.administrativeDecision.runId = 'run:foreign'; }],
      ['wrong declared target', copy => { copy[projectionIndex].payload.remediationStageId = 'review'; }],
      ['wrong actual request target', copy => {
        const request = copy[projectionIndex].payload.repairRequest;
        request.targetStageId = 'review'; request.budgetOrder.request.targetStageId = 'review';
      }],
      ['wrong actual request source findings', copy => {
        const request = copy[projectionIndex].payload.repairRequest;
        request.requesterResult.reason.code = 'foreign.finding'; request.budgetOrder.request.requesterResult.reason.code = 'foreign.finding';
      }],
      ['duplicate administrative cause', copy => { copy.splice(resumedIndex + 1, 0, structuredClone(copy[resumedIndex])); }],
      ['duplicate administrative projection', copy => { copy.splice(projectionIndex + 1, 0, structuredClone(copy[projectionIndex])); }],
    ];
    let serial = 0;
    for (const [name, mutate] of mutations) await context.test(name, () => {
      const copy = structuredClone(events); mutate(copy);
      const target = path.join(root, `admin-negative-${serial++}.jsonl`); const journal = new FileJournal(target);
      for (const event of copy) journal.append(event);
      assert.throws(() => recoverStageStates(f.definition, journal.records(), runId, 'nova'), /^Error: REPAIR_/u);
    });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
