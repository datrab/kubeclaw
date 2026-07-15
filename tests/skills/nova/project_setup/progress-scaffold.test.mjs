import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const script = path.join(repoRoot, 'skills/nova/project_setup/tools/progress-scaffold.ts');

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'progress-scaffold-test-'));
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
  assert.match(scaffoldOutput, /Next: fill the scaffold gaps/);

  const scaffoldPath = path.join(swarm, 'progress.scaffold.json');
  const scaffold = readJson(scaffoldPath);
  assert.equal(scaffold.project, 'demo');
  assert.equal(scaffold.modules['01-foundation'].title, 'Foundation');
  assert.deepEqual(scaffold.modules['01-foundation'].stages, ['forge', 'buster']);
  assert.deepEqual(scaffold.modules['01-foundation'].test_suites, ['build', 'health', 'unit']);
  assert.equal(scaffold.gates['module-01-review'].on_fail, 'stop');
  assert.ok(scaffold.execution_order.some((entry) => entry.startsWith('TODO:')));

  assert.throws(
    () => run(root, ['--project', 'demo', '--apply']),
    /progress scaffold validation failed/,
  );

  scaffold.description = 'Demo project';
  scaffold.notes = ['No preview for the scaffold test.'];
  scaffold.execution_order = ['01-foundation', 'gate:module-01-review'];
  writeFile(scaffoldPath, `${JSON.stringify(scaffold, null, 2)}\n`);

  const applyOutput = run(root, ['--project', 'demo', '--apply']);
  assert.match(applyOutput, /wrote Projects\/demo\/src\/\.swarm\/progress\.json/);

  const progress = readJson(path.join(swarm, 'progress.json'));
  assert.equal(progress.project, 'demo');
  assert.deepEqual(progress.execution_order, ['01-foundation', 'gate:module-01-review']);
  assert.equal(progress.gates['module-01-review'].on_fail, 'stop');
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
