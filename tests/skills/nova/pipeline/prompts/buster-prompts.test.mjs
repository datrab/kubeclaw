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
