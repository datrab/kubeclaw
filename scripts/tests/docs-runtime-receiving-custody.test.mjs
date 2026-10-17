import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { externalProducerContract, qualifiedProducerBindings, runtimeConsumerContract } from '../docs-runtime-consumer-contracts.mjs';

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const acquired = new Map();
function acquire(source, mutated = null) {
  if (mutated === null && acquired.has(source)) return acquired.get(source);
  const directory = mutated === null ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-custody-'));
  try {
    const argv = ['scripts/docs-configuration-inventory.mjs', '--environment-producer-custody-probe', source];
    if (directory) {
      const input = path.join(directory, 'input.yaml'); fs.writeFileSync(input, mutated);
      argv.push('--probe-input', input);
    }
    const rows = JSON.parse(execFileSync(process.execPath, argv, { cwd: sourceRoot, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
    if (mutated === null) acquired.set(source, rows);
    return rows;
  } finally { if (directory) fs.rmSync(directory, { recursive: true, force: true }); }
}
function qualify(row, selectedRoot = sourceRoot) {
  return externalProducerContract(row.name, row.path, { ...row, sourceRoot: selectedRoot });
}
function contract(name, source, container = null) {
  const row = acquire(source).find(item => item.name === name && (container === null || item.custody.container.name === container));
  assert(row, `Missing actual declaration ${name}:${source}:${container}`);
  return qualify(row);
}
const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('a qualified name cannot borrow an external loader from another producer', () => {
  const pair = 'GH_TOKEN:charts/prism/templates/ingestion.yaml';
  qualifiedProducerBindings.add(pair);
  try {
    const source = 'charts/prism/templates/ingestion.yaml';
    const row = { ...acquire(source)[0], name: 'GH_TOKEN' };
    assert.throws(() => qualify(row), /CONFIG_PRODUCER_RECEIVER_CUSTODY_UNQUALIFIED/u);
  }
  finally { qualifiedProducerBindings.delete(pair); }
});

test('unrelated host readers do not establish Gateway receiving behavior', () => {
  for (const name of ['TMPDIR', 'XDG_CACHE_HOME', 'NODE_PATH']) {
    const c = contract(name, 'charts/kubeclaw/templates/deployment.yaml');
    assert.match(c.boundary, /receiving-runtime behavior not established/u);
    assert.match(c.acceptedForm, /transport only/u);
    assert.match(c.defaultBehavior, /no receiving-process default/u);
  }
  assert.match(contract('PRISM_STUDIO_PUBLIC_URL', 'my-values/prism-agent-values.yaml').purpose, /different workload/u);
});

test('same name has separate Prism workloads and receiving sources', () => {
  const studio = contract('PRISM_CONTROL_URL', 'charts/prism/templates/workloads.yaml');
  const bridge = contract('PRISM_CONTROL_URL', 'my-values/prism-agent-values.yaml', 'prism-agent-bridge');
  assert.match(studio.boundary, /receiving-runtime behavior not established/u);
  assert.match(studio.purpose, /not its imported studio-config/u);
  assert(runtimeConsumerContract('PRISM_CONTROL_URL', 'skills/prism/server/studio-config.ts'));
  assert.match(bridge.owner, /agent-bridge\.mjs/u);
  assert.doesNotMatch(studio.owner, /agent-bridge/u);
  assert.match(read('skills/prism/server/studio.ts'), /loadStudioConfig\(\)/u);
  assert.match(read('my-values/prism-agent-values.yaml'), /command: \[node, \/opt\/kubeclaw-prism\/agent-bridge\.mjs\]/u);
});

test('database bootstrap and migration retain different command authorities', () => {
  assert.match(contract('ADMIN_DATABASE_URL', 'charts/prism/templates/jobs.yaml').owner, /database-bootstrap\.ts/u);
  assert.equal(contract('DATABASE_URL', 'charts/prism/templates/jobs.yaml').owner, 'skills/prism/server/migrate.ts');
  assert.match(read('charts/prism/templates/jobs.yaml'), /command: \["node", "--experimental-strip-types", "skills\/prism\/server\/bootstrap-database\.ts"\]/u);
  assert.match(read('skills/prism/server/migrate.ts'), /process\.env\.DATABASE_URL/u);
});

test('Buster profile names cannot borrow entrypoint readers for different keys', () => {
  const entrypoint = read('docker/buster-runtime-entrypoint.sh');
  for (const name of ['BUSTER_V2_RESULT_ROOT', 'BUSTER_V2_KUBERNETES_CREDENTIALS', 'CONTAINER_BUILD_BUILDKIT_HOST']) {
    assert.doesNotMatch(entrypoint, new RegExp(`\\b${name}\\b`, 'u'));
    assert.match(contract(name, 'my-values/buster-values.yaml').boundary, /receiving-runtime behavior not established/u);
  }
  const real = contract('BUSTER_PLAN_STATE_DIR', 'my-values/buster-values.yaml');
  assert.match(real.owner, /buster-runtime-entrypoint\.sh/u);
  assert.match(real.owningSurface, /buster-v2-runtime/u);
  assert.match(entrypoint, /BUSTER_PLAN_STATE_DIR:-/u);
});

test('Nova config-selected names do not assert an unproved fixed selection', () => {
  assert.match(contract('BUSTER_V2_TOKEN', 'my-values/nova-values.yaml').purpose, /does not establish that config selection/u);
  assert.match(contract('BUSTER_SOURCE_ATTESTATION_PRIVATE_KEY', 'my-values/nova-values.yaml').purpose, /does not establish that config selection/u);
  const loader = read('skills/nova/core/test-gates/runtime-config.ts');
  assert.match(loader, /authentication === 'bearer'/u);
  assert.match(loader, /token = environment\[tokenName\]/u);
  assert.match(loader, /environment\[sourceKeyName\]/u);
});

test('same source wrong-container injection fails while unchanged sibling remains qualified', () => {
  const source = 'charts/prism/templates/workloads.yaml';
  const text = read(source);
  const anchor = '{{- if eq $name "worker" }}\n            - { name: PRISM_NATIVE_CLOSE_TIMEOUT_MS';
  assert(text.includes(anchor));
  const changed = text.replace(anchor, '{{- if eq $name "worker" }}\n            - { name: PRISM_CONTROL_URL, value: "http://prism-control:8080" }\n            - { name: PRISM_NATIVE_CLOSE_TIMEOUT_MS');
  const rows = acquire(source, changed).filter(row => row.name === 'PRISM_CONTROL_URL');
  assert.equal(rows.length, 2);
  const studio = rows.find(row => row.custody.guards.some(guard => guard.expression === 'eq $name "studio"'));
  const worker = rows.find(row => row.custody.guards.some(guard => guard.expression === 'eq $name "worker"'));
  assert(qualify(studio));
  assert.throws(() => qualify(worker), /unsupported declaration\/container\/command\/render placement/u);
});

test('moving a known declaration to another branch cannot inherit Studio custody', () => {
  const source = 'charts/prism/templates/workloads.yaml';
  const text = read(source).replace('{{- if eq $name "studio" }}\n            - { name: PRISM_CONTROL_URL', '{{- if eq $name "control" }}\n            - { name: PRISM_CONTROL_URL');
  const row = acquire(source, text).find(item => item.name === 'PRISM_CONTROL_URL');
  assert.throws(() => qualify(row), /CONFIG_PRODUCER_RECEIVER_CUSTODY_UNQUALIFIED/u);
});

test('same-source known external name cannot migrate from Codex to MCP', () => {
  const source = 'charts/ops-pod/templates/workload.yaml';
  const text = read(source).replace('            - {name: HOST, value: "127.0.0.1"}', '            - {name: GH_TOKEN, value: "unusable-test-token"}\n            - {name: HOST, value: "127.0.0.1"}');
  const rows = acquire(source, text).filter(row => row.name === 'GH_TOKEN');
  assert.equal(rows.length, 2);
  assert(qualify(rows.find(row => row.custody.container.name === 'codex')));
  assert.throws(() => qualify(rows.find(row => row.custody.container.name === 'ops-mcp')), /CONFIG_PRODUCER_RECEIVER_CUSTODY_UNQUALIFIED/u);
});

test('explicit command, command guard and templated image selector drift fail custody', () => {
  const source = 'charts/prism/templates/workloads.yaml';
  const original = read(source);
  const variants = [
    original.replace('command: ["node", "skills/prism/server/worker.ts"]', 'command: ["node", "/tmp/unreviewed-worker.ts"]'),
    original.replace('{{- if eq $name "worker" }}\n          command:', '{{- if eq $name "control" }}\n          command:'),
    original.replace('image: {{ include "prism.imageRef" $image | quote }}', 'image: {{ include "prism.imageRef" $.Values.images.studio | quote }}'),
  ];
  for (const text of variants) {
    assert.notEqual(text, original);
    const row = acquire(source, text).find(item => item.name === 'PRISM_ENGINE_CONTENT_DIGEST');
    assert.throws(() => qualify(row), /CONFIG_PRODUCER_RECEIVER_CUSTODY_UNQUALIFIED/u);
  }
});

test('Control engine-digest injection remains transport-only beside the worker reader', () => {
  const c = contract('PRISM_ENGINE_CONTENT_DIGEST', 'charts/prism/templates/workloads.yaml');
  assert.deepEqual(c.receivingProcesses.map(item => item.process), ['Prism control', 'Prism worker']);
  assert.equal(c.receivingProcesses[0].receiver, null);
  assert.match(c.receivingProcesses[0].boundary, /transport only/u);
  assert.equal(c.receivingProcesses[1].receiver, 'skills/prism/config/native-worker.ts');
});

test('first-party default launch and COPY-source changes reject unchanged manifest custody', () => {
  const source = 'charts/prism/templates/ingestion.yaml';
  const row = acquire(source).find(item => item.name === 'PRISM_QUARANTINE_ROOT');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-image-custody-'));
  const recipe = 'docker/Dockerfile.prism-ingestion';
  fs.mkdirSync(path.join(directory, 'docker'));
  try {
    const original = read(recipe);
    for (const text of [
      original.replace('skills/prism/server/ingestion.ts', 'skills/prism/server/other.ts'),
      original.replace('COPY --from=build /build/skills/prism /app/prism/skills/prism', 'COPY --from=build /build/skills/nova /app/prism/skills/prism'),
    ]) {
      assert.notEqual(text, original);
      fs.writeFileSync(path.join(directory, recipe), text);
      assert.throws(() => qualify(row, directory), /complete exact recipe-byte authority changed in docker\/Dockerfile\.prism-ingestion/u);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('actual lint subprocess transport applies owned caches then invocation overrides', async () => {
  const { safeExec } = await import('../../skills/nova/plugins/lint/src/engine/execution.ts');
  const previous = { HOME: process.env.HOME, GOCACHE: process.env.GOCACHE };
  process.env.HOME = '/tmp/custody-inherited-home';
  process.env.GOCACHE = '/tmp/custody-unselected-inherited-cache';
  const program = 'process.stdout.write(JSON.stringify({home:process.env.HOME,cache:process.env.GOCACHE}))';
  try {
    const defaulted = await safeExec(process.execPath, ['-e', program]);
    assert.equal(defaulted.ok, true);
    const value = JSON.parse(defaulted.stdout);
    assert.equal(value.home, process.env.HOME);
    assert.notEqual(value.cache, process.env.GOCACHE);
    assert.match(value.cache, /kubeclaw-lint-cache\/go-build$/u);
    const overridden = await safeExec(process.execPath, ['-e', program], { env: { HOME: null, GOCACHE: '' } });
    assert.equal(overridden.ok, true);
    assert.deepEqual(JSON.parse(overridden.stdout), { cache: '' });
    await assert.rejects(safeExec(process.execPath, ['-e', program], { env: { CUSTODY_UNSUPPORTED_KEY: 'x' } }), /not allowlisted/u);
    assert.match(runtimeConsumerContract('GOCACHE', 'skills/nova/plugins/lint/src/engine/execution.ts').precedence, /opts\.env wins/u);
  } finally {
    for (const [name, value] of Object.entries(previous)) if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

test('Studio header normalization is distinct from Control exact secret comparison', async () => {
  const { loadStudioConfig } = await import('../../skills/prism/server/studio-config.ts');
  const { exchangeTailscaleIdentity } = await import('../../skills/prism/control/session.ts');
  const config = loadStudioConfig({ PRISM_INGRESS_SECRET: ' test-secret ' });
  assert.equal(config.ingressSecret, ' test-secret ');
  const headers = new Headers(); headers.set('x-prism-ingress-secret', config.ingressSecret);
  assert.equal(headers.get('x-prism-ingress-secret'), 'test-secret');
  assert.throws(() => exchangeTailscaleIdentity({ 'x-prism-ingress-secret': headers.get('x-prism-ingress-secret'), 'tailscale-user-login': 'test-user' }, config.ingressSecret, 'test-session-secret'), /untrusted ingress/u);
});

test('actual Studio proxy catches an invalid header before network dispatch', async () => {
  const { handleStudioRequest } = await import('../../skills/prism/server/studio-request.ts');
  const request = { url: '/v1/session', method: 'GET', headers: {}, async *[Symbol.asyncIterator]() {} };
  const response = new EventEmitter(); response.destroyed = false; response.writableEnded = false;
  const previous = globalThis.fetch; let called = false;
  globalThis.fetch = () => { called = true; throw new Error('unexpected network dispatch'); };
  try {
    await assert.rejects(handleStudioRequest(request, response, { control: new URL('http://127.0.0.1:1'), root: '/tmp', controlTimeoutMs: 1000, ingressSecret: 'invalid\nheader' }), error => error.status === 502 && error.message === 'PRISM_STUDIO_UPSTREAM_FAILED' && error.cause instanceof TypeError);
    assert.equal(called, false);
    assert.match(runtimeConsumerContract('PRISM_INGRESS_SECRET', 'skills/prism/server/studio-config.ts').invalidBehavior, /HTTP 502/u);
  } finally { globalThis.fetch = previous; }
});
