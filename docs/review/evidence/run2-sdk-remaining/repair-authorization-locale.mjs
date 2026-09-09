// Audit reproducer for an OPEN defect, not a product acceptance test.
// Original Core, Git, ArtifactStore, journal recovery and authorization execute.
// The existing deterministic checker fixture emits contract-valid Unicode keys
// inside reason.details. No model/provider or native-gate success is claimed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { budgetFixture } from '../../../../tests/verification/reliability/repair-budget-fixture.mjs';
import { runPipelineV2 } from '../../../../skills/nova/core/execution/engine.ts';
import { runRoot } from '../../../../skills/nova/core/execution/run-root.ts';
import { FileJournal } from '../../../../skills/nova/core/state/journal.ts';
import { recoverStageStates } from '../../../../skills/nova/core/lifecycle/recovery.ts';
import { authorizedRepair } from '../../../../skills/nova/core/lifecycle/repair-authorization.ts';
import { validateContractValue } from '@kubeclaw/plugin-foundation/registry/schema';

const script = fileURLToPath(import.meta.url);
const [mode, root] = process.argv.slice(2);
if (mode === '--produce') {
  const f = budgetFixture(root, { lint: [1, 2, 3] });
  // This is a test plugin's deterministic finding body, not a core-code edit.
  // Its result schema delegates to the production StageResult validator, whose
  // reason.details is an unconstrained JSON object. Source facts stay unchanged.
  const checker = path.join(root, 'plugins', 'plugin', 'stage.mjs');
  const source = fs.readFileSync(checker, 'utf8');
  assert.equal(source.split('details: { version, revision }').length, 2);
  fs.writeFileSync(checker, source.replace('details: { version, revision }', "details: { version, revision, 'ä': 2, z: 1 }"));
  const runId = 'run:repair-authorization-locale';
  const result = await runPipelineV2(f.platform, f.definition, runId);
  assert.equal(result.status, 'waiting');
  const state = result.stages.get('lint');
  const pending = state.pendingRepair;
  validateContractValue('stageResult', pending.request.requesterResult);
  assert.equal(pending.request.requesterResult.reason.details.ä, 2);
  const wait = state.wait;
  const signal = { schemaVersion: 'resume-signal.v2', signalId: 'signal:original', idempotencyKey: 'key:original',
    waitId: wait.waitId, signalType: wait.signalType, issuer: wait.authorizedIssuer, issuedAt: new Date().toISOString(),
    payload: { repairAuthorization: { pendingDigest: wait.request.repairAuthorization.digest, reason: 'Authorize this exact persisted finding.' } } };
  assert.equal(authorizedRepair(f.definition.stages, result.stages, state, signal).budgetOrder.id, pending.digest);
  fs.writeFileSync(path.join(root, 'case.json'), JSON.stringify({ runId, definition: f.definition,
    journal: path.join(runRoot(f.platform.storageRoot, runId), 'events.jsonl'), signal, digest: pending.digest }));
  process.stdout.write(JSON.stringify({ locale: Intl.DateTimeFormat().resolvedOptions().locale,
    state: result.status, originalDigest: pending.digest, sourceAttempts: result.stages.get('source').attemptsUsed }));
} else if (mode === '--read') {
  const stored = JSON.parse(fs.readFileSync(path.join(root, 'case.json'), 'utf8'));
  const states = recoverStageStates(stored.definition, new FileJournal(stored.journal).records(), stored.runId, 'nova');
  const pending = states.get('lint').pendingRepair;
  let error;
  try { authorizedRepair(stored.definition.stages, states, states.get('lint'), stored.signal); }
  catch (caught) { error = caught.message; }
  process.stdout.write(JSON.stringify({ locale: Intl.DateTimeFormat().resolvedOptions().locale,
    originalDigest: stored.digest, recoveredDigest: pending.digest,
    originalWaitDigest: states.get('lint').wait.request.repairAuthorization.digest,
    authorized: error === undefined, ...(error ? { error } : {}) }));
} else {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-locale-audit-'));
  const invoke = (operation, locale) => {
    const env = { ...process.env, LANG: locale, LC_ALL: locale }; delete env.NODE_TEST_CONTEXT;
    return JSON.parse(execFileSync(process.execPath, [script, operation, temporary], { cwd: path.resolve('.'), env, encoding: 'utf8', timeout: 120000 }));
  };
  try {
    const producer = invoke('--produce', 'en_US.UTF-8');
    const stored = JSON.parse(fs.readFileSync(path.join(temporary, 'case.json'), 'utf8'));
    const originalJournal = fs.readFileSync(stored.journal);
    const english = invoke('--read', 'en_US.UTF-8');
    const swedish = invoke('--read', 'sv_SE.UTF-8');
    assert.equal(producer.locale, 'en-US'); assert.equal(english.locale, 'en-US'); assert.equal(swedish.locale, 'sv-SE');
    assert.equal(english.authorized, true);
    assert.equal(english.originalDigest, english.recoveredDigest);
    assert.equal(swedish.originalDigest, swedish.originalWaitDigest);
    assert.notEqual(swedish.originalDigest, swedish.recoveredDigest);
    assert.equal(swedish.authorized, false);
    assert.equal(swedish.error, 'REPAIR_AUTHORIZATION_INVALID');
    assert.deepEqual(fs.readFileSync(stored.journal), originalJournal);
    process.stdout.write(`${JSON.stringify({ reproducedOpenDefect: true, producer, english, swedish,
      journalUnchanged: true, completePipelineOrNativeProof: false }, null, 2)}\n`);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
