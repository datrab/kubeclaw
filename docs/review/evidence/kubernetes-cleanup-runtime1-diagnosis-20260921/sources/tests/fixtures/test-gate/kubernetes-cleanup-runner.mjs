import assert from 'node:assert/strict';
import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { buildRegistry, discoverPackages, resolveTestPlan } from '../../../skills/nova/core/src/index.ts';
import { runnerExecutionPolicy } from './execution-policy.mts';
import { image, imageDigest, manifest, mediaType, invoker, localApi } from './kubernetes-cleanup-fixture.mjs';

export function runnerOptions(root, retentionMode, fail) {
  const plugins = path.join(root, 'plugins');
  const publisher = path.join(plugins, 'publisher');
  fs.mkdirSync(publisher, { recursive: true });
  fs.writeFileSync(path.join(publisher, 'package.json'), JSON.stringify({ name: 'cleanup-manifest', type: 'module' }), { flag: 'wx' });
  fs.writeFileSync(path.join(publisher, 'schema.json'), JSON.stringify({ type: 'object', additionalProperties: false }), { flag: 'wx' });
  fs.writeFileSync(path.join(publisher, 'provider.js'), `import assert from 'node:assert/strict';
import process from 'node:process';
import fs from 'node:fs'; import path from 'node:path';
export function provider() { return { execute(invocation, context) {
  fs.writeFileSync(path.join(context.workspaceRoot, invocation.workspace.evidence, 'checked.yaml'), ${JSON.stringify(manifest)});
  return { schemaVersion:'provider-result.v1',outcome:'passed',summary:'checked manifest fixture',
    counts:{total:1,passed:1,failed:0,skipped:0},findings:[],metrics:[],
    evidenceFiles:[{evidenceId:'manifest',type:'report',file:'checked.yaml',mediaType:${JSON.stringify(mediaType)}}],
    reports:[],outputs:[{name:'manifest',kind:'artifact',evidenceId:'manifest'}],exitCode:0,signal:null,providerDetails:null };
} }; }\n`, { flag: 'wx' });
  fs.writeFileSync(path.join(publisher, 'plugin.json'), JSON.stringify({ id: 'test.cleanup-manifest',
    apiVersion: 'pipeline-plugin-v2', packageVersion: '1.0.0', stages: [], observers: [], adapters: [],
    testProviders: [{ id: 'manifest', contractId: 'test.cleanup-manifest@1', kind: 'test', module: 'provider.js',
      export: 'provider', configSchema: 'schema.json', inputs: [], outputs: [{ name: 'manifest', kind: 'artifact',
        required: true, mediaTypes: [mediaType] }], requiredCapabilities: [], retrySafe: true, matrixFields: [],
      reportFormats: [], evidenceTypes: ['report'], evidenceDefaults: { onPass: ['report'], onFail: ['report'], onError: ['report'] } }] }), { flag: 'wx' });
  const actualPlugin = path.resolve('skills/buster/plugins/kubernetes-fixture');
  const copiedPlugin = path.join(plugins, 'kubernetes-fixture');
  fs.cpSync(actualPlugin, copiedPlugin, { recursive: true, dereference: true });
  const source = path.join(actualPlugin, 'src/provider.js');
  const target = path.join(copiedPlugin, 'src/provider.js');
  const originalStat = fs.statSync(source), copiedStat = fs.lstatSync(target);
  assert(copiedStat.isFile() && !copiedStat.isSymbolicLink() && copiedStat.nlink === 1);
  assert(fs.realpathSync(target).startsWith(`${fs.realpathSync(root)}${path.sep}`));
  assert.notEqual(fs.realpathSync(source), fs.realpathSync(target));
  assert(originalStat.dev !== copiedStat.dev || originalStat.ino !== copiedStat.ino);
  assert.equal(fs.readFileSync(target, 'utf8'), fs.readFileSync(source, 'utf8'));
  if (process.env.BUSTER_CLEANUP_PROVIDER_MUTATION !== undefined) {
    assert.equal(process.env.BUSTER_CLEANUP_PROVIDER_MUTATION, 'retain-unconditional');
    const bytes = fs.readFileSync(target, 'utf8');
    const anchor = "config.retentionMode === 'retain' && disposition === 'completed-fixture'";
    assert.equal(bytes.split(anchor).length, 2);
    fs.writeFileSync(target, bytes.replace(anchor, "config.retentionMode === 'retain'"));
  }

  const registry = buildRegistry(discoverPackages({ installationRoots: [plugins], trustPolicy: {
    trustedBuiltinRoots: [plugins], allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
    verifierId: 'test:kubernetes-cleanup' } }));
  const limits = { cpuMillis: 10000, memoryBytes: 512 * 1024 * 1024, logBytes: 1048576,
    artifactBytes: 16777216, artifactFiles: 16, processes: 16 };
  const plan = resolveTestPlan({ planId: 'plan:kubernetes-cleanup', runId: 'run:kubernetes-cleanup', project: 'cleanup-proof',
    scope: { moduleId: 'app', gateId: null }, createdAt: '2026-09-21T00:00:00.000Z',
    declaration: { tests: { manifest: { uses: 'test.cleanup-manifest@1', mode: 'blocking', retries: 0 } },
      fixtures: { deploy: { uses: 'kubeclaw.kubernetes-fixture@1', retries: 1, acceptUnsafeRetry: true,
        config: { image: { reference: image, digest: imageDigest }, serviceName: 'app', servicePort: 8080,
          retention: { mode: retentionMode, seconds: 300 }, readinessTimeoutSeconds: 1 },
        inputs: { 'checked-manifest': { from: 'manifest', output: 'manifest', mediaType } } } }, concurrencyLimits: {} },
    suiteTemplates: [], registry, facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' },
    policy: { defaultTimeoutMs: 10000, maximumTimeoutMs: 10000, defaultLimits: limits, maximumLimits: limits,
      maximumRetryCount: 1, maximumMatrixSize: 1, maximumNodes: 2, defaultConcurrencyLimit: 1,
      maximumConcurrencyLimits: {} } });
  const workspaceRoot = path.join(root, 'workspace');
  const repositoryRoot = path.join(workspaceRoot, 'repository');
  fs.mkdirSync(repositoryRoot, { recursive: true });
  const api = localApi(fail ? { primary: new Error('external preparation fault'), deleteError: new Error('external delete fault') } : {});
  return { api, options: { plan, registry, workspaceRoot, repositoryRoot, artifactRoot: path.join(root, 'artifacts'),
    observabilityRoot: path.join(root, 'observability'), maximumConcurrency: 1,
    executionPolicy: runnerExecutionPolicy,
    workerLocalRuntime: { drainTimeoutMs: 300000, cancellationTimeoutMs: 30000, replayLimit: 65536 },
    grants: new Map([['deploy', ['kubernetes.fixture']]]), capabilityInvoker: invoker(root, api) } };
}
