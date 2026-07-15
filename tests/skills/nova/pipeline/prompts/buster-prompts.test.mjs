import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { buildBusterGatePrompt } from '../../../../../skills/nova/pipeline/prompts/buster-gate.ts';
import { buildBusterModulePrompt } from '../../../../../skills/nova/pipeline/prompts/buster-module.ts';

function makeConfig(projectDirName = "work dir/one; touch bad'file") {
  const root = fs.mkdtempSync(path.join('/home', 'buster-prompt-'));
  const projectSrc = path.join(root, projectDirName);
  const swarmDir = path.join(projectSrc, '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  fs.mkdirSync(modulesDir, { recursive: true });
  return {
    project: 'test-project',
    repo_root: root,
    paths: {
      project_src_dir: projectSrc,
      swarm_dir: swarmDir,
      modules_dir: modulesDir,
    },
  };
}

test('buster gate prompt shell-quotes project source cd command', () => {
  const config = makeConfig();
  const prompt = buildBusterGatePrompt(
    config,
    'security',
    { title: 'Security', output_file: 'gate-output.json' },
    'run checks',
    'abcdef123456',
  ).prompt;

  assert.match(prompt, /`cd -- 'work dir\/one; touch bad'\\''file'` before running any tests\./);
  assert.doesNotMatch(prompt, /`cd work dir\/one; touch bad/);
});

test('buster module prompt shell-quotes project source cd command with leading hyphen', () => {
  const config = makeConfig('-work dir/one; touch bad');
  const moduleDir = 'app';
  fs.mkdirSync(path.join(config.paths.modules_dir, moduleDir), { recursive: true });
  fs.writeFileSync(path.join(config.paths.modules_dir, moduleDir, 'BUSTER.md'), 'run checks');

  const prompt = buildBusterModulePrompt(
    config,
    'app',
    { title: 'App' },
    moduleDir,
    { fail_count: 0 },
    3,
  ).prompt;

  assert.match(prompt, /`cd -- '-work dir\/one; touch bad'` before running any tests\./);
  assert.doesNotMatch(prompt, /`cd -work dir\/one; touch bad/);
});

test('buster module prompt excludes noisy pipeline log diff stats', () => {
  const config = makeConfig();
  const moduleDir = 'app';
  fs.mkdirSync(path.join(config.paths.modules_dir, moduleDir), { recursive: true });
  fs.writeFileSync(path.join(config.paths.modules_dir, moduleDir, 'BUSTER.md'), 'run checks');

  const prompt = buildBusterModulePrompt(
    config,
    'app',
    { title: 'App' },
    moduleDir,
    {
      fail_count: 0,
      forge_diff_stat: [
        ' Projects/test/src/.swarm/logs/pipeline/pipeline.jsonl | 1000 +++++++++++++++++',
        ' Projects/test/src/index.html | 12 +',
      ].join('\n'),
    },
    3,
  ).prompt;

  assert.equal(prompt.includes('pipeline.jsonl'), false);
  assert.equal(prompt.includes('src/index.html'), true);
  assert.equal(prompt.includes('Files Changed by Forge (application/control paths only)'), true);
});

test('buster module prompt uses module worktree output paths with shared runtime swarm', () => {
  const parentRoot = fs.mkdtempSync(path.join('/home', 'buster-parent-'));
  const moduleRoot = fs.mkdtempSync(path.join('/home', 'buster-module-'));
  const projectSrc = path.join(moduleRoot, 'Projects/demo/src');
  const modulesDir = path.join(projectSrc, '.swarm/modules');
  const config = {
    project: 'test-project',
    repo_root: moduleRoot,
    paths: {
      project_src_dir: projectSrc,
      swarm_dir: path.join(parentRoot, 'Projects/demo/src/.swarm'),
      modules_dir: modulesDir,
    },
  };
  const moduleDir = '02-nginx';
  fs.mkdirSync(path.join(modulesDir, moduleDir), { recursive: true });
  fs.writeFileSync(path.join(modulesDir, moduleDir, 'BUSTER.md'), 'run checks');

  const prompt = buildBusterModulePrompt(
    config,
    moduleDir,
    { title: 'Parallel module' },
    moduleDir,
    { fail_count: 0 },
    3,
  ).prompt;

  assert.match(prompt, /Output File:\*\* `Projects\/demo\/src\/\.swarm\/modules\/02-nginx\/buster-output\.json`/);
  assert.match(prompt, /Test directory:\*\* `Projects\/demo\/src\/\.swarm\/modules\/02-nginx\/tests\/attempt-1\/`/);
});
