#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'docs/architecture/pipeline-test-gate-suite-migration-status.json');
const target = path.join(root, 'docs/architecture/pipeline-test-gate-suite-migration-status.md');
const check = process.argv.includes('--check');
const status = JSON.parse(fs.readFileSync(source, 'utf8'));

const complete = (phase) => status.suites.filter((suite) => suite[phase] === 'complete').length;
const rows = status.suites.map((suite) => (
  `| \`${suite.id}\` | \`${suite.successor}\` | ${suite.implementation} | ${suite.parity} | ${suite.cutover} |`
));
const output = `# Test-Suite Migration Status

This page is generated from \`pipeline-test-gate-suite-migration-status.json\`.
Do not edit this page directly.

## Summary

- Replacement implemented: ${complete('implementation')} of ${status.totalLegacySuites}.
- Parity proved: ${complete('parity')} of ${status.totalLegacySuites}.
- Cut over and deleted: ${complete('cutover')} of ${status.totalLegacySuites}.

## Suites

| Old suite | Successor | Implementation | Parity | Cutover |
| --- | --- | --- | --- | --- |
${rows.join('\n')}
`;

if (check) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== output) {
    console.error('suite migration status is stale; run npm run migration:status:generate');
    process.exit(1);
  }
  console.log(`suite migration status is current (${status.suites.length} suites)`);
} else {
  fs.writeFileSync(target, output);
  console.log(`wrote ${path.relative(root, target)}`);
}
