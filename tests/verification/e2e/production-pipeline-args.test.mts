import assert from 'node:assert/strict';
import test from 'node:test';

import { parseProductionPipelineArgs } from './production-pipeline-args.mts';

test('production pipeline arguments accept resume as a boolean flag', () => {
  assert.deepEqual(
    parseProductionPipelineArgs([
      '--project', 'demo',
      '--resume',
      '--model', 'openai/gpt-5.3-codex-spark',
    ]),
    {
      project: 'demo',
      resume: 'true',
      model: 'openai/gpt-5.3-codex-spark',
    },
  );
});

test('production pipeline arguments reject missing option values', () => {
  assert.throws(
    () => parseProductionPipelineArgs(['--project', '--resume']),
    /ARGUMENT_INVALID:--project/u,
  );
});
