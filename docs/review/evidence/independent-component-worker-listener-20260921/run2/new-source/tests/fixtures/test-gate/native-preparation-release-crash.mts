import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { withNativePreparation } from './native-preparation.mts';

const [root, boundary] = process.argv.slice(2);
assert.ok(root && path.isAbsolute(root));
assert.ok(boundary === 'before-release' || boundary === 'after-release' || boundary === 'after-delete');
assert.ok(process.send);

// Explicit test instrumentation at the root-ledger boundary. Native owner,
// process, physical deletion, journal archive and cleanup seal remain real.
await withNativePreparation(root, async () => {
  throw new Error('expected recovery release barrier was not reached');
}, execution => {
  if (boundary === 'after-delete') {
    const reserve = execution.ledger.reserveCleanup.bind(execution.ledger);
    execution.ledger.reserveCleanup = async (admissionId, association) => {
      await reserve(admissionId, association);
      const observe = async () => {
        const deadline = Date.now() + execution.settings.timeoutMs;
        const stderr = path.join(execution.journal.outputRoot(association.envelope), 'stderr');
        while (Date.now() < deadline) {
          let observed = '';
          try {
            const handle = await fs.open(stderr, 'r');
            try {
              const buffer = Buffer.alloc(4096);
              const read = await handle.read(buffer, 0, buffer.length, 0);
              observed = buffer.subarray(0, read.bytesRead).toString('utf8');
            } finally { await handle.close(); }
          } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
          if (observed.includes('BUSTER_NATIVE_TEST_OWNED_DATA_REMOVED\n')) {
            assert.equal(await execution.journal.readResult(association.envelope), null);
            const row = (await execution.ledger.reservations()).find(item => item.admissionId === admissionId);
            assert.ok(row && !row.slotReleased && row.cleanup.length === 1);
            process.send!({ kind: boundary, admissionId });
            return;
          }
          await setTimeout(execution.settings.pollIntervalMs);
        }
        throw new Error('actual cleanup deletion barrier was not observed');
      };
      void observe().catch(error => {
        process.stderr.write(String(error));
        process.exitCode = 1;
        process.send!({ kind: 'barrier-failed', admissionId });
      });
    };
    return;
  }
  const released = execution.ledger.released.bind(execution.ledger);
  execution.ledger.released = async (admissionId: string) => {
    if (boundary === 'after-release') await released(admissionId);
    process.send!({ kind: boundary, admissionId });
    await new Promise<void>(() => { setInterval(() => {}, 1000); });
    if (boundary === 'before-release') await released(admissionId);
  };
});
