import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { runtimeDispatchProfileFields, CURRENT_RUNTIME_DISPATCH_PROFILE, portableJson } from '@kubeclaw/plugin-sdk';
import { fixture } from './operator-retention-authority-fixture.test.mjs';
import { prepareRuntime, createAdapterRuntime } from '../../../skills/nova/core/execution/engine-runtime.ts';
import { createPluginInvocationContext } from '../../../skills/nova/core/execution/context.ts';
import { RevocableLease } from '../../../skills/nova/core/execution/lease.ts';
import { FileJournal } from '../../../skills/nova/core/state/journal.ts';

test('runtime profile selector refuses absent/present Proxies and getters without executing traps', t => {
  const observed = [];
  for (const present of [false, true]) {
    let calls = 0;
    const target = present ? { runtimeDispatchProfile: CURRENT_RUNTIME_DISPATCH_PROFILE } : {};
    const value = new Proxy(target, { getOwnPropertyDescriptor(object, key) { calls += 1; return Reflect.getOwnPropertyDescriptor(object, key); } });
    let error = null;
    try { runtimeDispatchProfileFields(value, 'runtime.dispatch'); } catch (caught) { error = caught.message; }
    observed.push({ kind: 'proxy', present, calls, error });
  }
  for (const field of ['runtimeDispatchProfile', 'payload']) {
    let calls = 0;
    const value = { operation: 'dispatch', resource: { type: 'runtime.agent', canonicalId: 'probe' } };
    Object.defineProperty(value, field, { enumerable: true, get() { calls += 1; return field === 'payload' ? {} : CURRENT_RUNTIME_DISPATCH_PROFILE; } });
    let error = null;
    try { runtimeDispatchProfileFields(value, 'runtime.dispatch'); } catch (caught) { error = caught.message; }
    observed.push({ kind: 'getter', field, calls, error });
  }
  t.diagnostic(JSON.stringify(observed));
  assert.ok(observed.every(row => row.calls === 0 && row.error?.startsWith('CANONICAL_JSON_')));
});

test('original plugin context and registered AdapterRuntime reject Proxy/getter input before real HTTP or effect writes', { timeout: 60000 }, async t => {
  const f = await fixture(t), prepared = await prepareRuntime(f.platform, f.definition);
  const events = new FileJournal(path.join(f.run, 'profile-audit-events.jsonl'));
  const adapters = createAdapterRuntime(f.platform, f.run, prepared, events);
  await adapters.start(); t.after(() => adapters.shutdown());
  const owner = prepared.granted.snapshot.stages.get('kubeclaw.decision.human-approval');
  const now = new Date(), leaseContract = { schemaVersion: 'invocation-lease.v2', leaseId: 'lease:profile-audit',
    attempt: f.request.attempt, registration: owner.provenance, status: 'active',
    grants: [...prepared.granted.grants.get('kubeclaw.human-approval:approval')],
    limits: { wallTimeMs: 60000, memoryBytes: 1048576, cpuMillis: 60000 },
    issuedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 60000).toISOString() };
  let ordinal = 0;
  const context = createPluginInvocationContext({ schemaVersion: 'plugin-context.v2', lease: leaseContract,
    config: f.definition.stages[0].config, input: f.definition.stages[0].input, artifacts: [] }, new RevocableLease(leaseContract), {
    invoke: (_lease, capability, operation, resource, payload, profile) => adapters.invoke(capability, f.request.attempt,
      `profile-audit:context:${++ordinal}`, { operation, resource, payload, ...(profile ? { runtimeDispatchProfile: profile } : {}) }, new AbortController().signal),
  }, { append: async (_lease, type, identity, payload) => { events.append({ type, identity, payload }); } });
  const original = { operation: f.request.operation, resource: f.request.resource, payload: f.request.payload };
  portableJson(original);
  const observations = [];
  for (const entry of ['context', 'adapter']) for (const kind of ['proxy', 'getter']) {
    let calls = 0;
    const request = kind === 'proxy' ? new Proxy(original, { getOwnPropertyDescriptor(object, key) { calls += 1; return Reflect.getOwnPropertyDescriptor(object, key); } })
      : Object.defineProperty({ operation: original.operation, resource: original.resource }, 'payload', { enumerable: true, get() { calls += 1; return original.payload; } });
    const beforePosts = f.received.length, journal = path.join(f.run, 'effects.jsonl'), before = fs.readFileSync(journal);
    let error = null;
    try {
      if (entry === 'context') await context.invoke('operator.request', request);
      else await adapters.invoke('operator.request', f.request.attempt, `profile-audit:adapter:${++ordinal}`, request, new AbortController().signal);
    } catch (caught) { error = caught.message; }
    observations.push({ entry, kind, calls, error, newPosts: f.received.length - beforePosts, unchangedJournal: fs.readFileSync(journal).equals(before) });
  }
  t.diagnostic(JSON.stringify(observations));
  assert.ok(observations.every(row => row.calls === 0 && row.error?.startsWith('CANONICAL_JSON_') && row.newPosts === 0 && row.unchangedJournal));
});
