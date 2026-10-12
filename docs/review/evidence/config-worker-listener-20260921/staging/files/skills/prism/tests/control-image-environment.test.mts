import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {loadControlServerConfig} from '../server/control-config.ts';
import {controlPolicyFixture} from './fixtures/control-policy.mts';

function declaredFinalEnvironment(): NodeJS.ProcessEnv {
  const text = fs.readFileSync(new URL('../../../docker/Dockerfile.prism-control', import.meta.url), 'utf8');
  const lines = text.split('\n');
  const finalStage = lines.findLastIndex(line => line.startsWith('FROM '));
  assert.ok(finalStage >= 0);
  const declarations = lines.slice(finalStage).filter(line => /^ENV\s/u.test(line));
  assert.ok(declarations.length > 0);
  const environment: NodeJS.ProcessEnv = {};
  for (const line of declarations) {
    // Current image uses simple literal assignments. Fail on unsupported syntax;
    // never silently pretend to evaluate Docker expansion or inherited base ENV.
    assert.match(line, /^ENV [A-Z_][A-Z0-9_]*=[a-zA-Z0-9_./:-]+(?: [A-Z_][A-Z0-9_]*=[a-zA-Z0-9_./:-]+)*$/u);
    for (const assignment of line.slice(4).split(' ')) {
      const separator = assignment.indexOf('=');
      environment[assignment.slice(0, separator)] = assignment.slice(separator + 1);
    }
  }
  return environment;
}

for (const suffix of ['one', 'two']) {
  test(`actual Control image declarations and exact image proof accept authored profile ${suffix}`, t => {
    const expected = {artifactRoot: `/var/lib/prism/${suffix}`, studioPublicUrl: `https://${suffix}.example.test`,
      pipelinePreferenceSubject: `user-${(suffix === 'one' ? 'a' : 'b').repeat(24)}`};
    const {SWARM_CONFIG} = controlPolicyFixture(t, expected);
    const environment = {...declaredFinalEnvironment(), SWARM_CONFIG,
      PRISM_SESSION_SECRET: 'test-session', PRISM_INGRESS_SECRET: 'test-ingress',
      PRISM_INGESTION_SECRET: 'test-ingestion', PRISM_DISPATCH_SECRET: 'test-dispatch', PRISM_WORKER_SECRET: 'test-worker'};
    const actual = loadControlServerConfig(environment);
    for (const key of ['artifactRoot', 'studioPublicUrl', 'pipelinePreferenceSubject'] as const) {
      assert.equal(actual[key], expected[key]);
    }
    const loader = fileURLToPath(new URL('./fixtures/image-source-loader.mjs', import.meta.url));
    const proof = fileURLToPath(new URL('../../../tests/verification/deployment/prism-swarm-image.mjs', import.meta.url));
    const childEnvironment: NodeJS.ProcessEnv = {...process.env, ...environment};
    delete childEnvironment.NODE_TEST_CONTEXT;
    const invoke = (env: NodeJS.ProcessEnv) => spawnSync(process.execPath, ['--import', loader, proof, 'prism-control'],
      {env, encoding: 'utf8', timeout: 15000});
    const passed = invoke(childEnvironment);
    assert.equal(passed.status, 0, passed.stdout + passed.stderr);
    assert.match(passed.stdout, /PRISM_SWARM_IMAGE_LOADER_VERIFIED/u);
    const conflict = invoke({...childEnvironment, ARTIFACT_ROOT: '/retired-image-author'});
    assert.notEqual(conflict.status, 0);
    assert.match(conflict.stderr, /SWARM_CONFIG_LEGACY_OVERRIDE:ARTIFACT_ROOT/u);
    const portConflict = invoke({...childEnvironment, PORT: '8080'});
    assert.notEqual(portConflict.status, 0);
    assert.match(portConflict.stderr, /SWARM_CONFIG_LEGACY_OVERRIDE:PORT/u);
  });
}

test('image proof requires the selected role and rejects the retired Worker PORT author', t => {
  const {SWARM_CONFIG} = controlPolicyFixture(t, {});
  const loader = fileURLToPath(new URL('./fixtures/image-source-loader.mjs', import.meta.url));
  const proof = fileURLToPath(new URL('../../../tests/verification/deployment/prism-swarm-image.mjs', import.meta.url));
  const environment: NodeJS.ProcessEnv = {...process.env, SWARM_CONFIG, PORT: '23458'};
  delete environment.NODE_TEST_CONTEXT;
  for (const role of [undefined, 'unknown', 'prism-worker']) {
    const args = ['--import', loader, proof, ...(role ? [role] : [])];
    const child = spawnSync(process.execPath, args, {env: environment, encoding: 'utf8', timeout: 15000});
    if (role === 'prism-worker') {
      assert.notEqual(child.status, 0);
      assert.match(child.stderr, /SWARM_CONFIG_LEGACY_OVERRIDE:PORT/u);
    } else {
      assert.notEqual(child.status, 0); assert.match(child.stderr, /explicit image role required/u);
    }
  }
});
