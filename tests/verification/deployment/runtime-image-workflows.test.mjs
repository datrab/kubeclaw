import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import YAML from 'yaml';

const read = name => YAML.parse(fs.readFileSync(`.github/workflows/${name}.yaml`, 'utf8'));
const main = read('build-images'), pr = read('role-images');

test('each runtime is built once per event and PR builds cannot publish', () => {
  assert.equal(Object.values(main.jobs).some(job => job.uses?.endsWith('/role-images.yaml')), false);
  assert.equal(main.on.pull_request, undefined);
  assert.equal(pr.on.push, undefined);
  assert.equal(pr.on.workflow_call, undefined);
  assert.deepEqual(pr.permissions, { contents: 'read' });
  const names = main.jobs.build.strategy.matrix.name;
  assert.deepEqual(names, pr.jobs.image.strategy.matrix.name);
  assert.equal(new Set(names).size, 10);
  for (const name of names) assert(fs.existsSync(`docker/Dockerfile.${name}`));
  for (const job of [main.jobs.build, pr.jobs.image]) {
    assert.equal(job.steps.filter(step => step.uses?.startsWith('docker/build-push-action@')).length, 1);
    assert.equal(job.steps.some(step => step.run?.includes('docker build')), false);
  }
  const proof = pr.jobs.image.steps.find(step => step.uses?.startsWith('docker/build-push-action@'));
  assert.equal(proof.with.push, false);
  assert.equal(proof.with.load, true);
  assert.doesNotMatch(JSON.stringify(pr), /login-action|secrets\.|github\.token|upload-artifact/u);
});

test('immutable candidate checks precede release receipts and share PR acceptance', () => {
  const steps = main.jobs.build.steps;
  const build = steps.findIndex(step => step.id === 'build');
  const verify = steps.findIndex(step => step.name === 'Verify the exact published artifact');
  const receipt = steps.findIndex(step => step.name === 'Record immutable build receipt');
  const upload = steps.findIndex(step => step.uses?.startsWith('actions/upload-artifact@'));
  assert(build < verify && verify < receipt && receipt < upload);
  assert.match(steps[verify].env.IMAGE, /@\$\{\{ steps\.build\.outputs\.digest \}\}$/u);
  for (const role of ['nova', 'prism-agent', 'buster-gateway', 'buster-runtime']) assert(steps[verify].if.includes(`"${role}"`));
  const shared = 'bash scripts/check-built-runtime-image.sh "$ROLE" "$IMAGE"';
  assert(steps[verify].run.includes(shared));
  assert(pr.jobs.image.steps.some(step => step.run === shared));
  assert.equal(steps[receipt].if, undefined);
  assert.equal(steps[upload].if, undefined);
  assert.equal(main.jobs['preserve-receipts'].needs, 'build');
  assert.equal(main.jobs['prism-live-acceptance'].needs, 'build');
});

test('bundle publication rejects failed or cancelled image proofs while allowing code-only changes', () => {
  const job = main.jobs['bundle-skills'];
  assert(job.needs.includes('build'));
  // Exercise the repository-owned expression; GitHub executes the actual job graph in CI.
  const evaluate = Function('needs', 'github', 'always', `return (${job.if.replaceAll("needs.update-policy", "needs[\"update-policy\"]").replaceAll("needs.detect-build-inputs", "needs[\"detect-build-inputs\"]")});`);
  for (const result of ['success', 'failure', 'cancelled', 'skipped']) {
    for (const changed of ['true', 'false']) {
      for (const event of ['push', 'workflow_dispatch']) {
        const needs = { build: { result }, reliability: { result: 'success' },
          'update-policy': { result: 'success' }, 'detect-build-inputs': { outputs: { image_inputs_changed: changed, deployment_inputs_changed: 'true' } } };
        const allowed = result === 'success' || (result === 'skipped' && changed === 'false');
        assert.equal(evaluate(needs, { event_name: event }, () => true), allowed);
        needs.reliability.result = 'failure';
        assert.equal(evaluate(needs, { event_name: event }, () => true), false);
      }
    }
  }
});
