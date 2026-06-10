import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPluginInvocationEnvelope } from '../../../../../skills/nova/pipeline/core/context.ts';

test('plugin invocation envelope strips capability protected fields from extras', () => {
  const pluginContext = {
    moduleId: 'restricted-plugin',
    hookFamily: 'worker.execute',
    stageId: 'worker:module_forge',
    capabilities: [],
  };

  const envelope = buildPluginInvocationEnvelope(
    {
      task: 'run',
      artifacts: [{ ref: 'input-artifact' }],
      summaries: ['input-summary'],
      priorResults: [{ id: 'input-result' }],
      presentation: { title: 'input presentation' },
    },
    pluginContext,
    {
      workerInput: { ok: true },
      artifacts: [{ ref: 'extra-artifact' }],
      summaries: ['extra-summary'],
      priorResults: [{ id: 'extra-result' }],
      presentation: { title: 'extra presentation' },
    },
  );

  assert.equal(envelope.task, 'run');
  assert.deepEqual(envelope.workerInput, { ok: true });
  assert.equal('artifacts' in envelope, false);
  assert.equal('summaries' in envelope, false);
  assert.equal('priorResults' in envelope, false);
  assert.equal('presentation' in envelope, false);
  assert.equal('artifacts' in envelope.input, false);
  assert.equal('summaries' in envelope.input, false);
  assert.equal('priorResults' in envelope.input, false);
  assert.equal('presentation' in envelope.input, false);
});
