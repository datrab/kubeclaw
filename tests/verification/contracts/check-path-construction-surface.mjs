#!/usr/bin/env node
import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-path-construction-surface' });
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const pathsPath = path.join(repoRoot, 'skills/nova/pipeline/core/paths.ts');
const pathsSource = fs.readFileSync(pathsPath, 'utf8');
const pathsMod = await import(pathToFileURL(pathsPath).href);

for (const expectedExport of [
  'export function resolveSwarmArtifactPath(',
  'export function resolveRepoRelativePath(',
  'export function resolveRepoRealPath(',
  'export function modulePath(',
  'export function modulePathRef(',
  'export function moduleBusterOutputPath(',
  'export function moduleBusterOutputPathRef(',
  'export function moduleBusterTestWorkspacePath(',
  'export function gateOutputPath(',
  'export function gateInstructionsPath(',
  'export function gateOutputPathRef(',
  'export function gateInstructionsPathRef(',
  'export function reviewGateOutputPath(',
  'export function approvalGateArtifactPaths(',
  'export function approvalGateArtifactRefPaths(',
  'export function redisLogArtifactPath(',
  'export function redisLogArtifactTargets(',
]) {
  assert.equal(pathsSource.includes(expectedExport), true, `core path authority missing ${expectedExport}`);
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'path-construction-surface-'));
const config = {
  project: 'demo',
  repo_root: tmpRoot,
  paths: { swarm_dir: path.join(tmpRoot, '.swarm'), modules_dir: path.join(tmpRoot, '.swarm', 'modules') },
  _runId: 'run-1',
};
const projectLogDir = path.join(config.paths.swarm_dir, 'logs');
const runLogDir = path.join(projectLogDir, 'pipeline', 'runs', config._runId);
const gate = {
  output_file: 'gates/e2e/output.json',
  instructions_file: 'gates/e2e/instructions.md',
  review_output_dir: 'echo-reviews/e2e',
  review_name: 'security',
};

assert.equal(
  pathsMod.gateOutputPath(config, gate),
  path.join(config.paths.swarm_dir, 'gates/e2e/output.json'),
  'gate output path should resolve under swarm root',
);
assert.equal(
  pathsMod.gateInstructionsPath(config, gate),
  path.join(config.paths.swarm_dir, 'gates/e2e/instructions.md'),
  'gate instructions path should resolve under swarm root',
);
assert.equal(
  pathsMod.reviewGateOutputPath(config, gate, 'echo-a'),
  path.join(config.paths.swarm_dir, 'echo-reviews/e2e/echo-a-security.json'),
  'review output path should resolve under swarm root',
);
assert.equal(
  pathsMod.moduleBusterOutputPath(config, '07-api'),
  path.join(config.paths.swarm_dir, 'modules/07-api/buster-output.json'),
  'module Buster output path should resolve through core path authority',
);
assert.equal(
  pathsMod.moduleBusterOutputPathRef(config, '07-api'),
  '.swarm/modules/07-api/buster-output.json',
  'module Buster output ref should be repo-relative',
);
assert.equal(
  pathsMod.moduleBusterTestWorkspacePathRef(config, '07-api', 2),
  '.swarm/modules/07-api/tests/attempt-2',
  'module Buster test workspace ref should be repo-relative',
);
assert.throws(
  () => pathsMod.moduleBusterOutputPath(config, '../outside'),
  /parent traversal/,
  'module Buster output paths must reject parent traversal before joining',
);

assert.throws(
  () => pathsMod.resolveSwarmArtifactPath(config, '../outside.json', 'escape-test'),
  /parent traversal/,
  'swarm artifact paths must reject parent escapes',
);
assert.throws(
  () => pathsMod.resolveSwarmArtifactPath(config, '/tmp/outside.json', 'absolute-test'),
  /must be relative/,
  'swarm artifact paths must reject absolute inputs',
);
assert.throws(
  () => pathsMod.resolveSwarmArtifactPath(config, 'bad\0path.json', 'null-test'),
  /null byte/,
  'swarm artifact paths must reject null bytes',
);

const repoFile = path.join(tmpRoot, 'Projects/demo/src/Dockerfile');
fs.mkdirSync(path.dirname(repoFile), { recursive: true });
fs.writeFileSync(repoFile, 'FROM scratch\n');
assert.equal(
  pathsMod.resolveRepoRelativePath(config, 'Projects/demo/src/Dockerfile', 'test_config.serve.dockerfile'),
  repoFile,
  'repo-relative paths should resolve under repo_root',
);
assert.equal(
  pathsMod.resolveRepoRealPath(config, 'Projects/demo/src/Dockerfile', 'test_config.serve.dockerfile'),
  fs.realpathSync(repoFile),
  'repo realpath helper should return the jailed filesystem target',
);
assert.throws(
  () => pathsMod.resolveRepoRelativePath(config, '/tmp/Dockerfile', 'test_config.serve.dockerfile'),
  /relative to repository root/,
  'repo helper must reject absolute inputs',
);
assert.throws(
  () => pathsMod.resolveRepoRelativePath(config, '../Dockerfile', 'test_config.serve.dockerfile'),
  /parent traversal/,
  'repo helper must reject parent traversal',
);
const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'path-construction-outside-'));
const outsideFile = path.join(outsideRoot, 'Dockerfile');
const symlinkPath = path.join(tmpRoot, 'Projects/demo/src/symlink-Dockerfile');
fs.writeFileSync(outsideFile, 'FROM scratch\n');
fs.symlinkSync(outsideFile, symlinkPath);
assert.throws(
  () => pathsMod.resolveRepoRealPath(config, 'Projects/demo/src/symlink-Dockerfile', 'test_config.serve.dockerfile'),
  /resolves outside repository root/,
  'repo realpath helper must reject symlink escapes',
);

