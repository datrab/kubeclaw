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
          test_cmd: 'node -e "process.exit(2)"',
          thresholds: { max_failures: 0 },
        },
      },
      logSink: null,
    });

    assert.equal(verdict.status, 'FAIL');
    assert.equal(verdict.metadata.exit_code, 2);
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});
