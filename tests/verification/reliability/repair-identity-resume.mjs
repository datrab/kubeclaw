import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { budgetPlatform } from './repair-budget-fixture.mjs';
import { resumePipelineV2 } from '../../../skills/nova/core/execution/engine.ts';
import { FileJournal } from '../../../skills/nova/core/state/journal.ts';
import { recoverStageStates } from '../../../skills/nova/core/lifecycle/recovery.ts';

const root = process.argv[2];
const stored = JSON.parse(fs.readFileSync(path.join(root, 'case.json'), 'utf8'));
const result = await resumePipelineV2(budgetPlatform(root), stored.definition, stored.runId, stored.signal);
assert.equal(result.status, 'succeeded');
const ledger = result.stages.get('source').repairLedger;
assert.equal(ledger.length, 3);
assert.equal(ledger.at(-1).authorization.signalId, stored.signal.signalId);
assert.equal(ledger.at(-1).requestDigest, stored.digest);
const replay = recoverStageStates(stored.definition, new FileJournal(stored.journal).records(), stored.runId, 'nova');
assert.deepEqual([...replay], [...result.stages]);
console.log(JSON.stringify({ locale: Intl.DateTimeFormat().resolvedOptions().locale, status: result.status,
  sourceAttempts: result.stages.get('source').attemptsUsed, approvedOriginalDigest: ledger.at(-1).requestDigest,
  completeNativePipelineProof: false }));
