// Native, local input validation. Construction/compilation is never runtime proof.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { compileProject } from '../skills/nova/project/compiler.ts';
import { PROJECT_REVIEW_SEMANTIC_ENCODING } from '../skills/nova/project/review-semantics.ts';
import { DELIVERY_MANIFEST_ENCODING } from '../skills/nova/project/delivery-manifest.ts';
import { canonicalJson, PORTABLE_JSON_ENCODING } from '../skills/common/plugin-runtime/sdk/src/index.ts';
import { parsePluginManifest, validateContractValue, validateReferencedSchema } from '../skills/common/plugin-runtime/foundation/registry/schema.ts';
import { loadPlatformConfig } from '../skills/common/plugin-runtime/foundation/config/platform.ts';
import { buildGraph } from '../skills/nova/core/execution/graph-build.ts';
import { expandSwarmConfig } from '../tests/verification/e2e/support/platform-config.ts';
import { loadProductionBusterRemotePlanRuntime } from '../skills/buster/engine/test-gates/production.ts';
import { developmentDocument } from '../skills/prism/studio/dev-fixture.ts';
import { validatePrism } from '../contracts/prism/v1/src/index.ts';
import { execute as prismDesign } from '../skills/nova/plugins/prism-design/src/stage.ts';
import { validateSignal } from '../skills/nova/core/execution/engine-snapshots.ts';
import { parseDeclaration } from '../skills/nova/plugins/preflight-contract/src/declarations.ts';
import { publishJsonPair, readPublishedPair } from '../skills/common/plugin-runtime/foundation/config/published-pair.ts';
import { receiverReceipt } from '../skills/common/plugins/operator-messaging/src/receiver.ts';
import { discoverPackages } from '../skills/common/plugin-runtime/foundation/registry/discovery.ts';
import { buildRegistry } from '../skills/common/plugin-runtime/foundation/registry/build.ts';
import { resolveCapabilityGrants } from '../skills/common/plugin-runtime/foundation/registry/capabilities.ts';
import { validateRuntimeRegistrationConfiguration } from '../skills/common/plugin-runtime/foundation/registry/configuration.ts';
import { validatePipelineDefinitionAgainstRegistry } from '../skills/nova/core/execution/runner.ts';
import { loadPipelineTestScope } from '../skills/nova/core/test-gates/pipeline.ts';
import { resolveTestPlan } from '../skills/nova/core/test-gates/resolver.ts';
import { parseApprovalGuidance } from '../skills/nova/plugins/human-approval/src/approval.ts';

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const compile = value => compileProject(value, PORTABLE_JSON_ENCODING, PORTABLE_JSON_ENCODING,
  PROJECT_REVIEW_SEMANTIC_ENCODING, DELIVERY_MANIFEST_ENCODING);

function withExampleDirectory(operation) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-publication-examples-'));
  try { return operation(directory); }
  finally { fs.rmSync(directory, { recursive: true, force: false }); }
}

async function withAsyncExampleDirectory(operation) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-publication-examples-'));
  try { return await operation(directory); }
  finally { fs.rmSync(directory, { recursive: true, force: false }); }
}

function registryFor(roots, externalTrust = { allowedSourceDigests: {}, verifiedAttestations: {} }, trustedBuiltinRoots = roots) {
  return buildRegistry(discoverPackages({ installationRoots: roots, trustPolicy: {
    trustedBuiltinRoots, allowedSourceDigests: new Map(Object.entries(externalTrust.allowedSourceDigests)),
    verifiedAttestations: new Map(Object.entries(externalTrust.verifiedAttestations)), verifierId: 'docs:example-validation',
  }, now: () => new Date('2026-09-19T00:00:00Z') }));
}

