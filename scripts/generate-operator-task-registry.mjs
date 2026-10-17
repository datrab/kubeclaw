#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const implementationRoot = process.env.OPERATOR_TASK_IMPLEMENTATION_ROOT
  ? path.resolve(process.env.OPERATOR_TASK_IMPLEMENTATION_ROOT) : root;
const sourcePath = path.join(root, 'docs/operator-tasks.json');
const outputPath = path.join(root, 'docs/generated/inventory/operator-tasks.json');
const check = process.argv.includes('--check');

const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
assert.equal(source.schemaVersion, 'operator-task-registry-v1');
assert.ok(Array.isArray(source.tasks) && source.tasks.length > 0);
assert.equal(Object.hasOwn(source, 'generatedFrom'), false,
  'authored operator task source must not claim to be generated output');
const recoveryAuthorityPaths = [
  'skills/nova/project/recovery.ts',
  'skills/nova/project/delivery-manifest.ts',
];
function recoveryOutcomes(implementation, authority) {
  const outcomes = [];
  const thrownLiteral = /throw\s+new\s+Error\s*\(\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)\s*\)/gu;
  for (const match of implementation.matchAll(thrownLiteral)) {
    const finiteText = match[1] ?? match[2] ?? match[3] ?? '';
    const code = /^([A-Z][A-Z0-9_]+)/u.exec(finiteText)?.[1];
    if (code) outcomes.push({ code, implementationAuthority: authority });
  }
  return outcomes;
}
const discoveredRecoveryOutcomes = recoveryAuthorityPaths.flatMap((authority) => {
  const implementation = fs.readFileSync(path.join(implementationRoot, authority), 'utf8');
  return recoveryOutcomes(implementation, authority);
}).sort((left, right) => left.code.localeCompare(right.code));
const runControl = source.tasks.find((task) => task.taskId === 'run-control');
assert.ok(runControl, 'run-control task is required');
assert.ok(Array.isArray(runControl.recoveryOutcomes), 'run-control recoveryOutcomes inventory is required');
const authoredRecoveryOutcomes = [...runControl.recoveryOutcomes]
  .sort((left, right) => left.code.localeCompare(right.code));
assert.deepEqual(authoredRecoveryOutcomes.map(({ code, implementationAuthority }) => ({ code, implementationAuthority })),
  discoveredRecoveryOutcomes,
  'operator recovery outcome inventory differs from project recovery implementation');
const variantIds = new Set((runControl.variants ?? []).map((variant) => variant.variantId));
for (const outcome of authoredRecoveryOutcomes) {
  assert.ok(variantIds.has(outcome.variantId), `${outcome.code}: recovery variant is not registered`);
  assert.equal(outcome.documentation, 'docs/site/use/operate.md#recover-after-interruption',
    `${outcome.code}: recovery documentation authority is invalid`);
}
const generated = `${JSON.stringify({
  ...source,
  generatedFrom: 'docs/operator-tasks.json',
  recoveryOutcomeSources: recoveryAuthorityPaths,
}, null, 2)}\n`;

if (check) {
  assert.ok(fs.existsSync(outputPath), 'operator task registry is missing; run npm run docs:operator-tasks:generate');
  assert.equal(fs.readFileSync(outputPath, 'utf8'), generated,
    'operator task registry is stale; run npm run docs:operator-tasks:generate');
  console.log(`Operator task registry generation is current (${source.tasks.length} tasks).`);
} else {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, generated);
  console.log(`Generated ${path.relative(root, outputPath)} from ${path.relative(root, sourcePath)}.`);
}
