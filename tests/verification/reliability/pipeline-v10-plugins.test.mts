import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { validatePipelineV10PluginRelations } from '../../../skills/common/plugin-runtime/foundation/config/pipeline-v10-plugin-relations.ts';
import { preflightPipelineV10Infrastructure } from '../../../skills/common/plugin-runtime/foundation/config/pipeline-v10-infra.ts';
import { readSwarmBundle } from '../../../skills/common/plugin-runtime/foundation/config/swarm-bundle.ts';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const base = path.join(repository, 'docs/review/evidence/config-acceptance/c0-completion-20261013');
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const contract = read(path.join(base, 'PACKAGE-GENERATION-CONTRACT.json'));
const sources = read(path.join(repository, 'skills/common/plugin-runtime/foundation/config/pipeline-v10-plugin-schemas.json'));
const original = read(path.join(repository, contract.baseRoot.path));
for (const operation of contract.rootPatch) {
  const parts = operation.path.split('/').slice(1), key = parts.at(-1)!;
  const target = parts.slice(0,-1).reduce((value: any, key: string) => value[key], original);
  if (operation.op === 'test') assert.deepEqual(target[key], operation.value);
  else if (Array.isArray(target)) { assert.equal(key, '-'); target.push(structuredClone(operation.value)); }
  else target[key] = structuredClone(operation.value);
}
function fixture(t: test.TestContext) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-v10-plugins-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  // The direct loader now retains the complete declared source generation.
  // Seed all original members before applying the existing plugin mutations;
  // partial fixtures must not bypass the real source-intake boundary.
  const inputContract = read(path.join(repository, 'skills/common/plugin-runtime/foundation/config/pipeline-v10-input-contract.json'));
  const writeMember = (relative: string, bytes: Buffer) => {
    const destination = path.join(directory, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes);
  };
  for (const member of inputContract.base.members) {
    const bytes = fs.readFileSync(path.join(base, 'same-entry-agent-role-binding-01', member.relativePath.startsWith('schemas/') ? '' : 'stand', member.relativePath));
    assert.equal(bytes.length, member.byteLength, `original input size: ${member.relativePath}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), member.sha256, `original input identity: ${member.relativePath}`);
    writeMember(member.relativePath, bytes);
  }
  for (const member of [...inputContract.additions, ...inputContract.packageSources]) {
    const retained = path.join(repository, 'tests/verification/reliability/fixtures/pipeline-v10-retained', member.sha256 + '.fixture');
    const bytes = fs.readFileSync(fs.existsSync(retained) ? retained : path.join(repository, member.sourcePath));
    assert.equal(bytes.length, member.byteLength, `original source size: ${member.sourcePath}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), member.sha256, `original source identity: ${member.sourcePath}`);
    writeMember(member.relativePath, bytes);
  }
  const schema = read(path.join(repository, contract.baseRootSchema.path));
  for (const operation of contract.rootSchemaPatch) {
    const parts = operation.path.split('/').slice(1), key = parts.at(-1)!;
    const target = parts.slice(0, -1).reduce((value: any, key: string) => value[key], schema);
    if (operation.op === 'test') assert.deepEqual(target[key], operation.value);
    else if (Array.isArray(target)) { assert.equal(key, '-'); target.push(structuredClone(operation.value)); }
    else target[key] = structuredClone(operation.value);
  }
  writeMember('schemas/pipeline-entry.schema.json', Buffer.from(JSON.stringify(schema)));
  const config = path.join(directory, 'config');
  fs.mkdirSync(path.join(config, 'components'), { recursive: true });
  const root = structuredClone(original), file = path.join(config, 'pipeline.config.json');
  const writeRoot = () => fs.writeFileSync(file, JSON.stringify(root)); writeRoot();
  for (const name of Object.keys(root.components)) fs.copyFileSync(path.join(base, 'same-entry-agent-role-binding-01/stand/config/components', name+'.config.json'), path.join(config, 'components', name+'.config.json'));
  for (const [packageId, value] of Object.entries(sources.packages)) {
    const source = value as any;
    const quality = ['kubeclaw.size-budget','kubeclaw.coverage-budget'].includes(packageId);
    const owner = path.join(config, source.ownerPath);
    fs.mkdirSync(path.dirname(owner), { recursive: true });
    fs.copyFileSync(path.join(base, quality ? 'quality-budget-contracts-01/stand/config' : 'same-entry-agent-role-binding-01/stand/config', source.ownerPath), owner);
    // This denied historical generation must use its declared original whole
    // package bytes, not the mutable current implementation. Hashes confer no
    // activation authority; all original receiving/negative checks stay live.
    const packageRoot = path.posix.dirname(source.manifestPath);
    const inputContract = read(path.join(repository, 'skills/common/plugin-runtime/foundation/config/pipeline-v10-input-contract.json'));
    const members = inputContract.packageSources.filter((member: any) => member.relativePath.startsWith(packageRoot + '/'));
    assert.ok(members.length > 0, `missing original package closure: ${packageId}`);
    for (const member of members) {
      const retained = path.join(repository, 'tests/verification/reliability/fixtures/pipeline-v10-retained', member.sha256 + '.fixture');
      const bytes = fs.readFileSync(fs.existsSync(retained) ? retained : path.join(repository, member.sourcePath));
      assert.equal(bytes.length, member.byteLength, `original package size: ${member.sourcePath}`);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), member.sha256, `original package identity: ${member.sourcePath}`);
      const destination = path.join(directory, member.relativePath);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, bytes);
    }
  }
  const infra = read(path.join(repository, 'skills/common/plugin-runtime/foundation/config/pipeline-v10-infra-schemas.json'));
  for (const source of Object.values(infra) as any[]) {
    const destination = path.join(directory, source.targetPath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(repository, source.provenance.fixturePath), destination);
  }
  for (const relative of ['managed-bootstrap-context.json', 'generated-contexts/nova-bootstrap-context.json', 'generated-contexts/prism-bootstrap-context.json', 'source-current/generated/gateway-context-source-recipes.json', 'source-current/generated/role-source-recipes.json']) {
    const destination = path.join(directory, relative); fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(base, 'same-entry-agent-role-binding-01/stand', relative), destination);
  }
  // Use a complete original same-instance consuming tuple. The historical
  // preparation-only instance has no WorkerCore peer and correctly fails the
  // versioned selection gate before these deeper owner/source assertions.
  const binding = root.bindings.find((b: any) => b.owner === 'buster-engine'
    && root.bindings.some((peer: any) => peer.role === 'buster'
      && peer.instanceId === b.instanceId && peer.owner === 'worker-core'));
  const selection = { role: 'buster' as const, callerId: 'buster-preparation' as const, serviceInstanceId: binding.instanceId,
    bindings: root.bindings.filter((b: any) => b.role === 'buster' && b.instanceId === binding.instanceId
      && ['buster-engine', 'worker-core'].includes(b.owner))
      .map(({ owner, instanceId, profileId }: any) => ({ owner, instanceId, profileId })) };
  return { directory, config, root, writeRoot, load: () => readSwarmBundle(file, selection) };
}

