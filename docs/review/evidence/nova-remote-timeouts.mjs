// Review probe: original transport/service/store, real loopback fault proxy.
// Reuses the existing remote-plan-runtime test's synthetic provider executor;
// this proves transport/import behavior, not real provider or sandbox execution.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const source = fs.readFileSync('tests/verification/contracts/check-pipeline-remote-plan-runtime.mts', 'utf8');
const marker = '  const hangingServer = http.createServer(() => undefined);';
if (!source.includes(marker)) throw new Error('Baseline probe insertion point missing');
const extra = String.raw`
  let mode = 'lost-submit';
  let deletes = 0;
  let resultRequests = 0;
  const proxy = http.createServer((request, response) => {
    if (request.method === 'DELETE') deletes++;
    if (mode === 'held-result' && request.url!.includes('/results/')) {
      resultRequests++; request.resume(); return;
    }
    const upstream = http.request({ hostname: '127.0.0.1', port,
      method: request.method, path: request.url, headers: request.headers }, (incoming) => {
      if (mode === 'lost-submit' && request.method !== 'DELETE') { incoming.resume(); return; }
      response.writeHead(incoming.statusCode!, incoming.headers); incoming.pipe(response);
    });
    upstream.on('error', () => response.destroy());
    request.pipe(upstream);
  });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const proxyTransport = new HttpRemotePlanTransport({
    endpoint: 'http://127.0.0.1:' + (proxy.address() as AddressInfo).port,
    token, maximumResponseBytes: 8 * 1024 * 1024, maximumResultBytes: 16 * 1024 * 1024 });
  const heldJob = job('dispatch:cancel:review-lost-submit');
  try {
    let error = '';
    try { await new NovaRemotePlanDispatcher({ store: novaStore('review-timeout'),
      transport: proxyTransport, pollMilliseconds: 10 }).dispatch(heldJob, { timeoutMs: 300 }); }
    catch (failure) { error = String(failure); }
    const remoteStateAtTimeout = (await service.status(heldJob.jobId)).state;
    const observeUntil = Date.now() + 10000;
    let remoteState = remoteStateAtTimeout;
    while (remoteState === 'accepted' && Date.now() < observeUntil) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      remoteState = (await service.status(heldJob.jobId)).state;
    }
    assert.match(error, /NOVA_REMOTE_PLAN_TIMEOUT/);
    assert.equal(remoteState, 'running'); assert.equal(deletes, 0);
    console.log(JSON.stringify({ probe: 'accepted-job-timeout', error, remoteStateAtTimeout, remoteState, deleteRequests: deletes }));
    await service.cancel(heldJob.jobId);
    mode = 'held-result';
    const importJob = job('dispatch:evidence:review-import-timeout');
    const importer = new NovaRemoteGateImporter({ store: new FileNovaGateImportStore(
      path.join(temporary, 'review-import'), { recordLimits: { maximumRecords: 100,
      maximumBytes: 16 * 1024 * 1024, maximumRecordBytes: 8 * 1024 * 1024 },
      maximumEvidenceStoreBytes: 16 * 1024 * 1024 }), evidence: proxyTransport,
      results: proxyTransport, maximumEvidenceBytes: 1024 * 1024, maximumResultBytes: 16 * 1024 * 1024 });
    const controller = new AbortController(); let settled = false;
    const pending = new NovaRemoteTestGate({ dispatcher: new NovaRemotePlanDispatcher({
      store: novaStore('review-import-dispatch'), transport: proxyTransport, pollMilliseconds: 10 }),
      importer }).execute(importJob, { timeoutMs: 5000, signal: controller.signal })
      .then(() => { settled = true; }, () => { settled = true; });
    await new Promise((resolve) => setTimeout(resolve, 6500));
    assert.equal(resultRequests, 1); assert.equal(settled, false);
    console.log(JSON.stringify({ probe: 'import-timeout', timeoutMs: 5000,
      observedMilliseconds: 6500, resultRequests, settled }));
    controller.abort(); await pending;
  } finally {
    await service.cancel(heldJob.jobId);
    proxy.closeAllConnections(); await new Promise<void>((resolve) => proxy.close(() => resolve()));
  }
`;
const generated = path.resolve('docs/review/evidence/.nova-remote-timeouts-run.mts');
try {
  fs.writeFileSync(generated, source.replace(marker, extra + '\n' + marker));
  const result = spawnSync(process.execPath, [generated], { stdio: 'inherit', timeout: 60000 });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { fs.rmSync(generated, { force: true }); }
