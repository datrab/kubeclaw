import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import {buildRegistry, discoverPackages, resolveTestPlan} from '../../../skills/nova/core/src/index.ts';
import {TestPlanRunner, RegisteredTestProviderLoader} from '../../../skills/buster/engine/src/index.ts';
import {FileEvidenceStore} from '../../../skills/buster/engine/test-gates/artifacts.ts';
import {createObservedEvidenceDiscovery} from '../helpers/observed-evidence-discovery.mjs';
const sourceRoot = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const fixture = 'tests/verification/fixtures/evidence-discovery';
const sha = (bytes: Buffer) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const limits = {cpuMillis: 10_000, memoryBytes: 512 * 1024 * 1024,
  logBytes: 1024 * 1024, artifactBytes: 1024 * 1024, artifactFiles: 16, processes: 16};

// All eight cases execute the real registered-package snapshot, isolated child,
// runner selection and managed/durable consumer. Custom stores are not presumed
// safe: final physical bytes are independently compared to the original DATA.
for (const format of ['yaml', 'json']) for (const route of ['selected', 'error']) {
  for (const loss of [false, true]) test(`${format}/${route}/${loss ? 'loss rejected' : 'all DATA retained'}`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pr13-discovery-integration-'));
    try {
      const plugins = path.join(root, 'plugins');
      const provider = path.join(plugins, 'provider');
      const workspace = path.join(root, 'workspace');
      const repository = path.join(workspace, 'repository');
      const artifacts = path.join(root, 'artifacts');
      fs.mkdirSync(provider, {recursive: true});
      fs.mkdirSync(repository, {recursive: true});
      for (const file of ['provider.mjs', 'yaml.bin', 'json.bin']) fs.copyFileSync(path.join(sourceRoot, fixture, file), path.join(provider, file));
      fs.writeFileSync(path.join(provider, 'package.json'), '{"name":"synthetic-evidence-provider","type":"module"}');
      fs.writeFileSync(path.join(provider, 'schema.json'), JSON.stringify({type: 'object', properties: {format: {enum: ['yaml', 'json']}}, required: ['format'], additionalProperties: false}));
      fs.writeFileSync(path.join(provider, 'plugin.json'), JSON.stringify({id: 'example.evidence', apiVersion: 'pipeline-plugin-v2', packageVersion: '1.0.0', stages: [], observers: [], adapters: [], testProviders: [{
        id: 'producer', contractId: 'example.evidence@1', kind: 'test', module: 'provider.mjs', export: 'provider', configSchema: 'schema.json',
        inputs: [], outputs: [], requiredCapabilities: [], retrySafe: true, matrixFields: [], reportFormats: [], evidenceTypes: ['log'],
        evidenceDefaults: {onPass: ['log'], onFail: ['log'], onError: ['log']},
      }]}));
      const registry = buildRegistry(discoverPackages({installationRoots: [plugins], trustPolicy: {trustedBuiltinRoots: [plugins], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'test:evidence-discovery'}, now: () => new Date('2026-08-05T17:00:00Z')}));
      const plan = resolveTestPlan({planId: 'plan:evidence', runId: 'run:evidence', project: 'evidence', scope: {moduleId: 'app', gateId: null}, createdAt: '2026-08-05T17:00:00Z',
        declaration: {tests: {producer: {uses: 'example.evidence@1', config: {format}, retries: 0}}, fixtures: {}, concurrencyLimits: {}}, suiteTemplates: [], registry,
        facts: {changedPaths: ['src/app.ts'], moduleType: 'web', pipelineStage: 'test'},
        policy: {defaultTimeoutMs: 5_000, maximumTimeoutMs: 10_000, defaultLimits: limits, maximumLimits: limits, maximumRetryCount: 1, maximumMatrixSize: 1, maximumNodes: 1, defaultConcurrencyLimit: 1, maximumConcurrencyLimits: {}},
      });
      const original = fs.readFileSync(path.join(provider, `${format}.bin`));
      const backing = new FileEvidenceStore(path.join(artifacts, 'custom'));
      const seen: string[] = [];
      const stagedCaptures: string[] = [];
      let sequence = 0;
      const observed = await new TestPlanRunner({plan, registry, workspaceRoot: workspace, repositoryRoot: repository, artifactRoot: artifacts,
        observabilityRoot: path.join(artifacts, 'observability'), maximumConcurrency: 1, id: () => `evidence-${++sequence}`,
        loader: new RegisteredTestProviderLoader(), evidenceStore: {async store(attempt, evidenceRoot, declaration, maximumBytes, signal) {
          if (declaration.evidenceId === 'api-data') {
            assert.deepEqual(fs.readFileSync(path.join(evidenceRoot, declaration.file)), original);
            seen.push(path.join(evidenceRoot, declaration.file));
            // Runner removes its staging tree on completion. Capture the exact
            // independently read bytes at the live custom-store input boundary.
            const capture = path.join(root, 'stage-captures', path.basename(evidenceRoot), declaration.file);
            fs.mkdirSync(path.dirname(capture), {recursive: true});
            fs.writeFileSync(capture, fs.readFileSync(path.join(evidenceRoot, declaration.file)));
            stagedCaptures.push(capture);
            if (route === 'error' && seen.length === 1) throw new Error('synthetic first-store failure');
          }
          const stored = await backing.store(attempt, evidenceRoot, declaration, maximumBytes, signal);
          if (loss && declaration.evidenceId === 'api-data') {
            const truncated = format === 'yaml' ? original.toString().split('---')[0]! : JSON.stringify({...JSON.parse(original.toString()), items: JSON.parse(original.toString()).items.slice(0, 1)});
            fs.writeFileSync(new URL(stored.artifact.storageUrl), truncated);
            // Stronger negative than stale metadata: return internally consistent
            // metadata for the truncated result. It still cannot prove retention.
            const bytes = Buffer.from(truncated);
            return {...stored, artifact: {...stored.artifact, contentDigest: sha(bytes), sizeBytes: bytes.length}};
          }
          return stored;
        }},
      }).run();
      const attempt = observed.attempts[0]!;
      assert.equal(attempt.executionState, route === 'selected' ? 'completed' : 'errored', JSON.stringify(attempt));
      assert.equal(seen.length, route === 'selected' ? 1 : 2);
      assert.equal(path.basename(path.dirname(seen.at(-1)!)), route);
      const evidence = attempt.evidence.find(item => item.evidenceId === 'api-data');
      assert(evidence, JSON.stringify(attempt));
      // Locate the actual producer's retained original file, not its payload
      // declaration or the custom store's claimed metadata.
      const producerFiles = fs.readdirSync(workspace, {recursive: true, encoding: 'utf8'})
        .filter(file => file.endsWith('/api.bin') && !file.includes('/selected/') && !file.includes('/error/'));
      assert.equal(producerFiles.length, 1, JSON.stringify(producerFiles));
      const observation = {format, route, producerFile: path.join(workspace, producerFiles[0]!), stagedFile: stagedCaptures.at(-1)!, consumerFile: fileURLToPath(evidence.artifact.storageUrl)};
      const discover = createObservedEvidenceDiscovery(sourceRoot);
      if (loss) {
        assert.throws(() => discover(observation), /complete bytes differ at consumer/);
      } else {
        const proof = discover(observation);
        assert.equal(proof.staticRoleGrant, false);
        assert.equal(proof.entireProviderFamilyQualified, false);
        assert.equal(proof.completeBytes, original.length);
        assert.deepEqual(proof.outputs.map(output => output.value.kind), format === 'yaml' ? ['ConfigMap', 'Secret'] : ['List', 'ConfigMap', 'Secret']);
        assert.deepEqual(proof.outputs.filter(output => output.value.kind !== 'List').map(output => output.value.metadata.name), ['first', 'second']);
        // Warm read must not reuse a previously preserved consumer or selection.
        fs.appendFileSync(observation.consumerFile, '\n---\napiVersion: v1\nkind: Secret\nmetadata: {name: unseen}\n');
        assert.throws(() => discover(observation), /complete bytes differ at consumer/);
        fs.writeFileSync(observation.consumerFile, original);
        assert.equal(discover(observation).completeBytes, original.length);
        assert.throws(() => discover({...observation, route: route === 'selected' ? 'error' : 'selected'}), /changed selection route/);
        fs.appendFileSync(observation.producerFile, '\n---\napiVersion: v1\nkind: Secret\nmetadata: {name: unseen}\n');
        assert.throws(() => discover(observation), /complete bytes differ at producer/);
        assert.throws(() => createObservedEvidenceDiscovery(sourceRoot)(observation), /complete bytes differ at producer/);
      }
    } finally {fs.rmSync(root, {recursive: true, force: true});}
  });
}

