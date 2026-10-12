import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { nativeResourcePolicy } from '../../../skills/prism/tests/native/resource-policy.mts';
import { prismNativeAttempt } from '../../../skills/prism/engine/worker-envelope.ts';
import { NativeAttemptJournal } from '../../../skills/worker/core/worker/native-attempt-journal.ts';
import { NativeWorkerOutputSpool } from '../../../skills/worker/core/worker/native-output-spool.ts';
import { interruptedNativeWorkerResult } from '../../../skills/worker/core/worker/native-result.ts';
import type { NativeAttemptJournalLimits } from '../../../skills/worker/core/worker/native-journal-state.ts';

export const limits: NativeAttemptJournalLimits = { maximumRecords: 32, maximumStateBytes: 262144,
  maximumTotalBytes: 8388608, maximumInputBytes: 65536, maximumOutputBytes: 65536, maximumResultBytes: 65536 };
const artifact = { artifactId: 'input:journal-capacity', type: 'prism-engine-input', mediaType: 'application/json',
  contentDigest: `sha256:${'1'.repeat(64)}`, sizeBytes: 2, storageUrl: 'https://control.example/input' };
export const envelope = (name: string) => prismNativeAttempt('render', artifact, name, nativeResourcePolicy);
export const metadataFile = (root: string) => path.join(root, 'metadata', 'records', 'store.json');
export const metadata = async (root: string) => JSON.parse(await fs.readFile(metadataFile(root), 'utf8'));
export const temporary = () => fs.mkdtemp(path.join(os.tmpdir(), 'journal-capacity-'));

export async function finish(journal: NativeAttemptJournal, input: ReturnType<typeof envelope>) {
  return journal.withAttempt(input, async context => {
    const spool = await NativeWorkerOutputSpool.create(context.outputRoot, limits.maximumOutputBytes);
    await spool.close();
    await journal.recordProcess(input, { schemaVersion: 'worker-native-process-result.v1',
      stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: null,
      signal: '\u0000'.repeat(4096), fault: '\u0000'.repeat(4096), resources: { unit: 'linux-tasks',
        cpuTimeMicroseconds: Number.MAX_SAFE_INTEGER, maximumMemoryBytes: Number.MAX_SAFE_INTEGER,
        maximumTasks: Number.MAX_SAFE_INTEGER, populated: false, oomKills: Number.MAX_SAFE_INTEGER,
        taskLimitHits: Number.MAX_SAFE_INTEGER } }, new Date('+275760-09-13T00:00:00.000Z'));
    return journal.seal(input, interruptedNativeWorkerResult(input, new Date(context.acceptedAt), 'TEST_FAILURE', null, true));
  });
}
