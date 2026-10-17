#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const check = spawnSync(process.execPath, ['scripts/docs-configuration-inventory.mjs', '--check'], {
  cwd: root,
  encoding: 'utf8',
});
if (check.status !== 0) {
  console.error('DOC_DRIFT_CLI: CLI and script-flag documentation inventory is stale.');
  process.stdout.write(check.stdout);
  process.stderr.write(check.stderr);
  process.exit(check.status ?? 1);
}

const inventoryPath = path.join(root, 'docs/generated/inventory/configuration-runtime-inputs.json');
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
assert.ok(inventory.cliFlags.length > 0, 'owned CLI/script flag inventory is empty');
const identities = new Set();
for (const flag of inventory.cliFlags) {
  assert.match(flag.name, /^(?:--[a-z][a-z0-9-]*|-[A-Za-z])$/, `invalid flag name: ${flag.name}`);
  assert.ok(['scripts/', 'my-values/', 'charts/', 'gitops/', 'skills/', 'docker/', 'ops/', 'tools/', 'cmd/', 'packaging/'].some((prefix) => flag.path.startsWith(prefix)), `flag is outside the registered runtime boundary: ${flag.path}`);
  assert.ok(Number.isInteger(flag.line) && flag.line > 0, `flag has no source line: ${flag.name}`);
  const identity = `${flag.path}:${flag.line}:${flag.name}`;
  assert.equal(identities.has(identity), false, `duplicate flag fact: ${identity}`);
  identities.add(identity);
  assert.equal(flag.classification, 'definition', `${identity}: external-command invocation leaked into the owned CLI inventory`);
  assert.ok(['operator-runtime', 'maintainer-verification', 'internal-or-invocation', 'documentation-internal'].includes(flag.surface), `${identity}: flag lacks surface taxonomy`);
  assert.ok(flag.valueTaking === null || typeof flag.valueTaking === 'boolean', `${identity}: flag has invalid value-taking semantics`);
  assert.ok(flag.ownerComponent && flag.runtimeOwner && flag.consumers.length > 0, `${identity}: flag lacks owner or consumer`);
  assert.ok(flag.precedence.length > 0 && flag.changeImpact && flag.failureMeaning, `${identity}: flag lacks operational semantics`);
  assert.ok(flag.unknownOptionBehavior && flag.duplicateOptionBehavior, `${identity}: flag lacks parser-specific unknown/duplicate semantics`);
  assert.ok(['authored-documentation', 'missing-authored-documentation', 'not-required-in-operator-handbook', 'not-applicable-invocation'].includes(flag.documentationStatus), `${identity}: flag lacks documentation status`);
}
const definitions = inventory.cliFlags.filter((flag) => flag.classification === 'definition');
assert.equal(definitions.length, inventory.cliFlags.length, 'the CLI inventory must contain owned definitions only');
const shortHelp = definitions.find((flag) => flag.path === 'skills/nova/project_setup/tools/progress-scaffold.ts' && flag.name === '-h');
assert.equal(shortHelp?.aliasFor, '--help', 'public -h alias was not discovered and bound to --help');
const undocumentedPublicDefinitions = definitions.filter((flag) => flag.surface === 'operator-runtime' && flag.documentationStatus !== 'authored-documentation');
assert.deepEqual(undocumentedPublicDefinitions.map((flag) => `${flag.path}:${flag.name}`), [],
  `operator-runtime definitions lack authored documentation: ${undocumentedPublicDefinitions.map((flag) => `${flag.path}:${flag.name}`).join(', ')}`);
assert.equal(definitions.find((flag) => flag.path === 'scripts/docs-configuration-inventory.mjs' && flag.name === '--check')?.surface,
  'documentation-internal', 'documentation tooling leaked into the published CLI surface');
assert.equal(inventory.cliFlags.some((flag) => flag.path === 'scripts/check-configuration-drift-mutations.mjs'), false,
  'mutation-suite assertion or fixture strings became CLI facts');
assert.equal(inventory.cliFlags.some((flag) => flag.path === 'scripts/repair-k3s-reservation-arguments.py' && flag.name === '--kubelet-arg'), false,
  'a comparison against another program\'s stored argument became an owned CLI definition');
