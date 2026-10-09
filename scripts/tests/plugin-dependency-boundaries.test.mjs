import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { pluginSourceClosure, pluginInvocationFacts, pluginCapabilityRoutes } from '../plugin-source-closure.mjs';
import { invocationDependencyBoundaries } from '../plugin-dependency-boundaries.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const facts = (entry, exported = 'activate') => pluginInvocationFacts(pluginSourceClosure(path.join(root, entry), root), exported);

test('qualifies the actual repository-reader local argv and the remote-plan snapshot argv', () => {
  for (const entry of ['skills/nova/plugins/repository-adapter/src/adapter.ts', 'skills/nova/plugins/remote-test-gate/src/adapter.ts']) {
    const boundary = invocationDependencyBoundaries(facts(entry), root);
    assert.deepEqual(boundary.diagnostics, []);
    assert.ok(boundary.records.some((item) => item.scope === 'local-command'));
  }
});

test('documents conditional Git remote ownership and the empty child environment', () => {
  const boundary = invocationDependencyBoundaries(facts('skills/common/plugins/git-workspace/src/adapter.ts'), root);
  assert.deepEqual(boundary.diagnostics, []);
  const record = boundary.records.find((item) => item.scope === 'remote-command');
  assert.match(record.endpoint, /origin.*repository Git configuration/u);
  assert.match(record.secret, /env: \{\}.*neither inherits process environment credentials nor resolves secrets.read/u);
  assert.match(record.check, /ready\(\).*proves no remote access/u);
});

test('host-selected commands and lint tools retain their actual authorization and target limits', () => {
  for (const entry of ['skills/common/plugins/command-runner/src/adapter.ts', 'skills/nova/plugins/lint/src/adapter.ts']) {
    const boundary = invocationDependencyBoundaries(facts(entry), root);
    assert.deepEqual(boundary.diagnostics, []);
    const record = boundary.records.find((item) => item.scope === 'selected-program');
    assert.ok(record);
    assert.match(record.endpoint, /operator|Policy/u);
    assert.ok(record.secret.length > 150 && record.check.length > 150);
  }
});

test('locked tokenizer interfaces receive local library scope, never a fabricated remote target', () => {
  for (const entry of ['skills/common/plugins/runtime-dispatch/src/openclaw-adapter.ts', 'skills/nova/plugins/review/src/repository-audit-stage.ts']) {
    const boundary = invocationDependencyBoundaries(facts(entry, entry.endsWith('repository-audit-stage.ts') ? 'executeRepositoryAudit' : 'activate'), root);
    assert.deepEqual(boundary.diagnostics, []);
    assert.ok(boundary.records.some((item) => item.scope === 'local-library'));
  }
});

test('host-supplied OpenClaw SDKs retain their exact subscription owner and positive checks', () => {
  for (const [entry, exported] of [['skills/common/plugins/openclaw-agent-events/src/adapter.ts', 'activate'], ['skills/common/plugins/openclaw-agent-observer/src/index.ts', 'registerOpenClawAgentObserver']]) {
    const boundary = invocationDependencyBoundaries(facts(entry, exported), root);
    assert.deepEqual(boundary.diagnostics, []);
    const record = boundary.records.find((item) => item.scope === 'host-subscription');
    assert.ok(record);
    assert.match(record.check, /host event|model\.usage/u);
    assert.match(record.secret, /No credential|no credential/u);
  }
});

test('a changed or dynamic Git command cannot inherit the local-read proof', () => {
  const original = facts('skills/nova/plugins/repository-adapter/src/adapter.ts');
  for (const expression of ["git(root, ['fetch', 'origin']);", 'git(root, configuredArguments);']) {
    const selectedSources = new Map(original.selectedSources);
    selectedSources.set(path.join(root, 'mutation.ts'), expression);
    const boundary = invocationDependencyBoundaries({ ...original, selectedSources }, root);
    assert.ok(boundary.diagnostics.some((item) => item.includes('subprocess target requires command dependency authority')));
  }
});

test('an unknown third-party API cannot inherit a tokenizer or YAML parsing proof', () => {
  const original = facts('skills/common/plugins/runtime-dispatch/src/openclaw-adapter.ts');
  const file = path.join(root, 'skills/common/plugins/runtime-dispatch/src/openclaw.ts');
  const changed = { ...original, externalInterfaces: [...original.externalInterfaces, { package: 'tiktoken', interface: 'remoteEncode', file, line: 1 }] };
  const boundary = invocationDependencyBoundaries(changed, root);
  assert.ok(boundary.diagnostics.some((item) => item.includes('external runtime implementation tiktoken')));
});

test('a new opaque host SDK operation cannot inherit the hook subscription contract', () => {
  const original = facts('skills/common/plugins/openclaw-agent-events/src/adapter.ts');
  const file = path.join(root, 'skills/common/plugins/openclaw-agent-events/src/adapter.ts');
  const selectedSources = new Map(original.selectedSources);
  selectedSources.set(file, `${selectedSources.get(file)}\nsdk.remoteOperation(endpoint);`);
  const boundary = invocationDependencyBoundaries({ ...original, selectedSources }, root);
  assert.ok(boundary.diagnostics.some((item) => item.includes('external runtime implementation openclaw/plugin-sdk')));
});

test('source guards cannot bless a boundary when its actual authority changed', (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'dependency-boundary-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const file = path.join(temporary, 'skills/common/plugins/git-workspace/src/runner.ts');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'changed runtime transport');
  const diagnostic = `${file}:33: subprocess target requires command dependency authority`;
  const boundary = invocationDependencyBoundaries({ selectedSources: new Map([[file, 'changed']]), evidence: [], diagnostics: [diagnostic] }, temporary);
  assert.deepEqual(boundary.records, []);
  assert.deepEqual(boundary.diagnostics, [diagnostic]);
});

