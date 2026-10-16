import { TEST_CORE_POLICY } from '../../../../../tests/fixtures/core-runtime-policy.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { activate } = await import(pathToFileURL(path.resolve('src/adapter.ts')).href);
const context = (config) => ({
  registration: {},
  config,
  async emit() {},
  async invoke() {
    throw new Error('dependency must not activate during configuration validation');
  },
});
const valid = (overrides = {}) => ({
  ...TEST_CORE_POLICY.transportPublisherStore,
  ...TEST_CORE_POLICY.transportPublisherFailure,...TEST_CORE_POLICY.transportPublisherStructure,
  ...TEST_CORE_POLICY.transportPublisherPayload,
  deliveryRoot: '/tmp/kubeclaw-transport-config-test',
  targets: { audit: { endpoint: 'https://example.test/', payloadProfile: 'standard', signingSecret: 'key' } },
  ...overrides,
});

assert.throws(
  () => activate(context(valid({ extra: true }))),
  /TRANSPORT_CONFIG_INVALID:unknownField/,
);
assert.throws(
  () => activate(context(valid({ targets: { audit: { endpoint: 'ftp://example.test/', payloadProfile: 'standard', signingSecret: 'key' } } }))),
  /TRANSPORT_CONFIG_INVALID:endpoint/,
);
assert.throws(
  () => activate(context(valid({ targets: { audit: { endpoint: 'https://user@example.test/', payloadProfile: 'standard', signingSecret: 'key' } } }))),
  /TRANSPORT_CONFIG_INVALID:endpoint/,
);
assert.throws(
  () => activate(context(valid({ targets: { audit: { endpoint: 'https://example.test/', payloadProfile: 'standard', signingSecret: 'invalid secret' } } }))),
  /TRANSPORT_CONFIG_INVALID:signingSecret/,
);
assert.throws(
  () => activate(context(valid({ targets: { audit: { endpoint: 'https://example.test/', payloadProfile: 'standard', signingSecret: 'key', extra: true } } }))),
  /TRANSPORT_CONFIG_INVALID:target/,
);
assert.throws(
  () => activate(context(valid({ targetPayloadProfiles: {standard: {maxPayloadBytes: 1_048_577}} }))),
  /TRANSPORT_CONFIG_INVALID:maxPayloadBytes/,
);

console.log(JSON.stringify({
  ok: true,
  plugin: 'kubeclaw.transport-publisher',
  suite: 'config-validation',
}));