assert.ok(definitions.length > 0, 'no CLI definitions survived invocation filtering');
assert.equal(new Set(definitions.map((flag) => `${flag.path}:${flag.name}`)).size, definitions.length, 'CLI definitions are not unique by owner and name');
const expectedValueSemantics = [
  ['skills/nova/project_setup/tools/progress-scaffold.ts', '--apply', false],
];
for (const [sourcePath, name, expected] of expectedValueSemantics) {
  const fact = inventory.cliFlags.find((item) => item.path === sourcePath && item.name === name);
  assert.ok(fact, `${sourcePath}:${name}: representative CLI fact is missing`);
  assert.equal(fact.valueTaking, expected, `${sourcePath}:${name}: value-taking semantics drifted`);
}
const expectedStructuredDefinitions = [
  ['skills/nova/project/cli.ts', '--project', true, 'required', '<none>'],
  ['skills/nova/project/cli.ts', '--platform', true, 'required', '<none>'],
  ['skills/nova/project/cli.ts', '--compile', true, 'conditional', '<none>'],
  ['skills/nova/project/cli.ts', '--recover', true, 'conditional', '<none>'],
  ['skills/nova/project/cli.ts', '--signal', true, 'conditional', '<none>'],
  ['scripts/check-runtime-role-manifests.mjs', '--additional-plugin', true, 'conditional', '<none>'],
  ['scripts/check-runtime-role-manifests.mjs', '--role-addition', true, 'conditional', '<none>'],
  ['scripts/lint-baseline-prune.mjs', '--report', true, 'required', '<none>'],
  ['scripts/lint-baseline-prune.mjs', '--baseline', true, 'required', '<none>'],
  ['scripts/lint-baseline-prune.mjs', '--write', false, 'conditional', 'false/not selected'],
  ['scripts/pipeline-light-watchdog.sh', '--status-file', true, 'required', '<none>'],
  ['scripts/pipeline-light-watchdog.sh', '--run-pid', true, 'required', '<none>'],
  ['scripts/pipeline-light-watchdog.sh', '--log-file', true, 'required', '<none>'],
  ['scripts/pipeline-light-watchdog.sh', '--notify-command', true, 'conditional', ''],
  ['scripts/pipeline-light-watchdog.sh', '--poll-seconds', true, 'conditional', 'PIPELINE_LIGHT_WATCHDOG_POLL_SECONDS when non-empty, otherwise 15'],
  ['scripts/pipeline-light-watchdog.sh', '--heartbeat-seconds', true, 'conditional', 'PIPELINE_LIGHT_WATCHDOG_HEARTBEAT_SECONDS when non-empty, otherwise 300'],
  ['skills/nova/project_setup/tools/progress-scaffold.ts', '--project', true, 'alternative-required', '<none>'],
  ['skills/nova/project_setup/tools/progress-scaffold.ts', '--swarm', true, 'alternative-required', '<none>'],
  ['skills/nova/project_setup/tools/progress-scaffold.ts', '--repo', true, 'conditional', 'nearest parent containing .git'],
  ['skills/nova/project_setup/tools/progress-scaffold.ts', '--scaffold', true, 'conditional', '<selected .swarm directory>/progress.scaffold.json'],
];
for (const [sourcePath, name, valueTaking, required, defaultValue] of expectedStructuredDefinitions) {
  const fact = inventory.cliFlags.find((item) => item.path === sourcePath && item.name === name);
  assert.ok(fact, `${sourcePath}:${name}: structured parser definition is missing`);
  assert.equal(fact.classification, 'definition', `${sourcePath}:${name}: structured parser was mistaken for an invocation`);
  assert.equal(fact.valueTaking, valueTaking, `${sourcePath}:${name}: structured arity drifted`);
  assert.equal(fact.required, required, `${sourcePath}:${name}: required semantics drifted`);
  assert.equal(fact.default, defaultValue, `${sourcePath}:${name}: default semantics drifted`);
}
for (const sourcePath of ['skills/nova/core/cli.ts', 'skills/nova/core/test-gates/remote-gate-cli.ts']) {
  const facts = definitions.filter((item) => item.path === sourcePath);
  assert.ok(facts.length > 0, `${sourcePath}: dynamic paired parser definitions are missing`);
  assert.ok(facts.every((item) => /accepted and ignored/u.test(item.unknownOptionBehavior)), `${sourcePath}: arbitrary paired options were falsely described as rejected`);
  assert.ok(facts.every((item) => /last value/u.test(item.duplicateOptionBehavior)), `${sourcePath}: last-duplicate-wins behavior is missing`);
  assert.ok(facts.every((item) => !/^Unknown, missing-value/u.test(item.failureMeaning)), `${sourcePath}: generic unknown-option failure claim remains`);
}
for (const name of ['--import-legacy', '--authoring', '--platform', '--output']) {
  const fact = definitions.find((item) => item.path === 'skills/nova/project/legacy-import-cli.ts' && item.name === name);
  assert.match(fact?.requiredReason ?? '', /Object\.keys\(args\)\.length !== 4/u, `${name}: legacy import requiredness is not tied to the four-key rejection`);
}
const busterConfigDoc = definitions.find((item) => item.path === 'skills/buster/engine/remote-plan-cli.ts' && item.name === '--config');
const novaConfigDoc = definitions.find((item) => item.path === 'skills/nova/core/test-gates/remote-gate-cli.ts' && item.name === '--config');
assert.notEqual(busterConfigDoc?.documentationAuthority, novaConfigDoc?.documentationAuthority, '--config documentation collided across Buster and Nova commands');
assert.ok(Number(busterConfigDoc?.documentationAuthority?.match(/:(\d+)$/u)?.[1]) < 182, 'Buster --config bound to the Nova command section');
assert.ok(Number(novaConfigDoc?.documentationAuthority?.match(/:(\d+)$/u)?.[1]) >= 182, 'Nova --config bound to the Buster command section');
for (const [sourcePath, name] of [
  ['scripts/deploy.sh', '--namespace'],
  ['charts/prism/templates/postgresql.yaml', '--set'],
  ['scripts/pipeline-light-openclaw-notify.sh', '--account'],
  ['scripts/pipeline-light-openclaw-notify.sh', '--agent'],
  ['scripts/pipeline-light-openclaw-notify.sh', '--channel'],
  ['scripts/pipeline-light-openclaw-notify.sh', '--json'],
  ['docker/buster-runtime-entrypoint.sh', '--addr'],
]) {
  const fact = inventory.cliFlags.find((item) => item.path === sourcePath && item.name === name);
  assert.equal(fact, undefined, `${sourcePath}:${name}: external-command flag was mistaken for an owned KubeClaw definition`);
}
for (const item of inventory.derivedValues) {
  assert.ok(['analyzed', 'unsupported'].includes(item.analysisStatus), `${item.path}:${item.line}:${item.name}: derived value lacks analysis status`);
  if (item.analysisStatus === 'unsupported') {
    assert.equal(item.formula, '<unsupported shell syntax; inspect source>', `${item.path}:${item.line}:${item.name}: unsupported syntax published an inferred formula`);
    assert.ok(item.unsupportedReason, `${item.path}:${item.line}:${item.name}: unsupported syntax lacks its reason`);
  }
}
const positionalMode = inventory.derivedValues.find((item) => item.path === 'scripts/deploy-cilium.sh' && item.name === 'MODE');
assert.ok(positionalMode?.inputs.includes('shell positional $1'), 'derived ${1:-default} did not retain its positional input');
const scriptDirectory = inventory.derivedValues.find((item) => item.path === 'scripts/deploy.sh' && item.name === 'SCRIPT_DIR');
assert.ok(scriptDirectory?.formula.includes('$(dirname "${BASH_SOURCE[0]}")'), 'nested command-substitution formula was truncated');
assert.ok(scriptDirectory?.inputs.includes('BASH_SOURCE'), 'nested command-substitution input was lost');
const browserCgroup = inventory.derivedValues.find((item) => item.path === 'docker/buster-runtime-entrypoint.sh' && item.name === 'BUSTER_BROWSER_PLAYWRIGHT_CGROUP_ROOT');
assert.ok(browserCgroup?.consumers.some((item) => item.kind === 'child-process-environment-edge'),
  'child-command environment prefix was classified as an unused assignment');
