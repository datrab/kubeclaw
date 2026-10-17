import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pluginSourceClosure, pluginInvocationFacts } from '../plugin-source-closure.mjs';

function fixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-source-closure-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

test('finds a Redis client behind imports, re-exports and a cycle without executing code', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-source-closure-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'entry.ts'), "import './writer.js'; throw new Error('must not execute');");
  fs.writeFileSync(path.join(root, 'writer.ts'), "export { connect } from './transport'; import type { Missing } from './type-only.ts';");
  fs.writeFileSync(path.join(root, 'transport.ts'), "import './entry.ts'; const Redis = require('ioredis'); export function connect() { return new Redis(); }");
  const result = pluginSourceClosure(path.join(root, 'entry.ts'), root);
  assert.equal(result.sources.size, 3);
  assert.deepEqual(result.externalImports, ['ioredis']);
  assert.deepEqual(result.unresolved, []);
});

test('retains unresolved runtime imports instead of proving absence of dependencies', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-source-closure-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'entry.ts'), "import './missing.ts'; import(runtimeModule); import { type OnlyType } from './types.ts';");
  const result = pluginSourceClosure(path.join(root, 'entry.ts'), root);
  assert.equal(result.unresolved.length, 2);
  assert.ok(result.unresolved.some((item) => item.endsWith('/missing.ts')));
  assert.ok(result.unresolved.some((item) => item.endsWith(': dynamic module')));
});

test('traces the shipped OpenClaw observer to its Redis connection and configuration', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const result = pluginSourceClosure(path.join(root, 'skills/common/plugins/openclaw-agent-observer/src/index.ts'), root);
  assert.ok(result.externalImports.includes('ioredis'));
  assert.ok([...result.sources.keys()].some((item) => item.endsWith('/src/redis-writer.ts')));
  assert.ok([...result.sources.keys()].some((item) => item.endsWith('/src/config.ts')));
  assert.deepEqual(result.unresolved, []);
  const calls = pluginInvocationFacts(result);
  assert.ok(calls.evidence.some((item) => item.kind === 'client-owner' && item.name === 'ioredis'));
});

test('follows workspace export conditions, named barrel exports and extension aliases', (t) => {
  const root = fixture(t, {
    'package.json': JSON.stringify({ workspaces: ['packages/*'] }),
    'entry.ts': "import { local } from '@test/service'; export function read() { return local(); }",
    'packages/service/package.json': JSON.stringify({ name: '@test/service', exports: { '.': { types: './absent.d.ts', import: './src/index.mjs' } } }),
    'packages/service/src/index.mts': "export { read as local } from './local.cjs'; export { remote } from './remote.js';",
    'packages/service/src/local.cts': 'export function read() { return 3; }',
    'packages/service/src/remote.ts': 'export function remote() { return fetch(remoteUrl); }',
  });
  const closure = pluginSourceClosure(path.join(root, 'entry.ts'), root);
  assert.equal(closure.sources.size, 4);
  assert.deepEqual(closure.externalImports, []);
  assert.deepEqual(closure.unresolved, []);
  const facts = pluginInvocationFacts(closure, 'read');
  assert.deepEqual(facts.diagnostics, []);
  assert.deepEqual(facts.evidence, []);
  assert.ok([...facts.selectedSources.keys()].some((file) => file.endsWith('local.cts')));
  assert.ok(![...facts.selectedSources.keys()].some((file) => file.endsWith('remote.ts')));
});

test('ignores all type-only import and export forms while retaining unresolved dynamic runtime imports', (t) => {
  const root = fixture(t, {
    'entry.ts': "import type { A } from './types.ts'; import { type B } from './types2.ts'; export type { C } from './types3.ts'; export { type D } from './types4.ts'; export function execute() { return import(runtimeModule); }",
  });
  const closure = pluginSourceClosure(path.join(root, 'entry.ts'), root);
  assert.equal(closure.sources.size, 1);
  assert.equal(closure.unresolved.length, 1);
  assert.match(pluginInvocationFacts(closure, 'execute').diagnostics.join(' '), /dynamic module requires runtime authority/u);
});

