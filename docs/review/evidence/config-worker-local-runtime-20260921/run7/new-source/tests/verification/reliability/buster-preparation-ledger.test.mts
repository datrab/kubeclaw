import { canonicalSwarmEntry, readTestBundle, writeTestBundle } from '../../fixtures/config/swarm-bundle.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadBusterPreparationSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { PreparationSourceLedger } from '../../../skills/buster/engine/test-gates/preparation-ledger.ts';
import { preparationProfile } from '../../../skills/buster/engine/test-gates/preparation-envelope.ts';
import { withDurableStoreLock } from '@kubeclaw/plugin-foundation/observability/durable-delivery';

const authored = readTestBundle(canonicalSwarmEntry);
const settings = loadBusterPreparationSettings({ SWARM_CONFIG: canonicalSwarmEntry });
const profile = preparationProfile(`sha256:${'a'.repeat(64)}`);
const now = new Date('2026-09-21T00:00:00.000Z');
const id = (value: number) => value.toString(16).padStart(32, '0');

async function fixture(recordLimit = settings.maximumRecords) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buster-preparation-ledger-'));
  const configured = structuredClone(authored);
  configured['buster-engine'].settings.preparation.maximumRecords = recordLimit;
  const configFile = path.join(root, 'swarm.config.json');
  writeTestBundle(configFile, configured);
  const policy = loadBusterPreparationSettings({ SWARM_CONFIG: configFile });
  return { root, file: path.join(root, 'source-ledger', 'state.json'),
    ledger: new PreparationSourceLedger(root, policy), dispose: () => fs.rm(root, { recursive: true, force: true }) };
}

test('real ledger serializes competing admissions into exactly two fixed slots', async () => {
  const f = await fixture();
  try {
    const attempts = await Promise.allSettled([1, 2, 3].map(value => f.ledger.reserve(id(value), profile, now)));
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 2);
    const records = await f.ledger.reservations();
    assert.deepEqual(records.map(record => record.slot).sort(), [1003, 1004]);
    const rejected = attempts.find(result => result.status === 'rejected');
    assert.match(String(rejected?.status === 'rejected' && rejected.reason), /SLOT_CAPACITY/);
    assert.equal(records.every(record => record.slotReleased === false), true);
  } finally { await f.dispose(); }
});

test('admission reserves a future cleanup record inside the original record quota', async () => {
  const f = await fixture(2);
  try {
    const accepted = await f.ledger.reserve(id(1), profile, now);
    const before = await fs.readFile(f.file);
    await assert.rejects(f.ledger.reserve(id(2), profile, now), /SOURCE_CAPACITY/);
    assert.deepEqual(await fs.readFile(f.file), before);
    assert.deepEqual(await f.ledger.reserve(id(1), profile, now), accepted);
    await assert.rejects(f.ledger.released(id(1)), /LEDGER_INVALID/,
      'a release without either a sealed cleanup or exact empty-gate proof is rejected');
    assert.deepEqual(await fs.readFile(f.file), before);
  } finally { await f.dispose(); }
});

test('profile, clock and settings ownership is captured before waiting on a real writer lock', async () => {
  const f = await fixture();
  try {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const writer = withDurableStoreLock(f.file, async () => { entered.resolve(); await release.promise; });
    await entered.promise;
    const submitted = structuredClone(profile);
    const submittedAt = new Date(now);
    const pending = f.ledger.reserve(id(1), submitted, submittedAt);
    submitted.profileId = 'caller-mutated';
    submittedAt.setFullYear(2040);
    release.resolve();
    await writer;
    const accepted = await pending;
    assert.equal(accepted.profile.profileId, profile.profileId);
    assert.equal(accepted.issuedAt, now.toISOString());
  } finally { await f.dispose(); }
});

test('malformed persisted cleanup association is rejected without rewriting bytes', async () => {
  const f = await fixture();
  try {
    await f.ledger.reserve(id(1), profile, now);
    const state = JSON.parse(await fs.readFile(f.file, 'utf8'));
    state.reservations[0].cleanup = [{ envelope: { forged: true } }];
    await fs.writeFile(f.file, JSON.stringify(state));
    const malformed = await fs.readFile(f.file);
    await assert.rejects(f.ledger.reservations(), /CLEANUP_ASSOCIATION_INVALID/);
    assert.deepEqual(await fs.readFile(f.file), malformed);
  } finally { await f.dispose(); }
});
