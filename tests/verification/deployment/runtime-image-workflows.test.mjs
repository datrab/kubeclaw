import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';
import { runtimeImages } from '../../../scripts/updates/runtime-components.mjs';

const read = name => YAML.parse(fs.readFileSync(`.github/workflows/${name}.yaml`, 'utf8'));
const main = read('build-images'), pr = read('role-images'), updates = read('update-checks'), promote = read('promote-runtime');

test('update checks validate previous release selections while replacements build', () => {
  const run = updates.jobs.policy.steps.find(step => step.name === 'Check generated versions and release receipt validation').run;
  assert.match(run, /materialize-release\.mjs --check --check-selected-source(?: --family=ops)?/u);
  assert.match(run, /materialize-release\.mjs --check --check-selected-source --family=ops/u);
});

test('ops promotion updates the Argo definition without authorizing a workload sync', () => {
  const prepare = promote.jobs.prepare.steps.find(step => step.name === 'Prepare release selection and values').run;
  const select = promote.jobs.prepare.steps.find(step => step.name === 'Select Ops release on main');
  assert.match(prepare, /if \[\[ "\$RELEASE_FAMILY" == ops \]\]; then\s+node scripts\/argocd-self-management\.mjs/u);
  assert.equal(select.if, "inputs.family == 'ops'");
  assert.match(select.run, /git add releases gitops\/platform\/bootstrap\/codex-ops\.yaml/u);
  assert.match(select.run, /git push origin HEAD:main/u);
  const app = YAML.parse(fs.readFileSync('gitops/platform/bootstrap/codex-ops.yaml', 'utf8'));
  assert.equal(app.spec.syncPolicy.automated, undefined);
});

test('each runtime is built once per event and PR builds cannot publish', () => {
  assert.equal(Object.values(main.jobs).some(job => job.uses?.endsWith('/role-images.yaml')), false);
  assert.equal(main.on.pull_request, undefined);
  assert.equal(pr.on.push, undefined);
  assert.equal(pr.on.workflow_call, undefined);
  assert.deepEqual(pr.permissions, { contents: 'read' });
  assert.match(main.jobs.build.strategy.matrix.name, /fromJSON\(needs.detect-build-inputs.outputs.image_matrix\)/u);
  assert.match(pr.jobs.image.strategy.matrix.name, /fromJSON\(needs.inputs.outputs.image_matrix\)/u);
  const names = runtimeImages;
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
  assert.deepEqual(main.jobs['prism-live-acceptance'].needs, ['build', 'detect-build-inputs']);
  for (const service of ['control', 'studio', 'worker', 'ingestion']) assert(main.jobs['prism-live-acceptance'].if.includes(`'prism-${service}'`));
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


test('bundle checksum assets remain nonempty with zero, one or all changed roles', () => {
  const run = main.jobs['bundle-skills'].steps.find(step => step.name === 'Record bundle checksums and source identity').run;
  // Execute the actual workflow checksum command against each publication shape.
  const checksum = run.slice(run.indexOf('(cd dist;'));
  assert(checksum.startsWith('(cd dist;'));
  for (const roles of [[], ['buster'], ['nova', 'buster', 'prism']]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-checksums-'));
    try {
      fs.mkdirSync(path.join(root, 'dist'));
      fs.writeFileSync(path.join(root, 'dist/runtime-code.json'), '{"bundles":{}}\n');
      for (const role of roles) fs.writeFileSync(path.join(root, `dist/${role}-test.tgz`), `bundle:${role}`);
      execFileSync('bash', ['-e', '-o', 'pipefail', '-c', checksum], { cwd: root, env: { ...process.env, GITHUB_SHA: 'test' } });
      const manifest = fs.readFileSync(path.join(root, 'dist/SHA256SUMS-test.txt'), 'utf8');
      assert.equal(manifest.trim().split('\n').length, roles.length + 1);
      assert.match(manifest, /  \.\/runtime-code\.json\n/u);
      execFileSync('sha256sum', ['--check', 'SHA256SUMS-test.txt'], { cwd: path.join(root, 'dist') });
      // A changed receipt must invalidate the published checksum even without bundles.
      fs.appendFileSync(path.join(root, 'dist/runtime-code.json'), ' ');
      assert.throws(() => execFileSync('sha256sum', ['--check', 'SHA256SUMS-test.txt'], { cwd: path.join(root, 'dist'), stdio: 'pipe' }));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
});

test('runtime refresh plan reaches detector, bundles and reusable receipt collector unchanged', () => {
  assert.equal(main.on.workflow_dispatch.inputs.runtime_refresh_plan.type, 'string');
  assert.equal(main.on.workflow_dispatch.inputs.runtime_refresh_plan.default, '');
  const expression = "${{ inputs.runtime_refresh_plan || '' }}";
  assert.equal(main.env.RUNTIME_REFRESH_PLAN, expression);
  assert.equal(main.jobs['preserve-receipts'].with.runtime_refresh_plan, expression);
  const receipt = read('publish-image-receipts');
  assert.equal(receipt.on.workflow_call.inputs.runtime_refresh_plan.default, '');
  const collector = receipt.jobs.preserve.steps.find(step => step.env?.FAMILY);
  assert.equal(collector.env.RUNTIME_REFRESH_PLAN, '${{ inputs.runtime_refresh_plan }}');
  for (const name of ['detect-build-inputs', 'bundle-skills']) {
    assert.equal(main.jobs[name].env?.RUNTIME_REFRESH_PLAN, undefined,
      `${name} must inherit the same workflow plan without overriding it`);
  }
});

test('retained components are authenticated before either receipt producer runs', () => {
  const bundles = main.jobs['bundle-skills'];
  assert.ok(bundles, 'bundle publisher job exists');
  assert.equal(bundles.permissions.actions, 'read');
  const check = (steps, producer) => {
    const auth = steps.findIndex(step => step.run === 'node scripts/updates/verify-release-source.mjs');
    assert.ok(auth >= 0);
    assert.ok(auth < steps.findIndex(step => step.name === producer));
    assert.equal(steps[auth].env.GITHUB_TOKEN, '${{ github.token }}');
    return steps[auth];
  };
  check(bundles.steps, 'Build changed role bundles');
  const receipt = read('publish-image-receipts');
  assert.equal(check(receipt.jobs.preserve.steps,
    'Preserve immutable source record beyond CI artifact retention').if, "inputs.family == 'runtime'");
});


test('immutable baseline is identical for planners, authentication and both producers', () => {
  const expression = "${{ inputs.retained_baseline || '' }}";
  assert.equal(main.on.workflow_dispatch.inputs.retained_baseline.default, '');
  assert.equal(main.env.GITOPS_RETAINED_BASELINE, expression);
  assert.equal(main.jobs['preserve-receipts'].with.retained_baseline, expression);
  const receipt = read('publish-image-receipts');
  assert.equal(receipt.on.workflow_call.inputs.retained_baseline.default, '');
  assert.equal(receipt.env.GITOPS_RETAINED_BASELINE, expression);
  for (const name of ['detect-build-inputs', 'bundle-skills']) {
    assert.equal(main.jobs[name].env?.GITOPS_RETAINED_BASELINE, undefined);
    for (const step of main.jobs[name].steps) {
      assert.equal(step.env?.GITOPS_RETAINED_BASELINE, undefined);
    }
  }
  for (const step of receipt.jobs.preserve.steps) {
    assert.equal(step.env?.GITOPS_RETAINED_BASELINE, undefined);
  }
});
