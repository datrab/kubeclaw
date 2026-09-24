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

const serviceAccountAuthorities = booleanAuthorities.filter((field) => field.fieldPath === '$.serviceAccount.create');
assert.equal(serviceAccountAuthorities.length, 5, 'serviceAccount.create authority coverage changed');
for (const field of serviceAccountAuthorities) {
  assert.match(field.acceptedValues, /namespace default ServiceAccount/u,
    `${field.sourcePath}: serviceAccount.create=false does not explain the selected identity`);
  assert.match(field.failure, /ordinary workload can start/u,
    `${field.sourcePath}: serviceAccount.create=false incorrectly implies unconditional startup failure`);
  assert.match(field.failure, /SPIFFE worker trust or the Nova readiness client/u,
    `${field.sourcePath}: conditional release-ServiceAccount requirements are missing`);
}

const defaultServiceAccount = spawnSync('helm', [
  'template', 'acceptance', 'charts/kubeclaw',
  '--set', 'agentRole=nova',
  '--set', 'serviceAccount.create=false',
  '--set', 'workerTrust.spiffe.enabled=false',
  '--set', 'busterNamespaceBroker.readyClient.enabled=false',
], { cwd: root, encoding: 'utf8' });
assert.equal(defaultServiceAccount.status, 0,
  `serviceAccount.create=false ordinary render failed\n${defaultServiceAccount.stderr}`);
assert.doesNotMatch(defaultServiceAccount.stdout, /^kind: ServiceAccount$/mu,
  'serviceAccount.create=false unexpectedly rendered a ServiceAccount');
assert.doesNotMatch(defaultServiceAccount.stdout, /^\s*serviceAccountName:/mu,
  'serviceAccount.create=false unexpectedly selected a named ServiceAccount');
assert.match(defaultServiceAccount.stdout, /^\s*automountServiceAccountToken: false$/mu,
  'serviceAccount.create=false did not disable automatic token mounting');

const requiredReleaseServiceAccount = spawnSync('helm', [
  'template', 'acceptance', 'charts/kubeclaw',
  '--set', 'agentRole=nova',
  '--set', 'serviceAccount.create=false',
  '--set', 'workerTrust.spiffe.enabled=true',
], { cwd: root, encoding: 'utf8' });
assert.notEqual(requiredReleaseServiceAccount.status, 0,
  'SPIFFE worker trust unexpectedly rendered without the release-specific ServiceAccount');
assert.match(`${requiredReleaseServiceAccount.stdout}\n${requiredReleaseServiceAccount.stderr}`,
  /workerTrust\.spiffe requires serviceAccount\.create=true/u,
  'SPIFFE failure did not prove the conditional release-ServiceAccount requirement');

const behavioralContracts = [
  ['$.serviceAccount.automount', 5, /ignored.*forces automatic token mounting off|has no effect/iu],
  ['$.busterNamespaceBroker.enabled', 4, /agentRole=buster|non-Buster release/iu],
  ['$.busterNamespaceBroker.controller.readiness.enabled', 1, /Outside that parent and role path.*no rendered effect/iu],
  ['$.busterNamespaceBroker.controller.productDecisions.enabled', 1, /Outside that parent and role path.*no rendered effect/iu],
  ['$.busterNamespaceBroker.leaseClient.enabled', 2, /cannot disable lease-client RBAC|ignores `false`/iu],
  ['$.busterNamespaceBroker.leaseClient.verificationRead.enabled', 2, /parent broker.*effective lease client.*ServiceAccount/iu],
  ['$.codeBundle.enabled', 4, /environment entry.*rendered in both cases|without adding or removing a Deployment resource branch/iu],
  ['$.probes.dependencies.gateway.enabled', 1, /skips that check|without proving that dependency/iu],
  ['$.probes.dependencies.litellm.enabled', 1, /skips that check|without proving that dependency/iu],
  ['$.probes.dependencies.redis.enabled', 2, /skips that check|without proving that dependency/iu],
  ['$.probes.dependencies.redisStream.enabled', 1, /skips that check|without proving that dependency/iu],
  ['$.probes.dependencies.registries.enabled', 2, /skips that check|without proving that dependency/iu],
  ['$.probes.liveness.enabled', 1, /does not restart the container/iu],
  ['$.probes.readiness.enabled', 1, /become Ready without/iu],
  ['$.probes.startup.enabled', 1, /slow startup is exposed/iu],
  ['$.persistence.config.enabled', 1, /emptyDir.*lost when the Pod is replaced/isu],
  ['$.persistence.workspace.enabled', 1, /emptyDir.*lost when the Pod is replaced/isu],
  ['$.networkPolicy.enabled', 1, /workload remains present.*loses.*restrictions/isu],
  ['$.networkPolicy.cilium', 1, /both the portable NetworkPolicy and an additional CiliumNetworkPolicy/iu],
  ['$.workspace.enabled', 6, /does not remove the `\/workspace` volume|volume, mount, and runtime directories remain/iu],
  ['$.workspace.overrideOnRestart', 2, /workspace\.enabled=false.*no managed seed files|no effect when workspace seeding is disabled/iu],
];
for (const [fieldPath, count, proof] of behavioralContracts) {
  const authorities = booleanAuthorities.filter((field) => field.fieldPath === fieldPath);
  assert.equal(authorities.length, count, `${fieldPath}: behavioral authority coverage changed`);
  for (const field of authorities) {
    const prose = `${field.purpose} ${field.acceptedValues} ${field.impact} ${field.failure}`;
    assert.match(prose, proof, `${field.sourcePath}#${fieldPath}: source-specific behavior proof is missing`);
    assert.doesNotMatch(prose, /Disabling a required dependency makes its consumers unready/iu,
      `${field.sourcePath}#${fieldPath}: generic enabled-field failure text returned`);
  }
}

const automountIgnoredTrue = render('--set', 'serviceAccount.create=false', '--set', 'serviceAccount.automount=true');
const automountIgnoredFalse = render('--set', 'serviceAccount.create=false', '--set', 'serviceAccount.automount=false');
assert.equal(automountIgnoredTrue.status, 0, automountIgnoredTrue.stderr);
assert.equal(automountIgnoredFalse.status, 0, automountIgnoredFalse.stderr);
assert.equal(automountIgnoredTrue.stdout, automountIgnoredFalse.stdout,
  'serviceAccount.automount changed output while serviceAccount.create=false');

const busterLeaseFalse = spawnSync('helm', [
  'template', 'acceptance', 'charts/kubeclaw', '-f', 'my-values/buster-values.yaml',
  '--set', 'busterNamespaceBroker.enabled=true', '--set', 'busterNamespaceBroker.leaseClient.enabled=false',
  '--set', 'runtimeInfrastructure.registry.endpoint=http://registry.local:5000',
  '--set', 'runtimeInfrastructure.registry.transport=http-lab',
], { cwd: root, encoding: 'utf8' });
assert.equal(busterLeaseFalse.status, 0, busterLeaseFalse.stderr);
assert.match(busterLeaseFalse.stdout, /name: agent-buster-namespace-lease-client/u,
  'Buster role no longer force-enables lease-client RBAC');

console.log(`local Helm Boolean semantics verified (${booleanAuthorities.length} authorities; truthiness and strict-function render controls passed)`);
