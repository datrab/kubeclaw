import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  VALIDATION_CODES,
  runPreflightValidation,
} from '../../../../../skills/nova/pipeline/services/validation.ts';

function makeValidationFixture({ forgeText }) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-validation-'));
  const swarmDir = path.join(repoRoot, 'Projects/demo/src/.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  const moduleDir = path.join(modulesDir, '01-nginx');
  fs.mkdirSync(moduleDir, { recursive: true });
  fs.writeFileSync(path.join(moduleDir, 'FORGE.md'), forgeText);
  return {
    repoRoot,
    config: {
      repo_root: repoRoot,
      paths: {
        swarm_dir: swarmDir,
        modules_dir: modulesDir,
      },
    },
  };
}

test('preflight treats non-owned serve Dockerfile as runtime input, not Forge deliverable', () => {
  const fixture = makeValidationFixture({
    forgeText: 'Own only `nginx/default.conf`.\n',
  });
  try {
    const result = runPreflightValidation({
      owned_paths: ['nginx/default.conf'],
      test_config: {
        serve: {
          dockerfile: 'Projects/demo/src/Dockerfile',
        },
      },
    }, '01-nginx', fixture.config);

    assert.equal(result.passed, true);
    assert.deepEqual(result.failures, []);
  } finally {
    fs.rmSync(fixture.repoRoot, { recursive: true, force: true });
  }
});

test('preflight still requires owned serve Dockerfile deliverables in Forge blueprint', () => {
  const fixture = makeValidationFixture({
    forgeText: 'Own release assembly.\n',
  });
  try {
    const result = runPreflightValidation({
      owned_paths: ['Dockerfile', 'src/index.html'],
      test_config: {
        serve: {
          dockerfile: 'Projects/demo/src/Dockerfile',
        },
      },
    }, '01-nginx', fixture.config);

    assert.equal(result.passed, false);
    assert.equal(result.failures[0].code, VALIDATION_CODES.SERVE_DOCKERFILE_NOT_DECLARED);
  } finally {
    fs.rmSync(fixture.repoRoot, { recursive: true, force: true });
  }
});
