import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, type Socket } from 'node:net';
import { once } from 'node:events';
import { captureSwarmSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { WorkerNonceDatabase } from '../../../skills/prism/server/worker-readiness.ts';

const configRoot = new URL('../../../config/', import.meta.url);
const entry = JSON.parse(fs.readFileSync(new URL('pipeline.config.json', configRoot), 'utf8'));
const worker = JSON.parse(fs.readFileSync(new URL('components/prism-worker.config.json', configRoot), 'utf8'));
const selection = { role: 'prism' as const, callerId: 'prism-worker' as const,
  serviceInstanceId: 'kubeclaw/prism/prism-worker',
  bindings: entry.bindings.filter((b: { instanceId: string }) => b.instanceId === 'kubeclaw/prism/prism-worker').map(({ role: _role, ...binding }: any) => binding) };
function fixture(t: { after(fn: () => void): void }, settings: unknown) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-nonce-config-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(configRoot, root, { recursive: true });
  const author = structuredClone(worker);
  author.profiles.standard.settings.nonceDatabase = settings;
  fs.writeFileSync(path.join(root, 'components/prism-worker.config.json'), JSON.stringify(author));
  return path.join(root, 'pipeline.config.json');
}
function capture(file: string) {
  return captureSwarmSettings(file, selection).components['prism-worker']!.settings.nonceDatabase;
}
test('central worker author preserves the previous nonce timeout and capacity', () => {
  const settings = capture(new URL('pipeline.config.json', configRoot).pathname);
  assert.deepEqual(settings, { timeoutMs: 750, maximumConnections: 4, maximumCleanupRows: 1000, idleTimeoutMs:10000, authenticationWindowMs: 300000 });
  assert.ok(Object.isFrozen(settings));
});
test('alternate central values survive the actual config loader without fallback', t => {
  assert.deepEqual(capture(fixture(t, { timeoutMs: 120, maximumConnections: 2, maximumCleanupRows: 1000, idleTimeoutMs:10000, authenticationWindowMs: 300000 })),
    { timeoutMs: 120, maximumConnections: 2, maximumCleanupRows: 1000, idleTimeoutMs:10000, authenticationWindowMs: 300000 });
});
test('missing and invalid nonce settings reject at config load', t => {
  for (const settings of [undefined, {}, { timeoutMs: 0, maximumConnections: 4 },
    { timeoutMs: 750, maximumConnections: 0 }, { timeoutMs: '750', maximumConnections: 4 },
    { timeoutMs: 750, maximumConnections: 1.5 }]) {
    assert.throws(() => capture(fixture(t, settings)), /SWARM_CONFIG_INVALID/);
  }
});
for (const maximumConnections of [1, 2]) test(`central capacity ${maximumConnections} limits actual pool and admission`, async t => {
  const settings = capture(fixture(t, { timeoutMs: 150, maximumConnections, maximumCleanupRows: 1000, idleTimeoutMs:10000, authenticationWindowMs: 300000 })) as { timeoutMs: number; maximumConnections: number; maximumCleanupRows: number; authenticationWindowMs: number; idleTimeoutMs: number };
  const sockets = new Set<Socket>();
  const server = createServer(socket => { sockets.add(socket); socket.on('data', () => {}); socket.on('close', () => sockets.delete(socket)); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const events: { phase: string; code: string }[] = [];
  const database = new WorkerNonceDatabase(`postgresql://fixture:private@127.0.0.1:${address.port}/fixture`, settings, event => events.push(event));
  const pending: Promise<void>[] = [];
  try {
    for (let n = 0; n < maximumConnections; n++) {
      const connection = once(server, 'connection');
      pending.push(assert.rejects(database.check(), /PRISM_NONCE_DATABASE_UNAVAILABLE/));
      await connection;
    }
    assert.equal(sockets.size, maximumConnections);
    await assert.rejects(database.check(), /PRISM_NONCE_DATABASE_UNAVAILABLE/);
    assert.ok(events.some(e => e.phase === 'admission' && e.code === 'ADMISSION_LIMIT'));
    assert.equal(database.pendingConnections, 0);
    await Promise.all(pending);
    assert.ok(events.some(e => e.phase === 'connect' && e.code === 'PG_CONNECT_TIMEOUT'));
  } finally {
    for (const socket of sockets) socket.destroy();
    await Promise.allSettled(pending);
    await database.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

// Observe the SQL boundary: selected batch size must be a parameter, never a hidden literal.
test('selected cleanup batch governs actual nonce deletion query', async t => {
 const { PostgresNonceStore } = await import('../../../skills/prism/server/internal-auth.ts');
 const selected = capture(fixture(t, {timeoutMs:120,maximumConnections:2,maximumCleanupRows:7,idleTimeoutMs:10000, authenticationWindowMs:300000})) as {maximumCleanupRows:number};
 const calls: {sql:string;params?:unknown[]}[]=[];
 const store = new PostgresNonceStore({query:async(sql:string,params?:unknown[])=>{calls.push({sql,params});return {rows:[{}]};}},selected.maximumCleanupRows);
 assert.equal(await store.consume('test','digest',new Date(),new Date()),true);
 assert.match(calls[0]!.sql,/LIMIT \$1/);assert.deepEqual(calls[0]!.params,[7]);assert.equal(calls.length,2);
 for(const value of [undefined,0,-1,1.5,'7',2147483648]) assert.throws(()=>capture(fixture(t,{timeoutMs:120,maximumConnections:2,maximumCleanupRows:value,idleTimeoutMs:10000, authenticationWindowMs:300000})),/SWARM_CONFIG_INVALID/);
});


test('selected authentication window controls expiration and persisted nonce lifetime', async t => {
 const {verifyInternalRequest,signInternalRequest} = await import('../../../skills/prism/server/internal-auth.ts');
 const selected = capture(fixture(t,{timeoutMs:120,maximumConnections:2,maximumCleanupRows:7,idleTimeoutMs:10000, authenticationWindowMs:500})) as {authenticationWindowMs:number};
 const now=1800000000000, nonce='abcdef0123456789abcdef0123456789', body=Buffer.from('{}'), secret='fixture-secret';
 const headers={'x-prism-timestamp':String(now),'x-prism-nonce':nonce,'x-prism-signature':signInternalRequest(secret,body,now,nonce)};
 const expirations: number[]=[];
 const store={consume:async (_a:string,_n:string,_i:Date,e:Date)=>{expirations.push(e.getTime());return true;}};
 await verifyInternalRequest(secret,body,headers,store,selected.authenticationWindowMs,'prism-worker',now+500);
 assert.deepEqual(expirations,[now+500]);
 for(const delta of [-501,501]) await assert.rejects(()=>verifyInternalRequest(secret,body,headers,store,selected.authenticationWindowMs,'prism-worker',now+delta),/expired/);
 assert.equal(expirations.length,1);
 for(const value of [undefined,0,-1,1.5,'500',2147483648]) assert.throws(()=>capture(fixture(t,{timeoutMs:120,maximumConnections:2,maximumCleanupRows:7,idleTimeoutMs:10000, authenticationWindowMs:value})),/SWARM_CONFIG_INVALID/);
});


test('selected idle timeout reaches actual pg pool, including explicit disabled timeout', async t => {
  const { Pool } = await import('pg');
  const observed: number[] = [];
  const connect = t.mock.method(Pool.prototype, 'connect', async function (this: { options: { idleTimeoutMillis: number } }) {
    observed.push(this.options.idleTimeoutMillis);
    throw new Error('fixture connection unavailable');
  });
  try {
    for (const idleTimeoutMs of [0, 250]) {
      const selected = capture(fixture(t, { timeoutMs: 120, maximumConnections: 2, maximumCleanupRows: 7, authenticationWindowMs: 500, idleTimeoutMs })) as import('../../../skills/common/plugin-runtime/foundation/config/swarm.ts').PrismNonceDatabaseSettings;
      const database = new WorkerNonceDatabase('postgresql://fixture@127.0.0.1/fixture', selected, () => {});
      try { await assert.rejects(database.check(), /PRISM_NONCE_DATABASE_UNAVAILABLE/); }
      finally { await database.close(); }
    }
    assert.deepEqual(observed, [0, 250]);
  } finally { connect.mock.restore(); }
  for (const idleTimeoutMs of [undefined, -1, 1.5, '250', 2147483648]) {
    assert.throws(() => capture(fixture(t, { timeoutMs: 120, maximumConnections: 2, maximumCleanupRows: 7, authenticationWindowMs: 500, idleTimeoutMs })), /SWARM_CONFIG_INVALID/);
  }
});
