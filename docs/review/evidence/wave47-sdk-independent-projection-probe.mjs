import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// The supplied functions are the unmodified production imports used by the
// original report-evidence fixture. Only the adversarial journal input changes.
export async function reviewUnknownEffect({ t, config, first, readRunEvidence, FileJournal, runRoot }) {
  await t.test('independent report projection rejects an unknown durable identity version without rewriting evidence', () => {
    const file = path.join(runRoot(config.storageRoot, first.runId), 'effects.jsonl');
    const original = fs.readFileSync(file);
    const records = original.toString().trimEnd().split('\n').map(line => JSON.parse(line).entry);
    const requested = records.find(record => record.type === 'requested');
    assert(requested);
    const previous = requested.request.effectId;
    const unknown = `effect:json-utf16-v999:${'a'.repeat(64)}`;
    try {
      fs.unlinkSync(file);
      const journal = new FileJournal(file);
      for (const entry of records) {
        if (entry.request?.effectId === previous) entry.request.effectId = unknown;
        if (entry.receipt?.effectId === previous) entry.receipt.effectId = unknown;
        journal.append(entry);
      }
      const adversarial = fs.readFileSync(file);
      assert.throws(() => readRunEvidence(first, { storageRoot: config.storageRoot,
        maximumBytes: config.maximumJournalBytes, orchestratorIssuerId: 'nova' }), /RUN_EVIDENCE_EFFECT_INVALID/u);
      assert.deepEqual(fs.readFileSync(file), adversarial, 'read-only consumer does not repair or migrate the unknown identity');
    } finally { fs.writeFileSync(file, original); }
    assert.equal(readRunEvidence(first, { storageRoot: config.storageRoot,
      maximumBytes: config.maximumJournalBytes, orchestratorIssuerId: 'nova' }).journalHead, first.journalHead);
  });
}