// Supported policy domains and exact historical source identity are distinct:
// valid changed policies pass the real semantic validators, but are not the
// declared original generation and must still fail physical source intake.
function supportedPolicyMutation(f: ReturnType<typeof fixture>) {
  const components = Object.fromEntries(Object.keys(f.root.components).map(name => [name, read(path.join(f.config, 'components', name + '.config.json'))]));
  const owners = new Map(Object.entries(sources.packages).map(([id, source]: [string, any]) => [id, read(path.join(f.config, source.ownerPath))]));
  assert.doesNotThrow(() => validatePipelineV10PluginRelations(f.root, components, owners, sources.packages));
  assert.doesNotThrow(() => preflightPipelineV10Infrastructure(f.root, components, relative => fs.readFileSync(path.join(f.directory, relative))));
  assert.throws(f.load, /PIPELINE_INPUT_SIZE_MISMATCH|PIPELINE_INPUT_DIGEST_MISMATCH/);
}

test('18 whole schemas and actual manifests preserve exact source provenance and 15-provider/8-Nova families', () => {
  assert.equal(Object.keys(sources.packages).length, 18);
  assert.equal(sources.registrations.filter((row: any) => row.family === 'provider').length, 15);
  assert.equal(sources.registrations.filter((row: any) => row.family === 'nova-module').length, 8);
  for (const source of Object.values(sources.packages) as any[]) {
    for (const [file, digest] of [[source.provenance.schemaPath, source.provenance.schemaSha256], [source.provenance.manifestPath, source.provenance.manifestSha256]]) {
      assert.equal(createHash('sha256').update(fs.readFileSync(path.join(repository, file))).digest('hex'), digest);
    }
    assert.deepEqual(source.schema, read(path.join(repository, source.provenance.schemaPath)));
    assert.deepEqual(source.manifest, read(path.join(repository, source.provenance.manifestPath)));
  }
});

