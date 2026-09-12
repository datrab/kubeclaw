#!/usr/bin/env node
import { registryTestContract } from './registry-test-contract.mjs';
import assert from 'node:assert/strict';
import { prepareRuntime } from '../../../skills/nova/core/execution/engine-runtime.ts';
import { loadPlatformConfig } from '../../../skills/common/plugin-runtime/foundation/config/platform.ts';
import { retiredHarnessHits } from './retired-harness-contracts.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  cleanupRealE2ERunWorkspace,
  createRealE2ERunWorkspace,
} from './real-run-workspace.mjs';

process.env.KUBECLAW_REGISTRY_CONFIG = registryTestContract;
process.env.REAL_E2E_DEPLOYMENT_IMAGE = 'registry.example.test:5443/library/nginx:1.27-alpine@sha256:62223d644fa234c3a1cc785ee14242ec47a77364226f1c811d2f669f96dc2ac8';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const harnessRoot = path.join(repositoryRoot, 'tests/verification/e2e');
const forbiddenHits: Array<{ file: string; contract: string }> = [];
for (const entry of fs.readdirSync(harnessRoot, { withFileTypes: true })) {
  if (!entry.isFile() || !/\.(?:mjs|mts|ts)$/u.test(entry.name)) continue;
  if ([path.basename(import.meta.filename), 'retired-harness-contracts.mjs', 'retired-harness-contracts.test.mjs'].includes(entry.name)) continue;
  const file = path.join(harnessRoot, entry.name);
  const source = fs.readFileSync(file, 'utf8');
  for (const contract of retiredHarnessHits(source)) {
    forbiddenHits.push({ file: path.relative(repositoryRoot, file), contract });
  }
}
if (forbiddenHits.length > 0) {
  throw new Error(`REAL_E2E_V2_LEGACY_CONTRACT_PRESENT:${JSON.stringify(forbiddenHits)}`);
}
const workspace = await createRealE2ERunWorkspace({ mode: 'full', scenarioId: 'success' });
try {
  const execution = spawnSync(process.execPath, [
    path.join(repositoryRoot, 'tests/verification/e2e/run-v2-production-pipeline.mts'),
    '--project', workspace.projectName,
    '--repo', workspace.worktreePath,
    '--model', 'openai/gpt-5.3-codex-spark',
    '--thinking', 'none',
    '--dry-run', 'true',
  ], {
    cwd: workspace.worktreePath,
    env: {
      ...process.env,
      AGENT_ROLE: 'nova',
      OPENCLAW_GATEWAY_TOKEN: 'contract-validation-only',
      DISCORD_WEBHOOK: 'https://discord.invalid/api/webhooks/contract-validation',
      REAL_E2E_V2_RUNTIME: '1',
      BUSTER_V2_TOKEN: 'unused-dry-run', BUSTER_SOURCE_ATTESTATION_PRIVATE_KEY: 'unused-dry-run',
      BUSTER_GATEWAY_TOKEN: 'unused-dry-run', BUSTER_GATEWAY_REPOSITORY_ROOT: workspace.worktreePath,
      KUBECLAW_CAPABILITY_PROVIDERS: JSON.stringify({ buster: { agentRole: 'buster', capabilities: {
        'test.plan.execute': { adapter: 'buster-plan-v1', endpoint: 'http://127.0.0.1:9' },
        'runtime.dispatch': { adapter: 'openclaw', endpoint: 'http://127.0.0.1:9' },
      } } }),
    },
    encoding: 'utf8',
    timeout: 120_000,
  });
  if (execution.status !== 0) {
    throw new Error([
      'REAL_E2E_V2_CONTRACT_PREFLIGHT_FAILED',
      execution.stdout,
      execution.stderr,
    ].filter(Boolean).join('\n'));
  }
  const result = JSON.parse(execution.stdout.trim());
  const definition = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'v2-runtime/pipeline.json'), 'utf8'));
  const platform = loadPlatformConfig(path.join(workspace.swarmDir, 'v2-runtime/platform.json'));
  const runtime = await prepareRuntime(platform, definition);
  assert.equal(result.schemaVersion, 'real-production-pipeline-validation.v2');
  assert.equal(result.graphStageCount, definition.stages.length);
  assert.equal(result.conditionalStageCount, definition.stages.filter(stage => stage.activation !== undefined).length);
  assert.equal(result.packageCount, runtime.snapshot.packages.size);
  assert.equal(result.stageCount, runtime.activated.stages.size);
  assert.equal(result.observerCount, runtime.activated.observers.size);
  assert.equal(result.adapterCount, runtime.activated.adapters.size);
  for (const type of ['kubeclaw.agent.implementation', 'kubeclaw.test.quality-evaluation',
    'kubeclaw.lint.full', 'kubeclaw.decision.review', 'kubeclaw.report.project-summary']) {
    assert.ok(definition.stages.some(stage => stage.type === type), `required production stage absent: ${type}`);
  }
  const progress = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'progress.json'), 'utf8'));
  for (const moduleId of Object.keys(progress.modules)) {
    assert.ok(definition.stages.some(stage => stage.id === `forge-${moduleId}`));
    assert.ok(definition.stages.some(stage => stage.id === `buster-${moduleId}`));
  }
  assert.ok(definition.stages.some(stage => stage.id === 'final-buster'));
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
} finally {
  await cleanupRealE2ERunWorkspace(workspace, { keepArtifacts: false });
}