export function validateTestScopeExample(root, value, scope, matrix = false) {
  return withExampleDirectory(directory => {
    const swarm = path.join(directory, '.swarm');
    fs.mkdirSync(swarm);
    const file = path.join(swarm, 'pipeline.json');
    fs.writeFileSync(file, JSON.stringify(value), { flag: 'wx' });
    fs.writeFileSync(path.join(swarm, 'progress.json'), '{}', { flag: 'wx' });
    const loaded = loadPipelineTestScope(file, scope);
    const limits = { cpuMillis: 900000, memoryBytes: 2147483648, logBytes: 16777216,
      artifactBytes: 268435456, artifactFiles: 256, processes: 64 };
    const suites = path.join(root, 'contracts/pipeline-test-gate/v1/suites');
    const plan = resolveTestPlan({ planId: 'plan:docs:example', runId: 'run:docs:example',
      project: loaded.project, scope, createdAt: '2026-09-19T00:00:00.000Z', declaration: loaded.declaration,
      suiteTemplates: matrix ? fs.readdirSync(suites).filter(name => name.endsWith('.json'))
        .sort().map(name => JSON.parse(fs.readFileSync(path.join(suites, name), 'utf8'))) : [],
      registry: registryFor([path.join(root, 'skills/buster/plugins')]),
      facts: matrix ? { changedPaths: ['k8s/deployment.yaml'], moduleType: 'service', pipelineStage: 'test' }
        : { changedPaths: [], moduleType: null, pipelineStage: null },
      policy: { defaultTimeoutMs: 900000, maximumTimeoutMs: 3600000, defaultLimits: limits, maximumLimits: limits,
        maximumRetryCount: 1, maximumMatrixSize: 8, maximumNodes: 16, defaultConcurrencyLimit: 1,
        maximumConcurrencyLimits: { unit: 4, http: 8 }, reportAdapters: new Map([['junit', 'kubeclaw.junit-report:junit']]) } });
    if (matrix) {
      assert.equal(plan.project, 'example-web');
      assert.deepEqual(plan.nodes.map(node => node.id),
        ['deployment', 'http/matrix-001', 'http/matrix-002', 'unit/checked-manifest', 'unit/unit']);
      assert.equal(plan.nodes.find(node => node.id === 'deployment').kind, 'fixture');
      assert.equal(plan.nodes.filter(node => node.parentNodeId === 'http').length, 2);
      const unit = plan.nodes.find(node => node.id === 'unit/unit');
      assert.equal(unit.configuration.values.resultMode, 'junit-required');
      assert(unit.reportAdapters.some(adapter => adapter.adapterId === 'junit'
        && adapter.package.packageId === 'kubeclaw.junit-report'));
      assert.equal(plan.links.length, 3);
      assert(plan.links.some(link => link.from.nodeId === 'unit/checked-manifest'
        && link.to.nodeId === 'deployment' && link.kind === 'artifact'));
      assert.equal(plan.links.filter(link => link.from.nodeId === 'deployment'
        && link.to.nodeId.startsWith('http/matrix-') && link.kind === 'value').length, 2);
    } else {
      assert.equal(plan.project, 'sample');
      assert.equal(plan.nodes.length, 1);
      const [unit] = plan.nodes;
      assert.equal(unit.id, 'unit'); assert.equal(unit.mode, 'blocking'); assert.equal(unit.retryCount, 0);
      assert.equal(unit.provider.contractId, 'kubeclaw.direct-command@1');
      assert.deepEqual(unit.configuration.values, { executable: 'npm', args: ['test'],
        workingDirectory: '.', resultMode: 'exit-code' });
      assert.deepEqual(plan.concurrencyLimits, { unit: 1 });
    }
    return { plan, providerExecution: false, syntheticProgressCompanion: true };
  });
}

