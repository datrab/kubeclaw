import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runPipelineV2, reopenBlockedPipelineV2 } from '../../../skills/nova/core/execution/engine.ts';
import { runRoot } from '../../../skills/nova/core/execution/run-root.ts';
import { FileJournal } from '../../../skills/nova/core/state/journal.ts';
import { recoverStageStates } from '../../../skills/nova/core/lifecycle/recovery.ts';

const execution = { maxAttempts: 10, maxRemediationCycles: 2, timeoutMs: 5000 };
const stage = (id, dependsOn = [], overrides = {}) => ({ id, type: 'test.generic', dependsOn, config: {}, input: { mode: 'passed' }, execution, ...overrides });
const definition = { schemaVersion: 'pipeline-definition.v2', id: 'test:admin-transitive', maxConcurrency: 1, stages: [
  stage('source'), stage('review', ['source']), stage('approval', ['review']), stage('sibling', ['source']),
  stage('gate', ['approval', 'sibling'], { input: { mode: 'blocked_then_pass' }, on: { request_fix: 'source' } }),
] };
function platform(root) {
  const fixture = path.resolve('tests/fixtures/plugin-system-v2');
  return { schemaVersion: 'pipeline-platform.v2', installationRoots: [fixture], trustedBuiltinRoots: [fixture],
    externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} }, providers: {}, grants: {}, adapters: {}, activeAdapters: [], observers: {},
    storageRoot: path.join(root, 'state'), shutdownTimeoutMs: 5000, orchestratorIssuerId: 'nova',
    administrativeDecisionIssuers: [{ type: 'administrator', id: 'admin:test' }] };
}
const authorization = runId => ({ schemaVersion: 'administrative-reopen.v2', decisionId: 'decision:repair', idempotencyKey: 'key:repair',
  runId, stageId: 'gate', actor: { type: 'administrator', id: 'admin:test' }, reason: { code: 'test.authorized_repair' },
  continuation: 'remediation', remediationStageId: 'source', decidedAt: '2026-09-09T01:00:00.000Z' });

