import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('plugin.json', 'utf8'));
assert.equal(manifest.id, 'kubeclaw.buster-suite-runtime');
assert.deepEqual(manifest.adapters[0].providesCapabilities, ['test.suite.execute']);
assert.equal(manifest.stages.length, 0);
assert.equal(manifest.observers.length, 0);

const adapter = fs.readFileSync('src/adapter.ts', 'utf8');
const worker = fs.readFileSync('src/worker.ts', 'utf8');
assert.doesNotMatch(adapter, /skills\/nova\/pipeline/u);
assert.doesNotMatch(adapter, /skills\/buster\/pipeline/u);
assert.doesNotMatch(adapter, /runSuites/u);
assert.match(adapter, /buster-suite-job\.v2|JOB_SCHEMA/u);
assert.match(adapter, /network\.http/u);
assert.match(adapter, /secrets\.read/u);
assert.match(adapter, /BUSTER_SUITE_REPOSITORY_DENIED/u);
assert.match(adapter, /BUSTER_SUITE_TIMEOUT_DENIED/u);
assert.doesNotMatch(`${adapter}\n${worker}`, /task-queue|redis-message-contract|REDIS_/u);

console.log(JSON.stringify({
  ok: true,
  plugin: 'kubeclaw.buster-suite-runtime',
  suite: 'package-boundary',
}));
