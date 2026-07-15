import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildRunFacts } from '../../../../../skills/nova/pipeline/services/run-facts.ts';

test('buildRunFacts uses terminal override for blocked early runs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-facts-blocked-'));
  try {
    const config = {
      project: 'blocked-seed',
      _runId: 'run-blocked',
      paths: {
        swarm_dir: path.join(dir, '.swarm'),
      },
    };

    const facts = buildRunFacts(config, {
      modules: {
        '01-nginx': { title: 'Foundation', dir: '01-nginx' },
      },
      gates: {},
    }, {
      terminal_status: 'blocked',
      reason_code: 'module_failed',
      started_at: '2026-07-09T15:36:22.000Z',
      completed_at: '2026-07-09T15:39:22.000Z',
      duration_seconds: 180,
    });

    assert.equal(facts.terminal.status, 'blocked');
    assert.equal(facts.terminal.reason_code, 'module_failed');
    assert.equal(facts.terminal.completed_at, '2026-07-09T15:39:22.000Z');
    assert.equal(facts.terminal.duration_seconds, 180);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
