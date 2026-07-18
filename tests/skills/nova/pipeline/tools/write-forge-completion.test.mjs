import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildForgeCompletionPayload,
  main,
} from '../../../../../skills/nova/pipeline/tools/write-forge-completion.ts';
import { writeAgentArtifactContext } from '../../../../../skills/common/pipeline/agent-artifact.ts';

test('Forge completion writer serializes multiline evidence and publishes atomically', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-completion-writer-'));
  const output = path.join(root, '.swarm', 'modules', '01-nginx', 'forge-completion.json');
  const context = writeAgentArtifactContext(output, {
    artifact_type: 'forge_completion',
    schema_version: 1,
    run_id: 'run-1',
    module_id: '01-nginx',
    attempt: 1,
  });
  const payload = buildForgeCompletionPayload({
    status: 'READY_FOR_TESTING',
    summary: 'Ready',
    inspectedFiles: ['nginx/default.conf'],
    consultedContracts: ['.swarm/contracts/module.json'],
    implementationNotes: 'Line one\nLine two',
  });

  main([
    '--context', context,
    '--status', payload.status,
    '--summary', payload.summary,
    '--inspected-file', payload.evidence.inspected_files[0],
    '--consulted-contract', payload.evidence.consulted_contracts[0],
    '--implementation-notes', payload.evidence.implementation_notes,
  ]);

  const artifact = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(artifact.run_id, 'run-1');
  assert.equal(artifact.module_id, '01-nginx');
  assert.equal(artifact.attempt, 1);
  assert.equal(artifact.summary, 'Ready');
  assert.match(artifact.completed_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(fs.readdirSync(path.dirname(output)).sort(), ['forge-completion.json', 'forge-completion.json.identity.json']);
});

test('Forge completion writer rejects incomplete evidence', () => {
  assert.throws(() => buildForgeCompletionPayload({
    status: 'READY_FOR_TESTING',
    summary: 'Ready',
    inspectedFiles: [],
    consultedContracts: ['contract.json'],
    implementationNotes: 'Done',
  }), /at least one inspected-file is required/);
});
