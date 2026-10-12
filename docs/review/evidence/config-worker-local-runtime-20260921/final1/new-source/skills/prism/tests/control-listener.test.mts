import { readTestBundle, writeTestBundle } from '../../../tests/fixtures/config/swarm-bundle.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import test from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';
import {loadControlCompositionConfig, loadControlServerConfig} from '../server/control-config.ts';
import {loadWorkerConfig} from '../server/worker-config.ts';
import {controlPolicyFixture, writeControlPolicy} from './fixtures/control-policy.mts';

const credentials = {PRISM_SESSION_SECRET: 'test', PRISM_INGRESS_SECRET: 'test',
  PRISM_INGESTION_SECRET: 'test', PRISM_DISPATCH_SECRET: 'test', PRISM_WORKER_SECRET: 'test'};

async function freePort(): Promise<number> {
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const address = reservation.address();
  assert.ok(address && typeof address === 'object');
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  return address.port;
}

for (const value of [undefined, null, '8080', 0, -1, 1.5, 65536, true]) {
  test(`Control listener rejects invalid authored port ${String(value)}`, t => {
    const environment = {...credentials, ...controlPolicyFixture(t, {port: value})};
    assert.throws(() => loadControlServerConfig(environment), /SWARM_CONFIG_INVALID/);
  });
}
for (const port of [1, 65535]) {
  test(`Control accepts TCP boundary ${port} without promising host bind permissions`, t => {
    const environment = {...credentials, ...controlPolicyFixture(t, {port})};
    assert.equal(loadControlServerConfig(environment).port, port);
  });
}
test('Control snapshot owns the port before asynchronous composition; Worker uses its separate authored port', async t => {
  const environment = {...credentials, ...controlPolicyFixture(t, {port: 23456})};
  const pending = loadControlCompositionConfig(environment);
  writeControlPolicy(environment.root, {port: 23457});
  const snapshot = await pending;
  assert.equal(snapshot.listener.port, 23456);
  assert.ok(Object.isFrozen(snapshot)); assert.ok(Object.isFrozen(snapshot.listener));
  for (const PORT of ['', '8080', '23456']) {
    assert.throws(() => loadControlServerConfig({...environment, PORT}), /SWARM_CONFIG_LEGACY_OVERRIDE:PORT/);
  }
  const bundle = readTestBundle(environment.SWARM_CONFIG);
  bundle['prism-worker'].settings.ingress.port = 23458;
  writeTestBundle(environment.SWARM_CONFIG, bundle);
  const worker = loadWorkerConfig({...environment, DATABASE_URL: 'postgresql://test/prism'});
  for (const PORT of ['', '8080', '23458']) {
    assert.throws(() => loadWorkerConfig({...environment, PORT}), /SWARM_CONFIG_LEGACY_OVERRIDE:PORT/);
  }
  assert.equal(worker.port, 23458);
});

async function awaitHealth(port: number, child: ReturnType<typeof spawn>, diagnostic: () => string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(child.exitCode, null, diagnostic());
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {signal: AbortSignal.timeout(200)});
      assert.equal(response.status, 200); assert.deepEqual(await response.json(), {status: 'ok'});
      return;
    } catch { await delay(50); }
  }
  assert.fail(`authored listener did not serve health: ${diagnostic()}`);
}
for (const profile of ['one', 'two']) {
  test(`original production entrypoint serves authored listener profile ${profile}`, async t => {
    const port = await freePort();
    const fixture = controlPolicyFixture(t, {port});
    const child = spawn(process.execPath, ['skills/prism/server/control.ts'], {
      env: {...process.env, ...credentials, SWARM_CONFIG: fixture.SWARM_CONFIG}, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let diagnostic = '';
    child.stdout.on('data', chunk => { diagnostic += chunk; });
    child.stderr.on('data', chunk => { diagnostic += chunk; });
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); }
    });
    await awaitHealth(port, child, () => diagnostic);
    fs.writeFileSync(fixture.SWARM_CONFIG, '{}');
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
  });
}

test('actual Control preserves HTTP errors and availability when the diagnostic sink fails', async t => {
  const port = await freePort();
  const fixture = controlPolicyFixture(t, {port});
  const child = spawn(process.execPath, ['skills/prism/tests/fixtures/closed-stderr-control.mts'], {
    env: {...process.env, ...credentials, SWARM_CONFIG: fixture.SWARM_CONFIG}, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let diagnostic = '';
  child.stdout.on('data', chunk => { diagnostic += chunk; });
  child.stderr.on('data', chunk => { diagnostic += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); }
  });
  await awaitHealth(port, child, () => diagnostic);
  const rejected = await fetch(`http://127.0.0.1:${port}/not-a-route`);
  assert.equal(rejected.status, 422);
  assert.match((await rejected.json() as {error:string}).error, /session/);
  const healthy = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(healthy.status, 200);
  assert.deepEqual(await healthy.json(), {status: 'ok'});
  assert.equal(child.exitCode, null);
});