test('a new registration changes dependencies by invocation, never by names, comments or literals', (t) => {
  const root = fixture(t, {
    'entry.ts': "// Redis Tailscale https://example.invalid\nexport function evidence() { const packageId = 'kubeclaw.tailscale-exposure'; return packageId === 'kubeclaw.tailscale-exposure'; }\nexport function newRegistration(context) { return context.invoke('kubernetes.exposure', {}); }",
  });
  const closure = pluginSourceClosure(path.join(root, 'entry.ts'), root);
  const local = pluginInvocationFacts(closure, 'evidence');
  const remote = pluginInvocationFacts(closure, 'newRegistration');
  assert.deepEqual(local.evidence, []);
  assert.deepEqual(local.diagnostics, []);
  assert.deepEqual(remote.evidence.map((item) => [item.kind, item.name]), [['capability', 'kubernetes.exposure']]);
});

test('detects Node HTTP, net and TLS calls through runtime import bindings', (t) => {
  const root = fixture(t, {
    'entry.ts': "import http from 'http'; import { connect as tcp } from 'node:net'; import tls from 'node:tls'; export function execute() { http.request(url); tcp(port); tls.connect(port); }",
  });
  const closure = pluginSourceClosure(path.join(root, 'entry.ts'), root);
  assert.deepEqual(closure.builtinImports, ['http', 'net', 'tls']);
  assert.deepEqual(pluginInvocationFacts(closure, 'execute').evidence.map((item) => item.name).sort(), ['http', 'node:net', 'node:tls']);
});

test('preserves all reached exports in the source authority fingerprint', (t) => {
  const root = fixture(t, {
    'entry.ts': "import { remote, local } from './owners'; export function execute() { return [remote(), local()]; }",
    'owners.ts': 'export function remote() { return fetch(endpoint); } export function local() { return 1; }',
  });
  const facts = pluginInvocationFacts(pluginSourceClosure(path.join(root, 'entry.ts'), root), 'execute');
  const selected = facts.selectedSources.get(path.join(root, 'owners.ts'));
  assert.match(selected, /function remote/u);
  assert.match(selected, /function local/u);
  assert.ok(facts.evidence.some((item) => item.name === 'HTTP fetch'));
});

test('a bare forwarding interface cannot prove the absence of delegated dependencies', (t) => {
  const root = fixture(t, { 'entry.ts': 'export function execute(context) { return (capability, request) => context.invoke(capability, request); }' });
  const facts = pluginInvocationFacts(pluginSourceClosure(path.join(root, 'entry.ts'), root), 'execute');
  assert.match(facts.diagnostics.join(' '), /Forwarded capability has no resolved caller authority/u);
});

test('unresolved selected workspace exports fail closed and unused dynamic barrels stay separate', (t) => {
  const root = fixture(t, {
    'package.json': JSON.stringify({ workspaces: ['packages/*'] }),
    'entry.ts': "import { missing } from '@test/local/absent'; export function execute() { return missing(); }",
    'packages/local/package.json': JSON.stringify({ name: '@test/local', exports: { '.': './index.ts' } }),
    'packages/local/index.ts': 'export const local = 1;',
  });
  const closure = pluginSourceClosure(path.join(root, 'entry.ts'), root);
  assert.match(closure.unresolved.join(' '), /workspace export @test\/local\/absent/u);
  assert.match(pluginInvocationFacts(closure, 'execute').diagnostics.join(' '), /unresolved runtime import/u);
});

test('tracks createRequire aliases and rejects dynamic aliases in the selected invocation', (t) => {
  const root = fixture(t, {
    'entry.ts': "import { createRequire as factory } from 'node:module'; const load = factory(import.meta.url); export function local() { return load('./data.js'); } export function dynamic() { return load(runtimeModule); }",
    'data.ts': 'export const value = 3;',
  });
  const closure = pluginSourceClosure(path.join(root, 'entry.ts'), root);
  assert.equal(closure.sources.size, 2);
  assert.equal(closure.unresolved.length, 1);
  assert.deepEqual(pluginInvocationFacts(closure, 'local').diagnostics, []);
  assert.match(pluginInvocationFacts(closure, 'dynamic').diagnostics.join(' '), /dynamic module requires runtime authority/u);
});

test('literal runtime loaders retain missing targets and opaque external authority', (t) => {
  const root = fixture(t, { 'entry.ts': "export function missing() { return import('./absent.js'); } export function external() { return require('opaque-client'); }" });
  const closure = pluginSourceClosure(path.join(root, 'entry.ts'), root);
  assert.match(pluginInvocationFacts(closure, 'missing').diagnostics.join(' '), /unresolved runtime import/u);
  assert.match(pluginInvocationFacts(closure, 'external').diagnostics.join(' '), /external runtime implementation opaque-client/u);
});

