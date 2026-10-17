/** Original installed Control process obligations. Required isolated native guest;
 * no source-reader replacement, shared-host installation or conditional skip.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import type {ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import test from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';
import {spawnInstalledPrismProcess} from './fixtures/published-process.mjs';
import {controlPolicyFixture} from './fixtures/control-policy.mts';

assert.equal(process.env.PRISM_NATIVE_ISOLATED_TEST_POOL, 'true', 'A dedicated native test pool is required');

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

async function awaitHealth(port: number, child: ChildProcess, diagnostic: () => string) {
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
    const {child} = await spawnInstalledPrismProcess(t, fixture.SWARM_CONFIG, 'prism-control', credentials);
    let diagnostic = '';
    child.stdout.on('data', chunk => { diagnostic += chunk; });
    child.stderr.on('data', chunk => { diagnostic += chunk; });
    await awaitHealth(port, child, () => diagnostic);
    fs.writeFileSync(fixture.SWARM_CONFIG, '{}');
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
  });
}

test('actual Control preserves HTTP errors and availability when the diagnostic sink fails', async t => {
  const port = await freePort();
  const fixture = controlPolicyFixture(t, {port});
  const {child} = await spawnInstalledPrismProcess(t, fixture.SWARM_CONFIG, 'prism-control', credentials, true);
  let diagnostic = '';
  child.stdout.on('data', chunk => { diagnostic += chunk; });
  child.stderr.on('data', chunk => { diagnostic += chunk; });
  await awaitHealth(port, child, () => diagnostic);
  const rejected = await fetch(`http://127.0.0.1:${port}/not-a-route`);
  assert.equal(rejected.status, 422);
  assert.match((await rejected.json() as {error:string}).error, /session/);
  const healthy = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(healthy.status, 200);
  assert.deepEqual(await healthy.json(), {status: 'ok'});
  assert.equal(child.exitCode, null);
});
