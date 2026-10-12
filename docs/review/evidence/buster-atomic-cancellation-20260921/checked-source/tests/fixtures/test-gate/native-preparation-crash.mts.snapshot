import assert from 'node:assert/strict';
import path from 'node:path';
import { stageNativeWire, withNativePreparation } from './native-preparation.mts';

const root = process.argv[2];
assert.ok(root && path.isAbsolute(root));
assert.ok(process.send, 'the maintained parent must observe durable acceptance over IPC');
await withNativePreparation(root, async (execution, store) => {
  const staged = await stageNativeWire(execution, path.join(root, 'producer-wire.json'), new AbortController().signal);
  assert.ok(staged);
  const accepted = await store.accept(staged, new Date().toISOString());
  assert.equal(accepted.state, 'accepted');
  process.send!({ kind: 'durably-accepted', jobId: staged.job.jobId, input: staged.input });
  // The parent kills this process, deliberately bypassing supervisor finalization.
  // An active handle keeps the crash window open without starting extraction.
  await new Promise<void>(() => { setInterval(() => {}, 1000); });
});