const approvalPaths = pathsMod.approvalGateArtifactPaths(config, 'human-approval');
assert.deepEqual(approvalPaths, {
  dir: path.join(projectLogDir, 'gates', 'human-approval'),
  requestJson: path.join(projectLogDir, 'gates', 'human-approval', 'approval-request.json'),
  requestMarkdown: path.join(projectLogDir, 'gates', 'human-approval', 'approval-request.md'),
  decisionJson: path.join(projectLogDir, 'gates', 'human-approval', 'approval-decision.json'),
  transitionsJsonl: path.join(projectLogDir, 'gates', 'human-approval', 'approval-transitions.jsonl'),
});
assert.deepEqual(pathsMod.approvalGateArtifactRefPaths(config, 'human-approval'), {
  statePath: '.swarm/human-approval-gate-status.json',
  requestJson: '.swarm/logs/gates/human-approval/approval-request.json',
  requestMarkdown: '.swarm/logs/gates/human-approval/approval-request.md',
  decisionJson: '.swarm/logs/gates/human-approval/approval-decision.json',
  transitionsJsonl: '.swarm/logs/gates/human-approval/approval-transitions.jsonl',
});
assert.deepEqual(pathsMod.approvalGateArtifactRefPaths({ ...config, repo_root: undefined }, 'human-approval'), {
  statePath: '.swarm/human-approval-gate-status.json',
  requestJson: '.swarm/logs/gates/human-approval/approval-request.json',
  requestMarkdown: '.swarm/logs/gates/human-approval/approval-request.md',
  decisionJson: '.swarm/logs/gates/human-approval/approval-decision.json',
  transitionsJsonl: '.swarm/logs/gates/human-approval/approval-transitions.jsonl',
}, 'approval artifact refs should fall back to the swarm parent when repo_root is absent');
assert.deepEqual(pathsMod.approvalGateArtifactRefPaths({ project: 'demo' }, 'human-approval'), {
  statePath: '.swarm/human-approval-gate-status.json',
  requestJson: '.swarm/logs/gates/human-approval/approval-request.json',
  requestMarkdown: '.swarm/logs/gates/human-approval/approval-request.md',
  decisionJson: '.swarm/logs/gates/human-approval/approval-decision.json',
  transitionsJsonl: '.swarm/logs/gates/human-approval/approval-transitions.jsonl',
}, 'approval artifact refs should preserve legacy display refs when swarm paths are unavailable');

assert.deepEqual(pathsMod.redisLogArtifactTargets(config, 'redis-ops.jsonl'), [
  path.join(projectLogDir, 'redis', 'redis-ops.jsonl'),
  path.join(runLogDir, 'redis', 'redis-ops.jsonl'),
]);
assert.throws(
  () => pathsMod.redisLogArtifactTargets(config, '../redis-ops.jsonl'),
  /single relative path segment/,
  'Redis artifact file names must not include path traversal',
);

const sourceExpectations = [
  ['skills/nova/pipeline/runners/buster-gate-runner.ts', 'gateOutputPath(config, gate)'],
  ['skills/nova/pipeline/runners/buster-gate-fix-cycle.ts', 'gateOutputPath(config, gate)'],
  ['skills/nova/pipeline/runners/review-gate-task.ts', 'reviewGateOutputPath(config, gate, reviewerLabel)'],
  ['skills/nova/pipeline/runners/review-gate-runner.ts', 'gateOutputPath(config, gate)'],
  ['skills/nova/pipeline/services/status-store-read-models/gate-projection.ts', 'gateOutputPath(config, gate)'],
  ['skills/nova/pipeline/runners/approval-gate-state.ts', 'approvalGateArtifactPaths(config, gateId)'],
  ['skills/nova/pipeline/services/redis-log.ts', 'redisLogArtifactTargets(config, fileName)'],
  ['skills/nova/pipeline/agents/orchestration.ts', 'moduleBusterOutputPathRef(config, mod.dir)'],
  ['skills/nova/pipeline/agents/orchestration.ts', 'gateOutputPathRef(config, gate)'],
  ['skills/nova/pipeline/prompts/buster-module.ts', 'moduleBusterTestWorkspacePathRef(config, dir, attempt)'],
  ['skills/nova/pipeline/services/polling-dual.ts', 'moduleBusterOutputPath(config, moduleDir)'],
  ['skills/nova/pipeline/services/blueprint.ts', 'gateInstructionsTopLevelRef(config, gate)'],
];

for (const [relativePath, expected] of sourceExpectations) {
  const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  assert.equal(source.includes(expected), true, `${relativePath} should delegate path construction through core/paths.ts`);
}

for (const relativePath of [
  'skills/nova/pipeline/runners/buster-gate-terminal.ts',
  'skills/nova/pipeline/runners/buster-gate-runner.ts',
  'skills/nova/pipeline/runners/buster-gate-fix-cycle.ts',
  'skills/nova/pipeline/runners/review-gate-task.ts',
  'skills/nova/pipeline/runners/review-gate-runner.ts',
  'skills/nova/pipeline/services/status-store-read-models/gate-projection.ts',
]) {
  const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  assert.equal(
    source.includes('path.join(swarmRoot(config), gate.output_file)'),
    false,
    `${relativePath} must not rebuild gate.output_file paths locally`,
  );
}

quietConsole.restore();
console.log('[contracts/check-path-construction-surface] OK');
