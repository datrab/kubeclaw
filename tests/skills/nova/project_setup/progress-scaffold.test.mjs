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
  writeFile(path.join(swarm, 'progress.json'), `${JSON.stringify({
    project: 'demo', version: 1, description: 'Demo project', notes: ['Migration test.'],
    execution_order: ['01-foundation'], modules: { '01-foundation': {
      title: 'Foundation', dir: '01-foundation', depends_on: [], stages: ['forge', 'buster'],
      test_suites: ['build', 'health', 'api'], test_config: { serve: { type: 'server', port: 3000,
        health_path: '/ready', health_retries: 4, health_timeout: 9000,
        smoke_paths: ['/status'], smoke_expected_text: { '/status': 'ok' } },
        api: { spec_file: 'modules/01-foundation/test-spec.json' } },
    } }, gates: {},
  }, null, 2)}\n`);
  writeFile(path.join(swarm, 'modules/01-foundation/test-spec.json'), '{}\n');
  writeFile(path.join(swarm, 'pipeline.json'), `${JSON.stringify({ project: 'demo', modules: {
    '01-foundation': { suites: { unit: { uses: 'kubeclaw.unit-suite@1' } } },
  }, gates: {} }, null, 2)}\n`);

  run(root, ['--project', 'demo']);
  const scaffoldPath = path.join(swarm, 'progress.scaffold.json');
  const scaffold = readJson(scaffoldPath);
  const module = scaffold.modules['01-foundation'];
  assert.deepEqual(module.test_suites, ['api']);
  assert.equal(JSON.stringify(module.test_config).includes('health_path'), false);
  assert.equal(scaffold.pipeline.modules['01-foundation'].suites.unit.uses, 'kubeclaw.unit-suite@1');
  assert.equal(scaffold.pipeline.modules['01-foundation'].tests['http-health'].config.path, '/ready');
  assert.equal(scaffold.pipeline.modules['01-foundation'].tests['http-health'].retries, 3);
  assert.deepEqual(scaffold.pipeline.modules['01-foundation'].tests['smoke-1'].needs, ['http-health']);
  assert.equal(scaffold.pipeline.modules['01-foundation'].tests['smoke-1'].config.expectedText, 'ok');

  scaffold.pipeline.modules['01-foundation'].tests['http-health'].config.url = 'http://demo.default.svc.cluster.local:3000';
  scaffold.pipeline.modules['01-foundation'].tests['smoke-1'].config.url = 'http://demo.default.svc.cluster.local:3000';
  writeFile(scaffoldPath, `${JSON.stringify(scaffold, null, 2)}\n`);
  run(root, ['--project', 'demo', '--apply']);
  const progress = readJson(path.join(swarm, 'progress.json'));
  assert.deepEqual(progress.modules['01-foundation'].test_suites, ['api']);
  assert.equal(JSON.stringify(progress).includes('health_path'), false);
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