export function validateWaitTemplate(root, template, definition, capabilityProjection) {
  assert.deepEqual(capabilityProjection, { providers: template.providers, grants: template.grants });
  return withExampleDirectory(directory => {
    const value = structuredClone(template);
    const originalDirectory = path.join(root, 'docs/site/use/workflows/wait-resume');
    for (const field of ['installationRoots', 'trustedBuiltinRoots']) {
      value[field] = value[field].map(item => path.resolve(originalDirectory, item));
    }
    assert.equal(value.adapters['kubeclaw.operator-messaging:operator'].deliveryRoot, 'REPLACE_WITH_ABSOLUTE_DELIVERY_ROOT');
    assert.equal(value.adapters['kubeclaw.wait-store:waits'].root, 'REPLACE_WITH_ABSOLUTE_WAIT_ROOT');
    assert.equal(value.storageRoot, 'REPLACE_WITH_ABSOLUTE_CORE_ROOT');
    value.adapters['kubeclaw.operator-messaging:operator'].deliveryRoot = path.join(directory, 'delivery');
    value.adapters['kubeclaw.wait-store:waits'].root = path.join(directory, 'wait');
    value.storageRoot = path.join(directory, 'core');
    const file = path.join(directory, 'platform.json');
    fs.writeFileSync(file, JSON.stringify(value), { flag: 'wx' });
    const platform = loadPlatformConfig(file);
    validateContractValue('pipelineDefinition', definition);
    const snapshot = registryFor(platform.installationRoots, platform.externalTrust, platform.trustedBuiltinRoots);
    const enabled = new Set([...Object.keys(platform.observers), ...platform.activeAdapters]);
    for (const stage of definition.stages) {
      const owner = snapshot.stages.get(stage.type);
      if (!owner) throw new Error(`PIPELINE_STAGE_OWNER_MISSING:${stage.type}`);
      enabled.add(`${owner.package.manifest.id}:${owner.registration.id}`);
    }
    const granted = resolveCapabilityGrants(snapshot, { enabledRegistrations: enabled,
      providers: new Map(Object.entries(platform.providers)),
      grants: new Map(Object.entries(platform.grants).map(([id, grants]) => [id, new Map(Object.entries(grants))])) });
    validateRuntimeRegistrationConfiguration(snapshot, granted.enabledRegistrations, {
      stages: definition.stages.map(({ type, config }) => ({ type, config })),
      observers: new Map(Object.entries(platform.observers)), adapters: new Map(Object.entries(platform.adapters)) });
    validatePipelineDefinitionAgainstRegistry(definition, granted);
    assert(enabled.has('kubeclaw.human-approval:approval'));
    return { nativeSchemaGraphConfigurationAndGrants: true,
      enabledRegistrations: [...granted.enabledRegistrations].sort(),
      placeholderMaterialization: true, activation: false, deliveryOrResumeExecution: false };
  });
}

export async function validatePublishedPairExample(pipeline) {
  return withAsyncExampleDirectory(async directory => {
    const names = ['progress.json', 'pipeline.json'];
    const values = [{ fixture: 'docs-progress' }, pipeline];
    await publishJsonPair(directory, names, values);
    assert.deepEqual(readPublishedPair(directory, names), values);
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, '.scaffold-publication/current.json'), 'utf8'));
    const members = names.map((name, index) => {
      const bytes = `${JSON.stringify(values[index], null, 2)}\n`;
      return { name, digest: digest(bytes), bytes: Buffer.byteLength(bytes) };
    });
    assert.deepEqual(manifest.members, members);
    assert.equal(manifest.generation, digest(JSON.stringify(members.map(({ name, digest, bytes }) => [name, digest, bytes]))));
    return { nativePublishAndVerifiedRead: true, syntheticProgressCompanion: true, manifest,
      productionScaffoldOrAtomicReceiverProof: false };
  });
}

export async function validateReceiverExample() {
  const deliveryId = 'delivery:docs:fixture', body = '{"example":"receiver-fixture"}', secret = 'docs-fixture-only';
  const payloadDigest = digest(body);
  const receipt = { protocol: 'kubeclaw.operator-delivery.v1', deliveryId, payloadDigest,
    status: 'accepted', messageId: 'message:docs:fixture' };
  let calls = 0;
  const result = await receiverReceipt({ invokeConfidential: async (capability, request) => {
    calls++;
    assert.equal(capability, 'network.http');
    assert.equal(request.operation, 'request');
    assert.equal(request.resource.type, 'network.url');
    const url = new URL('https://receiver.invalid/receipts?keep=1');
    url.searchParams.set('deliveryId', deliveryId); url.searchParams.set('payloadDigest', payloadDigest);
    assert.equal(request.resource.canonicalId, url.href);
    assert.deepEqual(request.payload, { method: 'GET', headers: { 'x-kubeclaw-signature':
      `v1=${crypto.createHmac('sha256', secret).update(`${deliveryId}.${payloadDigest}`).digest('hex')}` } });
    return { status: 200, body: receipt };
  } }, 'https://receiver.invalid/receipts?keep=1', deliveryId, body, secret);
  assert.equal(calls, 1); assert.deepEqual(result, { messageId: receipt.messageId });
  return { nativeConsumer: true, confidentialFixtureCalls: calls, networkRequests: 0,
    durableReceiverOrDeliveryAuthority: false };
}

