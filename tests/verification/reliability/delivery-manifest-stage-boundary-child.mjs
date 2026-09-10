import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, PORTABLE_JSON_ENCODING, sha256Text } from '@kubeclaw/plugin-sdk';
import { gateCoverageDigest } from '@kubeclaw/pipeline-test-gate-contract';
import * as core from '../../../skills/nova/core/src/index.ts';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const [root, phase] = process.argv.slice(2);
assert(root && phase, 'root and phase are required');
fs.mkdirSync(root, { recursive: true });
const artifactRoot = path.join(root, 'artifacts');
const runId = 'run:delivery-manifest-stage-boundary';
const revision = 'a'.repeat(40);

function contractCoverage(kind) {
  const value = {
    schemaVersion: 'gate-coverage.v1', projectId: 'app', kind, baseRevision: revision,
    modules: [{ moduleId: 'app', ownedPaths: ['app'], requirements: [{ id: 'works', statement: 'Contract fixture only.' }] }],
    integrationRequirements: [],
    requiredChecks: [{ checkId: 'works', requirementRefs: [{ moduleId: 'app', requirementId: 'works' }], nodeIds: ['unit'] }],
  };
  return { ...value, policyDigest: gateCoverageDigest(value) };
}

function gateRecords(stageId, policy) {
  const unsignedCoverage = {
    schemaVersion: 'gate-coverage-result.v1', policy,
    planDigest: sha256Text('contract-vector-plan'), pipelineStageId: stageId,
    sourceRevision: `git:${revision}`, sourceTree: `git:${'b'.repeat(40)}`,
    archiveContentDigest: sha256Text('contract-vector-archive'),
    checks: [{ checkId: 'works', declarationId: 'unit', nodeId: 'unit', state: 'passed' }],
  };
  const coverage = { ...unsignedCoverage, coverageDigest: sha256Text(canonicalJson(unsignedCoverage)) };
  const unsigned = {
    schemaVersion: 'test-gate-decision.v2', coverage, runId, state: 'passed',
    jobId: `job:${stageId}`, planId: `plan:${stageId}`, resultDigest: sha256Text('contract-vector-stored-result'),
    reviews: [], nodes: [{ nodeId: 'unit', kind: 'test', mode: 'blocking', effect: 'passed', reason: 'Contract fixture only.' }],
  };
  const decisionDigest = sha256Text(canonicalJson(unsigned));
  return [
    { id: `quality:${stageId}:decision:1`, namespace: 'kubeclaw.buster-quality-gate', value: { ...unsigned, decisionDigest } },
    { id: `quality:${stageId}:1`, namespace: 'kubeclaw.buster-quality-gate', value: { sourceRevision: revision, testAgent: { enabled: false }, nativeOutcome: 'passed', decisionDigest } },
  ];
}

