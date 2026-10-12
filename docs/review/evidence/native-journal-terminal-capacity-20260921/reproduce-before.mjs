import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { limits, envelope, temporary, finish, metadataFile } from '../../../../tests/verification/reliability/native-journal-capacity-fixture.mts';
const modulePath = path.resolve('skills/worker/core/worker/native-attempt-journal.before-capacity.mts');
const root = await temporary();
try {
  await fs.copyFile('docs/review/evidence/native-journal-terminal-capacity-20260921/native-attempt-journal.ts.before.snapshot', modulePath);
  const { NativeAttemptJournal } = await import(pathToFileURL(modulePath).href);
  const journal = new NativeAttemptJournal(root, { ...limits, maximumStateBytes: 8192 });
  const input = envelope('baseline');
  await journal.withAttempt(input, async () => {});
  const acceptedBytes = (await fs.stat(metadataFile(root))).size;
  let failure;
  try { await finish(journal, input); } catch (error) { failure = error.message; }
  if (failure !== 'DURABLE_RECORD_STORE_FULL') throw new Error(`Unexpected baseline: ${failure}`);
  console.log(JSON.stringify({ maximumStateBytes: 8192, admitted: true, acceptedBytes,
    validTerminalWriteFailure: failure, identityStillRetained: await journal.hasAttempt(input) }, null, 2));
} finally {
  await fs.unlink(modulePath).catch(() => {});
  await fs.rm(root, { recursive: true, force: true });
}
