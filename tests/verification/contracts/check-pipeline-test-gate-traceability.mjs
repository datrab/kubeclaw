import assert from 'node:assert/strict';
import fs from 'node:fs';

const designPath = 'docs/architecture/pipeline-test-gate-design.md';
const planPath = 'docs/architecture/pipeline-test-gate-implementation-plan.md';
const baselinePath = 'docs/architecture/pipeline-test-gate-unit-baseline.md';
const ledgerPath = 'docs/architecture/pipeline-test-gate-decision-ledger.json';
const migrationPlaybookPath = 'docs/architecture/pipeline-test-gate-suite-migration-playbook.md';
const phase8PlanPath = 'docs/architecture/pipeline-test-gate-phase-8-plan.md';
const phase9PlanPath = 'docs/architecture/pipeline-test-gate-phase-9-plan.md';
const phase10PlanPath = 'docs/architecture/pipeline-test-gate-phase-10-plan.md';
const phase10InventoryPath = 'docs/architecture/pipeline-test-gate-unit-cutover-inventory.json';
const phase10AuditPath = 'docs/architecture/pipeline-test-gate-phase-10-final-audit.md';
const unitParityLedgerPath = 'docs/architecture/pipeline-test-gate-unit-parity-ledger.json';
const manifestBaselinePath = 'docs/architecture/pipeline-test-gate-manifest-lint-baseline.json';
const manifestPlanPath = 'docs/architecture/pipeline-test-gate-manifest-lint-implementation-plan.md';
const manifestAuditPath = 'docs/architecture/pipeline-test-gate-manifest-lint-final-audit.md';
const manifestParityPlanPath = 'docs/architecture/pipeline-test-gate-manifest-lint-parity-plan.md';
const manifestParityLedgerPath = 'docs/architecture/pipeline-test-gate-manifest-lint-parity-ledger.json';
const manifestParityReportPath = 'docs/architecture/pipeline-test-gate-manifest-lint-parity-report.md';
const manifestComparisonPath = 'docs/architecture/pipeline-test-gate-manifest-lint-comparison.md';
const manifestParityAuditPath = 'docs/architecture/pipeline-test-gate-manifest-lint-parity-final-audit.md';
const manifestCutoverPlanPath = 'docs/architecture/pipeline-test-gate-manifest-lint-cutover-plan.md';
const manifestCutoverInventoryPath = 'docs/architecture/pipeline-test-gate-manifest-lint-cutover-inventory.json';
const manifestCutoverAuditPath = 'docs/architecture/pipeline-test-gate-manifest-lint-cutover-final-audit.md';

const design = fs.readFileSync(designPath, 'utf8');
const plan = fs.readFileSync(planPath, 'utf8');
const baseline = fs.readFileSync(baselinePath, 'utf8');
const ledgerText = fs.readFileSync(ledgerPath, 'utf8');
const ledger = JSON.parse(ledgerText);
const migrationPlaybook = fs.readFileSync(migrationPlaybookPath, 'utf8');
const phase8Plan = fs.readFileSync(phase8PlanPath, 'utf8');
const phase9Plan = fs.readFileSync(phase9PlanPath, 'utf8');
const phase10Plan = fs.readFileSync(phase10PlanPath, 'utf8');
const phase10Inventory = JSON.parse(fs.readFileSync(phase10InventoryPath, 'utf8'));
const phase10Audit = fs.readFileSync(phase10AuditPath, 'utf8');
const unitParityLedger = JSON.parse(fs.readFileSync(unitParityLedgerPath, 'utf8'));
const manifestBaseline = JSON.parse(fs.readFileSync(manifestBaselinePath, 'utf8'));
const manifestPlan = fs.readFileSync(manifestPlanPath, 'utf8');
const manifestAudit = fs.readFileSync(manifestAuditPath, 'utf8');
const manifestParityPlan = fs.readFileSync(manifestParityPlanPath, 'utf8');
const manifestParityLedger = JSON.parse(fs.readFileSync(manifestParityLedgerPath, 'utf8'));
const manifestParityReport = fs.readFileSync(manifestParityReportPath, 'utf8');
const manifestComparison = fs.readFileSync(manifestComparisonPath, 'utf8');
const manifestParityAudit = fs.readFileSync(manifestParityAuditPath, 'utf8');
const manifestCutoverPlan = fs.readFileSync(manifestCutoverPlanPath, 'utf8');
const manifestCutoverInventory = JSON.parse(fs.readFileSync(manifestCutoverInventoryPath, 'utf8'));
const manifestCutoverAudit = fs.readFileSync(manifestCutoverAuditPath, 'utf8');

