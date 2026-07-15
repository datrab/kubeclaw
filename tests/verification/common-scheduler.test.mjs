import test from 'node:test';
import assert from 'node:assert/strict';

import {
  acquireExecutionLock,
  aggregateBatchResults,
  buildDependencyGraph,
  collectReadyBatch,
  collectReadyItems,
  createAttemptKey,
  releaseExecutionLock,
  runBatch,
} from '../../skills/common/pipeline/scheduler/index.ts';

test('common scheduler builds dependency graph with dependents', () => {
  const graph = buildDependencyGraph([
    { id: 'foundation' },
    { id: 'branch-a', dependencies: ['foundation'] },
    { id: 'branch-b', depends_on: ['foundation'] },
    { id: 'assembly', dependencies: ['branch-a', 'branch-b'] },
  ]);

  assert.deepEqual(graph.ids, ['foundation', 'branch-a', 'branch-b', 'assembly']);
  assert.deepEqual(graph.dependencyIds('assembly'), ['branch-a', 'branch-b']);
  assert.deepEqual(graph.dependentIds('foundation'), ['branch-a', 'branch-b']);
});

test('common scheduler selects dependency-ready contiguous batch', () => {
  const graph = buildDependencyGraph([
    { id: '01' },
    { id: '02', dependencies: ['01'] },
    { id: '03', dependencies: ['01'] },
    { id: '04', dependencies: ['02', '03'] },
  ]);
  const completed = new Set(['01']);
  const batch = collectReadyBatch({
    orderedIds: ['01', '02', '03', '04'],
    startIndex: 1,
    dependencyIds: (id) => graph.dependencyIds(id),
    isCandidateReady: (_id, { dependencyIds }) => dependencyIds.every((dependencyId) => completed.has(dependencyId)),
  });

  assert.deepEqual(batch, ['02', '03']);
});

test('common scheduler prevents same-batch dependency execution', () => {
  const graph = buildDependencyGraph([
    { id: '01' },
    { id: '02', dependencies: ['01'] },
    { id: '03', dependencies: ['02'] },
  ]);
  const completed = new Set(['01']);
  const batch = collectReadyBatch({
    orderedIds: ['02', '03'],
    dependencyIds: (id) => graph.dependencyIds(id),
    isCandidateReady: (_id, { dependencyIds }) => dependencyIds.every((dependencyId) => completed.has(dependencyId)),
  });

  assert.deepEqual(batch, ['02']);
});

test('common scheduler selects all ready independent items without same-batch dependencies', () => {
  const graph = buildDependencyGraph([
    { id: 'manifest' },
    { id: 'unit' },
    { id: 'build', dependencies: ['manifest'] },
    { id: 'health', dependencies: ['build'] },
  ]);
  const completed = new Set();
  const batch = collectReadyItems({
    orderedIds: ['manifest', 'unit', 'build', 'health'],
    dependencyIds: (id) => graph.dependencyIds(id),
    isCandidateReady: (_id, { dependencyIds }) => dependencyIds.every((dependencyId) => completed.has(dependencyId)),
  });

  assert.deepEqual(batch, ['manifest', 'unit']);
});

test('common scheduler releases execution locks after successful batch items', async () => {
  const locks = new Set();
  const key = 'run-1:module:module-a:attempt-1';
  const result = await runBatch({
    batchId: 'batch-lock-release',
    itemIds: ['module-a'],
    locks,
    lockKey: () => key,
    executor: async () => ({ ok: true }),
  });

  assert.equal(aggregateBatchResults(result).ok, true);
  assert.equal(locks.has(key), false);
});

test('common scheduler attempt keys are deterministic and explicit', () => {
  assert.equal(
    createAttemptKey({ runId: 'run-1', itemId: 'module-a', phase: 'forge', attempt: 2 }),
    'run-1:forge:module-a:attempt-2',
  );
  assert.throws(() => createAttemptKey({ runId: 'run-1', itemId: 'module-a', phase: 'forge' }), /positive integer attempt/);
});

test('common scheduler exposes explicit execution locks for duplicate attempts', () => {
  const locks = new Set();
  const key = createAttemptKey({ runId: 'run-1', itemId: 'module-a', phase: 'forge', attempt: 1 });

  assert.equal(acquireExecutionLock(locks, key), true);
  assert.equal(acquireExecutionLock(locks, key), false);
  releaseExecutionLock(locks, key);
  assert.equal(acquireExecutionLock(locks, key), true);
});

test('common scheduler batch runner aggregates typed successes and failures', async () => {
  const result = await runBatch({
    batchId: 'batch-a',
    itemIds: ['a', 'b'],
    executor: async (id) => {
      if (id === 'b') throw new Error('b failed');
      return { ok: true, id };
    },
  });
  const aggregate = aggregateBatchResults(result);

  assert.equal(result.kind, 'scheduler_batch_result');
  assert.equal(aggregate.ok, false);
  assert.deepEqual(aggregate.fulfilled.map((entry) => entry.item_id), ['a']);
  assert.deepEqual(aggregate.rejected.map((entry) => entry.item_id), ['b']);
  assert.equal(aggregate.rejected[0].reason_code, 'scheduler_batch_item_failed');
  assert.equal(aggregate.rejected[0].reason, 'b failed');
});

test('common scheduler batch runner reports lock conflicts as typed results', async () => {
  const locks = new Set(['run-1:module:module-a:attempt-1']);
  const result = await runBatch({
    batchId: 'batch-locks',
    itemIds: ['module-a'],
    locks,
    lockKey: () => 'run-1:module:module-a:attempt-1',
    executor: async () => {
      throw new Error('executor should not run while locked');
    },
  });

  const aggregate = aggregateBatchResults(result);
  assert.equal(aggregate.ok, false);
  assert.equal(aggregate.rejected[0].reason_code, 'scheduler_execution_locked');
  assert.match(aggregate.rejected[0].reason, /already locked/);
});
