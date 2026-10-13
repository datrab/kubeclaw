import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { FileJournal } from '../../../../../skills/nova/core/state/journal.ts';

// Actual existing persistence reader/writer in an owned temporary directory.
// This does NOT implement a module binding or exercise the future SDK schema.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-c0-journal-seam-'));
const file = path.join(root, 'events.jsonl');
const observations = [];
function check(id, operation) { operation(); observations.push({ id, result: 'passed' }); }
try {
  const first = new FileJournal(file);
  const specimen = { schemaVersion: 'c0-definition-specimen.v1', moduleId: 'module-a', bindingDigest: 'sha256:' + 'a'.repeat(64) };
  const capture = journal => journal.transact((records, append) => {
    const original = records.find(record => record.entry.moduleId === specimen.moduleId);
    if (original) { assert.deepEqual(original.entry, specimen); return original; }
    return append(specimen);
  });
  check('CURRENT-JOURNAL-CAPTURE', () => assert.equal(capture(first).sequence, 1));
  check('CURRENT-JOURNAL-REOPEN', () => assert.deepEqual(new FileJournal(file).records()[0].entry, specimen));
  check('CURRENT-JOURNAL-TWO-OBJECT-DEDUP', () => {
    const second = new FileJournal(file); capture(second); capture(first);
    assert.equal(new FileJournal(file).records().length, 1);
  });
  check('CURRENT-JOURNAL-CONFLICT-BEFORE-APPEND', () => {
    const prior = fs.readFileSync(file);
    assert.throws(() => first.transact((records, append) => {
      if (records.some(record => record.entry.moduleId === specimen.moduleId)) throw new Error('C0_SPECIMEN_CONFLICT');
      append({ ...specimen, bindingDigest: 'sha256:' + 'b'.repeat(64) });
    }), /C0_SPECIMEN_CONFLICT/);
    assert.deepEqual(fs.readFileSync(file), prior);
  });
  check('CURRENT-JOURNAL-INCOMPLETE-TAIL-RECOVERY', () => {
    const prior = fs.readFileSync(file); fs.appendFileSync(file, '{incomplete');
    assert.equal(new FileJournal(file).records().length, 1);
    assert.deepEqual(fs.readFileSync(file), prior);
  });
  check('CURRENT-JOURNAL-APPENDED-RECORD-NOT-ROLLBACK', () => {
    assert.throws(() => first.transact((_records, append) => {
      append({ schemaVersion: 'c0-definition-specimen.v1', moduleId: 'module-b' });
      throw new Error('C0_AFTER_APPEND');
    }), /C0_AFTER_APPEND/);
    assert.equal(new FileJournal(file).records().length, 2);
  });
  check('CURRENT-JOURNAL-CALLBACK-CANNOT-ESCAPE', () => {
    let escaped; first.transact((_records, append) => { escaped = append; });
    assert.throws(() => escaped(specimen), /JOURNAL_TRANSACTION_CLOSED/);
  });
  const bytes = fs.readFileSync(file);
  console.log(JSON.stringify({ scope: 'current FileJournal local persistence only', observations,
    fixtureBytes: bytes.length, fixtureSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    limitations: ['specimen is not a current LifecycleEvent', 'no true multi-process contention or process-kill crash exercised',
      'transact is synchronous exclusion, not multi-record rollback; no await inside callback',
      'no proposed module binding, observer, SDK, capacity or deployed-host acceptance'] }, null, 2));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
