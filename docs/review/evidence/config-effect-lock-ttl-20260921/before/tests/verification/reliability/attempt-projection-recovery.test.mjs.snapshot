import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runPipelineV2, recoverPipelineV2, resumePipelineV2 } from '../../../skills/nova/core/execution/engine.ts';
import { runRoot } from '../../../skills/nova/core/execution/run-root.ts';
import { recoverStageStates } from '../../../skills/nova/core/lifecycle/recovery.ts';
import { FileJournal } from '../../../skills/nova/core/state/journal.ts';

function platform(root, production = false) {
  const roots = [path.resolve('tests/fixtures/plugin-system-v2'), ...(production ? [path.resolve('skills/common/plugins'), path.resolve('skills/nova/plugins')] : [])];
  return { schemaVersion: 'pipeline-platform.v2', installationRoots: roots, trustedBuiltinRoots: roots,
    externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} }, providers: {}, grants: {}, adapters: {},
    activeAdapters: [], observers: {}, storageRoot: path.join(root, 'state'), shutdownTimeoutMs: 5000,
    orchestratorIssuerId: 'nova', administrativeDecisionIssuers: [] };
}
function eventFile(config, runId) { return path.join(runRoot(config.storageRoot, runId), 'events.jsonl'); }
function lines(file) { return fs.readFileSync(file, 'utf8').trim().split('\n'); }
function entries(file) { return lines(file).map((line) => JSON.parse(line).entry); }
function truncate(file, original, index) { fs.writeFileSync(file, `${original.slice(0, index + 1).join('\n')}\n`); }
const execution = { maxAttempts: 3, maxRemediationCycles: 0, timeoutMs: 5000 };

for (const mode of ['orchestrator_required', 'wait', 'retry']) {
  test(`completed ${mode} wait resumes at every original completion/projection prefix`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'attempt-wait-projection-'));
    try {
      const config = platform(root);
      const definition = { schemaVersion: 'pipeline-definition.v2', id: `test:projection:${mode}`, maxConcurrency: 1, stages: [{
        id: 'review', type: mode === 'orchestrator_required' ? 'test.resume' : 'test.recovery.wait', dependsOn: [],
        config: mode === 'orchestrator_required' ? {} : { mode }, input: {},
        execution: { ...execution, ...(mode === 'retry' ? { orchestratorAfterAttempt: 1 } : {}) },
      }] };
      const runId = `run:projection:${mode}`;
      const first = await runPipelineV2(config, definition, runId);
      assert.equal(first.status, 'waiting');
      const file = eventFile(config, runId), original = lines(file);
      const completed = original.findIndex((line) => JSON.parse(line).entry.type === 'attempt.completed');
      assert.ok(completed >= 0);
      for (let index = completed; index < original.length; index++) {
        truncate(file, original, index);
        fs.rmSync(path.join(runRoot(config.storageRoot, runId), 'signals.jsonl'), { force: true });
        const wait = recoverStageStates(definition, new FileJournal(file).records(), runId, 'nova').get('review').wait;
        assert.deepEqual(wait, first.stages.get('review').wait, 'live and recovered wait identity must match');
        await assert.rejects(recoverPipelineV2(config, definition, runId), /RECOVERY_SIGNAL_REQUIRED/);
        const signal = { schemaVersion: 'resume-signal.v2', signalId: `signal:${mode}:${index}`, idempotencyKey: `key:${mode}:${index}`,
          waitId: wait.waitId, signalType: wait.signalType, issuer: wait.authorizedIssuer, issuedAt: new Date().toISOString(), payload: { approved: true } };
        await assert.rejects(resumePipelineV2(config, definition, runId, { ...signal, issuer: { ...signal.issuer, id: 'wrong' } }), /WAIT_ISSUER_DENIED/);
        await assert.rejects(resumePipelineV2(config, definition, runId, { ...signal, signalType: 'test.wrong' }), /WAIT_SIGNAL_TYPE_MISMATCH/);
        await assert.rejects(resumePipelineV2(config, definition, runId, { ...signal, issuedAt: '2000-01-01T00:00:00Z' }), /WAIT_SIGNAL_STALE/);
        const result = await resumePipelineV2(config, definition, runId, signal);
        assert.equal(result.status, 'succeeded');
        assert.equal(result.stages.get('review').attemptsUsed, 2);
        assert.equal(entries(file).filter((event) => event.type === 'attempt.completed').length, 2);
        assert.equal(entries(file).filter((event) => event.type === 'wait.resolved').length, 1);
        await assert.rejects(resumePipelineV2(config, definition, runId, signal), /WAIT_RUN_TERMINAL|WAIT_ALREADY_RESOLVED|WAIT_UNKNOWN_OR_STALE/);
      }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}