export function validateApprovalSignalExample(value, materialize = false) {
  validateContractValue('resumeSignal', value);
  const signal = structuredClone(value);
  if (materialize) {
    assert.equal(signal.signalId, 'signal:REPLACE_WITH_NEW_DECISION_ID');
    assert.equal(signal.idempotencyKey, 'signal:REPLACE_WITH_NEW_DECISION_ID');
    assert.equal(signal.waitId, 'wait:REPLACE_FROM_DURABLE_WAIT');
    assert.equal(signal.issuedAt, '2000-01-01T00:00:00.000Z');
    signal.signalId = 'signal:publication:decision'; signal.idempotencyKey = signal.signalId;
    signal.waitId = 'wait:publication:approval'; signal.issuedAt = '2026-10-20T00:00:01.000Z';
  }
  const wait = { schemaVersion: 'wait-request.v2', waitId: signal.waitId,
    kind: 'signal', signalType: 'approval.resolved', authorizedIssuer: signal.issuer, expiresAt: null };
  validateContractValue('waitRequest', wait);
  validateSignal(wait, signal, materialize ? '2026-10-20T00:00:00.000Z' : signal.issuedAt);
  const guidance = parseApprovalGuidance(signal.payload, signal.issuer.id);
  assert.equal(guidance.decision, 'approved');
  return { canonicalEnvelopeAndNativePayload: true, fixtureWaitBinding: true,
    placeholderMaterialization: materialize, activeRunResumeOrHumanIdentityProof: false };
}

export function validatePublishedPairManifestTemplate(template) {
  assert.deepEqual(template, { schemaVersion: 'published-json-pair.v1',
    generation: '<64 lowercase hex characters>', members: [
      { name: 'progress.json', digest: '<64 lowercase hex>', bytes: 123 },
      { name: 'pipeline.json', digest: '<64 lowercase hex>', bytes: 456 }] });
  return { literalShapeTemplate: true, literalNativeManifestAdmission: false };
}

export async function validateReceiverReceiptTemplate(template) {
  assert.deepEqual(template, { protocol: 'kubeclaw.operator-delivery.v1',
    deliveryId: '<exact requested deliveryId>', payloadDigest: '<exact requested lowercase SHA-256 hex>',
    status: 'accepted', messageId: '<nonempty receiver ID, at most 512 characters>' });
  return { placeholderShapeMatched: true, materializedNativeConsumer: await validateReceiverExample() };
}

export function validateProjectFactories(root) {
  return withExampleDirectory(parent => {
    const home = path.join(parent, 'home');
    const bin = path.join(parent, 'bin');
    const empty = path.join(parent, 'empty-git-configuration');
    for (const directory of [home, bin, empty]) fs.mkdirSync(directory, { mode: 0o700 });
    // One factory invokes Git by name. Resolve it to the fixed system binary,
    // with no caller PATH, config, templates, hooks, prompts or Git environment.
    fs.symlinkSync('/usr/bin/git', path.join(bin, 'git'));
    const environment = { PATH: `${bin}:/usr/bin:/bin`, HOME: home,
      XDG_CONFIG_HOME: home, LANG: 'C.UTF-8', TZ: 'UTC',
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_TEMPLATE_DIR: empty, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'core.hooksPath', GIT_CONFIG_VALUE_0: empty,
      GIT_CONFIG_KEY_1: 'init.templateDir', GIT_CONFIG_VALUE_1: empty };
    return ['first-project', 'compiled-project-input'].map(name => {
      const source = path.join(root, 'docs/site/use/workflows/examples', `${name}.mjs`);
      const destination = path.join(parent, name);
      const output = JSON.parse(execFileSync(process.execPath, [source, destination], {
        cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024,
        env: environment,
      }));
      assert.equal(output.execution, false);
      assert.equal(output.platformAdmission, false);
      const project = JSON.parse(fs.readFileSync(path.join(destination, 'project.json'), 'utf8'));
      const definition = JSON.parse(fs.readFileSync(path.join(destination, 'compiled.json'), 'utf8'));
      assert.deepEqual(compile(project).definition, definition);
      assert.equal(definition.stages.length, 8);
      validateContractValue('pipelineDefinition', definition);
      buildGraph(definition.stages);
      assert.equal(execFileSync('/usr/bin/git', ['-C', project.repositoryRoot, 'status', '--porcelain'],
        { encoding: 'utf8', env: environment }), '');
      return { source: path.relative(root, source), sourceSha256: digest(fs.readFileSync(source)),
        stages: definition.stages.map(stage => stage.id), compiledDefinitionSha256: digest(canonicalJson(definition)),
        factoryInvoked: true, pipelineExecution: false, platformAdmission: false, lintPolicyAdmission: false,
        privateGitConfiguration: true, callerPathAndGitConfigurationInherited: false };
    });
  });
}

