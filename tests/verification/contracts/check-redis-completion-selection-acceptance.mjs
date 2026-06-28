#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expandSwarmConfig } from '../../../skills/nova/pipeline/core/platform-config.ts';
import {
  scanLatestCompletionFromTail,
  selectLatestCompletion,
} from '../../../skills/nova/pipeline/services/redis-completion.ts';
import { resolveRedisCompletionPolicy } from '../../../skills/nova/pipeline/services/redis-completion-policy.ts';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const compactConfig = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'charts', 'kubeclaw', 'files', 'config', 'swarm.config.json'), 'utf8'));
const redisCompletionPolicy = resolveRedisCompletionPolicy(expandSwarmConfig(compactConfig));

const identity = Object.freeze({
  run_id: 'run-completion',
  attempt: '2',
  dispatch_id: 'dispatch-completion',
});

function completion(overrides = {}) {
  return {
    schema_version: 'v1',
    type: 'completion',
    stream_role: 'completion',
    project: 'completion-contract',
    target_kind: 'module',
    target_id: '01-completion',
    module: '01-completion',
    status: 'PASS',
    outcome: 'PASS',
    source: 'buster-pipeline',
    reason: 'ok',
    summary: 'ok',
    timestamp: '2026-06-16T00:00:00.000Z',
    ...identity,
    ...overrides,
  };
}

function streamEntry(id, entry) {
  return [id, Object.entries(entry).flat()];
}

const valid = streamEntry('1-0', completion());
const ignoredAgent = streamEntry('2-0', completion({
  source: 'agent',
  status: 'FAIL',
  outcome: 'FAIL',
  summary: 'agent cannot be canonical completion source',
}));
const selected = selectLatestCompletion([valid, ignoredAgent], '01-completion', identity);
assert.equal(selected._id, '1-0');
assert.equal(selected.source, 'buster-pipeline');
assert.equal(selected.ignored_completion_count, '1');
assert.equal(selected.ignored_completion_sources, 'agent');

const invalid = selectLatestCompletion([
  streamEntry('3-0', completion({ status: 'DONE' })),
], '01-completion', identity);
assert.equal(invalid.outcome, 'COMPLETION_INVALID');
assert.equal(invalid.source, 'completion-invalid');
assert.equal(invalid.reason, 'invalid_completion_entry_schema');
assert.match(invalid.invalid_completion_errors, /status must be one of/);

const conflict = selectLatestCompletion([
  streamEntry('4-0', completion({ status: 'PASS', outcome: 'PASS' })),
  streamEntry('5-0', completion({ status: 'FAIL', outcome: 'FAIL' })),
], '01-completion', identity);
assert.equal(conflict.outcome, 'COMPLETION_CONFLICT');
assert.equal(conflict.source, 'completion-conflict');
assert.equal(conflict.reason, 'same_identity_completion_conflict');
assert.equal(conflict.conflict_count, '2');
assert.match(conflict.conflicting_outcomes, /PASS/);
assert.match(conflict.conflicting_outcomes, /FAIL/);

const duplicate = selectLatestCompletion([
  streamEntry('6-0', completion({ summary: 'first pass' })),
  streamEntry('7-0', completion({ summary: 'second pass' })),
], '01-completion', identity);
assert.equal(duplicate._id, '7-0');
assert.equal(duplicate.outcome, 'PASS');
assert.equal(duplicate.duplicate_completion_policy, 'idempotent_same_outcome');
assert.equal(duplicate.duplicate_completion_count, '2');

const stale = selectLatestCompletion([
  streamEntry('8-0', completion({ run_id: 'run-stale', dispatch_id: 'dispatch-stale' })),
], '01-completion', identity);
assert.equal(stale, null);

const redis = {
  async xrevrange() {
    return [
      streamEntry('10-0', completion({ status: 'FAIL', outcome: 'FAIL' })),
      streamEntry('9-0', completion({ status: 'PASS', outcome: 'PASS' })),
      ignoredAgent,
    ];
  },
};
const scan = await scanLatestCompletionFromTail(redis, 'swarm:pipeline:completion-contract:completions', '01-completion', identity, {
  batchSize: redisCompletionPolicy.tailScanBatchSize,
  scanLimit: redisCompletionPolicy.tailScanLimit,
});
assert.equal(scan.match.outcome, 'COMPLETION_CONFLICT');
assert.equal(scan.conflict.outcome, 'COMPLETION_CONFLICT');
assert.equal(scan.scanned, 3);

console.log(JSON.stringify({
  ok: true,
  contract: 'redis-completion-selection',
  run_id: identity.run_id,
  attempt: identity.attempt,
  dispatch_id: identity.dispatch_id,
}, null, 2));
