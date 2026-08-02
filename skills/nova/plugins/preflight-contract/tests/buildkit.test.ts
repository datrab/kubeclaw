import assert from 'node:assert/strict';
import { execute } from '../src/buildkit.ts';

const digest = `sha256:${'a'.repeat(64)}`;
const invocations: Array<{ capability: string; request: Record<string, any> }> = [];
const context = {
  contract: { config: { registryOrigin: 'http://registry.test:5001' } },
  async invoke(capability: string, request: Record<string, any>) {
    invocations.push({ capability, request });
    if (capability === 'test.suite.execute') return {
      results: [{
        suite: 'build',
        status: 'PASS',
        critical: true,
        metadata: {
          tool: 'rootless-buildkit',
          registry_image: 'registry.test:5001/buster-build-preflight:proof',
          registry_image_digest: digest,
          health_http_code: 200,
        },
      }],
    };
    return {
      status: 200,
      headers: { 'docker-content-digest': digest },
      body: { schemaVersion: 2, layers: [] },
    };
  },
} as never;

const result = await execute({
  repositoryRoot: '/repo',
  testConfig: { suite_timeout_ms: 60_000 },
  task: { project: 'preflight', run_id: 'run:preflight' },
  moduleId: 'buildkit-preflight',
  attempt: 1,
}, context);
assert.equal(result.outcome, 'passed');
if (result.outcome !== 'passed') throw new Error('expected passed result');
assert.equal(result.facts?.['buildkit.digest'], digest);
assert.equal(invocations[0]?.capability, 'test.suite.execute');
assert.deepEqual(invocations[0]?.request.payload.suites, ['build']);
assert.equal(invocations[1]?.capability, 'network.http');
assert.equal(
  invocations[1]?.request.resource.canonicalId,
  `http://registry.test:5001/v2/buster-build-preflight/manifests/${digest}`,
);

const mismatch = await execute({
  repositoryRoot: '/repo',
  testConfig: { suite_timeout_ms: 60_000 },
  task: { project: 'preflight', run_id: 'run:preflight' },
  moduleId: 'buildkit-preflight',
  attempt: 1,
}, {
  contract: { config: { registryOrigin: 'http://other-registry.test:5001' } },
  invoke: context.invoke,
} as never);
assert.equal(mismatch.outcome, 'blocked');
if (mismatch.outcome === 'blocked') {
  assert.equal(mismatch.reason.message, 'BUILDKIT_PREFLIGHT_REGISTRY_MISMATCH');
}

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.preflight-contract', suite: 'buildkit' }));
