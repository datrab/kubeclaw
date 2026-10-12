import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { stageNativeWire, withNativePreparation } from './native-preparation.mts';
import { extractBusterPreparation } from '../../../skills/buster/engine/test-gates/preparation-extraction.ts';

const root = process.argv[2];
assert.ok(root && path.isAbsolute(root));
await withNativePreparation(root, async (execution, store) => {
  assert.equal(execution.settings.maximumRecords, 2, 'the separately authored test profile must reach the real loader');
  const staged = await stageNativeWire(execution, path.join(root, 'producer-wire.json'), new AbortController().signal);
  assert.ok(staged);
  await store.accept(staged, new Date().toISOString());
  const ledger = path.join(execution.command.sourceRoot, 'source-ledger', 'state.json');
  const before = await fs.readFile(ledger);
  const entries = (await fs.readdir(execution.command.sourceRoot)).sort();
  await assert.rejects(extractBusterPreparation(execution, staged, new AbortController().signal),
    /BUSTER_PREPARATION_SOURCE_CAPACITY/u);
  assert.deepEqual(await fs.readFile(ledger), before);
  assert.deepEqual((await fs.readdir(execution.command.sourceRoot)).sort(), entries);
  let attempts = 0;
  for await (const envelope of execution.journal.acceptedEnvelopes()) {
    assert.equal((await execution.journal.readResult(envelope))?.state, 'completed');
    attempts += 1;
  }
  assert.equal(attempts, 1, 'no extraction host is accepted past the root metadata reservation');
  const records = await store.records();
  assert.equal(records.length, 1);
  assert.deepEqual(records[0]!.payload.input, staged.input);
});
