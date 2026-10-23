import {publishedControlConfig} from './fixtures/published-config.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, verify} from 'node:crypto';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Server} from 'node:http';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {migrate} from '../storage/index.ts';
import {storedProductDecision} from '../storage/product-decisions.ts';
import {createConfiguredControlServer} from '../server/control-server.ts';
import {PRODUCT_DOMAIN} from '../control/product-decisions.ts';

import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const operator = 'operator@example.test';
const origin = 'https://studio.example.test';
const shared = { PRISM_SESSION_SECRET: 'session-composition-test', PRISM_INGRESS_SECRET: 'ingress-composition-test',
  PRISM_INGESTION_SECRET: 'ingestion-test', PRISM_DISPATCH_SECRET: 'dispatch-test', PRISM_WORKER_SECRET: 'worker-test'};
async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
  const address = server.address(); assert(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server) {
  await new Promise<void>((resolve, reject) => {server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();});
}
export async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'prism-product-composition-'));
  const keys = generateKeyPairSync('ed25519');
  const keyFile = join(root, 'authority.pem');
  await writeFile(keyFile, keys.privateKey.export({format: 'pem', type: 'pkcs8'}), {mode: 0o600});
  const disposals: Array<() => void> = [];
  const fixture = await publishedControlConfig({after: callback => {disposals.push(callback as () => void);}}, {artifactRoot: join(root, 'artifacts'), productDecisionsEnabled: true});
  const compose = async (pool: import('../storage/index.ts').Database, env: NodeJS.ProcessEnv) => createConfiguredControlServer(pool, await fixture.loadControlCompositionConfig(fixture.capture, env));
  const environment = {...shared,
    PRISM_PRODUCT_ORIGIN: origin, PRISM_PRODUCT_CONTROLLER_URL: 'https://127.0.0.1:1',
    PRISM_PRODUCT_OPERATORS: JSON.stringify([operator]), PRISM_PRODUCT_PRIVATE_KEY_FILE: keyFile,
    PRISM_PRODUCT_ISSUER: 'composition-authority', PRISM_PRODUCT_CONTROLLER_CA_FILE: join(root, 'missing-ca'),
    PRISM_PRODUCT_CONTROLLER_TOKEN_FILE: join(root, 'missing-token')};
  let db = new PGlite(join(root, 'db'), {extensions: {vector}}); await migrate(db);
  let server = await compose(db, environment); let url = await listen(server);
  async function request(path: string, body?: unknown, headers: Record<string, string> = {}) {
    const result = await fetch(new URL(path, url), {method: body === undefined ? 'GET' : 'POST',
      headers: {'content-type': 'application/json', ...headers}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    return {status: result.status, value: await result.json(), headers: result.headers};
  }
  async function session(user = operator, requestedOrigin = origin) {
    return request('/v1/session', {}, {origin: requestedOrigin, 'x-prism-ingress-secret': shared.PRISM_INGRESS_SECRET, 'tailscale-user-login': user});
  }
  return {root, environment, keys, request, session, fixture, compose: (env: NodeJS.ProcessEnv) => compose(db, env), db: () => db,
    restart: async () => {await close(server); await db.close(); db = new PGlite(join(root, 'db'), {extensions: {vector}}); await db.waitReady; server = await compose(db, environment); url = await listen(server);},
    close: async () => {await close(server); await db.close(); await rm(root, {recursive: true, force: true}); for (const dispose of disposals) dispose();}};
}
export function sessionHeaders(session: {headers: Headers; value: {csrf: string}}) {
  return {origin, cookie: session.headers.getSetCookie().map(value => value.split(';')[0]).join('; '), 'x-prism-csrf': session.value.csrf};
}
const intent = {decisionId: '00000000-0000-4000-8000-000000000049', action: 'accept', reason: 'Original composition check',
  subject: {leaseName: 'demo-composition', leaseUID: 'lease-uid', sourceRevision: 'abc', candidateDigest: `sha256:${'a'.repeat(64)}`,
    resultDigest: `sha256:${'b'.repeat(64)}`, readyDigest: `sha256:${'c'.repeat(64)}`, generation: 1,
    expectedExpiry: '2026-09-10T01:00:00Z', expectedRevision: '49', url: 'https://demo.example.test', runId: 'composition-test'}};

test('original composed Control preserves disabled routes and rejects incomplete enabled startup before listen', async t => {
  const f = await publishedControlConfig(t);
  const createControlServer = async (db: import('../storage/index.ts').Database, env: NodeJS.ProcessEnv) => createConfiguredControlServer(db, await f.loadControlCompositionConfig(f.capture, env));
  const db = new PGlite();
  const server = await createControlServer(db, shared); const url = await listen(server);
  try {
    assert.equal((await fetch(`${url}/health`)).status, 200);
    assert.equal((await fetch(`${url}/v1/product-decisions`)).status, 404);
    const enabled = await publishedControlConfig(t, {productDecisionsEnabled: true});
    await assert.rejects(enabled.loadControlCompositionConfig(enabled.capture, shared), /PRISM_PRODUCT_ORIGIN is required/);
    await assert.rejects(f.loadControlCompositionConfig(f.capture, {...shared, PRISM_PRODUCT_DECISIONS_ENABLED: 'false'}), /SWARM_CONFIG_LEGACY_OVERRIDE:PRISM_PRODUCT_DECISIONS_ENABLED/);
  } finally {await close(server); await db.close();}
});

test('actual production listener rejects missing authenticated configuration before listening', async () => {
  await assert.rejects(promisify(execFile)(process.execPath, [fileURLToPath(new URL('../server/control.ts', import.meta.url))],
    {env: {...process.env, ...shared, PRISM_PRODUCT_DECISIONS_ENABLED: 'true', PRISM_PRODUCT_ORIGIN: ''}, timeout: 10_000}),
    (error: unknown) => {
      const failure = error as {code: number; stderr: string; killed: boolean};
      assert.equal(failure.code, 1); assert.notEqual(failure.killed, true);
      assert.match(failure.stderr, /ENOENT|PIPELINE_/); return true;
    });
});

test('asynchronous authority key loading retains a single owned Control startup snapshot', async () => {
  const context = await setup();
  try {
    const environment = {...context.environment};
    const loading = context.fixture.loadControlCompositionConfig(context.fixture.capture, environment);
    environment.PRISM_PRODUCT_ISSUER = 'changed-after-load';
    environment.PRISM_SESSION_SECRET = 'changed-after-load';
    const configuration = await loading;
    assert.equal(configuration.product?.issuer, context.environment.PRISM_PRODUCT_ISSUER);
    assert.equal(configuration.service.sessionSecret, shared.PRISM_SESSION_SECRET);
    await assert.rejects(context.compose({...context.environment, PRISM_PRODUCT_PRIVATE_KEY_FILE: join(context.root, 'absent-key')}), /ENOENT/);
  } finally {await context.close();}
});

test('actual Control session and product wrapper persist original signed intent across service and SQL reopen without claiming controller success', async () => {
  const context = await setup();
  try {
    assert.equal((await context.request('/health')).status, 200);
    assert.equal((await context.session(operator, 'https://attacker.test')).status, 403);
    const session = await context.session(); assert.equal(session.status, 201);
    const headers = sessionHeaders(session);
    const outsider = await context.session('outsider@example.test'); assert.equal(outsider.status, 201);
    assert.equal((await context.request('/v1/product-decisions', intent, sessionHeaders(outsider))).status, 403);
    assert.equal((await context.request('/v1/product-decisions', intent, {...headers, 'x-prism-csrf': 'wrong'})).status, 403);
    assert.equal((await context.request('/v1/product-decisions', intent, {...headers, origin: 'https://attacker.test'})).status, 403);
    assert.equal(await storedProductDecision(context.db(), intent.decisionId), undefined);
    const pending = await context.request('/v1/product-decisions', intent, headers);
    assert.equal(pending.status, 202); assert.equal(pending.value.state, 'pending');
    const stored = await storedProductDecision(context.db(), intent.decisionId); assert(stored); assert.equal(stored.receipt, null);
    const bytes = Buffer.from(stored.envelope.payload, 'base64');
    assert.equal(verify(null, Buffer.concat([Buffer.from(PRODUCT_DOMAIN), bytes]), context.keys.publicKey, Buffer.from(stored.envelope.signature, 'base64')), true);
    assert.equal(JSON.parse(bytes.toString('utf8')).actorId, operator);
    await context.restart();
    assert.equal((await context.request(`/v1/product-decisions/${intent.decisionId}/recover`, {}, headers)).status, 202);
    assert.deepEqual((await storedProductDecision(context.db(), intent.decisionId))?.envelope, stored.envelope);
    assert.equal((await context.request('/v1/product-decisions', {...intent, reason: 'changed'}, headers)).status, 403);
    const history = await context.request('/v1/product-decisions', undefined, headers); assert.equal(history.value.decisions.length, 1);
    assert.equal((await context.request('/v1/product-decisions', undefined, sessionHeaders(outsider))).status, 403);
    assert.equal((await storedProductDecision(context.db(), intent.decisionId))?.receipt, null);
  } finally {await context.close();}
});

test('central product switch is required and boolean on every selected and unselected profile', async t => {
  for (const profile of ['standard','spiffe']) for (const invalid of [undefined,null,'true',0]) {
    await assert.rejects(publishedControlConfig(t,{},undefined,undefined,async author => {
      const fs=await import('node:fs'); const file=join(author,'components/prism-control.config.json');
      const owner=JSON.parse(fs.readFileSync(file,'utf8'));owner.profiles[profile].settings.productDecisionsEnabled=invalid;
      fs.writeFileSync(file,JSON.stringify(owner));
    }),/SWARM_CONFIG_INVALID/);
  }
});

test('historical component-v4 startup keeps its original ENV switch without v5 refill', async t => {
  const legacy=await publishedControlConfig(t,{},undefined,undefined,async author => {
    const fs=await import('node:fs'); const file=join(author,'components/prism-control.config.json');
    const owner=JSON.parse(fs.readFileSync(file,'utf8'));owner.schemaVersion='pipeline-component.v4';
    for (const profile of Object.values(owner.profiles) as any[]) delete profile.settings.productDecisionsEnabled;
    fs.writeFileSync(file,JSON.stringify(owner));
  });
  const disabled=await legacy.loadControlCompositionConfig(legacy.capture,{...shared,PRISM_PRODUCT_DECISIONS_ENABLED:'false',PRISM_PRODUCT_PRIVATE_KEY_FILE:'/not-present'});
  assert.equal(disabled.product,undefined);
  assert.equal('productDecisionsEnabled' in disabled.service,false);
  await assert.rejects(legacy.loadControlCompositionConfig(legacy.capture,{...shared,PRISM_PRODUCT_DECISIONS_ENABLED:'true'}),/PRISM_PRODUCT_ORIGIN is required/);
});