const notificationMessage = inventory.derivedValues.find((item) => item.path === 'scripts/pipeline-light-watchdog.sh' && item.name === 'PIPELINE_LIGHT_MESSAGE');
assert.ok(notificationMessage?.consumers.some((item) => item.kind === 'child-process-environment-edge'),
  'multiline notifier environment prefix lacks its child-process edge');
const exportedToken = inventory.derivedValues.find((item) => item.path === 'ops/pod/shell.sh' && item.name === 'KUBECLAW_MCP_TOKEN');
assert.ok(exportedToken?.consumers.some((item) => item.kind === 'exported-child-process-environment-edge'),
  'a separately exported derived token lacks its child-process edge');
const namespaceAssignments = inventory.derivedValues.filter((item) => item.path === 'scripts/deploy.sh' && item.name === 'NAMESPACE'
  && [683, 719].includes(item.line));
assert.equal(namespaceAssignments.length, 2, 'workspace namespace branch assignments were not both inventoried');
for (const assignment of namespaceAssignments) {
  assert.ok(assignment.consumers.some((item) => item.kind === 'shell-global-conditional-return-edge'),
    `NAMESPACE:${assignment.line}: assignment lacks its conditional function-return edge`);
  assert.ok(assignment.consumers.some((item) => item.kind === 'shell-global-conditional-post-call-use'),
    `NAMESPACE:${assignment.line}: assignment lacks an actual post-call use`);
  assert.equal(assignment.consumers.some((item) => item.kind === 'shell-global-derived-value-use'), false,
    `NAMESPACE:${assignment.line}: legacy whole-file flow overclaim remains`);
  assert.ok(assignment.consumers.length <= 10,
    `NAMESPACE:${assignment.line}: conditional flow fan-out is implausibly broad (${assignment.consumers.length})`);
}

const publishedCli = fs.readFileSync(path.join(root, 'docs/site/reference/cli.md'), 'utf8');
const publishedFlagRows = publishedCli.split('\n').filter((line) => line.startsWith('| `--')).join('\n');
assert.doesNotMatch(publishedFlagRows, /scripts\/(?:ap0[89][^/\s`]*|docs-[^/\s`]*|check-configuration-drift-mutations\.mjs)/u,
  'internal AP08/AP09, docs-tooling, or mutation-runner flags leaked into the published CLI page');
for (const internal of inventory.cliFlags.filter((flag) => flag.surface === 'documentation-internal')) {
  assert.equal(publishedFlagRows.includes(`${internal.path}:`), false, `${internal.path}:${internal.name}: internal CLI definition was published`);
}
console.log(`CLI/script flag documentation inventory is current (${definitions.length} owned definitions; external-command invocations excluded).`);
