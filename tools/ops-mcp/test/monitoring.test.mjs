import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createMonitoring, METRIC_QUERIES } from '../src/monitoring.mjs';
import { resourceSummary } from '../src/resource-inventory.mjs';

async function fixture(t, handler) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('monitoring makes only fixed GET requests and preserves empty data and warnings', async t => {
  const calls = [];
  const origin = await fixture(t, (req, res) => {
    calls.push({ method: req.method, url: new URL(req.url, 'http://fixture') });
    res.end(JSON.stringify({ status: 'success', data: { resultType: 'vector', result: [] }, warnings: ['missing series'] }));
  });
  const monitor = createMonitoring({ origin });
  for (const metric of Object.keys(METRIC_QUERIES)) {
    const result = await monitor.metrics({ metric });
    assert.deepEqual(result.data.result, []);
    assert.deepEqual(result.warnings, ['missing series']);
    assert.equal(calls.at(-1).url.searchParams.get('query'), METRIC_QUERIES[metric]);
  }
  await monitor.alerts();
  assert.ok(calls.every(c => c.method === 'GET'));
  assert.deepEqual(new Set(calls.map(c => c.url.pathname)), new Set(['/api/v1/query', '/api/v1/alerts']));
  const before = calls.length;
  for (const metric of ['constructor', 'toString', '__proto__', '/api/v1/admin/tsdb/delete_series', 'up']) {
    await assert.rejects(monitor.metrics({ metric }), /METRIC_FORBIDDEN/);
  }
  for (const args of [{ startTime: '2026-10-25T00:00:00Z' },
    { startTime: '2026-10-23T00:00:00Z', endTime: '2026-10-25T00:00:00Z' },
    { startTime: '2026-10-25T00:00:00Z', endTime: '2026-10-26T00:00:00Z', stepSeconds: 60 }]) {
    await assert.rejects(monitor.metrics({ metric: 'filesystems', ...args }), /INVALID_RANGE/);
  }
  assert.equal(calls.length, before, 'invalid queries must never reach the backend');
  await monitor.metrics({ metric: 'filesystems', startTime: '2026-10-25T00:00:00Z', endTime: '2026-10-25T01:00:00Z' });
  assert.equal(calls.at(-1).url.pathname, '/api/v1/query_range');
  assert.equal(calls.at(-1).url.searchParams.get('step'), '60');
});

test('monitoring fails closed on redirects, oversized replies, timeouts and upstream failures', async t => {
  let targetCalls = 0;
  const target = await fixture(t, (req, res) => { targetCalls++; res.end('{}'); });
  const redirect = await fixture(t, (req, res) => { res.writeHead(302, { location: target }); res.end(); });
  await assert.rejects(createMonitoring({ origin: redirect }).alerts());
  assert.equal(targetCalls, 0);
  const large = await fixture(t, (req, res) => res.end('x'.repeat(1024)));
  await assert.rejects(createMonitoring({ origin: large, maxBytes: 32 }).alerts(), /RESPONSE_TOO_LARGE/);
  const slow = await fixture(t, () => {});
  await assert.rejects(createMonitoring({ origin: slow, timeoutMs: 30 }).alerts());
  const failed = await fixture(t, (req, res) => res.end(JSON.stringify({ status: 'error', error: 'private backend details' })));
  await assert.rejects(createMonitoring({ origin: failed }).alerts(), /QUERY_FAILED/);
  await assert.rejects(createMonitoring({ origin: '' }).alerts(), /NOT_CONFIGURED/);
  for (const origin of ['file:///etc/passwd', 'http://user:pass@localhost', 'http://localhost/path', 'http://localhost/?query=x']) {
    assert.throws(() => createMonitoring({ origin }), /origin/);
  }
});

test('resource inventory omits workload credentials and storage driver parameters', () => {
  const item = { metadata: { name: 'demo', namespace: 'test', annotations: { token: 'private' } },
    spec: { nodeName: 'node', overhead: { cpu: '10m' }, resources: { requests: { cpu: '1' } },
      containers: [{ name: 'app', env: [{ name: 'PASSWORD', value: 'private' }], resources: { requests: { cpu: '100m' } } }],
      initContainers: [{ name: 'sidecar', restartPolicy: 'Always', resources: { requests: { memory: '64Mi' } } }],
      csi: { volumeAttributes: { password: 'private' } } }, parameters: { password: 'private' } };
  for (const resource of ['pods', 'persistentvolumes', 'persistentvolumeclaims', 'storageclasses', 'endpointslices']) {
    assert.doesNotMatch(JSON.stringify(resourceSummary(resource, item)), /private|PASSWORD|annotations|volumeAttributes/);
  }
  assert.equal(resourceSummary('pods', item).initContainers[0].restartPolicy, 'Always');
  assert.equal(resourceSummary('pods', item).overhead.cpu, '10m');
});
