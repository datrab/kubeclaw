import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildContext } from '../../../../../../skills/nova/pipeline/tools/lint-report.ts';
import { registerContainerYamlTools } from '../../../../../../skills/nova/pipeline/tools/lint-report/container-yaml-tools.ts';
import { detectProjectTypes } from '../../../../../../skills/nova/pipeline/tools/lint-report/discovery.ts';

test('detectProjectTypes detects nested Helm charts for helm tools', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-discovery-test-'));
  const chartDir = path.join(tempRoot, 'charts', 'app');
  fs.mkdirSync(chartDir, { recursive: true });
  fs.writeFileSync(path.join(chartDir, 'Chart.yaml'), 'apiVersion: v2\nname: app\nversion: 0.1.0\n');

  const { types, markers } = detectProjectTypes(tempRoot, null);

  assert.equal(types.has('helm'), true);
  assert.equal(markers.helm, path.join(chartDir, 'Chart.yaml'));

  const tools = [];
  registerContainerYamlTools(tool => tools.push(tool));
  const helmLint = tools.find(tool => tool.id === 'helm-lint');

  assert.equal(helmLint.detect({
    repoRoot: tempRoot,
    modulePath: null,
    projectTypes: types,
    changedFiles: [],
  }), true);
});

test('buildContext rejects module paths outside the repo root', () => {
  const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-report-context-test-'));
  const repoRoot = path.join(tempParent, 'repo');
  fs.mkdirSync(repoRoot);

  assert.throws(
    () => buildContext({ repo: repoRoot, 'module-path': '../outside' }),
    /--module-path escapes --repo/
  );

  assert.throws(
    () => buildContext({ repo: repoRoot, 'module-path': path.join(tempParent, 'outside') }),
    /--module-path must be relative/
  );
});

test('buildContext normalizes valid nested module paths before discovery', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-report-context-test-'));
  const moduleDir = path.join(repoRoot, 'modules', 'app');
  fs.mkdirSync(moduleDir, { recursive: true });
  fs.writeFileSync(path.join(moduleDir, 'package.json'), '{}\n');

  const ctx = buildContext({
    repo: repoRoot,
    'module-path': 'modules/./app',
    tier: 'full',
  });

  assert.equal(ctx.modulePath, path.join('modules', 'app'));
  assert.equal(ctx.projectTypes.has('javascript'), true);
});
