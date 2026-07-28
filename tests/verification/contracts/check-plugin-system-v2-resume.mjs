import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  resumePipelineV2,
  runPipelineV2,
} from '../../../skills/common/plugin-runtime/core/execution/engine.ts';

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
  assert.equal(first.stages.get('review')?.wait?.waitId, 'wait:test-resume');
  const resumed = await resumePipelineV2(platform, definition, 'run:resume-test', {
    schemaVersion: 'resume-signal.v2',
    signalId: 'signal:resume-test',
    idempotencyKey: 'signal-key:resume-test',
    waitId: 'wait:test-resume',
    signalType: 'test.resume.approved',
    issuer: { type: 'orchestrator', id: 'nova' },
    issuedAt: new Date().toISOString(),
    payload: { approved: true, helperPrompt: 'Continue with the reviewed approach.' },
  });
  assert.equal(resumed.status, 'succeeded');
  await assert.rejects(
    () => resumePipelineV2(platform, definition, 'run:resume-test', {
      schemaVersion: 'resume-signal.v2',
      signalId: 'signal:duplicate',
      idempotencyKey: 'signal-key:duplicate',
      waitId: 'wait:test-resume',
      signalType: 'test.resume.approved',
      issuer: { type: 'orchestrator', id: 'nova' },
      issuedAt: new Date().toISOString(),
      payload: { approved: true },
    }),
    /WAIT_UNKNOWN_OR_STALE|WAIT_ALREADY_RESOLVED/,
  );
  console.log(JSON.stringify({ ok: true, contract: 'plugin-system-v2-resume' }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