test('expired explicit wait remains rejected when only completion is durable', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'attempt-expired-wait-'));
  try {
    const config = platform(root), runId = 'run:expired-wait';
    const definition = { schemaVersion: 'pipeline-definition.v2', id: 'test:expired-wait', maxConcurrency: 1,
      stages: [{ id: 'review', type: 'test.recovery.wait', dependsOn: [], config: { mode: 'wait', expiresAt: '2000-01-01T00:00:00Z' }, input: {}, execution }] };
    const first = await runPipelineV2(config, definition, runId), file = eventFile(config, runId), original = lines(file);
    truncate(file, original, original.findIndex((line) => JSON.parse(line).entry.type === 'attempt.completed'));
    const wait = first.stages.get('review').wait;
    await assert.rejects(resumePipelineV2(config, definition, runId, { schemaVersion: 'resume-signal.v2', signalId: 'signal:expired',
      idempotencyKey: 'key:expired', waitId: wait.waitId, signalType: wait.signalType, issuer: wait.authorizedIssuer,
      issuedAt: new Date().toISOString(), payload: { approved: true } }), /WAIT_EXPIRED/);
    assert.equal(entries(file).filter((event) => event.type === 'attempt.completed').length, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Delivery-Lint result projection is repaired once before real dependent artifact reads', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'attempt-artifact-projection-'));
  try {
    const config = platform(root, true), runId = 'run:artifact-projection';
    config.providers = { 'git.repository.read': 'kubeclaw.repository-adapter:repository', 'artifacts.write': 'kubeclaw.artifact-store:artifact-store', 'artifacts.read': 'kubeclaw.artifact-store:artifact-store' };
    config.grants = { 'kubeclaw.delivery-lint:delivery-lint': { 'git.repository.read': { allowedPrefixes: ['Dockerfile'] }, 'artifacts.write': { allowedNamespaces: ['kubeclaw.delivery-lint'] } },
      'test.recovery-plugin:consume': { 'artifacts.read': { allowedNamespaces: ['kubeclaw.delivery-lint'] } } };
    config.adapters = { 'kubeclaw.repository-adapter:repository': { repositoryRoot: path.resolve('.') }, 'kubeclaw.artifact-store:artifact-store': { artifactRoot: path.join(root, 'artifacts') } };
    const definition = { schemaVersion: 'pipeline-definition.v2', id: 'test:artifact-projection', maxConcurrency: 1, stages: [
      { id: 'delivery', type: 'kubeclaw.lint.delivery', dependsOn: [], config: {}, input: { moduleId: 'api', dockerfile: null, staticPath: null }, execution },
      { id: 'reader', type: 'test.recovery.consume', dependsOn: ['delivery'], config: {}, input: {}, execution },
    ] };
    assert.equal((await runPipelineV2(config, definition, runId)).status, 'succeeded', JSON.stringify(entries(eventFile(config, runId)).filter((event) => event.type === 'attempt.completed').map((event) => event.payload.result)));
    const file = eventFile(config, runId), original = lines(file);
    const completed = original.findIndex((line) => { const event = JSON.parse(line).entry; return event.type === 'attempt.completed' && event.identity.stageId === 'delivery'; });
    const projection = original.findIndex((line) => JSON.parse(line).entry.type === 'artifact.created');
    const artifact = JSON.parse(original[completed]).entry.payload.result.artifacts[0];
    for (const index of [completed, projection]) {
      truncate(file, original, index);
      const result = await recoverPipelineV2(config, definition, runId);
      assert.equal(result.status, 'succeeded');
      assert.equal(result.stages.get('delivery').attemptsUsed, 1);
      assert.equal(result.stages.get('reader').facts['test.digest'], artifact.digest);
      const records = entries(file), projections = records.filter((event) => event.type === 'artifact.created');
      assert.equal(projections.length, 1);
      assert.deepEqual(projections[0].payload.artifact, artifact);
      assert.equal(records.filter((event) => event.type === 'attempt.created' && event.identity.stageId === 'delivery').length, 1);
      assert.ok(records.indexOf(projections[0]) < records.findIndex((event) => event.type === 'attempt.created' && event.identity.stageId === 'reader'));
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
