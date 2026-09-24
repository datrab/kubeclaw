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
const registryText = JSON.stringify(booleanAuthorities);
for (const forbidden of [
  'Disabling a required dependency makes its consumers unready',
  'can preserve, replace, reject, or reinterpret',
  'active and rendered',
]) {
  assert.doesNotMatch(registryText, new RegExp(forbidden, 'u'),
    `generic Boolean contract text returned: ${forbidden}`);
}
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
  ['$.serviceAccount.automount', 5, /renders `automountServiceAccountToken: false` on both.*Pod independently forces/isu],
  ['$.busterNamespaceBroker.enabled', 4, /agentRole=buster|non-Buster release/iu],
  ['$.busterNamespaceBroker.controller.readiness.enabled', 1, /Outside that parent and role path.*no rendered effect/iu],
  ['$.busterNamespaceBroker.controller.productDecisions.enabled', 1, /Outside that parent and role path.*no rendered effect/iu],
  ['$.busterNamespaceBroker.leaseClient.enabled', 2, /cannot disable lease-client RBAC|ignores `false`/iu],
  ['$.busterNamespaceBroker.leaseClient.verificationRead.enabled', 2, /parent broker.*effective lease client.*ServiceAccount/iu],
  ['$.codeBundle.enabled', 4, /environment entry.*rendered in both cases|without adding or removing a Deployment resource branch/iu],
  ['$.probes.dependencies.gateway.enabled', 1, /startup, readiness, and liveness.*gateway `\/health`/isu],
  ['$.probes.dependencies.litellm.enabled', 1, /startup probe.*LiteLLM `\/health`/isu],
  ['$.probes.dependencies.redis.enabled', 2, /startup and readiness.*`PING`.*`PONG`/isu],
  ['$.probes.dependencies.redisStream.enabled', 1, /startup probe.*mutating.*`XADD`/isu],
  ['$.probes.dependencies.registries.enabled', 2, /startup probe.*`\/v2\/`.*HTTP 401/isu],
  ['$.probes.liveness.enabled', 1, /does not restart the container/iu],
  ['$.probes.readiness.enabled', 1, /become Ready without/iu],
  ['$.probes.startup.enabled', 1, /slow startup is exposed/iu],
  ['$.persistence.config.enabled', 1, /emptyDir.*lost when the Pod is replaced/isu],
  ['$.persistence.workspace.enabled', 1, /emptyDir.*lost when the Pod is replaced/isu],
  ['$.networkPolicy.enabled', 1, /workload remains present.*loses.*restrictions/isu],
  ['$.networkPolicy.cilium', 1, /networkPolicy\.enabled=false.*neither policy renders/isu],
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

const sourceSpecificContracts = [
  ['$.agent.git.enabled', 6, /SSH Secret.*clones or reconciles.*workspace and `REPO_ROOT`/isu],
  ['$.archviewer.enabled', 2, /sidecar itself is supplied separately.*Kubernetes rejects the Pod/isu],
  ['$.busterNamespaceBroker.readyClient.enabled', 1, /not gated by `busterNamespaceBroker.enabled`/iu],
  ['$.busterRuntimePersistence.enabled', 2, /creates no claim.*pre-existing claim/isu],
  ['$.discord.enabled', 6, /raw JSON value blank.*`openclaw\.json` invalid/isu],
  ['$.gateway.startupDoctor.enabled', 3, /doctor --fix --non-interactive.*legacy state remains unmigrated/isu],
  ['$.workerTrust.spiffe.enabled', 4, /capabilities with `proxyPort`.*SPIFFE/isu],
];
for (const [fieldPath, count, proof] of sourceSpecificContracts) {
  const allAuthorities = booleanAuthorities.filter((field) => field.fieldPath === fieldPath
    && (field.sourcePath === 'charts/kubeclaw/values.yaml'
      || (field.sourcePath.startsWith('my-values/') && field.sourcePath !== 'my-values/prism-values.yaml')));
  const selected = fieldPath === '$.workerTrust.spiffe.enabled' ? allAuthorities :
    booleanAuthorities.filter((field) => field.fieldPath === fieldPath);
  assert.equal(selected.length, count, `${fieldPath}: source-specific authority coverage changed`);
  for (const field of selected) {
    assert.match(`${field.purpose} ${field.acceptedValues} ${field.emptyBehavior} ${field.impact} ${field.failure}`,
      proof, `${field.sourcePath}#${fieldPath}: exact operational contract is missing`);
  }
}

