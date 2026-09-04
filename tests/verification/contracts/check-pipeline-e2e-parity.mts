import assert from 'node:assert/strict'; import fs from 'node:fs';
const ledger=JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-e2e-parity-ledger.json','utf8')); const baseline=JSON.parse(fs.readFileSync(ledger.baseline,'utf8'));
const scenarios:Record<string,string>={
  'E2E-001':'multiple-tests','E2E-002':'multiple-tests','E2E-003':'multiple-tests','E2E-004':'failure-after-retry',
  'E2E-005':'zero-tests','E2E-006':'cancellation','E2E-007':'failure-after-retry','E2E-008':'path-boundary',
  'E2E-009':'suite-resolution','E2E-010':'common-result-contract','E2E-011':'multiple-tests','E2E-012':'failure-after-retry',
  'E2E-013':'failure-after-retry','E2E-014':'operator-overlay','E2E-015':'structured-reporter','E2E-016':'failure-after-retry',
  'E2E-017':'multiple-tests','E2E-018':'worker-clamp','E2E-019':'process-limit','E2E-020':'multiple-tests',
  'E2E-021':'skip','E2E-022':'blocking-policy','E2E-023':'exact-origin','E2E-024':'authenticated-dispatch',
  'E2E-025':'evidence-import','E2E-026':'output-capture','E2E-027':'path-boundary',
  'E2E-DEFECT-028':'console-parse-absent','E2E-DEFECT-029':'numeric-allowance-absent','E2E-DEFECT-030':'legacy-absence'};
assert.equal(Object.keys(ledger.entries).length,baseline.expectedItemCount);
const scenarioSources=['skills/buster/plugins/playwright/tests/live-function.test.ts','tests/verification/contracts/check-pipeline-e2e-implementation.mts','tests/verification/contracts/check-pipeline-e2e-remote-vertical.mts','tests/verification/contracts/check-pipeline-e2e-cutover.mts'].map((file)=>fs.readFileSync(file,'utf8')).join('\n');
for(const item of baseline.items){const entry=ledger.entries[item.id];assert.ok(entry,`missing ${item.id}`);assert.equal(entry.status,'proved');assert.ok(entry.rationale.length>=20);for(const proof of entry.proof)assert.equal(fs.existsSync(proof),true,`missing proof ${proof}`);const scenario=scenarios[item.id];assert.ok(scenario,`missing scenario mapping ${item.id}`);assert.equal(scenarioSources.includes(scenario),true,`${item.id} lacks executable scenario ${scenario}`);}
console.log(JSON.stringify({ok:true,phase:'e2e-parity',items:baseline.expectedItemCount}));
