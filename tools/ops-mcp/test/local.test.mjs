import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
test('local MCP lists tools while the Kubernetes credential is unavailable and reports failed reads honestly', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'ops-local-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bearer = 'local-integration-test-' + 'x'.repeat(32);
  writeFileSync(join(dir, 'bearer'), bearer);
  const child = spawn(process.execPath, [join(root, 'tools/ops-mcp/src/server.mjs')], {
    env: { ...process.env, OPS_LOCAL_ONLY: '1', HOST: '127.0.0.1', PORT: '0',
      KUBERNETES_API_URL: 'https://127.0.0.1:1', KUBERNETES_TOKEN_FILE: join(dir, 'absent-token'),
      OPS_MCP_BEARER_TOKEN_FILE: join(dir, 'bearer') }, stdio: ['ignore', 'ignore', 'pipe'],
  });
  t.after(() => child.kill('SIGTERM'));
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('startup timeout')), 5000);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`startup exit ${code}`)); });
    child.stderr.on('data', chunk => {
      const match = /127\.0\.0\.1:(\d+)\/mcp/.exec(String(chunk));
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  const base = `http://127.0.0.1:${port}`;
  const call = async (method, params) => {
    const response = await fetch(base + '/mcp', { method: 'POST', headers: {
      'content-type': 'application/json', accept: 'application/json, text/event-stream',
      authorization: `Bearer ${bearer}`,
    }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    assert.equal(response.status, 200);
    const body = await response.text();
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      const data = body.split('\n').filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5)));
      return data.find(message => message.id === 1);
    }
    return JSON.parse(body);
  };
  assert.equal((await fetch(base + '/mcp')).status, 401);
  const listed = await call('tools/list', {});
  assert.ok(listed.result.tools.some(x => x.name === 'platform_cluster_state'));
  assert.equal(listed.result.tools.some(x => /restart|execute|shell/.test(x.name)), false);
  const failed = await call('tools/call', { name: 'get_pod', arguments: { namespace: 'kubeclaw', pod: 'absent' } });
  assert.equal(failed.result.isError, true);
  assert.equal((await fetch(base + '/healthz')).status, 200);
});

