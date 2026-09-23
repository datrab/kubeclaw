#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const root = process.cwd();
const registry = JSON.parse(fs.readFileSync('scripts/docs-local-helm-field-authorities.json', 'utf8'));
const booleanAuthorities = Object.entries(registry.files).flatMap(([sourcePath, file]) =>
  Object.entries(file.fields)
    .filter(([, field]) => field.booleanInputSemantics)
    .map(([fieldPath, field]) => ({ sourcePath, fieldPath, ...field })));

assert.equal(booleanAuthorities.length, 93, 'local Helm Boolean authority coverage changed');
for (const field of booleanAuthorities) {
  const label = `${field.sourcePath}#${field.fieldPath}`;
  assert.match(field.failure, /YAML Boolean|schema validation|template comparison|type guard/u,
    `${label}: invalid-type behavior is not explicit`);
  assert.match(field.emptyBehavior, /omitted override/u, `${label}: omission behavior is not explicit`);
  if (field.booleanInputSemantics.receivers.includes('helm-truthiness')
    && field.booleanInputSemantics.validation !== 'chart-schema-boolean') {
    assert.match(field.failure, /non-empty string/u, `${label}: Helm string truthiness is not documented`);
    assert.match(field.failure, /`"false"`/u, `${label}: quoted false hazard is not documented`);
  }
}

for (const [sourcePath, fieldPath, expected] of [
  ['charts/kubeclaw/values.yaml', '$.archviewer.enabled', 'receiver-specific-without-schema'],
  ['charts/prism/values.yaml', '$.control.productDecisions.enabled', 'chart-schema-boolean'],
  ['my-values/prism-values.yaml', '$.workerTrust.spiffe.enabled', 'chart-schema-boolean'],
]) {
  assert.equal(registry.files[sourcePath]?.fields[fieldPath]?.booleanInputSemantics?.validation, expected,
    `${sourcePath}#${fieldPath}: unexpected Boolean validation authority`);
}

const render = (...values) => spawnSync('helm', [
  'template', 'acceptance', 'charts/kubeclaw',
  '--set', 'agentRole=nova',
  '--set', 'archviewer.existingSecret=acceptance-secret',
  ...values,
], { cwd: root, encoding: 'utf8' });
const booleanFalse = render('--set', 'archviewer.enabled=false');
assert.equal(booleanFalse.status, 0, `Boolean false render failed\n${booleanFalse.stderr}`);
assert.doesNotMatch(booleanFalse.stdout, /agent-nova-archviewer/u,
  'Boolean false unexpectedly rendered Archviewer resources');

const stringFalse = render('--set-string', 'archviewer.enabled=false');
assert.equal(stringFalse.status, 0, `string false render failed\n${stringFalse.stderr}`);
assert.match(stringFalse.stdout, /agent-nova-archviewer/u,
  'quoted false no longer demonstrates the documented Helm truthiness hazard');

const strictStringFalse = spawnSync('helm', [
  'template', 'acceptance', 'charts/kubeclaw',
  '--set', 'agentRole=nova',
  '--set-string', 'runAsRoot=false',
], { cwd: root, encoding: 'utf8' });
assert.notEqual(strictStringFalse.status, 0, 'string false unexpectedly passed the strict runAsRoot ternary receiver');
assert.match(`${strictStringFalse.stdout}\n${strictStringFalse.stderr}`, /expected bool; got string/u,
  'strict runAsRoot failure did not prove the Boolean receiver contract');

const runAsRoot = registry.files['charts/kubeclaw/values.yaml'].fields['$.runAsRoot'];
assert.deepEqual(runAsRoot.booleanInputSemantics.receivers,
  ['helm-truthiness', 'quoted-runtime-string', 'strict-boolean-function'],
  'mixed runAsRoot receiver semantics were flattened');

console.log(`local Helm Boolean semantics verified (${booleanAuthorities.length} authorities; truthiness and strict-function render controls passed)`);
