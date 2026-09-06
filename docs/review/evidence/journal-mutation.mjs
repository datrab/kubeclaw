// Real FileJournal; no substituted filesystem or journal implementation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileJournal } from '../../../skills/nova/core/state/journal.ts';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pcr-journal-'));
try {
  const file = path.join(root, 'events.jsonl');
  const journal = new FileJournal(file);
  const value = { payload: { decision: 'approved' } };
  journal.append(value);
  value.payload.decision = 'rejected';
  const memory = journal.refresh()[0].entry.payload.decision;
  const disk = new FileJournal(file).records()[0].entry.payload.decision;
  assert.equal(memory, 'rejected');
  assert.equal(disk, 'approved');
  journal.records()[0].entry.payload.decision = 'changed-through-reader';
  assert.equal(journal.refresh()[0].entry.payload.decision, 'changed-through-reader');
  assert.equal(new FileJournal(file).records()[0].entry.payload.decision, 'approved');
  console.log(JSON.stringify({finding:'PCR-STATE-001', reproduced:true, memory, disk, readerMutation:true}));
} finally { fs.rmSync(root, {recursive:true, force:true}); }
