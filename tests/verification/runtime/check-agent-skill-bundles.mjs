#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const sourceRoot = path.resolve(
  process.argv.includes('--source-root')
    ? process.argv[process.argv.indexOf('--source-root') + 1]
    : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..'),
);
const packageScript = path.join(sourceRoot, 'scripts', 'package-agent-skill-bundle.sh');
const fixtureCommit = '0000000000000000000000000000000000000000';
const fixtureBuiltAt = '1970-01-01T00:00:00Z';

assert(fs.existsSync(packageScript), `Bundle packager not found: ${packageScript}`);

function digest(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function collectFiles(root) {
  const files = new Map();
  if (!fs.existsSync(root)) return files;

  const visit = (directory, prefix = '') => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relativePath = path.posix.join(prefix, entry.name);
      const absolutePath = path.join(directory, entry.name);
      assert(!entry.isSymbolicLink(), `Skill bundles must not contain symlinks: ${absolutePath}`);
      if (entry.isDirectory()) {
        visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        files.set(relativePath, digest(absolutePath));
      }
    }
  };

  visit(root);
  return files;
}

function expectedOverlay(role) {
  const expected = collectFiles(path.join(sourceRoot, 'skills', role));
  for (const [relativePath, fileDigest] of collectFiles(path.join(sourceRoot, 'skills', 'common'))) {
    expected.set(relativePath, fileDigest);
  }
  for (const relativePath of [...expected.keys()]) {
    if (/^plugins\/[^/]+\/tests\//.test(relativePath)) expected.delete(relativePath);
  }
  for (const relativePath of [...expected.keys()]) {
    if (relativePath.startsWith('pipeline/agent-observability/src/')) {
      expected.delete(relativePath);
    }
  }
  for (const [relativePath, fileDigest] of collectFiles(
    path.join(sourceRoot, 'contracts', 'agent-observability', 'v1', 'src'),
  )) {
    expected.set(path.posix.join('pipeline/agent-observability/src', relativePath), fileDigest);
    expected.set(path.posix.join('plugins/openclaw-agent-observer/src/agent-observability', relativePath), fileDigest);
  }
  for (const [relativePath, fileDigest] of collectFiles(
    path.join(sourceRoot, 'contracts', 'telemetry', 'v1'),
  )) {
    expected.set(path.posix.join('pipeline/contracts/telemetry/v1', relativePath), fileDigest);
  }
  return expected;
}

function assertMapsEqual(actual, expected, label) {
  assert.deepEqual(
    [...actual.keys()].sort(),
    [...expected.keys()].sort(),
    `${label} file list must exactly match the role-first/Common-second overlay`,
  );
  for (const [relativePath, expectedDigest] of expected) {
    assert.equal(
      actual.get(relativePath),
      expectedDigest,
      `${label} content mismatch at ${relativePath}`,
    );
  }
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-agent-skill-bundles-'));

try {
  for (const role of ['nova', 'buster']) {
    const archivePath = path.join(tempRoot, `${role}.tgz`);
    const extractRoot = path.join(tempRoot, `${role}-extracted`);
    fs.mkdirSync(extractRoot);

    execFileSync('bash', [
      packageScript,
      role,
      archivePath,
      fixtureCommit,
      'v1',
      fixtureBuiltAt,
    ], { cwd: sourceRoot, stdio: 'pipe' });
    execFileSync('tar', ['-xzf', archivePath, '-C', extractRoot], { stdio: 'pipe' });

    const bundleRoot = path.join(extractRoot, `${role}-${fixtureCommit}`);
    const skillsRoot = path.join(bundleRoot, 'skills');
    const manifest = JSON.parse(fs.readFileSync(path.join(bundleRoot, 'manifest.json'), 'utf8'));

    assert.deepEqual(manifest, {
      contractVersion: 'v1',
      bundleKind: 'app-skills-overlay',
      runtimeSurface: '/app/skills',
      agent: role,
      commit: fixtureCommit,
      builtAt: fixtureBuiltAt,
      sourceSubpaths: [
        `skills/${role}`,
        'skills/common',
        'contracts/agent-observability/v1',
        'contracts/telemetry/v1',
      ],
      overlayOrder: [`skills/${role}`, 'skills/common'],
      healthcheckVersion: 'v1',
    });

    assertMapsEqual(collectFiles(skillsRoot), expectedOverlay(role), `${role} bundle`);
    assert(!fs.existsSync(path.join(skillsRoot, 'skills')), `${role} bundle must not nest a second skills/ root`);
    for (const required of [
      'plugin-runtime/core',
      'plugin-runtime/sdk',
      'plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json',
      'plugins',
    ]) {
      assert(fs.existsSync(path.join(skillsRoot, required)), `${role} bundle must materialize ${required}`);
    }
    const roleOnlyPlugin = role === 'nova' ? 'delivery-lint' : 'test-agent';
    const forbiddenRolePlugin = role === 'nova' ? 'test-agent' : 'delivery-lint';
    assert(fs.existsSync(path.join(skillsRoot, 'plugins', roleOnlyPlugin, 'plugin.json')), `${role} bundle must contain ${roleOnlyPlugin}`);
    assert(!fs.existsSync(path.join(skillsRoot, 'plugins', forbiddenRolePlugin)), `${role} bundle must exclude ${forbiddenRolePlugin}`);
    assert(fs.existsSync(path.join(skillsRoot, 'plugins', 'artifact-store', 'plugin.json')), `${role} bundle must contain shared plugins`);
    fs.symlinkSync(path.join(sourceRoot, 'node_modules'), path.join(bundleRoot, 'node_modules'), 'junction');
    const core = await import(pathToFileURL(path.join(skillsRoot, 'plugin-runtime', 'core', 'src', 'index.ts')).href);
    const emptyKernel = core.createEmptyCoreKernel();
    assert.deepEqual(emptyKernel.registry.packages, [], `${role} bundle core must start without packages`);
    assert(Object.isFrozen(emptyKernel.registry), `${role} bundle empty registry must be frozen`);
  }

  assert(fs.existsSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'SKILL.md')));
  assert(fs.existsSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline.ts')));
  assert(fs.existsSync(path.join(sourceRoot, 'skills', 'buster', 'buster-pipeline.ts')));
  assert(fs.existsSync(path.join(sourceRoot, 'skills', 'common', 'pipeline', 'security.ts')));

  console.log(JSON.stringify({
    ok: true,
    roles: ['nova', 'buster'],
    overlayOrder: ['role', 'common'],
    runtimeSurface: '/app/skills',
  }));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