test('physical same-generation plugin owners/manifests/modules pass local checks but do NOT activate v10', t => {
  const f = fixture(t);
  assert.throws(f.load, /PIPELINE_V10_SOURCE_RECEIVING_REQUIRED/,
    'all plugin phases complete, remaining original role/infra/issuer admission still required');
});

test('invalid unselected plugin profile rejects whole generation', t => {
  const f = fixture(t), file = path.join(f.config, 'plugins/kubeclaw.http.config.json');
  const owner = read(file), unselected = Object.keys(owner.profiles).find(name => name !== 'A')!;
  assert.ok(unselected); owner.profiles[unselected].extraAuthor = true;
  fs.writeFileSync(file, JSON.stringify(owner));
  assert.throws(f.load, /PIPELINE_V10_PLUGIN_OWNER_INVALID/);
});

test('actual manifest tamper and source-kind substitution reject without importing module', t => {
  const f = fixture(t), source = sources.packages['kubeclaw.api-flow'];
  const file = path.join(f.directory, source.manifestPath), before = fs.readFileSync(file);
  const manifest = read(file); manifest.testProviders[0].id = 'foreign'; fs.writeFileSync(file, JSON.stringify(manifest));
  assert.throws(f.load, /PLUGIN_MANIFEST_MISMATCH/);
  fs.writeFileSync(file, before);
  f.root.pluginSelections.find((row: any) => row.packageId === 'kubeclaw.runtime-dispatch').kind = 'stage'; f.writeRoot();
  assert.throws(f.load, /PLUGIN_SOURCE_ROSTER_REQUIRED/);
});

test('missing mandatory registration, mismatched owner instance and selected profile deny', t => {
  const f = fixture(t);
  const index = f.root.pluginSelections.findIndex((row: any) => row.packageId === 'kubeclaw.http');
  const [removed] = f.root.pluginSelections.splice(index, 1); f.writeRoot();
  assert.throws(f.load, /PLUGIN_SOURCE_ROSTER_REQUIRED/);
  f.root.pluginSelections.splice(index, 0, removed); removed.instanceId = 'wrong-original-instance'; f.writeRoot();
  assert.throws(f.load, /PLUGIN_SELECTION_MISMATCH/);
  removed.instanceId = 'fixture.http'; removed.profileId = 'missing-profile'; f.writeRoot();
  assert.throws(f.load, /PLUGIN_SELECTION_MISMATCH/);
});

test('absent or symlinked same-root source never borrows existing checkout source', t => {
  const f = fixture(t), source = sources.packages['kubeclaw.api-flow'];
  const module = path.join(f.directory, path.dirname(source.manifestPath), source.manifest.testProviders[0].module);
  const realCheckout = path.join(repository, path.relative(f.directory, module).slice('source-current/'.length));
  assert.ok(fs.existsSync(realCheckout)); fs.unlinkSync(module);
  assert.throws(f.load, /PIPELINE_V10_PACKAGE_SOURCE_FILE_SET/);
  fs.symlinkSync(realCheckout, module);
  assert.throws(f.load, /SWARM_CONFIG_SYMLINK|PIPELINE_V10_PACKAGE_SOURCE_SYMLINK/);
});

// Mutations deliberately remain within JSON-schema shape so these controls
// exercise source-specific relations in the real loader, then restore exact
// original bytes and require the still-unresolved final receiving gate again.
function relationMutation(f: ReturnType<typeof fixture>, relative: string, mutate: (value: any) => void, error: RegExp) {
  const file = path.join(f.config, relative), before = fs.readFileSync(file), value = read(file);
  mutate(value); fs.writeFileSync(file, JSON.stringify(value));
  assert.throws(f.load, error);
  fs.writeFileSync(file, before);
  assert.throws(f.load, /PIPELINE_V10_SOURCE_RECEIVING_REQUIRED/);
}

