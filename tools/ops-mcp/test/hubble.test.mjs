import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { queryWindow, classify, getHubbleFlows, MAX_RAW_BYTES } from '../src/hubble.mjs';

const args = { namespace: 'kubeclaw', limit: 2, startTime: '2025-01-01T00:00:00Z', endTime: '2025-01-01T00:05:00Z' };
const flow = pod => ({ flow: { time: args.startTime, verdict: 'DROPPED', source: { namespace: 'kubeclaw', pod_name: pod }, Summary: 'token=example' } });
const summarize = ({ flow: f }) => ({ time: f.time, summary: f.Summary });
async function withCLI(code, callback) {
  const dir = await mkdtemp(join(tmpdir(), 'hubble-test-'));
  const binary = join(dir, 'hubble');
  await writeFile(binary, '#!/usr/bin/env node\n' + code, { mode: 0o755 });
  try { return await callback(binary); } finally { await rm(dir, { recursive: true, force: true }); }
}
test('old windows are valid but each window is bounded', () => {
  assert.equal(queryWindow(args).startTime, '2025-01-01T00:00:00.000Z');
  assert.throws(() => queryWindow({ ...args, endTime: '2025-01-01T01:00:00Z' }));
});
test('lost events and peer status are never fake flows', () => {
  assert.equal(classify({ lost_events: { num_events_lost: 7 } }).warning.type, 'lost_events');
  assert.equal(classify({ node_status: { state: 'UNAVAILABLE' } }).warning.type, 'node_status');
});
test('exact pod filtering, saturation and summaries preserve diagnostic meaning', async () => {
  const records = [flow('nova-extra'), flow('nova'), flow('nova'), { lost_events: { num_events_lost: 2 } }];
  await withCLI(`console.log(${JSON.stringify(records.map(JSON.stringify).join('\n'))});`, async binary => {
    const r = await getHubbleFlows({ ...args, pod: 'nova' }, summarize, { binary });
    assert.equal(r.flows.length, 2);
    assert.equal(r.flows[0].summary, 'token=example');
    assert.equal(r.status, 'partial');
    assert.ok(r.reasons.includes('relay_observation'));
    assert.ok(r.reasons.includes('peer_result_limit_possible'));
  });
});
test('stderr and nonzero exit are returned as incomplete observation', async () => {
  await withCLI('console.error("peer unavailable"); process.exitCode=1;', async binary => {
    const r = await getHubbleFlows(args, summarize, { binary });
    assert.equal(r.status, 'partial');
    assert.ok(r.reasons.includes('cli_failed'));
    assert.ok(r.warnings.some(w => w.includes('peer unavailable')));
  });
});
test('stdout/stderr share a raw byte ceiling', async () => {
  await withCLI('process.stdout.write("x".repeat(3*1024*1024));', async binary => {
    const r = await getHubbleFlows(args, summarize, { binary });
    assert.ok(r.rawBytesRead <= MAX_RAW_BYTES);
    assert.ok(r.reasons.includes('raw_byte_limit'));
    assert.equal(r.status, 'partial');
  });
});
test('timeout is explicit and releases concurrency slot', async () => {
  await withCLI('setInterval(()=>{},100);', async binary => {
    const r = await getHubbleFlows(args, summarize, { binary, timeout: 50 });
    assert.ok(r.reasons.includes('timeout'));
  });
});