function writeFixturePlugin(pluginRoot, kind) {
  const fixture = path.join(pluginRoot, kind);
  fs.mkdirSync(fixture, { recursive: true });
  if (kind === 'vectors') {
    fs.writeFileSync(path.join(fixture, 'plugin.json'), JSON.stringify({ id: 'test.delivery-vectors', apiVersion: 'pipeline-plugin-v2', packageVersion: '1.0.0', observers: [], adapters: [], stages: [{ id: 'vectors', type: 'test.delivery-vectors', module: 'stage.mjs', export: 'execute', requiredCapabilities: ['artifacts.write'], configSchema: 'config.json', inputSchema: 'input.json', resultSchema: 'result.json' }] }));
    fs.writeFileSync(path.join(fixture, 'config.json'), JSON.stringify({ type: 'object', additionalProperties: false }));
    fs.writeFileSync(path.join(fixture, 'input.json'), JSON.stringify({ type: 'object', properties: { records: { type: 'array', items: { type: 'object' } } }, required: ['records'], additionalProperties: false }));
    fs.writeFileSync(path.join(fixture, 'result.json'), JSON.stringify({ type: 'object' }));
    fs.writeFileSync(path.join(fixture, 'stage.mjs'), "export async function execute(input,context){const artifacts=[];for(const record of input.records){const saved=await context.invoke('artifacts.write',{operation:'put_json',resource:{type:'artifact.object',canonicalId:record.id},payload:{namespace:record.namespace,mediaType:'application/json',value:record.value}});artifacts.push(saved.artifact);}return {schemaVersion:'stage-result.v2',outcome:'passed',artifacts};}\n");
  } else {
    fs.writeFileSync(path.join(fixture, 'plugin.json'), JSON.stringify({ id: 'test.delivery-consumer', apiVersion: 'pipeline-plugin-v2', packageVersion: '1.0.0', observers: [], adapters: [], stages: [{ id: 'consume', type: 'test.delivery-consumer', module: 'stage.mjs', export: 'execute', requiredCapabilities: ['test.plan.evidence'], configSchema: 'config.json', inputSchema: 'input.json', resultSchema: 'result.json' }] }));
    fs.writeFileSync(path.join(fixture, 'config.json'), JSON.stringify({ type: 'object', additionalProperties: false }));
    fs.writeFileSync(path.join(fixture, 'input.json'), JSON.stringify({ type: 'object', properties: { operation: { const: 'demo' }, resource: { type: 'object' }, payload: { type: 'object' } }, required: ['operation', 'resource', 'payload'], additionalProperties: false }));
    fs.writeFileSync(path.join(fixture, 'result.json'), JSON.stringify({ type: 'object' }));
    fs.writeFileSync(path.join(fixture, 'stage.mjs'), "export async function execute(input,context){const value=await context.invoke('test.plan.evidence',input);return {schemaVersion:'stage-result.v2',outcome:'passed',facts:{projectId:String(value.projectId??'unknown')},artifacts:[]};}\n");
  }
}

function roots(pluginRoot) {
  return ['common', 'nova', 'buster'].map(role => path.join(repository, 'skills', role, 'plugins')).concat(pluginRoot);
}

