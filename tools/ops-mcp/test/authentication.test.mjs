import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile, rename, unlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const server = fileURLToPath(new URL('../src/server.mjs', import.meta.url));
function launch(extra) {
  const env = { ...process.env, PORT: '0', HOST: '127.0.0.1' };
  delete env.OPS_MCP_BEARER_TOKEN;
  delete env.OPS_MCP_BEARER_TOKEN_FILE;
  delete env.OPS_LOCAL_ONLY;
  return spawn(process.execPath, [server], { env: { ...env, ...extra }, stdio: ['ignore', 'ignore', 'pipe'] });
}

test('backend refuses to listen with absent or weak authentication', async () => {
  for (const token of ['', 'short']) {
    const child = launch({ OPS_MCP_BEARER_TOKEN: token });
    let diagnostic = '';
    child.stderr.on('data', bytes => { diagnostic += bytes; });
    const [code] = await once(child, 'exit');
    assert.notEqual(code, 0);
    assert.match(diagnostic, /requires a bearer token/);
    assert.doesNotMatch(diagnostic, /listening on/);
  }
});

test('real HTTP backend enforces authentication, atomic rotation and namespace boundaries', { timeout: 15000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ops-authentication-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'token');
  const first = 'first-local-proof-' + 'a'.repeat(32);
  const second = 'second-local-proof-' + 'b'.repeat(32);
  await writeFile(file, first, { mode: 0o600 });
  const child = launch({ OPS_MCP_BEARER_TOKEN_FILE: file,
    KUBERNETES_TOKEN_FILE: join(directory, 'no-kubernetes-credential'),
    OPS_DEFAULT_NAMESPACE: 'kubeclaw', OPS_ALLOWED_NAMESPACES: 'kubeclaw' });
  t.after(async () => {
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
  });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Backend startup timed out')), 5000);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Backend exited ${code}`)); });
    child.stderr.on('data', bytes => {
      const match = /127\.0\.0\.1:(\d+)\/mcp/.exec(String(bytes));
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  const url = `http://127.0.0.1:${port}`;
  async function call(token, method = 'tools/list', params = {}) {
    return fetch(url + '/mcp', { method: 'POST', headers: {
      'content-type': 'application/json', accept: 'application/json, text/event-stream',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  }
  assert.equal((await call()).status, 401);
  assert.equal((await call(second)).status, 401);
  assert.equal((await call(first)).status, 200);
  const outside = await call(first, 'tools/call', { name: 'get_pod_logs', arguments: { namespace: 'paperless', pod: 'private-document' } });
  const payload = await outside.text();
  const denied = outside.headers.get('content-type')?.includes('text/event-stream')
    ? JSON.parse(payload.split('\n').find(line => line.startsWith('data:')).slice(5))
    : JSON.parse(payload);
  assert.ok(denied.error || denied.result?.isError);
  assert.match(JSON.stringify(denied), /kubeclaw|Invalid|invalid/);
  assert.doesNotMatch(JSON.stringify(denied), /no-kubernetes-credential|ENOENT/);
  await writeFile(file + '.next', second);
  await rename(file + '.next', file);
  assert.equal((await call(first)).status, 401);
  assert.equal((await call(second)).status, 200);
  await unlink(file);
  assert.equal((await call(second)).status, 401);
  assert.equal((await fetch(url + '/healthz')).status, 503);
  await writeFile(file, second);
  assert.equal((await call(second)).status, 200);
  assert.equal((await fetch(url + '/healthz')).status, 200);
});
