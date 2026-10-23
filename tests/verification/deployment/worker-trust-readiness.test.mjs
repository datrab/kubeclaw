import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildBusterImageBundle } from '../../../scripts/build-buster-image-bundle.mjs';
import { prismChartProjection, prismAgentBridgeProjection } from '../../../scripts/generate-prism-chart-config.mjs';
import { busterChartProjection } from '../../../scripts/generate-buster-chart-config.mjs';
import { execFileSync, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import yaml from 'js-yaml';

// Keep the original alternative-namespace SPIFFE obligations, selecting that
// namespace on the sole complete source before generating normal chart archives.
// Immutable image/native vectors in ci-values are render inputs, not native proof.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-trust-readiness-'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const repository = path.join(root, 'repository'); fs.mkdirSync(repository);
const author = path.join(repository, 'config');
fs.cpSync('config', author, { recursive: true });
const entryFile = path.join(author, 'pipeline.config.json');
const entry = JSON.parse(fs.readFileSync(entryFile, 'utf8'));
for (const binding of entry.bindings) {
  const [, ...instance] = binding.instanceId.split('/');
  binding.instanceId = ['alternative', ...instance].join('/');
}
fs.writeFileSync(entryFile, JSON.stringify(entry));
const prism = prismChartProjection(author);
const buster = busterChartProjection(author);
const bridge = prismAgentBridgeProjection(author);
for (const directory of ['scripts', 'skills']) fs.symlinkSync(path.resolve(directory), path.join(repository, directory));
const revision = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' }).trim();
const builtAt = new Date().toISOString();
const built = await buildBusterImageBundle({ repository, output: path.join(root, 'buster-image'), revision, builtAt });
const manifest = JSON.parse(fs.readFileSync(path.join(built.packageRoot, 'manifest.json'), 'utf8'));
assert.equal(manifest.commit, revision); assert.equal(manifest.builtAt, builtAt);
assert.equal(built.metadata.namespace, 'alternative');
assert.equal(built.generationDigest, buster.generationDigest);
const foundation = path.join(built.packageRoot, 'skills/packages/plugin-foundation/config');
const boot = await import(pathToFileURL(path.join(foundation, 'pipeline-boot.mjs')).href);
const receiver = await import(pathToFileURL(path.join(foundation, 'pipeline-composition.ts')).href);
for (const caller of ['buster-preparation', 'buster-runtime']) {
  const transport = path.join(root, caller); fs.mkdirSync(transport);
  fs.cpSync(path.join(path.dirname(built.systemRoot), 'expected', caller), path.join(transport, 'original'), { recursive: true });
  fs.symlinkSync('original', path.join(transport, '..data'));
  const capture = boot.capturePipelineBootReceipts(transport, built.systemRoot, caller, built.packageRoot, '/app/skills');
  assert(Object.isFrozen(receiver.projectBusterSettings(capture, caller)));
}
const busterValues = yaml.load(fs.readFileSync('my-values/buster-values.yaml', 'utf8'));
busterValues.pipelineDelivery = { buster: built.metadata };
// Explicit render-only native/OCI identity vectors, never native acceptance.
busterValues.busterNative = { namespace: 'alternative', nodeName: 'trust-render-only', policyDigest: 'a'.repeat(64) };
busterValues.extraContainers.find(container => container.name === 'buster-v2-runtime').image =
  'ghcr.io/datrab/kubeclaw-buster-runtime@sha256:' + 'a'.repeat(64);
const busterValuesFile = path.join(root, 'buster-values.yaml');
fs.writeFileSync(busterValuesFile, yaml.dump(busterValues));
const archives = new Map();
function archive(chart) {
  if (!archives.has(chart)) {
    const directory = path.join(root, chart), output = path.join(root, `${chart}-package`);
    fs.cpSync(`charts/${chart}`, directory, { recursive: true, dereference: true });
    const projections = chart === 'prism' ? { 'prism-topology.json': prism }
      : { 'buster-topology.json': buster, 'prism-agent-tools.json': { ...bridge.deployment, ...bridge.toolPlugin } };
    for (const [member, projection] of Object.entries(projections)) {
      fs.writeFileSync(path.join(directory, 'files/pipeline', member), JSON.stringify(projection));
    }
    fs.mkdirSync(output);
    execFileSync('helm', ['package', directory, '--destination', output], { stdio: 'pipe' });
    const files = fs.readdirSync(output).filter(file => file.endsWith('.tgz'));
    assert.equal(files.length, 1);
    const packaged = path.join(output, files[0]);
    for (const [member, projection] of Object.entries(projections)) {
      assert.deepEqual(JSON.parse(execFileSync('tar', ['-xOf', packaged,
        `${chart}/files/pipeline/${member}`], { encoding: 'utf8' })), projection);
    }
    archives.set(chart, packaged);
  }
  return archives.get(chart);
}

export function renderedTrust() {
  const configurations = [];
  for (const role of ['nova', 'buster', 'prism']) {
    const release = role === 'buster' ? buster.deployment.releaseName : role === 'prism' ? bridge.deployment.releaseName : 'review';
    const args = ['template', release, archive('kubeclaw'), '--namespace', 'alternative', '--set', `agentRole=${role}`, '--set', 'workerTrust.spiffe.enabled=true', '--set', 'serviceAccount.create=true'];
    if (role === 'buster') args.push('-f', busterValuesFile, '--set', 'runtimeInfrastructure.registry.endpoint=https://registry.example.test', '--set', 'runtimeInfrastructure.registry.transport=https', '--set', 'runtimeInfrastructure.registry.authSecretName=registry-test');
    const docs = yaml.loadAll(execFileSync('helm', args, { encoding: 'utf8' }));
    const workload = docs.find(doc => doc?.kind === 'Deployment' && doc.metadata.name === `agent-${role}`);
    const config = docs.find(doc => doc?.kind === 'ConfigMap' && doc.data?.['envoy.yaml']);
    configurations.push({ name: role, workload, config: yaml.load(config.data['envoy.yaml']) });
  }
  const docs = yaml.loadAll(execFileSync('helm', ['template', prism.deployment.releaseName, archive('prism'), '-f', 'charts/prism/ci-values.yaml', '--set', 'worker.native.namespace=alternative', '--namespace', 'alternative', '--set', 'workerTrust.spiffe.enabled=true'], { encoding: 'utf8' }));
  for (const role of ['control', 'worker']) configurations.push({ name: `prism-${role}`, workload: docs.find(doc => doc?.kind === 'Deployment' && doc.metadata.name === `prism-${role}`), config: yaml.load(docs.find(doc => doc?.kind === 'ConfigMap' && doc.data?.[`${role}.yaml`]).data[`${role}.yaml`]) });
  return configurations;
}

function commonTls(context, identity) {
  assert.equal(context.tls_certificate_sds_secret_configs[0].name, 'default');
  const validation = context.combined_validation_context;
  assert.deepEqual(validation.default_validation_context.match_typed_subject_alt_names, [{ san_type: 'URI', matcher: { exact: identity } }]);
  assert.equal(validation.validation_context_sds_secret_config.name, 'spiffe://kubeclaw.internal');
  assert.equal(validation.validation_context_sds_secret_config.sds_config.api_config_source.grpc_services[0].envoy_grpc.cluster_name, 'spire-agent');
  assert.equal(validation.default_validation_context.allow_expired_certificate, undefined);
}

function checkRoutes(listener, expected) {
  const manager = listener.filter_chains[0].filters[0].typed_config;
  const routes = manager.route_config.virtual_hosts[0].routes;
  assert.deepEqual(routes.map(route => route.match.path ?? route.match.prefix), expected);
  assert.equal(routes.at(-1).direct_response.status, 404);
  for (const route of routes.filter(route => route.match.path)) assert.equal(route.match.headers[0].string_match.exact, 'GET');
  return { manager, routes };
}

test('five original rendered Envoy consumers separate process probes from fresh self-mTLS readiness', () => {
  for (const { workload, config } of renderedTrust()) {
    const identity = `spiffe://kubeclaw.internal/ns/alternative/sa/${workload.spec.template.spec.serviceAccountName}`;
    const resources = config.static_resources;
    const self = resources.listeners.find(listener => listener.name === 'worker-trust-self-check');
    assert.deepEqual(self.address.socket_address, { address: '127.0.0.1', port_value: 19001 });
    const downstream = self.filter_chains[0].transport_socket.typed_config;
    assert.equal(downstream.require_client_certificate, true);
    assert.equal(downstream.disable_stateless_session_resumption, true);
    assert.equal(downstream.disable_stateful_session_resumption, true);
    commonTls(downstream.common_tls_context, identity);
    const selfRoutes = checkRoutes(self, ['/ready', '/']);
    assert.equal(selfRoutes.routes[0].direct_response.status, 200);
    assert.ok(selfRoutes.routes.every(route => !route.route), 'self-check cannot route into application/admin services');
    const cluster = resources.clusters.find(item => item.name === 'worker-trust-self-check');
    commonTls(cluster.transport_socket.typed_config.common_tls_context, identity);
    assert.equal(cluster.transport_socket.typed_config.max_session_keys, 0);
    assert.equal(cluster.typed_extension_protocol_options['envoy.extensions.upstreams.http.v3.HttpProtocolOptions'].common_http_protocol_options.max_requests_per_connection, 1);
    assert.equal(cluster.circuit_breakers.thresholds[0].max_connections, 4);
    const { manager, routes } = checkRoutes(resources.listeners.find(listener => listener.name === 'kubelet-health'), ['/health', '/bootstrap', '/ready', '/']);
    assert.deepEqual(routes[2].route, { cluster: 'worker-trust-self-check', timeout: '1s' });
    assert.equal(manager.access_log[0].typed_config.log_format.json_format.event, 'worker.trust.readiness.failure');
    const container = workload.spec.template.spec.containers.find(item => item.name === 'worker-trust-proxy');
    for (const [probe, path] of [['startupProbe', '/bootstrap'], ['livenessProbe', '/health'], ['readinessProbe', '/ready']]) assert.deepEqual(container[probe].httpGet, { path, port: 'envoy-health' });
  }
});

test('both independent charts carry the same scoped readiness helper', () => {
  const read = chart => fs.readFileSync(`charts/${chart}/templates/_worker-trust-readiness.tpl`, 'utf8').replaceAll(`${chart}.trustReadiness`, 'chart.trustReadiness');
  assert.equal(read('kubeclaw'), read('prism'));
});

test('SPIFFE cannot render with an unbound default ServiceAccount; disabled trust retains original default behavior', () => {
  const args = ['template', 'review', archive('kubeclaw'), '--namespace', 'alternative'];
  const baseline = yaml.loadAll(execFileSync('helm', args, {encoding: 'utf8'}));
  const workload = baseline.find(doc => doc?.kind === 'Deployment' && doc.metadata.name === 'agent-nova');
  assert.equal(workload.spec.template.spec.serviceAccountName, undefined);
  assert.equal(baseline.some(doc => doc?.data?.['envoy.yaml']), false);
  for (const settings of [[], ['--set', 'serviceAccount.create=false'], ['--set', 'serviceAccount.create=false', '--set', 'serviceAccount.name=existing-named-account']]) {
    const denied = spawnSync('helm', [...args, '--set', 'workerTrust.spiffe.enabled=true', ...settings], {encoding: 'utf8'});
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /workerTrust\.spiffe requires serviceAccount\.create=true/u);
  }
  // There is no chart-supported existing-SA name path. Only the actually
  // generated release ServiceAccount can satisfy this identity contract.
  for (const {workload, config} of renderedTrust()) {
    const actual = workload.spec.template.spec.serviceAccountName;
    assert(actual && actual !== 'default');
    const tls = config.static_resources.clusters.find(item => item.name === 'worker-trust-self-check').transport_socket.typed_config.common_tls_context;
    commonTls(tls, `spiffe://kubeclaw.internal/ns/alternative/sa/${actual}`);
  }
});