for (const [sourcePath, fieldPath, proof] of [
  ['charts/ops-pod/values.yaml', '$.tailscale.enabled', /main Ops workload present.*Kubernetes-local|non-Tailscale paths/isu],
  ['charts/prism/values.yaml', '$.control.productDecisions.enabled', /separate signing Secret.*operator allowlist/isu],
  ['charts/prism/values.yaml', '$.ingestion.enabled', /Deployment, Service, and dedicated NetworkPolicy.*still receives the ingestion URL/isu],
  ['my-values/prism-values.yaml', '$.ingestion.enabled', /Deployment, Service, and dedicated NetworkPolicy.*still receives the ingestion URL/isu],
  ['charts/prism/values.yaml', '$.postgresql.enabled', /migration, backup, and verification stack.*externally managed/isu],
  ['my-values/prism-values.yaml', '$.postgresql.enabled', /migration, backup, and verification stack.*externally managed/isu],
  ['charts/prism/values.yaml', '$.tailscale.enabled', /Studio cluster-internal.*Product decisions require/isu],
  ['my-values/prism-values.yaml', '$.tailscale.enabled', /Studio cluster-internal.*Product decisions require/isu],
  ['charts/prism/values.yaml', '$.workerTrust.spiffe.enabled', /control and worker Envoy sidecars.*direct port 8080/isu],
  ['my-values/prism-values.yaml', '$.workerTrust.spiffe.enabled', /control and worker Envoy sidecars.*direct port 8080/isu],
]) {
  const field = registry.files[sourcePath]?.fields[fieldPath];
  assert(field, `${sourcePath}#${fieldPath}: authority is missing`);
  assert.match(`${field.purpose} ${field.acceptedValues} ${field.impact} ${field.failure}`, proof,
    `${sourcePath}#${fieldPath}: exact platform contract is missing`);
}

for (const [fieldPath, count, emptyProof] of [
  ['$.codeBundle.enabled', 4, /`default false`.*both bundle environment variables/isu],
  ['$.discord.enabled', 6, /raw JSON value blank.*invalid/isu],
  ['$.probes.dependencies.gateway.enabled', 1, /call-site default of `true`/iu],
  ['$.probes.dependencies.redis.enabled', 2, /call-site default of `true`/iu],
  ['$.probes.dependencies.redisStream.enabled', 1, /call-site default of `true`/iu],
  ['$.probes.dependencies.litellm.enabled', 1, /call-site default of `false`/iu],
  ['$.probes.dependencies.registries.enabled', 2, /call-site default of `false`/iu],
  ['$.runAsRoot', 2, /strict `ternary` receivers reject.*agent\.git\.enabled=true/isu],
  ['$.serviceAccount.automount', 5, /`default false`.*Boolean value `false`/isu],
  ['$.swarmConfig.overrideOnRestart', 1, /`default false`.*runtime value `"false"`/isu],
  ['$.workspace.overrideOnRestart', 2, /`default false`.*runtime value `"false"`/isu],
]) {
  const fields = booleanAuthorities.filter((field) => field.fieldPath === fieldPath);
  assert.equal(fields.length, count, `${fieldPath}: empty-value authority coverage changed`);
  for (const field of fields) {
    assert.match(field.emptyBehavior, emptyProof,
      `${field.sourcePath}#${fieldPath}: exact empty-value behavior is missing`);
  }
}