test('Quality log on every outcome and size pass/fail baseline are mandatory even in unselected profiles', t => {
  const f = fixture(t);
  relationMutation(f, 'plugins/kubeclaw.coverage-budget.config.json', value => {
    value.profiles.B.declarations.evidenceDefaults.onError = [];
  }, /RELATION_INVALID:MANDATORY_EVIDENCE/);
  relationMutation(f, 'plugins/kubeclaw.size-budget.config.json', value => {
    value.profiles.B.declarations.evidenceDefaults.onPass = ['log'];
  }, /RELATION_INVALID:MANDATORY_EVIDENCE/);
});

test('Security original package/service closure cannot split or borrow another service worker', t => {
  const f = fixture(t);
  relationMutation(f, 'pipeline.config.json', value => {
    value.pluginSelections.find((row: any) => row.packageId === 'kubeclaw.security-providers').serviceInstanceId = 'fixture.service.buster-runtime';
  }, /RELATION_INVALID:SECURITY_PACKAGE_SPLIT/);
  relationMutation(f, 'pipeline.config.json', value => {
    value.bindings.find((row: any) => row.owner === 'worker-core' && row.instanceId === 'fixture.service.buster-security-runtime').instanceId = 'missing-security-worker-peer';
  }, /RELATION_INVALID:BUSTER_RUNTIME_PEERS/);
});

test('schema-valid changed Security and Browser resource projections reject, restored originals pass local phase', t => {
  const f = fixture(t);
  relationMutation(f, 'components/buster-engine.config.json', value => {
    value.profiles['security-source-A'].settings.execution.capabilityProviders.networkHttp.allowedPorts.push(443);
  }, /RELATION_INVALID:SECURITY_SOURCE_RESOURCE_JOIN/);
  relationMutation(f, 'components/buster-engine.config.json', value => {
    value.profiles['browser-source-A'].settings.execution.capabilityProviders.browserAccess.allowedOrigins.push('http://127.0.0.1:18082');
  }, /RELATION_INVALID:BROWSER_SOURCE_RESOURCE_JOIN/);
});

test('unselected Browser selected-profile reference must resolve before any activation', t => {
  const f = fixture(t);
  relationMutation(f, 'plugins/kubeclaw.axe.config.json', value => {
    const name = Object.keys(value.profiles).find(name => name !== 'A')!;
    value.profiles[name].processing.selectedProfiles = ['missing-browser-profile'];
  }, /RELATION_INVALID:AXE_PROFILE_REQUIRED/);
});

test('Nova current target membership and token-sum constraints reject without equating diagnostic/runtime agentRole', t => {
  const f = fixture(t);
  relationMutation(f, 'plugins/kubeclaw.architecture-validator.config.json', value => {
    const unselected = Object.keys(value.profiles).find(name => name !== 'A')!;
    assert.ok(unselected);
    value.profiles[unselected].processing['kubeclaw.architecture-validator:architecture'].agent = 'foreign-target';
  }, /RELATION_INVALID:NOVA_TARGET_MEMBERSHIP/);
  relationMutation(f, 'plugins/kubeclaw.runtime-dispatch.config.json', value => {
    const target = value.profiles.A.processing.targets['case-target-a'];
    // These are fixed original source facts in this owner schema, not a new
    // tunable token profile. They must reject BEFORE the relation guard.
    target.maxInputTokens = target.maxContextTokens;
  }, /PLUGIN_OWNER_INVALID:kubeclaw.runtime-dispatch:.*maxInputTokens/);
  const file = path.join(f.config, 'plugins/kubeclaw.architecture-validator.config.json'), original = fs.readFileSync(file), value = read(file);
  value.profiles.A.processing['kubeclaw.architecture-validator:architecture'].agentRole = 'independent diagnostic, not installed role';
  fs.writeFileSync(file, JSON.stringify(value));
  supportedPolicyMutation(f);
  assert.equal(read(file).profiles.A.processing['kubeclaw.architecture-validator:architecture'].agentRole, 'independent diagnostic, not installed role');
  fs.writeFileSync(file, original); assert.throws(f.load, /PIPELINE_V10_SOURCE_RECEIVING_REQUIRED/);
});

