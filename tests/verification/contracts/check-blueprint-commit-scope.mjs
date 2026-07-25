#!/usr/bin/env node
import { parseSourceRootArgs } from '../lib/contract-check-helpers.mjs';
import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-blueprint-commit-scope' });
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { expandSwarmConfig } from '../../../skills/nova/pipeline/core/platform-config.ts';


function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function setupBlueprintRepo(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const origin = path.join(root, 'origin.git');
  const repo = path.join(root, 'repo');

  execFileSync('git', ['init', '--bare', origin], { stdio: 'ignore' });
  fs.mkdirSync(repo);
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.email', 'verification@example.invalid']);
  git(repo, ['config', 'user.name', 'Verification']);
  git(repo, ['remote', 'add', 'origin', origin]);

  fs.writeFileSync(path.join(repo, 'README.md'), 'base\n');
  git(repo, ['add', 'README.md']);
  git(repo, ['commit', '-m', 'base']);
  git(repo, ['push', '-u', 'origin', 'main']);

  git(repo, ['checkout', '-b', 'demo/architecture']);
  fs.mkdirSync(path.join(repo, '.swarm/modules/mod-a'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.swarm/modules/mod-a/FORGE.md'), 'forge\n');
  fs.writeFileSync(path.join(repo, '.swarm/modules/mod-a/BUSTER.md'), 'buster\n');
  git(repo, ['add', '.swarm/modules/mod-a']);
  git(repo, ['commit', '-m', 'architecture blueprint']);
  git(repo, ['push', '-u', 'origin', 'demo/architecture']);

  git(repo, ['checkout', 'main']);
  fs.rmSync(path.join(repo, '.swarm'), { recursive: true, force: true });

  const config = {
    project: 'demo',
    repo_root: repo,
    _runId: 'run-blueprint-fixture',
    paths: {
      swarm_dir: path.join(repo, '.swarm'),
      modules_dir: path.join(repo, '.swarm/modules'),
    },
  };
  fs.mkdirSync(path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'runs', config._runId), { recursive: true });
  const progress = { modules: { moduleA: { dir: 'mod-a' } } };
  return { root, repo, config, progress };
}

const { sourceRoot } = parseSourceRootArgs();
const previousSwarmConfig = process.env.SWARM_CONFIG;
const expandedConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-commit-scope-config-'));
const expandedConfigPath = path.join(expandedConfigDir, 'swarm.config.effective.json');
const compactConfig = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'charts', 'kubeclaw', 'files', 'config', 'swarm.config.json'), 'utf8'));
fs.writeFileSync(expandedConfigPath, `${JSON.stringify(expandSwarmConfig(compactConfig), null, 2)}\n`);
process.env.SWARM_CONFIG = expandedConfigPath;
const blueprintPath = path.join(sourceRoot, 'skills/nova/pipeline/services/blueprint.ts');
const { releaseBlueprint } = await import(pathToFileURL(blueprintPath).href);

{
  const fixture = setupBlueprintRepo('blueprint-clean-scope-');
  try {
    const result = await releaseBlueprint(fixture.config, fixture.progress, 'moduleA', 'mod-a', ['forge', 'buster']);
    assert.equal(result.status, 'success');
    assert.equal(result.action, 'released');

    const committedFiles = git(fixture.repo, ['show', '--name-only', '--format=', 'HEAD'])
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .sort();
    assert.deepEqual(committedFiles, [
      '.swarm/modules/mod-a/BUSTER.md',
      '.swarm/modules/mod-a/FORGE.md',
    ]);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

{
  const fixture = setupBlueprintRepo('blueprint-dirty-index-');
  try {
    fs.writeFileSync(path.join(fixture.repo, 'unrelated.txt'), 'do not include\n');
    git(fixture.repo, ['add', 'unrelated.txt']);

    await assert.rejects(
      () => releaseBlueprint(fixture.config, fixture.progress, 'moduleA', 'mod-a', ['forge', 'buster']),
      /unrelated staged paths present: unrelated\.txt/,
    );

    assert.equal(git(fixture.repo, ['log', '-1', '--format=%s']), 'base');
    const stagedFiles = git(fixture.repo, ['diff', '--cached', '--name-only'])
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .sort();
    assert.deepEqual(stagedFiles, [
      '.swarm/modules/mod-a/BUSTER.md',
      '.swarm/modules/mod-a/FORGE.md',
      'unrelated.txt',
    ]);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

fs.rmSync(expandedConfigDir, { recursive: true, force: true });
if (previousSwarmConfig === undefined) delete process.env.SWARM_CONFIG;
else process.env.SWARM_CONFIG = previousSwarmConfig;

quietConsole.restore();
console.log('Blueprint commit scope guard verified');