const designIds = [...design.matchAll(/^### (D-[0-9]{3}):/gmu)].map((match) => match[1]);
const ledgerIds = [...ledgerText.matchAll(/^    "(D-[0-9]{3})":/gmu)].map((match) => match[1]);
const sortedUnique = (values) => [...new Set(values)].sort();

assert.equal(designIds.length, sortedUnique(designIds).length, 'design decision IDs must be unique');
assert.equal(ledgerIds.length, sortedUnique(ledgerIds).length, 'ledger decision IDs must be unique');
assert.deepEqual(sortedUnique(ledgerIds), sortedUnique(designIds), 'ledger must contain every accepted decision exactly once');
assert.equal(ledger.schemaVersion, 'pipeline-test-gate-decision-ledger.v1');
assert.equal(ledger.decisionSource, designPath);
assert.equal(ledger.implementationPlan, planPath);

const allowedStates = new Set(['planned', 'implemented', 'proved', 'deferred', 'superseded']);
for (const [id, entry] of Object.entries(ledger.decisions)) {
  assert.equal(typeof entry.phase, 'string', `${id} phase must be a string`);
  assert.notEqual(entry.phase.trim(), '', `${id} phase must not be empty`);
  assert.equal(allowedStates.has(entry.state), true, `${id} state is invalid`);
  assert.equal(Array.isArray(entry.targets), true, `${id} targets must be an array`);
  assert.equal(Array.isArray(entry.proof), true, `${id} proof must be an array`);
  if (entry.state === 'proved') {
    assert.equal(entry.targets.length > 0, true, `${id} proved state requires targets`);
    assert.equal(entry.proof.length > 0, true, `${id} proved state requires proof`);
  }
  if (entry.state === 'deferred') {
    assert.match(entry.phase, /^later-/u, `${id} deferred phase must start with later-`);
  }
}

const parityIds = [...baseline.matchAll(/^- `(UNIT-[A-Z]+-[0-9]{3}[A-Z]?)`:/gmu)].map((match) => match[1]);
assert.equal(parityIds.length > 0, true, 'unit baseline must contain parity IDs');
assert.equal(parityIds.length, sortedUnique(parityIds).length, 'unit parity IDs must be unique');
assert.equal(parityIds.length, 93, 'unit parity baseline count is fixed for the unit migration');
assert.deepEqual(sortedUnique(Object.keys(unitParityLedger.entries)), sortedUnique(parityIds),
  'Phase 9 parity ledger must exactly match the baseline');
assert.equal(Object.values(unitParityLedger.entries).every((entry) => entry.status === 'proved'), true,
  'Phase 9 requires every parity entry to be proved');
assert.match(plan, /### Phase 1: Record the Unit Baseline/u);
assert.match(plan, /Status: complete/u);
assert.match(baseline, /Status: Phase 1 complete/u);

for (const heading of [
  '## Terms in plain language',
  '## Documentation quality gate',
  '## Sequential workflow',
  '## Reusable closeout checklist',
]) assert.match(migrationPlaybook, new RegExp(heading, 'u'), `migration playbook must contain ${heading}`);

for (const heading of [
  '## Plain-language overview',
  '## The command model',
  '## Configuration contract',
  '## Fixed result precedence',
  '## Alternatives considered',
  '## Subphases',
  '## Verification plan',
  '## Explicit Phase 8 scope boundary',
]) assert.match(phase8Plan, new RegExp(heading, 'u'), `Phase 8 plan must contain ${heading}`);

for (const id of ['D-114', 'D-115', 'D-116', 'D-117', 'D-118', 'D-119']) {
  assert.match(phase8Plan, new RegExp(`^- ${id} — [^\\n]+[.;]$`, 'mu'), `Phase 8 plan must map ${id}`);
}
for (const heading of ['## 9-A — Establish the parity authority', '## 9-B — Selection, input, configuration, and isolation',
  '## 9-C — Execution, results, evidence, and recovery', '## 9-D — Structured-report improvements and defect removal',
  '## 9-E — Controlled comparison', '## 9-F — Contained vertical proof and closeout']) {
  assert.equal(phase9Plan.includes(heading), true, `Phase 9 plan must contain ${heading}`);
}
for (const heading of ['## 10-A — Lock the cutover inventory', '## 10-B — Activate the replacement',
  '## 10-C — Enforce one authority', '## 10-D — Move configuration and examples',
  '## 10-E — Remove unit from the legacy runtime', '## 10-F — Delete the old unit implementation',
  '## 10-G — Prove deletion', '## 10-H — Run the sole-path contained proof',
  '## 10-I — Documentation closeout', '## 10-J — Final audit and promotion']) {
  assert.equal(phase10Plan.includes(heading), true, `Phase 10 plan must contain ${heading}`);
}
assert.equal(phase10Inventory.parityItemCount, 93);
assert.equal(unitParityLedger.cutover?.status, 'complete');
assert.equal(unitParityLedger.cutover?.authority, 'replacement-only');
assert.match(phase10Audit, /Status: complete/u);
assert.equal(manifestBaseline.expectedItemCount, 28);
assert.equal(manifestBaseline.items.length, manifestBaseline.expectedItemCount);
assert.equal(new Set(manifestBaseline.items.map((item) => item.id)).size, manifestBaseline.expectedItemCount);
assert.equal(manifestBaseline.items.every((item) => item.state === 'parity-proved'), true,
  'manifest baseline must record completed parity proof');
assert.deepEqual(sortedUnique(Object.keys(manifestParityLedger.entries)), sortedUnique(manifestBaseline.items.map((item) => item.id)),
  'manifest parity ledger must exactly match the baseline');
assert.equal(Object.values(manifestParityLedger.entries).every((entry) => entry.status === 'proved'), true,
  'manifest parity requires every entry to be proved');
assert.deepEqual(manifestParityLedger.authority, { old: 'deleted', replacement: 'authoritative' });
assert.equal(manifestParityLedger.cutover?.status, 'complete');
assert.equal(manifestParityLedger.cutover?.authority, 'replacement-only');
for (const heading of ['## 8-A — Audit and lock scope', '## 8-B — Lock contracts', '## 8-C — Implement schema checks',
  '## 8-D — Implement policy checks', '## 8-E — Integrate lint reports', '## 8-F — Prove and close implementation']) {
  assert.equal(manifestPlan.includes(heading), true, `manifest implementation plan must contain ${heading}`);
}
assert.match(manifestAudit, /historical implementation audit; parity and cutover are complete/u);
for (const heading of ['### 9-A — Parity authority', '### 9-B — Shared fixtures',
  '### 9-C — Input, YAML, schema, security, and scope parity',
  '### 9-D — Policy, defect, location, and evidence parity',
  '### 9-E — Controlled comparison', '### 9-F — Contained vertical proof']) {
  assert.equal(manifestParityPlan.includes(heading), true, `manifest parity plan must contain ${heading}`);
}
assert.match(manifestParityReport, /Total parity items: 28/u);
assert.match(manifestComparison, /old Buster `manifest` suite is authoritative/u);
assert.match(manifestParityAudit, /historical parity audit; cutover and legacy deletion are complete/u);
assert.equal(manifestCutoverInventory.parityItemCount, 28);
assert.match(manifestCutoverPlan, /Status: complete/u);
assert.match(manifestCutoverAudit, /Nova lint is the only static Kubernetes validation authority/u);

const unitNewOwnership = {
  'UNIT-NEW-001': '8-D',
  'UNIT-NEW-002': '8-D',
  'UNIT-NEW-003': '8-B',
  'UNIT-NEW-004': '8-C',
  'UNIT-NEW-005': '8-D',
  'UNIT-NEW-006': '8-D',
  'UNIT-NEW-007': 'shared foundation exercised in 8-B/8-D/8-F',
  'UNIT-NEW-008': 'shared foundation exercised in 8-B/8-D/8-F',
  'UNIT-NEW-009': '8-B and 8-C',
  'UNIT-NEW-010': 'shared resolver exercised in 8-D/8-F',
  'UNIT-NEW-011': 'shared foundation exercised in 8-B/8-D/8-F',
  'UNIT-NEW-012': '8-E',
  'UNIT-NEW-013': '8-C',
  'UNIT-NEW-014': '8-C',
  'UNIT-NEW-015': '8-C',
};
for (const [id, owner] of Object.entries(unitNewOwnership)) {
  assert.equal(phase8Plan.includes(`- \`${id}\`: ${owner}.`), true, `Phase 8 plan must assign ${id} to ${owner}`);
}

console.log(JSON.stringify({
  ok: true,
  decisions: designIds.length,
  unitParityItems: parityIds.length,
  migrationPlaybook: migrationPlaybookPath,
  phase8Plan: phase8PlanPath,
  phase9Plan: phase9PlanPath,
  phase10Plan: phase10PlanPath,
  phase10Inventory: phase10InventoryPath,
  phase10Audit: phase10AuditPath,
  unitParityLedger: unitParityLedgerPath,
  manifestBaselineItems: manifestBaseline.expectedItemCount,
  manifestPlan: manifestPlanPath,
  manifestAudit: manifestAuditPath,
  manifestParityLedger: manifestParityLedgerPath,
  manifestParityAudit: manifestParityAuditPath,
  ledger: ledgerPath,
}));