test('resolved Security add/replace rules obey the real native header domain', t => {
  const f = fixture(t);
  relationMutation(f, 'plugins/kubeclaw.security-providers.config.json', value => {
    value.profiles.A.registrations.headers.processing.rules.add.push({ id: 'custom-hsts', header: 'strict-transport-security', severity: 'high', kind: 'hsts-min-age', value: '0' });
  }, /RELATION_INVALID:SECURITY_HSTS/);
});

test('public resource-association bytes retain exact original provenance, not installed grants', () => {
  const associations = read(path.join(repository, 'skills/common/plugin-runtime/foundation/config/pipeline-v10-source-relations.json'));
  for (const name of ['security', 'browser']) {
    const reference = associations[name+'Provenance'], bytes = fs.readFileSync(path.join(repository, reference.path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), reference.sha256);
    assert.deepEqual(associations[name], JSON.parse(bytes.toString('utf8')));
  }
});

test('Playwright raw worker/timeout domain preserves native clamping rather than inventing rejection', t => {
  const f = fixture(t), file = path.join(f.config, 'plugins/kubeclaw.playwright.config.json');
  const value = read(file), before = fs.readFileSync(file);
  value.profiles.A.processing.workers = 64;
  value.profiles.A.processing.timeoutMs = 3600000;
  fs.writeFileSync(file, JSON.stringify(value));
  // The actual native invoker bounds both against original source options;
  // this preflight MUST NOT silently narrow the supported raw policy domain.
  supportedPolicyMutation(f);
  fs.writeFileSync(file, before);
  assert.throws(f.load, /PIPELINE_V10_SOURCE_RECEIVING_REQUIRED/);
});

test('Core/infra schemas and referenced Platform/compiler dependencies preserve original bytes', () => {
  const catalog = read(path.join(repository, 'skills/common/plugin-runtime/foundation/config/pipeline-v10-infra-schemas.json'));
  for (const source of Object.values(catalog) as any[]) {
    const raw = fs.readFileSync(path.join(repository, source.provenance.schemaPath));
    assert.equal(createHash('sha256').update(raw).digest('hex'), source.provenance.schemaSha256);
    assert.deepEqual(source.schema, JSON.parse(raw.toString()));
    for (const dependency of source.dependencies ?? []) {
      const retained = path.join(repository, 'tests/verification/reliability/fixtures/pipeline-v10-retained', dependency.provenance.sha256 + '.fixture');
      const raw = fs.readFileSync(fs.existsSync(retained) ? retained : path.join(repository, dependency.provenance.path));
      assert.equal(createHash('sha256').update(raw).digest('hex'), dependency.provenance.sha256);
      assert.deepEqual(dependency.schema, JSON.parse(raw.toString()));
    }
  }
});

function infraMutation(f: ReturnType<typeof fixture>, relative: string, mutate: (value: any) => void, error: RegExp) {
  const file = path.join(f.directory, relative), before = fs.readFileSync(file), value = read(file);
  mutate(value); fs.writeFileSync(file, JSON.stringify(value));
  assert.throws(f.load, error);
  fs.writeFileSync(file, before);
  assert.throws(f.load, /PIPELINE_V10_SOURCE_RECEIVING_REQUIRED/);
}

test('ALL unselected Core/provisioning/Chart/engine/recovery profiles are schema-admitted', t => {
  const f = fixture(t);
  const catalog = read(path.join(repository, 'skills/common/plugin-runtime/foundation/config/pipeline-v10-infra-schemas.json'));
  for (const [name, source] of Object.entries(catalog) as [string, any][]) {
    infraMutation(f, source.targetPath, value => {
      const id = Object.keys(value.profiles).at(-1)!;
      value.profiles[id].unapprovedAuthor = 1;
    }, new RegExp(`PIPELINE_V10_INFRA_OWNER_INVALID:${name}:`));
  }
});

