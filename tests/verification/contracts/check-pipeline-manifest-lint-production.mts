import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { executeLintReport } from '../../../skills/nova/plugins/lint/src/engine/index.ts';
import { writeRunLintPolicy } from '../e2e/manifest-lint-production.mts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-manifest-production-'));
const repository = path.join(root, 'repository');
const state = path.join(root, 'state');
fs.cpSync('tests/verification/e2e/fixtures/nginx-project', repository, { recursive: true });
execFileSync('git', ['init', '--quiet'], { cwd: repository });
execFileSync('git', ['config', 'user.email', 'manifest-production@example.invalid'], { cwd: repository });
execFileSync('git', ['config', 'user.name', 'Manifest Production Proof'], { cwd: repository });
execFileSync('git', ['add', '.'], { cwd: repository });
execFileSync('git', ['commit', '--quiet', '-m', 'manifest production fixture'], { cwd: repository });

try {
  const declaration = {
    uses: 'kubeclaw.lint.full' as const,
    policyProject: 'workspace',
    rawManifests: ['k8s/deployment.yaml'],
    helmCharts: [],
  };
  const policyPath = writeRunLintPolicy(process.cwd(), state, declaration);
  const report: any = await executeLintReport({
    workingDirectory: repository,
    policyPath,
    policyProject: declaration.policyProject,
    tier: 'full',
    kubernetes: {
      rawManifests: declaration.rawManifests,
      helmCharts: declaration.helmCharts,
    },
  });
  assert.equal(report.tools['kubernetes-policy'].status, 'ok');
  assert.equal(report.tools['kubernetes-policy'].blocking_findings, 0);
  assert.equal(report.tools['kubernetes-schema'].status, 'ok');
  assert.equal(report.tools['kubernetes-schema'].blocking_findings, 0);
  assert.deepEqual(report.tools['kubernetes-schema'].evidence
    .filter((entry: any) => entry.kind === 'raw-manifest')
    .map((entry: any) => entry.source), declaration.rawManifests);
  assert.equal(report.tools.kubeconform, undefined);
  console.log(JSON.stringify({ ok: true, phase: 'manifest-lint-production',
    tools: ['yamllint', 'kubernetes-policy', 'kubernetes-schema'], mocks: 0 }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
