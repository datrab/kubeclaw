import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, portableJson, PORTABLE_JSON_ENCODING, sha256Text } from '@kubeclaw/plugin-sdk';
import { coverageReviewPrefixes, coverageReviewRequirements, gateCoverageDigest } from '@kubeclaw/pipeline-test-gate-contract';
import * as core from '../../../skills/nova/core/src/index.ts';
import { demoImportVectors } from '../../../skills/nova/plugins/remote-test-gate/tests/demo-import-fixture.ts';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const [root, phase] = process.argv.slice(2);
assert(root && phase, 'root and phase are required');
fs.mkdirSync(root, { recursive: true });
const durabilityPhase = /^(kill|replay)-(write|read)-(v2|v3)-(requested|accepted|completed)$/.exec(phase);
const artifactRoot = path.join(root, 'artifacts');
const runId = 'run:delivery-manifest-stage-boundary';
const revision = 'a'.repeat(40);
const sourceBaseCommit = '15f6a808ed1666c3b7a2a3909749e3d4ee377904';
const productionPaths = [
  'contracts/delivery-manifest/v3/schemas/delivery-manifest.v3.schema.json',
  'contracts/delivery-manifest/v3/src/index.ts',
  'skills/nova/plugins/project-summary/schemas/config.schema.json',
  'skills/nova/plugins/project-summary/schemas/input.schema.json',
  'skills/nova/plugins/project-summary/src/stage.ts',
  'skills/nova/plugins/project-summary/src/summary.ts',
  'skills/nova/plugins/remote-test-gate/src/evidence-adapter.ts',
  'skills/nova/project/cli.ts',
  'skills/nova/project/compiler.ts',
  'skills/nova/project/coverage.ts',
  'skills/nova/project/delivery-manifest.ts',
  'skills/nova/project/legacy-import.ts',
  'skills/nova/project/recovery.ts',
];
const productionSource = productionPaths.map(file => ({ file,
  digest: sha256Text(fs.readFileSync(path.join(repository, file), 'utf8')) }));
const productionSourceDigest = sha256Text(portableJson(productionSource));

function durabilityEffectsFile(fallback) {
  return durabilityPhase
    ? path.join(root, `durability-${durabilityPhase[2]}-${durabilityPhase[3]}-${durabilityPhase[4]}-effects.jsonl`)
    : fallback;
}

function instrumentKillBoundary(journal, target) {
  if (!durabilityPhase || durabilityPhase[1] !== 'kill' || durabilityPhase[2] !== target) return;
  const boundary = durabilityPhase[4];
  let targetKey;
  const matches = request => target === 'write'
    ? request.capability === 'artifacts.write' && request.attempt.stageId === 'project-summary'
    : request.capability === 'test.plan.evidence';
  const kill = request => {
    const proof = { phase, target, boundary, request, signal: 'SIGKILL' };
    fs.writeFileSync(path.join(root, `durability-${target}-${durabilityPhase[3]}-${boundary}-kill.json`), JSON.stringify(proof, null, 2) + '\n');
    fs.writeSync(1, `DURABLE_PREFIX:${target}:${durabilityPhase[3]}:${boundary}\n`);
    process.kill(process.pid, 'SIGKILL');
  };
  const requested = journal.requested.bind(journal);
  journal.requested = async request => {
    await requested(request);
    if (matches(request)) { targetKey = request.idempotencyKey; if (boundary === 'requested') kill(request); }
  };
  const accepted = journal.accepted.bind(journal);
  journal.accepted = async request => {
    const result = await accepted(request);
    if (matches(request)) { targetKey = request.idempotencyKey; if (boundary === 'accepted') kill(request); }
    return result;
  };
  const completed = journal.completed.bind(journal);
  journal.completed = async receipt => {
    await completed(receipt);
    if (receipt.idempotencyKey === targetKey && boundary === 'completed') {
      const request = await journal.request(receipt.idempotencyKey);
      assert(request); kill(request);
    }
  };
}

function contractCoverage(kind, projectId = 'app') {
  const value = {
    schemaVersion: 'gate-coverage.v1', projectId, kind, baseRevision: revision,
    modules: [{ moduleId: 'app', ownedPaths: ['app'], requirements: [{ id: 'works', statement: 'Contract fixture only.' }] }],
    integrationRequirements: [],
    requiredChecks: [{ checkId: 'works', requirementRefs: [{ moduleId: 'app', requirementId: 'works' }], nodeIds: ['unit'] }],
  };
  return { ...value, policyDigest: gateCoverageDigest(value) };
}

