import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  resumePipelineV2,
  runPipelineV2,
} from '../../../skills/nova/core/execution/engine.ts';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-v2-resume-'));
try {
  const fixtureRoot = path.resolve('tests/fixtures/plugin-system-v2');
  const platform = {
    schemaVersion: 'pipeline-platform.v2',
    installationRoots: [fixtureRoot],
    trustedBuiltinRoots: [fixtureRoot],
    externalTrust: {
      allowedSourceDigests: {},
      verifiedAttestations: {},
    },
    providers: {},
    grants: {},
    adapters: {},
    activeAdapters: [],
    observers: {},
    storageRoot: path.join(temporary, 'state'),
    shutdownTimeoutMs: 5000,
    orchestratorIssuerId: 'nova',
    administrativeDecisionIssuers: [],
  };
  const definition = {
    schemaVersion: 'pipeline-definition.v2',
    id: 'test:resume',
    maxConcurrency: 1,
    stages: [{
      id: 'review',
      type: 'test.resume',
      dependsOn: [],
      config: {},
      input: {},
      execution: { maxAttempts: 3, maxRemediationCycles: 0, timeoutMs: 5000 },
    }],
  };
  const first = await runPipelineV2(platform, definition, 'run:resume-test');
  assert.equal(first.status, 'waiting');
  const canonicalWait = first.stages.get('review')?.wait;
  assert.match(canonicalWait?.waitId ?? '', /^wait:/);
  assert.equal(canonicalWait?.signalType, 'core.orchestrator.resume');
  assert.deepEqual(canonicalWait?.authorizedIssuer, { type: 'orchestrator', id: 'nova' });
  assert.equal(first.stages.get('review')?.attemptsUsed, 1);
  assert.equal(Object.isFrozen(first.stages.get('review')), true);
  assert.equal(Object.isFrozen(first.stages.get('review')?.wait), true);
  assert.equal(Object.isFrozen(first.stages.get('review')?.wait?.authorizedIssuer), true);
  const signal = {
    schemaVersion: 'resume-signal.v2',
    signalId: 'signal:resume-test',
    idempotencyKey: 'signal-key:resume-test',
    waitId: canonicalWait.waitId,
    signalType: canonicalWait.signalType,
    issuer: { type: 'orchestrator', id: 'nova' },
    issuedAt: new Date().toISOString(),
    payload: { approved: true, helperPrompt: 'Continue with the reviewed approach.' },
  };
  const changedDefinition = structuredClone(definition);
  changedDefinition.stages[0].execution.timeoutMs += 1;
  await assert.rejects(
    () => resumePipelineV2(platform, changedDefinition, 'run:resume-test', signal),
    /RECOVERY_GRAPH_DIGEST_MISMATCH/,
  );
  const resumed = await resumePipelineV2(platform, definition, 'run:resume-test', {
    ...signal,
  });
  assert.equal(resumed.status, 'succeeded');
  assert.equal(resumed.stages.get('review')?.attemptsUsed, 2);
  await assert.rejects(
    () => resumePipelineV2(platform, definition, 'run:resume-test', {
      schemaVersion: 'resume-signal.v2',
      signalId: 'signal:duplicate',
      idempotencyKey: 'signal-key:duplicate',
      waitId: canonicalWait.waitId,
      signalType: canonicalWait.signalType,
      issuer: { type: 'orchestrator', id: 'nova' },
      issuedAt: new Date().toISOString(),
      payload: { approved: true },
    }),
    /WAIT_UNKNOWN_OR_STALE|WAIT_ALREADY_RESOLVED|WAIT_RUN_TERMINAL/,
  );
  console.log(JSON.stringify({ ok: true, contract: 'plugin-system-v2-resume' }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