test('Core lock renewal and launcher lifetime/cleanup relations hold on ALL profiles', t => {
  const f = fixture(t);
  infraMutation(f, 'config/nova/core.config.json', value => {
    const locks = value.profiles['local-B-lock'].settings.runtimeLocks;
    locks.runMutationLockRenewEveryMs = locks.runMutationLockTtlMs;
  }, /INFRA_RELATION_INVALID:CORE_LOCK_RENEWAL/);
  infraMutation(f, 'config/engines/prism-agent.config.json', value => {
    value.profiles.runtime.claimLifetimeMs = value.profiles.runtime.limits.timeoutMs;
  }, /INFRA_RELATION_INVALID:ENGINE_CLAIM_WINDOW/);
  infraMutation(f, 'config/engines/prism-agent.config.json', value => {
    value.profiles.runtime.terminationGraceMs = value.profiles.runtime.limits.cleanupTimeoutMs + 1;
  }, /INFRA_RELATION_INVALID:ENGINE_KILL_CLEANUP/);
});

test('deployment role and exact controller/launcher peers cannot borrow another source', t => {
  const f = fixture(t);
  infraMutation(f, 'config/pipeline.config.json', value => {
    value.deploymentSelections.find((x: any) => x.consumer === 'namespace-controller').controlComponentInstanceId = 'missing-original-control';
  }, /INFRA_RELATION_INVALID:prism-control:EXACT_PEER_REQUIRED/);
  infraMutation(f, 'config/pipeline.config.json', value => {
    value.engineSelections[0].controlComponentInstanceId = 'missing-original-control';
  }, /INFRA_RELATION_INVALID:prism-control:EXACT_PEER_REQUIRED/);
  infraMutation(f, 'config/pipeline.config.json', value => {
    value.deploymentSelections.find((x: any) => x.role === 'nova').profileId = 'prism-current';
  }, /INFRA_RELATION_INVALID:DEPLOYMENT_ROLE_PROFILE/);
});

test('missing Core/infra selected profiles never fall back to defaults', t => {
  const f = fixture(t);
  for (const field of ['novaCoreSelection', 'engineSelections', 'infrastructureSelections']) {
    infraMutation(f, 'config/pipeline.config.json', value => {
      const tuple = Array.isArray(value[field]) ? value[field][0] : value[field];
      tuple.profileId = 'missing-original-profile';
    }, /INFRA_RELATION_INVALID:.*PROFILE_REQUIRED/);
  }
});

test('duplicate YAML authors and symlinked same-root Infra files reject before final gate', t => {
  const f = fixture(t), file = path.join(f.directory, 'my-values/infra/secret-provisioning.yaml');
  const before = fs.readFileSync(file);
  fs.writeFileSync(file, 'schemaVersion: secret-provisioning-owner.v1\nschemaVersion: secret-provisioning-owner.v1\n');
  assert.throws(f.load, /INFRA_PARSE_INVALID:provisioning/);
  fs.writeFileSync(file, before);
  assert.throws(f.load, /PIPELINE_V10_SOURCE_RECEIVING_REQUIRED/);
  fs.unlinkSync(file);
  fs.symlinkSync(path.join(base, 'PACKAGE-PROVISIONING-OWNER.json'), file);
  assert.throws(f.load, /SWARM_CONFIG_SYMLINK|PIPELINE_V10_PACKAGE_SOURCE_SYMLINK/);
});

test('Gateway public source-recipe/schema provenance remains exact, never installed grants', () => {
  const catalog = read(path.join(repository, 'skills/common/plugin-runtime/foundation/config/pipeline-v10-gateway-sources.json'));
  for (const [name, source] of Object.entries(catalog.provenance) as [string, any][]) {
    const raw = fs.readFileSync(path.join(repository, source.path));
    assert.equal(createHash('sha256').update(raw).digest('hex'), source.sha256);
    assert.deepEqual(catalog[name], JSON.parse(raw.toString()));
  }
  const raw = fs.readFileSync(path.join(repository, catalog.contextProvenance.path));
  assert.equal(createHash('sha256').update(raw).digest('hex'), catalog.contextProvenance.sha256);
  const context = JSON.parse(raw.toString());
  assert.deepEqual(catalog.busterSourceInputs, context.contexts['local-A'].association.sourceInputs);
  assert.equal(catalog.nativeFullSchema, context.nativeFullSchema);
});

