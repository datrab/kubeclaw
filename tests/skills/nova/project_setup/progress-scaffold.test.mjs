import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const script = path.join(repoRoot, 'skills/nova/project_setup/tools/progress-scaffold.ts');
const tempRepos = new Set();

after(() => {
  for (const root of tempRepos) fs.rmSync(root, { recursive: true, force: true });
});

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'progress-scaffold-test-'));
  tempRepos.add(root);
  fs.mkdirSync(path.join(root, '.git'));
  return root;
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function run(root, args, options = {}) {
  return execFileSync(process.execPath, [script, '--repo', root, ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
  });
}

function runFailure(root, args) {
  try {
    run(root, args);
  } catch (error) {
    return `${error.stdout || ''}${error.stderr || ''}${error.message || ''}`;
  }
  throw new Error(`Expected progress scaffold command to fail: ${args.join(' ')}`);
}

function createBasicProject(root) {
  const swarm = path.join(root, 'Projects/demo/src/.swarm');
  writeFile(path.join(swarm, 'modules/01-foundation/FORGE.md'), `# Module 01 — Foundation

## Goal
Build a small app.

## Unit Tests (node:test)
Write real tests.
`);
  writeFile(path.join(swarm, 'modules/01-foundation/BUSTER.md'), `# Module 01 — BUSTER Test Instructions

## Test Scope
Build, health, and unit validation.
`);
  writeFile(path.join(swarm, 'echo-review/MODULE-01-REVIEW-INSTRUCTIONS.md'), `# Module 01 Review

Return PASS or FAIL.
`);
  return swarm;
}

test('progress scaffold writes a fillable form and apply writes progress.json after gaps are filled', () => {
  const root = makeRepo();
  const swarm = createBasicProject(root);

  const scaffoldOutput = run(root, ['--project', 'demo']);
  assert.match(scaffoldOutput, /progress scaffold diagnostics/);
  assert.match(scaffoldOutput, /Next: fill the progress and provider-plan gaps/);

  const scaffoldPath = path.join(swarm, 'progress.scaffold.json');
  const scaffold = readJson(scaffoldPath);
  assert.equal(scaffold.project, 'demo');
  assert.equal(scaffold.modules['01-foundation'].title, 'Foundation');
  assert.deepEqual(scaffold.modules['01-foundation'].stages, ['forge', 'buster']);
  assert.deepEqual(scaffold.modules['01-foundation'].test_suites, []);
  assert.equal(scaffold.modules['01-foundation'].test_config?.unit, undefined);
  assert.equal(scaffold.pipeline.modules['01-foundation'].tests['http-health'].uses, 'kubeclaw.http@1');
  assert.equal(scaffold.pipeline.modules['01-foundation'].tests['http-health'].config.path, '/');
  assert.equal(scaffold.gates['module-01-review'].on_fail, 'stop');
  assert.ok(scaffold.execution_order.some((entry) => entry.startsWith('TODO:')));

  assert.throws(
    () => run(root, ['--project', 'demo', '--apply']),
    /progress scaffold validation failed/,
  );

  scaffold.description = 'Demo project';
  scaffold.notes = ['No preview for the scaffold test.'];
  scaffold.execution_order = ['01-foundation', 'gate:module-01-review'];
  scaffold.pipeline.modules['01-foundation'].tests['http-health'].config.url = 'http://service.demo.svc.cluster.local:3000';
  writeFile(scaffoldPath, `${JSON.stringify(scaffold, null, 2)}\n`);

  const applyOutput = run(root, ['--project', 'demo', '--apply']);
  assert.match(applyOutput, /wrote Projects\/demo\/src\/\.swarm\/progress\.json/);

  const progress = readJson(path.join(swarm, 'progress.json'));
  assert.equal(progress.project, 'demo');
  assert.deepEqual(progress.execution_order, ['01-foundation', 'gate:module-01-review']);
  assert.equal(progress.gates['module-01-review'].on_fail, 'stop');
  const pipeline = readJson(path.join(swarm, 'pipeline.json'));
  assert.equal(pipeline.modules['01-foundation'].tests['http-health'].uses, 'kubeclaw.http@1');
  assert.equal(pipeline.modules['01-foundation'].tests['http-health'].config.url, 'http://service.demo.svc.cluster.local:3000');
  assert.equal(JSON.stringify(progress).includes('health_path'), false);
  assert.equal(JSON.stringify(progress).includes('"health"'), false);
});

