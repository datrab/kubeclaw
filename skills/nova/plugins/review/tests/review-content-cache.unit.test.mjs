import assert from 'node:assert/strict';

import { runWithReviewCache } from '../src/review-content-cache.ts';

const digest = (character) => `sha256:${character.repeat(64)}`;
const units = [
  { id: 'slice-a', digest: digest('a') },
  { id: 'slice-b', digest: digest('b') },
];
const identity = { policyDigest: digest('c'), reviewerProtocol: 'review.v1',
  reviewerModel: 'model-a', reviewerRuntimeIdentityDigest: digest('f'), evidenceVersion: 'evidence.v1' };
class MemoryStore {
  records = new Map();
  async read(key) { return this.records.get(key); }
  async write(record) {
    assert.equal(this.records.has(record.cacheKey), false, 'cache records are immutable');
    this.records.set(record.cacheKey, record);
  }
}
const store = new MemoryStore(); let calls = 0;
const execute = async (misses) => { calls += 1; return new Map(misses.map(({ id }) => [id, { result: id }])); };
const first = await runWithReviewCache(units, identity, store, execute);
assert.deepEqual({ hits: first.hits, misses: first.misses }, { hits: 0, misses: 2 });
const second = await runWithReviewCache([...units].reverse(), identity, store, execute);
assert.deepEqual({ hits: second.hits, misses: second.misses }, { hits: 2, misses: 0 });
assert.equal(calls, 1, 'the all-hit run does not call the executor');

const changed = [{ ...units[0], digest: digest('d') }, units[1]];
const incremental = await runWithReviewCache(changed, identity, store, execute);
assert.deepEqual({ hits: incremental.hits, misses: incremental.misses }, { hits: 1, misses: 1 });
const policyChange = await runWithReviewCache(units, { ...identity, policyDigest: digest('e') }, store, execute);
assert.deepEqual({ hits: policyChange.hits, misses: policyChange.misses }, { hits: 0, misses: 2 });

const corruptStore = new MemoryStore();
const primed = await runWithReviewCache([units[0]], identity, corruptStore, execute);
const key = primed.cacheKeys.get('slice-a');
corruptStore.records.set(key, { ...corruptStore.records.get(key), value: { result: 'tampered' } });
await assert.rejects(runWithReviewCache([units[0]], identity, corruptStore, execute), /value digest/u);

const durableStore = new MemoryStore();
await assert.rejects(runWithReviewCache(units, identity, durableStore, async (misses, checkpoint) => {
  await checkpoint(misses[0].id, { result: misses[0].id });
  throw new Error('simulated process loss after first completed unit');
}), /simulated process loss/u);
const resumed = await runWithReviewCache(units, identity, durableStore, execute);
assert.deepEqual({ hits: resumed.hits, misses: resumed.misses }, { hits: 1, misses: 1 },
  'a completed unit is durable even when a later unit prevents the batch executor from returning');

class ConcurrencyStore extends MemoryStore {
  active = 0; maximumActive = 0;
  async read(key) {
    this.active += 1; this.maximumActive = Math.max(this.maximumActive, this.active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    this.active -= 1; return super.read(key);
  }
}
const concurrentUnits = Array.from({ length: 32 }, (_, index) => ({ id: `concurrent-${index}`,
  digest: `sha256:${index.toString(16).padStart(64, '0')}` }));
const concurrencyStore = new ConcurrencyStore();
await runWithReviewCache(concurrentUnits, identity, concurrencyStore, execute);
concurrencyStore.maximumActive = 0;
await runWithReviewCache(concurrentUnits, identity, concurrencyStore, execute);
assert.equal(concurrencyStore.maximumActive, 16, 'cache reads use the bounded parallelism limit');

class FailingReadStore extends MemoryStore {
  active = 0; started = 0;
  async read() {
    this.active += 1; this.started += 1; const ordinal = this.started;
    try {
      await new Promise((resolve) => setTimeout(resolve, ordinal === 1 ? 1 : 10));
      if (ordinal === 1) throw new Error('simulated read failure');
      return undefined;
    } finally { this.active -= 1; }
  }
}
const failingStore = new FailingReadStore();
await assert.rejects(runWithReviewCache(concurrentUnits, identity, failingStore, execute), /simulated read failure/u);
assert.equal(failingStore.active, 0, 'all in-flight cache reads settle before rejection');
assert.ok(failingStore.started <= 16, 'workers claim no additional reads after a failure');
await assert.rejects(runWithReviewCache([units[0]], identity, {
  async read() { return Promise.reject(undefined); }, async write() {},
}, execute), (error) => error === undefined);

console.log(JSON.stringify({ ok: true, suite: 'review-content-cache' }));
