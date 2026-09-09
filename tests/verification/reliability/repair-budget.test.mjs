import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runPipelineV2, resumePipelineV2 } from '../../../skills/nova/core/execution/engine.ts';
import { runRoot } from '../../../skills/nova/core/execution/run-root.ts';
import { FileJournal } from '../../../skills/nova/core/state/journal.ts';
import { recoverStageStates } from '../../../skills/nova/core/lifecycle/recovery.ts';
import { budgetFixture } from './repair-budget-fixture.mjs';

const rootFor = () => fs.mkdtempSync(path.join(os.tmpdir(), 'repair-budget-'));
const eventsFor = (f, runId) => new FileJournal(path.join(runRoot(f.platform.storageRoot, runId), 'events.jsonl'));
const authorization = wait => ({ schemaVersion: 'resume-signal.v2', signalId: 'signal:extra', idempotencyKey: 'key:extra',
  waitId: wait.waitId, signalType: wait.signalType, issuer: wait.authorizedIssuer, issuedAt: new Date().toISOString(),
  payload: { repairAuthorization: { pendingDigest: wait.request.repairAuthorization.digest, reason: 'Reviewed all findings; authorize exactly one repair.' } } });
function assertReplay(f, runId, result) {
  const replay = recoverStageStates(f.definition, eventsFor(f, runId).records(), runId, 'nova');
  for (const [id, state] of result.stages) assert.deepEqual(replay.get(id), state, `replay matches ${id}`);
}

