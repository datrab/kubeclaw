import {publishedControlConfig} from './fixtures/published-config.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const credentials = {PRISM_SESSION_SECRET: 'test', PRISM_INGRESS_SECRET: 'test',
  PRISM_INGESTION_SECRET: 'test', PRISM_DISPATCH_SECRET: 'test', PRISM_WORKER_SECRET: 'test'};

for (const value of [undefined, null, '8080', 0, -1, 1.5, 65536, true]) {
  test(`Control listener rejects invalid authored port ${String(value)}`, async t => {
    // Invalid selected authors must fail genuine publication before any listener starts.
    await assert.rejects(() => publishedControlConfig(t, {port: value}), /SWARM_CONFIG_INVALID/);
  });
}
for (const port of [1, 65535]) {
  test(`Control accepts TCP boundary ${port} without promising host bind permissions`, async t => {
    const {capture, loadControlServerConfig: configured} = await publishedControlConfig(t, {port});
    assert.equal(configured(capture, credentials).port, port);
  });
}
test('Control snapshot owns the port before asynchronous composition; Worker uses its separate authored port', async t => {
  const fixture = await publishedControlConfig(t, {port: 23456}, {ingress: {
    ...JSON.parse(fs.readFileSync('config/components/prism-worker.config.json', 'utf8')).profiles.standard.settings.ingress,
    port: 23458,
  }});
  const {capture, workerCapture, loadControlCompositionConfig, loadControlServerConfig, loadWorkerConfig} = fixture;
  const environment = {...credentials};
  const pending = loadControlCompositionConfig(capture, environment);
  const file = `${fixture.author}/components/prism-control.config.json`;
  const changed = JSON.parse(fs.readFileSync(file, 'utf8'));
  changed.profiles.standard.settings.port = 23457;
  fs.writeFileSync(file, JSON.stringify(changed));
  const snapshot = await pending;
  assert.equal(snapshot.listener.port, 23456);
  assert.ok(Object.isFrozen(snapshot)); assert.ok(Object.isFrozen(snapshot.listener));
  for (const PORT of ['', '8080', '23456']) {
    assert.throws(() => loadControlServerConfig(capture, {...environment, PORT}), /SWARM_CONFIG_LEGACY_OVERRIDE:PORT/);
  }
  const worker = loadWorkerConfig(workerCapture, {...environment, DATABASE_URL: 'postgresql://test/prism'});
  for (const PORT of ['', '8080', '23458']) {
    assert.throws(() => loadWorkerConfig(workerCapture, {...environment, PORT}), /SWARM_CONFIG_LEGACY_OVERRIDE:PORT/);
  }
  assert.equal(worker.port, 23458);
});
