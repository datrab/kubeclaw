import {publishedControlConfig} from './fixtures/published-config.mjs';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const shared = {
  PRISM_SESSION_SECRET: 'session-test', PRISM_INGRESS_SECRET: 'ingress-test',
  PRISM_INGESTION_SECRET: 'ingestion-test', PRISM_DISPATCH_SECRET: 'dispatch-test',
  PRISM_WORKER_SECRET: 'worker-test',
};

test('Control configuration preserves production listener and original non-SPIFFE service defaults', async t => {
  const {capture, loadControlServerConfig: serverConfig, loadControlCompositionConfig: composition} = await publishedControlConfig(t);
  const loadControlServerConfig = (env: NodeJS.ProcessEnv) => serverConfig(capture, env);
  const loadControlCompositionConfig = (env: NodeJS.ProcessEnv) => composition(capture, env);
  const configuration = loadControlServerConfig(shared);
  assert.equal(configuration.workerUrl.href, 'http://prism-worker:8080/');
  assert.equal(configuration.controlInternalUrl.href, 'http://prism-control:8080/');
  assert.equal(configuration.ingestionUrl.href, 'http://prism-ingestion:8080/');
  assert.equal(configuration.artifactRoot, '/var/lib/prism/artifacts');
  assert.equal(configuration.studioPublicUrl, 'https://prism-studio');
  assert.equal(configuration.dispatchSecret, shared.PRISM_DISPATCH_SECRET);
  assert.equal(configuration.workerSecret, shared.PRISM_WORKER_SECRET);
  assert.equal(configuration.spiffeEnabled, false);
  assert.deepEqual((await loadControlCompositionConfig(shared)).listener, {databaseUrl: undefined, port: 8080});
  const configurationWithDatabase = await loadControlCompositionConfig({...shared, DATABASE_URL: 'postgresql://db/prism'});
  assert.deepEqual(configurationWithDatabase.listener, {databaseUrl: 'postgresql://db/prism', port: 8080});
  assert.throws(() => loadControlServerConfig({...shared, PORT: '28080'}), /SWARM_CONFIG_LEGACY_OVERRIDE:PORT/);
});

test('Control trust configuration fails closed and keeps optional test-runner identity optional', async t => {
  const {capture, loadControlServerConfig: serverConfig} = await publishedControlConfig(t);
  const loadControlServerConfig = (env: NodeJS.ProcessEnv) => serverConfig(capture, env);
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

test('Control service configuration is an owned startup snapshot, not mutable caller environment', async t => {
  const {author, capture, loadControlServerConfig} = await publishedControlConfig(t, {studioPublicUrl: 'https://studio.example.test',
    pipelinePreferenceSubject: `user-${'a'.repeat(24)}`, workerUrl: 'http://worker.example.test:8080'});
  const environment: NodeJS.ProcessEnv = {...shared};
  const loaded = loadControlServerConfig(capture, environment);
  const file = path.join(author, 'components/prism-control.config.json');
  const changed = JSON.parse(fs.readFileSync(file, 'utf8'));
  changed.profiles.standard.settings.workerUrl = 'http://changed.example.test';
  fs.writeFileSync(file, JSON.stringify(changed));
  const oldStudio = process.env.PRISM_STUDIO_PUBLIC_URL, oldSubject = process.env.PRISM_PIPELINE_PREFERENCE_SUBJECT;
  t.after(() => {
    if (oldStudio === undefined) delete process.env.PRISM_STUDIO_PUBLIC_URL; else process.env.PRISM_STUDIO_PUBLIC_URL = oldStudio;
    if (oldSubject === undefined) delete process.env.PRISM_PIPELINE_PREFERENCE_SUBJECT; else process.env.PRISM_PIPELINE_PREFERENCE_SUBJECT = oldSubject;
  });
  process.env.PRISM_STUDIO_PUBLIC_URL = 'https://changed.example.test';
  environment.PRISM_WORKER_URL = 'http://changed.example.test';
  process.env.PRISM_PIPELINE_PREFERENCE_SUBJECT = `user-${'b'.repeat(24)}`;
  assert.equal(loaded.studioPublicUrl, 'https://studio.example.test');
  assert.equal(loaded.workerUrl.href, 'http://worker.example.test:8080/');
  assert.equal(loaded.pipelinePreferenceSubject, `user-${'a'.repeat(24)}`);
  assert.equal(Object.isFrozen(loaded), true);
  const next = await publishedControlConfig(t, {studioPublicUrl: 'https://next.example.test',
    pipelinePreferenceSubject: `user-${'c'.repeat(24)}`, workerUrl: 'http://next-worker.example.test:8081'});
  const nextLoaded = next.loadControlServerConfig(next.capture, shared);
  assert.equal(nextLoaded.studioPublicUrl, 'https://next.example.test');
  assert.equal(nextLoaded.workerUrl.href, 'http://next-worker.example.test:8081/');
  assert.equal(nextLoaded.pipelinePreferenceSubject, `user-${'c'.repeat(24)}`);
  assert.equal(loaded.studioPublicUrl, 'https://studio.example.test');
  assert.equal(loaded.workerUrl.href, 'http://worker.example.test:8080/');
  assert.equal(loaded.pipelinePreferenceSubject, `user-${'a'.repeat(24)}`);
});
