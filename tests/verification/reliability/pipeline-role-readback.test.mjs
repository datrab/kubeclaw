import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { createServer, createConnection } from 'node:net';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { declaredPipelineServices, materializePipelineGeneration } from '../../../scripts/updates/pipeline-generation.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const owners = ['prism-control', 'prism-studio', 'prism-worker', 'prism-execution', 'buster-engine', 'worker-core'];
const consumed = { 'prism-studio': ['prism-studio'], 'prism-control': ['prism-control', 'prism-execution', 'worker-core'],
  'prism-worker': ['prism-worker', 'prism-control', 'prism-execution', 'worker-core'], 'prism-ingestion': ['prism-control'] };
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }

test('real Prism role package readback drives all service caller compositions', async t => {
  assert.equal(process.getuid?.(), 0, 'real root-owned image-tree controls; never spoof identity');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-role-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const code = path.join(root, 'role'), output = path.join(root, 'generation'), author = path.join(root, 'author');
  const publisher = path.join(root, 'publish');
  execFileSync('cc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-O2', path.join(repo, 'scripts/pipeline-publish.c'), '-o', publisher]);
  execFileSync(process.execPath, [path.join(repo, 'scripts/build-runtime-role-bundle.mjs'), 'prism', code,
    'a'.repeat(40), 'config-c1-test-fixture', '2026-10-14T00:00:00Z'], { cwd: repo, stdio: 'pipe' });
  const services = Object.entries(consumed).map(([callerId, selected]) => ({ callerId, role: 'prism',
    serviceInstanceId: `test.namespace/test.release/${callerId}`,
    bindings: selected.map(owner => ({ owner, instanceId: `test.namespace/test.release/${callerId}`, profileId: 'standard' })) }));
  const legacy = path.join(repo, 'charts/kubeclaw/files/config');
  const entry = JSON.parse(fs.readFileSync(path.join(legacy, 'swarm.config.json')));
  entry.schemaVersion = 'pipeline-entry.v3';
  entry.components = Object.fromEntries(owners.map(owner => [owner, `components/${owner}.config.json`]));
  entry.bindings = services.flatMap(service => service.bindings.map(binding => ({ role: service.role, ...binding })));
  write(path.join(author, 'pipeline.config.json'), entry);
  for (const owner of owners) write(path.join(author, `components/${owner}.config.json`),
    JSON.parse(fs.readFileSync(path.join(repo, 'config/components', `${owner}.config.json`))));
  const declared = declaredPipelineServices(author, { role: 'prism', namespace: 'test.namespace', releaseName: 'test.release' });
  assert.deepEqual(declared.map(service => service.callerId).sort(), services.map(service => service.callerId).sort());
  assert.throws(() => declaredPipelineServices(author, { role: 'prism', namespace: 'other.namespace', releaseName: 'test.release' }), /DECLARED_RELEASE_BINDING_REQUIRED/);
  const originalManifest = path.join(code, 'manifest.json'), outsideManifest = path.join(root, 'outside-manifest.json');
  fs.renameSync(originalManifest, outsideManifest); fs.symlinkSync(outsideManifest, originalManifest);
  await assert.rejects(materializePipelineGeneration({ authorRoot: author, packageRoot: code, output, services, publisher }), /ELOOP/);
  fs.unlinkSync(originalManifest); fs.renameSync(outsideManifest, originalManifest);
  const result = await materializePipelineGeneration({ authorRoot: author, packageRoot: code, output, services, publisher });
  assert.equal(result.callers.length, 4);
  await assert.rejects(materializePipelineGeneration({ authorRoot: author, packageRoot: code, output, services, publisher }), /GENERATION_EXISTS/);
  const foundation = path.join(code, 'skills/packages/plugin-foundation/config');
  const boot = await import(pathToFileURL(path.join(foundation, 'pipeline-boot.mjs')).href);
  const engine = path.join(code, 'skills/packages/prism-engine/server');
  const configs = Object.fromEntries(await Promise.all(['studio', 'control', 'worker'].map(async name => [name,
    await import(pathToFileURL(path.join(engine, `${name}-config.ts`)).href)])));
  const credentials = { DATABASE_URL: 'postgresql://fixture.invalid/prism', PRISM_SESSION_SECRET: 'fixture-session', PRISM_INGRESS_SECRET: 'fixture-ingress',
    PRISM_INGESTION_SECRET: 'fixture-ingestion', PRISM_DISPATCH_SECRET: 'fixture-dispatch', PRISM_WORKER_SECRET: 'fixture-worker' };
  const captures = {}, mounts = {};
  for (const service of services) {
    const mount = path.join(root, `transport-${service.callerId}`); fs.mkdirSync(mount);
    fs.cpSync(path.join(output, 'expected', service.callerId), path.join(mount, 'version-A'), { recursive: true });
    fs.symlinkSync('version-A', path.join(mount, '..data'));
    mounts[service.callerId] = mount;
    captures[service.callerId] = boot.capturePipelineBootReceipts(mount, path.join(output, 'system'), service.callerId, code, '/app/prism/skills');
  }
  assert.equal(configs.studio.loadStudioConfig(captures['prism-studio'], {}).port, 8080);
  assert.equal(configs.control.loadControlServerConfig(captures['prism-control'], credentials).port, 8080);
  assert.equal(configs.control.loadControlServerConfig(captures['prism-control'], credentials).maximumJsonBodyBytes, 2000000);
  assert.equal(configs.control.loadControlServerConfig(captures['prism-control'], credentials).maximumArtifactUploadBodyBytes, 8500000);
  assert.equal(configs.worker.loadWorkerConfig(captures['prism-worker'], credentials).port, 8080);
  assert.deepEqual(configs.worker.loadWorkerConfig(captures['prism-worker'], credentials).nonceDatabase,
    { timeoutMs: 750, maximumConnections: 4, maximumCleanupRows: 1000, idleTimeoutMs:10000, authenticationWindowMs: 300000 });
  assert.throws(() => configs.studio.loadStudioConfig(captures['prism-control'], {}), /VERIFIED_CAPTURE_REQUIRED/);
  assert.throws(() => configs.worker.loadWorkerConfig({ ...captures['prism-worker'] }, credentials), /VERIFIED_CAPTURE_REQUIRED/);
  // Publish a real local upstream as an authored endpoint; no loader or fetch stub.
  const { createServer: createHttpServer } = await import('node:http');
  let upstreamCalls = 0;
  const upstream = createHttpServer(async (request, response) => {
    upstreamCalls++;
    for await (const _chunk of request) { /* consume the forwarded request */ }
    if (request.url === '/v1/stall') return;
    assert.equal(request.headers['x-prism-ingress-secret'], credentials.PRISM_INGRESS_SECRET);
    response.writeHead(204); response.end();
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  t.after(async () => { upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); });
  const studioEndpoint = `http://127.0.0.1:${upstream.address().port}`;
  const studioAuthor = path.join(author, 'components/prism-studio.config.json');
  const changed = JSON.parse(fs.readFileSync(studioAuthor)); changed.profiles.standard.settings.port = 18089; changed.profiles.standard.settings.maximumRequestBodyBytes = 4321;
  changed.profiles.standard.settings.controlUrl = studioEndpoint;
  changed.profiles.standard.settings.controlTimeoutMs = 250;
  write(studioAuthor, changed);
  const workerAuthor = path.join(author, 'components/prism-worker.config.json');
  const changedWorker = JSON.parse(fs.readFileSync(workerAuthor));
  changedWorker.profiles.standard.settings.nonceDatabase = { timeoutMs: 180, maximumConnections: 2, maximumCleanupRows: 7, idleTimeoutMs:0, authenticationWindowMs: 900 };
  changedWorker.profiles.standard.settings.ingress = { port: 18090, maximumActiveRequests: 1, maximumProbeRequests: 1, maximumConnections: 7, requestTimeoutMs: 2345, shutdownTimeoutMs: 130000, maximumInputBytes: 4321 };
  write(workerAuthor, changedWorker);
  const controlAuthor = path.join(author, 'components/prism-control.config.json');
  const changedControl = JSON.parse(fs.readFileSync(controlAuthor));
  changedControl.profiles.standard.settings.maximumDispatchBodyBytes = 3456;
  changedControl.profiles.standard.settings.maximumInternalEvidenceBytes = 321;
  changedControl.profiles.standard.settings.maximumProductControllerTokenCharacters = 17;
  changedControl.profiles.standard.settings.productDecisionHistoryLimit = 3;
  changedControl.profiles.standard.settings.maximumProductInputBytes = 1234;
  changedControl.profiles.standard.settings.productControllerTimeoutMs = 123;
  changedControl.profiles.standard.settings.maximumProductControllerResponseBytes = 456;
  changedControl.profiles.standard.settings.sessionLifetimeSeconds = 7;
  changedControl.profiles.standard.settings.productDecisionLifetimeMs = 120000;
  changedControl.profiles.standard.settings.nativeAttemptLifetimeMs = 123000;
  changedControl.profiles.standard.settings.nativeAttemptTimeoutMs = 45000;
  changedControl.profiles.standard.settings.nativeAttemptCleanupTimeoutMs = 750;
  changedControl.profiles.standard.settings.nativeAttemptLogBytes = 2048;
  changedControl.profiles.standard.settings.nativeAttemptResultBytes = 4096;
  changedControl.profiles.standard.settings.nativeAttemptEvidenceBytes = 8192;
  changedControl.profiles.standard.settings.nativeAttemptEvidenceFiles = 3;
  changedControl.profiles.standard.settings.controlInternalUrl = 'https://control.example.test:9443/internal';
  changedControl.profiles.standard.settings.workerUrl = 'https://worker.example.test:9443/dispatch';
  changedControl.profiles.standard.settings.ingestionUrl = 'https://ingestion.example.test:9443/source';
  changedControl.profiles.standard.settings.maximumRenderAssetBytes = 2345;
  changedControl.profiles.standard.settings.maximumArtifactBytes = 1234;
  changedControl.profiles.standard.settings.maximumJsonBodyBytes = 4096;
  changedControl.profiles.standard.settings.maximumArtifactUploadBodyBytes = 16384;
  changedControl.profiles.standard.settings.ingestionAcquireTimeoutMs = 3000;
  changedControl.profiles.standard.settings.corpusRanking = {schemaVersion:'corpus-ranking.v1', candidateFloor:17, candidateMultiplier:3, rrfDamping:7};
  changedControl.profiles.standard.settings.corpusSearchDefaultLimit = 3;
  changedControl.profiles.standard.settings.corpusSearchMaximumLimit = 7;
  changedControl.profiles.standard.settings.corpusSourceFamilyDefaultLimit = 1;
  changedControl.profiles.standard.settings.corpusSourceFamilyMaximumLimit = 4;

  changedControl.profiles.standard.settings.ingestionCleanupTimeoutMs = 1000;
  write(controlAuthor, changedControl);
  const executionAuthor = path.join(author,'components/prism-execution.config.json');
  const changedExecution = JSON.parse(fs.readFileSync(executionAuthor));
  Object.assign(changedExecution.profiles.standard.settings.enginePolicy.render,
    {widths:{compact:320,regular:640,wide:1200},height:900,locale:'de-DE',timezoneId:'Europe/Berlin'});
  write(executionAuthor,changedExecution);
  const coreAuthor = path.join(author,'components/worker-core.config.json');
  const changedCore = JSON.parse(fs.readFileSync(coreAuthor));
  changedCore.profiles.standard.settings.runtime.input_bytes=12582912;
  changedCore.profiles.standard.settings.runtime.retain_logs['prism-native']=false;
  changedCore.profiles.standard.settings.runtime.retain_logs['prism-agent']=false;
  write(coreAuthor,changedCore);
  const generationB = path.join(root, 'generation-B');
  await materializePipelineGeneration({ authorRoot: author, packageRoot: code, output: generationB, services, publisher });
  const studioMount = mounts['prism-studio'];
  fs.cpSync(path.join(generationB, 'expected/prism-studio'), path.join(studioMount, 'version-B'), { recursive: true });
  fs.unlinkSync(path.join(studioMount, '..data')); fs.symlinkSync('version-B', path.join(studioMount, '..data'));
  assert.throws(() => boot.capturePipelineBootReceipts(studioMount, path.join(output, 'system'), 'prism-studio', code,
    '/app/prism/skills'), /IMAGE_RECEIPT_MISMATCH/);
  assert.equal(configs.studio.loadStudioConfig(captures['prism-studio'], {}).port, 8080, 'captured A stays A');
  const newCapture = boot.capturePipelineBootReceipts(studioMount, path.join(generationB, 'system'), 'prism-studio', code, '/app/prism/skills');
  assert.equal(configs.studio.loadStudioConfig(newCapture, {}).port, 18089);
  assert.equal(configs.studio.loadStudioConfig(newCapture, {}).maximumRequestBodyBytes, 4321);
  assert.equal(configs.studio.loadStudioConfig(captures['prism-studio'], {}).maximumRequestBodyBytes, 2000000);
  const studioA = configs.studio.loadStudioConfig(captures['prism-studio'], credentials);
  const studioB = configs.studio.loadStudioConfig(newCapture, credentials);
  assert.equal(studioA.control.href, 'http://prism-control:8080/');
  assert.equal(studioA.controlTimeoutMs, 30000);
  assert.equal(studioB.control.href, studioEndpoint + '/');
  assert.equal(studioB.controlTimeoutMs, 250);
  const { handleStudioRequest } = await import(pathToFileURL(path.join(engine, 'studio-request.ts')).href);
  const { Readable } = await import('node:stream');
  const { EventEmitter } = await import('node:events');
  const forwardStudio = async (body, url) => {
    const chunks = typeof body === 'number' ? [Buffer.alloc(body, 'x')] : body;
    const request = Object.assign(Readable.from(chunks), { method: 'POST', url, headers: {} });
    const response = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false,
      setHeader() {}, end() { this.writableEnded = true; } });
    await handleStudioRequest(request, response, studioB);
    return response;
  };
  assert.equal((await forwardStudio(4321, '/v1/within-limit')).statusCode, 204);
  assert.equal(upstreamCalls, 1);
  await assert.rejects(forwardStudio(4322, '/v1/excess'), /PRISM_STUDIO_REQUEST_TOO_LARGE/);
  assert.equal(upstreamCalls, 1, 'B rejects excess bytes before any upstream effect');
  // The delivered byte budget must be cumulative across chunks and count UTF-8 bytes,
  // not characters or the largest individual chunk. A rejected request must not poison reuse.
  const unicodeExact = Buffer.from('é'.repeat(2160) + 'x');
  assert.equal(unicodeExact.length, studioB.maximumRequestBodyBytes);
  assert.equal((await forwardStudio([unicodeExact.subarray(0, 2000), unicodeExact.subarray(2000)], '/v1/unicode-exact')).statusCode, 204);
  assert.equal(upstreamCalls, 2);
  const unicodeExcess = Buffer.from('é'.repeat(2161));
  assert.ok(unicodeExcess.toString().length < studioB.maximumRequestBodyBytes);
  await assert.rejects(forwardStudio([unicodeExcess.subarray(0, 2000), unicodeExcess.subarray(2000)], '/v1/unicode-excess'), /PRISM_STUDIO_REQUEST_TOO_LARGE/);
  assert.equal(upstreamCalls, 2, 'cumulative UTF-8 overflow has no upstream effect');
  assert.equal((await forwardStudio(1, '/v1/after-overflow')).statusCode, 204);
  assert.equal(upstreamCalls, 3, 'valid request still forwards after overflow');
  await assert.rejects(forwardStudio(0, '/v1/stall'), /PRISM_STUDIO_CONTROL_TIMEOUT/);
  assert.equal(upstreamCalls, 4, 'delivered endpoint reached before selected deadline cancels it');
  // Installation assets/secrets stay outside the selected operator author and
  // are captured by value; changing an environment object cannot rewrite B.
  const studioInstallation = { STUDIO_ROOT: path.join(root, 'installed-studio'), PRISM_INGRESS_SECRET: 'installed-studio-secret' };
  const installedStudio = configs.studio.loadStudioConfig(newCapture, studioInstallation);
  assert.equal(installedStudio.root, studioInstallation.STUDIO_ROOT);
  assert.equal(installedStudio.ingressSecret, studioInstallation.PRISM_INGRESS_SECRET);
  assert.equal(installedStudio.port, studioB.port);
  assert.equal(installedStudio.controlTimeoutMs, studioB.controlTimeoutMs);
  assert.equal(installedStudio.maximumRequestBodyBytes, studioB.maximumRequestBodyBytes);
  assert.ok(Object.isFrozen(installedStudio));
  studioInstallation.STUDIO_ROOT = path.join(root, 'replacement-studio');
  studioInstallation.PRISM_INGRESS_SECRET = 'replacement-studio-secret';
  assert.notEqual(installedStudio.root, studioInstallation.STUDIO_ROOT);
  assert.notEqual(installedStudio.ingressSecret, studioInstallation.PRISM_INGRESS_SECRET);
  assert.equal(configs.studio.loadStudioConfig(newCapture, studioInstallation).root, studioInstallation.STUDIO_ROOT);
  const unconfiguredStudio = configs.studio.loadStudioConfig(newCapture, {});
  assert.equal(unconfiguredStudio.ingressSecret, '');
  const unconfiguredRequest = Object.assign(Readable.from([Buffer.from('x')]), { method: 'POST', url: '/v1/no-secret', headers: {} });
  await assert.rejects(handleStudioRequest(unconfiguredRequest, {}, unconfiguredStudio), /PRISM_STUDIO_PROXY_NOT_CONFIGURED/);
  assert.equal(upstreamCalls, 4, 'missing installation secret must not contact the selected upstream');
  // Equal-valued and empty retired inputs must not become parallel authors.
  for (const [key, equalValue] of Object.entries({ PORT: String(studioB.port), PRISM_CONTROL_URL: studioEndpoint, PRISM_CONTROL_TIMEOUT_MS: String(studioB.controlTimeoutMs) })) {
    for (const value of ['', equalValue, 'retired-other']) {
      assert.throws(() => configs.studio.loadStudioConfig(newCapture, { ...credentials, [key]: value }), /SWARM_CONFIG_LEGACY_OVERRIDE/);
    }
  }
  const workerMount = mounts['prism-worker'];
  fs.cpSync(path.join(generationB, 'expected/prism-worker'), path.join(workerMount, 'version-B'), { recursive: true });
  fs.unlinkSync(path.join(workerMount, '..data')); fs.symlinkSync('version-B', path.join(workerMount, '..data'));
  const workerB = boot.capturePipelineBootReceipts(workerMount, path.join(generationB, 'system'), 'prism-worker', code, '/app/prism/skills');
  assert.deepEqual(configs.worker.loadWorkerConfig(workerB, credentials).nonceDatabase, { timeoutMs: 180, maximumConnections: 2, maximumCleanupRows: 7, idleTimeoutMs:0, authenticationWindowMs: 900 });
  assert.deepEqual(configs.worker.loadWorkerConfig(captures['prism-worker'], credentials).nonceDatabase, { timeoutMs: 750, maximumConnections: 4, maximumCleanupRows: 1000, idleTimeoutMs:10000, authenticationWindowMs: 300000 });
  const workerConfigB = configs.worker.loadWorkerConfig(workerB, credentials);
  const deliveredEngine = await import(pathToFileURL(path.join(code,'skills/packages/prism-engine/engine/index.ts')).href);
  const designDocument = JSON.parse(fs.readFileSync(path.join(repo,'contracts/prism/v1/fixtures/minimal-web.json')));
  for (const [capture,locale,width,height] of [[captures['prism-worker'],'en-US',1440,1000],[workerB,'de-DE',1200,900]]) {
    const policy=configs.worker.loadWorkerConfig(capture,credentials).native.enginePolicy;
    assert.equal(policy.schemaVersion,'prism-engine-policy.v2');assert.ok(Object.isFrozen(policy.render.widths));
    const instance=new deliveredEngine.PrismEngine(new deliveredEngine.DeterministicDesignProvider(),policy);
    const result=await instance.execute({contract:'kubeclaw.prism-design-engine@1',operation:'render',input:{document:designDocument,view:'home',state:'default',viewport:'wide'},idempotencyKey:'delivered-render'});
    assert.equal(result.output.renderer.locale,locale);assert.deepEqual(result.output.renderer.viewport,{width,height});
  }

  const workerConfigA = configs.worker.loadWorkerConfig(captures['prism-worker'], credentials);
  assert.equal(workerConfigA.workerCore.settings.runtime.input_bytes,16777216);
  assert.equal(workerConfigB.workerCore.settings.runtime.input_bytes,12582912);
  assert.equal(workerConfigA.workerCore.settings.runtime.retain_logs['prism-native'],true);
  assert.equal(workerConfigB.workerCore.settings.runtime.retain_logs['prism-native'],false);
  assert.equal(workerConfigB.port, 18090);
  assert.equal(workerConfigB.shutdownTimeoutMs, 130000);
  assert.equal(workerConfigA.port, 8080);
  assert.equal(workerConfigA.shutdownTimeoutMs, 120000);
  assert.deepEqual(workerConfigB.ingress, { maximumActiveRequests: 1, maximumProbeRequests: 1,
    maximumConnections: 7, maximumInputBytes: 4321, requestTimeoutMs: 2345 });
  assert.deepEqual(workerConfigA.ingress, { maximumActiveRequests: 16, maximumProbeRequests: 4,
    maximumConnections: 128, maximumInputBytes: 16777216, requestTimeoutMs: 120000 });
  // Real delivered worker credentials/trust are installation inputs, never
  // alternative authors for the selected endpoint or ingress budgets.
  const workerInstallation = { ...credentials };
  const installedWorker = configs.worker.loadWorkerConfig(workerB, workerInstallation);
  assert.ok(Object.isFrozen(installedWorker));
  workerInstallation.PRISM_WORKER_SECRET = 'replacement-worker-secret';
  workerInstallation.DATABASE_URL = 'postgresql://replacement.invalid/prism';
  assert.equal(installedWorker.workerSecret, credentials.PRISM_WORKER_SECRET);
  assert.equal(installedWorker.databaseUrl, credentials.DATABASE_URL);
  const replacementWorker = configs.worker.loadWorkerConfig(workerB, workerInstallation);
  assert.equal(replacementWorker.workerSecret, workerInstallation.PRISM_WORKER_SECRET);
  assert.equal(replacementWorker.databaseUrl, workerInstallation.DATABASE_URL);
  assert.deepEqual(replacementWorker.ingress, workerConfigB.ingress);
  assert.equal(replacementWorker.controlInternalUrl.href, workerConfigB.controlInternalUrl.href);
  assert.equal(workerConfigA.controlInternalUrl.href, 'http://prism-control:8080/');
  assert.equal(workerConfigB.controlInternalUrl.href, 'https://control.example.test:9443/internal');
  assert.throws(() => configs.worker.loadWorkerConfig(workerB, {}), /PRISM_WORKER_SECRET is required/);
  assert.throws(() => configs.worker.loadWorkerConfig(workerB, { PRISM_WORKER_SECRET: 'local' }), /DATABASE_URL is required/);
  assert.throws(() => configs.worker.loadWorkerConfig(workerB, { WORKER_TRUST_SPIFFE_ENABLED: 'true' }), /SPIFFE trust policy is incomplete/);
  const spiffeWorker = configs.worker.loadWorkerConfig(workerB, {
    WORKER_TRUST_SPIFFE_ENABLED: 'true', PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://fixture/control'
  });
  assert.equal(spiffeWorker.spiffeEnabled, true);
  assert.equal(spiffeWorker.trustedControlSpiffeId, 'spiffe://fixture/control');
  assert.equal(spiffeWorker.workerSecret, '');
  assert.equal(spiffeWorker.databaseUrl, '');
  assert.deepEqual(spiffeWorker.ingress, workerConfigB.ingress);
  for (const [key, equalValue] of Object.entries({ PORT: String(workerConfigB.port), PRISM_CONTROL_INTERNAL_URL: workerConfigB.controlInternalUrl.href })) {
    for (const value of ['', equalValue, 'retired-other']) {
      assert.throws(() => configs.worker.loadWorkerConfig(workerB, { ...credentials, [key]: value }), /SWARM_CONFIG_LEGACY_OVERRIDE/);
    }
  }
  // The delivered A/B window reaches the original verifier and shared SQL nonce
  // store. Check both skew directions, reject before storage, and preserve replay.
  const { verifyInternalRequest, signInternalRequest, PostgresNonceStore } =
    await import(pathToFileURL(path.join(engine, 'internal-auth.ts')).href);
  const { PGlite } = await import('@electric-sql/pglite');
  const nonceDb = new PGlite();
  try {
    await nonceDb.exec(`CREATE SCHEMA prism; CREATE TABLE prism.worker_request_nonce (
      audience text NOT NULL, nonce_digest text NOT NULL, issued_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL, PRIMARY KEY (audience, nonce_digest));`);
    const body = Buffer.from('delivered-signature-body'), now = Date.now() + 60000;
    let ordinal = 0;
    const signed = delta => {
      const timestamp = now + delta, nonce = (++ordinal).toString(16).padStart(32, '0');
      return { 'x-prism-timestamp': String(timestamp), 'x-prism-nonce': nonce,
        'x-prism-signature': `v1=${signInternalRequest(credentials.PRISM_WORKER_SECRET, body, timestamp, nonce)}` };
    };
    const storeB = new PostgresNonceStore(nonceDb, workerConfigB.nonceDatabase.maximumCleanupRows);
    const verify = (headers, config = workerConfigB, store = storeB) => verifyInternalRequest(
      credentials.PRISM_WORKER_SECRET, body, headers, store,
      config.nonceDatabase.authenticationWindowMs, 'prism-worker', now);
    for (const delta of [-900, 900]) await verify(signed(delta));
    const count = async () => Number((await nonceDb.query('SELECT count(*) AS count FROM prism.worker_request_nonce')).rows[0].count);
    assert.equal(await count(), 2);
    for (const delta of [-901, 901]) {
      const headers = signed(delta);
      await assert.rejects(verify(headers), /internal request expired/);
      assert.equal(await count(), delta === -901 ? 2 : 3, 'B rejects skew before SQL nonce publication');
      await verify(headers, workerConfigA, new PostgresNonceStore(nonceDb, workerConfigA.nonceDatabase.maximumCleanupRows));
    }
    const headers = signed(900);
    await verify(headers);
    await assert.rejects(verify(headers), /internal request replayed/);
    const beforeInvalid = await count();
    const invalid = signed(0); invalid['x-prism-signature'] = 'v1=' + '0'.repeat(64);
    await assert.rejects(verify(invalid), /invalid internal request authentication/);
    assert.equal(await count(), beforeInvalid, 'invalid signature never publishes a nonce');
    // Exercise the delivered cleanup batch size in real SQL, not only readback.
    // B removes seven expired rows; retained A still removes the remaining rows.
    await nonceDb.query(`INSERT INTO prism.worker_request_nonce
      SELECT 'cleanup', 'expired-' || i, now() - interval '2 hours', now() - interval '1 hour'
      FROM generate_series(1, 10) AS i`);
    const expired = async () => Number((await nonceDb.query(
      "SELECT count(*) AS count FROM prism.worker_request_nonce WHERE audience = 'cleanup' AND expires_at <= now()"
    )).rows[0].count);
    assert.equal(await expired(), 10);
    await verify(signed(0));
    assert.equal(await expired(), 3, 'delivered B cleanup is capped at seven expired rows');
    await verify(signed(0), workerConfigA, new PostgresNonceStore(nonceDb, workerConfigA.nonceDatabase.maximumCleanupRows));
    assert.equal(await expired(), 0, 'retained A keeps its original larger cleanup batch');
    await assert.rejects(verify(headers), /internal request replayed/);

  } finally { await nonceDb.close(); }
  // Run the delivered lifecycle, not only its projection: one work slot and one
  // reserved probe slot must enforce B while the retained A capture stays A.
  const { createManagedWorkerServer } = await import(pathToFileURL(path.join(engine, 'worker-lifecycle.ts')).href);
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  let entered;
  let admitted = new Promise(resolve => { entered = resolve; });
  const server = createManagedWorkerServer(async (_request, response) => {
    entered(); await hold; response.end('ok');
  }, async () => {}, workerConfigB.ingress);
  assert.equal(server.maxConnections, 7);
  assert.equal(server.requestTimeout, 2345);
  assert.equal(server.headersTimeout, 2345);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const responses = [];
  try {
    const work = fetch(origin + '/work', { method: 'POST', headers: { connection: 'close' } });
    responses.push(work); await admitted;
    const deniedWork = await fetch(origin + '/work', { method: 'POST', headers: { connection: 'close' } });
    assert.equal(deniedWork.status, 503);
    assert.equal((await deniedWork.json()).error, 'PRISM_WORKER_CAPACITY_EXCEEDED');
    admitted = new Promise(resolve => { entered = resolve; });
    const probe = fetch(origin + '/ready', { headers: { connection: 'close' } });
    responses.push(probe); await admitted;
    const deniedProbe = await fetch(origin + '/ready', { headers: { connection: 'close' } });
    assert.equal(deniedProbe.status, 503);
    assert.equal((await deniedProbe.json()).error, 'PRISM_WORKER_CAPACITY_EXCEEDED');
    release();
    for (const response of await Promise.all(responses)) {
      assert.equal(response.status, 200); assert.equal(await response.text(), 'ok');
    }
  } finally {
    release();
    await Promise.allSettled(responses.map(async response => (await response).body?.cancel()));
    await server.shutdown(workerConfigB.shutdownTimeoutMs);
  }
  // Exercise the delivered attempt route at B's byte boundary. Authentication
  // must remain enforced; neither an oversized nor an unauthenticated body runs.
  const { createWorkerServer } = await import(pathToFileURL(path.join(engine, 'worker-service.ts')).href);
  let attemptsExecuted = 0;
  const inputServer = createWorkerServer({ mode: 'spiffe', trustedControlSpiffeId: 'spiffe://fixture/control' }, {
    ready: () => true,
    execute: async () => { attemptsExecuted++; throw new Error('unauthenticated attempt executed'); },
  }, workerConfigB.ingress);
  inputServer.listen(0, '127.0.0.1'); await once(inputServer, 'listening');
  const inputUrl = `http://127.0.0.1:${inputServer.address().port}/v1/attempts`;
  async function postInput(body) {
    const response = await fetch(inputUrl, { method: 'POST',
      headers: { 'content-type': 'application/json', connection: 'close' }, body });
    assert.equal(response.status, 422);
    return (await response.json()).error;
  }
  try {
    const exactBody = ' '.repeat(workerConfigB.ingress.maximumInputBytes);
    const exactError = await postInput(exactBody);
    assert.match(exactError, /^WORKER_TRUST_/, 'exact budget reaches original authentication');
    assert.equal(await postInput(exactBody + ' '), 'Prism attempt request is too large');
    const unicodeBody = 'é'.repeat(2161);
    assert.ok(unicodeBody.length < workerConfigB.ingress.maximumInputBytes);
    assert.equal(Buffer.byteLength(unicodeBody), workerConfigB.ingress.maximumInputBytes + 1);
    assert.equal(await postInput(unicodeBody), 'Prism attempt request is too large', 'budget counts bytes, not characters');
    assert.equal(await postInput(exactBody), exactError, 'oversize releases the single work slot');
    assert.equal(attemptsExecuted, 0);
  } finally {
    await inputServer.shutdown(workerConfigB.shutdownTimeoutMs);
  }
  // Delivered shutdown consumes the selected boot deadline and cancels admitted
  // work before closing dependencies; do not simulate native reaping or expiry.
  let shutdownEntered;
  const shutdownAdmission = new Promise(resolve => { shutdownEntered = resolve; });
  let cancellationObserved = false;
  let dependenciesClosed = false;
  const drainingServer = createManagedWorkerServer(async (_request, response, signal) => {
    shutdownEntered();
    await new Promise(resolve => signal.addEventListener('abort', () => {
      cancellationObserved = true; resolve();
    }, { once: true }));
    response.end('cancelled');
  }, async () => {
    assert.equal(cancellationObserved, true, 'work cancelled before dependency closure');
    dependenciesClosed = true;
  }, workerConfigB.ingress);
  drainingServer.listen(0, '127.0.0.1'); await once(drainingServer, 'listening');
  const drainingResponse = fetch(`http://127.0.0.1:${drainingServer.address().port}/work`,
    { method: 'POST', headers: { connection: 'close' } });
  try {
    await shutdownAdmission;
    await drainingServer.shutdown(workerConfigB.shutdownTimeoutMs);
    const response = await drainingResponse;
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'cancelled');
    assert.equal(dependenciesClosed, true);
    assert.equal(drainingServer.listening, false);
  } finally {
    await drainingServer.shutdown(workerConfigB.shutdownTimeoutMs);
    await Promise.allSettled([drainingResponse.then(response => response.body?.cancel())]);
  }
  assert.equal(configs.worker.loadWorkerConfig(workerB, credentials).controlInternalUrl.href, 'https://control.example.test:9443/internal');
  assert.equal(configs.worker.loadWorkerConfig(captures['prism-worker'], credentials).controlInternalUrl.href, 'http://prism-control:8080/');
  for (const value of ['', 'http://prism-control:8080', 'https://override.example.test']) {
    assert.throws(() => configs.worker.loadWorkerConfig(workerB, {...credentials, PRISM_CONTROL_INTERNAL_URL:value}), /SWARM_CONFIG_LEGACY_OVERRIDE:PRISM_CONTROL_INTERNAL_URL/);
  }
  const controlMount = mounts['prism-control'];
  fs.cpSync(path.join(generationB, 'expected/prism-control'), path.join(controlMount, 'version-B'), { recursive: true });
  fs.unlinkSync(path.join(controlMount, '..data')); fs.symlinkSync('version-B', path.join(controlMount, '..data'));
  const controlB = boot.capturePipelineBootReceipts(controlMount, path.join(generationB, 'system'), 'prism-control', code, '/app/prism/skills');
  const newControl = configs.control.loadControlServerConfig(controlB, credentials);
  assert.deepEqual(newControl.corpusRanking, {schemaVersion:'corpus-ranking.v1',candidateFloor:17,candidateMultiplier:3,rrfDamping:7});
  assert.deepEqual(configs.control.loadControlServerConfig(captures['prism-control'],credentials).corpusRanking,
    {schemaVersion:'corpus-ranking.v1',candidateFloor:100,candidateMultiplier:10,rrfDamping:60});
  assert.ok(Object.isFrozen(newControl.corpusRanking));
  // Control installation credentials remain external to the delivered author.
  // Capture them once, fail closed on each missing secret, and retain A/B policy.
  // The async composition must capture installation inputs before yielding,
  // while listener settings still come from the verified delivered generation.
  const compositionEnvironment = { ...credentials };
  const composing = configs.control.loadControlCompositionConfig(controlB, compositionEnvironment);
  compositionEnvironment.DATABASE_URL = 'postgresql://changed.invalid/prism';
  compositionEnvironment.PRISM_SESSION_SECRET = 'changed-during-async-composition';
  compositionEnvironment.PORT = '1';
  const composedControl = await composing;
  assert.deepEqual(composedControl.listener, { port: newControl.port, databaseUrl: credentials.DATABASE_URL });
  assert.equal(composedControl.service.sessionSecret, credentials.PRISM_SESSION_SECRET);
  assert.equal(composedControl.product, undefined);
  assert.ok(Object.isFrozen(composedControl)); assert.ok(Object.isFrozen(composedControl.listener));
  assert.ok(Object.isFrozen(composedControl.service));
  const withoutDatabase = { ...credentials }; delete withoutDatabase.DATABASE_URL;
  assert.deepEqual((await configs.control.loadControlCompositionConfig(controlB, withoutDatabase)).listener,
    { port: newControl.port, databaseUrl: undefined });
  await assert.rejects(configs.control.loadControlCompositionConfig(controlB, compositionEnvironment),
    /SWARM_CONFIG_LEGACY_OVERRIDE:PORT/);
  // Exercise actual asynchronous signing-key I/O in the delivered composition:
  // installation inputs are captured before await, while A/B policy stays selected.
  const { generateKeyPairSync, sign, verify } = await import('node:crypto');
  const productKeys = generateKeyPairSync('ed25519');
  const productKeyFile = path.join(root, 'product-installation-key.pem');
  fs.writeFileSync(productKeyFile, productKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const productEnvironment = { ...credentials, PRISM_PRODUCT_DECISIONS_ENABLED: 'true',
    PRISM_PRODUCT_ORIGIN: 'https://studio.example.test', PRISM_PRODUCT_CONTROLLER_URL: 'https://controller.example.test',
    PRISM_PRODUCT_OPERATORS: JSON.stringify(['fixture-operator']), PRISM_PRODUCT_PRIVATE_KEY_FILE: productKeyFile,
    PRISM_PRODUCT_ISSUER: 'fixture-issuer', PRISM_PRODUCT_CONTROLLER_CA_FILE: path.join(root, 'installed-ca.pem'),
    PRISM_PRODUCT_CONTROLLER_TOKEN_FILE: path.join(root, 'installed-token') };
  const productComposition = configs.control.loadControlCompositionConfig(controlB, productEnvironment);
  const originalProductEnvironment = { ...productEnvironment };
  productEnvironment.PRISM_PRODUCT_ISSUER = 'replacement-issuer';
  productEnvironment.PRISM_PRODUCT_CONTROLLER_CA_FILE = 'replacement-ca';
  productEnvironment.PRISM_PRODUCT_CONTROLLER_TOKEN_FILE = 'replacement-token';
  productEnvironment.PRISM_PRODUCT_OPERATORS = JSON.stringify(['replacement-operator']);
  productEnvironment.DATABASE_URL = 'postgresql://replacement.invalid/prism';
  const productComposed = await productComposition;
  assert.equal(productComposed.product.issuer, originalProductEnvironment.PRISM_PRODUCT_ISSUER);
  assert.equal(productComposed.product.caFile, originalProductEnvironment.PRISM_PRODUCT_CONTROLLER_CA_FILE);
  assert.equal(productComposed.product.tokenFile, originalProductEnvironment.PRISM_PRODUCT_CONTROLLER_TOKEN_FILE);
  assert.deepEqual([...productComposed.product.operators], ['fixture-operator']);
  assert.equal(productComposed.product.controller.href, 'https://controller.example.test/');
  assert.equal(productComposed.product.origin, 'https://studio.example.test');
  assert.equal(productComposed.listener.databaseUrl, credentials.DATABASE_URL);
  assert.equal(productComposed.service.productDecisionLifetimeMs, 120000);
  assert.equal((await configs.control.loadControlCompositionConfig(captures['prism-control'], originalProductEnvironment))
    .service.productDecisionLifetimeMs, 300000);
  const signingProbe = Buffer.from('delivered-product-composition');
  assert.equal(verify(null, signingProbe, productKeys.publicKey,
    sign(null, signingProbe, productComposed.product.privateKey)), true);
  const missingProductKey = { ...originalProductEnvironment, PRISM_PRODUCT_PRIVATE_KEY_FILE: path.join(root, 'absent-key') };
  await assert.rejects(configs.control.loadControlCompositionConfig(controlB, missingProductKey), { code: 'ENOENT' });
  await assert.rejects(configs.control.loadControlCompositionConfig(controlB,
    { ...originalProductEnvironment, PRISM_PRODUCT_CONTROLLER_URL: 'http://controller.example.test' }), /requires HTTPS origins/);
  const controlInstallation = { ...credentials };
  const installedControl = configs.control.loadControlServerConfig(controlB, controlInstallation);
  assert.equal(Object.isFrozen(installedControl), true);
  for (const [input, member] of Object.entries({ PRISM_SESSION_SECRET: 'sessionSecret',
    PRISM_INGRESS_SECRET: 'ingressSecret', PRISM_INGESTION_SECRET: 'ingestionSecret',
    PRISM_DISPATCH_SECRET: 'dispatchSecret', PRISM_WORKER_SECRET: 'workerSecret' })) {
    const original = controlInstallation[input];
    assert.equal(installedControl[member], original);
    controlInstallation[input] = 'changed-after-control-composition';
    assert.equal(installedControl[member], original);
    const missing = { ...credentials }; delete missing[input];
    assert.throws(() => configs.control.loadControlServerConfig(controlB, missing),
      new RegExp(input + ' is required'));
  }
  assert.equal(installedControl.controlInternalUrl.href, 'https://control.example.test:9443/internal');
  assert.equal(configs.control.loadControlServerConfig(captures['prism-control'], credentials).controlInternalUrl.href,
    'http://prism-control:8080/');
  const controlTrust = { ...credentials, WORKER_TRUST_SPIFFE_ENABLED: 'true',
    PRISM_TRUSTED_NOVA_SPIFFE_ID: 'spiffe://fixture/nova',
    PRISM_TRUSTED_WORKER_SPIFFE_ID: 'spiffe://fixture/worker',
    PRISM_CONTROL_SPIFFE_ID: 'spiffe://fixture/control',
    PRISM_TRUSTED_AGENT_SPIFFE_ID: 'spiffe://fixture/agent' };
  for (const key of ['PRISM_TRUSTED_NOVA_SPIFFE_ID', 'PRISM_TRUSTED_WORKER_SPIFFE_ID',
    'PRISM_CONTROL_SPIFFE_ID', 'PRISM_TRUSTED_AGENT_SPIFFE_ID']) {
    const incomplete = { ...controlTrust }; delete incomplete[key];
    assert.throws(() => configs.control.loadControlServerConfig(controlB, incomplete), /SPIFFE trust policy is incomplete/);
  }
  delete controlTrust.PRISM_DISPATCH_SECRET; delete controlTrust.PRISM_WORKER_SECRET;
  const spiffeControl = configs.control.loadControlServerConfig(controlB, controlTrust);
  assert.equal(spiffeControl.spiffeEnabled, true);
  assert.equal(spiffeControl.dispatchSecret, ''); assert.equal(spiffeControl.workerSecret, '');
  assert.equal(spiffeControl.trustedNovaSpiffeId, controlTrust.PRISM_TRUSTED_NOVA_SPIFFE_ID);
  assert.equal(spiffeControl.trustedWorkerSpiffeId, controlTrust.PRISM_TRUSTED_WORKER_SPIFFE_ID);
  assert.equal(spiffeControl.trustedControlSpiffeId, controlTrust.PRISM_CONTROL_SPIFFE_ID);
  assert.equal(spiffeControl.trustedPrismAgentSpiffeId, controlTrust.PRISM_TRUSTED_AGENT_SPIFFE_ID);
  assert.equal(spiffeControl.maximumDispatchBodyBytes, newControl.maximumDispatchBodyBytes);
  for (const [key, equalValue] of Object.entries({ PORT: String(newControl.port),
    PRISM_CONTROL_INTERNAL_URL: newControl.controlInternalUrl.href, PRISM_WORKER_URL: newControl.workerUrl.href,
    PRISM_INGESTION_URL: newControl.ingestionUrl.href })) {
    for (const value of ['', equalValue, 'retired-other']) {
      assert.throws(() => configs.control.loadControlServerConfig(controlB, { ...credentials, [key]: value }),
        /SWARM_CONFIG_LEGACY_OVERRIDE/);
    }
  }
  assert.equal(newControl.productDecisionLifetimeMs,120000);
  assert.equal(newControl.corpusSearchDefaultLimit,3);
  assert.equal(configs.control.loadControlServerConfig(captures['prism-control'], credentials).corpusSearchDefaultLimit,10);
  assert.equal(newControl.corpusSearchMaximumLimit,7);
  assert.equal(configs.control.loadControlServerConfig(captures['prism-control'], credentials).corpusSearchMaximumLimit,50);
  assert.equal(newControl.corpusSourceFamilyDefaultLimit,1);
  assert.equal(configs.control.loadControlServerConfig(captures['prism-control'], credentials).corpusSourceFamilyDefaultLimit,2);
  assert.equal(newControl.corpusSourceFamilyMaximumLimit,4);
  assert.equal(configs.control.loadControlServerConfig(captures['prism-control'], credentials).corpusSourceFamilyMaximumLimit,10);

  assert.equal(newControl.controlInternalUrl.href, 'https://control.example.test:9443/internal');
  for (const value of ['http://prism-control:8080', 'https://override.example.test']) {
    assert.throws(() => configs.control.loadControlServerConfig(controlB, {...credentials, PRISM_CONTROL_INTERNAL_URL:value}), /SWARM_CONFIG_LEGACY_OVERRIDE:PRISM_CONTROL_INTERNAL_URL/);
  }
  assert.equal(newControl.maximumDispatchBodyBytes, 3456);
  assert.equal(newControl.maximumInternalEvidenceBytes, 321);
  assert.equal(newControl.maximumProductControllerTokenCharacters, 17);
  assert.equal(newControl.productDecisionHistoryLimit, 3);
  assert.equal(newControl.maximumProductInputBytes, 1234);
  assert.equal(newControl.productControllerTimeoutMs, 123);
  assert.equal(newControl.maximumProductControllerResponseBytes, 456);
  assert.equal(newControl.sessionLifetimeSeconds, 7);
  assert.equal(newControl.workerUrl.href, 'https://worker.example.test:9443/dispatch');
  assert.equal(newControl.ingestionUrl.href, 'https://ingestion.example.test:9443/source');
  for (const value of ['http://prism-ingestion:8080', 'https://override.example.test']) {
    assert.throws(() => configs.control.loadControlServerConfig(controlB, { ...credentials, PRISM_INGESTION_URL: value }), /SWARM_CONFIG_LEGACY_OVERRIDE:PRISM_INGESTION_URL/);
  }
  assert.equal(newControl.maximumRenderAssetBytes, 2345);
  assert.equal(newControl.maximumArtifactBytes, 1234);
  assert.equal(newControl.maximumJsonBodyBytes, 4096);
  assert.equal(newControl.maximumArtifactUploadBodyBytes, 16384);
  assert.equal(newControl.ingestionAcquireTimeoutMs, 3000);
  assert.equal(newControl.ingestionCleanupTimeoutMs, 1000);
  assert.equal(configs.control.loadControlServerConfig(controlB, credentials).nativeAttemptLifetimeMs, 123000);
  const retainedControl = configs.control.loadControlServerConfig(captures['prism-control'], credentials);
  const {sessionRoutes: deliveredSessionRoutes} = await import(pathToFileURL(path.join(engine, 'session-routes.ts')).href);
  const {verifySession: deliveredVerifySession} = await import(pathToFileURL(path.join(engine, '../control/session.ts')).href);
  for (const selected of [retainedControl, newControl]) {
    assert.deepEqual(selected.sessionDefaultRoles, ['editor']);
    assert.ok(Object.isFrozen(selected.sessionDefaultRoles));
    let cookies;
    const handled = await deliveredSessionRoutes({config:selected}, {method:'POST',headers:{'tailscale-user-login':'operator','x-prism-ingress-secret':selected.ingressSecret}},
      {setHeader(name,value){if(name==='set-cookie')cookies=value;},writeHead(status){assert.equal(status,201);},end(){}}, new URL('https://control/v1/session'));
    assert.equal(handled,true);
    const token=decodeURIComponent(cookies[0].split(';')[0].slice('prism_session='.length));
    assert.deepEqual(deliveredVerifySession(token,selected.sessionSecret).roles,['editor']);
  }
  // Verify delivered route and real selection with deterministic DB boundary rows.
  // This proves consumer wiring, not PostgreSQL ranking/native acceptance.
  const { corpusRoutes: deliveredCorpusRoutes } = await import(pathToFileURL(path.join(engine, 'corpus-routes.ts')).href);
  const corpusRows = Array.from({ length: 144 }, (_, index) => ({
    id: `corpus-${index}`, normalized: { sourceFamily: `family-${Math.floor(index / 12)}` },
    source_kind: 'internal-project', ranking: 'hybrid-rrf-v1',
  }));
  for (const [selected, expectedDefault, expectedMaximum, familyDefault, familyMaximum] of [
    [retainedControl, 10, 50, 2, 10], [newControl, 3, 7, 1, 4],
  ]) {
    for (const [query, expectedSlots, expectedFamilyCap] of [
      ['', expectedDefault, familyDefault],
      ['?limit=999&sourceFamilyLimit=999', expectedMaximum, familyMaximum],
      ['?limit=999', Math.min(expectedMaximum, 12 * familyDefault), familyDefault],
      ['?sourceFamilyLimit=999', expectedDefault, familyMaximum],
      ['?limit=0&sourceFamilyLimit=0', 1, 1],
    ]) {
      let result, queries = 0, embeddings = 0;
      const handled = await deliveredCorpusRoutes({ config: selected,
        pool: { query: async (sql, params) => {
          queries++; assert.match(sql, /WITH eligible/);
          assert.equal(params[0], ''); assert.equal(params[3], 'delivered-fixture');
          assert.deepEqual(params.slice(6), [selected.corpusRanking.candidateFloor,selected.corpusRanking.rrfDamping]);
          assert.match(sql, /LIMIT \$7/); assert.match(sql, /\$8::numeric/);
          const requested = new URL('http://local/'+query).searchParams.get('limit');
          const resultLimit = Math.min(expectedMaximum, Math.max(1, Number(requested ?? expectedDefault)));
          assert.equal(params[1],Math.max(resultLimit*selected.corpusRanking.candidateMultiplier,selected.corpusRanking.candidateFloor));
          return { rows: corpusRows };
        } },
        runWorker: async (operation, input) => {
          embeddings++; assert.equal(operation, 'ingest'); assert.equal(input.text, '');
          return { embedding: [1, 0], model: 'delivered-fixture' };
        },
      }, { method: 'GET' }, { writeHead(status) { assert.equal(status, 200); },
        end(bytes) { result = JSON.parse(bytes); } }, new URL(`http://localhost/v1/corpus/search${query}`));
      assert.equal(handled, true); assert.equal(queries, 1); assert.equal(embeddings, 1);
      assert.equal(result.items.length, expectedSlots);
      const counts = new Map();
      for (const item of result.items) {
        assert.equal(item.explanation.diversityCap, expectedFamilyCap);
        const family = item.explanation.sourceFamily;
        counts.set(family, (counts.get(family) ?? 0) + 1);
      }
      assert.equal(Math.max(...counts.values()), Math.min(expectedFamilyCap, expectedSlots));
    }
  }

  assert.equal(retainedControl.nativeAttemptLifetimeMs, 600000);
  assert.equal(configs.control.loadControlServerConfig(controlB, credentials).nativeAttemptTimeoutMs, 45000);
  assert.equal(retainedControl.nativeAttemptTimeoutMs, 300000);
  assert.equal(retainedControl.nativeAttemptCleanupTimeoutMs, 10000);
  assert.equal(retainedControl.nativeAttemptLogBytes, 1048576);
  for (const [key, original, changed] of [
    ['nativeAttemptResultBytes', 16777216, 4096],
    ['nativeAttemptEvidenceBytes', 134217728, 8192],
    ['nativeAttemptEvidenceFiles', 64, 3],
  ]) {
    assert.equal(retainedControl[key], original, `${key}: retained capture A stays A after publishing B`);
    assert.equal(newControl[key], changed, `${key}: real delivered generation B reaches Control startup`);
  }
  assert.equal(configs.control.loadControlServerConfig(controlB, credentials).nativeAttemptLogBytes, 2048);
  assert.equal(configs.control.loadControlServerConfig(controlB, credentials).nativeAttemptCleanupTimeoutMs, 750);
  // Follow delivered startup values into the installed producer, not only config readback.
  const priorEngineIdentity = process.env.PRISM_ENGINE_CONTENT_DIGEST;
  process.env.PRISM_ENGINE_CONTENT_DIGEST = 'sha256:' + 'a'.repeat(64);
  let deliveredProducer;
  try { deliveredProducer = await import(pathToFileURL(path.join(engine, '../engine/worker-envelope.ts')).href); }
  finally { if (priorEngineIdentity === undefined) delete process.env.PRISM_ENGINE_CONTENT_DIGEST;
    else process.env.PRISM_ENGINE_CONTENT_DIGEST = priorEngineIdentity; }
  const artifact = { artifactId: 'artifact:sha256:' + 'a'.repeat(64), type: 'input', mediaType: 'application/json',
    contentDigest: 'sha256:' + 'a'.repeat(64), sizeBytes: 2, storageUrl: 'http://prism-control/artifact' };
  for (const [selected, expected] of [[retainedControl, [600000,300000,10000,1048576,16777216,134217728,64]],
    [newControl, [123000,45000,750,2048,4096,8192,3]]]) {
    const envelope = deliveredProducer.prismNativeAttempt('render', artifact, 'delivered-config', selected.nativeResourcePolicy,
      selected.nativeAttemptLifetimeMs, selected.nativeAttemptTimeoutMs, selected.nativeAttemptCleanupTimeoutMs,
      selected.nativeAttemptLogBytes, selected.nativeAttemptResultBytes, selected.nativeAttemptEvidenceBytes, selected.nativeAttemptEvidenceFiles);
    assert.deepEqual([Date.parse(envelope.claim.expiresAt)-Date.parse(envelope.issuedAt), envelope.limits.timeoutMs,
      envelope.limits.cleanupTimeoutMs, envelope.limits.logBytes, envelope.limits.resultBytes,
      envelope.limits.evidenceBytes, envelope.limits.evidenceFiles], expected);
    assert.equal(envelope.queueDeadline, envelope.claim.expiresAt);
  }
  assert.equal(retainedControl.maximumJsonBodyBytes, 2000000, 'captured limits A remain A after publishing B');
  assert.equal(retainedControl.maximumArtifactUploadBodyBytes, 8500000);
  assert.equal(retainedControl.maximumDispatchBodyBytes, 2000000);
  assert.equal(retainedControl.maximumInternalEvidenceBytes, 134217728);
  assert.equal(retainedControl.maximumProductControllerTokenCharacters, 64000);
  assert.equal(retainedControl.productDecisionHistoryLimit, 100);
  assert.equal(retainedControl.maximumProductInputBytes, 32000);
  assert.equal(retainedControl.productControllerTimeoutMs, 15000);
  assert.equal(retainedControl.maximumProductControllerResponseBytes, 1000000);
  assert.equal(retainedControl.sessionLifetimeSeconds, 900);
  assert.equal(retainedControl.productDecisionLifetimeMs,300000);
  assert.equal(retainedControl.controlInternalUrl.href, 'http://prism-control:8080/');
  assert.equal(retainedControl.workerUrl.href, 'http://prism-worker:8080/');
  assert.throws(() => configs.control.loadControlServerConfig(captures['prism-control'], {...credentials, PRISM_WORKER_URL:'http://prism-worker:8080'}), /SWARM_CONFIG_LEGACY_OVERRIDE:PRISM_WORKER_URL/);
  assert.equal(retainedControl.ingestionUrl.href, 'http://prism-ingestion:8080/');
  assert.equal(retainedControl.maximumRenderAssetBytes, 6000000);
  assert.equal(retainedControl.maximumArtifactBytes, 6000000);
  assert.equal(retainedControl.ingestionAcquireTimeoutMs, 30000);
  assert.equal(retainedControl.ingestionCleanupTimeoutMs, 10000);
  // Exercise ingestion from the installed package with real captured A/B configs.
  // A controlled transport exposes timeout/endpoint wiring without native-host claims.
  const originalFetch = globalThis.fetch, originalTimeout = AbortSignal.timeout;
  const acquisitionCalls = [], acquisitionDeadlines = [];
  let cleanupFails = false, acquisitionFails = false, publicationCalls = 0;
  try {
    AbortSignal.timeout = ms => { acquisitionDeadlines.push(ms); return new AbortController().signal; };
    globalThis.fetch = async (url, options) => {
      acquisitionCalls.push([String(url), options.method]);
      if (options.method === 'DELETE') return new Response(null, {status: cleanupFails ? 503 : 204});
      if (acquisitionFails) return new Response(null, {status: 503});
      return Response.json({normalized:{}, quarantineDigest:'sha256:'+'a'.repeat(64), contentBase64:'eA=='});
    };
    for (const [config, expectedDeadlines, endpoint] of [
      [newControl, [3000,1000], 'https://ingestion.example.test:9443'],
      [retainedControl, [30000,10000], 'http://prism-ingestion:8080'],
    ]) {
      acquisitionCalls.length = 0; acquisitionDeadlines.length = 0;
      const context = {config, runWorker:async()=>{publicationCalls++;throw Error('unexpected publication');}, pool:{query:async()=>{throw Error('unexpected activation');}}};
      const ingestRequest = text => Object.assign(Readable.from([Buffer.from(text)]), {method:'POST', headers:{'content-type':'application/json'}});
      const ingestUrl = new URL('http://localhost/v1/corpus');
      await assert.rejects(deliveredCorpusRoutes(context, ingestRequest('{}'), {}, ingestUrl), /corpus acquisition digest mismatch/);
      assert.deepEqual(acquisitionDeadlines, expectedDeadlines);
      assert.deepEqual(acquisitionCalls, [[endpoint+'/v1/acquisitions','POST'], [endpoint+'/v1/acquisitions/'+'a'.repeat(64),'DELETE']]);
      cleanupFails = true;
      await assert.rejects(deliveredCorpusRoutes(context, ingestRequest('{}'), {}, ingestUrl), error => {
        assert.ok(error instanceof AggregateError);
        assert.match(error.errors[0].message, /corpus acquisition digest mismatch/);
        assert.match(error.errors[1].message, /quarantine cleanup failed: 503/);
        return true;
      });
      cleanupFails = false; acquisitionFails = true;
      acquisitionCalls.length = 0; acquisitionDeadlines.length = 0;
      await assert.rejects(deliveredCorpusRoutes(context, ingestRequest('{}'), {}, ingestUrl), /corpus acquisition failed: 503/);
      assert.deepEqual(acquisitionCalls, [[endpoint+'/v1/acquisitions','POST']]);
      assert.deepEqual(acquisitionDeadlines, [expectedDeadlines[0]]);
      acquisitionFails = false;
      acquisitionCalls.length = 0;
      await assert.rejects(deliveredCorpusRoutes(context, ingestRequest('{"sourceKind":"public-web"}'), {}, ingestUrl), /public-web ingestion is disabled/);
      assert.deepEqual(acquisitionCalls, []);
    }
    assert.equal(publicationCalls, 0);
  } finally { globalThis.fetch = originalFetch; AbortSignal.timeout = originalTimeout; }
  const collisionSource = path.join(root, 'collision-source'); fs.mkdirSync(collisionSource);
  fs.writeFileSync(path.join(collisionSource, 'marker'), 'retain me');
  assert.throws(() => execFileSync(publisher, [collisionSource, output], { stdio: 'pipe' }));
  assert.equal(fs.readFileSync(path.join(collisionSource, 'marker'), 'utf8'), 'retain me');
  assert.equal(fs.existsSync(path.join(output, 'system/pipeline.config.json')), true);
  // No source-tree mounts or fake captures: installed code paths and generated image settings were actually read.
  assert.equal(fs.statSync(path.join(output, 'system/pipeline.config.json')).mode & 0o777, 0o444);
});

