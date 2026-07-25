import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createRunStats } from '../../../../../skills/nova/pipeline/core/runtime.ts';

export function makeGateTestConfig(prefix, { modulesUnderSwarm = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const swarmDir = path.join(root, '.swarm');
  fs.mkdirSync(swarmDir, { recursive: true });
  return {
    project: 'test-project',
    repo_root: root,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(modulesUnderSwarm ? swarmDir : root, 'modules'),
    },
    pipeline_defaults: {
      timeout_minutes: 1,
      max_fails: 0,
      auto_retry_threshold: 0,
      agent_startup_retry_budget: 0,
      session_nudge_threshold: 0,
    },
    rate_limit: { max_pauses_per_module: 0, cooldown_hours: 0, cooldown_buffer_ms: 0 },
    locks: {
      lifecycle_append: { stale_ms: 1, timeout_ms: 1 },
      gate_active_session: { stale_ms: 1, timeout_ms: 1 },
    },
    _runId: 'run-test',
    run_id: 'run-test',
    _runStats: createRunStats(),
  };
}