function gateRecords(stageId, policy, importedDecision) {
  if (importedDecision) return [
    { id: `quality:${stageId}:decision:1`, namespace: 'kubeclaw.buster-quality-gate', value: importedDecision },
    { id: `quality:${stageId}:1`, namespace: 'kubeclaw.buster-quality-gate', value: { sourceRevision: revision, testAgent: { enabled: false }, nativeOutcome: 'passed', decisionDigest: importedDecision.decisionDigest } },
  ];
  const required = policy.requiredChecks[0];
  assert(required && required.nodeIds.length === 1, 'contract coverage must name exactly one node');
  const nodeId = required.nodeIds[0];
  const unsignedCoverage = {
    schemaVersion: 'gate-coverage-result.v1', policy,
    planDigest: sha256Text('contract-vector-plan'), pipelineStageId: stageId,
    sourceRevision: `git:${revision}`, sourceTree: `git:${'b'.repeat(40)}`,
    archiveContentDigest: sha256Text('contract-vector-archive'),
    checks: [{ checkId: required.checkId, declarationId: nodeId, nodeId, state: 'passed' }],
  };
  const coverage = { ...unsignedCoverage, coverageDigest: sha256Text(canonicalJson(unsignedCoverage)) };
  const unsigned = {
    schemaVersion: 'test-gate-decision.v2', coverage, runId, state: 'passed',
    jobId: `job:${stageId}`, planId: `plan:${stageId}`, resultDigest: sha256Text('contract-vector-stored-result'),
    reviews: [], nodes: [{ nodeId, kind: 'test', mode: 'blocking', effect: 'passed', reason: 'Contract fixture only.' }],
  };
  const decisionDigest = sha256Text(canonicalJson(unsigned));
  return [
    { id: `quality:${stageId}:decision:1`, namespace: 'kubeclaw.buster-quality-gate', value: { ...unsigned, decisionDigest } },
    { id: `quality:${stageId}:1`, namespace: 'kubeclaw.buster-quality-gate', value: { sourceRevision: revision, testAgent: { enabled: false }, nativeOutcome: 'passed', decisionDigest } },
  ];
}

function demoBundle() {
  const planId = 'plan:delivery-manifest-stage-boundary';
  const attemptId = 'attempt:delivery-manifest-stage-boundary:auth:1';
  const completedAt = '2026-09-10T04:00:03.000Z';
  const expiresAt = '2026-09-11T04:00:00.000Z';
  const config = { protocol: 'json-session.v1', loginPath: '/api/login', usernameKey: 'username', passwordKey: 'password', cookieName: 'demo_session', protectedPath: '/api/account', usernamePointer: '/username', assertions: [{ pointer: '/projects/0/name', equals: 'Demo workspace' }] };
  const values = { username: 'delivery-contract-user', password: 'delivery-contract-password' };
  const credentialDigest = sha256Text(canonicalJson(values));
  const immutableImage = `example.invalid/demo@${sha256Text('delivery-manifest source image')}`;
  const manifestDigest = sha256Text('local application manifest contract vector');
  const source = { schemaVersion: 'generated-demo-credential-source.v1', leaseUID: 'lease-uid:delivery-contract', secretUID: 'secret-uid:delivery-contract', secretResourceVersion: '1', namespace: 'demo-contract', secretName: 'demo-login', credentialDigest };
  const deployment = { schemaVersion: 'kubernetes-deployment-fixture.v1', leaseName: 'demo-auth-lease', namespace: source.namespace, secretName: source.secretName, immutableImage, manifestDigest, expiresAt };
  const credentials = { schemaVersion: 'generated-demo-credentials.v1', leaseName: deployment.leaseName, namespace: source.namespace, secretName: source.secretName, immutableImage, manifestDigest, source, values };
  const handoff = { schemaVersion: 'demo-exposure-handoff.v1', phase: 'awaiting-readiness', leaseUID: source.leaseUID, sourceOwner: sha256Text('delivery-contract-source-owner'), sourceRequest: sha256Text('delivery-contract-source-request'), owner: sha256Text('delivery-contract-exposure-owner'), expiresAt, immutableImage, manifestDigest, exposureGeneration: 1 };
  const exposure = { schemaVersion: 'public-endpoint-fixture.v1', provider: 'tailscale-ingress', leaseName: deployment.leaseName, namespace: source.namespace, url: 'https://demo.contract.invalid/', expiresAt, handoff };
  const authentication = { schemaVersion: 'demo-auth-evidence.v1', runId, planId, nodeId: 'auth', attemptId, attemptNumber: 1,
    protocolDigest: sha256Text(canonicalJson(config)), leaseName: deployment.leaseName, leaseUID: source.leaseUID,
    namespace: source.namespace, immutableImage, manifestDigest, credentialDigest, secretUID: source.secretUID,
    url: exposure.url, exposureOwner: handoff.owner, exposureGeneration: handoff.exposureGeneration, expiresAt,
    observedAt: '2026-09-10T04:00:02.000Z' };
  return { invocation: { runId, planId, nodeId: 'auth', attemptId, attemptNumber: 1, timeoutMs: 3000,
    configuration: { values: config }, inputs: [
      { name: 'deployment', kind: 'value', schemaId: 'kubeclaw.kubernetes-deployment-fixture@1', value: deployment },
      { name: 'credentials', kind: 'value', schemaId: 'kubeclaw.generated-demo-credentials@1', value: credentials },
      { name: 'exposure', kind: 'value', schemaId: 'kubeclaw.public-endpoint-fixture@1', value: exposure },
    ] }, result: { counts: { total: 1, passed: 1, failed: 0, skipped: 0 }, outputs: [
      { name: 'authentication', kind: 'value', schemaId: 'kubeclaw.demo-auth-evidence@1', value: authentication },
    ], completedAt } };
}