test('real Buster role binds parent and child to the same runtime service and owner profile', async t => {
  assert.equal(process.getuid?.(), 0);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-buster-role-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const code = path.join(root, 'role'), author = path.join(root, 'author'), output = path.join(root, 'generation');
  const publisher = path.join(root, 'publish');
  execFileSync('cc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-O2', path.join(repo, 'scripts/pipeline-publish.c'), '-o', publisher]);
  execFileSync(process.execPath, [path.join(repo, 'scripts/build-runtime-role-bundle.mjs'), 'buster', code,
    'a'.repeat(40), 'config-c1-test-fixture', '2026-10-14T00:00:00Z'], { cwd: repo, stdio: 'pipe' });
  fs.cpSync(path.join(repo, 'config'), author, { recursive: true });
  const services = declaredPipelineServices(author, { role: 'buster', namespace: 'kubeclaw', releaseName: 'agent-buster' });
  assert.equal(services[0].serviceInstanceId, services[1].serviceInstanceId);
  assert.equal(services[0].bindings[0].profileId, 'runtime');
  const result = await materializePipelineGeneration({ authorRoot: author, packageRoot: code, output, services, publisher });
  assert.equal(result.callers.length, 2);
  const foundation = path.join(code, 'skills/packages/plugin-foundation/config');
  const boot = await import(pathToFileURL(path.join(foundation, 'pipeline-boot.mjs')).href);
  const projection = await import(pathToFileURL(path.join(foundation, 'pipeline-composition.ts')).href);
  const loaded = [], captures = {};
  for (const service of services) {
    const mount = path.join(root, `transport-${service.callerId}`); fs.mkdirSync(mount);
    fs.cpSync(path.join(output, 'expected', service.callerId), path.join(mount, 'version-A'), { recursive: true });
    fs.symlinkSync('version-A', path.join(mount, '..data'));
    const capture = boot.capturePipelineBootReceipts(mount, path.join(output, 'system'), service.callerId, code, '/app/skills');
    captures[service.callerId] = capture;
    loaded.push(projection.projectBusterSettings(capture, service.callerId));
  }
  assert.deepEqual(loaded[0], loaded[1]);
  assert.deepEqual(projection.selectedWorkerCorePolicy(captures['buster-preparation']),projection.selectedWorkerCorePolicy(captures['buster-runtime']));
  assert.equal(projection.selectedWorkerCorePolicy(captures['buster-runtime']).settings.runtime.retain_logs['buster-provider'],false);
  const startup = await import(pathToFileURL(path.join(foundation, 'buster-startup.ts')).href);
  const engineLeaf = path.join(output, 'system/components/buster-engine.config.json');
  fs.chmodSync(engineLeaf, 0o664);
  assert.throws(() => boot.captureBusterParentStartupHandoff(captures['buster-preparation']), /FILE_NOT_TRUSTED/);
  fs.chmodSync(engineLeaf, 0o644);
  assert.throws(() => boot.captureBusterParentStartupHandoff(captures['buster-preparation']), /FILE_NOT_TRUSTED/);
  fs.chmodSync(engineLeaf, 0o444);
  const handoff = boot.captureBusterParentStartupHandoff(captures['buster-preparation']);
  const closure = boot.captureBusterBootSourceClosure(captures['buster-preparation']);
  assert.equal(closure.expectedReceipt.imageReceiptDigest, handoff.imageReceiptDigest);
  assert.equal(closure.expectedReceipt.generationDigest, handoff.generationDigest);
  assert.ok(closure.files.some(file => file.name === 'generation/pipeline.config.json'));
  assert.ok(closure.files.some(file => file.name === 'generation/package-receipt.json'));
  assert.ok(closure.files.some(file => file.name === 'reader/swarm.ts'));
  assert.equal(closure.schemaVersion, 'buster-boot-source-closure.v2');
  const archivedPackage = JSON.parse(Buffer.from(closure.files.find(file => file.name === 'generation/package-receipt.json').bytes, 'base64').toString('utf8'));
  assert.equal(closure.files.filter(file => /^(package|package-alias)\//u.test(file.name)).length, archivedPackage.files.length);
  assert.ok(closure.files.some(file => file.name === 'package/skills/packages/buster-engine/test-gates/preparation-supervisor.ts'),
    'original privileged recovery program bytes, not only its claimed digest');
  const nativeFacts = await import(pathToFileURL(path.join(code, 'skills/packages/buster-engine/test-gates/preparation-boot-closure.ts')).href);
  assert.throws(() => nativeFacts.captureOriginalBusterNativeBootFacts({ ...captures['buster-preparation'] }, {}), /VERIFIED_CAPTURE_REQUIRED/);
  assert.throws(() => nativeFacts.captureOriginalBusterNativeBootFacts(captures['buster-preparation'], {}), /VERIFIED_TRUST_CAPTURE_REQUIRED/);
  assert.throws(() => nativeFacts.assertOriginalBusterNativeBootFacts({ schemaVersion: 'buster-native-boot-facts.v1' }), /VERIFIED_BOOT_FACTS_REQUIRED/);
  for (const file of closure.files) {
    const bytes = Buffer.from(file.bytes, 'base64');
    assert.equal(bytes.byteLength, file.byteLength);
    assert.equal(`sha256:${createHash('sha256').update(bytes).digest('hex')}`, file.digest);
  }
  assert.throws(() => boot.captureBusterBootSourceClosure({ ...captures['buster-preparation'] }), /VERIFIED_CAPTURE_REQUIRED/);
  const untrustedArchiveRoot = path.join(root, 'boot-source-archives'); fs.mkdirSync(untrustedArchiveRoot, { mode: 0o700 });
  assert.throws(() => boot.publishBusterBootSourceClosure(captures['buster-preparation'], untrustedArchiveRoot), /DIRECTORY_NOT_TRUSTED/);
  assert.deepEqual(fs.readdirSync(untrustedArchiveRoot), [], 'untrusted writable ancestor rejects before archive emission');
  const archiveRoot = fs.mkdtempSync('/dev/kubeclaw-source-archive-test-');
  t.after(() => fs.rmSync(archiveRoot, { recursive: true, force: true }));
  const archiveReceipt = boot.publishBusterBootSourceClosure(captures['buster-preparation'], archiveRoot);
  const archivedBytes = fs.readFileSync(archiveReceipt.file), archivedInode = fs.statSync(archiveReceipt.file).ino;
  assert.deepEqual(boot.readBusterBootSourceArchive(archiveReceipt), closure);
  assert.throws(() => boot.publishBusterBootSourceClosure(captures['buster-preparation'], archiveRoot), { code: 'EEXIST' });
  assert.deepEqual(fs.readFileSync(archiveReceipt.file), archivedBytes);
  assert.equal(fs.statSync(archiveReceipt.file).ino, archivedInode);
  assert.equal(fs.readdirSync(archiveRoot).length, 1, 'no archive staging residue');
  const corruptedArchive = Buffer.from(archivedBytes); corruptedArchive[corruptedArchive.length - 1] = 32;
  fs.chmodSync(archiveReceipt.file, 0o644); fs.writeFileSync(archiveReceipt.file, corruptedArchive); fs.chmodSync(archiveReceipt.file, 0o444);
  assert.throws(() => boot.readBusterBootSourceArchive(archiveReceipt), /ARCHIVE_DIGEST_MISMATCH/);
  const deniedReplay = path.join(archiveRoot, 'denied-replay');
  assert.throws(() => boot.materializeBusterBootSourceArchive(archiveReceipt, deniedReplay), /ARCHIVE_DIGEST_MISMATCH/);
  assert.equal(fs.existsSync(deniedReplay), false, 'invalid original archive emits no replay tree');
  assert.deepEqual(fs.readFileSync(archiveReceipt.file), corruptedArchive, 'corrupt A is not silently repaired');
  fs.chmodSync(archiveReceipt.file, 0o644); fs.writeFileSync(archiveReceipt.file, archivedBytes); fs.chmodSync(archiveReceipt.file, 0o444);
  fs.renameSync(archiveReceipt.file, `${archiveReceipt.file}.retained`);
  assert.throws(() => boot.readBusterBootSourceArchive(archiveReceipt), /ENOENT/);
  assert.throws(() => boot.materializeBusterBootSourceArchive(archiveReceipt, deniedReplay), /ENOENT/);
  assert.equal(fs.existsSync(deniedReplay), false, 'missing original never materializes installed B');
  assert.equal(fs.existsSync(archiveReceipt.file), false, 'missing A archive is not regenerated from current installation');
  assert.deepEqual(fs.readFileSync(`${archiveReceipt.file}.retained`), archivedBytes);
  fs.renameSync(`${archiveReceipt.file}.retained`, archiveReceipt.file);
  const deliveredEntry = path.join(output, 'system/pipeline.config.json');
  const retainedEntryBytes = fs.readFileSync(deliveredEntry);
  fs.chmodSync(deliveredEntry, 0o644);
  const driftedEntryBytes = Buffer.from(retainedEntryBytes);
  driftedEntryBytes[driftedEntryBytes.length - 1] = 32;
  fs.writeFileSync(deliveredEntry, driftedEntryBytes);
  fs.chmodSync(deliveredEntry, 0o444);
  assert.throws(() => boot.captureBusterBootSourceClosure(captures['buster-preparation']), /ARCHIVE_SOURCE_CHANGED/);
  assert.deepEqual(Buffer.from(closure.files.find(file => file.name === 'generation/pipeline.config.json').bytes, 'base64'),
    retainedEntryBytes, 'captured A bytes never become current drifted bytes');
  await t.test('full inert original archive restoration (requires sufficient trusted storage)', replayTest => {
    const untrustedReplay = path.join(untrustedArchiveRoot, 'replay');
    assert.throws(() => boot.materializeBusterBootSourceArchive(archiveReceipt, untrustedReplay), /DIRECTORY_NOT_TRUSTED/);
    assert.equal(fs.existsSync(untrustedReplay), false);
    // Acceptance hosts may explicitly supply a root-controlled disk-backed test
    // location. This is a test locator only, never a runtime config author or a
    // trust override. A too-small tmpfs remains a real failure, not a skipped case.
    const replayRoot = fs.mkdtempSync(path.join(process.env.KUBECLAW_TRUSTED_REPLAY_TEST_PARENT ?? '/dev', 'kubeclaw-source-replay-test-'));
    replayTest.after(() => fs.rmSync(replayRoot, { recursive: true, force: true }));
    const replayDirectory = path.join(replayRoot, 'replay-original');
    const replay = boot.materializeBusterBootSourceArchive(archiveReceipt, replayDirectory);
    assert.equal(replay.schemaVersion, 'buster-inert-original-source-replay.v1');
    assert.deepEqual(fs.readFileSync(path.join(replay.systemRoot, 'pipeline.config.json')), retainedEntryBytes,
      'actual restored original A is independent of drifted installed B');
    assert.deepEqual(fs.readFileSync(path.join(replay.packageRoot, 'manifest.json')), Buffer.from(
      closure.files.find(file => file.name === 'generation/package-receipt.json').bytes, 'base64'));
    for (const member of archivedPackage.files) {
      const file = path.join(replay.packageRoot, member.path);
      if (member.kind === 'symlink') {
        assert.equal(fs.readlinkSync(file), member.target);
        assert.ok(fs.realpathSync(file).startsWith(replay.packageRoot + '/'), 'restored alias remains within original package tree');
      } else {
        assert.equal(`sha256:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`, member.digest);
        assert.equal(fs.statSync(file).mode & 0o777, member.mode);
      }
    }
    const replayInode = fs.statSync(replayDirectory).ino;
    assert.throws(() => boot.materializeBusterBootSourceArchive(archiveReceipt, replayDirectory), { code: 'EEXIST' });
    assert.equal(fs.statSync(replayDirectory).ino, replayInode, 'no replacement, even of a prior successful inert replay');
    const emptyReplay = path.join(replayRoot, 'empty-existing-replay'); fs.mkdirSync(emptyReplay);
    assert.throws(() => boot.materializeBusterBootSourceArchive(archiveReceipt, emptyReplay), { code: 'EEXIST' });
    assert.deepEqual(fs.readdirSync(emptyReplay), [], 'existing empty destination is never adopted');
  });
  fs.chmodSync(deliveredEntry, 0o644); fs.writeFileSync(deliveredEntry, retainedEntryBytes); fs.chmodSync(deliveredEntry, 0o444);
  assert.equal(handoff.childSelection.serviceInstanceId, handoff.parentSelection.serviceInstanceId);
  assert.equal(Object.isFrozen(handoff.readerSchemaDigests), true);
  const startupFile = await import(pathToFileURL(path.join(foundation, 'buster-startup-file.mjs')).href);
  const startupRoot = fs.mkdtempSync('/dev/kubeclaw-startup-test-');
  t.after(() => fs.rmSync(startupRoot, { recursive: true, force: true }));
  fs.chmodSync(startupRoot, 0o755);
  fs.mkdirSync(path.join(startupRoot, 'config'), { mode: 0o750 });
  fs.chownSync(path.join(startupRoot, 'config'), 0, 1000);
  const lifetimeModule = pathToFileURL(path.join(foundation, 'buster-lifetime.mjs')).href;
  const lockFile = path.join(startupRoot, 'lifetime.lock'); fs.writeFileSync(lockFile, ''); fs.chmodSync(lockFile, 0o600);
  const lifetimeRunner = path.join(root, 'lifetime-check.mjs');
  fs.writeFileSync(lifetimeRunner, `import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const { captureBusterLifetimeDescriptor, assertBusterLifetimeDescriptor } = await import(process.argv[2]);
const retained = captureBusterLifetimeDescriptor(process.argv[3], 9);
assertBusterLifetimeDescriptor(retained); retained.assertCurrent();
const { PreparationOriginalBootStore } = await import(process.argv[4]);
const ownershipRoot = path.join(process.argv[3], 'ownership');
fs.mkdirSync(ownershipRoot, { mode: 0o700 });
const store = new PreparationOriginalBootStore(ownershipRoot, retained, 4096);
const { retainEmptyPreparationDirectory } = await import(new URL('./preparation-empty-directory.ts', process.argv[4]));
const initialDirectory = path.join(ownershipRoot, 'empty-observation');
fs.mkdirSync(initialDirectory, { mode: 0o700 });
const initial = retainEmptyPreparationDirectory(initialDirectory);
initial.assertCurrent();
assert.deepEqual(fs.readdirSync(initialDirectory), [], 'physical empty observation has no writes/default state');
const strayFile = path.join(initialDirectory, 'state.json');
fs.writeFileSync(strayFile, '{}');
assert.throws(() => initial.assertCurrent(), /PRIOR_STATE_UNACCOUNTED/);
assert.throws(() => retainEmptyPreparationDirectory(initialDirectory), /PRIOR_STATE_UNACCOUNTED/);
assert.equal(fs.readFileSync(strayFile, 'utf8'), '{}', 'even empty logical state is retained, not initialized away');
fs.unlinkSync(strayFile);
fs.mkdirSync(path.join(initialDirectory, 'unaccounted-journal'));
assert.throws(() => initial.assertCurrent(), /PRIOR_STATE_UNACCOUNTED/);
fs.rmdirSync(path.join(initialDirectory, 'unaccounted-journal'));
fs.chmodSync(initialDirectory, 0o777);
assert.throws(() => initial.assertCurrent(), /DIRECTORY_CHANGED/);
assert.throws(() => retainEmptyPreparationDirectory(initialDirectory), /DIRECTORY_NOT_TRUSTED/);
fs.chmodSync(initialDirectory, 0o700);
const movedInitial = initialDirectory + '-retained';
fs.renameSync(initialDirectory, movedInitial); fs.mkdirSync(initialDirectory, { mode: 0o700 });
assert.throws(() => initial.assertCurrent(), /DIRECTORY_CHANGED/);
initial.close(); initial.close();
assert.throws(() => initial.assertCurrent(), /CAPTURE_CLOSED/);
fs.rmdirSync(initialDirectory); fs.rmdirSync(movedInitial);
fs.symlinkSync(ownershipRoot, initialDirectory);
assert.throws(() => retainEmptyPreparationDirectory(initialDirectory), error => ['ENOTDIR', 'ELOOP'].includes(error.code));
assert.throws(() => retainEmptyPreparationDirectory(path.join(initialDirectory, 'missing')), error => ['ENOTDIR', 'ELOOP'].includes(error.code));
fs.unlinkSync(initialDirectory);
assert.throws(() => retainEmptyPreparationDirectory(initialDirectory), { code: 'ENOENT' });
assert.throws(() => store.readActive(), { code: 'ENOENT' });
const absentReplayDirectory = path.join(ownershipRoot, 'missing-active-replay');
assert.throws(() => store.restoreActive(absentReplayDirectory), { code: 'ENOENT' });
assert.equal(fs.existsSync(absentReplayDirectory), false, 'missing active A never emits a current-B replay');
assert.deepEqual(fs.readdirSync(ownershipRoot), [], 'missing original active boot never initializes current B');
const archiveRoot = path.join(ownershipRoot, 'original-boots');
fs.mkdirSync(archiveRoot, { mode: 0o700 });
const activeFile = path.join(archiveRoot, 'active.json');
const writeActive = value => { fs.writeFileSync(activeFile, JSON.stringify(value), { mode: 0o600 }); fs.chmodSync(activeFile, 0o444); };
// Deliberately invalid records exercise fail-closed reads, not a fabricated
// native archive or a claim that host/cgroup admission succeeded.
writeActive({ schemaVersion: 'buster-original-native-active-boot.v1', originalBoot: {}, extra: true });
assert.throws(() => store.readActive(), /RECORD_INVALID/);
fs.unlinkSync(activeFile);
writeActive({ schemaVersion: 'buster-original-native-active-boot.v1', originalBoot: {} });
assert.throws(() => store.readActive(), /RECORD_INVALID/);
fs.unlinkSync(activeFile);
const absentOriginal = { schemaVersion: 'buster-original-native-boot-archive-reference.v1',
  parentBootId: '12345678-1234-4123-8123-123456789abc', digest: 'sha256:' + '0'.repeat(64), byteLength: 1, contentByteLength: 1 };
writeActive({ schemaVersion: 'buster-original-native-active-boot.v1', originalBoot: absentOriginal });
const retainedActiveBytes = fs.readFileSync(activeFile), retainedActiveInode = fs.statSync(activeFile).ino;
assert.throws(() => store.readActive(), { code: 'ENOENT' });
await assert.rejects(store.activate(absentOriginal), { code: 'ENOENT' });
assert.deepEqual(fs.readFileSync(activeFile), retainedActiveBytes);
assert.equal(fs.statSync(activeFile).ino, retainedActiveInode);
assert.deepEqual(fs.readdirSync(archiveRoot), ['active.json'], 'missing original capsule is not filled or retired');
fs.unlinkSync(activeFile);
fs.symlinkSync('missing.json', activeFile);
assert.throws(() => store.readActive(), { code: 'ELOOP' });
assert.equal(fs.readlinkSync(activeFile), 'missing.json', 'unsafe pointer is preserved on denial');
retained.close();
`);
  const lifetime = await import(lifetimeModule);
  assert.throws(() => lifetime.assertBusterLifetimeDescriptor({ descriptor: 9, assertCurrent() {}, close() {} }), /VERIFIED_DESCRIPTOR_REQUIRED/);
  const { PreparationOriginalBootStore } = await import(pathToFileURL(path.join(code, 'skills/packages/buster-engine/test-gates/preparation-boot-store.ts')).href);
  assert.throws(() => new PreparationOriginalBootStore('/var/lib/kubeclaw/native/buster',
    { descriptor: 9, assertCurrent() {}, close() {} }, loaded[0].preparation.maximumOwnershipBytes), /VERIFIED_DESCRIPTOR_REQUIRED/);
  const bootStoreModule = pathToFileURL(path.join(code, 'skills/packages/buster-engine/test-gates/preparation-boot-store.ts')).href;
  const commonArguments = [lockFile, process.execPath, lifetimeRunner, lifetimeModule, startupRoot, bootStoreModule];
  execFileSync('/bin/sh', ['-c', 'exec 9<>"$1"; flock -n 9; exec "$2" "$3" "$4" "$5" "$6"', 'lifetime-test', ...commonArguments], { stdio: 'pipe' });
  assert.throws(() => execFileSync('/bin/sh', ['-c', 'exec 9<>"$1"; exec "$2" "$3" "$4" "$5"', 'lifetime-test', ...commonArguments], { stdio: 'pipe' }), /INHERITED_LOCK_REQUIRED/);
  const guardian = path.join(root, 'guardian');
  execFileSync('cc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-O2', path.join(repo, 'scripts/buster-lifetime-guardian.c'), '-o', guardian]);
  const witnessRunner = path.join(root, 'witness-check.mjs');
  fs.writeFileSync(witnessRunner, `import assert from 'node:assert/strict';
const { captureBusterLifetimeWitness, assertBusterLifetimeWitness, assertBusterLifetimeDescriptor } = await import(process.argv[2]);
const witness = captureBusterLifetimeWitness(process.argv[3], 9);
assertBusterLifetimeWitness(witness);
assert.throws(() => assertBusterLifetimeDescriptor(witness), /VERIFIED_DESCRIPTOR_REQUIRED/);
witness.assertCurrent(); witness.close();
`);
  execFileSync('/bin/sh', ['-c', 'exec 9<>"$1"; flock -n 9; exec "$2" "$1" 1000 "$3" /usr/bin/setpriv -- "$4" "$5" "$6" "$7"',
    'witness-test', lockFile, guardian, String(process.pid), process.execPath, witnessRunner, lifetimeModule, startupRoot], { stdio: 'pipe' });
  assert.throws(() => execFileSync('/bin/sh', ['-c', 'exec 9<>"$1"; exec "$2" "$3" "$4" "$5"',
    'witness-denial', lockFile, process.execPath, witnessRunner, lifetimeModule, startupRoot], { stdio: 'pipe' }), /NONOWNING_WITNESS_REQUIRED/);
  const handoffFile = path.join(startupRoot, 'config/pipeline-startup.json');
  const published = startupFile.publishBusterStartupFile(startupRoot, handoff);
  published.assertCurrent(); published.close();
  const originalHandoff = fs.readFileSync(handoffFile);
  const originalInode = fs.statSync(handoffFile).ino;
  assert.throws(() => startupFile.publishBusterStartupFile(startupRoot, handoff), /EEXIST/);
  assert.deepEqual(fs.readFileSync(handoffFile), originalHandoff, 'no replacement even for identical handoff');
  assert.equal(fs.statSync(handoffFile).ino, originalInode);
  assert.deepEqual(fs.readdirSync(path.dirname(handoffFile)), ['pipeline-startup.json'], 'no unpublished staging file left');
  const childBoot = boot.captureBusterChildBootReceipts(startupRoot, path.join(output, 'system'), code);
  assert.equal(projection.projectBusterSettings(childBoot.capture, 'buster-runtime').preparation.timeoutMs, loaded[1].preparation.timeoutMs);
  childBoot.startup.assertCurrent(); childBoot.startup.close();
  const engineAuthorFile = path.join(author, 'components/buster-engine.config.json');
  const changedEngine = JSON.parse(fs.readFileSync(engineAuthorFile));
  changedEngine.profiles.runtime.settings.preparation.timeoutMs += 1;
  write(engineAuthorFile, changedEngine);
  const newerOutput = path.join(root, 'generation-B');
  await materializePipelineGeneration({ authorRoot: author, packageRoot: code, output: newerOutput, services, publisher });
  assert.deepEqual(boot.readBusterBootSourceArchive(archiveReceipt), closure, 'published B does not rewrite or replace archived A');
  const restartedA = boot.captureBusterChildBootReceipts(startupRoot, path.join(output, 'system'), code);
  assert.equal(projection.projectBusterSettings(restartedA.capture, 'buster-runtime').preparation.timeoutMs, loaded[1].preparation.timeoutMs, 'child restart stays on retained parent A');
  restartedA.startup.close();
  assert.throws(() => boot.captureBusterChildBootReceipts(startupRoot, path.join(newerOutput, 'system'), code), /IMAGE_RECEIPT_MISMATCH/);
  const retained = startupFile.captureBusterStartupFile(startupRoot);
  retained.assertCurrent();
  fs.writeFileSync(path.join(startupRoot, 'unrelated-state'), 'not a generation author');
  retained.assertCurrent();
  assert.equal(retained.handoff.digest, handoff.digest);
  fs.chmodSync(handoffFile, 0o640); fs.writeFileSync(handoffFile, `${JSON.stringify(handoff)}\n`); fs.chmodSync(handoffFile, 0o440);
  assert.throws(retained.assertCurrent, /FILE_CHANGED/); retained.close();
  assert.throws(retained.assertCurrent, /CAPTURE_CLOSED/);
  fs.chmodSync(handoffFile, 0o460); assert.throws(() => startupFile.captureBusterStartupFile(startupRoot), /FILE_NOT_TRUSTED/); fs.chmodSync(handoffFile, 0o440);
  const outsideHandoff = path.join(startupRoot, 'outside.json'); fs.renameSync(handoffFile, outsideHandoff); fs.symlinkSync(outsideHandoff, handoffFile);
  assert.throws(() => startupFile.captureBusterStartupFile(startupRoot), /ELOOP/);
  fs.unlinkSync(handoffFile); fs.renameSync(outsideHandoff, handoffFile);
  const association = startup.busterStartupAssociation(handoff);
  startup.assertBusterStartupAssociation(association, handoff);
  assert.throws(() => startup.assertBusterStartupAssociation({ ...association, parentBootId: '00000000-0000-4000-8000-000000000000' }, handoff), /ASSOCIATION_MISMATCH/);
  assert.throws(() => startup.readBusterStartupHandoff({ ...handoff, extra: true }), /HANDOFF_INVALID/);
  assert.throws(() => startup.createBusterStartupHandoff({ ...captures['buster-preparation'] }, handoff.childSelection), /VERIFIED_CAPTURE_REQUIRED/);
  const protocol = await import(pathToFileURL(path.join(code, 'skills/packages/buster-engine/test-gates/preparation-startup-channel.ts')).href);
  const framing = await import(pathToFileURL(path.join(code, 'skills/packages/buster-engine/test-gates/preparation-channel.ts')).href);
  const { NativeWorkerControlChannel } = await import(pathToFileURL(path.join(code, 'skills/packages/worker-core/worker/native-control-channel.ts')).href);
  async function pair() {
    const listener = createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
    const connected = once(listener, 'connection');
    const client = createConnection({ host: '127.0.0.1', port: listener.address().port });
    const [_, [server]] = await Promise.all([once(client, 'connect'), connected]);
    const limits = framing.preparationServiceChannelLimits(loaded[0].preparation);
    const parentChannel = new NativeWorkerControlChannel(server, limits), childChannel = new NativeWorkerControlChannel(client, limits);
    return { parentChannel, childChannel, parentMessages: parentChannel.messages(), childMessages: childChannel.messages(),
      close: async () => { parentChannel.destroy(); childChannel.destroy(); await new Promise(resolve => listener.close(resolve)); } };
  }
  const positivePair = await pair();
  try {
    await Promise.all([protocol.receiveBusterStartupAssociation(positivePair.parentChannel, positivePair.parentMessages, handoff),
      protocol.sendBusterStartupAssociation(positivePair.childChannel, positivePair.childMessages, handoff)]);
    await positivePair.childChannel.send(framing.encodePreparationMessage('begin', 'a'.repeat(32)));
    assert.equal(framing.decodePreparationMessage((await positivePair.parentMessages.next()).value).kind, 'begin', 'same iterator retained after startup');
  } finally { await positivePair.close(); }
  const reusedPair = await pair();
  try {
    await Promise.all([protocol.receiveBusterStartupAssociation(reusedPair.parentChannel, reusedPair.parentMessages, handoff),
      protocol.sendBusterStartupAssociation(reusedPair.childChannel, reusedPair.childMessages, handoff)]);
    const { BusterPreparationClient } = await import(pathToFileURL(path.join(code, 'skills/packages/buster-engine/test-gates/preparation-client.ts')).href);
    const { servePreparationRequests } = await import(pathToFileURL(path.join(code, 'skills/packages/buster-engine/test-gates/preparation-parent-channel.ts')).href);
    const serving = servePreparationRequests(reusedPair.parentChannel, {
      maximumActivePreparations: loaded[0].preparation.maximumActivePreparations,
      maximumRequestBytes: loaded[0].preparation.maximumRequestBytes,
      prepare: async ingress => {
        for await (const _chunk of ingress.chunks()) { /* drain the real framed request */ }
        throw new Error('TEST_PREPARATION_REJECTED_AFTER_STARTUP');
      },
      extract: async () => { throw new Error('TEST_UNEXPECTED_EXTRACTION'); },
    }, reusedPair.parentMessages);
    const client = new BusterPreparationClient(reusedPair.childChannel, loaded[1].preparation, '/unused-test-source', reusedPair.childMessages);
    try {
      await assert.rejects(client.stage((async function* () {})(), async () => false), /TEST_PREPARATION_REJECTED_AFTER_STARTUP/);
    } finally {
      await client.close();
      await serving;
    }
  } finally { await reusedPair.close(); }
  const gatedPair = await pair();
  try {
    const parentDenied = assert.rejects(protocol.receiveBusterStartupAssociation(gatedPair.parentChannel,
      gatedPair.parentMessages, handoff, () => { throw new Error('TEST_RECOVERY_NOT_QUIESCENT'); }),
    /TEST_RECOVERY_NOT_QUIESCENT/);
    const childDenied = assert.rejects(protocol.sendBusterStartupAssociation(gatedPair.childChannel,
      gatedPair.childMessages, handoff), /CHANNEL_LOST|ECONNRESET|CONTROL_CLOSED/);
    await Promise.all([parentDenied, childDenied]);
    assert.deepEqual(fs.readFileSync(handoffFile), originalHandoff, 'failed authorization preserves original startup bytes');
  } finally { await gatedPair.close(); }
  const rejectedPair = await pair();
  try {
    const rejection = assert.rejects(protocol.receiveBusterStartupAssociation(rejectedPair.parentChannel, rejectedPair.parentMessages, handoff), /ASSOCIATION_REQUIRED/);
    await rejectedPair.childChannel.send(framing.encodePreparationMessage('begin', 'a'.repeat(32)));
    await rejection;
  } finally { await rejectedPair.close(); }
  const codec = await import(pathToFileURL(path.join(code, 'skills/packages/plugin-sdk/src/values.ts')).href);
  const { digest: _digest, ...body } = handoff;
  const invalidBody = { ...body, entryPath: '/some/other/generation/pipeline.config.json' };
  assert.throws(() => startup.readBusterStartupHandoff({ ...invalidBody, digest: codec.sha256Text(codec.portableJson(invalidBody)) }), /HANDOFF_INVALID/);
  const forgedChild = { ...handoff.childSelection, bindings: handoff.childSelection.bindings.map(binding => binding.owner === 'buster-engine' ? { ...binding, profileId: 'standard' } : binding) };
  const { digest: _childDigest, ...childBody } = forgedChild;
  forgedChild.digest = codec.sha256Text(codec.portableJson(childBody));
  assert.throws(() => startup.createBusterStartupHandoff(captures['buster-preparation'], forgedChild), /ENGINE_SELECTION_MISMATCH/);

  const entry = JSON.parse(fs.readFileSync(path.join(author, 'pipeline.config.json')));
  entry.bindings.push({ role: 'buster', owner: 'buster-engine', instanceId: 'other.runtime/parent', profileId: 'standard' },
    {role:'buster',owner:'worker-core',instanceId:'other.runtime/parent',profileId:'standard'});
  write(path.join(author, 'pipeline.config.json'), entry);
  const conflicting = services.map(service => service.callerId !== 'buster-preparation' ? service : {
    ...service, serviceInstanceId: 'other.runtime/parent', bindings: [{ owner: 'buster-engine', instanceId: 'other.runtime/parent', profileId: 'standard' }, {owner:'worker-core',instanceId:'other.runtime/parent',profileId:'standard'}],
  });
  const invalidOutput = path.join(root, 'invalid-generation');
  await assert.rejects(materializePipelineGeneration({ authorRoot: author, packageRoot: code,
    output: invalidOutput, services: conflicting, publisher }), /BUSTER_HANDOFF_SELECTION_MISMATCH/);
  assert.equal(fs.existsSync(invalidOutput), false);
});
