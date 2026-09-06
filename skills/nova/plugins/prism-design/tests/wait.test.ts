import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AdapterActivationContext, AdapterInvocation } from '@kubeclaw/plugin-sdk';
import { activate } from '../../../../common/plugins/wait-store/src/adapter.ts';
import { waitFrom } from '../src/stage.ts';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-wait-'));
const adapter = activate({ config: { root } } as AdapterActivationContext);
const expected = { issuerId: 'operator:design', expiresAt: new Date(Date.now() + 60_000).toISOString(), projectId: 'design' };
const invocation = { confidential: true, signal: new AbortController().signal, request: {
  capability: 'signal.wait', operation: 'create', idempotencyKey: 'prism:real-wait',
  resource: { type: 'signal.wait', canonicalId: 'prism:requested-id' },
  payload: { kind: 'signal', signalType: 'prism.approval.resolved', authorizedIssuer: { type: 'operator', id: expected.issuerId },
    expiresAt: expected.expiresAt, request: { projectId: expected.projectId } },
} } as AdapterInvocation;
try {
  await adapter.ready();
  const created = await adapter.invoke(invocation);
  const wait = waitFrom(created, expected);
  assert.match(wait.waitId, /^wait:[a-f0-9]{64}$/u);
  assert.notEqual(wait.waitId, invocation.request.resource.canonicalId);
  assert.deepEqual(waitFrom(await adapter.invoke(invocation), expected), wait);
  assert.throws(() => waitFrom(created, { ...expected, issuerId: 'operator:wrong' }), /WAIT_INVALID/);
} finally { await adapter.shutdown(); fs.rmSync(root, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, suite: 'prism-real-wait-store' }));