test('a star re-export cannot supply a registration default export', (t) => {
  const root = fixture(t, { 'entry.ts': "export * from './implementation';", 'implementation.ts': 'export default function execute() { return 1; }' });
  const facts = pluginInvocationFacts(pluginSourceClosure(path.join(root, 'entry.ts'), root), 'default');
  assert.match(facts.diagnostics.join(' '), /export default cannot be resolved/u);
});

test('the evidence registration reads artifacts and verified local imports without a Buster or Tailscale call', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const closure = pluginSourceClosure(path.join(root, 'skills/nova/plugins/remote-test-gate/src/evidence-adapter.ts'), root);
  const facts = pluginInvocationFacts(closure, 'activate');
  assert.deepEqual([...new Set(facts.evidence.filter((item) => item.kind === 'capability').map((item) => item.name))], ['artifacts.read']);
  assert.ok(!facts.evidence.some((item) => item.kind === 'client' || item.kind === 'client-owner'));
  assert.ok([...facts.selectedSources.values()].some((text) => text.includes('class FileNovaGateImportStore')));
});

test('computed environment selectors retain lexical mapping provenance without executing or guessing values', (t) => {
  const root = fixture(t, {
    'entry.ts': `export function activate(context) {
  const mapping = context.config.environment;
  const names = Object.freeze({ ...mapping });
  return { invoke(request) {
    const variable = names[request.resource.canonicalId];
    const environment = process.env;
    return environment[variable];
  } };
}
export function unused() { return process.env.UNUSED_SECRET; }`,
  });
  const facts = pluginInvocationFacts(pluginSourceClosure(path.join(root, 'entry.ts'), root), 'activate');
  assert.equal(facts.environmentInputs.length, 1);
  const input = facts.environmentInputs[0];
  assert.equal(input.expression, 'environment[variable]');
  assert.equal(input.dynamic, true);
  assert.deepEqual(input.provenance.map((item) => [item.name, item.expression]), [
    ['variable', 'names[request.resource.canonicalId]'], ['names', 'Object.freeze({ ...mapping })'], ['mapping', 'context.config.environment'],
  ]);
  assert.equal(input.line, 7);
  assert.ok(!JSON.stringify(input).includes('UNUSED_SECRET'));
});

test('environment facts distinguish literal inputs, loop-selected allowlists and default-parameter aliases', (t) => {
  const root = fixture(t, { 'entry.ts': `export function read(environment = process.env) {
  const keys = ['PATH', 'SSH_AUTH_SOCK'];
  for (const key of keys) consume(process.env[key]);
  return [process.env.CONTROL_URL, environment['PASSWORD']];
}` });
  const inputs = pluginInvocationFacts(pluginSourceClosure(path.join(root, 'entry.ts'), root), 'read').environmentInputs;
  assert.equal(inputs.length, 3);
  assert.deepEqual(inputs.map((item) => item.dynamic), [true, false, false]);
  assert.deepEqual(inputs[0].provenance.map((item) => item.expression), ['keys', "['PATH', 'SSH_AUTH_SOCK']"]);
  assert.ok(inputs.every((item) => !Object.hasOwn(item, 'credential')));
});

test('capability requests retain literal operation authority and mark computed operations unresolved', (t) => {
  const root = fixture(t, { 'entry.ts': `export function read(context, operation) {
  context.invoke('security.scan', { operation: 'image', payload: {} });
  context.invoke('security.scan', { operation, payload: {} });
}` });
  const requests = pluginInvocationFacts(pluginSourceClosure(path.join(root, 'entry.ts'), root), 'read').capabilityRequests;
  assert.deepEqual(requests.map((item) => item.operation), ['image', null]);
});

test('request constructors and local forwarding calls preserve each finite operation and fail closed after escape', (t) => {
  const root = fixture(t, { 'entry.ts': `function constructed() { return { operation: 'prepare' }; }
export function execute(context) {
  function send(request) { return context.invoke('network.http', request); }
  send({ operation: 'request' }); send({ operation: 'websocket' });
  context.invoke('kubernetes.fixture', constructed());
}
export function escaped(context, external) {
  function send(request) { return context.invoke('network.http', request); }
  send({ operation: 'request' }); external(send);
}` });
  const closure = pluginSourceClosure(path.join(root, 'entry.ts'), root);
  assert.deepEqual(pluginInvocationFacts(closure, 'execute').capabilityRequests.map((item) => item.operation), ['request', 'websocket', 'prepare']);
  assert.deepEqual(pluginInvocationFacts(closure, 'escaped').capabilityRequests.map((item) => item.operation), [null]);
});
