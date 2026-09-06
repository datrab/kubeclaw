import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { FileJournal } from '../../../skills/nova/core/state/journal.ts';
import { readPipelineAudit } from '../../../skills/nova/core/telemetry/audit.ts';
import type { LifecycleEvent } from '@kubeclaw/plugin-sdk';

test('audit rebuilds from real journal bytes, ignores unavailable projections and rejects corrupt history', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-projection-'));
  try {
    const file = path.join(root, 'events.jsonl');
    const journal = new FileJournal<LifecycleEvent>(file);
    journal.append({ schemaVersion: 'lifecycle-event.v2', eventId: 'event:1', sequence: 1, type: 'run.started',
      identity: { runId: 'audit:run' }, occurredAt: new Date().toISOString(), causationId: null,
      payload: { nested: { token: 'private-test-value' }, message: 'Actual durable event.' } });
    fs.writeFileSync(path.join(root, 'artifacts'), 'not a directory: projection storage is unavailable');
    const original = fs.readFileSync(file);
    const first = readPipelineAudit(root, 'audit:run');
    assert.deepEqual(readPipelineAudit(root, 'audit:run'), first);
    assert.equal(first.events.length, 1);
    assert.doesNotMatch(JSON.stringify(first), /private-test-value/);
    assert.deepEqual(fs.readFileSync(file), original);
    fs.writeFileSync(file, original.toString().replace('Actual durable event.', 'Altered durable event.'));
    assert.throws(() => readPipelineAudit(root, 'audit:run'), /JOURNAL_HASH_INVALID/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
