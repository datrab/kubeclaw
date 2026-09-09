import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { once } from 'node:events';
import type { BusterRemotePlanService } from '@kubeclaw/buster-engine';
import type { RemotePlanJobV1 } from '@kubeclaw/pipeline-test-gate-contract';
import { FileNovaRemotePlanStore, HttpRemotePlanTransport, NovaRemotePlanDispatcher,
  FileNovaGateImportStore, NovaRemoteGateImporter, NovaRemoteTestGate, RemotePlanTransportError } from '@kubeclaw/nova-core';

/** Real HTTP faults around the original durable Buster service fixture. */
export async function checkRemoteFaults(fixture: { port: number; token: string; temporary: string;
  service: BusterRemotePlanService; job: (key: string) => RemotePlanJobV1; novaStore: (name: string) => FileNovaRemotePlanStore }) {
  let mode = 'lost-submit'; let deletes = 0; let posts = 0; let held = 0; let closed = 0;
  const proxy = http.createServer((request, response) => {
    if (request.method === 'DELETE') deletes++;
    if (request.method === 'POST') posts++;
    if (mode === 'late-submit' && request.method === 'POST') {
      const chunks: Buffer[] = []; request.on('data', chunk => chunks.push(chunk));
      request.on('end', () => setTimeout(() => {
        const delayed = http.request({ hostname: '127.0.0.1', port: fixture.port, method: 'POST',
          path: request.url, headers: request.headers }, incoming => incoming.resume());
        delayed.on('error', () => response.destroy()); delayed.end(Buffer.concat(chunks));
      }, 750));
      return;
    }
    if (mode === 'body-reset') {
      response.writeHead(200, { 'content-length': '100' }); response.write('{');
      setTimeout(() => response.destroy(), 20); request.resume(); return;
    }
    const hold = mode === 'unknown' && posts > 0 && request.method !== 'POST'
      || mode === 'result-body' && request.url!.includes('/results/')
      || mode === 'evidence-body' && request.url!.includes('/evidence/');
    if (hold) {
      held++; response.on('close', () => { closed++; });
      response.writeHead(200, { 'content-type': 'application/json' }); response.write(' '); request.resume(); return;
    }
    const upstream = http.request({ hostname: '127.0.0.1', port: fixture.port,
      method: request.method, path: request.url, headers: request.headers }, incoming => {
      if ((mode === 'lost-submit' || mode === 'unknown') && request.method === 'POST') { incoming.resume(); return; }
      response.writeHead(incoming.statusCode!, incoming.headers); incoming.pipe(response);
    });
    upstream.on('error', () => response.destroy()); request.pipe(upstream);
  });
  proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
  const address = proxy.address(); assert.ok(address && typeof address !== 'string');
  const transport = new HttpRemotePlanTransport({ endpoint: `http://127.0.0.1:${address.port}`, token: fixture.token,
    maximumResponseBytes: 8 * 1024 * 1024, maximumResultBytes: 16 * 1024 * 1024 });
  const dispatcher = (store: FileNovaRemotePlanStore) => new NovaRemotePlanDispatcher({ store, transport,
    pollMilliseconds: 10, cleanupMilliseconds: 300 });
  try {
    mode = 'body-reset';
    await assert.rejects(transport.status('job:body-reset'), (error: unknown) => error instanceof RemotePlanTransportError
      && error.retryable && error.message === 'NOVA_REMOTE_PLAN_NETWORK_ERROR');
    for (const fault of ['lost-submit', 'unknown']) {
      mode = fault; deletes = 0; posts = 0;
      const job = fixture.job(`dispatch:cancel:deadline:${fault}`); const store = fixture.novaStore(`deadline-${fault}`);
      const start = Date.now();
      await assert.rejects(dispatcher(store).dispatch(job, { timeoutMs: 600 }),
        fault === 'unknown' ? /NOVA_REMOTE_PLAN_TIMEOUT:REMOTE_STATE_UNKNOWN/u : /NOVA_REMOTE_PLAN_TIMEOUT:REMOTE_STATE_CANCELLED/u);
      assert.ok(Date.now() - start < 3000); assert.equal(deletes, 1); assert.equal(posts, 1);
      const records = await fixture.novaStore(`deadline-${fault}`).interruptions();
      assert.equal(records.at(-1)!.remoteState, fault === 'unknown' ? 'unknown' : 'cancelled');
      if (fault === 'unknown') {
        assert.ok(['accepted', 'running'].includes((await fixture.service.status(job.jobId)).state));
        mode = 'normal';
        const controller = new AbortController(); setTimeout(() => controller.abort(new Error('restart abort')), 150);
        await assert.rejects(dispatcher(fixture.novaStore(`deadline-${fault}`)).dispatch(job, { timeoutMs: 2000, signal: controller.signal }), /CANCELLED:REMOTE_STATE_CANCELLED/u);
        assert.equal(posts, 1, 'restart reconnect must not blindly resubmit uncertain work');
      }
      assert.equal((await fixture.service.status(job.jobId)).state, 'cancelled');
    }
    mode = 'late-submit'; posts = 0; deletes = 0;
    const lateJob = fixture.job('dispatch:cancel:deadline:late-submit');
    await assert.rejects(dispatcher(fixture.novaStore('deadline-late')).dispatch(lateJob, { timeoutMs: 600 }), /TIMEOUT:REMOTE_STATE_UNKNOWN/u);
    assert.equal(deletes, 1); assert.equal(posts, 1);
    assert.ok(['accepted', 'running'].includes((await fixture.service.status(lateJob.jobId)).state));
    assert.equal((await fixture.novaStore('deadline-late').interruptions()).at(-1)!.remoteState, 'unknown');
    await fixture.service.cancel(lateJob.jobId);
    mode = 'normal'; posts = 0;
    const legacyJob = fixture.job('dispatch:cancel:deadline:legacy');
    await fixture.novaStore('deadline-legacy').persistBeforeDispatch(legacyJob);
    await fixture.service.submit(legacyJob);
    await assert.rejects(dispatcher(fixture.novaStore('deadline-legacy')).dispatch(legacyJob, { timeoutMs: 150 }), /TIMEOUT:REMOTE_STATE_CANCELLED/u);
    assert.equal(posts, 0, 'pre-existing durable jobs reconnect without a submission marker or repeat POST');
    for (const fault of ['result-body', 'evidence-body']) {
      mode = fault; held = 0; closed = 0;
      const job = fixture.job(`dispatch:evidence:deadline:${fault}`);
      const store = new FileNovaGateImportStore(path.join(fixture.temporary, `deadline-import-${fault}`), {
        recordLimits: { maximumRecords: 100, maximumBytes: 16 * 1024 * 1024, maximumRecordBytes: 8 * 1024 * 1024 },
        maximumEvidenceStoreBytes: 16 * 1024 * 1024 });
      const gate = new NovaRemoteTestGate({ dispatcher: dispatcher(fixture.novaStore(`deadline-dispatch-${fault}`)),
        importer: new NovaRemoteGateImporter({ store, evidence: transport, results: transport,
          maximumEvidenceBytes: 1024 * 1024, maximumResultBytes: 16 * 1024 * 1024 }) });
      const start = Date.now(); await assert.rejects(gate.execute(job, { timeoutMs: 1000 }), /NOVA_REMOTE_PLAN_TIMEOUT/u);
      assert.ok(Date.now() - start < 2500); assert.equal(held, 1);
      const until = Date.now() + 1000;
      while (!closed && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(closed, 1, 'deadline must close the stalled response stream');
      assert.equal((await store.readExecutionGraphs()).length, 0);
      mode = 'normal'; assert.equal((await gate.execute(job, { timeoutMs: 5000 })).decision.state, 'passed');
      assert.equal((await store.readExecutionGraphs()).length, 1);
    }
    console.log(JSON.stringify({ ok: true, regression: 'nova-remote-deadlines', lostSubmit: 'cancelled', unavailableRemote: 'durable-unknown', stalledBodies: ['result', 'evidence'], restart: 'reconnected' }));
  } finally { proxy.closeAllConnections(); await new Promise<void>(resolve => proxy.close(() => resolve())); }
}
