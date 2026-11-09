import test from 'node:test';
import assert from 'node:assert/strict';
import { describeNodeResources, quantityNano } from '../src/node-resources.mjs';
import { createKubeList } from '../src/kubernetes.mjs';

const resource = (cpu, memory) => ({ requests: { cpu, memory }, limits: { cpu, memory } });
const container = (name, cpu, memory = '1Mi', extra = {}) => ({ name, resources: resource(cpu, memory), ...extra });
const pod = (name, containers, extra = {}) => ({ metadata: { name, namespace: 'lease', annotations: { password: 'private-secret' } },
  spec: { nodeName: 'ax41-production', containers, ...extra }, status: { phase: 'Running' } });
const node = { metadata: { name: 'ax41-production' }, status: {
  capacity: { cpu: '12', memory: '64Gi', pods: '110' }, allocatable: { cpu: '10', memory: '60Gi', pods: '110', 'hugepages-2Mi': '0' },
} };

test('quantities preserve binary, decimal, exponent and sub-milli values without float loss', () => {
  for (const [value, expected] of [['1', 1_000_000_000n], ['500m', 500_000_000n], ['0.5', 500_000_000n],
    ['1Mi', 1048576n * 1_000_000_000n], ['1.5Gi', 1610612736n * 1_000_000_000n], ['1e3', 1000n * 1_000_000_000n],
    ['1E', 10n ** 27n], ['1E-3', 1_000_000n], ['.5u', 500n], ['0.1n', 1n], ['1234567890123456789', 1234567890123456789n * 1_000_000_000n]]) {
    assert.equal(quantityNano(value), expected, value);
  }
  for (const value of ['NaN', '-1', 'Infinity', '1foo', '1e999']) assert.throws(() => quantityNano(value));
});

test('node read scans all selected pages, excludes terminated/other-node pods and omits credentials', async () => {
  const app = pod('app', [container('app', '500m', '128Mi', { env: [{ name: 'PASSWORD', value: 'private-secret' }] })]);
  const other = pod('other', [container('other', '99')], { nodeName: 'other-node' });
  const done = { ...app, status: { phase: 'Succeeded' } }, failed = { ...app, status: { phase: 'Failed' } };
  const pending = { ...pod('pending', [container('pending', '250m', '64Mi')]), metadata: { name: 'pending', namespace: 'kube-system' }, status: { phase: 'Pending' } };
  const calls = [];
  const request = async path => {
    calls.push(path);
    if (!path.includes('?')) { assert.equal(path, '/api/v1/nodes/ax41-production'); return node; }
    const url = new URL(path, 'https://fixture');
    assert.equal(url.pathname, '/api/v1/pods');
    assert.equal(url.searchParams.get('fieldSelector'), 'spec.nodeName=ax41-production,status.phase!=Succeeded,status.phase!=Failed');
    return url.searchParams.has('continue') ? { items: [pending], metadata: {} }
      : { items: [app, other, done, failed], metadata: { continue: 'page-2' } };
  };
  const result = await describeNodeResources(request, createKubeList(request), 'ax41-production');
  assert.deepEqual(result.capacity, node.status.capacity);
  assert.deepEqual(result.allocatable, node.status.allocatable);
  assert.equal(result.nonTerminatedPodCount, 2);
  assert.equal(result.pagesScanned, 2);
  assert.equal(result.partial, false);
  assert.deepEqual(result.allocatedResources.cpu, { requests: '750m', limits: '750m', requestsPercent: 7, limitsPercent: 7 });
  assert.equal(result.allocatedResources.memory.requests, String(192 * 1024 * 1024));
  assert.equal(result.allocatedResources['hugepages-2Mi'].requestsPercent, 0);
  assert.doesNotMatch(JSON.stringify(result), /private-secret|PASSWORD|annotations|env/);
  assert.equal(calls.length, 3);
});