for (const [sourcePath, fieldPath, emptyProof, behaviorProof] of [
  ['my-values/buster-values.yaml', '$.extraContainers[0].securityContext.allowPrivilegeEscalation', /absent or null.*runtime or admission default.*empty string is invalid/isu, /root supervisor.*privilege/isu],
  ['my-values/prism-agent-values.yaml', '$.extraContainers[0].securityContext.allowPrivilegeEscalation', /absent or null.*control unset.*empty string is invalid/isu, /UID 1000.*no added Linux capabilities/isu],
  ['my-values/buster-values.yaml', '$.extraContainers[0].securityContext.privileged', /absent or null.*non-privileged.*empty string is invalid/isu, /broad host-level device and kernel access/isu],
  ['my-values/buster-values.yaml', '$.extraContainers[0].securityContext.runAsNonRoot', /absent or null.*removes the kubelet.*empty string is invalid/isu, /conflicts.*`runAsUser: 0`/isu],
  ['my-values/prism-agent-values.yaml', '$.extraContainers[0].securityContext.readOnlyRootFilesystem', /absent or null.*writable root filesystem.*empty string is invalid/isu, /explicit writable volumes/isu],
  ['my-values/nova-values.yaml', '$.extraContainers[0].volumeMounts[0].readOnly', /absent or null.*default `false`.*empty string is invalid/isu, /Archviewer authentication Secret.*intrinsically read-only/isu],
  ['my-values/nova-values.yaml', '$.extraContainers[0].volumeMounts[1].readOnly', /absent or null.*default `false`.*empty string is invalid/isu, /workspace PVC `prism\/designs`/isu],
  ['my-values/buster-values.yaml', '$.extraContainers[0].volumeMounts[2].readOnly', /absent or null.*default `false`.*empty string is invalid/isu, /projected ServiceAccount token.*intrinsically read-only/isu],
]) {
  const field = registry.files[sourcePath]?.fields[fieldPath];
  assert(field, `${sourcePath}#${fieldPath}: structural Boolean authority is missing`);
  assert.match(field.emptyBehavior, emptyProof, `${sourcePath}#${fieldPath}: structural empty behavior is incomplete`);
  assert.match(`${field.purpose} ${field.acceptedValues} ${field.impact} ${field.failure}`, behaviorProof,
    `${sourcePath}#${fieldPath}: structural operational behavior is incomplete`);
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

const deploymentTemplate = fs.readFileSync('charts/kubeclaw/templates/deployment.yaml', 'utf8');
for (const [sourceExpression, documentedPaths] of [
  ["if (mode === 'liveness')", ['$.probes.dependencies.gateway.enabled']],
  ["enabled('KUBECLAW_HEALTH_CHECK_GATEWAY', true)", ['$.probes.dependencies.gateway.enabled']],
  ["enabled('KUBECLAW_HEALTH_CHECK_REDIS', true)", ['$.probes.dependencies.redis.enabled']],
  ["enabled('KUBECLAW_HEALTH_CHECK_REDIS_STREAM', true)", ['$.probes.dependencies.redisStream.enabled']],
  ["enabled('KUBECLAW_HEALTH_CHECK_LITELLM', false)", ['$.probes.dependencies.litellm.enabled']],
  ["enabled('KUBECLAW_HEALTH_CHECK_REGISTRIES', false)", ['$.probes.dependencies.registries.enabled']],
]) {
  assert.match(deploymentTemplate, new RegExp(sourceExpression.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'),
    `health implementation no longer contains ${sourceExpression}`);
  for (const fieldPath of documentedPaths) {
    assert(booleanAuthorities.some((field) => field.fieldPath === fieldPath),
      `${fieldPath}: dependency-switch documentation is missing`);
  }
}
assert.match(deploymentTemplate, /return \/\^\(1\|true\|yes\|on\)\$\/i\.test\(raw\)/u,
  'health Boolean parser no longer recognizes the documented true tokens');
assert.match(deploymentTemplate, /if \(raw === undefined \|\| raw === ''\) return defaultValue/u,
  'health Boolean parser no longer applies the documented empty-value default');

const renderOpsPolicy = (parent, child) => spawnSync('helm', [
  'template', 'acceptance', 'charts/ops-pod',
  '--set', 'codexImage=example.invalid/codex@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '--set', 'mcpImage=example.invalid/mcp@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  '--set', 'networkPolicy.apiServerCIDRs[0]=10.0.0.1/32',
  '--set', `networkPolicy.enabled=${parent}`,
  '--set', `networkPolicy.cilium=${child}`,
], { cwd: root, encoding: 'utf8' });

for (const [parent, child, portable, cilium] of [
  [false, false, false, false],
  [false, true, false, false],
  [true, false, true, false],
  [true, true, true, true],
]) {
  const result = renderOpsPolicy(parent, child);
  assert.equal(result.status, 0, `Ops policy truth-table render failed\n${result.stderr}`);
  assert.equal(/^kind: NetworkPolicy$/mu.test(result.stdout), portable,
    `networkPolicy.enabled=${parent}, cilium=${child}: portable policy result changed`);
  assert.equal(/^kind: CiliumNetworkPolicy$/mu.test(result.stdout), cilium,
    `networkPolicy.enabled=${parent}, cilium=${child}: Cilium policy result changed`);
}

console.log(`local Helm Boolean semantics verified (${booleanAuthorities.length} authorities; truthiness and strict-function render controls passed)`);
