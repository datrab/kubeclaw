import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildAgentArtifact,
  publishAgentArtifact,
  writeAgentArtifactContext,
} from '../../../../skills/common/pipeline/agent-artifact.ts';

test('common agent artifact publisher owns immutable envelope fields', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-artifact-'));
  const output = path.join(root, 'result.json');
  const context = writeAgentArtifactContext(output, {
    artifact_type: 'review_result',
    schema_version: 1,
    run_id: 'run-canonical',
    module_id: 'module-canonical',
    attempt: 2,
  });

  const artifact = publishAgentArtifact(context, { status: 'PASS', summary: 'Semantically complete' });
  assert.equal(artifact.run_id, 'run-canonical');
  assert.equal(artifact.module_id, 'module-canonical');
  assert.equal(artifact.attempt, 2);
  assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).summary, 'Semantically complete');
});

test('common agent artifact publisher rejects pipeline-owned fields in semantic payloads', () => {
  assert.throws(
    () => buildAgentArtifact({ run_id: 'canonical' }, { run_id: 'agent-authored', status: 'PASS' }),
    /may not define pipeline-owned fields: run_id/,
  );
});
