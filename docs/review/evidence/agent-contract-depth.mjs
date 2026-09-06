import assert from 'node:assert/strict';
import { validateAgentObservabilityIngressEvent } from '../../../contracts/agent-observability/v1/src/validation.ts';
const event = JSON.parse('{"v":1,"type":"openclaw.session.started","source":"openclaw.plugin.agent-observer","ts":"2026-09-04T00:00:00Z","identity":{},"payload":{"hook":"session_start","metadata":' + '['.repeat(10000) + '0' + ']'.repeat(10000) + '}}');
assert.throws(() => validateAgentObservabilityIngressEvent(event), RangeError);
console.log('PCR-AGENT-CONTRACT-001: approximately 20 KiB valid JSON nesting throws RangeError instead of a validation result');
