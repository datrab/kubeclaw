import fs from 'node:fs';

const ledgerPath = 'docs/architecture/pipeline-test-gate-unit-parity-ledger.json';
const targetPath = 'docs/architecture/pipeline-test-gate-phase-9-parity-report.md';
const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
const entries = Object.entries(ledger.entries).sort(([left], [right]) => left.localeCompare(right));
const count = (field, value) => entries.filter(([, entry]) => entry[field] === value).length;
const lines = [
  '# Pipeline Test Gate Phase 9 Parity Report',
  '',
  'Generated from `pipeline-test-gate-unit-parity-ledger.json`. Do not edit this report by hand.',
  '',
  `Total parity items: ${entries.length}.`,
  '',
  `- Preserved: ${count('disposition', 'preserved')}`,
  `- Improved: ${count('disposition', 'improved')}`,
  `- Removed defects: ${count('disposition', 'removed-defect')}`,
  `- Deferred: ${count('disposition', 'deferred')}`,
  `- Blocked dispositions: ${count('disposition', 'blocked')}`,
  `- Proved: ${count('status', 'proved')}`,
  `- Planned: ${count('status', 'planned')}`,
  `- Blocked status: ${count('status', 'blocked')}`,
  '',
  '## Items',
  '',
  '| ID | Disposition | Status | Rationale | Proof |',
  '| --- | --- | --- | --- | --- |',
  ...entries.map(([id, entry]) => `| ${id} | ${entry.disposition} | ${entry.status} | ${entry.rationale.replaceAll('|', '\\|')} | ${entry.proof.map((item) => `\`${item}\``).join('<br>')} |`),
  '',
];
const output = lines.join('\n');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(targetPath) || fs.readFileSync(targetPath, 'utf8') !== output) {
    console.error(`${targetPath} is stale; run node scripts/pipeline-unit-parity-report.mjs`);
    process.exit(1);
  }
  console.log(`verified ${targetPath} (${entries.length} items)`);
} else {
  fs.writeFileSync(targetPath, output);
  console.log(`generated ${targetPath} (${entries.length} items)`);
}
