import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import yaml from 'js-yaml';

export function renderedTrust() {
  const configurations = [];
  for (const role of ['nova', 'buster', 'prism']) {
    const args = ['template', 'review', 'charts/kubeclaw', '--namespace', 'alternative', '--set', `agentRole=${role}`, '--set', 'workerTrust.spiffe.enabled=true', '--set', 'serviceAccount.create=true'];
    if (role === 'buster') args.push('-f', 'my-values/buster-values.yaml', '--set', 'runtimeInfrastructure.registry.endpoint=https://registry.example.test', '--set', 'runtimeInfrastructure.registry.transport=https', '--set', 'runtimeInfrastructure.registry.authSecretName=registry-test');
    const docs = yaml.loadAll(execFileSync('helm', args, { encoding: 'utf8' }));
    const workload = docs.find(doc => doc?.kind === 'Deployment' && doc.metadata.name === `agent-${role}`);
    const config = docs.find(doc => doc?.kind === 'ConfigMap' && doc.data?.['envoy.yaml']);
    configurations.push({ name: role, workload, config: yaml.load(config.data['envoy.yaml']) });
  }
  const docs = yaml.loadAll(execFileSync('helm', ['template', 'review', 'charts/prism', '-f', 'charts/prism/ci-values.yaml', '--namespace', 'alternative', '--set', 'workerTrust.spiffe.enabled=true'], { encoding: 'utf8' }));
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
