import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFullPipelineResumeCommand } from '../../../../../../skills/nova/pipeline/services/failures/retry-policy.ts';

test('full pipeline resume command shell-quotes dynamic arguments', () => {
  const command = buildFullPipelineResumeCommand(
    { project: "foo bar 'quoted'; touch /tmp/clawpatch-poc" },
    'try a safer approach',
  );

  assert.equal(
    command,
    "node pipeline.ts --project 'foo bar '\\''quoted'\\''; touch /tmp/clawpatch-poc' --resume --prompt 'try a safer approach'",
  );
});
