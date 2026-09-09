import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { containerBuildExecutionError, createContainerBuildDeadline, verifyContainerManifest } from '../../../engine/test-gates/container-build-runtime.ts';

// These are real HTTP body/reader checks, not a simulated successful BuildKit invocation.
const manifest = Buffer.from('{"schemaVersion":2,"mediaType":"application/vnd.oci.image.manifest.v1+json"}');
const digest = `sha256:${crypto.createHash('sha256').update(manifest).digest('hex')}`;
let mode = 'valid';
let closed = 0;
const server = http.createServer((request, response) => {
  assert.equal(request.url, `/v2/test/image/manifests/${digest}`);
  response.on('close', () => closed++);
  if (mode === 'status') { response.writeHead(503); response.end('unavailable'); return; }
  response.setHeader('docker-content-digest', digest);
  if (mode === 'length') response.setHeader('content-length', '100000');
  response.flushHeaders();
  if (mode === 'slow' || mode === 'length') { response.write(manifest.subarray(0, 1)); return; }
  response.end(mode === 'corrupt' ? 'corrupt' : manifest);
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
assert(address && typeof address === 'object');
const base = new URL(`http://127.0.0.1:${address.port}`);
const options = { maximumManifestBytes: 4096 };
try {
  await verifyContainerManifest(options, base, 'test/image', digest, new AbortController().signal);
  mode = 'corrupt';
  await assert.rejects(verifyContainerManifest(options, base, 'test/image', digest, new AbortController().signal), /DIGEST_MISMATCH/u);
  mode = 'status';
  await assert.rejects(verifyContainerManifest(options, base, 'test/image', digest, new AbortController().signal), (error) => {
    assert(error instanceof Error);
    const surfaced = containerBuildExecutionError(error, 'verify');
    assert.equal(surfaced.message, 'CONTAINER_BUILD_REGISTRY_READ_FAILED:503');
    assert.equal(surfaced.message, error.message, 'registry status diagnostic must survive the production error path');
    assert.equal(surfaced.cause, error);
    return true;
  });
  // A genuine failed OS launch exercises the production diagnostic conversion;
  // it never stands in for a BuildKit success or emits build metadata.
  await assert.rejects(promisify(execFile)(path.join(os.tmpdir(), `missing-buildctl-${crypto.randomUUID()}`), []), (error) => {
    assert(error instanceof Error);
    assert.match(error.message, /ENOENT/u);
    const surfaced = containerBuildExecutionError(error, 'build');
    assert.equal(surfaced.message, `CONTAINER_BUILD_EXECUTION_ERROR:${error.message}`);
    assert.equal(surfaced.cause, error);
    return true;
  });
  const longDiagnostic = new Error(`registry failure:${'x'.repeat(5000)}`);
  assert.equal(containerBuildExecutionError(longDiagnostic, 'verify').message,
    `CONTAINER_BUILD_REGISTRY_ERROR:${longDiagnostic.message}`, 'execution diagnostics must not be truncated by the older failed-build helper');
  mode = 'length';
  await assert.rejects(verifyContainerManifest(options, base, 'test/image', digest, new AbortController().signal), /MANIFEST_TOO_LARGE/u);

  mode = 'slow';
  const started = Date.now();
  // Time already consumed by earlier phases must come out of the same budget.
  await new Promise((resolve) => setTimeout(resolve, 100));
  const deadline = createContainerBuildDeadline(started, 350, new AbortController().signal);
  const before = closed;
  try {
    assert(deadline.remainingMs() < 300);
    await assert.rejects(verifyContainerManifest(options, base, 'test/image', digest, deadline.signal));
    assert(deadline.signal.aborted);
    assert.match(String(deadline.signal.reason), /CONTAINER_BUILD_TIMEOUT/u);
    assert(Date.now() - started < 650, 'registry body must use the remaining absolute budget');
    for (let attempt = 0; closed === before && attempt < 20; attempt++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert(closed > before, 'aborting the manifest reader must close the response');
  } finally { deadline.dispose(); }

  const caller = new AbortController();
  const cancelled = createContainerBuildDeadline(Date.now(), 10000, caller.signal);
  try {
    const request = verifyContainerManifest(options, base, 'test/image', digest, cancelled.signal);
    caller.abort(new Error('caller cancelled'));
    await assert.rejects(request, /caller cancelled/u);
  } finally { cancelled.dispose(); }
  const expired = createContainerBuildDeadline(Date.now() - 1000, 100, new AbortController().signal);
  assert(expired.signal.aborted);
  expired.dispose();
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
console.log(JSON.stringify({ ok: true, suite: 'container-registry-deadline', transport: 'real-http', buildkitExecution: 'not-exercised' }));