test('progress scaffold rejects removed visual-reg path alias', () => {
  const root = makeRepo();
  const swarm = createBasicProject(root);
  writeFile(path.join(swarm, 'baselines/visual-paths.json'), '[]\n');
  const scaffoldPath = path.join(swarm, 'progress.scaffold.json');
  writeFile(scaffoldPath, `${JSON.stringify({
    _schema: 'progress-scaffold/v1',
    project: 'demo',
    version: 1,
    description: 'Demo project',
    notes: ['No preview for the scaffold test.'],
    policy: {},
    execution_order: ['01-foundation'],
    modules: {
      '01-foundation': {
        title: 'Foundation',
        dir: '01-foundation',
        depends_on: [],
        stages: ['forge', 'buster'],
        test_suites: ['visual-reg'],
        test_config: {
          'visual-reg': {
            path: 'baselines/visual-paths.json',
          },
        },
      },
    },
    gates: {},
  }, null, 2)}\n`);

  const output = runFailure(root, ['--project', 'demo', '--apply']);

  assert.match(output, /visual-reg\.path is removed; use paths_file/);
  assert.match(output, /visual-reg\.paths_file must be a non-empty string/);
});

test('progress scaffold migrates legacy health settings into provider plan nodes', () => {
  const root = makeRepo();
  const swarm = createBasicProject(root);
  writeFile(path.join(root, 'Projects/demo/src/Dockerfile'), 'FROM scratch\n');
  writeFile(path.join(swarm, 'progress.json'), `${JSON.stringify({
    project: 'demo', version: 1, description: 'Demo project', notes: ['Migration test.'],
    execution_order: ['01-foundation'], modules: { '01-foundation': {
      title: 'Foundation', dir: '01-foundation', depends_on: [], stages: ['forge', 'buster'],
      test_suites: ['build', 'health', 'api'], test_config: { serve: { type: 'server', port: 3000,
        health_path: '/ready', health_retries: 4, health_timeout: 9000,
        smoke_paths: ['/status'], smoke_expected_text: { '/status': 'ok' } },
        api: { spec_file: '.swarm/modules/01-foundation/test-spec.json' } },
    } }, gates: {},
  }, null, 2)}\n`);
  writeFile(path.join(swarm, 'modules/01-foundation/test-spec.json'), `${JSON.stringify({
    schemaVersion: 'kubeclaw.api-flow.v1', steps: [{ id: 'health', method: 'GET', path: '/ready', expect: { status: 200 } }],
  }, null, 2)}\n`);
  writeFile(path.join(swarm, 'pipeline.json'), `${JSON.stringify({ project: 'demo', modules: {
    '01-foundation': { suites: { unit: { uses: 'kubeclaw.unit-suite@1' } } },
  }, gates: {} }, null, 2)}\n`);

  run(root, ['--project', 'demo']);
  const scaffoldPath = path.join(swarm, 'progress.scaffold.json');
  const scaffold = readJson(scaffoldPath);
  const module = scaffold.modules['01-foundation'];
  assert.deepEqual(module.test_suites, []);
  assert.equal(module.test_config?.api, undefined);
  assert.equal(String(JSON.stringify(module.test_config)).includes('health_path'), false);
  assert.equal(scaffold.pipeline.modules['01-foundation'].suites.unit.uses, 'kubeclaw.unit-suite@1');
  assert.equal(scaffold.pipeline.modules['01-foundation'].tests['container-build'].uses,
    'kubeclaw.container-build@1');
  assert.deepEqual(scaffold.pipeline.modules['01-foundation'].tests['container-build'].config, {
    buildContext: 'Projects/demo/src',
    definition: { type: 'dockerfile', dockerfile: 'Projects/demo/src/Dockerfile' },
    outputName: '01-foundation',
    platform: 'linux/amd64',
  });
  assert.equal(scaffold.pipeline.modules['01-foundation'].tests['http-health'].config.path, '/ready');
  assert.equal(scaffold.pipeline.modules['01-foundation'].tests['http-health'].retries, 3);
  assert.deepEqual(scaffold.pipeline.modules['01-foundation'].tests['smoke-1'].needs, ['http-health']);
  assert.equal(scaffold.pipeline.modules['01-foundation'].tests['smoke-1'].config.expectedText, 'ok');
  assert.equal(scaffold.pipeline.modules['01-foundation'].tests['api-flow'].uses, 'kubeclaw.api-flow@1');
  assert.equal(scaffold.pipeline.modules['01-foundation'].tests['api-flow'].config.flowFile,
    'Projects/demo/src/.swarm/modules/01-foundation/test-spec.json');

  scaffold.pipeline.modules['01-foundation'].tests['http-health'].config.url = 'http://demo.default.svc.cluster.local:3000';
  scaffold.pipeline.modules['01-foundation'].tests['smoke-1'].config.url = 'http://demo.default.svc.cluster.local:3000';
  scaffold.pipeline.modules['01-foundation'].tests['api-flow'].config.url = 'http://demo.default.svc.cluster.local:3000';
  writeFile(scaffoldPath, `${JSON.stringify(scaffold, null, 2)}\n`);
  run(root, ['--project', 'demo', '--apply']);
  const progress = readJson(path.join(swarm, 'progress.json'));
  assert.deepEqual(progress.modules['01-foundation'].test_suites, []);
  assert.equal(JSON.stringify(progress).includes('health_path'), false);
});

