#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const e2eTests = fs.readdirSync(path.join(root, 'tests/verification/e2e'))
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => path.join('tests/verification/e2e', name));

run(process.execPath, ['scripts/check-plugin-system-migration-units.mjs']);
run('npm', ['run', 'typecheck:skills']);
run(process.execPath, ['tests/verification/contracts/check-common-pipeline-facades-surface.mjs']);
run(process.execPath, ['tests/verification/runtime/check-agent-skill-bundles.mjs']);
run(process.execPath, ['tests/verification/runtime/check-runtime-collisions.mjs']);
run('npm', ['run', 'verify:contracts']);
run('npm', ['run', 'verify:skills:all']);
run('npm', ['run', 'verify:pipeline']);
run(process.execPath, ['--test', ...e2eTests]);
run('npm', ['run', 'docs:check']);
run(process.execPath, ['tests/verification/deployment/check-deployment-truth.mjs']);
run('helm', ['lint', 'charts/kubeclaw', '-f', 'my-values/nova-values.yaml']);
run('helm', ['lint', 'charts/kubeclaw', '-f', 'my-values/buster-values.yaml']);
run('npm', ['audit', '--audit-level=high']);
run('git', ['diff', '--check']);

console.log(JSON.stringify({
  ok: true,
  gate: 'plugin-migration-baseline',
  skillTestScope: 'all',
  e2eContractTestFiles: e2eTests.length,
}));
