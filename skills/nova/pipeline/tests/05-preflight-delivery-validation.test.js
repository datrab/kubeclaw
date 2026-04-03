import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  VALIDATION_CODES,
  runPreflightValidation,
  runDeliveryLintValidation,
  formatValidationFailures,
} from '../services/validation.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'val-test-'));
}

/**
 * Build a minimal config pointing at a temp directory as modules_dir.
 * swarm_dir is set so projectSrcPath() resolves to tmp (parent of .swarm).
 */
function makeConfig(modulesDir, swarmDir) {
  const sd = swarmDir || path.join(modulesDir, '.swarm');
  return {
    paths: {
      modules_dir: modulesDir,
      swarm_dir: sd,
    },
  };
}

// ─── runPreflightValidation ───────────────────────────────────────────────────

describe('runPreflightValidation()', () => {
  it('passes when no test_config is set', () => {
    const tmp = makeTmpDir();
    const modDir = path.join(tmp, '05-test');
    fs.mkdirSync(modDir);
    fs.writeFileSync(path.join(modDir, 'FORGE.md'), '# FORGE\n## Deliverables\nDockerfile\n');

    const config = makeConfig(tmp);
    const mod = { test_config: {} };
    const result = runPreflightValidation(mod, '05-test', config);

    assert.equal(result.passed, true);
    assert.deepEqual(result.failures, []);
  });

  it('passes when FORGE.md is absent (skip, not fail)', () => {
    const tmp = makeTmpDir();
    fs.mkdirSync(path.join(tmp, '05-test'));
    // No FORGE.md written

    const config = makeConfig(tmp);
    const mod = { test_config: { serve: { dockerfile: 'Dockerfile' } } };
    const result = runPreflightValidation(mod, '05-test', config);

    assert.equal(result.passed, true, 'missing FORGE.md should skip, not fail');
    assert.deepEqual(result.failures, []);
  });

  it('passes when serve.dockerfile filename appears in FORGE.md', () => {
    const tmp = makeTmpDir();
    const modDir = path.join(tmp, '05-test');
    fs.mkdirSync(modDir);
    fs.writeFileSync(
      path.join(modDir, 'FORGE.md'),
      '# FORGE\n## Required Deliverables\n- Dockerfile\n- src/server.js\n',
    );

    const config = makeConfig(tmp);
    const mod = { test_config: { serve: { dockerfile: 'services/api/Dockerfile' } } };
    const result = runPreflightValidation(mod, '05-test', config);

    assert.equal(result.passed, true);
    assert.deepEqual(result.failures, []);
  });

  // ── Negative: serve.dockerfile not in FORGE.md ──────────────────────────────

  it('fails with SERVE_DOCKERFILE_NOT_DECLARED when dockerfile not mentioned in FORGE.md', () => {
    const tmp = makeTmpDir();
    const modDir = path.join(tmp, '05-test');
    fs.mkdirSync(modDir);
    fs.writeFileSync(
      path.join(modDir, 'FORGE.md'),
      '# FORGE\n## Required Deliverables\n- src/server.js\n- openapi.yaml\n',
    );

    const config = makeConfig(tmp);
    const mod = { test_config: { serve: { dockerfile: 'services/api/Dockerfile' } } };
    const result = runPreflightValidation(mod, '05-test', config);

    assert.equal(result.passed, false);
    assert.equal(result.failures.length, 1);
    const f = result.failures[0];
    assert.equal(f.stage, 'preflight_contract');
    assert.equal(f.code, VALIDATION_CODES.SERVE_DOCKERFILE_NOT_DECLARED);
    assert.ok(f.explanation.includes('Dockerfile'), 'explanation should name the file');
    assert.ok(f.next_step.length > 0, 'next_step should be non-empty');
  });

  it('passes when api.spec_file filename appears in FORGE.md', () => {
    const tmp = makeTmpDir();
    const modDir = path.join(tmp, '05-test');
    fs.mkdirSync(modDir);
    fs.writeFileSync(
      path.join(modDir, 'FORGE.md'),
      '# FORGE\n## Expected Outputs\n- openapi.yaml\n- src/index.js\n',
    );

    const config = makeConfig(tmp);
    const mod = { test_config: { api: { spec_file: 'docs/openapi.yaml' } } };
    const result = runPreflightValidation(mod, '05-test', config);

    assert.equal(result.passed, true);
  });

  // ── Negative: api.spec_file not in FORGE.md ─────────────────────────────────

  it('fails with API_SPEC_NOT_DECLARED when spec_file not mentioned in FORGE.md', () => {
    const tmp = makeTmpDir();
    const modDir = path.join(tmp, '05-test');
    fs.mkdirSync(modDir);
    fs.writeFileSync(
      path.join(modDir, 'FORGE.md'),
      '# FORGE\n## Required Deliverables\n- Dockerfile\n- src/server.js\n',
    );

    const config = makeConfig(tmp);
    const mod = { test_config: { api: { spec_file: 'docs/openapi.yaml' } } };
    const result = runPreflightValidation(mod, '05-test', config);

    assert.equal(result.passed, false);
    assert.equal(result.failures.length, 1);
    const f = result.failures[0];
    assert.equal(f.stage, 'preflight_contract');
    assert.equal(f.code, VALIDATION_CODES.API_SPEC_NOT_DECLARED);
    assert.ok(f.explanation.includes('openapi.yaml'), 'explanation should name the file');
  });

  it('reports both failures when both dockerfile and spec_file are undeclared', () => {
    const tmp = makeTmpDir();
    const modDir = path.join(tmp, '05-test');
    fs.mkdirSync(modDir);
    fs.writeFileSync(
      path.join(modDir, 'FORGE.md'),
      '# FORGE\n## Required Deliverables\n- src/index.js\n',
    );

    const config = makeConfig(tmp);
    const mod = {
      test_config: {
        serve: { dockerfile: 'Dockerfile' },
        api: { spec_file: 'openapi.yaml' },
      },
    };
    const result = runPreflightValidation(mod, '05-test', config);

    assert.equal(result.passed, false);
    assert.equal(result.failures.length, 2);
    const codes = result.failures.map(f => f.code);
    assert.ok(codes.includes(VALIDATION_CODES.SERVE_DOCKERFILE_NOT_DECLARED));
    assert.ok(codes.includes(VALIDATION_CODES.API_SPEC_NOT_DECLARED));
  });
});