test('progress scaffold resolves a legacy API spec inside serve.project_dir', () => {
  const root = makeRepo();
  const swarm = createBasicProject(root);
  writeFile(path.join(root, 'Projects/demo/src/service/.swarm/api-flow.json'), `${JSON.stringify({
    schemaVersion: 'kubeclaw.api-flow.v1', steps: [
      { id: 'health', method: 'GET', path: '/health', expect: { status: 200 } },
    ],
  }, null, 2)}\n`);
  writeFile(path.join(swarm, 'progress.json'), `${JSON.stringify({
    project: 'demo', version: 1, description: 'Demo project', notes: ['Scoped API migration.'],
    execution_order: ['01-foundation'], modules: { '01-foundation': {
      title: 'Foundation', dir: '01-foundation', depends_on: [], stages: ['forge', 'buster'],
      test_suites: ['api'], test_config: {
        serve: { type: 'server', project_dir: 'Projects/demo/src/service', start_cmd: 'npm start', port: 3000 },
        api: { spec_file: '.swarm/api-flow.json' },
      },
    } }, gates: {},
  }, null, 2)}\n`);
  writeFile(path.join(swarm, 'pipeline.json'), `${JSON.stringify({ project: 'demo', modules: {}, gates: {} }, null, 2)}\n`);

  run(root, ['--project', 'demo']);
  const scaffold = readJson(path.join(swarm, 'progress.scaffold.json'));
  assert.equal(scaffold.pipeline.modules['01-foundation'].tests['api-flow'].config.flowFile,
    'Projects/demo/src/service/.swarm/api-flow.json');
});

test('progress scaffold orders a migrated API flow after its deployment fixture', () => {
  const root = makeRepo();
  const swarm = createBasicProject(root);
  writeFile(path.join(swarm, 'modules/01-foundation/api-flow.json'), `${JSON.stringify({
    schemaVersion: 'kubeclaw.api-flow.v1', steps: [
      { id: 'health', method: 'GET', path: '/health', expect: { status: 200 } },
    ],
  }, null, 2)}\n`);
  writeFile(path.join(swarm, 'progress.json'), `${JSON.stringify({
    project: 'demo', version: 1, description: 'Demo project', notes: ['Ordered API migration.'],
    execution_order: ['01-foundation'], modules: { '01-foundation': {
      title: 'Foundation', dir: '01-foundation', depends_on: [], stages: ['forge', 'buster'],
      test_suites: ['api'], test_config: { api: { spec_file: '.swarm/modules/01-foundation/api-flow.json' } },
    } }, gates: {},
  }, null, 2)}\n`);
  writeFile(path.join(swarm, 'pipeline.json'), `${JSON.stringify({ project: 'demo', modules: {
    '01-foundation': { fixtures: { deploy: { uses: 'kubeclaw.kubernetes-fixture@1', mode: 'blocking',
      config: { serviceName: 'demo', servicePort: 80 } } } },
  }, gates: {} }, null, 2)}\n`);

  run(root, ['--project', 'demo']);
  const node = readJson(path.join(swarm, 'progress.scaffold.json'))
    .pipeline.modules['01-foundation'].tests['api-flow'];
  assert.deepEqual(node.needs, ['deploy']);
  assert.deepEqual(node.inputs.deployment, {
    from: 'deploy', output: 'deployment', schemaId: 'kubeclaw.kubernetes-deployment-fixture@1',
  });
  assert.equal(node.config.url, undefined);
});

