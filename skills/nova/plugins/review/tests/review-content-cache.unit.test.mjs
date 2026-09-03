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

console.log(JSON.stringify({ ok: true, suite: 'review-content-cache' }));
