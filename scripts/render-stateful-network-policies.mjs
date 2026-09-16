import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAll, dump } from 'js-yaml';
import { statefulDatabaseService } from './stateful-database-service.mjs';

function profile(selector) {
  const name = selector?.matchLabels?.['app.kubernetes.io/name'];
  return ['redis', 'postgresql'].includes(name) && selector.matchLabels['app.kubernetes.io/instance'] === name ? name : undefined;
}

function bindSelector(selector, service) {
  selector.matchLabels = { ...selector.matchLabels, ...service.selector };
}

function defaultPorts(name) {
  return { redis: [6379], postgresql: [5432] }[name];
}

function bindPorts(rule, original, ports) {
  if (rule.toPorts?.length !== 1 || rule.toPorts[0].ports?.length !== original.length
    || rule.toPorts[0].ports.some((port, index) => port.port !== String(original[index]) || port.protocol !== 'TCP')) {
    throw new Error('STATEFUL_NETWORK_PORT_CONTRACT_INVALID');
  }
  rule.toPorts[0].ports = [...new Set(ports)].map(port => ({ port: String(port), protocol: 'TCP' }));
}

function bindEgress(rule, services) {
  const selections = (rule.toEndpoints ?? []).map(selector => ({ selector, name: profile(selector) })).filter(item => item.name);
  if (!selections.length) return undefined;
  if (selections.length !== 1 || rule.toEndpoints.length !== 1) throw new Error('STATEFUL_NETWORK_DESTINATION_AMBIGUOUS');
  const { selector, name } = selections[0];
  bindSelector(selector, services[name]);
  bindPorts(rule, defaultPorts(name), services[name].ports.flatMap(port => [port.port, port.targetPort]));
  return name;
}

export function renderStatefulNetworkPolicies(file, namespace, selections, helm = 'helm') {
  const documents = loadAll(fs.readFileSync(file, 'utf8')).filter(Boolean);
  const services = Object.fromEntries(['redis', 'postgresql'].map(name =>
    [name, statefulDatabaseService(name, selections[name].release, namespace, selections[name].values, helm)]));
  const seen = Object.fromEntries(Object.keys(services).map(name => [name, { ingress: 0, egress: 0 }]));
  for (const document of documents) {
    if (document.kind !== 'CiliumNetworkPolicy') continue;
    const owner = profile(document.spec.endpointSelector);
    if (owner) {
      bindSelector(document.spec.endpointSelector, services[owner]);
      for (const rule of document.spec.ingress ?? []) bindPorts(rule, defaultPorts(owner), services[owner].ports.map(port => port.targetPort));
      seen[owner].ingress++;
    }
    for (const rule of document.spec.egress ?? []) {
      const name = bindEgress(rule, services);
      if (name) seen[name].egress++;
    }
  }
  for (const counts of Object.values(seen)) {
    if (!counts.ingress || !counts.egress) throw new Error('STATEFUL_NETWORK_POLICY_MISSING');
  }
  return documents;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 8) throw new Error('Usage: render-stateful-network-policies.mjs POLICY NAMESPACE REDIS_RELEASE REDIS_VALUES POSTGRESQL_RELEASE POSTGRESQL_VALUES');
  const [file, namespace, redisRelease, redisValues, postgresRelease, postgresValues] = process.argv.slice(2);
  const documents = renderStatefulNetworkPolicies(file, namespace, {
    redis: { release: redisRelease, values: redisValues }, postgresql: { release: postgresRelease, values: postgresValues },
  });
  process.stdout.write(documents.map(value => dump(value, { noRefs: true, lineWidth: -1 })).join('---\n'));
}
