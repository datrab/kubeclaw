import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkerResourceReservations, NativeWorkerCapacityExceeded } from '../../../skills/worker/core/worker/resource-reservations.ts';

test('full pending reservations prevent concurrent memory overcommit and return capacity exactly once', async () => {
  const gib = 1024 ** 3;
  const maximum = { memoryBytes: 16 * gib, tasks: 4096 };
  const reservations = new WorkerResourceReservations(maximum, 8);
  maximum.memoryBytes = 64 * gib; // A caller cannot enlarge a captured policy.
  const requested = { memoryBytes: 8 * gib, tasks: 1024 };
  const releaseFirst = reservations.reserve(requested);
  requested.memoryBytes = gib; // Nor shrink the amount held by a live reservation.
  const results = await Promise.allSettled(Array.from({ length: 8 }, async () => reservations.reserve({ memoryBytes: 8 * gib, tasks: 1024 })));
  const admitted = results.filter(result => result.status === 'fulfilled');
  assert.equal(admitted.length, 1);
  for (const result of results) if (result.status === 'rejected') assert.ok(result.reason instanceof NativeWorkerCapacityExceeded);
  releaseFirst(); releaseFirst();
  const replacement = reservations.reserve({ memoryBytes: 8 * gib, tasks: 1024 });
  assert.throws(() => reservations.reserve({ memoryBytes: 1, tasks: 1 }), NativeWorkerCapacityExceeded);
  replacement();
  for (const result of admitted) if (result.status === 'fulfilled') result.value();
  reservations.reserve({ memoryBytes: 16 * gib, tasks: 4096 })();
});

test('Linux-task capacity and scope count independently gate admission without consuming rejected capacity', () => {
  const taskPool = new WorkerResourceReservations({ memoryBytes: 100000, tasks: 2048 }, 4);
  const held = taskPool.reserve({ memoryBytes: 1, tasks: 2048 });
  assert.throws(() => taskPool.reserve({ memoryBytes: 1, tasks: 1 }), NativeWorkerCapacityExceeded);
  held(); taskPool.reserve({ memoryBytes: 100000, tasks: 2048 })();
  const slots = new WorkerResourceReservations({ memoryBytes: 100000, tasks: 2048 }, 1);
  const release = slots.reserve({ memoryBytes: 1, tasks: 1 });
  assert.throws(() => slots.reserve({ memoryBytes: 1, tasks: 1 }), NativeWorkerCapacityExceeded);
  release(); slots.reserve({ memoryBytes: 100000, tasks: 2048 })();
});

test('invalid and near-integer-limit budgets cannot bypass aggregate accounting', () => {
  const maximum = Number.MAX_SAFE_INTEGER;
  const pool = new WorkerResourceReservations({ memoryBytes: maximum, tasks: maximum }, 8);
  for (const invalid of [0, -1, NaN, Infinity, 1.5, maximum + 1]) {
    assert.throws(() => pool.reserve({ memoryBytes: invalid, tasks: 1 }), /CAPACITY_INVALID/);
    assert.throws(() => pool.reserve({ memoryBytes: 1, tasks: invalid }), /CAPACITY_INVALID/);
  }
  const release = pool.reserve({ memoryBytes: maximum - 1, tasks: maximum - 1 });
  const last = pool.reserve({ memoryBytes: 1, tasks: 1 });
  assert.throws(() => pool.reserve({ memoryBytes: 1, tasks: 1 }), NativeWorkerCapacityExceeded);
  last(); release(); pool.reserve({ memoryBytes: maximum, tasks: maximum })();
});
