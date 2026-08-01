import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const core = await import(pathToFileURL(
  path.resolve('skills/common/plugin-runtime/core/src/index.ts'),
).href);

const roots = [
  path.resolve('skills/common/plugins'),
  path.resolve('skills/nova/plugins'),
  path.resolve('skills/buster/plugins'),
];
const snapshot = core.buildRegistry(core.discoverPackages({
  installationRoots: roots,
  trustPolicy: {
    trustedBuiltinRoots: roots,
    allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(),
    verifierId: 'test:phase5-security',
  },
  now: () => new Date('2026-07-28T09:00:00Z'),
}));
const phase5 = JSON.parse(fs.readFileSync(
  'docs/architecture/plugin-system-phase5-capabilities.json',
  'utf8',
));

assert.equal(core.CAPABILITY_IDS.length, 21);
assert.equal(Object.isFrozen(core.CAPABILITY_DEFINITIONS), true);
for (const capability of core.CAPABILITY_IDS) {
  const definition = core.CAPABILITY_DEFINITIONS[capability];
  assert(definition, `closed vocabulary must define ${capability}`);
  assert.equal(Object.isFrozen(definition), true);
  assert.equal(Object.isFrozen(definition.constraintSchema), true);
  const providerId = phase5.capabilities[capability];
  const provider = snapshot.adapters.get(providerId);
  assert(provider, `Phase 5 mapping must select an installed provider for ${capability}`);
  assert(
    provider.registration.providesCapabilities.includes(capability),
    `Phase 5 provider must provide ${capability}`,
  );
}
const inventory = JSON.parse(fs.readFileSync(
  'docs/generated/inventory/plugin-system.json',
  'utf8',
));
const inventoriedRegistrations = new Set(
  inventory.registrations.map((registration) => registration.registrationId),
);
for (const provider of Object.values(phase5.capabilities)) {
  assert(
    inventoriedRegistrations.has(provider),
    `capability provider must remain present in permanent manifest inventory: ${provider}`,
  );
}
for (const capabilities of Object.values(phase5.inventoriedEffectMappings)) {
  assert(capabilities.length > 0);
  for (const capability of capabilities) assert(core.CAPABILITY_IDS.includes(capability));
}
assert.equal(phase5.deletionLedger.status, 'closed');