test('progress scaffold rejects a legacy API spec symlink outside the repository', () => {
  const root = makeRepo();
  const swarm = createBasicProject(root);
  const outside = path.join(path.dirname(root), `${path.basename(root)}-outside-api.json`);
  writeFile(outside, `${JSON.stringify({ schemaVersion: 'kubeclaw.api-flow.v1', steps: [] })}\n`);
  fs.symlinkSync(outside, path.join(swarm, 'outside-api.json'));
  writeFile(path.join(swarm, 'progress.json'), `${JSON.stringify({
    project: 'demo', version: 1, description: 'Demo project', notes: ['Symlink boundary test.'],
    execution_order: ['01-foundation'], modules: { '01-foundation': {
      title: 'Foundation', dir: '01-foundation', depends_on: [], stages: ['forge', 'buster'],
      test_suites: ['api'], test_config: { api: { spec_file: '.swarm/outside-api.json' } },
    } }, gates: {},
  }, null, 2)}\n`);
  writeFile(path.join(swarm, 'pipeline.json'), `${JSON.stringify({ project: 'demo', modules: {}, gates: {} }, null, 2)}\n`);

  try {
    assert.match(runFailure(root, ['--project', 'demo']), /LEGACY_API_SPEC_DENIED:01-foundation/u);
  } finally { fs.rmSync(outside, { force: true }); }
});

test('progress scaffold rejects legacy unit selection without an explicit provider node', () => {
  const root = makeRepo();
  const swarm = createBasicProject(root);
  writeFile(path.join(swarm, 'progress.json'), `${JSON.stringify({
    project: 'demo', version: 1, description: 'Demo project', notes: ['Unit migration test.'],
    execution_order: ['01-foundation'], modules: { '01-foundation': {
      title: 'Foundation', dir: '01-foundation', depends_on: [], stages: ['forge', 'buster'],
      test_suites: ['unit'], test_config: { unit: { test_cmd: 'npm test' } },
    } }, gates: {},
  }, null, 2)}\n`);
  assert.match(runFailure(root, ['--project', 'demo']),
    /LEGACY_UNIT_CONFIGURATION_RETIRED:01-foundation/);
});

test('progress scaffold accepts explicit direct-command replacement for legacy unit selection', () => {
  const root = makeRepo();
  const swarm = createBasicProject(root);
  writeFile(path.join(swarm, 'progress.json'), `${JSON.stringify({
    project: 'demo', version: 1, description: 'Demo project', notes: ['Unit migration test.'],
    execution_order: ['01-foundation'], modules: { '01-foundation': {
      title: 'Foundation', dir: '01-foundation', depends_on: [], stages: ['forge', 'buster'],
      test_suites: ['unit'], test_config: {},
    } }, gates: {},
  }, null, 2)}\n`);
  writeFile(path.join(swarm, 'pipeline.json'), `${JSON.stringify({ project: 'demo', modules: {
    '01-foundation': { tests: { unit: { uses: 'kubeclaw.direct-command@1', mode: 'blocking',
      retries: 0, concurrencyGroup: 'unit', config: { executable: 'npm', args: ['test'],
        workingDirectory: 'Projects/demo/src', resultMode: 'exit-code' } } },
      concurrencyLimits: { unit: 1 } },
  }, gates: {} }, null, 2)}\n`);
  run(root, ['--project', 'demo']);
  const scaffold = readJson(path.join(swarm, 'progress.scaffold.json'));
  assert.deepEqual(scaffold.modules['01-foundation'].test_suites, []);
  assert.equal(scaffold.pipeline.modules['01-foundation'].tests.unit.uses,
    'kubeclaw.direct-command@1');
});

