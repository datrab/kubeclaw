import assert from 'node:assert/strict';
import test from 'node:test';

import { buildProbeMonitorOptions } from '../../../../../skills/buster/pipeline/services/rate-limit.ts';

test('buildProbeMonitorOptions preserves gateway credentials supplied through acpMonitorConfig', () => {
  const monitorOptions = buildProbeMonitorOptions(null, null, {
    gatewayUrl: 'http://gateway.test',
    gatewayToken: 'gateway-token',
  });

  assert.equal(monitorOptions.gatewayUrl, 'http://gateway.test');
  assert.equal(monitorOptions.gatewayToken, 'gateway-token');
});
