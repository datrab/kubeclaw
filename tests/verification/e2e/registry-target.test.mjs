import test from 'node:test';
import assert from 'node:assert/strict';
import { realE2ERegistryTarget, realE2EDeploymentImage } from './registry-target.mjs';
import { registryTestContract } from './registry-test-contract.mjs';
import { applyRealE2EScenario } from './failure-scenarios.mjs';
import { buildProgress } from './real-run-workspace.mjs';

const seed = `registry.example.test:5443/project/app:v1@sha256:${'a'.repeat(64)}`;
const environment = { KUBECLAW_REGISTRY_CONFIG: registryTestContract, REAL_E2E_DEPLOYMENT_IMAGE: seed };

test('operator registry projection does not resolve or expose credentials', () => {
  assert.deepEqual(realE2ERegistryTarget(environment), {
    origin: 'https://registry.example.test:5443', host: 'registry.example.test:5443',
  });
  assert.deepEqual(realE2EDeploymentImage(environment), {
    reference: seed, repository: 'project/app', digest: `sha256:${'a'.repeat(64)}`,
  });
});

test('seed image cannot select another registry, mutable tag or malformed reference', () => {
  for (const image of [seed.replace('registry.example.test', 'foreign.example.test'),
    seed.replace(':5443', ':5444'), seed.split('@')[0], ` ${seed}`, `${seed}\n`,
    seed.replace('project/app', '../app'), seed.replace('project/app', 'project//app'),
    seed.replace('project/app', 'project/%2e%2e/app')]) {
    assert.throws(() => realE2EDeploymentImage({ ...environment, REAL_E2E_DEPLOYMENT_IMAGE: image }),
      /REAL_E2E_DEPLOYMENT_IMAGE_(INVALID|REGISTRY_MISMATCH)/u);
  }
  assert.throws(() => realE2ERegistryTarget({}), /REAL_E2E_REGISTRY_CONFIG_REQUIRED/u);
  assert.throws(() => realE2ERegistryTarget({ ...environment, KUBECLAW_LOCAL_REGISTRY: '' }),
    /REAL_E2E_LEGACY_REGISTRY_OVERRIDE/u);
});

test('original workspace and failure mutation select the same configured authority', () => {
  const previous = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]));
  Object.assign(process.env, environment);
  try {
    const progress = buildProgress({ projectName: 'registry-target-regression' });
    assert.equal(progress.contracts.deployable_artifact.image.reference, seed);
    const changed = applyRealE2EScenario(progress, 'registry-pull-failure').progress;
    assert.equal(changed.real_e2e.kubernetes_fixture.image.reference,
      `registry.example.test:5443/real-e2e-intentional-missing@sha256:${'f'.repeat(64)}`);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