// Changed custody is rejected before DATA interpretation, both at acquisition
// and after warming an adapter. Use an owned Source copy, never mutate runtime.
test('producer, selection and consumer Source drift revokes cold and warm observations', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pr13-discovery-custody-'));
  try {
    const files = ['skills/buster/engine/test-gates/artifacts.ts', 'skills/buster/engine/test-gates/runner.ts', 'skills/buster/engine/test-gates/provider-loader.ts', 'skills/buster/engine/test-gates/provider-child.mjs', 'skills/common/plugin-runtime/foundation/observability/durable-attempts.ts', `${fixture}/provider.mjs`, `${fixture}/yaml.bin`, `${fixture}/json.bin`];
    for (const file of files) {fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});fs.copyFileSync(path.join(sourceRoot, file), path.join(root, file));}
    for (const file of files) {
      const discover = createObservedEvidenceDiscovery(root);
      const original = fs.readFileSync(path.join(root, file));
      fs.appendFileSync(path.join(root, file), '\n// changed custody');
      assert.throws(() => createObservedEvidenceDiscovery(root), /changed producer\/selection\/consumer/);
      assert.throws(() => discover({}), /changed producer\/selection\/consumer/);
      fs.writeFileSync(path.join(root, file), original);
    }
  } finally {fs.rmSync(root, {recursive: true, force: true});}
});
