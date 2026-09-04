import fs from 'node:fs';

const [, , ledgerPath, targetPath] = process.argv;
if (!ledgerPath || !targetPath) throw new Error('usage: suite-parity-report.mjs <ledger.json> <report.md> [--check]');
const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
const entries = Object.entries(ledger.entries).sort(([left], [right]) => (
  left < right ? -1 : left > right ? 1 : 0
));
const count = (value) => entries.filter(([, entry]) => entry.disposition === value).length;
const lines = [
  `# ${ledger.title}`,
  '',
  `Generated from \`${ledgerPath}\`. Do not edit this report by hand.`,
  '',
  `Total parity items: ${entries.length}.`,
  '',
  `- Preserved: ${count('preserved')}`,
  `- Improved: ${count('improved')}`,
  `- Removed defects: ${count('removed-defect')}`,
  `- Deferred: ${count('deferred')}`,
  `- Blocked: ${count('blocked')}`,
  `- Authority: old path is ${ledger.authority.old}; replacement is ${ledger.authority.replacement}.`,
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
    console.error(`${targetPath} is stale; regenerate it with suite-parity-report.mjs`);
    process.exit(1);
  }
  console.log(`verified ${targetPath} (${entries.length} items)`);
} else {
  fs.writeFileSync(targetPath, output);
  console.log(`generated ${targetPath} (${entries.length} items)`);
}
