import { fileURLToPath } from 'node:url';
import { captureSwarmSettings } from '../../common/plugin-runtime/foundation/config/swarm.ts';
import { nativeResourcePolicy, nativeControlSettings } from './native/resource-policy.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NativeAttemptJournal } from '../../worker/core/worker/native-attempt-journal.ts';
import { interruptedNativeWorkerResult } from '../../worker/core/worker/native-result.ts';
import { canonicalJson } from '@kubeclaw/pipeline-worker-core-contract';
import { prismNativeAttempt } from '../engine/worker-envelope.ts';

const configRoot = fileURLToPath(new URL('../../../config/', import.meta.url));
const entry = JSON.parse(fs.readFileSync(path.join(configRoot, 'pipeline.config.json'), 'utf8'));
const instanceId = 'kubeclaw/prism/prism-worker';
const selection = { role: 'prism' as const, callerId: 'prism-worker' as const, serviceInstanceId: instanceId,
  bindings: entry.bindings.filter((binding: { instanceId: string }) => binding.instanceId === instanceId)
    .map(({ role: _role, ...binding }: { role: string; owner: string; instanceId: string; profileId: string }) => binding) };
const attempt = prismNativeAttempt('render', { artifactId: 'input:result-config', type: 'prism-engine-input', mediaType: 'application/json',
  contentDigest: `sha256:${'a'.repeat(64)}`, sizeBytes: 2, storageUrl: 'https://control.example/input' }, 'config-journal-test', nativeResourcePolicy, nativeControlSettings.nativeAttemptLifetimeMs, nativeControlSettings.nativeAttemptTimeoutMs,
  nativeControlSettings.nativeAttemptCleanupTimeoutMs, nativeControlSettings.nativeAttemptLogBytes,
  nativeControlSettings.nativeAttemptResultBytes, nativeControlSettings.nativeAttemptEvidenceBytes, nativeControlSettings.nativeAttemptEvidenceFiles);
const receipt = interruptedNativeWorkerResult(attempt, new Date('2026-09-21T00:00:00.000Z'), 'TEST_NOT_LAUNCHED', null, true);
const bytes = Buffer.byteLength(canonicalJson(receipt));

for (const maximumResultBytes of [bytes - 1, bytes]) test(`CR05 real journal consumes authored ${maximumResultBytes} byte result limit`, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-result-journal-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const copiedConfig = path.join(root, 'config'); fs.cpSync(configRoot, copiedConfig, { recursive: true });
  const authorFile = path.join(copiedConfig, 'components/prism-execution.config.json');
  const author = JSON.parse(fs.readFileSync(authorFile, 'utf8'));
  author.profiles.standard.settings.maximumResultBytes = maximumResultBytes;
  fs.writeFileSync(authorFile, JSON.stringify(author));
  const captured = captureSwarmSettings(path.join(copiedConfig, 'pipeline.config.json'), selection);
  const selectedLimit = captured.components['prism-execution']!.settings.maximumResultBytes as number;
  assert.equal(selectedLimit, maximumResultBytes);
  // Exercise actual persistence/byte enforcement with the loaded setting. No native
  // owner, process, root policy or successful kernel receipt is fabricated here.
  const journal = new NativeAttemptJournal(path.join(root, 'journal'), { maximumRecords: 8, maximumStateBytes: 262144,
    maximumTotalBytes: 8388608, maximumInputBytes: 65536, maximumOutputBytes: 65536,
    maximumResultBytes: selectedLimit });
  const persist = () => journal.withAttempt(attempt, async () => journal.seal(attempt, receipt));
  if (maximumResultBytes < bytes) {
    await assert.rejects(persist(), /WORKER_NATIVE_JOURNAL_RESULT_LIMIT/);
    assert.equal(await journal.readResult(attempt), null);
  } else {
    assert.deepEqual(await persist(), receipt);
    assert.deepEqual(await journal.readResult(attempt), receipt);
  }
});
