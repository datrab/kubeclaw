#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRegistrationDependencyCollector, joinNativeDependencyAuthorities, acquireNativeDependencyReport } from '../plugin-registration-dependencies.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'registration-dependencies-'));
const moduleFile = fileURLToPath(new URL('../plugin-registration-dependencies.mjs', import.meta.url));
const revision = '1'.repeat(40);
try {
  // Import from an empty directory: no generated inventory, native source tree,
  // git checkout, configuration inventory, or CLI command is available.
  const imported = execFileSync(process.execPath, ['--input-type=module', '-e',
    `await import(${JSON.stringify(new URL('../plugin-registration-dependencies.mjs', import.meta.url).href)});`], { cwd: root, encoding: 'utf8' });
  assert.equal(imported, '');
  assert.deepEqual(fs.readdirSync(root), []);
  const file = path.join(root, 'plugin.json');
  fs.writeFileSync(file, '{"id":"fixture"}\n');
  fs.writeFileSync(path.join(root, 'index.js'), 'export function activate() { return 1; }\n');
  const registration = { id: 'one', kind: 'OpenClaw extension', module: 'index.js', export: 'activate', requiredCapabilities: [] };
  const plugin = { file, directory: root, openclaw: true, manifest: { id: 'fixture' }, registrations: [registration] };
  const options = { root, plugins: [plugin], configurationSemantics: { files: [] },
    sourceRevision: revision, sourceBase: `https://example.invalid/repository/blob/${revision}`,
    sourceEvidenceLink: () => 'pinned-invocation',
    sourceLink: (_label, target) => { assert.ok([file, path.join(root, 'index.js')].includes(target)); return 'pinned-host-manifest'; } };
  const collect = (overrides = {}) => createRegistrationDependencyCollector({ ...options, ...overrides });
  assert.throws(() => collect({ sourceRevision: 'HEAD' }), /full Git commit SHA/);
  assert.throws(() => collect({ sourceBase: 'https://example.invalid/repository/blob/HEAD' }), /pin sourceRevision/);
  assert.throws(() => collect({ configurationSemantics: undefined }), /explicit plugins and configuration/);
  assert.throws(() => collect({ sourceLink: undefined }), /pinned source link authorities/);
  assert.throws(() => collect({ root: '.' }), /absolute/);
  const first = collect().registrationDependencyFacts(plugin, registration);
  assert.deepEqual(first.required, []);
  assert.match(first.secret, /No schema-declared credential/);
  assert.match(first.dataOwner, /no remote data owner is established/);
  const configured = { ...registration, configSchemaObject: { type: 'object', properties: {
    token: { type: 'string', writeOnly: true }, endpoint: { type: 'string' },
  } } };
  const changed = collect().registrationDependencyFacts(plugin, configured);
  assert.match(changed.secret, /`token`/);
  assert.match(changed.secret, /OpenClaw deployment owns/);
  assert.match(changed.endpoint, /`endpoint`/);
  assert.notEqual(changed.digest, first.digest);
  const removed = collect().registrationDependencyFacts(plugin, registration);
  assert.deepEqual(removed, first);
  const codexPlugin = { ...plugin, openclaw: false, codex: true };
  const codex = collect({ plugins: [codexPlugin] }).registrationDependencyFacts(codexPlugin,
    { ...configured, kind: 'Codex plugin', requiredCapabilities: ['network.http'] });
  assert.deepEqual(codex.required, ['network.http']);
  assert.match(codex.secret, /linked runtime consumer owns/);
  assert.doesNotMatch(codex.secret, /OpenClaw deployment owns/);
  // The caller's source policy must remain mandatory for host fallback links.
  assert.throws(() => collect({ sourceLink: () => { throw new Error('unpinned manifest'); } })
    .registrationDependencyFacts(plugin, registration), /unpinned manifest/);
  const authority = collect().registrationDependencyAuthority(plugin, configured);
  assert.equal(authority.identity.host, 'openclaw');
  assert.equal(authority.operationalOwner, null);
  assert.equal(authority.nativeManifestAuthor, null);
  assert.equal(authority.observedRuntimeData, false);
  assert.deepEqual(authority.artifactOperations, []);
  assert.equal(authority.schema.secrets[0].path, 'token');
  assert.ok(!JSON.stringify(authority.schema).includes(root));
  const authPlugin = { ...plugin, directory: path.join(root, 'skills/buster/plugins/demo-auth-smoke') };
  const authRegistration = { ...registration, configSchema: 'schemas/config.schema.json', configSchemaObject: {
    type: 'object', properties: { usernameKey: { type: 'string' }, passwordKey: { type: 'string' }, passwordSecret: { type: 'string' } },
  } };
  const authAuthority = collect({ plugins: [authPlugin], sourceLink: () => 'pinned-fixture' })
    .registrationDependencyAuthority(authPlugin, authRegistration);
  assert.deepEqual(authAuthority.schema.secrets.map(field => field.path), ['passwordSecret']);
  const native = [{ id: 'fixture', host: 'openclaw', manifest: 'plugin.json', registrations: [
    { id: 'one', kind: 'openclaw-extension' },
  ] }];
  const joined = joinNativeDependencyAuthorities(native, [authority]);
  const report = acquireNativeDependencyReport({ ...options, plugins: [{ ...plugin, registrations: [configured] }], nativePackages: native });
  assert.deepEqual(report.packages, joined);
  assert.equal(report.packageCount, native.length);
  assert.equal(report.registrationCount, 1);
  assert.throws(() => acquireNativeDependencyReport({ ...options, nativePackages: [] }), /Extra dependency authority/);
  assert.throws(() => acquireNativeDependencyReport({ ...options, nativePackages: native, plugins: [] }), /Missing dependency authority/);
  assert.throws(() => acquireNativeDependencyReport({ ...options }), /Native packages must be explicit/);

  assert.equal(joined[0].registrations[0].dependencyAuthority, authority);
  assert.equal(joined[0].registrations[0].nativeCapabilityComparison.required, 'not projected by native inventory');
  assert.ok(!Object.hasOwn(native[0].registrations[0], 'dependencyAuthority'));
  assert.throws(() => joinNativeDependencyAuthorities(native, []), /Missing dependency authority/);
  assert.throws(() => joinNativeDependencyAuthorities(native, [authority, authority]), /Duplicate dependency authority/);
  assert.throws(() => joinNativeDependencyAuthorities([], [authority]), /Extra dependency authority/);
  assert.throws(() => joinNativeDependencyAuthorities([...native, ...native], [authority]), /Duplicate native registration/);
  for (const identity of [ { ...authority.identity, host: 'codex' },
    { ...authority.identity, manifest: 'other.json' }, { ...authority.identity, kind: 'stage' } ]) {
    assert.throws(() => joinNativeDependencyAuthorities(native, [{ ...authority, identity }]), /identity\/capability mismatch/);
  }
  const pipeline = [{ ...native[0], host: 'pipeline-runtime', registrations: [{ id: 'one', kind: 'stage',
    requiredCapabilities: ['artifacts.write'], providedCapabilities: [] }] }];
  const pipelineAuthority = { ...authority, identity: { ...authority.identity, host: 'pipeline-runtime', kind: 'stage' },
    required: ['artifacts.write'], provided: [] };
  assert.equal(joinNativeDependencyAuthorities(pipeline, [pipelineAuthority])[0].registrations[0]
    .nativeCapabilityComparison.required, 'exact');
  assert.throws(() => joinNativeDependencyAuthorities(pipeline, [{ ...pipelineAuthority, required: [] }]), /identity\/capability mismatch/);
  assert.throws(() => joinNativeDependencyAuthorities([{ ...pipeline[0], registrations: [{ id: 'one', kind: 'stage' }] }],
    [pipelineAuthority]), /identity\/capability mismatch/);
  assert.ok(fs.existsSync(moduleFile));
  console.log('registration dependency collector: import isolation, explicit authority, host-specific schema add/change/remove and source refusal pass');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
