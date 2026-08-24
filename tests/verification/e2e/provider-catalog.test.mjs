import assert from 'node:assert/strict';
import { parseCapabilityProviders, resolveProviderCapability } from './provider-catalog.mjs';

const providers = parseCapabilityProviders(JSON.stringify({
  buster: {
    agentRole: 'buster',
    capabilities: {
      'runtime.dispatch': { adapter: 'openclaw', endpoint: 'http://agent-buster:18789' },
      'test.plan.execute': { adapter: 'buster-plan-v1', endpoint: 'https://agent-buster:18891' },
      'test.suite.execute': { adapter: 'buster-suite-v2', endpoint: 'http://agent-buster:18892' },
    },
  },
  security: {
    agentRole: 'security',
    capabilities: {
      'runtime.dispatch': { adapter: 'kagent', endpoint: 'http://security-agent:8080' },
      'test.suite.execute': { adapter: 'custom-python', endpoint: 'http://security-runner:9000' },
    },
  },
}));

assert.deepEqual(resolveProviderCapability(providers, 'buster', 'runtime.dispatch'), {
  adapter: 'openclaw',
  endpoint: 'http://agent-buster:18789',
});
assert.deepEqual(resolveProviderCapability(providers, 'buster', 'test.suite.execute'), {
  adapter: 'buster-suite-v2',
  endpoint: 'http://agent-buster:18892',
});
assert.deepEqual(resolveProviderCapability(providers, 'buster', 'test.plan.execute'), {
  adapter: 'buster-plan-v1', endpoint: 'https://agent-buster:18891',
});
assert.equal(resolveProviderCapability(providers, 'security', 'runtime.dispatch').adapter, 'kagent');
assert.equal(resolveProviderCapability(providers, 'security', 'test.suite.execute').adapter, 'custom-python');
assert.throws(() => resolveProviderCapability(providers, 'buster', 'security.scan.execute'), /ROUTE_NOT_FOUND/u);
assert.throws(() => parseCapabilityProviders('{}'), /CATALOG_INVALID/u);
assert.throws(() => parseCapabilityProviders(JSON.stringify({
  invalid: {
    agentRole: 'invalid',
    capabilities: {
      'runtime.dispatch': { adapter: 'openclaw', endpoint: 'http://agent:18789/native-route' },
    },
  },
})), /ENDPOINT_INVALID/u);

console.log(JSON.stringify({ ok: true, suite: 'capability-provider-catalog' }));
