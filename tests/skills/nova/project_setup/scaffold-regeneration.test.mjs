import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const cli = path.resolve(import.meta.dirname, '../../../../skills/nova/project_setup/tools/progress-scaffold.ts');
function project(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-regeneration-'));
  const swarm = path.join(root, 'Projects/demo/src/.swarm');
  const scaffold = path.join(swarm, 'progress.scaffold.json');
  const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  const command = (...args) => execFileSync(process.execPath, [cli, '--repo', root, '--project', 'demo', ...args], { encoding: 'utf8', stdio: 'pipe' });
  try {
    execFileSync('git', ['init', '-q', root]);
    fs.mkdirSync(path.join(swarm, 'modules/01-app'), { recursive: true });
    fs.writeFileSync(path.join(swarm, 'modules/01-app/FORGE.md'), '# App\nBuild the app.\n');
    fs.writeFileSync(path.join(swarm, 'modules/01-app/BUSTER.md'), '# Tests\nVerify HTTP health.\n');
    command();
    const value = JSON.parse(fs.readFileSync(scaffold, 'utf8'));
    value.description = 'Actual scaffold CLI regression';
    value.notes = ['Local file verification, no deployment.'];
    value.execution_order = ['01-app'];
    value.pipeline.modules['01-app'].tests['http-health'].config.url = 'http://app.demo.svc.cluster.local:3000';
    write(scaffold, value);
    run({ root, swarm, scaffold, value, write, command });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('generate-edit-generate-check preserves every edited provider field before apply', () => project(({ swarm, scaffold, value, write, command }) => {
  const testNode = value.pipeline.modules['01-app'].tests['http-health'];
  testNode.config.path = '/ready';
  testNode.config.expectedStatuses = [200, 204];
  testNode.retries = 1;
  value.pipeline.modules['01-app'].concurrencyLimits.http = 2;
  write(scaffold, value);
  command();
  const next = JSON.parse(fs.readFileSync(scaffold, 'utf8'));
  assert.deepEqual(next.pipeline, value.pipeline);
  command('--check');
  command('--apply');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(swarm, 'pipeline.json'), 'utf8')), value.pipeline);
}));

test('scaffold edits remain authoritative over a separately changed applied pipeline', () => project(({ swarm, scaffold, value, write, command }) => {
  command('--apply');
  const applied = structuredClone(value.pipeline);
  applied.modules['01-app'].tests['http-health'].config.url = 'http://different.demo.svc.cluster.local';
  write(path.join(swarm, 'pipeline.json'), applied);
  command();
  assert.deepEqual(JSON.parse(fs.readFileSync(scaffold, 'utf8')).pipeline, value.pipeline);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(swarm, 'pipeline.json'), 'utf8')), applied);
}));

test('newly discovered modules leave existing plans intact and explicitly require their own plan', () => project(({ swarm, scaffold, value, command }) => {
  const directory = path.join(swarm, 'modules/02-api');
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'FORGE.md'), '# API\nImplement API.\n');
  fs.writeFileSync(path.join(directory, 'BUSTER.md'), '# Tests\nCheck API.\n');
  const output = command();
  assert.deepEqual(JSON.parse(fs.readFileSync(scaffold, 'utf8')).pipeline, value.pipeline);
  assert.match(output, /pipeline\.modules\.02-api/u);
  assert.throws(() => command('--check'), /progress scaffold validation failed/u);
}));

test('invalid prior pipeline fails before any scaffold overwrite', () => project(({ root, scaffold, value, write }) => {
  value.pipeline = { project: 'other' };
  write(scaffold, value);
  const before = fs.readFileSync(scaffold);
  const result = spawnSync(process.execPath, [cli, '--repo', root, '--project', 'demo'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SCAFFOLD_PIPELINE_INVALID/u);
  assert.deepEqual(fs.readFileSync(scaffold), before);
}));
