import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';

test('malformed target returns 400 and leaves server and authorization intact', async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/server.mjs', import.meta.url))], {
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', OPS_MCP_BEARER_TOKEN: 'test-only-' + 'x'.repeat(32) },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  try {
    const port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('server startup timeout')), 5000);
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`startup exit ${code}`)); });
      child.stderr.on('data', chunk => {
        const match = /127\.0\.0\.1:(\d+)\/mcp/.exec(String(chunk));
        if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
      });
    });
    const status = path => new Promise((resolve, reject) => {
      const r = request({ hostname: '127.0.0.1', port, path }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      r.on('error', reject); r.end();
    });
    assert.equal(await status('//['), 400);
    assert.equal(await status('/healthz'), 200);
    assert.equal(await status('/mcp'), 401);
    assert.equal(child.exitCode, null);
  } finally { child.kill('SIGTERM'); }
});


test('authenticated oversized MCP requests reject before validation and preserve healthy requests', async t => {
  const token = 'test-only-' + 'x'.repeat(32);
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/server.mjs', import.meta.url))], {
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', OPS_MCP_BEARER_TOKEN: token },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  t.after(() => child.kill('SIGTERM'));
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('server startup timeout')), 5000);
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`startup exit ${code}`)); });
    child.stderr.on('data', chunk => {
      const match = /127\.0\.0\.1:(\d+)\/mcp/.exec(String(chunk));
      if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
    });
  });
  const post = payload => fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const oversized = await post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_argocd_applications', arguments: { padding: 'x'.repeat(64 * 1024) } } });
  assert.equal(oversized.status, 413);
  await oversized.text();
  const elements = await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_argocd_applications', arguments: { padding: Array(1025).fill(0) } } });
  const body = await elements.text();
  const rejected = elements.headers.get('content-type')?.startsWith('text/event-stream')
    ? body.split(/\r?\n\r?\n/).flatMap(frame => frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5).trim()))).find(message => message.id === 2)
    : JSON.parse(body);
  assert.match(JSON.stringify(rejected), /element|limit/i);
  assert.equal(rejected.isError ?? rejected.result?.isError ?? Boolean(rejected.error), true);
  const restored = await post({ jsonrpc: '2.0', id: 3, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'bounded-input-proof', version: '1' } } });
  assert.equal(restored.status, 200);
  assert.match(await restored.text(), /kubeclaw-ops/);
  assert.equal((await fetch(`http://127.0.0.1:${port}/mcp`)).status, 401);
  assert.equal((await fetch(`http://127.0.0.1:${port}/healthz`)).status, 200);
});