export function validateManifestExample(source, location) {
  return parsePluginManifest(source, location);
}

export function validateGraphExample(value) {
  validateContractValue('pipelineDefinition', value);
  buildGraph(value.stages);
}

export function validatePlatformExample(value) {
  return withExampleDirectory(directory => {
    const file = path.join(directory, 'platform.json');
    fs.writeFileSync(file, JSON.stringify(value), { flag: 'wx' });
    const config = loadPlatformConfig(file);
    return { schemaVersion: config.schemaVersion, installationRoots: config.installationRoots,
      activation: false, packageDiscovery: false };
  });
}

export function validateCompactExamples(overrides, shipped, chartSource) {
  const original = structuredClone(overrides);
  const effective = expandSwarmConfig(overrides);
  assert.deepEqual(overrides, original, 'compact expander mutated its input');
  assert.equal(effective.project, 'override-project');
  assert.equal(effective.repo_root, '/override-repository');
  assert.equal(effective.run_id, 'override-run');
  assert.equal(effective.paths.example, '/raw-repository/example');
  const { _doc, ...chart } = chartSource;
  assert.deepEqual(shipped, chart, 'published compact chart input differs from its source');
  const shippedEffective = expandSwarmConfig(structuredClone(shipped));
  return { nativeOverrideProjection: true, shippedExpanded: typeof shippedEffective === 'object',
    universalRuntimeTypeValidation: false };
}

export function validateBusterExample(root, value) {
  return withExampleDirectory(directory => {
    const platform = { schemaVersion: 'pipeline-platform.v2',
      installationRoots: [path.join(root, 'skills/buster/plugins')],
      trustedBuiltinRoots: [path.join(root, 'skills/buster/plugins')],
      externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} },
      providers: {}, grants: {}, adapters: {}, observers: {}, activeAdapters: [],
      storageRoot: './platform-state', shutdownTimeoutMs: 5000,
      orchestratorIssuerId: 'publication-example-fixture', administrativeDecisionIssuers: [] };
    assert.equal(value.platformConfig, './platform.json', 'example requires an undeclared platform dependency');
    fs.writeFileSync(path.join(directory, 'platform.json'), JSON.stringify(platform), { flag: 'wx' });
    loadPlatformConfig(path.join(directory, 'platform.json'));
    const file = path.join(directory, 'runtime.json');
    fs.writeFileSync(file, JSON.stringify(value), { flag: 'wx' });
    const { publicKey } = crypto.generateKeyPairSync('ed25519');
    const environment = { KUBECLAW_BUILD_REVISION: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      BUSTER_V2_TOKEN: crypto.randomBytes(32).toString('hex'),
      BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
    const runtime = loadProductionBusterRemotePlanRuntime(file, environment);
    assert.equal(typeof runtime.start, 'function');
    // Intentionally do not start/recover or execute a provider. Port 8080 is unchanged.
    return { construction: true, immutableRuntimeInputSha256: digest(JSON.stringify(value)),
      platformDependency: 'owned explicit fixture', realCredentials: false,
      listenerStarted: false, providerExecution: false };
  });
}

export function validatePrismDevelopmentDocument() {
  validatePrism('designDocument', developmentDocument);
  return { nativeSchemaAndSemantics: true, browserExecution: false };
}

