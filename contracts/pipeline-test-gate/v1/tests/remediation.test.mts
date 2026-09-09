import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildRegistry, discoverPackages, resolveTestPlan } from '../../../../skills/nova/core/src/index.ts';
import { checkPipelineTestGateContract } from '../src/index.ts';
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const compile = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--target', 'ESNext', '--module', 'NodeNext', '--allowImportingTsExtensions', path.join(import.meta.dirname, 'declarations-typecheck.ts')], { encoding: 'utf8' });
assert.equal(compile.status, 0, compile.stdout + compile.stderr);
const examples = path.join(import.meta.dirname, '../examples');
const read = (name: string) => JSON.parse(fs.readFileSync(path.join(examples, `${name}.json`), 'utf8'));
const artifact = { artifactId: 'artifact:report', type: 'report', mediaType: 'application/json', contentDigest: `sha256:${'a'.repeat(64)}`, sizeBytes: 2, storageUrl: 'artifact://report' };
const manifest = { schemaVersion: 'evidence-manifest.v1', planId: 'plan:test', runId: 'run:test', moduleId: 'api', gateId: null, suiteInstanceId: null,
  nodeId: 'report', executionId: 'execution:test', attemptId: 'attempt:test', files: [{ evidenceId: 'report', type: 'report', file: 'report.json', mediaType: 'application/json' }] };
assert.equal(checkPipelineTestGateContract('evidenceManifest', manifest).ok, true);
assert.equal(checkPipelineTestGateContract('evidenceManifest', { ...manifest, files: [{ ...manifest.files[0], artifact }] }).ok, false);
const pluginRoot = path.join(root, 'skills/buster/plugins');
const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: { trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'contract-example-test' } }));
const suiteRoot = path.join(import.meta.dirname, '../suites');
const suiteTemplates = fs.readdirSync(suiteRoot).filter((name) => name.endsWith('.json')).map((name) => JSON.parse(fs.readFileSync(path.join(suiteRoot, name), 'utf8')));
const limits = { cpuMillis: 900000, memoryBytes: 4294967296, logBytes: 16777216, artifactBytes: 268435456, artifactFiles: 256, processes: 64 };
const policy = { defaultTimeoutMs: 30000, maximumTimeoutMs: 900000, defaultLimits: limits, maximumLimits: limits, maximumRetryCount: 3, maximumMatrixSize: 16, maximumNodes: 100, defaultConcurrencyLimit: 4, maximumConcurrencyLimits: { http: 8, unit: 8, 'api-flow': 8, 'container-build': 8, 'size-budget': 8 } };
const deployment = read('kubernetes-fixture');
const checkedYaml = { uses: 'kubeclaw.direct-command@1', mode: 'blocking', config: { executable: 'kubectl', args: ['kustomize', 'deploy'], resultMode: 'exit-code', artifacts: [{ id: 'checked', path: '.swarm/checked.yaml', mediaType: 'application/vnd.kubeclaw.checked-kubernetes-yaml' }] } };
for (const name of ['api-suite', 'tailscale-exposure', 'kubernetes-fixture', 'http', 'container-build-dockerfile', 'unit-suite-blocking', 'unit-suite-with-coverage', 'size-budget-tar', 'size-budget-growth', 'e2e-playwright']) {
  const example = read(name);
  const fragment = example.modules?.api ?? example.scope ?? example;
  const needsDeployment = ['api-suite', 'tailscale-exposure', 'kubernetes-fixture'].includes(name);
  const declaration = needsDeployment ? { ...fragment, fixtures: { ...(name === 'api-suite' ? { 'api/deployment': deployment.fixtures.deployment } : deployment.fixtures), ...fragment.fixtures }, tests: { checkedYaml, ...fragment.tests } } : fragment;
  const plan = resolveTestPlan({ planId: `plan:${name}`, runId: 'run:test', project: 'example', scope: { moduleId: 'api', gateId: null }, createdAt: '2026-09-09T00:00:00Z', registry, declaration, suiteTemplates,
    facts: example.facts ?? { changedPaths: [], moduleType: null, pipelineStage: null }, policy: example.policy ?? policy });
  assert.ok(plan.nodes.length > 0, name);
  for (const link of plan.links) {
    assert.ok(plan.nodes.some((node) => node.id === link.from.nodeId), `${name}: source exists`);
    assert.ok(plan.nodes.some((node) => node.id === link.to.nodeId), `${name}: target exists`);
  }
}
console.log('Test-gate declaration type/wire parity and ten real resolver examples passed');
