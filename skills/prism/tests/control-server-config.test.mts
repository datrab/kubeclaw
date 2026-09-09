import test from 'node:test';
import assert from 'node:assert/strict';
import {loadControlListenerConfig, loadControlServerConfig} from '../server/control-config.ts';

const shared = {
  PRISM_SESSION_SECRET: 'session-test', PRISM_INGRESS_SECRET: 'ingress-test',
  PRISM_INGESTION_SECRET: 'ingestion-test', PRISM_DISPATCH_SECRET: 'dispatch-test',
  PRISM_WORKER_SECRET: 'worker-test',
};

test('Control configuration preserves production listener and original non-SPIFFE service defaults', () => {
  const configuration = loadControlServerConfig(shared);
  assert.equal(configuration.workerUrl.href, 'http://prism-worker:8080/');
  assert.equal(configuration.controlInternalUrl.href, 'http://prism-control:8080/');
  assert.equal(configuration.ingestionUrl.href, 'http://prism-ingestion:8080/');
  assert.equal(configuration.artifactRoot, '/var/lib/prism/artifacts');
  assert.equal(configuration.studioPublicUrl, 'https://prism-studio');
  assert.equal(configuration.dispatchSecret, shared.PRISM_DISPATCH_SECRET);
  assert.equal(configuration.workerSecret, shared.PRISM_WORKER_SECRET);
  assert.equal(configuration.spiffeEnabled, false);
  assert.deepEqual(loadControlListenerConfig({}), {databaseUrl: undefined, port: 8080});
  assert.deepEqual(loadControlListenerConfig({DATABASE_URL: 'postgresql://db/prism', PORT: '28080'}),
    {databaseUrl: 'postgresql://db/prism', port: 28080});
});

test('Control trust configuration fails closed and keeps optional test-runner identity optional', () => {
  const configuration = {
    ...shared, WORKER_TRUST_SPIFFE_ENABLED: 'true',
    PRISM_TRUSTED_NOVA_SPIFFE_ID: 'spiffe://example.test/nova',
    PRISM_TRUSTED_WORKER_SPIFFE_ID: 'spiffe://example.test/worker',
    PRISM_CONTROL_SPIFFE_ID: 'spiffe://example.test/control',
    PRISM_TRUSTED_AGENT_SPIFFE_ID: 'spiffe://example.test/prism-agent',
  };
  for (const key of ['PRISM_TRUSTED_NOVA_SPIFFE_ID', 'PRISM_TRUSTED_WORKER_SPIFFE_ID',
    'PRISM_CONTROL_SPIFFE_ID', 'PRISM_TRUSTED_AGENT_SPIFFE_ID']) {
    assert.throws(() => loadControlServerConfig({...configuration, [key]: ''}), /trust policy is incomplete/);
  }
  const loaded = loadControlServerConfig(configuration);
  assert.equal(loaded.trustedTestRunnerSpiffeId, '');
  assert.equal(loaded.dispatchSecret, '');
  assert.equal(loaded.workerSecret, '');
  assert.throws(() => loadControlServerConfig({...shared, PRISM_WORKER_SECRET: ''}), /PRISM_WORKER_SECRET is required/);
  assert.throws(() => loadControlServerConfig({...shared, PRISM_SESSION_SECRET: ''}), /PRISM_SESSION_SECRET is required/);
});

test('Control service configuration is an owned startup snapshot, not mutable caller environment', () => {
  const environment = {...shared, PRISM_STUDIO_PUBLIC_URL: 'https://studio.example.test',
    PRISM_WORKER_URL: 'http://worker.example.test:8080',
    PRISM_PIPELINE_PREFERENCE_SUBJECT: `user-${'a'.repeat(24)}`};
  const loaded = loadControlServerConfig(environment);
  environment.PRISM_STUDIO_PUBLIC_URL = 'https://changed.example.test';
  environment.PRISM_WORKER_URL = 'http://changed.example.test';
  environment.PRISM_PIPELINE_PREFERENCE_SUBJECT = `user-${'b'.repeat(24)}`;
  assert.equal(loaded.studioPublicUrl, 'https://studio.example.test');
  assert.equal(loaded.workerUrl.href, 'http://worker.example.test:8080/');
  assert.equal(loaded.pipelinePreferenceSubject, `user-${'a'.repeat(24)}`);
  assert.equal(Object.isFrozen(loaded), true);
});