async function produce() {
  const pluginRoot = path.join(root, 'producer-plugins');
  writeFixturePlugin(pluginRoot, 'vectors');
  const installationRoots = roots(pluginRoot);
  const registry = core.buildRegistry(core.discoverPackages({ installationRoots, trustPolicy: { trustedBuiltinRoots: installationRoots, allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'test:delivery-stage-boundary' } }));
  const enabled = new Set(['test.delivery-vectors:vectors', 'kubeclaw.project-summary:summary']);
  const namespaces = ['kubeclaw.implementation-agent', 'kubeclaw.lint', 'kubeclaw.buster-quality-gate'];
  const granted = core.resolveCapabilityGrants(registry, { enabledRegistrations: enabled, providers: new Map([['artifacts.read', 'kubeclaw.artifact-store:artifact-store'], ['artifacts.write', 'kubeclaw.artifact-store:artifact-store']]), grants: new Map([
    ['test.delivery-vectors:vectors', new Map([['artifacts.write', { allowedNamespaces: namespaces }]])],
    ['kubeclaw.project-summary:summary', new Map([['artifacts.read', { allowedNamespaces: namespaces }], ['artifacts.write', { allowedNamespaces: ['kubeclaw.project-summary'] }]])],
  ]) });
  const activated = await core.activateRegistry(granted.snapshot, new Set(granted.grants.keys()));
  const effectsFile = path.join(root, 'producer-effects.jsonl');
  const effects = new core.FileEffectJournal(effectsFile);
  const adapters = new core.AdapterRuntime({ granted, activated, configs: new Map([['kubeclaw.artifact-store:artifact-store', { artifactRoot }]]), effects: new core.EffectCoordinator(effects, undefined, undefined, new core.FileResourceLockManager(path.join(root, 'producer-locks'))), shutdownTimeoutMs: 1000, async emitDomainEvent() {} });
  await adapters.start();
  try {
    const moduleCoverage = contractCoverage('module');
    const finalCoverage = contractCoverage('cumulative');
    const record = (id, namespace, value) => ({ id, namespace, value });
    const stage = (id, dependsOn, records) => ({ id, type: 'test.delivery-vectors', dependsOn, config: {}, input: { records }, execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 10000 } });
    const definition = { schemaVersion: 'pipeline-definition.v2', id: 'delivery-manifest-stage-boundary-producer', maxConcurrency: 1, stages: [
      stage('forge', [], [record('implementation:app', 'kubeclaw.implementation-agent', { status: 'ready_for_testing', sourceRevision: revision })]),
      stage('lint', ['forge'], [record('lint:full:app', 'kubeclaw.lint', { sourceRevision: revision, summary: { tools_failed: 0, total_blocking: 0 } })]),
      stage('test', ['lint'], gateRecords('test', moduleCoverage)),
      stage('final-test', ['test'], gateRecords('final-test', finalCoverage)),
      { id: 'project-summary', type: 'kubeclaw.report.project-summary', dependsOn: ['final-test'], config: {}, input: { projectId: 'app', modules: [{ moduleId: 'app', sourceStageId: 'forge', testStageId: 'test', expectedCoverage: moduleCoverage }], final: { sourceStageId: 'forge', testStageId: 'final-test', lintStageId: 'lint', expectedCoverage: finalCoverage } }, execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 10000 } },
    ] };
    const lifecycleFile = path.join(root, 'producer-lifecycle.jsonl');
    const runner = new core.PipelineRunner({ definition, registry: granted, activated, adapters, journal: new core.FileJournal(lifecycleFile), orchestratorIssuerId: 'test:delivery-stage-boundary' });
    const result = await runner.run(runId);
    assert.equal(result.status, 'succeeded');
    assert.equal(result.stages.get('project-summary')?.status, 'succeeded');
    const recovery = await effects.recoveryEntries();
    const summaryWrite = recovery.map(item => item.request).find(request => request.attempt.stageId === 'project-summary' && request.capability === 'artifacts.write');
    assert(summaryWrite, 'registered Summary write request was not journaled');
    const summaryReceipt = await effects.receipt(summaryWrite.idempotencyKey);
    assert.equal(summaryReceipt?.status, 'completed');
    const manifestRef = summaryReceipt.result?.artifact;
    assert(manifestRef && typeof manifestRef === 'object');
    assert.equal(Object.hasOwn(summaryWrite.payload, 'encoding'), false, 'historical v2 write remains untagged');
    const read = await adapters.invoke('artifacts.read', { runId, stageId: 'proof-reader', attemptId: 'proof-reader:1', attemptNumber: 1 }, 'proof:read:manifest', { operation: 'get_json_bytes', resource: { type: 'artifact.object', canonicalId: manifestRef.artifactId }, payload: { namespace: manifestRef.namespace, digest: manifestRef.digest, reference: manifestRef } }, new AbortController().signal);
    const manifest = read.value;
    const { digest, ...unsigned } = manifest;
    // This is a reader-domain contract copy, not a second Summary-stage result:
    // it proves that the existing v2 reader continues admitting a correctly
    // tagged portable outer ArtifactRef while retaining the v2 inner digest.
    const portableCopy = await adapters.invoke('artifacts.write', { runId, stageId: 'project-summary', attemptId: 'portable-contract-copy:1', attemptNumber: 2 }, 'proof:portable-v2-copy', { operation: 'put_json', resource: { type: 'artifact.object', canonicalId: `${manifestRef.artifactId}:portable-contract` }, payload: { namespace: manifestRef.namespace, mediaType: manifestRef.mediaType, encoding: PORTABLE_JSON_ENCODING, value: manifest } }, new AbortController().signal);
    const lifecycleJsonl = fs.readFileSync(lifecycleFile, 'utf8');
    const lifecycle = lifecycleJsonl.trimEnd().split('\n').map(line => JSON.parse(line));
    const completed = lifecycle.find(record => record.entry?.type === 'attempt.completed' && record.entry.identity?.stageId === 'project-summary');
    const created = lifecycle.find(record => record.entry?.type === 'artifact.created' && record.entry.identity?.stageId === 'project-summary');
    assert(completed && created, 'registered Summary lifecycle records are missing');
    assert.deepEqual(completed.entry.payload.result.artifacts, [manifestRef]);
    assert.deepEqual(created.entry.payload.artifact, manifestRef);
    assert.deepEqual(summaryReceipt.result.artifact, manifestRef);
    const producerProof = {
      schemaVersion: 'delivery-manifest-stage-boundary-proof.v1', phase, locale: Intl.DateTimeFormat().resolvedOptions().locale,
      runId, sourceCommit: 'e644a79fddd4d4d686fbd351b6edaec5575caf57',
      boundary: { registeredProjectSummaryStage: true, sharedWorkerCoreLifecycle: true, actualArtifactStore: true, diskFileEffectJournal: true, upstreamArtifactContractFixtures: true, providerExecution: false, importStoreSuccess: false },
      manifest, unsignedManifest: unsigned, semanticDigest: digest, storedJsonBytes: read.jsonBytes,
      storedArtifactRef: manifestRef, readArtifactRef: read.artifact,
      portableV2ReaderContractRef: portableCopy.artifact,
      summaryWrite: { request: summaryWrite, receipt: summaryReceipt },
      allProducerEffects: await Promise.all(recovery.map(async item => ({ ...item, receipt: await effects.receipt(item.request.idempotencyKey) }))),
      exactProducerEffectJournalJsonl: fs.readFileSync(effectsFile, 'utf8'),
      exactProducerLifecycleJournalJsonl: lifecycleJsonl,
      summaryLifecycle: { attemptCompleted: completed, artifactCreated: created },
    };
    fs.writeFileSync(path.join(root, 'producer-proof.json'), JSON.stringify(producerProof, null, 2) + '\n');
    console.log(JSON.stringify({ phase, locale: producerProof.locale, status: result.status, manifestDigest: digest, artifactDigest: manifestRef.digest, manifestBytes: manifestRef.sizeBytes, summaryWriteKey: summaryWrite.idempotencyKey }));
  } finally { await adapters.shutdown(); }
}