// ─── runDeliveryLintValidation ────────────────────────────────────────────────

describe('runDeliveryLintValidation()', () => {
  it('passes when no serve.dockerfile is configured', () => {
    const tmp = makeTmpDir();
    const config = makeConfig(tmp);
    const mod = { test_config: { unit: { test_cmd: 'node --test' } } };
    const result = runDeliveryLintValidation(mod, '05-test', config);

    assert.equal(result.passed, true);
    assert.deepEqual(result.failures, []);
  });

  // ── Negative: Dockerfile declared but missing ────────────────────────────────

  it('fails with SERVE_DOCKERFILE_MISSING when Dockerfile not on disk after Forge', () => {
    const tmp = makeTmpDir();
    // swarm_dir one level below tmp so projectSrcPath == tmp
    const swarmDir = path.join(tmp, '.swarm');
    fs.mkdirSync(swarmDir, { recursive: true });
    const config = makeConfig(path.join(tmp, 'modules'), swarmDir);
    fs.mkdirSync(config.paths.modules_dir, { recursive: true });

    const mod = { test_config: { serve: { dockerfile: 'services/api/Dockerfile' } } };
    // Dockerfile NOT created on disk
    const result = runDeliveryLintValidation(mod, '05-test', config);

    assert.equal(result.passed, false);
    assert.equal(result.failures.length, 1);
    const f = result.failures[0];
    assert.equal(f.stage, 'delivery_lint');
    assert.equal(f.code, VALIDATION_CODES.SERVE_DOCKERFILE_MISSING);
    assert.ok(f.explanation.includes('services/api/Dockerfile'));
    assert.ok(f.next_step.length > 0);
  });

  it('passes when Dockerfile exists and no static_path is configured', () => {
    const tmp = makeTmpDir();
    const swarmDir = path.join(tmp, '.swarm');
    fs.mkdirSync(swarmDir, { recursive: true });
    const config = makeConfig(path.join(tmp, 'modules'), swarmDir);
    fs.mkdirSync(config.paths.modules_dir, { recursive: true });

    // Create the Dockerfile at the expected project-source-relative path
    const dockerfileAbs = path.join(tmp, 'Dockerfile');
    fs.writeFileSync(dockerfileAbs, 'FROM node:20\nCOPY dist/ /app/dist/\n');

    const mod = { test_config: { serve: { dockerfile: 'Dockerfile' } } };
    const result = runDeliveryLintValidation(mod, '05-test', config);

    assert.equal(result.passed, true, 'Dockerfile exists, no static_path — should pass');
  });

  // ── Positive: matching COPY destination passes static_path check ─────────────

  it('passes when Dockerfile COPY destination matches static_path', () => {
    const tmp = makeTmpDir();
    const swarmDir = path.join(tmp, '.swarm');
    fs.mkdirSync(swarmDir, { recursive: true });
    const config = makeConfig(path.join(tmp, 'modules'), swarmDir);
    fs.mkdirSync(config.paths.modules_dir, { recursive: true });

    const dockerfileAbs = path.join(tmp, 'Dockerfile');
    fs.writeFileSync(
      dockerfileAbs,
      'FROM node:20\nRUN npm ci\nCOPY dist/ /app/public\n',
    );

    const mod = {
      test_config: {
        serve: {
          dockerfile: 'Dockerfile',
          static_path: '/app/public',
        },
      },
    };
    const result = runDeliveryLintValidation(mod, '05-test', config);

    assert.equal(result.passed, true, 'COPY dest matches static_path — should pass');
  });

  it('passes when COPY destination has trailing slash and static_path does not', () => {
    const tmp = makeTmpDir();
    const swarmDir = path.join(tmp, '.swarm');
    fs.mkdirSync(swarmDir, { recursive: true });
    const config = makeConfig(path.join(tmp, 'modules'), swarmDir);
    fs.mkdirSync(config.paths.modules_dir, { recursive: true });

    const dockerfileAbs = path.join(tmp, 'Dockerfile');
    fs.writeFileSync(
      dockerfileAbs,
      'FROM node:20\nCOPY dist/ /app/public/\n',
    );

    const mod = {
      test_config: {
        serve: { dockerfile: 'Dockerfile', static_path: '/app/public' },
      },
    };
    const result = runDeliveryLintValidation(mod, '05-test', config);

    assert.equal(result.passed, true, 'trailing slash should be normalized away');
  });

  // ── Negative: COPY destination does not match static_path ───────────────────

  it('fails with STATIC_PATH_MISMATCH when Dockerfile COPY destination differs from static_path', () => {
    const tmp = makeTmpDir();
    const swarmDir = path.join(tmp, '.swarm');
    fs.mkdirSync(swarmDir, { recursive: true });
    const config = makeConfig(path.join(tmp, 'modules'), swarmDir);
    fs.mkdirSync(config.paths.modules_dir, { recursive: true });

    const dockerfileAbs = path.join(tmp, 'Dockerfile');
    // Dockerfile copies to /app/static but test_config expects /app/public
    fs.writeFileSync(
      dockerfileAbs,
      'FROM node:20\nRUN npm ci\nCOPY dist/ /app/static\n',
    );

    const mod = {
      test_config: {
        serve: {
          dockerfile: 'Dockerfile',
          static_path: '/app/public',
        },
      },
    };
    const result = runDeliveryLintValidation(mod, '05-test', config);

    assert.equal(result.passed, false);
    assert.equal(result.failures.length, 1);
    const f = result.failures[0];
    assert.equal(f.stage, 'delivery_lint');
    assert.equal(f.code, VALIDATION_CODES.STATIC_PATH_MISMATCH);
    assert.ok(f.explanation.includes('/app/public'), 'explanation should include expected static_path');
    assert.ok(f.explanation.includes('/app/static'), 'explanation should include actual COPY dest');
    assert.ok(f.next_step.length > 0);
  });

  it('passes when one of multiple COPY destinations matches static_path', () => {
    const tmp = makeTmpDir();
    const swarmDir = path.join(tmp, '.swarm');
    fs.mkdirSync(swarmDir, { recursive: true });
    const config = makeConfig(path.join(tmp, 'modules'), swarmDir);
    fs.mkdirSync(config.paths.modules_dir, { recursive: true });

    const dockerfileAbs = path.join(tmp, 'Dockerfile');
    fs.writeFileSync(
      dockerfileAbs,
      'FROM node:20\nCOPY package.json /app/\nCOPY dist/ /app/public\n',
    );

    const mod = {
      test_config: {
        serve: { dockerfile: 'Dockerfile', static_path: '/app/public' },
      },
    };
    const result = runDeliveryLintValidation(mod, '05-test', config);

    assert.equal(result.passed, true, 'one of the COPY dests matches — should pass');
  });
});

