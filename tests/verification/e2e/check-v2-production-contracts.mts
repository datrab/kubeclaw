#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  cleanupRealE2ERunWorkspace,
  createRealE2ERunWorkspace,
} from './real-run-workspace.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const harnessRoot = path.join(repositoryRoot, 'tests/verification/e2e');
const forbiddenHarnessContracts = [
  ['logs', 'pipeline'].join('/'),
  ['pipeline_lifecycle_read_models', 'v1'].join('.'),
  ['canonical', 'events.jsonl'].join('-'),
  ['pipeline_run', 'halted'].join('.'),
  ['', 'v1'].join('.'),
];
const forbiddenHits: Array<{ file: string; contract: string }> = [];
for (const entry of fs.readdirSync(harnessRoot, { withFileTypes: true })) {
  if (!entry.isFile() || !/\.(?:mjs|mts|ts)$/u.test(entry.name)) continue;
  if (entry.name === path.basename(import.meta.filename)) continue;
  const file = path.join(harnessRoot, entry.name);
  const source = fs.readFileSync(file, 'utf8');
  for (const contract of forbiddenHarnessContracts) {
    if (source.includes(contract)) forbiddenHits.push({ file: path.relative(repositoryRoot, file), contract });
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
  if (
    result.schemaVersion !== 'real-production-pipeline-validation.v2'
    || result.graphStageCount !== 15
    || result.conditionalStageCount !== 1
    || result.packageCount !== 31
    || result.stageCount !== 8
    || result.observerCount !== 2
    || result.adapterCount !== 11
  ) {
    throw new Error(`REAL_E2E_V2_CONTRACT_PREFLIGHT_INVALID:${JSON.stringify(result)}`);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
} finally {
  await cleanupRealE2ERunWorkspace(workspace, { keepArtifacts: false });
}
