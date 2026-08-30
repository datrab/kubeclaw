import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const live = readFileSync(new URL('../live/worker-trust-cluster-e2e.sh', import.meta.url), 'utf8');
const deploy = readFileSync(new URL('../../../scripts/deploy.sh', import.meta.url), 'utf8');
const prismTrust = readFileSync(
  new URL('../../../charts/prism/templates/configmap-worker-trust.yaml', import.meta.url), 'utf8');
const prismNetwork = readFileSync(
  new URL('../../../charts/prism/templates/networkpolicy.yaml', import.meta.url), 'utf8');
const spireValues = readFileSync(
  new URL('../../../my-values/infra/spire-values.yaml', import.meta.url), 'utf8');

for (const evidence of [
  'kubectl get csidriver csi.spiffe.io',
  'assert_svid_loaded',
  'http://127.0.0.1:28891/healthz',
  'http://127.0.0.1:28080/health',
  'http://127.0.0.1:18081/health',
  'http://127.0.0.1:18080/health',
  'assert_direct_mtls_rejected',
  'wrong Prism identity was accepted',
  'wrong Buster identity was accepted',
  'forwarded-certificate-spoof',
]) assert.ok(live.includes(evidence), `live Worker Trust proof is missing ${evidence}`);

assert.doesNotMatch(live, /\b(?:mock|stub|fake|emulat(?:e|or))\b/iu,
  'live Worker Trust proof must not contain a test-double boundary');
assert.match(deploy, /cmd_worker_trust_e2e[\s\S]*worker-trust-cluster-e2e\.sh[\s\S]*cmd_nova_unit_preflight/u,
  'production Worker Trust proof must combine live SPIFFE/mTLS checks with signed Nova-to-Buster execution');
assert.match(prismTrust, /novaNamespace[\s\S]*novaServiceAccount/u,
  'leased Prism releases must authorize Nova in Nova\'s namespace');
assert.match(prismNetwork, /kubernetes\.io\/metadata\.name: \{\{ \.Values\.workerTrust\.spiffe\.novaNamespace/u,
  'Prism NetworkPolicy must use the configured Nova namespace');
assert.match(prismNetwork, /name: prism-test-runner[\s\S]*ternary 8443 8080 \.Values\.workerTrust\.spiffe\.enabled/u,
  'Prism test-runner egress must follow the mTLS service port');
assert.match(prismNetwork, /name: prism-studio-control[\s\S]*port: 8080/u,
  'Prism Studio must retain its application HTTP route when Worker Trust is enabled');
assert.match(spireValues, /namespaces:[\s\S]*create: false[\s\S]*system: \{ name: spire-system, create: true \}[\s\S]*server: \{ name: spire-server, create: false \}/u,
  'SPIRE must not ask Helm to adopt its pre-created release namespace');

console.log(JSON.stringify({ ok: true, contract: 'worker-trust-live-coverage.v1',
  positivePaths: 4, negativePaths: 5, testDoubles: 0 }));
