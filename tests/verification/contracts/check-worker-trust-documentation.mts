import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const understand = read('docs/site/understand/worker-trust.md');
const use = read('docs/site/use/worker-trust.md');
const workerCore = read('docs/site/understand/worker-core.md');
const busterErrors = read('docs/site/reference/buster-error-codes.md');
const environment = read('docs/site/reference/environment-variables.md');
const all = [understand, use, workerCore, busterErrors, environment].join('\n');
const authored = [understand, use, workerCore].join('\n');

for (const heading of [
  '## Purpose', '## Security Layers', '## Identity Format', '## Protected Routes',
  '## Proxy Pattern', '## Nova-to-Buster Provenance', '## Current Provenance Limit',
  '## Leased Prism Namespaces', '## Fail-Closed Result', '## Human Identity',
  '## Verification Model', '## Read More',
]) assert.ok(understand.includes(heading), `Canonical Worker Trust architecture is missing ${heading}`);

for (const heading of [
  '## Purpose', '## Canonical Worker Trust Procedure', '### Preconditions',
  '### 1. Verify source before cluster execution', '### 2. Observe the installed identity chain',
  '### 3. Execute positive and negative paths', '### Failure distinction',
  '### Recovery, rotation boundary, and evidence', '## Source Authority',
]) assert.ok(use.includes(heading), `Canonical Worker Trust procedure is missing ${heading}`);

for (const fact of [
  'spiffe://kubeclaw.internal/ns/<namespace>/sa/<service-account>',
  'kubeclaw.dev/worker-trust', '127.0.0.1:28891',
  '127.0.0.1:28080', '127.0.0.1:18081', '127.0.0.1:18080',
  '127.0.0.1:18443', 'SANITIZE_SET', 'pipeline-test-gate-source-attestation',
  'plan-runtime', 'Kubernetes limits container port names to',
  'No Service may target the runtime ports',
  'Envoy does not proxy the OpenClaw gateway route on port `18789`',
  'kubeclaw-source-snapshot-v1\\0', 'worker-trust-envelope.v1',
  'No Prism-to-Nova durable signature exists today',
]) assert.ok(all.includes(fact), `Worker Trust documentation is missing fact: ${fact}`);

assert.doesNotMatch(all, /\b(?:28892|legacy-runtime)\b/u,
  'Canonical Worker Trust documentation describes a runtime absent from the selected production profile');

for (const code of [
  'WORKER_TRUST_PEER_MISSING', 'WORKER_TRUST_PEER_INVALID',
  'WORKER_TRUST_POLICY_INVALID', 'WORKER_TRUST_PEER_FORBIDDEN',
  'WORKER_TRUST_PROXY_REQUIRED', 'REMOTE_TEST_GATE_SPIFFE_PROXY_NOT_LOOPBACK',
  'NOVA_REMOTE_PLAN_SPIFFE_PROXY_NOT_LOOPBACK', 'BUSTER_REMOTE_SPIFFE_POLICY_INVALID',
  'NOVA_SOURCE_ATTESTATION_PRIVATE_KEY_MISSING',
  'NOVA_SOURCE_ATTESTATION_PRIVATE_KEY_INVALID',
  'BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY_MISSING',
  'BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID', 'BUSTER_SOURCE_ATTESTATION_INVALID',
]) assert.ok(use.includes(`| \`${code}\` |`), `Canonical Worker Trust procedure is missing diagnostic row ${code}`);

assert.doesNotMatch(authored, /\b(?:simply|obviously|appropriate|properly|normally|just|easy|easily|somehow|various)\b/iu,
  'Authored Worker Trust documentation contains a prohibited vague term');
assert.match(understand, /Current Provenance Limit/u);
assert.match(use, /does not\s+use\s+a\s+test-double\s+server\s+or\s+fabricated\s+completion\s+result/u);

for (const topology of [
  /`0\.0\.0\.0:18891` in Buster[\s\S]*Service targets the named Envoy port `buster-plan`/u,
  /`127\.0\.0\.1:28891` in Buster[\s\S]*named `plan-runtime`[\s\S]*No Service may target the runtime ports/u,
  /`0\.0\.0\.0:18082` in the Prism agent/u,
  /`127\.0\.0\.1:18444` in the live test runner/u,
  /Admission occurs three times[\s\S]*SPIRE selector[\s\S]*destination Envoy[\s\S]*Worker Core/u,
]) assert.match(understand, topology, `Canonical Worker Trust architecture lacks a structural trust assertion: ${topology}`);

for (const evidencePath of [
  'charts/kubeclaw/templates/configmap-worker-trust.yaml',
  'charts/prism/templates/configmap-worker-trust.yaml',
  'skills/worker/core/worker/trust.ts',
  'contracts/pipeline-test-gate/v1/src/remote.ts',
  'contracts/pipeline-worker-core/v1/src/trust.ts',
]) assert.ok(understand.includes(evidencePath), `Worker Trust architecture lacks direct evidence for ${evidencePath}`);

const busterValues = read('my-values/buster-values.yaml');
const kubeclawEnvoy = read('charts/kubeclaw/templates/configmap-worker-trust.yaml');
const prismEnvoy = read('charts/prism/templates/configmap-worker-trust.yaml');
assert.match(busterValues, /name:\s*plan-runtime\s*\n\s*containerPort:\s*28891/u);
assert.match(busterValues, /name:\s*buster-plan\s*\n\s*port:\s*18891\s*\n\s*targetPort:\s*buster-plan/u);
assert.doesNotMatch(busterValues, /\b(?:28892|legacy-runtime)\b/u);
assert.doesNotMatch(kubeclawEnvoy, /port_value:\s*18789/u,
  'Worker Trust Envoy must not absorb the OpenClaw gateway listener');
for (const port of [18080, 18081, 18082, 18443, 18444]) {
  assert.match(prismEnvoy, new RegExp(`port_value:\\s*${port}\\b`, 'u'), `Prism Worker Trust topology lacks port ${port}`);
}

function filesBelow(directory: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(new URL(`../../../${directory}/`, import.meta.url), { withFileTypes: true })) {
    const child = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...filesBelow(child));
    else result.push(child);
  }
  return result;
}
const prismProduction = [
  ...filesBelow('skills/prism'),
  ...filesBelow('skills/nova/plugins/prism-design'),
].filter((file) => !file.includes('/tests/') && !file.endsWith('.test.mts') && !file.endsWith('.test.ts'));
for (const file of prismProduction) {
  assert.doesNotMatch(read(file), /worker-trust-envelope\.v1|signWorkerTrustEnvelope|verifyWorkerTrustEnvelope/u,
    `Prism production path ${file} uses the neutral envelope; update the documented provenance boundary`);
}

console.log(JSON.stringify({ ok: true, contract: 'worker-trust-documentation.v1',
  documents: 5, exactErrorCodes: 13, activeListenerPorts: 9,
  requiredArchitectureSections: 12, requiredProcedureSections: 9,
  prismProductionFilesChecked: prismProduction.length }));
