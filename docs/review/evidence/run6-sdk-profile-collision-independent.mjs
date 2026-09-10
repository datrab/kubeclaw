import assert from 'node:assert/strict';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// This is an adapter-boundary compatibility counterexample, not a journal or
// real provider acceptance gate. Both adapters use the genuine network adapter
// and an actual loopback HTTP receiver; no successful provider fact is invented.
const baseline = process.env.BASELINE_CHECKOUT;
if (!baseline) throw new Error('BASELINE_CHECKOUT is required');
const current = path.resolve(new URL('../../..', import.meta.url).pathname);
const importAt = (root, file) => import(pathToFileURL(path.join(root, file)).href);
const original = await importAt(baseline, 'skills/common/plugins/runtime-dispatch/src/adapter.ts');
const candidate = await importAt(current, 'skills/common/plugins/runtime-dispatch/src/adapter.ts');
const { activate: networkActivate } = await importAt(current, 'skills/common/plugins/network-http/src/adapter.ts');
const received = [];
const server = http.createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  received.push(Buffer.concat(chunks).toString('utf8'));
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end('{"acknowledged":true}');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const signal = new AbortController().signal;
const network = networkActivate({ config: { allowedOrigins: [origin], allowedMethods: ['POST'] } });
const context = {
  config: { targets: { local: { endpoint: `${origin}/dispatch`, authentication: 'spiffe-proxy' } } },
  invokeConfidential: async (capability, invocation) => {
    assert.equal(capability, 'network.http');
    return network.invoke({ request: { ...invocation, capability }, confidential: true, signal });
  },
};
const payloads = [
  { task: 'Preserve historical model data', runtimeDispatchProfile: 'user-defined model data' },
  { task: 'Preserve historical model data', runtimeDispatchProfile: { schemaVersion: 'runtime-dispatch-profile.v1', encoding: 'json-utf16-v1' } },
];
try {
  for (const payload of payloads) {
    const request = { capability: 'runtime.dispatch', operation: 'dispatch',
      resource: { type: 'runtime.agent', canonicalId: 'local' }, idempotencyKey: 'historical-key', payload };
    const old = original.activate(context);
    await old.invoke({ request, confidential: true, signal });
    assert.equal(received.at(-1), JSON.stringify(payload));
    await old.shutdown();
    const before = received.length;
    const next = candidate.activate(context);
    let error;
    try { await next.invoke({ request, confidential: true, signal }); }
    catch (caught) { error = caught.message; }
    const changed = error !== undefined || received.at(-1) !== JSON.stringify(payload);
    assert.equal(changed, true, 'Frozen d545 collision must be reproduced before fixing it');
    console.log(JSON.stringify({ payload, baselineBody: received[before - 1], candidateError: error,
      candidateBody: received.length > before ? received.at(-1) : null, historicalBodyChanged: changed }));
    await next.shutdown();
  }
} finally {
  await network.shutdown();
  await new Promise(resolve => server.close(resolve));
}