test('unselected Gateway models/ACP/credential source relations reject and restore', t => {
  const f = fixture(t);
  infraMutation(f, 'charts/kubeclaw/values.yaml', value => {
    value.profiles['nova-modelcontrast'].settings.agent.model.primary = 'foreign/model';
  }, /GATEWAY_RELATION_INVALID:AGENT_MODEL_ALIAS/);
  infraMutation(f, 'charts/kubeclaw/values.yaml', value => {
    value.profiles['local-B'].settings.gatewayOpenClaw.acp.allowedAgents = ['not-default'];
  }, /GATEWAY_RELATION_INVALID:ACP_DEFAULT/);
  infraMutation(f, 'charts/kubeclaw/values.yaml', value => {
    value.profiles['nova-current'].readonlyBindings.embedding.credential.locator = 'kubernetes-secret:foreign/key#value';
  }, /GATEWAY_RELATION_INVALID:ROLE_CREDENTIAL_SOURCE/);
});

test('Gateway source context digest/pointer/recipe cannot be substituted by public same-shaped data', t => {
  const f = fixture(t);
  infraMutation(f, 'managed-bootstrap-context.json', value => {
    value.contexts['local-A'].agentRole = 'nova';
  }, /GATEWAY_RELATION_INVALID:(busterContextSchema|CONTEXT_SOURCE_SHA)/);
  infraMutation(f, 'charts/kubeclaw/values.yaml', value => {
    value.profiles['nova-current'].readonlyBindings.bootstrapContextRef.pointer = '/contexts/NovaModelContrast';
  }, /GATEWAY_RELATION_INVALID:(CONTEXT_POINTER|ASSOCIATION_ownerProfileId)/);
  infraMutation(f, 'source-current/generated/role-source-recipes.json', value => {
    value.recipes['nova-current'].agentRole = 'buster';
  }, /GATEWAY_RELATION_INVALID:CAPTURED_RECIPE_INPUT/);
});

test('Gateway selected service identity remains exact, not a role-only caller union', t => {
  const f = fixture(t);
  infraMutation(f, 'config/pipeline.config.json', value => {
    value.deploymentSelections.find((x: any) => x.role === 'nova').serviceInstanceId = 'foreign-nova-gateway';
  }, /GATEWAY_RELATION_INVALID:SELECTED_SERVICE_IDENTITY/);
});

test('ALL recovery profiles obey intrinsic interval, reserve, PVC and request/limit source relations', t => {
  const f = fixture(t), relative = 'my-values/infra/postgresql-recovery.yaml';
  const selected = (value: any) => value.profiles[Object.keys(value.profiles).at(-1)!].settings;
  infraMutation(f, relative, value => { selected(value).verificationIntervalMinutes = 30; selected(value).backupIntervalMinutes = 1; }, /RECOVERY_RELATION_INVALID:INTERVAL/);
  infraMutation(f, relative, value => { selected(value).maximumAgeSeconds = 1; }, /RECOVERY_RELATION_INVALID:AGE_WINDOW/);
  infraMutation(f, relative, value => { selected(value).maximumRetainedBytes = selected(value).maximumBackupBytes; }, /RECOVERY_RELATION_INVALID:RETAINED_RESERVE/);
  infraMutation(f, relative, value => { selected(value).persistence.size = '1Gi'; }, /RECOVERY_RELATION_INVALID:PVC_CAPACITY/);
  infraMutation(f, relative, value => { selected(value).resources.requests.cpu = '999'; }, /RECOVERY_RELATION_INVALID:RESOURCE_REQUEST_LIMIT/);
});

test('recovery exact quantities retain decimal/binary domains without allocating enormous exponents', async () => {
  const { recoveryQuantityAtMost: le } = await import('../../../skills/common/plugin-runtime/foundation/config/pipeline-v10-recovery.ts');
  assert.equal(le('250m', '1'), true); assert.equal(le('1Gi', '1024Mi'), true);
  assert.equal(le('.5', '500m'), true); assert.equal(le('1.0001', '1'), false);
  assert.equal(le('1e-9999999999999999999999', '1n'), true);
  assert.throws(() => le('1e9999999999999999999999', '1'), /QUANTITY_I64/);
  assert.equal(le('9223372036854775807', '9223372036854775807'), true);
  assert.throws(() => le('9223372036854775807.1', '9223372036854775807'), /QUANTITY_I64/);
  assert.throws(() => le('0', '1'), /QUANTITY_POSITIVE/);
});

