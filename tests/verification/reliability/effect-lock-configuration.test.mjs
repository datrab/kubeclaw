import { TEST_CORE_POLICY } from '../../fixtures/core-runtime-policy.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fixture } from './operator-retention-authority-fixture.test.mjs';
import { loadPlatformConfig } from '../../../skills/common/plugin-runtime/foundation/config/platform.ts';
import { EffectCoordinator } from '../../../skills/nova/core/effects/coordinator.ts';
import { FileResourceLockManager } from '../../../skills/nova/core/effects/locks.ts';
import { FileJournal } from '../../../skills/nova/core/state/journal.ts';
import { prepareRuntime, createAdapterRuntime } from '../../../skills/nova/core/execution/engine-runtime.ts';

for (const ttl of [60_000, 120_000]) {
  test(`authored platform TTL ${ttl} reaches the real runtime and filesystem lock consumer`, { timeout: 60000 }, async t => {
    const f = await fixture(t);
    const file = path.join(f.root, 'platform.json');
    fs.writeFileSync(file, JSON.stringify({ ...f.platform, effectLockTtlMs: ttl }));
    const platform = loadPlatformConfig(file), prepared = await prepareRuntime(platform, f.definition);
    const run = path.join(f.root, 'ttl-reader');
    const runtime = createAdapterRuntime(platform, run, prepared, new FileJournal(path.join(run, 'events.jsonl'), TEST_CORE_POLICY.journalAppendLockTimeoutMs));
    const acquire = FileResourceLockManager.prototype.acquire, observed = [];
    FileResourceLockManager.prototype.acquire = function (resource, owner, value, ...rest) {
      observed.push(value);
      return Reflect.apply(acquire, this, [resource, owner, value, ...rest]);
    };
    try {
      await runtime.start();
      const result = await runtime.invoke('signal.wait', f.waitRequest.attempt, `read:ttl:${ttl}`,
        { operation: 'read', resource: f.waitRequest.resource, payload: {} }, new AbortController().signal);
      assert.deepEqual(result.waits, [f.wait]);
      assert.ok(observed.length > 0);
      assert.ok(observed.every(value => value === ttl), JSON.stringify(observed));
      const history = fs.readFileSync(path.join(platform.storageRoot, 'resource-locks', 'locks.jsonl'), 'utf8');
      assert.ok(history.includes('released'), 'actual lock persistence and release remain exercised');
    } finally {
      FileResourceLockManager.prototype.acquire = acquire;
      await runtime.shutdown();
    }
  });
}

test('missing and invalid TTL reject at platform, runtime and direct coordinator boundaries', { timeout: 60000 }, async t => {
  const f = await fixture(t), file = path.join(f.root, 'platform.json');
  for (const ttl of [undefined, null, '60000', 0, -1, 1.5, 59_999, 86_400_001]) {
    fs.writeFileSync(file, JSON.stringify({ ...f.platform, effectLockTtlMs: ttl }));
    assert.throws(() => loadPlatformConfig(file), /PLATFORM_CONFIG_INVALID/);
  }
  const prepared = await prepareRuntime(f.platform, f.definition);
  const missing = { ...f.platform }; delete missing.effectLockTtlMs;
  const run = path.join(f.root, 'missing-runtime');
  assert.throws(() => createAdapterRuntime(missing, run, prepared,
    new FileJournal(path.join(run, 'events.jsonl'), TEST_CORE_POLICY.journalAppendLockTimeoutMs)), /EFFECT_LOCK_TTL_INVALID/);
  const untouched = new Proxy({}, { get() { throw new Error('UNEXPECTED_JOURNAL_OR_LOCK_ACCESS'); } });
  assert.throws(() => new EffectCoordinator(untouched, undefined, undefined, untouched), /EFFECT_LOCK_TTL_INVALID/);
  for (const ttl of [undefined, null, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => new EffectCoordinator(untouched, undefined, undefined, untouched, ttl), /EFFECT_LOCK_TTL_INVALID/);
  }
  // Low-level APIs retain their explicitly authored short test lifetimes.
  for (const ttl of [40, 1000]) assert.doesNotThrow(() => new EffectCoordinator(untouched, undefined, undefined, untouched, ttl));
});
