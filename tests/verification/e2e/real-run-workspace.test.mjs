import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  assertSafeArchitectureSeedBranches,
  assertSafeRunBranchPublish,
  architectureBranchNameForProject,
  buildProgress,
  cleanupRealE2ERunWorkspace,
  createRealE2ERunWorkspace,
  isSafeE2ERemoteBranchName,
  isSafeE2ERunBranchName,
} from './real-run-workspace.mjs';
import { applyRealE2EScenario } from './failure-scenarios.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);

function approvalTimeoutPolicyForScenario(scenarioId) {
  const base = buildProgress({ projectName: `unit-${scenarioId}` });
  const { progress } = applyRealE2EScenario(base, scenarioId);
  return progress.gates?.['operator-approval']?.on_timeout;
}

test('generated approval gate config uses production lowercase timeout policy', () => {
  assert.equal(approvalTimeoutPolicyForScenario('success'), 'block');
});

test('approval timeout scenarios preserve production lowercase timeout policy', () => {
  assert.equal(approvalTimeoutPolicyForScenario('approval-timeout-block'), 'block');
  assert.equal(approvalTimeoutPolicyForScenario('approval-timeout-continue'), 'continue');
});

test('approval deny exercises operator gate before any Forge module', () => {
  const base = buildProgress({ projectName: 'unit-approval-deny' });
  const { progress } = applyRealE2EScenario(base, 'approval-deny');

  assert.equal(progress.execution_order[0], 'gate:operator-approval');
  assert.equal(progress.execution_order.includes('01-nginx'), true);
  assert.equal(progress.execution_order.indexOf('gate:operator-approval') < progress.execution_order.indexOf('01-nginx'), true);
  assert.equal(progress.real_e2e.approval_before_modules, true);
});

test('architecture branch names are project scoped and remote cleanup guarded', () => {
  assert.equal(
    architectureBranchNameForProject('real-pipeline-e2e-real-e2e-123'),
    'real-pipeline-e2e-real-e2e-123/architecture',
  );
  assert.equal(isSafeE2ERemoteBranchName('real-pipeline-e2e-real-e2e-123/architecture'), true);
  assert.equal(isSafeE2ERemoteBranchName('verification/e2e/success-real-e2e-123'), true);
  assert.equal(isSafeE2ERemoteBranchName('main'), false);
  assert.equal(isSafeE2ERemoteBranchName('feature/not-owned-by-e2e'), false);
  assert.equal(isSafeE2ERemoteBranchName('other-project/architecture'), false);
  assert.equal(isSafeE2ERunBranchName('verification/e2e/success-real-e2e-123'), true);
  assert.equal(isSafeE2ERunBranchName('main'), false);
});

test('architecture seed refuses to commit from non-e2e worktree branches', () => {
  assert.doesNotThrow(() => assertSafeArchitectureSeedBranches({
    worktreeBranch: 'verification/e2e/success-real-e2e-123',
    expectedWorktreeBranch: 'verification/e2e/success-real-e2e-123',
    architectureBranch: 'real-pipeline-e2e-real-e2e-123/architecture',
  }));

  assert.throws(() => assertSafeArchitectureSeedBranches({
    worktreeBranch: 'main',
    expectedWorktreeBranch: 'verification/e2e/success-real-e2e-123',
    architectureBranch: 'real-pipeline-e2e-real-e2e-123/architecture',
  }), /unexpected worktree branch/);

  assert.throws(() => assertSafeArchitectureSeedBranches({
    worktreeBranch: 'verification/e2e/success-real-e2e-123',
    expectedWorktreeBranch: 'verification/e2e/success-real-e2e-123',
    architectureBranch: 'main',
  }), /Unsafe architecture branch/);
});

