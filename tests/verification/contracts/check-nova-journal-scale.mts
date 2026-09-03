import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const core = await import(pathToFileURL(path.resolve('skills/nova/core/src/index.ts')).href);
const targetMiB = Number(process.env.NOVA_JOURNAL_SCALE_MIB ?? '16');
if (!Number.isSafeInteger(targetMiB) || targetMiB < 1 || targetMiB > 512) {
  throw new Error('NOVA_JOURNAL_SCALE_MIB_INVALID');
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-journal-scale-'));
try {
  const file = path.join(root, 'journal.jsonl');
  const journal = new core.FileJournal(file);
  const payload = 'x'.repeat(1024 * 1024);
  for (let index = 0; index < targetMiB; index += 1) journal.append({ index, payload });
  const bytes = fs.statSync(file).size;
  assert.ok(bytes >= targetMiB * 1024 * 1024);

  const reopenedAt = performance.now();
  const reopened = new core.FileJournal(file);
  const replayMs = performance.now() - reopenedAt;
  const appendAt = performance.now();
  reopened.append({ index: targetMiB, payload: 'steady-state' });
  const appendMs = performance.now() - appendAt;
  assert.ok(appendMs < 5_000, `steady-state append took ${appendMs.toFixed(1)}ms`);

  const peer = new core.FileJournal(file);
  reopened.append({ index: targetMiB + 1, payload: 'tail-sync' });
  assert.equal(peer.refresh().at(-1)?.entry.payload, 'tail-sync');
  console.log(JSON.stringify({ ok: true, targetMiB, bytes, replayMs, appendMs,
    records: reopened.records().length }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