test('progress scaffold migrates the legacy manifest suite into Nova lint inputs', () => {
  const root = makeRepo();
  const swarm = createBasicProject(root);
  writeFile(path.join(root, 'Projects/demo/src/k8s/deployment.yaml'), 'apiVersion: apps/v1\nkind: Deployment\nmetadata: { name: demo }\n');
  writeFile(path.join(root, 'Projects/demo/src/k8s/secret.yaml'), 'apiVersion: v1\nkind: Secret\nmetadata: { name: demo }\n');
  writeFile(path.join(swarm, 'progress.json'), `${JSON.stringify({
    project: 'demo', version: 1, description: 'Demo project', notes: ['Manifest migration test.'],
    execution_order: ['01-foundation'], modules: { '01-foundation': {
      title: 'Foundation', dir: '01-foundation', depends_on: [], stages: ['forge', 'buster'],
      test_suites: ['manifest'], test_config: { manifest: {
        deployment_yaml: 'Projects/demo/src/k8s/deployment.yaml',
        secret_yaml: 'Projects/demo/src/k8s/secret.yaml',
      } },
    } }, gates: {},
  }, null, 2)}\n`);

  run(root, ['--project', 'demo']);
  const scaffoldPath = path.join(swarm, 'progress.scaffold.json');
  const scaffold = readJson(scaffoldPath);
  assert.deepEqual(scaffold.modules['01-foundation'].test_suites, []);
  assert.equal(scaffold.modules['01-foundation'].test_config, undefined);
  assert.deepEqual(scaffold.pipeline.lint, {
    uses: 'kubeclaw.lint.full', policyProject: 'workspace',
    rawManifests: [
      'Projects/demo/src/k8s/deployment.yaml',
      'Projects/demo/src/k8s/secret.yaml',
    ],
    helmCharts: [],
  });

  scaffold.description = 'Demo project';
  scaffold.notes = ['Manifest migration test.'];
  scaffold.execution_order = ['01-foundation'];
  writeFile(scaffoldPath, `${JSON.stringify(scaffold, null, 2)}\n`);
  run(root, ['--project', 'demo', '--apply']);
  const progress = readJson(path.join(swarm, 'progress.json'));
  const pipeline = readJson(path.join(swarm, 'pipeline.json'));
  assert.equal(JSON.stringify(progress).includes('manifest'), false);
  assert.equal(pipeline.lint.uses, 'kubeclaw.lint.full');
});

test('progress scaffold rejects a legacy manifest selection without an explicit deployment input', () => {
  const root = makeRepo();
  const swarm = createBasicProject(root);
  writeFile(path.join(swarm, 'progress.json'), `${JSON.stringify({
    project: 'demo', version: 1, description: 'Demo project', notes: ['Manifest migration test.'],
    execution_order: ['01-foundation'], modules: { '01-foundation': {
      title: 'Foundation', dir: '01-foundation', depends_on: [], stages: ['forge', 'buster'],
      test_suites: ['manifest'], test_config: {},
    } }, gates: {},
  }, null, 2)}\n`);
  assert.match(runFailure(root, ['--project', 'demo']), /LEGACY_MANIFEST_DEPLOYMENT_MISSING:01-foundation/);
});

test('progress scaffold links the migrated container image to a Kubernetes fixture', () => {
  const root = makeRepo();
  const swarm = createBasicProject(root);
  writeFile(path.join(root, 'Projects/demo/src/containers/app/Dockerfile'), 'FROM scratch\n');
  writeFile(path.join(swarm, 'progress.json'), `${JSON.stringify({
    project: 'demo', version: 1, description: 'Demo project', notes: ['Build migration test.'],
    execution_order: ['01-foundation'], modules: { '01-foundation': {
      title: 'Foundation', dir: '01-foundation', depends_on: [], stages: ['forge', 'buster'],
      test_suites: ['build'], test_config: { serve: {
        build_context: 'Projects/demo/src/containers/app',
        dockerfile: 'Projects/demo/src/containers/app/Dockerfile',
        target: 'release', platform: 'linux/arm64', build_args: { NODE_ENV: 'production' },
      } },
    } }, gates: {},
  }, null, 2)}\n`);
  writeFile(path.join(swarm, 'pipeline.json'), `${JSON.stringify({ project: 'demo', modules: {
    '01-foundation': { fixtures: { deploy: { uses: 'kubeclaw.kubernetes-fixture@1', mode: 'blocking',
      config: { serviceName: 'demo', servicePort: 80 }, inputs: {
        'checked-manifest': { from: 'manifest', output: 'artifact-1' },
      } } } },
  }, gates: {} }, null, 2)}\n`);

  run(root, ['--project', 'demo']);
  const scaffold = readJson(path.join(swarm, 'progress.scaffold.json'));
  const plan = scaffold.pipeline.modules['01-foundation'];
  assert.deepEqual(scaffold.modules['01-foundation'].test_suites, []);
  assert.deepEqual(plan.tests['container-build'].config, {
    buildContext: 'Projects/demo/src/containers/app',
    definition: { type: 'dockerfile', dockerfile: 'Projects/demo/src/containers/app/Dockerfile',
      target: 'release', buildArgs: { NODE_ENV: 'production' } },
    outputName: '01-foundation', platform: 'linux/arm64',
  });
  assert.deepEqual(plan.fixtures.deploy.needs, ['container-build']);
  assert.deepEqual(plan.fixtures.deploy.inputs.image, {
    from: 'container-build', output: 'image', schemaId: 'kubeclaw.container-image@1',
  });
});

