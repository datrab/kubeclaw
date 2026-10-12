import { readTestBundle, writeTestBundle } from '../../../tests/fixtures/config/swarm-bundle.mjs';
import { nativeResourcePolicy } from './native/resource-policy.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NativeAttemptJournal } from '../../worker/core/worker/native-attempt-journal.ts';
import { interruptedNativeWorkerResult } from '../../worker/core/worker/native-result.ts';
import { canonicalJson } from '@kubeclaw/pipeline-worker-core-contract';
import { prismNativeAttempt } from '../engine/worker-envelope.ts';
import { loadWorkerConfig } from '../server/worker-config.ts';

const authored = readTestBundle(new URL('../../../charts/kubeclaw/files/config/swarm.config.json', import.meta.url));
const attempt = prismNativeAttempt('render', { artifactId: 'input:result-config', type: 'prism-engine-input', mediaType: 'application/json',
  contentDigest: `sha256:${'a'.repeat(64)}`, sizeBytes: 2, storageUrl: 'https://control.example/input' }, 'config-journal-test', nativeResourcePolicy);
const receipt = interruptedNativeWorkerResult(attempt, new Date('2026-09-21T00:00:00.000Z'), 'TEST_NOT_LAUNCHED', null, true);
const bytes = Buffer.byteLength(canonicalJson(receipt));

for (const maximumResultBytes of [bytes - 1, bytes]) test(`CR05 real journal consumes authored ${maximumResultBytes} byte result limit`, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-result-journal-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = structuredClone(authored); config['prism-execution'].settings.maximumResultBytes = maximumResultBytes;
  const file = path.join(root, 'swarm.config.json'); writeTestBundle(file, config);
  const worker = loadWorkerConfig({ SWARM_CONFIG: file, PRISM_WORKER_SECRET: 'test', DATABASE_URL: 'postgresql://not-opened' });
  // Exercise actual persistence/byte enforcement with the loaded setting. No native
  // owner, process, root policy or successful kernel receipt is fabricated here.
  const journal = new NativeAttemptJournal(path.join(root, 'journal'), { maximumRecords: 8, maximumStateBytes: 262144,
    maximumTotalBytes: 8388608, maximumInputBytes: 65536, maximumOutputBytes: 65536,
    maximumResultBytes: worker.native.maximumResultBytes });
  const persist = () => journal.withAttempt(attempt, async () => journal.seal(attempt, receipt));
  if (maximumResultBytes < bytes) {
    await assert.rejects(persist(), /WORKER_NATIVE_JOURNAL_RESULT_LIMIT/);
    assert.equal(await journal.readResult(attempt), null);
  } else {
    assert.deepEqual(await persist(), receipt);
    assert.deepEqual(await journal.readResult(attempt), receipt);
  }
});
