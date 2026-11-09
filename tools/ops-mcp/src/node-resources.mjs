// Resource accounting follows Kubernetes 1.36 PodRequests/PodLimits with
// UseStatusResources enabled, including restartable init containers and overhead.
// https://github.com/kubernetes/component-helpers/blob/release-1.36/resource/helpers.go
const NANO = 1_000_000_000n;
const decimalPowers = { n: -9, u: -6, m: -3, '': 0, k: 3, K: 3, M: 6, G: 9, T: 12, P: 15, E: 18 };
const binaryPowers = { Ki: 10, Mi: 20, Gi: 30, Ti: 40, Pi: 50, Ei: 60 };

// Integer nanounits avoid floating-point loss for large memory/storage quantities.
export function quantityNano(value) {
  const match = /^\+?(\d+(?:\.\d*)?|\.\d+)([eE][+-]?\d+|[numkKMGTPE]|[KMGTPE]i)?$/.exec(String(value));
  if (!match) throw new Error('OPS_INVALID_RESOURCE_QUANTITY');
  const [, number, suffix = ''] = match;
  const [whole, fraction = ''] = number.split('.');
  let numerator = BigInt((whole || '0') + fraction) * NANO;
  let denominator = 10n ** BigInt(fraction.length);
  if (Object.hasOwn(binaryPowers, suffix)) numerator *= 2n ** BigInt(binaryPowers[suffix]);
  else {
    const power = Object.hasOwn(decimalPowers, suffix) ? decimalPowers[suffix] : Number(suffix.slice(1));
    if (!Number.isInteger(power) || Math.abs(power) > 100) throw new Error('OPS_INVALID_RESOURCE_QUANTITY');
    if (power >= 0) numerator *= 10n ** BigInt(power);
    else denominator *= 10n ** BigInt(-power);
  }
  return (numerator + denominator - 1n) / denominator;
}

const quantities = list => Object.fromEntries(Object.entries(list ?? {}).map(([name, value]) => [name, quantityNano(value)]));
function add(target, source) {
  for (const [name, value] of Object.entries(source)) target[name] = (target[name] ?? 0n) + value;
  return target;
}
function maximum(target, source) {
  for (const [name, value] of Object.entries(source)) target[name] = target[name] === undefined || value > target[name] ? value : target[name];
  return target;
}
function formatQuantity(name, value) {
  if (name === 'cpu' && value % 1_000_000n === 0n && value % NANO !== 0n) return `${value / 1_000_000n}m`;
  const fraction = String(value % NANO).padStart(9, '0').replace(/0+$/, '');
  return `${value / NANO}${fraction ? '.' + fraction : ''}`;
}
const formatted = list => Object.fromEntries(Object.entries(list).map(([name, value]) => [name, formatQuantity(name, value)]));

function podResources(pod, kind) {
  const spec = pod.spec ?? {};
  const statuses = new Map([...(pod.status?.containerStatuses ?? []), ...(pod.status?.initContainerStatuses ?? [])].map(c => [c.name, c]));
  const infeasible = pod.status?.conditions?.some(c => c.type === 'PodResizePending' && c.reason === 'Infeasible');
  const effective = (container, useStatus) => {
    const desired = quantities(container.resources?.[kind]);
    const status = useStatus && statuses.get(container.name);
    if (!status?.resources) return desired;
    const actual = quantities(status.resources[kind]);
    const result = infeasible ? actual : maximum(actual, desired);
    return kind === 'requests' ? maximum(result, quantities(status.allocatedResources)) : result;
  };
  const result = {}, sidecars = {}, initPeak = {};
  for (const container of spec.containers ?? []) add(result, effective(container, true));
  for (const container of spec.initContainers ?? []) {
    const restartable = container.restartPolicy === 'Always';
    const resources = effective(container, restartable);
    if (restartable) {
      add(result, resources);
      add(sidecars, resources);
      maximum(initPeak, sidecars);
    } else maximum(initPeak, add({ ...sidecars }, resources));
  }
  maximum(result, initPeak);
  for (const [name, value] of Object.entries(quantities(spec.resources?.[kind]))) {
    if (name === 'cpu' || name === 'memory' || name.startsWith('hugepages-')) result[name] = value;
  }
  for (const [name, value] of Object.entries(quantities(spec.overhead))) {
    if (kind === 'requests' || (result[name] ?? 0n) > 0n) result[name] = (result[name] ?? 0n) + value;
  }
  return result;
}

function allocation(requests, limits, allocatable) {
  const names = new Set(['cpu', 'memory', 'ephemeral-storage', ...Object.keys(requests), ...Object.keys(limits),
    ...Object.keys(allocatable).filter(name => name.startsWith('hugepages-') || name.includes('/'))]);
  return Object.fromEntries([...names].sort().map(name => {
    const request = requests[name] ?? 0n, limit = limits[name] ?? 0n;
    const available = allocatable[name] === undefined ? null : quantityNano(allocatable[name]);
    const percent = value => available === null ? null : available === 0n ? 0 : Number(value * 100n / available);
    return [name, { requests: formatQuantity(name, request), limits: formatQuantity(name, limit),
      requestsPercent: percent(request), limitsPercent: percent(limit) }];
  }));
}

export async function describeNodeResources(kubeRequest, kubeList, node) {
  // No pod spec, environment, annotations, volume sources or credentials leave
  // this function. Both operations use the central read-only API transport.
  const item = await kubeRequest(`/api/v1/nodes/${encodeURIComponent(node)}`);
  const page = await kubeList('/api/v1/pods', {
    pageSize: 100, maxPages: 20,
    params: { fieldSelector: `spec.nodeName=${node},status.phase!=Succeeded,status.phase!=Failed` },
    mapItem: pod => {
      if (pod.spec?.nodeName !== node || ['Succeeded', 'Failed'].includes(pod.status?.phase)) return null;
      return { name: pod.metadata?.name, namespace: pod.metadata?.namespace,
        creationTimestamp: pod.metadata?.creationTimestamp, phase: pod.status?.phase,
        requests: podResources(pod, 'requests'), limits: podResources(pod, 'limits') };
    },
  });
  const pods = page.items.filter(Boolean).sort((a, b) => `${a.namespace}/${a.name}`.localeCompare(`${b.namespace}/${b.name}`));
  const requests = {}, limits = {};
  for (const pod of pods) { add(requests, pod.requests); add(limits, pod.limits); }
  const allocatable = item.status?.allocatable ?? null;
  return { name: item.metadata?.name, capacity: item.status?.capacity ?? null, allocatable,
    nonTerminatedPods: pods.map(pod => ({ ...pod, requests: formatted(pod.requests), limits: formatted(pod.limits) })),
    nonTerminatedPodCount: page.partial ? null : pods.length,
    allocatedResources: page.partial ? null : allocation(requests, limits, allocatable ?? {}),
    partial: page.partial, pagesScanned: page.pages,
    warning: page.partial ? 'Pod scan incomplete; totals withheld. Increase the bounded scan limit before using this node for capacity planning.' : null,
  };
}