test('two orders per category survive all mandatory rechecks and original journal replay', async () => {
  const root = rootFor();
  try {
    const f = budgetFixture(root, { lint: [1, 2], review: [3, 4], test: [5, 6] }); const runId = 'run:categories';
    const result = await runPipelineV2(f.platform, f.definition, runId);
    assert.equal(result.status, 'succeeded');
    const orders = result.stages.get('source').repairLedger;
    assert.deepEqual(orders.map(order => order.category), ['lint', 'lint', 'review', 'review', 'test', 'test']);
    assert.equal(result.stages.get('source').attemptsUsed, 7, 'initial implementation is not a repair order');
    assert.equal(result.stages.get('lint').attemptsUsed, 7, 'cross-category lint rechecks remain mandatory and uncharged');
    assert.equal(result.stages.get('review').attemptsUsed, 5); assert.equal(result.stages.get('test').attemptsUsed, 3);
    for (const order of orders) {
      assert.equal(order.request.requesterResult.artifacts.length, 1);
      assert.match(order.sourceFacts['test.source_revision'], /^[a-f0-9]{40}$/);
    }
    assertReplay(f, runId, result);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

for (const furtherRepair of [false, true]) test(`one Nova order is exact and module-wide; later repair=${furtherRepair}`, async () => {
  const root = rootFor();
  try {
    const f = budgetFixture(root, { lint: [1, 2, 3], test: furtherRepair ? [4] : [] }); const runId = `run:extra:${furtherRepair}`;
    const paused = await runPipelineV2(f.platform, f.definition, runId);
    assert.equal(paused.status, 'waiting'); assert.equal(paused.stages.get('source').repairLedger.length, 2);
    const wait = paused.stages.get('lint').wait; const signal = authorization(wait);
    assert.equal(wait.request.repairAuthorization.history.length, 2);
    assert.equal(wait.request.repairAuthorization.request.requesterResult.reason.details.version, 3);
    const count = eventsFor(f, runId).records().length;
    const invalid = structuredClone(signal); invalid.payload.repairAuthorization.pendingDigest = `sha256:${'0'.repeat(64)}`;
    await assert.rejects(resumePipelineV2(f.platform, f.definition, runId, invalid), /REPAIR_AUTHORIZATION_INVALID/);
    assert.equal(eventsFor(f, runId).records().length, count, 'invalid authorization writes no lifecycle intent');
    assertReplay(f, runId, paused);
    const result = await resumePipelineV2(f.platform, f.definition, runId, signal);
    assert.equal(result.status, furtherRepair ? 'blocked' : 'succeeded');
    assert.equal(result.stages.get('source').attemptsUsed, 4);
    const ledger = result.stages.get('source').repairLedger;
    assert.equal(ledger.length, 3); assert.equal(ledger.filter(order => order.authorization).length, 1);
    assert.equal(ledger.at(-1).authorization.signalId, signal.signalId);
    assert.equal(result.stages.get('lint').attemptsUsed, 4, 'authorization starts repair directly, never reexecutes failed check first');
    if (furtherRepair) assert.equal(result.stages.get('test').pendingRepair.category, 'test', 'unused test allowance cannot bypass module-wide extra');
    assertReplay(f, runId, result);
    await assert.rejects(resumePipelineV2(f.platform, f.definition, runId, signal), /WAIT_RUN_TERMINAL|WAIT_UNKNOWN_OR_STALE/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

for (const stageId of ['source', 'test']) test(`failed ${stageId} after Nova order blocks with original evidence`, async () => {
  const root = rootFor();
  try {
    const f = budgetFixture(root, { lint: [1, 2, 3] }); const runId = `run:extra-failed:${stageId}`;
    f.definition.stages.find(stage => stage.id === stageId).input.failedVersions = [4];
    const paused = await runPipelineV2(f.platform, f.definition, runId);
    assert.equal(paused.status, 'waiting');
    const result = await resumePipelineV2(f.platform, f.definition, runId, authorization(paused.stages.get('lint').wait));
    assert.equal(result.status, 'blocked'); assert.equal(result.stages.get(stageId).status, 'blocked');
    assert.equal(result.stages.get('source').repairLedger.length, 3);
    const completion = eventsFor(f, runId).records().findLast(({ entry }) => entry.type === 'attempt.completed' && entry.identity.stageId === stageId).entry;
    assert.equal(completion.payload.result.outcome, 'failed');
    assert.equal(completion.payload.result.reason.code, 'test.failed');
    assert.equal(completion.payload.result.artifacts.length, 1);
    assertReplay(f, runId, result);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

for (const exhausted of [false, true]) test(`technical retry allowance remains separate; exhausted=${exhausted}`, async () => {
  const root = rootFor();
  try {
    const f = budgetFixture(root, {}, { source: exhausted ? [1, 2] : [1] }); const runId = `run:technical:${exhausted}`;
    const result = await runPipelineV2(f.platform, f.definition, runId);
    assert.equal(result.status, exhausted ? 'blocked' : 'succeeded');
    assert.equal(result.stages.get('source').attemptsUsed, 2);
    assert.equal(result.stages.get('source').technicalRetriesUsed, 1);
    assert.equal(result.stages.get('source').repairLedger, undefined);
    assertReplay(f, runId, result);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

for (const exhausted of [false, true]) test(`administrative repair uses the same category ledger; exhausted=${exhausted}`, async () => {
  const { reopenBlockedPipelineV2 } = await import('../../../skills/nova/core/execution/engine.ts');
  const root = rootFor();
  try {
    const f = budgetFixture(root, { lint: exhausted ? [1, 2] : [] }); const runId = `run:admin-budget:${exhausted}`;
    f.definition.stages.find(stage => stage.id === 'lint').input.blockedVersions = [exhausted ? 3 : 1];
    assert.equal((await runPipelineV2(f.platform, f.definition, runId)).status, 'blocked');
    const decision = { schemaVersion: 'administrative-reopen.v2', decisionId: 'decision:repair', idempotencyKey: 'key:repair',
      runId, stageId: 'lint', actor: { type: 'administrator', id: 'admin:test' }, reason: { code: 'test.repair' },
      continuation: 'remediation', remediationStageId: 'source', decidedAt: new Date().toISOString() };
    const count = eventsFor(f, runId).records().length;
    if (exhausted) {
      await assert.rejects(reopenBlockedPipelineV2(f.platform, f.definition, decision, value => value.actor), /ADMIN_REPAIR_BUDGET_EXHAUSTED/);
      assert.equal(eventsFor(f, runId).records().length, count);
    } else {
      const result = await reopenBlockedPipelineV2(f.platform, f.definition, decision, value => value.actor);
      assert.equal(result.status, 'succeeded'); assert.equal(result.stages.get('source').repairLedger.length, 1);
      assert.equal(result.stages.get('source').repairLedger[0].request.requesterResult.outcome, 'blocked');
      assertReplay(f, runId, result);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
