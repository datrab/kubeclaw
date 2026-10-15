import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Socket } from 'node:net';
import { once } from 'node:events';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { publishedControlConfig } from './fixtures/published-config.mjs';

async function endpoint(t: test.TestContext, respond: (socket: Socket) => void) {
  const sockets = new Set<Socket>(); let connections = 0;
  const server = createServer(socket => { connections++; sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket)); respond(socket); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); });
  return { url: `postgresql://local:local@127.0.0.1:${address.port}/prism`, connections: () => connections };
}
const secretEnvironment = { PRISM_MIGRATOR_PASSWORD: 'local-migrator', PRISM_RUNTIME_PASSWORD: 'local-runtime', PRISM_READONLY_PASSWORD: 'local-readonly' };

test('authentic central A/B bootstrap snapshots drive actual pg connection retry counts', async t => {
  const wire = await endpoint(t, socket => socket.once('data', () => {
    const body = Buffer.from('SFATAL\0C57P03\0Mdatabase starting\0\0');
    const packet = Buffer.alloc(5 + body.length); packet[0] = 69; packet.writeInt32BE(4 + body.length, 1); body.copy(packet, 5); socket.end(packet);
  }));
  let retained: any;
  for (const maximumAttempts of [2, 3]) {
    const f = await publishedControlConfig(t, { databaseBootstrap: { connectionTimeoutMs: 100, maximumAttempts, retryDelayMs: 20 } });
    const serverRoot = join(f.root, 'role/skills/packages/prism-engine');
    const { prismDatabaseBootstrapConfig } = await import(pathToFileURL(join(serverRoot, 'config/database-bootstrap.ts')).href);
    const { runPrismDatabaseBootstrap } = await import(pathToFileURL(join(serverRoot, 'server/database-bootstrap-runtime.ts')).href);
    const environment = { ...secretEnvironment, ADMIN_DATABASE_URL: wire.url };
    const config = prismDatabaseBootstrapConfig(f.capture, environment);
    assert(Object.isFrozen(config)); assert.equal(config.maximumAttempts, maximumAttempts);
    environment.ADMIN_DATABASE_URL = 'postgresql://changed.invalid/prism';
    assert.equal(config.adminUrl, wire.url);
    const before = wire.connections();
    await assert.rejects(runPrismDatabaseBootstrap(config), (error: any) => error.code === '57P03');
    assert.equal(wire.connections() - before, maximumAttempts);
    if (retained) assert.equal(retained.maximumAttempts, 2); else retained = config;
    assert.throws(() => prismDatabaseBootstrapConfig({ ...f.capture }, environment), /VERIFIED_CAPTURE_REQUIRED/);
    assert.throws(() => prismDatabaseBootstrapConfig(f.capture, {}), /ADMIN_DATABASE_URL is required/);
  }
});

test('central bootstrap connection deadline bounds a real stalled pg startup connection', { timeout: 10000 }, async t => {
  const wire = await endpoint(t, socket => socket.on('data', () => { /* Deliberately no PG response. */ }));
  const f = await publishedControlConfig(t, { databaseBootstrap: { connectionTimeoutMs: 40, maximumAttempts: 1, retryDelayMs: 20 } });
  const root = join(f.root, 'role/skills/packages/prism-engine');
  const { prismDatabaseBootstrapConfig } = await import(pathToFileURL(join(root, 'config/database-bootstrap.ts')).href);
  const { runPrismDatabaseBootstrap } = await import(pathToFileURL(join(root, 'server/database-bootstrap-runtime.ts')).href);
  const config = prismDatabaseBootstrapConfig(f.capture, { ...secretEnvironment, ADMIN_DATABASE_URL: wire.url });
  const start = Date.now(); await assert.rejects(runPrismDatabaseBootstrap(config), /timeout/);
  assert(Date.now() - start < 2000, 'selected 40ms deadline must not fall back to old 5000ms timeout');
  assert.equal(wire.connections(), 1);
});