test('progress scaffold migrates the legacy bundle suite into an explicit size-budget plan', () => {
  const root = makeRepo();
  const swarm = createBasicProject(root);
  writeFile(path.join(root, 'Projects/demo/src/dist/index.html'), 'real build output\n');
  writeFile(path.join(swarm, 'progress.json'), `${JSON.stringify({
    project: 'demo', version: 1, description: 'Demo project', notes: ['Bundle migration test.'],
    execution_order: ['01-foundation'], modules: { '01-foundation': {
      title: 'Foundation', dir: '01-foundation', depends_on: [], stages: ['forge', 'buster'],
      test_suites: ['bundle'], test_config: { bundle: { www_dir: 'dist',
        thresholds: { max_size_kb: 64, max_file_count: 12 } } },
    } }, gates: {},
  }, null, 2)}\n`);
  writeFile(path.join(swarm, 'pipeline.json'), `${JSON.stringify({ project: 'demo', modules: {
    '01-foundation': { tests: { probe: { uses: 'kubeclaw.http@1', mode: 'blocking',
      config: { url: 'http://demo.default.svc.cluster.local:3000', path: '/', expectedStatuses: [200] } } } },
  }, gates: {} }, null, 2)}\n`);

  run(root, ['--project', 'demo']);
  const scaffoldPath = path.join(swarm, 'progress.scaffold.json');
  const scaffold = readJson(scaffoldPath);
  const module = scaffold.modules['01-foundation'];
  assert.deepEqual(module.test_suites, []);
  assert.equal(module.test_config, undefined);
  const plan = scaffold.pipeline.modules['01-foundation'];
  assert.equal(plan.tests['size-budget-artifact'].uses, 'kubeclaw.direct-command@1');
  assert.equal(plan.tests['size-budget-artifact'].config.workingDirectory, 'Projects/demo/src');
  assert.deepEqual(plan.tests['size-budget-artifact'].config.args.slice(-3), ['-C', 'dist', '.']);
  execFileSync('/usr/bin/tar', plan.tests['size-budget-artifact'].config.args, {
    cwd: path.join(root, plan.tests['size-budget-artifact'].config.workingDirectory),
  });
  const archived = execFileSync('/usr/bin/tar', ['-tf', path.join(root, 'Projects/demo/src/.swarm/size-budget-01-foundation.tar')], {
    encoding: 'utf8',
  });
  assert.match(archived, /^root\/$/mu);
  assert.match(archived, /^index\.html$/mu);
  assert.equal(plan.tests['size-budget'].uses, 'kubeclaw.size-budget@1');
  assert.equal(plan.tests['size-budget'].config.maximumTotalBytes, 65_536);
  assert.equal(plan.tests['size-budget'].config.maximumFileCount, 12);
  assert.deepEqual(plan.tests.probe.needs, ['size-budget']);
  assert.equal(plan.tests['http-health'], undefined,
    'an explicitly selected bundle migration does not add an unrelated HTTP node');

  scaffold.description = 'Demo project';
  scaffold.notes = ['Bundle migrated.'];
  writeFile(scaffoldPath, `${JSON.stringify(scaffold, null, 2)}\n`);
  run(root, ['--project', 'demo', '--apply']);
  const progress = readJson(path.join(swarm, 'progress.json'));
  const pipeline = readJson(path.join(swarm, 'pipeline.json'));
  assert.equal(JSON.stringify(progress).includes('bundle'), false);
  assert.equal(pipeline.modules['01-foundation'].tests['size-budget'].uses, 'kubeclaw.size-budget@1');
});

