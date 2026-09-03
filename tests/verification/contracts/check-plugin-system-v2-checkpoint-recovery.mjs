import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';
import { artifactFromWrite } from '../../../skills/nova/core/execution/artifact-checkpoints.ts';
import { runPipelineV2 } from '../../../skills/nova/core/execution/engine.ts';
import { runRoot } from '../../../skills/nova/core/execution/run-root.ts';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-v2-checkpoint-recovery-'));
const platformPath = path.join(temporary, 'platform.json');
const definitionPath = path.join(temporary, 'pipeline.json');
const markerPath = path.join(temporary, 'checkpoint-ready');
const runId = 'run:checkpoint-recovery';

const sampleAttempt = { runId, stageId: 'review', attemptId: 'attempt:sample', attemptNumber: 1 };
const sampleRequest = { operation: 'put_json', resource: { type: 'artifact.object', canonicalId: 'checkpoint:sample' },
  payload: { namespace: 'test.checkpoint', mediaType: 'application/json', checkpoint: true, value: { completed: true } } };
const sampleText = canonicalJson(sampleRequest.payload.value);
const sampleArtifact = { artifactId: sampleRequest.resource.canonicalId, namespace: sampleRequest.payload.namespace,
  mediaType: sampleRequest.payload.mediaType, digest: sha256Text(sampleText), sizeBytes: Buffer.byteLength(sampleText),
  producer: sampleAttempt };
assert.deepEqual(artifactFromWrite(sampleAttempt, sampleRequest, { artifact: sampleArtifact }), sampleArtifact);
assert.throws(() => artifactFromWrite(sampleAttempt, sampleRequest,
  { artifact: { ...sampleArtifact, digest: `sha256:${'0'.repeat(64)}` } }), /ARTIFACT_CHECKPOINT_RESPONSE_INVALID/u);
assert.throws(() => artifactFromWrite(sampleAttempt, sampleRequest,
  { artifact: { ...sampleArtifact, producer: { ...sampleAttempt, attemptId: 'attempt:other' } } }),
  /ARTIFACT_CHECKPOINT_PRODUCER_INVALID/u);
assert.equal(artifactFromWrite(sampleAttempt, { ...sampleRequest,
  payload: { ...sampleRequest.payload, checkpoint: false } }, { artifact: sampleArtifact }), undefined);

const platform = {
  schemaVersion: 'pipeline-platform.v2',
  installationRoots: [path.resolve('tests/fixtures/plugin-system-v2'), path.resolve('skills/common/plugins')],
  trustedBuiltinRoots: [path.resolve('tests/fixtures/plugin-system-v2'), path.resolve('skills/common/plugins')],
  externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} },
  providers: {
    'artifacts.write': 'kubeclaw.artifact-store:artifact-store',
    'artifacts.read': 'kubeclaw.artifact-store:artifact-store',
  },
  grants: {
    'test.resume-plugin:checkpoint': {
      'artifacts.write': { allowedNamespaces: ['test.checkpoint'] },
      'artifacts.read': { allowedNamespaces: ['test.checkpoint'] },
    },
  },
  adapters: {
    'kubeclaw.artifact-store:artifact-store': { artifactRoot: path.join(temporary, 'artifacts') },
  },
  activeAdapters: [], observers: {}, storageRoot: path.join(temporary, 'state'),
  shutdownTimeoutMs: 5000, orchestratorIssuerId: 'nova', administrativeDecisionIssuers: [],
};
const definition = {
  schemaVersion: 'pipeline-definition.v2', id: 'test:checkpoint-recovery', maxConcurrency: 1,
  stages: [{ id: 'review', type: 'test.checkpoint', dependsOn: [], config: { markerPath }, input: {},
    execution: { maxAttempts: 3, maxRemediationCycles: 0, timeoutMs: 60_000 } }],
};

async function waitForMarker(child) {
  const deadline = Date.now() + 20_000;
  while (!fs.existsSync(markerPath)) {
    if (child.exitCode !== null) throw new Error(`checkpoint child exited early: ${child.exitCode}`);
    if (Date.now() > deadline) throw new Error('checkpoint child did not persist its artifact');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function lifecycle() {
  const journal = path.join(runRoot(platform.storageRoot, runId), 'events.jsonl');
  return fs.readFileSync(journal, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line).entry);
}

async function recoverWithCli() {
  const child = spawn(process.execPath, ['skills/nova/core/cli.ts', '--platform', platformPath,
    '--pipeline', definitionPath, '--recover', runId], { cwd: path.resolve('.'), stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const exit = await new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
  assert.deepEqual(exit, { code: 0, signal: null }, stderr);
  return JSON.parse(stdout);
}

if (process.argv[2] === '--child') {
  await runPipelineV2(JSON.parse(fs.readFileSync(process.argv[3], 'utf8')),
    JSON.parse(fs.readFileSync(process.argv[4], 'utf8')), process.argv[5]);
} else {
  try {
    fs.writeFileSync(platformPath, JSON.stringify(platform), 'utf8');
    fs.writeFileSync(definitionPath, JSON.stringify(definition), 'utf8');
    const child = spawn(process.execPath,
      [fileURLToPath(import.meta.url), '--child', platformPath, definitionPath, runId], {
      cwd: path.resolve('.'), stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    await waitForMarker(child);
    const closed = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
    child.kill('SIGKILL');
    const childExit = await closed;
    assert.equal(childExit.signal, 'SIGKILL', stderr);
    const interrupted = lifecycle();
    assert.equal(interrupted.some(({ type }) => type.startsWith('run.') && !['run.created', 'run.started'].includes(type)), false);
    assert.equal(interrupted.filter(({ type }) => type === 'artifact.created').length, 1);
    assert.equal(interrupted.find(({ type }) => type === 'artifact.created').payload.checkpoint, true);
    const recovered = await recoverWithCli();
    assert.equal(recovered.status, 'succeeded');
    assert.equal(recovered.stages.review.attemptNumber, 2);
    const completed = lifecycle();
    assert.equal(completed.filter(({ type }) => type === 'artifact.created').length, 1,
      'returning a checkpoint artifact must not duplicate its lifecycle record');
    assert.deepEqual(completed.filter(({ type }) => type === 'attempt.created')
      .map(({ payload }) => payload.attemptNumber), [1, 2]);
    assert.ok(completed.some(({ type }) => type === 'run.resumed'));
    assert.ok(completed.some(({ type }) => type === 'run.succeeded'));

    const dependencyRunId = 'run:checkpoint-dependency';
    const dependencyDefinition = { ...definition, id: 'test:checkpoint-dependency', stages: [
      { id: 'producer', type: 'test.checkpoint', dependsOn: [],
        config: { markerPath, mode: 'produce', artifactId: 'checkpoint:dependency' }, input: {},
        execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 60_000 } },
      { id: 'consumer', type: 'test.checkpoint', dependsOn: ['producer'],
        config: { markerPath, mode: 'consume', artifactId: 'checkpoint:dependency' }, input: {},
        execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 60_000 } },
    ] };
    const dependencyResult = await runPipelineV2(platform, dependencyDefinition, dependencyRunId);
    assert.equal(dependencyResult.status, 'succeeded',
      'a declared dependent stage receives the producer checkpoint artifact');
    console.log(JSON.stringify({ ok: true, contract: 'plugin-system-v2-checkpoint-recovery' }));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
