import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getCleanupStatePath, trackRuntimeResources } from '../../../../../skills/buster/pipeline/services/resource-cleanup.ts';

test('runtime cleanup state tracks only namespace leases', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'resource-cleanup-'));
  const payload = { project: 'p', module_id: 'm', attempt: 1, run_id: 'r' };
  try {
    trackRuntimeResources(payload, { leases: ['lease-a'] }, { stateRoot });
    trackRuntimeResources(payload, { leases: ['lease-a', 'lease-b'] }, { stateRoot });
    const state = JSON.parse(fs.readFileSync(getCleanupStatePath(payload, { stateRoot }), 'utf8'));
    assert.deepEqual(state, { leases: ['lease-a', 'lease-b'] });
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
