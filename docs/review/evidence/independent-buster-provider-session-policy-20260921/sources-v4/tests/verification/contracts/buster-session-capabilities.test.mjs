import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { ProviderCapabilities } from '../../../skills/buster/engine/test-gates/provider-capabilities.ts';
import { validateBusterProviderRuntimeSettings } from '../../../skills/common/plugin-runtime/foundation/config/buster-execution.ts';
import { runnerExecutionPolicy } from '../../fixtures/test-gate/execution-policy.mts';

async function transport(t) {
  const responses = [];
  const server = http.createServer((_request, response) => {
    responses.push(response); response.writeHead(200); response.write('open');
  });
  t.after(async () => {
    for (const response of responses) response.end('done');
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  return { responses, url };
}
async function received(responses, count) {
  const until = Date.now() + 2000;
  while (responses.length !== count && Date.now() < until) await delay(1);
  assert.equal(responses.length, count);
}
function selected(values) {
  return validateBusterProviderRuntimeSettings({ provider: { ...runnerExecutionPolicy.provider, ...values },
    observation: runnerExecutionPolicy.observation }).provider;
}
for (const maximumPendingCapabilities of [1, 2]) test(`real HTTP capability admission ${maximumPendingCapabilities}`, { timeout: 10000 }, async t => {
  const { responses, url } = await transport(t);
  const policy = selected({ maximumPendingCapabilities });
  const capabilities = new ProviderCapabilities(policy.maximumPendingCapabilities);
  const context = { signal: new AbortController().signal, invoke: async (_capability, _request, signal) => {
    const response = await fetch(url, { signal }); return response.text();
  } };
  const operations = [capabilities.handle('one', 'network.http', {}, context, () => true)];
  if (maximumPendingCapabilities === 1) {
    await assert.rejects(capabilities.handle('two', 'network.http', {}, context, () => true), /TEST_PROVIDER_CAPABILITY_LIMIT/);
  } else operations.push(capabilities.handle('two', 'network.http', {}, context, () => true));
  await received(responses, maximumPendingCapabilities);
  assert.equal(capabilities.pending, maximumPendingCapabilities);
  capabilities.abort(new Error('test finished'));
  await capabilities.drain(policy.capabilityDrainTimeoutMs);
  await Promise.all(operations);
  assert.equal(capabilities.pending, 0);
});
for (const capabilityDrainTimeoutMs of [10, 1000]) test(`actual uncooperative HTTP settlement drain ${capabilityDrainTimeoutMs}`, { timeout: 10000 }, async t => {
  const { responses, url } = await transport(t);
  const policy = selected({ capabilityDrainTimeoutMs });
  const capabilities = new ProviderCapabilities(policy.maximumPendingCapabilities);
  // Actual request deliberately does not cooperate with cancellation; it remains
  // owned until the real server completes its body, never a fake settled promise.
  const context = { signal: new AbortController().signal, invoke: async () => (await fetch(url)).text() };
  const operation = capabilities.handle('one', 'network.http', {}, context, () => true);
  await received(responses, 1);
  capabilities.abort(new Error('test cancellation'));
  const finish = setTimeout(() => responses[0].end('done'), 100);
  try {
    if (capabilityDrainTimeoutMs === 10) {
      await assert.rejects(capabilities.drain(policy.capabilityDrainTimeoutMs), /TEST_PROVIDER_CAPABILITY_DRAIN_TIMEOUT/);
      assert.equal(capabilities.pending, 1, 'timeout does not claim settlement');
    } else await capabilities.drain(policy.capabilityDrainTimeoutMs);
  } finally {
    clearTimeout(finish); responses[0].end('done'); await operation;
  }
  assert.equal(capabilities.pending, 0);
});
