import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fixture } from './operator-retention-authority-fixture.test.mjs';
import { prepareRuntime, createAdapterRuntime } from '../../../skills/nova/core/execution/engine-runtime.ts';
import { FileJournal } from '../../../skills/nova/core/state/journal.ts';

// Only the owner selection seam is varied. Registry, installed factories,
// actual activation, lifecycle revocation and Store remain the originals.
// This does not claim a new alternate installed provider or native authority.
test('Core exposes retained Wait resolver only to the selected original built-in and revokes it on shutdown', { timeout: 60000 }, async t => {
  const f = await fixture(t), prepared = await prepareRuntime(f.platform, f.definition);
  const key = 'kubeclaw.wait-store:waits', entry = prepared.activated.adapters.get(key);
  const original = prepared.granted.selectedProviders.get('signal.wait');
  assert.ok(entry && original);
  const selections = [
    ['original', original, true],
    ['other-provider', { ...original, package: { ...original.package, manifest: { ...original.package.manifest, id: 'test.other-wait' } } }, false],
    ['other-registration', { ...original, registration: { ...original.registration, id: 'other-waits' } }, false],
    ['no-selection', undefined, false],
  ];
  for (const [name, selected, exposed] of selections) {
    let captured;
    const adapters = new Map(prepared.activated.adapters);
    adapters.set(key, { ...entry, execute: context => { captured = context; return entry.execute(context); } });
    const selectedProviders = new Map(prepared.granted.selectedProviders);
    if (selected) selectedProviders.set('signal.wait', selected); else selectedProviders.delete('signal.wait');
    const root = path.join(f.root, `audience-${name}`);
    const runtime = createAdapterRuntime(f.platform, root, {
      ...prepared, activated: { ...prepared.activated, adapters }, granted: { ...prepared.granted, selectedProviders },
    }, new FileJournal(path.join(root, 'events.jsonl')));
    await runtime.start();
    try {
      assert.ok(captured, 'the enabled original Wait adapter must actually activate in every selection state');
      assert.equal(typeof captured.resolveRetainedWait, exposed ? 'function' : 'undefined');
    } finally { await runtime.shutdown(); }
    if (exposed) assert.throws(() => captured.resolveRetainedWait({}), /ADAPTER_CONTEXT_REVOKED/);
  }
  assert.equal(f.received.length, 1);
});
