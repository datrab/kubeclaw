import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAll } from 'js-yaml';
import { stageInfrastructureChart } from './infrastructure-chart.mjs';
import { renderInfrastructureChart } from './infrastructure-release.mjs';

export function statefulDatabaseService(profile, release, namespace, values, helm = 'helm') {
  if (!['redis', 'postgresql'].includes(profile)) throw new Error('STATEFUL_SERVICE_PROFILE_INVALID');
  for (const [value, maximum] of [[release, 53], [namespace, 63]]) {
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value) || value.length > maximum) throw new Error('STATEFUL_SERVICE_IDENTITY_INVALID');
  }
  const portName = `tcp-${profile}`;
  const archive = stageInfrastructureChart(profile);
  const rendered = loadAll(renderInfrastructureChart(profile, release, namespace, archive, values, helm, true));
  const services = rendered.filter(value => value?.kind === 'Service' && value.spec.clusterIP !== 'None'
    && value.spec.ports?.some(port => port.name === portName));
  if (services.length !== 1) throw new Error('STATEFUL_SERVICE_AMBIGUOUS');
  const service = services[0]; const port = service.spec.ports.find(value => value.name === portName);
  const workloads = rendered.filter(value => value?.kind === 'StatefulSet'
    && Object.entries(service.spec.selector).every(([key, label]) => value.spec.template.metadata.labels[key] === label));
  if (workloads.length !== 1) throw new Error('STATEFUL_SERVICE_WORKLOAD_AMBIGUOUS');
  const names = [portName];
  const ports = names.map(name => {
    const selected = service.spec.ports.filter(port => port.name === name);
    if (selected.length !== 1) throw new Error('STATEFUL_SERVICE_PORT_AMBIGUOUS');
    return { port: selected[0].port, targetPort: targetPort(workloads[0], selected[0].targetPort) };
  });
  if (ports.some(item => [item.port, item.targetPort].some(value => !Number.isInteger(value) || value < 1 || value > 65535))) throw new Error('STATEFUL_SERVICE_PORT_INVALID');
  return { name: service.metadata.name, selector: service.spec.selector, port: port.port, targetPort: ports[0].targetPort, ports };
}

function targetPort(workload, target) {
  if (typeof target === 'number') return target;
  const ports = workload.spec.template.spec.containers.flatMap(container => container.ports ?? []).filter(port => port.name === target);
  if (ports.length !== 1) throw new Error('STATEFUL_SERVICE_PORT_AMBIGUOUS');
  return ports[0].containerPort;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 6) throw new Error('Usage: stateful-database-service.mjs PROFILE RELEASE NAMESPACE VALUES');
  console.log(statefulDatabaseService(...process.argv.slice(2)).name);
}
