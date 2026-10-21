import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHarness} from './adapter-dependency-locale-fixture.mjs';
import {materializeLegacyDependencyCore} from './adapter-dependency-historical.mjs';

test('current and historical dependency workers use the declared platform lease for both real effect locks', async () => {
  const harness = createHarness();
  try {
    const origin = await harness.listen();
    const historical = materializeLegacyDependencyCore(path.join(harness.root, 'historical'));
    for (const runtime of [undefined, historical]) {
      for (const ttl of [300_000, 450_000]) {
        const directory = harness.fixture(`lease-${runtime ? 'historical' : 'current'}-${ttl}`, origin);
        const file = path.join(directory, 'fixture.json'), fixture = JSON.parse(fs.readFileSync(file, 'utf8'));
        fixture.platform.effectLockTtlMs = ttl;
        fs.writeFileSync(file, JSON.stringify(fixture));
        const produced = await harness.subprocess(directory, 'en_US.UTF-8', runtime);
        assert.equal(produced.signal, 'SIGKILL', produced.err);
        const rows = fs.readFileSync(path.join(directory, 'locks/locks.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line).entry);
        const first = new Map();
        for (const row of rows) if (!first.has(row.lockId)) first.set(row.lockId, row);
        assert.deepEqual([...first.values()].map(row => row.resource.type).sort(), ['network.url', 'runtime.invocation']);
        for (const lock of first.values()) {
          assert.equal(Date.parse(lock.expiresAt) - Date.parse(lock.acquiredAt), ttl,
            `${runtime ? 'historical' : 'current'} ${lock.resource.type}: original selected lease must reach the actual lock journal`);
        }
      }
    }
    assert.equal(harness.received.length, 4, 'each real producer performed exactly one child POST before its SIGKILL');
  } finally { await harness.close(); }
});

for (const mode of ['current', 'legacy-resume', 'historical-countercheck']) test(`original SIGKILL dependency identity ${mode} across native locales`, async () => {
  const harness = createHarness();
  try {
    const origin = await harness.listen(); const directory = harness.fixture(mode, origin);
    const old = mode === 'current' ? undefined : materializeLegacyDependencyCore(path.join(harness.root, 'historical'));
    const produced = await harness.subprocess(directory, 'en_US.UTF-8', old);
    assert.equal(produced.signal, 'SIGKILL', produced.err); assert.equal(harness.received.length, 1);
    const before = fs.readFileSync(path.join(directory, 'effects.jsonl'), 'utf8');
    const resumed = await harness.subprocess(directory, 'sv_SE.UTF-8', mode === 'historical-countercheck' ? old : undefined);
    assert.equal(resumed.code, 0, resumed.err);
    const expected = mode === 'historical-countercheck' ? 2 : 1;
    assert.equal(harness.received.length, expected);
    assert(harness.received.every(item => item.rawBody === '{"ä":1,"z":2}'), 'identity codec must not reorder HTTP wire JSON');
    const entries = fs.readFileSync(path.join(directory, 'effects.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line).entry);
    const keys = [...new Set(entries.filter(entry => entry.request?.capability === 'network.http').map(entry => entry.request.idempotencyKey))];
    assert.equal(keys.length, expected);
    assert.equal(/^adapter-dep:utf16-v1:[a-f0-9]{64}:[a-f0-9]{64}$/u.test(keys[0]), mode === 'current');
    assert(fs.readFileSync(path.join(directory, 'effects.jsonl'), 'utf8').startsWith(before), 'original journal prefix retained verbatim');
    console.log(JSON.stringify({mode, receiverCalls: harness.received.length, dependencyKeys: keys, resumeLocale: JSON.parse(resumed.out).locale}));
  } finally {await harness.close();}
});
