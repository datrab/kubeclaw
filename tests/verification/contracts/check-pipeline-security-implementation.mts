import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildRegistry, discoverPackages } from '@kubeclaw/nova-core';
import { containedRuntimeSecurityManifest, runtimeSecurityObservationHasValidAccounting, runtimeSecurityObservationIsFresh, runtimeSecurityResultDigest } from '../../../skills/buster/engine/test-gates/kubernetes-runtime-security.ts';

const root = path.resolve('skills/buster/plugins');
const registry = buildRegistry(discoverPackages({ installationRoots: [root], trustPolicy: {
  trustedBuiltinRoots: [root], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'security-implementation',
} }));
const expected = new Map([
  ['kubeclaw.security-headers@1', ['network.http']],
  ['kubeclaw.dependency-scan-trivy@1', ['security.scan']],
  ['kubeclaw.image-scan-trivy@1', ['security.scan']],
  ['kubeclaw.kubernetes-policy-security@1', ['security.scan']],
  ['kubeclaw.kubernetes-runtime-security@1', ['kubernetes.runtime-security']],
]);
for (const [id, capabilities] of expected) {
  const entry = registry.testProviderContracts.get(id);
  assert.ok(entry, id);
  assert.deepEqual(entry.registration.capabilities, capabilities);
}

const suite = JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/suites/security.v1.json', 'utf8'));
assert.deepEqual(Object.keys(suite.tests), ['security-headers', 'dependency-security', 'image-security', 'kubernetes-policy-security', 'kubernetes-runtime-security']);

const common = fs.readFileSync('skills/buster/plugins/security-providers/src/common.js', 'utf8');
for (const token of ["profile: 'strict-v1'", 'blockingSeverities', 'blockActiveThreats', 'blockMissingFixes', 'expiredAcceptances', 'unusedAcceptances', 'installedVersion', 'fixedVersion', 'reachability']) {
  assert.match(common, new RegExp(token));
}

const scan = fs.readFileSync('skills/buster/engine/test-gates/security-scan-runtime.ts', 'utf8');
for (const token of ['--offline-scan', '--skip-db-update', '--skip-java-db-update', 'SECURITY_SCAN_IMAGE_DENIED', 'SECURITY_SCAN_MANIFEST_DIGEST_MISMATCH']) {
  assert.match(scan, new RegExp(token));
}

const rendered = execFileSync('helm', ['template', 'security-proof', 'charts/kubeclaw', '--set', 'agentRole=buster', '--set', 'busterNamespaceBroker.enabled=true'], { encoding: 'utf8' });
for (const field of ['serviceTargetPort:', 'verifiedImage:', 'manifestDigest:', 'runtimeSecurity:']) {
  assert.match(rendered, new RegExp(field), `rendered CRD omits ${field}`);
}
for (const rule of [
  /resources: \["pods", "services"\][\s\S]{0,100}verbs: \["get", "list"\]/u,
  /resources: \["ingresses"\][\s\S]{0,120}verbs: \["create", "get", "list", "delete", "patch"\]/u,
  /resources: \["roles", "rolebindings"\][\s\S]{0,120}verbs: \["create", "get", "list", "delete", "patch"\]/u,
]) assert.match(rendered, rule, 'rendered controller RBAC omits required collection read');

const controller = fs.readFileSync('cmd/buster-namespace-controller/main.go', 'utf8');
assert.match(controller, /inspectRuntimeSecurityState/u);
assert.match(controller, /runtimeSecurityStatus/u);
assert.match(fs.readFileSync('cmd/buster-namespace-controller/main_test.go', 'utf8'), /TestInspectRuntimeSecurityStateUsesProductionControllerRules/u);
assert.match(controller, /runtimeSecurityRefreshDue/u);
const docker = fs.readFileSync('docker/Dockerfile.buster-runtime', 'utf8');
assert.match(docker, /--download-java-db-only[\s\S]*java-db\/trivy-java\.db/u);
const now = Date.parse('2026-09-04T05:00:00.000Z');
assert.equal(runtimeSecurityObservationIsFresh('2026-09-04T04:59:55.000Z', now, 10_000), true);
assert.equal(runtimeSecurityObservationIsFresh('2026-09-04T04:59:49.999Z', now, 10_000), false);
assert.equal(runtimeSecurityObservationIsFresh('2026-09-04T05:00:06.000Z', now, 10_000), false);
const manifestPath = path.resolve('tests/verification/e2e/fixtures/nginx-project/k8s/deployment.yaml');
assert.equal(containedRuntimeSecurityManifest(path.resolve('.'), manifestPath), manifestPath);
assert.throws(() => containedRuntimeSecurityManifest(path.resolve('.'), '/etc/hosts'), /KUBERNETES_RUNTIME_SECURITY_PATH_DENIED/u);
assert.equal(runtimeSecurityResultDigest({ findings: [{ severity: 'high', id: 'runtime:test' }],
  totalFindingCount: 1, omittedFindingCount: 0, podCount: 1, serviceCount: 1 }),
  'sha256:acd84670aa1116d19fd0c754654f945113aa5eef220f80a0f9ada5514a1b2d08');
assert.equal(runtimeSecurityObservationHasValidAccounting({ findings: [], totalFindingCount: 0, omittedFindingCount: 0 }), true);
assert.equal(runtimeSecurityObservationHasValidAccounting({ findings: [], totalFindingCount: 1, omittedFindingCount: 1 }), false);
assert.equal(runtimeSecurityObservationHasValidAccounting({ findings: [{ id: 'runtime:findings:overflow', severity: 'critical' }],
  totalFindingCount: 1, omittedFindingCount: 1 }), true);

console.log(JSON.stringify({ ok: true, phase: 'security-implementation', providers: 5, policy: 'strict-v1', realTools: ['trivy', 'http', 'kubernetes-controller'], mocks: 0, emulators: 0 }));
