import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AGENT_OBSERVABILITY_MASKING_PROFILE,
  AGENT_OBSERVABILITY_SOURCE,
} from '../../../../../../skills/common/pipeline/agent-observability/src/constants.ts';
import { validateAgentObservabilityIngressEvent } from '../../../../../../skills/common/pipeline/agent-observability/src/validation.ts';

function llmInputEvent(payloadOverrides = {}) {
  return {
    v: 1,
    type: 'openclaw.llm.input',
    source: AGENT_OBSERVABILITY_SOURCE,
    ts: '2026-06-04T00:00:00.000Z',
    identity: { run_id: 'run-1' },
    payload: {
      hook: 'llm_input',
      prompt: 'hello',
      history_messages: [],
      ...payloadOverrides,
    },
    masking: {
      profile: AGENT_OBSERVABILITY_MASKING_PROFILE,
      content: 'full',
      masked: [],
    },
  };
}

test('validateAgentObservabilityIngressEvent rejects undefined JSON object values', () => {
  const result = validateAgentObservabilityIngressEvent(llmInputEvent({
    metadata: { dropped: undefined },
  }));

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('payload.metadata must be JSON-safe'));
});
