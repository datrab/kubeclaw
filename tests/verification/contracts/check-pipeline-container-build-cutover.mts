import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LEGACY_UNMIGRATED_SUITES } from '../../../skills/buster/plugins/buster-suite-runtime/src/protocol.ts';
import { EXECUTION_ORDER, DEPENDENCIES, validateSuiteNames } from '../../../skills/buster/plugins/buster-suite-runtime/src/runtime/runners/suite-runner.ts';

const read = (file: string) => fs.readFileSync(file, 'utf8');
const oldRunner = 'skills/buster/plugins/buster-suite-runtime/src/runtime/suites/build.ts';
assert.equal(fs.existsSync(oldRunner), false);
assert.equal(LEGACY_UNMIGRATED_SUITES.includes('build' as any), false);
assert.equal(EXECUTION_ORDER.includes('build'), false);
assert.equal(Object.hasOwn(DEPENDENCIES, 'build'), false);
assert.equal(Object.values(DEPENDENCIES).flat().includes('build'), false);
assert.throws(() => validateSuiteNames(['build']), /Invalid Buster suite request/u);

const bridge = JSON.parse(read('contracts/pipeline-test-gate/v1/legacy-suite-bridge.json'));
assert.deepEqual(bridge.suites.build, { state: 'migrated', successor: 'kubeclaw.container-build@1' });
const ledger = JSON.parse(read('docs/architecture/pipeline-test-gate-container-build-parity-ledger.json'));
assert.equal(ledger.items.length, 36);
assert.equal(ledger.authority.legacy, 'removed');
assert.equal(ledger.authority.replacement, 'authoritative');
assert.equal(ledger.items.every((item: any) => item.status === 'proved' && item.proof.length > 0), true);

const scaffold = read('skills/nova/project_setup/tools/progress-scaffold-discovery.ts');
assert.match(scaffold, /legacyBuildNode/u);
assert.match(scaffold, /addContainerBuild/u);
assert.match(scaffold, /kubeclaw\.container-image@1/u);
assert.match(scaffold, /LEGACY_BUILD_CONTEXT_MISSING/u);
const workspace = read('tests/verification/e2e/real-run-workspace.mjs');
assert.match(workspace, /uses: 'kubeclaw\.container-build@1'/u);
assert.match(workspace, /schemaId: 'kubeclaw\.container-image@1'/u);
assert.doesNotMatch(workspace, /test_suites:\s*\['build'\]/u);

assert.equal(fs.existsSync('skills/nova/plugins/preflight-contract/src/buildkit.ts'), false);
assert.doesNotMatch(read('skills/nova/plugins/preflight-contract/plugin.json'), /preflight\.buildkit/u);
assert.match(read('tests/verification/e2e/nova-buildkit-production-preflight.mts'), /test\.plan\.execute/u);
assert.doesNotMatch(read('tests/verification/e2e/nova-buildkit-production-preflight.mts'), /test\.suite\.execute|allowedSuites|unmigratedSuites/u);

const entrypoint = read('docker/buster-runtime-entrypoint.sh');
assert.match(entrypoint, /remote-plan-cli\.ts/u);
assert.match(entrypoint, /allowedCapabilities: \[[^\]]*'container\.build'[^\]]*\]/u);
assert.match(entrypoint, /BUSTER_LEGACY_PORT/u);
const busterValues = read('my-values/buster-values.yaml');
assert.match(busterValues, /name: buster-plan[\s\S]*port: 18891/u);
assert.match(busterValues, /name: buster-legacy[\s\S]*port: 18892/u);
const novaValues = read('my-values/nova-values.yaml');
assert.match(novaValues, /test\.plan\.execute:[\s\S]*adapter: buster-plan-v1[\s\S]*scheme: http[\s\S]*port: 18891/u);
assert.match(novaValues, /test\.suite\.execute:[\s\S]*adapter: buster-suite-v2[\s\S]*port: 18892/u);
const secretSetup = read('my-values/setup-secrets.sh');
const deploy = read('scripts/deploy.sh');
assert.match(secretSetup, /setup_pipeline_source_attestation_secret/u);
assert.match(deploy, /require_agent_worker_trust_prerequisites[\s\S]*require_spiffe_csi_driver[\s\S]*require_pipeline_source_attestation_secret/u);
assert.match(deploy, /deploy_agent\(\)[\s\S]*require_agent_worker_trust_prerequisites[\s\S]*info "Deploying agent-/u);
assert.match(secretSetup, /openssl genpkey -algorithm ED25519/u);
assert.match(busterValues, /BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY[\s\S]*pipeline-test-gate-source-attestation/u);
assert.doesNotMatch(busterValues, /buster-plan-tls/u);
assert.match(busterValues, /CONTAINER_BUILD_BUILDKIT_HOST[\s\S]*buildkitd\.sock/u);
assert.match(busterValues, /CONTAINER_BUILD_REGISTRY_REFERENCE[\s\S]*registry-local/u);
assert.match(busterValues, /CONTAINER_BUILD_REGISTRY_BASE_URL[\s\S]*http:\/\/registry-local/u);
assert.match(novaValues, /BUSTER_SOURCE_ATTESTATION_PRIVATE_KEY[\s\S]*pipeline-test-gate-source-attestation/u);
assert.doesNotMatch(novaValues, /NODE_EXTRA_CA_CERTS|buster-plan-trust/u);
const dockerfile = read('docker/Dockerfile.buster-runtime');
assert.match(dockerfile, /check-pipeline-container-build-production\.mts/u);
assert.match(dockerfile, /check-pipeline-container-build-recovery\.mts/u);

for (const file of [
  'tests/verification/contracts/check-pipeline-container-build-production.mts',
  'tests/verification/contracts/check-pipeline-container-build-recovery.mts',
]) {
  const source = read(file);
  assert.doesNotMatch(source, /createServer|async execute\s*\(|async fetch\s*\(|contract emulator/iu);
  assert.match(source, /CONTAINER_BUILD_BUILDKIT_HOST/u);
}
const namespaceController = read('cmd/buster-namespace-controller/main.go');
assert.match(namespaceController,
  /"resources": \[\]string\{"secrets"\},\s*"resourceNames": \[\]string\{request\.SecretName\}, "verbs": \[\]string\{"get"\}/u);
assert.doesNotMatch(namespaceController,
  /"resources": \[\]string\{"secrets"\},\s*"verbs": \[\]string\{"get", "list"/u);

console.log(JSON.stringify({ ok: true, phase: 'container-build-cutover',
  soleAuthority: 'kubeclaw.container-build@1', parityItems: 36,
  productionSurfaces: ['project-scaffold', 'real-workspace', 'nova-plan-route', 'buster-plan-runtime',
    'buildkit', 'registry', 'kubernetes-image-link'],
  productionAcceptance: 'pending-deployment',
  deleted: ['legacy build protocol', 'legacy build runner', 'legacy BuildKit preflight'],
  mocks: 0, emulators: 0, wrappers: 0 }));