async function consume() {
  const producer = JSON.parse(fs.readFileSync(path.join(root, 'producer-proof.json'), 'utf8'));
  const pluginRoot = path.join(root, `consumer-${phase}-plugins`);
  writeFixturePlugin(pluginRoot, 'consumer');
  const installationRoots = roots(pluginRoot);
  const registry = core.buildRegistry(core.discoverPackages({ installationRoots, trustPolicy: { trustedBuiltinRoots: installationRoots, allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: `test:delivery-consumer:${phase}` } }));
  const consumerId = 'test.delivery-consumer:consume';
  const evidenceId = 'kubeclaw.remote-test-gate:evidence';
  const enabled = new Set([consumerId, evidenceId]);
  const granted = core.resolveCapabilityGrants(registry, { enabledRegistrations: enabled, providers: new Map([['test.plan.evidence', evidenceId], ['artifacts.read', 'kubeclaw.artifact-store:artifact-store']]), grants: new Map([
    [consumerId, new Map([['test.plan.evidence', { allowedNamespaces: ['kubeclaw.project-summary'] }]])],
    [evidenceId, new Map([['artifacts.read', { allowedNamespaces: ['kubeclaw.project-summary', 'kubeclaw.buster-quality-gate'] }]])],
  ]) });
  const activated = await core.activateRegistry(granted.snapshot, new Set(granted.grants.keys()));
  const effectsFile = path.join(root, `${phase}-effects.jsonl`);
  const effects = new core.FileEffectJournal(effectsFile);
  const adapters = new core.AdapterRuntime({ granted, activated, configs: new Map([
    ['kubeclaw.artifact-store:artifact-store', { artifactRoot }],
    [evidenceId, { stateRoot: root, manifestStageId: 'project-summary', gateStageId: 'final-test' }],
  ]), effects: new core.EffectCoordinator(effects, undefined, undefined, new core.FileResourceLockManager(path.join(root, `${phase}-locks`))), shutdownTimeoutMs: 1000, async emitDomainEvent() {} });
  await adapters.start();
  try {
    const ref = phase === 'consume-portable-en' ? producer.portableV2ReaderContractRef : producer.storedArtifactRef;
    const request = { operation: 'demo', resource: { type: 'test.plan.evidence', canonicalId: ref.artifactId }, payload: { manifest: ref, namespace: 'kubeclaw.project-summary', authNodeId: 'auth' } };
    const definition = { schemaVersion: 'pipeline-definition.v2', id: `delivery-manifest-stage-boundary-${phase}`, maxConcurrency: 1, stages: [{ id: 'consume', type: 'test.delivery-consumer', dependsOn: [], config: {}, input: request, execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 10000 } }] };
    const runner = new core.PipelineRunner({ definition, registry: granted, activated, adapters, journal: new core.FileJournal(path.join(root, `${phase}-lifecycle.jsonl`)), orchestratorIssuerId: 'test:delivery-stage-boundary' });
    const result = await runner.run(runId);
    assert.equal(result.status, 'blocked');
    const recovery = await effects.recoveryEntries();
    const top = recovery.map(item => item.request).find(item => item.capability === 'test.plan.evidence');
    assert(top, 'original evidence adapter request missing');
    const receipt = await effects.receipt(top.idempotencyKey);
    assert.equal(receipt?.status, 'failed');
    const nestedRead = recovery.map(item => item.request).find(item => item.capability === 'artifacts.read');
    const nestedReceipt = nestedRead ? await effects.receipt(nestedRead.idempotencyKey) : undefined;
    const proof = {
      schemaVersion: 'delivery-manifest-stage-consumer-boundary.v1', phase,
      locale: Intl.DateTimeFormat().resolvedOptions().locale, runId,
      sameStoredArtifactRef: ref, originalEvidenceAdapter: evidenceId,
      outcome: result.status, error: receipt.error,
      storedSemanticDigest: producer.semanticDigest,
      recomputedSemanticDigest: sha256Text(canonicalJson(producer.unsignedManifest)),
      parsedManifestMatchesProducer: canonicalJson(producer.manifest) === canonicalJson(JSON.parse(producer.storedJsonBytes)),
      boundary: { manifestIntegrityRejected: receipt.error?.message === 'DEMO_EVIDENCE_MANIFEST_INVALID', importStoreReached: !String(receipt.error?.message).includes('MANIFEST_INVALID') && !String(receipt.error?.message).includes('ARTIFACT_'), providerExecution: false, importedResultSuccess: false },
      evidenceRequest: top, evidenceReceipt: receipt,
      nestedArtifactRead: nestedRead ? { request: nestedRead, receipt: nestedReceipt } : null,
      allConsumerEffects: await Promise.all(recovery.map(async item => ({ ...item, receipt: await effects.receipt(item.request.idempotencyKey) }))),
      exactConsumerEffectJournalJsonl: fs.readFileSync(effectsFile, 'utf8'),
      exactConsumerLifecycleJournalJsonl: fs.readFileSync(path.join(root, `${phase}-lifecycle.jsonl`), 'utf8'),
    };
    fs.writeFileSync(path.join(root, `${phase}-proof.json`), JSON.stringify(proof, null, 2) + '\n');
    console.log(JSON.stringify({ phase, locale: proof.locale, outcome: result.status, error: receipt.error?.message, manifestIntegrityRejected: proof.boundary.manifestIntegrityRejected, importStoreReached: proof.boundary.importStoreReached }));
  } finally { await adapters.shutdown(); }
}

if (phase === 'produce') await produce(); else if (phase === 'consume-en' || phase === 'consume-cs' || phase === 'consume-portable-en') await consume(); else throw new Error(`unknown phase: ${phase}`);
