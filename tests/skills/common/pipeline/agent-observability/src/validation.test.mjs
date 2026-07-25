import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AGENT_OBSERVABILITY_SOURCE,
} from '../../../../../../contracts/agent-observability/v1/src/constants.ts';
import { validateAgentObservabilityIngressEvent } from '../../../../../../contracts/agent-observability/v1/src/validation.ts';

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
  };
}

test('validateAgentObservabilityIngressEvent rejects undefined JSON object values', () => {
  const result = validateAgentObservabilityIngressEvent(llmInputEvent({
    metadata: { dropped: undefined },
  }));

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('payload.metadata must be JSON-safe'));
});
