import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { runPipelineV2, resumePipelineV2, recoverPipelineV2, reopenBlockedPipelineV2 } from '../../../skills/nova/core/execution/engine.ts';
import { runRoot } from '../../../skills/nova/core/execution/run-root.ts';
import { FileJournal } from '../../../skills/nova/core/state/journal.ts';
import { recoverStageStates } from '../../../skills/nova/core/lifecycle/recovery.ts';
import { budgetFixture } from './repair-budget-fixture.mjs';

function restoreDirectory(source, destination) {
  fs.rmSync(destination, { recursive: true, force: true }); fs.cpSync(source, destination, { recursive: true });
}

test('administrative decision crash prefixes preserve exactly one category debit', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-admin-prefix-'));
  const backup = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-admin-backup-'));
  try {
    const f = budgetFixture(root); const runId = 'run:admin-prefix';
    f.definition.stages.find(stage => stage.id === 'lint').input.blockedVersions = [1];
    const blocked = await runPipelineV2(f.platform, f.definition, runId); assert.equal(blocked.status, 'blocked');
    const currentRun = runRoot(f.platform.storageRoot, runId);
    fs.cpSync(currentRun, path.join(backup, 'run'), { recursive: true });
    fs.cpSync(path.join(root, 'artifacts'), path.join(backup, 'artifacts'), { recursive: true });
    const decision = { schemaVersion: 'administrative-reopen.v2', decisionId: 'decision:repair', idempotencyKey: 'key:repair',
      runId, stageId: 'lint', actor: { type: 'administrator', id: 'admin:test' }, reason: { code: 'test.repair' },
      continuation: 'remediation', remediationStageId: 'source', decidedAt: new Date().toISOString() };
    assert.equal((await reopenBlockedPipelineV2(f.platform, f.definition, decision, value => value.actor)).status, 'succeeded');
    const decisions = fs.readFileSync(path.join(currentRun, 'administrative-decisions.jsonl'));
    const lines = fs.readFileSync(path.join(currentRun, 'events.jsonl'), 'utf8').trimEnd().split('\n');
    const scheduled = lines.findIndex(line => {
      const event = JSON.parse(line).entry;
      return event.type === 'stage.waiting' && event.causationId === decision.decisionId;
    }); assert(scheduled > 0);
    for (const projected of [false, true]) {
      restoreDirectory(path.join(backup, 'run'), currentRun);
      restoreDirectory(path.join(backup, 'artifacts'), path.join(root, 'artifacts'));
      execFileSync('git', ['-C', f.repository, 'reset', '--hard', blocked.stages.get('source').facts['test.source_revision']]);
      fs.writeFileSync(path.join(currentRun, 'administrative-decisions.jsonl'), decisions);
      if (projected) fs.writeFileSync(path.join(currentRun, 'events.jsonl'), `${lines.slice(0, scheduled + 1).join('\n')}\n`);
      const result = await reopenBlockedPipelineV2(f.platform, f.definition, decision, value => value.actor);
      assert.equal(result.status, 'succeeded'); assert.equal(result.stages.get('source').attemptsUsed, 2);
      assert.equal(result.stages.get('source').repairLedger.length, 1);
      const replay = recoverStageStates(f.definition, new FileJournal(path.join(currentRun, 'events.jsonl')).records(), runId, 'nova');
      for (const [id, state] of result.stages) assert.deepEqual(replay.get(id), state);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(backup, { recursive: true, force: true }); }
});

