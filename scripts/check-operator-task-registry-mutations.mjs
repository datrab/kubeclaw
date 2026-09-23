#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-operator-task-mutations-'));

function expectFailure(script, environment, diagnostic) {
  let output = '';
  try {
    execFileSync(process.execPath, [path.join(root, script), '--check'], {
      cwd: root,
      env: { ...process.env, ...environment },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
  }
  assert.match(output, diagnostic, `${script}: mutation did not produce the required diagnostic`);
}

try {
  const implementationRoot = path.join(temporaryRoot, 'implementation');
  for (const relative of [
    'skills/nova/project/recovery.ts',
    'skills/nova/project/delivery-manifest.ts',
  ]) {
    const target = path.join(implementationRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, relative), target);
  }
  fs.appendFileSync(path.join(implementationRoot, 'skills/nova/project/recovery.ts'),
    '\nthrow new Error("PROJECT_RECOVERY_MUTATION_DOUBLE_QUOTED");\n');
  expectFailure('scripts/generate-operator-task-registry.mjs', {
    OPERATOR_TASK_IMPLEMENTATION_ROOT: implementationRoot,
  }, /operator recovery outcome inventory differs from project recovery implementation/u);
  fs.copyFileSync(path.join(root, 'skills/nova/project/recovery.ts'),
    path.join(implementationRoot, 'skills/nova/project/recovery.ts'));
  fs.appendFileSync(path.join(implementationRoot, 'skills/nova/project/delivery-manifest.ts'),
    '\nthrow new Error(`PROJECT_RECOVERY_MUTATION_TEMPLATE:${String("finite")}`);\n');
  expectFailure('scripts/generate-operator-task-registry.mjs', {
    OPERATOR_TASK_IMPLEMENTATION_ROOT: implementationRoot,
  }, /operator recovery outcome inventory differs from project recovery implementation/u);

  const fixtureUseRoot = path.join(temporaryRoot, 'use');
  fs.cpSync(path.join(root, 'docs/site/use'), fixtureUseRoot, { recursive: true });
  const nested = path.join(fixtureUseRoot, 'workflows', 'mutation-task.md');
  fs.writeFileSync(nested, '# Mutation Task\n\n<!-- operator-task: nested-mutation-task -->\n');
  expectFailure('scripts/check-operator-task-registry.mjs', {
    OPERATOR_TASK_USE_ROOT: fixtureUseRoot,
  }, /operator-task markers and registry registrations differ/u);

  const fenceCases = new Map([
    ['blockquote.md', '> ```bash\n> kubectl get pods\n> ```\n'],
    ['list.md', '- ```bash\n  kubectl get pods\n  ```\n'],
    ['deep-indented.md', '        ~~~sh\n        helm list\n        ~~~\n'],
    ['reference/secrets.md', '```bash\n./scripts/deploy.sh status\n```\n'],
  ]);
  for (const [relative, contents] of fenceCases) {
    const fixtureSiteRoot = path.join(temporaryRoot, `site-${relative.replaceAll('/', '-')}`);
    const target = path.join(fixtureSiteRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
    expectFailure('scripts/check-operator-task-registry.mjs', {
      OPERATOR_TASK_SITE_ROOT: fixtureSiteRoot,
    }, /cluster-capable fenced block must begin with assert_cluster_binding/u);
  }

  const transitiveRoot = path.join(temporaryRoot, 'transitive-npm-ci');
  const transitiveSite = path.join(transitiveRoot, 'site');
  fs.mkdirSync(path.join(transitiveRoot, 'scripts'), { recursive: true });
  fs.mkdirSync(transitiveSite, { recursive: true });
  fs.writeFileSync(path.join(transitiveRoot, 'package.json'), JSON.stringify({
    scripts: { 'mutation:bootstrap': 'bash scripts/mutation-bootstrap.sh' },
  }));
  fs.writeFileSync(path.join(transitiveRoot, 'scripts/mutation-bootstrap.sh'),
    '#!/usr/bin/env bash\nnpm ci --ignore-scripts\n');
  fs.writeFileSync(path.join(transitiveSite, 'wrapper.md'),
    '# Wrapper\n\n```bash\nnpm run mutation:bootstrap\n```\n');
  expectFailure('scripts/check-operator-task-registry.mjs', {
    OPERATOR_TASK_SITE_ROOT: transitiveSite,
    OPERATOR_TASK_EXECUTION_ROOT: transitiveRoot,
  }, /executable command reaches npm ci but does not link the canonical locked dependency procedure/u);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log('Operator task registry mutation fixtures passed (both implementation authorities; nested task; Markdown containers, reference page, and transitive npm ci wrapper).');