test('Buster routes identify concrete client owners without claiming their configured instance', () => {
  const routes = pluginCapabilityRoutes(path.join(root, 'skills/buster/engine/test-gates/remote-plan-service.ts'), root);
  const exposure = routes.find((item) => item.capability === 'kubernetes.exposure');
  assert.equal(exposure.constructor, 'TailscaleExposureCapabilityInvoker');
  assert.match(exposure.selector, /this\.#options\.tailscaleExposure/u);
  assert.ok(exposure.providerFiles.some((file) => file.endsWith('/tailscale-exposure-runtime.ts')));
});

test('computed secrets.read provider authority preserves mapping, denial and redacted functional proof', () => {
  const invocation = facts('skills/common/plugins/secret-resolver/src/adapter.ts');
  const boundary = invocationDependencyBoundaries(invocation, root, { providesCapabilities: ['secrets.read'] });
  assert.deepEqual(boundary.diagnostics, []);
  const record = boundary.records.find((item) => item.scope === 'credential-provider');
  assert.match(record.endpoint, /context\.config\.environment.*names\[request\.resource\.canonicalId\].*process\.env\[environmentName\]/u);
  assert.match(record.secret, /SECRET_DENIED.*SECRET_UNAVAILABLE/u);
  assert.match(record.check, /ready\(\).*empty.*redacted/u);
  const unknown = invocationDependencyBoundaries({ ...invocation, environmentInputs: [] }, root, { providesCapabilities: ['secrets.read'] });
  assert.match(unknown.diagnostics.join(' '), /no qualified credential selector/u);
});

test('fixed durable-store subprocess authority requires compatible flock and preserves lock/recovery bounds', () => {
  const boundary = invocationDependencyBoundaries(facts('skills/common/plugins/artifact-store/src/adapter.ts'), root);
  const record = boundary.records.find((item) => item.service.includes('/usr/bin/flock'));
  assert.ok(record);
  assert.match(record.service, /GNU --exclusive.*--timeout 5.*\/bin\/sh.*\/bin\/cat/u);
  assert.match(record.check, /BusyBox.*compatibility.*OBSERVABILITY_STORE_LOCKED.*OBSERVABILITY_STORE_UNLOCK_FAILED/u);
  assert.ok(record.evidence.every((item) => item.endLine >= item.line));
});

test('selected Trivy operations distinguish local input from remote image credential projection', () => {
  const routes = pluginCapabilityRoutes(path.join(root, 'skills/buster/engine/test-gates/remote-plan-service.ts'), root);
  for (const [entry, operation] of [['dependency', 'dependency'], ['image', 'image'], ['kubernetes-policy', 'kubernetes-policy']]) {
    const invocation = facts(`skills/buster/plugins/security-providers/src/${entry}.js`, 'provider');
    const boundary = invocationDependencyBoundaries(invocation, root, { routes });
    assert.deepEqual(boundary.diagnostics, []);
    const record = boundary.records.find((item) => item.scope === 'runtime-client');
    assert.ok(record.service.includes(operation));
    if (operation === 'image') assert.match(record.secret, /registryAccess.*registryReference.*--cacert/u);
    else assert.match(record.secret, /do not project registryAccess/u);
    const mutation = invocationDependencyBoundaries({ ...invocation, capabilityRequests: invocation.capabilityRequests.map((item) => ({ ...item, operation: null })) }, root, { routes });
    assert.match(mutation.diagnostics.join(' '), /operation requires resolved caller authority/u);
  }
});

test('publication report qualifies every discovered route, host and credential boundary at the documented source revision', () => {
  const report = JSON.parse(execFileSync(process.execPath, ['scripts/docs-publication.mjs', 'dependency-report'], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
  assert.equal(report.registrationCount, report.records.length);
  for (const record of report.records) {
    assert.deepEqual(record.diagnostics, [], record.id);
    assert.ok(!record.dataOwner.includes('unresolved runtime authority'), record.id);
  }
  for (const id of ['kubeclaw-agent-observer:kubeclaw-agent-observer', 'kubeclaw-ops:kubeclaw-ops', 'kubeclaw-prism:kubeclaw-prism', 'kubeclaw.command-runner:command']) {
    assert.ok(!report.records.find((item) => item.id === id).reachability.includes('Nova platform grants and adapter selection'), id);
  }
  const secret = report.records.find((item) => item.id === 'kubeclaw.secret-resolver:secrets');
  assert.ok(!secret.secret.includes('No credential selector'));
  assert.match(secret.secret, /context\.config\.environment.*SECRET_DENIED/u);
  const revision = JSON.parse(fs.readFileSync(path.join(root, 'docs/generated/inventory/documentation-source-revision.json'), 'utf8')).revision;
  const lock = execFileSync('git', ['show', `${revision}:package-lock.json`], { cwd: root, encoding: 'utf8' }).split('\n');
  const urls = [...JSON.stringify(report).matchAll(/https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/([0-9a-f]{40})\/package-lock\.json#L(\d+)-L(\d+)/gu)];
  assert.ok(urls.length);
  for (const match of urls) {
    assert.equal(match[1], revision);
    const excerpt = lock.slice(Number(match[2]) - 1, Number(match[3])).join('\n');
    assert.match(excerpt, /"node_modules\/(?:yaml|js-tiktoken|tiktoken)"/u);
    assert.match(excerpt, /"version":/u);
    assert.match(excerpt, /"integrity":/u);
  }
});
