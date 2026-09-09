import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runPipelineV2, reopenBlockedPipelineV2 } from '../../../skills/nova/core/execution/engine.ts';
import { runRoot } from '../../../skills/nova/core/execution/run-root.ts';
import { FileJournal } from '../../../skills/nova/core/state/journal.ts';
import { projectSourceFixture } from './project-source-fixture.mjs';
import { readRunSnapshot } from '../../../skills/nova/core/execution/engine-snapshots.ts';
import { activate } from '../../../skills/common/plugins/artifact-store/src/adapter.ts';
import { canonicalJson, sha256Text } from '../../../skills/common/plugin-runtime/sdk/src/values.ts';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const secret = 'REPORT_TRANSPORT_PLATFORM_TOKEN';
const secretValue = 'report-transport-secret-canary';
async function transport(valid) {
  const requests = [];
  const server = http.createServer((request, response) => {
    void (async () => {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString();
      const expected = createHmac('sha256', secretValue).update(`${request.headers['idempotency-key']}.${raw}`).digest('hex');
      assert.equal(request.headers['x-kubeclaw-signature'], `v1=${expected}`);
      requests.push(JSON.parse(raw));
      // The first real HTTP response attempts to supply execution identity. The owner must reject it.
      const incoming = JSON.parse(raw);
      const ids = incoming.sourceBundle.evidence.map(item => item.evidenceId);
      const cited = valid.observations ? { ...valid, observations: valid.observations.map(item => ({ ...item, evidenceIds: ids })) } : { ...valid, markdown: `${valid.markdown}\n\n${ids.map(id=>`[evidence:${id}]`).join(' ')}`, evidenceIds: ids };
      const result = requests.length === 1 ? { ...cited, execution: { runId: 'run:foreign' } } : cited;
      response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ result }));
    })().catch(error => { response.writeHead(500); response.end(error.message); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { requests, server, origin: `http://127.0.0.1:${server.address().port}` };
}
function platform(root, origin, plugin, registration) {
  const roots = ['common', 'nova', 'buster'].map(role => path.join(repository, `skills/${role}/plugins`));
  const artifact = 'kubeclaw.artifact-store:artifact-store';
  return { schemaVersion: 'pipeline-platform.v2', installationRoots: roots, trustedBuiltinRoots: roots,
    externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} },
    providers: { 'runtime.dispatch': 'kubeclaw.runtime-dispatch:runtime', 'network.http': 'kubeclaw.network-http:http',
      'secrets.read': 'kubeclaw.secret-resolver:secrets', 'artifacts.write': artifact, 'artifacts.read': artifact, 'report.evidence.read': 'kubeclaw.pipeline-review:evidence' },
    grants: { [`kubeclaw.${plugin}:${registration}`]: { 'runtime.dispatch': { allowedAgents: ['reporter'] }, 'artifacts.write': { allowedNamespaces: [`kubeclaw.${plugin}`] }, 'report.evidence.read': { allowedRunIds: ['run:historical-A'] } },
      'kubeclaw.pipeline-review:evidence': { 'artifacts.read': { allowedNamespaces: ['kubeclaw.implementation-agent'] } },
      'kubeclaw.runtime-dispatch:runtime': { 'network.http': { allowedOrigins: [origin] }, 'secrets.read': { allowedNames: ['report.agent'] } } },
    adapters: { 'kubeclaw.pipeline-review:evidence': { storageRoot: path.join(root,'history/state'), orchestratorIssuerId:'nova', maximumJournalBytes:16*1024*1024, maximumArtifactBytes:4*1024*1024, maximumBundleBytes:4*1024*1024 }, 'kubeclaw.runtime-dispatch:runtime': { targets: { reporter: { endpoint: `${origin}/dispatch`, tokenSecret: 'report.agent' } } },
      'kubeclaw.network-http:http': { allowedOrigins: [origin], allowedMethods: ['POST'], allowedHeaders: ['content-type', 'idempotency-key', 'x-kubeclaw-signature'] },
      'kubeclaw.secret-resolver:secrets': { environment: { 'report.agent': secret } }, [artifact]: { artifactRoot: path.join(root, 'artifacts') } },
    activeAdapters: [], observers: {}, storageRoot: path.join(root, 'state'), shutdownTimeoutMs: 5000,
    orchestratorIssuerId: 'nova', administrativeDecisionIssuers: [{ type: 'administrator', id: 'admin:report-test' }] };
}
function artifactMismatchChecks(assertStored, artifact, report) {
  assertStored(artifact, artifact.artifactId, report, report.execution);
  for (const changed of [
    { ...artifact, producer: { ...artifact.producer, runId: 'run:foreign' } },
    { ...artifact, producer: { ...artifact.producer, attemptNumber: artifact.producer.attemptNumber + 1 } },
    { ...artifact, producer: { ...artifact.producer, attemptId: 'attempt:foreign' } },
    { ...artifact, namespace: 'foreign' }, { ...artifact, sizeBytes: artifact.sizeBytes + 1 },
    { ...artifact, digest: sha256Text('different actual report bytes') },
  ]) assert.throws(() => assertStored(changed, artifact.artifactId, report, report.execution), /REPORT_ARTIFACT_BINDING_MISMATCH/);
  assert.throws(() => assertStored(artifact, artifact.artifactId, { ...report, status: 'changed' }, report.execution), /REPORT_ARTIFACT_BINDING_MISMATCH/);
}
async function verifyArtifacts(root, plugin, input, requests, assertStored) {
  const stored = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/records/store.json'), 'utf8')).records.filter(record => record.payload.namespace === `kubeclaw.${plugin}`);
  assert.equal(stored.length, 2);
  const artifacts = activate({ config: { artifactRoot: path.join(root, 'artifacts') } });
  await artifacts.ready();
  try {
    for (const record of stored) {
      const artifact = record.payload;
      const response = await artifacts.invoke({ confidential: true, signal: new AbortController().signal, request: {
        capability: 'artifacts.read', operation: 'get_json', resource: { type: 'artifact.object', canonicalId: artifact.artifactId },
        payload: { namespace: artifact.namespace, digest: artifact.digest }, attempt: artifact.producer, idempotencyKey: 'read:report' } });
      const report = response.value;
      assert.equal(response.digest, sha256Text(canonicalJson(report))); assert.equal(response.sizeBytes, Buffer.byteLength(canonicalJson(report)));
      assert.deepEqual(report.execution, artifact.producer); assert.equal(report.runId, artifact.producer.runId);
      const { artifacts: _selected, ...target } = input.source;
      assert.deepEqual(report.reportTarget, target);
      assert.equal(report.evidenceStatus, 'verified-source-bundle');
      const dispatched = requests.find(request => request.identity.attemptId === artifact.producer.attemptId);
      assert.ok(dispatched); assert.deepEqual(dispatched.identity, report.execution); assert.deepEqual(dispatched.reportTarget, report.reportTarget);
      assert.equal(dispatched.evidenceStatus, 'verified-source-bundle');
      assert.deepEqual(report.sourceBundle, dispatched.sourceBundle);
      assert.equal(report.narrativeStatus, 'draft-not-entailment-verified');
      assert.equal(report.sourceBundle.facts[0].sourceRevision,input.source.sourceRevision);
      assert.ok(!canonicalJson(report).includes(secretValue));
      assert.equal(artifact.artifactId, `${plugin}:${sha256Text(canonicalJson(report.execution)).slice(7)}`);
      artifactMismatchChecks(assertStored, artifact, report);
    }
  } finally { await artifacts.shutdown(); }
}