test('progress scaffold rejects a legacy bundle suite without an explicit output path', () => {
  const root = makeRepo();
  const swarm = createBasicProject(root);
  writeFile(path.join(swarm, 'progress.json'), `${JSON.stringify({
    project: 'demo', modules: { '01-foundation': { title: 'Foundation', dir: '01-foundation',
      stages: ['forge', 'buster'], test_suites: ['bundle'], test_config: { bundle: { thresholds: { max_size_kb: 64 } } } } },
    gates: {},
  })}\n`);
  assert.match(runFailure(root, ['--project', 'demo']), /LEGACY_BUNDLE_CONFIGURATION_RETIRED:01-foundation/u);
});

test('progress scaffold migrates a11y into an axe provider linked to the deployment', () => {
  const root = makeRepo(); const swarm = createBasicProject(root);
  writeFile(path.join(swarm, 'progress.json'), `${JSON.stringify({ project: 'demo', modules: { '01-foundation': {
    title: 'Foundation', dir: '01-foundation', stages: ['forge', 'buster'], test_suites: ['a11y'],
    test_config: { a11y: { path: '/account', tags: ['wcag2aa'], exclude: ['.third-party'], timeout: 20000 } },
  } }, gates: {} })}\n`);
  writeFile(path.join(swarm, 'pipeline.json'), `${JSON.stringify({ project: 'demo', modules: { '01-foundation': {
    fixtures: { deploy: { uses: 'kubeclaw.kubernetes-fixture@1', config: {} } },
  } }, gates: {} })}\n`);
  run(root, ['--project', 'demo']);
  const scaffold = readJson(path.join(swarm, 'progress.scaffold.json'));
  assert.deepEqual(scaffold.modules['01-foundation'].test_suites, []);
  assert.equal(scaffold.modules['01-foundation'].test_config, undefined);
  assert.deepEqual(scaffold.pipeline.modules['01-foundation'].tests.axe, {
    uses: 'kubeclaw.axe@1', mode: 'blocking', retries: 0, concurrencyGroup: 'browser-axe',
    config: { routes: ['/account'], profiles: ['desktop', 'mobile'], tags: ['wcag2aa'], exclude: ['.third-party'], timeoutMs: 20000 },
    needs: ['deploy'], inputs: { deployment: { from: 'deploy', output: 'deployment', schemaId: 'kubeclaw.kubernetes-deployment-fixture@1' } },
  });
});

test('progress scaffold rejects retired a11y numeric thresholds', () => {
  const root = makeRepo(); const swarm = createBasicProject(root);
  writeFile(path.join(swarm, 'progress.json'), `${JSON.stringify({ project: 'demo', modules: { '01-foundation': {
    title: 'Foundation', dir: '01-foundation', stages: ['forge', 'buster'], test_suites: ['a11y'],
    test_config: { a11y: { thresholds: { critical: 0 } } },
  } }, gates: {} })}\n`);
  assert.match(runFailure(root, ['--project', 'demo']), /LEGACY_A11Y_THRESHOLDS_RETIRED:01-foundation/u);
});

test('progress scaffold rejects an a11y timeout outside the provider contract', () => {
  const root = makeRepo(); const swarm = createBasicProject(root);
  writeFile(path.join(swarm, 'progress.json'), `${JSON.stringify({ project: 'demo', modules: { '01-foundation': {
    title: 'Foundation', dir: '01-foundation', stages: ['forge', 'buster'], test_suites: ['a11y'],
    test_config: { a11y: { timeout: 120001 } },
  } }, gates: {} })}\n`);
  assert.match(runFailure(root, ['--project', 'demo']), /LEGACY_A11Y_TIMEOUT_INVALID:01-foundation/u);
});

test('progress scaffold rejects retired a11y thresholds beside an existing Axe node', () => {
  const root = makeRepo(); const swarm = createBasicProject(root);
  writeFile(path.join(swarm, 'progress.json'), `${JSON.stringify({ project: 'demo', modules: { '01-foundation': {
    title: 'Foundation', dir: '01-foundation', stages: ['forge', 'buster'], test_suites: ['a11y'],
    test_config: { a11y: { thresholds: { serious: 0 } } },
  } }, gates: {} })}\n`);
  writeFile(path.join(swarm, 'pipeline.json'), `${JSON.stringify({ project: 'demo', modules: { '01-foundation': {
    tests: { axe: { uses: 'kubeclaw.axe@1', config: { url: 'https://example.invalid', routes: ['/'] } } },
  } }, gates: {} })}\n`);
  assert.match(runFailure(root, ['--project', 'demo']), /LEGACY_A11Y_THRESHOLDS_RETIRED:01-foundation/u);
});