test('original completion and repair-intent crash prefixes debit each category order once', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-prefix-'));
  try {
    const f = budgetFixture(root, { lint: [1, 2], review: [3, 4], test: [5, 6] }); const runId = 'run:prefix';
    assert.equal((await runPipelineV2(f.platform, f.definition, runId)).status, 'succeeded');
    const source = path.join(runRoot(f.platform.storageRoot, runId), 'events.jsonl');
    const lines = fs.readFileSync(source, 'utf8').trimEnd().split('\n'); let orders = 0; let checked = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const event = JSON.parse(lines[index]).entry;
      if (event.type === 'attempt.completed' && event.payload.result.outcome === 'request_fix') orders += 1;
      if (!(event.type === 'attempt.completed' && event.payload.result.outcome === 'request_fix') && !(event.type === 'stage.waiting' && event.payload.repairRequest)) continue;
      const file = path.join(root, `prefix-${index}.jsonl`); fs.writeFileSync(file, `${lines.slice(0, index + 1).join('\n')}\n`);
      const records = new FileJournal(file).records();
      const first = recoverStageStates(f.definition, records, runId, 'nova');
      const second = recoverStageStates(f.definition, records, runId, 'nova');
      assert.equal(first.get('source').repairLedger.length, orders);
      assert.deepEqual(first.get('source'), second.get('source'));
      assert.equal(first.get('source').status, 'pending'); checked += 1;
    }
    assert.equal(checked, 12);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('restart before and after durable Nova signal projection schedules exactly one repair', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-grant-prefix-'));
  const backup = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-grant-backup-'));
  try {
    const f = budgetFixture(root, { lint: [1, 2, 3] }); const runId = 'run:grant-prefix';
    const paused = await runPipelineV2(f.platform, f.definition, runId); assert.equal(paused.status, 'waiting');
    const currentRun = runRoot(f.platform.storageRoot, runId); const wait = paused.stages.get('lint').wait;
    fs.cpSync(currentRun, path.join(backup, 'run'), { recursive: true }); fs.cpSync(path.join(root, 'artifacts'), path.join(backup, 'artifacts'), { recursive: true });
    const sourceRevision = paused.stages.get('source').facts['test.source_revision'];
    const signal = { schemaVersion: 'resume-signal.v2', signalId: 'signal:one', idempotencyKey: 'key:one',
      waitId: wait.waitId, signalType: wait.signalType, issuer: wait.authorizedIssuer, issuedAt: new Date().toISOString(),
      payload: { repairAuthorization: { pendingDigest: wait.request.repairAuthorization.digest, reason: 'One reviewed repair order.' } } };
    assert.equal((await resumePipelineV2(f.platform, f.definition, runId, signal)).status, 'succeeded');
    const lines = fs.readFileSync(path.join(currentRun, 'events.jsonl'), 'utf8').trimEnd().split('\n');
    const resolved = lines.findIndex(line => JSON.parse(line).entry.type === 'wait.resolved'); assert(resolved > 0);
    const signals = fs.readFileSync(path.join(currentRun, 'signals.jsonl'));
    for (const projected of [false, true]) {
      restoreDirectory(path.join(backup, 'run'), currentRun); restoreDirectory(path.join(backup, 'artifacts'), path.join(root, 'artifacts'));
      execFileSync('git', ['-C', f.repository, 'reset', '--hard', sourceRevision]);
      fs.writeFileSync(path.join(currentRun, 'signals.jsonl'), signals);
      if (projected) fs.writeFileSync(path.join(currentRun, 'events.jsonl'), `${lines.slice(0, resolved + 1).join('\n')}\n`);
      const replay = recoverStageStates(f.definition, new FileJournal(path.join(currentRun, 'events.jsonl')).records(), runId, 'nova');
      assert.equal(replay.get('source').repairLedger.length, projected ? 3 : 2);
      assert.equal(replay.get('source').status, projected ? 'pending' : 'succeeded');
      const result = projected ? await recoverPipelineV2(f.platform, f.definition, runId) : await resumePipelineV2(f.platform, f.definition, runId, signal);
      assert.equal(result.status, 'succeeded'); assert.equal(result.stages.get('source').attemptsUsed, 4);
      assert.equal(result.stages.get('source').repairLedger.length, 3);
      assert.equal(result.stages.get('source').repairLedger.filter(order => order.authorization).length, 1);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(backup, { recursive: true, force: true }); }
});