// ─── formatValidationFailures ─────────────────────────────────────────────────

describe('formatValidationFailures()', () => {
  it('returns empty string for empty failures array', () => {
    assert.equal(formatValidationFailures([]), '');
  });

  it('returns empty string for null/undefined', () => {
    assert.equal(formatValidationFailures(null), '');
    assert.equal(formatValidationFailures(undefined), '');
  });

  it('includes stage, code, explanation, and next_step for a single failure', () => {
    const failures = [{
      stage: 'preflight_contract',
      code: VALIDATION_CODES.SERVE_DOCKERFILE_NOT_DECLARED,
      explanation: 'Dockerfile not in FORGE.md',
      next_step: 'Add Dockerfile to FORGE.md',
    }];
    const output = formatValidationFailures(failures);

    assert.ok(output.includes('preflight_contract'), 'should include stage');
    assert.ok(output.includes(VALIDATION_CODES.SERVE_DOCKERFILE_NOT_DECLARED), 'should include code');
    assert.ok(output.includes('Dockerfile not in FORGE.md'), 'should include explanation');
    assert.ok(output.includes('Add Dockerfile to FORGE.md'), 'should include next_step');
    assert.ok(output.includes('VALIDATION FAILED'), 'should include header');
  });

  it('labels count correctly for multiple failures', () => {
    const failures = [
      { stage: 'preflight_contract', code: 'CODE_A', explanation: 'Exp A', next_step: 'Fix A' },
      { stage: 'preflight_contract', code: 'CODE_B', explanation: 'Exp B', next_step: 'Fix B' },
    ];
    const output = formatValidationFailures(failures);

    assert.ok(output.includes('2 issues'), 'should say "2 issues"');
    assert.ok(output.includes('CODE_A'), 'should include first code');
    assert.ok(output.includes('CODE_B'), 'should include second code');
  });

  it('uses singular "issue" for a single failure', () => {
    const failures = [
      { stage: 'delivery_lint', code: 'CODE_A', explanation: 'Exp A', next_step: 'Fix A' },
    ];
    const output = formatValidationFailures(failures);
    assert.ok(output.includes('1 issue)'), 'should say "1 issue"');
    assert.ok(!output.includes('issues'), 'should not say "issues" in plural');
  });
});