async function importedFinalGate(registry) {
  const { job, result, status, policy } = demoImportVectors(registry, demoBundle());
  const evidenceBytes = Buffer.from('local application manifest contract vector');
  const store = new core.FileNovaGateImportStore(path.join(root, 'imports'), { recordLimits: { maximumRecords: 100, maximumBytes: 8 * 1024 ** 2, maximumRecordBytes: 2 * 1024 ** 2 }, maximumEvidenceStoreBytes: 2 * 1024 ** 2 });
  const decision = await new core.NovaRemoteGateImporter({ store,
    evidence: { async evidence(_jobId, digest) { assert.equal(digest, sha256Text(evidenceBytes.toString())); return evidenceBytes; } },
    results: { async result() { return result; } }, maximumEvidenceBytes: 2 * 1024 ** 2, maximumResultBytes: 2 * 1024 ** 2,
  }).import(job, status);
  assert.equal(decision.state, 'passed');
  return { decision, job, result, policy };
}

function writeFixturePlugin(pluginRoot, kind) {
  const fixture = path.join(pluginRoot, kind);
  fs.mkdirSync(fixture, { recursive: true });
  if (kind === 'vectors') {
    fs.writeFileSync(path.join(fixture, 'plugin.json'), JSON.stringify({ id: 'test.delivery-vectors', apiVersion: 'pipeline-plugin-v2', packageVersion: '1.0.0', observers: [], adapters: [], stages: [{ id: 'vectors', type: 'test.delivery-vectors', module: 'stage.mjs', export: 'execute', requiredCapabilities: ['artifacts.write'], configSchema: 'config.json', inputSchema: 'input.json', resultSchema: 'result.json' }] }));
    fs.writeFileSync(path.join(fixture, 'config.json'), JSON.stringify({ type: 'object', additionalProperties: false }));
    fs.writeFileSync(path.join(fixture, 'input.json'), JSON.stringify({ type: 'object', properties: { records: { type: 'array', items: { type: 'object' } } }, required: ['records'], additionalProperties: false }));
    fs.writeFileSync(path.join(fixture, 'result.json'), JSON.stringify({ type: 'object' }));
    fs.writeFileSync(path.join(fixture, 'stage.mjs'), "export async function execute(input,context){const artifacts=[];for(const record of input.records){const saved=await context.invoke('artifacts.write',{operation:'put_json',resource:{type:'artifact.object',canonicalId:record.id},payload:{namespace:record.namespace,mediaType:'application/json',value:record.value,...(record.encoding===undefined?{}:{encoding:record.encoding})}});artifacts.push(saved.artifact);}return {schemaVersion:'stage-result.v2',outcome:'passed',artifacts};}\n");
  } else {
    fs.writeFileSync(path.join(fixture, 'plugin.json'), JSON.stringify({ id: 'test.delivery-consumer', apiVersion: 'pipeline-plugin-v2', packageVersion: '1.0.0', observers: [], adapters: [], stages: [{ id: 'consume', type: 'test.delivery-consumer', module: 'stage.mjs', export: 'execute', requiredCapabilities: ['test.plan.evidence'], configSchema: 'config.json', inputSchema: 'input.json', resultSchema: 'result.json' }] }));
    fs.writeFileSync(path.join(fixture, 'config.json'), JSON.stringify({ type: 'object', additionalProperties: false }));
    fs.writeFileSync(path.join(fixture, 'input.json'), JSON.stringify({ type: 'object', properties: { operation: { const: 'demo' }, resource: { type: 'object' }, payload: { type: 'object' } }, required: ['operation', 'resource', 'payload'], additionalProperties: false }));
    fs.writeFileSync(path.join(fixture, 'result.json'), JSON.stringify({ type: 'object' }));
    fs.writeFileSync(path.join(fixture, 'stage.mjs'), "export async function execute(input,context){const value=await context.invoke('test.plan.evidence',input);return {schemaVersion:'stage-result.v2',outcome:'passed',facts:{'delivery.project-id':String(value.runId??'unknown')},artifacts:[]};}\n");
  }
}

function roots(pluginRoot) {
  return ['common', 'nova', 'buster'].map(role => path.join(repository, 'skills', role, 'plugins')).concat(pluginRoot);
}

