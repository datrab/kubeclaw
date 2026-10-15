import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {publishedControlConfig} from './fixtures/published-config.mjs';
import path from 'node:path';

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
  test(`actual Control image declarations and exact image proof accept authored profile ${suffix}`, async t => {
    const expected = {artifactRoot: `/var/lib/prism/${suffix}`, studioPublicUrl: `https://${suffix}.example.test`,
      pipelinePreferenceSubject: `user-${(suffix === 'one' ? 'a' : 'b').repeat(24)}`};
    const f = await publishedControlConfig(t, expected);
    const environment = {...declaredFinalEnvironment(),
      PRISM_SESSION_SECRET: 'test-session', PRISM_INGRESS_SECRET: 'test-ingress',
      PRISM_INGESTION_SECRET: 'test-ingestion', PRISM_DISPATCH_SECRET: 'test-dispatch', PRISM_WORKER_SECRET: 'test-worker'};
    const actual = f.loadControlServerConfig(f.capture,environment);
    for (const key of ['artifactRoot', 'studioPublicUrl', 'pipelinePreferenceSubject'] as const) {
      assert.equal(actual[key], expected[key]);
    }
    const loader = fileURLToPath(new URL('./fixtures/image-source-loader.mjs', import.meta.url));
    const proof = fileURLToPath(new URL('../../../tests/verification/deployment/prism-swarm-image.mjs', import.meta.url));
    const childEnvironment: NodeJS.ProcessEnv = {...process.env, ...environment, PIPELINE_IMAGE_TEST_ROOT:path.join(f.root,'role')};
    delete childEnvironment.NODE_TEST_CONTEXT;
    const program = `const {capturePipelineBootReceipts}=await import(${JSON.stringify(new URL('file://' + path.join(f.root,'role/skills/packages/plugin-foundation/config/pipeline-boot.mjs')).href)});const capture=capturePipelineBootReceipts(${JSON.stringify(path.join(f.root,'transport'))},${JSON.stringify(path.join(f.root,'generation/system'))},'prism-control',process.env.PIPELINE_IMAGE_TEST_ROOT,'/app/prism/skills');const {verifyPrismImageConfiguration}=await import(${JSON.stringify(new URL('file://' + proof).href)});await verifyPrismImageConfiguration(capture,'prism-control',process.env);console.log('PRISM_SWARM_IMAGE_LOADER_VERIFIED');`;
    const invoke = (env: NodeJS.ProcessEnv) => spawnSync(process.execPath, ['--import', loader, '--input-type=module', '-e', program],
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

test('image proof requires explicit role and authenticated delivery rather than a legacy source author', () => {
  const proof = fileURLToPath(new URL('../../../tests/verification/deployment/prism-swarm-image.mjs', import.meta.url));
  const invalid = spawnSync(process.execPath,[proof,'unknown'],{encoding:'utf8',timeout:5000});
  assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/explicit image role required/);
});
