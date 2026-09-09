import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import { FileJournal } from '../../../skills/nova/core/state/journal.ts';
import { FileMutex } from '../../../skills/nova/core/state/file-mutex.ts';
import { snapshotJson } from '../../../skills/nova/core/state/json-value.ts';
import { PluginStateJournal } from '../../../skills/nova/core/state/plugins.ts';

const temporary = (t) => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'state-regression-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root; };

test('journal owns append, sequenced, reader and replay JSON including optional fields', (t) => {
  const file = path.join(temporary(t), 'events.jsonl');
  const journal = new FileJournal(file);
  const payload = { decision: 'approved', values: [{ amount: 2 }], optional: undefined };
  const record = journal.append({ payload });
  payload.decision = 'rejected'; payload.values[0].amount = 99;
  for (const current of [record, journal.records()[0], journal.refresh()[0], new FileJournal(file).records()[0]]) {
    assert.equal(current.entry.payload.decision, 'approved');
    assert.equal(current.entry.payload.values[0].amount, 2);
    assert.throws(() => { current.entry.payload.values[0].amount = 8; }, TypeError);
    assert.equal('optional' in current.entry.payload, false);
  }
  journal.appendSequenced((sequence) => ({ sequence, payload }));
  payload.values.push({ amount: 4 });
  assert.equal(journal.records()[1].entry.payload.values.length, 1);
  assert.deepEqual(journal.records(), new FileJournal(file).records());
  let escaped;
  journal.transact((_records, append) => { escaped = append; });
  assert.throws(() => escaped({ payload }), /JOURNAL_TRANSACTION_CLOSED/);
  assert.throws(() => journal.transact((_records, append) => { append({ payload }); throw new Error('operation failure'); }), /operation failure/);
  journal.append({ payload });
  assert.equal(journal.records().length, 4, 'successful append is retained after callback exception');
});

test('lossy non-JSON values are rejected before append without caller hooks', (t) => {
  const journal = new FileJournal(path.join(temporary(t), 'events.jsonl'));
  let invoked = false;
  const circular = {}; circular.self = circular;
  for (const value of [NaN, Infinity, undefined, 1n, () => 1, new Date(), [undefined], Array(1), circular,
    new Proxy({}, { ownKeys() { invoked = true; return []; } }),
    { toJSON() { invoked = true; return {}; } }, { get field() { invoked = true; return 1; } }]) {
    assert.throws(() => journal.append(value), /JOURNAL_VALUE_/);
  }
  assert.equal(invoked, false); assert.equal(journal.records().length, 0);
});

test('snapshot handles deep JSON without recursive copying and preserves shared values', () => {
  const root = {}; let cursor = root;
  for (let depth = 0; depth < 10000; depth++) { cursor.child = {}; cursor = cursor.child; }
  let copy = snapshotJson(root);
  for (let depth = 0; depth < 10000; depth++) { assert.ok(Object.isFrozen(copy)); copy = copy.child; }
  const shared = { value: 1 };
  assert.deepEqual(snapshotJson({ first: shared, second: shared }), { first: { value: 1 }, second: { value: 1 } });
});

test('plugin state snapshots provenance and payload, including projection and duplicate returns', (t) => {
  const file = path.join(temporary(t), 'state.jsonl');
  const registration = {
    schemaVersion: 'registration-provenance.v2', package: {
      schemaVersion: 'package-provenance.v2', package: { pluginId: 'example.stage', apiVersion: 'pipeline-plugin-v2', packageVersion: '1.0.0', contentDigest: `sha256:${'b'.repeat(64)}` },
      source: { type: 'builtin', canonicalReference: 'builtin:example.stage' }, canonicalPath: '/plugins/example', trustScope: 'trusted_first_party',
      trustEvidence: { method: 'builtin_allowlist', verifier: 'test:registry', verifiedAt: '2026-07-28T00:00:00Z' }, resolvedAt: '2026-07-28T00:00:00Z',
    }, surface: 'stage', registrationId: 'main',
  };
  const original = structuredClone(registration);
  const state = new PluginStateJournal(file, registration);
  registration.package.package.pluginId = 'changed';
  const input = { namespace: 'plugin.example.stage.main', registration: original, entryType: 'example.counter', idempotencyKey: 'counter:1', payload: { nested: { amount: 2 }, optional: undefined } };
  const first = state.append(input);
  input.payload.nested.amount = 9;
  assert.throws(() => { first.payload.nested.amount = 7; }, TypeError);
  assert.equal(state.project(input.namespace, 0, (sum, entry) => sum + entry.payload.nested.amount), 2);
  input.payload.nested.amount = 2;
  const duplicate = state.append(input);
  assert.throws(() => { duplicate.registration.package.package.pluginId = 'changed'; }, TypeError);
  assert.deepEqual(state.entries(), new PluginStateJournal(file, original).entries());
});

test('kernel lock releases on exception, times out under reentrancy, retains stable inode', (t) => {
  const file = path.join(temporary(t), 'mutex');
  const mutex = new FileMutex(file, 50, 'EXPECTED_TIMEOUT');
  assert.throws(() => mutex.withLock(() => { throw new Error('callback'); }), /callback/);
  const inode = fs.statSync(file).ino;
  mutex.withLock(() => assert.throws(() => new FileMutex(file, 50, 'EXPECTED_TIMEOUT').withLock(() => assert.fail('nested lock entered')), /EXPECTED_TIMEOUT/));
  assert.equal(mutex.withLock(() => 42), 42);
  assert.equal(fs.statSync(file).ino, inode);
});

test('SIGKILL owner then twelve real contenders preserve exclusion and complete journal chain', { timeout: 30000 }, async (t) => {
  const root = temporary(t);
  const worker = new URL('./fixtures/state-lock-worker.mjs', import.meta.url);
  const children = [];
  t.after(() => { for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  const launch = (mode) => {
    const child = fork(worker, [mode, root], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] }); children.push(child); return child;
  };
  const holder = launch('hold');
  const heldExit = once(holder, 'exit');
  const deadline = Date.now() + 5000;
  while (!fs.existsSync(path.join(root, 'held'))) {
    assert.equal(holder.exitCode, null); assert.ok(Date.now() < deadline, 'holder ready deadline');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.throws(() => new FileMutex(path.join(root, 'mutex'), 50, 'EXPECTED_TIMEOUT').withLock(() => assert.fail('live owner bypassed')), /EXPECTED_TIMEOUT/);
  const contenders = Array.from({ length: 12 }, () => launch('contend'));
  const done = contenders.map(async (child) => { let stderr = ''; child.stderr.on('data', (chunk) => { stderr += chunk; }); const [code, signal] = await once(child, 'exit'); assert.equal(code, 0, `${signal}: ${stderr}`); });
  await Promise.all(contenders.map((child) => once(child, 'message')));
  holder.kill('SIGKILL'); assert.deepEqual(await heldExit, [null, 'SIGKILL']);
  for (const child of contenders) child.send('start');
  await Promise.all(done);
  const records = new FileJournal(path.join(root, 'events.jsonl')).records();
  assert.equal(records.length, 600);
  assert.equal(new Set(records.map(({ entry }) => `${entry.pid}:${entry.index}`)).size, 600);
  assert.equal(fs.existsSync(path.join(root, 'critical')), false);
});