const lintStage = 'kubeclaw.lint:pre-check';
const lintGranted = core.resolveCapabilityGrants(snapshot, {
  enabledRegistrations: new Set([lintStage]),
  providers: new Map([
    ['lint.execute', 'kubeclaw.lint:executor'],
    ['artifacts.write', 'kubeclaw.artifact-store:artifact-store'],
  ]),
  grants: new Map([[
    lintStage,
    new Map([
      ['lint.execute', {
        allowedProjects: ['fixture'],
        allowedRoots: ['/workspace'],
        allowedPolicyRoots: ['/policy'],
      }],
      ['artifacts.write', { allowedNamespaces: ['kubeclaw.lint'] }],
    ]),
  ]]),
});
assert(lintGranted.enabledRegistrations.has(lintStage));
assert(lintGranted.enabledRegistrations.has('kubeclaw.lint:executor'));
assert(lintGranted.enabledRegistrations.has('kubeclaw.artifact-store:artifact-store'));
assert(!lintGranted.enabledRegistrations.has('kubeclaw.lint:full'));
assert.equal('add' in lintGranted.enabledRegistrations, false);
assert.deepEqual(
  [...lintGranted.availableCapabilities.get(lintStage)].sort(),
  ['artifacts.write', 'lint.execute'],
);
assert.equal('add' in lintGranted.availableCapabilities.get(lintStage), false);
const lintGrant = lintGranted.grants.get(lintStage).find(
  ({ capability }) => capability === 'lint.execute',
);
assert.equal(Object.isFrozen(lintGranted.grants.get(lintStage)), true);
assert.throws(() => lintGranted.grants.get(lintStage).push(lintGrant));
assert.equal(Object.isFrozen(lintGrant.constraints), true);
assert.equal(Object.isFrozen(lintGrant.constraints.allowedRoots), true);
assert.throws(() => lintGrant.constraints.allowedRoots.push('/sibling'));
assert.equal(
  lintGranted.grants.get('kubeclaw.lint:executor')?.length,
  0,
  'adapter registration in the same package must not inherit its sibling stage grants',
);
assert.throws(() => core.resolveCapabilityGrants(snapshot, {
  enabledRegistrations: new Set([lintStage]),
  providers: new Map([
    ['lint.execute', 'kubeclaw.lint:executor'],
    ['artifacts.write', 'kubeclaw.artifact-store:artifact-store'],
  ]),
  grants: new Map([
    [lintStage, new Map([
      ['lint.execute', {
        allowedProjects: ['fixture'],
        allowedRoots: ['/workspace'],
        allowedPolicyRoots: ['/policy'],
      }],
      ['artifacts.write', { allowedNamespaces: ['kubeclaw.lint'] }],
    ])],
    ['kubeclaw.lint:full', new Map()],
  ]),
}), (error) => error?.code === 'REGISTRY_CAPABILITY_UNREQUESTED');
assert.throws(() => core.resolveCapabilityGrants(snapshot, {
  enabledRegistrations: new Set([lintStage]),
  providers: new Map([
    ['lint.execute', 'kubeclaw.lint:executor'],
    ['artifacts.write', 'kubeclaw.artifact-store:artifact-store'],
  ]),
  grants: new Map([[
    lintStage,
    new Map([
      ['lint.execute', {
        allowedProjects: ['fixture'],
        allowedRoots: ['/workspace'],
        allowedPolicyRoots: ['/policy'],
      }],
      ['artifacts.write', { namespace: 'kubeclaw.lint' }],
    ]),
  ]]),
}), (error) => error?.code === 'REGISTRY_CAPABILITY_CONSTRAINT_INVALID');

const artifactCandidates = snapshot.capabilityProviders.get('artifacts.write');
assert(artifactCandidates?.length === 1);
const stateCandidate = snapshot.capabilityProviders.get('state.read')?.[0];
assert(stateCandidate);
assert.throws(() => core.resolveCapabilityGrants({
  ...snapshot,
  capabilityProviders: new Map([
    ...snapshot.capabilityProviders,
    ['artifacts.write', [artifactCandidates[0], stateCandidate]],
  ]),
}, {
  enabledRegistrations: new Set(['kubeclaw.project-summary:summary']),
  providers: new Map(),
  grants: new Map([[
    'kubeclaw.project-summary:summary',
    new Map([['artifacts.write', { allowedNamespaces: ['kubeclaw.project-summary'] }]]),
  ]]),
}), (error) => error?.code === 'REGISTRY_CAPABILITY_PROVIDER_AMBIGUOUS');

const baseAdapter = snapshot.adapters.get('kubeclaw.state-store:state');
assert(baseAdapter);
function cycleAdapter(pluginId, registrationId, providesCapabilities, requiredCapabilities) {
  return {
    ...baseAdapter,
    package: {
      ...baseAdapter.package,
      manifest: { ...baseAdapter.package.manifest, id: pluginId },
      provenance: {
        ...baseAdapter.package.provenance,
        package: {
          ...baseAdapter.package.provenance.package,
          package: {
            ...baseAdapter.package.provenance.package.package,
            pluginId,
          },
        },
      },
    },
    registration: {
      ...baseAdapter.registration,
      id: registrationId,
      providesCapabilities,
      requiredCapabilities,
    },
  };
}
const cycleA = cycleAdapter('test.cycle-a', 'a', ['state.read'], ['state.append']);
const cycleB = cycleAdapter('test.cycle-b', 'b', ['state.append'], ['state.read']);
const cycleSnapshot = {
  apiVersion: 'pipeline-plugin-v2',
  packages: new Map(),
  stages: new Map(),
  observers: new Map(),
  adapters: new Map([
    ['test.cycle-a:a', cycleA],
    ['test.cycle-b:b', cycleB],
  ]),
  capabilityProviders: new Map([
    ['state.read', [cycleA]],
    ['state.append', [cycleB]],
  ]),
};
assert.throws(() => core.resolveCapabilityGrants(cycleSnapshot, {
  enabledRegistrations: new Set(['test.cycle-a:a']),
  providers: new Map([
    ['state.read', 'test.cycle-a:a'],
    ['state.append', 'test.cycle-b:b'],
  ]),
  grants: new Map([
    ['test.cycle-a:a', new Map([['state.append', { allowedNamespaces: ['cycle'] }]])],
    ['test.cycle-b:b', new Map([['state.read', { allowedNamespaces: ['cycle'] }]])],
  ]),
}), (error) => error?.code === 'REGISTRY_ADAPTER_CYCLE');