export async function validatePrismPayloadTemplate(template) {
  assert.deepEqual(Object.keys(template).sort(), ['approvalId', 'architectureDigest', 'bundleDigest', 'decision', 'issuer'].sort());
  assert.deepEqual(template.issuer, { type: 'operator', id: 'THE_CONFIGURED_ISSUER_ID' });
  assert.equal(template.approvalId, 'THE_STUDIO_APPROVAL_ID');
  assert.equal(template.architectureDigest, 'sha256:THE_ACTIVE_ARCHITECTURE_DIGEST');
  assert.equal(template.bundleDigest, 'sha256:THE_PUBLISHED_BUNDLE_DIGEST');
  const architectureDigest = `sha256:${'a'.repeat(64)}`;
  const payload = { ...template, issuer: { type: 'operator', id: 'operator:publication' },
    approvalId: 'approval:publication', architectureDigest, bundleDigest: `sha256:${'b'.repeat(64)}` };
  const wait = { schemaVersion: 'wait-request.v2', waitId: 'wait:publication', kind: 'signal',
    signalType: 'prism.approval.resolved', authorizedIssuer: payload.issuer, expiresAt: null };
  const signal = { schemaVersion: 'resume-signal.v2', signalId: 'signal:publication',
    idempotencyKey: 'key:publication', waitId: wait.waitId, signalType: wait.signalType,
    issuer: payload.issuer, issuedAt: '2026-10-20T00:00:01Z', payload };
  validateContractValue('waitRequest', wait);
  validateContractValue('resumeSignal', signal);
  validateSignal(wait, signal, '2026-10-20T00:00:00Z');
  let invokes = 0;
  const result = await prismDesign({ runId: 'run:publication', projectId: 'project:publication',
    architectureArtifact: { artifactId: 'architecture', contentDigest: architectureDigest, revision: 1 }, requiresDesign: true }, {
    contract: { lease: { attempt: { runId: 'run:publication' } },
      config: { agent: 'prism', target: 'fixture', issuerId: payload.issuer.id, timeoutMinutes: 1 }, guidance: payload },
    artifact: () => undefined, invoke: async () => { invokes++; throw new Error('PUBLICATION_EFFECT_FORBIDDEN'); },
  });
  assert.equal(invokes, 0);
  assert.equal(result.outcome, 'blocked');
  assert.equal(result.reason?.code, 'prism_design.dispatch_failed');
  assert.equal(result.reason?.message, 'PRISM_DESIGN_ARCHITECTURE_REFERENCE_INVALID');
  return { nativePayloadParse: true, canonicalEnvelope: true, fixtureWaitBinding: true,
    controlledResult: 'blocked:missing-architecture', dispatches: invokes, historicalOrHumanApproval: false };
}