async function produce() {
  const legacyDelivery = phase === 'produce-v2' || durabilityPhase?.[3] === 'v2';
  const pluginRoot = path.join(root, 'producer-plugins');
  writeFixturePlugin(pluginRoot, 'vectors');
  const installationRoots = roots(pluginRoot);
  const registry = core.buildRegistry(core.discoverPackages({ installationRoots, trustPolicy: { trustedBuiltinRoots: installationRoots, allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'test:delivery-stage-boundary' } }));
  const enabled = new Set(['test.delivery-vectors:vectors', 'kubeclaw.project-summary:summary']);
  const namespaces = ['kubeclaw.implementation-agent', 'kubeclaw.lint', 'kubeclaw.buster-quality-gate', 'kubeclaw.review'];
  const granted = core.resolveCapabilityGrants(registry, { enabledRegistrations: enabled, providers: new Map([['artifacts.read', 'kubeclaw.artifact-store:artifact-store'], ['artifacts.write', 'kubeclaw.artifact-store:artifact-store']]), grants: new Map([
    ['test.delivery-vectors:vectors', new Map([['artifacts.write', { allowedNamespaces: namespaces }]])],
    ['kubeclaw.project-summary:summary', new Map([['artifacts.read', { allowedNamespaces: namespaces }], ['artifacts.write', { allowedNamespaces: ['kubeclaw.project-summary'] }]])],
  ]) });
  const activated = await core.activateRegistry(granted.snapshot, new Set(granted.grants.keys()));
  const effectsFile = durabilityEffectsFile(path.join(root, 'producer-effects.jsonl'));
  const effects = new core.FileEffectJournal(effectsFile);
  instrumentKillBoundary(effects, 'write');
  const adapters = new core.AdapterRuntime({ granted, activated, configs: new Map([['kubeclaw.artifact-store:artifact-store', { artifactRoot }]]), effects: new core.EffectCoordinator(effects, undefined, undefined, new core.FileResourceLockManager(path.join(root, 'producer-locks'))), shutdownTimeoutMs: 1000, async emitDomainEvent() {} });
  await adapters.start();
  try {
    const imported = await importedFinalGate(registry);
    const finalCoverage = imported.policy;
    const moduleBase = { ...finalCoverage, kind: 'module' };
    delete moduleBase.policyDigest;
    const moduleCoverage = { ...moduleBase, policyDigest: gateCoverageDigest(moduleBase) };
    const record = (id, namespace, value, encoding) => ({ id, namespace, value,
      ...(encoding === undefined ? {} : { encoding }) });
    const stage = (id, dependsOn, records) => ({ id, type: 'test.delivery-vectors', dependsOn, config: {}, input: { records }, execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 10000 } });
    const changedManifestDigest = sha256Text('contract-vector-review-change');
    const reviewRevisions = { base: revision, head: revision, changedManifestDigest };
    const reviewBundle = { schemaVersion: 'review-bundle.v2', revisions: reviewRevisions,
      requirements: coverageReviewRequirements(finalCoverage),
      scope: { allowedPrefixes: coverageReviewPrefixes(finalCoverage) },
      evidence: [{ kind: 'gate-coverage', digest: sha256Text(canonicalJson(finalCoverage)), content: canonicalJson(finalCoverage) }] };
    const baseline = { base: revision, policyDigest: finalCoverage.policyDigest };
    const governor = { schemaVersion: 'review-governor.v2', baseline, current: { head: revision, changedManifestDigest },
      baselineId: sha256Text(portableJson({ schemaVersion: 'review-governor.v2', baseline })) };
    const reviewReport = { schemaVersion: 'review-report.v3', revision: reviewRevisions,
      outcome: 'passed', policyDigest: finalCoverage.policyDigest, changedManifestDigest,
      governor, bundleDigest: sha256Text(portableJson(reviewBundle)) };
    const definition = { schemaVersion: 'pipeline-definition.v2', id: 'delivery-manifest-stage-boundary-producer', maxConcurrency: 1, stages: [
      stage('forge', [], [record('implementation:app', 'kubeclaw.implementation-agent', { status: 'ready_for_testing', sourceRevision: revision })]),
      stage('lint', ['forge'], [record('lint:full:app', 'kubeclaw.lint', { sourceRevision: revision, summary: { tools_failed: 0, total_blocking: 0 } })]),
      stage('test', ['lint'], gateRecords('test', moduleCoverage)),
      ...(legacyDelivery ? [] : [stage('review', ['test'], [
        record('review-report:contract', 'kubeclaw.review', reviewReport, PORTABLE_JSON_ENCODING),
        record('review-bundle:contract', 'kubeclaw.review', reviewBundle, PORTABLE_JSON_ENCODING),
      ])]),
      stage('final-test', [legacyDelivery ? 'test' : 'review'], gateRecords('final-test', finalCoverage, imported.decision)),
      { id: 'project-summary', type: 'kubeclaw.report.project-summary', dependsOn: ['final-test'],
        config: legacyDelivery ? {} : { deliveryManifestEncoding: 'delivery-manifest.utf16-v1' },
        input: { projectId: 'demo', modules: [{ moduleId: 'app', sourceStageId: 'forge', testStageId: 'test', expectedCoverage: moduleCoverage }],
          final: { sourceStageId: 'forge', testStageId: 'final-test', lintStageId: 'lint',
            ...(legacyDelivery ? {} : { reviewStageId: 'review', reviewArtifactEncoding: PORTABLE_JSON_ENCODING, reviewSemanticEncoding: 'review-semantics.utf16-v1' }),
            expectedCoverage: finalCoverage } }, execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 10000 } },
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
    assert.equal(summaryWrite.payload.encoding, legacyDelivery ? undefined : PORTABLE_JSON_ENCODING,
      legacyDelivery ? 'v2 write must not gain an encoding' : 'v3 write must carry its portable encoding');
    const read = await adapters.invoke('artifacts.read', { runId, stageId: 'proof-reader', attemptId: 'proof-reader:1', attemptNumber: 1 }, 'proof:read:manifest', { operation: 'get_json_bytes', resource: { type: 'artifact.object', canonicalId: manifestRef.artifactId }, payload: { namespace: manifestRef.namespace, digest: manifestRef.digest, reference: manifestRef } }, new AbortController().signal);
    const manifest = read.value;
    const { digest, ...unsigned } = manifest;
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
      runId, sourceBaseCommit, productionSource, productionSourceDigest,
      boundary: { registeredProjectSummaryStage: true, sharedWorkerCoreLifecycle: true, actualArtifactStore: true, diskFileEffectJournal: true, upstreamArtifactContractFixtures: true, providerExecution: false, importStoreSuccess: true },
      importedGate: { jobId: imported.job.jobId, resultDigest: imported.result.resultDigest, decisionDigest: imported.decision.decisionDigest },
      manifest, unsignedManifest: unsigned,
      semanticDigest: sha256Text(legacyDelivery ? canonicalJson(unsigned) : portableJson(unsigned)), storedJsonBytes: read.jsonBytes,
      storedArtifactRef: manifestRef, readArtifactRef: read.artifact,
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
  const expectMissingImport = phase === 'consume-missing';
  const importMutation = phase.startsWith('consume-import-') ? phase.slice('consume-import-'.length) : undefined;
  const expectImportRejection = importMutation !== undefined;
  const refMutation = phase.startsWith('consume-wrong-') ? phase.slice('consume-wrong-'.length) : undefined;
  const bodyMutation = phase.startsWith('consume-body-') ? phase.slice('consume-body-'.length) : undefined;
  const expectManifestRejection = refMutation !== undefined || bodyMutation !== undefined;
  const expectGateBindingRejection = bodyMutation === 'coverage';
  const producer = JSON.parse(fs.readFileSync(path.join(root, 'producer-proof.json'), 'utf8'));
  const pluginRoot = path.join(root, `consumer-${phase}-plugins`);
  writeFixturePlugin(pluginRoot, 'consumer');
  writeFixturePlugin(pluginRoot, 'vectors');
  const installationRoots = roots(pluginRoot);
  const registry = core.buildRegistry(core.discoverPackages({ installationRoots, trustPolicy: { trustedBuiltinRoots: installationRoots, allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: `test:delivery-consumer:${phase}` } }));
  const consumerId = 'test.delivery-consumer:consume';
  const evidenceId = 'kubeclaw.remote-test-gate:evidence';
  const enabled = new Set([consumerId, evidenceId, 'test.delivery-vectors:vectors']);
  const granted = core.resolveCapabilityGrants(registry, { enabledRegistrations: enabled, providers: new Map([['test.plan.evidence', evidenceId], ['artifacts.read', 'kubeclaw.artifact-store:artifact-store'], ['artifacts.write', 'kubeclaw.artifact-store:artifact-store']]), grants: new Map([
    [consumerId, new Map([['test.plan.evidence', { allowedNamespaces: ['kubeclaw.project-summary'] }]])],
    [evidenceId, new Map([['artifacts.read', { allowedNamespaces: ['kubeclaw.project-summary', 'kubeclaw.buster-quality-gate'] }]])],
    ['test.delivery-vectors:vectors', new Map([['artifacts.write', { allowedNamespaces: ['kubeclaw.project-summary'] }]])],
  ]) });
  const activated = await core.activateRegistry(granted.snapshot, new Set(granted.grants.keys()));
  const effectsFile = durabilityEffectsFile(path.join(root, `${phase}-effects.jsonl`));
  const effects = new core.FileEffectJournal(effectsFile);
  instrumentKillBoundary(effects, 'read');
  const adapters = new core.AdapterRuntime({ granted, activated, configs: new Map([
    ['kubeclaw.artifact-store:artifact-store', { artifactRoot }],
    [evidenceId, { stateRoot: root, manifestStageId: 'project-summary', gateStageId: 'final-test' }],
  ]), effects: new core.EffectCoordinator(effects, undefined, undefined, new core.FileResourceLockManager(path.join(root, `${phase}-locks`))), shutdownTimeoutMs: 1000, async emitDomainEvent() {} });
  await adapters.start();
  try {
    let ref = structuredClone(producer.storedArtifactRef);
    if (refMutation === 'digest') ref.digest = sha256Text('wrong manifest digest');
    else if (refMutation === 'missing-digest') delete ref.digest;
    else if (refMutation === 'size') ref.sizeBytes += 1;
    else if (refMutation === 'missing-tag') delete ref.encoding;
    else if (refMutation === 'tag') ref.encoding = 'legacy-json';
    else if (refMutation === 'id') ref.artifactId += ':foreign';
    else if (refMutation === 'run') ref.producer.runId = 'foreign-run';
    else if (refMutation === 'stage') ref.producer.stageId = 'foreign-stage';
    else if (refMutation === 'namespace') ref.namespace = 'foreign.namespace';
    else if (refMutation === 'media') ref.mediaType = 'text/plain';
    else if (refMutation === 'missing-media') delete ref.mediaType;
    if (bodyMutation) {
      const changed = structuredClone(producer.manifest);
      if (bodyMutation === 'missing-inner-digest') delete changed.digest;
      else if (bodyMutation === 'wrong-inner-digest') changed.digest = sha256Text('wrong semantic digest');
      else if (bodyMutation === 'unknown-key') changed.unknown = true;
      else if (bodyMutation === 'oversize') changed.unknown = 'x'.repeat(8 * 1024 * 1024);
      else if (bodyMutation === 'gate') changed.final.testStageId = 'foreign-gate';
      else if (bodyMutation === 'coverage') {
        changed.final.coverage.checks[0].state = 'failed';
        const { coverageDigest: _coverageDigest, ...unsignedCoverage } = changed.final.coverage;
        changed.final.coverage.coverageDigest = sha256Text(canonicalJson(unsignedCoverage));
      } else if (bodyMutation === 'source') changed.final.sourceRevision = 'b'.repeat(40);
      else if (bodyMutation === 'review') changed.final.reviewStageId = 'foreign-review';
      if (!['missing-inner-digest', 'wrong-inner-digest', 'competing'].includes(bodyMutation)) {
        const { digest: _digest, ...unsignedManifest } = changed;
        changed.digest = sha256Text(portableJson(unsignedManifest));
      }
      const saved = await adapters.invoke('artifacts.write', { runId, stageId: 'project-summary', attemptId: `mutation:${bodyMutation}`, attemptNumber: 2 },
        `mutation:${bodyMutation}`, { operation: 'put_json', resource: { type: 'artifact.object', canonicalId: ref.artifactId },
          payload: { namespace: ref.namespace, mediaType: 'application/json', value: changed, encoding: PORTABLE_JSON_ENCODING } }, new AbortController().signal);
      if (bodyMutation !== 'competing') ref = saved.artifact;
    }
    const request = { operation: 'demo', resource: { type: 'test.plan.evidence', canonicalId: ref.artifactId }, payload: { manifest: ref, namespace: 'kubeclaw.project-summary', authNodeId: 'auth' } };
    const definition = { schemaVersion: 'pipeline-definition.v2', id: `delivery-manifest-stage-boundary-${phase}`, maxConcurrency: 1, stages: [{ id: 'consume', type: 'test.delivery-consumer', dependsOn: [], config: {}, input: request, execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 10000 } }] };
    const runner = new core.PipelineRunner({ definition, registry: granted, activated, adapters, journal: new core.FileJournal(path.join(root, `${phase}-lifecycle.jsonl`)), orchestratorIssuerId: 'test:delivery-stage-boundary' });
    const result = await runner.run(runId);
    assert.equal(result.status, expectMissingImport || expectManifestRejection || expectImportRejection ? 'blocked' : 'succeeded');
    const recovery = await effects.recoveryEntries();
    const top = recovery.map(item => item.request).find(item => item.capability === 'test.plan.evidence');
    assert(top, 'original evidence adapter request missing');
    const receipt = await effects.receipt(top.idempotencyKey);
    assert.equal(receipt?.status, expectMissingImport || expectManifestRejection || expectImportRejection ? 'failed' : 'completed');
    if (expectMissingImport) assert.equal(receipt?.error?.message, 'NOVA_VERIFIED_OUTPUT_IMPORT_REQUIRED');
    if (expectManifestRejection) assert.match(receipt?.error?.message ?? '', /ARTIFACT_|MANIFEST_INVALID|CANONICAL_JSON_|GATE_NOT_PASSED/);
    if (expectImportRejection) {
      const required = ['pending', 'missing-result', 'schema'].includes(importMutation);
      assert.equal(receipt?.error?.message, required ? 'NOVA_VERIFIED_OUTPUT_IMPORT_REQUIRED' : 'NOVA_VERIFIED_OUTPUT_BINDING_MISMATCH');
      assert.equal(receipt.result, undefined);
      const reads = recovery.filter(item => item.request.capability === 'artifacts.read');
      assert.equal(reads.length, 2, 'import rejection must follow real manifest and decision reads');
      for (const item of reads) assert.equal((await effects.receipt(item.request.idempotencyKey))?.status, 'completed');
    }
    const nestedRead = recovery.map(item => item.request).find(item => item.capability === 'artifacts.read');
    const nestedReceipt = nestedRead ? await effects.receipt(nestedRead.idempotencyKey) : undefined;
    const allConsumerEffects = await Promise.all(recovery.map(async item => ({ ...item, receipt: await effects.receipt(item.request.idempotencyKey) })));
    const exactConsumerEffectJournalJsonl = fs.readFileSync(effectsFile, 'utf8');
    const boundedOversizeEffects = bodyMutation === 'oversize' ? allConsumerEffects.map(item => ({
      request: {
        effectId: item.request.effectId, idempotencyKey: item.request.idempotencyKey,
        attempt: item.request.attempt, capability: item.request.capability,
        operation: item.request.operation, resource: item.request.resource,
      },
      receipt: item.receipt ? {
        status: item.receipt.status, error: item.receipt.error,
        artifact: item.receipt.result?.artifact,
      } : undefined,
    })) : allConsumerEffects;
    const proof = {
      schemaVersion: 'delivery-manifest-stage-consumer-boundary.v1', phase,
      locale: Intl.DateTimeFormat().resolvedOptions().locale, runId,
      sameStoredArtifactRef: ref, originalEvidenceAdapter: evidenceId,
      outcome: result.status, error: receipt.error,
      storedSemanticDigest: producer.semanticDigest,
      recomputedSemanticDigest: sha256Text(portableJson(producer.unsignedManifest)),
      parsedManifestMatchesProducer: portableJson(producer.manifest) === portableJson(JSON.parse(producer.storedJsonBytes)),
      boundary: { manifestIntegrityRejected: expectManifestRejection && !expectGateBindingRejection, gateBindingRejected: expectGateBindingRejection,
        importStoreReached: !expectManifestRejection, providerExecution: false, importedResultSuccess: !expectMissingImport && !expectManifestRejection && !expectImportRejection,
        importBindingRejected: expectImportRejection,
        missingImportRejected: expectMissingImport && receipt?.error?.message === 'NOVA_VERIFIED_OUTPUT_IMPORT_REQUIRED' },
      evidenceRequest: top, evidenceReceipt: receipt,
      nestedArtifactRead: nestedRead ? { request: nestedRead, receipt: nestedReceipt } : null,
      allConsumerEffects: boundedOversizeEffects,
      ...(bodyMutation === 'oversize' ? { exactConsumerEffectJournal: {
        retainedInline: false,
        sizeBytes: Buffer.byteLength(exactConsumerEffectJournalJsonl, 'utf8'),
        sha256: sha256Text(exactConsumerEffectJournalJsonl),
        reason: 'bounded checked-in evidence; the native 8 MiB payload was executed and its raw journal is hashed here',
      } } : { exactConsumerEffectJournalJsonl }),
      exactConsumerLifecycleJournalJsonl: fs.readFileSync(path.join(root, `${phase}-lifecycle.jsonl`), 'utf8'),
    };
    fs.writeFileSync(path.join(root, `${phase}-proof.json`), JSON.stringify(proof, null, 2) + '\n');
    console.log(JSON.stringify({ phase, locale: proof.locale, outcome: result.status, importedResultSuccess: proof.boundary.importedResultSuccess, manifestIntegrityRejected: proof.boundary.manifestIntegrityRejected, importStoreReached: proof.boundary.importStoreReached }));
  } finally { await adapters.shutdown(); }
}