test('authorized ancestor repair reruns every original graph approval and sibling gate', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-transitive-'));
  try {
    const config = platform(root); const runId = 'run:admin-transitive';
    assert.equal((await runPipelineV2(config, definition, runId)).status, 'blocked');
    const decision = authorization(runId);
    const result = await reopenBlockedPipelineV2(config, definition, decision, value => value.actor);
    assert.equal(result.status, 'succeeded');
    for (const id of ['source', 'review', 'approval', 'sibling', 'gate']) assert.equal(result.stages.get(id).attemptsUsed, 2, `${id} must rerun after source repair`);
    const journal = new FileJournal(path.join(runRoot(config.storageRoot, runId), 'events.jsonl'));
    const records = journal.records();
    const intent = records.find(({ entry }) => entry.type === 'stage.waiting' && entry.payload.repairRequest)?.entry;
    assert.ok(intent); assert.deepEqual(intent.payload.repairRequest.invalidatedStageIds, ['approval', 'gate', 'review', 'sibling']);
    assert.equal(intent.payload.repairRequest.requesterResult.reason.code, 'test.administrative_review_required');
    const replay = recoverStageStates(definition, records, runId, 'nova');
    for (const [id, state] of result.stages) assert.deepEqual(replay.get(id), state);
    const count = records.length;
    assert.equal((await reopenBlockedPipelineV2(config, definition, decision, value => value.actor)).status, 'succeeded');
    assert.equal(journal.records().length, count, 'completed administrative decision replay is idempotent');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

for (const rejected of [false, true]) {
  test(`real Git, architecture artifact and operator wait are renewed after ${rejected ? 'rejection' : 'earlier approval'}`, async () => {
    const { approvalFixture } = await import('./admin-approval-fixture.mjs');
    const { resumePipelineV2 } = await import('../../../skills/nova/core/execution/engine.ts');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-approval-'));
    const fixture = await approvalFixture(root, rejected);
    const runId = `run:admin-approval:${rejected}`;
    const resolve = (wait, decision, suffix) => ({ schemaVersion: 'resume-signal.v2', signalId: `signal:${suffix}`, idempotencyKey: `signal-key:${suffix}`,
      waitId: wait.waitId, signalType: wait.signalType, issuer: wait.authorizedIssuer, issuedAt: new Date().toISOString(),
      payload: { decision, issuer: wait.authorizedIssuer, reason: 'Reviewed the supplied architecture evidence.' } });
    try {
      const invalid = structuredClone(fixture.definition); invalid.stages.find(stage => stage.id === 'approval').config.agentRole = 'nova';
      await assert.rejects(runPipelineV2(fixture.platform, invalid, `${runId}:invalid`), /Value failed schema/u);
      assert.equal(fixture.messages.length, 0, 'unsupported approval config rejects before capabilities');
      const first = await runPipelineV2(fixture.platform, fixture.definition, runId);
      assert.equal(first.status, 'waiting');
      const originalRevision = first.stages.get('source').facts['test.source_revision'];
      const originalWait = first.stages.get('approval').wait;
      const oldSignal = resolve(originalWait, rejected ? 'rejected' : 'approved', 'original');
      const blocked = await resumePipelineV2(fixture.platform, fixture.definition, runId, oldSignal);
      assert.equal(blocked.status, 'blocked');
      const decision = { ...authorization(runId), stageId: rejected ? 'approval' : 'gate' };
      const rerun = await reopenBlockedPipelineV2(fixture.platform, fixture.definition, decision, value => value.actor);
      assert.equal(rerun.status, 'waiting', 'repair must request a fresh operator decision');
      const revision = rerun.stages.get('source').facts['test.source_revision'];
      assert.notEqual(revision, originalRevision);
      assert.equal(rerun.stages.get('review').facts['test.source_revision'], revision);
      assert.equal(rerun.stages.get('sibling').facts['test.source_revision'], revision);
      const wait = rerun.stages.get('approval').wait;
      assert.notEqual(wait.waitId, originalWait.waitId); assert.equal(fixture.messages.length, 2);
      await assert.rejects(resumePipelineV2(fixture.platform, fixture.definition, runId, oldSignal), /WAIT_UNKNOWN_OR_STALE|WAIT_ALREADY_RESOLVED/u);
      const final = await resumePipelineV2(fixture.platform, fixture.definition, runId, resolve(wait, 'approved', 'new'));
      assert.equal(final.status, 'succeeded');
      assert.equal(final.stages.get(decision.stageId).remediationCyclesUsed, 1);
      const events = new FileJournal(path.join(runRoot(fixture.platform.storageRoot, runId), 'events.jsonl')).records();
      const intent = events.find(({ entry }) => entry.type === 'stage.waiting' && entry.payload.repairRequest).entry.payload.repairRequest;
      assert.equal(intent.requesterResult.outcome, 'blocked');
      assert.equal(intent.requesterResult.reason.code, rejected ? 'approval.rejected' : 'test.administrative_review_required');
    } finally { await fixture.close(); fs.rmSync(root, { recursive: true, force: true }); }
  });
}

test('administrative journal and repair projection crash prefixes converge without stale gates', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-repair-prefix-'));
  try {
    const config = platform(root); const runId = 'run:admin-prefix'; const decision = authorization(runId);
    await runPipelineV2(config, definition, runId);
    const directory = runRoot(config.storageRoot, runId); const file = path.join(directory, 'events.jsonl');
    const initialLength = new FileJournal(file).records().length;
    await reopenBlockedPipelineV2(config, definition, decision, value => value.actor);
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n'); const entries = lines.map(line => JSON.parse(line).entry);
    const intent = entries.findIndex(event => event.type === 'stage.waiting' && event.payload.repairRequest);
    const repairCompleted = entries.findIndex((event, index) => index > intent && event.type === 'attempt.completed' && event.identity.stageId === 'source');
    const repairSucceeded = entries.findIndex((event, index) => index > repairCompleted && event.type === 'stage.succeeded' && event.identity.stageId === 'source');
    const resumed = entries.findIndex(event => event.type === 'run.resumed');
    for (const prefix of [initialLength - 1, resumed, intent, repairCompleted, repairSucceeded]) {
      const branch = path.join(root, `prefix-${prefix}`); const branchConfig = platform(branch);
      const copied = runRoot(branchConfig.storageRoot, runId); fs.mkdirSync(path.dirname(copied), { recursive: true });
      fs.cpSync(directory, copied, { recursive: true });
      fs.writeFileSync(path.join(copied, 'events.jsonl'), `${lines.slice(0, prefix + 1).join('\n')}\n`);
      const recovered = recoverStageStates(definition, new FileJournal(path.join(copied, 'events.jsonl')).records(), runId, 'nova');
      if (prefix >= intent) for (const id of ['review', 'approval', 'sibling']) {
        assert.equal(recovered.get(id).status, 'pending'); assert.equal(recovered.get(id).facts, undefined); assert.equal(recovered.get(id).continuationGuidance, undefined);
      }
      const result = await reopenBlockedPipelineV2(branchConfig, definition, decision, value => value.actor);
      assert.equal(result.status, 'succeeded', `prefix ${prefix}`);
      for (const id of ['review', 'approval', 'sibling']) assert.equal(result.stages.get(id).attemptsUsed, 2, `${id} at prefix ${prefix}`);
      assert.equal(result.stages.get('gate').remediationCyclesUsed, 1);
      const projected = new FileJournal(path.join(copied, 'events.jsonl')).records();
      assert.equal(projected.filter(({ entry }) => entry.type === 'stage.waiting' && entry.payload.repairRequest).length, 1);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