test('ALL Gateway profile TTLs use original pure native duration parser, not silent native fallback', t => {
  const f = fixture(t);
  infraMutation(f, 'charts/kubeclaw/values.yaml', value => {
    value.profiles['nova-modelcontrast'].settings.gatewayOpenClaw.agents.defaults.contextPruning.ttl = 'not-native-duration';
  }, /PIPELINE_V10_GATEWAY_DURATION_INVALID/);
  infraMutation(f, 'charts/kubeclaw/values.yaml', value => {
    value.profiles['nova-modelcontrast'].settings.gatewayOpenClaw.agents.defaults.contextPruning.ttl = '999999999999999999999d';
  }, /PIPELINE_V10_GATEWAY_DURATION_INVALID/);
  const file = path.join(f.directory, 'charts/kubeclaw/values.yaml'), original = fs.readFileSync(file), value = read(file);
  value.profiles['nova-modelcontrast'].settings.gatewayOpenClaw.agents.defaults.contextPruning.ttl = '1h30m';
  fs.writeFileSync(file, JSON.stringify(value)); supportedPolicyMutation(f);
  fs.writeFileSync(file, original); assert.throws(f.load, /PIPELINE_V10_SOURCE_RECEIVING_REQUIRED/);
});

test('unselected Lighthouse fractional throughput admitted by schema must still meet actual native parser', t => {
  const f = fixture(t);
  relationMutation(f, 'plugins/kubeclaw.lighthouse.config.json', value => {
    const unselected = Object.keys(value.profiles).find(name => name !== 'A')!;
    assert.ok(unselected);
    value.profiles[unselected].processing.settings.profiles.desktop.throttling.throughputKbps = 0.5;
  }, /PIPELINE_V10_BROWSER_NATIVE_INVALID:NUMBER/);
  const file = path.join(f.config, 'plugins/kubeclaw.lighthouse.config.json'), original = fs.readFileSync(file), value = read(file);
  const unselected = Object.keys(value.profiles).find(name => name !== 'A')!;
  value.profiles[unselected].processing.settings.profiles.desktop.throttling.throughputKbps = 1;
  fs.writeFileSync(file, JSON.stringify(value)); supportedPolicyMutation(f);
  fs.writeFileSync(file, original); assert.throws(f.load, /PIPELINE_V10_SOURCE_RECEIVING_REQUIRED/);
});

test('changed source code and package metadata reject without executing generation module', t => {
  const f = fixture(t), source = sources.packages['kubeclaw.api-flow'];
  const module = path.join(f.directory, path.dirname(source.manifestPath), source.manifest.testProviders[0].module);
  const before = fs.readFileSync(module), marker = path.join(f.directory, 'MUST-NOT-EXECUTE');
  fs.writeFileSync(module, `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)}, 'executed'); export function provider() {}`);
  assert.throws(f.load, /PIPELINE_V10_PACKAGE_SOURCE_BYTES/); assert.equal(fs.existsSync(marker), false);
  fs.writeFileSync(module, before); assert.throws(f.load, /PIPELINE_V10_SOURCE_RECEIVING_REQUIRED/);
  infraMutation(f, path.posix.join(path.posix.dirname(source.manifestPath), 'package.json'), value => {
    value.name = '@foreign/replaced-package';
  }, /PIPELINE_V10_PACKAGE_SOURCE_BYTES/);
});

test('undeclared extra source and removed nonentrypoint package file cannot escape full registry package identity', t => {
  const f = fixture(t), source = sources.packages['kubeclaw.api-flow'];
  const directory = path.join(f.directory, path.dirname(source.manifestPath)), extra = path.join(directory, 'foreign-helper.js');
  fs.writeFileSync(extra, 'export const foreign = true;');
  assert.throws(f.load, /PIPELINE_V10_PACKAGE_SOURCE_FILE_SET/);
  fs.unlinkSync(extra); assert.throws(f.load, /PIPELINE_V10_SOURCE_RECEIVING_REQUIRED/);
  const file = path.join(directory, 'package.json'), before = fs.readFileSync(file);
  fs.unlinkSync(file); assert.throws(f.load, /PIPELINE_V10_PACKAGE_SOURCE_FILE_SET/);
  fs.writeFileSync(file, before); assert.throws(f.load, /PIPELINE_V10_SOURCE_RECEIVING_REQUIRED/);
});