/** Actual compiled source prefix, native Git integration and original artifact producer. */
export async function createReportHistory(root, runId, directory = 'history') {
  const history = path.join(root,directory); fs.mkdirSync(history);
  const previousDirectory=process.cwd(); let fixture;
  try {process.chdir(repository);fixture=await projectSourceFixture(history);} finally {process.chdir(previousDirectory);}
  fixture.platform.adapters['kubeclaw.artifact-store:artifact-store'].artifactRoot=path.join(root,'artifacts');
  fixture.platform.adapters['kubeclaw.git-workspace:git'].authorName=`Report source ${runId}`;
  try {
    const result = await runPipelineV2(fixture.platform,fixture.definition,runId);
    assert.equal(result.status,'succeeded',JSON.stringify(new FileJournal(path.join(runRoot(fixture.platform.storageRoot,runId),'events.jsonl')).records().filter(item=>item.entry.type==='attempt.completed').map(item=>item.entry.payload.result.reason)));
    const targetRoot=runRoot(fixture.platform.storageRoot,runId);
    const records=new FileJournal(path.join(targetRoot,'events.jsonl')).records();
    const artifacts=records.filter(item=>item.entry.type==='attempt.completed').flatMap(item=>item.entry.payload.result.artifacts);
    const ref=artifacts.find(ref=>ref.namespace==='kubeclaw.implementation-agent' && ref.producer.stageId==='implement-ui');
    assert.ok(ref);
    const store=activate({config:{artifactRoot:path.join(root,'artifacts')}});
    const response=await store.invoke({confidential:true,signal:new AbortController().signal,request:{capability:'artifacts.read',operation:'get_json',
      resource:{type:'artifact.object',canonicalId:ref.artifactId},payload:{namespace:ref.namespace,digest:ref.digest},attempt:ref.producer,idempotencyKey:'read:source'}});
    const sourceRevision=response.value.sourceRevision;
    assert.equal(fixture.git('rev-parse','HEAD'),sourceRevision);
    return {runId,journalHead:records.at(-1).hash,snapshotDigest:readRunSnapshot(targetRoot).digest,sourceStageId:'implement-ui',sourceRevision,artifacts:[ref]};
  } finally {await fixture.close();}
}

