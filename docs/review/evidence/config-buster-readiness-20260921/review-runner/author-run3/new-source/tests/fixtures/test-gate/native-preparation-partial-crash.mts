import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { stageNativeWire, withNativePreparation } from './native-preparation.mts';
import { extractBusterPreparation } from '../../../skills/buster/engine/test-gates/preparation-extraction.ts';
import type { PreparationExecutionOptions } from '../../../skills/buster/engine/test-gates/preparation-execution.ts';
import type { WorkerAttemptEnvelopeV3 } from '@kubeclaw/pipeline-worker-core-contract';

const [root, boundary] = process.argv.slice(2);
assert.ok(root && path.isAbsolute(root));
assert.ok(boundary === 'stage-write' || boundary === 'extract-write');
assert.ok(process.send);
const fileName = boundary === 'stage-write' ? 'request.json' : 'repository.tar.gz';

async function observePartial(execution: PreparationExecutionOptions, envelope: WorkerAttemptEnvelopeV3): Promise<void> {
  const file = path.join(execution.journal.outputRoot(envelope), 'stderr');
  const deadline = Date.now() + execution.settings.timeoutMs;
  while (Date.now() < deadline) {
    let text = '';
    try {
      const handle = await fs.open(file, 'r');
      try {
        const buffer = Buffer.alloc(4096);
        const read = await handle.read(buffer, 0, buffer.length, 0);
        text = buffer.subarray(0, read.bytesRead).toString('utf8');
      } finally { await handle.close(); }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (text.includes(`BUSTER_NATIVE_TEST_PARTIAL_WRITE:${fileName}\n`)) {
      const rows = await execution.ledger.reservations();
      const row = rows.find(item => item.attemptSpecDigest === envelope.attemptSpecDigest);
      assert.ok(row && !row.slotReleased);
      assert.equal(await execution.journal.readResult(envelope), null);
      const input = boundary === 'stage-write' ? row.input : rows.find(item => item.phase === 'retained-input')?.input;
      assert.ok(input);
      const expected = boundary === 'stage-write' ? input.input.wireBytes : input.job.repositoryArchive.sizeBytes;
      const stat = await fs.lstat(path.join(execution.command.sourceRoot, row.admissionId, 'data', fileName));
      assert.equal(stat.uid, row.slot);
      assert.ok(stat.size > 0 && stat.size < expected, 'actual bytes are a strict partial write');
      process.send!({ kind: boundary, admissionId: row.admissionId, bytes: stat.size });
      return;
    }
    await setTimeout(execution.settings.pollIntervalMs);
  }
  throw new Error('actual partial write marker missing');
}

await withNativePreparation(root, async (execution, store) => {
  const watch = (envelope: WorkerAttemptEnvelopeV3) => {
    void observePartial(execution, envelope).catch(error => {
      process.stderr.write(String(error));
      process.send!({ kind: 'barrier-failed' });
    });
  };
  if (boundary === 'stage-write') {
    const reserve = execution.ledger.reserve.bind(execution.ledger);
    execution.ledger.reserve = async (...args) => { const envelope = await reserve(...args); watch(envelope); return envelope; };
  } else {
    const reserve = execution.ledger.reserveExtraction.bind(execution.ledger);
    execution.ledger.reserveExtraction = async (...args) => { const envelope = await reserve(...args); watch(envelope); return envelope; };
  }
  const staged = await stageNativeWire(execution, path.join(root, 'producer-wire.json'), new AbortController().signal);
  assert.ok(staged);
  assert.equal(boundary, 'extract-write', 'staging must not finish past its partial-write barrier');
  await store.accept(staged, new Date().toISOString());
  await extractBusterPreparation(execution, staged, new AbortController().signal);
  assert.fail('extraction must not finish past its partial-write barrier');
});
