import fs from 'node:fs/promises';
import { NativeAttemptJournal } from '../../skills/worker/core/worker/native-attempt-journal.ts';
import { NativeWorkerOutputSpool } from '../../skills/worker/core/worker/native-output-spool.ts';
import { interruptedNativeWorkerResult } from '../../skills/worker/core/worker/native-result.ts';
const [root, envelopePath, mode] = process.argv.slice(2);
const envelope = JSON.parse(await fs.readFile(envelopePath, 'utf8'));
const limits = { maximumRecords: 32, maximumStateBytes: 262144, maximumTotalBytes: 8388608,
  maximumInputBytes: 65536, maximumOutputBytes: 65536, maximumResultBytes: 65536 };
const journal = new NativeAttemptJournal(root, limits);
await journal.withAttempt(envelope, async context => {
  const spool = await NativeWorkerOutputSpool.create(context.outputRoot, limits.maximumOutputBytes);
  await spool.append('stderr', Buffer.from('original diagnostic: test-credential\n'));
  await spool.close();
  if (mode === 'sealed') {
    await journal.seal(envelope, interruptedNativeWorkerResult(envelope, new Date(context.acceptedAt), 'TEST_NOT_LAUNCHED', null, true));
  }
  process.stdout.write('durable\n');
  await new Promise(resolve => process.stdin.once('end', resolve).resume());
});