export function validateHelmOverlayExamples(root, values) {
  assert.equal(values.length, 3, 'ordered-overlay example needs all three original files');
  return withExampleDirectory(directory => {
    const files = values.map((text, index) => {
      const file = path.join(directory, ['base.yaml', 'empty.yaml', 'remove.yaml'][index]);
      fs.writeFileSync(file, text, { flag: 'wx' });
      return file;
    });
    const render = indices => {
      const args = ['template', 'precedence-example', path.join(root, 'charts/kubeclaw'), '--namespace', 'default',
        ...indices.flatMap(index => ['-f', files[index]])];
      const output = execFileSync('helm', args, { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
      const documents = YAML.parseAllDocuments(output).map(doc => {
        if (doc.errors.length) throw new Error(`EXAMPLE_HELM_YAML_INVALID:${doc.errors[0].message}`);
        return doc.toJS();
      });
      const deployment = documents.find(doc => doc?.kind === 'Deployment' && doc.metadata?.name === 'agent-nova');
      assert(deployment, 'ordered overlay has no actual agent-nova receiver');
      const pod = deployment.spec.template.spec;
      const container = pod.containers.find(item => item.name === 'kubeclaw');
      assert(container, 'ordered overlay has no actual kubeclaw container');
      return { pod, container, outputSha256: digest(output) };
    };
    const selected = item => item.container.env.find(env => env.name === 'HELM_PRECEDENCE_EXAMPLE');
    const base = render([0]), empty = render([0, 1]), remove = render([0, 2]), reversed = render([1, 0]);
    assert.equal(selected(base)?.value, 'base');
    assert.equal(base.pod.nodeSelector.pool, 'base');
    assert.equal(selected(empty), undefined);
    assert.equal(empty.pod.nodeSelector.pool, 'base');
    assert.equal(selected(remove), undefined);
    assert.equal(Object.hasOwn(remove.pod, 'nodeSelector'), false);
    assert.equal(selected(reversed)?.value, 'base');
    assert(empty.container.env.length > 0, 'empty example removed all chart environment entries');
    const prismArgs = ['template', 'precedence-example', path.join(root, 'charts/prism'), '--namespace', 'default',
      '-f', path.join(root, 'charts/prism/ci-values.yaml')];
    execFileSync('helm', prismArgs, { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
    const rejected = spawnSync('helm', [...prismArgs, '--set-string', 'images.control.pullPolicy='],
      { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
    if (rejected.error) throw rejected.error;
    assert.notEqual(rejected.status, 0, 'empty Prism image policy must fail');
    assert.match(rejected.stderr, /images\.control\.pullPolicy/u, 'expected image-policy rejection, not an unrelated Helm failure');
    return { actualHelmVersion: execFileSync('helm', ['version', '--short'], { encoding: 'utf8' }).trim(),
      receiver: 'agent-nova/kubeclaw', orderedRenderSha256: [base, empty, remove, reversed].map(item => item.outputSha256),
      expectedInvalidPrismPolicy: rejected.status, clusterContact: false, historicalVersionExecutionClaim: false };
  });
}


export function validateDeliverablesExample(markdown) {
  const declarations = parseDeclaration('web', null, markdown);
  assert.deepEqual(declarations, ['web/Dockerfile', 'web/openapi.json']);
  return { nativeDeclaration: true, exactPaths: declarations,
    moduleOwnershipOrBuiltDeliverablesProved: false };
}

// `expectedPath` comes from the classified authored key, not a second strvals parser.
export function validateHelmOptionTemplates(templates) {
  return withExampleDirectory(directory => {
    const chart = path.join(directory, 'chart');
    fs.mkdirSync(path.join(chart, 'templates'), { recursive: true });
    fs.writeFileSync(path.join(chart, 'Chart.yaml'), 'apiVersion: v2\nname: example-key-parser\nversion: 0.1.0\n');
    fs.writeFileSync(path.join(chart, 'templates/values.yaml'),
      'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: example-key-parser\ndata:\n  values: {{ .Values | toJson | quote }}\n');
    return templates.map(({ option, expectedPath }) => {
      assert.match(option, /^--set '[^'\n]+=<value>'$/u);
      assert(Array.isArray(expectedPath) && expectedPath.length > 0);
      const argument = option.slice(7, -1).replace(/=<value>$/u, '=publication-fixture');
      const output = execFileSync('helm', ['template', 'example', chart, '--set', argument],
        { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
      const actual = JSON.parse(YAML.parse(output).data.values);
      let expected = 'publication-fixture';
      for (const key of [...expectedPath].reverse()) expected = { [key]: expected };
      assert.deepEqual(actual, expected, `Helm key selection differs: ${option}`);
      return { option, expectedPath, nativeHelmKeySelection: true, productSchemaOrDeployment: false };
    });
  });
}

export function validateBrowserCompanions(root) {
  const pairs = [['browser-profiles', 'browser-profiles.v1'],
    ['lighthouse-settings', 'lighthouse-settings.v1'], ['visual-baselines', 'visual-baselines.v2']];
  return pairs.map(([name, schemaName]) => {
    const file = path.join(root, 'contracts/pipeline-test-gate/v1/examples', `${name}.json`);
    const schema = path.join(root, 'contracts/pipeline-test-gate/v1/schemas', `${schemaName}.schema.json`);
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    validateReferencedSchema(fs.readFileSync(schema, 'utf8'), schema).validate(value);
    return { file: path.relative(root, file), schema: path.relative(root, schema),
      nativeSchemaValidation: true, providerSemanticOrBrowserExecution: false };
  });
}
