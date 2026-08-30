import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const reference = read('docs/security/worker-trust.md');
const runbook = read('docs/operations/worker-trust-runbook.md');
const understand = read('docs/site/understand/worker-trust.md');
const use = read('docs/site/use/worker-trust.md');
const all = [reference, runbook, understand, use].join('\n');

for (const heading of [
  '## Scope', '## Terms', '## Identity Issuance', '## Authorized Connections',
  '## Ports and Listeners', '## Nova-to-Buster Flow', '## Nova-to-Prism Flow',
  '## Prism Control-to-Worker Flow', '## Forwarded Identity Rules',
  '## Leased Prism Namespaces', '## NetworkPolicy Controls',
  '## X.509-SVID Storage and Rotation', '## Durable Source Attestation',
  '## Worker Trust Envelope Status', '## Human Identity and Keycloak',
  '## Fail-Closed Behavior', '## Configuration Reference', '## Proof Levels',
  '## Test Coverage', '## Known Limits', '## Change Rules', '## Source Map',
]) assert.ok(reference.includes(heading), `Worker Trust reference is missing ${heading}`);

for (const heading of [
  '## Safety Rules', '## Required Tools', '## Required Kubernetes Authority',
  '## Preflight', '## Offline Source Verification', '## Helm Render Verification',
  '## Deployment Order', '## SPIRE Readiness', '## Protected Workload Readiness',
  '## Live Acceptance', '## Positive Live Cases', '## Negative Live Cases',
  '## Source-Attestation Acceptance', '## Leased Prism Acceptance',
  '## Evidence Collection', '## Troubleshooting Order', '## Symptom Reference',
  '## Error-Code Reference', '## SPIRE Recovery', '## X.509-SVID Rotation',
  '## Ed25519 Source-Key Rotation', '## Temporary Resource Cleanup',
  '## Rollback Rules', '## Completion Record',
]) assert.ok(runbook.includes(heading), `Worker Trust runbook is missing ${heading}`);

for (const fact of [
  'spiffe://kubeclaw.internal/ns/<namespace>/sa/<service-account>',
  'kubeclaw.dev/worker-trust', '127.0.0.1:28891', '127.0.0.1:28892',
  '127.0.0.1:28080', '127.0.0.1:18081', '127.0.0.1:18080',
  '127.0.0.1:18443', 'SANITIZE_SET', 'pipeline-test-gate-source-attestation',
  'kubeclaw-source-snapshot-v1\\0', 'worker-trust-envelope.v1',
  'No Prism-to-Nova durable signature exists today',
]) assert.ok(all.includes(fact), `Worker Trust documentation is missing fact: ${fact}`);

for (const code of [
  'WORKER_TRUST_PEER_MISSING', 'WORKER_TRUST_PEER_INVALID',
  'WORKER_TRUST_POLICY_INVALID', 'WORKER_TRUST_PEER_FORBIDDEN',
  'WORKER_TRUST_PROXY_REQUIRED', 'REMOTE_TEST_GATE_SPIFFE_PROXY_NOT_LOOPBACK',
  'NOVA_REMOTE_PLAN_SPIFFE_PROXY_NOT_LOOPBACK', 'BUSTER_REMOTE_SPIFFE_POLICY_INVALID',
  'NOVA_SOURCE_ATTESTATION_PRIVATE_KEY_MISSING',
  'NOVA_SOURCE_ATTESTATION_PRIVATE_KEY_INVALID',
  'BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY_MISSING',
  'BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID', 'BUSTER_SOURCE_ATTESTATION_INVALID',
]) assert.ok(runbook.includes(code), `Worker Trust runbook is missing ${code}`);

assert.doesNotMatch(all, /\b(?:simply|obviously|appropriate|properly|normally|just|easy|easily|somehow|various)\b/iu,
  'Worker Trust documentation contains a prohibited vague term');
assert.match(understand, /Current Provenance Limit/u);
assert.match(use, /does not\s+use a test-double server or fabricated completion result/u);

console.log(JSON.stringify({ ok: true, contract: 'worker-trust-documentation.v1',
  documents: 4, exactErrorCodes: 13, requiredReferenceSections: 22, requiredRunbookSections: 24 }));