/** Original Core, authenticated runtime HTTP, journal/reopen/replay and content-addressed store; no model execution proof. */
export async function verifyReportIdentity({ plugin, registration, type, input, valid, assertStored }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `report-identity-${plugin}-`));
  const previousSecret = process.env[secret]; process.env[secret] = secretValue;
  const { requests, server, origin } = await transport(valid);
  try {
    const source = await createReportHistory(root,'run:historical-A');
    input = { task: input.task, source };
    const config = platform(root, origin, plugin, registration);
    const definition = { schemaVersion: 'pipeline-definition.v2', id: `test:${plugin}`, maxConcurrency: 1, stages: [
      { id: 'report', type, dependsOn: [], config: { agent: 'reporter' }, input, execution: { maxAttempts: 2, maxRemediationCycles: 0, timeoutMs: 10000 } },
    ] };
    const runId = 'run:executor-B';
    assert.equal((await runPipelineV2(config, definition, runId)).status, 'blocked');
    const decision = { schemaVersion: 'administrative-reopen.v2', decisionId: 'decision:retry-report', idempotencyKey: 'key:retry-report', runId,
      stageId: 'report', actor: { type: 'administrator', id: 'admin:report-test' }, reason: { code: 'test.valid_report_available' }, continuation: 'retry', decidedAt: new Date().toISOString() };
    const reopened=await reopenBlockedPipelineV2(config, definition, decision, value => value.actor);
    assert.equal(reopened.status, 'succeeded', JSON.stringify(new FileJournal(path.join(runRoot(config.storageRoot,runId),'events.jsonl')).records().filter(item=>item.entry.type==='attempt.completed').map(item=>item.entry.payload.result.reason)));
    const count = requests.length;
    assert.equal((await reopenBlockedPipelineV2(config, definition, decision, value => value.actor)).status, 'succeeded');
    assert.equal(requests.length, count, 'durable administrative replay must not rerun the report');
    assert.equal((await runPipelineV2(config, definition, 'run:executor-C')).status, 'succeeded');
    assert.equal(requests.length, 3);
    assert.deepEqual(requests.map(request => [request.identity.runId, request.identity.attemptNumber]), [[runId, 1], [runId, 2], ['run:executor-C', 1]]);
    const events = new FileJournal(path.join(runRoot(config.storageRoot, runId), 'events.jsonl')).records();
    const created = events.filter(record => record.entry.type === 'attempt.created').map(record => record.entry.identity.attemptId);
    assert.deepEqual(created, requests.slice(0, 2).map(request => request.identity.attemptId));
    await verifyArtifacts(root, plugin, input, requests, assertStored);
    for (const id of [runId, 'run:executor-C']) assert.ok(!fs.readFileSync(path.join(runRoot(config.storageRoot, id), 'effects.jsonl'), 'utf8').includes(secretValue));
  } finally {
    if (previousSecret === undefined) delete process.env[secret]; else process.env[secret] = previousSecret;
    await new Promise(resolve => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true });
  }
}