async function replayDurableBoundary() {
  assert(durabilityPhase?.[1] === 'replay');
  const target = durabilityPhase[2];
  const mode = durabilityPhase[3];
  const boundary = durabilityPhase[4];
  const pluginRoot = path.join(root, target === 'write' ? 'producer-plugins' : `consumer-kill-read-${mode}-${boundary}-plugins`);
  if (target === 'write') writeFixturePlugin(pluginRoot, 'vectors');
  else { writeFixturePlugin(pluginRoot, 'consumer'); writeFixturePlugin(pluginRoot, 'vectors'); }
  const installationRoots = roots(pluginRoot);
  const registry = core.buildRegistry(core.discoverPackages({ installationRoots, trustPolicy: {
    trustedBuiltinRoots: installationRoots, allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
    verifierId: `test:delivery-durability-replay:${target}:${mode}:${boundary}`,
  } }));
  const summaryId = 'kubeclaw.project-summary:summary';
  const consumerId = 'test.delivery-consumer:consume';
  const evidenceId = 'kubeclaw.remote-test-gate:evidence';
  const enabled = target === 'write' ? new Set([summaryId]) : new Set([consumerId, evidenceId]);
  const providers = new Map([['artifacts.read', 'kubeclaw.artifact-store:artifact-store'], ['artifacts.write', 'kubeclaw.artifact-store:artifact-store']]);
  if (target === 'read') providers.set('test.plan.evidence', evidenceId);
  const grants = target === 'write'
    ? new Map([[summaryId, new Map([['artifacts.read', { allowedNamespaces: ['kubeclaw.implementation-agent'] }],
      ['artifacts.write', { allowedNamespaces: ['kubeclaw.project-summary'] }]])]])
    : new Map([[consumerId, new Map([['test.plan.evidence', { allowedNamespaces: ['kubeclaw.project-summary'] }]])],
      [evidenceId, new Map([['artifacts.read', { allowedNamespaces: ['kubeclaw.project-summary', 'kubeclaw.buster-quality-gate'] }]])]]);
  const granted = core.resolveCapabilityGrants(registry, { enabledRegistrations: enabled, providers, grants });
  const activated = await core.activateRegistry(granted.snapshot, new Set(granted.grants.keys()));
  const effectsFile = durabilityEffectsFile('unreachable');
  const effects = new core.FileEffectJournal(effectsFile);
  const targetCapability = target === 'write' ? 'artifacts.write' : 'test.plan.evidence';
  const beforeEntries = await effects.recoveryEntries();
  const prior = beforeEntries.map(item => item.request).find(request => request.capability === targetCapability
    && (target !== 'write' || request.attempt.stageId === 'project-summary'));
  assert(prior, `durable ${target} request missing`);
  const priorBytes = portableJson(prior);
  const audit = [];
  const auditSink = {
    requested(request) { audit.push({ type: 'requested', request }); },
    accepted(request) { audit.push({ type: 'accepted', request }); },
    completed(request, receipt) { audit.push({ type: 'completed', request, receipt }); },
  };
  const configs = new Map([['kubeclaw.artifact-store:artifact-store', { artifactRoot }],
    [evidenceId, { stateRoot: root, manifestStageId: 'project-summary', gateStageId: 'final-test' }]]);
  const adapters = new core.AdapterRuntime({ granted, activated, configs,
    effects: new core.EffectCoordinator(effects, undefined, auditSink, new core.FileResourceLockManager(path.join(root, `durability-${target}-${mode}-${boundary}-replay-locks`))),
    shutdownTimeoutMs: 1000, async emitDomainEvent() {} });
  await adapters.start();
  let outcome = 'completed', error;
  try {
    const invocation = { operation: prior.operation, resource: prior.resource, payload: prior.payload };
    try { await adapters.invoke(targetCapability, prior.attempt, prior.idempotencyKey, invocation, new AbortController().signal, prior.deliveryId); }
    catch (caught) { outcome = 'rejected'; error = caught instanceof Error ? caught.message : String(caught); }
  } finally { await adapters.shutdown(); }
  const afterEntries = await effects.recoveryEntries();
  const after = afterEntries.map(item => item.request).find(request => request.idempotencyKey === prior.idempotencyKey);
  assert(after); assert.equal(portableJson(after), priorBytes, 'recovery must retain the identical durable request');
  const targetAccepts = audit.filter(item => item.type === 'accepted' && item.request.capability === targetCapability);
  if (boundary === 'accepted') {
    assert.equal(outcome, 'rejected'); assert.match(error, /EFFECT_RECOVERY_RECEIPT_UNAVAILABLE/);
    assert.equal(targetAccepts.length, 0, 'accepted-without-receipt must not reinvoke the adapter');
  } else {
    assert.equal(outcome, 'completed', error);
    assert.equal(targetAccepts.length, boundary === 'requested' ? 1 : 0,
      boundary === 'completed' ? 'completed replay must not reinvoke the adapter' : 'requested-only replay invokes once');
  }
  if (target === 'write') {
    assert.equal(prior.payload.value.schemaVersion, mode === 'v2' ? 'delivery-manifest.v2' : 'delivery-manifest.v3');
    assert.equal(prior.payload.encoding, mode === 'v2' ? undefined : PORTABLE_JSON_ENCODING);
  } else if (boundary === 'requested') {
    const nested = afterEntries.map(item => item.request).find(request => request.capability === 'artifacts.read');
    assert(nested); assert.equal(nested.operation, 'get_latest_json_bytes');
    assert.equal(nested.resource.canonicalId, prior.payload.manifest.artifactId);
    assert.equal(nested.payload.namespace, 'kubeclaw.project-summary');
    assert.equal(Object.hasOwn(nested.payload, 'reference'), false,
      'downstream reader retains its historical latest-read request shape');
  }
  const proof = { schemaVersion: 'delivery-manifest-durability-replay.v1', phase, target, mode, boundary,
    killedSignal: 'SIGKILL', outcome, ...(error ? { error } : {}), exactRequestRetained: true,
    sourceBaseCommit, productionSourceDigest,
    durabilityChildDigest: sha256Text(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')),
    requestDigest: sha256Text(priorBytes),
    requestSchemaVersion: prior.payload.value?.schemaVersion ?? JSON.parse(fs.readFileSync(path.join(root, 'producer-proof.json'), 'utf8')).manifest.schemaVersion,
    requestEncoding: prior.payload.encoding ?? null,
    manifestArtifactEncoding: target === 'write' ? prior.payload.encoding ?? null
      : JSON.parse(fs.readFileSync(path.join(root, 'producer-proof.json'), 'utf8')).storedArtifactRef.encoding ?? null,
    adapterAcceptedCount: targetAccepts.length, totalNewAuditRecords: audit.length,
    journalRecordsBefore: beforeEntries.length, journalRecordsAfter: afterEntries.length,
    journalRecordsAppended: afterEntries.length - beforeEntries.length };
  fs.writeFileSync(path.join(root, `durability-${target}-${mode}-${boundary}-replay.json`), JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify(proof));
}

if (phase === 'produce' || phase === 'produce-v2' || durabilityPhase?.[1] === 'kill' && durabilityPhase[2] === 'write') await produce();
else if (durabilityPhase?.[1] === 'replay') await replayDurableBoundary();
else if (['consume-en', 'consume-cs', 'consume-da', 'consume-tr', 'consume-sv',
  'consume-wrong-digest', 'consume-wrong-size', 'consume-wrong-tag', 'consume-wrong-run', 'consume-wrong-stage',
  'consume-wrong-missing-digest', 'consume-wrong-missing-tag', 'consume-wrong-id', 'consume-wrong-namespace',
  'consume-wrong-media', 'consume-wrong-missing-media',
  'consume-body-missing-inner-digest', 'consume-body-wrong-inner-digest', 'consume-body-unknown-key', 'consume-body-oversize',
  'consume-body-gate', 'consume-body-coverage', 'consume-body-source', 'consume-body-review', 'consume-body-competing',
  'consume-missing', 'consume-import-pending', 'consume-import-missing-result', 'consume-import-schema',
  'consume-import-job', 'consume-import-run', 'consume-import-stage', 'consume-import-source',
  'consume-import-plan', 'consume-import-result', 'consume-import-receipt', 'consume-import-stored-digest',
  'consume-import-result-job'].includes(phase) || durabilityPhase?.[1] === 'kill' && durabilityPhase[2] === 'read') await consume();
else throw new Error(`unknown phase: ${phase}`);