test('sidecar ordering, init peaks, overhead, pod-level resources and overcommit are accounted', async () => {
  const pods = [
    pod('sidecars', [container('app', '1', '128Mi')], {
      initContainers: [container('first', '3', '256Mi'), container('sidecar', '500m', '64Mi', { restartPolicy: 'Always' }), container('second', '4', '512Mi')],
      overhead: { cpu: '100m', memory: '16Mi' },
    }),
    pod('pod-budget', [container('app', '100m')], { resources: resource('8', '2Gi') }),
    pod('unlimited', [{ name: 'app', resources: { requests: { cpu: '100m' } } }], { overhead: { cpu: '50m' } }),
  ];
  const request = async path => path.includes('?') ? { items: pods, metadata: {} } : node;
  const result = await describeNodeResources(request, createKubeList(request), 'ax41-production');
  const sidecar = result.nonTerminatedPods.find(p => p.name === 'sidecars');
  assert.equal(sidecar.requests.cpu, '4600m');
  assert.equal(sidecar.requests.memory, String(592 * 1024 * 1024));
  assert.equal(result.nonTerminatedPods.find(p => p.name === 'pod-budget').requests.cpu, '8');
  assert.equal(result.nonTerminatedPods.find(p => p.name === 'unlimited').limits.cpu, undefined);
  assert.equal(result.allocatedResources.cpu.requests, '12750m');
  assert.equal(result.allocatedResources.cpu.limits, '12600m');
  assert.equal(result.allocatedResources.cpu.limitsPercent, 126);
});

test('container resize uses max of desired, actuated and allocated requests; infeasible uses actual', async () => {
  const resizing = pod('resize', [container('app', '500m')]);
  resizing.status.containerStatuses = [{ name: 'app', allocatedResources: { cpu: '1500m' }, resources: resource('1', '1Mi') }];
  const infeasible = structuredClone(resizing);
  infeasible.metadata.name = 'infeasible';
  infeasible.spec.containers[0].resources = resource('8', '1Mi');
  infeasible.status.conditions = [{ type: 'PodResizePending', reason: 'Infeasible' }];
  const request = async path => path.includes('?') ? { items: [resizing, infeasible], metadata: {} } : node;
  const result = await describeNodeResources(request, createKubeList(request), 'ax41-production');
  assert.equal(result.allocatedResources.cpu.requests, '3');
  assert.equal(result.allocatedResources.cpu.limits, '2');
});

test('a later sidecar is not added to an earlier init peak and extended resources are retained', async () => {
  const workload = pod('ordered', [container('app', '1')], {
    initContainers: [container('setup', '8'), container('sidecar', '500m', '1Mi', { restartPolicy: 'Always' })],
    overhead: { cpu: '100m' },
  });
  workload.spec.containers[0].resources.requests['ephemeral-storage'] = '1Gi';
  workload.spec.containers[0].resources.requests['example.com/gpu'] = '1';
  const request = async path => path.includes('?') ? { items: [workload], metadata: {} } : node;
  const result = await describeNodeResources(request, createKubeList(request), 'ax41-production');
  assert.equal(result.allocatedResources.cpu.requests, '8100m');
  assert.equal(result.allocatedResources['ephemeral-storage'].requests, '1073741824');
  assert.equal(result.allocatedResources['example.com/gpu'].requests, '1');
  assert.equal(result.allocatedResources['example.com/gpu'].requestsPercent, null);
});

test('incomplete scans withhold totals and missing allocatable stays unknown', async () => {
  const result = await describeNodeResources(async () => ({ metadata: node.metadata }), async () => ({ items: [], pages: 20, partial: true }), 'ax41-production');
  assert.equal(result.capacity, null);
  assert.equal(result.allocatable, null);
  assert.equal(result.nonTerminatedPodCount, null);
  assert.equal(result.allocatedResources, null);
  assert.match(result.warning, /incomplete/);
  const empty = await describeNodeResources(async () => ({ metadata: node.metadata }), async () => ({ items: [], pages: 1, partial: false }), 'ax41-production');
  assert.equal(empty.nonTerminatedPodCount, 0);
  assert.equal(empty.allocatedResources.cpu.requestsPercent, null);
  await assert.rejects(describeNodeResources(async () => { throw new Error('API 403'); }, async () => assert.fail('must not read pods'), 'ax41-production'), /403/);
  await assert.rejects(describeNodeResources(async () => node, async () => { throw new Error('API 403'); }, 'ax41-production'), /403/);
});