test('run branch publishing is guarded to generated e2e branches', () => {
  assert.doesNotThrow(() => assertSafeRunBranchPublish({
    branchName: 'verification/e2e/success-real-e2e-123',
  }));

  assert.throws(() => assertSafeRunBranchPublish({
    branchName: 'main',
  }), /Unsafe E2E run branch publish target/);

  assert.throws(() => assertSafeRunBranchPublish({
    branchName: 'real-pipeline-e2e-real-e2e-123/architecture',
  }), /Unsafe E2E run branch publish target/);
});

test('git merge conflict fixture preserves architecture branch in scenario origin', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-merge-origin-'));
  const testOrigin = path.join(tmpDir, 'origin.git');
  const originalOrigin = (await execFileAsync('git', ['remote', 'get-url', 'origin'], {
    encoding: 'utf8',
  })).stdout.trim();
  await execFileAsync('git', ['init', '--bare', testOrigin]);
  await execFileAsync('git', ['remote', 'set-url', 'origin', testOrigin]);
  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'git-merge-conflict' });
    const conflictRemote = workspace.gitConflictFixture?.remote;
    assert.ok(conflictRemote);

    await execFileAsync('git', [
      `--git-dir=${conflictRemote}`,
      'show-ref',
      '--verify',
      `refs/heads/${workspace.branchName}`,
    ]);
    await execFileAsync('git', [
      `--git-dir=${conflictRemote}`,
      'show-ref',
      '--verify',
      `refs/heads/${workspace.architectureBranchName}`,
    ]);

    const cleanup = await cleanupRealE2ERunWorkspace(workspace);
    workspace = null;
    assert.equal(cleanup.steps.find((step) => step.step === 'git_origin_restore')?.ok, true);
    assert.equal((await execFileAsync('git', ['remote', 'get-url', 'origin'], {
      encoding: 'utf8',
    })).stdout.trim(), testOrigin);
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
    await execFileAsync('git', ['remote', 'set-url', 'origin', originalOrigin]);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('nginx fixture listens on the configured Buster health port', () => {
  const dockerfile = fs.readFileSync(path.join(SCRIPT_DIR, 'fixtures', 'nginx-project', 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /listen 8080;/);
});

test('nginx fixture pins its base image and verifies production contract fields', async () => {
  const fixtureDir = path.join(SCRIPT_DIR, 'fixtures', 'nginx-project');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-nginx-fixture-'));
  try {
    fs.cpSync(fixtureDir, tmpDir, { recursive: true });
    const htmlPath = path.join(tmpDir, 'src', 'index.html');
    fs.writeFileSync(
      htmlPath,
      fs.readFileSync(htmlPath, 'utf8').replace('REAL_E2E_RUN_ID_PLACEHOLDER', 'real-pipeline-e2e-unit-123'),
    );

    const dockerfile = fs.readFileSync(path.join(tmpDir, 'Dockerfile'), 'utf8');
    assert.match(dockerfile, /nginx:1\.27-alpine@sha256:[a-f0-9]{64}/);

    const manifest = fs.readFileSync(path.join(tmpDir, 'k8s', 'deployment.yaml'), 'utf8');
    assert.match(manifest, /- name: http\s+containerPort: 8080/);
    assert.match(manifest, /- name: http\s+port: 80\s+targetPort: http/);

    const result = await execFileAsync('npm', ['run', 'verify', '--silent'], {
      cwd: tmpDir,
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    assert.deepEqual(JSON.parse(result.stdout), {
      ok: true,
      checked: [
        'html marker',
        'run id',
        'pinned base image',
        'nginx listener',
        'deployment/service identity',
        'verification image',
        'named http port',
        'service targetPort',
      ],
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('generated real e2e serve config does not require browser smoke dependencies', () => {
  const progress = buildProgress({ projectName: 'real-pipeline-e2e-unit' });
  assert.equal(progress.modules['01-nginx'].test_config.serve.smoke_paths, undefined);
  assert.equal(progress.gates['final-buster'].test_config.serve.smoke_paths, undefined);
});
