import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { buildForgePrompt } from '../../../../../skills/nova/pipeline/prompts/forge.ts';

function makeConfig(projectDirName = 'project') {
  const root = fs.mkdtempSync(path.join('/home', 'forge-prompt-'));
  const projectSrc = path.join(root, projectDirName);
  const swarmDir = path.join(projectSrc, '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  fs.mkdirSync(modulesDir, { recursive: true });
  return {
    project: 'test-project',
    repo_root: root,
    agents: { forge: { cwd: projectSrc } },
    paths: {
      project_src_dir: projectSrc,
      swarm_dir: swarmDir,
      modules_dir: modulesDir,
    },
  };
}

test('forge prompt treats missing fail_summaries on FAIL status as no retry history', async () => {
  const config = makeConfig();
  const moduleDir = 'app';
  fs.mkdirSync(path.join(config.paths.modules_dir, moduleDir), { recursive: true });
  fs.writeFileSync(path.join(config.paths.modules_dir, moduleDir, 'FORGE.md'), 'Build the app.');

  const result = await buildForgePrompt(
    config,
    'app',
    { title: 'App' },
    moduleDir,
    { status: 'FAIL', fail_count: 1 },
    3,
  );

  assert.equal(result.error, undefined);
  assert.match(result.prompt, /Build the app\./);
  assert.doesNotMatch(result.prompt, /ANTI-PATTERNS/);
});

test('forge prompt shell-quotes project source cd command with leading hyphen', async () => {
  const config = makeConfig("-work dir/one; touch bad'file");
  const moduleDir = 'app';
  fs.mkdirSync(path.join(config.paths.modules_dir, moduleDir), { recursive: true });
  fs.writeFileSync(path.join(config.paths.modules_dir, moduleDir, 'FORGE.md'), 'Build the app.');

  const result = await buildForgePrompt(
    config,
    'app',
    { title: 'App' },
    moduleDir,
    { status: 'READY', fail_count: 0 },
    3,
  );

  assert.equal(result.error, undefined);
  assert.ok(result.prompt.includes("`cd -- '-work dir/one; touch bad'\\''file'` before creating or modifying any files."));
  assert.doesNotMatch(result.prompt, /`cd -work dir\/one; touch bad/);
});