const packageIdentity = {
  pluginId: 'test.security',
  apiVersion: 'pipeline-plugin-v2',
  packageVersion: '1.0.0',
  contentDigest: `sha256:${'a'.repeat(64)}`,
};
const registration = {
  schemaVersion: 'registration-provenance.v2',
  package: {
    schemaVersion: 'package-provenance.v2',
    package: packageIdentity,
    source: { type: 'builtin', canonicalReference: 'builtin:test.security' },
    canonicalPath: '/plugins/security',
    trustScope: 'trusted_first_party',
    trustEvidence: { method: 'test' },
    resolvedAt: '2026-07-28T09:00:00Z',
  },
  surface: 'stage',
  registrationId: 'security',
};
const attempt = {
  runId: 'run:security',
  stageId: 'security',
  attemptId: 'attempt:security',
  attemptNumber: 1,
};

const securityRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-phase5-security-'));
const repositoryRoot = path.join(securityRoot, 'repository');
const workspaceRoot = path.join(securityRoot, 'workspaces');
const policyRoot = path.join(securityRoot, 'policy');
const outsideRoot = path.join(securityRoot, 'outside');
for (const directory of [repositoryRoot, workspaceRoot, policyRoot, outsideRoot]) {
  fs.mkdirSync(directory);
}
const repositoryWork = path.join(repositoryRoot, 'work');
fs.mkdirSync(repositoryWork);
const policyFile = path.join(policyRoot, 'lint.json');
fs.writeFileSync(policyFile, '{}\n');
fs.writeFileSync(path.join(outsideRoot, 'lint.json'), '{}\n');
const repositoryEscape = path.join(repositoryRoot, 'outside-link');
const workspaceEscape = path.join(workspaceRoot, 'outside-link');
const policyEscape = path.join(policyRoot, 'outside-link');
fs.symlinkSync(outsideRoot, repositoryEscape, 'dir');
fs.symlinkSync(outsideRoot, workspaceEscape, 'dir');
fs.symlinkSync(outsideRoot, policyEscape, 'dir');

