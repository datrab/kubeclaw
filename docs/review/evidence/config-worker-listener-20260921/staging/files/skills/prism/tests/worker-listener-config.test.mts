import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readTestBundle, writeTestBundle } from '../../../tests/fixtures/config/swarm-bundle.mjs';
import { loadWorkerConfig } from '../server/worker-config.ts';
import { createWorkerServer } from '../server/worker-service.ts';

async function unusedPort(): Promise<number> {
  const reservation = net.createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const address = reservation.address(); assert.ok(address && typeof address !== 'string');
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  return address.port;
}

test('WL actual HTTP Worker consumes two authored listeners; native execution remains modeled', { timeout: 10000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-listener-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = await unusedPort();
  let second = await unusedPort();
  for (let attempt = 0; second === first && attempt < 5; attempt++) second = await unusedPort();
  assert.notEqual(second, first, 'two distinct test ports required');
  for (const port of [first, second]) {
    const bundle = readTestBundle(new URL('../../../charts/kubeclaw/files/config/swarm.config.json', import.meta.url));
    bundle['prism-worker'].settings.ingress.port = port;
    const file = path.join(root, `profile-${port}`, 'swarm.config.json');
    writeTestBundle(file, bundle);
    const environment = { SWARM_CONFIG: file, WORKER_TRUST_SPIFFE_ENABLED: 'true', PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://listener/control' };
    const config = loadWorkerConfig(environment);
    assert.equal(config.port, port); assert.ok(Object.isFrozen(config));
    for (const PORT of ['', '8080', String(port)]) {
      assert.throws(() => loadWorkerConfig({ ...environment, PORT }), /SWARM_CONFIG_LEGACY_OVERRIDE:PORT/u);
    }
    let executed = 0;
    const server = createWorkerServer({ mode: 'spiffe', trustedControlSpiffeId: config.trustedControlSpiffeId },
      { ready: () => true, execute: async () => { executed++; throw new Error('unexpected native execution'); } }, config.ingress);
    try {
      server.listen(config.port, '127.0.0.1'); await once(server, 'listening');
      const address = server.address(); assert.ok(address && typeof address !== 'string'); assert.equal(address.port, port);
      fs.writeFileSync(file, '{}');
      for (const route of ['/bootstrap', '/health', '/ready']) {
        const response = await fetch(`http://127.0.0.1:${port}${route}`);
        assert.equal(response.status, 200); await response.arrayBuffer();
      }
      assert.equal(executed, 0);
    } finally { await server.shutdown(config.shutdownTimeoutMs); }
  }
});
