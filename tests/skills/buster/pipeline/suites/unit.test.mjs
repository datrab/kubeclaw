import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import unitSuite from '../../../../../skills/buster/pipeline/suites/unit.ts';
import { resolveRepoDir } from '../../../../../skills/buster/pipeline/suites/repo-paths.ts';

test('unitSuite preserves custom command exit code metadata', async () => {
  const repoRoot = resolveRepoDir();
  const projectDir = path.join(repoRoot, '.swarm', 'unit-suite-test', String(process.pid), 'exit-code');
  fs.mkdirSync(projectDir, { recursive: true });

  try {
    const verdict = await unitSuite({
      config: {
        serve: { project_dir: path.relative(repoRoot, projectDir) },
        unit: {
          test_cmd: ['node', '-e', 'process.exit(2)'],
        },
      },
      logSink: null,
    });

    assert.equal(verdict.status, 'FAIL');
    assert.equal(verdict.critical, true);
    assert.equal(verdict.metadata.exit_code, 2);
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test('unitSuite includes custom command stderr in generic failure finding', async () => {
  const repoRoot = resolveRepoDir();
  const projectDir = path.join(repoRoot, '.swarm', 'unit-suite-test', String(process.pid), 'stderr-marker');
  fs.mkdirSync(projectDir, { recursive: true });

  try {
    const verdict = await unitSuite({
      config: {
        serve: { project_dir: path.relative(repoRoot, projectDir) },
        unit: {
          test_cmd: ['node', '-e', 'console.error("REAL_E2E_EXPECTED_BUSTER_GATE_FAILURE"); process.exit(1)'],
        },
      },
      logSink: null,
    });

    assert.equal(verdict.status, 'FAIL');
    assert.equal(verdict.critical, true);
    assert.match(verdict.findings[0].message, /REAL_E2E_EXPECTED_BUSTER_GATE_FAILURE/);
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test('unitSuite parses fixture JSON output into checked assertion counts', async () => {
  const repoRoot = resolveRepoDir();
  const projectDir = path.join(repoRoot, '.swarm', 'unit-suite-test', String(process.pid), 'fixture-json');
  fs.mkdirSync(projectDir, { recursive: true });

  try {
    const verdict = await unitSuite({
      config: {
        serve: { project_dir: path.relative(repoRoot, projectDir) },
        unit: {
          test_cmd: ['node', '-e', 'console.log(JSON.stringify({ ok: true, checked: ["branch-a", "branch-b", "resources"] }))'],
          thresholds: { max_failures: 0 },
        },
      },
      logSink: null,
    });

    assert.equal(verdict.status, 'PASS');
    assert.equal(verdict.metadata.framework, 'fixture_json');
    assert.equal(verdict.checks_total, 3);
    assert.equal(verdict.checks_passed, 3);
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});