const cases = [
  ['state.read', { allowedNamespaces: ['run'] }, {
    operation: 'read', resource: { type: 'state.namespace', canonicalId: 'run/item' }, payload: {},
  }, { resource: { type: 'state.namespace', canonicalId: 'sibling/item' } }],
  ['state.append', { allowedNamespaces: ['run'] }, {
    operation: 'append', resource: { type: 'state.namespace', canonicalId: 'run' }, payload: {},
  }, { resource: { type: 'state.namespace', canonicalId: 'sibling' } }],
  ['artifacts.read', { allowedNamespaces: ['owned'] }, {
    operation: 'get_json', resource: { type: 'artifact.object', canonicalId: 'artifact:1' },
    payload: { namespace: 'owned', digest: `sha256:${'b'.repeat(64)}` },
  }, { payload: { namespace: 'sibling', digest: `sha256:${'b'.repeat(64)}` } }],
  ['artifacts.write', { allowedNamespaces: ['owned'] }, {
    operation: 'put_json', resource: { type: 'artifact.object', canonicalId: 'artifact:1' },
    payload: { namespace: 'owned', value: {} },
  }, { payload: { namespace: 'sibling', value: {} } }],
  ['runtime.dispatch', { allowedAgents: ['reviewer'] }, {
    operation: 'dispatch', resource: { type: 'runtime.agent', canonicalId: 'reviewer' }, payload: {},
  }, { resource: { type: 'runtime.agent', canonicalId: 'implementation' } }],
  ['git.repository.read', { allowedPrefixes: ['modules'] }, {
    operation: 'read_text', resource: { type: 'git.repository.path', canonicalId: 'modules/api/file.ts' }, payload: {},
  }, { resource: { type: 'git.repository.path', canonicalId: 'modules/../secrets/file' } }],
  ['git.workspace.create', {
    allowedRoots: [repositoryRoot], allowedWorkspaceRoots: [workspaceRoot],
  }, {
    operation: 'create', resource: { type: 'git.repository', canonicalId: repositoryRoot },
    payload: { workspacePath: path.join(workspaceRoot, 'task') },
  }, {
    payload: { workspacePath: path.join(workspaceEscape, 'task') },
  }],
  ['git.workspace.remove', {
    allowedRoots: [repositoryRoot], allowedWorkspaceRoots: [workspaceRoot],
  }, {
    operation: 'remove', resource: { type: 'git.repository', canonicalId: repositoryRoot },
    payload: { workspacePath: path.join(workspaceRoot, 'task') },
  }, {
    payload: { workspacePath: path.join(workspaceEscape, 'task') },
  }],
  ['git.commit', { allowedRoots: [repositoryRoot] }, {
    operation: 'commit', resource: { type: 'git.repository', canonicalId: repositoryWork }, payload: {},
  }, { resource: { type: 'git.repository', canonicalId: repositoryEscape } }],
  ['git.merge', { allowedRoots: [repositoryRoot] }, {
    operation: 'merge', resource: { type: 'git.workspace', canonicalId: repositoryWork }, payload: {},
  }, { resource: { type: 'git.workspace', canonicalId: '/other' } }],
  ['git.sync', { allowedRoots: [repositoryRoot] }, {
    operation: 'sync_paths', resource: { type: 'git.repository', canonicalId: repositoryRoot }, payload: {},
  }, { resource: { type: 'git.repository', canonicalId: '/other' } }],
  ['signal.wait', {
    allowedSignalTypes: ['approval.resolved'], allowedIssuerIds: ['operator:release'],
  }, {
    operation: 'create', resource: { type: 'signal.wait', canonicalId: 'approval:1' },
    payload: {
      signalType: 'approval.resolved',
      authorizedIssuer: { type: 'operator', id: 'operator:release' },
    },
  }, {
    payload: {
      signalType: 'approval.resolved',
      authorizedIssuer: { type: 'operator', id: 'operator:sibling' },
    },
  }],
  ['operator.request', { allowedTargets: ['operators'] }, {
    operation: 'publish', resource: { type: 'operator.target', canonicalId: 'operators' }, payload: {},
  }, { resource: { type: 'operator.target', canonicalId: 'admins' } }],
  ['telemetry.emit', { allowedEventPrefixes: ['run.'] }, {
    operation: 'append', resource: { type: 'telemetry.event', canonicalId: 'run.started' }, payload: {},
  }, { resource: { type: 'telemetry.event', canonicalId: 'secret.read' } }],
  ['secrets.read', { allowedNames: ['runtime.token'] }, {
    operation: 'resolve', resource: { type: 'secret.name', canonicalId: 'runtime.token' }, payload: {},
  }, { resource: { type: 'secret.name', canonicalId: 'admin.token' } }],
  ['network.http', { allowedOrigins: ['https://runtime.example'] }, {
    operation: 'request', resource: { type: 'network.url', canonicalId: 'https://runtime.example/v1' }, payload: {},
  }, { resource: { type: 'network.url', canonicalId: 'https://other.example/v1' } }],
  ['command.execute', {
    allowedExecutables: [process.execPath], allowedWorkingRoots: [repositoryRoot],
  }, {
    operation: 'run', resource: { type: 'command.executable', canonicalId: process.execPath },
    payload: { workingDirectory: repositoryWork },
  }, { payload: { workingDirectory: repositoryEscape } }],
  ['test.suite.execute', {
    allowedSuites: ['unit'], allowedRoots: [repositoryRoot],
  }, {
    operation: 'run', resource: { type: 'test.suite-plan', canonicalId: 'module' },
    payload: { repositoryRoot, suites: ['unit'] },
  }, {
    payload: { repositoryRoot, suites: ['deployment'] },
  }],
  ['lint.execute', {
    allowedProjects: ['project'],
    allowedRoots: [repositoryRoot],
    allowedPolicyRoots: [policyRoot],
  }, {
    operation: 'run_report', resource: { type: 'lint.project', canonicalId: 'project' },
    payload: { workingDirectory: repositoryRoot, policyPath: policyFile },
  }, {
    payload: {
      workingDirectory: repositoryRoot,
      policyPath: path.join(policyEscape, 'lint.json'),
    },
  }],
  ['transport.publish', { allowedTargets: ['audit'] }, {
    operation: 'publish', resource: { type: 'transport.target', canonicalId: 'audit' }, payload: {},
  }, { resource: { type: 'transport.target', canonicalId: 'admin' } }],
  ['agent.events.subscribe', { allowedSources: ['openclaw'] }, {
    operation: 'status', resource: { type: 'agent.events', canonicalId: 'openclaw' }, payload: {},
  }, { resource: { type: 'agent.events', canonicalId: 'other-host' } }],
];
assert.equal(cases.length, core.CAPABILITY_IDS.length);
for (const [capability, constraints, valid, deniedPatch] of cases) {
  const leaseContract = {
    schemaVersion: 'invocation-lease.v2',
    leaseId: `lease:${capability}`,
    attempt,
    registration,
    status: 'active',
    grants: [{
      capability,
      provider: { ...packageIdentity, registrationId: 'adapter' },
      constraints,
    }],
    limits: { wallTimeMs: 1000, memoryBytes: 1, cpuMillis: 1 },
    issuedAt: '2026-07-28T09:00:00Z',
    expiresAt: '2026-07-28T09:01:00Z',
  };
  const lease = new core.RevocableLease(leaseContract, () => new Date('2026-07-28T09:00:01Z'));
  const context = core.createPluginInvocationContext({
    schemaVersion: 'plugin-context.v2',
    lease: leaseContract,
    config: {},
    input: {},
    artifacts: [],
  }, lease, {
    async invoke() { return { ok: true }; },
  }, {
    async append() {},
  });
  await context.invoke(capability, valid);
  await assert.rejects(
    () => context.invoke(capability, { ...valid, ...deniedPatch }),
    /CAPABILITY_(?:RESOURCE|REQUEST)/,
    `${capability} must deny a sibling or out-of-scope resource`,
  );
}
fs.rmSync(securityRoot, { recursive: true, force: true });

const forbiddenStage = snapshot.stages.get('kubeclaw.decision.review');
assert(forbiddenStage);
assert.throws(() => core.resolveCapabilityGrants({
  ...snapshot,
  stages: new Map([[
    'test.forbidden',
    {
      ...forbiddenStage,
      registration: {
        ...forbiddenStage.registration,
        type: 'test.forbidden',
        requiredCapabilities: ['lifecycle.write'],
      },
    },
  ]]),
}, {
  enabledRegistrations: new Set(['kubeclaw.review:review']),
  providers: new Map(),
  grants: new Map(),
}), (error) => error?.code === 'REGISTRY_CAPABILITY_FORBIDDEN');

console.log(JSON.stringify({
  ok: true,
  contract: 'plugin-system-v2-capability-security',
  capabilities: cases.length,
}));
